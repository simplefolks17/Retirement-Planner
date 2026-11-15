# impl-log R4-B

## BUG-190 verification
Probe (runSimulation, currentAge 30, taxable 500k, $100k outflow): event at age 30 -> final taxable 500,000 (identical to no event); at age 31 -> 400,000. REAL: an event AT currentAge is never charged; the sim charges from currentAge+1.

## BUG-192 (done first)
REAL by reading: clamp(untilAge, age+1, maxAge) with age===maxAge reverses bounds. Added resolveUntilAge/firstChargedEventAge (money-events.js); sheet renders unavailable state, disables Save, skips eval, handleSave guards.
Tests: life-event-sheet.test.js +2, money-events.test.js +3.
Revert-and-confirm (sheet site: untilBlocked=false and unavailable branch off): the maxAge test FAILED (1 failed, 22 passed); restored -> 23 passed.
Gates: npm test 1730 pass, lint clean, build ok.
