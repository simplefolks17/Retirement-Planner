# Financial Model

## Tax Calculations

### Federal Income Tax
- **AGI** = grossIncome − totalPreTaxDeduc (where totalPreTaxDeduc = contrib401k + contribHSA + otherPreTaxDeduc)
- **Taxable income** = AGI − standard deduction (per filing status)
- Applied against 2026 graduated brackets (7 rates: 10%, 12%, 22%, 24%, 32%, 35%, 37%)
- Returns both total tax and effective rate (tax / AGI)

### State Income Tax
- Uses a flat effective rate per state from lookup table
- User can override with a slider for their actual effective rate
- Retirement state tax uses a separate table (many states exempt retirement income)

### FICA
- 7.65% of gross income, capped at SS wage base ($168,600 for 2026)
- FICA uses gross income, not AGI (payroll tax, not income tax)
- **401(k) deferrals do NOT reduce the FICA base** — SS and Medicare apply to gross salary before 401(k) deduction. This is why Box 3/5 on a W-2 is higher than Box 1.
- **HSA via payroll (Section 125 cafeteria plan) DOES reduce the FICA base** — it reduces both Box 1 AND Box 3/5 simultaneously, making it invisible in the Box 1 vs Box 3/5 gap. This is the most tax-efficient way to fund an HSA.

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
- Always based on FRA — does NOT change with primary's claiming age
- Spouse receives the higher of their own benefit or the spousal amount

### Taxability
- Up to 85% of SS benefit is taxable as ordinary income (used in bracket fill calculations)

## Roth Conversion Model

### Conversion Window
- Years from retirement to age 72 (before RMDs at 73)
- Low-income years where conversions are taxed at lower rates

### Bracket Fill Strategy
- Target bracket top (12%, 22%, or 24%) + standard deduction − retirement income floor
- Retirement income floor = 85% of householdSS + effectivePension

### Dual Tax Source Scenarios
- **From converted amount**: Roth receives (conversion − tax), less efficient
- **From taxable brokerage**: Roth receives full conversion, tax paid from taxable account
- Both scenarios computed simultaneously; user selects which to display

## Drawdown Model

### Net Portfolio Need
```
netPortfolioNeed = max(0, effectiveExpenses − householdSS − effectivePension)
```
This is the only value used for portfolio depletion. The portfolio does NOT fund the full expense — SS and pension are external income.

### Real Return
```
rReal = (1 + nominalReturn) / (1 + inflation) − 1
```

### Years Sustained
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

## Known Simplifications

These are intentional modeling choices, not bugs. Document them so users and reviewers understand the tradeoffs.

| Simplification | Impact | Notes |
|---|---|---|
| 2026 tax rules frozen for all projection years | Medium | Real brackets adjust for inflation annually. A 30-year-old's projection uses 2026 brackets through age 90. |
| Taxable brokerage assumes annual realization | Understates taxable growth by 15–25% over 30 years | Buy-and-hold investors compound unrealized gains tax-free. The model applies LTCG drag every year. |
| 401k after-tax display uses phase rate, not effective rate | Makes 401k look worse vs Roth | Someone withdrawing $80K pays ~13% effective, not the 22% phase rate. |
| State tax is a flat effective rate | Inaccurate at income extremes | A $50K CA earner pays ~4%, not the table's 9.3%. User can override. |
| Inflation applied to returns but not to brackets/limits | Subtle asymmetry | IRS adjusts limits annually. Sim uses 2026 limits with inflation-adjusted returns. |
| SS benefit doesn't adjust for early retirement (fewer earning years) | Overstates SS for very early retirees | Someone retiring at 45 has fewer high-earning years in the 35-year average. |

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
