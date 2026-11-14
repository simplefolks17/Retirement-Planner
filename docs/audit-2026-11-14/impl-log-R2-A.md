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

## BUG-170 (R-1) done
- App.jsx: Classic "Retirement Age" / "Life Expectancy" sliders now `onChange={setRetirementAgeCoupled}` / `{setLifeExpectCoupled}` (the same function objects Horizon's bundle exposes).
- Plateau made NON-destructive: state renamed `incomeGrowthEndAgeStored`; `incomeGrowthEndAge = clampIncomePlateauAge(stored, currentAge, retirementAge)` computed on READ and used by every consumer (bundle value, sims, spouse frame). setRetirementAgeCoupled / setCurrentAgeCoupled / commitPlan no longer write the plateau. Bundle's own setter still writes stored (>= retirement => null, unchanged).
- Spouse retirement overwrite in setLifeExpectCoupled REMOVED (small): every consumer already reads via resolveSpouseRetAge, which clamps to [spouseCurrentAge+1, lifeExpect-1], so the stored explicit age is kept and returns when the horizon is raised.
- Tests: new src/__tests__/classic-horizon-parity.test.js (real App; Classic driven via the rendered Slider onChange, then back to Horizon): plateau 55 + retire 65->50->65 identical and plateau stays 55; mid-state in range; spouse 85 + life 90->80->95 identical and 85 restored; age-72-then-Classic-retire-75 keeps ends 75; Classic sliders' onChange === Horizon bundle setters (identity). bounds-invariant SEQS +2.
- Revert-and-confirm: (A) Classic Retirement slider back to inline contribEnd copy -> 2 fail (age-then-retire, identity). (B) Classic Life Expectancy back to inline copy -> identity test fails (behaviour coincides after the non-destructive change, so the sharing is pinned structurally; this is why). (C) destructive plateau write re-added in setRetirementAgeCoupled -> plateau test fails. (D) spouse overwrite re-added in setLifeExpectCoupled -> spouse test fails. All restored.
- Note: the effective-plateau read means the model sees the plateau only when it is inside [currentAge+1, retirementAge); with BUG-155's coupling gone from the setters the clamp is the single place that rule lives.

## BUG-171 (R-5) done
- accumulation.js allocateSavedTotal: largest-remainder rounding (floors + leftover units to biggest fractional parts); primaryNow sums max(0,bal). Never negative, exact sum.
- formatters.js new `parseAmountInput` (k/M suffix, decimals, $ and separators; null on junk); HorizonShell ObInput uses it, unparseable keeps the previous answer.
- Tests: accumulation.test.js (review repro 4x$1000 -> $2, many shapes, mix within $1), formatters.test.js (parse table), onboarding-wizard-save.test.js (typed "250k", "1.5M", "$900,000.75", "lots" through the real input).
- Revert-and-confirm: parse line back to `parseInt(draft.replace(/[^0-9]/g,""))` -> 3 wizard tests fail; allocate back to round-each+residual -> 2 unit tests fail (review repro and shapes). Restored.
