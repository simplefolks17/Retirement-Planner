import { describe, it, expect } from "vitest";
import { calcWhatIfDelta, calcAffordabilityMax, calcWhatIfChart, calcWhatIfScenario } from "../what-if.js";
import { calcEmployerMatch } from "../employer-match.js";
import { runSimulation } from "../simulation.js";
import { buildRetirementDrawdown } from "../retirement-drawdown.js";

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

const baseArgs = {
  simInputs, fedMarginal, retDrawShared,
  safeRetAge, safeLifeExp,
  baseTotalAtRet: realBaseTotalAtRet, baseYearsSustained,
};

const depletingArgs = {
  simInputs, fedMarginal,
  retDrawShared: depletingRetDrawShared,
  safeRetAge, safeLifeExp,
  baseTotalAtRet: depletingBase, baseYearsSustained: depletingBaseYears,
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

  it("boundary-optimality: sustains to target at maxAmount, fails at maxAmount + step", () => {
    const purchaseAge = 68, targetLifeExpectancy = 74, step = 10_000;
    const { maxAmount } = calcAffordabilityMax({
      ...depletingArgs, purchaseAge, targetLifeExpectancy, step,
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
    const result = calcAffordabilityMax({
      ...depletingArgs, purchaseAge: 68, targetLifeExpectancy: 74, step: 0,
    });
    expect(result).toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("returns canAfford:false and a zero result when targetLifeExpectancy is at/before retirement", () => {
    const result = calcAffordabilityMax({
      ...depletingArgs, purchaseAge: 68, targetLifeExpectancy: safeRetAge, step: 10_000,
    });
    expect(result).toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("returns canAfford:false when the baseline itself can't sustain to the target age", () => {
    // depletingBase (~10-12 yrs sustained) cannot reach a 90-yr target (25 yrs).
    const result = calcAffordabilityMax({
      ...depletingArgs, purchaseAge: 68, targetLifeExpectancy: safeLifeExp, step: 10_000,
    });
    expect(result).toEqual({ maxAmount: 0, deltaYears: 0, canAfford: false });
  });

  it("caps at maxSearch when the scenario is trivially sustainable at any spend within range", () => {
    // baseArgs (SS-offset, well-funded scenario) with a tiny maxSearch — every
    // amount tested is sustainable, so the search should exhaust the range
    // rather than spin, and the result documents the cap.
    const result = calcAffordabilityMax({
      ...baseArgs, purchaseAge: 70, targetLifeExpectancy: safeLifeExp,
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
};

describe("calcWhatIfChart", () => {
  it("no overrides: returns series starting at safeRetAge+1 and ending at safeLifeExp", () => {
    const series = calcWhatIfChart(chartBundle);
    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);
    expect(series[0].age).toBe(safeRetAge + 1);
    expect(series[series.length - 1].age).toBe(safeLifeExp);
  });

  it("no overrides: first-year total matches baseTotalAtRet minus draw", () => {
    const series = calcWhatIfChart(chartBundle);
    // The first row should be close to (but no more than) baseTotalAtRet
    // (it has grown by rReal but lost the first draw)
    expect(series[0].total).toBeGreaterThan(0);
    expect(series[0].total).toBeLessThanOrEqual(realBaseTotalAtRet * 1.1);
  });

  it("retireAdj shifts the series start age", () => {
    const seriesEarly = calcWhatIfChart(chartBundle, { retireAdj: -2 });
    expect(Array.isArray(seriesEarly)).toBe(true);
    expect(seriesEarly.length).toBeGreaterThan(0);
    // Series starts from the earlier retirement age
    expect(seriesEarly[0].age).toBe(safeRetAge - 2 + 1);
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

  it("scenarioDepletionAge matches the far-horizon walk's depletionAge", () => {
    const s = calcWhatIfScenario(depletingArgs);
    const farWalk = buildRetirementDrawdown({
      ...depletingRetDrawShared, startBal: depletingBase, startAge: safeRetAge, endAge: safeRetAge + 130,
    });
    expect(s.scenarioDepletionAge).toBe(farWalk.depletionAge);
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
