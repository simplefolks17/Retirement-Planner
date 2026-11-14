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
- **Why it matters:** this is the codebase's #1 bug class (whatif-parity, 8 prior bugs), introduced by Round 2's own fix. Before BUG-170 the destructive setter nulled the stored value, so preview and commit both read `null` and agreed; **executed on a `2e525bb^` (pre-BUG-170) snapshot with the same probe: preview == commit in all four rows** (e.g. 45/44/49: 1,417,679 both; 56/55/60: 3,049,317 both). Only the new stored/effective split disagrees. Direction is optimistic (preview shows more saved than the plan will). No test covers a stored-above-base plateau through a scenario.
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

### S-4 — LOW — CONFIRMED — Family HSA coverage reaches the sims and the Horizon field but not the surplus optimizer, the HSA action card, or the Classic HSA slider; the surplus preview also misses the spouse's squeezed share (pre-existing, BUG-161/172's class one consumer over)
- **Where:** `src/model/budget.js:88` (`hsaRoom = HSA_LIMIT_2026 - contribHSA`, self-only cap regardless of coverage); `src/model/action-cards.js:109` (same); `src/App.jsx:514` (Classic ACCOUNTS HSA `contribMax: HSA_LIMIT_2026`, so the Classic slider/DeferredInput max is 4,400 while Horizon's `accounts.hsa.contrib.max` is 8,750 and the sim allows 8,750). `calcWhatIfDelta` re-runs the spouse sim only when the retirement age changes (`what-if.js:38-40`), so a `contribOverrides`-only preview never re-caps the spouse.
- **Repro** (probe `zz-r2-e`, real App: MFJ, married, spouse 30 earning $80k, family coverage, living $40k, spend $150k):
  - spouse HSA 0: the household has 8,750 - 3,850 = **4,900** of HSA room, but the optimizer's "② HSA" row is **+550** (4,400 - 3,850) and the surplus overflows to Taxable (+25,694).
  - spouse HSA 4,900: Apply raises primary HSA to 4,400, which squeezes the spouse's effective HSA 4,900 -> **4,350**; the preview's "Nest egg" after reads **$9.4M**, the committed plan **$9,302,229** ($9.3M).
- **Why it matters:** a family-coverage household is steered away from the one triple-tax-free account the model itself would let it fill; and a field added for one UI (coverage) still doesn't reach every consumer. Low because family coverage is Horizon-only and the dollar errors are small.
- **Smallest fix:** pass the primary's coverage ceiling (`primaryHsaLimit`, minus the spouse's stored share if the household view is wanted) into `calcOptimizedAllocation` / `calcActionCards` and use it for Classic's `contribMax`. `[judgement]`

### S-5 — HIGH — CONFIRMED — REGRESSION from BUG-167: the wizard shows and confirms a spending answer the saved plan does not use whenever the user changed their income answer
- **Where:** `src/components/HorizonShell.jsx:270-276` (`vals.monthlySpend` seeded ONCE from `initialValues`, i.e. from the PRE-wizard income) and `:293` (`handleSave` sends `monthlySpend` only when it differs from that seed). The untouched answer leaves `annualExpenses` on auto (`null`), and auto spending follows the NEW income. Q5 asks "How much to spend each month in retirement?", and the summary confirms "Monthly income $4,781/mo" (also mislabelled: it is spending, not income).
- **Repro** (probe `zz-r2-f`, driving the REAL wizard like `onboarding-wizard-save.test.js`): change only the income answer, click through Q5 untouched, save and confirm.

  | wizard income | Q5 + summary show | plan's `statementView.monthlyTodaysExp` after save | `yearsSustained` | same plan at the shown $4,781/mo |
  |---|---|---|---|---|
  | $100k (untouched) | $4,781 | 4,781 | 22.64 | 22.64 |
  | **$200k** | **$4,781** | **10,617** (2.2x) | **7.72** | 22.39 (depletes at 88) |
  | **$60k** | **$4,781** | **2,267** (0.47x) | **77.16** | 20.84 (depletes at 86) |

- **Why it matters:** onboarding is every new Horizon user's first screen, and nearly every user changes the income default. The plan then silently disagrees with the spending answer it displayed and the user confirmed, by 15 years in the pessimistic direction for a higher earner and by 56 years in the optimistic direction for a lower earner. Before BUG-167, `handleSave` always sent the answer, so the plan used the shown figure (on the wrong basis, which BUG-167 fixed). The new "untouched keeps auto" half traded R-4's freeze for this. BUG-167's tests only complete the wizard at the DEFAULT income, where seed == auto.
- **Smallest fix:** either always send `monthlySpend` now that the seed is on the right basis (accepting the freeze, which the summary makes explicit), or re-seed Q5 from the wizard's own income answer via a model-provided "auto spend at income X" function, keeping auto only when the user accepts that live seed. Rename the summary label to "Monthly spending". Add a wizard test that changes the income answer, leaves Q5 untouched, and asserts the plan's monthly spend equals what the summary showed. `[judgement]`

### S-6 — MEDIUM — CONFIRMED — A working-year conversion event that BUG-175 flags "not modelled" is also dropped from every work-longer / what-if preview, but committing the same retirement age brings it back (pre-existing filter, made a designed state by BUG-175)
- **Where:** `src/App.jsx:310-313` (`activeConversionEvents` filtered against the BASE `safeRetAge`) is what `whatIfSimInputs.conversionEvents` carries (`App.jsx:1376`); `calcWhatIfScenario` / `calcWhatIfDelta` / `calcWorkLongerBreakEven` never re-filter for the scenario's retirement age. BUG-175 deliberately keeps the stale event ("flag, not clamp, so the user's event survives retirement moving back"), which is exactly the case the preview misses.
- **Repro** (probe `zz-r2-g`, real App): $500k pre-tax, in-service conversions on, one event $100,000 at age 60, then retirement 65 -> 58. Row reads "outside your working years — not modelled" (correct). Then:
  - work-longer +5 row / `calcWhatIfScenario` at 63: `totalAtRet` **5,941,869**;
  - committing retirement 63: **5,905,265** (the event is modelled again, `notModelled` false). Preview overstates by **$36,604** (the conversion's tax), optimistic direction.
- **Why it matters:** the S-1 mechanism again (an App-side derivation keyed on the base retirement age that the scenario inherits instead of re-deriving): CLAUDE.md's whatif-parity class. BUG-175's own test moves retirement but never previews a scenario that re-enters the working window.
- **Smallest fix:** give the bundle the unfiltered `conversionEvents` + `conversionInService`, and filter inside the scenario path with the same `conversionEventOutsideWorkingYears(ev, currentAge, scenarioRetAge)` predicate (base age gives today's list exactly). Add a whatif-parity test with this fixture. `[judgement]`

### S-7 — LOW — CONFIRMED — BUG-170 made two coupled setters non-destructive but missed the third: the spouse's current-age setter still overwrites an explicit spouse retirement age
- **Where:** `src/App.jsx:1595-1598` (`setSpouseCurrentAgeCoupled`: `if (spouseRetirementAge != null && spouseRetirementAge <= v) setSpouseRetirementAge(v + 1)`), 20 lines below the BUG-170 comment in `setLifeExpectCoupled` explaining why the stored value is now left alone (every consumer reads it through `resolveSpouseRetAge`, which already clamps to `[spouseCurrentAge + 1, lifeExpect - 1]`).
- **Repro** (probe `zz-r2-h`, real App: MFJ, spouse 30 earning $90k with a $15k 401k, explicit spouse retirement 60):
  - A: spouse retirement **60**, `totalAtRet` 6,414,934, years 12.065.
  - B: spouse age -> 61 (e.g. a slider drag): spouse retirement 62.
  - C: spouse age back -> 30: spouse retirement stays **62**, `totalAtRet` **6,512,487** (+$97,553), years 12.251. Same inputs as A, different plan.
- **Why it matters:** this is R-1's "lossy coupling" class, which BUG-170 fixed for the plateau and plan-to age but not here; the Horizon slider calls `set` on every tick, so a drag through the value is enough. `classic-horizon-parity.test.js` covers only the two fixed setters.
- **Smallest fix:** delete the write (reads are already clamped by `resolveSpouseRetAge`), and add the A-C sequence beside the BUG-170 spouse test. `[mechanical]`

### S-8 — MEDIUM — CONFIRMED (mutation) — The RENDERED halves of BUG-176 and BUG-177 can be deleted with 0 of 1,688 tests failing; only their model fields are pinned
Method as the first review: one-line mutation, full `npm test`, file restored from a copy (`git status` clean after each).

| Mutation (one line) | Claim it undoes | Tests failing |
|---|---|---|
| `WhatIfPanel.jsx:253` `retAge={deltaResult.scenarioRetAge}` -> `retAge={safeRetAge}` | BUG-176's second fix: "its 'lasts to age' label now measures from the SCENARIO's retirement age (it used the base age for both: 'work 2 more years' printed an age 2 early)" | **0** |
| `App.jsx:4156` Classic "Monthly Benefit" tile back to `ssOverride / 12` (raw, unrescaled) | BUG-177 consumer list: "Classic monthly tile" | **0** |
| `App.jsx:4146` Classic "entered at age X, rescaled to $Y" note -> `false` | BUG-177: the user is told the pinned figure was rescaled | **0** |
| `SSTimingFlow.jsx:47` Horizon `overrideRescaleNote` NoteBox -> `false` | BUG-177 (same, Horizon) | **0** |
| `WorkLongerFlow.jsx` `row.ssPinnedFlat ? "your entered figure"` -> `false ? …` | BUG-173: no unexplained "+$0/yr" for a pinned override | **0** |

- **Why the BUG-176 test can't see the first row:** `display-consistency-r2b.test.js:234` asserts only `after >= before`. With the mutation, "work 2 more years" prints `round(57 + 13.9)` = 71 (it should be 73), still >= 70, so the test is green with exactly the defect the fix names.
- **Why it matters:** the first review's R-6/R-11 lesson (revert per sub-fix, at the bug's own site) was applied to the model halves of Round 2 / BUG-177 but not to their screens. BUG-177's tests read `ssView.overrideRescaleNote` and `ssView.ssMonthly`, which are the model's output, not what either UI renders, and the Classic tile recomputes its own figure from `ssOverride` instead of reading `ssView.ssMonthly`.
- **Smallest fix:** (1) assert the scenario's age exactly in the BUG-176 Classic test (`after === round(scenarioRetAge + scenarioYears)`, i.e. 73 for the fixture); (2) one Classic-render and one SSTimingFlow-render test that pins the rescaled monthly figure and the note text; (3) point the Classic tile at `ssView.ssMonthly`-equivalent single source (removes the duplicated `ssOverrideAtAge(...)/12`); (4) a WorkLongerFlow render test for "your entered figure". `[mechanical]`

### S-9 — LOW — CONFIRMED — BUG-175's flag (and bounds-invariant's exemption) require `amount > 0`, so a just-added $0 event stranded past retirement sits outside its own range unflagged, still labelled "401k → Roth, taxed as income"
- **Where:** `src/model/conversion-events.js:50-54` (`conversionEventNotModelled` needs `amount > 0`), read by `App.jsx:2740-2742`; `bounds-invariant.test.js` exempts an out-of-range `ageField` only when its row has `notModelled === true`, and every BUG-175 sequence sets an amount first.
- **Repro** (probe `zz-r2-i`, real App, walking every field with the shared `allFields` helper): in-service on, add an event (defaults: age 48, amount 0, range [31, 64]), then retirement 65 -> 40. Row: age **48**, range **[31, 39]**, `notModelled` **false**, label **"401k → Roth, taxed as income"**. `allFields` reports `conversionView.events.rows.0.ageField=48 [31,39]`, the exact violation bounds-invariant exists to catch, on a sequence it doesn't script.
- **Why it matters:** small (a $0 event converts nothing), but the guard's exemption is narrower than the state the app can reach, and typing an amount later flips the row straight to "not modelled" with no intermediate signal. Same "fixture can't exhibit the failure" pattern the brief asks about.
- **Smallest fix:** split the predicate: rows carry `outsideWorkingYears` (age only) for the bounds exemption / a neutral label, and `notModelled` (age + amount) for the warm warning; add the $0 sequence to bounds-invariant SEQS. `[mechanical]`

### S-10 — LOW — CONFIRMED (read + mutation) — Docs and comments that no longer match the code after Round 2 / BUG-177
1. **BUG-177's BUGS.md entry overclaims its revert evidence.** It lists "monthly tile" among sites "reverted singly and confirmed to fail a test". The impl log's revert was `ssView.ssMonthly` (Horizon). The Classic "Monthly Benefit" tile (`App.jsx:4156`) recomputes its own figure, and reverting IT fails 0 tests (S-8).
2. **Stale comment contradicts BUG-172:** `App.jsx:2097-2101` still says the spouse HSA "contribution cap is the household FAMILY ceiling (not spouseHsaLimit, which is a derived per-run split, not a slider bound the user should see shrink…)", 12 lines above the BUG-172 code that sets exactly `max: spouseHsaLimit`.
3. **Dead, contradicting branch:** `simulation.js:80-84` (`coupleCurrentAge` re-clamps `incomeGrowthEndAge` "when the caller's state carries the key", with a BUG-155 comment saying the stored plateau "stays in [newAge+1, retirementAge)"). After BUG-170 no App caller passes the key (the stored plateau is deliberately never rewritten); only `income-plateau.test.js:66-69` exercises it, so a test pins behaviour production no longer has (the audit's own Cause: tests on a function production never calls).
4. **BUG-36 heading** (`BUGS.md:452`) still reads "(accepted, low)"; the index row and the 2026-11-14 amendment say Medium.
5. **`ssView.overrideRescaleNote` misquotes what the user typed:** it formats the entered override with the compact `fmt`, so an entered 38,500 reads "You entered $39k/yr" (probe `zz-r2-d`, step D). The Classic suffix does the same with `fmt(effectiveSS)`. Use `fmtFull` for a figure the user typed.
6. **Wizard summary label:** `HorizonShell.jsx:304` shows the monthly SPENDING answer under "Monthly income" (pre-existing; noted in R-4's repro, never fixed).
7. Pre-existing nit: `whatif-parity-wiring.test.js:21` header still lists BUG-135 as a "known remaining gap" (fixed 2026-09-06; line 135 of the same file says so).

Fix for all: text edits, plus deleting the dead `coupleCurrentAge` branch with its two unit assertions (or re-pointing them at `clampIncomePlateauAge`). `[mechanical]`
