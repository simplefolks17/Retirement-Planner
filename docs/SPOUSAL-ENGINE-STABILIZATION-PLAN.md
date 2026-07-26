# Spousal Engine Stabilization Plan

**Written:** 2026-07-26, at the close of the BUG-82 → BUG-88/89/90 → BUG-97 arc on branch
`claude/spousal-planning-design-cjxl0i` (PR #59). **Purpose:** this is the single "start here"
document for the next session's work on the spouse-retirement engine (#30). It exists because a
3-agent Opus review battery (adversarial correctness, cross-feature interoperability, roadmap/
foundation health), run after BUG-88/89/90 shipped, converged on a finding the owner wants acted on
before more feature work lands on this engine: **the feature isn't converging.** Severity across
review passes isn't decaying — the most recent pass (a *planning* pass, not even a review) found the
largest issue yet (BUG-91). This document lays out why, and the order in which to fix it.

**How to use this doc:** read the diagnosis (§1) once, then work the bug list (§2) in the stated
order. Each bug entry here is a summary with a pointer to its full write-up in `docs/BUGS.md` — that
file has the root cause, the measured repro, and the exact `where:` file/line references. Don't
duplicate that detail here; this doc is about *sequencing and why*, not the bugs themselves.

---

## 0. Current state (as of this doc's writing)

- Branch `claude/spousal-planning-design-cjxl0i`, PR #59, 1030 tests, golden master untouched
  throughout, lint clean, build OK.
- Shipped this arc: BUG-82 (the spouse engine itself — Option-A hold-out, gap-year maps, RMD
  timing), BUG-88 (shortfall-spillover escape hatch), BUG-89 (conversion-window income floors),
  BUG-90 (nominal→real dollar deflation for gap-year flows), BUG-97 (`calcWhatIfDelta` spouse-drop
  on forced resim).
- **Not shipped, in priority order for the next session:** BUG-91 (the real/nominal basis mismatch,
  model-wide) and its two prerequisites (§2 steps 1–2 below), then BUG-93/94/95/96 (the review
  battery's new findings), then BUG-85/84/92/98 (previously-filed, lower-urgency items).
- All of the above are filed in `docs/BUGS.md` — BUG-93 through BUG-98 were filed in this same
  documentation pass, alongside this plan.

---

## 1. The diagnosis — read this before touching anything

Sorted by defect class rather than by feature, the large majority of every bug this engine has
produced (BUG-77, 78, 79, 80, 84, 85, 86, 89, 90, 91, 93, 94, 95, 96 — fourteen entries) decomposes
into **one of two undeclared-basis axes**:

- **Scope axis** — is this quantity primary-only or household? (BUG-79, 80, 84, 85, 86, 89, 93,
  95, 96, and the Monte Carlo lens's own `startBal` choice.)
- **Unit axis** — is this quantity nominal or real (today's vs. retirement-year) dollars? (BUG-90,
  91.)

This codebase has an exceptionally strong, well-enforced convention for **one source per quantity**
(principle 11 — BUG-31/BUG-25's whole lineage exists to prevent two implementations of one
calculation from silently disagreeing). It has **no convention at all for declaring the basis of a
quantity** — nothing marks whether a number flowing through the code is "household, nominal,
today's-dollars" or "primary-only, real, retirement-year-dollars," so two quantities in different
bases get composed with nothing to object.

**And critically: `golden-master.test.js` is structurally blind to both axes.** It locks one filer
(scope axis never exercised — there's no spouse) at one fixed default (unit axis never varied —
the mismatch factor is the same every run). That is *why* discovery of this bug class has been
purely a function of how hard an adversarial reviewer happened to look, five-plus review passes in,
and why it hasn't saturated. **The v1 scope boundary for #30 was not drawn in the wrong place — the
verification boundary was.** Fixing that (§2, steps 1–2) is worth more than fixing any individual bug
in §2's list, because it's the difference between "found by whoever looks hardest" and "caught by
`npm test`."

---

## 2. Recommended sequencing

**The gate at the end of every step, unchanged from this session's own process:** `npx vitest run`
green (note the count), `golden-master.test.js` untouched (stop and surface if it moves unexpectedly
— see step 4's note), `npm run lint` clean, `npm run build` OK. Implement → review the diff → run
the gate → commit → only then start the next step.

### Step 1 — Promote a spouse-household golden master

**Do this first.** Take the target-demographic fixture already built for BUG-88/89/90's own
composed test (`T-X.2` in `src/__tests__/spouse-household.test.js` — primary retires at 58 on
modest-but-real balances, spouse is 48 at that point and works to 65, a 17-year gap) and lock it the
way `golden-master.test.js` locks the no-spouse default: every headline number (`totalAtRet`,
`yearsSustained`, `withdrawalRate`, `rmdTaxBite`, `totalSpouseSpillover`, etc.) pinned to an exact
value, re-locked only when a change is deliberate and understood.

**Why this must come before everything else in this list:** it converts the *entire scope axis*
from "found by whoever looks hardest" into a test that fails on the next commit that regresses it.
Six of the bugs already resolved in this engine's history would have failed this test on the very
first run had it existed. Any of the fixes below (especially BUG-93, which changes engine
behavior) needs this net underneath it before it's safe to touch.

### Step 2 — Assert the unit contract as a test, not a comment

Add one invariant test: every quantity entering the retirement walk is declared to be in
retirement-year real dollars (the proof is in BUG-90's entry and in this file's own
`FINANCIAL-MODEL.md` → "Spouse gap-year mechanism" section), and `effectiveExpenses`/
`pensionMonthly`/money-event amounts are checked against that declared basis rather than assumed.
This turns BUG-91 from a paragraph in `docs/BUGS.md` into a red test — the only form in which a
future change can't silently reintroduce or deepen it.

**Do this before Step 3 (BUG-91's actual fix)**, not after — you want the red test to exist and be
understood before you start moving the number it's protecting.

### Step 3 — BUG-91: the real/nominal dollar-basis mismatch itself

The big one. Full derivation, the golden-master-default numbers (`withdrawalRate` 1.42% locked vs.
~5.61% unit-corrected — the corrected figure *fails* the app's own 4% guideline), and the
`livingExpenseGrowth` dead-input finding are all in `docs/BUGS.md` → BUG-91. Two things to know
going in that aren't obvious from that entry alone:

- **This bug's fix is coupled to BUG-90's already-locked deflation base.** BUG-90's `T-F3.2` test
  hard-locks `primaryRetAge` as the deflation base for the spouse gap-year maps — correct *given the
  current seed convention* (seed at the primary's retirement year, in retirement-year dollars). If
  BUG-91's fix re-bases the whole walk to a different convention (e.g. today's-dollars throughout,
  rather than inflating `effectiveExpenses` forward into retirement-year dollars), that base
  potentially has to flip, and `T-F3.2` would need to be re-examined and re-derived, not just
  re-locked. Read BUG-90 in full before choosing BUG-91's fix shape.
- **This bug must be fixed before Session B (the Monte Carlo engine port) and before #126 (the
  survivor scenario feature).** Session B's entire deliverable is a success percentage and a set of
  tone thresholds (`MONTE_CARLO_SUCCESS_GUIDELINE_PCT`, `MONTE_CARLO_LOW_ODDS_PCT`) calibrated
  against the spend basis — doing that L-sized port and *then* moving the spend basis ~4x means
  recalibrating everything the port just shipped. #126's whole point is a bracket-position delta,
  and bracket position is determined by draws computed at the (currently wrong) spend level — the
  design doc's own sequencing argument for #126 ("a survivor rollover computed from a still-frozen
  spouse balance would ship a feature whose headline number is confidently wrong") applies here,
  one level up, even more strongly.

Expect this to move the golden master substantially and in the conservative direction (spend
requirements rise). That is the fix working, not a regression — but it needs its own PR, its own
"before/after" callout in the description, and a fresh look at every downstream consumer that reads
`withdrawalRate`/`yearsSustained` guideline thresholds (`calcPlanDrivers`, the OnTrackPill verdict,
Strategies card applicability gates, the Monte Carlo caveat tone).

### Step 4 — BUG-93 + BUG-94 (one fix, two symptoms)

Two independent review agents converged on the same root cause: `hasSpouse` is used as a proxy for
"the spouse is a separate person with their own working timeline," but the input that would make
that literally true — actual spouse income/contributions — is never checked. Fix BUG-93 (gate the
Option-A hold-out on real income, not just an age comparison) first; BUG-94 (the Monte Carlo
caveat's mismatched firing condition) is a downstream symptom of the same gap and should be
re-examined once BUG-93 changes what "the hold-out is genuinely active" means. **Note:** BUG-94 is
also the interim caveat mechanism Session B is expected to retire entirely (see the Monte Carlo row
in `docs/BUGS.md` → BUG-82's Resolved entry). If Session B is scheduled soon after this stabilization
session, consider whether a narrow BUG-94 fix is worth doing at all versus letting Session B replace
the mechanism outright — an explicit call for whoever picks this up, not a decision made here.

### Step 5 — BUG-95 (spouse age visibility) and BUG-96 (RMD screen self-contradiction)

Both are UI/display fixes with no engine-behavior change (BUG-95 is "add a reachable editor and
reconsider the default"; BUG-96 is "match tile scope to table scope, or add the missing spouse
sub-schedule"). Independent of each other and of steps 1–4; can be done in either order, or in
parallel if split across two people. Not blocking anything else in this list.

### Step 6 — the previously-filed backlog: BUG-84, BUG-85, BUG-92, BUG-98

These predate this review battery and are already fully documented in `docs/BUGS.md` with their own
fix shapes sketched. BUG-98 (defensive-contract hardening) is low-priority and can be folded into
whichever step above touches the same file (`retirement-engine.js`) if convenient. BUG-84
(withdrawal-order scalars) is a genuine owner tax-law call between two fix shapes, not a "just fix
it" item — surface the two options from its entry and get a decision before implementing either.

---

## 3. Definition of done for this stabilization session

- Steps 1–2 (spouse-household golden master + unit-contract test) landed and green.
- BUG-91 fixed, with the golden master re-locked deliberately and the PR description calling out
  the direction of every headline number that moved and why.
- BUG-93/94 fixed (or BUG-94 explicitly deferred to Session B with a written reason, per step 4).
- BUG-95/96 fixed or explicitly triaged.
- `docs/BUGS.md` updated in place as each item resolves (move to Resolved, root cause + fix +
  tests, matching this codebase's established convention) — don't leave this plan's own bug list
  and `docs/BUGS.md` disagreeing about status.
- This document itself updated or retired once its job is done — don't let it go stale the way a
  bug entry would; it's a plan, not a permanent record (that's what `docs/BUGS.md` is for).
