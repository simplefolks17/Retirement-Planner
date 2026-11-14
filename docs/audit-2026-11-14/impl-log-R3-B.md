# R3-B impl log
- started R3-B; log created

## Step 1 — BUG-183 (S-3): editing a pinned SS override keeps its anchor
- Fix: `src/App.jsx` `setSsOverride` anchor now `setSsOverrideAnchorAge(prev => v === null ? null : (prev ?? ssClaimingAge))`.
- Test: `src/__tests__/ss-override-wiring.test.js` "editing an existing pin keeps its anchor age (BUG-183)": pin 38,000 at 70, claim 62, override 38,500, expect ssAnnual == round(38500*0.7/1.24) and note "age 70"; claim back to 70 gives 38,500.
- Revert (anchor line restored to `v === null ? null : ssClaimingAge`), new test:
  `expected 38500 to be 21734` -> 1 failed | 6 passed (7). FAIL.
- Restored: `Tests 7 passed (7)`. Full `npm test`: 1708 passed (85 files). Lint clean, build OK.

## Step 2 — BUG-184 (S-7): spouse current-age setter no longer overwrites explicit spouse retirement age
- Fix: `src/App.jsx` `setSpouseCurrentAgeCoupled` now only sets the age (the write to `spouseRetirementAge` removed, same approach as BUG-170's `setLifeExpectCoupled`; reads clamp via `resolveSpouseRetAge`).
- Test: `src/__tests__/ss-override-wiring.test.js` describe "BUG-184": explicit 60, spouse age 30 -> 61 -> 30, expect value 60.
- Revert (old two-line body restored): `expected 62 to be 60` -> 1 failed | 7 passed (8). FAIL.
- Restored: 8 passed (8).

## Step 3 — BUG-185 (S-9): $0 conversion event past retirement is flagged "not modelled"
- Fix: `src/model/conversion-events.js` `conversionEventNotModelled` is now age-only (`conversionEventOutsideWorkingYears`), no `amount > 0` gate. App's model filter (`activeConversionEvents`) and what-if's filter still drop $0 events (harmless).
- Tests: `src/__tests__/bounds-invariant.test.js`: new SEQS entry "in-service conversion event $0 (amount never set), retirementAge 65 -> 40" (the invariant walker), plus a dedicated `it` "BUG-185: a $0 event past retirement is flagged too".
- Revert (amount gate restored in predicate), `npx vitest run src/__tests__/bounds-invariant.test.js`:
  `Tests 2 failed | 40 passed (42)`; FAIL "pre-fix: false (the amount > 0 gate): expected false to be true"; FAIL "leaves no field out of range" (`expected [ Array(1) ] to deeply equal []`).
- Restored: `Tests 42 passed (42)`.

## Step 4 — S-8: rendered halves of BUG-173 / 176 / 177 get render tests
New file `src/__tests__/render-halves-s8.test.js` (5 tests, real App for the Classic halves, the Horizon flows rendered directly with the captured props and the proxy theme used by conversion-view-wiring):
1. BUG-176 Classic "Work 2 more years": preview "after" vs committed plan at the scenario age (57+2 = 59). Fixed: preview 74 vs committed 74... see note below.
2. BUG-177 Classic "Monthly Benefit" tile reads "$1,788 at age 62" (not raw 38,000/12 = 3,167).
3. BUG-177 Classic note "entered at age 70, rescaled to".
4. BUG-177 Horizon SSTimingFlow renders `ssView.overrideRescaleNote`.
5. BUG-173 Horizon WorkLongerFlow rows read "your entered figure".

Revert (one line at a time, file restored from backup after each, `git status` clean after each). Each run: `npx vitest run src/__tests__/render-halves-s8.test.js`:
- M1 `WhatIfPanel.jsx` `retAge={deltaResult.scenarioRetAge}` -> `retAge={safeRetAge}`: `1 failed | 4 passed (5)`; `preview 71 vs committed-at-59 74: expected 3 to be less than or equal to 1`.
- M2 `App.jsx` Classic tile -> `Math.round(ssOverride / MONTHS_PER_YEAR)`: `1 failed | 4 passed (5)` (the "Monthly Benefit" test).
- M3 `App.jsx` Classic note condition -> `false`: `1 failed | 4 passed (5)` ("entered at age 70, rescaled to").
- M4 `SSTimingFlow.jsx` `{includeSS && sv.overrideRescaleNote && <NoteBox` -> `{false && <NoteBox`: `1 failed | 4 passed (5)`.
- M5 `WorkLongerFlow.jsx` `row.ssPinnedFlat ? "your entered figure"` -> `false ? ...`: `1 failed | 4 passed (5)` (BUG-173 test).
Restored: `5 passed (5)`.
Note on M1: under the fix the preview reads 74 and the committed plan at 59 reads 74 (diff 0 at the printed resolution in the run above is not the case; the assertion allowed |diff| <= 1). The mutation gives 71, diff 3. The tolerance is the parity suite's "within a year".
