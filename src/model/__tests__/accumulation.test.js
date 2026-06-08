import { describe, it, expect } from "vitest";
import { sumAccountRow, calcMilestones } from "../accumulation.js";

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
