# impl-log L1-G
Started. Part 1 BUG-165, Part 2 clamp sweep.

## Part 1 — BUG-165 (done)
- Removed the "Portfolio target" F() row from `MyDetailsScreen.jsx`. The screen test's fake bundle still carries `retirementTarget` (harmless; the screen just no longer reads it), left alone.
- `input-propagation.test.js`: ALLOW entry `spending.retirementTarget` now `classicOnly: true`, reason "Classic-only; not rendered in Horizon...". New guard "BUG-165 guard": reads every non-`__tests__` `src/horizon/**/*.js(x)` file, strips comments, and fails if the LEAF name of any `classicOnly` entry appears as a whole word. Robust to `spending.x`, `spending?.x`, destructuring, string lookups; its false-positive risk (an unrelated Horizon identifier of the same name) is acceptable and the message says what to do. Also asserts >=1 classicOnly entry and >5 files scanned so it cannot pass vacuously.
- Revert-and-confirm observed: re-added the field -> `Tests 1 failed | 81 passed`: "Horizon renders a Classic-only bundle field (a dead control there, BUG-165): screens/MyDetailsScreen.jsx -> spending.retirementTarget". Restored -> `82 passed`.
- (First revert attempt silently did not apply, anchor mismatch; caught by the unchanged diff stat and redone.)
- BUGS.md Resolved entry added at top.
