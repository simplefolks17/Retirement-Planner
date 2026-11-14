# impl-log R2-A (BUG-167..172)
- started 2026-11-14T18:14:28Z

## BUG-167 (R-4) done
- HorizonShell.jsx: Q5 seed `statementView.monthlyTotal` -> `monthlyTodaysExp`; handleSave sends `monthlySpend` only if it differs from the seed.
- Tests (onboarding-wizard-save.test.js, real wizard): seed is today's-dollar; untouched completion leaves effectiveExpenses/yearsSustained/withdrawalRate unchanged; untouched keeps annualExpenses auto (follows income); changed answer = (seed+500)*12.
- Revert A (seed back to monthlyTotal): 2 fail (seed test, changed-answer test). Revert B (`...(changed? {monthlySpend}:{})` -> `monthlySpend: vals.monthlySpend,`): 2 fail (untouched-unchanged, stays-auto). Both restored, 5/5 pass.
