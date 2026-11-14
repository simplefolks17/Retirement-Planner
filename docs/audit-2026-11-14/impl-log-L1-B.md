# L1-B implementation log

(started; appended incrementally)
- BUG-160: removed livingExpenseGrowth state/bundle field/Classic slider/Horizon field/fake-bundle entry; docs ARCHITECTURE+ROADMAP lists updated
- BUG-161: setHsaCoverageCoupled (clamps primary + spouse stored HSA contrib to the new ceiling); spouse HSA bundle max now primaryHsaLimit (self: 4400)
- BUG-153: new pure coupleCurrentAge (simulation.js) used by setCurrentAgeCoupled AND commitPlan (final coupled state computed once, no stale-closure chain)
- BUG-152: new pure allocateSavedTotal (accumulation.js); commitPlan takes totalSaved; HorizonShell handleSave passes it
== M152 reverted fix
   × BUG-152: onboarding's total-saved answer reaches the model > scales the primary's balances proportionally to the answered household total 87ms
   × BUG-152: onboarding's total-saved answer reaches the model > keeps the spouse's balances and scales only the primary's share 54ms
   × BUG-152: onboarding's total-saved answer reaches the model > clamps at 0 when the answer is below the spouse's balances 38ms
   × BUG-152: onboarding's total-saved answer reaches the model > puts the whole amount in taxable when the primary holds nothing 59ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed | 6 passed (10)
== M153 reverted fix
   × BUG-153: commitPlan uses the coupled age rules > leaves every bundle field within its own min/max 21ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
== M160 reverted fix
   × BUG-160: no dead 'living expense growth' control > the spending bundle no longer carries it 25ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 9 passed (10)
== M161 reverted fix
   × BUG-161: switching HSA coverage to self-only clamps stored contributions > family 8000 -> self leaves the primary field at the self-only limit 78ms
   × BUG-161: switching HSA coverage to self-only clamps stored contributions > clamps the spouse's stored HSA contribution too, and never raises on a switch to family 101ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 8 passed (10)
== restored fix
      Tests  10 passed (10)
== M153 (re-run, fixed equality test)
   × BUG-153: commitPlan uses the coupled age rules > leaves every bundle field within its own min/max 22ms
   × BUG-153: commitPlan uses the coupled age rules > matches the same values entered through the normal coupled setters 48ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 8 passed (10)
      Tests  10 passed (10)
== M162 reverted (original panel)
   × WhatIfPanel age inputs follow the live bounds (BUG-162) > an untouched purchase age follows a changed current age 24ms
   × WhatIfPanel age inputs follow the live bounds (BUG-162) > an untouched sustain-to age follows a changed plan-to age 3ms
   × WhatIfPanel age inputs follow the live bounds (BUG-162) > a user-typed purchase age is clamped to the new current age 6ms
   × WhatIfPanel age inputs follow the live bounds (BUG-162) > a user-typed sustain-to age is clamped to the retirement age 3ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed (4)
== restored
      Tests  4 passed (4)
- BUG-162: WhatIfPanel ages = user value|null, clamped at use; test whatif-panel-ages.test.js (4); revert output above
- BUGS.md entries 152/153/160/161/162 added; ARCHITECTURE commitPlan row updated
- gate: npm test 1427 passed (1413 + 14), lint clean, build OK; no golden master moved
