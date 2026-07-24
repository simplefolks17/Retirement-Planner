# Spousal / Couples Retirement Planning — Design Document

*Design-only synthesis, 2026-07-24. No code changes. Deliverable is this document.*

**Purpose.** The spouse-account engine (#30, PR #57) shipped with a serious structural gap:
the spouse has no retirement age of their own, so their contributions stop and their balance
freezes the instant the *primary* retires (BUG-82). Three sibling gaps are also open
(BUG-84, BUG-77, BUG-78). Rather than patch these one at a time, this document steps back and
reasons about the whole spousal-planning domain: what the codebase already does, what real
couples actually need, and — the core deliverable — a set of argued design decisions and a
sequenced plan for a future implementation session.

The document draws on three prior research passes: Phase 1 (code archaeology, file:line-cited),
Phase 2 (formal SSA/IRS/CFP research), and Phase 2b (informal Reddit/Bogleheads/community
research). Citations to those passes and to live code are inline throughout.

---

## Section A — Archaeology summary (how we got here)

### How Classic-era spouse modeling worked

Before #30, the app modeled a spouse in exactly two ways, both of which are **flows**, never
**stocks**:

1. **Spouse income.** For MFJ filers, `spouseIncome` enters AGI as *gross* (unreduced by any
   pre-tax deduction, because spouse deductions were never tracked), and combined income drives
   federal + state tax (`tax-basis.js:29-45`). FICA is *always* computed per-earner, each wage
   capped at the wage base separately regardless of filing status (`tax-basis.js:47-56`). The
   budget basis `grossAfterTax` uses `householdIncome = primary + spouse` for MFJ, primary-only
   otherwise — a single MFJ-gating point (`tax-basis.js:58-71`). This is CLAUDE.md rules 3 & 9.

2. **Spouse Social Security.** `calcRetirementIncome` computes the spouse's benefit two ways —
   own-record (`spouseSsEstimate × claimFactor`, which *does* earn delayed credits) and spousal
   (`calcSpousal(primaryPIA, spouseClaimingAge)`, capped at 50% of the primary's PIA with **no**
   delayed credits) — then selects via the user's `spouseBenefitBasis` toggle and surfaces an
   advisory `spouseAltHigher` nudge when the unchosen basis would pay more
   (`retirement-income.js:35-45`). Everything is gated on `isMarried`; if false, all spouse SS
   figures hard-zero. The BUG-16 fix added the `spouseClaimingAge` slider so early spouse claims
   are reduced correctly.

A filing-status guardrail warns when spouse data is present but the filer isn't MFJ (originally
`spouseIncome > 0`; BUG-81 widened it to `hasSpouse` so entering spouse *account balances* alone
also trips it).

### Why Classic never needed a "spouse's own retirement age"

This is the crux of BUG-82, and it is worth stating precisely. **A flow is consumed or
aggregated in the year it occurs; a stock is a balance that has to accumulate over time and then
be drawn down.** Salary is a flow: it is earned each year up to a single household retirement
point and then stops — there is no *balance* of salary that needs a "stop growing" date. Social
Security is a flow gated by a claiming age. Neither flow ever required a per-spouse accumulation
*timeline*, because neither has a balance whose growth-vs-draw boundary matters.

#30 introduced the first spouse **stock**: four account balances (401k / Roth / Taxable / HSA).
A stock is precisely the object that requires a retirement age — the age at which contributions
end and draws begin. The moment #30 gave the spouse a balance, it inherited the obligation to
answer "when does that balance stop accumulating and start being available?" — and it answered it
*by accident*, by reusing the primary's timeline. That is why the defect appeared exactly when
#30 shipped and not one day before. Classic sidestepped the whole problem by never carrying a
spouse balance.

### Deliberate vs. accidental decisions

**Deliberate, load-bearing patterns (keep them):**

- **`isMarried` / `hasSpouse` gating.** Every spouse feature collapses to zero/no-op when the
  household is single, so the golden master (a single filer) is untouched
  (`retirement-income.js:44-45`, `hasSpouse` at `App.jsx:280-282`).
- **Golden-master-safe optional params defaulting to a no-op.** The engine accepts
  `tradGrossSpouse = 0, spouseRmdStartAge = Infinity` and produces a byte-identical no-spouse walk
  (`retirement-phase.js:50`, `retirement-engine.js:51-52`). This "add an optional term that
  defaults to inert" pattern is how #30 avoided moving any existing number.
- **Advisory nudge, not auto-override.** The spouse SS basis computes both figures and *nudges*
  (`spouseAltHigher`) rather than silently choosing the higher one (`retirement-income.js:40-42`).
  The user stays in control; the model shows its work.
- **One engine, one tax pass.** The retirement walk is the single source for longevity, RMD
  schedule, conversion benefit, and the chart (CLAUDE.md rule 2b). #30 correctly added the spouse
  as a *second bucket inside that one engine* (`tradGrossSpouse`, its own RMD gate keyed to the
  spouse's own age, both RMDs stacked into one bracket-accurate tax layer —
  `retirement-engine.js:147-152, 200-207`), never a parallel walk.

**Accidental (this is the bug):** the spouse-freeze fell out of a convenience. To make the
spouse's retirement-year row land at the same array index as the primary's, App.jsx set
`spouseContribEnd = spouseCurrentAge + (safeRetAge - currentAge)` (`App.jsx:333`) and read the
seed at `spouseSimData[phase2End - 1]` where `phase2End` is the *primary's* years-to-retirement
(`App.jsx:358-360`). Reusing one index for both people silently encoded "both spouses retire the
same calendar year." Nobody decided that; it was a side effect of array bookkeeping. The
`spouseAccounts` bundle even documents the consequence as if it were intentional — "no per-account
`contribEnd` … the spouse contributes until the household retirement"
(`App.jsx:1426-1427`, ARCHITECTURE.md bundle table) — a sentence that is now the bug's charter.

### Patterns from the income-modeling era that must carry into the account-engine work

1. **Gate on `isMarried`/`hasSpouse`** so the single-filer golden master never moves.
2. **New engine terms default to inert** (`spouseIncomeFloor = 0`, `spouseIncomeFloorEndAge`
   defaulting so the term is off) — mirror the `tradGrossSpouse = 0` precedent exactly.
3. **Advisory-nudge, not auto-override** — if a `spouseRetirementAge` ever grows a suggested
   "optimal" value, surface it the way `spouseAltHigher` surfaces the better SS basis; don't
   auto-set it.
4. **Extend the one engine, never fork it** — the gap-year income floor and the Option-A draw
   gating (Section C) must be new terms *inside* `buildRetirementWalkByAccount`, not a second
   spouse-specific walk.

---

## Section B — Real-world problem inventory (merged formal + informal)

One de-duplicated table. "Commonality" cites the strongest stat available; "Informal signal"
cites the strongest community corroboration; "Codebase status" is reasoned against Phase 1 with
file:line backing in the notes below; "Difficulty" ties to specific architecture.

| # | Problem | Commonality (strongest stat) | Informal signal (strongest example) | Codebase status | Difficulty & why | Competitor gap? |
|---|---|---|---|---|---|---|
| 1 | **Staggered retirement** — spouses retire different years; who funds the gap, working spouse's paycheck offsets draws, continued saving for the still-working spouse | Only **11%** of couples retire simultaneously; **~62%** stagger by ≥1 yr (Phase 2 §1, Ameriprise) | Bogleheads ask: "model each individual… separately… combining for an overall view"; the Roth-conversion gap-years window shrinks if couple retires far apart (Phase 2b §1, §4) | **Not handled** — this *is* BUG-82 | **Medium** — the spouse sim already exists (`App.jsx:334`); it's just terminated at the wrong age. Fix = the `spouseRetirementAge` work in Section C | — |
| 2 | **SS claiming coordination** — delay the higher earner (sets survivor floor), spousal cap, couple break-even ≠ single | Universal for married claimants; coordinated claiming adds **$150–250k** lifetime (Phase 2 §2, T. Rowe) | SSA reps get restricted-application *wrong*; 30% think no spousal benefit exists (Phase 2b §2) | **Partial** — model computes own vs spousal, caps spousal at 50%, nudges `spouseAltHigher` (`retirement-income.js:35-45`); does **not** search for the household-optimal claiming combination | **Medium** — formulas exist; a joint two-age optimizer is a small combinatorial search, analogous to the shipped conversion optimizer's search | — |
| 3 | **Widow's/widower's penalty** — survivor flips to Single brackets (~½ width), keeps larger-of-two SS, inherits IRA onto Uniform Lifetime Table, tighter IRMAA | Universal *eventually*; **$5–20k+/yr** (up to $42k) tax rise; survivor loses **$25–40k/yr** of SS (Phase 2 §3) | **The single most-repeated gap** across all sources; dedicated Roth-hedge threads; real "protect my spouse if I die first" posts (Phase 2b §3, §5) | **Not handled** | **Medium (high-tractability)** — a deterministic scenario re-run, structurally like `calcWhatIfScenario` (swap scalars, re-walk). Filed as **#126** | **YES — named in BOTH ProjectionLab and Boldin** (Phase 2b §5) |
| 4 | **Two-account-set withdrawal sequencing / RMDs aren't poolable** — each spouse's RMD from their own accounts on their own age; Table II for >10-yr-younger sole-beneficiary spouse | Common for dual-earner couples; Table II ≈ **24% smaller RMD** at a 20-yr gap (Phase 2 §4) | RMDs *repeatedly* misunderstood as poolable — "NOT a shared pool" needs recurring forum correction (Phase 2b §4) | **Core math handled**; surfacing is the gap — per-spouse RMDs correct (`retirement-engine.js:147-152`), joint bracket stacking correct (`:200-207`), Table II modeled for the primary-owner direction. But strategy cards are primary-only (**BUG-84**) and the RMD schedule display is primary-only (**BUG-78**) | **Mixed** — the hard math is *done*; BUG-84 needs an owner tax-law call, BUG-78 has a cheap partial fix (Section C.4) | — |
| 5 | **Risk / life-expectancy asymmetry + last-survivor horizon** — plan portfolio to the survivor's longer life, step income down at first death | **47%** of couples disagree on risk tolerance (Fidelity 2024); **53%** chance one of a 65-yo couple lives past 90 (Phase 2 §5) | Risk mismatch is dangerous in downturns; "one spouse handles everything, the other is unprepared" recurs unprompted (Phase 2b §7) | **Not handled** — single `lifeExpect`, single return assumption | **Medium / Large** — "portfolio to last-survivor age, income step-down" is medium and overlaps #126; true joint-life *probability* needs a mortality layer (large; must route through the real #114 lens, not fabricated odds — CLAUDE.md rule 6) | — |
| 6 | **Employer coverage gap / COBRA / ACA cliff** — bridge to Medicare; MAGI-driven subsidy cliff; <20-employee Medicare-primary rule | Very common; ACA cliff loss **$10–25k/yr**; 400% FPL cliff back for 2026 (Phase 2 §6) | Age-gap Medicare bridge is *the* age-gap pain point (Phase 2b §6) | **Partial** — the app already models the ACA cliff + IRMAA per conversion year, MAGI-linked (features #7/#34); does **not** model a per-spouse bridge *cost* as a gap-years expense, nor the <20-employee rule | **Medium** — MAGI linkage exists; adding a gap-years bridge expense is small; a "cheapest plan" comparison is larger | — |
| 7 | **Pension J&S vs. single-life election** — irrevocable survivor-benefit choice; "pension max" sales trap | Moderately common, shrinking population, high stakes (Phase 2 §7a) | (weak in informal sources) | **Partial** — pension is a flat stream (`pensionMonthly`/`pensionStartAge`); no survivor-election comparison | **Medium** — deterministic side-by-side, but needs a survivor phase (ties to #126) | — |
| 8 | **Medicare timing with an age gap** — per-spouse Initial Enrollment Periods; older spouse on employer plan + <20-employee test | Common with any age gap (Phase 2 §7b) | Family "can Mom use Dad's work history?" confusion; in-person SSA required (Phase 2b §6) | **Not handled** | **High-tractability** — deterministic per-spouse windows; small if surfaced as informational | — |
| 9 | **Divorced-spouse / remarriage SS + blended-family beneficiary** — ex-spouse claim rules; remarriage-before-60 cutoff; beneficiary conflict | **~2 in 5** marriages involve a previously-divorced partner (Phase 2 §7c) | Blended-family beneficiary litigation surfaced (Phase 2b §7) | **Not handled** — needs a marital-history data model | **Low tractability / niche** — the fair-division judgment isn't a calculation; new data model | — |
| 10 | **"Plan legible to both spouses"** (cross-cutting UX, not a calc) — one spouse manages everything, the other is unprepared | Only **14%** of widows made financial decisions independently *before* loss (Phase 2b §7) | Surfaced unprompted across three unrelated searches (Phase 2b theme 5) | **N/A (design principle)** | **Design consideration** — frame survivor features as "protect [spouse]" in the language people already use | — |

**Reasoning notes (codebase-status claims that need Phase-1 backing):**

- **#1 (not handled).** The freeze is caller-side in App.jsx (`spouseContribEnd` `:333`, seed
  snapshot `:358-360`, `sTrad` `:469`, `retPhaseBase.tradGrossSpouse` `:619`); the engine is a
  faithful pass-through of whatever balance it's handed. So this is a *plumbing* gap, not an
  engine-math gap — which is why it's medium, not large.
- **#2 (partial).** `calcRetirementIncome` already produces both bases and the nudge; note also
  a latent simplification the archaeology flagged — `ssAtRet`'s gate keys only on the *primary's*
  claim vs. the *primary's* retirement (`retirement-income.js:46-48`), so the household SS lump is
  already governed by the primary's timeline (a smaller cousin of BUG-82, worth noting, not
  urgent).
- **#4 (core done).** This is the most important status nuance in the table: the *hard* part
  (per-person RMD timing, joint progressive bracket stacking, Table II) is verified correct in the
  engine. What's missing is *display and strategy surfacing* — exactly BUG-84 and BUG-78. The
  community's "RMDs aren't poolable" confusion is answerable today with a display change, not new
  math.
- **#5 / #6 / #7.** The survivor-phase step-down (income drops at first death) is a shared
  primitive across #5, #7, and #126 — build it once.

**On the competitor gap (#3):** that ProjectionLab *and* Boldin both fail the "survivor over 60,
before FRA, reduced benefit" case (Phase 2b §5) is the strongest strategic signal in the research.
It means the survivor scenario is an industry-wide difficulty, not this codebase's laziness — which
both validates prioritizing it and offers a genuine differentiation angle if done well.

---

## Section C — Synthesis / Design Proposal

Five decisions, each argued.

### C.1 — BUG-82's open question: does the still-working spouse's balance sit idle (Option A) or get pooled into household draws (Option B)?

**Decision: Option A — the spouse's accounts stay out of the drawable pool until the spouse's own
retirement age; during the gap years the household draws from the primary's accounts, offset by
the spouse's after-tax earned income as a household income-floor term.** Option A is only *correct*
when paired with that income floor (BUG-82 defect 3), so C.1 and the floor are one decision, not
two.

**Why Option A, argued:**

The engine already does Option B *by default and for free* — `drawInOrder`'s `"trad"` branch pools
the primary Traditional bucket and the spouse's `tradSp` into one combined draw
(`retirement-engine.js:98-106`), and Roth/Taxable/HSA are already single shared buckets. So Option
B is the path of least resistance: seed `tradGrossSpouse`, and it's immediately spendable. That is
exactly why Option B is tempting and exactly why it's wrong — it's the accident, not a choice.

Option B is wrong for three concrete reasons:

1. **It makes still-flowing contributions instantly spendable.** During the gap years the spouse
   is, by construction, *still working and still contributing* to that 401k. Treating a balance
   that's receiving new deferrals as a drawable retirement pool is incoherent — you'd be
   withdrawing and depositing the same account in the same year.
2. **It ignores the early-withdrawal penalty.** The UI constrains the spouse to be *younger* than
   the primary (`ss` bundle `spouseCurrentAge.max = currentAge - 1`, `App.jsx:1480`; Classic
   sibling at `:3650`). A spouse who is still working while the primary is retired is very likely
   under 59½. Drawing their 401k would incur a 10% penalty the engine isn't charging in this
   context — so Option B doesn't just mis-model behavior, it under-states the *cost* of the draw.
3. **It contradicts how gap years are actually funded.** Multiple independent sources say the
   working spouse's *paycheck* — not their 401k — is what reduces the household's need to sell
   investments during the gap (Phase 2 §1: U.S. Bank, ICFS on sequence-of-returns; Phase 2b §1
   Bogleheads). The realistic mechanism is an *income floor*, not an account raid.

**Address the counter-argument head-on.** The strongest case for Option B is false depletion: if
the primary's accounts run dry during a long gap while the spouse sits on a large, growing balance,
Option A shows the household going broke next to a $2M account it obviously *would* tap before
starving. This is real but narrow, and Option A's own income-floor term defuses most of it: once
the spouse's earned income is covering a large share of gap-year expenses (the whole point of
defect-3's fix), the pressure on the primary pool drops sharply, and true depletion during the gap
becomes the genuinely-underfunded case that *should* surface as stress rather than be silently
papered over by raiding a penalty-exposed account. For the residual edge, the clean escape hatch is
already expressible in the existing architecture: keep the spouse's Traditional bucket **last** in
draw order and reachable only on a true shortfall of (primary pool + income floor) — `drawInOrder`
already returns a `shortfall`, so a spouse-of-last-resort draw is a natural extension. I recommend
**deferring that shortfall-spillover-with-penalty to a follow-up** (it's the rare case and it needs
the 10% penalty modeled inside the walk), and shipping pure Option A first: idle until the spouse's
own retirement age, income floor during the gap. The real-world evidence is decisive — staggered
retirement is the 70–90% case (Phase 2 §1) and the working spouse's income is what funds the gap in
practice — so the model's default behavior should encode that, not the account-raid.

### C.2 — `spouseRetirementAge` input shape

**Bounds:** `min = spouseCurrentAge + 1`, `max = ` the primary `retirementAge` slider's own max
(copied verbatim per the ARCHITECTURE bundle-shape convention — do not invent a new ceiling),
`step = 1`. The `min` mirrors the accumulation sim's row indexing (rows start at
`spouseCurrentAge + 1`, and the fix reads the seed at index `spouseRetirementAge - spouseCurrentAge
- 1`, which must be ≥ 0); if the owner wants to allow "spouse already retired," add the same
year-0 fallback the primary path already uses (`phase2End > 0 ? simData[...] : snapshot`,
`App.jsx:383-385`) rather than lowering the min.

**Shape:** `{ value, set, min, max, step }` with `set` wrapped in `guardWrite(setSpouseRetirementAge,
readOnly)` — identical to every other numeric field in `spouseAccountsBundle` (`App.jsx:1433-1435`).

**Which bundle:** **add it to `spouseAccounts`, not `ss`.** Three reasons: (1) it governs the
account contribution cutoff and the retirement-seed timing — that is the `spouseAccounts` bundle's
domain, and it is the true sibling of the primary `accounts` bundle's per-account `contribEnd`
(ARCHITECTURE bundle table); (2) it must be premium-gated exactly like the rest of `spouseAccounts`
(the `ss` bundle is *not* premium — spouse SS is free — so putting a premium account concept in a
free bundle muddies the entitlement gating); (3) it renders in the same Horizon "Spouse &
household" card where the spouse account inputs already live (`MyDetailsScreen.jsx`). Note the
existing bundle text — "no per-account `contribEnd` … the spouse contributes until the household
retirement" (`App.jsx:1426-1427`) — is the sentence being retired; the fix replaces four missing
per-account end-ages with **one** spouse-level retirement age, matching how all four spouse accounts
already share a single timeline. The bundle memo's dep array gains `spouseRetirementAge` + its
setter (mechanical).

**Default value — the real decision:** **default to the same retirement *age* as the primary (i.e.
numerically `primaryRetirementAge`; a spouse whose primary retires at 65 targets their *own* age
65), NOT the same calendar year.**

Argued: the two candidates are (a) same *calendar year* as the primary — which is today's
accidental behavior and is golden-master-safe for existing spouse-data users — and (b) the spouse's
own natural age. Choice (a) is the codebase's usual instinct (preserve current behavior via an
inert default), and I am deliberately rejecting it here. **The entire point of BUG-82 is that
same-calendar-year retirement is wrong for the common case** (a younger spouse who keeps working);
a default that re-encodes the bug means it silently persists for everyone who never discovers the
new field. The research is unambiguous that staggered retirement is the norm (Phase 2 §1). A
default should encode the realistic case, not the buggy one.

Among "own natural age" options, "same age as the primary" beats a hardcoded 65 because it *tracks
the household's own stated retirement philosophy* — whatever age the user already chose for
themselves is the best available proxy for when they'd expect a same-minded spouse to retire — and
it avoids planting an arbitrary magic number next to a slider the user already set. It also degrades
gracefully: if the spouses are the same age, it collapses to simultaneous retirement (the intuitive
case).

**Golden-master and safety framing:** the *true* golden master is a single filer with no spouse
data, and it is byte-untouched — no spouse, no `spouseRetirementAge` effect. The only users whose
numbers move are those who have *already* entered spouse accounts (a small, premium, Horizon-only
cohort), and for them the move is a **correction upward** (their household wealth was understated by
up to $2.38M). Moving a small premium cohort's numbers in the correct direction is a better trade
than preserving a known-wrong default for everyone. The archaeology's regression anchor still holds
as a *manual test input*, not the default: setting `spouseRetirementAge` to the same-calendar-year
value must still reproduce today's pre-fix output exactly (strict generalization).

### C.3 — Widow's-penalty filing-status cliff: in scope, or a separate feature?

**Decision: out of scope for this fix pass; specified below as a clean new backlog item, filed as
feature #126 in `feature-tracker.html`.**

**Why separate:** the `spouseRetirementAge` work is an *accumulation-phase* correctness fix
(contributions, seed timing, gap-year income floor). The widow's penalty is a *retirement-phase
survivor scenario* (filing-status flip, survivor SS, IRA rollover onto a worse RMD table, IRMAA
compression). They touch different parts of the engine, are independently valuable, and bundling
them would couple two unrelated risk areas into one oversized session. But separate does **not**
mean low priority — the research makes it the highest-value *next* feature (Section B #3): the
single most-repeated gap, high-tractability, and a named limitation in both leading competitors.

**#126 — Survivor / widow(er) scenario modeling**

> *Section: Spouse / Household. Status: planned. Candidate priority: P1 (highest-value spousal
> follow-up). Premium (extends #30).*
>
> **Description.** Model "what happens to the surviving spouse if one spouse dies first." At a
> chosen first-death age, re-run the retirement walk with: `filingStatus → single` (compressing
> the brackets the walk's `calcTax` calls use); household SS reduced to the *larger of the two*
> benefits (survivor rule, not the sum); the deceased spouse's Traditional 401k rolled into the
> survivor's bucket, so RMDs recompute on the survivor's own age via the Uniform Lifetime Table
> (losing any Table II benefit); and household spending stepped down (survivor spends less than a
> couple — a new `survivorSpendingPct` input, ~75–80% default). Surface the year-over-year tax
> delta the survivor faces, and — the payoff — quantify how pre-death Roth conversions in the
> low-bracket MFJ years reduce that survivor tax (which makes the *already-shipped* conversion
> planner more valuable).
>
> **Structural shape.** A scenario re-run structurally analogous to `calcWhatIfScenario`
> (`what-if.js`) — the engine already re-runs the whole walk under swapped scalar assumptions.
> Survivor mode swaps: filing status, the SS lump, the trad seed (primary + rolled-over spouse),
> the RMD table selection, and the expense level, then re-walks from the first-death age. Reuse
> the income step-down primitive shared with Section B #5/#7.
>
> **Complexity: Medium.** Leverages existing walk-re-run infrastructure; new work is the
> survivor-SS rule, the filing-status flip inside the walk's tax calls, the IRA-rollover reseed,
> and the spending-step-down input. High-tractability per Phase 2 §3 ("fully deterministic").
>
> **Impact: High.** Most-requested gap across all research; competitive differentiator (Phase 2b
> §5); real user language is "protect [spouse] if I die first" (Phase 2b §3 — frame the UI that
> way, not "survivor mode").
>
> **Dependencies and sequencing — a firm call, not a toss-up.** Depends on **#30** (needs the
> two-person account model to know what rolls over). It is *independent* of the `spouseRetirementAge`
> fix in the sense that neither one's code touches the other's files — but that does not make the
> order a toss-up. **Build #126 in the same working session as the BUG-82 fix if convenient, but only
> after Steps 1–4 of the C.5 plan are committed and passing tests — never concurrently, and never
> before.** The reason is concrete, not process-conservatism: #126's whole mechanism is "roll the
> deceased spouse's Traditional 401k into the survivor's own bucket." If that balance is still
> frozen/understated (BUG-82, unfixed), #126 ships a feature whose headline number — the thing it
> exists to show the user — is confidently wrong for exactly the age-gap households the research
> says are the common case. Worse, the bug would then have to be fixed *twice*: once in the base
> walk, once again inside #126's own re-walk, because #126 will have its own seed-balance logic to
> patch. Building on the corrected foundation costs nothing (the fix is small — see C.5 Steps 1–4)
> and avoids that double-patch. This mirrors this codebase's own established practice of shipping
> multiple related pieces in one session/PR when they are built and tested *in sequence* (e.g. the
> WI-3.4+WI-3.5 and WI-3.7+WI-3.8 batches) rather than as one undifferentiated diff — so "same
> session" and "sequenced, not concurrent" are not in tension here. Natural display surface is #31
> (household dashboard) — see C.4's BUG-78 discussion for why #31 itself should also wait.
> Synergizes with the shipped conversion optimizer.

### C.4 — BUG-84 / 77 / 78 disposition

| Bug | What it is | Disposition | Why |
|---|---|---|---|
| **BUG-77** | Spouse trad bucket frozen through a what-if re-sim (`what-if.js:522-534, 555-584`) | **Fold in** (same bug class; can be the last step, deferrable) | Same underlying "spouse balance isn't threaded through a re-sim" problem as BUG-82. The BUG-82 fix *builds the exact primitive BUG-77 needs* — a re-runnable spouse sim (`spouseSimInputs` mirroring `simInputs`). Once the spouse sim is parameterized by `spouseRetirementAge` and re-runnable, threading it into the `needsResim` branch is a small increment. **Leaving it open would introduce a *new* divergence:** post-BUG-82 the main path grows the spouse to `spouseRetirementAge`, but a retire-age what-if preview would still freeze it — so scenario previews for spouse-households would contradict the headline. Not a strict prerequisite for the main-path fix (a *no-resim* scenario is fine once the base value is correct), which is why it can be the last step and deferred if the session runs long. |
| **BUG-84** | Withdrawal-order / conversion scalars stayed primary-only (`App.jsx:463-465`) | **Keep separate; defer with an interim honesty patch** | Genuinely orthogonal. This is a per-account/per-person *tax-law* question (you cannot convert a spouse's 401k into the primary's Roth), not a "balance not threaded through X" plumbing bug. C.1/C.2 don't resolve it — it needs an owner call between "pool for display, sequence per-person" vs. "model the spouse's own parallel sequence." It's about *strategy-card display*, not accumulation correctness, so it doesn't block anything. **Cheap interim:** relabel the withdrawal-order/conversion cards "You" instead of "Household" so the primary-only scalars aren't silently presented as household figures — a copy change, no model work, buys correctness-of-claim while the design question waits. |
| **BUG-78** | `rmdTaxByAge` drops years where only the spouse has an RMD (`App.jsx:702-704`, `retirement-phase.js:92-103`) | **Separate; but ship a cheap partial fix now** | The *full* fix depends on #31's joint RMD schedule. But note BUG-82's fix makes BUG-78 *more* likely to bite: a correctly-grown, larger spouse balance whose younger-spouse RMDs start later will more often land in years where the primary's trad is already depleted (a spouse-only-RMD year). The engine *already computes* the joint `rmdTax` per row — it's just filtered out because `rmdSchedule` keeps only `r.rmd > 0`. **Cheap standalone fix:** build `rmdTaxByAge` from the union of years where `r.rmd > 0` **or** `r.rmdSpouse > 0`, independent of #31's full display work. Ship it as its own small step; it becomes marginally more relevant after BUG-82 but is a correct fix regardless. |

### C.5 — Prioritized, sequenced implementation plan (for a FUTURE session)

Ordered by what unblocks what, not by severity. Sizes: S = small, M = medium, L = large.

| Step | Delivers | Depends on | Size | Closes / partially closes |
|---|---|---|---|---|
| **0. BUG-78 partial (union RMD filter)** | `rmdTaxByAge` includes spouse-only-RMD years; the engine's already-computed joint `rmdTax` stops being dropped | none | **S** | BUG-78 (practical gap); no golden-master impact (default has no spouse) |
| **1. Add `spouseRetirementAge` input** | The lever: new field on `spouseAccountsBundle`, `{value, set, min, max, step}`, in the Spouse & household card; default = same age as primary (C.2) | none | **S–M** | Foundation for BUG-82; Section B #1 (staggered retirement) begins |
| **2. Rewire accumulation cutoff + seed snapshot** | `spouseContribEnd = spouseRetirementAge` (`App.jsx:333`); `spouseAtRet` reads `spouseSimData[spouseRetirementAge - spouseCurrentAge - 1]` with the year-0 fallback (`:358-360`) | Step 1 | **S** (copy-the-primary-pattern) | **BUG-82 defects 1 & 2** — the $2.38M understatement; Section B #1 core |
| **3. Gap-year spouse income floor** | Optional `spouseIncomeFloor` + `spouseIncomeFloorEndAge` on `buildRetirementWalkByAccount`, additive with the SS/pension floor (`retirement-engine.js:161`), zero by default; App computes the spouse's after-tax earned income for gap years and threads it into `retPhaseBase` | Steps 1–2 (needs the gap window) | **M** (engine floor + a tax decision — stack as ordinary income on the floor per the BUG-72 precedent, or treat as net) | **BUG-82 defect 3**; makes C.1 Option A correct; Section B #1 fully |
| **4. Option A draw gating** | Spouse's Traditional bucket held OUT of the drawable pool until `age >= spouseRetirementAge` (rather than immediately drawable — today's accidental Option B); implements the C.1 draw-side | Steps 1–3 | **M** | C.1 decision (draw side) |
| **5. What-if spouse re-sim (BUG-77)** | `spouseSimInputs` in the what-if bundle; re-run the spouse sim in the `needsResim` branch in lockstep with the primary (`what-if.js`), mirroring `buildAccumChart`'s two-array zip | Steps 1–2 | **S–M** | **BUG-77**; prevents a new main-path/preview divergence |

**Deliberately deferred (and why deferring is right, not scope-creep):**

- **Shortfall-spillover-with-penalty** (the Option-A escape hatch when the primary pool truly
  depletes during a gap). Rare case; needs the 10% early-withdrawal penalty modeled inside the
  walk. Ship pure Option A first; the income floor (Step 3) removes most of the pressure that would
  trigger it.
- **BUG-84** (per-person vs. pooled withdrawal/conversion strategy). Needs an owner tax-law call
  between two fix shapes; ship the interim "You"-not-"Household" relabel now so the claim isn't
  misleading, and take the real decision separately. Deferring is right because it's orthogonal to
  accumulation correctness and blocks nothing.
- **Full BUG-78 / spouse RMD sub-schedule display** — only this cosmetic half waits on #31's
  household dashboard (a proper per-spouse schedule table needs a screen to live on); the tax-dollar
  correctness half is Step 0, ships now, and does not depend on #31 at all. Don't conflate the two:
  #31 is not a prerequisite for BUG-78's substance, only for its nicest possible display.
- **#31 household dashboard itself** — deliberately NOT reprioritized ahead of Steps 0–5, and its
  own value is separate from cleaning up BUG-84/77/78: #31 is a *display* screen and doesn't touch
  the code paths BUG-84 (strategy-card scalars in App.jsx) or BUG-77 (the what-if re-sim pipeline)
  live in, so building it first would not let those two be "cleaned up in one pass" regardless.
  Building it before BUG-82 lands would also mean shipping a combined-portfolio dashboard on top of
  a spouse balance already known to be wrong — the same foundation risk as #126. Build #31 after
  Steps 0–5 (and ideally alongside or after #126, since #126 wants a display home there too).
- **#126 survivor scenario** — the highest-value *next* feature; build it in the same session as
  Steps 0–5 if convenient, but only after they're committed and tested (see C.3's Dependencies and
  sequencing note above for why this is a firm call, not a preference).
- **SS-claiming coordination optimizer** (Section B #2) — the tool already computes both bases and
  nudges; a *joint search* over two claiming ages is a separate, larger feature (Phase 2 §2: "a
  small combinatorial optimization, not a single formula"). Deferring keeps this pass focused on
  the account-freeze bug class rather than opening an optimization front.

**What this plan achieves.** Steps 0–5 close BUG-82 (all three defects), BUG-77, and the practical
half of BUG-78, and fully deliver Section B problem #1 (staggered retirement) — the entry that maps
directly onto the shipped-but-broken #30 engine. It sets up #126 (the highest-value differentiator
per the research) on a correct foundation, and it leaves BUG-84 and the SS optimizer as clean,
well-scoped separate decisions rather than half-finished work entangled in a bug fix. Every step
preserves the true (single-filer) golden master, consistent with the golden-master-safe patterns
Section A identified as the codebase's load-bearing convention.
