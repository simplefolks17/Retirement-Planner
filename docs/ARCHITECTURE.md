# Architecture

## Module Map

```
src/
  config/
    irs-2026.js           All 2026 IRS constants + ASSUMPTIONS object           [CLIENT]
  model/                  Pure functions — no React. Used client-side AND server-side.
    taxes.js              calcTax, marginalRate, ltcgRate, calcStateTax, stackedIncomeTax, projectRetirementBracket  [CLIENT]
    tax-basis.js          calcTaxBasis (working-year agi / fed+state+FICA / Roth phase-out / grossAfterTax)  [CLIENT]
    social-security.js    calcAIME, calcPIA, calcBenefit, calcSpousal           [CLIENT]
    retirement-income.js  calcRetirementIncome (SS + pension composition), calcSSBreakEven  [CLIENT]
    simulation.js         runSimulation (accumulation loop)                     [CLIENT]
    accumulation.js       sumAccountRow, calcMilestones, buildAccumChart (accumulation-phase projections from simData)  [CLIENT]
    drawdown.js           calcNetPortfolioNeed, calcWithdrawalRate, calcYearsSustained, calcDrawdownYears, calcSSDelayGain  [CLIENT]
    retirement-drawdown.js buildRetirementDrawdown (ONE shared retirement-phase walk)  [CLIENT]
    employer-match.js     calcEmployerMatch (flat + formula modes)              [CLIENT]
    rmd.js                calcRMDProjection, calcRMDPostConversion              [CLIENT]
    retirement-tax.js     calcRMDIncomeFloor, calcRMDTax, calcRMDTaxSchedule, calcWithdrawalOrderTax  [CLIENT]
    budget.js             calcGrossAfterTax, calcSavingsCapacity, calcOptimizedAllocation, calcMegaBackdoorGrowth  [CLIENT]
    finance-math.js       fvAnnuity (shared future-value-of-annuity primitive; used by optimization + budget)  [CLIENT]
    healthcare.js         acaCliffThreshold, calcHealthcareExposure, calcConversionCosts (ACA cliff + IRMAA + cost rollup)  [CLIENT]
    optimization.js       calcOptimizedScenario                                 [SERVER]
    conversion-planning.js buildIncomeFloors, calcBracketFillTargets (conversion-window floors + bracket fill)  [CLIENT]
    conversion-evaluation.js evaluateConversionPlan (ONE shared sim→RMD-tax→net-benefit→ACA/IRMAA pipeline; display + optimizer)  [SERVER]
    roth-conversion.js    calcConversionSim, findOptimalConversion              [SERVER]
    flow-down.js          calcFlowDown (waterfall decomposition from the shared walk)  [SERVER]
    action-cards.js       generatePhaseActions, generatePhaseSteps              [SERVER]
    money-events.js       applyMoneyEvents, totalEventImpact (per-year event application — accumulation + retirement)  [CLIENT]
    what-if.js            calcWhatIfDelta (parallel scenario vs baseline), calcAffordabilityMax (binary-search max one-time spend)  [CLIENT]
    __tests__/            Vitest suites — one per model file + golden-master.test.js
  components/             React UI — all client-side
    ActionCard.jsx        ChartTooltip.jsx   DeferredInput.jsx   FlowConn.jsx
    MoneyEventsPanel.jsx  PhaseCard.jsx      Slider.jsx          TaxPhaseCard.jsx
    TaxTimeline.jsx       WaterfallStep.jsx  WhatIfPanel.jsx
  __tests__/
    formatters.test.js    Boundary tests for fmt() / fmtPct()
  App.jsx                 State management, tab routing, layout shell, AND the three
                          tab bodies (Simple / Detailed / Flow-Down) rendered inline.
                          Calls the model layer — no inline duplication of model math.
  theme.js                Design tokens (colors, shared styles)
  formatters.js           fmt, fmtPct
  main.jsx                React entry point
api/                      Vercel serverless functions — PLANNED, not yet created.
  (pre-launch)            [SERVER] model files move behind these routes before launch.
                          During development they are imported directly. See CLAUDE.md rule #8.
```

> **Note on `tabs/`:** an earlier plan split the three tab bodies into
> `src/tabs/SimplePlanner.jsx` etc. That split has not been done — the tab
> bodies still live inline in `App.jsx`. App.jsx no longer duplicates model
> math, though: every computation is delegated to a `src/model/` function.

**[CLIENT]** = runs in the browser, code visible. Public financial math.
**[SERVER]** = runs in Vercel serverless functions, code never ships to browser. Protected competitive logic.

Model files marked [SERVER] are still pure functions — they work identically in both environments. During development, you can import them directly for faster iteration. In production, they're only called via API routes.

**⚠️ Development phasing:** During active development (feature building, bug fixing, testing), ALL model files run client-side. The server split is a pre-launch task — do NOT implement API routes until the financial model is feature-complete and all tests pass. See `docs/INTEGRATIONS.md` "Hybrid Architecture" for the phased approach.

## Data Flow (dependency chain)

This is the exact order computations must run. Adding a new value means inserting it at the correct point in this chain.

```
INPUTS (state variables)
  │
  ├─ currentIncome + contrib401k + contribHSA + otherPreTaxDeduc
  │    → totalPreTaxDeduc → agi
  │    → calcTax(agi) → fedTax, fedMarginal, fedEffRate
  │    → stateTax (agi × stateRate)
  │    → fica (gross × 7.65%, capped at wage base)
  │    → takeHome (display only: income − all deductions − all taxes)
  │    → grossAfterTax (budget basis: income − taxes only)
  │
  ├─ grossAfterTax − livingExpenses → savingsCapacity
  │    → savingsCapacity − currentContribTotal → availableSurplus
  │    → availableSurplus × surplusPct → optimizedAllocation
  │
  ├─ simData (accumulation loop, 14+ dependencies)
  │    → atRetirement → retVals → totalAtRet
  │    → effectiveExpenses (user input or 3% of totalAtRet)
  │
  ├─ SS: ssTotalEarnings → ssAIME → ssPIA → ssMonthlyBenefit
  │    → effectiveSS + spouseSsBenefit → householdSS
  │
  ├─ effectivePension (pensionMonthly × 12 if started by retirement)
  │
  ├─ netPortfolioNeed = effectiveExpenses − householdSS − effectivePension
  │    → withdrawalRate = netPortfolioNeed / totalAtRet
  │    → yearsSustained (log formula with rReal and netPortfolioNeed)
  │
  ├─ totalChartData (accumulation from simData + drawdown using netPortfolioNeed)
  │
  ├─ Roth conversion: bracketFillConversion, conversionSim (dual scenarios)
  │    → rmdDataPostConversion → netConversionBenefit
  │
  ├─ flowData (waterfall phases from all above)
  │
  └─ optimized (what-if: extra portfolio from surplus allocation + SS at 70)
```

## State Groups (~48 variables)

| Group | Count | Variables |
|---|---|---|
| Timeline | 5 | currentAge, retirementAge, lifeExpect, returnRate, inflationRate |
| Income/Tax | 6 | currentIncome, incomeGrowth, selectedState, stateRateOverride, filingStatus, otherPreTaxDeduc |
| Tax Phases | 5 | rate1, rate2, rate3, showPhase2, phase2Start, retirementState |
| Accounts (×4) | 12 | bal*, contrib*, contribEnd* for 401k/Roth/Taxable/HSA |
| Budget | 4 | livingExpenses, livingExpenseGrowth, savingsSurplusPct, preApplySnapshot |
| SS | 4 | ssClaimingAge, ssOverride, includeSS, spouseSsEstimate |
| Spouse | 5 | spouseIncome, spouseIncomeGrowth, isMarried, spouseIsSoleBenef, spouseCurrentAge |
| Pension | 2 | pensionMonthly, pensionStartAge |
| Roth Conversion | 4 | conversionMode, conversionBracketTarget, annualConversionAmt, conversionTaxSource |
| Employer Match | 4 | employerMatchPct, matchMode, matchFormulaRate, matchFormulaCap |
| Goals | 2 | retirementTarget, annualExpenses |
| Navigation | 1 | activeTab |

## Testing Strategy

Tests live alongside model files: `src/model/__tests__/` (one suite per model
file). Formatter tests live in `src/__tests__/formatters.test.js`. Run with
`npm test`. Current count: **299 tests across 25 files**, all passing.

### Golden master
`src/model/__tests__/golden-master.test.js` locks the end-to-end output of the
whole model chain at the default UI state (taxes → SS → simulation → drawdown
→ RMD → Roth conversion). It mirrors App.jsx's wiring exactly, so if a model
change shifts any headline number the golden master fails immediately. The
locked values are documented in the test header. Update them deliberately
(never blindly) when an intended change moves a number.

### Visual verifier
`.claude/skills/verifier-browser.cjs` drives all three tabs with Playwright and
checks rendered values, reactivity, and console/network health. See
`.claude/skills/verifier-browser.md` for how to run it and the false-alarm
reference table (notably: `fmt()` output is `$3.57M` / `$118K`, so currency
regexes must match `\$[\d.]+[MK]?`, never `\$[\d,]+`).

### Must-test scenarios
- **taxes.js**: Known bracket math for each filing status; marginal rate at bracket boundaries; state rate override
- **social-security.js**: Wage base cap (income above and below $168,600); PIA bend points; spousal benefit = max(own, 50% of primary PIA); claiming factors at 62, 67, 70
- **simulation.js**: 401k elective limit cap with income growth; Roth MAGI phase-out (income crossing threshold); HSA IRS cap; employer match in flat vs formula mode
- **drawdown.js**: yearsSustained with and without SS/pension; infinite sustainability when growth exceeds draws; netPortfolioNeed never uses effectiveExpenses
- **budget.js**: No double-counting (grossAfterTax-based, not takeHome-based); surplus = 0 when expenses exceed capacity; allocation priority ordering

### Bug regression tests
- $300K earner SS benefit must be < $50K/yr (wage base cap)
- $140K earner with 3% growth: Roth contrib = $0 by year 7 (phase-out)
- yearsSustained with $20K SS must be > yearsSustained without SS (same portfolio)
- contrib401k at $15K with 3% growth must never exceed elective limit in sim

---

## Feature Design Notes

A running record of design decisions made during feature planning. These persist
across sessions so decisions don't have to be re-litigated.

---

### `horizonProps` setter bundles (WI-3.1 / #98) — Level-3 write plumbing

**Added 2026-06-25.** Horizon writes back to the **shared** App.jsx state through
eight topic-grouped, memoized bundles on `horizonProps`. Both UIs keep one state,
so a value changed in Horizon is immediately reflected in Classic and vice-versa
(no duplicate state, no divergence — principle 11). Each bundle is built in its own
`useMemo` in `App.jsx` (V9 referential stability) and added by name to `horizonProps`.

**Field shape (self-describing so screens carry no constants/bounds math — rule 1 / rule 10):**
- numeric input → `{ value, set, min, max, step }` (+ `sliderMax` on account balances,
  `defaultPct`/`pct` on `stateRateOverride` — `pct` is the effective rate as a percent
  so the screen never multiplies the stored fraction; `estimated` on `ssOverride`)
- toggle (boolean) → `{ value, set }`
- choice (select / segmented) → `{ value, set, options: [{ value, label }] }`

`min`/`max`/`step` and the option labels are copied **verbatim** from the Classic
JSX; dynamic bounds (e.g. `livingExpenses.max = max(grossAfterTax, 30_000)`, the
per-account contribution `step`, the **BUG-17** `ssClaimingAge.min = max(SS_MIN_CLAIM_AGE,
currentAge)`) are computed in the bundle memo, never in the screen. Setter wrappers
preserve Classic behaviour: `selectedState` clears `stateRateOverride`; `livingExpenses`
and `savingsSurplusPct` clear `preApplySnapshot`; `stateRateOverride`, `incomeGrowthEndAge`,
and `ssOverride` snap to `null` at their defaults; the timeline trio (`currentAge` /
`retirementAge` / `lifeExpect`) uses the coupled setters that keep the cross-field
invariants Classic enforces.

| Bundle | Fields |
|---|---|
| `profile` | currentIncome, incomeGrowth, incomeGrowthEndAge, spouseIncome, spouseIncomeGrowth, filingStatus, selectedState, stateRateOverride, otherPreTaxDeduc |
| `spending` | livingExpenses, livingExpenseGrowth, annualExpenses, retirementTarget |
| `accounts` | `trad401k`/`roth`/`taxable`/`hsa` (each `{ bal, contrib, contribEnd }`), addlPreTaxBal, matchMode, employerMatchPct, matchFormulaRate, matchFormulaCap |
| `ss` | includeSS, ssClaimingAge, ssOverride, isMarried, spouseSsEstimate, spouseClaimingAge, spouseBenefitBasis, spouseCurrentAge, spouseIsSoleBenef |
| `pension` | pensionMonthly, pensionStartAge |
| `conversion` | conversionMode, conversionBracketTarget, annualConversionAmt, conversionTaxSource |
| `health` | hasMarketplaceInsurance, householdSize, marketplaceMonthlyPremium, hasMedicare, personOnMedicare |
| `assumptions` | currentAge, retirementAge, lifeExpect (coupled setters), returnRate, inflationRate, retirementState, savingsSurplusPct |

The Roth-conversion **window** fields (`conversionStartAge`/`conversionEndAge`), the
in-service toggle, and `conversionEvents` are intentionally **not** in the `conversion`
bundle — they belong to the WI-3.6 conversion-planner flow. Tests:
`src/__tests__/setter-bundles.test.js` (round-trip per bundle + the BUG-17 floor,
dynamic step, and snap-to-null wrappers); `src/__tests__/horizon-props-stability.test.js`
auto-covers the bundles' referential stability.

---

### `horizonProps.strategiesView` (WI-3.3 / #100) — the Strategies card-face index

**Added 2026-06-28.** The Strategies screen's read-data bundle (separately memoized for
V9). It is deliberately **thin**: per-card `applicable` flags only. Every card reads its
headline from the bundle that **owns** the number, so there is one source per number
(principle 11). Every `applicable` boolean and the `> 0` comparisons behind them are
computed in the App memo (rule 10 — no comparisons on financial values in JSX).

| Card id | `strategiesView` shape | Headline source |
|---|---|---|
| `conversion` | `{ applicable }` | `props.taxView.conversionDetail.adjustedNetConversionBenefit` (+ `isPositive`; healthcare-adjusted, sign-aware; default −9,854) |
| `rmd` | `{ applicable }` | `props.rmdView.firstRMDAmount` |
| `ss` | `{ applicable }` | `props.ssView.ssMonthly` |
| `withdrawal` | `{ applicable }` | `props.withdrawalView.yr1TaxSavings` |
| `surplus` | `{ applicable }` | `props.budget.availableSurplus` (flag is `> 0`, stricter than `budget.surplusPositive` `>= 0`) |
| `mega` | `{ applicable }` (WI-3.7 — was `{ applicable, capacity, growth }` until `megaView` shipped and took those two fields; the shrink and the card-face repoint landed in the same commit, per this doc's own principle-11 rule) | `props.megaView.capacity` |

**Forward contract:** the interactive flow bundles (`ssView`, `rmdView`, and the future
`conversionView`) attach as **sibling** `horizonProps` fields keyed by the same strategy id;
`strategiesView[id]` stays the card-face/applicability index and reads the same source vars
the flow bundles do, so the catalogue can scale (SP-1, 6 → ~15 cards) without the bundle
becoming a god-object and without the two surfaces ever diverging. **Note for WI-3.6:** the
conversion **card face** already reads its headline from `taxView.conversionDetail` (above), so
`conversionView` should carry the flow's window/sim/optimizer/healthcare detail — *not* re-expose
the headline benefit (which would duplicate `taxView`, the principle-11 trap). Premium **locking** is
NOT modelled here — it arrives as the WI-5.2 `entitlements` bundle + `LockedCard` (a third,
additive card state). Test: `src/horizon/__tests__/strategies-screen.test.js`;
`horizon-props-stability.test.js` auto-covers stability.

### `horizonProps.ssView` / `rmdView` (WI-3.4 / #101 · WI-3.5 / #102) — Strategy flow bundles

**Added 2026-06-28.** The interactive Strategy flows mount in the StrategiesScreen detail
slot (`STRATEGIES[id].Flow`). Each flow reads its sibling view bundle (display scalars,
separately memoized for V9, built from already-computed App scalars — no new model math) and
**writes through the WI-3.1 setter bundles**: SS timing writes `ss` + `pension`; RMD outlook
writes `ss` + `accounts`. Values that already live on `horizonProps` (`householdSS`,
`withdrawalRate`, `effectivePension`, `effectiveExpenses`) are read directly, not duplicated.

- **`ssView`** — `{ ssMonthly, ssAnnual, ssEstimateAnnual, ssAIME, claimAge, claimAgeLabel,
  breakEven, breakEvenContext, ssCoveragePct, delayApplicable, delayGapYrs, ss70DrawReduction,
  wr70, delayGainYrs, spouseSsBenefit, spouseAlt, spouseAltHigher, householdSSMonthly,
  householdCoveragePct, showEffectivePension }`. `ssMonthly`/`ssAnnual` are override-aware
  (mirror the Classic SS panel: a pinned `ssOverride` wins). `claimAgeLabel`/`breakEvenContext`
  are model-provided display strings so the screen does no FRA age-comparison; `delayGapYrs`/
  `householdSSMonthly` are precomputed so the screen does no age/month math (rule 10).
  `showEffectivePension` is the applicability flag for the derived `effectivePension`. `breakEven`/
  `delayGainYrs` are null when inapplicable (→ "—"); coverage %s are null when no expenses.
- **`rmdView`** — `{ firstRMDAmount, firstRMDAge, totalRMDs, rmdTaxBite, effectiveRMDTaxRate,
  rows, rowCount, retAtOrAfterRMD, activeTableLabel, qualifiesTable2, spouseAgeGap }`.
  `rows` is the ONE engine schedule (`retPhase.rmdSchedule`, `{age,rmd,bal,divisor,tax}[]`);
  the flow renders the first 10. `firstRMDAmount/Age` are null when there is no RMD year.

The shared editable-field primitives live in `src/horizon/fields.jsx` (extracted from
MyDetailsScreen) and the flow presentation helpers in
`src/horizon/screens/strategies/flow-ui.jsx`.

### `horizonProps.conversionView` (WI-3.6 / #103) — Roth-conversion planner flow bundle

**Added 2026-07-08.** Sibling keyed by the `"conversion"` strategy id (same forward contract
as `ssView`/`rmdView`). Separately memoized (V9); built from already-computed App values —
no new model math. Six sections:

- **`window`** — `{ hasConvWindow, startAge, endAge, windowYrs, windowLabel, startAgeField,
  endAgeField, isDefaultWindow }`. `windowLabel` preformatted ("7-year window · age 66 → 72");
  the two fields are `{ value, set, min, max, step }` with setters wrapping Classic's
  cross-clamps (start ≤ end, end ≥ start); `isDefaultWindow` = both window state fields
  null → the "Auto — fills the whole window" edge state.
- **`targets`** — `{ convSteadyTarget, convPeakTarget, targetsVary, bracketFillLabel,
  assumesPension }`. `bracketFillLabel` is peak → steady order (Classic parity);
  `assumesPension` pre-gated (`effectivePension > 0`).
- **`outcome`** — `{ annualConversionLabel, netIsPositive, rothBalEndConv, rothBalEndTax,
  rothAdvantage, showTaxSourceComparison }`. `netIsPositive` is the only NEW flag; the
  dollar verdict renders from `props.netConversionBenefit` + `taxView.conversionDetail`.
- **`healthcare`** — breakdown detail only: `{ cliffAges, cliffCount, cliffThreshold,
  acaAnnualLoss, showAcaWarning, showNoCliffNote, irmaaCost, irmaaRows, showIrmaa }`.
  `cliffAges` pre-mapped from the `cliffYears` objects; `irmaaRows` pre-multiplied
  (`surcharge × personOnMedicare`) — never raw objects for JSX re-mapping (rule 10).
- **`tables`** — `{ simYears, rmdCompare }`. `simYears` = `conversionSim.years`
  (`{age,conversion,tradBal,tax}[]`, flow slices first 12); `rmdCompare` pre-joined by
  `buildRmdComparison(rmdScheduleNoConv, rmdSchedule)` (`retirement-phase.js`) →
  `[{ age, noConv, withConv, improved }]` with `withConv: null` for a missing plan row
  (never a synthesized 0); flow shows first 8.
- **`events`** (#118) — `{ rows, add, atMax, inServiceField, hasWorkingYears,
  totalPlannedLabel }`. `rows` are **App-built row objects** (`{ id, ageField, amountField,
  estTaxLabel, remove }`), NOT a raw array + `setConversionEvents`: a raw setter consumed by
  ad-hoc JSX closures would be a write surface WI-5.2's `readOnly` wrapper can't see, and
  the map/filter/clamp logic would be data transformation in JSX (rule 10). One wrappable
  write path per field, built where `setConversionEvents` lives. `atMax` pre-gated against
  `MAX_CONVERSION_EVENTS` (`conversion-events.js`).
- **`optimizer`** — display fields `{ suggestedAmount, suggestedStartAge, suggestedBenefit,
  currentAmountLabel, currentStartAge }` (null when no optimizer result) + `applySuggestion`,
  the WI-3.9 Apply site (contract below).

**What it deliberately does NOT carry (principle 11):** mode / bracket target / amount /
tax source live in the `conversion` setter bundle; the healthcare ON/OFF toggles live in
`health`; the verdict and its components (`rmdTaxSaved`, `conversionCost`, `irmaaCost`,
`acaLoss`, `adjustedNetConversionBenefit`, `isPositive`) live in `taxView.conversionDetail`
(the SAME source the Taxes tab and the Strategies card face read); `netConversionBenefit`
is already a top-level prop. The strategiesView note above (do not re-expose the headline
benefit) stands — an earlier roadmap draft listed `adjustedNetConversionBenefit` among
conversionView fields; ARCHITECTURE wins. The window/events setters live HERE (not in the
`conversion` bundle) per the WI-3.1 note above — they belong to this flow.
Tests: `src/__tests__/conversion-view-wiring.test.js` (self-consistency + the WI-3.9
anti-divergence lock); `horizon-props-stability.test.js` auto-covers stability.

### `horizonProps.withdrawalView` / `surplusView` / `megaView` (WI-3.7 / #104) — the remaining Strategy flow bundles

**Added 2026-07-09.** Same forward contract as `ssView`/`rmdView`/`conversionView` — sibling
bundles keyed by their strategy id, separately memoized (V9), built from already-computed
App values.

- **`withdrawalView`** — `{ netNeed, steps, yr1TaxOptimal, yr1TaxWorstCase, yr1TaxSavings,
  hasSavings }`. `steps` is a pre-filtered (`amount > 0`), pre-labeled, pre-ordered array
  (`[{key, label, amount, note}]` — taxable → traditional → Roth); `hasSavings` is the
  pre-gated boolean the flow's savings callout renders under (never a fabricated $0 when
  false). Read-only — no Apply site (the draw order isn't a tunable setting).
- **`surplusView`** — `{ availableSurplus, savingsSurplusPct, totalExtra, deployLabel,
  extraRows, optRows, applyAllocation }`. `extraRows`/`optRows` are pre-filtered
  (`amount > 0`), pre-labeled row arrays mirroring Classic's ①–⑤ IRS-priority breakdown —
  built from `budget.optimizedAllocation`, not re-derived (one source, principle 11). The
  `savingsSurplusPct` **stepper itself is not on this bundle** — the flow binds directly to
  the existing `assumptions.savingsSurplusPct` field object (its `.set` already clears
  `preApplySnapshot`, matching Classic's slider — one write path, not a second copy).
  `applyAllocation` is the Apply-with-preview site (contract below) — the first real
  consumer of the optional `revert` field.
- **`megaView`** — `{ capacity, limit415c, employeeDeferral, employerMatchAmt,
  capacityRows, growth, usesCatchupLimit }`. `capacityRows` is a pre-labeled 415(c)
  breakdown (`[{label, val, isTotal?}]`); `growth` is `calcMegaBackdoorGrowth`'s
  `[{yrs, val}]` (moved here from `strategiesView.mega.growth` — see that table's note).
  Match-mode inputs are **not duplicated here** — the flow reads/writes them directly off
  the existing `accounts` bundle (`matchMode`/`employerMatchPct`/`matchFormulaRate`/
  `matchFormulaCap`), the same field objects Classic's own match-mode UI uses. No Apply
  site — Classic's mega-backdoor section has none either (informational + live inputs).

Tests: `src/horizon/__tests__/strategies-screen.test.js` (per-flow render + the surplus
Apply/Revert smoke — modal open/cancel/confirm-once, Revert visibility gated on `applied`);
`horizon-props-stability.test.js` auto-covers stability.

### `horizonProps.affordView` (WI-3.8 / #105) — Ideas' "Solvers" affordability mode

**Added 2026-07-09; merged into the Scenarios-retirement change (2026-07-12) as an
independent, non-overlapping addition** — see the dated note in `docs/BUGS.md` BUG-44
addendum and `CLAUDE.md`'s status entry for that day.

- **`affordView`** — defaults/bounds only for the affordability solver:
  `{ defaultPurchaseAge, purchaseAgeField, defaultTargetAge, targetAgeField, step }`. The
  actual `calcAffordabilityMax` call happens **in the screen** (`AffordabilityPanel.jsx`),
  fed by this bundle's bounds plus the existing `whatIfSimInputs` bundle — the same
  sanctioned in-screen-pure-function-call pattern `IdeasScreen` already used for
  `calcWhatIfScenario` (rule 10 exempts calling a pure model function with model-provided
  inputs; it does not exempt arithmetic/comparisons on the result beyond branching on the
  model's own output, e.g. `result.canAfford`). `calcAffordabilityMax` takes the SAME
  `(bundle, options)` shape as `calcWhatIfScenario` (the "must precede any solver UI" fix,
  2026-07-11) — it is called as `calcAffordabilityMax(whatIfBundle, { purchaseAge,
  targetLifeExpectancy, step })`, never the older single-object-spread shape.

**WI-3.8 originally shipped `eventsView` alongside `affordView`** — a wrapped raw CRUD
editor for `moneyEvents` (add/remove rows, edit fields directly), Ideas' "Events" mode at
the time. It was retired the same day it merged into this branch (2026-07-12): the owner
had separately rejected the raw-editor / preset-card pattern in favor of the sheet-first
`LifeEventSheet` flow (`docs/BUGS.md` BUG-44 addendum), which already covers every job
`eventsView` did — so the two were never both shipped together. `moneyEvents` writes go
through `saveEvent`/`removeEvent` (see "Other wrapped write surfaces" below), not a
`eventsView`-shaped bundle.

Tests: `src/horizon/__tests__/ideas-screen.test.js` "Solvers mode" (explainer copy render,
the affordability anti-divergence lock — the panel's displayed max equals a direct
`calcAffordabilityMax` call with the same args, so it can't diverge from Classic's
`WhatIfPanel` — and the desktop age-input blur-clamp regression);
`horizon-props-stability.test.js` auto-covers stability.

---

### Life-event placement (sheet-first flow) — `lifeEventBounds` + `evaluateLifeEvent`

**Added 2026-07-10** (video-inspired arc-event placement). The user picks an event seed
(Ideas life-event pills), configures it in `src/horizon/LifeEventSheet.jsx` with a **live
verdict**, and on save it joins committed `moneyEvents` — rendering as a tappable **icon
badge with a stem** on the Plan/Ideas arcs (`ArcGraph` `events` + `onEventTap` props;
badge tap re-opens the sheet in edit mode with a Remove action).

- **Model:** `evaluateLifeEvent(whatIfBundle, event)` (`what-if.js`) runs baseline +
  candidate through `calcWhatIfScenario` (ONE walk each — the verdict and any overlay can
  never disagree, V1) and returns `verdict` ("comfortable"/"tight"/"unaffordable",
  threshold `ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS`), cost scalars, `atRetirement` /
  `atPlanAge` deltas with model-computed `dir` strings, and a `sustainability` block with
  pre-computed display flags (`newlyDepletes`, `depletionMoved`) — the sheet renders and
  formats only (rule 10).
- **Event kinds:** one-time (`amount`) and **duration** (`monthlyAmount` × `durationMonths`
  from `age`, optional `incomeAnnual` inflow offset) — see `src/model/money-events.js`.
  `eventNetForYear` is the ONE per-year source consumed by `runSimulation`,
  `buildRetirementDrawdown`, and the per-account engine; `eventFirstAge`/`eventLastAge`
  drive every phase filter so boundary-spanning duration events hit each walk's years
  exactly once (BUG-42).
- **`horizonProps.lifeEventBounds`** — `{ minAge, maxAge, retirementAge }`, separately
  memoized (V9): the sheet's age-slider bounds, computed in App.jsx (rule 10 — no age math
  in the screen). The sheet's model runs use the existing `whatIfSimInputs` bundle.

Tests: `src/horizon/__tests__/life-event-sheet.test.js` (sheet + badges),
duration/`evaluateLifeEvent` coverage in `money-events.test.js` / `what-if.test.js`.

### Preview-first levers + verdict tick rails (2026-07-11, #122)

Plan's `TryAChangePanel` and Ideas' Dials are **preview-first**: screen-local offsets feed ONE
`buildLeverPreview(whatIfBundle, { retirementAge, monthlyExpenses })` run (what-if.js) whose
`chart` is the arc's dashed overlay and whose `metrics` (buildPreviewMetric rows) are the delta
chip AND the ApplyPreviewModal payload — one run, three surfaces, no divergence. Apply goes
through the single App write path `applyPlanLevers({ retirementAge, monthlySpend })`
(coupled setters + `commitPlan`, which now accepts `monthlySpend`; month→year conversion stays
App-side). `buildLeverRail` / `buildDurationRail` produce `[{ value|months, verdict }]` per
slider step (verdictForMargin — the same formula as `evaluateLifeEvent`); screens render them
with the shared `VerdictTickRail` (fields.jsx) mapping verdict strings to tokens only.
`calcWhatIfScenario` itself walks retirement with `buildRetirementPhase` on the bundle's
`retPhaseBase`/`conversionByAge` (whatIfBundle also carries `baseChart` + `addlPreTaxBal`),
locked by the no-op invariant (scenario chart === totalChartData); `ArcGraph.trimScenarioOverlay`
starts the dashed line at the divergence age. `calcWhatIfDelta`/the optimizer remain on the
blended walk (BUG-36's narrowed scope); `calcAffordabilityMax` moved onto the engine
(`calcWhatIfScenario`) in the 2026-07-11 fix pass — see BUG-36's scope note.

---

### Apply-with-preview contract (WI-3.9 / #106)

**Added 2026-07-08.** The shared pattern for every "Apply this suggestion" affordance:
the App memo runs the candidate through the SAME engine mechanism the suggestion's search
used, a pure builder (`src/model/apply-preview.js`) turns the two runs into a display-ready
payload, and the modal (`src/horizon/ApplyPreviewModal.jsx`) renders it VERBATIM — no
arithmetic, no comparisons, not even a sign (rule 10).

**Payload shape** (built by `buildConversionPreview` (WI-3.9), `buildSurplusPreview` (WI-3.7),
`buildCommitPlanPreview` (WI-3.8 — a shared builder for "save this as your committed plan"
sites; not currently wired to a screen — its `planCommit`/`buildScenarioCommitSite` call
sites were part of the QuickTunePanel-era Plan/Ideas UI retired by #122's preview-first
redesign and the same-day Scenarios removal; kept as a tested, reusable builder for a
future commit-with-preview site) — all in `src/model/apply-preview.js`):

```js
preview = {
  title:  "Apply optimizer suggestion",
  action: "Convert $85,000/yr starting at age 61 (now: $82,765/yr from age 61)",
  confirmLabel: "Apply",       // per-site copy lives in the payload, NOT the modal —
                               //   L3d's commitPlan sites pass "Save as my plan"
                               //   without touching the modal component
  metrics: [
    { id: "netBenefit",        // stable id (tests key on it)
      label: "Net benefit after healthcare",
      before: "−$9,854",       // display-ready strings; builder owns Infinity/null edges
      after:  "$12,400",       //   (longevity renders "depletes at 87 (21.3 yrs)" /
                               //    "lasts beyond your plan" — one row, two views of one fact)
      delta: { dir: "up",      // "up" | "down" | "none"
               label: "+$22,254",
               tone: "good" } },  // "good" | "warm" | "neutral"
  ],
  note: "Preview uses the same per-account engine as your headline numbers.",  // optional
  verdict: null,               // RESERVED render slot — WI-5.4 (#85) attaches
}                              //   { label, tone }; null-guarded from day one
```

**Apply-site shape** — every Apply on every view bundle, now and later:

```js
someView.<siteName> = {
  available: bool,   // pre-gated App-side; never compared in JSX
  preview,           // null when !available
  apply,             // useCallback performing the writes
  revert?,           // OPTIONAL additive sibling — SHIPPED WI-3.7 (surplusView.applyAllocation,
                      //   the first consumer): restores an exact preApplySnapshot; does NOT
                      //   route through the modal (an exact restore needs no preview); the modal
                      //   never renders it. Valid ONLY for exact pre-apply-snapshot restore — a
                      //   future site whose "undo" recomputes rather than restores needs its own
                      //   Apply site, not this slot (recorded so it isn't misused as a generic
                      //   undo). A sibling `applied` boolean (also additive, also on the site
                      //   object) drives the revert affordance's visibility — see surplusView.
```

**Apply-site registry** (the contract: a generic payload well-formedness test iterates
these rows — future sites get coverage by adding a line here, not a test file; row 1 is
currently covered by `conversion-view-wiring.test.js` + `apply-preview.test.js`):

| Apply site | Ships | Gate (`available`) | Writes |
|---|---|---|---|
| `conversionView.optimizer.applySuggestion` | WI-3.6/3.9 | `isSuggestionApplicable` (healthcare toggle on AND the suggestion differs: \|amount diff\| > $4,999 OR start age differs) | `conversionStartAge`, `conversionMode → "custom"`, `annualConversionAmt` |
| `applyPlanLevers` (Plan `TryAChangePanel` / Ideas dials) | 2026-07-11 (#122) | `buildLeverPreview(...).changed` truthy | `retirementAge` (coupled setters) and/or `annualExpenses` (via `commitPlan`, month→year done App-side) |
| `surplusView.applyAllocation` | WI-3.7 | `totalExtra > 0 && preApplySnapshot === null` | `contrib401k/Roth/HSA/Taxable`, `preApplySnapshot` (snapshot on apply); `revert` restores the 4 contribs from the snapshot and nulls it |

**Other wrapped write surfaces (non-`ApplyPreviewModal`, fix-pass-2 / 2026-07-11):** the
`horizonProps.setMoneyEvents` raw setter was replaced with two list-mutation callbacks — the
concrete instance of the "list-mutation callback" shape the companion convention above names.
Neither routes through `ApplyPreviewModal` (no preview needed for an explicit add/edit/delete in
LifeEventSheet), but both are still wrapped at construction (App.jsx), never a bare setter on the
props bundle:

| Write surface | Writes | Called by |
|---|---|---|
| `saveEvent(ev)` | upsert into `moneyEvents` by `ev.id` (replace if present, else append) | `LifeEventSheet`'s `onSave`, via Plan's arc-badge edit-in-place and Ideas' preset placement / edit / scenario-apply merge |
| `removeEvent(id)` | filters `moneyEvents` to drop the matching id | `LifeEventSheet`'s `onRemove`, via Plan's + Ideas' edit-in-place "Remove from plan" |
| `commitPlan({...})` | `retirementAge`, `annualExpenses` (or `monthlySpend`), optionally `currentAge`/`currentIncome`, and snapshots `committedPlan` | onboarding's done screen ("Save as my plan"); internally by `applyPlanLevers` after it writes the coupled setters, so every lever apply also refreshes the `committedPlan` snapshot |

**Gating composition point (for WI-5.2):** all gating composes in the App memo that
computes `available` — entitlements/`readOnly` flags will be AND-ed into `available` and
into field `.set` wrappers App-side; flows and the modal never import or test entitlements.
For a site with a `revert` sibling, the SAME composition applies to `revert` — it is not
exempt just because it bypasses the modal; a future `readOnly` wrap must be able to disable
`apply` and `revert` identically (not yet implemented — `surplusView.applyAllocation.revert`
is unconditionally live today, which is harmless while nothing is `readOnly`, but is the
named TODO for whichever WI adds the wrap). For a site-builder (above), the composition must
live *inside* the builder function, since there's no static object to wrap at construction.
Companion convention: **every writable thing on a view bundle is one of three shapes** —
a `{ value, set }` field object, a registry-listed Apply callback, or a **list-mutation
callback** (`add` / `remove` on a collection like `conversionView.events` or `eventsView.rows[].remove`).
All three are write surfaces WI-5.2 must neuter: the field `.set` and the registry callbacks
compose gating as above; list-mutation callbacks compose it the same way (App-side, at
construction), so `readOnly` disabling "add/delete a conversion event" or "add/delete a money
event" is mechanical too. The rule is: **no bundle exposes a raw setter or a bare mutation the
App memo hasn't wrapped** — that is what makes "all setters inert" a wrap-at-construction job
rather than a per-surface hunt. `eventsView` (WI-3.8) is the second bundle built specifically
to satisfy this rule: it replaced a previously-raw `setMoneyEvents` that used to be exposed
directly on `horizonProps`.

**Anti-divergence guarantee (BUG-31/BUG-35 class):** the conversion Apply site builds its
candidate via `buildConversionByAge` + `buildRetirementPhase({ ...retPhaseBase, … })` — the
optimizer's own `getNetBenefit` mechanism — and the preview's netBenefit "after" IS
`optimizerResult.optimalBenefit`. One objective, two surfaces; locked by
`conversion-view-wiring.test.js`. `isSuggestionApplicable` returning false once the writes
land is the machine-checked "suggestion clears once applied" guarantee
(`apply-preview.test.js`).

**#57 attachment note:** when `bracketRoomByYear` ships, per-year bracket headroom attaches
**additively** to `conversionView.tables.simYears` rows (or as a model-joined sibling
array) — the same view consumed by the future rental-sale / stock-option / DAF flows; not
built now (needs the multi-strategy claim semantics from the SP-1 stress test).

**Explicit YAGNI (recorded so it isn't re-litigated):** no lazy `getPreview` variant
(additive later if a site is genuinely expensive; eager memos are V9-stable and
auto-tested); no household-scope axis in `conversionView` (SP-6: strategy flows are
household-scope by default); no reserved #119 benefit slot in `events` (bundle fields are
additive; only `verdict` needs a day-one render slot because the modal LAYOUT must
accommodate it); no `verdict` population (#85's model field doesn't exist yet).
`buildPreviewMetric` ships `money`, `longevity`, and (added WI-3.7) `percent` format kinds.
The `percent` kind takes **whole-number percents** (`15.3` means 15.3%, matching this
codebase's existing convention — `withdrawalRate`, `savingsSurplusPct`, etc. — NOT a
decimal fraction), rounds each side to one decimal before diffing (same rule as `money`/
`longevity`, so a sub-0.1-pt float gap can't show a delta beside two identically-displayed
numbers), and renders its delta in percentage points ("+2.1 pts"). `longevity` also gained a
null-`years` guard this round (renders "—", no fabricated delta) — needed for
`buildCommitPlanPreview`'s first-ever-save case, where `current` has no prior baseline.

---

### `evaluateConversionPlan` returns a full bundle — the optimizer's "unused" fields are NOT waste

**Decision (2026-06-06):** Leave `evaluateConversionPlan` (`src/model/conversion-evaluation.js`)
returning all 10 fields, called as-is by both the display path and the optimizer.

**Context:** A code review flagged that the conversion optimizer's `getNetBenefit`
calls `evaluateConversionPlan` ~60 times (a $5k-step search) but reads only 4 of the
10 returned fields (`rmdTaxSaved`, `conversionSim.totalTax`, `irmaaCost`, `acaLoss`),
"discarding" the other 6 — suggesting wasted work.

**Analysis & conclusion (investigated, not a bug):**
- The 4 fields the optimizer uses are the **expensive** ones: producing them requires
  `calcRMDPostConversion` (a year-by-year RMD projection to life expectancy) and
  `calcHealthcareExposure` — both genuinely needed to score a conversion amount.
- The 6 "discarded" fields (`rmdDataPostConversion`, `rmdTaxBitePost`, `healthcareExposure`,
  `cliffYears`, `netConversionBenefit`, `adjustedNetConversionBenefit`) are **free
  byproducts** already computed on the way to those 4 — a couple of array filters and
  subtractions, no extra heavy calls. The old (pre-extraction) optimizer computed the
  exact same heavy calls per iteration; nothing got slower.
- The only way to "trim" the byproducts is to split this into lean/full variants —
  which **re-introduces the two-implementations divergence** the single shared function
  exists to prevent (BUG-31 class). Not worth it.

**Therefore:** this is intentional and correct. Do not "optimize" it away, and do not
re-file it as a bug or efficiency problem. (Also noted at the `return` in
`conversion-evaluation.js`.)

---

### MAGI Penalty Warnings — ACA / IRMAA / NIIT (planned feature)

**Decision (2026-06-03):** ACA and IRMAA should be modeled as real dollar costs
(not just warnings) when applicable. NIIT should be a warning only.

#### ACA Subsidy Cliff
- Only affects users buying insurance on the ACA marketplace — zero impact for
  anyone with employer coverage, retiree coverage, or who is already on Medicare.
- Dollar impact is large (potentially $10k–$20k+/yr lost subsidies) and cliff-like.
- **Implementation:** Add a yes/no input: "Are you or will you be on an ACA
  marketplace plan before age 65?" If yes, compute the subsidy loss per conversion
  year and subtract it from `netConversionBenefit` as a real cost.
- Subsidy amounts require the `ACA_FPL_2026` table + household size input.
- **MAGI note:** ACA eligibility uses full MAGI — includes 100% of SS (not the
  85% taxable fraction used in `convFloors`). A separate `convMAGIFloors[]` array
  using 100% SS is needed; do not reuse `convFloors` for this calculation.

#### IRMAA (Medicare premium surcharge)
- Applies to everyone enrolled in Medicare Part B/D whose MAGI exceeds ~$103k
  (single) / ~$206k (MFJ). Structured tiers, not a cliff — adds $70–$420+/mo per
  person depending on income tier.
- Near-universal for 65+ retirees (Medicare enrollment is nearly automatic at 65;
  only those with qualifying employer coverage past 65 legitimately opt out).
- **Implementation:** Add a yes/no input: "Will you enroll in Medicare at 65?"
  Default to yes. If yes, compute IRMAA surcharge per retirement year from MAGI
  and add it as a real annual cost. Display a UI note: "We've assumed Medicare
  enrollment at 65. If you will have qualifying employer coverage past 65, toggle
  this off."
- **⚠️ 2-year lookback:** IRMAA premiums in year Y are based on MAGI from year
  Y−2. A large Roth conversion at 67 triggers higher Part B/D premiums at 69.
  The per-year MAGI from `convFloors` is already available — apply the [yr−2]
  offset when looking up the IRMAA tier. Do NOT apply the surcharge in the same
  year as the income; it's a common implementation mistake.
- All IRMAA bracket thresholds and surcharge amounts belong in `irs-2026.js`.

#### NIIT (Net Investment Income Tax)
- The Roth conversion itself is ordinary income, NOT investment income — NIIT
  does not apply to the conversion amount directly.
- NIIT (3.8%) applies to dividends, capital gains, and passive income when MAGI
  exceeds $200k (single) / $250k (MFJ). A large conversion can *indirectly* push
  MAGI above the threshold, making pre-existing investment income newly subject.
- Impact is modest (3.8% of investment income, not the whole conversion) and
  conditional on having significant taxable-account income.
- **Implementation:** Warning only. Estimate the marginal NIIT exposure when
  conversion pushes MAGI past the threshold. Do not bake into `netConversionBenefit`
  by default. Threshold constants belong in `irs-2026.js`.

#### Shared implementation note
All three features derive from per-year projected MAGI during the conversion
window. The conversion window already has `convFloors[i]` (taxable income floor
per year, gating SS/pension by age). Extend this pattern:
- `convTaxableFloors[i]` — current `convFloors` (85% SS + pension), used for
  bracket-fill conversion targets and income tax calculations.
- `convMAGIFloors[i]` — new, parallel array using 100% SS + pension, used for
  ACA/IRMAA/NIIT threshold comparisons.
Both arrays gate SS and pension on `ssClaimingAge` / `pensionStartAge` per
year (`>=` comparison per CLAUDE.md rule 5b).
