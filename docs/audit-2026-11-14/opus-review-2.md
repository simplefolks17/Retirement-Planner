# Opus review 2 — second adversarial audit of PR #70 (2026-11-14)

Branch `claude/oversight-root-cause-audit`. Independent second auditor. Findings appended the moment
they are verified. CONFIRMED = reproduced by execution with printed numbers; PLAUSIBLE = not executed.

## Findings


### S-1 — MEDIUM — CONFIRMED — REGRESSION from BUG-170: the non-destructive plateau breaks preview/commit parity; every what-if scenario reads the plateau clamped against the BASE retirement age
- **Where:** `src/App.jsx:120-121` (`incomeGrowthEndAge = clampIncomePlateauAge(stored, currentAge, retirementAge)`) feeds `whatIfSimInputs.incomeGrowthEndAge` (`App.jsx:1369`) and `whatIfBundle.ssInputs.incomeGrowthEndAge` (`App.jsx:1667`). `calcWhatIfScenario` / `calcWhatIfDelta` / `calcWorkLongerBreakEven` (`src/model/what-if.js:58`, `scenarioSocialSecurity` at :350) pass it through unchanged and never re-clamp for the scenario's own retirement age.
- **Repro** (probe `zz-r2-b`, real App, default household, Horizon setters): set plateau, lower retirement below it (stored kept, effective `null`), then compare the work-longer row for target T with committing T.

  | stored plateau | base ret | target | preview portfolio / SS | commit portfolio / SS |
  |---|---|---|---|---|
  | 45 | 44 | 49 | 1,417,679 / 31,920 | **1,412,418 / 31,656** |
  | 56 | 55 | 60 | 3,049,317 / 44,160 | **3,042,033 / 44,160** |
  | 55 | 52 | 60 (`calcWhatIfScenario`) | 3,049,317 | **3,037,218** |

  Commit restores the stored plateau (it is now inside `[cur+1, 60)`), the preview never sees it. Rows where the stored plateau is >= the target agree (control: 50/45/50 and 55/50/55 identical).
- **Why it matters:** this is the codebase's #1 bug class (whatif-parity, 8 prior bugs), introduced by Round 2's own fix. Before BUG-170 the destructive setter nulled the stored value, so preview and commit both read `null` and agreed; on `main` both read the raw stored value and agreed. Only the new stored/effective split disagrees. Direction is optimistic (preview shows more saved than the plan will). No test covers a stored-above-base plateau through a scenario.
- **Smallest fix:** pass the STORED plateau into the what-if bundle (simInputs + ssInputs) and clamp it inside the scenario path with `clampIncomePlateauAge(stored, currentAge, scenarioRetAge)` (one helper call in `calcWhatIfScenario`/`calcWhatIfDelta`/`scenarioSocialSecurity`; the base-age case reproduces today's value exactly). Add a whatif-parity test: plateau 56, retire 55, preview 60 == commit 60. `[judgement]`
