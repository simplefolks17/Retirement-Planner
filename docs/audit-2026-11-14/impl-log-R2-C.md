# impl-log R2-C
Started. Branch: claude/oversight-root-cause-audit

## R-6 rows (mutation harness: apply one-line mutation, full vitest run, restore). "before" = full suite WITHOUT the new test file; "after" = new file only.
New file: src/model/__tests__/spouse-sim.test.js (6 tests; spouse sim builder, model level, zz-rev-e-shaped MFJ household; locked spouse Roth at 60 = 647,613 under returnRate 7 with the converted plateau).
- M1 spouse-sim.js `otherEarnerGrowthEndAge: plateauAgeInFrame(...)` -> `incomeGrowthEndAge` (no frame conversion): before 0 failed / 1657 pass; after 2 failed (frame-35 input test + value-level Roth@60 test). Restored.
- M2 spouse's own salary `incomeGrowthEndAge: null` -> frame-converted primary plateau: before 0 failed; after 2 failed (Roth@60 value, own-salary-keeps-growing). Restored.
- M3 `spouseIncomeEndAge: spouseAgeAt(...)` -> `null`: before 0 failed; after 3 failed (cutoff input test x1, value-level Roth@40 with primary retired at 45 x1, + Roth@60 lock). Restored.
- M4 `hsaLimit: spouseHsaLimitFor(...)` -> `HSA_LIMIT_2026`: before 0 failed; after 1 failed (family split cap 2,750 vs 4,400). Restored.
