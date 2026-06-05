import { describe, it, expect } from "vitest";
import { calcTaxBasis } from "../tax-basis.js";
import { FICA_RATE, FICA_WAGE_BASE } from "../../config/irs-2026.js";

// Default UI state (mirrors the golden master): single, $100k, TX, contrib401k
// $10k + HSA $3,850, no spouse, no state override.
const defaults = {
  currentIncome: 100_000, spouseIncome: 0, filingStatus: "single",
  contrib401k: 10_000, contribHSA: 3_850, otherPreTaxDeduc: 0,
  selectedState: "TX", stateRateOverride: null,
};

describe("calcTaxBasis — default state (golden-master value lock)", () => {
  const b = calcTaxBasis(defaults);

  it("matches the golden-master federal figures", () => {
    expect(b.agi).toBe(86_150);                 // 100k − (10k + 3.85k) deduction
    expect(b.fedTax).toBe(10_123);
    expect(b.fedEffRate).toBeCloseTo(0.11750435287289611, 10);
    expect(b.fedMarginal).toBe(0.22);
  });

  it("computes TX (no income tax), per-earner FICA, and grossAfterTax", () => {
    expect(b.stateTax).toBe(0);
    expect(b.noStateTax).toBe(true);
    expect(b.fica).toBe(100_000 * FICA_RATE);   // single earner, under the wage base
    expect(b.householdIncome).toBe(100_000);
    expect(b.grossAfterTax).toBe(100_000 - 10_123 - 0 - 100_000 * FICA_RATE);
  });

  it("is below the single Roth phase-out at $100k", () => {
    expect(b.rothPhaseoutWarning).toBe(false);
    expect(b.rothFullyPhased).toBe(false);
  });
});

describe("calcTaxBasis — MFJ uses combined income (rules 3 & 9)", () => {
  it("adds spouse income to AGI and household income only for MFJ", () => {
    const single = calcTaxBasis({ ...defaults, spouseIncome: 80_000 });
    const mfj    = calcTaxBasis({ ...defaults, spouseIncome: 80_000, filingStatus: "mfj" });
    // Single ignores spouse income in AGI; MFJ adds it.
    expect(mfj.agi - single.agi).toBe(80_000);
    expect(single.householdIncome).toBe(100_000);
    expect(mfj.householdIncome).toBe(180_000);
  });
});

describe("calcTaxBasis — FICA is per-earner and wage-base capped", () => {
  it("caps each earner at the wage base independently", () => {
    // primary $300k (over base) → capped; spouse $0
    const hi = calcTaxBasis({ ...defaults, currentIncome: 300_000 });
    expect(hi.fica).toBe(FICA_WAGE_BASE * FICA_RATE);
    // two earners each over the base → twice the capped amount
    const two = calcTaxBasis({ ...defaults, currentIncome: 300_000, spouseIncome: 300_000, filingStatus: "mfj" });
    expect(two.fica).toBe(2 * FICA_WAGE_BASE * FICA_RATE);
  });
});

describe("calcTaxBasis — Roth phase-out is filing-status aware (BUG-12)", () => {
  it("a single filer is tested on primary MAGI alone, MFJ on combined", () => {
    // primary $120k, spouse $200k
    const single = calcTaxBasis({ ...defaults, currentIncome: 120_000, spouseIncome: 200_000 });
    const mfj    = calcTaxBasis({ ...defaults, currentIncome: 120_000, spouseIncome: 200_000, filingStatus: "mfj" });
    expect(single.rothMAGI).toBe(120_000);      // spouse income excluded
    expect(mfj.rothMAGI).toBe(320_000);         // combined
    expect(mfj.rothFullyPhased).toBe(true);     // well above the MFJ end
  });
});

describe("calcTaxBasis — state rate override", () => {
  it("override replaces the state-table rate regardless of selectedState", () => {
    const b = calcTaxBasis({ ...defaults, selectedState: "TX", stateRateOverride: 0.05 });
    expect(b.stateRate).toBe(0.05);
    expect(b.stateTax).toBe(b.agi * 0.05);
    expect(b.noStateTax).toBe(false);
  });
});
