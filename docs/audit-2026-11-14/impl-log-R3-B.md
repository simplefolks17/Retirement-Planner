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
