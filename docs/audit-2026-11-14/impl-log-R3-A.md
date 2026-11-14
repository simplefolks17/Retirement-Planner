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

## BUG-180 (S-2) done
- Chose the documented "not comparable" state over routing through calcWhatIfScenario (Classic's delta mode is the BUG-36 blended walk; porting is BUG-36's job). `anchorWhatIfToHeadline` returns `{comparable:false, scenarioYears:null, scenarioDepletionAge:null, deltaYears: finite|null}` when delta is -Infinity or headline is Infinity and delta<0; otherwise `comparable:true` and old results unchanged. WhatIfPanel `YearsSustainedLabel(null)` renders "Weaker than your plan (no comparable age)". App's surplus preview already treats null years as "—" (apply-preview handles `years == null`).
- Tests: 3 unit (display-consistency-r2b) + 1 Classic render (the review's younger-spouse household, spend $30k, "Retire 2 years early": contains "Sustainable indefinitely", no "lasts to age N", has the weaker label).
- Revert-and-confirm: old fallback branch restored -> 3 fail (2 unit + Classic); WhatIfPanel null branch disabled -> Classic render test fails; restored 15/15.

## BUG-182 (S-4) done
- Model: `primaryHsaCeilingForSurplus(coverage, spouseEffectiveHSA)` (spouse-sim.js; family = 8,750 minus the spouse's share, self = 4,400); `calcOptimizedAllocation` and `generatePhaseActions` take `hsaLimit` (default self-only, golden masters unmoved). App: passes `surplusHsaCeiling` to both, Classic HSA `contribMax: primaryHsaLimit`, and `whatIfSimInputs.hsaLimit: primaryHsaLimit` (scenario resims previously fell back to runSimulation's 4,400 cap: preview 8.4M vs applied 8.77M with spouse HSA 0). what-if.js: `scenarioSpouseAwareInputs` takes `contribHsaOverride`; under family coverage it re-runs the spouse sim with the overridden primary HSA (the squeeze).
- Review's exact numbers did not reproduce with my fixture (surplus mix differs), the mechanism did: optimizer extraHSA 550 -> 4,900; spouse 4,900 -> optimizer adds 0 (no squeeze) and preview "$9.4M" == applied 9,370,032.
- Tests: `src/__tests__/family-hsa-surplus.test.js` (5): optimizer+apply+preview==applied (spouse 0), Classic slider max, spouse-4,900 no squeeze + preview==applied, delta override == committed (spouse squeezed 4,900->2,750), card unit.
- Revert-and-confirm (single sites): optimizer hsaLimit arg removed -> 2 fail; Classic contribMax self-only -> 1 fail; whatIfSimInputs.hsaLimit removed -> 2 fail; hsaSqueeze disabled -> 1 fail; card `hsaLimit` -> self-only constant -> 1 fail. NOT covered: App's `hsaLimit: surplusHsaCeiling` argument at the Classic generatePhaseActions call (the card isn't rendered on Classic's default tab; removing the arg fails nothing).

## Orchestrator re-verification (2026-11-14)
- `npm test` 1707, lint clean, build OK, no golden-master file touched.
- BUG-179 mutation at the bug's real entry point: App passing the base-clamped plateau into
  `whatIfSimInputs` (instead of the stored value) fails 4+ BUG-179 parity tests; restored, green.
  Removing the per-scenario clamp inside `scenarioResolvedInputs` survives, legitimately: an
  unclamped stored plateau is behaviourally identical, because `incomeGrowthSteps` ignores a
  plateau at or past retirement. The clamp is normalisation, not the fix.
