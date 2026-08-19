import { describe, it, expect } from "vitest";
import {
  calcGrossAfterTax, calcSavingsCapacity, calcOptimizedAllocation, calcMegaBackdoorGrowth,
  calcStatementView, buildBarSegments, SEG_LABEL_MIN_SHARE_PCT,
} from "../budget.js";

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

  it("budgetDeficit (WI-1.2): 0 when the budget balances; the true overshoot otherwise", () => {
    // Auto-derived expenses, income covers contribs → no deficit
    expect(calcSavingsCapacity(base).budgetDeficit).toBe(0);
    // Explicit expenses 70K + contribs 20K vs 80K after-tax → $10K deficit.
    // Note this is the UNCLAMPED shortfall — availableSurplus reads 0 here
    // (clamped), which is why the deficit is its own named field.
    const d = calcSavingsCapacity({ ...base, livingExpenses: 70_000 });
    expect(d.availableSurplus).toBe(0);
    expect(d.budgetDeficit).toBe(10_000);
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
    expect(alloc.extraHSA).toBe(4_400);   // HSA filled first instead
    expect(alloc.extraRoth).toBeGreaterThan(0);
  });

  it("fills HSA after match", () => {
    // No match gap (contrib already covers match), HSA room = $4,400
    const alloc = calcOptimizedAllocation(base);
    expect(alloc.extraHSA).toBe(4_400);
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

describe("calcMegaBackdoorGrowth", () => {
  it("compounds with the annuity FV formula at a positive return", () => {
    const g = calcMegaBackdoorGrowth({ megaCapacity: 10_000, returnRate: 5 });
    // 5yr: 10000 * ((1.05^5 - 1)/0.05) = 55_256
    expect(g.map(x => x.yrs)).toEqual([5, 10, 20]);
    expect(g[0].val).toBe(55_256);
  });

  it("falls back to linear (capacity × years) when return is 0", () => {
    const g = calcMegaBackdoorGrowth({ megaCapacity: 10_000, returnRate: 0 });
    expect(g.map(x => x.val)).toEqual([50_000, 100_000, 200_000]);
  });
});

describe("calcStatementView", () => {
  const base = {
    currentIncome: 100_000,
    fedTax: 12_000,
    fica: 7_650,
    stateTax: 0,
    takeHome: 80_350,
    currentContribTotal: 24_850,
    householdSS: 30_000,
    effectiveExpenses: 75_000,
  };

  it("reconciliation invariant: the waterfall pieces sum exactly to gross", () => {
    const v = calcStatementView(base);
    // taxTotal + saveTotal + flowKeep === gross (flowKeep is the residual)
    expect(v.taxTotal + v.saveTotal + v.flowKeep).toBe(v.gross);
    expect(v.gross).toBe(base.currentIncome);
    expect(v.afterTaxLevel).toBe(v.gross - v.taxTotal);
  });

  it("computes tax composition and percentages", () => {
    const v = calcStatementView(base);
    expect(v.taxTotal).toBe(19_650);
    expect(v.ficaPlusState).toBe(7_650);
    expect(v.keepPct).toBe(Math.round(80_350 / 100_000 * 100));
    expect(v.taxPct).toBe(Math.round(19_650 / 100_000 * 100));
    expect(v.savePct).toBe(Math.round(24_850 / 100_000 * 100));
    expect(v.flowKeepPct).toBe(Math.round(v.flowKeep / 100_000 * 100));
    expect(v.effFedRatePct).toBe(12); // 12,000 / 100,000 → 12.0
  });

  it("monthly figures: SS, portfolio draw, and total (conversion lives in the model)", () => {
    const v = calcStatementView(base);
    expect(v.monthlyHHSS).toBe(Math.round(30_000 / 12));
    expect(v.monthlyPortDraw).toBe(Math.round((75_000 - 30_000) / 12));
    expect(v.monthlyTotal).toBe(Math.round(75_000 / 12));
  });

  it("portfolio draw never goes negative when SS exceeds expenses", () => {
    const v = calcStatementView({ ...base, householdSS: 100_000 });
    expect(v.monthlyPortDraw).toBe(0);
  });

  it("Statement table arithmetic: gross − taxes − preTaxDeductions = takeHome", () => {
    // A user with 401k (pre-tax), Roth IRA, and taxable brokerage contributions.
    // safeDeduc = pre-tax only (401k); Roth + taxable are after-tax.
    const safeDeduc      = 23_500;
    const contribRoth    = 7_000;
    const contribTaxable = 5_000;
    const contribAll     = safeDeduc + contribRoth + contribTaxable;
    // takeHome = gross − taxes − safeDeduc (Roth/taxable don't reduce it):
    const takeHome = base.currentIncome - base.fedTax - base.fica - base.stateTax - safeDeduc;
    const v = calcStatementView({ ...base, currentContribTotal: contribAll, safeDeduc, takeHome });
    expect(v.preTaxDeductions).toBe(safeDeduc);
    // The "Income & tax" column arithmetic must balance:
    expect(base.currentIncome - base.fedTax - v.ficaPlusState - v.preTaxDeductions).toBe(takeHome);
    // saveTotal (for the waterfall chart) still includes ALL contributions:
    expect(v.saveTotal).toBe(contribAll);
    // flowKeep (waterfall residual) is lower than takeHome by the after-tax contributions:
    expect(v.flowKeep).toBe(v.gross - v.taxTotal - contribAll);
  });

  it("designed empty state: no income → percentages are null, NOT 0 (principle 10)", () => {
    const v = calcStatementView({ ...base, currentIncome: 0, fedTax: 0, fica: 0, stateTax: 0, takeHome: 0 });
    expect(v.keepPct).toBeNull();
    expect(v.taxPct).toBeNull();
    expect(v.savePct).toBeNull();
    expect(v.flowTaxPct).toBeNull();
    expect(v.flowSavePct).toBeNull();
    expect(v.flowKeepPct).toBeNull();
    expect(v.effFedRatePct).toBeNull();
    // missing income behaves the same as 0
    const v2 = calcStatementView({ ...base, currentIncome: null });
    expect(v2.keepPct).toBeNull();
  });
});

// ── buildBarSegments (rule 10) ───────────────────────────────────────────────
// The Statement tab's three composition bars (NumbersScreen.jsx's StmtCol)
// used to compute "is this segment wide enough for its own label" inline in
// the render, with a `?? 0` fallback — arithmetic on model values inside
// src/horizon/, against rule 10. Moved here so the screen only reads a
// pre-computed `showLabel` boolean.
describe("buildBarSegments", () => {
  it("marks every segment showLabel when all comfortably clear the threshold", () => {
    const segs = buildBarSegments([
      { f: 50, c: "a", l: "Keep" },
      { f: 30, c: "b", l: "Tax" },
      { f: 20, c: "c", l: "Save" },
    ]);
    expect(segs.map(s => s.showLabel)).toEqual([true, true, true]);
    // Original fields pass through untouched.
    expect(segs.map(s => s.l)).toEqual(["Keep", "Tax", "Save"]);
  });

  it("hides a segment below SEG_LABEL_MIN_SHARE_PCT of the bar's total", () => {
    // 5 / (80+15+5) = 5%, under the 12% threshold; the other two clear it.
    const segs = buildBarSegments([
      { f: 80, c: "a", l: "Big" },
      { f: 15, c: "b", l: "Mid" },
      { f: 5,  c: "c", l: "Tiny" },
    ]);
    expect(segs.find(s => s.l === "Big").showLabel).toBe(true);
    expect(segs.find(s => s.l === "Mid").showLabel).toBe(true);
    expect(segs.find(s => s.l === "Tiny").showLabel).toBe(false);
  });

  it("is exact at the threshold boundary (>= 12%, not > 12%)", () => {
    // 12 / 100 = exactly 12%.
    const segs = buildBarSegments([
      { f: 12, c: "a", l: "Exact" },
      { f: 88, c: "b", l: "Rest" },
    ]);
    expect(segs.find(s => s.l === "Exact").showLabel).toBe(true);
    // Just under.
    const under = buildBarSegments([
      { f: 11.9, c: "a", l: "Under" },
      { f: 88.1, c: "b", l: "Rest" },
    ]);
    expect(under.find(s => s.l === "Under").showLabel).toBe(false);
  });

  it("treats missing/negative/non-finite f as real 0 — never coerced with ?? 0 (rule 10)", () => {
    const segs = buildBarSegments([
      { f: 90, c: "a", l: "Real" },
      { f: null, c: "b", l: "Missing" },
      { f: -5, c: "c", l: "Negative" },
      { f: NaN, c: "d", l: "NotANumber" },
    ]);
    expect(segs.find(s => s.l === "Real").showLabel).toBe(true);
    for (const l of ["Missing", "Negative", "NotANumber"]) {
      expect(segs.find(s => s.l === l).showLabel, l).toBe(false);
    }
  });

  it("every segment reads false, never true, when the bar total is 0", () => {
    const segs = buildBarSegments([
      { f: 0, c: "a", l: "A" },
      { f: null, c: "b", l: "B" },
    ]);
    expect(segs.every(s => s.showLabel === false)).toBe(true);
  });

  it("an empty/missing seg list returns an empty array, not a throw", () => {
    expect(buildBarSegments([])).toEqual([]);
    expect(buildBarSegments(undefined)).toEqual([]);
  });

  it("SEG_LABEL_MIN_SHARE_PCT is the single source of the threshold (12)", () => {
    expect(SEG_LABEL_MIN_SHARE_PCT).toBe(12);
  });
});
