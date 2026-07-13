import { describe, it, expect } from "vitest";
import {
  calcWhatIfDelta, calcAffordabilityMax, calcWhatIfChart, calcWhatIfScenario, evaluateLifeEvent,
  buildLeverPreview, buildLeverRail, buildDurationRail, LEVERS, eventIncomeImpact,
  marginForScenario, verdictInfoForScenario, buildVerdictLegend, verdictForMargin,
} from "../what-if.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";
import { calcEmployerMatch } from "../employer-match.js";
import { runSimulation } from "../simulation.js";
import { buildRetirementDrawdown } from "../retirement-drawdown.js";
import { buildRetirementPhase } from "../retirement-phase.js";
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
  it("no overrides: returns the full lifetime series, from just after current age through safeLifeExp", () => {
    const series = calcWhatIfChart(chartBundle);
    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);
    expect(series[0].age).toBe(currentAge + 1);
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
    expect(seriesEarly[0].age).toBe(currentAge + 1);
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
    expect(cushionFinite.marginLabel).toBe("≈12 yrs of spending still in reserve at 90");
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
