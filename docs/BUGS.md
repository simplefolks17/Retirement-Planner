# Bug & Oddity Tracker

This file tracks known bugs, UI oddities, and design questions in the app.
Each entry records **what was found**, **why it happens** (root cause), **status**, and **fix notes** once resolved.

## Open Issues — Index

**Added 2026-07-27 (PR #62 review battery, forward-compat audit follow-through)** so a session can
find a relevant entry without reading the whole file. This table covers ONLY the "Open Issues"
section below (currently 11 entries) — the "Resolved Issues" section (~100 entries) stays
chronological (newest at top) with no separate index; search by `BUG-NN` or feature name instead.
**Keep this table in sync**: when an entry moves from Open to Resolved, delete its row here in the
SAME commit (the Session Close-Out procedure's re-verification pass, CLAUDE.md, is the natural
place this gets checked).

| ID | Severity | One-line | Key files |
|---|---|---|---|
| **BUG-103** | Medium | Monte Carlo `successPct` counts paths rescued only by the penalized spouse-401k spillover hatch as plain successes, with no visibility (BUG-92's problem class, new surface) | `src/model/monte-carlo.js`, `src/App.jsx`, `src/components/ArcGraph.jsx` |
| **BUG-102** | Medium | Lever-preview's spouse-gap gating inherited from the base plan, not the scenario's own re-seeded maps | `src/model/what-if.js`, `src/App.jsx` |
| **BUG-101** | Low-Medium | Accumulation-phase `contrib401k` stays nominal (tracks `incomeGrowth`, not inflation) | `src/model/simulation.js` |
| **BUG-100** | Low | Tax brackets aren't inflated forward — BUG-91's fix removed an error that was accidentally offsetting this | `src/model/taxes.js`, `src/model/retirement-engine.js` |
| **BUG-99** | Medium | Money events (Goals/LifeEventSheet) still entered/applied in nominal dollars against the now-corrected retirement-year walk | `src/model/money-events.js`, `src/model/retirement-engine.js`, `src/horizon/LifeEventSheet.jsx` |
| **BUG-85** | Low-Medium | Spouse Roth/Taxable/HSA gap-year contributions dollar-conserving but not separately tracked (only Traditional 401k is, v1 scope) | `src/model/retirement-phase.js`, `src/model/retirement-engine.js` |
| **BUG-84** | Major (owner tax-law call) | Withdrawal-order/conversion scalars (`retTrad`/`retRoth`/`retTaxable`) stay primary-only after #30 — needs an owner decision between two fix shapes, coupled to BUG-85 | `src/App.jsx` |
| **BUG-39** | Low (accepted) | Flow-Down *accumulation* growth is a residual plug, not `Σ(row.growth)` (the one documented exception to the no-residual-plug rule) | `src/model/flow-down.js` |
| **BUG-38** | Low (accepted) | Engine charges only *incremental* tax above the SS/pension floor — SS/pension effectively tax-free | `src/model/retirement-engine.js` |
| **BUG-37** | Low (accepted, owner-deferred) | Engine ignores `conversionTaxSource` — always funds conversion tax from the pool | `src/model/retirement-engine.js` |
| **BUG-36** | Low (accepted) | What-if/optimized-scenario deltas still use the blended (not taxed-once) engine for *deltas* only | `src/model/what-if.js`, `src/model/optimization.js` |

---

## Open Issues

### BUG-103 — Monte Carlo `successPct` doesn't distinguish a path that survives cleanly from one rescued only by the penalized spouse-401k spillover hatch (found 2026-07-28, in-house interoperability audit, PR #64)

**Owner:** me_theguy. **Severity: MEDIUM — BUG-92's exact problem class (a plan reads more comfortable
than it actually is because it silently depends on the escape hatch), on a NEW surface BUG-92's own
fix doesn't cover.**
**What:** BUG-92 (Resolved, spousal-engine stabilization session) caps a what-if scenario's verdict
at "tight" whenever `totalSpouseSpillover > 0`, so the headline Plan verdict can't overstate a plan
that only works by repeatedly raiding a still-working spouse's held-out 401k at a 10% early-
withdrawal penalty. Session B (PR #64) ported the Monte Carlo Range lens onto the SAME per-account
engine — which means the escape hatch (Option-A hold-out + penalized spillover, BUG-88) is now live
inside every one of the lens's 600 sampled paths for the first time. But `runMonteCarlo` only reports
`successRate` (did the path reach `endAge` without depleting) — it has no equivalent of BUG-92's
`totalSpouseSpillover` cap or label. A path that survives ONLY by firing the penalized spillover
counts identically to a path that survives cleanly. Concrete shape: T-X.2's golden master
(`rangeSuccessPct: 100`, `totalSpouseSpillover: 0` on its own deterministic walk) is unaffected, but a
household whose MEAN path is clean while some sampled paths dip into stress could show a success rate
that doesn't reveal how many of those "successes" were penalized rescues — exactly the caption gap
BUG-92 closed on the headline verdict, reopened here on the confidence driver's own number.
**Fix shape (sketched, not implemented):** thread a per-iteration spillover flag through
`runMonteCarlo` (e.g. `rows.some(r => r.spouseSpillover > 0)`) into a new rollup — a
`spilloverRate`-style field (fraction of paths that needed the hatch) — and surface it in `rangeView`
alongside `successPct`, mirroring how BUG-92's fix surfaced `totalSpouseSpillover` in
`calcWhatIfScenario`'s return. Deliberately NOT built in PR #64: it's new UI surface area (caption
wording, a threshold/color decision, applicability gating) of the kind this codebase's review
conventions defer for its own pass rather than bolting on under review-fix time pressure (see BUG-102/
BUG-84's same treatment).
**Where:** `src/model/monte-carlo.js` (`runMonteCarlo`'s return shape), `src/App.jsx` (`rangeView`),
`src/components/ArcGraph.jsx` (the caption, if a decision is made to surface it there).
**Inert whenever the escape hatch never fires** for a given household (the common case — golden
masters T-X.2/T-X.3 both have `totalSpouseSpillover: 0` on their own deterministic walk, though
individual sampled Monte Carlo PATHS under variance were not separately audited for this session).
**Not fixed here.** Filed for a future session, per the same in-PR triage discipline used throughout
this arc (fix what's small and contained, file what's a genuine separate product decision).

### BUG-102 — Lever-preview's spouse-gap gating is inherited from the BASE plan, not the scenario's own re-seeded maps — a retire-earlier preview can under-restrict relative to what Applying it actually produces (found 2026-07-27, interoperability review agent, PR #62)

**Owner:** me_theguy. **Severity: MEDIUM — a preview/commit disagreement, the same class as BUG-61/79/97
(three prior "the resim path silently drops something the main path has" bugs), not a headline-number
error at the default state.**
**What:** `calcWhatIfScenario`'s spouse-aware paths (BUG-77's re-seed, threaded through
`spouseSeedInputs`) correctly rebuild the spouse's gap-year contribution/income maps at the SCENARIO's
own retirement age when a lever preview shifts it (e.g. Plan's "Try a change" retire-2-years-earlier
dial) — verified by the interoperability audit to compose correctly with BUG-91's basis conversion, no
mismatch there. But `spouseRetirementAge` — the flag that actually ACTIVATES the Option-A hold-out and
BUG-88's penalized escape hatch inside the engine — reaches the scenario only via `...retPhaseBase`
(`src/App.jsx` `whatIfBundle`), where App gates it on `hasActiveSpouseGap` computed from the married
household's **committed** (base-plan) spouse-seed maps, not the scenario's re-seeded ones. A household
whose committed plan has no active spouse gap (`effectiveSpouseRetAge === retirementAge`, the common
default) gets `spouseRetirementAge: null` baked into every scenario preview — even a scenario that
itself creates a two-year gap by retiring the primary earlier. The dashed preview overlay and its
delta chip therefore show the household as if Option A never engages (no hold-out, no possible
BUG-92 verdict cap) — while clicking Apply commits the new retirement age, `hasActiveSpouseGap`
recomputes true on the next render, and the REAL committed walk now has the hold-out (and possibly the
escape hatch) active. The preview over-promises relative to what Applying it actually produces.
**Fix shape (sketched, not implemented):** derive the gate the scenario passes to
`spouseRetirementAge` from the SCENARIO's own re-seeded maps (mirroring how BUG-77 already re-seeds
`tradGrossSpouse`/the contribution maps for the scenario's retirement age) rather than inheriting
`hasActiveSpouseGap` computed at the base plan's age. Likely a new scenario-local
`hasActiveSpouseGapAt(scenarioRetAge)` helper alongside `buildSpouseRetirementSeed`, called from
`calcWhatIfScenario` wherever it currently spreads `...retPhaseBase`.
**Where:** `src/model/what-if.js` (`calcWhatIfScenario`'s `retPhaseBase` spread, the engine branch),
`src/App.jsx` (`hasActiveSpouseGap`, `whatIfBundle`'s `retPhaseBase`).
**Inert at the default state** (no spouse) and for any household whose base plan already has an
active spouse gap (the common case for a household with a real age difference) — only exposed by a
lever preview that ITSELF creates or removes a gap window relative to the committed plan.
**Not fixed here.** Filed for a future session; flagged by the interoperability audit as contained
(same file/function family as BUG-93's fix) but requiring its own verification pass, not a one-line
change made under review-fix time pressure.

### BUG-99 — Money events (Goals/LifeEventSheet) are entered/applied in nominal (today's) dollars against a retirement walk now denominated in retirement-year dollars (found 2026-07-27, BUG-91 fix-plan audit)

**Owner:** me_theguy. **Severity: MEDIUM (a real, systematic understatement of every retirement-phase
money event's impact, but bounded and easy to reason about — unlike BUG-91 itself, this doesn't flip
any headline verdict at the default state, since the default has no events).**
**What:** `applyMoneyEvents` (`money-events.js`), consumed directly by the retirement engine
(`retirement-engine.js`), applies a money event's dollar amount unchanged in whatever year it fires.
Now that BUG-91 has corrected the walk's spend/pension basis to retirement-year dollars, a retirement-
phase event (a $40k trip at 70, a duration event, etc.) is the one remaining quantity still entered and
applied in TODAY's dollars, understating its relative impact on the (now larger, correctly-denominated)
walk — e.g. a $40k trip that should cost ~$40k × the retirement-year conversion factor in the walk's own
units instead costs a flat $40k, reading as proportionally smaller against the corrected spend than it
actually is.
**Why not fixed alongside BUG-91:** money events have their own age-keyed semantics (one-time vs.
duration, `eventFirstAge`/`eventLastAge`, boundary-spanning events reaching both the accumulation sim
and the retirement walk) and their own established UI (Goals/LifeEventSheet) built on the assumption
that a dollar amount is a flat dollar amount at the age it fires — converting them to retirement-year
dollars requires deciding what "today's dollars" means for an event dated, say, 20 years in the future
(inflate from TODAY to the EVENT's own year, or to the primary's retirement year, matching BUG-91's own
base-year choice?) and reworking the LifeEventSheet's live verdict/impact copy to match. A genuine,
scoped follow-up, not a one-line fix.
**Fix shape (sketched, not implemented):** apply `toRetirementYearDollars` (or a duration-event
variant keyed to the event's own age, using the SAME primary-retirement-year base BUG-91/BUG-90 both
use) to a retirement-phase event's dollar amount before `applyMoneyEvents` folds it into the walk;
accumulation-phase events are unaffected (that phase isn't in the retirement-year frame at all).
**Where:** `src/model/money-events.js` (`applyMoneyEvents`, `eventNetForYear`), `src/model/retirement-engine.js`
(the `applyMoneyEvents` call site), `src/horizon/LifeEventSheet.jsx` (the verdict/impact copy that would
need to reflect the corrected magnitude).
**Not fixed here.** No code change; filed for a future session.

### BUG-100 — BUG-91's fix removes an offsetting error, so the pre-existing "tax brackets aren't inflated" simplification now bites at full strength (found 2026-07-27, BUG-91 fix-plan audit)

**Owner:** me_theguy. **Severity: LOW (a documented, accepted simplification whose magnitude changed —
not a new defect).**
**What:** the retirement engine has always taxed every draw against `TAX_DATA_2026`'s fixed brackets/
deduction, never inflated forward to match the walk's own retirement-year dollars (`docs/FINANCIAL-MODEL.md`
→ Known Simplifications already documents this, pre-dating BUG-91). Before BUG-91's fix, the
UNDERSTATED spend (today's dollars, unconverted) partially offset this — a too-small draw pushed against
brackets that were also, in effect, too-small relative to the walk's real frame, landing in roughly the
right bracket by accident. After BUG-91's fix, the draw is correctly sized but the brackets are not, so
the draw's marginal rate is now measured against 2026-dollar brackets even decades into retirement — the
full, undiluted effect of the pre-existing simplification. This is WHY `firstRMD`/`totalRMDs`/`rmdTaxBite`
at the golden-master default drop so sharply (a much larger, correctly-taxed draw drains the Traditional
401k far faster than the old understated-spend/understated-bracket combination did).
**Why not fixed alongside BUG-91:** inflating tax brackets/deductions/IRMAA thresholds/ACA FPL forward
through a multi-decade retirement walk is a genuinely separate, large piece of work (every `calcTax`/
`stackedIncomeTax` call site would need a per-year bracket table, not the fixed `TAX_DATA_2026` import),
already scoped out as a documented simplification before this session existed. BUG-91 did not introduce
it — it only removed an accidental, unrelated error that had been partially masking it.
**Considered-and-rejected alternative (recorded so it isn't re-litigated):** re-basing the ENTIRE walk to
TODAY's dollars instead (deflating the seed backward, rather than inflating spend/pension forward) would
have kept the draw and the fixed brackets in roughly the same accidental alignment — but it would break
BUG-90's already-locked `T-F3.2` seam-continuity test and move every displayed `totalAtRet`/RMD-schedule
balance to a today's-dollar figure, a far larger and more confusing display change (users expect
"Trad 401k: $2.1M" to mean the actual future balance, not a deflated today's-dollar equivalent). Forward
conversion (BUG-91's shipped approach) keeps all BALANCE displays unchanged and touches only the
spend/pension/SS-comparison inputs.
**Fix shape (sketched, not implemented):** a per-year inflated bracket/deduction table (index
`TAX_DATA_2026`'s brackets forward by the same `rReal`-implied inflation each walk year) used by
`calcTax`/`stackedIncomeTax` inside the retirement-phase code paths only (working-year tax stays on
today's brackets, correctly).
**Where:** `src/model/taxes.js` (`calcTax`, `stackedIncomeTax`), `src/model/retirement-engine.js` (every
`calcTax`/`stackedIncomeTax` call site), `docs/FINANCIAL-MODEL.md` → Known Simplifications (existing note,
needs a magnitude update).
**Not fixed here.** No code change; filed for a future session.

### BUG-101 — Accumulation-phase `contrib401k` (and other flat-dollar contribution inputs) stay nominal, understating real savings by retirement (found 2026-07-26, BUG-91's original filing; re-filed as its own scoped bug at BUG-91's close-out)

**Owner:** me_theguy. **Severity: LOW-MEDIUM (partially self-correcting — `contrib401k` already scales
with `incomeGrowth` each year via `runSimulation`'s `growFactor`, so it only understates in REAL terms
when `incomeGrowth < inflationRate`, e.g. the golden-master default's 3% vs. 4%).**
**What:** `contrib401k`/`contribRoth`/`contribTaxable`/`contribHSA` are entered as flat TODAY's-dollar
annual contributions; `simulation.js` grows the 401k contribution by `Math.pow(1+incomeGrowth/100,
years)` each year (matching salary growth) but never by inflation specifically — so whenever
`incomeGrowth` trails `inflationRate` (as it does at the shipped default), the contribution shrinks in
REAL purchasing power over the accumulation window, a smaller but real instance of BUG-91's same
"today's dollars fed into a real-terms walk" class.
**Why scoped out of BUG-91's own fix:** BUG-91's fix is specifically about the RETIREMENT WALK's basis
(`effectiveExpenses`/`effectivePension`, the frame `buildRetirementPhase`/`buildRetirementDrawdown`
use) — this is a different code path (`simulation.js`'s accumulation-phase per-year loop) with a
different, already-partially-correct mechanism (income-linked growth, not zero growth), and has no
single precise measured example the way the spend/pension mismatch did. Folding it in would have
broadened an already-large fix without a clear, isolated before/after to verify.
**Fix shape (sketched, not implemented):** decide whether `contrib401k` should track `incomeGrowth`
(current behavior — "contribute a fixed % of a growing salary") or be separately inflation-adjusted
("maintain constant real savings regardless of salary growth") — a genuine product/design decision, not
a pure bug fix, since both are defensible models of how a person actually sets their contribution.
**Where:** `src/model/simulation.js` (the `growFactor`/`clockYears` per-year contribution scaling).
**Not fixed here.** No code change; filed for a future session.

### BUG-85 — Spouse Roth/Taxable/HSA gap-year contributions treated as spent, not tracked (filed 2026-07-25, BUG-82 fix session — v1 scope decision)

**Owner:** me_theguy. **Severity: LOW-MEDIUM (smaller, weaker-rationale dollar impact than BUG-82).**
**Found by:** the BUG-82 implementation planning pass, as a deliberate v1 scope boundary rather than
an oversight.
**What:** the BUG-82 fix (see Resolved, below) models the spouse's gap-year Traditional 401k
contributions in full (a dedicated held-out bucket, `tradSp`/`tradGrossSpouse`, with its own
gap-contribution map and Option-A draw gate). It does NOT do the same for Roth IRA, Taxable, or HSA
gap-year contributions — those three account types stay merged into the shared household pools
(`roth`/`taxable`/`hsa` on `retPhaseBase`), which are seeded once at the PRIMARY's retirement and
never see the spouse's own further contributions during the gap. `buildSpouseRetirementSeed` already
computes `rothSeed`/`taxableSeed`/`hsaSeed` (the seed values at the primary's retirement) but nothing
downstream re-grows them for the gap years the way `spouseContribByAge` re-grows `tradSp`.
**Why deferred, not fixed alongside BUG-82:** the dollar impact is real but structurally smaller —
Roth/Taxable/HSA contribution limits are far lower than the 401k's, and money that would have gone
into those accounts during the gap is (in v1) simply treated as spent, which is dollar-conserving (no
money is lost or double-counted, it just isn't credited to the household's future balance) rather than
wrong in the way the pre-fix BUG-82 was wrong (silently vaporizing $2.38M of real 401k growth). Adding
full parity requires three more held-out buckets (`rothSp`/`taxableSp`/`hsaSp`) mirroring `tradSp`,
each with its own gap-contribution map, draw gate, and merge-at-`spouseRetAge` — a genuine feature
addition, not a quick follow-up patch.
**Fix shape:** mirror the `tradSp` mechanism (`retirement-engine.js`/`retirement-phase.js`) for the
other three account types: extend `buildSpouseRetirementSeed` to return
`spouseRothContribByAge`/`spouseTaxableContribByAge`/`spouseHsaContribByAge` (the seeds already exist
as `rothSeed`/`taxableSeed`/`hsaSeed`), thread them into `buildRetirementWalkByAccount` as three more
held-out buckets with the same Option-A draw gate, and update the conservation/reconciliation surfaces
(Flow-Down, Year-by-year ledger, Journey) that BUG-82's Step 5 already extended for `tradSp` to cover
the new buckets too.
**Where:** `src/model/retirement-phase.js` (`buildSpouseRetirementSeed`), `src/model/retirement-engine.js`
(`buildRetirementWalkByAccount`).
**Inert at default state:** no spouse data → no effect. Golden master untouched.
**Re-verified 2026-07-26 (BUG-82/88/89/90 + 3-agent-review session close-out):** `buildSpouseRetirementSeed`
(`retirement-phase.js`) still returns only `rothSeed`/`taxableSeed`/`hsaSeed` as one-time seed values
(the `"v1: merged into the hh pools unchanged"` comment is still literally there) with no per-age
contribution map for any of the three — confirmed against current code, which this session touched
substantially (BUG-90 added an `inflationRate` deflation param to the SAME function, and BUG-97's fix
re-seeds these three fields on a what-if resim) without changing this scope boundary. Still open,
unchanged.
**Forward-compat note (2026-07-27, PR #62 review battery):** an Opus forward-compatibility audit
flagged that `tradSp` is threaded as a bare scalar through ~20 sites in `retirement-engine.js` (growth,
spouse RMD, contribution, `spouseDrawable`/`spouseHoldout`, BUG-88's grossed-up penalized spillover
with its rollups and row fields, `balStart`/`balEnd`, the `tradSpouse` output) — three more buckets
means three more copies of that apparatus, and the spillover hatch is Traditional-specific by
construction (ordinary tax + 10% penalty), so a Roth/Taxable spillover needs different tax rules and
will fork it further. Recommendation for whoever picks up BUG-85: refactor `tradSp` into a keyed
held-out-bucket structure BEFORE adding the other three buckets, and decide each bucket's own spillover
tax rule up front, rather than copy-pasting the scalar pattern three more times.

### BUG-84 — Withdrawal-order + conversion-sim scalars (`retTrad`/`retRoth`/`retTaxable`) stayed primary-only after #30 (found 2026-07-23, CodeRabbit review of PR #57 commit 325eaad)

**Owner:** me_theguy. **Found by:** CodeRabbit, flagged "🟠 Major / 🏗️ Heavy lift" — correctly not
proposed as a quick fix.
**What:** `retTrad`/`retRoth`/`retTaxable` (`src/App.jsx:463-465`, `= tradGrossAtRet / pRoth /
pTaxable`) remained the PRIMARY-only balances even after #30 made `retVals`/`totalAtRet` household.
They feed `calcWithdrawalOrderTax` (`src/App.jsx:961`, the Strategies "Withdrawal order" card's
year-1 tax-optimal-vs-worst-case comparison), `conversionSim`'s inputs (`src/App.jsx:1033,1039`),
and the Classic UI's withdrawal-order display ("$X available" per step, `src/App.jsx:4215-4217`).
**Why this is a real design question, not a quick patch:** unlike BUG-79/80 (a scalar or a chart
that should obviously have summed household balances), Roth conversions and withdrawal sequencing
are legally **per-account, per-person** — you cannot convert a spouse's 401k into the primary's
Roth IRA, and the IRS taxes each spouse's withdrawals against their own account, even though the
household files one joint return. Two candidate fix shapes, needing an owner call:
  1. **Pool for display, sequence per-person for real draws** — show household totals in the
     "$X available" step cards (matching `retVals`), but keep `calcWithdrawalOrderTax`'s actual
     recommended draw sequence and `conversionSim` scoped to the primary's own accounts (a
     conversion event is inherently one person's).
  2. **Model the spouse's own withdrawal order as a parallel, separate sequence** — a more complete
     but larger change: the spouse gets their own tax-optimal-vs-worst-case comparison, since their
     marginal bracket exposure during a shared MFJ return is genuinely different account-by-account.
**Related:** sibling gap to BUG-77 (spouse Traditional bucket frozen through a what-if re-sim,
**resolved** 2026-07-25 — see Resolved) — both were "the spouse engine didn't reach every downstream
consumer" gaps found by review after the initial #30 ship.
**Interim relabel already shipped (2026-07-25, BUG-82 fix session, Batch 1):** the withdrawal-order
card (`withdrawalView.scopeNote`, both Horizon's `WithdrawalOrderFlow.jsx` and the Classic display)
now notes "these amounts are your own accounts; your spouse's accounts sequence separately" in a
spouse household, so the primary-only scope is at least honestly labeled while this design question
stays open. Copy-only — the underlying per-person-vs-pooled question above is unchanged.
**Where:** `src/App.jsx:463-465` (the scalars), `:961` (`calcWithdrawalOrderTax` call), `:1033,1039`
(`conversionSim`), `:4215-4217` (Classic display).
**Inert at default state:** no spouse data → no effect. Golden master untouched.
**Addendum (2026-07-26, adversarial-review three-findings pass, ND-3):** `calcRMDIncomeFloor`
(`retirement-tax.js:23`, `rmdIncomeFloor` at `App.jsx:667`) is also spouse-blind, and is *reachable*
while a spouse still works — `spouseRetAgeMax = lifeExpect − 1`, so a younger spouse can still be
mid-gap at the primary's own RMD age (e.g. a spouse 10 years younger retiring at 67 while the primary
is 73). Its only consumer is `calcWithdrawalOrderTax` (`App.jsx:1055`), already scoped "your accounts"
by this entry's interim relabel above — the retirement ENGINE computes the actual RMD tax itself and
does not use this floor. Documented here rather than patched, so the two primary-only surfaces are
resolved together whichever fix shape (1 or 2, above) the owner picks. No code change.
**Owner decision (2026-07-27, Step 6 of the spousal-engine stabilization session):** stay deferred —
confirmed as a genuine scope decision, not a quick patch. Verified while explaining the sizing to the
owner: `calcWithdrawalOrderTax`/`evaluateConversionPlan` are both small functions that already reuse
the ONE retirement engine's output as input (not a second multi-decade simulation to build) — the
expensive part (growth, RMDs, the spouse's held-out bucket) is already shared. But fix shape 2 (the
spouse's own sequence) is **coupled to BUG-85**, not independent of it: sequencing the spouse's own
Trad/Roth/Taxable/HSA draw order needs separately-tracked spouse Roth/Taxable/HSA buckets, which don't
exist yet (only `tradSp` is split out). Recommend fixing BUG-85's buckets first; option 2 becomes a
smaller add-on once they exist. Noted on `feature-tracker.html`'s #30 entry.

### BUG-36 — What-if / optimized deltas not yet on the taxed-once engine (accepted, low)

**Found:** 2026-06-15 (BUG-35 follow-up, surfaced in PR #32 review). **Owner:** me_theguy.
**What:** `what-if.js` (`calcWhatIfDelta` / `calcWhatIfScenario`) and `calcOptimizedScenario`
still walk the retirement phase with the blended `buildRetirementDrawdown`, fed engine-consistent
tax maps on the gross basis. They do **not** charge the per-year spending-draw tax the per-account
engine (`buildRetirementWalkByAccount`) now does, so what-if **deltas** and the optimizer's
candidate scoring are slightly less tax-honest than the headline they sit next to.
**Why it's accepted, not blocking:** the headline (`yearsSustained`, chart, Flow-Down, RMD,
conversion benefit) is fully on the engine; only the *comparative* overlays lag, and the gap is the
spending-draw tax, which is small relative to the deltas being compared.
**Related (same root — inline event handling off the shared helper):** `runSimulation`
(accumulation) and the blended what-if walk still inline only the money-event portfolio sign and do
**not** charge income tax on a flagged *taxable inflow* (`applyMoneyEvents.taxableIncomeAdjustment`).
The retirement **engine** (the headline source) now does charge it — fixed 2026-06-15. Accumulation's
working-year tax basis is computed once on regular income, so per-year event income tax there is a
separate, deliberate extension.
**Update (2026-06-24, conversion-timing PR #39):** working-year **Roth-conversion** events ARE now
taxed per-year in `runSimulation` (ordinary tax + under-59½ penalty, `conversion-events.js`), and the
what-if re-sim threads them through `whatIfSimInputs`, so conversion events are *outside* this gap.
The remaining BUG-36 gap is (a) the retirement-phase **delta** still using the blended walk, and (b)
`moneyEvents` taxable-inflow income tax still uncharged in accumulation / the blended walk.
**Fix path:** migrate both to `buildRetirementPhase`/engine (planned with the Level-3 Strategies
work). Tracked here so the gross-basis headline vs. blended-overlay split stays owned.
**Re-verified 2026-07-08 (L3c close-out):** `what-if.js` and `optimization.js` still import and
call `buildRetirementDrawdown` exclusively — still reproduces. Note: this session's WI-3.9 Apply
preview for the conversion optimizer suggestion deliberately does **not** use `calcWhatIfDelta` —
it runs `buildRetirementPhase` directly (the engine itself), sidestepping this gap for that one
new surface rather than closing it generally. `calcWhatIfDelta`/`calcOptimizedScenario` themselves
are unchanged.
**Re-verified 2026-07-09 (L3d close-out) — still reproduces, and scope grew.** `calcWhatIfDelta`
still calls `buildRetirementDrawdown`, not the engine (confirmed against current `what-if.js`).
Unlike WI-3.9's conversion Apply (above), **L3d's two new Apply-with-preview sites (`surplusApplySite`,
`buildScenarioCommitSite`) both use `calcWhatIfDelta`**, not the engine — so this batch added two
more consumers of the blended-walk gap rather than closing it, an explicit, reviewed tradeoff (the
"Fix path" below — migrate to `buildRetirementPhase` — wasn't in scope for this batch; the surplus
candidate is a contribution-rate change, which the engine's per-account walk doesn't yet accept as
an override the way the conversion optimizer's `buildConversionByAge` override does). Both new
sites are internally consistent (their own "current" and "candidate" both use the same blended
mechanism, so no divergence *within* a site) — the gap is only the blended-vs-engine comparison
this bug already tracks. `docs/ARCHITECTURE.md`'s `buildSurplusPreview` note now states this
honestly in its `note` field, shown to the user in the preview itself.
**Scope NARROWED 2026-07-20 (moneyEvents extension):** the "retirement-phase **duration-event
income** is untaxed" strand of this bug is now **closed on the headline path**. `applyMoneyEvents`
(`money-events.js`) adds every event's prorated `eventIncomeForYear` to `taxableIncomeAdjustment`,
and the per-account engine (`buildRetirementWalkByAccount`) already taxes that as ordinary income
stacked on the SS/pension floor (`inflowTax`). Since the engine is the source for the chart,
longevity, Flow-Down, and RMD/conversion numbers, a duration event's retirement-phase side income
(part-time work, etc.) is now taxed once there. The **remaining** BUG-36 residual is unchanged and
purely the *blended-walk comparison* surfaces: `calcWhatIfDelta` / `calcOptimizedScenario` (and the
blended `buildRetirementDrawdown` fallback) still don't charge the per-year spending-draw tax or the
event-income tax — `buildRetirementDrawdown` consumes `eventNetForYear` directly and never calls
`applyMoneyEvents`, so it is deliberately outside this fix. Inert at the default state (no events →
golden master untouched); users WITH retirement event income now see honest (slightly lower)
headline numbers.
**Correction (2026-07-12):** `buildScenarioCommitSite` (Ideas' "make this scenario my plan") was
retired the same day it merged into the arc-event-placement branch — it backed the locked
"Scenarios" preset cards, which the owner had separately decided to retire that same day (see the
BUG-44 addendum below). `surplusApplySite` is unaffected and remains a live `calcWhatIfDelta`
consumer.
**Re-verified 2026-07-15 (post PR #54 close-out) — still reproduces.** `calcWhatIfDelta`
(`what-if.js:225-395`) still calls `buildRetirementDrawdown` at lines 303/313; `optimization.js:79`
unchanged. PR #54 added new exports (`verdictForScenarioResult`, `eventFundingShortfall` fields)
but touched neither function's retirement-walk call — the gap is unchanged in both location and scope.
**Scope note (2026-07-10, life-event placement build):** `runSimulation` and
`buildRetirementDrawdown` no longer inline the event sign — both now call the shared
`eventNetForYear` (`money-events.js`), which also splits the new **duration events** ("$X/mo for
N months") across their active years. The tax gap itself is unchanged: both still consume only the
portfolio adjustment and charge no income tax on taxable inflows (the engine remains the only walk
that does), and duration events are untaxed **by design everywhere** (documented in
`money-events.js` — their `incomeAnnual` offset is treated as after-tax cash). Still open.
**Scope narrowed (2026-07-11, overlay-continuity fix, Step 0 of the arc-event-placement plan):**
`calcWhatIfScenario` (`what-if.js`) — the model behind the Ideas/Plan arc overlay, the life-event
sheet's verdict (`evaluateLifeEvent`), and `calcWhatIfChart` — now walks the retirement phase with
`buildRetirementPhase`, the SAME per-account, taxed-once engine the main chart uses, whenever the
bundle App.jsx passes (`whatIfBundle`/`horizonProps.whatIfSimInputs`) carries the new
`retPhaseBase`/`conversionByAge`/`baseChart`/`addlPreTaxBal` fields (App.jsx always supplies them;
a bundle without `retPhaseBase` falls back to the old blended walk, kept only for unmigrated
callers/tests). Root cause this fixed: the overlay was walked with a *different* model than the
solid line, so even a no-change scenario's dashed overlay didn't sit exactly on the chart — now it
does (locked by an invariant test: a no-op scenario's `chart` deep-equals App's own
`totalChartData`). Side effect: `calcWhatIfScenario`'s returned `chart` now covers the **full
lifetime** (accumulation + retirement), not just the retirement phase, so the overlay is drawn
end-to-end. The remaining BUG-36 gap **narrows** to `calcWhatIfDelta`, `calcAffordabilityMax`, and
`calcOptimizedScenario` — all three still call `buildRetirementDrawdown` directly and were
deliberately left untouched by this fix (their signatures don't carry the engine bundle). Files:
`src/model/what-if.js` (`calcWhatIfScenario` only), `src/App.jsx` (`whatIfBundle` memo).
**Scope narrowed further (2026-07-11, fix pass 2):** `calcAffordabilityMax` moved onto the engine —
it now takes the `calcWhatIfScenario` bundle shape and probes sustainability with
`calcWhatIfScenario(bundle, { scenarioEvents: [candidate] })` (the same primitive
`evaluateLifeEvent` uses), instead of binary-searching over the blended `calcWhatIfDelta`. Reason:
a future affordability-solver UI sitting on the old blended walk would have silently disagreed with
what the arc already shows for the same candidate purchase. Classic's `WhatIfPanel` (the only
caller) now receives a `whatIfBundle` prop for its Max Affordable mode; Delta mode is unchanged
(`calcWhatIfDelta`, still blended). The remaining BUG-36 gap is now just `calcWhatIfDelta` and
`calcOptimizedScenario`. Files: `src/model/what-if.js` (`calcAffordabilityMax`),
`src/components/WhatIfPanel.jsx` (new `whatIfBundle` prop), `src/App.jsx` (passes it). Existing
`calcAffordabilityMax` test assertions were loose (non-negative/non-positive directional checks) and
held unchanged across the migration; 2 new tests added (invalid-bundle guard, an engine
self-consistency check).
**Re-verified 2026-07-12 (session close-out, PR #52):** `calcWhatIfDelta` (what-if.js) still calls
`buildRetirementDrawdown` (now at lines 145/155, shifted by this session's `deltaYearsFrom` helper
addition); `optimization.js`'s `calcOptimizedScenario` still calls it too (line 79). Scope
unchanged. This session's `what-if.js` changes (BUG-66 `surplusApplySite` moneyEvents fix, BUG-71
`addlPreTaxBal` fallback-path fix, `deltaYearsFrom` dedup) all touched the blended-walk call sites'
*correctness* (basis consistency, dropped inputs) without migrating them onto the engine — none of
them close this gap, they just make the blended walk less wrong in isolation. Still reproduces.
**Re-verified 2026-07-23 (PR #57 session close-out):** `calcWhatIfDelta` (now `what-if.js:227` on)
still calls `buildRetirementDrawdown` at lines 316/326; `optimization.js:79` unchanged. This
session's `what-if.js` edits (the BUG-75 additions-only `moneyEvents` contract, the BUG-79
spouse-trad scalar fix, the new `calcWorkLongerBreakEven`) all touched call sites of the blended
walk without migrating any of them onto the engine — same pattern as the 2026-07-12 note. Still
reproduces, scope unchanged.
**Widened by one dimension (2026-07-26, PR #59 CodeRabbit review-fix round — flagged, not fixed).**
BUG-82's rule-5 wiring (`docs/BUGS.md` → BUG-82, Resolved) made `calcOptimizedScenario`'s `optWR`
spouse-aware (`optNetNeed` now subtracts `spouseIncomeAtRet`), but `optYS` — the optimizer's
years-sustained figure — still runs `buildRetirementDrawdown`, which has no spouse-income parameter
at all. Before this PR the two were CONSISTENTLY blind to spouse income together; now they can
disagree specifically for a spouse-gap household (a lower `optWR` with no matching improvement in
`optYS`). CodeRabbit caught this; verified real, left unfixed with the same reasoning as the rest of
this bug — both proposed fix shapes (route `optYS` through `buildRetirementPhase`, or extend
`buildRetirementDrawdown` with a per-year spouse-income map) are genuine architecture changes to a
walk shared by `calcWhatIfDelta`/`calcAffordabilityMax` too, not a spot patch. Fold into the
eventual migration this bug already tracks rather than special-casing the spouse dimension.
**Widened again by Session B (2026-07-28, PR #64, interoperability audit — flagged, not fixed.)**
Porting the Monte Carlo Range lens onto the per-account engine means the accuracy spread this bug
tracks is now the widest it has ever been: the engine side now includes the chart, `yearsSustained`,
RMD schedule, Flow-Down, conversion benefit, AND the Range lens's `successPct`/bands, while the
blended-walk side (`calcWhatIfDelta`, `calcOptimizedScenario`, `drawdown.js`) is unchanged. Concrete
shape: for an MFJ household where the primary retires several years before the spouse, the Horizon
Range view can show 100% confidence (spouse bucket, hold-out, and draw tax all modeled) while
Classic's What-If "retire N years earlier" delta panel — which still calls `calcWhatIfDelta` — runs a
walk with no spouse bucket, no hold-out, and no spending-draw tax, for the SAME household. Not a new
mechanism, the same one this bug has tracked since 2026-06-15 — but the Monte Carlo port raises the
stakes of leaving it unfixed, since a user comparing the Range view against a What-If delta for the
same plan now sees the largest accuracy gap between the two the app has ever presented. No fix
shape change; still tracked here, not split into a new bug number.

### BUG-37 — Engine ignores `conversionTaxSource` (accepted, owner-deferred 2026-06-15)

**Owner:** me_theguy. **What:** the per-account engine always funds Roth-conversion tax from the
pool (Taxable first) and moves the **full** converted amount to Roth — i.e. it behaves as
`conversionTaxSource === "taxable"`. The UI toggle defaults to **"converted"** (pay the tax out of
the converted amount, so less lands in Roth), so at the default setting the engine and the toggle
disagree. The old `calcConversionSim` (still used for the conversion *schedule* display) does honor
the toggle. **Why deferred:** honoring "converted" in the engine would move the golden master at
default (yearsSustained, netConversionBenefit) and is a deliberate modeling change; the current
full-to-Roth/tax-from-taxable behavior is a defensible default. **Fix path:** thread
`conversionTaxSource` into `buildRetirementWalkByAccount` and, for "converted", credit Roth with
`conversion − convTax` instead of pulling the tax from the pool. Owner-approved to defer so PR #32
can close.
**Re-verified 2026-07-08 (L3c close-out):** `conversionTaxSource` still does not appear anywhere in
`retirement-engine.js` or `retirement-phase.js` (confirmed via search — zero matches); the engine
still unconditionally behaves as `"taxable"`. Still reproduces; this session's WI-3.6 flow surfaces
the toggle (writes through the `conversion` setter bundle, honored only by the display-path
`calcConversionSim`) with an explicit honesty note in `ConversionPlannerFlow.jsx` pointing at this
gap, rather than silently implying the toggle changes engine behavior.
**Re-verified 2026-07-09 (L3d close-out):** `conversionTaxSource` still zero matches in
`retirement-engine.js`/`retirement-phase.js`. Still reproduces; neither file was touched by this
session's WI-3.7/WI-3.8 build (which worked in `what-if.js`, `apply-preview.js`, App.jsx wiring,
and Horizon screens — not the engine).
**Re-verified 2026-07-12 (session close-out, PR #52):** still zero matches for
`conversionTaxSource` in `retirement-engine.js`/`retirement-phase.js`. Still reproduces; neither
file was touched this session.
**Re-verified 2026-07-23 (PR #57 session close-out):** still zero matches for `conversionTaxSource`
in either file (grep-confirmed against current HEAD, after this session's #30 + moneyEvents-
extension edits to `retirement-engine.js`). Still reproduces, scope unchanged.
**Re-verified 2026-07-26 (BUG-82/88/89/90 + 3-agent-review session close-out):** still zero matches
for `conversionTaxSource` in either file (grep-confirmed against current HEAD, after this session's
spouse-engine hold-out/spillover/gap-year-map work in both files). Still reproduces, scope unchanged.

### BUG-38 — Engine doesn't charge the base tax on the SS/pension floor (found 2026-06-15, PR #32 review)

**Owner:** me_theguy. **Found by:** Gemini. **What:** the engine charges only *incremental* tax
above the SS/pension income floor — the per-year `tax` telescopes to `tDraw − tFloor` (+ state), so
the federal tax on the taxable SS + pension itself (`tFloor`) is never charged. Because `needed` is
reduced by **gross** SS/pension (`effectiveExpenses − ssCash − penCash`), the model effectively
treats SS/pension as tax-free, understating lifetime tax and overstating chart longevity in stressed
(under-funded) scenarios. **Why not a quick drop-in:** the *correct* fix isn't simply "always add
`tFloor`" — in **over-funded** years (SS + pension > expenses) the income **surplus**, not the
portfolio, should pay that floor tax, so a blind add would over-charge there. The clean form is to
fund `max(0, expenses + totalTax − grossSS − grossPension)` from the portfolio (income surplus
absorbs tax first). **Golden-master impact:** the locked headline scalars (`rmdTaxBite`,
`netConversionBenefit`, `firstRMD`, `totalAtRet`, `yearsSustained`) are all incremental/pre-walk and
do **not** move; only the chart trajectory / depletion in stressed cases shifts. **Status:**
owner-deferred so PR #32 can close; pre-existing simplification (the old blended walk also used
incremental tax maps). **Fix path:** restructure the per-year funding to net external income against
total tax before drawing from the pool.
**Where:** `src/model/retirement-engine.js` — the tax fixed-point at ~L149–163 (`tFloor` computed at
L150 then subtracted out by the telescoping components); `needed` at ~L132 (`effectiveExpenses −
ssCash − penCash + eventOutflow`). A `floorTax = tFloor` component would be added to `tax`, gated so
the income surplus absorbs it first.
**Re-verified 2026-07-08 (L3c close-out):** both line references confirmed exact — `tFloor` still
at line 150, `needed` still at line 132. Still reproduces; `retirement-engine.js` was not touched
by this session's build.
**Re-verified 2026-07-09 (L3d close-out):** `tFloor` still at line 150 (unchanged since 2026-07-08).
Still reproduces; `retirement-engine.js` was not touched by this session's build.
**Re-verified 2026-07-12 (session close-out, PR #52):** `tFloor` still at line 150, `needed` still
at line 132 — unchanged since 2026-07-08. Still reproduces; `retirement-engine.js` was not touched
this session.
**Re-verified 2026-07-23 (PR #57 session close-out) — still reproduces, line numbers shifted, scope
grew slightly.** This session's #30 (spouse) and moneyEvents-extension batches both touched this
file substantially: `floor` is now at line 161, `needed` at line 178, `tFloor` at line 201 (still
`calcTax(floor, filingStatus).tax`, still only used as a subtracted telescoping baseline —
`inflowTax = (tInflow − tFloor) + …`, line 205 — never itself added to `tax`, confirmed by reading
the full tax-assembly block through line 216). The floor itself is now `(SS if claimed) + (pension
if started)` — unchanged shape — but the moneyEvents extension added `taxableIncomeAdjustment`
(event/spousal-inflow ordinary income) stacked on TOP of `floor` via `incFloor = floor +
taxableIncomeAdjustment` (line 197): that income is taxed as an increment above the floor as
designed (correct — see BUG-36's 2026-07-20 narrowing note), but it means the untaxed base this bug
describes is still exactly the SS/pension floor, now sitting under one more stacked layer than
before. No change to this bug's scope or fix path.
**Re-verified 2026-07-26 (BUG-82/88/89/90 + 3-agent-review session close-out) — still reproduces,
line numbers shifted, and BUG-82's spouse gap-year income joined the untaxed floor rather than
staying an increment above it.** This session's spouse hold-out/spillover engine work
(`retirement-engine.js`) shifted the tax fixed-point block: `needed = (spendNeed - spouseApplied) +
eventOutflow` now at line 249; `incFloor = floor + taxableIncomeAdjustment` now at line 284; `tFloor
= calcTax(floor, filingStatus).tax` now at line 288. `tFloor` is still used only as a subtracted
baseline inside `inflowTax = (tInflow - tFloor) + …`; it is never itself added to `tax` — unchanged.
**New wrinkle:** `floor` itself (line 221-223) is now `(SS if claimed) + (pension if started) +
spouseWages` — the spouse's gap-year wages are folded directly into the untaxed floor baseline
(same term `tFloor` subtracts out), not into `taxableIncomeAdjustment` (which stays the
money-events-only term feeding `incFloor`). So this bug's scope grew by exactly one more income
source: SS, pension, AND the spouse's gap-year wages are all now effectively tax-free in the engine's
per-year math, not just SS/pension as originally filed. No change to the fix path (the clean-form
fix already named — fund `max(0, expenses + totalTax − grossSS − grossPension)`, extended for this
session's work to also subtract the spouse's gross gap-year wages — would need to move `spouseWages`
out of `floor` and into a `floorTax` component the same way SS/pension would be).

### BUG-39 — Flow-Down *accumulation* growth is a residual plug, not Σ(row.growth) (found 2026-06-15, PR #32 review)

**Owner:** me_theguy. **Found by:** CodeRabbit (cites CLAUDE.md rule 2b). **What:** `calcFlowDown`
computes the accumulation-phase growth as `totalAtRet − startPortfolio − totalContrib` (a residual),
whereas rule 2b requires Flow-Down growth to be the **independent sum `Σ(row.growth)`** so a forgotten
flow can't hide in it. The retirement-phase growth (`distGrowth`/`convWindowGrowth`) already follows
the rule; only the accumulation node lags. Pre-existing (predates BUG-35) and inert at the default
state (no accumulation money events → residual ≈ Σ(growth)). **Fix path:** `totalGrowth =
Σ(contribRows[].growth)` (the simData rows already carry per-year `growth`), and verify negative real
growth + reconciliation as separate assertions. Deferred so PR #32 can close.
**Where:** `src/model/flow-down.js:34` (`const totalGrowth = totalAtRet − startPortfolio −
totalContrib`, line ref trued 2026-07-08 close-out — was :31, shifted by unrelated additions
elsewhere in the file). Contrast with the in-file `sumGrowth(rows)` used for
`convWindowGrowth`/`distGrowth` (the rule-2b-correct pattern). Test fixture in `flow-down.test.js`
would need `growth` on its `contribRows` rows. **Note:** the round-4 "remove the `Math.max(0,…)`
clamp" fix is *on top of* this residual — removing the clamp let negative real growth through, but
the value is still a residual. **Re-verified 2026-07-08 (L3c close-out):** still reproduces exactly
as described; this session's build never touched `flow-down.js`.
**Re-verified 2026-07-09 (L3d close-out):** `totalGrowth` still the residual formula at line 34.
Still reproduces; `flow-down.js` was not touched by this session's build.
**Re-verified 2026-07-12 (session close-out, PR #52):** `totalGrowth` still the residual formula at
line 34, unchanged. Still reproduces; `flow-down.js` was not touched this session.
**Re-verified 2026-07-23 (PR #57 session close-out):** `totalGrowth` still the residual formula at
line 34, unchanged. Still reproduces; `flow-down.js` was not touched by any of this session's six
batches or the review-fix rounds.
**Re-verified 2026-07-26 (BUG-82/88/89/90 + 3-agent-review session close-out):** `totalGrowth` still
`totalAtRet - startPortfolio - totalContrib` — the residual formula — now at line 51 (shifted by this
session's BUG-82 Step 5 reconciliation work, which extended the file's retirement-phase rows with
spouse contribution/spillover fields but left the accumulation-phase `totalGrowth` node itself
untouched). Still reproduces; still inert at the default state (no accumulation money events).

> **BUG-36 / BUG-37 / BUG-38 / BUG-39 — shared re-verification, 2026-07-17 (PR #56 close-out):**
> all four are engine/model-scope deferrals, and PR #56's entire diff touches only
> `apply-preview.js` + `action-cards.js` in `src/model/` (git-diff-confirmed: `what-if.js`,
> `retirement-engine.js`, `retirement-phase.js`, `flow-down.js`, `optimization.js` all
> byte-untouched). All four remain open exactly as documented.

---

## Resolved Issues

---

### BUG-49 — Primary Horizon navigation and most nav/shell controls were unreachable by keyboard (found 2026-07-09, Fable UI review of PR #51; fixed 2026-08-03, Horizon design-review Slice 2)

**Owner:** me_theguy. **Severity: MEDIUM (a11y, broad) — a keyboard-only user could not change
Horizon screens at all, on either viewport, and could not complete first-run setup.**
**Found by:** a Fable agent's adversarial UI/UX review of the Horizon shell. Re-verified as still
reproducing at five separate session close-outs (2026-07-12 ×2, 07-17, 07-23, 07-26), each time by
hand — the scope narrowed twice as `IdeasScreen.jsx` was redesigned and then deleted, but the
`HorizonShell.jsx` nav-shell portion never moved.
**What (as last verified, pre-fix):** `TabBar` (`:143`) was `<div key={id} onClick={…}>` with no
`tabIndex`/`onKeyDown`; the mobile bottom bar's four screen tabs (`:614`) and its **More** tab
(`:630`) were the same; `MoreSheet`'s rows (`:475`) were the same — and on mobile that sheet is the
ONLY route to Someday / My details / Settings, so three whole screens had no keyboard path at all.
`OnTrackPill`'s trigger (`:82`) carried `role="button"` but neither `tabIndex` nor `onKeyDown` (worse
than a plain div: announced as a button, then unusable), and its ✕ (`:111`) the same. The entire
first-run onboarding wizard — both ± steppers, back, next, "Save as my plan", and both skip links
(`:349, :352, :369, :371, :376, :382, :389`) — was `<div>`/`<span onClick>`, so a keyboard user could
not get past the first question. Outside the shell: `SettingsScreen`'s activity pills (`:100`) had no
keyboard path (its other three groups already carried `kbActivate`), and `SomedayScreen`'s
photo-upload well (`:45`) and activity chips (`:138`) had none.
**Why it stayed open for a year:** nothing checked it mechanically. Each re-verification had to
re-read the shell by hand, and every newly authored `<div onClick>` silently re-opened it. The
entry's own fix path names the missing piece — *"a render-smoke-style test asserting every clickable
surface has a keyboard path"* — which is what finally shipped alongside the fix.
**Fix:** every site above is now a real `<button type="button">` (or, in the one case where it
genuinely cannot be — `SomedayScreen`'s full-bleed photo well, which wraps an `<img>`, an `<svg>` and
absolutely-positioned children — `role` + `tabIndex` + the existing `kbActivate` Enter/Space
handler). Most route through the new shared `Btn`/`Pill` primitives (`src/horizon/shared.jsx`), whose
semantics are modelled on `ExploreTray.jsx:40` — the one pre-existing site that got BOTH the border
trick and the button semantics right. **`TabBar` was deliberately NOT used as the exemplar** even
though the design review originally cited it: it was itself one of the unreachable `<div onClick>`s,
and copying it would have baked this bug into every future call site permanently.
Two structural side-effects worth naming: the mobile bar and the desktop tab bar are now
`<nav aria-label="Main">` landmarks with `aria-current="page"` on the active tab, and every toggle
carries `aria-pressed` driven by the SAME prop as its visual state (`Btn`'s `pressed`), so the two
cannot disagree.
**Tests:** new `src/__tests__/keyboard-access.test.js` (4). It mounts the REAL app, walks every
screen in `SCREENS` at **both** 1200px and 390px (the mobile bar and More sheet only exist under
640px, and they were the worst offenders), and fails on any host element with an `onClick` that is
neither a native control nor `role`+`tabIndex`+`onKeyDown`. Two exemptions, both declared **on the
element** rather than hard-coded in the test: `data-dismiss-backdrop` (a modal backdrop, whose
keyboard equivalent is Escape — see BUG-50) and `role="dialog"` (the card's `stopPropagation`
guard). Separate cases assert the bottom bar renders five real buttons, the More sheet renders three,
and that the onboarding wizard can be walked end-to-end — including the confirm dialog it raises —
with no unreachable control at any step. **Revert-and-confirm:** reverting just the mobile bar's five
tabs to `<div onClick>` fails the 390px sweep with 28 offenders and the bottom-bar case with
`length 1, expected 5`; restored, green.
**Golden master:** untouched — layout/semantics only, no model value moves.
**Where:** `src/horizon/shared.jsx` (`Btn`/`Pill`), `src/components/HorizonShell.jsx` (`TabBar`,
`OnTrackPill`, `MoreSheet`, the mobile bar, the whole onboarding wizard, "Classic view"),
`src/horizon/ExploreTray.jsx`, `src/horizon/ConfirmModal.jsx`, `src/horizon/LifeEventSheet.jsx`,
`src/horizon/screens/PlanScreen.jsx`, `src/horizon/screens/SettingsScreen.jsx`,
`src/horizon/screens/SomedayScreen.jsx`, `src/__tests__/keyboard-access.test.js`.

### BUG-50 — `OnTrackPill` popover had no outside-click or Escape dismissal — and neither did any of the three real modals (found 2026-07-09, Fable UI review of PR #51; fixed 2026-08-03, Horizon design-review Slice 2)

**Owner:** me_theguy. **Severity: LOW (polish) as filed; the generalisation found on the way to
fixing it is a11y, not polish.**
**Found by:** the same Fable UI review as BUG-49. Re-verified as still reproducing at four session
close-outs (2026-07-12, 07-17, 07-23, 07-26).
**What (as filed):** `HorizonShell.jsx`'s `OnTrackPill` popover closed only via its own ✕ or by
re-clicking the pill — clicking anywhere else in the app, including navigating to a different screen,
left it pinned over the top-right corner. It is the one overlay in the app with **no backdrop**, so
it could not inherit the backdrop-click every other overlay already had.
**What the fix pass additionally found:** none of the three REAL overlays handled Escape either, and
none carried `role="dialog"`/`aria-modal` or moved focus on open — so a keyboard user could open a
modal and have focus stranded on the element behind the backdrop, with no key that closes it.
`ApplyPreviewModal` had zero `aria-*` of any kind (it delegates all chrome to `ConfirmModal`, which
had none to inherit).
**Fix, in two parts:**
1. *The pill.* An `open`-gated effect registers a document-level `pointerdown` listener (outside-click
   → close, tested against a `ref.contains` inside/outside discrimination) plus an `Escape` listener.
   Both are removed when the popover closes or unmounts. The pill itself became a real `<button>`
   with `aria-expanded` in the same pass (BUG-49).
2. *The modals.* New shared hook `src/horizon/useDialogBehaviour.js`, used by `ConfirmModal` and
   `LifeEventSheet` (and therefore by `ApplyPreviewModal`, which renders through `ConfirmModal`). It
   moves focus into the dialog card on open, closes on Escape, and restores focus to whatever was
   focused before. The Escape path is deliberately BOTH the card's own React `onKeyDown` (the branch
   that fires in practice, since focus is moved into the card) and a document-level listener (the
   fallback for when focus has left it); the React handler calls `stopPropagation`, so `onClose` fires
   exactly once, never twice. `role="dialog"` + `aria-modal="true"` are now on all three, named by
   `aria-labelledby` (ConfirmModal/ApplyPreviewModal, pointing at the rendered title) or a STATIC
   `aria-label` (LifeEventSheet — its only heading is an editable input, and labelling from live state
   would re-announce the dialog on every keystroke).
   The hook keeps `onClose` in a ref so its mount-only effect needs no dependency array: every call
   site passes an inline arrow, and re-running the effect per render would re-focus the card on each
   keystroke, yanking focus out of the sheet's own inputs.
**Deliberately NOT done:** a full Tab-cycling focus trap. It needs a live DOM to enumerate tabbables,
which this repo's `environment: "node"` test setup cannot exercise, so it would ship untested; the
document-level Escape listener is what keeps a dialog dismissible if focus does leave it. Noted here
rather than filed as a new bug — it is a nice-to-have on a surface that is now dismissible three ways
(backdrop, Escape, Cancel).
**Tests:** 4 new in `src/__tests__/horizon-shell-dismissal.test.js` (the pill: real button +
`aria-expanded`; outside-click closes while an inside click does not; Escape closes; listeners are
registered only while open and removed on close) and 6 new in
`src/horizon/__tests__/dialog-dismissal.test.js` (each modal's `role`/`aria-modal`/name, Escape-only
key discrimination, the backdrop still dismissing, and the footer-alignment invariants). The suite
runs with `environment: "node"`, so the pill file installs the minimal `document` the listener needs
and invokes the handlers it captured — the same thing a real click/keypress would do.
**Revert-and-confirm:** deleting just the pill's dismissal effect fails 3 of its 4 tests (the
"is a real button" case correctly still passes, since that is BUG-49's fix, not this one); restored,
green.
**Golden master:** untouched — behaviour/semantics only.
**Where:** `src/components/HorizonShell.jsx` (`OnTrackPill`), `src/horizon/useDialogBehaviour.js`
(new), `src/horizon/ConfirmModal.jsx`, `src/horizon/LifeEventSheet.jsx`,
`src/__tests__/horizon-shell-dismissal.test.js`, `src/horizon/__tests__/dialog-dismissal.test.js`.

### BUG-104 — Taxes tab's composition bar had no colour for its `draw` segment, rendering the LARGEST tax component (78% of the bar at the shipped default) fully invisible (found 2026-08-03, Horizon design-review round 2; fixed 2026-08-03, Horizon design-review Slice 1)

**Owner:** me_theguy. **Severity: HIGH — live at the shipped default, and it hides the single biggest
number on the surface whose entire job is to show where retirement tax goes.**
**Found by:** the Horizon UI design review's round-2 sweep for "hardcoded lookup maps whose keys have
drifted from their data source" (Pattern 7), then verified against the live default bundle.
**What:** `NumbersScreen.jsx`'s "Retirement-phase tax composition" bar coloured its segments from a
local `segColor` map — `{ working: t.warm, rmd: t.accent, conv: t.good }`. Its data source,
`taxViewBundle.composition.segments` (`App.jsx:2068-2072`), emits three keys: `rmd`, `conv` and
**`draw`** (the 401k-draw-tax segment BUG-40 added). `draw` had no entry, so `segColor[seg.key]`
evaluated to `undefined` and React emitted `background: undefined` — a transparent segment. The
legend dot beside "401k draw tax" was transparent for the same reason. Measured at the shipped
default state (mounting the real App): RMD tax $10,182 (2%) · Conversion tax $109,393 (20%) ·
**401k draw tax $434,207 (78%)** of a $553,782 total — so 78% of the bar was blank, and even the
`78%` label inside it was invisible (it renders in `t.surf`, the card's own background colour, which
only reads against a filled segment). A user saw a bar that appeared to be ~22% full and a legend
whose third entry had no dot. The dead `working` key sitting next to the two live ones is what made
the map *look* complete: working-year tax is deliberately excluded from this bar (`App.jsx:2062`),
so that key had never been reachable.
**Why:** classic lookup-map/data-source drift. When BUG-40 added the third segment to the model side,
the display-side colour map wasn't updated — and because a missing key degrades to `undefined`
(transparent) rather than to anything visible, the failure produced no error, no console warning, and
no obviously-wrong pixel; it just silently removed the largest bar.
**Fix:** (1) `segColor` now carries one entry per key the model actually emits —
`{ rmd: t.accent, conv: t.good, draw: t.warm }` — with a comment naming `App.jsx:2068-2072` as the
contract it must track. `t.warm` is the natural third accent token and was already free: the dead
`working` entry that used to hold it is **removed outright** (provably unreachable — the same
treatment `buildRetirementDrawdown`'s orphaned `rRealByYear` param got in PR #64), so the map now has
exactly the three live keys and nothing that disguises a gap. (2) **Both** lookup sites — the bar
segment background and the legend dot — now read `segColor[seg.key] ?? t.mut`, so any FUTURE key
drift fails **visibly** (a muted grey segment a reviewer or user will notice) instead of invisibly.
The fallback is a safety net, not a substitute for the map: the tests below assert no live segment
ever reaches it.
**Tests:** 3 new in `numbers-tabs.test.js` (Taxes tab). Text assertions structurally cannot see this
bug, so these walk the rendered style props via a new `collect()` tree-walker helper: (a) all three
segments have a string `background` and none equals the `?? t.mut` fallback; (b) the legend item whose
text contains "401k draw tax" has exactly one dot and its background is `t.warm`; (c) a synthetic
unknown segment key renders `t.mut`, never `undefined`. **Revert-and-confirm:** removing just the
`draw: t.warm` entry (leaving the fallback) fails (a) and (b); removing just the `?? t.mut` fallbacks
(leaving the entry) fails (c). Both reverted, confirmed failing, and restored.
**Golden master:** untouched — display-only, no model value moves.
**Where:** `src/horizon/screens/NumbersScreen.jsx` (the `segColor` map + both lookup sites),
`src/horizon/__tests__/numbers-tabs.test.js`.

### BUG-105 — Statement tab's plan-health badge printed the raw driver id `"confidence"` instead of a label, live at the shipped default (found 2026-08-03, Horizon design-review round 2; fixed 2026-08-03, Horizon design-review Slice 1)

**Owner:** me_theguy. **Severity: MEDIUM — cosmetic in impact but reachable at the shipped default,
on the screen that presents itself as a formal statement.**
**Found by:** the same round-2 lookup-map sweep as BUG-104 (Pattern 7), cross-checked against
`calcPlanDrivers`' actual row set.
**What:** `NumbersScreen.jsx`'s plan-health badge mapped failing drivers to prose via
`DRIVER_LABELS = { withdrawal, longevity, savings }` and fell back to `?? d.id`. But
`calcPlanDrivers` (`retirement-drawdown.js:186-197`) emits a **fourth** `"confidence"` row whenever
the caller passes `monteCarloSuccessPct` — and App always passes it (`App.jsx:1558` passes the key
unconditionally; the row is omitted only when the param is `undefined`, which never happens). So any
plan whose Monte Carlo success rate falls under the 80% guideline rendered the bare string
**`confidence`** in the "N areas to review" pill. This is live at the shipped default, not an edge
case: the locked golden master has `rangeSuccessPct = 24` (< 80) and `withdrawalRate = 5.61%` (> the
4% guideline), and `longevity` also fails, so the default state's badge read
"3 areas to review · withdrawal rate · longevity · **confidence**".
A second, same-root-cause symptom in the same 20 lines: the *all-OK* branch printed a **hardcoded**
`"withdrawal rate · longevity · savings rate"` — three names for four evaluated drivers, so a healthy
plan was told market confidence hadn't been checked when it had.
**Why:** the same drift as BUG-104 — the `confidence` driver was added on the model side (and wired
correctly into `HorizonShell.jsx`'s `OnTrackPill`, which has always labelled it "Market confidence")
without the second consumer's label map being updated. The `?? d.id` fallback meant it degraded to
something renderable, so nothing crashed and nothing warned.
**Fix:** (1) `DRIVER_LABELS` gains `confidence: "market confidence"` — the same wording `OnTrackPill`
already uses for this driver (`HorizonShell.jsx:62`), lower-cased to match this list's sibling
entries, so the two surfaces name the same driver identically. (2) the all-OK branch no longer
hardcodes a list: a shared `labelFor` maps the rows and the branch renders
`planView.drivers.map(labelFor).join(" · ")`, derived from the SAME array the failing branch filters —
so this list can never desync from the model's row set again (a pure display derivation over
model-provided rows; no arithmetic, rule 10 clean).
**Tests:** 2 new in `numbers-tabs.test.js` (Statement tab): a failing-confidence fixture renders
"1 area to review · market confidence" and a lookbehind regex asserts the bare id never leaks; an
all-OK fixture asserts the derived list reads
"withdrawal rate · longevity · savings rate · market confidence". The file's shared `planView`
fixture was also corrected to carry all **four** driver rows — it had stopped at three, which is part
of why this went unnoticed there (the fixture couldn't reproduce the app's real shape). **Revert-and-
confirm:** removing the `confidence` entry fails both new tests, with the pre-fix render captured
verbatim (`1 area to reviewconfidence`); restored.
**Golden master:** untouched — display-only.
**Where:** `src/horizon/screens/NumbersScreen.jsx` (`DRIVER_LABELS`, `labelFor`, `allDrivers`),
`src/horizon/__tests__/numbers-tabs.test.js`.

### BUG-106 — Statement tab's banner claimed "today's dollars" for a tab that is deliberately mixed-basis, contradicting its own ledger by roughly the full inflation factor (found 2026-08-03, Horizon design-review round 2; fixed 2026-08-03, Horizon design-review Slice 1)

**Owner:** me_theguy. **Severity: MEDIUM — a false unit declaration on the app's most
statement-like surface; CLAUDE.md rule 11's exact bug class.**
**Found by:** the Horizon design review's round-2 basis sweep (Pattern 6), reading the tab top-to-
bottom against each figure's declared basis.
**What:** the Statement tab's page banner read `Statement of your plan · today's dollars`,
unconditionally, for the whole tab. "The bottom line" immediately under it honours that
(`effectiveExpenses` is today's dollars per rule 11). But the **"Income for life" ledger** a few lines
down (`sv.monthlyHHSS` / `monthlyPension` / `monthlyPortDraw` / `monthlyTotal`) and its companion
"Where retirement income comes from" strip are built by `calcStatementView`
(`src/model/budget.js:194-205`, whose own code comment says so) in the **primary's retirement-year
real dollars** — the basis BUG-90 proved the retirement walk uses and BUG-91 converted the rest of the
app into. So the banner's claim was false for the ledger by the full `(1+inflation)^yearsToRetirement`
factor, with the two figures roughly 4× apart in the same screenful and nothing on the ledger flagging
the switch.
**Why:** the banner copy predates BUG-90/BUG-91 (it comes verbatim from the original design-handoff
wireframes, which carried a "figures in today's dollars" line). It was a global claim written when the
page was assumed to be single-basis; it was never revisited as retirement-year figures were added
beneath it.
**Fix:** the `· today's dollars` qualifier is **removed**, not caveated — the banner now reads
`Statement of your plan`. This is the same fix shape this codebase already applied once to the exact
same class of stale claim: `JourneyScreen.jsx`'s "— in today's dollars" subtitle (PR #62 review
battery, round 2 finding 13, above), removed on the reasoning that *the page has never been
consistently one basis throughout*. A comment at the site now records which figures on this tab carry
which basis, so a future contributor re-adding a blanket claim has to read the mismatch first.
**Deliberately NOT done:** re-basing the ledger itself. The underlying today's-vs-retirement-year
choice for these surfaces is entangled with a planned user-facing dollar-basis toggle (the owner's
decision in the design review's round 2.5: default to today's dollars, but expose a visible switch),
which is its own scoped piece of work. Removing a false claim is strictly correct in the meantime;
adding a *different* claim before that decision ships would just be a new thing to unwind.
**Tests:** 1 new in `numbers-tabs.test.js` (Statement tab) — the banner renders "Statement of your
plan" and the tab makes no blanket "today's dollars" claim. **Revert-and-confirm:** restoring the
qualifier fails it; restored.
**Golden master:** untouched — copy-only.
**Where:** `src/horizon/screens/NumbersScreen.jsx` (Statement banner),
`src/horizon/__tests__/numbers-tabs.test.js`.

### PR #62 review battery — adversarial code review + interoperability/forward-compat audits (2026-07-27, spousal-engine stabilization session)

**Owner:** me_theguy. **Process:** after the Qodo/CodeRabbit bot review round (which found the pension
double-gating and an a11y miss, both fixed earlier the same day — see the "PR #62 review fixes" commit),
the owner asked for a full close-out pass before merging: an adversarial code review (the project's
`/code-review` skill is user-invocation-only, so this was replicated manually as 4 parallel Sonnet
finder agents — BUG-91 wiring correctness, spouse-gating correctness, reuse/duplication +
CLAUDE.md-convention compliance, test-coverage/golden-master integrity) plus 2 Opus reasoning audits
(cross-feature interoperability, forward-compatibility/foundation-health), mirroring this project's
established BUG-79/80 and post-ship-review patterns. All 6 agents' findings were independently verified
against the actual code before any fix — see the individual fixes below for what was traced and
confirmed vs. what was filed for later.

**Fixed (display-basis rollout gaps — the same "BUG-91 landed in the engine but not every display" class,
found independently by 2 of the 4 code-review agents and confirmed/expanded by the interoperability audit):**
1. **Classic "Total Portfolio — Full Lifecycle" chart caption** (`src/App.jsx`) read
   `{fmt(effectiveExpenses)}/yr` — the raw, unconverted figure — captioning a chart built from
   `totalChartData`/`retPhase`, which this PR's own BUG-91 fix changed to draw down at `retSpendBasis`.
   **Live at the golden-master default** (not inert like most of this PR's other fixes): $57,377 shown
   vs. the chart's actual $226,415/yr drawdown, a ~4× mismatch on the Classic dashboard's headline
   chart. Fixed: now reads `retSpendBasis`.
2. **Plan screen's Income Meter headline** (`src/horizon/screens/PlanScreen.jsx`, `IncomeMeter`) showed
   `fmtMo(effectiveExpenses)` above per-source bars (`ssPct`/`pensionPct`/`portfolioPct`) that are
   built by `calcRetIncomeFlow` to SUM to `retSpendBasis` by construction (`App.jsx`'s `planHighlights`
   memo) — the headline and its own breakdown bars are contractually supposed to be the same number and
   were not. Live at any default with `takeHome > 0` (i.e., always, since `effectiveExpenses` is never
   0 at default). Fixed: now reads the already-available `retIncomeFlow.expenses` (the model-provided
   field `calcRetIncomeFlow` itself returns, `Math.max(0, effectiveExpenses)` — no new model code
   needed, and the `effectiveExpenses` prop the component no longer used was removed).
3. **`SSTimingFlow.jsx`'s "Counts as $X/yr of retirement income" pension line** and
   **`JourneyScreen.jsx`'s Chapter-3 pension pill** both read the raw `effectivePension`, while the
   conversion planner's analogous caption (`ConversionPlannerFlow.jsx`) was already fixed to the
   converted basis earlier this PR — these two were the missed siblings. Inert at the default (pension
   = 0) but real for any user with a pension. Fixed: new `ssView.effectivePensionAnnual` field
   (= `retPensionBasis`) added and both sites switched to it; the applicability gate
   (`showEffectivePension`) stays on the raw value (an existence check, not a display value — correct
   as-is).
4. **`wr70`** (`src/App.jsx`, the withdrawal-rate-at-age-70 figure feeding the "delay SS to 70"
   comparison card) had the exact SAME double-gate class Qodo's bot finding caught once already this
   session (`calcRMDIncomeFloor`/`projectRetirementBracket`, fixed earlier the same day) — it subtracted
   the retirement-gated `retPensionBasis`, but `wr70` represents income AT AGE 70, a later horizon than
   retirement. Pre-existing (was raw `effectivePension` before this PR), not introduced here, caught by
   the interoperability audit's systematic sweep of every pension-basis consumer. Fixed the same way as
   the other two: new `retPensionAt70 = pensionStartAge <= SS_MAX_CLAIM_AGE ? retPensionAnnualBasis : 0`.

**Fixed (a genuinely NEW scope regression introduced by this PR's own BUG-96 fix, found by the spouse-gating correctness agent):**
5. **`avgAnnualRMD` → `projectRetirementBracket`.** BUG-96 correctly narrowed `avgAnnualRMD` to
   primary-only (`primaryTotalRMDs / rmdData.length`) to match the RMD schedule table's own scope — but
   `projectRetirementBracket` also consumed that same variable, alongside full **household** `SS`,
   projecting a household bracket from a primary-only RMD average. Before BUG-96, the numerator was
   (imperfectly, but at least scope-consistently) household-wide. Fixed: new
   `avgAnnualRMDHousehold = totalRMDs / rmdData.length` computed separately and passed to
   `projectRetirementBracket`; `avgAnnualRMD` (primary-only) stays exactly as BUG-96 left it for the
   tile's own display. Inert at the default (no spouse); real for any spouse household where the spouse
   also has RMDs.

**Fixed (reuse/duplication and test-quality, all mechanical/safe):**
6. **`what-if.js` scenario-basis duplication.** `calcWhatIfDelta` and `calcWhatIfScenario` each
   independently derived "convert a today's-dollar expense override into the scenario's own
   retirement-year frame" (byte-identical formulas, but two copies — the exact BUG-31/25 shape this
   codebase has repeatedly hit). Extracted to one shared `scenarioExpensesInRetYearDollars` helper; both
   call sites (plus `calcWhatIfDelta`'s `baseExpensesConverted`) now call it. No behavior change (116
   what-if tests unchanged).
7. **`unit-contract.test.js` reimplemented `toRetirementYearDollars`** locally instead of importing the
   real one from `finance-math.js` — a future drift between the two would have gone undetected. Fixed to
   import; also narrowed the describe-block title from an overreaching claim ("every quantity...") to
   what it actually probes (spend/pension via `withdrawalRate`), with a note on what it doesn't cover
   (SS, the spouse gap-year maps — both covered elsewhere).
8. **`pension-timing-wiring.test.js` had zero wiring-level coverage of `calcRMDIncomeFloor`'s call
   site** — only `projectRetirementBracket`'s. A regression reintroducing the double-gate on
   `rmdIncomeFloor` specifically (leaving the bracket correct) would have passed every existing test.
   Added a second test, verified against the reintroduced bug (temporarily reverted the one line,
   confirmed the new test fails, restored the fix) before trusting it.

**Documentation (cheap, high-value, per the forward-compat audit's top recommendation):**
9. **New CLAUDE.md Critical Rule 11** — the "declared dollar basis" convention BUG-91 fixed instances of
   but never promoted to an enforced rule, per the forward-compat audit's diagnosis that this was the
   single highest-leverage gap (the pattern existed only in code comments and one bug entry, not
   somewhere a future contributor would look before wiring a new call site).
10. **`retDrawShared`'s "mixed-basis bundle" shape** (deliberately keeps `effectiveExpenses` raw while
    converting `pensionAmount`) now carries an explicit `⚠ MIXED-BASIS BUNDLE` warning comment — the
    forward-compat audit's specific concern was that a future "tidying" edit could silently
    double-convert inside `calcWhatIfDelta`/`calcWhatIfScenario`.
11. **BUG-85's entry** gained a forward-compat addendum recommending a `tradSp`-to-keyed-structure
    refactor BEFORE adding the three more spouse buckets it's scoped for (see BUG-85, above).

**Filed, not fixed (contained but requiring their own verification pass, not a fix rushed under
review-fix time pressure — consistent with this session's own established judgment on BUG-84/85):**
- **BUG-102** (interoperability audit) — a lever-preview's spouse-gap gating is inherited from the base
  plan rather than derived from the scenario's own re-seeded maps, so a retire-earlier preview can
  under-restrict relative to what Applying it actually produces. Same bug FAMILY as BUG-93 (same file,
  same `hasActiveSpouseGap` concept) but a distinct code path.
- **Third golden master recommended** (interoperability audit) — both existing masters are pension-free
  (default = no spouse/no pension; T-X.2 = spouse, no pension), so the whole pension-basis triad this
  review round just fixed three instances of is locked by ZERO golden-master value. Recommended shape:
  MFJ + spouse with an active gap + `pensionStartAge = safeRetAge + 3` + a non-TX state + an open
  conversion window, locking `projRetBracketPct`/`rmdIncomeFloor`/`wr70`/`rangeSuccessPct`. Not built
  this round (test-authoring work, not a correctness fix) — recommended for the next session touching
  this area.
- **`golden-master.test.js` migration recommended** (forward-compat audit) — it hand-builds its inputs
  and mirrors App.jsx's `toRetirementYearDollars` conversion BY HAND rather than mounting App (unlike
  `spouse-household.test.js`, which does mount App) — structurally unable to catch a wiring bug in the
  exact layer BUG-91 lived in, since a wrong App.jsx conversion and a wrong hand-copied test conversion
  would agree with each other. Recommended: migrate to mount App like the spouse-household golden
  master does, re-locking once deliberately. Not done this round — a larger, deliberate-relock change,
  not a review-fix-round item.
- **Documentation-debt recommendations** (forward-compat audit) — `docs/BUGS.md` is large (~100+
  entries); recommended a short index table at the top (id / one-line / status / files) so a session can
  locate relevant entries without reading the whole file, and capping CLAUDE.md's per-session history
  length (move older entries to a `docs/HISTORY.md`). Noted, not executed this round — a documentation
  restructuring project, not a correctness fix, and out of scope for this PR's close-out.

**Tests:** 2 new (`pension-timing-wiring.test.js`'s second test). **npm test: 1061 passed** (was 1059
before this round). Golden master untouched throughout — every fix in this batch is either inert at the
default state or a pure refactor. Lint clean, build OK.
**Where:** `src/App.jsx` (5 fixes), `src/horizon/screens/PlanScreen.jsx`, `src/horizon/screens/strategies/SSTimingFlow.jsx`,
`src/horizon/screens/JourneyScreen.jsx`, `src/model/what-if.js`, `src/__tests__/unit-contract.test.js`,
`src/__tests__/pension-timing-wiring.test.js`, `CLAUDE.md`.

**Round 2 — bot re-review after the above push (CodeRabbit, 2026-07-27, same day).** Both bots
auto-re-reviewed once the fixes above were pushed. Qodo's original pension-double-gate finding showed
as `✓ Resolved`. CodeRabbit found 2 more, both real:
12. **`avgAnnualRMDHousehold` divided by the WRONG denominator (Major).** Fix #5 above (the
    `avgAnnualRMD`/`projectRetirementBracket` scope-mismatch fix) introduced
    `avgAnnualRMDHousehold = totalRMDs / rmdData.length` — but `rmdData` is the PRIMARY-only RMD
    schedule, so a household where ONLY the spouse has RMDs (the primary's own Traditional 401k is
    empty or never reaches RMD age) has `rmdData.length === 0`, taking the ternary's `: 0` branch and
    silently dropping the spouse's entire real RMD income from the projected bracket — the exact bug
    class fix #5 was supposed to close, reintroduced one line later. Same root cause for a second
    reason CodeRabbit also named: even when both spouses have RMDs, their schedules can run different
    LENGTHS (different ages, different account sizes), so `rmdData.length` was never the right
    household year-count even in the two-RMD case. Fixed: new `householdRmdYears =
    retPhase.rows.filter(r => r.rmd > 0 || (r.rmdSpouse ?? 0) > 0).length` — the UNION of years either
    spouse has a nonzero RMD, read directly from the engine's own per-row `rmdSpouse` field (already
    computed by `buildRetirementPhase`, just not previously consumed by this call site) —
    `avgAnnualRMDHousehold = totalRMDs / householdRmdYears`. Verified against the pre-fix condition:
    reverted to the `rmdData.length` denominator, confirmed the new regression test fails (0.1 vs 0.1,
    no crossing — the spouse-only RMD income was invisible to the bracket projection), restored the fix.
    New test: `pension-timing-wiring.test.js`'s "household RMD average denominator" describe block
    (a primary with $0 Traditional 401k + a spouse with a large one, comparing the projected bracket
    with vs. without the spouse's RMD — the household total is real, `rmdView.rows` — the primary-only
    schedule — stays empty in both readings, proving this IS the exact edge case).
13. **`JourneyScreen.jsx`'s pension pill gate (Minor).** The fix above (finding #3) swapped the
    DISPLAYED value to the converted `ssView.effectivePensionAnnual` but left the GATE itself on a raw
    `effectivePension > 0` comparison in JSX — a rule-10 violation (Horizon screens must read
    model-provided applicability flags, never compare a raw prop). Fixed: gate now reads
    `ssView.showEffectivePension` (the same flag `SSTimingFlow.jsx` already used, correctly, for the
    identical pension-display pattern) — `effectivePension` is no longer referenced anywhere in this
    file at all, removed from the destructure. CodeRabbit also flagged the page subtitle's "— in
    today's dollars" claim as now inaccurate (most of Journey's figures, including this pill, are
    `flowDown`/retirement-year-basis by design) — removed the qualifier rather than adding a caveat,
    since the page has never been consistently one basis throughout. Fixed the same day the
    describe-block's own fixture in `journey-screen.test.js` needed updating (it predated `ssView`
    being a prop this screen reads) — added a synthetic `ssView: { showEffectivePension: false,
    effectivePensionAnnual: 0 }` matching the existing "pension strip hidden" fixture intent.
**Tests:** 1 more new (the household-RMD-denominator test above). **npm test: 1062 passed.** Golden
master untouched; lint clean; build OK.
**Where:** `src/App.jsx` (`avgAnnualRMDHousehold`/`householdRmdYears`), `src/horizon/screens/JourneyScreen.jsx`,
`src/horizon/__tests__/journey-screen.test.js`, `src/__tests__/pension-timing-wiring.test.js`.

### BUG-91 — Model-wide real/nominal dollar-basis mismatch: `effectiveExpenses` is today's dollars, the retirement walk is retirement-year dollars (found 2026-07-26, adversarial review of BUG-82's PR #59; fixed 2026-07-27, spousal-engine stabilization session)

**Owner:** me_theguy. **Severity: HIGH — the single largest input to every headline number the app
shows.** **Found by:** the Opus planning-and-audit pass commissioned to design BUG-90's fix (Finding
3), as a NEW discovery beyond the three findings it was scoped to address; independently re-verified
worse than originally filed by a follow-on roadmap-alignment review.
**What:** the retirement engine grows every account at `rReal = (1+returnRate/100)/(1+inflationRate/100)
- 1` — a REAL rate. BUG-90's own proof established what that means for the engine's balance UNIT: a
seed grown at `rReal` for `k` years equals the nominal balance in that later year, deflated by
`(1+inflationRate/100)^k` — the whole walk is denominated in the PRIMARY's RETIREMENT-YEAR purchasing
power. But `effectiveExpenses` (`annualExpenses ?? effectiveLiving`) and `effectivePension`/
`pensionMonthly` are TODAY's-dollar figures, fed into that walk with **zero conversion**. At the shipped
default (age 30 → retire 65, 4% inflation, factor `1.04^35 ≈ 3.95`) the unit-corrected annual spend is
**$226,415** against the shipped **$57,377** — `withdrawalRate` **1.42% → 5.61%**, which now *fails* the
app's own `SAFE_WITHDRAWAL_GUIDELINE_PCT` (4%) instead of comfortably passing it.
**Fix:** a new shared helper, `toRetirementYearDollars(todaysDollarAmount, inflationRate,
yearsToRetirement)` (`finance-math.js`), inflates a today's-dollar quantity forward to the primary's
retirement-year frame — the exact inverse of, and using the same base year as, BUG-90's already-shipped
spouse gap-year deflator, so the two compose without a seam (verified: BUG-90's `T-F3.2` seam-continuity
test needed no changes). App.jsx computes `retSpendBasis`/`retPensionBasis`/`retPensionAnnualBasis`/
`retPensionMonthlyBasis` ONCE and rewires every retirement-walk-facing call site to use them:
`netPortfolioNeed`, the engine (`retPhaseBase`), the blended walk / Monte Carlo / what-if baseline
(`retDrawShared`), the conversion optimizer's income floors (`buildIncomeFloors`, 3 call sites), the RMD
income floor, the projected retirement bracket, the SS-delay comparison, the optimized scenario, and the
Income Meter / Statement-view SS+pension+portfolio breakdown (`calcRetIncomeFlow`,
`calcStatementView`'s new optional `effectiveExpensesRetYear`/`effectivePensionRetYear` params).
Raw `effectiveExpenses`/`effectivePension` are DELIBERATELY left unconverted everywhere they're a
genuinely different, today's-dollar quantity: the Statement/Budget tabs' own display, the Income Meter's
"% of today's take-home" (`incomeReplacementPct`), and the Plan lever/WhatIfPanel UI's slider baseline
(`LEVERS.monthlyExpenses.baseValue`) — converting those would have been the SAME bug in the opposite
direction (a retirement-year-dollar figure compared against a today's-dollar one).
**what-if.js companion fix (found during the plan audit, folded into the same fix):** a what-if scenario
that overrides the retirement age walks in a DIFFERENT retirement-year frame than the base plan.
`calcWhatIfDelta`/`calcWhatIfScenario` already re-derived the expense conversion at the scenario's own
age; SS/pension did not (they rode `retPhaseBase`/`retDrawShared`'s pre-converted-at-the-base-plan's-age
values unchanged) — fixed with a second helper, `inflationRebaseFactor(inflationRate, yearsDiff)`
(bidirectional — unlike `toRetirementYearDollars` it does not clamp a negative `yearsDiff`, since
retiring EARLIER in a scenario needs to DIVIDE, not no-op), applied to `ssGross`/`ssTaxable`/`pension`
(engine branch) and `ssAmount`/`pensionAmount` (blended-walk fallback + `calcWhatIfDelta`'s two walks).
**Independent plan-audit pass (2026-07-27, before any code was written) found several scope gaps in the
original fix plan, all folded in before/during implementation:** four display sites that would have
stopped reconciling once `netPortfolioNeed` moved to the new basis (the Classic drawdown waterfall, two
SS-coverage percentages, the Flow-Down outcome stat row) — fixed by converting the SAME quantities there;
`golden-master.test.js` (which hand-builds its inputs and never mounts App) needed the identical
conversion mirrored into its own setup, or it would have silently stopped reflecting what the app
actually computes; the original unit-contract test (this branch's own step 2) probed the raw DISPLAY
passthrough fields, which this fix deliberately leaves unconverted, so it could never have turned green —
rewritten to probe `withdrawalRate` (an engine-derived, already-exposed quantity) instead.
**Deliberately NOT fixed in the same pass (all documented, all filed as their own follow-ups):** money
events (Goals/LifeEventSheet) are still applied in nominal dollars against the now-correctly-converted
walk (**BUG-99**); the pre-existing "tax brackets aren't inflated" simplification now bites at full
strength since it's no longer accidentally offset by the understated spend (**BUG-100**); accumulation-
phase `contrib401k` (and siblings) still track `incomeGrowth`, not inflation specifically, a smaller
instance of the same class (**BUG-101**, re-filed from BUG-91's own original text); the
fully-wired-but-unconsumed `livingExpenseGrowth` UI lever is left as dead code (no fix — no live bug
depends on it; a future feature could wire it, but nothing currently silently ignores a user's input,
since the lever was never functional to begin with).
**Golden master impact (deliberate, both re-locked):** the no-spouse default (`golden-master.test.js`):
`withdrawalRate` 1.42% → 5.61% (now fails the 4% guideline), `isSustainable` **true → false**
(`yearsSustained` Infinity → 21.65, `depletionAge` null → 87), `firstRMD`/`totalRMDs`/`rmdTaxBite` drop
sharply (207,557 → 10,182 lifetime RMD tax — see BUG-100 for why: the corrected, much larger draw drains
the Traditional 401k well before 73, and the un-inflated brackets no longer have an offsetting error to
hide behind), `netConversionBenefit` −9,854 → −70,844, `spendableAtRet` 3,654,179 → 3,763,788. The
spouse-household golden master (this branch's own step 1, `spouse-household.test.js`): `withdrawalRate`
0.78% → 1.61% (this fixture's shorter 8-year/2.5%-inflation gap produces a much smaller conversion factor
than the no-spouse default's 35-year/4% gap, so it stays comfortably sustainable — `isSustainable` stays
true, `depletionAge` stays null); RMD/conversion figures shift for the same live-balance-changes-with-the-
draw reason as the default; `rangeSuccessPct` 95 → 83.
**Tests:** `finance-math.test.js` (+18: both new helpers), `unit-contract.test.js` (both assertions
flipped from `it.fails` to real passing `it`s, rewritten to probe `withdrawalRate`), `what-if.test.js`
(+4: the SS/pension scenario re-basing, isolated from the expense re-basing by holding the converted
expense identical between a "real" and a "frozen" run via an explicit override), 2 fixture rewrites in
`spouse-household.test.js` and `conversion-view-wiring.test.js` where the corrected (much larger) default
spend made an existing comparison degenerate (both sides landing on the same $0) — given a lower,
comfortably-affordable spend override so the comparison the test exists for is observable again.
**Where:** `src/model/finance-math.js` (both new helpers), `src/App.jsx` (the ~15 call-site rewires +
the 4 display-reconciliation fixes), `src/model/budget.js` (`calcStatementView`'s dual-basis split),
`src/model/what-if.js` (`calcWhatIfDelta`, `calcWhatIfScenario`), `src/horizon/screens/strategies/ConversionPlannerFlow.jsx`
(one display site switched from the raw prop to the bundle's converted field).
**Inert at zero years-to-retirement or zero inflation:** both new helpers degrade to a no-op factor of 1,
verified by dedicated tests — the entire fix is invisible to any household already retired or to a 0%
inflation assumption.

### BUG-93 + BUG-94 — Option-A hold-out fired for a spouse with NO income/contributions; the Range-lens caveat disagreed with the engine on exactly that household (found 2026-07-26, independently by the adversarial-correctness and interoperability review agents; fixed 2026-07-27, spousal-engine stabilization session)

**Owner:** me_theguy. **Severity: HIGH (both) — BUG-93 fired as the DEFAULT behavior for a common
household shape (a spouse holding a rollover balance with no ongoing income), not a rare edge case;
BUG-94 meant the engine and the Monte Carlo lens could show OPPOSITE verdicts with no warning.**
**What:** `hasSpouse` was used throughout the spouse engine as a proxy for "the spouse is a separate,
still-working person with their own timeline" — but the input that would make that literally true (the
spouse's actual income/contributions) was never checked. `App.jsx` passed
`spouseRetirementAge: hasSpouse ? effectiveSpouseRetAge : null` unconditionally whenever a spouse
BALANCE was entered (income or not), so the engine's Option-A hold-out walled a pure rollover balance
out of the drawable pool and could force BUG-88's penalized escape hatch for money that was never
actually locked up — measured (interoperability agent, 9 balance/expense combinations, a non-working
spouse with a $1M rollover 401k): the escape hatch fired in **all 9 cells**. Separately, the Range
lens's own `hasActiveSpouseGap` caveat (shipped 2026-07-25 as a false-positive fix) already correctly
keyed on the gap-year INCOME maps having a nonzero value — a DIFFERENT condition than the engine's
hasSpouse-only gate — so the two could disagree: measured (interoperability agent, spouse 10 years
younger, $900k rollover IRA, no earnings), the engine reported a depletion needing $1,067,417 of early
spouse-401k withdrawals while the Range lens showed 56% success and the caveat rendered nothing.
**Fix:** gate `spouseRetirementAge` on `hasActiveSpouseGap` (the SAME real-income/contribution check the
caveat already used) instead of bare `hasSpouse` — a pure rollover balance with no ongoing income now
pools immediately from day one (Option A never activates, so the escape hatch has nothing to escape
from). Because the engine's hold-out and the caveat's firing condition are now the identical
expression, BUG-94's contradiction closes as a structural side effect of BUG-93's own fix, exactly as
`docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md`'s step 4 anticipated — no separate mechanism was needed.
Also fixed the caveat's secondary wording finding (it asserted "may understate," a one-directional claim
for what is actually a two-directional error — the blended MC walk both omits gap-year income
(understating) and pools the held-out bucket for free (overstating)): reworded to "may over- or
understate" rather than asserting a direction.
**Verified against the pre-fix condition, not just the post-fix behavior** (this session's own
process): the exact regression fixture below was run against BOTH the old (`hasSpouse`-gated) and new
(`hasActiveSpouseGap`-gated) code — the old code produces a real, nonzero `totalSpouseSpillover` of
$4,783 at age 71 for this household; the new code produces exactly $0. The fix is a genuine behavior
change, not a no-op.
**Tests:** 3 new tests in `spouse-household.test.js` — a pure-rollover household under genuine
depletion stress never triggers the escape hatch even though the primary's own portfolio does
eventually deplete (proving the fixture is real stress, not a trivially-easy household); the Range-lens
caveat and the engine's spillover now agree (both null/0) for that same household; a spouse with REAL
gap-year income still gets Option A exactly as before (`hasActiveSpouseGap` true is unaffected).
**Inert whenever `hasActiveSpouseGap` was already true** (a spouse with real gap-year income/
contributions) — golden master unaffected (no spouse at the default state); this session's own
spouse-household golden master (T-X.2, real spouse income) is also unaffected, since that household's
`hasActiveSpouseGap` was already true both before and after this fix.
**Where:** `src/App.jsx` (the `spouseRetirementAge` pass-through in `retPhaseBase`, the
`spouseGapCaveat` wording).
**Superseded 2026-07-28 (Session B):** the Monte Carlo engine port retired `rangeGapCaveat`/
`rangeView.spouseGapCaveat` outright — the Range lens now walks the same per-account engine as
`retirementWalk`, so the class of engine/lens disagreement BUG-94 fixed here is now structurally
impossible (there is only one walk left to disagree with itself). The three caveat-firing-
condition tests this fix's Tests paragraph describes were replaced with engine-observable
successors in the same commit; the BUG-93 hold-out gating itself (`hasActiveSpouseGap`) is
unaffected and still governs the engine's Option-A hold-out.
**Not fully closed:** BUG-92 (no verdict signal when a plan leans on the spillover escape hatch) remains
Open — orthogonal to this fix (it's about the VERDICT machinery when the hatch genuinely does fire for a
household with real gap-year income, which this fix doesn't change).

### BUG-95 — `spouseCurrentAge` silently drives the whole spouse engine, defaults to 18, and its only editor was buried behind an unrelated toggle (found 2026-07-26, interoperability review agent; fixed 2026-07-27, spousal-engine stabilization session)

**Owner:** me_theguy. **Severity: HIGH — a multi-million-dollar swing with zero signal on any
headline number, and no reachable control for most users.**
**What:** see the original Open write-up for the full measured example ($4.2M swing / $1.6M of vanished
lifetime RMDs between the shipped default `spouseAge=18` and a household's true spouse age of 48) — the
root cause was twofold: (1) the field's only editor in either UI was double-gated behind the unrelated
"is spouse the sole RMD beneficiary" toggle, so most married users could never reach it; (2) the stored
value was hard-capped at `currentAge - 1`, making a same-age or older spouse literally unrepresentable.
**Fix:** (1) new always-reachable editor — a `spouseCurrentAge` `DetailField` added to "My details →
Spouse & household" (`MyDetailsScreen.jsx`), alongside the existing "Spouse retires at" field, gated only
on the card's own `spouseAccountsApplicable`/entitlements visibility (never on `spouseIsSoleBenef`); the
double-gated `RMDOutlookFlow.jsx` editor is untouched and still exists for the RMD-table question it
actually answers — the two editors write the same `ss.spouseCurrentAge` bundle field, so neither can
drift from the other. (2) widened the bound: `ss.spouseCurrentAge.max` `currentAge - 1` → **80** (both
the bundle field and the mirrored Classic slider), so a same-age or older spouse is now representable.
(3) `setCurrentAgeCoupled` no longer force-decrements a stored `spouseCurrentAge` when the primary's own
age rises past it (the old coupling made "spouse same age or older" an impossible state to *enter* even
after widening the bound) — a new `setSpouseCurrentAgeCoupled` clamps the STORED value the other
direction instead (pushes `spouseRetirementAge` forward if it would fall at-or-below the new spouse age),
mirroring the existing `setLifeExpectCoupled` pattern. **The default value itself (18) is intentionally
left unchanged** — every household with a spouse must now set a real age via the new visible editor
rather than the app guessing one; a wrong-but-visible-and-editable default is preferable to picking a
different wrong-but-invisible one.
**Tests:** 2 new tests in `my-details-screen.test.js` (the spouse-age editor renders and writes through
the `ss` bundle; it stays absent, defensively, when the `ss` bundle prop isn't provided).
**Inert at default state:** no spouse data → the card doesn't render at all. Golden master untouched.
**Where:** `src/App.jsx` (`spouseCurrentAge` bundle field + Classic slider bound, `setCurrentAgeCoupled`,
new `setSpouseCurrentAgeCoupled`), `src/horizon/screens/MyDetailsScreen.jsx` (new editor field).

### BUG-96 — RMD screen's household tiles vs. primary-only table disagreed by up to 71%, with a mislabeled tax-rate header and a card that could hide itself exactly when RMDs were largest (found 2026-07-26, adversarial-correctness review agent; fixed 2026-07-27, spousal-engine stabilization session)

**Owner:** me_theguy. **Severity: MEDIUM-HIGH — a user reading the RMD stat tiles and the schedule
table right below them would see two different numbers for "your RMDs" with no explanation.**
**What:** the `rmdView`/RMD-outlook stat tiles (`firstRMDAmount`, `totalRMDs`, `rmdTaxBite`) read
the HOUSEHOLD-scoped `totalRMDs`/`rmdTaxBite` (primary + spouse's own RMDs, once #30 gave the spouse
their own RMD schedule), while the year-by-year schedule table directly below them (`rv.rows`) has
always been, and remains, PRIMARY-only (a spouse RMD sub-schedule was explicitly deferred, per BUG-85's
v1 scope). The two numbers could disagree by as much as 71% in a two-earner household, with nothing on
screen explaining why. Two smaller compounding findings: the tax-column header showed a bare percentage
with no scope label (read as "the tax rate on the row's RMD," when it's actually the JOINT household
rate stacked on both spouses' RMDs); `strategiesView.rmd.applicable` gated on `!!firstRMD` (a
primary-only value), so the Strategies card could report "not applicable" for a household whose spouse
alone had RMDs due — hiding the card exactly when it mattered most; `avgAnnualRMD` divided the
household total by the primary-only row count, overstating the primary's own average RMD.
**Fix (scope option (a) — match tiles to the table, surface the household number separately, rather
than build a full spouse RMD sub-schedule display — the latter is a genuine future feature, not a
one-session fix):** added `primaryTotalRMDs = rmdData.reduce((s, r) => s + r.rmd, 0)` (App.jsx) — sums
the exact same rows the table renders, so tile and table can never disagree again by construction. The
`rmdView` bundle's `totalRMDs` field now returns `primaryTotalRMDs`; the household figure is exposed
under new, explicitly-named fields `householdTotalRMDs` (= the old household `totalRMDs`) and
`showHouseholdTotal` (`totalRMDs > primaryTotalRMDs`) so a screen can show it as a clearly-labeled
addendum instead of silently substituting it. `RMDOutlookFlow.jsx` now shows the primary-only tiles plus
a conditional note ("Includes your spouse's own RMDs: household lifetime total $X — their schedule isn't
itemized in the table below yet") only when `showHouseholdTotal` is true; the Classic UI gets the same
treatment (tile now shows `primaryTotalRMDs`, a conditional household-total note, both tax-tile and
table-header relabeled "(household)"/"Tax (household, ~X% eff.)" since the tax figure genuinely is
joint). `strategiesView.rmd.applicable` changed from `!!firstRMD` to `totalRMDs > 0` (the household
scope) so the card can't hide itself when only the spouse has RMDs due. `avgAnnualRMD`'s numerator
switched from the household `totalRMDs` to `primaryTotalRMDs` to match its own denominator
(`rmdData.length`, a primary-only row count).
**Tests:** 2 new tests in `spouse-household.test.js`'s "BUG-96 — RMD tiles/table scope agreement"
describe block, using the existing T-X.2 household fixture: the tile total equals the sum of the
table's own rows exactly; the household addendum note appears with the correct (larger) total and only
when the household total genuinely exceeds the primary-only one.
**Inert at default state:** no spouse data → `showHouseholdTotal` is always false, `primaryTotalRMDs ===
totalRMDs`, no display change. Golden master untouched.
**Where:** `src/App.jsx` (`primaryTotalRMDs`, `avgAnnualRMD`, `rmdView` bundle, `strategiesView.rmd`,
Classic RMD tiles + table header), `src/horizon/screens/strategies/RMDOutlookFlow.jsx` (household-total
note, tax-column relabel).

### BUG-98 — Defensive-contract gaps in the spouse gap-year maps / escape hatch, unhardened unlike their sibling `spouseHoldout` (found 2026-07-26, adversarial-correctness review agent; fixed 2026-07-27, spousal-engine stabilization session, Step 6)

**Owner:** me_theguy. **Severity: LOW (unreachable from any current caller; a "same class as
something we already hardened" gap, not a live bug).**
**What:** `spouseApplied = Math.min(spouseIncomeFloor, spendNeed)` (`retirement-engine.js`) had no
`Math.max(0, …)` guard — a negative map value would INCREASE the draw rather than being clamped
(probe: a −$50k floor produced a $110k draw instead of $60k). A NaN in any of the three gap-year maps
(`spouseContribByAge`/`spouseTaxableIncomeByAge`/`spouseIncomeFloorByAge`) would propagate into
`row.spouseContrib` and onward into Flow-Down's reconciliation sums. Unreachable from any current
caller (`buildSpouseRetirementSeed`'s own outputs are always non-negative and finite), but precisely
the class of gap the team had already decided to harden defensively elsewhere in this same engine:
`spouseHoldout`'s fail-closed null-handling (BUG-82's Resolved entry, the CodeRabbit review-fix round)
was added specifically because "this is an exported pure function — its own contract should fail
safe," even though the real `App.jsx` caller could never trigger it either.
**Fix:** new shared guard `nonNegOrZero(v)` (`retirement-engine.js`) — non-finite or non-positive
degrades to inert `0`, mirroring `spouseHoldout`'s reasoning — applied at all three map-read call sites
(`spouseContrib`, `spouseWages`, `spouseIncomeFloor`). `spouseApplied` itself also gets the one-line
`Math.max(0, …)` the original entry recommended, as a second layer of defense even though
`spouseIncomeFloor` can no longer be negative by the time it reaches that line.
**Tests:** 3 new tests in `retirement-engine.test.js` — a negative `spouseIncomeFloorByAge` value
produces the same draw as an explicit `0` (not a larger one); `NaN` in any of the three maps degrades to
a fully finite row (`draw`/`tax`/`total`) rather than propagating; a negative `spouseContribByAge` value
does not shrink the held-out spouse bucket.
**Not addressed (left as documented, not a bug):** the `spouseRetirementAge: Infinity` special-case
behavior noted in the original filing (pools the bucket immediately rather than holding it out) is
unchanged — still a reasonable interpretation, still undocumented as an explicit special case; not
touched by this pass since it's a documentation gap, not a defensive one.
**Inert for every real caller** — golden master untouched, this branch's own spouse-household golden
master (T-X.2) also untouched.
**Where:** `src/model/retirement-engine.js` (`nonNegOrZero`, `spouseContrib`, `spouseWages`,
`spouseIncomeFloor`, `spouseApplied`).

### BUG-92 — No verdict signal when a plan leans on the spillover escape hatch (found 2026-07-26, BUG-88's planning pass; fixed 2026-07-27, spousal-engine stabilization session, Step 6)

**Owner:** me_theguy. **Severity: MEDIUM.** **Found by:** the same Opus planning-and-audit pass that
designed BUG-88's fix, as an explicit "surfacing" follow-up question it answered by recommending
deferral to a dedicated session.
**What:** after BUG-88's fix, a household can be "sustainable" ONLY BECAUSE it repeatedly raids a
still-working spouse's 401k at a 10% early-withdrawal penalty (the Option-A hold-out's escape hatch) —
and the shared `verdictForScenarioResult` resolver in `what-if.js` would still call that plan
"comfortable." A precedent for capping such a plan at "tight" already existed in the same file:
`eventRetirementDraw`/`eventRetirementDrawTax` already cap a scenario's verdict when a money event
forces an early retirement-account withdrawal (BUG-74's fix).
**Fix:** `verdictForScenarioResult` now caps a "comfortable" verdict at "tight" whenever
`scenario.totalSpouseSpillover > 0`, the identical treatment `eventRetirementDraw > 0` already got —
both conditions share one `if`. `calcWhatIfScenario` now threads `rp.totalSpouseSpillover` (the
engine's own rollup, already computed by `buildRetirementPhase`) into its returned scenario object as
`totalSpouseSpillover` — the resolver had nothing to read before this wiring existed.
`verdictInfoForScenario`'s override-label branch (used whenever the margin alone would have said
"comfortable" but the shared resolver downgraded it) now attributes the honest reason to whichever
condition actually applies: "needs early retirement-account withdrawals to fund" for a money event,
"needs early withdrawals from a spouse's still-working 401k to fund" for the spillover case. Because
`evaluateLifeEvent` and both tick rails (`buildLeverRail`/`buildDurationRail`) all call
`calcWhatIfScenario` and then the shared resolver, they inherit the fix automatically — no separate
mechanism needed for any of the three surfaces named in the original deferral.
**Tests:** a pure-function test locks the resolver's new cap + label (mirroring the existing
`eventRetirementDraw` test); a second test drives a genuine engine-level spillover through
`calcWhatIfScenario` (T-F1.1's exact fixture from `retirement-engine.test.js` — a household that
would falsely depend on the escape hatch) and confirms `totalSpouseSpillover` actually flows through
end-to-end, not just in a synthetic scenario object, and that the no-spouse case stays 0.
**Inert whenever `totalSpouseSpillover` is 0** (no spouse, or a household whose spouse bucket was
never actually raided) — golden master untouched, this branch's own spouse-household golden master
(T-X.2) also untouched (it never triggers the escape hatch).
**Where:** `src/model/what-if.js` (`verdictForScenarioResult`, `verdictInfoForScenario`,
`calcWhatIfScenario`'s returned `totalSpouseSpillover` field).

### BUG-90 — Nominal spouse gap-year flows in a real-dollar retirement walk (found 2026-07-26, adversarial review of BUG-82's PR #59; fixed 2026-07-26, same session)

**Owner:** me_theguy. **Severity: MEDIUM-HIGH (compounds over long gaps — up to 34% at the fixture's
final gap year).** **Found by:** an Opus adversarial review of the just-merged BUG-82 spouse-engine
work (PR #59), independently corroborated by a follow-on Opus planning-and-audit pass that also
corrected the review's own suggested fix.
**What:** `buildSpouseRetirementSeed` (`retirement-phase.js`) copied `runSimulation`'s per-year
`c401k`/`salary`/`cHSA` figures verbatim into the retirement engine's gap-year maps
(`spouseContribByAge`/`spouseTaxableIncomeByAge`/`spouseIncomeFloorByAge`). But `runSimulation`
compounds NOMINALLY (`returnRate`, `incomeGrowth`), while the retirement engine walks in REAL dollars
(`rReal = (1+returnRate/100)/(1+inflationRate/100)−1` against a flat `effectiveExpenses`) — its
balance unit is the purchasing power of the PRIMARY's retirement year. A spouse's gap-year paycheck
was therefore the only income stream in the entire walk whose purchasing power silently grew year
over year, inflating both the spouse's banked contributions and the cash that offsets the household's
portfolio draw the longer the gap ran.
**Root cause (established rigorously):** a balance `B` growing at `rReal` for `k` years equals
`B(1+r)^k/(1+i)^k` — i.e. the nominal balance expressed in the RETIREMENT year's purchasing power. The
seed (`tradSeed` etc.) is already in that unit by construction (it IS the nominal balance in that
calendar year); only the per-year MAPS were wrong.
**The reviewer's own suggested fix was itself refuted and corrected during planning:** the review
proposed deflating to TODAY's dollars (`currentAge` as the base year). A follow-up numeric probe
proved this wrong on two independent grounds: (a) it creates a ~22% discontinuity exactly at the
seed/map seam — the spouse's contribution in the primary's retirement year is already inside the seed
at full nominal value, so any base other than the retirement year puts a cliff right at the handoff;
(b) it does not reproduce the reviewer's own cited ratio (1.1495), which is only reproducible with a
retirement-year base.
**Fix:** an optional `inflationRate` param on `buildSpouseRetirementSeed` deflates each gap year's
map entries by `(1+inflationRate/100)^k`, `k = primaryAge − primaryRetAge` (the primary's RETIREMENT
year, not today). Seeds are untouched — already correct. Wired into both call sites that build the
seed (`App.jsx`'s main-path `spouseSeed` memo and the what-if forced-resim's `spouseSeedInputs`
bundle) so the solid arc and a what-if preview can never disagree about the deflator.
**Measured impact (10-year gap, 2.5% inflation):** gap-year cash and contributions fall ~15%; at a
17-year gap the final gap-year figure falls 34% from the shipped (nominal) value.
**Where:** `src/model/retirement-phase.js` (`buildSpouseRetirementSeed`), `src/App.jsx` (both call
sites: the `spouseSeed` memo and `spouseSeedInputs`).
**Tests:** T-F3.1 (the bug verbatim — ~13% real-terms deflation over a 10-year gap, last year deflated
by exactly `1.025^10`), T-F3.2 (seam continuity — locks the retirement-year base choice, would fail by
~22% under a today's-dollar base), T-F3.3 (inertness), T-F3.4 (App-level wiring gate — both call sites
carry a live `inflationRate`, and it actually reaches the main-path walk, not just the what-if
bundle), T-F3.5 (monotonicity), T-F3.6 (seeds provably untouched).
**Inert at default state:** `inflationRate` defaults to `0` ⇒ deflator `1` ⇒ every existing caller and
test byte-identical; no spouse data ⇒ the builder is never called. Golden master untouched.
**Independently re-verified (2026-07-26, adversarial-correctness review agent):** the 34%-at-17-years
figure reproduces exactly (`1 − 1/1.025^17 = 34.3%`). Two minor precision corrections to this entry's
own text: the "~15%" figure at a 10-year gap is **12.5%** on the test's own flat fixture (the T-F3.1
test band of 10–16% still holds; only the illustrative prose number was loose). Separately, the
agent found the spouse's HSA add-back (`spouseIncomeFloorByAge[a] = round(wages*netRate) +
round(hsa)`) is not exactly "dollar-conserving" as an internal code comment claims — `cHSA` is removed
from `wages` and then added back at 100%, so the household nets `cHSA × (1 − netRate)` MORE spendable
cash than if the spouse had never made the HSA contribution (the deduction's tax shield is credited as
cash alongside the contribution itself). Small and bounded by the HSA contribution limit (verified:
$1,320 on a $4,400 HSA contribution at a 0.7 net rate — exactly `4400 × 0.3`); logged as a documented
simplification in `docs/FINANCIAL-MODEL.md` → Known Simplifications rather than fixed, since the
dollar amounts involved are minor relative to BUG-90's own scope.

### BUG-89 — The Roth-conversion window's income floors never got the spouse's gap-year wages (found 2026-07-26, adversarial review of BUG-82's PR #59; fixed 2026-07-26, same session)

**Owner:** me_theguy. **Severity: HIGH (real converted dollars, not display — see impact below).**
**Found by:** the same Opus adversarial review as BUG-90, verified against the actual codebase by a
follow-up planning-and-audit pass.
**What:** `buildIncomeFloors` (`conversion-planning.js`) returned `yearSS + yearPension` per
conversion-window year. The retirement ENGINE builds its own per-year bracket floor as
`ssTaxable + pension + spouseWages` (`retirement-engine.js`). Since BUG-82 shipped, the conversion
planner and the engine modeled DIFFERENT households for any spouse-gap window. CLAUDE.md rule 5b
names `retIncomeFloors[]` explicitly as a per-year loop that must gate every income source — the
rule-5 wiring done in the original BUG-82 session (Batch 7) reached `netPortfolioNeed`/
`withdrawalRate`/`calcOptimizedScenario`/the Income Meter, but not this array.
**Impact, worst first (verified with a $120k/yr spouse-wages, MFJ, 22%-bracket-fill fixture):**
1. **Bracket-fill targets overshoot — real converted dollars, not a display bug.** A plan labeled
   "fill to 22%" converted $243,600 while $120k of spouse wages sat underneath it unaccounted for, so
   total taxable income actually landed at $363,600 — well into the 24% bracket. The engine taxes the
   conversion correctly at the bracket it actually lands in; the user's *strategy* was mislabeled, not
   the tax miscomputed. The honest target is $123,600.
2. **ACA cliff misdetected and IRMAA understated** — both read the same `convMAGIFloors` (100%-gross
   SS + spouse wages), evaluated at a MAGI far below the household's actual exposure.
3. **Displayed per-year conversion tax and "Roth advantage" understated** for the same reason,
   inherited for free by the fix since `evaluateConversionPlan` consumes the same floor arrays.
**Fix:** `buildIncomeFloors` gains an optional `spouseTaxableIncomeByAge` param — the SAME map the
engine already stacks in its own floor, read here rather than re-derived, so the planner and the
engine can never model different households for the same window year again. The same value enters
BOTH `convFloors` (85%-taxable SS) and `convMAGIFloors` (100%-gross SS): the map is already net of the
spouse's own 401k deferral + HSA, so it's simultaneously the exact taxable-income and AGI/MAGI
contribution — only SS has a taxable-fraction asymmetry, wages don't. Wired into all three App.jsx
call sites: `convFloors`, `convMAGIFloors`, and — the one that matters most — the conversion
optimizer's `floorArgs` (missing it would let the optimizer search a spouse-blind model and hand the
user an "optimal" amount the display prices differently, the BUG-31 "two implementations of one
quantity" class).
**Investigated and deliberately left unchanged (not a bug):** `retIncomeFloor` (the steady-state
scalar) correctly excludes spouse wages — they're temporary by definition, and the per-year bracket
targets already pick up the fix via their own per-year floors. `calcRMDIncomeFloor` has a narrower,
real gap — see the addendum on BUG-84, above. `calcOptimizedScenario`'s `optWR` was already wired in
the original BUG-82 session.
**Where:** `src/model/conversion-planning.js` (`buildIncomeFloors`), `src/App.jsx` (`convFloors`,
`convMAGIFloors`, the optimizer's `floorArgs`).
**Tests:** T-F2.1 (the bug verbatim — $123,600 not $243,600), T-F2.2 (still fills exactly to the
bracket top with spouse wages present), T-F2.3 (inertness), T-F2.4 (both floor arrays get the
identical wage term — only the SS fraction differs), T-F2.7 (anti-divergence — the planner's floor
equals the engine's own internal formula, verbatim; the test that would have prevented this finding
existing at all), T-F2.8 (App-level: the optimizer's suggested amount moves when spouse wages are
introduced).
**Inert at default state:** `spouseTaxableIncomeByAge` defaults to `{}`, every lookup `?? 0`; no
spouse data ⇒ every floor array byte-identical. Golden master untouched.

### BUG-88 — False depletion reported beside a rising, held-out spouse 401k balance (found 2026-07-26, adversarial review of BUG-82's PR #59; fixed 2026-07-26, same session)

**Owner:** me_theguy. **Severity: HIGH (the highest-severity of the three — headline surfaces
actively contradicted each other for the target demographic).** **Found by:** the same Opus
adversarial review as BUG-89/BUG-90.
**What:** BUG-82's Option A holds the spouse's Traditional 401k bucket (`tradSp`) OUT of the drawable
pool (`spouseDrawable = 0`) until the spouse actually retires — by design, since it's their still-
working, likely-pre-59½ account. But a shortfall caused PURELY by that hold-out (the money exists in
`tradSp`, it's just walled off) was reported as genuine depletion: `depletionAge` got set and the walk
broke, while `balEnd`/`total` — computed from the FULL household balance including the untouched
`tradSp` — kept climbing. Three headline surfaces then disagreed off the exact same walk object:
`depletionAge` said "broke," the chart's last plotted point kept rising, and "Left at {lifeExp}"
showed the pre-break balance because the walk had stopped early. Verified repro: `depletionAge: 63`
beside a rising $1.23M household balance.
**Why this wasn't caught at BUG-82 ship time:** the mechanism (a last-resort penalized draw from the
held-out bucket) was explicitly NAMED in `docs/SPOUSAL-PLANNING-DESIGN.md` as
"shortfall-spillover-with-penalty" and deliberately deferred as "the rare case… the income floor
removes most of the pressure." The adversarial review's repro showed the deferral premise fails for
exactly the population BUG-82 exists to help: a long gap + an early primary retirement + modest
primary balances — not a rare edge case for that demographic, a common one.
**A first fix draft (written before this session's plan-first detour) was itself broken** — a
sub-dollar fixed-point residual still tripped the strict `> 0` depletion check, so the naive version
still reported `depletionAge: 63`, `yearsSustained: 4.999998`. Caught and corrected by a dedicated
Opus planning-and-audit pass before any of the three findings were implemented, per an explicit owner
instruction to plan all three together rather than implement piecemeal.
**Fix:** a gated, last-resort draw from `tradSp`, firing only when the ordinary pool (`drawInOrder`,
capped at `spouseDrawable = 0` during hold-out) genuinely can't cover the year. Draws only up to what's
actually in `tradSp`; grossed up via a 12-iteration fixed point for BOTH the ordinary income tax the
draw itself triggers (stacked on everything else taxed that year) and the 10% early-withdrawal penalty
under 59½ — the same statutory constants and pattern `simulation.js`'s money-events funding cascade
already uses. Charges the penalty when the spouse's age is unknown (conservative) rather than skipping
the hatch, which would leave the bucket walled off AND the contradiction unfixed. A `spillCapped` flag
(the fix for the broken first draft) makes the residual EXACTLY zero whenever the bucket covers the
full grossed-up need — never a spurious sub-dollar remainder. The depletion predicate now uses
`residualShort` (what the spillover couldn't close) instead of the raw shortfall, and the
fractional-year calc is reformulated to `(outflow − residualShort) / outflow` — proven algebraically
identical to the old `availableBeforeDraw / outflow` whenever there's no spillover, and regression-
tested bit-for-bit unchanged against a depleting no-spouse fixture.
**Surfaced, not silent:** `totalSpouseSpillover`/`totalSpouseSpilloverTax`/`firstSpouseSpilloverAge`
lifetime rollups (`buildRetirementPhase`) feed a pre-gated caption in both Classic and Horizon's Plan
Income Meter whenever a plan actually needed the hatch: "Your plan works, but it needs about $X
withdrawn early from your spouse's 401k (from age N), costing $Y in taxes and early-withdrawal
penalties." Capping the what-if VERDICT at "tight" when a scenario forces a spillover was deliberately
NOT folded in here — filed as ND-2 below, since it touches the shared verdict resolver used by three
other surfaces.
**Verified outcome on the repro:** `depletionAge` 63 → null, `yearsSustained` 4.6 → Infinity (37 rows
run to the horizon vs. 5 before), `endVal` — a real age-95 balance of $580,551 (down from the shipped
$1.23M, which the point of the fix — that balance was money the household could never actually touch
while simultaneously being called broke).
**Where:** `src/model/retirement-engine.js` (`buildRetirementWalkByAccount`), `src/model/retirement-
phase.js` (the rollups), `src/App.jsx` (the caption), `src/horizon/screens/PlanScreen.jsx`.
**Tests:** T-F1.1 (the bug verbatim, plus a monotonic-total invariant across the whole walk), T-F1.2
(structural no-contradiction invariant — you can never be declared broke in a year that still holds a
positive spouse balance), T-F1.3 (inertness), T-F1.4 (depleting no-spouse fixture bit-matched pre/post
— locks the `frac` reformulation), T-F1.5 (the penalty gate — strictly higher tax+penalty under 59½),
T-F1.6 (conservation), T-F1.7 (no double-dip with money events — a one-time outflow larger than the
drawable pool reaches `tradSp` only via the reported spillover, net of that year's contribution and
growth), T-F1.8 (genuine depletion still reported when the bucket is too small to close the gap),
T-F1.9 (the lifetime rollups are the lifeExp-bounded row sums, 0/0/null with no spouse). Also updated
the existing T2.7a (a prior CodeRabbit fail-closed fix's regression test) to reflect that a shortfall
with an unknown spouse age now correctly reaches the penalized escape hatch instead of reporting
immediate depletion — the two fixes compose as designed.
**Inert at default state:** no spouse data ⇒ `spouseHoldout` is always `false` ⇒ the whole block is
skipped ⇒ `residualShort ≡ spendShort + taxShort` exactly ⇒ the depletion predicate is provably
equivalent to the pre-fix formula. Golden master untouched.
**Independently re-verified (2026-07-26, adversarial-correctness review agent), plus two low-severity
findings not folded into the fix:**
1. **The "false depletion" and "spillCapped was necessary" claims both hold exactly** — the agent
   extracted the true pre-fix engine and A/B'd it directly: pre-fix reports `depletionAge 62` beside
   a rising $871,529 household total (100% held-out `tradSpouse`); without the `spillCapped` flag, the
   naive residual is $2–$167 in realistic fixtures (not the large "broken draft" residual found during
   implementation) — small enough to still falsely trip the strict `> 0` depletion check, confirming
   the flag is load-bearing, not defensive overkill.
2. **The residual is a FORCED zero, and the fixed point still truncates a small, real amount** —
   `residualShort = spillCapped ? … : 0` is a literal `0` so the depletion check can never trip, as
   claimed. But the underlying 12-iteration fixed point approaches from below and is truncated, so a
   spillover row is genuinely under-funded by a small amount: ≤ $5 at realistic ($60–100k) spend, up
   to $1,278 at $1M spend with a 13.3% state rate, max $226 across a 4,000-fixture randomized sweep
   (~0.13% of that year's outflow, always in the optimistic direction — never a false "sustainable").
   **T-F1.6's `< 1` conservation-identity tolerance is therefore fixture-dependent, not a general
   bound** — logged here rather than widened, since tightening the fixed point's iteration count would
   itself be a small, separate, low-priority change. Filed as part of BUG-98 (defensive-contract gaps),
   not a new bug number.
3. **Structural invariants held under adversarial fuzzing.** 4,000 randomized spouse-gap fixtures
   (4,290 spillover rows, 1,558 depleting walks) produced zero contradictions (no row with
   `depletionAge === r.age && r.total > 0 && r.tradSpouse > 0`), zero negative totals, zero spillovers
   outside a genuine hold-out year, and the `frac` reformulation's `endVal` deltas were exactly 0
   against the base engine in a separate 3,000-fixture A/B (the "byte-identical when omitted" claim is
   actually 1-ULP-identical in 27/3,000 cases — all in `yearsSustained`'s own floating-point rewrite or
   a case where the fixed engine correctly declines a `tradSp ≤ 0` guard the base engine didn't have;
   `endVal` itself was exactly 0 in every case, and the default golden-master state is unaffected).

---

### BUG-82 — The spouse had no retirement age of their own; contributions and RMD timing implicitly assumed both spouses retired the same year (found 2026-07-20, adversarial spousal-scenario audit; fixed 2026-07-25, dedicated gated-batch session)

**Owner:** me_theguy. **Severity: HIGH.** **Found by:** a second, differently-angled Opus audit
requested after the owner noted the first two spouse-engine (#30) audits — both static code reading
— had found suspiciously few bugs for a feature this complex. That pass EXECUTED the model with
constructed numeric scenarios and found the single largest gap in the spouse engine (root cause and
measured impact — a $2.38M understatement in the audit's repro scenario — are unchanged from the
original write-up; see git history for the full original text). This entry now describes the FIX.
**Fixed:** 2026-07-25, via an Opus-authored implementation plan (audited by a second Opus pass, then
reviewed for cross-variable systemic coherence by a third), implemented and gate-checked in 8
sequential batches (each independently reviewed, tested, and committed before the next started — see
commits `0f709c7`..`20a99b0` on `claude/spousal-planning-design-cjxl0i`).
**The chosen fix — Option A, gap-year contributions modeled inside the retirement-phase engine.**
The design doc's original proposal (re-index the accumulation seed to the spouse's own retirement
age) was **refuted during implementation planning**: `spouseSimData` already spans far past the
primary's retirement, and the seed already correctly reads the spouse's balance at the calendar year
the PRIMARY retires — re-indexing it to a LATER date and then growing/drawing it from the EARLIER
start point would double-count investment growth. The real defect was narrower: the walk never
modeled the spouse's ongoing gap-year contributions, income, or draw-timing once it started. The fix
keeps the seed unchanged and instead:
1. **Gap-year 401k contributions** are injected into a dedicated held-out bucket (`tradSp` in
   `buildRetirementWalkByAccount`, `retirement-engine.js`), sourced from the accumulation sim's own
   per-year `c401k` figures (reuse, not re-derive) via a per-primary-age map
   (`spouseContribByAge`) built by the new shared `buildSpouseRetirementSeed` (`retirement-phase.js`).
   Injected AFTER that year's growth (so `row.growth` stays a pure-earnings sum, rule 2b) and AFTER
   the spouse's own RMD block (a contribution doesn't inflate its own year's required distribution).
2. **The spouse's gross wages stack in the bracket floor** (a second map, `spouseTaxableIncomeByAge`)
   so conversions/RMDs/draws remain bracket-accurate above them, matching the existing SS/pension
   convention (the documented BUG-38 "floor is untaxed itself" simplification).
3. **Net cash offsets the portfolio draw** (a third map, `spouseIncomeFloorByAge`) — with any
   surplus beyond that year's spending need BANKED into the taxable pool rather than discarded. A
   naive `Math.max(0, expenses − … − spouseIncome)` formula would have silently vaporized a working
   spouse's excess income entirely; this was found and fixed during implementation (Batch 3), not
   present in the original bug report — the complexity-review pass estimated it would otherwise have
   erased 25–40% of the fix's own headline benefit.
4. **Option A draw gate:** the spouse's Traditional bucket is held OUT of the drawable pool while
   `spouseAgeFor(age) < spouseRetirementAge`, fully pooled once they retire (matching real household
   cash-flow behavior — couples don't typically draw down a still-employed spouse's 401k).
5. **The spouse RMD guard now keys on the LIVE `tradSp` balance**, not the frozen seed
   (`tradGrossSpouse`) — found during implementation (Batch 3): a spouse who accumulates purely from
   gap contributions (zero seed) still needs a required distribution once they reach RMD age.
**New input:** `spouseRetirementAge` (My Details → "Spouse & household"; null = "auto," the same
NUMERIC age the primary retires at — not the same calendar year, since ages differ). Bounds/stored-
value clamps mirror the existing `ssClaimingAge`/BUG-17 pattern in both directions.
**v1 scope — Traditional 401k only.** Roth/Taxable/HSA gap-year contributions are treated as spent
(dollar-conserving, not wrong the way the pre-fix behavior was wrong) — full parity filed as
**BUG-85** (Open, above), a genuine follow-up feature, not a quick patch.
**Rule-5 wiring (Step 6, expanded scope per the complexity review's finding B4):** the engine's
internal draw offset alone would have left `netPortfolioNeed`/`withdrawalRate`/the optimizer/Plan's
Income Meter acting as if the portfolio funded every dollar — exactly the "two implementations of one
quantity" class this codebase's whole correctness lineage exists to prevent. `calcNetPortfolioNeed`/
`calcRetIncomeFlow` (`drawdown.js`) and `calcOptimizedScenario` (`optimization.js`) all gained an
optional spouse-income term, read from the SAME map the engine consumes; `calcPlanDrivers` gained a
`temporaryIncomeBasis` flag so a gap-year-flattered withdrawal rate can't render as an unqualified
"on track" verdict; the Strategies withdrawal-order card explains a $0 draw list instead of showing
one silently.
**Conservation/reconciliation (Step 5):** the gap-year spouse inflow is neither growth, draw, nor tax
— every surface that reconciles the walk's balance changes (Flow-Down's conversion-window AND
distribution-phase identities, the Year-by-year ledger's `contrib` column, Journey's chapter
narratives) now carries it, closing a systemic identity gap the complexity review found across three
locations at once.
**Interim Monte Carlo caveat (addendum, not a full fix):** the Range lens still runs the OLDER
blended walk (`buildRetirementDrawdown`), which has no spouse bucket at all — porting it to the
per-account engine is its own large, independently-risky piece of work (Session B, deferred; see
Follow-ups below). Until then, `rangeView.spouseGapCaveat` (a boolean read off the same
`spouseContribByAge` map, plus a caption) warns the user the shaded range may understate their
outlook during an active gap, rather than silently disagreeing with the solid arc line.
**Superseded 2026-07-28 (Session B):** the Monte Carlo Range lens now walks the per-account
engine directly, and `rangeView.spouseGapCaveat` was retired outright (not merely silenced) —
see the Session B entry in `CLAUDE.md` → Status and BUG-93/BUG-94's own superseded note below.
**Files changed:** `src/model/retirement-engine.js` (the engine fix itself), `src/model/retirement-phase.js`
(`buildSpouseRetirementSeed`, the shared age-frame helpers `spouseAgeAt`/`primaryAgeAt`,
`buildRmdTaxByAge`), `src/model/simulation.js` (`c401kEmployee` row field, `spouseIncomeEndAge` param),
`src/model/drawdown.js`, `src/model/optimization.js`, `src/model/retirement-drawdown.js`,
`src/model/action-cards.js`, `src/model/flow-down.js`, `src/model/what-if.js`, `src/App.jsx`,
`src/components/HorizonShell.jsx`, `src/components/ArcGraph.jsx`,
`src/horizon/screens/MyDetailsScreen.jsx`, `src/horizon/screens/PlanScreen.jsx`,
`src/horizon/screens/JourneyScreen.jsx`, `src/horizon/screens/strategies/WithdrawalOrderFlow.jsx`.
**Tests:** 929 → 998 across the 8 batches (+69), including a full-pipeline byte-identity anchor
proving the same-calendar-year case reproduces pre-fix pooled behavior exactly (the strict-
generalization guarantee), an independently-computed closed-form accumulation anchor, and the
surplus-banking/live-RMD-guard regressions for the two defects found during implementation.
**Verified directly** (not just by test suite) against the audit's own repro scenario (primary
55→65, spouse 40, $120k each, 7% return): the spouse's Traditional 401k now grows through the gap
years instead of freezing, while `totalAtRet`'s SEED value is unchanged (the correction lives inside
the walk, not the at-retirement headline) for the "same calendar year" case — exactly as required.
**Follow-ups (documented, not part of this fix):** **BUG-85** (Roth/Taxable/HSA gap parity, Open,
above); **BUG-84** (withdrawal-order/conversion scalars stay primary-only — a separate design
question, Open, above); **Session B — Monte Carlo engine port**, its own future session/PR: porting
`runMonteCarlo` from the older blended walk to the per-account engine so the Range lens's shaded band
agrees with the solid arc line during a spouse's gap years, removing the interim caveat above. Sized
independently L ("comparable to the rest of this fix combined") with its own stop-and-surface abort
clause; the performance premise in the original plan draft (assuming `rangeView` only recomputes on
committed-plan changes) was found to be FALSE during planning — several raw `<input type="range">`
sliders (including the new "Spouse retires at" field) recompute it on every drag frame, so deferred/
idle scheduling of `rangeView` is a prerequisite for the port, not a fallback measured after the fact.
**Inert at default state:** no spouse data → every new parameter takes its zero/null/false default →
byte-identical to pre-fix output. Golden master untouched throughout all 8 batches.

### BUG-77 — Spouse Traditional 401k wasn't re-grown through a `calcWhatIfScenario` re-sim (found 2026-07-20, PR #57 pre-merge interoperability audit; fixed 2026-07-25, BUG-82 fix session, Batch 6/Step 8)

**Owner:** me_theguy. **Found by:** an Opus interoperability audit requested before merging PR #57,
specifically checking whether the spouse engine (#30) actually reaches every downstream consumer.
**What (unchanged from the original finding):** `calcWhatIfScenario`'s per-account-engine path
(`src/model/what-if.js`) seeded a scenario's spouse Traditional 401k bucket from
`retPhaseBase.tradGrossSpouse` unconditionally — including on a forced re-sim (a retirement-age
change, a contribution override, or a pre-retirement scenario event). The PRIMARY bucket was
correctly recomputed from the re-sim row, but the spouse bucket stayed frozen at its
base-retirement-age value.
**Fix:** a key simplification the BUG-82 architecture enables — because `spouseContribEnd` is now the
spouse's OWN retirement age (independent of the primary's, per BUG-82's fix), `spouseSimData` is
**scenario-invariant** to a primary-retirement-age change. So the fix needs no spouse RE-SIM at all
(contrary to the original finding's proposed `spouseSimInputs` re-run shape) — it only needs to
**re-seed** the spouse's balance and rebuild the gap-year maps at the scenario's retirement age, via
the SAME shared `buildSpouseRetirementSeed` builder App.jsx's own live path uses. `calcWhatIfScenario`
now accepts `spouseSeedInputs`; the resulting seed overrides `tradGrossSpouse` and the three gap-year
maps on the scenario's `buildRetirementPhase` call, so the what-if path can never diverge from the
live path (the two literally call the same function).
**Sibling fix, same commit (A8):** the resim's `buildAccumChart` call was also primary-only (the
resim branch's own copy of the BUG-80 gap) — `spouseChartInputs` threads the spouse series through,
so a scenario's dashed overlay is household-total, matching the solid arc.
**Where:** `src/model/what-if.js` (`calcWhatIfScenario`'s spouse re-seed + A8 chart fix), `src/App.jsx`
(`whatIfBundle`'s `spouseSeedInputs`/`spouseChartInputs`).
**Tests:** a later retirement-age scenario produces a LARGER re-seeded spouse trad (not the frozen
base value); the no-op scenario invariant still holds with a spouse present; the resim's accumulation
chart is verified household, not primary-only; no-spouse inputs reproduce the pre-fix output exactly.
**Inert at default state:** no spouse data → no effect. Golden master untouched.

### BUG-78 — `rmdTaxByAge` had no entry for a year where only the spouse has an RMD (found 2026-07-20, PR #57 pre-merge interoperability audit; partial fix 2026-07-25, BUG-82 fix session, Batch 1/Step 0)

**Owner:** me_theguy. **Found by:** the same interoperability audit as BUG-77.
**What (unchanged from the original finding):** `rmdTaxByAge` (`src/App.jsx`) was built by filtering
`retPhase.rmdSchedule` to rows where the PRIMARY's RMD is positive — `rmdSchedule` is deliberately
primary-only by design. In a year where only the spouse has an RMD (spouse older, or the primary's
Traditional 401k already depleted), no row existed in the filtered map for that age, so `rmdTaxByAge`
contributed nothing for a year with real household RMD tax due.
**Fix (the tax-correctness half — does not depend on #31):** a new pure export,
`buildRmdTaxByAge(rows)` (`retirement-phase.js`), replaces the primary-only filter with a UNION
filter (`(r.rmd ?? 0) > 0 || (r.rmdSpouse ?? 0) > 0`), reading `row.rmdTax` — which is already the
JOINT (primary + spouse) tax figure — for every row where EITHER spouse has an RMD. Deliberately no
`&& r.rmdTax > 0` clause (a low-bracket RMD rounding its tax to 0 must still appear in the map's key
set, or the map stops being a strict superset of the old one). Wired into `src/App.jsx` in place of
the old inline `Object.fromEntries(retPhase.rmdSchedule.map(...))`.
**Residual scope — genuinely deferred, tracked separately (#31):** this fix corrects the TAX-DOLLAR
map every downstream consumer (Monte Carlo, the blended what-if walk, the optimizer) actually reads
from. It does NOT add a spouse RMD sub-schedule to the DISPLAYED RMD table — that's a cosmetic,
household-dashboard presentation feature (#31), independent of this map's correctness and not blocked
by it.
**Where:** `src/model/retirement-phase.js` (`buildRmdTaxByAge`), `src/App.jsx` (`rmdTaxByAge`
construction).
**Golden-master safety:** at the default (no spouse) state `rmdSpouse` is 0 on every row, so the
union filter's key set equals the old `r.rmd > 0` set exactly — byte-identical map, byte-identical
downstream output.
**Inert at default state:** no spouse data → no effect. Golden master untouched.

### BUG-86 — Flow-Down accumulation bridge mis-attributed the spouse's entire balance as "Market growth" (found + fixed 2026-07-25, BUG-82 fix session, Batch 1)

**Owner:** me_theguy. **Found by:** the BUG-82 implementation-planning audit, while tracing every
consumer of `spouseSimData` for interactions with the new gap-year mechanism — a genuinely separate,
pre-existing bug, independent of BUG-82's contribution/seed-timing defect.
**What:** `calcFlowDown` (`src/model/flow-down.js`) computes Journey's Chapter 2 narrative
("Building years": Starting Portfolio + Contributions + Investment Growth = At Retirement) from
`startPortfolio` and `totalContrib`, both built from PRIMARY-only inputs (`bal401k`/`balRoth`/
`balTaxable`/`balHSA` and `contribRows`). For a spouse household, `totalAtRet` (the "At Retirement"
figure the waterfall reconciles TO) is household, but the waterfall's own start/contribution terms
were primary-only — so the entire spouse balance (starting balance + every dollar of spouse
contributions) fell out of the reconciliation as a residual and was silently folded into "Investment
Growth," overstating market growth and understating "Your contributions" for every spouse household.
**Fix:** `calcFlowDown` gained two optional params — `spouseStartBal` (the spouse's four starting
balances summed) and `spouseContribRows` (the spouse's accumulation-phase sim rows, index-aligned to
the primary's the same way `buildAccumChart`'s BUG-80 fix already zips them) — folded into
`startPortfolio` and `totalContrib` via a shared `sumContrib` helper. Both default to `0`/`[]` (byte-
identical when omitted).
**Where:** `src/model/flow-down.js` (`calcFlowDown`), `src/App.jsx` (`flowData` memo's
`spouseStartBal`/`spouseContribRows` args, sourced index-based from `spouseSimData.slice(0, phase2End)`
— NOT age-filtered, since `spouseSimData` rows carry the spouse's own age).
**Inert at default state:** no spouse data → no effect. Golden master untouched.

### BUG-87 — Household MAGI counted an already-retired earner's income forever, past their own retirement (found + fixed 2026-07-25, BUG-82 fix session, Batch 6/Step 7)

**Owner:** me_theguy. **Found by:** the BUG-82 implementation-planning audit — a genuinely separate
bug from BUG-82's contribution/seed-timing defect, located in the working-year tax basis rather than
the retirement-phase engine.
**What:** `runSimulation` (`src/model/simulation.js`) computed `spouseGrown` — the OTHER earner's
income, feeding `netOrdinaryIncome` and from there the Roth phase-out and the LTCG bracket —
UNCONDITIONALLY for the entire accumulation window, regardless of whether that earner had already
retired. A household where "my spouse retires at 55" still had the spouse's salary counted in
household MAGI all the way through the PRIMARY's retirement at 70 — wrongly suppressing Roth
contributions and inflating the LTCG drag for 15 years after the spouse stopped earning. A mirror
defect existed on the spouse's OWN sim: the primary's income was counted in the spouse's MAGI
forever too, including years after the primary retired.
**Fix:** a new optional `spouseIncomeEndAge` param (an absolute age in the SUBJECT's own frame,
inclusive — following the `contribEnd*` precedent): `spouseGrown` resolves to 0 once
`age > spouseIncomeEndAge`. `null` (the default, and every existing caller's implicit value) is the
unconditional legacy formula — byte-identical. `src/App.jsx` wires it symmetrically: the primary's
sim call passes the spouse's own retirement age (converted to the primary's age frame), and the
spouse's own sim call passes the mirror cutoff from the primary's retirement age (fixing the mirror
defect in the same change, since both sim calls needed the identical mechanism).
**Where:** `src/model/simulation.js` (`spouseIncomeEndAge` param, `spouseGrown` computation),
`src/App.jsx` (both `runSimulation` call sites, `whatIfSimInputs`).
**Tests:** the inclusive-boundary case (income counts fully AT the cutoff age, drops to 0 the very
next age — matching `contribEnd*`'s convention exactly); the null-equivalence case; a downstream
LTCG-bracket-relaxation case with exact computed values, proving the fix actually changes tax
outcomes, not just an inert flag.
**Scope note — honestly narrower than it sounds for BUG-82's own headline demographic:** for a
YOUNGER spouse retiring AFTER the primary (the case BUG-82 itself exists for), this fix is
practically inert on the primary's own sim — nothing in `App.jsx` consumes a primary `simData` row
past the primary's own retirement age anyway. It's real and load-bearing for the OPPOSITE direction
(an older spouse, or any earner who retires before the other) and for the spouse's own accumulation
sim's Roth/LTCG treatment during the gap years, which is why it was still worth fixing in this same
session rather than deferred.
**Inert at default state:** no spouse data → no effect. Golden master untouched.

### BUG-83 — ArcGraph re-derived the Monte Carlo success threshold in the render layer; primary HSA bound didn't widen under family coverage (found + fixed 2026-07-23, CodeRabbit review of PR #57 commit 325eaad)

**Owner:** me_theguy. **Found by:** CodeRabbit, two findings in the same review round.
**What (1 — ArcGraph):** the prior review-fix batch (BUG-79/80's commit) had "fixed" a hardcoded
`80` fallback in `ArcGraph.jsx`'s Range-caption tone by replacing it with
`ASSUMPTIONS.MONTE_CARLO_SUCCESS_GUIDELINE_PCT` — but CodeRabbit correctly flagged that the
comparison itself (`pct >= threshold`) shouldn't live in `src/components/**` at all (render-only,
rule 10), regardless of whether the literal is named. The fallback was also provably dead: the
`rangeView` bundle (App.jsx) sets `successOk` to null exactly when `successPct` is null, and the
caption already early-returns on `successPct == null` above this line — so `successOk` is
guaranteed non-null by the time the fallback would fire.
**What (2 — HSA):** the PRIMARY's own `accountsBundle` HSA field (`src/App.jsx`) hardcoded
`HSA_LIMIT_2026` (self-only) as its slider bound regardless of `hsaCoverageType`. Under family
coverage the sim already lets the primary alone contribute up to the full family ceiling
(`hsaLimit: primaryHsaLimit`, already wired) — but the UI bound never caught up, so a user
couldn't actually enter a valid family-coverage contribution through the primary account editor.
**Fix:** (1) `ArcGraph.jsx`'s `pctColor` now trusts `rangeBands.successOk` directly, no local
threshold re-derivation (the now-unused `ASSUMPTIONS` import removed). (2) the primary
`accountsBundle`'s HSA `contrib.max` now uses `primaryHsaLimit` (the same raw, un-split ceiling
the spouse bundle already uses for its own HSA bound) instead of `HSA_LIMIT_2026`.
**Where:** `src/components/ArcGraph.jsx`, `src/App.jsx` (`accountsBundle`).
**Tests:** `setter-bundles.test.js` — primary `accounts.hsa.contrib.max` widens to 8,750 under
family coverage, alongside the existing spouse-side assertion.
**Inert at default state** (default coverage is self-only; Range view needs Monte Carlo data to
render at all) — golden master untouched.

### BUG-81 — Entering spouse account balances alone bypassed the filing-status guardrail (found + fixed 2026-07-20, adversarial spousal-scenario audit)

**Owner:** me_theguy. **Found by:** the same second-pass adversarial audit as BUG-82, by actually
constructing two identical households differing only in filing status and diffing the output.
**What:** the existing filing-status guardrail (feature #16, shipped standalone) only ever checked
`spouseIncome > 0 && filingStatus !== "mfj"`. The #30 spouse-accounts card is a SECOND entry point
for spouse data (account balances) that the guardrail's condition never accounted for — a user
could enter spouse Traditional/Roth/Taxable/HSA balances with `spouseIncome` still 0 and
`filingStatus` still "single" and get no warning at all, while the household RMD/tax math silently
summed both accounts under single-filer brackets.
**Measured impact:** two identical households (two $1.5M Traditional 401ks, both age 73) differing
only in filing status — combined RMD ($113,208) taxed at single brackets ($16,076) vs. MFJ
($9,225): a **$6,851/yr overstatement** for a household that entered spouse balances but never
touched filing status.
**Fix:** widened the guardrail's trigger from `spouseIncome > 0` to `hasSpouse` (App.jsx) — one
flag covers both entry points. The check itself moved to a named, pre-gated App.jsx boolean
(`spouseFilingMismatch`) rather than living only inline in Classic's JSX, so **Horizon's**
"Spouse & household" My-details card can render the same warning without doing the
`filingStatus !== "mfj"` comparison itself (rule 10) — the gap existed on both surfaces, not just
Classic's.
**Where:** `src/App.jsx` (`spouseFilingMismatch`, the widened Classic guardrail condition +
copy), `src/horizon/screens/MyDetailsScreen.jsx` (the same warning, spouse card).
**Tests:** `spouse-household.test.js` — entering spouse balances alone (no spouse income) trips
the flag; MFJ filing status never trips it even with spouse balances present.
**Inert at default state:** no spouse data → flag stays false. Golden master untouched (display
guardrail only, no model math changed).

### BUG-79 — `calcWhatIfScenario`'s reported `scenarioTotalAtRet` excluded the spouse Traditional 401k bucket (found + fixed 2026-07-20, PR #57 pre-merge interoperability audit)

**Owner:** me_theguy. **Found by:** an Opus interoperability audit requested before merging PR #57, tracing whether the spouse engine (#30) reaches every downstream consumer.
**What:** `buildRetirementPhase` (the walk `calcWhatIfScenario` calls) is correctly seeded with the household's spouse Traditional 401k via `retPhaseBase.tradGrossSpouse`, but the SCALAR `scenarioTotalAtRet` the function *reports* alongside that walk was `seeds.tradGross + seeds.roth + seeds.taxable + seeds.hsa` — four fields, none of them the spouse bucket.
**Impact:** for a household with spouse 401k dollars, every scenario preview built on `calcWhatIfScenario` — Plan's "Try a change" lever preview and the new #55 "Working longer" card both included — reported a scalar that omitted the entire spouse Traditional balance while `baseTotalAtRet` (household) included it. A pure spend-lever drag (which should show $0 change to the retirement balance) instead showed a phantom drop equal to the spouse's trad balance; #55's working-longer comparison could show a *negative* portfolio delta for working additional years.
**Root cause:** the scalar was written before #30 existed and was never updated when the spouse bucket was added to the walk's inputs — an "accidental silo," not a documented deferral.
**Fix:** `scenarioTotalAtRet` now adds `retPhaseBase.tradGrossSpouse ?? 0`, matching what the walk is actually seeded with. The bucket itself is NOT re-grown through a scenario re-sim (that's the separate, larger BUG-77, left open) — this fix only makes the reported number consistent with the walk's own (possibly frozen-at-base) basis.
**Where:** `src/model/what-if.js` (`calcWhatIfScenario`'s per-account-engine branch).
**Tests:** `what-if.test.js` — a household fixture (`tradGrossSpouse: 600_000`) asserts a non-resim override (`annualExpenses` change) reports `scenarioTotalAtRet` unchanged from the household `baseTotalAtRet`.
**Inert at default state:** no spouse data → `tradGrossSpouse` is 0/absent → no effect. Golden master untouched.

### BUG-80 — the portfolio arc's accumulation phase was primary-only while the retirement phase was household (found + fixed 2026-07-20, PR #57 pre-merge interoperability audit)

**Owner:** me_theguy. **Found by:** the same interoperability audit as BUG-79.
**What:** `docs/ARCHITECTURE.md` documented `totalAtRet`, the drawdown chart, and the `retVals` display cards as HOUSEHOLD once #30 shipped, but only the *retirement* half of that promise was true. `accumChart` (`src/App.jsx`, feeding `totalChartData` via `buildAccumChart`) was built from primary-only `simData` and primary-only starting balances; `retirementWalk` (from `retPhase`/`retPhaseBase`) was correctly household. The two were concatenated into one series (`totalChartData = [...accumChart, ...retirementWalk.rows]`).
**Impact:** for any household with spouse account balances, the arc climbed through the working years at the primary-only total, then jumped up by the full spouse balance exactly at the retirement-age boundary — a visible, dishonest discontinuity, reintroducing the "no chart jump" defect class this codebase specifically fixed once already for the pre-#30 tax-basis case.
**Fix:** `buildAccumChart` (`src/model/accumulation.js`) gained optional `spouseSimData` (default `[]`) and `spouseStartingBal` (default `0`) params. `spouseSimData` is zipped in **by array index**, not joined by the `age` field — both `simData` and `spouseSimData` are generated over the same shared `totalYears` (one row per calendar year), but each carries the respective person's OWN age, so a spouse of a different age would never match a primary row by age value; the merged row keeps the primary's age (the chart's x-axis throughout the app). Absent spouse args reproduce the pre-#30 chart exactly. `src/App.jsx`'s `accumChart` memo now passes `spouseSimData` + the four spouse starting balances.
**Residual, not fixed here (documented separately):** `calcMilestones` (Classic "$1M crossing" milestone cards) and `buildAccumulationRows` (Year-by-year table's accumulation-phase Contrib/Growth columns) are two more primary-only consumers of raw `simData` found during the same audit. Both need a genuine per-row household reconciliation (contribution/growth split across two people's sim rows with different bases), which is more invasive than this session's review-fix scope — filed as a follow-up rather than rushed. Also see BUG-77 (spouse bucket frozen through a `calcWhatIfScenario` re-sim) and BUG-78 (RMD tax map gap in spouse-only-RMD years), found by the same audit.
**Where:** `src/model/accumulation.js` (`buildAccumChart`), `src/App.jsx` (`accumChart` memo).
**Tests:** `accumulation.test.js` — omitting spouse args reproduces the single-person chart byte-for-byte; index-alignment (not age-join) verified with a spouse at a different age; a spouse sim shorter than primary's contributes 0 for the missing tail years.
**Inert at default state:** no spouse data → `spouseSimData` is `[]`, spouse balances are 0 → no effect. Golden master untouched.

### BUG-75 — `surplusApplySite` double-applied committed retirement-phase events in both its previews (found 2026-07-13, Fable adversarial review of PR #53; FIXED 2026-07-19)

**Owner:** me_theguy. **Fixed:** 2026-07-19 (Batch 0 of the reprioritized-backlog build, owner-approved plan).
**Root cause:** `surplusApplySite`'s "current" and "candidate" previews passed the full committed
`moneyEvents` array into `calcWhatIfDelta({ ...whatIfBundle, moneyEvents })`, but the walk-side
merge (`what-if.js`) already concatenates `retDrawShared.moneyEvents` — the committed
retirement-phase list — with the param-derived `retEvents`. Every committed retirement-phase event
was therefore counted twice in both previews' walks (absolute `yearsSustained`/depletion figures
wrong whenever committed retirement-phase events existed; deltas mostly survived by symmetry).
**Fix (contract change, both halves):**
1. `calcWhatIfDelta`'s `moneyEvents` param is now documented as **scenario ADDITIONS only** —
   committed events travel inside the bundle (`simInputs.moneyEvents` for the sim,
   `retDrawShared.moneyEvents` for the walk).
2. The forced-re-sim path now merges `[...(simInputs.moneyEvents ?? []), ...accumEvents]` instead
   of overriding with the additions alone — without this, dropping the param from callers would
   have re-introduced the BUG-34/BUG-61 basis-mismatch class (a `contribOverrides` re-sim dropping
   committed accumulation events while the no-resim baseline `baseTotalAtRet` includes them).
   This also fixes the same latent asymmetry in Classic `WhatIfPanel`'s delta mode (its forced
   re-sims previously dropped committed accumulation events).
3. `surplusApplySite` no longer passes `moneyEvents` (and dropped it from its dep array).
**Where:** `src/App.jsx` (`surplusApplySite`), `src/model/what-if.js` (param doc + re-sim merge).
**Tests (+2):** `what-if.test.js` → "committed events contract (BUG-75)": (a) a committed
retirement-phase event is counted exactly once (equals a direct `buildRetirementDrawdown` with the
event passed once); (b) a no-change `contribOverrides` candidate matches the no-override current
with committed events in BOTH phases — the anti-divergence property the Apply-site markets.
Golden master untouched (defaults have no events).

---

### BUG-40 — `taxView.composition.total` missed `drawTax` on extra 401k draws (found 2026-06-24, PR #38 review; FIXED 2026-07-19)

**Owner:** me_theguy. **Fixed:** 2026-07-19 (Batch 0 of the reprioritized-backlog build).
**Root cause:** the Taxes tab's "Retirement-phase tax composition" total was `rmdTaxBite +
convTaxTotal` only; `drawTax` (the engine's incremental tax on 401k draws beyond RMDs/conversions)
existed only as a per-row field with no scalar rollup, so under-funded plans understated the
displayed retirement-phase tax total.
**Fix (the documented preferred path):** `buildRetirementPhase` now returns
`totalDrawTax = Math.round(Σ row.drawTax)` over the display rows (bounded to `lifeExp`, same
convention as `rmdTaxBite`/`conversionCost` so the three compose); `taxViewBundle` includes it in
`composition.total` and as a third `{ key: "draw", label: "401k draw tax" }` segment; the
NumbersScreen anchor copy now reads "(RMD, conversion & 401k draws)".
**Conscious exclusion, recorded:** the engine's per-row `inflowTax` (tax on one-time *taxable
inflow events*, e.g. an inherited pre-tax IRA) remains outside the composition bar — it is
event-driven (zero unless such an event exists) and is a tax on external money entering the plan,
not on the plan's own retirement drawdown; revisit if taxable-inflow events become prominent.
**Where:** `src/model/retirement-phase.js` (rollup + return field), `src/App.jsx` (`taxViewBundle`),
`src/horizon/screens/NumbersScreen.jsx` (copy), `src/horizon/__tests__/numbers-tabs.test.js`
(mock gains the draw segment + segment assertion).
**Tests (+1):** `retirement-phase.test.js` — `totalDrawTax` equals `Σ(row.drawTax)` over display
rows, and is strictly positive in a trad-only fixture where every pre-RMD draw comes from the 401k.
**Inert at the default state** (near-zero `drawTax` at the default spend) — golden master untouched.

---

### PR #56 review-fix batch — multi-goal/Ideas-retirement/calm-money (found + fixed 2026-07-16/17, pre-merge)

Bugs found by the PR's review battery (Gemini + CodeRabbit ×2 rounds + an internal Fable
adversarial review + a Fable math-contamination audit) and fixed on the branch before merge.
All display/control-layer — golden master untouched throughout; suite 823 → **840** across the PR.

1. **ExploreTray collapse trap while a change is staged** (Gemini; fixed `21992d8`). The
   auto-open fallback (`open ?? (changeStaged ? "change" : null)`) re-resolved to `"change"` on
   every render, so clicking the facet tab to collapse a dirty tray silently did nothing —
   permanently stuck open until Discard. Fix: explicit `"closed"` sentinel that wins over the
   fallback; offsets survive collapse (they live in PlanScreen), the staged dot stays visible on
   the tab, one click reopens. Regression test: collapse-while-staged → reopen → Apply present.
   **Where:** `src/horizon/ExploreTray.jsx`; test in `plan-screen.test.js`.
2. **Longevity preview delta contradicted the age-based display** (internal adversarial review
   F1, the batch's one P1; fixed `4a52713`). The calm-numbers change switched the *display* to
   depletion ages ("to age 87") but the *delta* still diffed `Math.round(years)` — a lever drag
   could render "to age 87 → to age 88 · no change", or "+2 yrs" beside two identical ages
   (year-fractions straddling .5; worse when a retire-earlier lever shifts `startAge`, decoupling
   duration from depletion age entirely). Fix: `longevityMetric` diffs the depletion **ages**
   when both are known — the same basis the display shows — falling back to whole years only in
   the rare null-depletion branch. **Where:** `src/model/apply-preview.js`; regression tests lock
   both contradiction directions.
3. **Goal rows misstated typed amounts** (F2; fixed `4a52713`). `GoalsPanel`'s summary
   $100-rounded *typed* values — a typed $49/mo read a fabricated "−$0/mo", $250/mo read
   "$300/mo" while the sheet showed $250. Fix: typed values render `fmtFull` (two-tier policy),
   both monthly and one-time branches. **Where:** `src/horizon/GoalsPanel.jsx`.
4. **Statement ledger stopped reconciling to its own total** (F3; fixed `4a52713`). Applying
   CodeRabbit's "consistency" suggestion had put per-row nearest-$100 rounding on the
   "Income for life" column — a verify-ledger with a bolded total — drifting rows vs total by up
   to ~$200. Fix: all four income rows restored to the model's exact-dollar monthly values (SS
   row now reads `sv.monthlyHHSS` directly instead of re-deriving from annual `householdSS`), so
   the column sums by model construction. **Where:** `src/horizon/screens/NumbersScreen.jsx`.
5. **Canonical-formatter rounding asymmetry + `−$0`** (CodeRabbit r1; fixed `61c09e4`).
   `Math.round` on signed values rounds halves toward +∞ (`fmtMonthly(-150)` → "−$100" vs
   `fmtMonthly(150)` → "$200"), and small negatives rendered "−$0". Fix: round absolute
   magnitudes, sign only nonzero results; `negFull`/`fmtDeduc` later collapsed to negate
   *through* `fmtFull` (CodeRabbit r2, `f7c2357`) so a genuine $0 deduction reads "$0", not
   "−$0". **Where:** `src/formatters.js`, `NumbersScreen.jsx`; formatter tests 9 → 24 cases.

**Also recorded from the batch:** one CodeRabbit suggestion was *corrected* rather than applied
(`fmtMo` on already-monthly values would divide by 12 twice — `fmtMonthly` was the right
consistency fix), and one declined with rationale on the PR thread (moving `CUSTOM_GOAL_SEED`/
`resolveRetireJump` out of `presets.js` — preset data stays co-located and value-locked; the
clamp is slider-bounds mechanics matching accepted precedent). A final **math-contamination
audit** (owner request: "did formatting leak into the calculations?") came back clean app-wide:
every formatter output dead-ends at a render; every committed value traces to raw state or raw
model output; the only rounding reaching committed state is the pre-existing, deliberate
whole-dollar monthly-spend slider quantization (≤$6/yr, once per commit, never compounds).

---

### BUG-76 — Accounts-tab "Today" milestone pill always showed $0 (found + fixed 2026-07-15, user report)

**Owner:** me_theguy. **Found by:** user report — "the Age x · today value says 0 regardless of age"
on Numbers → Accounts, directly contradicting the banner right above it showing the real balance.

**What it was:** two stacked defects, both in `src/model/accumulation.js`:
1. **The lifetime chart series never contained the current age.** `runSimulation`'s rows start at
   `currentAge + 1`, and `buildAccumChart` only seeded an `age: currentAge` row in the
   already-retired special case (`safeRetAge === currentAge`) — so `totalChartData` normally
   started one year in the future, with no "today" point at all.
2. **`calcChartMilestones`' `balAtAge` fabricated $0 for out-of-range ages.** With no row at
   `currentAge`, the exact-match and interpolation paths both missed and the accessor hit a
   silent `return 0` fallback — the "missing data is not zero" shape principle 10 forbids. The
   unit tests never caught it because their synthetic chart started exactly at `currentAge`,
   unlike the real series.

**Fix:** (1) `buildAccumChart` now seeds the `{ age: currentAge, total: bal401k + balRoth +
balTaxable + balHSA }` row **unconditionally** — the same four-balance basis as
`horizonProps.currentTotalSaved`, so the pill and the Accounts banner agree by construction (the
already-retired branch collapsed into the same line, no behavior change there). (2) `balAtAge`
returns **null** instead of 0 for an age outside the charted range; the existing
`filter(r => r.total != null)` then drops the anchor entirely — a milestone is either real or
absent, never a fake $0.

**Consumers audited (all safe/improved):** the arc + Classic lifetime charts now honestly start
at the current age (previously ArcGraph's below-range clamp silently substituted next year's
balance for event dots/scrub at `currentAge`); a First-$1M crossing in the first year is now
detectable; `calcWhatIfScenario` builds its accumulation chart through the same `buildAccumChart`
helper (or reuses `baseChart`), so the no-op-overlay deep-equal invariant holds on both paths;
`calcFlowDown` uses `accumChart` only inside a `Math.max` that already includes `startPortfolio`.
Golden master untouched (it locks no chart data).

**Where:** `src/model/accumulation.js` (`buildAccumChart` seed, `balAtAge` null fallback);
`src/model/__tests__/accumulation.test.js` (+3 regression tests: unconditional today seed; a
series starting at `currentAge + 1` must DROP the Today anchor, not render $0; chained
buildAccumChart → calcChartMilestones Today == sum of current balances);
`src/model/__tests__/what-if.test.js` (2 assertions updated — the lifetime series now starts AT
`currentAge`, the old `currentAge + 1` expectation was the bug's shape).

**Verified:** full suite 824 → 827 green, golden master byte-identical; lint clean; build OK;
browser-verified — Today pill reads $165k matching the banner at the default state, and the repo
verifier passes every screen + Numbers sub-tab.

---

### BUG-74 — Accumulation event spend beyond the taxable balance was silently "free" (filed 2026-07-13; FIXED same day after user re-report)

**Owner:** me_theguy. **Found during:** duration-event income model pass code review; initially deferred, then **promoted to a fix the same day** when the user re-tested with a bigger trip ($15k/mo × 36 mo, $0 income) and the impact barely moved — tripling the trip's spend (+$324k) moved the at-65 impact by only ~$75k, because everything beyond the taxable balance was being forgiven.

**What it was:** `src/model/simulation.js` clamped `taxable + cTaxable + eventAdj` to `Math.max(0, ...)` — an accumulation-phase event outflow exceeding the taxable balance silently "spent" only what existed and stubbed the rest as paid. No other account was touched, no warning surfaced. The retirement engine handles the same situation honestly (`spendShort` → visible depletion); accumulation swallowed it.

**Fixed (2026-07-13, follow-up to PR #53):** the shortfall now cascades the way a person actually funds one:
- **taxable** (exhausted) → **Roth** (grossed up for the 10% early-withdrawal penalty under 59½ per the owner-review refinement below — no ordinary income tax on the Roth portion, basis untracked) → **Traditional 401k**, GROSSED UP so the net covers the need: the withdrawal is ordinary income stacked on the year's income (`stackedIncomeTax`, same primitive the conversion path uses) plus the 10% early-withdrawal penalty under 59½ (`EARLY_WITHDRAWAL_AGE`/`PENALTY`), solved by the fixed-point iteration the engine's tax-on-tax gross-up established (run to sub-dollar convergence). **HSA is never touched** (medical-restricted).
- The 401k draw joins the LTCG-bracket stack (`ltcgRate(nOI + conv + eventDraw401k)`) and any same-year working-year conversion's tax stacks on top of the draw.
- Anything still unfunded once every account is empty is reported per-row as **`eventShortfall`** (plus `eventNet`/`eventDrawRoth`/`eventDraw401k`/`eventDrawTax` row fields). `calcWhatIfScenario` sums it into **`eventFundingShortfall`** (+`firstShortfallAge`); the shared **`verdictForScenarioResult`** (new — used by `verdictInfoForScenario` AND both tick rails, so a tick can never disagree with the card) forces **"unaffordable"** with an honest label ("$X of this can't be funded from savings"); `evaluateLifeEvent` exposes a named `fundingShortfall` field and the LifeEventSheet renders the warning line.
- **Ledger honesty:** `buildAccumulationRows`' `draw` column (previously hardcoded 0, hiding event spending entirely) now shows the event outflow that actually left the portfolio, and its `tax` column includes the funding draw's tax/penalty.
- **Two display fixes shipped alongside (same user report):** (1) the sheet's "Portfolio at 65" bullet showed ONLY the signed delta ("−$857k"), which read as a negative *balance* — now absolute + delta ("$2.4M (−$1.7M)"), matching the "Left at 90" format; (2) the cushion label could show an absurd "≈366 yrs of runway" for SS-covered plans (near-zero net draw denominator) — labels now cap at `ASSUMPTIONS.CUSHION_LABEL_CAP_YEARS` (50): "50+ yrs of runway left at 90" (the underlying `marginYears` stays exact for the verdict math).

**Verified:** the user's exact scenario ($15k/mo × 36 @ 45, $0 income, default profile) now shows Portfolio at 65: $2.4M (−$1.7M) and Left at 90: $2.4M (−$2.0M) — the at-65 impact doubled once the swallowed spend + funding taxes actually left the portfolio. Browser-driven end to end.

**Known simplifications (documented in the code):** Roth funding draw pays the 10% early-withdrawal penalty (per the owner-review refinement below) but no ordinary income tax — basis untracked, treated as withdrawable contributions for the tax side only; the 401k funding draw is excluded from the same year's Roth-phase-out MAGI (computed earlier in the loop; marginally generous, tiny); **committed**-plan surfaces (arc, Plan screen) don't yet surface a committed event's `eventShortfall` — only the what-if evaluation path does (the sheet re-evaluates on edit, so the warning IS visible whenever the event is opened). Golden master untouched (no events at default; cascade inert when taxable covers the event).

**Where:** `src/model/simulation.js` (cascade + row fields), `src/model/what-if.js` (`eventFundingShortfall`/`firstShortfallAge`, `verdictForScenarioResult`, label cap, `fundingShortfall` field), `src/model/accumulation.js` (ledger draw/tax columns), `src/horizon/LifeEventSheet.jsx` (absolute+delta bullet, shortfall warning), `src/config/irs-2026.js` (`CUSHION_LABEL_CAP_YEARS`).

**Tests:** +7 (cascade order/conservation, gross-up identity, 59½ penalty split, all-accounts-drained shortfall, the user-reported tripling-monotonicity regression, cascade-inert-when-funded, verdict-override + label-cap locks). 812 → 819.

**Owner-review refinements (2026-07-13, same day, PR #54 review — three spec corrections):**
1. **Salary growth clock pauses during a sabbatical.** The sim's salary now uses a pause-aware
   growth CLOCK that advances by `incomeFrac` each year (1 in normal years and for the seeded
   full-pay default — behavior-preserving; 0 during a zero-income pause; fractional for partial
   pay). A $100k salary paused for 3 years resumes at the level it left off and grows from there —
   it does not rejoin a clock that kept ticking ("age 36 should be 103k, not ~120k"). Spouse income
   stays on the unpaused age clock (income replacement is primary-only, #30 scope);
   `projectedIncomeAtAge` remains the NO-EVENT baseline (UI "usual pay" seed +
   `eventIncomeImpact.usualPay`), equal to the clock when no events exist (golden-master safe).
   New `salary` row field exposes the per-year figure.
2. **Roth funding draws pay the 10% early-withdrawal penalty under 59½ too** (grossed up; no
   ordinary income tax on the Roth portion — conservative middle, basis untracked). "The user
   cannot take out anything in their Roth and 401k without big penalty."
3. **Retirement-funded events can never read "comfortable".** New scenario fields
   `eventRetirementDraw`/`eventRetirementDrawTax` (gross Roth+401k drawn + tax/penalties leaked);
   `verdictForScenarioResult` caps the verdict at **"tight"** whenever they're non-zero, with the
   honest label "needs early retirement-account withdrawals to fund"; `evaluateLifeEvent` exposes
   `retirementFunding` and the sheet renders "Needs $X of early retirement-account withdrawals
   ($Y in taxes & penalties)". Only a fully-cash-funded event can be "comfortable".
   Display: the sheet's balance bullets now use phrases — "decreases/increases by $X" (and
   "$X less/more" on the income bullet) — instead of signed parentheticals, per owner spec.
   Browser-verified: the $15k/mo × 36 scenario now reads "is tight — watch it" with the $360k
   early-withdrawal warning; Portfolio at 65 $2.2M (decreases by $1.8M). 819 → 824 tests.

**Post-refinement review fixes (2026-07-14, PR #54, CodeRabbit rounds 2–3 — all display/timing
corrections, golden master untouched, 824 tests throughout):**
1. **One timing convention for the funding cascade.** The cascade originally ran the Roth/401k
   fallback AFTER `trad`/`roth` had already compounded for the year — event-funded dollars that
   spilled past taxable got a phantom extra year of investment returns. Moved the entire cascade
   (taxable → Roth → 401k) to run on PRE-growth balances, matching the taxable account's own
   timing; contributions still land after, unaffected.
2. **De-duplicated the funding-shortfall / retirement-withdrawal warning.** `verdictInfoForScenario`'s
   `marginLabel` override and `evaluateLifeEvent`'s dedicated `fundingShortfall`/`retirementFunding`
   fields both fired on the same condition, so the LifeEventSheet showed the same fact twice with
   two different dollar formats (a raw `.toLocaleString()` figure in the subtitle, an abbreviated
   `fmt()` figure in the bullet). The `marginLabel` override now carries the REASON only ("part of
   this can't be funded from savings" / "needs early retirement-account withdrawals to fund"); the
   sheet's dedicated bullets are the sole carriers of the dollar amounts and detail (firstAge,
   tax/penalty breakdown).
3. **Trivial:** renamed the gross-up loop's block-scoped `g` to `grossDraw` — it shadowed the outer
   `g = incomeGrowth / 100` in the same function (no behavior change).

---

### BUG-70 — `LifeEventSheet`'s segmented toggles missing `aria-pressed` (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52.
**What it was:** the 4 money-in/out and one-time/monthly toggle buttons (converted from `div`s to
native `<button>`s in an earlier fix round for keyboard focus/activation) still didn't expose
their 2-state toggle-group selection to screen readers — no `aria-pressed`. `IdeasScreen.jsx`'s
segmented mode control already sets `aria-pressed={on}` for the identical pattern.
**Fix:** added `aria-pressed` (keyed to `!isInflow`/`isInflow`/`mode === "once"`/`mode ===
"monthly"`) to all 4 buttons. **Files:** `src/horizon/LifeEventSheet.jsx`. Display-only; golden
master untouched.

### BUG-71 — `calcWhatIfScenario`'s fallback resim path dropped `addlPreTaxBal` (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52.
**What it was:** the same basis-mismatch bug class this PR fixed twice already (the per-account-
engine path and `calcWhatIfDelta`'s resim) existed a third time in `calcWhatIfScenario`'s older
fallback path (`buildRetirementDrawdown`, dead-in-production — App.jsx always supplies
`retPhaseBase` so the engine path runs — but kept for any caller/test not yet migrated). Its
`needsResim` branch rebuilt `startBal` from `resimAt` without adding `addlPreTaxBal` back, so any
future caller passing a nonzero `addlPreTaxBal` through this path would silently get a wrong
scenario total.
**Fix:** added `+ (addlPreTaxBal ?? 0)` to the fallback branch's `startBal`, matching the primary
path's `seeds.tradGross = (resimAt.tradGross ?? 0) + (addlPreTaxBal ?? 0)`. **Files:**
`src/model/what-if.js`. Golden master untouched (dead path at default state; `addlPreTaxBal`
defaults to 0 everywhere).

---

### BUG-72 — Duration events ignored lost income during the event (found + fixed 2026-07-13)

**Owner:** me_theguy. **Found during:** life-event placement feature build; user-reported symptom.
**What it was:** a duration event (e.g. "$6,000/month for 36 months") modeled only its own cash outflow and never suppressed the user's salary during the event period. A 3-year sabbatical charged only the trip spend while contributions, employer match, MAGI, and SS AIME compounding continued untouched — income-dependent calculations saw no income change. Symptom: a user-reported "Big trip" 36mo × $6k/mo with $0 income showed almost no impact and read "comfortable," contradicting the ~$216k total spend.

**Root cause:** `money-events.js` had a single portfolio channel (`eventNetForYear`, with `incomeAnnual` folded in as a bolt-on additive inflow), and `runSimulation` computed salary, contributions, and employer match with zero reference to `moneyEvents` — there was no income channel at all, so "no income during the event" was inexpressible: setting the field to $0 meant "no *extra* side income," not "my paycheck stops."

**Fixed (2026-07-13, commits `1e8d2fd` + `7d60cdd` + `c3ec960`):** 
- **Two-channel semantics:** `money-events.js` now splits the per-year effect into (i) `eventAmountForYear` (the event's own signed cash, excluding income) and (ii) `eventIncomeForYear` (the prorated `(months/12) × incomeAnnual`, 0 for one-time events). `eventNetForYear = eventAmountForYear + eventIncomeForYear` is unchanged in value and stays the retirement-walk basis.
- **Working-year suppression:** new `eventsIncomeAdjustment(events, age)` → `{ pausedMonths, workedFrac, eventIncome }` computes prorated income (duration-outflow events with `incomeAnnual` field replace salary; inflows stay additive). `simulation.js` now projects income via `projectedIncomeAtAge` (includes `incomeGrowthEndAge` plateau), scales working-year contributions by `incomeFrac = min(1, projectedIncome / baseSalary)`, feeds MAGI/Roth-phase-out at the suppressed level.
- **Field semantics:** duration event `incomeAnnual` is now **the user's total income during the event** (e.g. freelance, part-time, or 0 for a sabbatical), not an additive side-income offset. Seeded from `projectedIncomeByAge` (App.jsx) in the UI; LifeEventSheet relabels the field "Your income during this time ($/yr)."
- **No double-counting rule:** each event month's income counts exactly once — accumulation years route a replacing event's income through the salary channel (`eventsIncomeAdjustment`), while the sim's portfolio line uses `eventSimAdjustmentForYear` (excludes replaced income, still credits a duration *inflow's* income); retirement-walk years use `eventNetForYear` (amount + income — no salary to replace there). Boundary-spanning duration events split by `eventFirstAge`/`eventLastAge` helpers so each walk counts only its own years. *(Corrected 2026-07-13 post-review: an earlier draft named `eventAmountForYear` as the retirement-walk basis — wrong; that would drop retirement-phase event income.)*
- **Known simplifications (documented in `money-events.js`):** SS AIME not suppressed (calcAIME is closed-form, ≤36mo pause < 1% shift); spouse income never suppressed (primary-only, #30 scope); duration-event income still untaxed in retirement walks (BUG-36 scope note); the UI's "usual pay" seed stores the salary at the event's START age as a constant `incomeAnnual`, so a multi-year "income unchanged" event under `incomeGrowth > 0` trims later years' contributions by up to one year's growth factor (single-scalar field by design).
- **Post-review hardening (2026-07-13, Fable + bot review of PR #53):** employer-match income basis capped at `baseSalary` (a $300k event income no longer triples a flat-mode match); duration *inflow* income restored to the sim's portfolio line via `eventSimAdjustmentForYear` (was silently dropped in accumulation years while retirement walks credited it); ONE shared `isIncomeReplacingEvent` predicate across the sim's salary channel, the sim's portfolio line, and `eventIncomeImpact` (an undefined `isInflow` previously displayed an income impact the sim never applied); `projectedIncomeAtAge` clamped at zero growth years (no backward discounting); Classic's "Projected at retirement" line moved onto the shared helper (was compounding one extra year vs the sim's own convention).

**Golden master impact:** none (default state has no money events).

**Where:** `src/model/money-events.js` (two-channel helpers), `src/model/simulation.js` (working-year income projection + suppression), `src/App.jsx` (lifeEventBounds.projectedIncomeByAge), `src/horizon/LifeEventSheet.jsx` (field label/seed).

**Tests:** ~32 added across the two commits (big-trip regression reproducing the user scenario exactly — paused years zero out 401k/match/HSA/Roth/taxable contributions; income = usual salary keeps contributions identical to a no-event run; `eventsIncomeAdjustment` proration/overlap-cap/inflow-no-op; `projectedIncomeAtAge` plateau parity with the sim row; MAGI suppression re-opens a phased-out Roth; `eventIncomeImpact` + sheet seeding/bullet tests).

---

### BUG-73 — Verdict saturated to "comfortable" for non-depleting plans; no margin context (found + fixed 2026-07-13)

**Owner:** me_theguy. **Found during:** cushion-based verdict design.
**What it was:** every verdict surface (life-event verdict card, plan/dial preview, LifeEventSheet duration-month tick rail) returned "comfortable" for **any** plan that never depleted within the 130-year walk, even a plan with only $10k in reserve at age 90 vs. $100k/yr expenses — no distinction between "yes, you have a 20-year runway" and "yes, you never ran out at the walk horizon." Same lack of margin context made it impossible to compare scenarios: a $50k/yr plan and a $100k/yr plan that both sustained to 130 both showed "comfortable," but the second had 2× the cushion.

**Root cause:** verdict logic was depletion-binary (depletes or doesn't) with no margin-of-safety computation, and no labeled ranges ("5+ yrs of runway = comfortable") so even a margined verdict couldn't inform the user of the threshold.

**Fixed (2026-07-13, commit `c3ec960`):**
- **Cushion basis:** `marginForScenario(scenario, safeLifeExp)` is THE one margin computation. Depletion basis unchanged; **cushion basis = scenarioBalAt90 / scenarioExpenses** (years of spending in reserve at plan age, conservative — SS/pension keep flowing). Handles Infinity/0 edge cases (non-depleting plans produce Infinity years cushion; zero-balance plans produce 0).
- **Verdict mapping:** `verdictInfoForScenario(scenario, safeLifeExp)` returns `{ verdict, marginYears, marginBasis, marginLabel, rangeLegend, thresholds }` — the 3-state verdict plus a human margin sentence ("≈12 yrs of spending still in reserve at 90" / "runs out 4 yrs early") and the labeled ranges, all built from `EVENT_COMFORT_BUFFER_YEARS` and the real plan age (never hardcoded).
- **Labeled ranges:** new `buildVerdictLegend` exports the 3-entry range table ("comfortable," "tight," "unaffordable") with thresholds, rendered as an optional legend on LifeEventSheet and Plan/Ideas preview screens.
- **Thresholds unified:** both cushion and depletion use `EVENT_COMFORT_BUFFER_YEARS = 5` (documented as the shared constant if they ever diverge, pending future sophistication).

**Golden master impact:** none (verdict is display-only; no scenario values changed).

**Where:** `src/model/what-if.js` (margin/verdict/legend builders, pre-computed in `evaluateLifeEvent`, `buildLeverPreview`, `buildDurationRail`), `src/horizon/fields.jsx` (optional legend prop on VerdictTickRail), `src/App.jsx` (verdictLegend added to horizonProps), `src/horizon/LifeEventSheet.jsx` (legend render).

**Tests:** +11 (cushion-saturation regression — a never-depleting plan with a thin cushion now reads "tight"; cushion never yields "unaffordable"; depletion-basis value-preservation vs the old inline expression; rail-vs-direct anti-divergence; label/legend value-locks; sheet marginLabel + legend render; Plan/Ideas legend-shown-once).

---

### BUG-65 — `commitPlan` used the bare (uncoupled) `setRetirementAge` (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52.
**What it was:** `commitPlan` (App.jsx) called `setRetirementAge(ra)` directly instead of the
coupled `setRetirementAgeCoupled(ra)` that keeps `contribEnd401k`/`contribEndRoth`/
`contribEndTaxable`/`contribEndHSA` in sync when they track the retirement age. `applyPlanLevers`
happened to call `setRetirementAgeCoupled` itself just before `commitPlan` (masking the bug there),
but onboarding's `handleSave` (`HorizonShell.jsx`) calls `commitPlan` directly with no pre-coupling —
a first-run user picking a retirement age different from the default contribEnd ages would get
contributions silently continuing past their chosen retirement age.
**Fix:** reordered `setRetirementAgeCoupled`'s definition above `commitPlan` (it was defined after,
so `commitPlan` couldn't reference it) and swapped the bare setter for the coupled one inside
`commitPlan`; updated its dep array accordingly. `applyPlanLevers`'s pre-coupling call is now
redundant-but-harmless (idempotent). **Files:** `src/App.jsx`. Display-only state-consistency fix;
golden master untouched; no new test (no model-layer surface to lock — covered by existing
`setter-bundles.test.js` round-trips).

### BUG-66 — `surplusApplySite`'s `calcWhatIfDelta` calls dropped committed money events (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52.
**What it was:** `calcWhatIfDelta`'s `moneyEvents` param defaults to `[]`; `surplusApplySite`
(App.jsx, WI-3.7's Apply-with-preview site for the optimized-allocation suggestion) called it via
`calcWhatIfDelta({ ...whatIfBundle })` — `whatIfBundle` has no top-level `moneyEvents` key (it lives
nested in `whatIfBundle.simInputs.moneyEvents`, which `calcWhatIfDelta` doesn't read), so both the
"current" and "candidate" re-sims silently ran with zero committed events. Symmetric (both sides
equally wrong), so it never showed a *divergent* delta, but a user with committed money events would
see a surplus-deployment preview computed against a portfolio walk that doesn't match their real plan.
**Fix:** both `calcWhatIfDelta` calls in `surplusApplySite` now pass `moneyEvents` explicitly (read
from the `moneyEvents` App.jsx state), added to the memo's dep array. **Files:** `src/App.jsx`.
Golden master untouched (default `moneyEvents = []`); no new test (no committed-events fixture existed
for this site — the bug was in argument wiring, not model logic already covered by
`what-if.test.js`'s `calcWhatIfDelta` event tests).

### BUG-67 — three CodeRabbit-flagged duplications deduped (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52 (Trivial-severity findings).
**What it was:** three identical code blocks existed in two places each, risking silent drift:
(1) `IdeasScreen.jsx`'s dial override-object construction (`{ retirementAge, monthlyExpenses }`)
was built separately in `dialScenario` and `applyPreview`'s memos; (2) `App.jsx`'s retirement-boundary
money-events filter (`moneyEvents.filter(ev => eventLastAge(ev) >= safeRetAge)`) was duplicated in
`retPhaseBase` and `retDrawShared`; (3) `what-if.js`'s Infinity-aware `deltaYears` ternary was
repeated verbatim in `calcWhatIfDelta`, `calcWhatIfScenario`'s M1 engine path, and its fallback path.
**Fix:** hoisted each into one shared definition — `dialOverrides` (useMemo, IdeasScreen.jsx),
`retirementMoneyEvents` (useMemo, App.jsx), and `deltaYearsFrom(scenarioYears, baseYearsSustained)`
(module-level function, what-if.js) — all three call sites now reference the shared version.
**Files:** `src/horizon/screens/IdeasScreen.jsx`, `src/App.jsx`, `src/model/what-if.js`.
Value-preserving refactor; golden master untouched; existing tests cover all three call sites
unchanged (763/763 pass).

### BUG-68 — `AffordabilityPanel`'s staged ages didn't resync with `affordView`'s bounds (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52 (Minor).
**What it was:** `purchaseAge`/`targetAge` were seeded once via `useState(affordView.defaultPurchaseAge)`
/`useState(affordView.defaultTargetAge)`. If `affordView`'s bounds shifted while the Solvers panel
stayed mounted (e.g. the user edits `currentAge`/`lifeExpect` in My details in another tab/without
unmounting Ideas), the staged ages could drift outside the field's own (now-updated) min/max.
**Fix:** two `useEffect`s re-clamp `purchaseAge`/`targetAge` into `[purchaseMin, purchaseMax]`/
`[targetMin, targetMax]` whenever those bounds change — keyed on the bounds only (not the defaults),
so it never fights a user's in-progress choice that's still within range. **Files:**
`src/horizon/AffordabilityPanel.jsx`. Display-only; golden master untouched.

### BUG-69 — `MAX_MONEY_EVENTS` hardcoded outside `ASSUMPTIONS` (found + fixed 2026-07-12)

**Owner:** me_theguy. **Found by:** CodeRabbit review of PR #52 (Major-labeled convention finding).
**What it was:** `MAX_MONEY_EVENTS = 6` (the product-level UI cap on one-time/duration events) was
defined as a standalone `export const` in `src/model/money-events.js` instead of living in
`ASSUMPTIONS` (`irs-2026.js`) alongside its closest precedent, `AFFORDABILITY_STEP`/
`AFFORD_DEFAULT_PURCHASE_OFFSET_YRS` — rule 1's "IRS constants live in irs-2026.js only" extends by
established convention to product-level UI constants too (named there "so both surfaces stay
identical by construction"), which this constant had drifted from.
**Fix:** moved the value into `ASSUMPTIONS.MAX_MONEY_EVENTS`; `money-events.js` now
`export const MAX_MONEY_EVENTS = ASSUMPTIONS.MAX_MONEY_EVENTS;` so existing import sites
(`MoneyEventsPanel.jsx`) don't need to change. **Files:** `src/config/irs-2026.js`,
`src/model/money-events.js`. Value-preserving; golden master untouched.

---

### BUG-46 — `buildScenarioCommitSite` preview omits the scenario's `scenarioEvents`/expense overrides (found 2026-07-09, closed as obsolete 2026-07-12)

**Owner:** me_theguy. **Found by:** an in-house 8-finder-angle code review of PR #51.
**What it was:** Ideas' "Big trip at 70" scenario card (`SCENARIOS.bigTrip`) displayed a $40k-trip
delta on its card face, but `buildScenarioCommitSite`'s Apply-preview only forwarded the candidate
retirement age (not `scenarioEvents`), so the preview could show "no change" for a scenario whose
whole point was a $40k event. Needed an owner call on fix direction (patch the preview vs. expand
`apply()` to persist scenario events) — never actioned.
**Closed as obsolete 2026-07-12 (Scenarios-removal + L3d-merge close-out):** `SCENARIOS`,
`buildScenarioCommitSite`, and the `scenarioCommitSite` memo were all retired the same day this
entry's parent branch (L3d) merged into `claude/arc-event-placement-video-61zalx` — the whole
locked-preset-card UI this bug lived on was removed by owner decision (see BUG-44's addendum).
Confirmed via `grep`: none of `SCENARIOS`, `buildScenarioCommitSite`, or `scenarioCommitSite` exist
anywhere in `src/` anymore. The sheet-first `LifeEventSheet` flow that replaced it has no
"card preview vs. apply" split to disagree with itself — the sheet's live verdict IS what
`saveEvent` commits, by construction (one object, one write). No fix needed.

### BUG-51 — Events editor: amount-field zero-render and pill-unchecking on edit (found 2026-07-09, closed as obsolete 2026-07-12)

**Owner:** me_theguy. **Found by:** a Fable UI review of PR #51 (see BUG-49/50).
**What it was:** two rough edges in `EventsEditorPanel.jsx`'s amount field and its interaction with
`findPlacedRow`'s pill-matching (zero-render display nit; editing a placed event's amount briefly
un-checked its pill via an exact-value match). Needed an owner call on intended semantics before
fixing — never actioned.
**Closed as obsolete 2026-07-12 (Scenarios-removal + L3d-merge close-out):** `EventsEditorPanel.jsx`,
`App.jsx`'s `eventsView` bundle, and `findPlacedRow` were all retired the same day this entry's
parent branch (L3d) merged into `claude/arc-event-placement-video-61zalx` — the owner had
separately rejected the raw money-events-editor pattern in favor of the sheet-first
`LifeEventSheet` flow. Confirmed via `grep`: none of `EventsEditorPanel`, `eventsView`, or
`findPlacedRow` exist anywhere in `src/` anymore. The sheet-first flow's own placed-pill mechanism
(`committedByLabel`, upsert-by-id `saveEvent`) doesn't have either rough edge — the amount field is
a normal controlled input with no zero-render special case, and there's no separate "match" step to
go stale (the sheet mounts directly from the committed event's own fields). No fix needed; the
surface this bug lived on doesn't exist anymore.

---

### BUG-44 — Ideas re-applying the same scenario duplicates its committed events (found + fixed 2026-07-11)

**Owner:** me_theguy. **Found by:** the post-fix Fable verification review (checking the H1/M1
fix commits for new regressions); **fixed same-day at owner's request** after asking for the
duplication to be impossible rather than just documented.
**What:** `IdeasScreen.jsx`'s scenario cards (e.g. "Big trip at 70", which carries a $40k
`scenarioEvent`) had no "already applied" indicator, unlike the Events pills (`committedByLabel`
shows a "✓ placed" state and reopens the sheet in edit mode). `handleApplyConfirm` minted a fresh
id per apply, so re-selecting and re-applying the same scenario after the 2-second "✓ Applied"
toast cleared committed a **second** copy of the event — a $40k trip became two $40k trips with no
warning, discoverable only via the Events tab or a second arc badge.
**Root cause:** scenario cards were stateless presets with no committed-state lookup, unlike the
Events pills which key off `moneyEvents` by label.
**Owner's design requirement (verbatim intent):** an event must be an explicit, binary choice —
"either the event exists or it doesn't, there is no in-between." No silent limbo state.
**Fixed:** `IdeasScreen.jsx` gains `matchCommittedEvents(events)` — the same by-label matching
convention `committedByLabel` uses for the Events pills — returning the committed ids for a
scenario's own events, or `[]` unless *every* one of the scenario's events already has a match.
- **Card face:** a scenario whose events are already committed shows "✓ {label}" + "Already on
  your plan." (mirrors the pill's ✓ placed treatment), with warm-token styling instead of the
  color-dot accent.
- **CTA:** the shared bottom-row button becomes **"Remove from plan"** (warm) instead of "Apply to
  my plan" (accent) whenever the active scenario is already applied — one click removes exactly
  the committed event(s) this scenario added (`removeEvent` per matched id), via a new
  `handleRemoveScenario`. The "Apply to my plan" branch is now unreachable for an already-applied
  scenario (the button that calls it doesn't render), so `saveEvent` can never fire a duplicate.
- `planSaved` (a boolean, "✓ Applied" only) generalized to `toast` (a string) so Apply and Remove
  each show their own transient confirmation through one piece of state.
- Age-only scenarios (no `scenarioEvents`) are unaffected — reapplying one just moves the
  retirement age again, a legitimate repeatable action with no persistent object to duplicate.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (`matchCommittedEvents`, `scenApplied`,
`handleRemoveScenario`, the scenario-card render, the CTA button).
**Tests:** new `src/horizon/__tests__/ideas-screen.test.js` case — a scenario whose event is
pre-committed shows the applied card state and a "Remove from plan" button (not "Apply to my
plan"), and clicking it calls `removeEvent` with the real committed id, never `saveEvent`.
**Verification:** scripted Playwright drive (apply → card shows "✓ Big trip at 70 · Already on
your plan" → CTA is "Remove from plan," not "Apply" → remove → card and arc badge both clear).
715 → **716** tests; golden master untouched.

**Addendum (2026-07-12) — fix code retired with its surface.** The owner reviewed Ideas'
"Scenarios" tab separately and found the whole preset-card pattern restrictive (cards applied a
hidden value with one tap, not editable before applying — unlike the Events tab's sheet-first
flow). The locked "Scenarios" mode was retired: `SCENARIOS`, the `mode === "suggest"` panel,
`activeScen` state, `scen`/`scenario` derivations, `matchCommittedEvents`, `scenApplied`, and
`handleRemoveScenario` were all deleted from `IdeasScreen.jsx`. `SCENARIOS` had 3 age-only cards
(`retire63` −2, `retire60` −5, `saveMore` −1) plus the event card; 2 of the 3 age-only cards
became Dials **quick-jump chips** (`RETIRE_JUMPS` — a pure slider-offset nudge, never a committed
write). `saveMore` ("Save $300 more/mo") was dropped, not remapped — Dials has no savings/
contribution lever (deferred #123), and forcing that framing onto a bare retire-age chip would be
dishonest; its `-1` offset was one slider notch, redundant with the two chips kept. The "Big trip"
card folded into `LIFE_EVENTS` as a normal editable pill (same seed values, new 🧳 icon).
This **structurally closes the whole BUG-44 bug class**, not just this instance: with the
scenario-card surface gone, the only things that write committed `moneyEvents` state in Ideas are
(1) Dials' own Apply (`applyPlanLevers`, unrelated to events) and (2) the LifeEventSheet's
Save/Remove — and `saveEvent`'s contract is what actually prevents duplication, precisely
(recorded here so it isn't hand-waved): `committedByLabel(label)` does a **first-match-by-label**
lookup against `moneyEvents` to decide whether a pill is "placed"; a placed pill always reopens
the sheet **by id** (`{ seed: committed, eventId: committed.id }`), and `saveEvent` **upserts by
id** — an edit-and-save on an already-committed event never mints a fresh id, so it can never
append a duplicate. This is exactly BUG-44's failure mode (a fresh id minted on every re-apply)
made structurally impossible, not just handled for one case.
**What this guarantee does NOT provide:** global label dedup. Two committed events can validly
share the label "Big trip" — e.g. a user manually retitles a different event to that exact string
(the sheet's name field is freely editable) — and both remain individually reachable and editable
via their own arc badges; `committedByLabel`'s first-match lookup would show only one of them as
"✓ placed" on the Events pill, but neither is silently merged or dropped. This is a pre-existing
property of the by-label placed-pill convention (not new here) — worth stating precisely because
this addendum leans on it structurally.
**Forward-compat nicety:** a user who had already applied the old `bigTrip` scenario (before this
change) has a committed event labeled "Big trip" from that path; the new Events pill's
`committedByLabel("Big trip")` lookup adopts it as ✓-placed automatically on next load — no
orphaned state from the migration, no manual cleanup needed.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (deletions above; `RETIRE_JUMPS`,
`handleRetireJump` new). **Tests:** `src/horizon/__tests__/presets.test.js` (`RETIRE_JUMPS`
value-lock replaces `SCENARIOS`); `src/horizon/__tests__/ideas-screen.test.js` (Scenarios-mode
describe block deleted; 2 new Dials quick-jump chip tests — relative + clamped-absolute; a new
Events-mode placed-pill regression test replacing this bug's original test coverage now that
"Big trip" only lives there); `src/__tests__/horizon-screens-smoke.test.js` (Ideas scenario-run
smoke retargeted to the Dials chip). 716 → **715** tests; golden master untouched.

**Addendum (2026-07-16) — the label-based "placed pill" mechanism is retired, but BUG-44's
failure class stays closed.** The multi-goal timeline feature (see `CLAUDE.md` status) deletes
the whole Ideas Events UI, including `committedByLabel`. Goals are now placed/listed/edited on
the Plan screen's Explore tray (`GoalsPanel.jsx`). The by-label "✓ placed" convention is gone —
**and that is intentional**: a user placing two "Big trip" goals is now a first-class, supported
outcome (Goal 1 / Goal 2), not something to dedupe. BUG-44's actual failure mode (a stateless
preset card minting a fresh id on every re-apply) does **not** return, and for a stronger reason
than before: presets are pure **add** affordances (they always seed a NEW goal via
`presetSeed`, no `eventId`), while every EDIT path — a goal-row tap or an arc-badge tap — carries
the committed `eventId` into `saveEvent`'s **upsert-by-id**. There is no "tap a card, a hidden
value silently applies" surface left at all, so a re-apply can't duplicate. The
`goals-panel.test.js` block locks that two same-label goals coexist and that edit/remove are
id-keyed.

---

### BUG-45 — `buildDurationRail` didn't inherit the H1 exclude-committed-event fix (found + fixed 2026-07-11, post-fix verification pass)

**Owner:** me_theguy. **Found by:** the Fable post-fix verification review (checking the H1/M1/M2
fix commits themselves for correctness and new regressions).
**What:** H1 (`0ddfb4d`) fixed `evaluateLifeEvent`'s verdict card so editing an already-committed
event prices it once via a new `excludeEventId` override on `calcWhatIfScenario`. The fix reached
only `evaluateLifeEvent` — `buildDurationRail` (the LifeEventSheet's per-month tick rail) still
called `calcWhatIfScenario` with no exclusion, so opening a committed **duration** event's edit
sheet (tap a placed pill or arc badge) still double-counted the original at every rail step. The
rail and the verdict card, computed from the same candidate, could disagree: probe-confirmed at
concrete spend levels (a $5k/mo × 24mo sabbatical) where the card read "comfortable" while the
rail tick at the identical 24 months read "tight," and elsewhere "tight" vs "unaffordable." This
directly contradicted the function's own doc comment ("a rail entry and evaluateLifeEvent's
verdict for the same months can never disagree").
**Root cause:** the H1 fix's `excludeEventId` passthrough was added at the `evaluateLifeEvent`
call site only, not the sibling `buildDurationRail` builder — both call `calcWhatIfScenario` with
a synthesized candidate, but only one is exercised by the H1 regression test.
**Fixed:** 2026-07-11, same session. `buildDurationRail` now passes
`excludeEventId: eventBase.id` (when present) into its `calcWhatIfScenario` call, mirroring
`evaluateLifeEvent`'s convention exactly. `LifeEventSheet.jsx` needed no change — `modelCandidate`
already carries `id: initial?.id`, and `durationEventBase` derives from it by spread, so the id
flows through automatically. New regression test in `what-if.test.js`: a committed duration event
baked into every committed-event source (mirroring the existing H1 `editBundle` fixture), asserts
every rail entry's verdict agrees with `evaluateLifeEvent` for the identical candidate, and that
the unchanged-duration (24 months) entry matches the no-double-count guarantee.
**Where:** `src/model/what-if.js` (`buildDurationRail`), `src/model/__tests__/what-if.test.js`
(new fixture + test). 714 → 715 tests; golden master untouched.

---

### BUG-43 — Signals strip deep-linked to a Numbers tab that no longer exists (found + fixed 2026-07-11, interop audit)

**Owner:** me_theguy. **Found by:** the fix-pass-2 interop audit (checking every deep-link target
against the screens that actually exist).
**What:** `src/model/signals.js`'s "unclaimed employer match" and "budget deficit" signals both
targeted `{ screen: "numbers", subView: "flow" }`. `NumbersScreen` has had no "flow" tab since PR
#38 (2026-06-24) consolidated the standalone Money-flow tab into Statement as the "Retirement
income companion strip" — the current tab set is statement/budget/accounts/taxes/yearly. Clicking
either signal navigated to Numbers with a `subView` matching no tab, so `NumbersScreen`'s
`useState(initialTab ?? "statement")` / `useEffect(() => { if (initialTab) setTab(initialTab); })`
set `tab` to the dead id "flow", which matches none of the `tab === "…"` render branches — a blank
Numbers body.
**Root cause:** PR #38's tab consolidation updated `NumbersScreen.jsx` but never searched for other
consumers of the old tab id; `signals.js` was written before PR #38 and was never revisited.
**Fix:** retargeted both signals to `{ screen: "numbers", subView: "budget" }` — the Budget tab owns
the savings waterfall and deficit warning, the natural home for both nudges. Added a machine-checked
guard: `NumbersScreen.jsx` now exports `NUMBERS_TABS` (the tab id/label pairs, previously an inline
literal in the render), and a new `signals.test.js` test iterates every Numbers-targeting signal and
asserts its `subView` is one of `NUMBERS_TABS`'s ids — so a future tab rename/removal fails a test
instead of shipping a silent blank screen.
**Where:** `src/model/signals.js` (2 target fixes), `src/horizon/screens/NumbersScreen.jsx` (export
`NUMBERS_TABS`, tab-strip render now maps over it instead of a duplicate inline array),
`src/model/__tests__/signals.test.js` (retargeted expectations + the new deep-link guard describe
block). Golden master untouched (signals.js has no model-value fields; display/plumbing only).

---

### BUG-42 — `calcWhatIfScenario` silently dropped pre-retirement `scenarioEvents` (found + fixed 2026-07-10, life-event placement build)

**Owner:** me_theguy. **Found by:** design pass for the life-event sheet (video-inspired arc-event
placement), while tracing where a candidate event's impact would come from.
**What:** `calcWhatIfScenario` (`src/model/what-if.js`) passed `overrides.scenarioEvents` ONLY into
the retirement walk (`mergedEvents`). The walk iterates ages `scenarioRetAge+1 …`, so a scenario
event at an age **before** retirement never matched any walk year and was silently ignored — the
scenario chart/stats showed no impact at all for a pre-retirement event. Latent in production:
both existing callers (Ideas `bigTrip` at 70; life-event pill commits, which go through committed
`moneyEvents`, not `scenarioEvents`) only ever passed post-retirement events. It became live the
moment the new `evaluateLifeEvent` needed pre-retirement candidates.
**Second (boundary) symptom, same fix:** the re-sim path's accumulation filter was
`ev.age < scenarioRetAge`, but the sim row that `calcWhatIfScenario` reads IS the
retirement-age row — the main App path (which passes the full event list to `runSimulation`)
therefore counts an event landing exactly at the retirement age, while the what-if re-sim dropped
it. Inconsistent baselines for the same plan.
**Fix (2026-07-10, same session):** scenario events with any pre-/at-retirement activity now force
a re-sim that includes them alongside the committed accumulation events
(`scenarioAccum = scenarioEvents.filter(ev => eventFirstAge(ev) <= scenarioRetAge)`), and all
phase filters in `what-if.js` + `App.jsx` (`retPhaseBase` / `retDrawShared`) are **kind-aware**
via the new `eventFirstAge`/`eventLastAge` helpers (`money-events.js`), so a duration event
("$X/mo for N months") spanning the retirement boundary reaches both walks and each applies only
the years inside its own age range — every event-year counted exactly once. Golden master
untouched (default `moneyEvents`/`scenarioEvents` are empty).
**Where:** `src/model/what-if.js` (re-sim trigger + filters), `src/model/money-events.js` (new
helpers), `src/App.jsx` (walk filters). Regression tests: "calcWhatIfScenario no longer drops
pre-retirement scenarioEvents" + the boundary-spanning duration test in
`src/model/__tests__/what-if.test.js`.

---

**Note (2026-07-12):** the entries below (BUG-52 through BUG-64) came from the L3d branch
(`claude/l3d-horizon-depth-ladder-dr4gvv`), merged separately into `main` while this branch was
open, and were merged into this branch's history on 2026-07-12 alongside the Scenarios-removal
work. Several fixed code in **QuickTunePanel**, **`eventsView`**, and Ideas' old "Scenarios"/
"Dial your future" UI — all retired the same day by #122's preview-first redesign and the
Scenarios removal (see `docs/HORIZON.md`'s "Retired" note). They remain valid historical records
of real bugs, fixed in code that was later replaced by an unrelated redesign — not reverted.
Four ID collisions with this branch's own new bug numbers (main independently used BUG-42/43/44/45
for different bugs) were resolved by renumbering the L3d entries to BUG-61–BUG-64; cross-references
within those entries were updated to match. Several entries below also cite test coverage in
`src/horizon/__tests__/ideas-modes.test.js` — that whole file was deleted in the same merge (its
Events-mode/`eventsView` tests were incompatible with the sheet-first redesign; its Solvers-mode
tests were ported to `ideas-screen.test.js`'s "Solvers mode" describe block, see BUG-62). Left as
written below rather than edited file-by-file — the fixes themselves are unaffected.

### BUG-52 — QuickTunePanel's SS-age slider had a flat 62-70 floor, regressing BUG-17 (found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** a Fable agent's adversarial UI review, browser-verified live.
**What:** `PlanScreen.jsx`'s QuickTune "SS age" slider hardcoded `min: 62, max: 70`, while the `ss`
setter bundle's `ssClaimingAge` field (`App.jsx`) has correctly floored the minimum at
`max(SS_MIN_CLAIM_AGE, currentAge)` since BUG-17. QuickTunePanel built its own slider config
independently instead of reading the bundle's bounds, so it never picked up that fix.
**Reachable how:** verified live — set current age to 66 in My Details, open Plan, drag the SS-age
pill to 62: the slider accepted it, letting a 66-year-old claim Social Security 4 years in the
past, which every downstream drawdown loop treats as already-claimed history.
**Fixed:** added `ssMin`/`ssMax` to App.jsx's existing `sliderBounds` memo (mirroring
`ssBundle.ssClaimingAge`'s exact formula — one definition, not a second copy) and pointed
QuickTunePanel's SS slider at `sliderBounds.ssMin`/`sliderBounds.ssMax` instead of the hardcoded
values. Spouse SS's hardcoded `62/70` was checked and left as-is — it already matches
`ssBundle.spouseClaimingAge`'s flat (non-dynamic) bounds, so it wasn't actually a bug.
**Where:** `src/App.jsx` (`sliderBounds`), `src/horizon/screens/PlanScreen.jsx` (SS slider config).
**Tests:** none added — the fix is a direct pointer-swap to an already-tested bundle field; no new
branch or edge case was introduced.

### BUG-53 — Events editor age field was unusable — typing "70" produced "120" (found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** the same Fable UI review, reproduced live in a browser session.
**What:** `EventsEditorPanel.jsx`'s age `<input>` committed every keystroke straight through
`row.ageField.set`, whose setter (`App.jsx`) clamps immediately:
`max(currentAge, min(120, Number(v) || currentAge))`. With `currentAge=30`, typing "70" clamps the
first digit ("7" &lt; 30) back to 30, then the second digit appends onto "30" making "300", which
clamps to 120 — the field is effectively impossible to type a 2-digit age into that starts below
`currentAge`'s first digit. The exact failure mode was already documented — and fixed — 30 lines
away in this same PR's `AffordabilityPanel.jsx` `AgeControl` (BUG-48's "clamping on every onChange
locks the input"), but the Events editor shipped without the same draft-then-commit-on-blur pattern.
**Fixed:** `EventRow` (in `EventsEditorPanel.jsx`) now holds a local uncommitted `ageDraft` string
state — `onChange` writes the raw typed text with no clamp, `onBlur` computes the clamped value and
calls `row.ageField.set`. Same pattern as `AgeControl`, applied to its actual origin site.
**Where:** `src/horizon/EventsEditorPanel.jsx` (`EventRow`'s age `<input>`).
**Tests:** none added directly (no existing render harness stages keystroke-by-keystroke typing for
this specific component); covered indirectly by the full test suite staying green and by the same
pattern's existing coverage in `ideas-modes.test.js`'s `AgeControl` regression test.

### BUG-54 — Arc fabricated "still covered, for life" / "Even lean: covered" regardless of the actual balance shown (found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** the same Fable UI review, browser-verified for the hero-arc case.
**What:** two unconditional reassurance labels in `ArcGraph.jsx`: (1) the hero/scenario arc's
endpoint label always rendered "still covered, for life" beside `fmtMoney(endPos.endTotal)`, even
when `endTotal` is $0 (a depleted plan) — verified live: Plan → QuickTune "Monthly spend" → raise
to an unsustainable level → the arc pill still claimed lifetime coverage beside its own "$0 at 90."
(2) The band/Scenarios view's end-of-chart pill always rendered "Even lean: covered" — hardcoded
text with no check against the band's own lower (lean-market) boundary, which `bandModel`'s `loPts`
already computes and floors at 0 for the plotted line itself; the label just never consulted it.
Same class of bug this codebase has fixed before (the removed fabricated "9 in 10 markets"
probability, per CLAUDE.md's status log) — an invented verdict with no model computation behind it.
**Fixed:** both labels now gate on a value already computed locally in the same function (no new
props, no new model calls): the hero label only renders "still covered, for life" when
`endPos.endTotal > 0` (otherwise the `$0 at {age}` figure stands alone — no invented warning copy);
the band label computes `leanFinalTotal` using the exact same formula `bandModel`'s own lower band
line uses, and only shows "Even lean: covered" when that's positive — otherwise it shows the honest
lean-market dollar figure instead of a redundant/wrong claim (also fixes a minor redundancy: the
old copy repeated itself with "even in a lean market" directly under "Even lean: covered").
**Where:** `src/components/ArcGraph.jsx` (`ArcLabels`'s endpoint label, `BandLabels`'s end pill).
**Tests:** none added — no existing test harness renders the full `ArcGraph` component (only the
exported pure `scrubPointForAge` helper has coverage); both fixes are simple, directly-traced
conditionals reusing values the surrounding code already computes, verified by reading and (for the
hero-arc case) live browser reproduction before and after.

### BUG-55 — Ideas "Left at 90" compared balances at two different ages, and its label ignored the actual plan horizon (found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** the same Fable UI review, confirmed by tracing both code paths.
**What:** the Ideas screen's "Left at 90" stat card compared `balAt90` (App.jsx — despite the
name, already computed at the user's actual `safeLifeExp`, not literal age 90) against
`scenario.scenarioBalAt90` (`calcWhatIfScenario`, `what-if.js` — genuinely hardcoded to a module
constant `BAL_REFERENCE_AGE = 90`), an apples-to-oranges comparison whenever `lifeExpect != 90`.
The card's label was also hardcoded `"Left at 90"` regardless of the user's actual plan-to-age;
`PlanScreen.jsx` had already fixed its own equivalent label (`Left at ${lifeExpect}`) but Ideas
never got the same fix.
**Fixed at the model layer** (the correct fix — both consumers must share one reference age, per
principle 11): `calcWhatIfScenario` (`what-if.js`) now computes `scenarioBalAt90` at `safeLifeExp`
(the same bundle field `balAt90` already uses) instead of the hardcoded `BAL_REFERENCE_AGE`
constant, which was removed. The field keeps its historical "90" name (matching `balAt90`'s own
precedent of an intentionally-stale name with a corrected value — both document why in comments).
Ideas' stat card label changed to `` `Left at ${lifeExpect}` ``, matching `PlanScreen`'s pattern.
**Golden master impact:** none — `calcWhatIfScenario` isn't invoked at the default App state (no
active scenario); this only affects screens actively showing a scenario comparison.
**Where:** `src/model/what-if.js` (`calcWhatIfScenario`'s `scenarioBalAt90` computation, doc
comment), `src/horizon/screens/IdeasScreen.jsx` (stat card label).
**Tests:** `src/model/__tests__/what-if.test.js` — rewrote the test that had asserted the OLD
(hardcoded-90) behavior into one that locks the NEW behavior (`scenarioBalAt90` tracks a
`safeLifeExp` override, e.g. 85, rather than going null because "the walk never reaches 90"); the
depletion test's comparison also switched from a hardcoded `90 - safeRetAge` to `safeLifeExp -
safeRetAge` for correctness. 707 tests (net-zero: one test rewritten, not added).

### BUG-56 — Ideas "Dial your future" was unbounded, with silent failure on invalid values (found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** the same Fable UI review, browser-verified live.
**What:** `IdeasScreen.jsx`'s dial ± controls had no bounds: the retire-at dial could be driven
below `currentAge` (or negative), and the monthly-spend dial could go negative (rendering
"$-100/mo"). Verified live: dialing retire-at far enough down, then clicking "Show on arc →",
produced no overlay and no error — `calcWhatIfScenario` returns `null` for a degenerate
retirement-age override (retiring at/before current age has no accumulation phase), and the handler
silently no-ops on `null` with zero user feedback. Every other numeric input in this codebase
(`fields.jsx`, `AgeControl`, onboarding) clamps; these two dials were the exception.
**Fixed:** the retire-at dial's offset is now clamped to the same `sliderBounds.retireMin/retireMax`
range PlanScreen's own QuickTune slider already enforces (both read `retirementAge` directly, so
the bases match exactly — no duplicate bounds logic). The spend dial floors at $0, computed against
its OWN base (`statementView.monthlyTotal`) rather than `sliderBounds.spendMin` — investigated and
found that `sliderBounds.spendMin/spendMax` is based on `annualExpenses ?? effectiveExpenses`, which
diverges from `statementView`'s `effectiveExpenses`-only base once a user has ever set an explicit
spend override via Plan's own slider, which would have made a cross-referenced bound silently
wrong; the self-contained floor avoids that basis mismatch entirely. With the retire-age dial now
structurally prevented from reaching a degenerate value, the silent-failure path is unreachable by
construction — a stronger fix than adding an error message after the fact.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (dial offset bounds + click handlers).
**Tests:** 2 new in `src/horizon/__tests__/ideas-modes.test.js` — the retire dial can't be driven
below `sliderBounds.retireMin` after repeated clicks past the limit; the spend dial can't go
negative after repeated clicks past $0.

### BUG-57 — `showMakePlan` could strand `true` with no modal to show (defensive fix, found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** the same Fable UI review (flagged PLAUSIBLE, not yet reachable).
**What:** the "make this scenario my plan" modal renders only when `showMakePlan && scenarioCommitSite`;
`scenarioCommitSite` is `null` whenever `scenario` is `null` (i.e., no `activeScen`). Today the
modal's own full-screen backdrop blocks any interaction that would clear `activeScen` while it's
open, so this isn't reachable yet — but any future code path that clears `activeScen` out from
under an open modal (without going through the guarded "Make this my plan" button) would leave
`showMakePlan=true` invisibly stranded, and the next scenario activation would pop the modal
unprompted.
**Fixed:** `clearScen()` now also resets `showMakePlan` to `false`, so the two pieces of state can
never drift apart regardless of which code path clears the scenario in the future.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (`clearScen`).
**Tests:** none added — defensive fix for a currently-unreachable path; the existing modal-open/
cancel/confirm tests continue to cover the reachable behavior unchanged.

### BUG-58 — Ideas "✓ Saved" badge: uncleaned `setTimeout` and no dirty-reset (found + fixed 2026-07-09, Fable UI review of PR #51)

**Owner:** me_theguy. **Found by:** the same Fable UI review, confirmed by comparing against
`PlanScreen.jsx`'s already-correct equivalent.
**What:** two gaps in `IdeasScreen.jsx`'s "✓ Saved" badge, both already fixed in `PlanScreen.jsx`'s
QuickTunePanel for the identical "✓ Plan saved" badge but never ported to Ideas: (1) the inline
`setTimeout(() => setPlanSaved(false), 2000)` had no cleanup — navigating away from Ideas within the
2-second window calls `setState` after unmount (a React warning / potential leak); (2) the badge
didn't reset if the user switched to a different scenario within the 2-second window, so "✓ Saved"
could keep labeling a scenario that was never actually saved.
**Fixed:** ported PlanScreen's exact two-`useEffect` pattern: one resets `planSaved` whenever
`activeScen` changes (calling `setPlanSaved(false)` unconditionally is a no-op when already false,
so it's safe to run on mount too — no guard needed, avoiding a lint escape hatch); the other runs
the 2-second timeout inside a `useEffect` with a `clearTimeout` cleanup, keyed on `planSaved`.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (`planSaved` effects; modal `onConfirm` simplified
to just `setPlanSaved(true)`, no inline timeout).
**Tests:** none added — behavioral parity with PlanScreen's already-tested equivalent pattern; the
existing "make this my plan" flow tests continue to pass unchanged.

---

### BUG-59 — `eventsView` writes accepted non-finite amounts/ages (found + fixed 2026-07-09, CodeRabbit review of PR #51 commit c2d49cf)

**Owner:** me_theguy. **Found by:** CodeRabbit (🟠 major), against `src/App.jsx:194-221`.
**What:** `amountField.set`'s `Math.max(0, Number(v) || 0)` and `ageField.set`'s equivalent let
`Number(v)` produce `Infinity`/`NaN` straight through — `Infinity || 0` is `Infinity` (truthy), so
the `|| 0` fallback never catches it. Separately, `eventsView.add(overrides)` spread `overrides`
directly onto the new event with no coercion at all, so any future caller passing a bad
age/amount override (a malformed preset, a future integration) would insert a corrupted event
straight into `moneyEvents`, which feeds the retirement simulation.
**Fixed:** replaced both inline clamps with shared `coerceAmount`/`coerceAge` helpers that check
`Number.isFinite` before clamping (falling back to `0`/`currentAge` — the pre-existing defaults —
on non-finite input); `add()` now routes `label`/`amount`/`age`/`isTaxable` through the same
coercion instead of spreading raw `overrides`. Deliberately did **not** change the clamp-in-setter
timing itself (the accepted WI-3.6 precedent, see the `ageField`/`EventsEditorPanel` review threads
on PR #51) — this fix is about coercion robustness (rejecting non-finite values), not the
draft-vs-blur UX question, so it doesn't conflict with that earlier decision.
**Where:** `src/App.jsx` (`eventsView` memo).
**Tests:** none added — not reachable via the current UI (`<input type="number">` rejects literal
"Infinity" text), so no regression test currently fails without the fix; the guard is defensive
against future preset/integration callers, consistent with the existing NaN/negative guards
elsewhere (`money-events.js`, `conversion-events.js`). Suite stays at 709 tests.

---

### BUG-60 — `ArcGraph`'s lean-market label duplicated `bandModel`'s lower-bound formula (found + fixed 2026-07-09, CodeRabbit review of PR #51 commit c2d49cf)

**Owner:** me_theguy. **Found by:** CodeRabbit (🔵 trivial / quick win), against
`src/components/ArcGraph.jsx:495-522`.
**What:** `BandLabels`' `leanFinalTotal` (added by BUG-54's fix) recomputed
`last.total * (1 - spread(last.age) * CONE_LOWER_ASYMMETRY)` — the exact same formula `bandModel`
already computes for `loPts`' lower cone boundary. Two independent copies of one formula is the
shape of bug this codebase has been bitten by before (BUG-25/BUG-31) — if the spread or asymmetry
logic ever changes in `bandModel`, the label could silently drift from the band it's labeling.
**Fixed:** `bandModel` now returns `leanFinalTotal` itself (computed once, alongside `loPts`, from
the same `last`/`spread` values); `BandLabels` destructures it from the existing `useMemo(() =>
bandModel(...))` call instead of recomputing it inline.
**Where:** `src/components/ArcGraph.jsx` (`bandModel`, `BandLabels`).
**Tests:** none added — no existing harness renders the full `ArcGraph` component (only
`scrubPointForAge` is unit-tested, per BUG-54's note); value-preserving refactor, traced by hand.
Suite stays at 709 tests.

---

### BUG-64 — Life-event pill shows false success once the money-events cap is reached (found + fixed 2026-07-09, in-house diff review on PR #51)

**Owner:** me_theguy. **Found by:** independently surfaced by 3 of 8 finder angles in an in-house
code review (line-by-line scan, removed-behavior auditor, cross-file tracer) run against PR #51
after the paid review bots returned nothing further — strong corroboration from three independent
reasoning paths converging on the same defect.
**What:** `IdeasScreen.jsx`'s life-event "Add to plan" confirm handler unconditionally called
`setPlacedEvents`/`setActiveScen` (marking the pill "✓ placed" and swapping the arc overlay)
**before** checking whether the underlying `eventsView.add(...)` write actually happened.
`eventsView.add` (`App.jsx`) silently no-ops once `moneyEvents.length >= MAX_MONEY_EVENTS` (6) —
so once a user has 6 events (reachable via the new WI-3.8 Events editor, or 6 life-event pills),
confirming a 7th pill shows a checkmark and swaps the arc/scenario overlay, but the event is never
actually added to `moneyEvents` — a false-success state with no error path.
**Root cause:** the confirm handler was written before the events cap existed on this write path
(the pre-diff code called `setMoneyEvents` directly with no cap); `eventsView`'s wrapped `add()`
introduced the cap in this same PR (per the Apply-with-preview contract's "wrapped write surface"
rule) without the one pre-existing caller being updated to check it.
**Inert at the default state:** `moneyEvents` starts empty; reachable once a user has added 6 events
by any combination of the Events editor and life-event pills.
**Fixed:** the confirm handler now checks `eventsView.atMax` before performing the local "placed"
UI updates and the `add()` call — when at the cap, the confirm silently closes without a false
success state, matching the existing `EventsEditorPanel`'s own `atMax`-gated Add button. While in
the same handler, also removed a redundant `id: String(Date.now())` override the call was passing
into `add()` — `eventsView.add` already generates its own id (`Date.now() + Math.random()`); the
caller's override silently won (spread order) and (a) defeated the generator's collision-jitter and
(b) gave life-event-added rows a **string** id while every other event gets a **number** id, a type
inconsistency with no current downstream effect but no reason to keep.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (life-event confirm `onConfirm`).
**Tests:** 2 new in `src/horizon/__tests__/ideas-modes.test.js` — confirms `add`/`atMax` guard
skips the write and pill-placed state when at the cap; confirms the normal (under-cap) path still
adds and marks placed, and that no `id` override is passed.

### BUG-63 — `AffordabilityPanel`'s desktop age input has no bounds clamp (found + fixed 2026-07-09, in-house diff review on PR #51)

**Owner:** me_theguy. **Found by:** the line-by-line-scan finder angle of the same in-house review.
**What:** `AgeControl`'s desktop branch (`<input type="number" min={min} max={max} ...>`) passed
`Number(e.target.value)` straight to `onChange` with no clamping — HTML `min`/`max` attributes are
advisory only (the browser doesn't reject a typed out-of-range value). The mobile stepper branch
DID clamp (`Math.max(min, Math.min(max, value ± step))`), so this was a desktop-only gap.
**What actually breaks:** typing an absurd purchase age (e.g. `500`, or any age past
`scenarioRetAge + 130`, the retirement-walk horizon) produces a one-time-expense event whose age
never appears in any walked row. `calcWhatIfDelta`'s `isSustainable(amount)` check then returns
`true` for every tested amount (the "expense" never actually fires within the walk), so
`calcAffordabilityMax`'s binary search converges on `maxSearch` — the panel displays "You could
spend up to $5,000,000 at age 500 and still last to age 90," a nonsensical result presented as a
real answer, reachable by a simple typo (no special input needed beyond typing a number).
**Fixed:** the desktop input's `onChange` now clamps the same way the mobile stepper already does:
`Math.max(min, Math.min(max, Number(e.target.value) || min))`.
**Where:** `src/horizon/AffordabilityPanel.jsx` (`AgeControl`'s desktop `<input>`).
**Tests:** 1 new in `src/horizon/__tests__/ideas-modes.test.js` — types `500` into the purchase-age
input and asserts the rendered value clamps to the field's `max` (89 in the test fixture).
**Follow-up (2026-07-09, same day, found by Gemini's re-review of this exact fix):** clamping on
every `onChange` keystroke locks the input mid-typing — with `min=60`, typing "68" clamps to `60`
after the first digit ("6" < 60), making the second digit impossible to add naturally. Fixed by
giving `AgeControl` a local uncommitted `draft` string state: `onChange` writes the raw typed text
with no clamp, and only `onBlur` computes the clamped value and calls the parent `onChange`. The
original out-of-range-submission bug this entry documents stays fixed (an absurd value still
clamps once the field loses focus); only the mid-typing UX changed. Test updated to check the
draft is unclamped after a single keystroke, then clamps on blur.

---

### BUG-48 — `affordView.defaultPurchaseAge` can exceed its own field's `max` bound (found + fixed 2026-07-09, Gemini re-review of PR #51)

**Owner:** me_theguy. **Found by:** Gemini Code Assist, re-review round requested after the
in-house pass's BUG-63/45/47 fixes were pushed.
**What:** `App.jsx`'s `affordView` computed `defaultPurchaseAge: currentAge +
ASSUMPTIONS.AFFORD_DEFAULT_PURCHASE_OFFSET_YRS` (currently `+5`) without clamping it against the
`purchaseAgeField.max` (`safeLifeExp - 1`) bound the same object declares. `AffordabilityPanel`
seeds its local `purchaseAge` state directly from this default on mount — so for a user whose
`currentAge` is close to their planning horizon, the initial (untouched) input value could exceed
its own field's stated maximum before the user types anything.
**Reachable how:** `currentAge`'s own slider goes up to 80. With `currentAge = 80` and a modest
`lifeExpect` (e.g. `84`, itself only constrained to be `> retirementAge`), `safeLifeExp = 84`,
`purchaseAgeField.max = 83`, but `defaultPurchaseAge = 85` — 2 years past the field's own bound,
with no typing required to trigger it.
**Fixed:** `defaultPurchaseAge` now clamps to `purchaseAgeField.max` (via `Math.min`) inside the
`affordView` memo itself — bounds math stays in the model/App layer (rule 10), not the screen.
Deliberately clamped the *default down* to fit the existing bound rather than *expanding the
bound* to fit the default (Gemini's suggested patch did the latter) — the `max` represents "before
the plan horizon ends," a real constraint that shouldn't stretch just to accommodate an oversized
default.
**Where:** `src/App.jsx` (`affordView` memo).
**Tests:** none added — the existing `AffordabilityPanel`/Solvers-mode tests all use fixtures where
this doesn't trigger; the fix is a one-line, directly-inspectable clamp with an obvious invariant
(`defaultPurchaseAge <= purchaseAgeField.max` always holds by construction after the `Math.min`).

---

### BUG-47 — Life-event pill "placed" state was disconnected shadow state, stale in both directions (found + properly fixed 2026-07-09, owner follow-up on BUG-64)

**Owner:** me_theguy. **Found by:** BUG-64's fix (a narrow `atMax` guard) prompted the owner to ask
whether the underlying `placedEvents` design was sound rather than leaving the deeper issue as
accepted debt — re-examining it surfaced a second, pre-existing staleness direction BUG-64 didn't
cover.
**What:** `IdeasScreen.jsx` tracked a local `placedEvents` array (event labels) purely as UI shadow
state for the life-event pills' checkmarks — separate from `moneyEvents`, the actual source of
truth. This drifted in **both** directions: (1) clicking an already-"placed" pill to toggle it off
only removed the label from `placedEvents` — the underlying event stayed in `moneyEvents` forever,
so the pill said "removed" while the real plan still had it; (2) removing the same event via the
new WI-3.8 Events tab (`eventsView.rows[].remove()`) never touched `placedEvents`, so the pill kept
its checkmark after the event was actually gone (BUG-64's post-ship-review finder caught this
direction specifically). A third, more subtle case: `clearScen()` (called on every Ideas mode
switch) unconditionally reset `placedEvents` to `[]`, so switching away from "life" mode and back
un-checked every pill regardless of whether its event was still in `moneyEvents` — a third stale
direction, found while implementing this fix (not by the original review pass).
**Root cause:** `placedEvents` duplicated information already derivable from `moneyEvents` instead
of being computed from it — the "one source of truth" a shadow-state variable is disconnected from
will drift onto every code path that doesn't happen to update both.
**Fixed:** removed `placedEvents`/`setPlacedEvents` entirely. A pill's "placed" state is now
**derived** live from `eventsView.rows` on every render (`findPlacedRow`, matching on label + age +
amount + direction — the full shape the pill would have written, so an unrelated custom event that
happens to share just the label text doesn't false-match). Toggling a placed pill off now calls the
matching row's real `remove()` (previously a no-op on `moneyEvents`); the events-cap guard (BUG-64)
moved from the confirm handler to the pill's click handler itself, so the confirm modal never opens
when at capacity (cleaner than opening a modal that would silently fail on confirm); `clearScen()`
no longer resets any pill state, since there's no separate state left to reset — mode switches now
correctly continue to reflect whatever `moneyEvents` actually contains.
**Inert at the default state:** `moneyEvents` starts empty (no pills placed); all three drift
directions require having actually placed at least one life event first.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (removed the `placedEvents` `useState` and its one
setter call site; added `findPlacedRow`; updated the pill click handler and `clearScen`).
**Tests:** `src/horizon/__tests__/ideas-modes.test.js`'s life-event describe block rewritten (4
tests): the events-cap guard now checks the confirm modal never opens (not a post-hoc revert);
confirming under the cap calls `add()` with no `id` override; a pill whose event already exists in
`eventsView.rows` renders placed with zero clicks (direct test of the derivation, not a
click-then-rerender simulation the test mocks can't support); clicking a placed pill calls the
matching row's `remove()`.

---

### BUG-61 — `calcWhatIfDelta`'s forced re-sim silently drops `addlPreTaxBal` (found + fixed 2026-07-09, L3d post-ship review)

**Owner:** me_theguy. **Found by:** the adversarial-correctness agent of the two-Opus post-ship
review (`.claude/skills/post-ship-review.md`) run against the WI-3.7/WI-3.8 (L3d) diff.
**What:** `App.jsx` folds the user's `addlPreTaxBal` input (an outside pre-tax balance, feature #8)
into the headline `totalAtRet`/`tradGrossAtRet` — `baseTotalAtRet` passed into `calcWhatIfDelta`
therefore already includes it. But `calcWhatIfDelta`'s forced-re-sim branch (triggered by an
accumulation-phase money event, a `retirementAgeOverride`, or the new `contribOverrides` param)
recomputes `scenarioTotalAtRet` from `runSimulation`'s output, which has **no concept of
`addlPreTaxBal`** — it's an App-level scalar, not a `runSimulation` input. So a forced-resim
"candidate" always excluded it while the non-resim "current"/"baseline" always included it —
a basis mismatch between the two sides of any before/after comparison built on this function.
**Root cause:** the resim branch's own comment claimed "matches the gross `baseTotalAtRet` so
scenario-vs-baseline deltas are apples-to-apples" (BUG-35 gross-basis note) — true for the
401k-gross-vs-haircut concern that comment addressed, but false for `addlPreTaxBal`, which the
comment didn't account for. This gap **predates L3d** (any pre-existing forced-resim caller —
Classic's `WhatIfPanel` accumulation-phase what-ifs, a retirement-age-shift scenario — already had
it) but was invisible: What-If mode shows one scenario at a time, not a side-by-side "same
mechanism" comparison. L3d's `surplusApplySite` and `buildScenarioCommitSite` are the first
features that market "current vs candidate, guaranteed same mechanism" prominently, which is what
surfaced it: a user with `addlPreTaxBal` set could see the surplus-allocation Apply preview show a
spurious six-figure **decrease** in "Nest egg at retirement" for a candidate that actually
increases contributions.
**Inert at the default state:** `addlPreTaxBal = 0` by default (golden master unaffected); reachable
for any user who has set the RMD-basis input (feature #8) and views either new preview.
**Fixed:** `calcWhatIfDelta` gained an optional `addlPreTaxBal = 0` param, added back into
`scenarioTotalAtRet` inside the resim branch (mirroring exactly how `App.jsx` already adds it to
`tradGrossAtRet`). Wired through `whatIfBundle` (Horizon, so every consumer — `surplusApplySite`,
`buildScenarioCommitSite`, the future `AffordabilityPanel` — picks it up automatically via the
`...whatIfBundle` spread) and through `WhatIfPanel.jsx`'s `sharedArgs` (Classic, via a new
`addlPreTaxBal` prop from `App.jsx`) — both UIs fixed identically, closing the same gap either
would eventually have hit. Default `0` is a no-op for every existing caller.
**Where:** `src/model/what-if.js` (`calcWhatIfDelta`'s signature + resim branch), `src/App.jsx`
(`whatIfBundle`, `<WhatIfPanel>` call site), `src/components/WhatIfPanel.jsx` (`sharedArgs`).
**Tests:** 2 new — a basis-symmetry lock (`addlPreTaxBal` adds exactly its value to
`scenarioTotalAtRet` on a forced resim) and a default-is-no-op lock, in
`src/model/__tests__/what-if.test.js`.
**Note (2026-07-12):** `buildScenarioCommitSite` (mentioned above as a consumer) was retired the
same day this entry merged into the arc-event-placement branch — see BUG-36's correction note.
The fix itself (the `addlPreTaxBal` param on `calcWhatIfDelta`/`WhatIfPanel`) is unaffected and
still live; `surplusApplySite` remains a real consumer.

---

### BUG-62 — `AffordabilityPanel`'s zero-headroom message falsely claims the plan doesn't sustain (found + fixed 2026-07-09, L3d post-ship review)

**Owner:** me_theguy. **Found by:** the same post-ship review pass as BUG-61.
**What:** `calcAffordabilityMax` returns `canAfford: false` for two distinct situations: (a) the
baseline plan itself doesn't sustain to the target age (fails even a $0 purchase), and (b) the
baseline plan **does** sustain, but has zero headroom for any additional expense at the chosen
purchase age (the binary search converges to `maxAmount = 0` because even one `step` breaks the
target). `AffordabilityPanel.jsx`'s `!canAfford` branch rendered "Your current plan doesn't sustain
to age {targetAge}" for both — false in case (b), where the plan is fine and simply has no slack.
**Root cause:** the model's `canAfford` boolean deliberately doesn't distinguish the two cases (it
answers "can this specific purchase be afforded," not "is the underlying plan healthy") — the
screen's copy assumed it did.
**Inert at the default state:** the default plan is trivially sustainable (`yearsSustained =
Infinity`), so case (b) — sustainable-but-zero-headroom — is unreachable without a tighter, more
realistic plan; reachable for any user on a tight-but-solvent plan probing a large purchase.
**Fixed:** reworded the message to a claim that's true in both cases without needing a new model
field to distinguish them: "Your plan has no room for an additional expense at age {purchaseAge}
while still sustaining to age {targetAge}." No model change — display copy only.
**Where:** `src/horizon/AffordabilityPanel.jsx`; test originally in the now-retired
`ideas-modes.test.js` (ported to `src/horizon/__tests__/ideas-screen.test.js`'s "Solvers mode"
describe block on 2026-07-12, alongside the Scenarios-removal merge).

---

### BUG-41 — `verifier-browser.cjs` has a stale hardcoded "Money flow" Numbers tab (found 2026-07-08, L3c verification pass; re-diagnosed + fixed at 2026-07-08 close-out)

**Owner:** me_theguy. **Found by:** the orchestrator during the WI-3.6/WI-3.9 (L3c) manual
verification pass; **misdiagnosed** at filing time as a Playwright locator defect ("the tab
renders fine, the click just times out") — corrected during the same-day session close-out.
**What actually happens:** `.claude/skills/verifier-browser.cjs:63` hardcodes
`NUMBERS_TABS = ['Statement', 'Budget', 'Accounts', 'Taxes', 'Year by year', 'Money flow']`. The
"Money flow" tab **no longer exists** in `NumbersScreen.jsx` — its button and render block were
removed in commit `434caf8` (2026-06-24, PR #38, "Numbers screen depth build-out"). The verifier
correctly fails to find a button with that label and times out; there was never a locator bug.
**Root cause of the stale test, and why it's NOT a product bug:** `434caf8`'s diff shows the
"Money flow" tab's retirement-phase content (SS / Pension / Portfolio draw) was **merged into the
Statement tab** as a new "Retirement income companion strip" in the same commit (still present
today at `NumbersScreen.jsx:478-493`, shown beside the existing working-year paycheck waterfall) —
this was a deliberate 6→5 tab consolidation (Statement already showed a similar working-year
breakdown; folding the retirement-year one in next to it removes a redundant tab), not an
accidental deletion. Confirmed by re-reading the commit's full diff and message, and independently
confirmed against the owner's own recollection during the 2026-07-08 close-out. The commit's
message and the CLAUDE.md status entry it produced (Status log, "Numbers screen depth build-out —
Sessions 1–4") describe this only as "hardened the Year-by-year and Money-flow tabs," which is
misleading phrasing (it reads as if both tabs still exist standalone) — that phrasing is what led
this session's initial BUG-41 filing to assume a 6th tab still exists and misdiagnose the
verifier's failure as its own bug.
**What was actually wrong (the real, narrow bug):** only `.claude/skills/verifier-browser.cjs`'s
hardcoded `NUMBERS_TABS` array — a piece of test tooling — never got updated for the 434caf8
consolidation. `src/horizon/__tests__/numbers-tabs.test.js` and the render-smoke suite were
correctly updated at the time (they don't reference a "Money flow" tab) — only this one visual
verification script drifted.
**Fixed:** 2026-07-08, same session. `NUMBERS_TABS` in `.claude/skills/verifier-browser.cjs`
trued to the current 5-tab list (`['Statement', 'Budget', 'Accounts', 'Taxes', 'Year by year']`).
`docs/HORIZON.md` and `docs/ROADMAP.md`'s parity table corrected to describe the 5-tab Numbers
screen with the consolidated Statement companion strip instead of a standalone Money-flow tab.
`npm test` unaffected (this touches only the `.claude/skills/` Playwright script, not the suite).

---

### Level 3 (Control) review fixes — WI-3.1 + WI-3.2, PRs #44 / #46 (2026-06-26)

**Source:** CodeRabbit + Gemini review of the Level-3 setter-bundle plumbing (WI-3.1/#98) and the
new **My details** screen (WI-3.2/#99). Because PR #44 was squash-merged before the bots finished,
the full cumulative diff was re-surfaced for a whole-diff review via a throwaway PR (#47, base =
pre-Level-3 commit), and the fixes landed on PR #46 across several incremental rounds. Suite
560 → **575** tests, lint clean, build OK, **golden master untouched** (all changes are display /
input-plumbing only). Files: `src/App.jsx` (the WI-3.1 bundles + coupled setters),
`src/horizon/screens/MyDetailsScreen.jsx`, `src/__tests__/setter-bundles.test.js`.

Functional-correctness bugs (all in the new Level-3 code unless noted):

1. **`ssClaimingAge.min` could exceed `max` (Major) — FIXED.** The BUG-17 floor
   `max(SS_MIN_CLAIM_AGE, currentAge)` ignored the upper cap, so for `currentAge > 70` (ages run to
   80) the bundle handed Horizon/Classic a slider with `min > max`. Now
   `min: Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge))` — the exact Classic clamp.
2. **Stored `ssClaimingAge` not clamped when current age advances (Major) — FIXED.** Fix #1 only
   corrected the slider *metadata*; `setCurrentAgeCoupled` still let `currentAge` rise past 70 while
   the stored claim age stayed below the new floor (value < min). Now clamps the stored value at the
   source. Regression test drives `currentAge → 78` and asserts the stored value stays in range.
3. **`lifeExpect` not synced when current age passes the horizon (Major) — FIXED.**
   `setCurrentAgeCoupled` pushed `retirementAge` up but left `lifeExpect` behind, so `lifeExpect` /
   `retirementAge` could fall outside their own min/max contracts. Latent in the original Classic
   current-age handler; surfaced once that handler was DRY'd onto the shared callback (see #11). Now
   `if (lifeExpect <= v) setLifeExpect(v + 1)`. Regression test added.
4. **State-tax-rate stepper stuck on mobile (High) — FIXED.** The snap-to-default threshold (`0.15`)
   exceeded the stepper step (`0.1`), so a single tap off the default snapped straight back to null —
   the field was uneditable on mobile. Lowered the threshold to `0.05` in **both** the bundle wrapper
   and the Classic `onChange` (duplicate copies kept in sync). Real-setter round-trip test added.
5. **`ssOverride` slider could clamp its own seed (Medium) — FIXED.** When the override is null the
   field seeds from `ssAnnualBenefit`; a high estimate (> 60k) exceeded the static max. Now
   `max: Math.max(60_000, ssOverride || ssAnnualBenefit || 0)` (the dynamic-max pattern).
6. **`marketplaceMonthlyPremium` stepper could go negative (Medium) — FIXED.** The bundle field had
   no `min`, so the `−` stepper could drive the premium below 0. Added `min: 0, step: 50`.

Rule-10 / quality / a11y fixes on `MyDetailsScreen`:

7. **`?? 0` / `seed: 0` fabrication removed (rule 10) — FIXED.** `DetailField` computed
   `editVal = isNull ? (seed ?? min ?? 0)` — fabricating a number when the model supplied neither.
   Replaced with a `canEdit` guard (a nullable field is editable only when a seed/min exists, else a
   read-only edge state). Separately dropped the screen-owned `seed: 0` on the marketplace-premium
   field — the bundle's `min: 0` already supplies the seed.
8. **`sliderMax` honoured for desktop tracks — FIXED.** Account-balance sliders used the 5M
   DeferredInput hard cap as the track max → coarse $10k steps. Now use `sliderMax` from the bundle,
   clamp-safe via `Math.max(sliderMax ?? max, editVal)` so a large balance never pins the thumb.
9. **Card header is a native `<button>` — FIXED.** Was a `role="button"` div; switched to a real
   button (kept `aria-expanded` + styling) for proper assistive-tech semantics. Dropped the now-unused
   `kbActivate` import.
10. **Conditional-render declutter matching Classic — FIXED.** Fields moot given another value are now
    gated: income plateau only when income grows, state-rate override only for taxed states, spouse
    income growth only with spouse income, flat employer match only in flat mode, marketplace
    household/premium only with marketplace coverage, Medicare-person only when on Medicare and married.
11. **Classic current-age handler DRY'd — FIXED.** The Classic "Current Age" slider had a duplicate
    inline `onChange` identical to `setCurrentAgeCoupled`; it now reuses the shared callback, so the
    SS-claim clamp (#2) and lifeExpect sync (#3) apply to both UIs from one definition.

The **CLAUDE.md "560 → 574"** flag (round 2) was a **false positive** and skipped: `560` is the
pre-Level-3 baseline and the right-hand number is the current locked total — the file is internally
consistent. (It now reads 575 after the regression tests above.)

---

### Numbers screen depth build-out review fixes — PR #38 (2026-06-24)

**Source:** CodeRabbit + Gemini review of PR #38 (`claude/kind-euler-rh0qvs`), Sessions 1–4.
Suite **516 tests**, lint clean, golden master untouched (all fixes display-only).

1. **MFJ income in `calcStatementView` — FIXED.**
   `App.jsx` was calling `calcStatementView({ currentIncome, … })` using the primary-only income
   instead of `householdIncome` (combined for MFJ — rules 3 & 9). The Statement tab's gross,
   keepPct, taxPct, and savePct were understated for MFJ filers. Fixed to pass `householdIncome`.

2. **Composition bar scope mismatch — FIXED.**
   `taxView.composition` mixed `fedTax` (a single working year) with the lifetime aggregates
   `rmdTaxBite` + `convTaxTotal`. Removed the working-year "Working tax" segment. Renamed the
   heading to "Retirement-phase tax composition (RMD + conversion)". Total 784_739 → 766_739
   (RMD + conversion only). Test mock and assertions updated.
   **File:** `src/App.jsx` (`taxViewBundle`), `src/horizon/screens/NumbersScreen.jsx`,
   `src/horizon/__tests__/numbers-tabs.test.js`.

3. **`taxSaveFromPreTax` scope — FIXED.**
   The 401k+HSA tax-saving callout used `safeDeduc` (all pre-tax deductions including other
   pre-tax) to compute "saves you $X in taxes." Fixed to `Math.round((contrib401k + contribHSA) *
   fedMarginal)` — matches what the copy actually says.
   **File:** `src/App.jsx` (line ~827), deps updated.

4. **Tab-strip keyboard accessibility — FIXED.**
   Numbers screen tab-strip `<div>` controls were not keyboard-operable. Converted to
   `<button type="button">` with `aria-pressed={on}`. Expandable year-by-year rows gained
   `role="button"`, `tabIndex={0}`, `aria-expanded`, and `onKeyDown` Enter handler.
   **File:** `src/horizon/screens/NumbersScreen.jsx` (tab strip ~L266; expandable row ~L1252).

5. **Jump bar filtered to displayed ages — FIXED.**
   Year-by-year jump bar showed age buttons for all marker ages including those past the "Show all"
   fold (unmounted rows). Fixed by filtering `markerByAge` to ages present in `displayedRows`.
   **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1176–1227).

6. **`WITHDRAWAL_RATE_DANGER_PCT` constant — FIXED.**
   The `wr <= 6` threshold was hardcoded; added `WITHDRAWAL_RATE_DANGER_PCT: 6` to ASSUMPTIONS in
   `src/config/irs-2026.js` and imported it (rule 1).
   **File:** `src/config/irs-2026.js`, `src/horizon/screens/NumbersScreen.jsx`.

7. **Null driver edge state — FIXED.**
   `planView.drivers.filter(d => !d.ok)` counted `d.ok === null` (inapplicable metric, e.g.
   longevity when plan is Infinity-sustainable) as a failing driver. Fixed to
   `d.ok === false` only. The On Track pill no longer shows false warnings for sustainable plans.
   **File:** `src/horizon/screens/NumbersScreen.jsx` (~L312).

8. **`markerByAge` key collision — FIXED.**
   When retire age equals RMD start age (73), the object literal `{ [73]: "Retire", [73]: "RMD
   start" }` silently dropped the first label. Fixed with a `reduce` that concatenates labels for
   the same age: `"Retire · RMD start"`.
   **File:** `src/App.jsx` (`markerByAge` memo).

9. **Budget footer total — FIXED.**
   The allocation-stack rows showed optimized values (`oa.opt*`) but the footer total showed
   `currentContribTotal` (unoptimized). Added `optimizedContribTotal` to `budgetView` in App.jsx
   and updated the screen footer to use it.
   **File:** `src/App.jsx` (`budgetView` memo), `src/horizon/screens/NumbersScreen.jsx` (~L694).

10. **Ref callback memory leak — FIXED.**
    Year-by-year row refs used `ref={el => { if (el) rowRefs.current[age] = el }}`. The `if (el)`
    guard prevented React's null-on-unmount from clearing the stale ref — a memory leak. Fixed by
    always assigning (`rowRefs.current[age] = el`) so unmount clears it as React intends.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1263).

11. **V9 referential stability — FIXED.**
    `markerByAge` and `tablePhases` were computed inline inside the `horizonProps` useMemo body
    (new object on every deps-triggered rerender). Now memoized as separate useMemo calls with
    their own targeted dep arrays. Their deps (`safeRetAge`, `depletionAge`, `safeLifeExp`)
    removed from `horizonProps` dep array. `taxViewBundle` dep array cleaned up (removed stale
    `fedTax`). All V9/principle-13 referential-stability tests pass.
    **File:** `src/App.jsx`.

12. **Footer copy — FIXED.**
    Year-by-year footer said "growth after tax" — inaccurate after BUG-35 (balances are gross).
    Now reads "balances and growth shown gross; taxes appear in the Tax and Draw columns."
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1366).

13. **`fmtMo` / `fmt` fix — FIXED.**
    The retirement income companion strip passed already-monthly values to `fmtMo()` (which divides
    by 12), displaying 1/12 of the correct dollar amount. Fixed to `fmt()`.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L473).

14. **Savings guideline `?? null` — FIXED.**
    Budget tab's savings rate pill used `savingsGuide ?? 15` — fabricating a 15% guideline when
    the driver was unavailable (rule 10 violation). Fixed to `?? null` with a null guard on render.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L510).

15. **Null display in expanded rows — FIXED.**
    Year-by-year expanded row used `fmt(engRow.rmdTax ?? 0)` and `Math.round(X ?? 0).toLocaleString()`
    — coercing null/missing values to $0 instead of "—". Fixed to `fmt(engRow.rmdTax)` etc.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1327, ~L859–865).

**New open bug filed:** BUG-40 (`taxView.composition.total` misses `drawTax`).

---

### Constants-correctness + latent-bug batch (2026-06-23)

**Source:** owner-directed follow-up to the whole-codebase review — verify the IRS/SSA constants
against authoritative 2026 values (so a 2027 refresh is a clean re-import) and clear remaining
latent correctness items. Branch `claude/ai-codebase-review-fpigu3`; committed incrementally,
highest-impact first. Suite 443 → **471** tests; lint clean.

1. **Stale FICA wage base — FIXED (data correctness; golden master moved deliberately).**
   `FICA_WAGE_BASE` carried the **2024** figure ($168,600) while labeled "2026". The authoritative
   2026 SSA contribution-and-benefit base is **$184,500** (2025 was $176,100). The 2026-06-16 FICA
   *rate split* made this **inert at the default** (default income $100k < base) — which is exactly
   why it survived that review — but the base caps SS AIME, and the default income grows above it in
   later working years, so AIME was understated. Fixed in `src/config/irs-2026.js`. Golden master
   moved, all direction-verified: ssAIME 12399→12977, ssAnnualBenefit 45,924→46,968, firstRMD
   62,071→62,279, totalRMDs 1,144,815→1,148,650, rmdTaxBite 202,423→204,864, spendableAtRet
   3,578,221→3,574,967 (higher SS floor → higher stacked retirement rate), netConversionBenefit
   -10,096→-9,981. `social-security` wage-base-cap tests updated (titles + thresholds).

2. **`fvAnnuity` negative-rate logic bug — FIXED (value-preserving at default).**
   `finance-math.js` guarded the geometric annuity formula with `rate > 0`, so any **negative real
   return** fell through to the linear `annual * years` branch — overstating the FV of a
   declining-balance annuity (a -2% real return treated as flat). Now `rate !== 0`; only an exactly
   zero rate degenerates to the linear limit. Used by the conversion optimizer + mega-backdoor
   projection. Default real return is positive → no golden-master impact. +1 regression test.

3. **SS claiming-factor clamp — extended to the two sites the 2026-06-16 batch missed (latent).**
   That batch hardened `calcBenefit` against out-of-range/fractional claiming ages but left
   `calcSpousal` and the own-record spouse path (`retirement-income.js:38`) doing a raw
   `SS_FACTORS[age] ?? 1` lookup — which silently returns the **un-reduced FRA factor** on a miss
   (overstating an early claim, under-crediting a delayed own-record one). Extracted the clamp+round
   into one shared `claimFactor(age)` helper (`social-security.js`) now used by all three. Latent
   today (sliders feed in-range integers); value-preserving at default (single → spousal 0). +4 tests.

**Defensive tooling:** new `src/config/__tests__/irs-2026.test.js` — a constants-integrity guard
(STRUCTURE + internal consistency: contiguous strictly-progressive tax brackets, std-deduction
mfj=2×single, LTCG 0/15/20 ascending, monotonic SS factors =1.0 at FRA, descending RMD
Uniform-Lifetime divisors, ascending IRMAA tiers, constant-increment ACA FPL, 51-jurisdiction state
tables, assumption fractions in (0,1)). Fails loudly on a malformed/out-of-order refresh edit.
Value-locks ONLY verified/stable figures (wage base 184,500, RMD age 73, FRA 67) so it never
entrenches an unconfirmed dollar amount. +23 tests.

**Constants audit — COMPLETED (web-verified vs 2026 IRS/SSA), corrections applied.** The audit
agent (re-run after the first attempt was cut off by a session limit) verified every constant
against primary IRS/SSA + reputable secondary sources. It found **the wage base was the tip of the
iceberg** — ~30 more dollar figures carried 2024/2025 values under a "2026" label. The unambiguous,
independently re-verified corrections were applied in this batch (golden master moved deliberately):
  - **HoH standard deduction** 23,350 → **24,150** (Rev. Proc. 2025-32, OBBB). Inert at default (single).
  - **All 8 LTCG thresholds** were 2024 values → 2026: single 47,025/518,900 → **49,450/545,500**;
    mfj 94,050/583,750 → **98,900/613,700**; mfs 47,025/291,850 → **49,450/306,850**; hoh
    63,000/551,350 → **66,200/579,600**.
  - **Roth phase-out** was 2025 → 2026: single 150k/165k → **153k/168k**; mfj 230k/240k →
    **242k/252k**; hoh 150k/165k → **153k/168k** (mfs 0/10k statutory, unchanged). Shifts the default
    user's in-band contribution years → `retRoth` 576,295 → 587,692.
  - **401k catch-up** 7,500 → **8,000**; **415(c)** 70,000 → **72,000**; **415(c)+catch-up** 77,500 →
    **80,000**; **HSA self-only** 4,300 → **4,400** (IRS N-25-67 / Rev. Proc. 2025-19). HSA inert at
    default (default contribution below the cap).
  - **SS PIA bend points** were 2025 → 2026 eligibility year: 1,226/7,391 → **1,286/7,749**. Raises
    PIA for the default AIME → ssPIA 3914→4010/mo, ssAnnualBenefit 46,968 → **48,120**, cascading to
    firstRMD 62,508, totalRMDs 1,152,878, rmdTaxBite 207,557, spendableAtRet 3,582,799,
    netConversionBenefit -9,854, withdrawalRate 1.44728, totalAtRet 3,964,475.
  - Stale unit-test fixtures that hardcoded old constants were corrected (calcPIA tests now derive
    from the config bend points so they're refresh-proof; HSA/Roth-band/LTCG fixtures retargeted to
    keep their original intent under the new thresholds). Verified figures value-locked in the new
    `irs-2026.test.js` so they fail loudly next refresh.

**ACA FPL + IRMAA — RESOLVED (owner decisions, 2026-06-23).** Both were design forks, now settled:
  - **ACA FPL (`ACA_FPL_2026`)** — was the **2024** guidelines (wrong). Owner chose the model-correct
    *prior-year* basis: ACA subsidy eligibility for a plan year uses the FPL guidelines published the
    prior calendar year, so 2026 coverage uses the **2025-published** HHS set (1=15,650 … 6=43,150,
    +5,500/person; Federal Register 2025-01377). Kept the `_2026` name (= "governs 2026 coverage") with
    an explicit comment that these are the 2025-published numbers + a REFRESH RULE (for 2027 coverage →
    use the 2026-published set 1=15,960 … 6=44,360). This is the user's "use the correct values, label
    them honestly" design.
  - **IRMAA (`IRMAA_BRACKETS_2026`)** — owner chose **Part B + Part D combined** (full retiree cost,
    matches the prior intent). MAGI breakpoints refreshed 2025 → 2026 (single 109/137/171/205/500k;
    mfj 218/274/342/410/750k) and surcharges set to 2026 combined B+D annual: 1,148 / 2,885 / 4,620 /
    6,355 / 6,936 (per-tier monthly Part B + Part D: 81.20+14.50, 202.90+37.50, 324.60+60.40,
    446.30+83.30, 487.00+91.00; Kiplinger 2026 IRMAA).
  - Both are **inert at the default** (default conversion MAGI sits below the first IRMAA tier and ACA
    doesn't apply at the Medicare-age retirement), so the golden master is unchanged. `healthcare.test.js`
    fixtures that hardcoded the old ACA/IRMAA values were retargeted; new figures value-locked in
    `irs-2026.test.js`. Every ❌ the federal/SSA audit found is fixed or owner-decided.

**State-tax tables — audited + corrected (2026-06-23).** A follow-up agent audited `STATE_TAX` +
`RETIREMENT_STATE_TAX` (51 jurisdictions × 2) against 2026 law. These are modeling *approximations*,
so the bar was "factually correct note / reasonable 2026 figure," not bracket-exact. Found + fixed
(all verified vs Tax Foundation 2026 + state sources; all inert at the default state → golden master
unchanged):
  - **HI Hawaii — factual error, highest impact.** Was `rate: 0` / "Fully exempts 401k/IRA/pension" —
    but Hawaii exempts only *employer-funded* pensions and **fully taxes 401k/IRA** (the app's whole
    subject). Now `rate: 0.075` with a corrected note. This was telling a Hawaii 401k retiree they owe $0.
  - **2026 enacted rate cuts:** KY 4.0→**3.5%** flat (both tables); GA 5.39→**4.99%** flat (both); OK top
    4.75→**4.5%** (HB 2764); UT 4.55→**4.5%** flat. Rates + note text updated.
  - **Structural-label fix:** NE note said "Flat 4.55%" but Nebraska is **graduated** (4.55% is the top
    rate) — note corrected. KS note "top rate 5.7%" → **5.58%** (2026), rate 0.057 → 0.056.
  - Reasonable/✅ confirmed: IL/IA/MS/PA/MI full retirement-income exemptions, WV 2026 SS exemption, the
    flat-rate states (AZ/CO/ID/IN/LA/NC/OH/MA), and all no-income-tax states. Graduated-state effective
    rates (CA/NY/OR/MN/etc.) read as plausible 2026 figures, none >1pt off. **The constants audit —
    federal, SSA, and state — is now fully closed.**

---

### Whole-codebase review fixes — P1 + P2 batch (2026-06-16)

**Source:** the parallel Claude + CodeRabbit + Gemini whole-codebase review (see `docs/REVIEW-FINDINGS.md`).
Two commits on `claude/ai-codebase-review-fpigu3`; golden master unchanged (all fixes value-preserving at the default state); 441 tests stay green, lint clean.

**P1 (correctness):**
1. **Catch-up contribution off-by-one** — `simulation.js:51`. `isEligibleForCatchup` tested *start-of-year* age (`currentAge + (y-1)`), excluding the year the user **turns 50** from 401k/415(c)/Roth catch-up limits. Now tests the year-end `age >= CATCHUP_AGE`. The test that locked the wrong behavior (`simulation.test.js`) was corrected. *(Flagged by Claude + CodeRabbit.)*
2. **Tax-composition rule-10 leak** — `NumbersScreen.jsx` Taxes tab summed `fedTax + rmdTaxBite + convTaxTotal` and computed per-segment `%` inline. Moved into the model: `App.jsx` `taxViewBundle` now provides a `composition: { segments[{label,val,pct}], total }`; the screen formats only (bar widths stay as layout). Test fixture extended to match. *(Claude + CodeRabbit.)*

**P2 (defensive / minor):**
- `action-cards.js` — "Capture full employer match" card now gated to `matchMode === "formula"` (no-op for flat match); hardcoded RMD ages in copy now from config (rule 1).
- `budget.js` — `matchContribNeeded` capped at `TRAD_401K_LIMIT_2026` (rule 4).
- `healthcare.js` — ACA cliff boundary `>=` → `>` (income exactly at threshold doesn't cross).
- `what-if.js` — guards for degenerate inputs (`step <= 0`, `targetLifeExpectancy <= safeRetAge`, `scenarioRetAge <= currentAge`) to avoid early-termination / fabricated depletion.
- `accumulation.js` — `balAtAge` equal-age interpolation guard (NaN).
- `roth-conversion.js` — `findOptimalConversion` non-positive/non-finite `step` guard (infinite-loop); Scenario-B conversion capped so `taxableB` can't go negative.
- `retirement-tax.js` — `calcWithdrawalOrderTax` taxable-withdrawal LTCG rate now stacks on the ordinary floor instead of always `ltcgRate(0)`.
- `JourneyScreen.jsx` — hardcoded "73+" → RMD start age from props/config.
- `NumbersScreen.jsx` — dropped dead `retVals[...] ?? 0` fallbacks (keys always present).
- React-correctness nits — `ChartTooltip` stable key; `ArcGraph` per-instance SVG ids via `useId()`, event-marker key includes index, literal `0.92` → `CONE_LOWER_ASYMMETRY`; `ThemeContext` listens for OS `prefers-color-scheme` changes in `auto`; `DeferredInput` default `min`/`max`; `TaxTimeline` zero-horizon guard.

**Disputed items — re-reviewed 2026-06-16 (owner asked to re-validate; 2 of 4 were real):**

- **Roth phase-out (Gemini) — REAL, FIXED.** `simulation.js` scaled the *desired* contribution by the
  phase-out fraction instead of reducing the *limit* and taking `min(desired, reduced limit)`. This
  under-counted Roth contributions for anyone in the phase-out band not already maxing out (the
  first re-review pass mistook "direction correct" for "formula correct"). Fixed: `reducedCap =
  rothCap × phasePct; return Math.round(Math.min(contribRoth, reducedCap))`. Reachable at the default
  (income grows into the $150–165k single band ~ages 44–47), so the **golden master moved
  deliberately**: `retRoth` 573_820 → 576_295, `totalAtRet` 3_950_603 → 3_953_078, `spendableAtRet`
  3_575_746 → 3_578_221, `withdrawalRate` 1.45236… → 1.45145…. +1 regression test (below-max
  in-band contributor gets full desired; above-cap pinned to the reduced limit).
- **FICA / Medicare cap (Gemini) — REAL, FIXED.** `tax-basis.js` applied the combined 7.65% to wages
  *capped* at the SS wage base, but **Medicare (1.45%) is uncapped** and there's an additional **0.9%**
  surtax above $200k single / $250k MFJ. Lumping understated FICA for high earners (overstating
  take-home / `grossAfterTax`). Fixed: split into SS (6.2%, capped per-earner) + Medicare (1.45%,
  uncapped) + Additional Medicare (0.9% above the filing-status threshold); new config constants
  `SS_TAX_RATE` / `MEDICARE_RATE` / `ADDL_MEDICARE_RATE` / `ADDL_MEDICARE_THRESHOLD`. **Value-preserving
  at the default** ($100k < wage base → 6.2%+1.45% = 7.65%, no surtax), so the golden master is
  unaffected; two `tax-basis.test.js` cases that had locked the *capped* high-earner value were
  corrected (they were locking the bug). +1 net regression test.
- **SS factor out-of-range fallback (Gemini) — latent, HARDENED.** `calcBenefit` fell back to the FRA
  factor (1.0) for any age outside the 62–70 table, which would understate a 71+ claim. Not reachable
  today (the claiming-age slider clamps to 62–70), so changes no current output; now clamps the age to
  the nearest 62/70 boundary before lookup (correct-by-construction). The test that asserted the FRA
  fallback was corrected.
- **MoneyEvents `ev.amount || ""` (CodeRabbit) — NOT a bug, dismissal stands.** For a money-event
  amount, `0` means "nothing entered," so collapsing to the placeholder is the intended empty state;
  `?? ""` would render a meaningless $0 row. The `onChange` already floors at `Math.max(0, …)`.

**Still deliberately NOT changed:** the vite `node`→`jsdom` suggestion (react-test-renderer needs no
DOM; 443 tests pass under `node`), the screen-`useState` / formatter-division "rule-10" over-flags
(benign UI state / display formatting), and the Shell perf nits (P3, deferred).

---

### ~~BUG-35~~ — Traditional 401k taxed twice (after-tax retirement seed **and** RMD/conversion tax on the gross balance)

**Reported:** 2026-06-13 · **Fixed:** 2026-06-15 (dedicated change, owner-approved; direction **A** — gross seed + one tax-honest engine).

**Severity:** Correctness — understated the retirement portfolio and overstated lifetime tax (plan read more conservatively / shorter-lived than reality). The double-count hid *inside* an internally-consistent ledger.

**Symptom:** the Traditional 401k had its tax taken out twice: once at the retirement seam (displayed/carried as `tradGross × (1 − fedMarginal)`, App.jsx:187) and again year-by-year in retirement (RMD + conversion tax on the gross balance). The two taxations weren't even the same rate — the seam used the **working** marginal rate, the walk used **retirement** brackets.

**Root cause:** the single retirement walk was **seeded after-tax** but **paid tax computed on the gross** balance, so rule 2b's "only the tax leaks" became a *second* taxation. Separately, the displayed RMD schedule (`calcRMDProjection`) projected the 401k at the **nominal** return and **ignored every withdrawal** (conversions, draws), inflating RMDs vs. the real balance.

**Fix (BUG-35 — per-account engine as the single retirement-phase source):**
- New per-account engine `buildRetirementWalkByAccount` (`retirement-engine.js`) tracks the four accounts separately, **seeds from GROSS**, and taxes every dollar **exactly once** — when it leaves a pre-tax account (conversion, RMD, or extra 401k draw), stacked bracket-accurately on the SS/pension floor. Exposes a per-row tax breakdown (`convTax`/`rmdTax`/`drawTax`).
- New orchestrator `buildRetirementPhase` (`retirement-phase.js`) makes that engine the **ONE source** for longevity, the displayed RMD schedule, `rmdTaxBite`, and the Roth-conversion benefit (with/without-conversion counterfactual). The old nominal-growth, withdrawal-ignoring `calcRMDProjection` / `calcRMDPostConversion` / `calcRMDTaxSchedule` are no longer on App's path.
- **Gross everywhere:** `"Trad 401k"` is displayed gross (App.jsx:187), so the chart/Statement/Accounts/Flow-Down/accumulation rows/what-if all use the gross basis (no chart jump at retirement); `totalAtRet` is gross; `spendableAtRet` is an after-tax **reference chip** haircut at the **retirement** effective rate (fixes the working-rate haircut too).
- **Default retirement expense** = the user's current living spend (`effectiveLiving`), not `3% × portfolio` — portfolio-independent, so it can't balloon when the headline goes gross.
- `evaluateConversionPlan` now consumes the engine's `rmdTaxSaved`/`conversionCost` (keeps only the conversion-window display sim + IRMAA/ACA costs); the optimizer searches via the same engine (`retPhaseBase`), so it can never optimize a different model than the screen shows.

**Headline moves (golden master re-locked, 2026-06-15):** balances gross (`totalAtRet` 3,484,197 → 3,950,603); default expense ~104,525 → 57,377 (current living spend); `firstRMD` 118,198 → 62,071; `rmdTaxBite` 683,974 → 202,423; `netConversionBenefit` 77,861 → −10,096 (aggressive bracket-fill is net-negative at this spend); `yearsSustained` 62.9 → Infinity (trivially sustainable at the lower, honest spend).

**Files:** `src/model/retirement-engine.js`, `src/model/retirement-phase.js` (new), `src/model/conversion-evaluation.js`, `src/model/flow-down.js`, `src/model/accumulation.js`, `src/model/what-if.js`, `src/App.jsx`, and the golden-master / accumulation / flow-down / conversion-evaluation / what-if / engine / phase tests.

**PR #32 review rounds (6, CodeRabbit + Gemini; merged 2026-06-15):** the engine drew heavy review. Resolved in-PR: (1) **RMD before conversion** (IRS sequencing — RMD on the full pre-tax balance, then convert the remainder); (2) **tax-on-tax gross-up** (when Taxable is exhausted and the 401k funds the income tax, that withdrawal is itself taxed — fixed-point solve); (3) **money events folded into `needed`** before the tax solve (a 401k-funded purchase is taxed + grossed up; depletion sees it via `spendShort`); (4) **stale "after-tax" display copy** → gross; (5) **taxable inflows taxed** (engine routes events through the shared `applyMoneyEvents`; flagged taxable inflow → `inflowTax` ordinary-income component); (6) **RMD-schedule `bal` = `r.trad`** not `r.total` ("Est. 401k Balance" column); (7) **conversion-benefit `rmdTaxSaved`** compared over the common active span (apples-to-apples when conversions change longevity); (8) **Flow-Down accumulation clamp removed** (negative real growth reconciles); (9) **per-account cards reconcile** to gross `totalAtRet` when `addlPreTaxBal>0`, and `retTrad` = `tradGrossAtRet` so the optimal/worst-case withdrawal pools match. +11 regression tests over the rounds (412 → **441**).

**Follow-ups (documented, not blocking — open in this file):**
- **BUG-36** — `what-if.js` (`calcWhatIfDelta`) + `calcOptimizedScenario` still use the blended `buildRetirementDrawdown` for *deltas* (don't charge the spending-draw tax). NARROWED 2026-07-20: retirement-phase **duration-event income** is now taxed on the headline path (engine via `applyMoneyEvents.taxableIncomeAdjustment`); only the blended-walk comparison surfaces remain.
- **BUG-37** — engine ignores the `conversionTaxSource` toggle (always "taxable"-style); honoring "converted" would move the golden master (owner-deferred).
- **BUG-38** — engine charges only *incremental* tax above the SS/pension floor, so SS/pension is effectively tax-free (`tFloor` never charged). Inert at default; needs income-surplus handling.
- **BUG-39** — Flow-Down *accumulation* growth is a residual plug, not `Σ(row.growth)` (rule 2b).
- A dedicated **per-account detail screen** (each account's trajectory + tax treatment over life) is the planned **PR-B**, and is the display home for feature **#47** (withdrawal sequencing — the engine already does the math).

---

### ~~BUG-34~~ — What-if "retire earlier/later" re-sims dropped permanent accumulation-phase money events

**Reported:** 2026-06-12 · **Fixed:** 2026-06-12 (during WI-0.1 / #110)  
**Files:** `src/model/what-if.js` (`calcWhatIfScenario`, consumed by `calcWhatIfChart`), `src/model/__tests__/what-if.test.js`.

**Symptom:**  
With a permanent money event in the accumulation phase (e.g. the Ideas life-event pill "Buy a home · $60k at 40" committed to the plan), any scenario that shifts the retirement age (Ideas scenario cards, the retire-at dial) showed an arc/stat starting balance that ignored the event — the scenario pretended the $60k was never spent.

**Root cause:**  
When the scenario retirement age differed from the base plan, `calcWhatIfChart` re-ran the accumulation simulation with `moneyEvents: []` — overriding the permanent plan events carried in `simInputs.moneyEvents` with an empty list. (Batch A had fixed the same class of omission for the **retirement**-phase walk via the `retDrawShared.moneyEvents` merge, but the accumulation re-sim kept the hardcoded `[]`.)

**Fix:**  
The shared scenario runner (`calcWhatIfScenario`) re-sims with `simInputs.moneyEvents.filter(ev => ev.age < scenarioRetAge)` and additionally moves permanent events that fall **between** the scenario retirement age and the base retirement age into the retirement walk (they leave the accumulation window when retiring earlier). Inert when there are no money events → default state and golden master unchanged.

**Tests:** regression in `what-if.test.js` — a permanent $100k outflow at 40 must reduce a retire-2-years-earlier scenario's starting balance vs. the same scenario without the event.

---

### ~~BUG-33~~ — Projected retirement bracket label read one bracket too high (skipped the standard deduction)

**Reported:** 2026-06-06 · **Fixed:** 2026-06-06  
**Files:** `src/model/taxes.js` (`projectRetirementBracket`), `src/model/__tests__/taxes.test.js`.

**Symptom:**  
The Detailed tab's "projected X% marginal bracket" label (for RMD years) read one bracket too high near a boundary. At the **default** state it showed **32%** where the correct taxable-income bracket is **24%**.

**Root cause:**  
`projectRetirementBracket` matched the bracket on **gross** retirement income (avg RMD + 85% SS + pension) against the bracket thresholds — but those thresholds are **taxable**-income thresholds. The standard deduction was never subtracted, unlike `marginalRate()` / `calcTax()`, which compute the working-year bracket **and** the actual RMD/conversion tax on `agi − deduction`. It's a display-only label that feeds no tax calc and isn't in the golden master, so no check caught it. At default, gross $211,609 sat just over the 32% line ($201,775); real taxable income $195,509 is 24%. Introduced when the inline block was extracted value-preservingly (the inline original had the same gap — pre-existing, not a regression).

**Fix:**  
Subtract the standard deduction once before the scan: `taxableIncome = max(0, projRetIncome − deduction)`, match the bracket on that. Applied exactly once (nothing else in this label's path applied it — no double-count), so it's now apples-to-apples with the working-year bracket and the actual retirement tax. Return now also exposes `taxableIncome`. Display-only change; **no headline/golden-master value moved.**

**Tests (271 → 272):** the existing `projectRetirementBracket` cases updated to taxable-income expectations (64k gross → 12% on 47.9k taxable, was 22%); added the default-boundary lock (211,609 gross → 24% on 195,509 taxable — the 32%→24% case).

---

### ~~BUG-29~~ — Roth conversion tax was not bracket-accurate (flat top-marginal rate, no state tax)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06 (owner-approved golden-master move)  
**Files:** `src/model/taxes.js` (new `stackedIncomeTax`), `src/model/roth-conversion.js` (`calcConversionSim`), `src/model/retirement-tax.js` (`rmdRowTax` de-duplicated), `src/App.jsx` (2 `calcConversionSim` call sites), `src/model/__tests__/golden-master.test.js`, `src/model/__tests__/roth-conversion.test.js`.

**Symptom:**  
The displayed net Roth-conversion benefit was understated — ~$47,047 at default when a bracket-accurate calculation gives ~$77,861. The conversion *cost* was overstated by taxing the whole conversion at a single marginal rate, overshooting a bracket on rounding, and omitting state tax.

**Root cause:**  
`calcConversionSim` taxed each conversion as `conversion × marginalRate(floor + conversion)` — every dollar at the top rate, even dollars that really fall in lower brackets — and a rounding overshoot pushed the whole amount into the next bracket. The RMD side was already bracket-accurate (`calcTax(floor+rmd) − calcTax(floor)`), so the two sides of `netConversionBenefit = rmdTaxSaved − conv.totalTax` ran on different tax models. State tax was applied to RMDs but not conversions. An incomplete rollout of feature #33.

**Fix:**  
- Added one shared primitive, **`stackedIncomeTax(amount, floor, filingStatus, stateRate)`** in `taxes.js` = `round((calcTax(floor+amount) − calcTax(floor)) + amount × stateRate)`.
- `calcConversionSim` now uses it (new `retStateRate` param, threaded from App.jsx at both call sites — display and optimizer). The `calcTax`-difference form also fixes the bracket overshoot (no single-rate lookup).
- De-duplicated: `retirement-tax.js:rmdRowTax` now delegates to the same primitive (dropped its `baseFedTax` param). **Value-preserving — `rmdTaxBite` stayed exactly 683,974.**
- **Headline moves (default, deliberate):** `netConversionBenefit` 47,047 → **77,861**; `yearsSustained` 61.99935 → **62.92429** (the tax-honest walk now pays less conversion tax, so longevity ticks up). Golden master updated with dated BUG-29 comments.

**Tests (230 → 233):** new "bracket-accurate tax (BUG-29)" block in `roth-conversion.test.js` — single-bracket conversion matches the flat proxy within ±1; a multi-bracket conversion is strictly cheaper than the flat proxy (the core fix); the state-rate component adds exactly `round(Σ conversion × rate)`. Conversion *amounts* (82,765 / 121,800 in `conversion-planning.test.js`) are unchanged — they come from `calcBracketFillTargets`, independent of the tax calc.

---

### ~~BUG-32~~ — SS break-even age wrong for delayed claims (collapsed to ≈ the claim age)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06  
**File:** `src/model/retirement-income.js` (`calcSSBreakEven`), test in `src/model/__tests__/retirement-income.test.js`.

**Symptom:**  
For a user claiming Social Security **after** Full Retirement Age (claim 68–70), the displayed "break-even age" collapsed to ≈ the claiming age (claim at 70 → showed ~70). It should land in the low 80s — where the larger delayed monthly benefit overtakes the cumulative payments an FRA claimer had been collecting since 67.

**Root cause:**  
The month loop started its timeline at `ssClaimingAge`. For a delayed claim, `ageNow` already starts above FRA, so the FRA baseline (`cum67`) began accumulating at the claim age too — the FRA claimer was never credited for the `SS_FRA → claimAge` months it had already collected. With no head start to overcome, the higher delayed monthly made `cumClaim >= cum67` true on the first iteration, returning ≈ the claim age.

**Fix:**  
Start the timeline at the **earlier** of the two ages: `const tStart = Math.min(ssClaimingAge, SS_FRA)` and walk `ageNow = tStart + m/MPY`. The two gated accumulators and both crossing checks are unchanged. This is symmetric:
- **Early claim (62):** `tStart = 62` = the old start → behavior identical (the early-claim test passes unchanged, proving no regression).
- **Delayed claim (70):** `tStart = 67` → `cum67` now gets its rightful 67→70 head start → the crossing lands at **age 82**.

Display-only; affects no portfolio/headline number. Default state claims at FRA (`ssBreakEven` is `null`), so the golden master is unaffected and test count is unchanged (230 — one existing locked test updated from `toBe(70)` to `toBe(82)`).
---

### ~~BUG-16~~ (Audit Finding C) — Spousal SS benefit not reduced for early spouse claiming

**Reported:** 2026-06-02 · **Fixed:** 2026-06-06 (shipped standalone ahead of the full #30 engine, per the tracker's "quick win" note)  
**Files:** `src/model/social-security.js` (`calcSpousal`), `src/model/retirement-income.js` (`calcRetirementIncome`), `src/App.jsx` (Spouse SS UI/state), tests in `social-security.test.js` + `retirement-income.test.js`.

**Symptom:**  
The spousal Social Security benefit was always computed as if the spouse claimed at Full Retirement Age — there was no spouse-claiming-age input at all, so an early claim was never reduced.

**Fix (owner-approved design):**  
- New state `spouseClaimingAge` (slider, 62–70) and `spouseBenefitBasis` ("own" record vs "spousal / 50% of primary"). The early-claim factor is applied to the chosen basis.
- `calcSpousal` is now a single-purpose helper `(pia, spouseClaimingAge)` returning the spousal floor, with the factor **capped at 1.0** — spousal benefits earn **no delayed credits**, so claiming after 67 does not inflate it (the key correctness nuance). The own-benefit path uses the **full** `SS_FACTORS[spouseClaimingAge]` (own benefit does earn delayed credits).
- The spouse's own-benefit input is now treated and labeled as an **at-FRA (67)** figure so the factor is meaningful.
- An **advisory note** appears when the unchosen basis would pay more (mirrors how SSA pays the greater of the two).
- Spouse benefit is now gated by **`isMarried`** (selection logic moved up from `calcSpousal` into `calcRetirementIncome`).

**Value-preserving:** default state is single/unmarried → spouse benefit 0 → `householdSS` and every golden-master value unchanged. The golden-master `householdSS` line was simplified to drop the spousal term (`calcBenefit(ssPIA, 67) * 12`) so the changed `calcSpousal` signature isn't mis-called. 7 new tests (231 → 238 on the batch branch): the no-delayed-credits cap, the `isMarried` gate, the own-record early reduction, and the advisory flip. Feature `#30`'s "calcSpousal (BUG-16 fix)" deliverable is now shipped.

---

### ~~BUG-30~~ — MFJ capital-gains rate used primary-only income (taxable-account drag understated)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06 (shipped standalone, per the #30 tracker "quick win" note)  
**File:** `src/model/simulation.js` (per-year loop), test in `simulation.test.js`.

**Symptom:**  
For an MFJ household with two earners, the taxable brokerage account's LTCG drag was computed from primary-only income — a dual-$80k couple got a 0% LTCG rate when combined $160k should carry 15%, overstating taxable-account growth.

**Fix:**  
Hoisted the per-year spouse-grown income (`spouseGrown`, already computed for the Roth phase-out) and added it to the LTCG ordinary-income basis for MFJ only: `yearOrdinaryIncome = primaryMAGI − employeeDeferral − cHSA + (mfj ? spouseGrown : 0)`. Mirrors the existing `yearMAGI` combined-income pattern (CLAUDE.md rule 9). Spouse pre-tax deferrals aren't modeled yet (#30), so spouse income enters gross — consistent with how `agi` treats MFJ spouse income. **Inert at the default state** (single) → golden master unchanged. New test: an MFJ dual-earner household's taxable balance now grows slower than the single-filer equivalent (it correctly carries the 15% drag). Feature `#30`'s "ltcgRate combined-income (BUG-30 fix)" deliverable is now shipped.

---

### ~~BUG-31~~ — Flow-Down "Growth" was a plug hiding cross-equation mismatches; chart/longevity ignored retirement taxes

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05 (Path A — make the model tax-honest)  
**Files:** new `src/model/retirement-drawdown.js` (`buildRetirementDrawdown`), new `src/model/flow-down.js` (`calcFlowDown`), `src/App.jsx`, `src/model/drawdown.js`, `src/model/optimization.js`, `src/model/__tests__/golden-master.test.js`.

**Root cause (as filed):**  
The retirement portfolio was walked in ≥4 separate places (`totalChartData`, closed-form `calcYearsSustained`, `calcDrawdownYears`, `calcOptimizedScenario`), each with the tax-blind recurrence `bal = bal*(1+rReal) − yearNeed`. The Flow-Down waterfall then computed every "growth" figure as a **residual plug** (`distGrowth = distEndVal − distStartVal + distDraws + distRMDTax`), so it always balanced visually while silently absorbing: (A) a gross-vs-after-tax unit mismatch in the accumulation bridge; (B) the conversion-window tax the chart never subtracted; (C) the full `rmdTaxBite` (~$683,974 default) the chart never subtracted, plus an off-by-one in `distDraws`. Because the chart never charged the taxes, the headline longevity / depletion age were optimistic.

**Fix (Path A — owner-approved 2026-06-05):**  
- **One shared walk.** `buildRetirementDrawdown` is now the single source of truth; the chart, the headline longevity, the Flow-Down waterfall, `calcDrawdownYears`, and the optimizer all consume it, so they can never diverge again. Each row exposes `growth` (= `balStart·rReal`), `draw`, and `tax`.
- **Tax-honest.** The per-year recurrence is `balEnd = balStart*(1+rReal) − draw − tax`, where `tax` = the bracket-accurate per-year RMD tax (ages 73+) plus Roth-conversion tax (conversion window), passed in as per-age maps built from the existing `rmdDataWithTax` / `conversionSim.years` schedules. Only the **tax** leaks from the single pool; the RMD/conversion *principal* is not double-charged (single-pool assumption documented in `docs/FINANCIAL-MODEL.md`).
- **Growth is a true sum, not a plug.** `calcFlowDown` computes each "growth" as `Σ(row.growth)` independently; the bars reconcile by the walk's conservation law rather than by construction.
- **Facet A** fixed: the accumulation bridge puts the 401k start balance and contributions in the same after-tax units as `totalAtRet`. **Facet C off-by-one** fixed: phase draw ranges come straight from the walk rows.
- **Headline impact (default):** `yearsSustained` 88.60 → **61.99** (runs-out age 153 → 126). Still far beyond life expectancy, so the plan stays sustainable; the number is now honest. Golden master updated deliberately with a dated comment.

**Tests added (169 → 187):** `retirement-drawdown.test.js` (conservation `start+Σgrowth=Σdraw+Σtax+end`, anti-plug `residual==Σgrowth`, monotonicity, closed-form-vs-walk reconciliation incl. the BUG-26 deferred-SS trap) and `flow-down.test.js` (growth-is-a-true-sum, waterfall reconciliation, displayed RMD-tax == tax actually charged, off-by-one guard, Facet A units). These would have caught the original bug.

---

### ~~BUG-28~~ — Flow-Down distribution waterfall draws used the static `netPortfolioNeed` (ignored SS claimed after retirement)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05  
**File:** `src/App.jsx` (`flowData` → `distDraws`, ~line 644)

**Symptom:**  
In the Flow-Down tab's Phase 3 (distribution) waterfall, the "Living Expenses" step — and the "Portfolio Growth" step derived from it — were overstated for any plan where the user **retires before claiming Social Security** (e.g. retire 65, claim 67 or 70). The waterfall's start and end totals were correct (they come from the per-year chart), so the error was hidden: the inflated draws were exactly offset by inflated growth.

**Root cause:**  
`distDraws = netPortfolioNeed * actualSustainedYrs` used the **static** at-retirement `netPortfolioNeed` scalar. That scalar only subtracts SS when `ssClaimingAge <= safeRetAge` (`ssAtRet` gate). But the distribution phase is age 73+ — by then SS is always active (claiming age ≤ 70). So for an early retiree the per-year need in this phase is `expenses − SS − pension`, while the scalar was `expenses − pension`. The draws were too high by ≈ `householdSS × years` (~$780k in a typical case). Same family as BUG-10 (static `netPortfolioNeed` mis-handling deferred SS); the chart loop and `convWindowDraws` already gate SS/pension per year (CLAUDE.md rule 5b), but this one site was missed.

**Fix:**  
Replaced the scalar multiply with a per-year loop that gates SS and pension on their start ages, mirroring `convWindowDraws` and the `totalChartData` drawdown loop exactly. First draw age is `(distStartVal's age) + 1` — `RMD_START_AGE` when a conversion window exists (start value is the age-72 `portPreRMD`), else `safeRetAge + 1`. **Value-preserving in the default state** (default claims SS at retirement, so every distribution year already has SS → per-year sum equals the old scalar × years), so the golden master is unchanged; the fix only corrects the early-retiree case the default state doesn't exercise. Display-layer (component) computation, not in `src/model/`, so no golden-master/model-test movement.

---

### ~~BUG-27~~ — Roth post-conversion RMDs double-counted a year of growth (understated conversion benefit)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05  
**Files:** `src/model/rmd.js` (`calcRMDPostConversion`), `src/model/__tests__/rmd.test.js` (regression), `src/model/__tests__/golden-master.test.js` (locked value updated)

**Symptom:**  
The "net Roth-conversion benefit" was understated. At the default state the displayed figure was **$17,345** when the correct value is **$47,047** — the bug suppressed roughly $30k of benefit and would cause the conversion optimizer to recommend converting too little.

**Root cause:**  
`calcRMDPostConversion` starts from `tradBal73`, which `calcConversionSim` has **already grown to age 73** (it applies "one final year of growth on the trad balance to reach age 73"). But the RMD loop's first iteration (`age = RMD_START_AGE`) did `bal = bal * (1 + r)` *before* taking the age-73 RMD — growing the balance a second time. Every post-conversion RMD was therefore computed on a balance one year over-grown, and the whole post-conversion RMD schedule was shifted forward by a year. Because the baseline schedule (`calcRMDProjection`) has no such extra growth, the two sides of `rmdTaxSaved = rmdTaxBite − rmdTaxBitePost` were on different growth clocks, corrupting `netConversionBenefit` and the optimizer's `getNetBenefit`. The existing test only checked that post-conversion RMDs were *lower* than baseline (relative), so it never caught the absolute shift.

**Proof:**  
Ran the conversion engine with conversion amount = **0**. With no money actually moving, the post-conversion RMD schedule must equal the baseline exactly. It didn't — the post-conversion age-73 RMD equalled the baseline age-**74** RMD (one year of growth too high).

**Fix:**  
`calcRMDPostConversion` now skips the growth step in the first iteration (`if (age > RMD_START_AGE) bal = bal * (1 + r)`), because `tradBal73` is already the age-73 balance — matching `calcRMDProjection`'s convention. Added a regression test asserting the zero-conversion post-conversion schedule equals the baseline age-by-age. Golden master `netConversionBenefit` updated **17_345 → 47_047** as a deliberate, dated correctness change (CLAUDE.md rule 7).

---

### ~~BUG-26~~ — SS-delay gain years overstated (used full retirement portfolio, ignoring pre-70 drawdowns)

**Reported:** 2026-06-04 · **Fixed:** 2026-06-04  
**Files:** `src/model/drawdown.js` (new `calcDrawdownYears`), `src/App.jsx` (`ssDelayGainYrs`), `src/model/__tests__/drawdown.test.js`

**Symptom:**  
The "SS delay gain years" metric (`~X yrs longer`) overstated the portfolio-longevity benefit of delaying Social Security to age 70 — by 3–6 years for users who retire well before 70 and defer SS to the maximum.

**Root cause:**  
The old `ysSS70` solved a closed-form: "how long does the portfolio last drawing at the *post-SS-70* (lower) rate, starting from the full `totalAtRet`?" But between retirement and the age-70 claim, the user draws at a *higher* rate (no SS yet), so the portfolio is already partly depleted by 70. Starting the calculation from `totalAtRet` at the low post-70 draw ignored those higher pre-70 draws and inflated the result.

**Fix:**  
Replaced the closed-form with a new pure helper `calcDrawdownYears({ startBal, startAge, effectiveExpenses, rReal, ssAmount, ssClaimAge, pensionAmount, pensionStartAge })` that walks the drawdown **year by year**, gating SS and pension on their start ages per year — exactly mirroring the `totalChartData` chart loop (and honoring CLAUDE.md rule 5b: per-year income timing). `ssDelayGainYrs` now computes two year-by-year longevities from the same `totalAtRet` — one under the user's actual claiming age, one delaying to 70 with the larger age-70 benefit — and reports the rounded difference. The higher pre-70 draws in the delay scenario are now correctly captured. Returns `null` (no badge) when either scenario is sustainable indefinitely, matching prior behavior. The headline `yearsSustained` closed-form is unchanged; only this comparison metric moved to the per-year walk. Model layer, so golden master and all model tests still pass (6 new tests added for `calcDrawdownYears`, including a regression asserting the new delay figure is below the old closed-form overstatement).

---

### ~~BUG-17~~ (Audit Finding D) — SS claiming-age slider could be set below current age

**Reported:** 2026-06-02 · **Fixed:** 2026-06-04  
**File:** `src/App.jsx` (SS claiming-age `Slider`)

**Symptom:**  
The Social Security claiming-age slider allowed values below the user's current age (you can't claim in the past). Cosmetic only — the drawdown loops gate SS on `age >= ssClaimingAge`, so a past claiming age was already treated as "active from the start."

**Fix:**  
Slider `min` is now `Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge))` — floored at the current age but never exceeding the max claiming age (70), so the control stays valid even for users already past 70. No model change.

---

### ~~BUG-07~~ — Chart 1 Trad 401k normalization used Phase 1 rate for Phase 2 years

**Reported:** 2026-06-01 · **Closed (obsolete):** 2026-06-04  
**File:** `src/App.jsx` (Trad 401k chart normalization)

**Resolution — obsolete by refactor.**  
This bug described a mismatch between the mid-career *Phase 2 tax rate* (`rate2`) and the rate used to normalize the Trad 401k accumulation line. The entire phase-rate mechanism it depended on no longer exists: the rate1/rate2/rate3 sliders were removed in commit `cdca9be` ("Remove rate3/phase sliders — all tax rates now bracket-accurate"). The Trad 401k line is now normalized for **every** accumulation year at a single bracket-accurate `fedMarginal` rate (`App.jsx` `simData`), so there is no per-phase rate to mismatch and no retirement-year dip. The mid-career *scenario tool* itself is now tracked as premium feature #29.5 with its own state; the `phase2Actions` references that remain in `action-cards.js` are the unrelated action-plan grouping (Phase 1/2/3 = now / mid-career / retirement). Nothing to fix.

---

### ~~BUG-18~~ (Audit Finding G) — Retirement age could momentarily exceed `lifeExpectancy − 1`

**Reported:** 2026-06-02 · **Closed (already guarded):** 2026-06-04  
**File:** `src/App.jsx` (life-expectancy and retirement-age `Slider`s)

**Resolution — already guarded; verified.**  
The crossing is prevented by two independent layers that are both present in the current code: (1) the Life Expectancy slider has `min={retirementAge + 1}` and the Retirement Age slider has `max={lifeExpect - 1}`, so neither can be dragged past the other; and (2) the life-expectancy `onChange` handler explicitly clamps retirement age down (`if (retirementAge >= v) setRetirementAge(v - 1)`) within the same interaction. Verified by reading both handlers — no gap remains. Downstream loops additionally use `Math.max(1, safeLifeExp - safeRetAge)` guards as defense in depth. No change required.

---

### ~~BUG-25~~ — Optimizer bracket-mode mismatch, ACA omission, floor off-by-one, rmdTaxPost duplication

**Reported:** 2026-06-04 · **Fixed:** 2026-06-04 (code review findings 1–5)  
**Files:** `src/App.jsx`, `src/model/roth-conversion.js`

**Three correctness bugs + two architectural fixes from a post-batch-2 code review:**

**Finding 1 — Optimizer ignored ACA cliff costs (most severe).**  
`getNetBenefit` in `optimizerResult` returned `{ rmdTaxSaved, totalTax, irmaaCost }` and maximized `rmdTaxSaved − totalTax − irmaaCost`. The displayed "Adjusted Net Benefit" correctly subtracts `acaAnnualLoss` (lost ACA subsidies when a conversion crosses the 400% FPL cliff), but the optimizer never computed this. A user on marketplace insurance could receive an optimizer recommendation that crossed the ACA cliff, while the display simultaneously showed a negative adjusted benefit. Fix: replaced the inline IRMAA loop with a `calcHealthcareExposure` call (which already computes both IRMAA and ACA cliff exposure per year). Added `acaLoss` to the `getNetBenefit` return shape and updated `findOptimalConversion` to subtract it: `rmdTaxSaved − totalTax − irmaaCost − (acaLoss ?? 0)`. Optimizer display guard widened from `hasMedicare` to `hasMedicare || hasMarketplaceInsurance`.

**Finding 2 — Optimizer ran in bracket mode against a different model than displayed.**  
In bracket mode, `conversionSim` uses `annualConversions: bracketFillConversions` (a per-year array where pre-SS/pension years have more bracket room). The optimizer's inner `calcConversionSim` only received `annualConversion: amount` — a flat scalar that always overrides the array. Optimizing a flat scalar produces a different conversion profile than what bracket mode computes, making the suggestion inconsistent with the numbers shown. Fix: `optimizerResult` now early-returns `null` in bracket mode. The optimizer is only meaningful in custom mode (choosing the best flat annual amount); the per-year bracket targets are already determined by the bracket choice.

**Finding 3 — `buildIncomeFloors` age gate off by one (SS floor missing from the first SS year).**  
The `buildIncomeFloors` helper computed `age = safeRetAge + i` for i = 0…N−1, so `convFloors[0]` applied the SS gate using age `safeRetAge`. But the first conversion year in the simulation is displayed as age `safeRetAge + 1` (because `calcConversionSim` produces 1-indexed years and App.jsx adds the offset). The arrays are paired by index, so `convFloors[0]` (gate at `safeRetAge`) was used as the income floor for the year displayed as `safeRetAge + 1`. When `ssClaimingAge == safeRetAge + 1` (e.g., retire at 65, claim SS at 66 — a common setup), `convFloors[0]` checked `65 >= 66 = false` (no SS), but the displayed conversion year 0 IS the first SS year. The bracket-fill conversion target for that year was computed without the SS income floor — over-estimating the available room by approximately `ssTaxableRet` (~$20–24k). The same error propagated into `calcConversionSim`'s `retIncomeFloors`, understating the tax on that year's conversion. Fix: `age = safeRetAge + i + 1` — now aligned with the displayed year ages.

**Finding 4 — `rmdTaxPost` reduce in optimizer duplicated `rmdTaxBitePost` formula.**  
The same reduce (calcTax on rmdIncomeFloor + rmd, accumulate (tax − rmdBaseFedTax) + rmd × retStateRate) appeared verbatim at two sites: lines ~448–451 (display path) and lines ~493–496 (optimizer inner loop). Fix: extracted a `calcRMDTax(rows)` helper defined once in the component and called at both sites.

**Finding 5 — `healthcareExposure` not memoized.**  
`calcHealthcareExposure` and its three derived values (`acaCliffYears`, `totalIRMAACost`, `acaAnnualLoss`) were computed inline on every render, including unrelated UI events like tab switches. Fix: wrapped in `useMemo([conversionSim, convMAGIFloors, hasMarketplaceInsurance, householdSize, hasMedicare, filingStatus])` — recomputes only when healthcare-relevant inputs actually change.

**Tests added:** `findOptimalConversion` subtracts `acaLoss`; `acaLoss ?? 0` backward compatibility; per-year floor produces higher tax once SS income is included in the floor (guards the off-by-one fix).

---

### ~~BUG-22~~ — `convFloors` / `convMAGIFloors` duplicated loop + optimizer re-ran every render

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx`

**Symptom:**  
Two nearly identical per-year income-floor loops existed (`convFloors` for tax math using 85% taxable SS, `convMAGIFloors` for ACA/IRMAA MAGI using 100% SS). Separately, `convFloors`, `convMAGIFloors`, `retVals`, `currentSnapshot`, and `bracketFillConversions` were all created inline (`Array.from` / `Object.fromEntries` / object literal) on every render, so they produced new references each render. Because those references are dependencies of the `conversionSim` and `optimizerResult` memos, the 61-candidate conversion optimizer (≈3,000 inner iterations) re-ran on **every keystroke**, not only when its real inputs changed.

**Root cause:**  
The duplicated loop differed only in the SS amount; the unstable references defeated `useMemo` dependency comparison.

**Fix:**  
Extracted a single `buildIncomeFloors(ssAmount)` helper used for both arrays (the only difference — `ssTaxableRet` vs `householdSS` — is now an explicit argument). Memoized `convFloors`, `convMAGIFloors`, `bracketFillConversions`, `retVals`, and `currentSnapshot` with complete dependency lists (every reactive value each one reads), so they refresh exactly when an input changes and stay referentially stable otherwise. The optimizer now re-runs only when a genuine input changes. Pure refactor — all computed values are byte-identical (golden master unchanged).

---

### ~~BUG-21~~ — Roth-conversion optimizer dropped the first IRMAA year for early retirees

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx` (`optimizerResult` IRMAA loop)

**Symptom:**  
The conversion optimizer's IRMAA cost loop computed each conversion year's age as `safeRetAge + i`, but the conversion sim (and the on-screen IRMAA figure via `calcHealthcareExposure`) treats conversion year `i` as age `safeRetAge + i + 1` — conversions start the tax year **after** retirement, ending at age 72 before RMDs at 73. For an early retiree (≈ `safeRetAge ≤ 63`), the optimizer's age was one year low, so the first conversion year's IRMAA surcharge (`age + 2 ≥ 65`) fell below the Medicare threshold and was skipped. The optimizer therefore under-counted IRMAA cost and could recommend a larger conversion than the displayed numbers support.

**Root cause:**  
Same off-by-one family as ~~BUG-11~~ (age-gated conversion-window loop starting at `safeRetAge + i` instead of `safeRetAge + i + 1`), reintroduced in the new optimizer code (batch-2).

**Fix:**  
The optimizer now derives the age from the conversion sim's own 1-indexed `years[i].age` (`safeRetAge + (sim.years[i].age ?? i + 1)`), identical to the display path in `calcHealthcareExposure`. Verified against a retire-at-62 scenario: optimizer and UI now both count 10 IRMAA years (previously 9 vs 10). Also tightened the MAGI fallback from `?? amount` to `?? 0` for clarity (the year row always exists, and `??` never triggered on a `0` conversion anyway). Test-side: `action-cards.test.js` was passing the obsolete `rate3Combined` key instead of `effectiveRMDTaxRate`, leaving the rate `undefined` ("~NaN% effective") with no assertion to catch it — renamed the key and added a test asserting the RMD row renders the rate and contains no "NaN".

---

### ~~BUG-20~~ — App crashed on render: `fedMarginal` used before initialization (TDZ)

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx` (lines ~140 / ~144 / ~155, declaration at ~177)

**Symptom:**  
The entire app threw `ReferenceError: Cannot access 'fedMarginal' before initialization` on first render — a blank page. The `simData` memo (body + dependency array) and `currentSnapshot` read `fedMarginal`, but it was declared ~35 lines further down. `const` bindings sit in the temporal dead zone until their declaration line runs, so reading it earlier is a hard crash.

**Root cause:**  
The rate3-slider removal (batch-2) switched the `"Trad 401k"` after-tax normalization from the early `rate3` state to the later-computed `fedMarginal`, but left `fedMarginal`'s declaration below the code that now consumes it. It shipped undetected because `npm test` only exercises the pure-function model layer — nothing rendered `App.jsx`.

**Fix:**  
Moved the tax-basis block (`combinedIncome`, `totalPreTaxDeduc`, `safeDeduc`, `agi`, `fedTax`/`fedEffRate`, `fedMarginal`) above the `simData` memo so the value exists before it's read. Added a permanent render smoke test (`src/__tests__/render-smoke.test.js`) that `renderToString`s `App` once, so any future TDZ/runtime error in the component body fails CI instead of only the browser.

---

### ~~BUG-15~~ (Audit Finding F) — "Household Gross" / "FICA (both earners)" labels shown for non-MFJ filers

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` line 794

**Symptom:**  
The 2026 Tax Breakdown card labeled the gross-income row "Household Gross" whenever `spouseIncome > 0`, even for non-MFJ filers (single / MFS / HoH) where the displayed `householdIncome` is *primary-only*. The label implied the spouse's income was included when it was not.

**Root cause:**  
The label keyed on `spouseIncome > 0` rather than on filing status. Per CLAUDE.md rules 3 & 9, only MFJ uses combined household income; for every other status `householdIncome = currentIncome` (primary only).

**Fix:**  
The gross-income label now keys on `filingStatus === "mfj"` ("Household Gross") vs. otherwise ("Gross Income"), matching the value actually shown. The FICA label is left keyed on `spouseIncome > 0` ("FICA (both earners)") — that is correct, because FICA is always computed per-earner across both spouses regardless of filing status.

---

### ~~BUG-14~~ (Audit Finding E) — Flat employer match treated as contingent in the surplus optimizer

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/model/budget.js` (`calcOptimizedAllocation`, lines 51–63)

**Symptom:**  
With employer match set to **flat** mode (employer contributes `salary × pct` unconditionally), the "Optimized" surplus allocation still steered the user's own surplus into the 401k "to capture the match" — money that should go to HSA/Roth first in IRS-priority order. The advice was wrong because a flat match is paid regardless of what the employee contributes.

**Root cause:**  
The match-capture step ran for both modes and, for flat mode, computed the match *amount* (`salary × employerMatchPct`) and treated it as a contribution the user must make.

**Fix:**  
The match-capture step now runs only when `matchMode === "formula"` (the only mode where the match is contingent on the employee's own deferral, e.g. "50% of the first 6%"). In flat mode, surplus flows to HSA → Roth → 401k → taxable in correct priority. Added a flat-mode test asserting `extraMatch === 0` with HSA/Roth funded first; kept a formula-mode test asserting the match gap is still captured.

---

### ~~BUG-13~~ (Audit Finding B) — Roth conversion bracket-fill used a single steady-state target for every year

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` (bracket-fill block + display), `src/model/roth-conversion.js`, `src/model/action-cards.js`

**Symptom:**  
In "fill a bracket" mode, the recommended annual conversion was a single static amount computed as if Social Security and pension income were active in every year of the conversion window. A user who retires early and defers SS has several low-income years with far more bracket room available, but the app recommended the same conservative amount throughout — under-converting in the cheap early years.

**Root cause:**  
The per-year *tax* was already correct (`convFloors` gates SS/pension on claiming/start age per year, and `calcConversionSim` uses `retIncomeFloors`), but the conversion *target* (`annualConversion`) was a single scalar derived from the steady-state floor.

**Fix:**  
- `calcConversionSim` gained an optional `annualConversions` array (mirrors the existing `retIncomeFloors` pattern); each loop year uses `annualConversions[yr] ?? annualConversion`. Fully backward-compatible — omitting it reproduces the scalar behavior, so the golden master is unchanged.
- App.jsx now builds `bracketFillConversions` per year from `convFloors[i]` (bracket top + deduction − that year's income floor) and passes it in bracket mode only.
- The headline "Annual Conversion" metric and the "Suggested annual conversion" line show a range (`peak → steady`) with a "tapers as SS/pension begin" note when the amounts vary; the Roth-ladder action card wording adapts the same way. The year-by-year table already reflects the varying amounts.

---

### ~~BUG-12~~ (Audit Finding A) — Roth IRA phase-out used combined income for non-MFJ filers

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` (~line 179), `src/model/simulation.js` (~line 81), `src/model/action-cards.js`

**Symptom:**  
The Roth IRA contribution phase-out was tested against *combined* household income (`currentIncome + spouseIncome`) for every filing status. A single / MFS / HoH filer with a working spouse was falsely warned they were in (or over) the Roth phase-out zone, and the projection simulation wrongly reduced or zeroed their projected Roth contributions.

**Root cause:**  
Both the live-year flags (`rothPhaseoutWarning`, `rothFullyPhased`) and the per-year simulation phase-out test summed primary + spouse income unconditionally. Per CLAUDE.md rules 3 & 9, only MFJ files jointly; every other status reports separately and should be tested on the primary earner's MAGI alone.

**Fix:**  
Introduced `rothMAGI = filingStatus === "mfj" ? combinedIncome : currentIncome` (mirrors the existing `agi` gate) and used it for both phase-out flags; the phase-out action card now prints `rothMAGI` with "combined" wording only for MFJ. In `simulation.js`, the per-year test is now `yearMAGI = filingStatus === "mfj" ? primaryMAGI + spouseMAGI : primaryMAGI`. Added simulation tests: a single filer with a high-earning spouse is no longer phased out, while an MFJ household with the same combined income still is.

---

---

### ~~BUG-11~~ — Flow-Down conversion window draws counted from wrong starting year

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` lines 454–470, `src/model/action-cards.js` line 307

**Symptom:**  
The Flow-Down tab "Optimize & Convert" phase card showed "Living Expenses" (convWindowDraws) and "Portfolio Growth" (convWindowGrowth) that didn't balance against the actual chart trajectory. The "entering RMDs" connector value also showed the portfolio after the first RMD draw rather than before.

**Root cause:**  
Two related issues:

1. `convWindowDraws` loop started at `safeRetAge + i` (i=0 → age=safeRetAge, the retirement year). The chart makes no draw at the retirement year (drawdown starts at `safeRetAge + 1`), so `convWindowDraws` counted one phantom draw at retirement and missed the last actual draw at `RMD_START_AGE - 1`.

2. `portAt73` was sourced from `totalChartData.find(d => d.age === RMD_START_AGE)?.total`. The chart value at age 73 is the portfolio *after* the age-73 draw (first RMD), so `convWindowGrowth = portAt73 - totalAtRet + convWindowDraws + taxes` absorbed the first RMD draw as negative growth — making convWindowGrowth appear lower than actual investment return.

**Fix:**  
- Renamed `portAt73` → `portPreRMD` and changed the lookup to `RMD_START_AGE - 1` (age 72 — portfolio after the last conversion-window draw, before any RMD).
- Changed `convWindowDraws` loop to start at `safeRetAge + 1 + i` so it covers the same years as the chart drawdown ([safeRetAge+1, safeRetAge+conversionWindowYrs]).
- With both changes, `convWindowGrowth = portPreRMD - totalAtRet + convWindowDraws + taxes` equals pure investment return during the window.
- Updated `action-cards.js` label from "Portfolio at 73" → "Portfolio entering RMDs".
- Updated `action-cards.test.js` mock key accordingly.

---

### ~~BUG-09~~ — `totalChartData` SS/pension income off by one year (`>` vs `>=`)

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` lines 290–291

**Symptom:**  
The Portfolio Lifecycle and Total Portfolio — Full Lifecycle charts showed Social Security and pension income reducing portfolio draws starting one year later than the claiming/start age. For example, if SS claiming age was 67, the chart did not reduce draws at age 67 — only from age 68 onward.

**Root cause:**  
`totalChartData` drawdown loop used `age > ssClaimingAge` and `age > pensionStartAge` (strict greater-than). Every other age-gated loop in the codebase (`flowData.convWindowDraws`, `convFloors`) correctly uses `>=`. The `>` operator skips the claiming-age year itself, offsetting income by one year.

**Fix:**  
Changed both comparisons to `>=` (two character changes). The Portfolio Lifecycle and Total Portfolio charts now include SS/pension income starting at the exact claiming/start age, consistent with all other income-timing loops.

---

### ~~BUG-10~~ — Static `netPortfolioNeed` included SS even when `ssClaimingAge > safeRetAge`

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` lines 238–244, 1385–1396, 2185

**Symptom:**  
The Withdrawal Rate and Years Sustained headline cards, along with the "Portfolio draws" breakdown, showed SS income reducing the portfolio need even when the user's SS claiming age was after their retirement age. For example, retiring at 65 with SS claiming age 67 (FRA) would show `netPortfolioNeed = expenses − SS`, as if SS was available from day 1 — making the withdrawal rate appear lower than reality.

**Root cause:**  
`netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, householdSS, effectivePension)` used `householdSS` (full SS amount) without checking if `ssClaimingAge <= safeRetAge`. `effectivePension` was already correctly gated on `pensionStartAge <= safeRetAge`, but SS had no equivalent gate.

**Fix:**  
Added `ssAtRet = includeSS && ssClaimingAge <= safeRetAge ? householdSS : 0` — mirrors the pension gate exactly. `netPortfolioNeed` now uses `ssAtRet`. The breakdown card shows SS as "starts age X · deferred" (muted, not subtracted) when claiming age is after retirement, so the user understands their full portfolio draw requirement. The `householdSS` variable is unchanged for per-year loops and display contexts.

---

### ~~BUG-08~~ — RMD reference line missing in Portfolio Lifecycle chart for users retiring at 72

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 2489

**Symptom:**  
In the Flow-Down tab's "Portfolio Lifecycle" chart, the orange "RMDs age 73" reference line only appeared when `flowData.hasConvWindow` was true (i.e., `safeRetAge ≤ 71`). A user retiring at age 72 has zero conversion window years but RMDs begin at 73 — the reference line didn't appear even though it was directly relevant.

**Root cause:**  
The condition `flowData.hasConvWindow` (`conversionWindowYrs > 0`) was used as the gate. `conversionWindowYrs = RMD_START_AGE − 1 − safeRetAge`. At `safeRetAge = 72`, this equals 0, so `hasConvWindow` is false and the line was suppressed.

**Fix:**  
Changed the gate to `safeRetAge < RMD_START_AGE`. The RMD marker now appears whenever retirement precedes age 73, regardless of whether a conversion window exists. When `safeRetAge ≥ RMD_START_AGE` (already in RMD territory at retirement), the line is correctly suppressed because it would overlap or precede the retirement marker.

---

### ~~BUG-01~~ — Retirement age minimum is current age + 2

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**Files:** `src/App.jsx` (8 edits), `feature-tracker.html`

**Root cause:** `safeRetAge = Math.max(retirementAge, currentAge + phase2Start + 1)` applied the Phase 2 constraint unconditionally, even when Phase 2 was off. With `phase2Start` defaulting to 2, the floor was always `currentAge + 3` internally and `currentAge + 2` on the slider.

**Changes:**
- `safeRetAge` formula is now conditional: uses the Phase 2 constraint only when `showPhase2 = true`; otherwise `safeRetAge = retirementAge` directly.
- Retirement Age slider `min` is now `showPhase2 ? currentAge + 2 : currentAge`, allowing retirement age as low as current age (already retired).
- Current Age `onChange` guard updated to match: bumps retirement age to `currentAge + 2` only when Phase 2 is on; otherwise only prevents retirement age going below current age.
- Phase 2 toggle button bumps retirement age up to `currentAge + 2` proactively when Phase 2 is enabled from a low retirement age.
- `currentSnapshot` object introduced as a "year-0" fallback (current balance values with the same shape as `simData` rows). Used by: `atRetirement`, `rmdData`, `conversionSim`, and `totalChartData` when `retirementAge === currentAge`.
- `totalChartData` seeds a starting data point at `age = currentAge` when the user is already retired, so the drawdown chart starts from actual current balances rather than $0.
- Mid-career phase tagged as planned premium feature in `feature-tracker.html` (item #29.5), to be gated via the `isPremium` flag when #29 ships. No lock overlay built yet.

---

### ~~BUG-02~~ — "Fed / AGI" label reads as a division expression

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 764  
**Change:** Sub-label changed from `"fed / AGI"` to `"fed tax ÷ AGI"`. Same treatment applied to the Combined sub-label (`"all / gross"` → `"all ÷ gross · ref only"` and `"all / household"` → `"all ÷ household · ref only"`).

---

### ~~BUG-02a~~ — "Combined" effective rate unexplained

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` lines 766, 778  
**Change:** Marginal and Combined stats are now rendered in muted color with "ref only" in their sub-labels, visually distinguishing them from the headline Fed Effective rate. The explanatory note now explicitly states that these two figures are current-year reference only and do not feed into projections; it also points the user to the Phase 3 Retirement Federal Rate as the value that actually drives all projections.

---

### ~~BUG-03~~ — "Other Pre-Tax" row appearing from nothing causes layout jump

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 611  
**Change:** Removed the `{otherPreTaxDeduc > 0 && ...}` conditional. The "Other pre-tax" row is now always rendered; it shows `—` in muted color when the slider is at $0, and switches to the dollar amount in blue once a value is entered. Card height no longer changes as the slider moves off zero.

---

### ~~BUG-03a~~ — HSA default appears in Pre-Tax Deductions but is set far below

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 608  
**Change:** Added `(set in Accounts below)` in italics next to the "HSA contribution" label in the Pre-Tax Deductions breakdown. No model changes.

---

### ~~BUG-04~~ — "→ $X at ret." annotation is unexplained

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` lines 1135–1174  
**Change:** Added a small sub-line beneath the annotation reading *"contrib. amount scaled with income growth"* so the user understands the number is a projected contribution dollar amount, not a portfolio value.

---

### ~~BUG-04a~~ — "→ $X at ret." projection can show values above IRS limits

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1136  
**Change:** The projected contribution is now capped at `contribMax` (the per-account IRS limit) before display. When the projection hits the cap, `(IRS cap)` is appended to the annotation, making it clear the number represents the maximum allowed rather than an unconstrained projection. The growth calculation is also guarded to only run when `incomeGrowth > 0` to avoid showing a projection that equals the current contribution.

---

### ~~BUG-05~~ — Retirement Federal Rate: unclear what it drives

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1063  
**Change:** Added a short paragraph inside the Phase 3 card above the retirement-state selector: *"This rate drives all post-retirement calculations: portfolio charts, drawdown model, Roth conversion analysis, and the withdrawal strategy card. An incorrect estimate will silently skew every projection."*

---

## Conventions

- Add new entries at the top of "Open Issues."
- When fixing a bug, move it to "Resolved" and add: **Fixed:** date, commit SHA, brief description of change.
- Link relevant file + line numbers for every entry so they stay navigable as the codebase evolves.
- **Re-verify, don't just append.** "Make BUGS.md up to date" means a *verification pass*, not a logging pass. For **every** entry still under "Open Issues," open the referenced file + line and confirm the symptom still reproduces in the current code before leaving it open. If the cause is gone (the code was removed/refactored — e.g. BUG-07) or already guarded (e.g. BUG-18), move it to Resolved with a dated note explaining why. Stale-open entries are a documentation bug.
- **When you change code, sweep the open list.** A refactor or removal can silently moot an open entry that lives in a different file. After any non-trivial code change, scan "Open Issues" for anything the change affects and reconcile it in the same session — don't let obsolescence outlive the commit that caused it.
- A speculative or audit finding must be **verified against the code before** it is filed as Open. If it can't be reproduced, either don't file it or file it as Resolved/"already guarded" with the reason.
