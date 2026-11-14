# impl-log L1-E (BUG-159)
## Step 1 — code
- `indexedRothPhaseout(po, inflationRate, yearsAfterBase)` pure helper in `src/model/simulation.js`; `runSimulation` gets `inflationRate = 0`; cRoth block uses `indexedRothPhaseout(..., y - 1)`.
- Convention: sim year y=1 (first contribution year, age currentAge+1) is the "2026" year -> unindexed; year y uses (1+i)^(y-1).
- Callers (`grep -rn "runSimulation(" src`): App.jsx primary sim (passes inflationRate, memo dep added); spouse-sim.js `runSpouseSim` -> via `buildSpouseSimInput` (new `inflationRate` param, forwarded into the input; App passes it, dep added); what-if.js:463 + :716 resim sites spread `scenarioSpouseAwareInputs().primaryInputs` = `coupleContribEndAges(simInputs…)`, so `whatIfSimInputs` now carries `inflationRate` (App); the scenario spouse re-sim (what-if.js:55) passes `simInputs.inflationRate ?? 0`. Other callers are tests (hand-built, default 0).
- Also `budget.js`/`tax-basis.js` read ROTH_PHASEOUT_2026 for the CURRENT year: correct unindexed.
- Suite after code only: 2 failures, both golden-master-app-wiring (expected: totalAtRet 4035855 -> 4178538 UP; depletion 87 -> 88). golden-master.test.js (hand-built, inflation default 0) and spouse-household unmoved.

## Step 2 — golden masters (measured directly via a throwaway App probe + hand-built run; both agree)
default: retRoth 659,072 -> 801,755; totalAtRet 4,035,855 -> 4,178,538 (+142,683, Roth only; trad/taxable/HSA identical); spendableAtRet 3,763,788 -> 3,906,471; withdrawalRate 5.610081 -> 5.418516; yearsSustained 21.6485 -> 22.6424; rangeSuccessPct 24 -> 29; depletionAge 87 -> 88; yearsShortOfPlan 3 -> 2. All UP/DOWN as expected (bigger seed).
Unmoved: firstRMD 32,213; totalRMDs 79,341; rmdTaxBite 10,182; conversionWindowYrs 7; netConversionBenefit -70,844. T-X.2/3/4 unmoved (App-mounted, MFJ incomes never in the 242k+ band). golden-master.test.js (hand-built) now passes `inflationRate` so it mirrors App; otherwise the cross-check file would diverge.

## Step 3 — tests + revert-and-confirm (all outputs observed)
New: model/__tests__/roth-phaseout-indexing.test.js (7), __tests__/roth-phaseout-wiring.test.js (6).
- Revert cRoth indexing: 12 failed | 12 passed (4 model, 5 golden-master, 3 wiring).
- Revert App primary sim `inflationRate`: 3 failed. Revert `whatIfSimInputs.inflationRate`: 2 failed. Revert spouse builder: 1 failed. Revert what-if spouse re-sim: 1 failed. All restored; 6/6 + 7/7 pass.
- Full: npm test 1477 passed; lint clean; build OK.
BUGS.md BUG-159 Resolved entry + BUG-100 addendum + FINANCIAL-MODEL.md Known Simplifications row written.
