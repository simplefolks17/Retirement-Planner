# impl-log R2-A (BUG-167..172)
- started 2026-11-14T18:14:28Z

## BUG-167 (R-4) done
- HorizonShell.jsx: Q5 seed `statementView.monthlyTotal` -> `monthlyTodaysExp`; handleSave sends `monthlySpend` only if it differs from the seed.
- Tests (onboarding-wizard-save.test.js, real wizard): seed is today's-dollar; untouched completion leaves effectiveExpenses/yearsSustained/withdrawalRate unchanged; untouched keeps annualExpenses auto (follows income); changed answer = (seed+500)*12.
- Revert A (seed back to monthlyTotal): 2 fail (seed test, changed-answer test). Revert B (`...(changed? {monthlySpend}:{})` -> `monthlySpend: vals.monthlySpend,`): 2 fail (untouched-unchanged, stays-auto). Both restored, 5/5 pass.

## BUG-168 (R-10) + BUG-169 (R-3) done
- simulation.js `coupleContribEndAges(ends, base, scenario, currentAge=null)`: when base retirement == currentAge, `contribEnd == base+1` (the lifted state coupleCurrentAge produces) also tracks; new end = max(scenario, currentAge+1). Optional arg: omitted = original rule. what-if.js passes `simInputs.currentAge`; setRetirementAgeCoupled passes `currentAge`.
- App.jsx commitPlan: retirement age bounded to [newCur, max(lifeExpect,newCur+1)-1] (BUG-169), coupled FIRST against original state, THEN coupleCurrentAge (BUG-168). Plateau clamp now runs on the final st.
- Tests: onboarding-coupling-wiring: BUG-153 equality test REPLACED with order-independence (onboarding / age-then-retire / retire-then-age all [75,75,75,75], ss 70, identical totalAtRet/yearsSustained; comment explains old [73,73,73,73] baseline was wrong); (70,60), (34,90), ra-only lower bound; bounds-invariant SEQS +2; whatif-parity-wiring unit test for the new rule.
- Revert-and-confirm (each fails exactly the named test, all restored):
  - simulation.js `const liftedTracking = ...` -> `= false`: order-independence test fails.
  - App.jsx setRetirementAgeCoupled `, retirementAge, v, currentAge)` -> `, retirementAge, v)`: order-independence fails.
  - commitPlan order swapped (age coupled first): order-independence fails.
  - clamp `Math.min(Math.max(ra,newCur), lifeAfter-1)` -> removed: (34,90) test + SEQS(34,90) fail. Lower-bound only removed (`Math.min(ra, lifeAfter-1)`): ra-only test fails. NOTE (70,60) alone is NOT caught by the lower bound because coupleCurrentAge also lifts retirement to the age; the ra-only test covers the lower bound's own job.
