# impl-log L1-G
Started. Part 1 BUG-165, Part 2 clamp sweep.

## Part 1 — BUG-165 (done)
- Removed the "Portfolio target" F() row from `MyDetailsScreen.jsx`. The screen test's fake bundle still carries `retirementTarget` (harmless; the screen just no longer reads it), left alone.
- `input-propagation.test.js`: ALLOW entry `spending.retirementTarget` now `classicOnly: true`, reason "Classic-only; not rendered in Horizon...". New guard "BUG-165 guard": reads every non-`__tests__` `src/horizon/**/*.js(x)` file, strips comments, and fails if the LEAF name of any `classicOnly` entry appears as a whole word. Robust to `spending.x`, `spending?.x`, destructuring, string lookups; its false-positive risk (an unrelated Horizon identifier of the same name) is acceptable and the message says what to do. Also asserts >=1 classicOnly entry and >5 files scanned so it cannot pass vacuously.
- Revert-and-confirm observed: re-added the field -> `Tests 1 failed | 81 passed`: "Horizon renders a Classic-only bundle field (a dead control there, BUG-165): screens/MyDetailsScreen.jsx -> spending.retirementTarget". Restored -> `82 passed`.
- (First revert attempt silently did not apply, anchor mismatch; caught by the unchanged diff stat and redone.)
- BUGS.md Resolved entry added at top.

## Part 2 — Sweep 3: shared `clamp` (done)
`clamp(v, min, max)` added to `src/model/finance-math.js`, implemented as `Math.max(min, Math.min(max, v))`. min > max returns `min` (the BUG-63 / ssClaimingAge corner: the two inline spellings disagree there, `Math.min(max, Math.max(min,v))` gives max). NaN `v` propagates as NaN (same as the inline form; documented, tested). Tests: `src/model/__tests__/clamp.test.js` (7: in range, below, above, min>max, min===max, +/-Infinity, NaN, equivalence with the replaced spelling).

Local `clamp` in ArcGraph: there is NO local function named `clamp` (the plan's note was loose). `clampOverlayY` (ArcGraph:207) is a separate exported helper that does its own guard (`hi <= lo` midpoint fallback) and then a plain clamp. Kept the function (it has extra semantics); its inner `Math.min(Math.max(y, lo), hi)` migrated (lo < hi proven by the guard, so identical).

Sites MIGRATED (all provably identical for every input the code can reach; where the old spelling was min-wins-on-inversion the inverted-range case is unreachable, noted):
- DeferredInput.jsx:20 (old form A; props min/max are literal ordered bounds)
- WhatIfPanel.jsx:82 local `clampAge` removed, 3 call sites use clamp (bounds currentAge..120 / safeRetAge..120)
- HorizonShell.jsx:244, :283 (form B, constant OB_CLAMPS; exact)
- ConversionEventsPanel.jsx:17 and App.jsx emptyEvent-style site ~2707 (hi = max(currentAge+1, ..) >= lo by construction)
- App.jsx:284 spouseNetRate [0,1]; :691 and :694 conversion window start/end (inside `hasConvWindow`, floor <= ceil; start <= ceil); :1971, :2117, :4077 SS claim-age floor (constants ordered)
- ArcGraph.jsx:211, :585 (clampV), :938, :1009 (scrub label, lo < hi by viewBox size)
- horizon/presets.js:68 resolveRetireJump (slider bounds, ordered)
- horizon/LifeEventSheet.jsx:95 effUntilAge (form B; exact, including inversion -> min)
- model helpers (small standalone, not engine): retirement-phase.js:36 resolveSpouseRetAge (max >= min by construction) and :326 spouseNetRate; social-security.js:52 (constants); healthcare.js:6 (constants 1..6); money-events.js:145 (constants 0..12)

Sites LEFT ALONE, with reason:
- App.jsx:2682 `Math.min(safeRetAge - 1, Math.max(currentAge + 1, n))`: upper bound can fall below lower (retire at currentAge+1) and the old result there is `max`, clamp would give `min` -> output change. Left.
- App.jsx:1965 `horizonMin = Math.min(Math.max(retirementAge+1, 70), lifeExpect)`: it is a floor computed against a ceiling, not a clamp of a value; lifeExpect < 70 returns lifeExpect. Left.
- ArcGraph.jsx:490 (`Math.min(54, ... Math.max(ages.length,1) ...)`): min of a value and a divisor guard, not a clamp.
- Engine / deep model compounds, per the plan: retirement-engine.js (159,162,170,251,291,324,398,457), retirement-drawdown.js:79, simulation.js (63,324,368,396), roth-conversion.js:137, retirement-tax.js (85,86), spouse-sim.js:24 (golden-master risk; also several are `min(x, max(0, bal))` balance-limiters rather than range clamps).
- Multi-line min/max (budget.js:75, flow-down.js:82, retirement-tax.js:88,103): min/max of several values, not clamps.
No ternary-style clamps found by grep.

Verification: `npm test` 79 files / 1602 tests (1595 + 7 new), no golden master touched or re-locked; lint clean; build OK.

## Orchestrator re-verification (2026-11-14)
- `npm test` 1602, lint clean, build OK. No golden-master file touched.
- BUG-165 guard re-confirmed independently: re-adding the Portfolio target row to MyDetailsScreen
  -> 1 failing (the classicOnly guard); restored -> green.
- Clamp semantics audit: `clamp` is max-outer, so it returns `min` when min > max. Every removed
  min-outer site (which returns `max` in that case) was checked for crossable bounds:
  - conversion-event default age: hi = max(currentAge+1, ...) ≥ lo by construction;
  - `clampOverlayY`: guards `hi <= lo` before calling;
  - scrub-label x: VW = 1200 is fixed;
  - ACA FPL index: [1, 6] constant.
  None can cross, so the refactor is output-preserving, consistent with zero golden-master movement.
