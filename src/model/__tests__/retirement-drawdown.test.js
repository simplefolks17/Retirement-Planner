import { describe, it, expect } from "vitest";
import { buildRetirementDrawdown, calcPlanProgress, buildYearlyRows } from "../retirement-drawdown.js";
import { calcDrawdownYears, calcYearsSustained } from "../drawdown.js";

// A representative retirement scenario (numbers chosen to deplete within the
// horizon so depletion/fractional logic is exercised).
const base = {
  startBal: 1_000_000,
  startAge: 65,
  endAge: 200,
  rReal: 0.03,
  effectiveExpenses: 80_000,
  ssAmount: 30_000,
  ssClaimAge: 67,
  pensionAmount: 0,
  pensionStartAge: Infinity,
};

describe("buildRetirementDrawdown — the single shared walk", () => {
  it("reproduces the spending-only recurrence when no tax is passed", () => {
    const { rows } = buildRetirementDrawdown(base);
    // Re-walk by hand and assert balEnd matches bal*(1+rReal) - draw, no tax.
    let bal = base.startBal;
    for (const r of rows) {
      const yearSS = r.age >= base.ssClaimAge ? base.ssAmount : 0;
      const need = Math.max(0, base.effectiveExpenses - yearSS);
      bal = bal * (1 + base.rReal) - need;
      expect(r.tax).toBe(0);
      expect(r.draw).toBe(need);
      expect(r.balEnd).toBeCloseTo(bal, 6);
    }
  });

  it("CONSERVATION: startBal + Σgrowth === Σdraw + Σtax + endBalRaw (P6)", () => {
    const rmdTaxByAge = { 73: 5_000, 74: 5_200, 75: 5_400 };
    const { rows } = buildRetirementDrawdown({ ...base, rmdTaxByAge });
    const sumGrowth = rows.reduce((s, r) => s + r.growth, 0);
    const sumDraw = rows.reduce((s, r) => s + r.draw, 0);
    const sumTax = rows.reduce((s, r) => s + r.tax, 0);
    const endBalRaw = rows[rows.length - 1].balEnd;
    expect(base.startBal + sumGrowth).toBeCloseTo(sumDraw + sumTax + endBalRaw, 4);
  });

  it("ANTI-PLUG: the waterfall residual (end−start+draw+tax) equals Σ real growth", () => {
    // This is the invariant the Flow-Down 'growth' bar must satisfy. Because
    // each row carries growth = balStart*rReal independently, a residual that
    // secretly absorbed an un-charged tax would FAIL this equality.
    const rmdTaxByAge = { 73: 12_000, 74: 12_500, 75: 13_000, 76: 13_500 };
    const { rows } = buildRetirementDrawdown({ ...base, rmdTaxByAge });
    const start = base.startBal;
    const end = rows[rows.length - 1].balEnd;
    const sumDraw = rows.reduce((s, r) => s + r.draw, 0);
    const sumTax = rows.reduce((s, r) => s + r.tax, 0);
    const residualGrowth = end - start + sumDraw + sumTax;
    const realGrowth = rows.reduce((s, r) => s + r.growth, 0);
    expect(residualGrowth).toBeCloseTo(realGrowth, 4);
  });

  it("tax strictly reduces the ending balance and shortens longevity", () => {
    const noTax = buildRetirementDrawdown(base);
    const withTax = buildRetirementDrawdown({
      ...base,
      rmdTaxByAge: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [73 + i, 15_000]),
      ),
    });
    expect(withTax.endVal).toBeLessThanOrEqual(noTax.endVal);
    expect(withTax.yearsSustained).toBeLessThanOrEqual(noTax.yearsSustained);
  });

  it("MONOTONICITY: higher expenses never increase years sustained", () => {
    const lo = buildRetirementDrawdown({ ...base, effectiveExpenses: 70_000 });
    const hi = buildRetirementDrawdown({ ...base, effectiveExpenses: 90_000 });
    expect(hi.yearsSustained).toBeLessThanOrEqual(lo.yearsSustained);
  });

  it("MONOTONICITY: a bigger portfolio never decreases years sustained", () => {
    const small = buildRetirementDrawdown({ ...base, startBal: 800_000 });
    const big = buildRetirementDrawdown({ ...base, startBal: 1_200_000 });
    expect(big.yearsSustained).toBeGreaterThanOrEqual(small.yearsSustained);
  });

  it("gates SS per-year: deferring SS raises early-year draws", () => {
    const claimAtRet = buildRetirementDrawdown({ ...base, ssClaimAge: 65 });
    const deferTo70 = buildRetirementDrawdown({ ...base, ssClaimAge: 70 });
    // First post-retirement year (age 66): SS active in claimAtRet, not in deferTo70.
    expect(deferTo70.rows[0].draw).toBeGreaterThan(claimAtRet.rows[0].draw);
  });
});

describe("reconciliation with existing longevity functions (R1)", () => {
  it("calcDrawdownYears integer == depletionAge − startAge", () => {
    const { depletionAge } = buildRetirementDrawdown(base);
    const yrs = calcDrawdownYears(base);
    expect(yrs).toBe(depletionAge - base.startAge);
  });

  it("zero-tax fractional longevity ≈ closed-form calcYearsSustained when SS is active from retirement", () => {
    // When SS starts at retirement, the static draw matches the walk, so the
    // closed form and the per-year walk should agree within ~1 year.
    const p = { ...base, ssClaimAge: 65 };
    const netNeed = Math.max(0, p.effectiveExpenses - p.ssAmount);
    const closed = calcYearsSustained(netNeed, p.startBal, p.rReal);
    const walked = buildRetirementDrawdown(p).yearsSustained;
    if (closed === Infinity) {
      expect(walked).toBe(Infinity);
    } else {
      expect(Math.abs(walked - closed)).toBeLessThan(1.5);
    }
  });

  it("closed form OVERSTATES longevity vs the walk when SS is deferred (the BUG-26 trap)", () => {
    // Retire 60, claim SS at 70: the static netNeed nets SS for all years, so
    // the closed form assumes SS income that isn't there 60–70 and overstates.
    const p = {
      startBal: 700_000, startAge: 60, endAge: 200, rReal: 0.03,
      effectiveExpenses: 60_000, ssAmount: 30_000, ssClaimAge: 70,
    };
    const staticNetNeed = Math.max(0, p.effectiveExpenses - p.ssAmount);
    const closed = calcYearsSustained(staticNetNeed, p.startBal, p.rReal);
    const walked = buildRetirementDrawdown(p).yearsSustained;
    expect(closed).toBeGreaterThan(walked);
  });
});

describe("calcPlanProgress", () => {
  it("returns 100 when sustainable (including Infinity yearsSustained)", () => {
    expect(calcPlanProgress({ yearsSustained: Infinity, isSustainable: true, lifeExpect: 90, retirementAge: 65 }))
      .toEqual({ progressPct: 100 });
    expect(calcPlanProgress({ yearsSustained: 40, isSustainable: true, lifeExpect: 90, retirementAge: 65 }))
      .toEqual({ progressPct: 100 });
    // Defensive: Infinity years with a stale isSustainable=false still reads 100,
    // never NaN/Infinity in the UI.
    expect(calcPlanProgress({ yearsSustained: Infinity, isSustainable: false, lifeExpect: 90, retirementAge: 65 }))
      .toEqual({ progressPct: 100 });
  });

  it("computes the percent of the retirement horizon covered when unsustainable", () => {
    // 12.5 of 25 years → 50%
    expect(calcPlanProgress({ yearsSustained: 12.5, isSustainable: false, lifeExpect: 90, retirementAge: 65 }))
      .toEqual({ progressPct: 50 });
  });

  it("caps an unsustainable plan at 99% — it never reads as done", () => {
    expect(calcPlanProgress({ yearsSustained: 24.9, isSustainable: false, lifeExpect: 90, retirementAge: 65 }))
      .toEqual({ progressPct: 99 });
  });

  it("guards the zero/negative horizon (retiring at or past life expectancy)", () => {
    const r = calcPlanProgress({ yearsSustained: 0.5, isSustainable: false, lifeExpect: 65, retirementAge: 65 });
    expect(Number.isFinite(r.progressPct)).toBe(true);
    expect(r.progressPct).toBeGreaterThanOrEqual(0);
    expect(r.progressPct).toBeLessThanOrEqual(99);
  });
});

describe("buildYearlyRows", () => {
  it("attaches the calendar year to each walk row (age→year math in the model)", () => {
    const rows = [{ age: 66, total: 1 }, { age: 67, total: 2 }];
    const out = buildYearlyRows({ rows, currentAge: 30, currentYear: 2026 });
    expect(out.map(r => r.year)).toEqual([2026 + 36, 2026 + 37]);
    // original row fields preserved
    expect(out[0].total).toBe(1);
  });

  it("empty/missing rows → empty array", () => {
    expect(buildYearlyRows({ rows: [], currentAge: 30, currentYear: 2026 })).toEqual([]);
    expect(buildYearlyRows({ rows: undefined, currentAge: 30, currentYear: 2026 })).toEqual([]);
  });
});
