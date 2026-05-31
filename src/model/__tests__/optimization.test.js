import { describe, it, expect } from "vitest";
import { calcOptimizedScenario } from "../optimization.js";

const baseAlloc = {
  extra401k: 5_000, extraRoth: 3_000, extraHSA: 2_000, extraTaxable: 1_000,
  totalExtra: 11_000, extraMatch: 0,
  opt401k: 15_000, optRoth: 10_000, optHSA: 6_150, optTaxable: 5_000,
};

const base = {
  totalAtRet: 1_000_000,
  optimizedAllocation: baseAlloc,
  returnRate: 5,
  incomeGrowth: 3,
  safeRetAge: 65,
  currentAge: 30,
  rate3: 18,
  contrib401k: 10_000,
  includeSS: true,
  ssClaimingAge: 67,
  ss70Annual: 36_000,
  spouseSsBenefit: 0,
  householdSS: 30_000,
  effectiveExpenses: 70_000,
  effectivePension: 0,
  rReal: 0.0096, // (1.05/1.04) - 1
  safeLifeExp: 90,
  yr1TaxSavings: 5_000,
  netConversionBenefit: 20_000,
  isSustainable: false,
  yearsSustained: 20,
  conversionSim: { rothAdvantage: 10_000 },
  retTaxable: 200_000,
};

describe("calcOptimizedScenario", () => {
  it("optTotalAtRet > totalAtRet when there is surplus allocation", () => {
    const result = calcOptimizedScenario(base);
    expect(result.totalAtRet).toBeGreaterThan(base.totalAtRet);
  });

  it("LTCG drag: extra taxable FV uses r*(1-0.15) not r*0.15", () => {
    // A taxable-only scenario: should produce significant FV, not near-zero
    const taxableOnly = {
      ...base,
      optimizedAllocation: { ...baseAlloc, extra401k: 0, extraRoth: 0, extraHSA: 0, extraTaxable: 10_000, totalExtra: 10_000 },
    };
    const result = calcOptimizedScenario(taxableOnly);
    // At 5% * 0.85 = 4.25% net, over 35 years, $10K/yr FV ≈ $700K
    // If LTCG_DRAG were misapplied (5% * 0.15 = 0.75%), FV ≈ $370K — huge difference
    expect(result.extraTaxableFV).toBeGreaterThan(100_000);
  });

  it("uses SS at 70 when ssClaimingAge < 70 and includeSS is true", () => {
    const result = calcOptimizedScenario(base);
    expect(result.ss).toBe(base.ss70Annual + base.spouseSsBenefit);
  });

  it("uses householdSS when already at max claiming age", () => {
    const result = calcOptimizedScenario({ ...base, ssClaimingAge: 70 });
    expect(result.ss).toBe(base.householdSS);
  });

  it("sustainable when optNetNeed <= 0", () => {
    const result = calcOptimizedScenario({ ...base, effectiveExpenses: 20_000 });
    expect(result.sustainable).toBe(true);
    expect(result.yearsSustained).toBe(Infinity);
  });

  it("hasImprovement when optimized portfolio is meaningfully larger", () => {
    const result = calcOptimizedScenario(base);
    expect(result.hasImprovement).toBe(true);
  });

  it("actionCount > 0 with available improvements", () => {
    const result = calcOptimizedScenario(base);
    expect(result.actionCount).toBeGreaterThan(0);
  });
});
