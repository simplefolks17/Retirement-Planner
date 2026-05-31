import { describe, it, expect } from "vitest";
import { calcConversionSim } from "../roth-conversion.js";

const base = {
  conversionWindowYrs: 5,
  annualConversion: 30_000,
  returnRate: 5,
  retIncomeFloor: 25_000,
  filingStatus: "single",
  conversionTaxSource: "converted",
  tradGrossAtRetirement: 500_000,
  rothBalAtRet: 200_000,
  taxableBalAtRet: 100_000,
};

describe("calcConversionSim — zero window", () => {
  it("returns starting balances unchanged when conversionWindowYrs = 0", () => {
    const result = calcConversionSim({ ...base, conversionWindowYrs: 0 });
    expect(result.tradBal73).toBe(500_000);
    expect(result.rothBalEnd).toBe(200_000);
    expect(result.totalTax).toBe(0);
    expect(result.years).toHaveLength(0);
  });
});

describe("calcConversionSim — with conversion window", () => {
  it("returns correct number of year rows", () => {
    const result = calcConversionSim(base);
    expect(result.years).toHaveLength(5);
  });

  it("trad balance decreases after conversions", () => {
    const result = calcConversionSim(base);
    expect(result.tradBal73).toBeLessThan(500_000 * Math.pow(1.05, 6)); // less than no-conversion growth
  });

  it("Roth balance grows after conversions", () => {
    const result = calcConversionSim(base);
    expect(result.rothBalEnd).toBeGreaterThan(200_000);
  });

  it("totalTax > 0 when conversions happen", () => {
    const result = calcConversionSim(base);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("Scenario B (tax from taxable) gives higher Roth than Scenario A (tax from converted)", () => {
    const result = calcConversionSim(base);
    expect(result.rothBalEnd_tax).toBeGreaterThan(result.rothBalEnd_conv);
  });

  it("rothAdvantage = rothBalEnd_tax - rothBalEnd_conv", () => {
    const result = calcConversionSim(base);
    expect(result.rothAdvantage).toBe(result.rothBalEnd_tax - result.rothBalEnd_conv);
  });

  it("taxableBalEnd_tax < taxableBalEnd_conv (tax came from taxable in B)", () => {
    const result = calcConversionSim(base);
    expect(result.taxableBalEnd_tax).toBeLessThan(result.taxableBalEnd_conv);
  });

  it("conversionTaxSource switches which scenario drives primary fields", () => {
    const resultA = calcConversionSim({ ...base, conversionTaxSource: "converted" });
    const resultB = calcConversionSim({ ...base, conversionTaxSource: "taxable" });
    expect(resultA.rothBalEnd).toBe(resultA.rothBalEnd_conv);
    expect(resultB.rothBalEnd).toBe(resultB.rothBalEnd_tax);
  });
});
