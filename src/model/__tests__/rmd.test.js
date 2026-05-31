import { describe, it, expect } from "vitest";
import { calcRMDProjection, calcRMDPostConversion } from "../rmd.js";

const baseRMD = {
  tradGrossAtRetirement: 1_000_000,
  safeRetAge: 65,
  safeLifeExp: 85,
  returnRate: 5,
  useTable2: false,
  spouseCurrentAge: 60,
  currentAge: 65,
};

describe("calcRMDProjection", () => {
  it("returns empty array when balance is 0", () => {
    const rows = calcRMDProjection({ ...baseRMD, tradGrossAtRetirement: 0 });
    expect(rows.every(r => r.rmd === 0)).toBe(true);
  });

  it("first RMD starts at age 73", () => {
    const rows = calcRMDProjection(baseRMD);
    expect(rows[0].age).toBe(73);
  });

  it("all rows have age >= 73", () => {
    const rows = calcRMDProjection(baseRMD);
    for (const row of rows) {
      expect(row.age).toBeGreaterThanOrEqual(73);
    }
  });

  it("RMD amounts are positive when balance > 0", () => {
    const rows = calcRMDProjection(baseRMD);
    const requiredRows = rows.filter(r => r.required);
    for (const row of requiredRows) {
      expect(row.rmd).toBeGreaterThan(0);
    }
  });

  it("RMDs are required in every year once age 73 is reached", () => {
    const rows = calcRMDProjection({ ...baseRMD, safeRetAge: 65, safeLifeExp: 80 });
    const rmdAges = rows.filter(r => r.required).map(r => r.age);
    // Should have required RMDs from 73 to 80 (Table III covers through 99)
    expect(rmdAges).toContain(73);
    expect(rmdAges).toContain(80);
  });

  it("when retiring at 73+, includes RMD in retirement year", () => {
    const rows = calcRMDProjection({ ...baseRMD, safeRetAge: 73, currentAge: 73 });
    expect(rows[0].age).toBe(73);
    expect(rows[0].required).toBe(true);
  });
});

describe("calcRMDPostConversion", () => {
  const rmdData = calcRMDProjection(baseRMD);

  it("returns rmdData unchanged when conversionWindowYrs = 0", () => {
    const result = calcRMDPostConversion({
      conversionWindowYrs: 0,
      rmdData,
      tradBal73: 500_000,
      safeLifeExp: 85,
      returnRate: 5,
      useTable2: false,
      spouseCurrentAge: 60,
      currentAge: 65,
    });
    expect(result).toBe(rmdData); // same reference
  });

  it("produces lower RMDs when starting balance is lower (after conversion)", () => {
    const resultFull = calcRMDProjection(baseRMD);
    const resultPost = calcRMDPostConversion({
      conversionWindowYrs: 5,
      rmdData,
      tradBal73: 500_000, // half the original
      safeLifeExp: 85,
      returnRate: 5,
      useTable2: false,
      spouseCurrentAge: 60,
      currentAge: 65,
    });
    const totalFull = resultFull.reduce((s, r) => s + r.rmd, 0);
    const totalPost = resultPost.reduce((s, r) => s + r.rmd, 0);
    expect(totalPost).toBeLessThan(totalFull);
  });
});
