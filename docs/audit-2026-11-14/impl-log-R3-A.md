# impl-log R3-A (BUG-178..182)
- started 2026-11-14T19:48:32Z

## BUG-178 (S-5) done
- Chose: commit the shown monthlySpend when spend, income or age changed (untouched wizard still auto). Re-seed rejected: needs the model's tax/contrib pipeline per income value (rule 10).
- Label -> Monthly spending. Tests: 2 new in onboarding-wizard-save (income 200k / 60k).
- Revert (condition + label removed): 2 fail; restored: 11/11 pass.

## BUG-179 (S-1) done
- what-if.js: new exported `scenarioResolvedInputs(simInputs, scenarioRetAge)` = clamp stored plateau against the SCENARIO age (+ BUG-181's conversion-event filter). Used in `scenarioSpouseAwareInputs` (primary inputs AND the spouse re-sim's incomeGrowthEndAge), `scenarioSocialSecurity`, `calcWorkLongerBreakEven.ssAt`, `eventIncomeImpact` (base age).
- App.jsx: `whatIfSimInputs.incomeGrowthEndAge` and `whatIfBundle.ssInputs.incomeGrowthEndAge` now carry the STORED plateau.
- Tests (whatif-parity-wiring.test.js, "BUG-179"): 56/55->60 and 45/44->49 preview==commit totalAtRet (with a no-plateau precondition); 45/44->49 scenarioYears (spend 28k so SS matters; depletes after 67); work-longer row portfolio + SS == commit.
- Revert-and-confirm (each single-site, restored after): resolved-inputs plateau clamp -> 3 fail; App sim stored->effective -> 3 fail; scenarioSocialSecurity clamp -> scenarioYears test fails (first attempt at spend 150k did NOT catch it, plan depleted before claim age; fixture changed); ssAt clamp -> work-longer test fails; App ssInputs stored->effective -> work-longer test fails.
- Not mutation-tested: the `eventIncomeImpact` resolve (inert unless stored plateau < currentAge+1; no fixture).

## BUG-181 (S-6) done (committed together with BUG-179: both edit the same `scenarioResolvedInputs` helper)
- App.jsx: new memo `scenarioConversionEvents` (toggle + amount>0, NOT age-filtered) feeds `whatIfSimInputs.conversionEvents`; `activeConversionEvents` (age-filtered, base age) still feeds the committed plan. what-if.js `scenarioResolvedInputs` re-applies BUG-175's `conversionEventOutsideWorkingYears` at the scenario age.
- Tests (whatif-parity-wiring "BUG-181", review repro $500k trad, event $100k @60, retire 65->58): precondition notModelled at base 58; preview(63) == commit(63) totalAtRet (and differs from toggle-off, non-vacuous); reverse (base 65, preview 58); work-longer row == commit.
- Revert-and-confirm: App passes `activeConversionEvents` again -> 2 fail (preview==commit, work-longer row). what-if.js filter removed: 0 fail, and that is genuinely equivalent for the outputs (an event at an age past the scenario's retirement row is never read from the sim at the retirement-age row); the filter is defence in depth, App's unfiltered list is the load-bearing site.
