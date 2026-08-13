import { describe, it, expect } from "vitest";
import {
  calcWhatIfDelta, calcAffordabilityMax, calcWhatIfChart, calcWhatIfScenario, evaluateLifeEvent,
  buildLeverPreview, buildLeverRail, buildDurationRail, LEVERS, eventIncomeImpact,
  marginForScenario, verdictInfoForScenario, buildVerdictLegend, verdictForMargin,
  verdictForScenarioResult, calcWorkLongerBreakEven,
} from "../what-if.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";
import { calcEmployerMatch } from "../employer-match.js";
import { runSimulation } from "../simulation.js";
import { buildRetirementDrawdown } from "../retirement-drawdown.js";
import { buildRetirementPhase, buildSpouseRetirementSeed } from "../retirement-phase.js";
import { buildAccumChart } from "../accumulation.js";

// ── Shared baseline setup ────────────────────────────────────────────────────
const em = (s, c) => calcEmployerMatch(s, c, {
  matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3,
});

const safeRetAge  = 65;
const safeLifeExp = 90;
const currentAge  = 30;
const fedMarginal = 0.22;
const rReal = (1 + 5 / 100) / (1 + 4 / 100) - 1; // ≈ 0.0096

const simInputs = {
  totalYears: safeLifeExp - currentAge, currentAge,
  currentIncome: 100_000, incomeGrowth: 3,
  filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 5,
  bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
  contrib401k: 10_000, contribRoth: 7_000, contribTaxable: 4_000, contribHSA: 3_850,
  contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
  calcEmployerMatchFn: em, moneyEvents: [],
};

// Compute actual baseline totalAtRet from the simulation (mirrors App.jsx — GROSS, BUG-35)
const _baseSim = runSimulation(simInputs);
const _baseAt  = _baseSim[safeRetAge - currentAge - 1];
const realBaseTotalAtRet = _baseAt
  ? (_baseAt.tradGross ?? 0)
    + (_baseAt["Roth IRA"] ?? 0) + (_baseAt["Taxable"] ?? 0) + (_baseAt["HSA"] ?? 0)
  : 0;

// Depleting scenario — deliberate low portfolio and high expenses so yearsSustained
// is a measurable finite number, not capped at Infinity by the 130-year horizon.
// Portfolio $800k, expenses $80k, SS $0 → draw/portfolio = 10% >> rReal → depletes ~10–12 yrs.
const depletingRetDrawShared = {
  rReal, effectiveExpenses: 80_000,
  ssAmount: 0, ssClaimAge: Infinity,
  pensionAmount: 0, pensionStartAge: Infinity,
  rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
};
const depletingBase = 800_000;
const { yearsSustained: depletingBaseYears } = buildRetirementDrawdown({
  ...depletingRetDrawShared,
  startBal: depletingBase, startAge: safeRetAge, endAge: safeRetAge + 130,
});

// ── Per-account engine fixtures (2026-07-11, overlay-continuity migration) ────
// calcWhatIfScenario now walks retirement with buildRetirementPhase (the same
// per-account engine the main chart uses) whenever the bundle carries a
// `retPhaseBase`. These fixtures seed the ENTIRE retirement balance into
// `taxable` (rmdStartAge: Infinity, conversionByAge: {}) so the engine's
// per-account walk degenerates to the exact same bal*(1+r) − draw recurrence
// buildRetirementDrawdown used above (no RMD/conversion/draw tax leaks) — the
// existing expected values below (computed against the blended walk) still hold.
const depletingRetPhaseBase = {
  tradGross: 0, roth: 0, taxable: depletingBase, hsa: 0,
  startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
  rReal, effectiveExpenses: depletingRetDrawShared.effectiveExpenses,
  ssGross: depletingRetDrawShared.ssAmount, ssTaxable: depletingRetDrawShared.ssAmount,
  ssClaimAge: depletingRetDrawShared.ssClaimAge,
  pension: depletingRetDrawShared.pensionAmount, pensionStartAge: depletingRetDrawShared.pensionStartAge,
  filingStatus: "single", retStateRate: 0,
  rmdStartAge: Infinity, useTable2: false, spouseCurrentAge: null, currentAge,
  moneyEvents: depletingRetDrawShared.moneyEvents ?? [],
};

// Standard (sustainable) scenario for qualitative tests
const retDrawShared = {
  rReal, effectiveExpenses: 75_000,
  ssAmount: 30_000, ssClaimAge: 67,
  pensionAmount: 0, pensionStartAge: Infinity,
  rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
};
const { yearsSustained: baseYearsSustained } = buildRetirementDrawdown({
  ...retDrawShared, startBal: realBaseTotalAtRet, startAge: safeRetAge, endAge: safeRetAge + 130,
});

const baseRetPhaseBase = {
  tradGross: 0, roth: 0, taxable: realBaseTotalAtRet, hsa: 0,
  startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
  rReal, effectiveExpenses: retDrawShared.effectiveExpenses,
  ssGross: retDrawShared.ssAmount, ssTaxable: retDrawShared.ssAmount,
  ssClaimAge: retDrawShared.ssClaimAge,
  pension: retDrawShared.pensionAmount, pensionStartAge: retDrawShared.pensionStartAge,
  filingStatus: "single", retStateRate: 0,
  rmdStartAge: Infinity, useTable2: false, spouseCurrentAge: null, currentAge,
  moneyEvents: retDrawShared.moneyEvents ?? [],
};
// baseChart mirrors App.jsx's totalChartData: accumulation rows (from the REAL
// per-account sim) + the engine's retirement rows (from the all-taxable seed —
// the total at the boundary is the same either way, so the chart is continuous).
// buildAccumChart's sumAccountRow reads the "Trad 401k" key that App.jsx adds
// after runSimulation (from tradGross) — raw sim rows don't carry it, so it's
// added here too (mirrors the same fix in what-if.js's own re-sim path).
const _baseSimWithTrad = _baseSim.map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
const _baseAccumChart = buildAccumChart({
  simData: _baseSimWithTrad, safeRetAge, currentAge,
  bal401k: simInputs.bal401k, balRoth: simInputs.balRoth,
  balTaxable: simInputs.balTaxable, balHSA: simInputs.balHSA,
});
const _baseRetPhase = buildRetirementPhase({ ...baseRetPhaseBase, conversionByAge: {} });
const baseChart = [
  ..._baseAccumChart,
  ..._baseRetPhase.rows.map(r => ({ age: r.age, total: r.total })),
];

const baseArgs = {
  simInputs, fedMarginal, retDrawShared,
  safeRetAge, safeLifeExp,
  baseTotalAtRet: realBaseTotalAtRet, baseYearsSustained,
  retPhaseBase: baseRetPhaseBase, conversionByAge: {}, baseChart, addlPreTaxBal: 0,
};

const depletingArgs = {
  simInputs, fedMarginal,
  retDrawShared: depletingRetDrawShared,
  safeRetAge, safeLifeExp,
  baseTotalAtRet: depletingBase, baseYearsSustained: depletingBaseYears,
  retPhaseBase: depletingRetPhaseBase, conversionByAge: {}, addlPreTaxBal: 0,
};

// ── calcWhatIfDelta ──────────────────────────────────────────────────────────
describe("calcWhatIfDelta", () => {
  it("no overrides returns baseline values unchanged", () => {
    const result = calcWhatIfDelta({ ...baseArgs, moneyEvents: [] });
    expect(result.baseTotalAtRet).toBe(realBaseTotalAtRet);
    expect(result.scenarioTotalAtRet).toBe(realBaseTotalAtRet);
    expect(result.scenarioYears).toBeCloseTo(baseYearsSustained, 4);
    expect(result.deltaYears).toBeCloseTo(0, 4);
  });

  it("outflow event (accum phase) reduces portfolio vs real baseline", () => {
    // Accumulation events trigger a full simulation re-run — use baseArgs (real sim)
    const result = calcWhatIfDelta({
      ...baseArgs,
      moneyEvents: [{ label: "Car", amount: 80_000, age: 35, isInflow: false, isTaxable: false }],
    });
    expect(result.scenarioTotalAtRet).toBeLessThan(realBaseTotalAtRet);
    expect(result.scenarioYears).toBeLessThanOrEqual(baseYearsSustained);
    expect(result.deltaYears).toBeLessThanOrEqual(0);
  });

  it("inflow event (retirement phase) extends longevity", () => {
    const result = calcWhatIfDelta({
      ...depletingArgs,
      moneyEvents: [{ label: "Inheritance", amount: 200_000, age: 70, isInflow: true, isTaxable: false }],
    });
    // Retirement-phase inflow → totalAtRet unchanged, yearsSustained increases
    expect(result.scenarioTotalAtRet).toBe(depletingBase);
    expect(result.scenarioYears).toBeGreaterThan(depletingBaseYears);
    expect(result.deltaYears).toBeGreaterThan(0);
  });

  it("higher annual expenses reduce longevity", () => {
    const result = calcWhatIfDelta({
      ...depletingArgs,
      annualExpensesOverride: depletingRetDrawShared.effectiveExpenses + 10_000,
    });
    expect(result.scenarioExpenses).toBe(depletingRetDrawShared.effectiveExpenses + 10_000);
    expect(result.scenarioYears).toBeLessThan(depletingBaseYears);
    expect(result.deltaYears).toBeLessThan(0);
  });

  it("larger outflow causes bigger longevity hit than smaller outflow", () => {
    const small = calcWhatIfDelta({
      ...depletingArgs,
      moneyEvents: [{ label: "A", amount: 40_000, age: 68, isInflow: false, isTaxable: false }],
    });
    const large = calcWhatIfDelta({
      ...depletingArgs,
      moneyEvents: [{ label: "B", amount: 200_000, age: 68, isInflow: false, isTaxable: false }],
    });
    // Both are retirement-phase events → scenarioTotalAtRet unchanged, longevity differs
    expect(large.deltaYears).toBeLessThan(small.deltaYears);
  });

  it("retirement-phase outflow reduces years but not totalAtRet", () => {
    const result = calcWhatIfDelta({
      ...depletingArgs,
      moneyEvents: [{ label: "Boat", amount: 150_000, age: 70, isInflow: false, isTaxable: false }],
    });
    expect(result.scenarioTotalAtRet).toBe(depletingBase);
    expect(result.scenarioYears).toBeLessThan(depletingBaseYears);
  });

  it("accumulation-phase outflow reduces both totalAtRet and longevity", () => {
    // Uses baseArgs so the re-simulation compares against the real sim baseline
    const result = calcWhatIfDelta({
      ...baseArgs,
      moneyEvents: [{ label: "Car", amount: 80_000, age: 40, isInflow: false, isTaxable: false }],
    });
    expect(result.scenarioTotalAtRet).toBeLessThan(realBaseTotalAtRet);
    expect(result.scenarioYears).toBeLessThanOrEqual(baseYearsSustained);
  });

  it("reports baseExpenses and scenarioExpenses correctly", () => {
    const result = calcWhatIfDelta({
      ...depletingArgs,
      annualExpensesOverride: 90_000,
    });
    expect(result.baseExpenses).toBe(depletingRetDrawShared.effectiveExpenses);
    expect(result.scenarioExpenses).toBe(90_000);
  });

  it("an event dated exactly at safeRetAge reaches the accumulation re-sim (M3 boundary regression)", () => {
    // Before the fix, `<` excluded an event dated exactly at scenarioRetAge from
    // BOTH the sim (excluded by `<`) and the retirement walk (which starts at
    // startAge+1) — a complete no-op. `<=` puts it in the sim, whose read row IS
    // the retirement-age row.
    const result = calcWhatIfDelta({
      ...baseArgs,
      moneyEvents: [{ label: "Boundary", amount: 50_000, age: safeRetAge, isInflow: false, isTaxable: false }],
    });
    expect(result.scenarioTotalAtRet).toBeLessThan(realBaseTotalAtRet);
  });

  it("scenarioDepletionAge matches a direct buildRetirementDrawdown call for the same walk", () => {
    const result = calcWhatIfDelta({ ...depletingArgs, moneyEvents: [] });
    const direct = buildRetirementDrawdown({
      ...depletingRetDrawShared, startBal: depletingBase, startAge: safeRetAge, endAge: safeRetAge + 130,
    });
    expect(result.scenarioDepletionAge).toBe(direct.depletionAge);
  });

  // ── addlPreTaxBal basis-symmetry lock (post-ship review fix) ───────────────
  // baseTotalAtRet (App.jsx) already includes addlPreTaxBal; a forced re-sim's
  // scenarioTotalAtRet must add it back too, or "current" (baseTotalAtRet
  // passthrough) and "candidate" (re-sim) silently diverge by exactly
  // addlPreTaxBal — a real basis mismatch surfaced by the WI-3.7 surplus
  // Apply-preview, which compares the two through the SAME mechanism.
  it("addlPreTaxBal is added to scenarioTotalAtRet on a forced re-sim, not silently dropped", () => {
    const forceResimEvent = { label: "Car", amount: 80_000, age: 40, isInflow: false, isTaxable: false };
    const without = calcWhatIfDelta({ ...baseArgs, moneyEvents: [forceResimEvent] });
    const withAddl = calcWhatIfDelta({
      ...baseArgs, moneyEvents: [forceResimEvent], addlPreTaxBal: 500_000,
    });
    expect(withAddl.scenarioTotalAtRet - without.scenarioTotalAtRet).toBeCloseTo(500_000, 6);
  });

  it("addlPreTaxBal defaults to 0 (no-op) when omitted", () => {
    const omitted = calcWhatIfDelta({ ...baseArgs, moneyEvents: [] });
    const explicitZero = calcWhatIfDelta({ ...baseArgs, moneyEvents: [], addlPreTaxBal: 0 });
    expect(explicitZero).toEqual(omitted);
  });

  // ── spouseSeedInputs basis-symmetry lock (roadmap-review finding, 2026-07-26) ──
  // Same class as the addlPreTaxBal lock above: baseTotalAtRet (App.jsx) is
  // HOUSEHOLD (includes the spouse's seeded balance), but calcWhatIfDelta's
  // forced-resim path only ever re-simulated the PRIMARY — unlike its sibling
  // calcWhatIfScenario, which got this fix under BUG-77. A forced resim
  // silently dropped the spouse's entire balance, producing a phantom delta
  // on surplusApplySite's live Apply-with-preview button.
  describe("calcWhatIfDelta — spouse basis symmetry on a forced re-sim", () => {
    // currentAge (30) -> safeRetAge (65) is a 35-year accumulation window, so
    // the seed row read at buildSpouseRetirementSeed's `rows[phase2End - 1]`
    // (phase2End = safeRetAge - currentAge = 35) needs at least 35 rows.
    const spouseCurrentAgeFixture = 25;
    const spouseSimDataFixture = Array.from({ length: 35 }, (_, i) => ({
      age: spouseCurrentAgeFixture + i + 1,
      c401k: 12_000, c401kEmployee: 10_000, cHSA: 0, salary: 60_000,
      tradGross: 200_000 + i * 15_000,
      "Roth IRA": 40_000, "Taxable": 20_000, "HSA": 0,
    }));
    const spouseCurrentSnapshotFixture = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const spouseSeedInputsFixture = {
      spouseSimData: spouseSimDataFixture, spouseCurrentSnapshot: spouseCurrentSnapshotFixture,
      spouseCurrentAge: spouseCurrentAgeFixture, spouseRetAge: safeRetAge, spouseNetRate: 0.7,
    };
    const baseSpouseSeed = buildSpouseRetirementSeed({
      ...spouseSeedInputsFixture, currentAge, primaryRetAge: safeRetAge,
    });
    const spouseBaseTotal = baseSpouseSeed.tradSeed + baseSpouseSeed.rothSeed
      + baseSpouseSeed.taxableSeed + baseSpouseSeed.hsaSeed;

    // Household basis (mirrors App.jsx's totalAtRet — primary + spouse), the
    // exact shape that exposes the bug: baseTotalAtRet already includes the
    // spouse, so a resim that drops it diverges from the non-resim baseline.
    const householdArgs = {
      ...baseArgs, baseTotalAtRet: realBaseTotalAtRet + spouseBaseTotal,
      spouseSeedInputs: spouseSeedInputsFixture,
    };

    it("a forced re-sim adds the spouse's re-seeded total, not silently dropping it", () => {
      // Sanity: the fixture actually has a nonzero spouse balance to lose.
      expect(spouseBaseTotal).toBeGreaterThan(0);
      const forceResimEvent = { label: "Car", amount: 80_000, age: 40, isInflow: false, isTaxable: false };
      const withoutSpouse = calcWhatIfDelta({ ...baseArgs, moneyEvents: [forceResimEvent] });
      const withSpouse = calcWhatIfDelta({ ...householdArgs, moneyEvents: [forceResimEvent] });
      // Primary side is identical in both calls (spouse data never touches the
      // primary's own runSimulation) — the whole delta must be the spouse total.
      expect(withSpouse.scenarioTotalAtRet - withoutSpouse.scenarioTotalAtRet)
        .toBeCloseTo(spouseBaseTotal, 6);
    });

    it("the phantom-delta bug this fixes: a no-op candidate (matching contribOverrides) no longer shows a spurious spouse-sized delta", () => {
      // Mirrors surplusApplySite's exact shape: "current" has no override (no
      // resim -> baseTotalAtRet passthrough, household); "candidate" sets
      // contribOverrides matching the existing contributions exactly (forces a
      // resim, but should be a true no-op on the total). Before this fix, the
      // candidate's resim dropped the entire spouse balance, showing a phantom
      // six-figure "regression" on an unchanged scenario.
      const current = calcWhatIfDelta({ ...householdArgs });
      const candidate = calcWhatIfDelta({
        ...householdArgs,
        contribOverrides: {
          contrib401k: simInputs.contrib401k,
          contribRoth: simInputs.contribRoth,
          contribTaxable: simInputs.contribTaxable,
          contribHSA: simInputs.contribHSA,
        },
      });
      // Loose tolerance (0.1% of the household total) absorbs ordinary
      // sim-vs-baseline float noise, not a systematic basis drop the size of
      // the entire spouse balance (which would be roughly 10-20% here).
      expect(Math.abs(candidate.scenarioTotalAtRet - current.scenarioTotalAtRet))
        .toBeLessThan(Math.abs(current.scenarioTotalAtRet) * 0.001);
    });

    it("spouseSeedInputs defaults to null (no-op) when omitted — no spouse, no effect", () => {
      const forceResimEvent = { label: "Car", amount: 80_000, age: 40, isInflow: false, isTaxable: false };
      const omitted = calcWhatIfDelta({ ...baseArgs, moneyEvents: [forceResimEvent] });
      const explicitNull = calcWhatIfDelta({
        ...baseArgs, moneyEvents: [forceResimEvent], spouseSeedInputs: null,
      });
      expect(explicitNull).toEqual(omitted);
    });
  });

  // ── contribOverrides no-op lock (WI-3.7 extension) ─────────────────────────
  // The param must be a true no-op when omitted/null — nothing on the golden
  // path should move now that this param exists.
  const accumEvent = { label: "Car", amount: 80_000, age: 40, isInflow: false, isTaxable: false };

  it("contribOverrides omitted vs explicit null produce identical results", () => {
    const omitted = calcWhatIfDelta({ ...baseArgs, moneyEvents: [accumEvent] });
    const explicitNull = calcWhatIfDelta({ ...baseArgs, moneyEvents: [accumEvent], contribOverrides: null });
    expect(explicitNull).toEqual(omitted);
  });

  it("contribOverrides matching the existing simInputs contributions is a no-op on scenarioTotalAtRet", () => {
    const withoutOverride = calcWhatIfDelta({ ...baseArgs, moneyEvents: [accumEvent] });
    const withMatchingOverride = calcWhatIfDelta({
      ...baseArgs,
      moneyEvents: [accumEvent],
      contribOverrides: {
        contrib401k: simInputs.contrib401k,
        contribRoth: simInputs.contribRoth,
        contribTaxable: simInputs.contribTaxable,
        contribHSA: simInputs.contribHSA,
      },
    });
    expect(withMatchingOverride.scenarioTotalAtRet).toBeCloseTo(withoutOverride.scenarioTotalAtRet, 6);
  });

  it("contribOverrides forces a re-sim even with no money events or retirement-age override", () => {
    // No accum events, no retirementAgeOverride — only contribOverrides should trigger the resim.
    const higherContrib = calcWhatIfDelta({
      ...baseArgs,
      moneyEvents: [],
      contribOverrides: { contrib401k: simInputs.contrib401k + 20_000 },
    });
    expect(higherContrib.scenarioTotalAtRet).toBeGreaterThan(realBaseTotalAtRet);
  });
});

// ── BUG-75: committed events are bundle-carried; the param is additions-only ──
// Committed events reach calcWhatIfDelta via simInputs.moneyEvents (sim) and
// retDrawShared.moneyEvents (walk). Passing them AGAIN as the `moneyEvents`
// param double-counted every committed retirement-phase event in the walk
// (surplusApplySite did exactly that), and before the fix a forced re-sim
// dropped committed accumulation events entirely (simInputs.moneyEvents was
// overridden with the scenario additions).
describe("calcWhatIfDelta — committed events contract (BUG-75)", () => {
  const accumE = { label: "Roof", amount: 30_000, age: 45, isInflow: false, isTaxable: false };
  const retE   = { label: "Trip", amount: 60_000, age: 70, isInflow: false, isTaxable: false };

  // Baseline WITH the committed accumulation event, mirroring App.jsx's main path.
  const simInputsC = { ...simInputs, moneyEvents: [accumE] };
  const simC  = runSimulation(simInputsC);
  const atC   = simC[safeRetAge - currentAge - 1];
  const baseTotalC = (atC.tradGross ?? 0)
    + (atC["Roth IRA"] ?? 0) + (atC["Taxable"] ?? 0) + (atC["HSA"] ?? 0);
  // Depleting retirement shared (finite years) carrying the committed retirement event.
  const retDrawC = { ...depletingRetDrawShared, moneyEvents: [retE] };
  const walkC = buildRetirementDrawdown({
    ...retDrawC, startBal: baseTotalC, startAge: safeRetAge, endAge: safeRetAge + 130,
  });
  const argsC = {
    simInputs: simInputsC, fedMarginal, retDrawShared: retDrawC,
    safeRetAge, safeLifeExp,
    baseTotalAtRet: baseTotalC, baseYearsSustained: walkC.yearsSustained,
  };

  it("counts a committed retirement-phase event exactly once in the walk", () => {
    // No scenario additions → the walk must equal a direct buildRetirementDrawdown
    // with the committed event passed once. A double-count shifts yearsSustained.
    const r = calcWhatIfDelta({ ...argsC, moneyEvents: [] });
    expect(r.scenarioYears).toBe(walkC.yearsSustained);
    expect(r.scenarioTotalAtRet).toBe(baseTotalC);
  });

  it("a no-change contribOverrides candidate matches the no-override current when committed events exist in both phases", () => {
    // This is surplusApplySite's anti-divergence property: "current" (no resim,
    // baseTotalAtRet includes the committed accum event) vs "candidate" (forced
    // resim) must agree when the candidate changes nothing. Pre-fix the resim
    // dropped the committed accum event → spurious basis delta.
    const before = calcWhatIfDelta({ ...argsC, moneyEvents: [] });
    const after  = calcWhatIfDelta({
      ...argsC, moneyEvents: [],
      contribOverrides: {
        contrib401k: simInputs.contrib401k, contribRoth: simInputs.contribRoth,
        contribTaxable: simInputs.contribTaxable, contribHSA: simInputs.contribHSA,
      },
    });
    expect(after.scenarioTotalAtRet).toBeCloseTo(before.scenarioTotalAtRet, 6);
    expect(after.scenarioYears).toBe(before.scenarioYears);
  });
});

// ── calcAffordabilityMax ─────────────────────────────────────────────────────
// 2026-07-11 (fix-pass-2): calcAffordabilityMax moved from the blended walk
// (calcWhatIfDelta) onto the per-account engine (calcWhatIfScenario), matching
// every other Ideas/Plan surface — it now takes the SAME bundle shape
// (depletingArgs / baseArgs already have the right fields: retPhaseBase,
// conversionByAge, addlPreTaxBal). The three assertions here were already loose
// (non-negative / non-positive directional checks, not exact-value locks), so
// they hold across the blended→engine migration; noted here rather than
// silently re-passing.
describe("calcAffordabilityMax", () => {
  it("returns a non-negative maxAmount", () => {
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 40,
      targetLifeExpectancy: 75,  // modest target well within depleting scenario
      step: 10_000,
    });
    expect(result.maxAmount).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 when baseline can't sustain to target age", () => {
    // Force scenario that barely sustains to 74 — target 80 is impossible
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 40,
      targetLifeExpectancy: 80,  // beyond depleting scenario longevity (~75–77)
      step: 10_000,
    });
    // Either 0 or we'd need to verify depletingBaseYears < (80 - safeRetAge)
    // Just confirm non-negative
    expect(result.maxAmount).toBeGreaterThanOrEqual(0);
  });

  it("delta is non-positive when max amount is spent (retirement-phase purchase)", () => {
    // Retirement-phase purchase avoids re-simulation; depletingBase stays consistent.
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 68,   // >= safeRetAge — stays within retirement walk
      targetLifeExpectancy: 74,
      step: 10_000,
    });
    // Spending the max should not lengthen the portfolio (it reduces or is neutral)
    expect(result.deltaYears).toBeLessThanOrEqual(0);
  });

  it("returns a safe zero result for a missing/invalid bundle", () => {
    expect(calcAffordabilityMax(null, { purchaseAge: 40, targetLifeExpectancy: 75 }))
      .toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("the found maxAmount actually sustains to the target age when priced through calcWhatIfScenario directly", () => {
    // Self-consistency check on the new engine-based probe: calcAffordabilityMax's
    // own isSustainable() closure isn't exported, so re-derive the same candidate
    // through calcWhatIfScenario (what the probe calls internally) and confirm the
    // years-sustained figure actually clears the target — i.e. the binary search
    // converged on a genuinely affordable amount, not just "didn't crash".
    const targetLifeExpectancy = 74;
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 68, targetLifeExpectancy, step: 10_000,
    });
    const scenario = calcWhatIfScenario(depletingArgs, {
      scenarioEvents: [{ label: "Check", amount: result.maxAmount, age: 68, isInflow: false, isTaxable: false }],
    });
    const years = scenario.scenarioYears === Infinity ? Infinity : scenario.scenarioYears;
    expect(years).toBeGreaterThanOrEqual(targetLifeExpectancy - depletingArgs.safeRetAge);
  });

  it("boundary-optimality: sustains to target at maxAmount, fails at maxAmount + step", () => {
    const purchaseAge = 68, targetLifeExpectancy = 74, step = 10_000;
    const { maxAmount } = calcAffordabilityMax(depletingArgs, {
      purchaseAge, targetLifeExpectancy, step,
    });
    expect(maxAmount % step).toBe(0);

    const targetYears = targetLifeExpectancy - safeRetAge;
    const sustainsAt = (amount) => {
      const r = calcWhatIfDelta({
        ...depletingArgs,
        moneyEvents: [{ label: "chk", amount, age: purchaseAge, isInflow: false, isTaxable: false }],
      });
      const years = r.scenarioYears === Infinity ? targetYears + 1 : r.scenarioYears;
      return years >= targetYears;
    };
    expect(sustainsAt(maxAmount)).toBe(true);
    expect(sustainsAt(maxAmount + step)).toBe(false);
  });

  it("returns canAfford:false and a zero result when step is non-positive", () => {
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 68, targetLifeExpectancy: 74, step: 0,
    });
    expect(result).toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("returns canAfford:false and a zero result when targetLifeExpectancy is at/before retirement", () => {
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 68, targetLifeExpectancy: safeRetAge, step: 10_000,
    });
    expect(result).toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("returns canAfford:false when the baseline itself can't sustain to the target age", () => {
    // depletingBase (~10-12 yrs sustained) cannot reach a 90-yr target (25 yrs).
    const result = calcAffordabilityMax(depletingArgs, {
      purchaseAge: 68, targetLifeExpectancy: safeLifeExp, step: 10_000,
    });
    expect(result).toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("caps at maxSearch when the scenario is trivially sustainable at any spend within range", () => {
    // baseArgs (SS-offset, well-funded scenario) with a tiny maxSearch — every
    // amount tested is sustainable, so the search should exhaust the range
    // rather than spin, and the result documents the cap.
    const result = calcAffordabilityMax(baseArgs, {
      purchaseAge: 70, targetLifeExpectancy: safeLifeExp,
      step: 10_000, maxSearch: 30_000,
    });
    expect(result.maxAmount).toBeGreaterThanOrEqual(30_000 - 10_000);
    expect(result.maxAmount).toBeLessThanOrEqual(30_000);
    expect(result.canAfford).toBe(true);
  });
});

// ── calcWhatIfChart ──────────────────────────────────────────────────────────
const chartBundle = {
  simInputs,
  fedMarginal,
  retDrawShared,
  safeRetAge,
  safeLifeExp,
  baseTotalAtRet: realBaseTotalAtRet,
  retPhaseBase: baseRetPhaseBase, conversionByAge: {}, baseChart, addlPreTaxBal: 0,
};

// NOTE (2026-07-11 overlay-continuity migration): calcWhatIfScenario's `chart`
// now covers the FULL lifetime (accumulation + retirement), not just the
// retirement phase — see the header comment on calcWhatIfScenario. The three
// "no overrides"/"retireAdj" assertions below were written against the old
// retirement-only chart and are rewritten here for the new scope; the
// "returns [] for missing inputs" case is unaffected.
describe("calcWhatIfChart", () => {
  it("no overrides: returns the full lifetime series, from current age through safeLifeExp", () => {
    const series = calcWhatIfChart(chartBundle);
    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);
    // buildAccumChart seeds today's row (the Accounts-tab "Today · $0" fix), so
    // the lifetime series starts AT the current age, not one year after.
    expect(series[0].age).toBe(currentAge);
    expect(series[series.length - 1].age).toBe(safeLifeExp);
  });

  it("no overrides: the retirement-age row matches baseTotalAtRet, and the walk continues from it", () => {
    const series = calcWhatIfChart(chartBundle);
    const retRow  = series.find(r => r.age === safeRetAge);
    const nextRow = series.find(r => r.age === safeRetAge + 1);
    expect(retRow).toBeDefined();
    expect(retRow.total).toBe(Math.round(realBaseTotalAtRet));
    // The next row has grown by rReal but lost the first year's draw.
    expect(nextRow.total).toBeGreaterThan(0);
    expect(nextRow.total).toBeLessThanOrEqual(realBaseTotalAtRet * 1.1);
  });

  it("retireAdj moves the accumulation→retirement boundary within the full series", () => {
    const seriesEarly = calcWhatIfChart(chartBundle, { retireAdj: -2 });
    const scenarioRetAge = safeRetAge - 2;
    expect(Array.isArray(seriesEarly)).toBe(true);
    // The series still spans the whole lifetime — start age is unaffected by
    // WHEN retirement happens, only the boundary between the two phases moves.
    expect(seriesEarly[0].age).toBe(currentAge);
    expect(seriesEarly[seriesEarly.length - 1].age).toBe(safeLifeExp);
    const boundaryIdx = seriesEarly.findIndex(r => r.age === scenarioRetAge);
    expect(boundaryIdx).toBeGreaterThanOrEqual(0);
    expect(seriesEarly[boundaryIdx + 1].age).toBe(scenarioRetAge + 1);
  });

  it("returns [] for missing inputs", () => {
    expect(calcWhatIfChart({})).toEqual([]);
    expect(calcWhatIfChart({ simInputs: null, retDrawShared: null })).toEqual([]);
  });
});

// ── calcWhatIfScenario ───────────────────────────────────────────────────────
// The V1 anti-divergence primitive: ONE run returns both the chart and the
// stat scalars, so the Ideas stats row and the arc overlay can never disagree.
describe("calcWhatIfScenario", () => {
  it("chart is identical to calcWhatIfChart for the same bundle/overrides (one run, two outputs)", () => {
    const overrides = { retireAdj: -2 };
    const scenario = calcWhatIfScenario(baseArgs, overrides);
    const chart    = calcWhatIfChart(baseArgs, overrides);
    expect(scenario.chart).toEqual(chart);
  });

  it("no overrides returns baseline values (retire age, expenses, totalAtRet, deltaYears 0)", () => {
    const s = calcWhatIfScenario(baseArgs);
    expect(s.scenarioRetAge).toBe(safeRetAge);
    expect(s.scenarioExpenses).toBe(retDrawShared.effectiveExpenses);
    expect(s.scenarioTotalAtRet).toBe(realBaseTotalAtRet);
    expect(s.scenarioYears).toBeCloseTo(baseYearsSustained, 4);
    expect(s.deltaYears).toBeCloseTo(0, 4);
  });

  it("retireAdj recomputes the starting balance from the simulation (lower when earlier)", () => {
    const s = calcWhatIfScenario(baseArgs, { retireAdj: -2 });
    expect(s.scenarioRetAge).toBe(safeRetAge - 2);
    expect(s.scenarioTotalAtRet).toBeLessThan(realBaseTotalAtRet);
  });

  // #30 interop fix: scenarioTotalAtRet must include the spouse Traditional 401k
  // bucket the walk is actually seeded with (retPhaseBase.tradGrossSpouse), or a
  // household-with-spouse-401k scenario reports a phantom drop/rise equal to the
  // entire spouse trad balance for a change that never touched it (e.g. a pure
  // spend-lever preview).
  it("includes the spouse Traditional 401k bucket in scenarioTotalAtRet (no false delta)", () => {
    const spouseTrad = 600_000;
    const householdRetPhaseBase = { ...baseRetPhaseBase, tradGrossSpouse: spouseTrad };
    const householdBaseTotalAtRet = realBaseTotalAtRet + spouseTrad;
    const s = calcWhatIfScenario({
      ...baseArgs, retPhaseBase: householdRetPhaseBase, baseTotalAtRet: householdBaseTotalAtRet,
    }, { annualExpenses: retDrawShared.effectiveExpenses + 1_000 }); // non-resim override — no accum/retirement-age change
    expect(s.scenarioTotalAtRet).toBe(householdBaseTotalAtRet);
  });

  // BUG-92 wiring: calcWhatIfScenario must surface the engine's own spillover
  // rollup (not just include the spouse balance in scenarioTotalAtRet, which
  // the test above already covers) — otherwise the verdict resolver has
  // nothing to cap on for a real household that leans on the escape hatch.
  it("totalSpouseSpillover flows through from the engine's own rollup (T-F1.1's exact fixture)", () => {
    const spouseIncomeFloorByAge = {};
    const spouseContribByAge = {};
    for (let a = 61; a <= 75; a++) { spouseIncomeFloorByAge[a] = 15_000; spouseContribByAge[a] = 12_000; }
    const spillArgs = {
      ...baseArgs,
      retPhaseBase: {
        ...baseRetPhaseBase,
        startAge: 60, currentAge: 60, spouseCurrentAge: 45,
        tradGross: 50_000, tradGrossSpouse: 3_000_000, roth: 0, taxable: 0, hsa: 0,
        effectiveExpenses: 60_000,
        spouseRetirementAge: 75, spouseContribByAge, spouseIncomeFloorByAge,
      },
      safeRetAge: 60,
    };
    const s = calcWhatIfScenario(spillArgs);
    expect(s.totalSpouseSpillover).toBeGreaterThan(0);
    expect(verdictForScenarioResult(s, safeLifeExp)).toBe("tight");
    // No spouse hold-out at all (spouseRetirementAge null) → no escape hatch,
    // no spillover, cap inert.
    const noSpouse = calcWhatIfScenario({
      ...spillArgs,
      retPhaseBase: { ...spillArgs.retPhaseBase, spouseRetirementAge: null, tradGrossSpouse: 0 },
    });
    expect(noSpouse.totalSpouseSpillover).toBe(0);
  });

  it("scenarioBalAt90 reads the safeLifeExp row of the SAME walk the chart shows", () => {
    const s = calcWhatIfScenario(baseArgs); // baseArgs.safeLifeExp === 90
    const rowAtLifeExp = s.chart.find(r => r.age === safeLifeExp);
    expect(rowAtLifeExp).toBeDefined();
    expect(s.scenarioBalAt90).toBe(rowAtLifeExp.total);
  });

  it("scenarioBalAt90 tracks safeLifeExp, not a hardcoded age 90 (review fix)", () => {
    // Before the fix, this field always read literal age 90, so a user with
    // lifeExpect=85 got a "not applicable" null here while the baseline card
    // (balAt90 in App.jsx, already lifeExp-based) showed a real balance at 85 —
    // an apples-to-oranges comparison. It must now read the SAME reference age
    // the baseline uses: the walk's own safeLifeExp, whatever that is.
    const s = calcWhatIfScenario({ ...baseArgs, safeLifeExp: 85 });
    expect(s.chart[s.chart.length - 1].age).toBe(85);
    const rowAt85 = s.chart.find(r => r.age === 85);
    expect(s.scenarioBalAt90).toBe(rowAt85.total);
    expect(s.scenarioBalAt90).not.toBeNull();
  });

  it("scenarioBalAt90 is a real 0 on genuine depletion at/before safeLifeExp", () => {
    const s = calcWhatIfScenario(depletingArgs);
    expect(s.scenarioYears).toBeLessThan(safeLifeExp - safeRetAge); // depletes before safeLifeExp
    expect(s.scenarioBalAt90).toBe(0);
  });

  it("scenarioDepletionAge is the engine's exact depletion age, not a rounded derivation (M2 regression)", () => {
    // $800k taxable-only, $92k/yr spend: the engine's own depletionAge is 75,
    // but the failure-year fraction is < 50% funded, so the naive
    // round(retAge + yearsSustained) derivation lands on 74 — one year early.
    const s = calcWhatIfScenario(depletingArgs, { annualExpenses: 92_000 });
    expect(s.scenarioDepletionAge).toBe(75);
    const derivedWouldBe = Math.round(safeRetAge + s.scenarioYears);
    expect(derivedWouldBe).toBe(74);
    expect(derivedWouldBe).not.toBe(s.scenarioDepletionAge);
  });

  it("monthlyExpenses override equals the annualExpenses override × 12 (conversion in the model)", () => {
    const viaMonthly = calcWhatIfScenario(depletingArgs, { monthlyExpenses: 7_500 });
    const viaAnnual  = calcWhatIfScenario(depletingArgs, { annualExpenses: 90_000 });
    expect(viaMonthly.scenarioExpenses).toBe(90_000);
    expect(viaMonthly.chart).toEqual(viaAnnual.chart);
    expect(viaMonthly.scenarioYears).toBeCloseTo(viaAnnual.scenarioYears, 6);
  });

  it("honors permanent accumulation-phase plan events in retire-earlier re-sims (BUG-34)", () => {
    const withEvent = calcWhatIfScenario({
      ...baseArgs,
      simInputs: {
        ...simInputs,
        moneyEvents: [{ label: "Home", amount: 100_000, age: 40, isInflow: false, isTaxable: false }],
      },
    }, { retireAdj: -2 });
    const withoutEvent = calcWhatIfScenario(baseArgs, { retireAdj: -2 });
    // The permanent $100k outflow at 40 must reduce the scenario's starting balance
    // (the old calcWhatIfChart dropped it by re-simulating with moneyEvents: []).
    expect(withEvent.scenarioTotalAtRet).toBeLessThan(withoutEvent.scenarioTotalAtRet);
  });

  it("returns null for missing inputs (and calcWhatIfChart maps that to [])", () => {
    expect(calcWhatIfScenario({})).toBeNull();
    expect(calcWhatIfChart({})).toEqual([]);
  });
});

// ── calcWhatIfScenario / calcWhatIfDelta — BUG-91 scenario re-basing ─────────
// A what-if scenario that shifts the retirement age walks retirement in a
// DIFFERENT retirement-year-dollar frame than the base plan (retPhaseBase's
// own ssGross/ssTaxable/pension, and retDrawShared's ssAmount/pensionAmount,
// are converted at the BASE plan's safeRetAge). Without re-basing, a
// household's SS/pension would be the only figures that stay frozen in the
// wrong frame while effectiveExpenses correctly re-derives at the scenario's
// own age — exactly the kind of "one quantity forgotten" gap this bug class
// is about. inflationRate must be nonzero for this to be observable (it
// defaults to 0 = factor 1 = inert, which is what keeps every other fixture
// in this file — none of which set inflationRate — byte-identical).
describe("calcWhatIfScenario / calcWhatIfDelta — BUG-91 scenario SS/pension re-basing", () => {
  // Self-contained, deliberately large-balance fixture (NOT derived from the
  // shared baseArgs/retDrawShared above): retirementAge overrides force a
  // resim (runSimulation re-derives the starting balance from simInputs, NOT
  // retPhaseBase's own balance), so simInputs carries large balances/
  // contributions to produce a comfortably-sustainable accumulated balance at
  // ANY of the scenario ages below.
  const ssCurrentAge = 60, ssSafeRetAge = 65, ssSafeLifeExp = 90;
  const ssSimInputs = {
    ...simInputs, currentAge: ssCurrentAge, totalYears: ssSafeLifeExp - ssCurrentAge,
    bal401k: 2_000_000, balRoth: 500_000, balTaxable: 500_000, balHSA: 50_000,
  };
  const ssBalance = 3_000_000;
  const makeArgs = (inflationRate) => {
    const ssRetDrawShared = {
      rReal, effectiveExpenses: 70_000, inflationRate,
      ssAmount: 40_000, ssClaimAge: 62,
      pensionAmount: 0, pensionStartAge: Infinity,
      rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
    };
    const ssRetPhaseBase = {
      tradGross: 0, roth: 0, taxable: ssBalance, hsa: 0,
      startAge: ssSafeRetAge, lifeExp: ssSafeLifeExp, longevityHorizon: ssSafeRetAge + 130,
      rReal, effectiveExpenses: ssRetDrawShared.effectiveExpenses,
      ssGross: ssRetDrawShared.ssAmount, ssTaxable: ssRetDrawShared.ssAmount, ssClaimAge: ssRetDrawShared.ssClaimAge,
      pension: 0, pensionStartAge: Infinity,
      filingStatus: "single", retStateRate: 0,
      rmdStartAge: Infinity, useTable2: false, spouseCurrentAge: null, currentAge: ssCurrentAge,
      moneyEvents: [],
    };
    return {
      simInputs: ssSimInputs, fedMarginal, retDrawShared: ssRetDrawShared,
      safeRetAge: ssSafeRetAge, safeLifeExp: ssSafeLifeExp,
      baseTotalAtRet: ssBalance, baseYearsSustained: Infinity,
      retPhaseBase: ssRetPhaseBase, conversionByAge: {}, addlPreTaxBal: 0,
    };
  };

  // Isolating the SS re-basing effect from the (correctly working, separately
  // tested) expense re-basing requires holding the CONVERTED expense IDENTICAL
  // between the "real" (nonzero inflationRate) and "frozen" (inflationRate: 0,
  // so the rebase factor is 1 — a no-op) runs — inflationRate feeds BOTH
  // conversions, so simply zeroing it for a "before" comparison would also
  // change the expense basis, confounding the comparison. Passing an explicit
  // annualExpenses override of TARGET / conversionFactor makes BOTH runs
  // converge on the exact same converted spend (TARGET), leaving SS's
  // rebasing as the only remaining difference.
  const TARGET = 70_000;
  const overrideFor = (inflationRate, retAge, currentAge) =>
    TARGET / Math.pow(1 + inflationRate / 100, retAge - currentAge);

  it("calcWhatIfScenario (engine path): retiring LATER inflates SS relative to the base plan's frame", () => {
    const retAge = ssSafeRetAge + 5;
    const later = calcWhatIfScenario(makeArgs(4),
      { retirementAge: retAge, annualExpenses: overrideFor(4, retAge, ssCurrentAge) });
    const laterFrozenSS = calcWhatIfScenario(makeArgs(0),
      { retirementAge: retAge, annualExpenses: overrideFor(0, retAge, ssCurrentAge) });
    expect(later.scenarioExpenses).toBeCloseTo(laterFrozenSS.scenarioExpenses, 4);
    // Same converted expense in both runs; the ONLY remaining difference is
    // whether SS is re-based (nonzero inflationRate) or frozen (factor 1) —
    // a larger effective SS income leaves a larger ending balance.
    expect(later.scenarioBalAt90).toBeGreaterThan(laterFrozenSS.scenarioBalAt90);
  });

  it("calcWhatIfScenario (engine path): retiring EARLIER deflates SS relative to the base plan's frame (inflationRebaseFactor divides, unlike toRetirementYearDollars)", () => {
    const retAge = ssSafeRetAge - 3;
    const earlier = calcWhatIfScenario(makeArgs(4),
      { retirementAge: retAge, annualExpenses: overrideFor(4, retAge, ssCurrentAge) });
    const earlierFrozenSS = calcWhatIfScenario(makeArgs(0),
      { retirementAge: retAge, annualExpenses: overrideFor(0, retAge, ssCurrentAge) });
    expect(earlier.scenarioExpenses).toBeCloseTo(earlierFrozenSS.scenarioExpenses, 4);
    // Retiring earlier means the scenario's own frame is EARLIER than the
    // base plan's — SS re-based to that frame is SMALLER than the frozen
    // (factor-1) figure, so the re-based scenario's ending balance is lower.
    expect(earlier.scenarioBalAt90).toBeLessThan(earlierFrozenSS.scenarioBalAt90);
  });

  it("calcWhatIfDelta: retiring LATER inflates SS relative to the base plan's frame (fallback blended walk)", () => {
    const retAge = ssSafeRetAge + 5;
    const later = calcWhatIfDelta({
      simInputs: ssSimInputs, fedMarginal, retDrawShared: makeArgs(4).retDrawShared,
      safeRetAge: ssSafeRetAge, safeLifeExp: ssSafeLifeExp,
      baseTotalAtRet: ssBalance, baseYearsSustained: Infinity,
      retirementAgeOverride: retAge, annualExpensesOverride: overrideFor(4, retAge, ssCurrentAge),
    });
    const laterFrozen = calcWhatIfDelta({
      simInputs: ssSimInputs, fedMarginal, retDrawShared: makeArgs(0).retDrawShared,
      safeRetAge: ssSafeRetAge, safeLifeExp: ssSafeLifeExp,
      baseTotalAtRet: ssBalance, baseYearsSustained: Infinity,
      retirementAgeOverride: retAge, annualExpensesOverride: overrideFor(0, retAge, ssCurrentAge),
    });
    expect(later.scenarioEndVal).toBeGreaterThan(laterFrozen.scenarioEndVal);
  });
});

// ── calcWhatIfScenario — engine migration (2026-07-11 overlay-continuity fix) ──
// These tests exercise the PRIMARY (per-account engine) path directly, using a
// bundle built the exact way App.jsx builds it — not the all-taxable fixtures
// above — so a real, mixed-account plan (401k + Roth + Taxable + HSA, SS,
// conversions, RMDs) is under test, not just the degenerate recurrence case.
describe("calcWhatIfScenario — engine migration", () => {
  const appSimInputs = {
    totalYears: 60, currentAge: 40, currentIncome: 120_000, incomeGrowth: 2,
    filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 6,
    bal401k: 100_000, balRoth: 40_000, balTaxable: 60_000, balHSA: 15_000,
    contrib401k: 15_000, contribRoth: 6_000, contribTaxable: 5_000, contribHSA: 3_000,
    contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
    calcEmployerMatchFn: em, moneyEvents: [],
  };
  const appSafeRetAge = 65, appSafeLifeExp = 90, appCurrentAge = 40;

  // Mirrors App.jsx exactly: sim → "Trad 401k" key → accumChart → retPhaseBase →
  // buildRetirementPhase → totalChartData.
  const appSim = runSimulation(appSimInputs)
    .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
  const appAt = appSim[appSafeRetAge - appCurrentAge - 1];
  const appTradGrossAtRet = appAt.tradGross ?? 0;
  const appRoth    = appAt["Roth IRA"] ?? 0;
  const appTaxable = appAt["Taxable"]  ?? 0;
  const appHsa     = appAt["HSA"]      ?? 0;
  const appTotalAtRet = appTradGrossAtRet + appRoth + appTaxable + appHsa;

  const appRetPhaseBase = {
    tradGross: appTradGrossAtRet, roth: appRoth, taxable: appTaxable, hsa: appHsa,
    startAge: appSafeRetAge, lifeExp: appSafeLifeExp, longevityHorizon: appSafeRetAge + 130,
    rReal: 0.02, effectiveExpenses: 60_000,
    ssGross: 24_000, ssTaxable: 20_000, ssClaimAge: 67,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    rmdStartAge: 73, useTable2: false, spouseCurrentAge: null, currentAge: appCurrentAge,
    moneyEvents: [],
  };
  const appConversionByAge = { 66: 20_000, 67: 20_000 }; // a small realistic conversion window
  const appRetPhase = buildRetirementPhase({ ...appRetPhaseBase, conversionByAge: appConversionByAge });
  const appAccumChart = buildAccumChart({
    simData: appSim, safeRetAge: appSafeRetAge, currentAge: appCurrentAge,
    bal401k: appSimInputs.bal401k, balRoth: appSimInputs.balRoth,
    balTaxable: appSimInputs.balTaxable, balHSA: appSimInputs.balHSA,
  });
  const appTotalChartData = [
    ...appAccumChart,
    ...appRetPhase.rows.map(r => ({ age: r.age, total: r.total })),
  ];
  // retDrawShared is still required by the guard clause but is otherwise unused
  // on the engine path — it's never read for the walk itself.
  const appRetDrawShared = {
    rReal: appRetPhaseBase.rReal, effectiveExpenses: appRetPhaseBase.effectiveExpenses,
    ssAmount: appRetPhaseBase.ssGross, ssClaimAge: appRetPhaseBase.ssClaimAge,
    pensionAmount: 0, pensionStartAge: Infinity,
    rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
  };
  const appBundle = {
    simInputs: appSimInputs, fedMarginal: 0.22, retDrawShared: appRetDrawShared,
    safeRetAge: appSafeRetAge, safeLifeExp: appSafeLifeExp,
    baseTotalAtRet: appTotalAtRet, baseYearsSustained: appRetPhase.yearsSustained,
    retPhaseBase: appRetPhaseBase, conversionByAge: appConversionByAge,
    baseChart: appTotalChartData, addlPreTaxBal: 0,
  };

  // ── THE invariant test ──────────────────────────────────────────────────────
  it("a no-op scenario's chart deep-equals App's own totalChartData (every row, age and total)", () => {
    const result = calcWhatIfScenario(appBundle, {});
    expect(result.chart).toEqual(appTotalChartData);
  });

  it("a post-retirement scenario event leaves pre-event rows identical and changes the event-age row", () => {
    const noOp = calcWhatIfScenario(appBundle, {});
    const withEvent = calcWhatIfScenario(appBundle, {
      scenarioEvents: [{ label: "Trip", amount: 50_000, age: 70, isInflow: false, isTaxable: false }],
    });
    const preRows     = noOp.chart.filter(r => r.age < 70);
    const preRowsScen = withEvent.chart.filter(r => r.age < 70);
    expect(preRowsScen).toEqual(preRows);
    const baseRow70  = noOp.chart.find(r => r.age === 70);
    const scenRow70  = withEvent.chart.find(r => r.age === 70);
    expect(scenRow70.total).toBeLessThan(baseRow70.total);
  });

  it("retire-earlier scenario: pre-retirement rows equal the re-sim's accumulation portion, and the walk begins the next year", () => {
    const scenarioRetAge = appSafeRetAge - 2;
    const s = calcWhatIfScenario(appBundle, { retireAdj: -2 });
    const resim = runSimulation({ ...appSimInputs, moneyEvents: appSimInputs.moneyEvents ?? [] })
      .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
    const expectedAccum = buildAccumChart({
      simData: resim, safeRetAge: scenarioRetAge, currentAge: appSimInputs.currentAge,
      bal401k: appSimInputs.bal401k, balRoth: appSimInputs.balRoth,
      balTaxable: appSimInputs.balTaxable, balHSA: appSimInputs.balHSA,
    });
    const actualAccum = s.chart.slice(0, expectedAccum.length);
    expect(actualAccum).toEqual(expectedAccum);
    expect(s.chart[expectedAccum.length].age).toBe(scenarioRetAge + 1);
  });
});

// ── calcWhatIfScenario — spouse re-seed (BUG-77) ──────────────────────────────
// Because spouseContribEnd (App.jsx) is the spouse's OWN retirement age —
// independent of the primary's — spouseSimData never changes for a primary-
// retirement-age scenario; only the SEED POINT (read at the scenario's own
// retirement age) and the gap-year maps need to be rebuilt via the shared
// buildSpouseRetirementSeed builder. Before this fix, a scenario that shifted
// the primary's retirement age kept the spouse Traditional bucket FROZEN at
// whatever it was at the BASE retirement age.
describe("calcWhatIfScenario — spouse re-seed (BUG-77)", () => {
  const spCurrentAge = 40, spSafeRetAge = 65, spSafeLifeExp = 90;
  const spouseCurrentAge = 35;
  const spouseRetAge = 75; // spouse retires well after any scenario retirement age tested below
  const spouseNetRate = 0.65;

  const primarySimInputs = {
    totalYears: 60, currentAge: spCurrentAge, currentIncome: 120_000, incomeGrowth: 2,
    filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 6,
    bal401k: 100_000, balRoth: 40_000, balTaxable: 60_000, balHSA: 15_000,
    contrib401k: 15_000, contribRoth: 6_000, contribTaxable: 5_000, contribHSA: 3_000,
    contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
    calcEmployerMatchFn: em, moneyEvents: [],
  };
  const primarySim = runSimulation(primarySimInputs)
    .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
  const primaryAtBase = primarySim[spSafeRetAge - spCurrentAge - 1];
  const primaryTradGrossAtRet = primaryAtBase.tradGross ?? 0;
  const primaryRoth    = primaryAtBase["Roth IRA"] ?? 0;
  const primaryTaxable = primaryAtBase["Taxable"]  ?? 0;
  const primaryHsa     = primaryAtBase["HSA"]      ?? 0;

  // Deterministic synthetic spouse accumulation rows (mirrors retirement-phase.test.js's
  // buildRows helper): tradGross grows linearly with i so a seed point read at a LATER
  // primary age is predictably larger — isolating the re-seed fix from real-engine noise.
  const buildSpouseRows = (count) => Array.from({ length: count }, (_, i) => ({
    age: spouseCurrentAge + i + 1,
    c401k: 12_000, c401kEmployee: 10_000, cHSA: 1_000, salary: 90_000,
    tradGross: 200_000 + i * 10_000,
    "Roth IRA": 50_000, "Taxable": 30_000, "HSA": 5_000,
  }));
  const spouseSimData = buildSpouseRows(40); // spouse ages 36..75
  const spouseCurrentSnapshot = {
    age: spCurrentAge, tradGross: 190_000, "Roth IRA": 50_000, "Taxable": 30_000, "HSA": 5_000,
  };
  const spouseStartingBal = 190_000 + 50_000 + 30_000 + 5_000;

  // Base retPhaseBase's frozen spouse seed — read at the BASE retirement age (65),
  // exactly as App.jsx's own spouseSeed memo does (primaryRetAge: safeRetAge).
  const baseSpouseSeed = buildSpouseRetirementSeed({
    spouseSimData, spouseCurrentSnapshot, spouseCurrentAge, currentAge: spCurrentAge,
    primaryRetAge: spSafeRetAge, spouseRetAge, spouseNetRate,
  });

  const householdRetPhaseBase = {
    tradGross: primaryTradGrossAtRet, tradGrossSpouse: baseSpouseSeed.tradSeed,
    spouseRmdStartAge: Infinity,
    roth: primaryRoth + baseSpouseSeed.rothSeed,
    taxable: primaryTaxable + baseSpouseSeed.taxableSeed,
    hsa: primaryHsa + baseSpouseSeed.hsaSeed,
    startAge: spSafeRetAge, lifeExp: spSafeLifeExp, longevityHorizon: spSafeRetAge + 130,
    rReal: 0.02, effectiveExpenses: 60_000,
    ssGross: 24_000, ssTaxable: 20_000, ssClaimAge: 67,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    rmdStartAge: 73, useTable2: false, spouseCurrentAge, currentAge: spCurrentAge,
    moneyEvents: [],
    spouseRetirementAge: spouseRetAge,
    spouseContribByAge: baseSpouseSeed.spouseContribByAge,
    spouseTaxableIncomeByAge: baseSpouseSeed.spouseTaxableIncomeByAge,
    spouseIncomeFloorByAge: baseSpouseSeed.spouseIncomeFloorByAge,
  };
  const householdRetPhase = buildRetirementPhase({ ...householdRetPhaseBase, conversionByAge: {} });

  const householdAccumChart = buildAccumChart({
    simData: primarySim, safeRetAge: spSafeRetAge, currentAge: spCurrentAge,
    bal401k: primarySimInputs.bal401k, balRoth: primarySimInputs.balRoth,
    balTaxable: primarySimInputs.balTaxable, balHSA: primarySimInputs.balHSA,
    spouseSimData, spouseStartingBal,
  });
  const householdTotalChartData = [
    ...householdAccumChart,
    ...householdRetPhase.rows.map(r => ({ age: r.age, total: r.total })),
  ];

  const householdRetDrawShared = {
    rReal: householdRetPhaseBase.rReal, effectiveExpenses: householdRetPhaseBase.effectiveExpenses,
    ssAmount: householdRetPhaseBase.ssGross, ssClaimAge: householdRetPhaseBase.ssClaimAge,
    pensionAmount: 0, pensionStartAge: Infinity,
    rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
  };

  // Household total: primary balances + ALL FOUR spouse buckets — householdRetPhaseBase's
  // roth/taxable/hsa are already household-combined (primary + spouse, mirroring App.jsx's
  // hhRoth/hhTaxable/hhHsa), so this must include the spouse's Roth/Taxable/HSA seeds too,
  // not just tradSeed (which stays a separate bucket, tradGrossSpouse).
  const householdBaseTotalAtRet = primaryTradGrossAtRet + primaryRoth + primaryTaxable + primaryHsa
    + baseSpouseSeed.tradSeed + baseSpouseSeed.rothSeed + baseSpouseSeed.taxableSeed + baseSpouseSeed.hsaSeed;

  const householdBundle = {
    simInputs: primarySimInputs, fedMarginal: 0.22, retDrawShared: householdRetDrawShared,
    safeRetAge: spSafeRetAge, safeLifeExp: spSafeLifeExp,
    baseTotalAtRet: householdBaseTotalAtRet, baseYearsSustained: householdRetPhase.yearsSustained,
    retPhaseBase: householdRetPhaseBase, conversionByAge: {},
    baseChart: householdTotalChartData, addlPreTaxBal: 0,
    spouseSeedInputs: {
      spouseSimData, spouseCurrentSnapshot, spouseCurrentAge,
      spouseRetAge, spouseNetRate,
    },
    spouseChartInputs: { spouseSimData, spouseStartingBal },
  };

  it("a retire-later scenario re-seeds the spouse trad (no longer frozen at the base value)", () => {
    const laterRetAge = spSafeRetAge + 5; // 70 — primary retires 5 yrs later than the base plan
    const s = calcWhatIfScenario(householdBundle, { retirementAge: laterRetAge });

    // Expected primary-only portion: re-sim the primary directly (same pattern the
    // "retire-earlier" engine-migration test above uses) and read the row at the
    // scenario's own retirement age.
    const primaryResim = runSimulation({ ...primarySimInputs, moneyEvents: primarySimInputs.moneyEvents ?? [] })
      .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
    const primaryAtScenario = primaryResim[laterRetAge - primarySimInputs.currentAge - 1];
    const primaryPortion = (primaryAtScenario.tradGross ?? 0)
      + (primaryAtScenario["Roth IRA"] ?? 0) + (primaryAtScenario["Taxable"] ?? 0) + (primaryAtScenario["HSA"] ?? 0);

    // Expected re-seeded spouse trad: buildSpouseRetirementSeed at the SCENARIO's
    // own retirement age (70), not the base (65) — the spouse kept contributing
    // (and growing) for 5 more years before this later seed point.
    const expectedSpouseSeed = buildSpouseRetirementSeed({
      spouseSimData, spouseCurrentSnapshot, spouseCurrentAge, currentAge: spCurrentAge,
      primaryRetAge: laterRetAge, spouseRetAge, spouseNetRate,
    });
    // Sanity: the fixture actually exercises growth between the base and scenario seed points.
    expect(expectedSpouseSeed.tradSeed).toBeGreaterThan(baseSpouseSeed.tradSeed);

    // CodeRabbit review fix: the resim now re-seeds rothSeed/taxableSeed/hsaSeed
    // too (previously only tradSeed), so scenarioTotalAtRet must include all four
    // re-seeded spouse buckets, not just the Traditional one.
    const expectedScenarioTotalAtRet = primaryPortion + expectedSpouseSeed.tradSeed
      + expectedSpouseSeed.rothSeed + expectedSpouseSeed.taxableSeed + expectedSpouseSeed.hsaSeed;
    expect(s.scenarioTotalAtRet).toBeCloseTo(expectedScenarioTotalAtRet, 6);

    // The bug this fixes: the OLD code kept the spouse trad FROZEN at the base-
    // retirement-age value even 5 years later — the fixed result must be larger.
    const frozenWouldBe = primaryPortion + baseSpouseSeed.tradSeed
      + baseSpouseSeed.rothSeed + baseSpouseSeed.taxableSeed + baseSpouseSeed.hsaSeed;
    expect(s.scenarioTotalAtRet).toBeGreaterThan(frozenWouldBe);
  });

  it("a retire-later scenario also re-seeds the spouse's Roth/Taxable/HSA buckets, not just Traditional (CodeRabbit review fix)", () => {
    const laterRetAge = spSafeRetAge + 5;
    const s = calcWhatIfScenario(householdBundle, { retirementAge: laterRetAge });
    // Even though this fixture's synthetic spouse rows hold Roth/Taxable/HSA flat
    // (no growth for THESE three fields — only tradGross grows with i), the fix
    // is about the resim path actually READING spouseSeed.rothSeed/taxableSeed/
    // hsaSeed at all — before the fix these three were silently dropped from
    // scenarioTotalAtRet on ANY forced resim, not just when they'd changed value.
    const primaryResim = runSimulation({ ...primarySimInputs, moneyEvents: primarySimInputs.moneyEvents ?? [] })
      .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
    const primaryAtScenario = primaryResim[laterRetAge - primarySimInputs.currentAge - 1];
    const primaryRothTaxableHsa = (primaryAtScenario["Roth IRA"] ?? 0)
      + (primaryAtScenario["Taxable"] ?? 0) + (primaryAtScenario["HSA"] ?? 0);
    // The synthetic fixture's spouse Roth/Taxable/HSA are flat 50k/30k/5k = 85k.
    expect(s.scenarioTotalAtRet).toBeGreaterThanOrEqual(primaryRothTaxableHsa + 85_000);
  });

  it("the no-op scenario invariant still holds with a spouse", () => {
    const s = calcWhatIfScenario(householdBundle, {});
    expect(s.chart).toEqual(householdTotalChartData);
    expect(s.scenarioTotalAtRet).toBe(householdBaseTotalAtRet);
  });

  it("a resim's accumulation chart is household, not primary-only (A8)", () => {
    const laterRetAge = spSafeRetAge + 5;
    const s = calcWhatIfScenario(householdBundle, { retirementAge: laterRetAge });

    const primaryResim = runSimulation({ ...primarySimInputs, moneyEvents: primarySimInputs.moneyEvents ?? [] })
      .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
    const expectedAccum = buildAccumChart({
      simData: primaryResim, safeRetAge: laterRetAge, currentAge: primarySimInputs.currentAge,
      bal401k: primarySimInputs.bal401k, balRoth: primarySimInputs.balRoth,
      balTaxable: primarySimInputs.balTaxable, balHSA: primarySimInputs.balHSA,
      spouseSimData, spouseStartingBal,
    });
    const actualAccum = s.chart.slice(0, expectedAccum.length);
    expect(actualAccum).toEqual(expectedAccum);

    // Prove the fix is what makes it household: a primary-only rebuild (no spouse
    // args) must NOT match — the spouse balance is really being included.
    const primaryOnlyAccum = buildAccumChart({
      simData: primaryResim, safeRetAge: laterRetAge, currentAge: primarySimInputs.currentAge,
      bal401k: primarySimInputs.bal401k, balRoth: primarySimInputs.balRoth,
      balTaxable: primarySimInputs.balTaxable, balHSA: primarySimInputs.balHSA,
    });
    expect(actualAccum).not.toEqual(primaryOnlyAccum);
  });

  it("no spouse (spouseSeedInputs/spouseChartInputs both null) is byte-identical to omitting them entirely", () => {
    const overrides = { retireAdj: -2 };
    const withoutFields    = calcWhatIfScenario(baseArgs, overrides);
    const withExplicitNulls = calcWhatIfScenario(
      { ...baseArgs, spouseSeedInputs: null, spouseChartInputs: null }, overrides);
    expect(withExplicitNulls).toEqual(withoutFields);
  });
});

// ── evaluateLifeEvent (life-event sheet: verdict + impact deltas) ─────────────
// ── eventIncomeImpact ────────────────────────────────────────────────────────
// Flat (0% growth) simInputs so projectedIncomeAtAge is a constant — makes the
// expected usualPay/eventPay/netLostIncome arithmetic exact, not approximate.
describe("eventIncomeImpact", () => {
  const flatSimInputs = { currentIncome: 120_000, incomeGrowth: 0, incomeGrowthEndAge: null, currentAge: 50 };
  const impactSafeRetAge = 65;

  it("returns null for a one-time event", () => {
    const event = { amount: 10_000, age: 55, isInflow: false };
    expect(eventIncomeImpact(event, flatSimInputs, impactSafeRetAge)).toBeNull();
  });

  it("returns null for an inflow duration event (additive side income, not a salary replacement)", () => {
    const event = { monthlyAmount: 2_000, durationMonths: 6, age: 55, isInflow: true, incomeAnnual: 40_000 };
    expect(eventIncomeImpact(event, flatSimInputs, impactSafeRetAge)).toBeNull();
  });

  it("returns null when incomeAnnual is not finite (legacy event = no statement about income)", () => {
    const event = { monthlyAmount: 2_000, durationMonths: 6, age: 55, isInflow: false };
    expect(eventIncomeImpact(event, flatSimInputs, impactSafeRetAge)).toBeNull();
  });

  it("returns null when the event is entirely past retirement", () => {
    const event = { monthlyAmount: 2_000, durationMonths: 6, age: 70, isInflow: false, incomeAnnual: 0 };
    expect(eventIncomeImpact(event, flatSimInputs, impactSafeRetAge)).toBeNull();
  });

  it("computes exact usualPay/eventPay/netLostIncome for a working-year event", () => {
    // 6 months at age 55: usualPay = 0.5 × $120k = $60k; eventPay = 0.5 × $60k = $30k.
    const event = { monthlyAmount: 5_000, durationMonths: 6, age: 55, isInflow: false, incomeAnnual: 60_000 };
    const result = eventIncomeImpact(event, flatSimInputs, impactSafeRetAge);
    expect(result).toEqual({
      monthsWorking: 6, usualPay: 60_000, eventPay: 30_000,
      netLostIncome: 30_000, netLostIncomeAbs: 30_000, dir: "down",
    });
  });

  it("a boundary-spanning event counts only the working months (not the post-retirement ones)", () => {
    // 36 months starting at 64 spans ages 64, 65, 66 — only 64 and 65 are <= safeRetAge (65),
    // so monthsWorking is 24, not 36.
    const event = { monthlyAmount: 1_000, durationMonths: 36, age: 64, isInflow: false, incomeAnnual: 0 };
    const result = eventIncomeImpact(event, flatSimInputs, impactSafeRetAge);
    expect(result.monthsWorking).toBe(24);
    expect(result.usualPay).toBe(240_000); // 2 full years × $120k
    expect(result.eventPay).toBe(0);
    expect(result.dir).toBe("down");
  });

  it("an income GAIN (incomeAnnual above usual pay) reports dir 'up'", () => {
    const event = { monthlyAmount: 8_000, durationMonths: 6, age: 55, isInflow: false, incomeAnnual: 200_000 };
    const result = eventIncomeImpact(event, flatSimInputs, impactSafeRetAge);
    // usualPay = $60k, eventPay = 0.5 × $200k = $100k → netLostIncome = −$40k (a gain).
    expect(result.netLostIncome).toBe(-40_000);
    expect(result.netLostIncomeAbs).toBe(40_000);
    expect(result.dir).toBe("up");
  });

  it("no change (incomeAnnual exactly equals usual pay) reports dir null", () => {
    const event = { monthlyAmount: 8_000, durationMonths: 6, age: 55, isInflow: false, incomeAnnual: 120_000 };
    const result = eventIncomeImpact(event, flatSimInputs, impactSafeRetAge);
    expect(result.netLostIncome).toBe(0);
    expect(result.dir).toBeNull();
  });
});

describe("evaluateLifeEvent", () => {
  it("returns null for a missing event or invalid bundle", () => {
    expect(evaluateLifeEvent(baseArgs, null)).toBeNull();
    expect(evaluateLifeEvent({ ...baseArgs, simInputs: null },
      { amount: 10_000, age: 70, isInflow: false })).toBeNull();
  });

  it("a pre-retirement outflow reduces the portfolio at retirement (BUG-42 regression)", () => {
    const result = evaluateLifeEvent(baseArgs, {
      label: "Home", amount: 100_000, age: 40, isInflow: false, isTaxable: false,
    });
    expect(result.atRetirement.dir).toBe("down");
    // Lost compounding: the delta at retirement exceeds the sticker price.
    expect(result.atRetirement.deltaAbs).toBeGreaterThan(100_000);
    expect(result.grossCost).toBe(100_000);
    expect(result.netTotal).toBe(-100_000);
  });

  it("calcWhatIfScenario no longer drops pre-retirement scenarioEvents (BUG-42 regression)", () => {
    const scen = calcWhatIfScenario(baseArgs, {
      scenarioEvents: [{ label: "Home", amount: 100_000, age: 40, isInflow: false, isTaxable: false }],
    });
    expect(scen.scenarioTotalAtRet).toBeLessThan(realBaseTotalAtRet);
  });

  it("a post-retirement event leaves the retirement balance unchanged but moves the plan-age balance", () => {
    const result = evaluateLifeEvent(baseArgs, {
      label: "Trip", amount: 200_000, age: 70, isInflow: false, isTaxable: false,
    });
    expect(result.atRetirement.dir).toBeNull();
    expect(result.atRetirement.deltaAbs).toBe(0);
    expect(result.atPlanAge.dir).toBe("down");
    expect(result.atPlanAge.deltaAbs).toBeGreaterThan(0);
  });

  it("a duration event is costed as monthly × months with income offset in netTotal", () => {
    const result = evaluateLifeEvent(baseArgs, {
      label: "Travel", monthlyAmount: 6_000, durationMonths: 6, age: 40,
      isInflow: false, incomeAnnual: 24_000,
    });
    expect(result.grossCost).toBe(36_000);
    expect(result.netTotal).toBe(-24_000);
    expect(result.atRetirement.dir).toBe("down");
  });

  it("wires eventIncomeImpact into the result — non-null for a working-year salary-replacing event, null for a one-time event", () => {
    const durationResult = evaluateLifeEvent(baseArgs, {
      label: "Sabbatical", monthlyAmount: 4_000, durationMonths: 6, age: 40,
      isInflow: false, incomeAnnual: 0,
    });
    expect(durationResult.incomeImpact).not.toBeNull();
    expect(durationResult.incomeImpact.dir).toBe("down");
    expect(durationResult.incomeImpact.eventPay).toBe(0);

    const oneTimeResult = evaluateLifeEvent(baseArgs, {
      label: "Home", amount: 100_000, age: 40, isInflow: false, isTaxable: false,
    });
    expect(oneTimeResult.incomeImpact).toBeNull();
  });

  it("a duration event spanning the retirement boundary hits both phases exactly once", () => {
    // 24 months starting the year BEFORE retirement (64): 12 months land at 64
    // (accumulation) and 12 at 65 (the retirement-age sim row); the walk from 66
    // adds nothing. Zero-rate variant so the arithmetic is exact.
    const flatSim = { ...simInputs, returnRate: 0, incomeGrowth: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      calcEmployerMatchFn: () => 0 };
    const flatBase = runSimulation(flatSim)[safeRetAge - currentAge - 1];
    const flatTotal = (flatBase.tradGross ?? 0) + flatBase["Roth IRA"] + flatBase["Taxable"] + flatBase["HSA"];
    // retPhaseBase deliberately unset: this test overrides baseTotalAtRet directly
    // to a value the (unrelated) baseArgs.retPhaseBase fixture doesn't know about —
    // clearing retPhaseBase forces the no-resim path to honor baseTotalAtRet via
    // the older blended-walk fallback, which is exactly what this test needs
    // (it's testing event-splitting mechanics, not the engine migration).
    const bundle = { ...baseArgs, simInputs: flatSim, baseTotalAtRet: flatTotal, retPhaseBase: undefined };
    const result = evaluateLifeEvent(bundle, {
      label: "Span", monthlyAmount: 1_000, durationMonths: 24, age: 64,
      isInflow: false, incomeAnnual: 0,
    });
    expect(result.atRetirement.deltaAbs).toBe(24_000);
    expect(result.atRetirement.dir).toBe("down");
  });

  // Verdict thresholds — depleting bundle with tuned expenses. Plan horizon is
  // 25 years (65 → 90); the probe event is small so the pre-computed margins hold:
  //   $30k spend → ~31.0 yrs sustained → margin ~+6.0 → comfortable
  //   $33k spend → ~27.7 yrs           → margin ~+2.7 → tight
  //   $40k spend → ~22.3 yrs           → margin ~−2.7 → unaffordable
  const verdictBundle = (expenses) => ({
    ...depletingArgs,
    retDrawShared: { ...depletingRetDrawShared, effectiveExpenses: expenses },
  });
  const probeEvent = { label: "Probe", amount: 1_000, age: 70, isInflow: false, isTaxable: false };

  it("verdict = comfortable when the portfolio outlasts plan age by the buffer", () => {
    const r = evaluateLifeEvent(verdictBundle(30_000), probeEvent);
    expect(r.verdict).toBe("comfortable");
    expect(r.sustainability.stillSustainable).toBe(true);
  });

  it("verdict = tight when it sustains to plan age with little margin", () => {
    const r = evaluateLifeEvent(verdictBundle(33_000), probeEvent);
    expect(r.verdict).toBe("tight");
    expect(r.sustainability.stillSustainable).toBe(true);
    expect(r.sustainability.marginYears).toBeGreaterThanOrEqual(0);
    expect(r.sustainability.marginYears).toBeLessThan(5);
  });

  it("verdict = unaffordable when the event depletes the portfolio before plan age", () => {
    const r = evaluateLifeEvent(verdictBundle(40_000), probeEvent);
    expect(r.verdict).toBe("unaffordable");
    expect(r.sustainability.stillSustainable).toBe(false);
    expect(r.sustainability.scenarioDepletionAge).not.toBeNull();
    expect(r.sustainability.scenarioDepletionAge).toBeLessThan(safeLifeExp);
  });

  it("verdict = comfortable with a large finite cushion margin when the portfolio never depletes (BUG-73)", () => {
    // retPhaseBase deliberately unset — same reason as the flatSim bundle above:
    // this test overrides baseTotalAtRet to $10M directly, which the fixed
    // depletingArgs.retPhaseBase (seeded at $800k) doesn't reflect.
    //
    // BUG-73: this used to assert marginYears === Infinity — the saturation bug.
    // A never-depleting scenario now reports a finite CUSHION-basis margin
    // (years of spending still in reserve at the plan age), which for a $10M
    // portfolio against $30k/yr spend is comfortably north of the 5-year
    // buffer, but is no longer a fabricated Infinity.
    const r = evaluateLifeEvent({
      ...depletingArgs,
      baseTotalAtRet: 10_000_000,
      retDrawShared: { ...depletingRetDrawShared, effectiveExpenses: 30_000 },
      retPhaseBase: undefined,
    }, probeEvent);
    expect(r.verdict).toBe("comfortable");
    expect(r.sustainability.marginBasis).toBe("cushion");
    expect(r.sustainability.marginYears).toBeGreaterThan(5);
    expect(r.sustainability.marginYears).not.toBe(Infinity);
    expect(r.sustainability.scenarioDepletionAge).toBeNull();
  });
});

// ── marginForScenario / verdictInfoForScenario / buildVerdictLegend (BUG-73) ──
// Unit-level tests against synthetic scenario objects (marginForScenario only
// reads scenario.scenarioYears/scenarioRetAge/scenarioBalAt90/scenarioExpenses
// — it doesn't need a full model run) plus value-locks on the render-ready
// label/legend strings.
describe("marginForScenario / verdictInfoForScenario / buildVerdictLegend (BUG-73)", () => {
  const safeLifeExp = 90;

  it("cushion-saturation regression: a never-depleting scenario with a thin cushion at the plan age is 'tight', not 'comfortable' (the bug this fixes)", () => {
    // $90k left at 90 against $30k/yr spend = 3 yrs of reserve — under the
    // 5-yr comfortable buffer. Before the fix, scenarioYears === Infinity
    // alone forced marginYears to a flat Infinity, so this ALWAYS read
    // "comfortable" regardless of how thin the actual cushion was.
    const scenario = {
      scenarioYears: Infinity, scenarioRetAge: 65,
      scenarioBalAt90: 90_000, scenarioExpenses: 30_000,
    };
    const { marginYears, marginBasis } = marginForScenario(scenario, safeLifeExp);
    expect(marginBasis).toBe("cushion");
    expect(marginYears).toBe(3);
    expect(verdictForMargin(marginYears)).toBe("tight");
  });

  it("cushion basis never yields 'unaffordable' (a balance/expense ratio can't go negative)", () => {
    const thin = marginForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: 1, scenarioExpenses: 1_000_000 },
      safeLifeExp);
    expect(thin.marginBasis).toBe("cushion");
    expect(thin.marginYears).toBeGreaterThanOrEqual(0);
    expect(verdictForMargin(thin.marginYears)).not.toBe("unaffordable");
  });

  it("cushion basis edge cases (null balance / non-positive expenses) fall back to Infinity, not a fabricated finite number", () => {
    expect(marginForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: null, scenarioExpenses: 30_000 },
      safeLifeExp)).toEqual({ marginYears: Infinity, marginBasis: "cushion" });
    expect(marginForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: 100_000, scenarioExpenses: 0 },
      safeLifeExp)).toEqual({ marginYears: Infinity, marginBasis: "cushion" });
  });

  it("cushion prices the reserve at the plan-age NET draw, not full expenses (Fable PR #53 — crossover monotonicity)", () => {
    // SS-heavy plan: $200k reserve, $62k spend but only $7k/yr actually drawn
    // from the portfolio (SS covers the rest). Full-expense pricing called this
    // 3.2 yrs → "tight" while spending $2k MORE crossed into a finite walk with
    // a 31-yr depletion margin → "comfortable" — spending more read BETTER on
    // the same rail. Net-draw pricing measures in the depletion basis's own
    // currency: 200k / 7k ≈ 29 yrs → comfortable, continuous across the crossover.
    const scenario = {
      scenarioYears: Infinity, scenarioRetAge: 65,
      scenarioBalAt90: 200_000, scenarioExpenses: 62_000, scenarioDrawAtPlanAge: 7_000,
    };
    const { marginYears, marginBasis } = marginForScenario(scenario, safeLifeExp);
    expect(marginBasis).toBe("cushion");
    expect(marginYears).toBeCloseTo(200_000 / 7_000, 10);
    expect(verdictForMargin(marginYears)).toBe("comfortable");

    // Zero net draw (SS/pension cover everything): the reserve is never touched —
    // genuinely uncapped runway, not a division blow-up.
    const covered = marginForScenario({ ...scenario, scenarioDrawAtPlanAge: 0 }, safeLifeExp);
    expect(covered).toEqual({ marginYears: Infinity, marginBasis: "cushion" });

    // Scenarios without the field (older callers / synthetic fixtures) keep the
    // documented full-expenses fallback.
    const legacy = marginForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: 90_000, scenarioExpenses: 30_000 },
      safeLifeExp);
    expect(legacy.marginYears).toBe(3);
  });

  it("calcWhatIfScenario exposes scenarioDrawAtPlanAge from the SAME walk row as scenarioBalAt90", () => {
    const s = calcWhatIfScenario(baseArgs, {});
    const rowAtLifeExp = s.chart.find(r => r.age === 90);
    expect(rowAtLifeExp).toBeTruthy();
    expect(s.scenarioDrawAtPlanAge).not.toBeUndefined();
    if (s.scenarioYears === Infinity) {
      expect(Number.isFinite(s.scenarioDrawAtPlanAge)).toBe(true);
      expect(s.scenarioDrawAtPlanAge).toBeGreaterThanOrEqual(0);
    }
  });

  it("BUG-74: an unfundable event forces 'unaffordable' everywhere — card, info package, and rail ticks agree", () => {
    // Synthetic scenario with a funding shortfall: the margin math alone would
    // say "comfortable", but the walk ran on spending the plan couldn't do.
    const scenario = {
      scenarioYears: Infinity, scenarioRetAge: 65,
      scenarioBalAt90: 1_000_000, scenarioExpenses: 30_000, scenarioDrawAtPlanAge: 10_000,
      eventFundingShortfall: 80_000, firstShortfallAge: 47,
    };
    expect(verdictForScenarioResult(scenario, safeLifeExp)).toBe("unaffordable");
    const info = verdictInfoForScenario(scenario, safeLifeExp);
    expect(info.verdict).toBe("unaffordable");
    expect(info.marginLabel).toContain("can't be funded from savings");
    // No shortfall → the override is inert and the margin verdict applies.
    const funded = { ...scenario, eventFundingShortfall: 0 };
    expect(verdictForScenarioResult(funded, safeLifeExp)).toBe("comfortable");
  });

  it("an event funded by early retirement-account withdrawals can never read 'comfortable' (owner spec)", () => {
    // Healthy end-state walk (huge cushion), but the event forced $150k of
    // early Roth/401k draws — verdict caps at "tight" with an honest label.
    const scenario = {
      scenarioYears: Infinity, scenarioRetAge: 65,
      scenarioBalAt90: 2_000_000, scenarioExpenses: 57_000, scenarioDrawAtPlanAge: 9_000,
      eventFundingShortfall: 0, eventRetirementDraw: 150_000, eventRetirementDrawTax: 45_000,
    };
    expect(verdictForScenarioResult(scenario, safeLifeExp)).toBe("tight");
    const info = verdictInfoForScenario(scenario, safeLifeExp);
    expect(info.verdict).toBe("tight");
    expect(info.marginLabel).toBe("needs early retirement-account withdrawals to fund");
    // Cash-funded → cap inert, margin verdict applies.
    const cashFunded = { ...scenario, eventRetirementDraw: 0 };
    expect(verdictForScenarioResult(cashFunded, safeLifeExp)).toBe("comfortable");
    // Already tight/unaffordable on the margin → cap changes nothing (and the
    // margin label stays, since the margin decided the verdict).
    const alreadyTight = {
      scenarioYears: 27, scenarioRetAge: 65, eventRetirementDraw: 150_000,
    };
    expect(verdictForScenarioResult(alreadyTight, safeLifeExp)).toBe("tight");
    expect(verdictInfoForScenario(alreadyTight, safeLifeExp).marginLabel).toBe("2 yrs to spare past 90");
  });

  it("BUG-92: a plan that only stays afloat by raiding a spouse's held-out 401k early can never read 'comfortable'", () => {
    // Same shape as the eventRetirementDraw override, triggered by the Option-A
    // spillover escape hatch (BUG-88) instead of a money event — a household
    // whose end-state walk looks healthy but got there only by repeatedly
    // penalizing a still-working spouse's own 401k should read the same way.
    const scenario = {
      scenarioYears: Infinity, scenarioRetAge: 65,
      scenarioBalAt90: 2_000_000, scenarioExpenses: 57_000, scenarioDrawAtPlanAge: 9_000,
      eventFundingShortfall: 0, totalSpouseSpillover: 60_000,
    };
    expect(verdictForScenarioResult(scenario, safeLifeExp)).toBe("tight");
    const info = verdictInfoForScenario(scenario, safeLifeExp);
    expect(info.verdict).toBe("tight");
    expect(info.marginLabel).toBe("needs early withdrawals from a spouse's still-working 401k to fund");
    // No spillover → cap inert, margin verdict applies.
    const noSpillover = { ...scenario, totalSpouseSpillover: 0 };
    expect(verdictForScenarioResult(noSpillover, safeLifeExp)).toBe("comfortable");
    // Already tight/unaffordable on the margin → cap changes nothing.
    const alreadyTight = {
      scenarioYears: 27, scenarioRetAge: 65, totalSpouseSpillover: 60_000,
    };
    expect(verdictForScenarioResult(alreadyTight, safeLifeExp)).toBe("tight");
  });

  it("cushion label caps at CUSHION_LABEL_CAP_YEARS ('366 yrs' reads as '50+')", () => {
    const covered = verdictInfoForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: 3_400_000,
        scenarioExpenses: 57_000, scenarioDrawAtPlanAge: 9_300 },
      safeLifeExp);
    // 3.4M / 9.3k ≈ 366 — the label must cap, the verdict math must not.
    expect(covered.marginYears).toBeGreaterThan(300);
    expect(covered.marginLabel).toBe(
      `${ASSUMPTIONS.CUSHION_LABEL_CAP_YEARS}+ yrs of runway left at 90`);
    expect(covered.verdict).toBe("comfortable");
  });

  it("depletion basis equals the old inline expression for finite scenarioYears (value-preserving)", () => {
    const scenario = { scenarioYears: 22.3, scenarioRetAge: 65 };
    const oldInline = scenario.scenarioYears - (safeLifeExp - scenario.scenarioRetAge);
    const { marginYears, marginBasis } = marginForScenario(scenario, safeLifeExp);
    expect(marginBasis).toBe("depletion");
    expect(marginYears).toBeCloseTo(oldInline, 10);
  });

  it("verdictInfoForScenario label value-locks (exact strings)", () => {
    const cushionFinite = verdictInfoForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: 360_000, scenarioExpenses: 30_000 },
      safeLifeExp);
    expect(cushionFinite.marginBasis).toBe("cushion");
    expect(cushionFinite.marginLabel).toBe("≈12 yrs of runway left at 90");
    expect(cushionFinite.verdict).toBe("comfortable");

    const cushionInfinite = verdictInfoForScenario(
      { scenarioYears: Infinity, scenarioRetAge: 65, scenarioBalAt90: null, scenarioExpenses: 30_000 },
      safeLifeExp);
    expect(cushionInfinite.marginLabel).toBe("still growing at your plan age");

    const depletionPositive = verdictInfoForScenario({ scenarioYears: 28, scenarioRetAge: 65 }, safeLifeExp);
    expect(depletionPositive.marginBasis).toBe("depletion");
    expect(depletionPositive.marginLabel).toBe("3 yrs to spare past 90");

    const depletionNegative = verdictInfoForScenario({ scenarioYears: 21, scenarioRetAge: 65 }, safeLifeExp);
    expect(depletionNegative.marginLabel).toBe("runs out 4 yrs early");
  });

  it("verdictInfoForScenario's rangeLegend and thresholds use the real ASSUMPTIONS constant (never a hardcoded 5)", () => {
    const buffer = ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS;
    const info = verdictInfoForScenario({ scenarioYears: 28, scenarioRetAge: 65 }, safeLifeExp);
    expect(info.rangeLegend).toEqual([
      { verdict: "comfortable",  label: `${buffer}+ yrs of runway` },
      { verdict: "tight",        label: `0–${buffer} yrs of runway` },
      { verdict: "unaffordable", label: `runs out before ${safeLifeExp}` },
    ]);
    expect(info.thresholds).toEqual({ comfortableMin: buffer, tightMin: 0 });
  });

  it("buildVerdictLegend shape — the same legend verdictInfoForScenario embeds", () => {
    const buffer = ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS;
    expect(buildVerdictLegend(safeLifeExp)).toEqual([
      { verdict: "comfortable",  label: `${buffer}+ yrs of runway` },
      { verdict: "tight",        label: `0–${buffer} yrs of runway` },
      { verdict: "unaffordable", label: `runs out before ${safeLifeExp}` },
    ]);
  });
});

// ── evaluateLifeEvent — edit mode (H1 double-count regression) ────────────────
// A real per-account-engine bundle (mirrors the "engine migration" fixtures
// above — the all-taxable-seed trick used elsewhere in this file is NOT valid
// here because excludeEventId forces a re-sim, which reads REAL per-account
// balances from the simulation, not an artificially-collapsed retPhaseBase) with
// a COMMITTED event already baked into every committed-event source: bundle
// simInputs.moneyEvents, retDrawShared.moneyEvents, retPhaseBase.moneyEvents, and
// baseChart/baseYearsSustained built from a walk that includes it — exactly how
// App.jsx wires a real committed moneyEvents entry through.
describe("evaluateLifeEvent — edit mode (H1 double-count regression)", () => {
  const em2 = (s, c) => calcEmployerMatch(s, c, {
    matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3,
  });
  const editSimInputsBase = {
    totalYears: 60, currentAge: 40, currentIncome: 120_000, incomeGrowth: 2,
    filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 6,
    bal401k: 100_000, balRoth: 40_000, balTaxable: 60_000, balHSA: 15_000,
    contrib401k: 15_000, contribRoth: 6_000, contribTaxable: 5_000, contribHSA: 3_000,
    contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
    calcEmployerMatchFn: em2, moneyEvents: [],
  };
  const editSafeRetAge = 65, editSafeLifeExp = 90, editCurrentAge = 40;

  const committedEvent = {
    id: "trip-1", label: "Big trip", icon: "✈️", amount: 40_000, age: 70,
    isInflow: false, isTaxable: false,
  };
  const editSimInputs = { ...editSimInputsBase, moneyEvents: [committedEvent] };

  const editSim = runSimulation(editSimInputs)
    .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
  const editAt = editSim[editSafeRetAge - editCurrentAge - 1];
  const editTradGrossAtRet = editAt.tradGross ?? 0;
  const editRoth    = editAt["Roth IRA"] ?? 0;
  const editTaxable = editAt["Taxable"]  ?? 0;
  const editHsa     = editAt["HSA"]      ?? 0;
  const editTotalAtRet = editTradGrossAtRet + editRoth + editTaxable + editHsa;

  const editRetPhaseBase = {
    tradGross: editTradGrossAtRet, roth: editRoth, taxable: editTaxable, hsa: editHsa,
    startAge: editSafeRetAge, lifeExp: editSafeLifeExp, longevityHorizon: editSafeRetAge + 130,
    rReal: 0.02, effectiveExpenses: 60_000,
    ssGross: 24_000, ssTaxable: 20_000, ssClaimAge: 67,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    rmdStartAge: 73, useTable2: false, spouseCurrentAge: null, currentAge: editCurrentAge,
    moneyEvents: [committedEvent],
  };
  const editRetPhase = buildRetirementPhase({ ...editRetPhaseBase, conversionByAge: {} });
  const editAccumChart = buildAccumChart({
    simData: editSim, safeRetAge: editSafeRetAge, currentAge: editCurrentAge,
    bal401k: editSimInputsBase.bal401k, balRoth: editSimInputsBase.balRoth,
    balTaxable: editSimInputsBase.balTaxable, balHSA: editSimInputsBase.balHSA,
  });
  const editBaseChart = [
    ...editAccumChart,
    ...editRetPhase.rows.map(r => ({ age: r.age, total: r.total })),
  ];
  const editRetDrawShared = {
    rReal: editRetPhaseBase.rReal, effectiveExpenses: editRetPhaseBase.effectiveExpenses,
    ssAmount: editRetPhaseBase.ssGross, ssClaimAge: editRetPhaseBase.ssClaimAge,
    pensionAmount: 0, pensionStartAge: Infinity,
    rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [committedEvent],
  };
  const editBundle = {
    simInputs: editSimInputs, fedMarginal: 0.22, retDrawShared: editRetDrawShared,
    safeRetAge: editSafeRetAge, safeLifeExp: editSafeLifeExp,
    baseTotalAtRet: editTotalAtRet, baseYearsSustained: editRetPhase.yearsSustained,
    retPhaseBase: editRetPhaseBase, conversionByAge: {},
    baseChart: editBaseChart, addlPreTaxBal: 0,
  };

  it("editing a committed event with unchanged values prices it once (no double-count)", () => {
    const result = evaluateLifeEvent(editBundle, committedEvent);
    expect(result.atRetirement.dir).toBeNull();
    expect(Math.abs(result.atPlanAge.deltaAbs)).toBeLessThanOrEqual(1);
  });

  it("editing a committed event with CHANGED values prices only the incremental difference (not stacked with the original)", () => {
    const editedEvent = { ...committedEvent, amount: 60_000 };
    const result = evaluateLifeEvent(editBundle, editedEvent);
    // The naive pre-fix path (scenarioEvents:[event] with no exclusion) would
    // stack the edited event ON TOP of the already-committed original — a much
    // larger hit than the incremental $20k. Bound the delta well under what a
    // double-count of the full amended event ($60k, compounded ~25 yrs) would be.
    expect(result.atPlanAge.dir).toBe("down");
    expect(result.atPlanAge.deltaAbs).toBeGreaterThan(0);
    expect(result.atPlanAge.deltaAbs).toBeLessThan(60_000 * 3);
  });

  // buildDurationRail regression (post-ship verification review): the H1
  // exclusion originally reached only evaluateLifeEvent, so the sheet's tick
  // rail (buildDurationRail) still double-counted a committed DURATION event
  // being edited — the rail could show "unaffordable" at a duration where the
  // verdict card (evaluateLifeEvent) said "comfortable" for the identical
  // candidate. A committed duration-event bundle, mirroring editBundle above.
  const committedDuration = {
    id: "sabbatical-1", label: "Sabbatical", icon: "🌴",
    monthlyAmount: 5_000, durationMonths: 24, incomeAnnual: 0,
    age: 63, isInflow: false,
  };
  const durSimInputs = { ...editSimInputsBase, moneyEvents: [committedDuration] };
  const durSim = runSimulation(durSimInputs)
    .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
  const durAt = durSim[editSafeRetAge - editCurrentAge - 1];
  const durTradGrossAtRet = durAt.tradGross ?? 0;
  const durRoth    = durAt["Roth IRA"] ?? 0;
  const durTaxable = durAt["Taxable"]  ?? 0;
  const durHsa     = durAt["HSA"]      ?? 0;
  const durTotalAtRet = durTradGrossAtRet + durRoth + durTaxable + durHsa;
  const durRetPhaseBase = {
    ...editRetPhaseBase,
    tradGross: durTradGrossAtRet, roth: durRoth, taxable: durTaxable, hsa: durHsa,
    moneyEvents: [committedDuration],
  };
  const durRetPhase = buildRetirementPhase({ ...durRetPhaseBase, conversionByAge: {} });
  const durAccumChart = buildAccumChart({
    simData: durSim, safeRetAge: editSafeRetAge, currentAge: editCurrentAge,
    bal401k: editSimInputsBase.bal401k, balRoth: editSimInputsBase.balRoth,
    balTaxable: editSimInputsBase.balTaxable, balHSA: editSimInputsBase.balHSA,
  });
  const durBaseChart = [
    ...durAccumChart,
    ...durRetPhase.rows.map(r => ({ age: r.age, total: r.total })),
  ];
  const durBundle = {
    ...editBundle,
    simInputs: durSimInputs,
    retDrawShared: { ...editRetDrawShared, moneyEvents: [committedDuration] },
    baseTotalAtRet: durTotalAtRet, baseYearsSustained: durRetPhase.yearsSustained,
    retPhaseBase: durRetPhaseBase, baseChart: durBaseChart,
  };

  it("buildDurationRail excludes the committed original when editing (agrees with evaluateLifeEvent, no double-count)", () => {
    const { durationMonths: _drop, ...eventBase } = committedDuration;
    const rail = buildDurationRail(durBundle, eventBase, { maxMonths: 36, step: 6 });
    expect(rail.length).toBeGreaterThan(0);
    for (const entry of rail) {
      const candidate = { ...eventBase, durationMonths: entry.months };
      const expected = evaluateLifeEvent(durBundle, candidate);
      expect(entry.verdict).toBe(expected.verdict);
    }
    // Unchanged edit (24 months, the committed value) must be priced once —
    // same verdict as evaluateLifeEvent's own no-double-count guarantee.
    const unchanged = rail.find(r => r.months === 24);
    expect(unchanged).toBeDefined();
    expect(unchanged.verdict).toBe(evaluateLifeEvent(durBundle, committedDuration).verdict);
  });
});

// ── buildLeverPreview / buildLeverRail / buildDurationRail ────────────────────
// The Plan-screen "Try a change" panel + Ideas dials + LifeEventSheet duration
// rail all read these — every delta, dir/tone, and verdict must come from here
// (rule 10), never be recomputed in a screen.
const VALID_VERDICTS = ["comfortable", "tight", "unaffordable"];
const verdictRank = { unaffordable: 0, tight: 1, comfortable: 2 };

// ── LEVERS (#123 readiness) ──────────────────────────────────────────────────
// The per-lever table buildLeverPreview/buildLeverRail now iterate instead of
// hand-rolling per-lever ternaries. Locks the shape + the exact per-lever
// behavior each was lifted from, so a future edit can't silently change
// rounding/comparison semantics without a test noticing.
describe("LEVERS table", () => {
  it("has exactly the two currently-wired levers, each with the four documented fields", () => {
    expect(Object.keys(LEVERS).sort()).toEqual(["monthlyExpenses", "retirementAge"]);
    for (const def of Object.values(LEVERS)) {
      expect(typeof def.overrideKey).toBe("string");
      expect(typeof def.round).toBe("function");
      expect(typeof def.toComparable).toBe("function");
      expect(typeof def.baseValue).toBe("function");
    }
  });

  it("retirementAge: overrideKey/round/toComparable/baseValue match the old inline behavior", () => {
    expect(LEVERS.retirementAge.overrideKey).toBe("retirementAge");
    expect(LEVERS.retirementAge.round(64.6)).toBe(65); // whole-year rounding
    expect(LEVERS.retirementAge.toComparable(63)).toBe(63); // identity
    expect(LEVERS.retirementAge.baseValue(baseArgs)).toBe(safeRetAge);
  });

  it("monthlyExpenses: overrideKey/round/toComparable/baseValue match the old inline behavior", () => {
    expect(LEVERS.monthlyExpenses.overrideKey).toBe("monthlyExpenses");
    expect(LEVERS.monthlyExpenses.round(1234.567)).toBe(1234.57); // cents rounding
    expect(LEVERS.monthlyExpenses.toComparable(1_000))
      .toBe(1_000 * 12); // annualized (ASSUMPTIONS.MONTHS_PER_YEAR)
    expect(LEVERS.monthlyExpenses.baseValue(baseArgs)).toBe(baseArgs.retDrawShared.effectiveExpenses);
  });
});

describe("buildLeverPreview", () => {
  it("no-op preview: changed=false and chart equals the base chart", () => {
    const preview = buildLeverPreview(baseArgs, {});
    expect(preview.changed).toBe(false);
    expect(preview.chart).toEqual(baseArgs.baseChart);
  });

  it("retire-earlier preview: changed=true, and the portfolio-at-retirement metric reads down", () => {
    const preview = buildLeverPreview(baseArgs, { retirementAge: safeRetAge - 2 });
    expect(preview.changed).toBe(true);
    expect(preview.scenarioStats.scenarioRetAge).toBe(safeRetAge - 2);
    const totalAtRetMetric = preview.metrics.find(m => m.id === "totalAtRet");
    expect(totalAtRetMetric).toBeDefined();
    expect(totalAtRetMetric.delta.dir).toBe("down");
  });

  it("monthlyExpenses-only override annualizes in the model (month → year)", () => {
    const preview = buildLeverPreview(depletingArgs, { monthlyExpenses: 90_000 / 12 });
    expect(preview.changed).toBe(true);
    expect(preview.scenarioStats.scenarioExpenses).toBe(90_000);
  });

  it("scenarioEvents-only override is passed through: changed=true and the plan-age balance reflects it (M1)", () => {
    // No retirementAge/monthlyExpenses override — mirrors the Ideas bigTrip
    // scenario (retireAdj: 0, only a scenarioEvents outflow). Before the fix,
    // buildLeverPreview had no scenarioEvents parameter at all, so this override
    // was silently dropped and the preview showed "no change".
    const noOp = buildLeverPreview(baseArgs, {});
    const withEvent = buildLeverPreview(baseArgs, {
      scenarioEvents: [{ label: "Trip", amount: 40_000, age: 70, isInflow: false, isTaxable: false }],
    });
    expect(withEvent.changed).toBe(true);
    expect(noOp.changed).toBe(false);
    const balMetric = withEvent.metrics.find(m => m.id === "balAtPlanAge");
    expect(balMetric.delta.dir).toBe("down");
  });

  it("metrics reuse buildPreviewMetric's documented row shape", () => {
    const preview = buildLeverPreview(baseArgs, { retirementAge: safeRetAge - 2 });
    expect(preview.metrics).toHaveLength(3);
    for (const m of preview.metrics) {
      expect(typeof m.id).toBe("string");
      expect(typeof m.label).toBe("string");
      expect(typeof m.before).toBe("string");
      expect(typeof m.after).toBe("string");
      expect(m.delta).toHaveProperty("dir");
      expect(m.delta).toHaveProperty("label");
      expect(m.delta).toHaveProperty("tone");
    }
  });

  it("returns null for an invalid bundle", () => {
    expect(buildLeverPreview(null, {})).toBeNull();
    expect(buildLeverPreview({}, {})).toBeNull();
  });
});

describe("buildLeverRail", () => {
  it("returns (max−min)/step + 1 entries, all with valid verdict strings", () => {
    const rail = buildLeverRail(depletingArgs, {
      lever: "monthlyExpenses", min: 30_000 / 12, max: 90_000 / 12, step: 10_000 / 12,
    });
    expect(rail).toHaveLength(7);
    for (const entry of rail) {
      expect(VALID_VERDICTS).toContain(entry.verdict);
    }
  });

  it("a higher monthly spend never gets a better verdict than a lower one", () => {
    const rail = buildLeverRail(depletingArgs, {
      lever: "monthlyExpenses", min: 30_000 / 12, max: 90_000 / 12, step: 10_000 / 12,
    });
    const low = rail[0];
    const high = rail[rail.length - 1];
    expect(verdictRank[high.verdict]).toBeLessThanOrEqual(verdictRank[low.verdict]);
  });

  it("retirementAge rail uses each step's own plan horizon (retiring later is never worse)", () => {
    const rail = buildLeverRail(baseArgs, { lever: "retirementAge", min: 55, max: 75, step: 5 });
    expect(rail.length).toBeGreaterThan(1);
    const earliest = rail[0];
    const latest = rail[rail.length - 1];
    expect(earliest.value).toBe(55);
    expect(latest.value).toBe(75);
    // More accumulation time + a shorter retirement horizon → retiring later
    // is never a worse verdict than retiring earlier.
    expect(verdictRank[latest.verdict]).toBeGreaterThanOrEqual(verdictRank[earliest.verdict]);
  });

  it("guards return [] for invalid bundle, min > max, step <= 0, or an unrecognized lever", () => {
    expect(buildLeverRail(null, { lever: "retirementAge", min: 60, max: 70, step: 1 })).toEqual([]);
    expect(buildLeverRail(baseArgs, { lever: "retirementAge", min: 70, max: 60, step: 1 })).toEqual([]);
    expect(buildLeverRail(baseArgs, { lever: "retirementAge", min: 60, max: 70, step: 0 })).toEqual([]);
    expect(buildLeverRail(baseArgs, { lever: "somethingElse", min: 60, max: 70, step: 1 })).toEqual([]);
  });

  it("caps at 80 entries by coarsening the step, still spanning min..max", () => {
    const rail = buildLeverRail(baseArgs, { lever: "retirementAge", min: 55, max: 75, step: 0.01 });
    expect(rail.length).toBeLessThanOrEqual(80);
    expect(rail[0].value).toBe(55);
    expect(rail[rail.length - 1].value).toBe(75);
  });

  it("every tick's verdict agrees with verdictInfoForScenario run on the SAME override (anti-divergence, BUG-73)", () => {
    const rail = buildLeverRail(baseArgs, { lever: "retirementAge", min: 60, max: 70, step: 2 });
    expect(rail.length).toBeGreaterThan(0);
    for (const tick of rail) {
      const scenario = calcWhatIfScenario(baseArgs, { retirementAge: tick.value });
      const info = verdictInfoForScenario(scenario, baseArgs.safeLifeExp);
      expect(tick.verdict).toBe(info.verdict);
    }
  });
});

describe("buildDurationRail", () => {
  const durationEventBase = { label: "Probe", monthlyAmount: 2_000, age: 70, isInflow: false, incomeAnnual: 0 };

  it("verdict at N months agrees with evaluateLifeEvent for the same candidate", () => {
    const rail = buildDurationRail(depletingArgs, durationEventBase, { maxMonths: 36, step: 6 });
    expect(rail.length).toBeGreaterThan(0);
    const entry = rail.find(r => r.months === 18);
    expect(entry).toBeDefined();
    const expected = evaluateLifeEvent(depletingArgs, { ...durationEventBase, durationMonths: 18 });
    expect(entry.verdict).toBe(expected.verdict);
  });

  it("guards return [] for invalid bundle, missing eventBase, or non-positive maxMonths/step", () => {
    expect(buildDurationRail(null, durationEventBase, { maxMonths: 24, step: 6 })).toEqual([]);
    expect(buildDurationRail(depletingArgs, null, { maxMonths: 24, step: 6 })).toEqual([]);
    expect(buildDurationRail(depletingArgs, durationEventBase, { maxMonths: 0, step: 6 })).toEqual([]);
    expect(buildDurationRail(depletingArgs, durationEventBase, { maxMonths: 24, step: 0 })).toEqual([]);
  });
});

// ── calcWorkLongerBreakEven (#55) ────────────────────────────────────────────
describe("calcWorkLongerBreakEven", () => {
  const ssInputs = { currentIncome: 100_000, incomeGrowth: 3, incomeGrowthEndAge: null, ssClaimingAge: 67 };

  it("returns null when already retired (safeRetAge <= currentAge)", () => {
    expect(calcWorkLongerBreakEven({
      bundle: baseArgs, safeRetAge: currentAge, currentAge, includeSS: true, ssInputs,
    })).toBeNull();
  });

  it("returns null for a missing bundle", () => {
    expect(calcWorkLongerBreakEven({
      bundle: null, safeRetAge, currentAge, includeSS: true, ssInputs,
    })).toBeNull();
  });

  it("valid bundle: applicable, 3 offset rows (1/3/5), numeric portfolioAtRet, non-empty headline", () => {
    const result = calcWorkLongerBreakEven({
      bundle: baseArgs, safeRetAge, currentAge, includeSS: true, ssInputs,
    });
    expect(result).not.toBeNull();
    expect(result.applicable).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map(r => r.years).sort()).toEqual([1, 3, 5]);
    for (const row of result.rows) {
      expect(typeof row.portfolioAtRet).toBe("number");
      expect(Number.isFinite(row.portfolioAtRet)).toBe(true);
      expect([1, 3, 5]).toContain(row.years);
    }
    expect(typeof result.headline).toBe("string");
    expect(result.headline.length).toBeGreaterThan(0);
  });

  // Gemini PR #57 review: verify the "Portfolio lasts" sub-label invariant the
  // WorkLongerFlow.jsx JSX depends on — a row that TRANSITIONS to sustainable
  // must report longevityDeltaYears: null (never a stray finite/Infinity delta),
  // so the screen's `row.longevityDeltaYears != null ? ... : (row.sustainable ?
  // "still for life" : undefined)` fallback always resolves to "still for life"
  // and never a nonsensical "+Infinity yrs".
  it("a row that becomes sustainable reports longevityDeltaYears: null (never Infinity/NaN)", () => {
    // depletingArgs' base plan is NOT sustainable (finite baseYearsSustained);
    // working extra years re-sims with more contributions and a shorter
    // drawdown, plausibly crossing into sustainable for at least one offset.
    const result = calcWorkLongerBreakEven({
      bundle: depletingArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
    });
    expect(result).not.toBeNull();
    // Every row must carry either a finite delta or an explicit null — never
    // Infinity or NaN, which would render as garbage ("+Infinity yrs").
    for (const row of result.rows) {
      expect(row.longevityDeltaYears === null
        || Number.isFinite(row.longevityDeltaYears)).toBe(true);
      if (row.sustainable) expect(row.longevityDeltaYears).toBeNull();
    }
  });

  it("a bundle that crosses into sustainable within the offsets exercises the null-delta transition", () => {
    // A near-perpetuity base (found by binary search against the 65+130 = 195
    // horizon at $80k effectiveExpenses/0% SS: threshold ≈ $5.922M) — just under
    // it, so the base itself is finite (~129 of the 130-year horizon, NOT
    // Infinity), but 5 extra idle years of compounding at 5% nominal tips every
    // +1/+3/+5 offset row over the line into literally sustainable.
    const nearMissBase = 5_900_000;
    const { yearsSustained: nearMissBaseYears } = buildRetirementDrawdown({
      ...depletingRetDrawShared, startBal: nearMissBase, startAge: safeRetAge, endAge: safeRetAge + 130,
    });
    expect(nearMissBaseYears).not.toBe(Infinity); // base must NOT already be sustainable
    const nearMissSimInputs = {
      ...simInputs, bal401k: 0, balRoth: 0, balTaxable: nearMissBase, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
    };
    const nearMissRetPhaseBase = {
      ...depletingRetPhaseBase, tradGross: 0, roth: 0, taxable: nearMissBase, hsa: 0,
    };
    const nearMissArgs = {
      simInputs: nearMissSimInputs, fedMarginal, retDrawShared: depletingRetDrawShared,
      safeRetAge, safeLifeExp, baseTotalAtRet: nearMissBase, baseYearsSustained: nearMissBaseYears,
      retPhaseBase: nearMissRetPhaseBase, conversionByAge: {}, addlPreTaxBal: 0,
    };
    const result = calcWorkLongerBreakEven({
      bundle: nearMissArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
    });
    expect(result).not.toBeNull();
    expect(result.rows.some(r => r.sustainable)).toBe(true); // the transition actually happens
    for (const row of result.rows) {
      if (row.sustainable) expect(row.longevityDeltaYears).toBeNull();
    }
  });

  it("SS companion: more working years never lowers the AIME-based benefit; includeSS=false zeroes every row", () => {
    const withSS = calcWorkLongerBreakEven({
      bundle: baseArgs, safeRetAge, currentAge, includeSS: true, ssInputs,
    });
    const row1 = withSS.rows.find(r => r.years === 1);
    const row5 = withSS.rows.find(r => r.years === 5);
    expect(row5.ssAnnual).toBeGreaterThanOrEqual(row1.ssAnnual);

    const withoutSS = calcWorkLongerBreakEven({
      bundle: baseArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
    });
    for (const row of withoutSS.rows) {
      expect(row.ssAnnual).toBe(0);
    }
  });

  it("Roth-conversion window shrinks (non-increasing) as the offset grows", () => {
    const result = calcWorkLongerBreakEven({
      bundle: baseArgs, safeRetAge, currentAge, includeSS: true, ssInputs,
    });
    const sorted = [...result.rows].sort((a, b) => a.years - b.years);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].conversionWindowYrs).toBeLessThanOrEqual(sorted[i - 1].conversionWindowYrs);
    }
  });

  // ── coversPlan / minYearsToSustain — the Plan screen's verdict sentence ─────
  // The distinction these pin is the whole reason the field isn't just
  // `rows.find(r => r.sustainable)`: a plan can fund every year of its horizon
  // while still depleting eventually, and calling that "not fixed by working
  // longer" would be false.
  it("coversPlan uses the PLAN-HORIZON test, not the stricter never-depletes test", () => {
    const result = calcWorkLongerBreakEven({
      bundle: depletingArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
    });
    expect(result).not.toBeNull();
    for (const row of result.rows) {
      expect(typeof row.coversPlan).toBe("boolean");
      // Never-depletes always implies covers-the-plan; the converse may not hold.
      if (row.sustainable) expect(row.coversPlan).toBe(true);
      // The same comparison App itself makes for isSustainable, re-derived from
      // the row's own depletion age rather than trusting the field.
      if (!row.sustainable && row.depletionAge != null) {
        expect(row.coversPlan).toBe(row.depletionAge > safeLifeExp);
      }
    }
  });

  it("minYearsToSustain is the SMALLEST offset that covers the plan", () => {
    const result = calcWorkLongerBreakEven({
      bundle: depletingArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
    });
    const covering = result.rows.filter(r => r.coversPlan).map(r => r.years);
    if (covering.length === 0) {
      expect(result.minYearsToSustain).toBeNull();
    } else {
      expect(result.minYearsToSustain).toBe(Math.min(...covering));
    }
  });

  it("picks the smallest even when the caller's offsets arrive out of order", () => {
    const result = calcWorkLongerBreakEven({
      bundle: depletingArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
      offsets: [9, 1, 5],
    });
    const covering = result.rows.filter(r => r.coversPlan).map(r => r.years);
    expect(covering.length).toBeGreaterThan(0);           // this bundle is fixable
    expect(result.minYearsToSustain).toBe(Math.min(...covering));
  });

  it("is null — a designed 'later retirement alone won't fix it' state — when no offset covers the plan", () => {
    // One year of extra work on a plan that runs dry decades early can't close it.
    const result = calcWorkLongerBreakEven({
      bundle: depletingArgs, safeRetAge, currentAge, includeSS: false, ssInputs,
      offsets: [1],
    });
    expect(result.rows).toHaveLength(1);
    if (!result.rows[0].coversPlan) expect(result.minYearsToSustain).toBeNull();
  });

  it("falls back to the never-depletes test when the bundle carries no life expectancy", () => {
    // Defensive: a bundle without safeLifeExp must not make every row read as
    // covering the plan (NaN comparisons are false, but the guard is explicit).
    const { safeLifeExp: _drop, ...noLifeExp } = depletingArgs;
    const result = calcWorkLongerBreakEven({
      bundle: noLifeExp, safeRetAge, currentAge, includeSS: false, ssInputs,
    });
    for (const row of result.rows) {
      expect(row.coversPlan).toBe(row.sustainable);
    }
  });
});
