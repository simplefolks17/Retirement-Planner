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

### S-2 — MEDIUM — CONFIRMED — BUG-176's anchor falls back to the blended walk's ABSOLUTE figure when the headline is sustainable and the lever hurts; R-9's contradiction survives in that edge state
- **Where:** `src/model/what-if.js:577-600` (`anchorWhatIfToHeadline`: `if (headline.years === Infinity) years = deltaYears < 0 ? scenario.scenarioYears : Infinity`); consumer Classic `WhatIfPanel` (`src/components/WhatIfPanel.jsx:132`, rendered via `YearsSustainedLabel`).
- **Repro** (probe `zz-r2-c`, real App; the review's own Finding-B younger-spouse household, spend lowered to $30k so the headline is sustainable). `calcWhatIfDeltaAnchored` with `retirementAgeOverride = base - 2` (the "Retire 2 years early" preset):
  - headline `yearsSustained` **Infinity**; blended no-change walk 35.2 yrs;
  - preview: **"Portfolio lasts to age 81"** (years 25.54, the blended scenario's own absolute) vs "Sustainable indefinitely", chip **-9.7 yrs**;
  - committing retirement 55: `yearsSustained` **127.0**, depletion age **183**. The preview is off by ~100 years and claims depletion inside the plan.
  - Control: every finite-headline case agrees to within a year (spend 40k-100k, offsets +/-2: e.g. 50k/-2 preview 97 vs commit 97; 80k/+2 84 vs 84).
- **Why it matters:** BUG-176 was filed to stop exactly this (a preview "before/after" that contradicts the headline by years in a spouse-gap household). The edge-state unit tests (`display-consistency-r2b.test.js:238+`) never exercise `headline.years === Infinity` with a negative finite delta. Any lever that hurts a sustainable plan (retire early, custom negative shift, a spend increase in the same panel) hits it.
- **Smallest fix:** in that branch, don't print the blended absolute. Either return a documented "no anchored figure" state (`scenarioYears: null`, the panel shows the delta only), or route retirement-age presets through `calcWhatIfScenario` (per-account engine, already parity-tested). Add the edge to the unit tests. `[judgement]`

### S-3 — MEDIUM — CONFIRMED — BUG-177: editing the override after moving the claim age re-anchors it silently; a $500 nudge becomes a +79% Social Security raise, and moving back to 70 recreates the fake delay gain BUG-177 was filed to stop
- **Where:** `src/App.jsx:199-202` (`setSsOverride` sets the anchor to the CURRENT `ssClaimingAge` on every write) vs the field's displayed value, which is the RAW at-anchor figure (`App.jsx:2149` Horizon `ss.ssOverride.value`; Classic input `App.jsx:4125`). The field shows one basis and writes another.
- **Repro** (probe `zz-r2-d`, real App, default household, Horizon setters):
  - A. claim 70, pin 38,000: field 38,000, `householdSS` 38,000, `yearsSustained` 20.70.
  - B. claim -> 62: field still shows **38,000**; effective 21,452; note "You entered $38k/yr at age 70; at age 62 that is $21k/yr".
  - C. user nudges the field 38,000 -> 38,500 (one 500 step): anchor silently becomes 62; `householdSS` **38,500** (+79%); note disappears; years 21.66.
  - D. claim back -> 70: `householdSS` **68,200**, years **24.20**. The user's SSA figure at 70 was 38,000; the plan now counts $30k/yr more.
- **Why it matters:** the owner decision was that benefits are "never overstated by a fake delay gain". One ordinary edit re-introduces an overstatement larger than the one fixed (+79% vs BUG-154's +77%). The BUG-177 tests always clear the override (`set(null)`) before re-pinning at a new age, so they never edit a live override at a moved claim age.
- **Smallest fix:** keep an existing anchor when the override is edited (`setSsOverrideAnchorAge(prev => v === null ? null : (prev ?? ssClaimingAge))`), so the field always edits the figure it displays; re-anchor only from null. Add the A-D sequence as a test. `[mechanical]`
