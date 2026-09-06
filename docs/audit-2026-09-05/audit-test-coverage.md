# Test-Suite Coverage Audit — Retirement Planner

STATUS: IN PROGRESS (written incrementally; sections appended as completed)
Started: (see git log / file mtime)

## Sections
- [ ] 1. Inventory of the four golden masters
- [ ] 2. Coverage matrix
- [ ] 3. Risk ranking of uncovered cells
- [ ] 4. Weakened assertions sweep
- [ ] 5. Candidate AUTO-path fixture numbers

---

## 1. Inventory of the four golden masters

### App.jsx default state (the baseline every App-mounting fixture starts from)
`src/App.jsx` lines 102–230. Values relevant to this audit:

| Input | Default |
|---|---|
| currentAge / retirementAge / lifeExpect | 30 / 65 / 90 |
| returnRate / inflationRate / incomeGrowth | 5 / 4 / 3 |
| currentIncome | 100,000 |
| filingStatus | `"single"` |
| selectedState / retirementState | `"TX"` / `"TX"` |
| bal401k / balRoth / balTaxable / balHSA | 50,000 / 25,000 / 80,000 / 10,000 |
| contrib401k / Roth / Taxable / HSA | 10,000 / 7,000 / 4,000 / 3,850 |
| contribEnd* | 65 (all four) |
| spouseBal401k/Roth/Taxable/HSA | 0 / 0 / 0 / 0 |
| spouseContrib401k/Roth/Taxable/HSA | 0 / 0 / 0 / 0 |
| hsaCoverageType | `"self"` |
| annualExpenses / livingExpenses | `null` / `null` (⇒ derived `effectiveLiving`) |
| livingExpenseGrowth | 3 (**dead input — no model consumer**, per BUG-91 amendment) |
| ssClaimingAge | `SS_FRA` = **67** |
| isMarried / spouseIsSoleBenef / spouseCurrentAge | false / false / **18** |
| **spouseRetirementAge** | **`null` ("auto")** |
| ssOverride / includeSS | `null` / true |
| pensionMonthly / pensionStartAge | **0** / 65 |
| spouseIncome / spouseIncomeGrowth | 0 / 3 |
| spouseSsEstimate / **spouseClaimingAge** / spouseBenefitBasis | 0 / **`SS_FRA` = 67** / `"own"` |
| conversionMode / conversionBracketTarget / conversionTaxSource | `"bracket"` / 22 / `"converted"` |
| conversionStartAge / conversionEndAge | `null` / `null` (⇒ retAge+1 … RMD_START_AGE-1) |
| conversionEvents / **moneyEvents** | `[]` / **`[]`** |
| conversionInService | false |
| employerMatch* | 3 / `"flat"` / 50 / 6 |
| addlPreTaxBal | 0 |
| hasMarketplaceInsurance / hasMedicare | false / false |
| committedPlan | `null` |

`RMD_START_AGE = 73`, `SS_FRA = 67` (`src/config/irs-2026.js`).

`resolveSpouseRetAge` (`src/model/retirement-phase.js:31`):
```js
const raw = Number.isFinite(spouseRetirementAge) ? spouseRetirementAge : primaryRetAge;
// clamped to [spouseCurrentAge+1, lifeExp-1]
```
⇒ under **auto**, the spouse retires at the primary's retirement age *in the spouse's own age frame*.

---

### GM-1 — `src/model/__tests__/golden-master.test.js` (hand-built, never mounts App)
**Does not mount App.** Calls `calcTax`/`runSimulation`/`calcRetirementIncome`/`buildIncomeFloors`/`calcBracketFillTargets`/`buildConversionByAge`/`buildRetirementPhase` directly, and **hand-mirrors** App.jsx's `toRetirementYearDollars` conversion.

Pinned inputs (all literals in the file, lines 81–169):
currentAge 30, safeRetAge 65, safeLifeExp 90, returnRate 5, inflationRate 4, incomeGrowth 3,
currentIncome 100,000, filingStatus `"single"`, state TX/TX, bal 50k/25k/80k/10k,
contrib 10k/7k/4k/3,850, contribEnd 65 ×4, employerMatch flat 3 / 50 / 6,
**spouseIncome 0**, spouseIncomeGrowth 3, **isMarried false**, **spouseCurrentAge 18**,
ssClaimingAge 67, includeSS true, ssOverride null, spouseSsEstimate 0, **spouseClaimingAge 67**,
spouseBenefitBasis `"own"`, **pensionMonthly 0 / pensionStartAge 65 → engine gets `pension: 0, pensionStartAge: Infinity`**,
conversionBracketTarget 22, window = 66…72 (7 yrs), `useTable2: false`, `longevityHorizon = 65+130`,
livingExpenses null. **No spouse seed at all** (`buildRetirementPhase` receives no `spouseSeed`/`spouseRetirementAge`).

Locked values (`E`, exact): fedTax 10,123; fedEffRate 0.1175…; fedMarginal 0.22; ssAIME 12,977.73…; ssPIA 4,009.87…; ssMonthly 4,010; ssAnnual 48,120; retTrad401k/retTradGross 2,120,026; retRoth 659,072; retTaxable 836,477; retHSA 420,280; totalAtRet 4,035,855; spendableAtRet 3,763,788; effectiveExpenses 57,377; netPortfolioNeed 226,414.748…; withdrawalRate 5.6100813…; yearsSustained 21.6485293…; firstRMD 32,213; totalRMDs 79,341; rmdTaxBite 10,182; conversionWindowYrs 7; netConversionBenefit −70,844.

### GM-2 — `src/__tests__/golden-master-app-wiring.test.js` (mounts real App, **default state, zero setters fired**)
Mounts `App` with a mocked `HorizonShell` and reads `horizonProps`. **Fires no setters at all** — it is the App-level twin of GM-1 at the identical default state.

Locked: totalAtRet 4,035,855; spendableAtRet 3,763,788; effectiveExpenses 57,377; withdrawalRate 5.6100813 (6 dp); yearsSustained 21.6485293 (6 dp); isSustainable false; rmdView.firstRMDAmount 32,213; rmdView.householdTotalRMDs 79,341; rmdView.rmdTaxBite 10,182; conversionWindowYrs 7; netConversionBenefit −70,844; **rangeView.successPct 24**.
Plus `planHighlights`/`planView` block: today.expenses 57,377; today.ss 0; today.hasSS false; today.portfolioDraw == today.expenses; retirement.expenses 226,414.748 (6 dp); guaranteed.pct 21; guaranteed.hasSS false; startsAtAge 67; startsLabel "Social Security"; savingsCoverUntilStart true; dollarBasisApplicable true; dollarBasisOptions ["today","retirement"]; yearsToRetirement 35; retirementDuration 25; takeHomeIsHousehold false; planView.outlastsPlan false; depletionAge 87; yearsShortOfPlan 3.

### GM-3 — T-X.2, `buildTX2Household()` in `src/__tests__/spouse-household.test.js:496`
Setters fired (everything else = App default):
currentAge **50**, retirementAge **58**, returnRate **7**, inflationRate **2.5**,
isMarried **true**, spouseCurrentAge **40** (48 at primary's retirement),
**spouseRetirementAge 65 (EXPLICIT)** → 17-yr gap, filingStatus **mfj**, spouseIncome **90,000**,
spouseAccounts.trad401k bal **500,000** contrib **15,000**,
accounts trad401k **400,000** / roth **100,000** / taxable **150,000** (balHSA left at 10,000),
annualExpenses **95,000**, ssClaimingAge **67**, ssOverride **40,000**.
Left at default: **pensionMonthly 0**, retirementState **TX**, **spouseClaimingAge 67**, **spouseSsEstimate 0**, moneyEvents `[]`, conversionMode `"bracket"`/22, lifeExpect 90, contribEnd* 65, spouse Roth/Taxable/HSA all 0, hsaCoverageType `"self"`.

Locked (exact): totalAtRet 2,509,497; yearsSustained === Infinity; withdrawalRate 1.61144943… (8 dp); isSustainable true; depletionAge **null**; endVal 362,928,420; **firstRMD 0**; totalRMDs 1,138,926; rmdTaxBite 167,684; totalDrawTax 83,566; conversionCost 174,196; rmdTaxSaved 333,941; grossNetBenefit 159,745; netConversionBenefit 159,745; **totalSpouseSpillover 0**; **totalSpouseSpilloverTax 0**; **firstSpouseSpilloverAge null**; conversionWindowYrs 14; convPeakTarget 150,910; convSteadyTarget 110,856; effectiveExpenses 95,000; householdSS 40,000; rangeView.successPct **100**; rangeView.spouseGapCaveat undefined.

### GM-4 — T-X.3, `buildTX3Household()` in `src/__tests__/spouse-household.test.js:~740`
Setters fired: currentAge **50**, retirementAge **62**, isMarried **true**, spouseCurrentAge **45** (57 at primary's ret),
**spouseRetirementAge 65 (EXPLICIT)** → 8-yr gap, filingStatus **mfj**, spouseIncome **80,000**,
spouse trad401k bal **400,000** contrib **12,000**, accounts trad401k **1,400,000** / roth **80,000** / taxable **150,000**,
annualExpenses **140,000**, ssClaimingAge **67**, ssOverride **38,000**,
**pensionMonthly 3,000 / pensionStartAge 65** (after ret 62, before RMD 73), retirementState **CA**.
Left at default: returnRate 5, inflationRate 4, lifeExpect 90, **spouseClaimingAge 67**, **spouseSsEstimate 0**, moneyEvents `[]`, hsaCoverageType `"self"`, spouse Roth/Taxable/HSA 0, contribEnd* 65, conversionMode `"bracket"`/22.

Locked (exact): totalAtRet 4,429,144; withdrawalRate 3.33783481… (8 dp); isSustainable true; depletionAge **96**; effectiveExpenses 140,000; householdSS 38,000; conversionWindowYrs 10; netConversionBenefit 19,837; firstRMD 16,908; totalRMDs 133,413; rmdTaxBite 28,417; taxView.projectedRetBracket 0.12; ssView.wr70 1.42258528…; rangeView.successPct **60**.

**Scenario/what-if outputs locked by GM-1..GM-4: NONE.** All four lock base-plan headline numbers only. (`workLongerView`, `calcWhatIfScenario`, `calcOptimizedScenario`, `surplusApplySite` appear only in *qualitative* tests elsewhere in `spouse-household.test.js`.)
---

## 5. Candidate AUTO-path fixture (T-X.4) — measured numbers

Measured by an **independent probe** (`src/__tests__/zz-audit-tx4.test.js`, gitignored, deleted at end)
that mounts the real App with exactly the described setters and reads `horizonProps`.
**Every value below reproduces the parent's in-progress T-X.4 locks byte-for-byte** —
`totalAtRet 3,550,547`, `withdrawalRate 4.001334040532185`, `spillover 857,142/242,698/61`,
scenario `111/129/164` — so the fixture is reproducible and the locks are real.

Fixture: currentAge 48, retirementAge 57, returnRate 6.5, inflationRate 3, MFJ, married,
spouseCurrentAge 37, ssClaimingAge 62, spouseClaimingAge 70, spouseSsEstimate 24,000,
spouseIncome 48,000, spouse trad401k 1,600,000/10,000, primary trad401k 75,000 / roth 20,000 /
taxable 10,000, annualExpenses 140,000, **spouseRetirementAge never set**.
(Everything else App default: lifeExpect 90, pensionMonthly 0, retirementState TX, moneyEvents [],
balHSA 10,000, contribs 10k/7k/4k/3,850, contribEnd* 65, conversion bracket/22.)

### Resolution
| field | value |
|---|---|
| `whatIfSimInputs.spouseSeedInputs` | **non-null** (object exists) |
| `spouseSeedInputs.spouseRetirementAge` | **`null`** ✅ raw auto preserved |
| `spouseAccounts.spouseRetirementAge.value` (resolved) | **57** |
| `whatIfSimInputs.retPhaseBase.spouseRetirementAge` | **57** |

### Base-plan headline numbers
| field | value | degenerate? |
|---|---|---|
| totalAtRet | 3,550,547 | no |
| spendableAtRet | 3,170,054 | no |
| retVals | Trad 3,292,758 / Roth 122,712 / Taxable 69,348 / HSA 65,729 | no |
| effectiveExpenses | 140,000 | no (raw input echo — weak as a *derived* lock) |
| **withdrawalRate** | **4.001334040532185** | **KNIFE-EDGE — 0.03% above the 4% guideline** |
| yearsSustained | 46.45640512515648 | no |
| isSustainable | true | no |
| depletionAge (walk) | 104 | no |
| **endVal** | **0** | **DEGENERATE** |
| walk rows | 33 | no |
| **firstRMD** | **0** | **DEGENERATE** |
| totalRMDs (household) | 656,669 | no |
| rmdTaxBite | 75,881 | no |
| totalDrawTax | 804,133 | no |
| **rmdView.firstRMDAmount** | **null** | **DEGENERATE** |
| **rmdView.totalRMDs** (primary-only) | **0** | **DEGENERATE** |
| **rmdView.rows.length** | **0** | **DEGENERATE** (empty primary RMD table) |
| rmdView.householdTotalRMDs | 656,669 | no |
| conversionCost | 34,338 | no |
| **rmdTaxSaved** | **2,362** | **near-degenerate** (7% of conversionCost) |
| grossNetBenefit / netConversionBenefit | −31,976 / −31,976 | near-degenerate: ≈ −conversionCost |
| conversionWindowYrs | 15 | no |
| convPeakTarget / convSteadyTarget | 207,451 / 159,313 | no |
| householdSS | 42,528 | no |
| **totalSpouseSpillover** | **857,142** | no — strong |
| **totalSpouseSpilloverTax** | **242,698** | no — strong |
| **firstSpouseSpilloverAge** | **61** | no — strong |
| rangeView.successPct | **58** | no |
| rangeView.series.length | 33 | no |
| taxView.projectedRetBracket | **0.12** | **weak** — bottom MFJ rail, one-sided |
| ssView.wr70 | 2.5260683983649357 | no |
| **planView.outlastsPlan** | **true** | no |
| **planView.depletionAge** | **null** | **DEGENERATE** |
| **planView.yearsShortOfPlan** | **null** | **DEGENERATE** |
| planHighlights.guaranteed.pct | 23 | no |
| `netPortfolioNeed`, `ssAtRet` | **not horizonProps at all** — unlockable at App level (only `withdrawalRate`/`withdrawalView` exist) | n/a |

### Scenario outputs (`calcWhatIfScenario(bundle, {retirementAge})`)
| retAge | scenarioDepletionAge | scenarioTotalAtRet | totalSpouseSpillover |
|---|---|---|---|
| 58 | **111** | 3,796,555 | 793,729 |
| 60 | **129** | 4,338,937 | 4,338,937→ spillover 606,529 |
| 62 | **164** | 4,956,038 | 425,758 |

`calcWhatIfScenario` returns no `scenarioYearsSustained` (its keys are: chart, scenarioRetAge,
scenarioTotalAtRet, scenarioExpenses, scenarioYears, deltaYears, scenarioBalAt90,
scenarioDrawAtPlanAge, eventFundingShortfall, firstShortfallAge, eventRetirementDraw,
eventRetirementDrawTax, scenarioDepletionAge, totalSpouseSpillover).

`workLongerView.rows` (all three `sustainable:false` but `coversPlan:true`):
+1→retAge 58, portfolio 3,796,555 (Δ246,008), depletion 111, longevityΔ +7, ssAnnual 13,608, window 14
+3→retAge 60, portfolio 4,338,937 (Δ788,390), depletion 129, longevityΔ +25, ssAnnual 15,348, window 12
+5→retAge 62, portfolio 4,956,038 (Δ1,405,491), depletion 164, longevityΔ +60, ssAnnual 17,196, window 10

### Verdict on the candidate fixture

**Degenerate (zero / null) and therefore weak as locked values — 7 fields:**
`endVal 0`, `firstRMD 0`, `rmdView.firstRMDAmount null`, `rmdView.totalRMDs 0`,
`rmdView.rows [] `, `planView.depletionAge null`, `planView.yearsShortOfPlan null`.

Two structural notes on those:
- `firstRMD 0` + empty primary RMD table is the **same BUG-96 shape T-X.2 already has**. So T-X.4
  duplicates T-X.2's blind spot rather than complementing it: after adding T-X.4 there would still
  be only ONE fixture (T-X.3) with a real, non-empty *primary* RMD schedule.
- `endVal 0` is genuinely information-free as a lock: the far-horizon walk depletes, so `endVal`
  can only ever be 0 no matter how the model moves. T-X.2 locks `endVal 362,928,420` — a live value.

**Knife-edge, not degenerate but fragile — 1 field:**
`withdrawalRate 4.001334…` sits **0.033% above** `SAFE_WITHDRAWAL_GUIDELINE_PCT = 4`. Measured
`planDrivers[0]` for this fixture:
`{ id:"withdrawal", ok:false, withdrawalRatePct:4, guidelinePct:4, temporaryIncomeBasis:true, basisEndsAtAge:57 }`
— i.e. the app renders **"4% vs a 4% guideline" and marks it NOT ok**. Two consequences:
1. As a *tripwire* this is excellent (any model drift flips a user-visible verdict).
2. As a *stable lock* it is brittle, and the fixture bakes in a display state that reads as
   self-contradictory to a user (4 vs 4, failing). Nudging `annualExpenses` to ~135,000 or
   ~145,000 would move it clearly off the rail if a stable lock is wanted. **Flagging, not
   recommending a change** — you asked me not to alter the fixture.

**Weak but acceptable — 2 fields:** `taxView.projectedRetBracket 0.12` (bottom MFJ rail; can only
move upward, so a downward regression is invisible) and `rmdTaxSaved 2,362` /
`netConversionBenefit −31,976 ≈ −conversionCost` (the conversion arm is almost a pure cost
pass-through here, so the *savings* half of the benefit formula is barely exercised).

**Scenario locks:** `scenarioDepletionAge 111 / 129 / 164` are 21 / 39 / 74 years **past
lifeExpect 90**, deep in the `retAge+130` longevity tail. They will catch BUG-127/BUG-134-class
regressions (which is the point, and the spillover triple 793,729/606,529/425,758 carries most of
that signal robustly) — but the depletion ages themselves are far-tail integers with no user
meaning, so expect them to move on any unrelated tail-behaviour change. The **spillover** values
are the load-bearing scenario locks; the depletion ages are the fragile ones.

**Strong, non-degenerate, genuinely new coverage — the fixture's real value:**
`totalSpouseSpillover 857,142` / `Tax 242,698` / `firstAge 61` (the hold-out BINDS — no other
golden master has nonzero spillover: T-X.2 locks 0/0/null and T-X.3 doesn't assert it at all),
`totalDrawTax 804,133`, `rangeSuccessPct 58`, `householdSS 42,528`, `convPeakTarget 207,451`,
and the three scenario `totalSpouseSpillover` values.
---

## Sensitivity evidence (measured, from the T-X.4 base) — what each dimension is *worth*

Probe: `src/__tests__/zz-audit-sens.test.js` (gitignored). Each row perturbs ONE dimension off the
T-X.4 base and reports only the headline fields that moved. This is the evidence behind the
risk ranking in §3.

BASE: totalAtRet 3,550,547 · householdSS 42,528 · withdrawalRate 4.001334 · yearsSustained 46.4564 ·
depletionAge 104 · endVal 0 · totalRMDs 656,669 · rmdTaxBite 75,881 · totalDrawTax 804,133 ·
netConvBenefit −31,976 · convWindow 15 · convPeak 207,451 · spillover 857,142 / 242,698 / age 61 ·
successPct 58 · resolvedSpouseRetAge 57 · guaranteedPct 23 · wr70 2.526068 · projRetBracket 0.12

| perturbation | what moved |
|---|---|
| **spouseClaimingAge 70 → 67** | householdSS **42,528→36,768**, yearsSustained 46.5→42.9, depletionAge **104→100**, totalRMDs 656,669→574,185, rmdTaxBite 75,881→64,635, totalDrawTax →844,819, convPeak →212,347, spillover →903,644 / 254,640, **successPct 58→54**, guaranteedPct 23→20, wr70 →2.688 |
| **spouseClaimingAge 70 → 62** | householdSS **→29,568 (−30%)**, depletionAge **→97**, totalRMDs →475,860, rmdTaxBite →47,695, spillover →961,776, **successPct →48**, guaranteedPct →16 |
| **spouseSsEstimate 24,000 → 0** | householdSS →12,768, depletionAge →91, totalRMDs →246,447, rmdTaxBite →10,422, totalDrawTax →975,287, spillover →1,097,411, **successPct →36**, guaranteedPct →7, projRetBracket 0.12→0.10 |
| **spouseBenefitBasis own → spousal** | householdSS →21,887, depletionAge →94, successPct →43, guaranteedPct →12 |
| **spouse OLDER (spouseCurrentAge 37→55), auto** | totalAtRet →3,432,003, withdrawalRate 4.001→**5.322**, depletionAge →91, totalRMDs →1,058,998, **spillover → 0 / 0 / null**, netConvBenefit −31,976→**+50,278**, convPeak →**243,600**, successPct →36 |
| **spouse SAME AGE (37→48), auto** | withdrawalRate →5.145, depletionAge →93, **spillover → 0 / 0 / null**, netConvBenefit →**+24,045**, convPeak →**243,600**, successPct →41 |
| **EXPLICIT spouseRetirementAge = 57** | **byte-identical to the auto base** — every field |
| **EXPLICIT spouseRetirementAge = 65** | yearsSustained →54.69, depletionAge →112, totalRMDs →860,114, spillover →**1,881,656** / 470,885, successPct →65, projRetBracket 0.12→**0.22** |
| **retirementState TX → CA** | totalDrawTax **804,133 → 1,482,739 (+84%)**, rmdTaxBite →72,941, netConvBenefit →−48,675, spillover →1,041,314 / 393,575, successPct →42 |
| **pension 3,000/mo from 65** | yearsSustained →**Infinity**, depletionAge →**null**, endVal 0→**17,438,036**, totalRMDs →1,157,889, rmdTaxBite →220,785, successPct 58→**84**, guaranteedPct →49, wr70 →1.203, projRetBracket →**0.24** |
| **hsaCoverageType self → family** | no change (spouse HSA contrib is 0 here — dimension inert unless a spouse HSA contribution exists) |

### Three load-bearing conclusions

**(a) `spouseClaimingAge` is NOT inert — the T-X.4 fixture genuinely exercises it.** Moving it
70→67 shifts 8 headline numbers including `depletionAge` and `successPct`. **No existing golden
master varies it**: GM-1 hard-codes 67, GM-2/3/4 all leave it at the `SS_FRA = 67` default.
Outside the golden masters it appears only in `retirement-income.test.js` (pure-model unit test of
`calcRetirementIncome`) and `strategies-screen.test.js` (a screen prop bundle). **BUG-125 sits in a
cell no locked fixture covers today**, and T-X.4 would be the first to cover it.

**(b) The auto path is base-plan-indistinguishable from an equivalent explicit value.**
`EXPLICIT spouseRetirementAge = 57` is byte-identical to auto-resolving to 57 on every single
headline number. So an auto-path fixture that only locks base-plan numbers adds **zero** detection
power over T-X.2/T-X.3 — the auto path differs *only* where the two call sites resolve it
differently, which is exactly BUG-127/BUG-134. This independently confirms the fixture's design
constraint #1: **the scenario locks are the entire point; the base-plan block is scaffolding.**

**(c) Auto + older-or-same-age spouse is a genuinely different regime, and nothing covers it.**
Both collapse spillover to 0/0/null, flip `netConversionBenefit` from −31,976 to **positive**
(+50,278 / +24,045), and snap `convPeakTarget` to exactly **243,600** — the naive spouse-blind
MFJ-22% fill value that T-X.2's own comment calls out as the wrong answer. Under auto an older
spouse gets **no gap window at all**, so every gap-year mechanism (hold-out, spillover, gap income
offset, MAGI cutoff) silently switches off. No fixture, golden master or otherwise, exercises
"spouse older than primary".
---

## 2. COVERAGE MATRIX

Legend: **✓** = exercised at a non-default/meaningful value · **P** = pinned to one value (present but
never varied, so a bug on this axis moves nothing) · **✗** = never exercised · **–** = not applicable.

All cell values below were **measured by mounting each fixture** (`zz-audit-fixtures.test.js`), not
inferred from the source.

| # | Dimension | GM-1 `golden-master` | GM-2 `app-wiring` | GM-3 T-X.2 | GM-4 T-X.3 | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Filing status** | P `single` | P `single` | P `mfj` | P `mfj` | single+mfj only — **`hoh` / `mfs` / `qw` ✗** |
| 2 | **Spouse present** | ✗ absent | ✗ absent | ✓ present | ✓ present | covered both ways |
| 3 | **Spouse younger / older / same age** | – | – | ✓ younger (−10) | ✓ younger (−5) | **older ✗, same-age ✗** |
| 4 | **`spouseRetirementAge` explicit vs null-auto** | – | – | P explicit 65 | P explicit 65 | **auto/null ✗ — the BUG-127/134 axis** |
| 5 | **Spouse gap window length** | – | – | 17 yr | 8 yr | covered (2 lengths) |
| 6 | **`spouseCurrentAge`** | P 18 (default, inert) | P 18 (inert) | P 40 | P 45 | never varied within a fixture |
| 7 | **`spouseIncome`** | P 0 | P 0 | P 90,000 | P 80,000 | 0 and nonzero both present |
| 8 | **`spouseSsEstimate`** | P **0** | P **0** | P **0** | P **0** | **✗ ZERO IN ALL FOUR** — the entire spouse-SS path is inert |
| 9 | **`spouseClaimingAge` vs primary's** | P 67 = 67 | P 67 = 67 | P 67 = 67 | P 67 = 67 | **✗ NEVER DIFFERENT, and moot anyway (row 8)** |
| 10 | **`spouseBenefitBasis`** | P `"own"` | P `"own"` | P `"own"` | P `"own"` | **`"spousal"` ✗** |
| 11 | **Pension present** | ✗ 0 | ✗ 0 | ✗ 0 | ✓ 3,000/mo | one fixture only |
| 12 | **Pension start vs retirement** | – | – | – | ✓ after (65 > 62) | **before-retirement ✗** |
| 13 | **Pension start vs RMD age** | – | – | – | ✓ before (65 < 73) | **after-RMD-age ✗** |
| 14 | **`ssClaimingAge` vs retirement age** | P after (67>65) | P after (67>65) | P after (67>58) | P after (67>62) | **✗ ALL FOUR "after" — at/before never exercised** |
| 15 | ↳ consequence: `ssAtRet` / `guaranteed.hasSS` / `today.ss` | 0/false/0 | 0/false/0 | 0/false/0 | 0/false/0 | **the "SS already running at retirement" branch is dead in all four** |
| 16 | **`includeSS`** | P true | P true | P true | P true | **false ✗** |
| 17 | **`ssOverride`** | P null (computed) | P null | P 40,000 | P 38,000 | both paths present |
| 18 | **Conversion window open/closed** | P open (7) | P open (7) | P open (14) | P open (10) | **closed (0 yrs) ✗** |
| 19 | **`conversionMode`** | P `bracket` | P `bracket` | P `bracket` | P `bracket` | **`custom` ✗** |
| 20 | **`conversionTaxSource`** | P `converted` | P `converted` | P `converted` | P `converted` | **✗ (also BUG-37: model ignores it)** |
| 21 | **State tax zero/nonzero** | P TX (0%) | P TX (0%) | P TX (0%) | ✓ CA (nonzero) | one fixture only |
| 22 | **`stateRateOverride`** | P null | P null | P null | P null | **✗** |
| 23 | **Money events present** | ✗ `[]` | ✗ `[]` | ✗ `[]` | ✗ `[]` | **✗ IN ALL FOUR** |
| 24 | **Conversion events (working-year)** | ✗ `[]` | ✗ `[]` | ✗ `[]` | ✗ `[]` | **✗ IN ALL FOUR** |
| 25 | **Retirement age before/after RMD age** | P before (65<73) | P before | P before (58) | P before (62) | **after-RMD-age ✗** |
| 26 | **Already retired (`currentAge == retirementAge`)** | ✗ (30/65) | ✗ | ✗ (50/58) | ✗ (50/62) | **✗ IN ALL FOUR** |
| 27 | **Depleting vs never-depleting** | ✓ depletes @87 | ✓ depletes @87 | ✓ never (∞) | ✓ depletes @96 | covered both ways |
| 28 | **Spouse hold-out binding vs inert** | – | – | binding-but-unreached | binding-but-unreached | **binding-and-reached ✗** |
| 29 | **Spillover nonzero vs zero** | – 0 | – 0 | **0/0/null** | **0/0/null** (not even asserted) | **✗ NONZERO NEVER LOCKED** |
| 30 | **Primary RMD schedule non-empty** | ✓ 4 rows | ✓ 4 rows | ✗ 0 rows | ✓ 3 rows | covered |
| 31 | **`hsaCoverageType` self/family** | P self | P self | P self | P self | **`family` ✗** |
| 32 | **`spouseIsSoleBenef` / RMD Table 2** | P false | P false | P false | P false | **✗** |
| 33 | **`addlPreTaxBal`** | P 0 | P 0 | P 0 | P 0 | **✗** |
| 34 | **Healthcare (marketplace / Medicare)** | P false | P false | P false | P false | **✗** |
| 35 | **`incomeGrowthEndAge`** | P null | P null | P null | P null | **✗** |
| 36 | **`contribEnd*` ≠ retirement age** | P =65 | P =65 | P =65 (coupled) | P =65 (coupled) | **✗** |
| 37 | **Spouse Roth / Taxable / HSA balances** | – | – | P 0 | P 0 | **✗ (BUG-85's surface)** |
| 38 | **`livingExpenses` explicit vs derived** | P null (derived) | P null | P null | P null | **✗ — but `annualExpenses` is set in GM-3/4** |
| 39 | **`otherPreTaxDeduc`** | P 0 | P 0 | P 0 | P 0 | **✗** |
| 40 | **Employer match mode** | P `flat` 3% | P `flat` | P `flat` | P `flat` | **`formula` ✗** |
| 41 | **`committedPlan` set** | P null | P null | P null | P null | **✗ (0 test files reference it)** |
| 42 | **What-if / scenario outputs locked** | ✗ | ✗ | ✗ | ✗ | **✗ IN ALL FOUR — no golden master locks any scenario number** |
| 43 | **Optimized scenario / `calcOptimizedScenario`** | ✗ | ✗ | ✗ | ✗ | **✗** |
| 44 | **Lever preview / apply path** | ✗ | ✗ | ✗ | ✗ | **✗** |
| 45 | **Monte Carlo `successPct` locked** | – (model only) | ✓ 24 | ✓ 100 | ✓ 60 | covered (3 fixtures) |
| 46 | **Mounts real App (wiring)** | ✗ hand-built | ✓ | ✓ | ✓ | GM-1 is structurally wiring-blind |

### The single most important row

**Row 8 (`spouseSsEstimate = 0` in all four)** subsumes rows 9 and 10. Because every golden master
leaves the spouse's SS estimate at zero, `spouseSsBenefit` is identically 0, so `spouseClaimingAge`
and `spouseBenefitBasis` **cannot move any locked number at all** — they are not merely "pinned",
they are *multiplied by zero*. Any regression in `calcRetirementIncome`'s spouse-SS arm
(lines ~38–46 of `src/model/retirement-income.js`) is invisible to all four golden masters.

Measured proof: on the T-X.4 candidate (which does set `spouseSsEstimate = 24,000`),
setting it back to 0 moves `householdSS` 42,528→12,768, `depletionAge` 104→91, `successPct` 58→36.
On the golden masters that same input is already 0, so that whole lever is dead.
---

## 4. Weakened / under-committed assertions across the suite

Method: enumerated every `it(...)` block in all 64 non-probe test files and flagged the ones whose
**every** assertion is weak (`toBeGreaterThan(0)`, `toBeDefined()`, `not.toBeNull()`, `toBeTruthy()`,
`typeof`, `toBeLessThanOrEqual(100)`, …). 62 such tests. Most are legitimate (null-return contracts,
"renders without crashing"). The ones below are not.

### 4a. `.skip` / `.only` / `.todo` — **NONE.** Clean across all 64 files.

### 4b. Golden-master locks were NOT loosened
Checked `git log -p` on all three golden-master files for removed exact `toBe(...)` assertions.
Six were removed from `golden-master.test.js` historically:
`netConversionBenefit`, `netPortfolioNeed`, `yearsSustained`, `rmdTaxBite`, `rmd[0].rmd`, `totalRMDs`.
Verified each: three were *renamed field* migrations still asserted with exact `toBe`
(`retPhase.firstRMD` / `.totalRMDs` / `.rmdTaxBite` / `.grossNetBenefit`), and two
(`netPortfolioNeed`, `yearsSustained`) became irrational floats at BUG-91 and are now
`toBeCloseTo(…, 6)` / `(…, 8)` — an absolute tolerance of ±5e-7 on a 226,414-magnitude number
(≈2e-12 relative). **Not a weakening.** `golden-master-app-wiring.test.js` has never had a lock
removed. **No golden-master field that was once exact is now loose.**

### 4c. ⚠ Stale hard-coded IRS constants in test names AND assertions (CLAUDE.md Rule 1 violation)
Three tests in `src/model/__tests__/simulation.test.js` carry **2025** figures where
`src/config/irs-2026.js` now holds different 2026 values. Because two of them assert a **one-sided
`toBeLessThanOrEqual`**, they pass anyway — and would keep passing if the cap regressed to $1.

| test | test says | `irs-2026.js` actually says | assertion form |
|---|---|---|---|
| `simulation.test.js:204` "employee + employer combined is capped at LIMIT_415C_2026 (**$70,000**)" | 70,000 | **`LIMIT_415C_2026 = 72_000`** | `toBeLessThanOrEqual(70_000)` — one-sided, never pins |
| `simulation.test.js:223` "c401k is capped at LIMIT_415C_CATCHUP_2026 (**$77,500**)" | 77,500 | **`LIMIT_415C_CATCHUP_2026 = 80_000`** | `toBeLessThanOrEqual(77_500)` — one-sided, never pins |
| `simulation.test.js:181` "401k contribution increases by CATCHUP_401K_2026 (**$7,500**)" | 7,500 | **`CATCHUP_401K_2026 = 8_000`** | `toBe(7_500)` — exact, but measures the wrong thing (below) |

70,000 / 77,500 / 7,500 are precisely the **2025** 415(c) and catch-up figures. Neither name is
imported from the config; both are typed literals, which is exactly what Rule 1 forbids in `src/`.

The catch-up test is subtler and worse: it sets `contrib401k: 32_000`, so
age 49 → `min(32,000, 24,500) = 24,500` and age 50 → `min(32,000, 24,500+8,000=32,500) = 32,000`.
The measured delta is **32,000 − 24,500 = 7,500 — the user's own contribution binding, not the
catch-up amount at all.** If `CATCHUP_401K_2026` moved to 9,000 or 12,000 this test would still
read 7,500 and still pass. It does not test what its name says it tests.
(Rule 4 — "every contribution independently capped at its IRS limit" — is *not* left uncovered
overall: `irs-2026.test.js:90-93` locks the constants exactly, and the HSA family ceiling is
property-tested in `spouse-household.test.js`. It is specifically the 415(c) and catch-up
*simulation* behaviour that is only bounded one-sidedly against stale numbers.)

### 4d. Tests whose name promises more than the body checks
| location | name promises | body actually asserts |
|---|---|---|
| `simulation.test.js:26` | "401k employee deferral **never exceeds** elective limit" (an UPPER bound) | `row.c401k >= 0` and `maxDeferral > 0` — **lower** bounds only. Its own inline comment concedes *"the important thing is no crash."* Passes at $1,000,000/yr deferral. |
| `monte-carlo.test.js:116` | "the mean path shows the spouse Traditional bucket **growing during the gap** (hold-out, not pooled away)" | `bands.length > 0`, `successRate > 0`. Never inspects the spouse bucket or any growth. `stdDev: 0` makes the walk deterministic, so exact values *are* lockable here. |
| `flow-down.test.js:105` | "investment growth is positive **and not clamped**" | `fd.totalGrowth > 0` only — the "not clamped" half is unasserted. |
| `budget.test.js:80` | "**prioritizes** employer match gap **first**" | `alloc.extraMatch > 0` — existence, not priority/order. |
| `budget.test.js:102` | "fills Roth **after HSA**" | `alloc.extraRoth > 0` — existence, not order. |
| `budget.test.js:112` | "**overflow** goes to taxable" | `alloc.extraTaxable > 0` — existence, not overflow semantics. |
| `spouse-household.test.js:535` | (T-X.2) asserts the spillover note is absent | `expect(latest.spouseSpilloverNote ?? latest.planHighlights?.spouseSpilloverNote ?? null).toBeFalsy()` — the `??` chain makes this **vacuously true if the field is ever renamed or removed**. |

### 4e. The single highest-value loose assertion in the suite
**`src/__tests__/spouse-household.test.js:333-343`** — the regression test for **BUG-134**, a HIGH
severity bug caught by CodeRabbit at the last minute before merge:

```js
for (const retAge of [55, 58, 62]) {
  const scen = calcWhatIfScenario(bundle, { retirementAge: retAge });
  expect(scen).not.toBeNull();
  expect(scen.totalSpouseSpillover).toBeGreaterThan(0);   // ← only this
}
```

`docs/BUGS.md` records the exact post-fix values for this fixture: **982,500 / 1,120,964 / 926,336**
(against 0 / 0 / 0 pre-fix). Those three numbers are known, deterministic, and already written down
— but the test locks only `> 0`. A regression that collapsed the spillover from $982,500 to $1
would pass. Given that BUG-134 was itself a *regression introduced by BUG-127's own fix*, this is
the assertion most worth tightening in the whole suite.
The parent's new BUG-102 block repeats the same pattern at `spouse-household.test.js:1064`.

### 4f. Model quantities that are horizonProps-invisible
`netPortfolioNeed` and `ssAtRet` — both central to CLAUDE.md rules 2 and 5b — are **not exposed on
`horizonProps` at all** (only `withdrawalRate` / `withdrawalView` are). So `golden-master.test.js`
can lock `netPortfolioNeed` (it hand-builds it) but `golden-master-app-wiring.test.js`
**structurally cannot** — the one quantity whose App-level wiring bug the wiring file was created
to catch (its own header cites reverting `netPortfolioNeed` as the proof case) is only observable
*indirectly*, through `withdrawalRate`.
---

## 3. Uncovered cells, ranked by risk

"Risk" = measured headline movement when the dimension is exercised (from the sweeps above) ×
whether an OPEN bug already lives there. All movements are measured, not estimated.

### Tier 1 — huge headline movement, ZERO locked coverage

**R1. Retirement age AFTER RMD age (73) — and, inseparably, a CLOSED conversion window.**
All four fixtures retire at 65 / 65 / 58 / 62. Measured at `retirementAge = 75`:
`conversionWindowYrs 7 → 0`, `netConversionBenefit −70,844 → 0`, `firstRMD 32,213 → 169,921`
(5.3×), `totalRMDs 79,341 → 2,381,174` (**30×**), `rmdTaxBite 10,182 → 510,284` (50×),
`successPct 24 → 92`, `projectedRetBracket 0.12 → 0.24`.
This single cell simultaneously covers matrix rows 18 and 25. The whole `buildConversionByAge` /
`calcBracketFillTargets` / optimizer stack runs against an **empty** schedule and nothing locks
that. Also the only regime where the engine's RMD arm dominates rather than being drained away.

**R2. Already retired (`currentAge == retirementAge`).**
Measured at `currentAge = 65`: `totalAtRet 4,035,855 → 165,000`, `withdrawalRate 5.61% → **34.77%**`,
`yearsSustained 21.6 → 2.9`, `depletionAge 87 → 68`, `successPct 24 → 0`, `firstRMD/totalRMDs → 0`,
`totalDrawTax 434,207 → 0`. `yearsToRetForBasis = 0`, so `toRetirementYearDollars` becomes the
identity — the *entire* BUG-91 basis-conversion machinery collapses to a no-op and **nothing tests
that boundary**. This is also a real, common user (someone already retired opening the app).

**R3. Pension starting BEFORE retirement, and pension starting AFTER RMD age.**
GM-4 is the only pensioned fixture and its pension starts at 65, i.e. after retirement (62) and
before RMD (73) — one of three orderings.
Measured (pension 2,500/mo, no-spouse default, ret 65): start **62** → `yearsSustained 21.6 → 83.5`,
`totalRMDs → 1,590,353` (20×), `totalDrawTax 434,207 → 0`, `successPct 24 → 99`,
`projectedRetBracket 0.12 → 0.32`. Start **75** → `yearsSustained → 52.0`, `successPct → 87`.
CLAUDE.md rule 11 names pension double-gating as the exact bug found **three separate times in one
PR**; two of the three timing orderings are still unlocked.

### Tier 2 — large movement, ZERO locked coverage, and an OPEN bug sits in the cell

**R4. `spouseSsEstimate` = 0 in all four ⇒ the whole spouse-SS arm is multiplied by zero.**
**OPEN BUG-125 lives here.** Confirmed at `src/model/retirement-income.js:49`:
```js
const ssAtRet = includeSS && ssClaimingAge <= safeRetAge ? householdSS : 0;
```
`householdSS` already contains the spouse's benefit, but the only timing gate is the **primary's**
`ssClaimingAge`. In the T-X.4 candidate (primary claims 62, spouse claims 70, spouse is 11 years
younger) the spouse's benefit is switched on when the primary turns 62 — at which point **the
spouse is 51**, nineteen years before their own claim age.
Measured on T-X.4: `spouseSsEstimate 24,000 → 0` moves `householdSS 42,528 → 12,768`,
`depletionAge 104 → 91`, `totalRMDs 656,669 → 246,447`, `successPct 58 → 36`, `guaranteed.pct 23 → 7`.
`spouseClaimingAge 70 → 62` moves `householdSS → 29,568`, `depletionAge → 97`, `successPct → 48`.
**Explicit answer to the question asked: NO fixture — golden master or otherwise — varies
`spouseClaimingAge` independently of the primary's.** All four pin it to `SS_FRA = 67`, equal to the
primary's, and all four pin `spouseSsEstimate = 0`, which makes it moot even if it were varied.
Outside the golden masters it appears only in `retirement-income.test.js` (pure model unit tests of
`calcRetirementIncome`) and `strategies-screen.test.js` (a screen prop bundle). The candidate
T-X.4 would be the **first** App-level fixture to exercise it — and it does so meaningfully.
Also unexercised in the same arm: `spouseBenefitBasis = "spousal"` (measured: `householdSS
42,528 → 21,887`, `successPct 58 → 43`).

**R5. `ssClaimingAge` at-or-before retirement — the `ssAtRet ≠ 0` branch is dead in all four.**
Every fixture claims at 67 against retirement ages 65/65/58/62, so `ssAtRet` is 0, `today.ss` is 0,
and `guaranteed.hasSS` is `false` **everywhere**. `calcNetPortfolioNeed(retSpendBasis, ri.ssAtRet, …)`
is therefore always called with a zero SS term — CLAUDE.md rule 5's central quantity has its
non-trivial branch untested at the golden-master level.
Measured (default, ret 65): claim **62** → `withdrawalRate 5.610 → 4.775`, `householdSS 48,120 →
33,684`, `successPct 24 → 18`; claim **65** → `withdrawalRate → 4.576`, `successPct → 22`.

**R6. Money events present. OPEN BUG-99 lives here** ("money events still nominal against the
now-corrected retirement-year walk"). `moneyEvents = []` in all four.
Measured: 200k outflow at 70 → `depletionAge 87 → 86`, `totalRMDs 79,341 → 35,033`, `successPct 24 → 19`.
500k **taxable inflow** at 70 → `totalRMDs → 188,995` (**+138%**), `depletionAge → 90`, `successPct → 35`.
Duration outflow 3k/mo × 120mo from 66 → `successPct → 15`. BUG-99 is a units bug in exactly this
path and no locked value can see it.

**R7. Nonzero spouse spillover / the Option-A escape hatch actually firing.
OPEN BUG-103 lives here** ("Monte Carlo `successPct` counts spillover-rescued paths as plain
successes"). Measured across all four: `totalSpouseSpillover 0`, `Tax 0`, `firstAge null` — T-X.2
locks the zeros, T-X.3 doesn't assert them at all. The penalized-withdrawal arm of
`buildRetirementWalkByAccount` is **never exercised by any golden master**, so BUG-103's surface
has no baseline to regress against. The T-X.4 candidate (857,142 / 242,698 / 61) is the first.

**R8. Scenario / what-if outputs — no golden master locks a single one.
OPEN BUG-102 lives here** ("lever-preview's spouse-gap gating inherited from the base plan, not the
scenario's own re-seeded maps"), as does **BUG-36** and, historically, **BUG-127 and BUG-134** —
both HIGH, both found only by adversarial review. Measured proof that base-plan locks cannot cover
this: **explicit `spouseRetirementAge = 57` is byte-identical to auto-resolving to 57 on every
base-plan headline number.** The auto path and the explicit path differ *only* where two call sites
resolve it differently — i.e. exclusively on the scenario path. This is why the T-X.4 candidate's
scenario block (`111/129/164` + spillover `793,729/606,529/425,758`) is its load-bearing half.

### Tier 3 — real movement, no coverage, no open bug currently filed

**R9. Spouse OLDER or SAME AGE as the primary, under auto.** Measured: spillover → 0/0/null,
`netConversionBenefit −31,976 → **+50,278**` (sign flip), `convPeakTarget 207,451 → **243,600**`
(the naive spouse-blind MFJ-22% fill), `withdrawalRate 4.001 → 5.322`. Under auto an older spouse
gets **no gap window at all**, silently switching off the hold-out, the gap income offset, the MAGI
cutoff and the spillover hatch together. `spouseCurrentAge`'s bound was widened to allow this
household in BUG-95 — and then never tested.

**R10. Filing statuses `hoh` / `mfs`.** Measured on the default: `mfs` → `totalAtRet 4,035,855 →
3,514,683`, `withdrawalRate → 6.44`, `successPct 24 → 11`; `hoh` → `successPct 24 → 18`,
`totalRMDs → 49,208`. Also worth noting an interaction nothing covers: switching the **no-spouse**
default to `mfj` collapses `firstRMD 32,213 → 0` and `totalRMDs 79,341 → 0` outright.

**R11. `conversionMode = "custom"`.** Measured: `totalRMDs 79,341 → 239,457` (3×),
`netConversionBenefit −70,844 → −3,469`. All four fixtures use `"bracket"`.
(`conversionTaxSource` is row 20 — pinned, and currently inert anyway per open **BUG-37**.)

**R12. `includeSS = false`.** Measured: `depletionAge 87 → 82`, `successPct 24 → 7`,
`netConversionBenefit → −117,014`. Pinned `true` in all four.

**R13. Spouse Roth / Taxable / HSA balances — OPEN BUG-84 and BUG-85 both live here.**
Zero in both spouse fixtures, so the v1 "Traditional-only" scope limitation those two bugs describe
has no fixture that would notice when it is lifted. `hsaCoverageType = "family"` (row 31) is
coupled to this: measured as fully inert while spouse HSA contributions are 0.

**R14. State tax nonzero — thin, not absent.** Only GM-4 (CA). Measured impact is large
(`totalDrawTax 804,133 → 1,482,739`, **+84%**, on the T-X.4 base), so a single fixture carrying the
entire non-TX tax-table path is a thin margin for how much it moves.

### Open bugs that are NOT in an uncovered cell
BUG-100 (brackets not inflated) and BUG-101 (accumulation `contrib401k` nominal) are *baked into*
every golden-master value — they affect all four fixtures identically, so they are locked-in rather
than uncovered. Fixing either will move all four sets of numbers. BUG-113 / BUG-124 are UI-only
(contrast, basis-toggle wiring) and outside the golden masters' remit. BUG-38 / BUG-39 are
documented accepted simplifications.
