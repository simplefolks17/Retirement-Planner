# Architecture

## Module Map

```
src/
  config/
    irs-2026.js           All 2026 IRS constants (one object, one update point)
  model/                  Pure functions — no React. Used client-side AND server-side.
    taxes.js              calcTax, marginalRate, ltcgRate, calcStateTax         [CLIENT]
    social-security.js    calcAIME, calcPIA, calcBenefit, calcSpousal           [CLIENT]
    simulation.js         runSimulation (accumulation loop)                     [CLIENT]
    drawdown.js           calcNetPortfolioNeed, calcYearsSustained              [CLIENT]
    employer-match.js     calcEmployerMatch (flat + formula modes)              [CLIENT]
    rmd.js                calcRMDProjection, calcRMDPostConversion              [CLIENT]
    budget.js             calcGrossAfterTax, calcSavingsCapacity                [CLIENT]
    optimization.js       calcOptimizedAllocation, calcOptimizedScenario        [SERVER]
    roth-conversion.js    calcConversionSim (dual tax-source scenarios)         [SERVER]
    action-cards.js       generatePhaseActions (conditional card logic)         [SERVER]
  components/             React UI — all client-side
    Slider.jsx
    DeferredInput.jsx
    TaxPhaseCard.jsx      ...etc (see full list in docs/DESIGN.md)
  tabs/
    SimplePlanner.jsx
    DetailedPlanner.jsx
    FlowDown.jsx
  App.jsx                 State management, tab routing, layout shell
  theme.js                Design tokens (colors, shared styles)
  formatters.js           fmt, fmtPct
api/                      Vercel serverless functions (server-side, code not shipped to browser)
  optimize.js             POST → imports optimization.js
  allocate.js             POST → imports budget.js (allocation engine)
  actions.js              POST → imports action-cards.js
  conversion.js           POST → imports roth-conversion.js
```

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

Tests live alongside model files: `src/model/__tests__/`.

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
