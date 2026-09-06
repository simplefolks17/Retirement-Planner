# Audit: Dollar-Basis and Primary-vs-Household Scope
Started 2026-09-05. Repo: /home/user/Retirement-Planner
Status: IN PROGRESS — appended incrementally.

## Method
- Probe scripts only, named `zz-*.test.js`, deleted at end.
- Evidence standard: printed number pairs + ratio, or marked UNVERIFIED HYPOTHESIS.

## Progress log
- [t0] File created. Beginning code survey.

## Survey notes (pre-verification)
- `toRetirementYearDollars` / `inflationRebaseFactor` in `src/model/finance-math.js`.
- App.jsx basis anchors (all computed once, App.jsx:588-615):
  - `yearsToRetForBasis = max(0, safeRetAge - currentAge)`
  - `retSpendBasis` = effectiveExpenses -> retYear
  - `retPensionBasis` = effectivePension (gated at retirement) -> retYear
  - `retPensionAnnualBasis` / `retPensionMonthlyBasis` = UNGATED pension -> retYear
  - `retPensionAtRMDAge` (gate 73), `retPensionAt70` (gate 70)
- SS (`householdSS`, `ssAtRet`, `ssTaxableRet`) is DELIBERATELY not converted — App.jsx:585-587
  claims "SS is already nominal at the claim date, matching the engine's convention".
  NOTE: `calcAIME` averages NOMINAL earnings across working years then divides by max(workYears,35).
  -> SS is an odd blended basis; flagged for later scrutiny (documented decision, low priority).
- Stale `zz-*` probe files from OTHER sessions exist in src/__tests__ (10:14-10:21, 19:59 today).
  Mine will be prefixed `zz-bsaudit-` and only those deleted.

---
## FINDING F1 (BASIS, display caption) — `balAt90` captioned "in today's dollars"
**File:** `src/horizon/screens/NumbersScreen.jsx:395-417` (Statement tab, "The bottom line")
**Class:** rule-11 "display site captions an already-converted value but re-reads the raw one" —
here the inverse: one caption spans TWO figures in DIFFERENT bases.

Rendered block:
```
{fmtMo(effectiveExpenses)} / month in retirement      <- TODAY's dollars  (correct)
with {fmt(balAt90)} remaining at age 90.              <- RETIREMENT-YEAR real dollars
in today's dollars                                    <- caption, applies to the block
```
`balAt90 = walkBalanceAt(retirementWalk.rows, safeLifeExp)` (App.jsx:994) is a retirement-phase
WALK balance ⇒ primary's retirement-year purchasing power (BUG-90/91 frame).

**Printed repro** (mounted App; default + trad401k bal 600k / roth 200k / taxable 300k so the
plan survives to 90):
```
effectiveExpenses (today's)   =    57,377   -> $4,781/mo   [caption TRUE]
balAt90 (retirement-year $)   = 5,341,525                  [caption FALSE]
balAt90 in today's dollars    = 5,341,525 / 1.04^35 = 1,353,663
ratio                          = 3.946x
```
**Golden masters:** none would catch it (no assertion pairs balAt90 with a basis claim; it is 0
at the no-spouse default, so the site is invisible there).
**Severity:** MEDIUM-HIGH (a 3.95x overstatement of the reader's understood value, on the
"Statement of your plan" tab, under an explicit and confident basis caption).

---
## FINDING F2 (BASIS, BUG-132 class, UNFIXED SIBLING) — Numbers/Statement shows the retirement-year
monthly total and the today's-dollars replacement % ~40px apart, with no `showsReplacementPct` gate
**File:** `src/horizon/screens/NumbersScreen.jsx:522` (ledger "Total monthly") and
`:538-556` ("Retirement income replaces X% of your working paycheck deposit.")
Model: `calcStatementView` (`src/model/budget.js:196-243`) deliberately builds `monthlyTotal` from
`effectiveExpensesRetYear` and `incomeReplacementPct` from `monthlyTodaysExp` — both individually
correct, and the file says so. **But the SCREEN renders them together with no gate**, which is
precisely the mismatch PR #66's BUG-132 fixed on the Plan screen by adding
`dollarBasisOptions[].showsReplacementPct`. The Statement tab never got that treatment.

**Printed repro** (mounted App, DEFAULT state — live on the shipped default, no fixture needed):
```
Statement col 1  "Paycheck deposit"  =  $68,377 / yr  ($5,698/mo)   TODAY's dollars
Statement col 3  "Total monthly"     =  $18,868 / mo  ($226,415/yr) RETIREMENT-YEAR dollars
caption under col 3                  =  "blended monthly income, in retirement-year dollars"
sentence 2 lines below               =  "Retirement income replaces 84% of your working paycheck deposit."
18,868 / 5,698                       =  3.31x  -> the on-screen numbers read 331%, the sentence says 84%
```
**Golden masters:** `golden-master-app-wiring.test.js` locks `statementView` values? (checking) —
but no assertion covers the CO-RENDERING, so no.
**Severity:** MEDIUM-HIGH — BUG-132 verbatim, on a different screen. Same numbers ($18.9k vs $5.7k)
as BUG-132's own writeup.

---
## FINDING F3 (HIGH — found during the SCOPE sweep, but the root cause is a property-name drift)
### `contribSeries` is identically ZERO after its first point — the Plan screen's "Sources" chart
### shades 100% of the portfolio as "Market growth"
**File:** `src/App.jsx:999-1012` (`contribSeries` memo); consumed by
`src/components/ArcGraph.jsx:400-447` (`sourcesModel`/`SourcesSvg`) via
`src/horizon/screens/PlanScreen.jsx:730`. Legend at `ArcGraph.jsx:886`:
`[["Market growth", t.warm], ["Your contributions", t.good]]`.

**Root cause:** `runSimulation` (`src/model/simulation.js:328-356`) returns rows keyed
`"Trad 401k"` (added in App.jsx:333) / `"Roth IRA"` / `"Taxable"` / `"HSA"` / `tradGross`.
App.jsx:1005 reads the LOWERCASE names:
```js
const rowTotal = (row.trad ?? 0) + (row.roth ?? 0) + (row.taxable ?? 0) + (row.hsa ?? 0);
cumContrib = Math.min(cumContrib + (contrib401k + contribRoth + contribTaxable + contribHSA), rowTotal);
```
All four are `undefined` ⇒ `?? 0` ⇒ `rowTotal === 0` ⇒ `cumContrib` is clamped to 0 forever.
(The `?? 0` fallbacks are what hide the drift — the rule-10 prohibition on `?? 0` fallbacks
exists for exactly this.)

**Printed repro (mounted App, SHIPPED DEFAULT, no fixture):**
```
contribSeries: 31:165000  32:0  33:0  34:0 ... 90:0
nonzero points = 1 of 60
simData[0] keys = age,Roth IRA,Taxable,HSA,tradGross,c401k,...,Trad 401k   <- no `trad`/`roth`/`taxable`/`hsa`
row.trad = undefined      row['Trad 401k'] = 66150
chartData at age 40 total = 655,024      contribSeries at age 40 = 0
```
So the "Your contributions" line collapses to the x-axis at age 32 and the whole $4,035,855
arc is filled as "Market growth". True household contributions+start at retirement =
$1,475,382 (from `flowDown`), i.e. the growth band is overstated by that entire amount.

**Golden masters:** none. `contribSeries` is asserted nowhere; `horizon-props-stability` only
checks identity, not content.
**Severity:** HIGH (a whole chart view is wrong at the default state, and the wrongness is
maximally flattering — it credits every contributed dollar to market growth).

### F3b (the SCOPE half, still true after F3 is fixed)
Even with the field names fixed, `contribSeries` is PRIMARY-ONLY (built from `simData` +
`bal401k/balRoth/balTaxable/balHSA`) while `chartData` is HOUSEHOLD (`buildAccumChart` zips in
`spouseSimData` + `spouseStartingBal`). `flowDown.totalContrib` (the Journey / Statement
"You'll contribute $X over your career" number) IS household
(`flow-down.js:47`: `sumContrib(contribRows) + sumContrib(spouseContribRows)`).
**Printed repro (MFJ, spouse age 30, spouse income 120k, spouse 401k bal 400k / contrib 20k):**
```
contribSeries[0] (age 31)   =   165,000   <- PRIMARY-only starting balances
chartData[0].total (age 30) =   565,000   <- HOUSEHOLD starting balances
gap at t0 credited to "Market growth" = 400,000  (= 100% of the spouse's rollover)
flowDown.totalContrib + startPortfolio = 2,958,343  (household)
```
So two surfaces state the same concept at two scopes — BUG-96's exact shape.

---
## FINDING F4 (SCOPE + BASIS, cross-product) — Numbers > Accounts "Today → At retirement" banner
**File:** `src/horizon/screens/NumbersScreen.jsx:847-869`
```
Today                                   At retirement · age 65
{fmt(currentTotalSaved)}          →     {fmt(totalAtRet)}
```
- `currentTotalSaved` (App.jsx:2619) = `bal401k + balRoth + balTaxable + balHSA` — **PRIMARY-only, TODAY's dollars**
- `totalAtRet` (App.jsx:551) = `(tradGrossAtRet + sTrad) + hhRoth + hhTaxable + hhHsa` — **HOUSEHOLD, RETIREMENT-YEAR dollars**

Two axis errors in one arrow. **Printed repro** (MFJ, spouse 30, spouse income 120k, spouse 401k 400k
+ contrib 20k, spouse Roth 100k):
```
'Today'                 =   165,000   (primary-only, today's $)
'At retirement age 65'  = 9,435,542   (household, retirement-year $)
household today actual  =   665,000   (flowDown.startPortfolio)  -> scope gap 500,000
totalAtRet in today's $ = 2,391,112
banner implies growth of 57.2x ; honest same-basis same-scope figure = 3.6x   (15.9x overstated)
```
**Golden masters:** no. `currentTotalSaved` is asserted nowhere; both spouse fixtures assert
`totalAtRet` alone.
**Severity:** HIGH for a spouse household, MEDIUM otherwise (no-spouse: scope error vanishes, basis
error remains — 4,035,855 vs 165,000 reads as 24.5x when the real-purchasing-power figure is 6.2x).

## FINDING F5 (same root, different surface) — `planHighlights.wealthMultiplier`: "grows Nx from today"
**File:** `src/App.jsx:1674-1676` (`totalAtRet / currentSaved`), rendered
`src/horizon/screens/PlanScreen.jsx:95-98` as `grows {wealthMultiplier}× from today`.
`currentSaved` (App.jsx:1591) is the SAME primary-only, today's-dollar sum as F4.
The word "from today" is the falsifiable claim: the numerator is not in today's dollars, and in a
spouse household it isn't the same household either.
**Printed repro:** default state `24.5x` vs real-purchasing-power `6.2x` (factor 1.04^35 = 3.946);
spouse fixture `57.2x` vs `3.6x`.
**Golden masters:** `golden-master-app-wiring.test.js` locks 7 planHighlights fields — checking
whether wealthMultiplier is one of them. (see verification section)

## FINDING F6 (SCOPE) — non-MFJ + `spouseIncome > 0`: the spouse's FICA is subtracted from
## primary-only income, silently lowering take-home, living spend and the whole plan
**File:** `src/model/tax-basis.js:47-62` — `householdIncome = isMFJ ? combinedIncome : currentIncome`
but `fica` is ALWAYS both earners (`ssWages`/`medWages` include `spouseIncome` regardless of status),
and `takeHome`/`grossAfterTax` subtract that household FICA from the primary-only `householdIncome`.
Rule 9 mandates per-earner FICA; it does not mandate charging the spouse's FICA against an income
basis that excludes the spouse.
**Printed repro (model + mounted App, `filingStatus` left at the default "single"):**
```
calcTaxBasis, currentIncome 100k, 401k 10k, HSA 3,850, TX
  single, spouseIncome=0      householdIncome=100,000  fica= 7,650  takeHome=68,377  grossAfterTax=82,227  combinedEffRate=17.8%
  single, spouseIncome=120k   householdIncome=100,000  fica=17,010  takeHome=59,017  grossAfterTax=72,867  combinedEffRate=27.1%
  mfj,    spouseIncome=120k   householdIncome=220,000  fica=16,830  takeHome=161,627 grossAfterTax=175,477 combinedEffRate=20.2%
App: setting spouseIncome 0 -> 120,000 with filingStatus "single"
  takeHome           68,377 -> 59,017    (-9,360 = exactly the spouse's FICA)
  effectiveExpenses  57,377 -> 48,017    (-9,360 — the user's own retirement spending target FALLS
                                          because their spouse earns money)
  statementView.gross stays 100,000; keepPct 68% -> 59%
```
Mitigation already present: `spouseFilingMismatch` is `true` here (a guardrail note), but it warns
about RMD/tax math, not about the paycheck/spend figures.
**Adjacent label bug:** `src/App.jsx:3097` (Classic) picks the label on `spouseIncome > 0` alone —
`"Est. Household Paycheck Deposit"` — for a figure that is primary-income-minus-household-FICA.
Horizon's equivalent (`planHighlights.takeHomeIsHousehold`, App.jsx:1777) correctly requires
`filingStatus === "mfj" && spouseIncome > 0`; Classic never got that fix.
**Golden masters:** no — all four fixtures are either single-with-no-spouse-income or MFJ.
**Severity:** MEDIUM-HIGH.

## FINDING F7 (BASIS, Classic, BUG-114's original shape still live) — the same expense figure shown
## twice, ~4x apart, ~30px apart, in the Classic "Retirement Drawdown" panel
**File:** `src/App.jsx:3648-3653` (slider "Estimated Annual Expenses in Retirement" = `effectiveExpenses`,
today's dollars; "Monthly: $4,781"; "default = your current living spend ($57,377/yr)") vs
`src/App.jsx:3665-3669` (the breakdown box's first row, "Annual expenses" = `fmt(retSpendBasis)`).
Neither carries a basis note. The box renders whenever
`householdSS > 0 || effectivePension > 0 || spouseIncomeAtRet > 0` — TRUE at the shipped default
(`householdSS` = 48,120).
**Printed repro (shipped default):** slider/monthly = `57,377` / `$4,781/mo`;
breakdown "Annual expenses" = `226,415`. Ratio **3.946x**. This is verbatim BUG-114
("the same figure shown in two different dollar bases ~20px apart, differing ~4x at the default"),
which PR #66 fixed on the Plan screen only.
**Severity:** MEDIUM.

## FINDING F8 (BASIS) — conversion benefit mixes retirement-year engine dollars with today's-dollar
## healthcare costs
**File:** `src/model/healthcare.js:60-75` (`calcConversionCosts`) + `src/model/conversion-evaluation.js`
(`adjustedNetConversionBenefit = netConversionBenefit - irmaaCost - acaLoss`).
`rmdTaxSaved` / `conversionCost` come from the engine (retirement-year real dollars);
`irmaaCost` is a sum of `IRMAA_BRACKETS_2026` nominal 2026 surcharges and `acaLoss` is the user's
TODAY's-dollar `marketplaceMonthlyPremium * 12 * cliffYears`.
**Printed repro** (default + 600k/200k/300k balances, Medicare on, marketplace on @ $1,200/mo):
```
rmdTaxSaved   (engine, ret-year $) = 141,463
conversionCost(engine, ret-year $) = 109,393
irmaaCost     (2026 nominal $)     =   8,036
acaLoss       (today's $)          =       0
netConversionBenefit               =  32,070
adjustedNetConversionBenefit       =  24,034
same costs expressed in ret-year $ = 31,711  ->  adjusted would be 359  (98.5% smaller)
```
The healthcare drag on a conversion is understated by the full 3.95x inflation factor. Related to
but NOT the same as BUG-100 (that one is about brackets inside the engine); this is a display/verdict
figure assembled from two bases. Unfiled.
**Severity:** MEDIUM.
