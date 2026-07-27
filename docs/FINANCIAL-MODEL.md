# Financial Model

## Tax Calculations

### Federal Income Tax
- **AGI** = grossIncome − totalPreTaxDeduc (where totalPreTaxDeduc = contrib401k + contribHSA + otherPreTaxDeduc)
- **For MFJ filers:** AGI also includes `spouseIncome` (spouse pre-tax deductions are not tracked — planned feature #30). Combined AGI is taxed at MFJ bracket rates, giving the correct joint standard deduction and wider brackets.
- **Taxable income** = AGI − standard deduction (per filing status)
- Applied against 2026 graduated brackets (7 rates: 10%, 12%, 22%, 24%, 32%, 35%, 37%)
- Returns both total tax and effective rate (tax / AGI)

### State Income Tax
- Uses a flat effective rate per state from lookup table applied to AGI (which includes spouse income for MFJ)
- User can override with a slider for their actual effective rate
- Retirement state tax uses a separate table — **known limitation:** state exemptions on retirement income (SS, pension, 401k distributions) are not yet modeled per-state. Planned as feature #33.

### FICA
- 7.65% on each earner's gross income independently, each capped at the SS wage base ($168,600 for 2026)
- **For households with spouse income:** `fica = (min(primaryIncome, FICA_WAGE_BASE) + min(spouseIncome, FICA_WAGE_BASE)) × 0.0765`
- FICA uses gross income, not AGI (payroll tax, not income tax)
- **401(k) deferrals do NOT reduce the FICA base** — SS and Medicare apply to gross salary before 401(k) deduction. This is why Box 3/5 on a W-2 is higher than Box 1.
- **HSA via payroll (Section 125 cafeteria plan) DOES reduce the FICA base** — it reduces both Box 1 AND Box 3/5 simultaneously, making it invisible in the Box 1 vs Box 3/5 gap. This is the most tax-efficient way to fund an HSA.

### Household Budget Basis
- `grossAfterTax` = householdIncome − fedTax − stateTax − fica
- `householdIncome` = primaryIncome + spouseIncome (MFJ) or primaryIncome (all other statuses)
- This is the correct budget basis for `savingsCapacity`, `availableSurplus`, and the optimized allocation. It represents household cash available after all taxes are paid.

## HSA Contribution Method

The funding method changes the total tax benefit significantly:

| Method | Federal income tax saved | FICA saved (7.65%) | Total tax saved |
|---|---|---|---|
| Direct contribution (post-paycheck) | Yes — deductible on Schedule 1 | No — FICA already paid | ~22–24% of contribution |
| Payroll deduction via Section 125 | Yes | Yes | ~29–32% of contribution |

### Savings at 22% federal bracket (2026 limits)
- Self-only ($4,300): payroll saves **$1,275** vs direct saves **$946** — $329 difference
- Family ($8,550): payroll saves **$2,535** vs direct saves **$1,881** — $654 difference  
- Family + age 55 catch-up ($9,550): payroll saves **$2,832** vs direct saves **$2,101** — $731 difference

### W-2 reporting implications
- Payroll HSA contributions reduce both Box 1 and Box 3/5, leaving no detectable gap between them
- They should appear in Box 12, Code W — but some employers omit this (reporting error, does not affect tax treatment)
- The contribution is still correctly excluded from taxable wages even if Code W is missing

### Planner modeling rule
- Always ask user whether HSA is funded via payroll or direct deposit
- Apply FICA savings (7.65%) only when method = payroll
- Display coverage type selector (self-only vs family) — family limit is nearly 2× self-only
- Flag HSA as highest tax-efficiency account when user has HDHP coverage (triple tax advantage: pre-tax contributions, tax-free growth, tax-free qualified withdrawals)

### UX — how to ask the HSA question
Most users won't know the term "Section 125" or the difference between payroll deduction and direct contribution. Ask in plain language and default to the most common scenario.

**Recommended UI flow:**
1. Ask: *"Does your HSA contribution come out of your paycheck automatically?"*
   - "Yes, it's deducted from my paycheck" → payroll method (apply FICA savings)
   - "No, I transfer money into it myself" → direct method (no FICA savings)
   - "I'm not sure" → default to payroll method with a note

2. On "I'm not sure": show a friendly explanation:
   *"Most people with employer health coverage have their HSA funded through payroll — it shows up as a deduction on your pay stub alongside taxes and insurance. If that sounds like you, we'll use that method, which gives you the maximum tax savings."*

3. **Never ask**: "Is your HSA a Section 125 cafeteria plan?" — users don't know this and it creates friction without adding value.

4. Ask coverage type separately in plain terms:
   *"Who does your health plan cover?"*
   - "Just me" → self-only limit ($4,300 for 2025)
   - "Me and my family" → family limit ($8,550 for 2025)

### Feature flags to build
- [ ] HSA funding method toggle (payroll vs direct) with "I'm not sure" fallback
- [ ] HSA coverage type selector (self-only vs family)
- [ ] FICA savings line item shown separately in tax breakdown when payroll method is selected
- [ ] Tooltip or explainer that surfaces the ~$329–$654 annual difference between methods so users understand why the question matters

### LTCG (Capital Gains Drag)
- Taxable brokerage growth reduced by LTCG rate each year
- Rate determined from that year's AGI (ordinaryIncome − pre-tax deductions)
- 2026 brackets: 0% / 15% / 20% thresholds per filing status

## Social Security

### AIME (Average Indexed Monthly Earnings)
- Sum earnings for each working year, **capped at FICA wage base** per year
- Divide total by max(workYears, 35) to get average
- Divide by 12 for monthly

### PIA (Primary Insurance Amount)
- Bend points: $1,226 and $7,391 (2026)
- 90% of first $1,226 + 32% of $1,226–$7,391 + 15% above $7,391
- PIA is the monthly benefit at Full Retirement Age (67 for born ≥ 1960)

### Claiming Adjustment
- Age 62: 70% of PIA (permanently reduced)
- Age 67 (FRA): 100% of PIA
- Age 70: 124% of PIA (delayed credits stop here)
- Linear interpolation between these points

### Spousal Benefit
- 50% of the higher earner's PIA (annual = ssPIA × 12 × 0.5)
- Always based on primary's FRA — does NOT increase if the primary delays past FRA
- **Spouse's own claiming age matters (BUG-16 fix, Jun 2026):** if the spouse claims before their own FRA (62–66), the spousal benefit is reduced by the same early-claim factors that apply to any SS claim. Claiming after FRA does NOT increase the spousal benefit (no delayed credits on the spousal component). The spouse receives the higher of their own benefit (adjusted for their claiming age) or the spousal benefit (also adjusted for their claiming age).
- Spouse receives the higher of their own benefit or the spousal amount

### Taxability
- Up to 85% of SS benefit is taxable as ordinary income (used in bracket fill calculations)

## Roth Conversion Model

### Conversion Window (user-adjustable timing)
- The "gap years" between retirement and RMD age (73) are the textbook-optimal window —
  income is lowest before SS, pension, and RMDs stack up. This is the **default** window:
  retirement+1 → `RMD_START_AGE − 1` (age 72).
- **User-adjustable start/stop ages.** `conversionStartAge` / `conversionEndAge` (App state)
  default to `null` = the default window (the golden-master pin). The resolved window is
  clamped to `[safeRetAge+1, RMD_START_AGE−1]`; when `safeRetAge ≥ RMD_START_AGE−1` there is
  no window (`conversionWindowYrs = 0`) and the whole section is suppressed.
- **`buildConversionByAge({ startAge, endAge, … })`** (`retirement-phase.js`) builds the
  engine's `{ [age]: amount }` schedule over the inclusive `[startAge, endAge]` range;
  `annualConversions` is indexed by `age − startAge`. At the default window this is byte-identical
  to the old `safeRetAge+yr+1` indexing.
- Retirement-window conversions run through the single per-account engine
  (`buildRetirementPhase` → `retirement-engine.js`, rule 2b): the principal moves trad→Roth and
  only the tax leaks, stacked bracket-accurately on the SS/pension floor.

### Working-Year Conversions (pre-retirement, sporadic)
- A 401k→Roth conversion can also happen in a low-income **working** year (a job change /
  sabbatical). Modeled as a list `conversionEvents: [{ id, age, amount }]` applied inside the
  accumulation walk (`runSimulation`, helper `conversion-events.js → applyConversionEvents`).
- **Taxed once** as ordinary income stacked on that year's wage floor (`netOrdinaryIncome`,
  MFJ-combined) via `stackedIncomeTax`; the conversion amount is also added to the income base
  for that year's LTCG-bracket selection (`ltcgRate(netOrdinaryIncome + conv, …)`).
- **Tax funding:** from the taxable brokerage so the full principal lands in Roth; any shortfall
  leaks from the converted dollars (Roth deposit shrinks). When that shortfall happens **under
  age 59½**, the withheld portion is an early distribution and is charged the **10% penalty**
  (`EARLY_WITHDRAWAL_AGE` 59.5 / `EARLY_WITHDRAWAL_PENALTY` 0.10). Row fields:
  `convEvent` / `convEventTax` (tax+penalty) / `convEventPenalty`.
- **Carry-forward:** the lowered trad balance flows through `tradGrossAtRet` into the retirement
  engine seed, so future RMDs drop automatically.
- **Gated** behind an in-service-eligibility toggle (`conversionInService`) — converting an active
  employer 401k while still working is plan-dependent (it requires in-service distributions; it's
  freely available from a rollover IRA after leaving a job).
- **Benefit attribution (intentional limitation):** because working-year conversions lower the
  retirement *seed* (not the retirement-window `conversionByAge`), the `noConv` counterfactual in
  `buildRetirementPhase` seeds from the already-lowered balance — so their benefit shows up as
  **longer longevity and a lower `rmdTaxBite`**, NOT in the conversion-*window* `netConversionBenefit`
  headline. The UI says so; the optimizer is scoped to retirement-window conversions so it never
  claims a benefit it can't measure.

### Bracket Fill Strategy
- Target bracket top (12%, 22%, or 24%) + standard deduction − retirement income floor
- Retirement income floor = 85% of householdSS + effectivePension (steady-state, for display and bracket-fill suggestion)
- **Per-year floors for tax calculation:** `buildIncomeFloors({ startAge, … })` (anchored to the
  resolved window start) produces a `retIncomeFloors[]` array where each entry reflects whether SS
  and pension have actually started in that year. Pre-SS/pre-pension years use a lower floor, so the
  marginal rate on conversions in those years is computed correctly.

### Dual Tax Source Scenarios
- **From converted amount**: Roth receives (conversion − tax), less efficient
- **From taxable brokerage**: Roth receives full conversion, tax paid from taxable account
- Both scenarios computed simultaneously; user selects which to display

### Optimizer (timing + amount)
- `findOptimalConversionPlan` (`roth-conversion.js`) searches BOTH the conversion-window **start
  age** and the flat annual **amount** that maximize net benefit after IRMAA/ACA, via the SAME
  engine + `evaluateConversionPlan` the screen uses (so it can never search a different model —
  BUG-31/BUG-35 class). The suggestion line shows the recommended start age and amount. Start-age
  search granularity is `ASSUMPTIONS.CONVERSION_STARTAGE_STEP` (1 yr); amount step is
  `ASSUMPTIONS.CONVERSION_STEP` ($5k). Only runs in custom (flat-amount) mode.

## Drawdown Model

### Net Portfolio Need
```
netPortfolioNeed = max(0, effectiveExpenses − householdSS − effectivePension)
```
This is the only value used for portfolio depletion. The portfolio does NOT fund the full expense — SS and pension are external income.

**Critical: per-year computation in loops.** The static scalar `netPortfolioNeed` is correct only when all income sources are active. Any loop spanning retirement years must compute the need per-year:
```
yearSS      = includeSS && age >= ssClaimingAge ? householdSS : 0
yearPension = pensionMonthly > 0 && age >= pensionStartAge ? pensionMonthly × 12 : 0
yearNeed    = max(0, effectiveExpenses − yearSS − yearPension)
```
This applies to: `totalChartData` drawdown loop, `convWindowDraws` in `flowData`, and `retIncomeFloors[]` passed to `calcConversionSim`. The static scalar is still used for `withdrawalRate` and at-retirement display snapshots — those use the steady-state (all sources active) value, which is the correct "at retirement" snapshot. `yearsSustained` uses the per-year walk (`buildRetirementDrawdown`), not this scalar.

### Real Return
```
rReal = (1 + nominalReturn) / (1 + inflation) − 1
```

### Years Sustained — the ONE source: the per-account engine (`buildRetirementWalkByAccount`)
**Corrected 2026-07-25 — this section previously described `buildRetirementDrawdown` as "the
one tax-honest walk," which stopped being true when BUG-35 shipped the per-account engine.**
The retirement portfolio is walked, per account, in exactly **one** place —
`buildRetirementWalkByAccount` (`src/model/retirement-engine.js`), orchestrated by
`buildRetirementPhase` (`src/model/retirement-phase.js`) — and it is the source for the
chart (`totalChartData`), the headline `yearsSustained`, the displayed RMD schedule +
`rmdTaxBite`, the Flow-Down waterfall (`calcFlowDown`), and the Roth-conversion benefit +
optimizer. Balances are seeded GROSS (pre-tax) and taxed exactly once, per dollar, as it
leaves a pre-tax account — never a second nominal-growth projection, never a residual-plug
"growth" figure. The per-row identity (rule 2b):
```
balEnd(total) = balStart(total) × (1 + rReal) − draw − tax + events + spouseContrib
```
`draw` is net of SS/pension (age-gated per-year, rule 5b) AND — since the #30/BUG-82 spouse
engine — the spouse's own gap-year income (see "Spouse gap-year mechanism" below); `tax` is
the bracket-accurate RMD/conversion/event tax charged that year; `events` is any money-event
inflow/outflow; `spouseContrib` is the spouse's gap-year 401k contribution PLUS any banked
income surplus (BUG-82's fix — see `docs/BUGS.md`). `growth` is always the independent sum
`Σ(row.growth)`, never a plug. `yearsSustained` = years until the walk depletes (fractional
in the depletion year), or Infinity if the portfolio survives the horizon.

**Spouse gap-year mechanism (#30/BUG-82, `retirement-engine.js`).** When a spouse has their
own retirement age (`spouseRetirementAge`, independent of the primary's), the years between
the primary's retirement and the spouse's own are "gap years": the spouse's Traditional 401k
bucket (`tradSp`) keeps receiving contributions (injected AFTER that year's growth and AFTER
the spouse's own RMD block — a contribution never inflates its own year's required
distribution), the spouse's gross wages stack in the bracket floor (so conversions/RMDs/draws
remain bracket-accurate above them), and the spouse's net cash offsets that year's portfolio
draw — with any surplus beyond the year's spending need banked into the taxable pool (never
silently discarded). The spouse's bucket is held OUT of the drawable pool until they actually
retire (Option A — closer to real household cash-flow behavior than pooling a still-growing,
still-employed account), **except as a last resort** — see the escape hatch below. v1 scope:
Traditional 401k only; Roth/Taxable/HSA gap-year contributions are treated as spent
(dollar-conserving, not lost) — see BUG-85 in `docs/BUGS.md` for the full-parity follow-up.

**Real-dollar convention for the gap-year maps (BUG-90, fixed 2026-07-26).** The engine walks
in REAL dollars — a balance growing at `rReal` for `k` years is expressed in the PRIMARY's
RETIREMENT-YEAR purchasing power (the seed is already in that unit; see "Years Sustained"
above). `buildSpouseRetirementSeed`'s three gap-year maps
(`spouseContribByAge`/`spouseTaxableIncomeByAge`/`spouseIncomeFloorByAge`) are built from
`runSimulation`'s NOMINAL per-year figures, so each is deflated by `(1+inflationRate/100)^k`,
`k = primaryAge − primaryRetAge` (the base is the primary's retirement year — deflating to
today's dollars instead creates a discontinuity right at the seed/map handoff; see BUG-90 in
`docs/BUGS.md` for the numeric proof). `inflationRate` defaults to `0` (deflator `1`) so every
caller that omits it — every test written before this fix — is byte-identical.
**A broader, NOT-yet-fixed version of this same issue is open as BUG-91**: `effectiveExpenses`
and `pensionMonthly` are today's-dollar figures applied flat against this same retirement-year-
dollar walk, model-wide (not spouse-specific) — see BUG-91 in `docs/BUGS.md`.

**Shortfall-spillover escape hatch (BUG-88, fixed 2026-07-26).** The hold-out above is not
absolute: if the ordinary drawable pool genuinely cannot cover a gap year's spending + tax, a
gated, last-resort, PENALIZED draw from `tradSp` closes as much of the gap as the bucket
allows — grossed up for both the ordinary income tax the draw itself triggers and the 10%
early-withdrawal penalty under 59½ (waived once the spouse turns 59½). This prevents a
contradiction the pre-fix engine could produce: a shortfall caused purely by the hold-out (the
money exists, it's just walled off) being reported as genuine depletion while the household's
total balance — which still counts the untouched `tradSp` — kept climbing. Reported per row
(`spouseSpillover`/`spouseSpilloverTax`, already folded into `drawTax`/`tax`, not an addend)
and as lifetime rollups (`totalSpouseSpillover`/`totalSpouseSpilloverTax`/
`firstSpouseSpilloverAge` on `buildRetirementPhase`'s return), surfaced as a caption in both
UIs whenever a plan actually needs it. Whatever the hatch cannot close is genuine depletion —
see BUG-88 in `docs/BUGS.md` for the full mechanism and the fractional-year-calc proof.

**`buildRetirementDrawdown` survives as the SECONDARY, blended walk** — one combined pool
grown at one real rate (no per-account split), still used for `calcWhatIfDelta` and
`calcOptimizedScenario`'s deltas (documented BUG-36 scope: those consumers don't charge tax on
the spending draw the way the engine does, and — pending Session B — don't yet see the
spouse's per-account bucket at all; see the Monte Carlo row in Known Simplifications below).
The Monte Carlo "Range" lens (`monte-carlo.js`) also still runs this blended walk via its
`rRealByYear` override — porting it to the per-account engine is a separate, larger future
session (Session B); until then an interim `rangeView.spouseGapCaveat` warns the user when a
spouse's active gap window means the shaded range may understate their outlook.

**Why tax is subtracted (the gross-up).** To *spend* `draw` net, the retiree must
withdraw enough to also pay that year's income tax, so the tax is a real leak out of
the pool. The closed-form `calcYearsSustained` (kept only as a tax-free reference)
cannot represent a time-varying per-year tax and netted SS for every year regardless
of claiming age, so it overstated longevity — see BUG-31.

The old closed form (kept for reference / the tax-free estimate):
```
if netPortfolioNeed ≤ 0 or portfolio × rReal ≥ netPortfolioNeed → Infinity
else → log(1 − (portfolio × rReal / netPortfolioNeed)) / log(1 / (1 + rReal))
```

### Withdrawal Rate
```
withdrawalRate = netPortfolioNeed / totalAtRet × 100
```
Uses net need, not gross expenses. A 3.5% rate means the portfolio funds 3.5% of itself, with SS/pension covering the rest.

## Modeling Assumptions (`ASSUMPTIONS` constant)

Non-statutory factors used throughout the model live in the `ASSUMPTIONS`
object in `src/config/irs-2026.js` — never hardcoded at call sites (rule #1).
These are modeling choices, not IRS limits, but they are centralized for the
same reason: one update point, no magic numbers scattered across the code.

| Constant | Value | Used for |
|---|---|---|
| `SS_TAXABLE_PCT` | 0.85 | Share of SS benefit treated as taxable income in bracket-fill math |
| `MONTHS_PER_YEAR` | 12 | Monthly → annual conversions (SS, pension) |
| `SPOUSAL_BENEFIT_PCT` | 0.5 | Spousal benefit = 50% of primary PIA |
| `PIA_FACTOR_1/2/3` | 0.90 / 0.32 / 0.15 | PIA bend-point replacement rates |
| `LTCG_DRAG_PROXY` | 0.15 | Annual taxable-brokerage drag proxy (`r × (1 − 0.15)`) |
| `CONVERSION_STEP` | 5_000 | Amount-search step for the Roth-conversion optimizer |
| `CONVERSION_STARTAGE_STEP` | 1 | Start-age-search granularity (years) for the timing+amount optimizer |

> Note: `EARLY_WITHDRAWAL_AGE` (59.5) and `EARLY_WITHDRAWAL_PENALTY` (0.10) are **statutory** (the 10% early-distribution penalty), so they live with the IRS constants in `irs-2026.js`, not in `ASSUMPTIONS`.

## Known Simplifications

These are intentional modeling choices, not bugs. Document them so users and reviewers understand the tradeoffs.

| Simplification | Impact | Notes |
|---|---|---|
| 2026 tax rules frozen for all projection years | Medium | Real brackets adjust for inflation annually. A 30-year-old's projection uses 2026 brackets through age 90. |
| Taxable brokerage assumes annual realization | Understates taxable growth by 15–25% over 30 years | Buy-and-hold investors compound unrealized gains tax-free. The model applies LTCG drag every year. |
| 401k after-tax display uses phase rate, not effective rate | Makes 401k look worse vs Roth | Someone withdrawing $80K pays ~13% effective, not the 22% phase rate. |
| State tax uses flat effective rate during accumulation | Inaccurate at income extremes | A $50K CA earner pays ~4%, not the table's 9.3%. User can override with the slider. |
| State retirement income exemptions not modeled | Overstates retirement state tax for most states | 13 states exempt SS; many exempt pension/401k. Feature #33 (bracket-accurate retirement tax) is done; structured per-source exemption flags are the remaining gap — planned as feature #52. |
| Inflation applied to returns but not to brackets/limits | Was subtle; now the FULL, undiluted effect (BUG-100, 2026-07-27) | IRS adjusts limits annually. Sim uses 2026 limits with inflation-adjusted returns. Before BUG-91's fix, the retirement walk's UNDERSTATED spend (today's dollars, unconverted) partially offset this asymmetry by accident — a too-small draw landing against brackets that were, in effect, also too-small relative to the walk's real frame. BUG-91 fixed the spend basis but left this simplification as-is, so it now bites at full strength (this is WHY `firstRMD`/`totalRMDs`/`rmdTaxBite` dropped so sharply at the golden-master default — a correctly-sized draw against fixed 2026 brackets drains the Traditional 401k much faster). See BUG-100 in `docs/BUGS.md` for the fix shape and the considered-and-rejected "deflate the seed instead" alternative. |
| Retirement-walk spend/pension basis: today's dollars vs. retirement-year dollars (BUG-91, fixed 2026-07-27) | Was HIGH — the single largest input to every headline number | **Fixed.** The retirement engine walks in the PRIMARY's retirement-year real dollars (a REAL return rate, `rReal`); `effectiveExpenses`/`effectivePension` are now inflated forward to that frame (`toRetirementYearDollars`, `finance-math.js`) before reaching `netPortfolioNeed`, the engine, Monte Carlo, the conversion optimizer, and the SS-delay comparison — using the SAME base year as the spouse gap-year deflator (BUG-90), so the two compose without a seam. Raw values are deliberately kept for genuinely today's-dollar displays (Statement/Budget, the Income Meter's "% of today's take-home", the Plan lever/WhatIfPanel slider baseline). A what-if scenario that also shifts the retirement age re-derives BOTH the expense conversion and a bidirectional SS/pension re-basing (`inflationRebaseFactor`) at its own scenario age, not the base plan's. **Two residuals, both filed and inert at the default state (no events, no accumulation-basis change):** retirement-phase money events (Goals/LifeEventSheet) are still applied in nominal dollars against the now-corrected walk (BUG-99, open); accumulation-phase `contrib401k` still tracks `incomeGrowth`, not inflation specifically, a smaller instance of the same class (BUG-101, open). See BUG-91 (Resolved) in `docs/BUGS.md` for the full derivation, every changed golden-master number, and the audit that shaped the final fix shape. |
| SS benefit assumes continuous work to retirement | Overstates SS for anyone with career gaps | Retiring at 45 leaves fewer high-earning years in the 35-year average. Work-gap input planned: feature #11. |
| Income growth compounds indefinitely without a user-set plateau | Overstates contribution capacity and SS AIME for long projections | A $100k earner at 3%/yr reaches $289k by 65. Users can cap this with the "Income plateau age" slider; `incomeGrowthEndAge` passed to both `runSimulation` and `calcAIME`. Default null = no cap. |
| Spouse Roth/Taxable/HSA gap-year contributions treated as spent, not tracked (BUG-85, open) | Understates the spouse's non-401k account balances during their own working years, once the primary has retired | **BUG-82 fixed 2026-07-25** — the spouse now has their own `spouseRetirementAge`; gap-year Traditional 401k contributions, gross-wage bracket floor stacking, and a net-cash draw offset (with any surplus banked, not discarded) are all modeled, with the spouse's account held out of the drawable pool until they actually retire (Option A). **Remaining gap (v1 scope, BUG-85):** only the Traditional 401k gets this treatment — Roth/Taxable/HSA gap-year contributions are dollar-conserving (money isn't lost) but not credited to the household's future balance the way the 401k now is. Other documented residual simplifications: the spouse's net-cash draw offset uses a single household-average tax-only rate held constant across the gap (not a per-year recompute); the still-working-past-73 RMD-deferral exception is not modeled (a working spouse over 73 still gets an RMD in this model); SS AIME is unaffected by gap-year spouse earnings. See BUG-85/BUG-82 in `docs/BUGS.md`. |
| Working-year conversion benefit not shown in the window headline | The `netConversionBenefit` figure ignores pre-retirement (working-year) conversions | These conversions lower the retirement *seed*, so the `noConv` counterfactual seeds from the already-lowered balance. Their real benefit appears in longevity / lower `rmdTaxBite`, not the conversion-window figure. Quantifying it would need a third counterfactual — deferred. UI states this; optimizer is scoped to window conversions. |
| A spillover year can both contribute to and raid the spouse's 401k bucket (BUG-88's escape hatch, accepted 2026-07-26) | Overstates the escape hatch's penalty cost, never understates it | Observed in a stressed fixture: the spouse's gap-year contribution lands in `tradSp` the same year the shortfall-spillover pulls a much larger amount back out at a 10% penalty. A real household would redirect that year's payroll deferral to cash first (taxed as wages, not penalized) before raiding the 401k. The current behavior is conservative (it overstates the penalty cost, never understates real insolvency) and creates no reconciliation contradiction, so it ships as-is. A refinement (cancel the year's contribution before spilling, route the freed dollars as taxable wages) is a genuine improvement with materially more moving parts — it would touch `spouseContrib`, the bracket floor, and every reconciliation surface BUG-82's Step 5 already extended. Deferred, not filed as a numbered bug (no user-facing contradiction, just an unnecessarily conservative cost estimate). |
| Spouse gap-year HSA add-back isn't exactly dollar-conserving (found 2026-07-26, adversarial-correctness review of PR #59) | Overstates the household's gap-year spendable cash by a small, HSA-limit-bounded amount | `spouseIncomeFloorByAge`'s formula removes `cHSA` from `wages` (correctly excluding the pre-tax deferral from taxable income) but then adds it back at 100% cash value — crediting the HSA deduction's tax shield as spendable cash on TOP of the contribution itself, rather than netting it against the spouse's own net tax rate the way the rest of the floor does. Measured: $1,320 of extra credited cash on a $4,400 HSA contribution at a 0.7 net rate (`4400 × 0.3`, exactly the untaxed shield). Bounded by the HSA contribution limit (`HSA_FAMILY_LIMIT_2026`), so the maximum possible overstatement is small and fixed. Not fixed — logged as an accepted simplification pending BUG-98's broader defensive-contract pass, since the fix (netting the add-back at the spouse's own rate like the rest of the floor) is a one-line change but changes a value other tests may have implicitly locked. |
| Duration-event income during the event is taxed on the **engine** path but not in the blended what-if delta walk | Slightly understates tax in *comparative* overlays only | **Resolved on the headline path (2026-07-20).** `applyMoneyEvents` adds `eventIncomeForYear` to `taxableIncomeAdjustment`, and the per-account engine (`buildRetirementWalkByAccount`) taxes it as ordinary income stacked on the SS/pension floor (`inflowTax`) — so chart / longevity / Flow-Down / RMD numbers are tax-honest for retirement-phase event income. The blended `buildRetirementDrawdown` (used only by `calcWhatIfDelta` / `calcOptimizedScenario`) consumes `eventNetForYear` directly and still doesn't charge it — the remaining BUG-36 residual. |
| Single fixed return rate for the deterministic headline projection | Ignores sequence-of-returns risk on the primary chart | The headline arc/chart still uses one fixed return rate. Sequence-of-returns risk IS modeled separately in the Monte Carlo "Range" lens (#38/#114, shipped) — a deterministic seeded percentile engine showing p10–p90 balance bands and a success rate, one lens under the arc's Range view. It reuses baseline RMD/conversion tax estimates rather than re-deriving them per iteration (see BUG-78) and doesn't yet model withdrawal-order risk (pre-#47). **It also doesn't yet see the #30/BUG-82 spouse engine** — it still runs the older blended walk (`buildRetirementDrawdown`), which has no spouse bucket at all, so its shaded band can understate a spouse household's outlook during an active gap window; an interim `rangeView.spouseGapCaveat` surfaces this to the user until a future session ports the lens onto the per-account engine. **The caveat's own firing condition has a confirmed gap (BUG-94, open, 2026-07-26):** it keys on the gap-year maps having a nonzero value, not on the engine's actual hold-out condition, so it can read `null` on exactly the household where the Range lens and the engine disagree most (see BUG-93/94 in `docs/BUGS.md`). Also: the blended walk doesn't merely omit gap-year income (understating) — it also pools the held-out spouse bucket for free with no hold-out and no escape-hatch penalty (overstating) — the caveat's one-directional wording ("may understate") doesn't capture that the true error can go either way. |

## IRS Annual Update Procedure

When the IRS publishes new limits (typically October for the following year):

1. **Update `src/config/irs-2026.js`** — rename to `irs-2027.js`, update all values:
   - `TRAD_401K_LIMIT`, `ROTH_IRA_LIMIT`, `HSA_LIMIT`
   - `LIMIT_415C`, `LIMIT_415C_CATCHUP`
   - `FICA_WAGE_BASE`
   - Federal bracket thresholds (all 4 filing statuses)
   - Standard deductions (all 4 filing statuses)
   - LTCG bracket thresholds
   - Roth IRA MAGI phase-out thresholds
   - SS bend points (if updated)
   - Catch-up contribution amounts

2. **Update import path** in any file that imports the config

3. **Run all tests** — any test using hardcoded expected values may need updating

4. **Update the "2026 Tax Year" badge** in the UI header

All IRS-specific values must trace back to the single config file. If `grep -r "24_500\|24500" src/` finds hits outside the config, something was hardcoded.

## Correctness Fix Log

A record of bugs found and fixed in the financial model (not feature additions — these were wrong answers).

| Date | Bug | Fix | Affected calculations |
|---|---|---|---|
| Jun 2026 | SS and pension subtracted from portfolio draws before they start | Per-year `netPortfolioNeed` in `totalChartData` loop, `convWindowDraws`, and `retIncomeFloors[]` to `calcConversionSim` | Drawdown chart, conversion window tax, Flow-Down waterfall |
| Jun 2026 | Pension not counted in drawdown when `pensionStartAge > safeRetAge` | Same per-year fix — check `age >= pensionStartAge` in all drawdown loops | `yearsSustained` for deferred-pension users |
| Jun 2026 | Spouse FICA not included in household taxes | `fica = (min(p, FICA_WAGE_BASE) + min(s, FICA_WAGE_BASE)) × 0.0765` | `takeHome`, `grossAfterTax`, `savingsCapacity` |
| Jun 2026 | MFJ spouse income missing from AGI, state tax, and budget | `agi` and `grossAfterTax` now use `householdIncome` when `filingStatus === "mfj"` | Federal tax, state tax, `savingsCapacity`, `optimizedAllocation` |
| Jun 24 2026 | Working-year conversion didn't bump that year's LTCG bracket (cap-gains rate picked before the conversion) | Compute the capped `conv` before the `ltcgRate` call; pass `ltcgRate(netOrdinaryIncome + conv, …)` (`simulation.js`). Inert when no events → golden-master-safe | Taxable-account growth in a working-conversion year, and downstream retirement balances |
| Jun 24 2026 | What-if overlay re-sim dropped permanent working-year conversions, diverging the overlay baseline from the main plan (BUG-34 class) | Thread `conversionEvents` + `stateRate` through `whatIfSimInputs` so the re-sim sees the same events | What-if scenario baseline arc/longevity |
| Jun 24 2026 | Phantom 1-year conversion window when retiring at/after 72 (clamp collapsed to age 72 with `conversionWindowYrs = 1`) | `hasConvWindow` guard so the window is genuinely empty (`conversionWindowYrs = 0`) when `safeRetAge ≥ RMD_START_AGE−1` | Conversion section visibility, "window closes" arc marker (now `resolvedEndAge`) |
| Jul 13 2026 | Duration events modeled only cash outflow, ignored lost income — sabbaticals charged only trip spend, not suppressed salary/401k/match/MAGI/AIME (BUG-72) | Two-channel semantics: `eventAmountForYear` (event cash) + `eventIncomeForYear` (prorated income for duration outflows). Working-year loop now uses `eventsIncomeAdjustment` to suppress `primaryIncomeYr`, scale contributions by `incomeFrac`, and suppress MAGI/Roth phase-out. Boundary-spanning events split by `eventFirstAge`/`eventLastAge` helpers (each month counted exactly once). Retirement walks unchanged (untaxed per BUG-36 scope). | Life-event verdict accuracy, working-year contribution capacity, MAGI / Roth phase-out, SS AIME (≤ 1% for 3-yr pause) |
| Jul 13 2026 | Verdict saturated to "comfortable" for any non-depleting plan, no margin context — user can't distinguish $10k vs $100k buffer at age 90 (BUG-73) | `marginForScenario` computes cushion basis = balance-at-90 / annual-expenses (years of runway), gated on depletion binary. `verdictInfoForScenario` returns verdict (3-state) + labeled ranges ("5+ yrs = comfortable") from `EVENT_COMFORT_BUFFER_YEARS` constant. Verdict tick rails and life-event cards now render margin context alongside verdict. | Life-event verdict card, plan/dial preview display, LifeEventSheet duration-month rail, Ideas scenario comparison |
| Jul 13 2026 | Accumulation event spend beyond the taxable balance was silently forgiven — `Math.max(0, …)` clamp meant a $540k trip against a small brokerage charged only the brokerage; tripling a trip's spend barely moved the impact (BUG-74, user-reported) | Funding cascade, all on PRE-growth balances (one timing convention): taxable → Roth (grossed up for the 10% early-withdrawal penalty under 59½; basis untracked, no ordinary tax on the Roth portion) → Traditional 401k grossed up (stacked ordinary tax + 10% early-withdrawal penalty under 59½, fixed-point solve); 401k draw joins the LTCG-bracket stack; HSA never touched. Residual = `eventShortfall` per row → `eventFundingShortfall` on what-if scenarios → shared `verdictForScenarioResult` forces "unaffordable" ("$X can't be funded from savings") and caps at "tight" whenever ANY early retirement-account withdrawal was needed (`eventRetirementDraw`), even if the walk still looks healthy afterward. Cushion labels cap at `CUSHION_LABEL_CAP_YEARS` (50) for SS-covered plans; balance-delta bullets phrase the change ("decreases/increases by $X") instead of a signed number. | Every accumulation-phase event's true cost (spend + funding taxes/penalties now actually leave the portfolio), life-event verdicts, Year-by-year ledger draw/tax columns, at-65/at-90 impact bullets |
| Jul 13 2026 | Sabbatical/leave income restart used the UNPAUSED age clock — a $100k salary paused 3 years resumed at ~$120k instead of the ~$103k it left off at (owner spec, PR #54 review) | `runSimulation`'s salary now advances a pause-aware growth CLOCK by `incomeFrac` per year (frozen during a full pause, unaffected by the seeded full-pay default) instead of the raw `age − currentAge` offset; `projectedIncomeAtAge` (UI seed / `eventIncomeImpact` baseline) stays the no-event closed form, identical to the clock when no events exist | Post-sabbatical salary trajectory, working-year contributions/MAGI in the years after a pause, new `salary` sim-row field |
| Jul 20 2026 | Retirement-phase duration-event income (part-time work etc.) was received tax-free in the headline walk (BUG-36 strand) | `applyMoneyEvents` now folds every event's prorated `eventIncomeForYear` into `taxableIncomeAdjustment`; the per-account engine taxes it once as ordinary income stacked on the SS/pension floor (`inflowTax`). Engine-only, so the blended what-if delta walk is unaffected (remaining BUG-36 residual). Inert with no events → golden master untouched | Retirement-phase tax, longevity, chart, Flow-Down for users with retirement event income |
| Jul 25 2026 | BUG-82: spouse had no retirement age of their own — contributions stopped and the account froze the instant the PRIMARY retired, regardless of the spouse's actual age ($2.38M understatement in the audit's repro scenario) | New `spouseRetirementAge` input; gap-year 401k contributions injected into a held-out `tradSp` bucket (`retirement-engine.js`), sourced from the accumulation sim's own per-year figures via `buildSpouseRetirementSeed` (`retirement-phase.js`); Option-A draw gate (spouse's bucket drawable only once they retire); the spouse's gross wages stack in the bracket floor and net cash offsets the draw, with any surplus banked (not discarded — a defect found and fixed during implementation, not in the original bug report). v1: Traditional 401k only (BUG-85 tracks Roth/Taxable/HSA parity) | Household `totalAtRet`/longevity/RMDs for any age-gap spouse household — the majority of real two-income households |
| Jul 25 2026 | BUG-82 follow-on: the live-balance spouse RMD guard keyed on the frozen seed (`tradGrossSpouse`), so a spouse accumulating purely from gap contributions never got a required distribution | Guard now keys on the live `tradSp` balance | Spouse RMD timing for a household relying entirely on gap-year contributions |
| Jul 25 2026 | Rule-5 wiring (Step 6): `netPortfolioNeed`/`withdrawalRate`/the optimizer/Plan's Income Meter acted as if the portfolio funded every dollar even after the spouse's gap-year income was offsetting the engine's own draw internally | `calcNetPortfolioNeed`/`calcRetIncomeFlow` (`drawdown.js`) and `calcOptimizedScenario` (`optimization.js`) gained an optional spouse-income term read from the SAME map the engine consumes; `calcPlanDrivers` gained `temporaryIncomeBasis` so a gap-year-flattered rate can't render as an unqualified "on track" verdict | Headline `netPortfolioNeed`, `withdrawalRate`, the optimizer's `optWR`, Plan's Income Meter, the OnTrackPill verdict |
| Jul 25 2026 | BUG-77: `calcWhatIfScenario`'s forced-resim path kept the spouse Traditional bucket frozen at the BASE retirement age even when the scenario changed the primary's own retirement age | Re-seeds the spouse via the SAME shared `buildSpouseRetirementSeed` builder the live path uses (no spouse re-sim needed, since gap contribution end-age is now the spouse's own, scenario-invariant); also fixed the resim's accumulation chart being primary-only (A8) | What-if scenario previews for a household with spouse 401k balances |
| Jul 25 2026 | BUG-86: Flow-Down's accumulation bridge (`calcFlowDown`) computed `startPortfolio`/`totalContrib` from PRIMARY-only inputs while `totalAtRet` was household — the entire spouse balance fell out as a residual and was mis-attributed as "Investment Growth" | `spouseStartBal`/`spouseContribRows` params fold the spouse's starting balance and accumulation-phase contribution rows into the waterfall | Journey Chapter 2's "Market growth" and "Your contributions" for spouse households |
| Jul 25 2026 | BUG-87: household MAGI (Roth phase-out, LTCG bracket) counted an already-retired earner's income forever, past their own retirement age — mirror defects on both the primary's and the spouse's own sim | `runSimulation` gained `spouseIncomeEndAge` (an inclusive age cutoff in the subject's own frame, following the `contribEnd*` precedent); wired symmetrically on both sim calls | Roth phase-out and LTCG-bracket accuracy in the years after either earner's retirement, in a household with an age gap |
| Jul 26 2026 | BUG-88: a shortfall caused purely by Option A's spouse hold-out was reported as genuine depletion while the household's total balance (which still counted the untouched `tradSp`) kept climbing — three headline surfaces disagreed off one walk | Gated, last-resort penalized draw from `tradSp` when the ordinary pool genuinely can't cover a gap year, grossed up (12-iteration fixed point) for both the ordinary tax the draw triggers and the 10% early-withdrawal penalty under 59½; depletion predicate + fractional-year calc reformulated around the residual the hatch couldn't close (proven algebraically identical when there's no spillover). Reported per row and as lifetime rollups, surfaced as a caption in both UIs. | `depletionAge`, `yearsSustained`, the chart's ending balance, and "Left at N" for an age-gap household whose primary retires early on modest balances |
| Jul 26 2026 | BUG-89: the conversion window's income floors (`buildIncomeFloors`) never got the spouse's gap-year wages, so the conversion planner and the retirement engine modeled different households for any spouse-gap window — real converted dollars overshot the intended bracket, ACA/IRMAA exposure was under-detected | Optional `spouseTaxableIncomeByAge` param reads the SAME map the engine's own bracket floor uses; wired into `convFloors`, `convMAGIFloors`, and — critically — the conversion optimizer's `floorArgs`, so the optimizer can never search a spouse-blind model the display prices differently | Bracket-fill conversion targets, ACA cliff detection, IRMAA tier crossings, for any spouse-gap household using the conversion window |
| Jul 26 2026 | BUG-90: the spouse's gap-year maps carried NOMINAL dollars into a walk that measures everything in the primary's retirement-year purchasing power, so a spouse's gap-year paycheck was the only income stream whose real value silently grew inside the walk | Optional `inflationRate` param deflates the three gap-year maps by `(1+inflationRate/100)^k`, `k` measured from the primary's RETIREMENT year (not today — proven to avoid a ~22% seam discontinuity); default `0` keeps every existing caller byte-identical | Gap-year cash/contribution accuracy for long-gap households (measured: ~15% overstatement at a 10-year gap, ~34% at 17 years, under the shipped nominal figures) |

## Money Events — duration escalation & open-ended spans (2026-07-20 extension)

Money events (`src/model/money-events.js`) are the canonical dated-money store. Beyond the
one-time and fixed-length duration events already documented, a duration event may carry two
optional fields. Both default to absent, and an event without them is **byte-identical** to a
legacy event (the golden master depends on this):

- **`growthPct`** — annual escalation percent applied to both the monthly-spend term and the
  `incomeAnnual` term. The factor is `(1 + growthPct/100)^k`, where `k` is the whole-year offset
  from the event's start age (`k = age − ev.age`, `k ≤ 0 → 1×`), via the module-internal
  `growthFactorForAge`. `eventGrossCost` sums per active year so escalation is reflected in the
  total. One-time events ignore it. Because the escalation lives inside `eventAmountForYear` /
  `eventIncomeForYear` (the shared per-year helpers), every walk — accumulation sim, per-account
  engine, blended what-if — inherits it automatically.
- **`untilAge`** — an open-ended alternative to `durationMonths`: the event runs *through* the year
  the person turns `untilAge` (inclusive), resolved to a month count by the module-internal
  `spanMonths` as `(untilAge − age + 1) × 12`. When both `untilAge` and `durationMonths` are
  present, **`untilAge` wins**. `untilAge < age` degenerates to a zero-month (non-duration) event.
  This makes an **expense step-down** expressible ("extra spend until a payoff/step-down age, then
  it stops") and "rest of plan" (set `untilAge` to the plan horizon). No clamp is needed in the
  module — each walk stops at its own `endAge`, so an open-ended event is naturally bounded by the
  plan horizon.

**Start-age floor.** Events cannot start at exactly `currentAge`: `runSimulation`'s accumulation
rows begin at `currentAge + 1`, so an event dated at `currentAge` would be silently dropped by the
accumulation walk. `lifeEventBounds.minAge` (App.jsx) is therefore `currentAge + 1` by design.

**Presets** exercising the open-ended mechanism: "Mortgage paid off" (the freed-up cash AFTER
payoff, an inflow from the payoff age through the plan — the living-expenses baseline already
contains the mortgage payment, so a pre-payoff outflow event would double-count it; coordinator
review fix 2026-07-20) and "Higher early-retirement spend" (go-go-years delta above baseline that
steps down at a chosen age — a delta, so it never overlaps the baseline).
