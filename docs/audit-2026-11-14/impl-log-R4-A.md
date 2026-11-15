# impl-log R4-A

- Started batch R4-A (BUG-186..189). Branch claude/oversight-root-cause-audit.
- BUG-186: wrote 2 tests in roth-phaseout-indexing.test.js (MFS MAGI 10,200 yr2 -> Roth 0; MFS constant MAGI 9,000 -> 750 every year). Pre-fix run: test1 FAILS (yr2 cRoth=144), test2 FAILS (yr2 = 1010 under indexed 10,400 end). Real bug confirmed. Note: MFS band starts at 0 so MAGI 9,000 is NOT full contribution (test assumption corrected). Note: 'just under 10,000' (e.g. 9,999) gives a $1 contribution by the existing phase-out formula; test uses 10,200 to hit the bug's indexed band.
- BUG-186 FIX applied (simulation.js ~272: mfs uses unindexed ROTH_PHASEOUT_2026.mfs). Revert-check: fix line removed -> both new tests FAIL (2 failed/7 passed); fix restored -> 9/9 pass.
- BUG-186 BUGS.md Resolved entry added.
- COMMIT BUG-186 done (9453e60). npm test 1718 green, lint 0, build 0.
- BUG-187 verified REAL by reading: runSimulation defaults otherEarnerGrowthEndAge to incomeGrowthEndAge when undefined; App.jsx primary sim (~352) and both what-if primary resims (what-if.js ~497 calcWhatIfDelta, ~828 calcWhatIfScenario) passed no value. spouse-sim.js passes its own explicit value (untouched).
- BUG-187 tests: src/__tests__/other-earner-plateau-wiring.test.js (4). Model: explicit null == no-plateau run (toEqual); omitted default DOES change cRoth (non-vacuous). App: pass-through spy on runSimulation records primary calls; calls cleared after mount (model tests also hit the spy).
- Pre-fix: App primary test FAILS "expected undefined to be null"; what-if test FAILS same.
- Fix: App.jsx primary runSimulation + what-if.js 2 resim sites: `otherEarnerGrowthEndAge: null`.
- Revert-and-confirm: App line removed -> App primary test FAILS (1 failed/3 passed). what-if site 1 (calcWhatIfDelta, 6-space line) removed -> what-if test FAILS (1 failed). what-if site 2 (calcWhatIfScenario, 8-space line) removed -> primary test AND what-if test FAIL. Restored -> 4/4 pass; grep BUG-187 count back to 2 in what-if.js.
- BUG-187 BUGS.md entry added; gate npm test 1722 green / lint 0 / build 0.
- BUG-188 verified REAL: anchor years = headline + delta unclamped. Pre-fix test FAILS ('expected -5 to be +0'). Fix: years = Math.max(0, ...); when clamped, deltaYears restated = years - headline.years (so headline+delta == shown years; WhatIfPanel's DeltaChip reads deltaYears). Revert check: clamp line removed -> FAIL; restored -> 2/2 pass.
- BUG-189 convention (read from code): retirement-engine.js walk runs age = startAge+1 ..; on depletion depletionAge = age and yearsSustained = (age - startAge - 1) + frac (frac in [0,1)). So integer depletion age for fractional years Y is startAge + floor(Y) + 1. CodeRabbit's form matches. Edge: frac==1 (pool emptied exactly, fully funded) gives integer Y = age-startAge, ambiguous with frac->0 at age+1; floor+1 is the correct reading for every non-integer Y (common case).
- BUG-188 intermediate commit: what-if.js = HEAD + clamp only; test file = 188 block only. BUGS.md BUG-188 entry added.
- BUG-189 fix committed next; BUGS.md BUG-189 entry added.
- BUG-189 verified REAL (engine convention above). Test anchor-duration-clamp.test.js: pre-fix FAIL `expected 75 to be 76`; fix `scenarioRetAge + Math.floor(years) + 1`; revert -> 1 failed; restored -> 3/3.
- Full npm test then found ONE existing test (display-consistency-r2b.test.js, BUG-176 block, "finite delta rides on the headline") that locked the old rounding: retire 57, 15 yrs expected 72. Under the engine convention it is 73. Updated that one expectation with a BUG-189 comment (not a golden master; no golden-master value moved).
