# impl-log R4-A

- Started batch R4-A (BUG-186..189). Branch claude/oversight-root-cause-audit.
- BUG-186: wrote 2 tests in roth-phaseout-indexing.test.js (MFS MAGI 10,200 yr2 -> Roth 0; MFS constant MAGI 9,000 -> 750 every year). Pre-fix run: test1 FAILS (yr2 cRoth=144), test2 FAILS (yr2 = 1010 under indexed 10,400 end). Real bug confirmed. Note: MFS band starts at 0 so MAGI 9,000 is NOT full contribution (test assumption corrected). Note: 'just under 10,000' (e.g. 9,999) gives a $1 contribution by the existing phase-out formula; test uses 10,200 to hit the bug's indexed band.
- BUG-186 FIX applied (simulation.js ~272: mfs uses unindexed ROTH_PHASEOUT_2026.mfs). Revert-check: fix line removed -> both new tests FAIL (2 failed/7 passed); fix restored -> 9/9 pass.
- BUG-186 BUGS.md Resolved entry added.
