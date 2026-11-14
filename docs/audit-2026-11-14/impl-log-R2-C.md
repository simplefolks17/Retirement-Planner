# impl-log R2-C
Started. Branch: claude/oversight-root-cause-audit

## R-6 rows (mutation harness: apply one-line mutation, full vitest run, restore). "before" = full suite WITHOUT the new test file; "after" = new file only.
New file: src/model/__tests__/spouse-sim.test.js (6 tests; spouse sim builder, model level, zz-rev-e-shaped MFJ household; locked spouse Roth at 60 = 647,613 under returnRate 7 with the converted plateau).
- M1 spouse-sim.js `otherEarnerGrowthEndAge: plateauAgeInFrame(...)` -> `incomeGrowthEndAge` (no frame conversion): before 0 failed / 1657 pass; after 2 failed (frame-35 input test + value-level Roth@60 test). Restored.
- M2 spouse's own salary `incomeGrowthEndAge: null` -> frame-converted primary plateau: before 0 failed; after 2 failed (Roth@60 value, own-salary-keeps-growing). Restored.
- M3 `spouseIncomeEndAge: spouseAgeAt(...)` -> `null`: before 0 failed; after 3 failed (cutoff input test x1, value-level Roth@40 with primary retired at 45 x1, + Roth@60 lock). Restored.
- M4 `hsaLimit: spouseHsaLimitFor(...)` -> `HSA_LIMIT_2026`: before 0 failed; after 1 failed (family split cap 2,750 vs 4,400). Restored.
- M5 BUG-157 at calcWhatIfDelta (what-if.js `...spDelta.primaryInputs` -> `...coupleContribEndAges(simInputs, safeRetAge, scenarioRetAge, simInputs.currentAge)`): before (HEAD test file) 0 failed / 1663 pass; after (new tests in whatif-parity-wiring.test.js: calcWhatIfDelta scenarioTotalAtRet == committed totalAtRet on the older-spouse fixture at retire 63 and 65) 2 failed. Restored. R2-B's anchoring (BUG-176) does not hide it: calcWhatIfDelta's own scenarioTotalAtRet is still observable directly.
- M6 BUG-161 spouse HSA max: R2-A (BUG-172) already covers it. Re-applied `spouseHsaLimit` -> `HSA_FAMILY_LIMIT_2026` (and the review's `primaryHsaLimit` variant was verified by R2-A) with the CURRENT suite: 4 failed (3 BUG-172 tests in onboarding-coupling-wiring + setter-bundles spouseAccounts). No new test needed. Restored.
- M7a BUG-151 Classic `<select value={effectiveRetirementState}>` -> `{retirementState}` (App.jsx): before (HEAD test files) 0 failed; after 1 failed (new "shows the EFFECTIVE state" test in classic-horizon-parity.test.js, which drives the rendered Classic select). Restored.
- M7b same select `onChange` -> `setRetirementStateRaw`: before 0 failed; after 1 failed (new "onChange goes through the snapping setter"; flips back to Horizon to read fresh bundle props since a mocked shell only captures while mounted). Restored.
- M8 MyDetailsScreen `hint: ... isAuto ? "following your home state" : undefined` -> `undefined`: before 0 failed; after 1 failed (new test in horizon/__tests__/my-details-screen.test.js, both auto and explicit cases). Restored.
