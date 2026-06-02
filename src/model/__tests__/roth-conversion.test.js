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

describe("calcConversionSim — per-year conversion targets (annualConversions)", () => {
  it("each year's conversion follows the per-year target array", () => {
    // Larger targets in early (low-income) years, smaller later — tests that the
    // model honors the array rather than the single annualConversion scalar.
    const annualConversions = [60_000, 60_000, 40_000, 20_000, 20_000];
    const result = calcConversionSim({ ...base, annualConversions });
    expect(result.years[0].conversion).toBe(60_000);
    expect(result.years[2].conversion).toBe(40_000);
    expect(result.years[4].conversion).toBe(20_000);
  });

  it("per-year target is still capped by the available trad balance", () => {
    // Target far exceeds the trad balance → conversion is clamped to trad, not target.
    const annualConversions = [10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000];
    const result = calcConversionSim({ ...base, annualConversions });
    expect(result.years[0].conversion).toBeLessThanOrEqual(500_000 * 1.05);
  });

  it("falls back to annualConversion scalar for years past the array length", () => {
    const annualConversions = [50_000]; // only one entry for a 5-year window
    const result = calcConversionSim({ ...base, annualConversions });
    expect(result.years[0].conversion).toBe(50_000);
    expect(result.years[1].conversion).toBe(base.annualConversion); // 30_000 fallback
  });

  it("omitting annualConversions reproduces the scalar behavior exactly", () => {
    const withArr  = calcConversionSim({ ...base, annualConversions: null });
    const scalar   = calcConversionSim(base);
    expect(withArr.totalTax).toBe(scalar.totalTax);
    expect(withArr.rothBalEnd).toBe(scalar.rothBalEnd);
  });
});
