# impl-log L1-D (BUG-157 + BUG-158)

- Started. Branch: claude/oversight-root-cause-audit, HEAD 99ece2a
- [analysis] Design: new src/model/spouse-sim.js with ONE builder `buildSpouseSimInput` (the spouse's runSimulation arg) +
  ONE `resolveSpouseIncomeEndAge`. App.jsx (spouseSimData memo, simData + whatIfSimInputs spouseIncomeEndAge) and what-if.js
  (both scenario sites) call them. spouseSeedInputs gains `spouseSimRaw` (raw spouse balances/contribs/match fn/hsa coverage).
  Scenario rebuilds spouse sim whenever scenarioRetAge !== safeRetAge (byte-identical at base age; tested).
- [impl] shared builders + App/what-if wired; lint clean; npm test: only T-X.4 scenario lock moved (spillover 444590 -> 474936 first failure). No other golden master moved. Next: capture all T-X.4 old->new + direction proof
- [T-X.4 movement, measured with zz-l1d-tx4 probe: preview (calcWhatIfScenario) vs commit (retirementAge setter on fresh app)]
  Only `spillover` moved; totalAtRet and depletionAge unchanged at 58/60/62.
    retire 58: 743,001 -> 743,001 (unchanged; commit 742,667)
    retire 60: 444,590 -> 474,936 (commit 474,771)  gap 30,181 -> 165
    retire 62: 134,194 -> 192,945 (commit 187,641)  gap 53,447 -> 5,304 (now slightly ABOVE truth)
  Mechanism: under auto the old preview froze the spouse sim's contribEnd at the base age (57) and the primary-sim spouse MAGI cutoff,
  so the spouse stopped saving in the gap while earning wages -> less spouse 401k -> held-out bucket drained less/more. Rebuilt sim
  restores the spouse's gap contributions (bigger bucket -> more spillover, same direction as the commit).
  Residual vs commit = BUG-136 (inherited conversion schedule): with conversionMode custom / annualConversionAmt 0 the preview equals the
  commit EXACTLY at 58/60/62 (spillover 722,499 / 459,025 / 171,939, byte-identical, years identical).
  No other golden master moved (full npm test: only that one assertion failed).
- [tests] whatif-parity-wiring.test.js: new block "BUG-157 + BUG-158" (older-spouse Finding A fixture; younger-spouse Finding B fixture;
  explicit-age no-op; byte-identical rebuilt-vs-App spouse rows at base age; resolveSpouseIncomeEndAge unit). Passing with the fix.
- [revert-and-confirm] (what-if.js saved/restored via cp; no stash)
  R1 BUG-157: sed 's/primaryInputs: { ...primaryInputs, spouseIncomeEndAge }/primaryInputs/' (removes the scenario cutoff override)
     -> 3 failed | 68 passed: "BUG-157 ... retire 63 / 65 / 68: scenarioTotalAtRet / years / chart match the committed plan exactly" (BUG-158 tests stayed green).
  R2 BUG-158: sed 's/seedInputs: { ...spouseSeedInputs, spouseSimData },/seedInputs: spouseSeedInputs,/' + chartInputs likewise (scenario reuses frozen spouse rows)
     -> 7 failed | 64 passed: all 3 BUG-158 "retire 60/63/65 ... match the committed plan exactly", the 3 BUG-157 ones (older-spouse fixture also depends on the spouse sim), and the T-X.4 scenario lock.
  restored -> 71 passed (71).
- [T-X.4 still sensitive] with the new locks, reverting each earlier fix at its site (what-if.js, restored via cp):
  BUG-127 (scenarioSpouseRetAge `primaryRetAge: scenarioRetAge`->`safeRetAge`, line 794): T-X.4 scenario lock FAILS (3 failed incl. BUG-127/134 tests).
  BUG-134 (engine gate -> `? retPhaseBase.spouseRetirementAge`, line 894): T-X.4 scenario lock FAILS (4 failed).
  BUG-138 (`const primaryInputs = simInputs;` instead of coupleContribEndAges, line 38): T-X.4 scenario lock FAILS (1 failed).
  restored -> spouse-household 39 passed.
- [commit] done; full gate: npm test 1464 green, lint clean, build OK
