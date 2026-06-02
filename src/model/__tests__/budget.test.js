import { describe, it, expect } from "vitest";
import { calcGrossAfterTax, calcSavingsCapacity, calcOptimizedAllocation } from "../budget.js";

describe("calcGrossAfterTax", () => {
  it("subtracts all taxes from income", () => {
    const gat = calcGrossAfterTax(100_000, 12_000, 5_000, 7_650);
    expect(gat).toBe(75_350);
  });

  it("returns income when all taxes are 0", () => {
    expect(calcGrossAfterTax(100_000, 0, 0, 0)).toBe(100_000);
  });
});

describe("calcSavingsCapacity", () => {
  const base = {
    grossAfterTax: 80_000,
    contrib401k: 10_000,
    contribRoth: 5_000,
    contribTaxable: 3_000,
    contribHSA: 2_000,
    livingExpenses: null,
  };

  it("auto-derives living expenses as grossAfterTax - contribs", () => {
    const { effectiveLiving } = calcSavingsCapacity(base);
    expect(effectiveLiving).toBe(60_000); // 80K - 20K contribs
  });

  it("surplus is 0 when expenses exceed capacity", () => {
    const { availableSurplus } = calcSavingsCapacity({
      ...base,
      livingExpenses: 70_000, // leaves only $10K savings capacity < $20K contribs
    });
    expect(availableSurplus).toBe(0);
  });

  it("uses explicit livingExpenses when provided", () => {
    const { effectiveLiving } = calcSavingsCapacity({ ...base, livingExpenses: 55_000 });
    expect(effectiveLiving).toBe(55_000);
  });

  it("no double-counting: contribs appear once in capacity calc", () => {
    const { savingsCapacity, currentContribTotal } = calcSavingsCapacity(base);
    // grossAfterTax (80K) - effectiveLiving (60K) = 20K = currentContribTotal
    expect(savingsCapacity).toBe(currentContribTotal);
  });
});

describe("calcOptimizedAllocation — priority order", () => {
  const base = {
    availableSurplus: 20_000,
    savingsSurplusPct: 100,
    contrib401k: 5_000,
    contribRoth: 0,
    contribHSA: 0,
    contribTaxable: 0,
    rothFullyPhased: false,
    matchMode: "flat",
    matchFormulaCap: 6,
    matchFormulaRate: 50,
    employerMatchPct: 3,
    currentIncome: 100_000,
  };

  it("prioritizes employer match gap first (formula mode)", () => {
    // Formula match is contingent: "50% of first 6%" → need 6% of $100K = $6K deferral.
    // contrib401k 0 < $6K, so surplus is steered into the 401k to capture it.
    const alloc = calcOptimizedAllocation({ ...base, matchMode: "formula", contrib401k: 0 });
    expect(alloc.extraMatch).toBeGreaterThan(0);
  });

  it("flat match is unconditional — no surplus steered to 401k to capture it", () => {
    // Flat match (salary × pct) is paid regardless of employee deferral, so the
    // optimizer must NOT push surplus into the 401k for it; HSA/Roth take priority.
    const alloc = calcOptimizedAllocation({ ...base, matchMode: "flat", contrib401k: 0 });
    expect(alloc.extraMatch).toBe(0);
    expect(alloc.extraHSA).toBe(4_300);   // HSA filled first instead
    expect(alloc.extraRoth).toBeGreaterThan(0);
  });

  it("fills HSA after match", () => {
    // No match gap (contrib already covers match), HSA room = $4,300
    const alloc = calcOptimizedAllocation(base);
    expect(alloc.extraHSA).toBe(4_300);
  });

  it("fills Roth after HSA when not phased out", () => {
    const alloc = calcOptimizedAllocation(base);
    expect(alloc.extraRoth).toBeGreaterThan(0);
  });

  it("skips Roth when fully phased out", () => {
    const alloc = calcOptimizedAllocation({ ...base, rothFullyPhased: true });
    expect(alloc.extraRoth).toBe(0);
  });

  it("overflow goes to taxable", () => {
    // Very large surplus — should overflow into taxable
    const alloc = calcOptimizedAllocation({ ...base, availableSurplus: 100_000 });
    expect(alloc.extraTaxable).toBeGreaterThan(0);
  });

  it("totalExtra = 0 when availableSurplus = 0", () => {
    const alloc = calcOptimizedAllocation({ ...base, availableSurplus: 0 });
    expect(alloc.totalExtra).toBe(0);
  });
});
