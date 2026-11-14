# impl-log L2

## BUG-154 — DONE in code; ONE GOLDEN-MASTER LOCK MOVED (NOT re-locked, awaiting orchestrator)

Change: `src/model/retirement-income.js` ss70Annual now honours `ssOverride`
(override x SS_FACTORS[70] / claimFactor(ssClaimingAge)); `includeSS=false` zeroes ss70Annual and
household70SS. Tests: 4 model tests (`retirement-income.test.js`) + 1 App-level
(`src/__tests__/ss-override-wiring.test.js`).

Revert-and-confirm (observed): with the old PIA-only line restored, 4 of 5 new tests FAIL
(`expected 59664 to be 159429`, `expected 59664 to be 90000`, `expected 59664 to be +0`,
App-level `expected false to be true` on delayApplicable). Fix restored: 21/21 pass.

GOLDEN MOVEMENT (unexpected per brief, so NOT re-locked): `spouse-household.test.js` T-X.3 locks
`ssView.wr70 = 1.4225852835455082`; now 0.9726563582272075 (DOWN). Mechanism: T-X.3 pins
ssOverride=38,000 at claim 67; pre-fix the age-70 leg ignored it (PIA-derived), now it is
38,000 x 1.24/1.0 = 47,120, so SS at 70 is higher and wr70 lower. This is exactly the defect
fixed, the direction is the correct one. No other test moved (1412/1413 pass). The orchestrator
must approve re-locking that one value (old -> new above).

Resolved-entry text for docs/BUGS.md (BUG-154):
Root cause: `calcRetirementIncome` derived `ss70Annual` from `ssPIA` and never consulted
`ssOverride`, so a pinned SS figure zeroed `ss70DrawReduction`/`delayApplicable`/`delayGainYrs`
and left `wr70` on a different SS basis from `withdrawalRate`. Files: `src/model/retirement-income.js`.
Fix: override treated as the annual benefit at the chosen claim age; age-70 = override x F70 /
F(claim); includeSS=false zeroes both legs. Tests: see above. Repro (default household, claim 62,
override 90,000): pre-fix ss70DrawReduction 0 / delayApplicable false.

## BUG-163 — DONE
Change: `mintEventId()` exported from `src/model/money-events.js` (string; `ev-<time36>-<seq36>-<rand>`;
monotonic counter guarantees same-ms uniqueness). Used by all 4 sites (line refs verified, unchanged):
MoneyEventsPanel.jsx emptyEvent, ConversionEventsPanel.jsx emptyEvent, App.jsx conversion `add`,
LifeEventSheet.jsx handleSave. Id-lookup audit: every id comparison is `===` between an event's id and
that same event's id (App.jsx saveEvent/removeEvent, conversion row update/remove, panel update/remove);
no `Number(id)`/`parseInt(id)` anywhere. Legacy numeric ids in existing state still compare fine.
Tests: money-events.test.js (string type; 10,000 calls with frozen Date + Math.random -> 10,000 unique),
src/__tests__/event-id-wiring.test.js (real App: two conversion adds -> distinct strings; remove-by-id works).
Revert-and-confirm (observed): mintEventId -> `String(Date.now())`: uniqueness test FAILS
(`expected 1 to be 10000`); restored: passes.
BUGS.md Resolved text: Root cause: four minting sites used three formats (three numeric Date.now()+random,
one String(Date.now()) with no entropy), so mixed-type ids could miss `===` lookups and same-ms events
collided. Fix: single `mintEventId()`. Files as above.
Gate state: npm test 1416/1417 (only the T-X.3 wr70 lock from BUG-154, unchanged), lint clean, build OK.

## BUG-164 — DONE
Change: `DeferredInput` gains optional `placeholder` / `ariaLabel` (-> aria-label) passthrough.
`MoneyEventsPanel` age input (min currentAge, max 120) and `ConversionEventsPanel` age input
(min currentAge+1, max safeRetAge-1) now use it; the Conversion panel's now-unused `clampAge` removed.
Behaviour: typing no longer writes committed state per keystroke; commit (blur/Enter) clamps to min/max.
Tests: `src/__tests__/event-panel-age-input.test.js` (4): passthrough; Money: "6","65" -> no onChange until
blur, then exactly one commit of 65; clamps 6->40, 999->120; Conversion: "5","55" -> 55, "6" -> 41, "99" -> 64.
Revert-and-confirm (observed): DeferredInput mutated to commit on every keystroke -> 3 of 4 FAIL
(`expected "spy" to not be called at all, but actually been called 2 times`; `expected 6 to be 40`);
restored -> 4/4 pass.
BUGS.md Resolved text: Root cause: MoneyEventsPanel wrote `Number(e.target.value)` unclamped into committed
state on every keystroke (typing "65" ran every model memo with age 6); ConversionEventsPanel finite-guarded but
never clamped to min/max until blur. Fix: both onto shared DeferredInput (draft locally, clamp+commit on
blur/Enter). Files: DeferredInput.jsx, MoneyEventsPanel.jsx, ConversionEventsPanel.jsx.
Gate state: npm test 1420/1421 (only the T-X.3 wr70 lock from BUG-154), lint clean, build OK.
