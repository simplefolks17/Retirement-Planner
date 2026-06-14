import { describe, it, expect } from "vitest";
import { sumAccountRow, calcMilestones, buildAccumChart, calcChartMilestones, buildAccumulationRows } from "../accumulation.js";
import { RMD_START_AGE } from "../../config/irs-2026.js";

describe("buildAccumulationRows (WI-2.5)", () => {
  // Minimal augmented simData rows (as App builds them: balances + contributions
  // + per-year gross growth/tradGrowth from runSimulation, plus the after-tax
  // "Trad 401k" key). Two consecutive years so we can check reconciliation.
  const m = 0.24;
  const mkRow = (age, trad, roth, taxable, hsa, c401k, growth, tradGrowth) => ({
    age,
    "Trad 401k": Math.round(trad * (1 - m)),
    "Roth IRA": roth, "Taxable": taxable, "HSA": hsa, tradGross: trad,
    c401k, cRoth: 7_000, cTaxable: 4_000, cHSA: 3_000,
    growth, tradGrowth,
  });
  // Year 1 → Year 2 with a 5% return for a hand-checked reconciliation.
  const r = 0.05;
  const y1Trad = (100_000 + 10_000) * (1 + r);          // 115,500
  const y1Roth = (20_000 + 7_000) * (1 + r);            // 28,350
  const y1Tax  = (30_000 + 4_000) * (1 + r);            // 35,700
  const y1Hsa  = (5_000 + 3_000) * (1 + r);             // 8,400
  const simData = [
    mkRow(31, Math.round(y1Trad), Math.round(y1Roth), Math.round(y1Tax), Math.round(y1Hsa),
      10_000,
      Math.round((100_000 + 10_000) * r + (20_000 + 7_000) * r + (30_000 + 4_000) * r + (5_000 + 3_000) * r),
      Math.round((100_000 + 10_000) * r)),
    mkRow(32,
      Math.round((y1Trad + 10_000) * (1 + r)),
      Math.round((y1Roth + 7_000) * (1 + r)),
      Math.round((y1Tax + 4_000) * (1 + r)),
      Math.round((y1Hsa + 3_000) * (1 + r)),
      10_000,
      Math.round((y1Trad + 10_000) * r + (y1Roth + 7_000) * r + (y1Tax + 4_000) * r + (y1Hsa + 3_000) * r),
      Math.round((y1Trad + 10_000) * r)),
  ];

  it("only includes building years (age ≤ safeRetAge)", () => {
    const rows = buildAccumulationRows({ simData, fedMarginal: m, currentAge: 30, currentYear: 2026, safeRetAge: 31 });
    expect(rows.map(r => r.age)).toEqual([31]);
  });

  it("returns [] when already retired (safeRetAge === currentAge)", () => {
    expect(buildAccumulationRows({ simData, fedMarginal: m, currentAge: 30, currentYear: 2026, safeRetAge: 30 })).toEqual([]);
  });

  it("attaches calendar year and tags rows accum (draw/tax 0, rmd/conversion null)", () => {
    const [row] = buildAccumulationRows({ simData, fedMarginal: m, currentAge: 30, currentYear: 2026, safeRetAge: 35 });
    expect(row.year).toBe(2027);       // 2026 + (31 − 30)
    expect(row.phase).toBe("accum");
    expect(row.draw).toBe(0);
    expect(row.tax).toBe(0);
    expect(row.rmd).toBeNull();
    expect(row.conversion).toBeNull();
  });

  it("reconciles on the after-tax basis: prevTotal + contrib + growth = total", () => {
    const rows = buildAccumulationRows({ simData, fedMarginal: m, currentAge: 30, currentYear: 2026, safeRetAge: 40 });
    const r2 = rows[1];
    // prev displayed total + this year's contrib + this year's growth == this total
    expect(Math.abs((rows[0].total + r2.contrib + r2.growth) - r2.total)).toBeLessThan(5);
  });
});

describe("sumAccountRow", () => {
  it("sums the four account keys on a full row", () => {
    const row = { age: 65, "Trad 401k": 100_000, "Roth IRA": 50_000, "Taxable": 30_000, "HSA": 20_000 };
    expect(sumAccountRow(row)).toBe(200_000);
  });

  it("coalesces missing keys to 0 (partial rows total correctly)", () => {
    expect(sumAccountRow({ "Roth IRA": 25_000, "HSA": 10_000 })).toBe(35_000);
    expect(sumAccountRow({})).toBe(0);
  });

  it("ignores non-account keys", () => {
    const row = { age: 70, tradGross: 999_999, "Trad 401k": 10_000, "Taxable": 5_000 };
    expect(sumAccountRow(row)).toBe(15_000);
  });
});

describe("calcMilestones", () => {
  const mkRow = (age, total) => ({ age, "Trad 401k": total, "Roth IRA": 0, "Taxable": 0, "HSA": 0 });

  it("first milestone is the next multiple of 5 after currentAge; last is retirement", () => {
    const simData = [];
    for (let age = 31; age <= 45; age++) simData.push(mkRow(age, (age - 30) * 100_000));
    const m = calcMilestones({ simData, currentAge: 30, safeRetAge: 45, retirementTarget: 1e12 });
    expect(m.map(c => c.age)).toEqual([35, 40, 45]);
    expect(m[0].total).toBe(500_000); // age 35 = 5 * 100k
    expect(m.at(-1).isRetirement).toBe(true);
  });

  it("stops at the first milestone that reaches the target", () => {
    const simData = [];
    for (let age = 31; age <= 45; age++) simData.push(mkRow(age, (age - 30) * 100_000));
    const m = calcMilestones({ simData, currentAge: 30, safeRetAge: 45, retirementTarget: 600_000 });
    expect(m.map(c => c.age)).toEqual([35, 40]); // age 40 = 1M >= 600k
  });

  it("appends the exact crossing year when the target is only reached after retirement", () => {
    const simData = [];
    for (let age = 31; age <= 60; age++) simData.push(mkRow(age, (age - 30) * 50_000));
    const m = calcMilestones({ simData, currentAge: 30, safeRetAge: 45, retirementTarget: 1_000_000 });
    // milestones 35/40/45 top out at 750k < 1M; target hit at age 50 (1M)
    expect(m.map(c => c.age)).toEqual([35, 40, 45, 50]);
    expect(m.at(-1).isRetirement).toBe(false);
  });
});

describe("buildAccumChart", () => {
  const mkRow = (age, total) => ({ age, "Trad 401k": total, "Roth IRA": 0, "Taxable": 0, "HSA": 0 });

  it("emits {age,total} rows through retirement and stops at safeRetAge", () => {
    const simData = [mkRow(31, 100), mkRow(32, 200), mkRow(33, 300), mkRow(34, 400)];
    const rows = buildAccumChart({ simData, safeRetAge: 33, currentAge: 30,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0 });
    expect(rows).toEqual([{ age: 31, total: 100 }, { age: 32, total: 200 }, { age: 33, total: 300 }]);
  });

  it("seeds a current-balance row when already retired (safeRetAge === currentAge)", () => {
    const rows = buildAccumChart({ simData: [], safeRetAge: 60, currentAge: 60,
      bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000 });
    expect(rows).toEqual([{ age: 60, total: 165_000 }]);
  });
});

describe("calcChartMilestones", () => {
  // Simple lifetime series: linear growth 30→65, then decline 65→90.
  const mkChart = ({ peakAt = 65, growTo = 2_000_000 } = {}) => {
    const rows = [];
    for (let age = 30; age <= 90; age++) {
      const total = age <= peakAt
        ? Math.round(growTo * (age - 30) / (peakAt - 30))
        : Math.round(growTo * (1 - (age - peakAt) / 50));
      rows.push({ age, total });
    }
    return rows;
  };

  it("interpolates the First $1M crossing between the bracketing rows", () => {
    // growTo 2M over 35 yrs → crosses 1M halfway (age 47.5 → rounds to 48)
    const { rows } = calcChartMilestones({
      chartData: mkChart(), currentAge: 30, retirementAge: 65, lifeExpect: 90,
    });
    const mil = rows.find(r => r.tag === "First $1M");
    expect(mil).toBeDefined();
    expect(mil.age).toBe(48);
    expect(mil.total).toBe(1e6);
  });

  it("includes Peak only when it falls after retirement", () => {
    // Peak at 65 (the retirement age itself) → no Peak row
    const noPeak = calcChartMilestones({
      chartData: mkChart({ peakAt: 65 }), currentAge: 30, retirementAge: 65, lifeExpect: 90,
    });
    expect(noPeak.rows.find(r => r.tag === "Peak")).toBeUndefined();
    // Peak at 75 (after retirement) → Peak row at 75
    const withPeak = calcChartMilestones({
      chartData: mkChart({ peakAt: 75 }), currentAge: 30, retirementAge: 65, lifeExpect: 90,
    });
    expect(withPeak.rows.find(r => r.tag === "Peak")?.age).toBe(75);
  });

  it("RMDs-start gate uses the config constant (RMD_START_AGE), not a hardcoded 73", () => {
    const { rows } = calcChartMilestones({
      chartData: mkChart(), currentAge: 30, retirementAge: 65, lifeExpect: 90,
    });
    const rmd = rows.find(r => r.tag === "RMDs start");
    expect(rmd).toBeDefined();
    expect(rmd.age).toBe(RMD_START_AGE);
    // Retiring at/after the RMD start age → no RMDs-start milestone inside the window
    const lateRet = calcChartMilestones({
      chartData: mkChart(), currentAge: 30, retirementAge: RMD_START_AGE, lifeExpect: 90,
    });
    expect(lateRet.rows.find(r => r.tag === "RMDs start")).toBeUndefined();
  });

  it("always carries Today / Retire / For-life anchors, sorted by age, with peakTotal ≥ 1", () => {
    const { rows, peakTotal } = calcChartMilestones({
      chartData: mkChart(), currentAge: 30, retirementAge: 65, lifeExpect: 90,
    });
    expect(rows.find(r => r.tag === "Today")?.age).toBe(30);
    expect(rows.find(r => r.tag === "Retire")?.age).toBe(65);
    expect(rows.find(r => r.tag === "For life")?.age).toBe(90);
    const ages = rows.map(r => r.age);
    expect(ages).toEqual([...ages].sort((a, b) => a - b));
    expect(peakTotal).toBe(Math.max(...rows.map(r => r.total), 1));
  });

  it("empty chart data → designed empty state ({ rows: [], peakTotal: 1 })", () => {
    expect(calcChartMilestones({ chartData: [], currentAge: 30, retirementAge: 65, lifeExpect: 90 }))
      .toEqual({ rows: [], peakTotal: 1 });
  });
});
