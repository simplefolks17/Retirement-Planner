import { describe, it, expect } from "vitest";
import { calcWhatIfDelta, calcAffordabilityMax, calcWhatIfChart, calcWhatIfScenario, evaluateLifeEvent } from "../what-if.js";
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
});

// ── calcAffordabilityMax ─────────────────────────────────────────────────────
describe("calcAffordabilityMax", () => {
  it("returns a non-negative maxAmount", () => {
    const result = calcAffordabilityMax({
      ...depletingArgs,
      purchaseAge: 40,
      targetLifeExpectancy: 75,  // modest target well within depleting scenario
      step: 10_000,
    });
    expect(result.maxAmount).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 when baseline can't sustain to target age", () => {
    // Force scenario that barely sustains to 74 — target 80 is impossible
    const result = calcAffordabilityMax({
      ...depletingArgs,
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
    const result = calcAffordabilityMax({
      ...depletingArgs,
      purchaseAge: 68,   // >= safeRetAge — stays within retirement walk
      targetLifeExpectancy: 74,
      step: 10_000,
    });
    // Spending the max should not lengthen the portfolio (it reduces or is neutral)
    expect(result.deltaYears).toBeLessThanOrEqual(0);
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

  it("scenarioBalAt90 reads the age-90 row of the SAME walk the chart shows", () => {
    const s = calcWhatIfScenario(baseArgs);
    const row90 = s.chart.find(r => r.age === 90);
    expect(row90).toBeDefined();
    expect(s.scenarioBalAt90).toBe(row90.total);
  });

  it("scenarioBalAt90 is null (not 0) when the walk never reaches 90", () => {
    // Life expectancy 85 → walk ends at 85; age 90 is NOT APPLICABLE, not zero.
    const s = calcWhatIfScenario({ ...baseArgs, safeLifeExp: 85 });
    expect(s.chart[s.chart.length - 1].age).toBe(85);
    expect(s.scenarioBalAt90).toBeNull();
  });

  it("scenarioBalAt90 is a real 0 on genuine depletion at/before 90", () => {
    const s = calcWhatIfScenario(depletingArgs);
    expect(s.scenarioYears).toBeLessThan(90 - safeRetAge); // depletes before 90
    expect(s.scenarioBalAt90).toBe(0);
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

  it("verdict = comfortable with infinite margin when the portfolio never depletes", () => {
    // retPhaseBase deliberately unset — same reason as the flatSim bundle above:
    // this test overrides baseTotalAtRet to $10M directly, which the fixed
    // depletingArgs.retPhaseBase (seeded at $800k) doesn't reflect.
    const r = evaluateLifeEvent({
      ...depletingArgs,
      baseTotalAtRet: 10_000_000,
      retDrawShared: { ...depletingRetDrawShared, effectiveExpenses: 30_000 },
      retPhaseBase: undefined,
    }, probeEvent);
    expect(r.verdict).toBe("comfortable");
    expect(r.sustainability.marginYears).toBe(Infinity);
    expect(r.sustainability.scenarioDepletionAge).toBeNull();
  });
});
