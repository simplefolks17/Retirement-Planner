# impl-log L1-A
- started: reading plan
- App.jsx + MyDetailsScreen edited (sentinel, effectiveRetirementState, isAuto, Classic select)
- tests added: src/__tests__/retirement-state-wiring.test.js (6), tax-basis.test.js (+3 CA/ZZ/override); calcStateTax removed; spouse-household comments fixed
== M1 stateRateDefault=0 ==
   × calcTaxBasis — real non-TX work states (BUG-151) > CA charges 9.3% of AGI from the work-state table 8ms
   × work state flows into take-home (BUG-151) > a CA work state lowers take-home vs TX 35ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/__tests__/retirement-state-wiring.test.js > work state flows into take-home (BUG-151) > a CA work state lowers take-home vs TX
 FAIL  src/model/__tests__/tax-basis.test.js > calcTaxBasis — real non-TX work states (BUG-151) > CA charges 9.3% of AGI from the work-state table
      Tests  2 failed | 1411 passed (1413)
== M2 retStateRate=0 ==
   × retirement state follows the work state (BUG-151) > retirement state tax changes retirement outcomes (retStateRate wired into the walk) 45ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/__tests__/retirement-state-wiring.test.js > retirement state follows the work state (BUG-151) > retirement state tax changes retirement outcomes (retStateRate wired into the walk)
      Tests  1 failed | 5 passed (6)
   × retirement state follows the work state (BUG-151) > follows the work state when it changes, and the retirement state tax follows too 108ms
   × retirement state follows the work state (BUG-151) > retirement state tax changes retirement outcomes (retStateRate wired into the walk) 44ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/__tests__/retirement-state-wiring.test.js > retirement state follows the work state (BUG-151) > follows the work state when it changes, and the retirement state tax follows too
 FAIL  src/__tests__/retirement-state-wiring.test.js > retirement state follows the work state (BUG-151) > retirement state tax changes retirement outcomes (retStateRate wired into the walk)
      Tests  2 failed | 4 passed (6)
== M3 revert fix (auto resolves to constant TX, i.e. never follows) ==
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/__tests__/retirement-state-wiring.test.js > retirement state follows the work state (BUG-151) > follows the work state when it changes, and the retirement state tax follows too
 FAIL  src/__tests__/retirement-state-wiring.test.js > retirement state follows the work state (BUG-151) > goes back to following when the user picks the work state again
      Tests  2 failed | 4 passed (6)
      Tests  6 passed (6)
- BUGS.md entry added; npm test 1413 green, lint/build clean
