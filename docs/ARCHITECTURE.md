# Architecture

## Module Map

```
src/
  config/
    irs-2026.js           All 2026 IRS constants + ASSUMPTIONS object           [CLIENT]
  model/                  Pure functions — no React. Used client-side AND server-side.
    taxes.js              calcTax, marginalRate, ltcgRate, calcStateTax, getTaxRate  [CLIENT]
    social-security.js    calcAIME, calcPIA, calcBenefit, calcSpousal           [CLIENT]
    simulation.js         runSimulation (accumulation loop)                     [CLIENT]
    drawdown.js           calcNetPortfolioNeed, calcWithdrawalRate, calcYearsSustained, calcDrawdownYears  [CLIENT]
    retirement-drawdown.js buildRetirementDrawdown (ONE shared retirement-phase walk)  [CLIENT]
    employer-match.js     calcEmployerMatch (flat + formula modes)              [CLIENT]
    rmd.js                calcRMDProjection, calcRMDPostConversion              [CLIENT]
    retirement-tax.js     calcRMDIncomeFloor, calcRMDTax, calcRMDTaxSchedule, calcWithdrawalOrderTax  [CLIENT]
    budget.js             calcGrossAfterTax, calcSavingsCapacity, calcOptimizedAllocation  [CLIENT]
    healthcare.js         acaCliffThreshold, calcHealthcareExposure (ACA cliff + IRMAA)  [CLIENT]
    optimization.js       calcOptimizedScenario                                 [SERVER]
    conversion-planning.js buildIncomeFloors, calcBracketFillTargets (conversion-window floors + bracket fill)  [CLIENT]
    roth-conversion.js    calcConversionSim, findOptimalConversion              [SERVER]
    flow-down.js          calcFlowDown (waterfall decomposition from the shared walk)  [SERVER]
    action-cards.js       generatePhaseActions, generatePhaseSteps              [SERVER]
    __tests__/            Vitest suites — one per model file + golden-master.test.js
  components/             React UI — all client-side
    ActionCard.jsx        ChartTooltip.jsx   DeferredInput.jsx   FlowConn.jsx
    PhaseCard.jsx         Slider.jsx         TaxPhaseCard.jsx    TaxTimeline.jsx
    WaterfallStep.jsx
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
`npm test`. Current count: **213 tests across 18 files**, all passing.

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
