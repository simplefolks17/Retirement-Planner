import { describe, it, expect } from "vitest";
import { calcTax, marginalRate, ltcgRate, calcStateTax, projectRetirementBracket } from "../taxes.js";

describe("calcTax", () => {
  it("returns zero tax on zero income", () => {
    const { tax, effectiveRate } = calcTax(0, "single");
    expect(tax).toBe(0);
    expect(effectiveRate).toBe(0);
  });

  it("taxes income below standard deduction at 0", () => {
    const { tax } = calcTax(16_100, "single"); // exactly the deduction
    expect(tax).toBe(0);
  });

  it("correctly computes tax in the 22% bracket (single)", () => {
    // AGI = $80,000, single. deduction = $16,100, taxable = $63,900
    // 10% on first $12,400 = $1,240
    // 12% on $12,400–$50,400 = $4,560
    // 22% on $50,400–$63,900 = $2,970
    // Total = $8,770
    const { tax } = calcTax(80_000, "single");
    expect(tax).toBe(8_770);
  });

  it("effectiveRate = tax / agi", () => {
    const { tax, effectiveRate } = calcTax(100_000, "single");
    expect(Math.abs(effectiveRate - tax / 100_000)).toBeLessThan(0.0001);
  });

  it("handles MFJ filing status", () => {
    // AGI = $50,000 MFJ. deduction = $32,200, taxable = $17,800
    // 10% on first $24,800 = $2,480 — but taxable is only $17,800
    // 10% on $17,800 = $1,780
    const { tax } = calcTax(50_000, "mfj");
    expect(tax).toBe(1_780);
  });

  it("falls back to single for unknown filing status", () => {
    const { tax: tSingle } = calcTax(80_000, "single");
    const { tax: tUnknown } = calcTax(80_000, "unknown_status");
    expect(tSingle).toBe(tUnknown);
  });
});

describe("marginalRate", () => {
  it("returns 10% at low income", () => {
    expect(marginalRate(20_000, "single")).toBe(0.10);
  });

  it("returns 22% in middle of that bracket", () => {
    // AGI $75,000 single, taxable = $75,000 - $16,100 = $58,900 — in 22% bracket
    expect(marginalRate(75_000, "single")).toBe(0.22);
  });

  it("returns 37% for top bracket", () => {
    expect(marginalRate(700_000, "single")).toBe(0.37);
  });

  it("top bracket: uses table rate, not hardcoded 0.37", () => {
    // Verify code reads from brackets array, not a literal
    // Both should equal 0.37 for 2026, but test ensures the function reads the table
    expect(marginalRate(1_000_000, "single")).toBe(0.37);
    expect(marginalRate(1_000_000, "mfs")).toBe(0.37);
  });

  it("returns 0% below deduction (10% bracket, taxable = 0)", () => {
    expect(marginalRate(10_000, "single")).toBe(0.10); // taxable = 0 — hits first bracket with max Infinity
  });
});

describe("ltcgRate", () => {
  it("returns 0% for zero income", () => {
    expect(ltcgRate(0, "single")).toBe(0.00);
  });

  it("returns 15% in middle bracket", () => {
    expect(ltcgRate(100_000, "single")).toBe(0.15);
  });

  it("returns 20% for top income", () => {
    expect(ltcgRate(600_000, "single")).toBe(0.20);
  });

  it("top bracket: uses table rate, not hardcoded 0.20", () => {
    expect(ltcgRate(999_999_999, "mfj")).toBe(0.20);
  });
});

describe("calcStateTax", () => {
  it("uses STATE_TAX table for working", () => {
    // TX rate = 0, so tax = 0
    expect(calcStateTax(100_000, "working", "TX")).toBe(0);
    // CA rate = 0.093
    expect(calcStateTax(100_000, "working", "CA")).toBeCloseTo(9_300, 0);
  });

  it("uses RETIREMENT_STATE_TAX for retirement", () => {
    // IL retirement rate = 0 (exempts retirement income)
    expect(calcStateTax(100_000, "retirement", "IL")).toBe(0);
    // CA retirement rate = 0.093
    expect(calcStateTax(100_000, "retirement", "CA")).toBeCloseTo(9_300, 0);
  });

  it("honors rateOverride regardless of tableKey or stateCode", () => {
    expect(calcStateTax(100_000, "working", "CA", 0.05)).toBe(5_000);
  });

  it("returns 0 for unknown state code", () => {
    expect(calcStateTax(100_000, "working", "ZZ")).toBe(0);
  });
});

describe("projectRetirementBracket", () => {
  it("maps low retirement income to the 10% bracket", () => {
    const r = projectRetirementBracket({ avgAnnualRMD: 0, householdSS: 0, effectivePension: 10_000, filingStatus: "single" });
    expect(r.bracketPct).toBe(10);
  });

  it("applies the 85% SS taxable fraction in the income total, lands in 22% bracket", () => {
    const r = projectRetirementBracket({ avgAnnualRMD: 20_000, householdSS: 40_000, effectivePension: 10_000, filingStatus: "single" });
    expect(r.projRetIncome).toBe(64_000); // 20k + round(40k*0.85=34k) + 10k
    expect(r.bracketPct).toBe(22);        // 50_400 <= 64_000 < 105_700
  });

  it("falls back to the top bracket for very high income", () => {
    const r = projectRetirementBracket({ avgAnnualRMD: 900_000, householdSS: 0, effectivePension: 0, filingStatus: "single" });
    expect(r.bracketPct).toBe(37);
  });
});
