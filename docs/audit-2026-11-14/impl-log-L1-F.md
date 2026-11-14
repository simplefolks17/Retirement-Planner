# L1-F implementation log
- [start] read plan/audit/probes. Running sweep probe against current HEAD to get current DEAD? list
- [input-propagation.test.js] written: 81 tests pass (~9.8s). Self-check: renaming the savingsSurplusPct ALLOW key -> fails w/ 'moved no headline output ... DEAD CONTROL' msg and stale-entry check. Notes: spouse formula rate/cap need spouse 401k contrib>0 to matter (targeted setup); retirementTarget has NO Horizon consumer (Classic milestones only) - proof uses calcMilestones; conversionTaxSource does move conversionView.tables.simYears (BUG-37 only affects headline).
- [bounds-invariant.test.js] written: 29 tests, ~2.5s. 26 scripted user move sequences (the probe's 13 + up/down age moves, plateau-then-age, commitPlan with/without totalSaved incl. 0 and 2.5M, spouse ages, pension, SS override, HSA switch single+married, work/retirement state). Only exemption: livingExpenses in the income-drop sequence (owner-accepted), matched on sequence AND path, plus a test that fails if the exemption becomes stale.
  Sanity revert: deleted the `setSsClaimingAge(st.ssClaimingAge)` line in commitPlan (App.jsx) -> 2 failed ("ss.ssClaimingAge=67 < min 70" for commitPlan(72,75) with and without totalSaved); restored (git status clean for App.jsx).
- [input-wiring.test.js] 6 blocks / 7 tests: other pre-tax deductions, spouse income growth -> primary sim (Roth phase-out via household MAGI), addlPreTaxBal, RMD joint-life table (+ no-effect at <=10y gap), work state -> working-year conversion event tax, primary HSA family limit.
- [mutation re-runs] Script: scratchpad mutate2.py (adapted from probes/mutate.py.txt; line-targeted because two mutation patterns, spouseIncomeGrowth and stateRate, now occur 2-3x in App.jsx; the other 5 patterns still match once). For each mutation: full suite with the 3 new files EXCLUDED ("BEFORE"), then full suite ("AFTER"); file restored from memory after each (git status clean for src/ afterwards).
  The "Failed Tests N" figure is vitest's failed-test count.
## work-state tax lookup (tax-basis.js:42)
  BEFORE (existing suite, new guard files excluded): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-wiring.test.js', ' src/__tests__/retirement-state-wiring.test.js', ' src/model/__tests__/tax-basis.test.js']
## other pre-tax deductions (tax-basis.js:35)
  BEFORE (existing suite, new guard files excluded): Tests  1477 passed (1477)
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-propagation.test.js', ' src/__tests__/input-wiring.test.js']
## spouse income growth -> primary sim (App.jsx:325)
  BEFORE (existing suite, new guard files excluded): Tests  1477 passed (1477)
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-wiring.test.js']
## extra pre-tax balance addlPreTaxBal (App.jsx:511)
  BEFORE (existing suite, new guard files excluded): Tests  1477 passed (1477)
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-propagation.test.js', ' src/__tests__/input-wiring.test.js']
## RMD joint-life table useTable2 (App.jsx:672)
  BEFORE (existing suite, new guard files excluded): Tests  1477 passed (1477)
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-propagation.test.js', ' src/__tests__/input-wiring.test.js']
## work state -> working-year conversion events (App.jsx:331)
  BEFORE (existing suite, new guard files excluded): Tests  1477 passed (1477)
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-wiring.test.js']
## primary HSA family limit (App.jsx:319)
  BEFORE (existing suite, new guard files excluded): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
  AFTER  (full suite): ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
  failing files after: [' src/__tests__/input-wiring.test.js', ' src/__tests__/setter-bundles.test.js']

  Summary (mutation -> before new guards / after new guards):
  - work-state tax lookup (tax-basis.js:42): 2 failing (already covered by L1-A's retirement-state-wiring + tax-basis tests) / 3 failing (input-wiring's CA-vs-TX conversion-event test also fails)
  - other pre-tax deductions (tax-basis.js:35): 0 -> 2 failing (input-wiring + input-propagation: otherPreTaxDeduc becomes a dead field)
  - spouse income growth -> primary sim (App.jsx:325): 0 -> 1 failing (input-wiring)
  - extra pre-tax balance (App.jsx:511): 0 -> 2 failing (input-wiring + input-propagation)
  - RMD joint-life table useTable2 (App.jsx:672): 0 -> 2 failing (input-wiring + input-propagation: spouseIsSoleBenef goes dead)
  - work state -> working-year conversion events (App.jsx:331): 0 -> 1 failing (input-wiring)
  - primary HSA family limit (App.jsx:319): 1 (setter-bundles, as the audit found) -> 2 (adds input-wiring)
- [gate] npm test 1594 green (1477 + 117: 81 propagation, 29 bounds, 7 wiring), lint clean, build OK; no golden master moved (tests only). Real production defects exposed: none. Observation: Horizon shows 'Portfolio target' control (MyDetailsScreen) whose only consumer is Classic's calcMilestones; no Horizon prop reads it (allow-listed, proof via calcMilestones).
