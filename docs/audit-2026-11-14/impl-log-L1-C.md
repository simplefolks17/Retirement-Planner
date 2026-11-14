# impl-log L1-C (BUG-155 + BUG-156) — agent in progress

Working in /home/user/Retirement-Planner on branch claude/oversight-root-cause-audit (the
harness-provided worktree was based on a stale commit lacking L1-A/L1-B, so the named repo was used as instructed).

- [start] reading plan, audit findings E/F, impl-log-L1-B.
- [analysis] Sites: calcAIME(min(y,cap)), projectedIncomeAtAge(min(age-cur-1,cap)), growthYears(min(y-1,cap)), clockYears(min(clock,cap)).
  calcAIME's loop index y is the count of raise steps before that year == sim (y_sim-1), so sites 1 and 2 only
  *look* off by one when compared at the same AGE; at the same raise-step count they are identical. Convention chosen:
  "raise steps elapsed before a year, capped at plateauAge - subjectCurrentAge, floored at 0" (the sim's existing one;
  salary at age a has min(a-cur-1, plateau-cur) raises). New pure module src/model/income-growth.js.
- [impl] added src/model/income-growth.js; 4 sites use it; otherEarnerGrowthEndAge param; App spouse sim + 3 coupling sites wired; next: tests
- [tests] src/__tests__/income-plateau.test.js (15 tests) pass with fixes; running revert-and-confirm
== M1: calcAIME site: restore unguarded formula
   × BUG-155: the SS earnings record and the salary table share one convention > calcAIME with a STALE plateau (before currentAge) equals the flat-salary AIME, not a discounted one 7ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
== M2: App setCurrentAgeCoupled: remove the plateau write
   × BUG-155 (App): the stored plateau follows current/retirement age > raising currentAge past a stored plateau re-clamps it and never discounts SS backward 146ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
== M3: App setRetirementAgeCoupled: remove the plateau write
   × BUG-155 (App): the stored plateau follows current/retirement age > lowering the retirement age to the plateau snaps it to null (no plateau) 64ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
== M4: commitPlan: remove the plateau write
   × BUG-155 (App): the stored plateau follows current/retirement age > commitPlan applies the same re-clamp (onboarding path) 65ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 14 passed (15)
== M5: spouse sim call: pass the primary's plateau unchanged as the spouse's own (original bug)
      Tests  15 passed (15)
== M6: simulation growthYears (other earner) unguarded + clockYears unclamped
      Tests  15 passed (15)
== restored
      Tests  15 passed (15)
 M docs/audit-2026-11-14/impl-log-L1-C.md
 M src/App.jsx
 M src/model/simulation.js
 M src/model/social-security.js
?? src/__tests__/income-plateau.test.js
?? src/model/income-growth.js
== M5 (spouse sim call reverted to pass primary-frame plateau as the spouse's own)
   × BUG-156 (App): the primary's plateau does not touch the spouse's own savings > household total at retirement is identical with and without the primary's plateau 276ms
     → expected 274560 to be 311036 // Object.is equality
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 274560 to be 311036 // Object.is equality
      Tests  1 failed | 14 passed (15)
== M6 (other-earner growthYears unguarded)
      Tests  15 passed (15)
== M6 (other-earner growthYears unguarded) re-run
      Tests  16 passed (16)
== M7 (subject clockYears floor removed)
      Tests  16 passed (16)
== M6 revert at the line
   × BUG-155: the other-earner term is guarded against a stale (past) plateau > a plateau before the subject's age does not shrink the other earner's income into the Roth phase-out gap 11ms
     → expected 2704 to be +0 // Object.is equality
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 2704 to be +0 // Object.is equality
      Tests  1 failed | 16 passed (17)
== M7 revert at the line
   × BUG-155: the other-earner term is guarded against a stale (past) plateau > the subject's own salary is flat (never discounted) under a stale plateau 17ms
     → expected [ 78353, 78353, 78353 ] to deeply equal [ 100000, 100000, 100000 ]
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [ 78353, 78353, 78353 ] to deeply equal [ 100000, 100000, 100000 ]
      Tests  1 failed | 16 passed (17)
- [done] docs added (FINANCIAL-MODEL, BUGS BUG-155/156, audit status lines). Gate next.
