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
