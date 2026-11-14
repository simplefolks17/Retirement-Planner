# impl-log L1-C (BUG-155 + BUG-156) — agent in progress

Working in /home/user/Retirement-Planner on branch claude/oversight-root-cause-audit (the
harness-provided worktree was based on a stale commit lacking L1-A/L1-B, so the named repo was used as instructed).

- [start] reading plan, audit findings E/F, impl-log-L1-B.
- [analysis] Sites: calcAIME(min(y,cap)), projectedIncomeAtAge(min(age-cur-1,cap)), growthYears(min(y-1,cap)), clockYears(min(clock,cap)).
  calcAIME's loop index y is the count of raise steps before that year == sim (y_sim-1), so sites 1 and 2 only
  *look* off by one when compared at the same AGE; at the same raise-step count they are identical. Convention chosen:
  "raise steps elapsed before a year, capped at plateauAge - subjectCurrentAge, floored at 0" (the sim's existing one;
  salary at age a has min(a-cur-1, plateau-cur) raises). New pure module src/model/income-growth.js.
