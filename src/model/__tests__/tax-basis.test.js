import { describe, it, expect } from "vitest";
import { calcTaxBasis } from "../tax-basis.js";
import { FICA_RATE, FICA_WAGE_BASE, SS_TAX_RATE, MEDICARE_RATE,
         ADDL_MEDICARE_RATE, ADDL_MEDICARE_THRESHOLD } from "../../config/irs-2026.js";

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

describe("calcTaxBasis — FICA: SS capped, Medicare uncapped, 0.9% surtax (review fix)", () => {
  it("caps only Social Security at the wage base; Medicare is uncapped + 0.9% surtax for high earners", () => {
    // Single $300k: SS capped at the wage base, Medicare on the full $300k, plus 0.9% on
    // the $100k above the $200k single threshold. (Old buggy behavior capped the whole 7.65%.)
    const hi = calcTaxBasis({ ...defaults, currentIncome: 300_000 });
    const hiExpected = FICA_WAGE_BASE * SS_TAX_RATE
      + 300_000 * MEDICARE_RATE
      + (300_000 - ADDL_MEDICARE_THRESHOLD.single) * ADDL_MEDICARE_RATE;
    expect(hi.fica).toBeCloseTo(hiExpected, 6);
    expect(hi.fica).toBeGreaterThan(FICA_WAGE_BASE * FICA_RATE); // strictly more than the old cap

    // Two earners each $300k, MFJ: SS capped per-earner; Medicare on combined $600k; 0.9% on
    // the amount above the $250k MFJ threshold.
    const two = calcTaxBasis({ ...defaults, currentIncome: 300_000, spouseIncome: 300_000, filingStatus: "mfj" });
    const twoExpected = 2 * FICA_WAGE_BASE * SS_TAX_RATE
      + 600_000 * MEDICARE_RATE
      + (600_000 - ADDL_MEDICARE_THRESHOLD.mfj) * ADDL_MEDICARE_RATE;
    expect(two.fica).toBeCloseTo(twoExpected, 6);
  });

  it("is unchanged below the wage base (default-path parity: 6.2% + 1.45% = 7.65%, no surtax)", () => {
    const b = calcTaxBasis(defaults); // single $100k
    expect(b.fica).toBeCloseTo(100_000 * FICA_RATE, 6); // 6.2%+1.45% on full wages, no cap binding
  });
});

describe("calcTaxBasis — Roth phase-out is filing-status aware (BUG-12)", () => {
  it("a single filer is tested on primary MAGI alone, MFJ on combined", () => {
    // primary $120k, spouse $200k
    const single = calcTaxBasis({ ...defaults, currentIncome: 120_000, spouseIncome: 200_000 });
    const mfj    = calcTaxBasis({ ...defaults, currentIncome: 120_000, spouseIncome: 200_000, filingStatus: "mfj" });
    // Roth MAGI is now the AGI-net basis (nets pre-tax 401k/HSA); agi already encodes the
    // single=primary-only vs MFJ=combined rule, so rothMAGI === agi for both.
    expect(single.rothMAGI).toBe(single.agi);          // spouse income excluded (primary AGI only)
    expect(mfj.rothMAGI).toBe(mfj.agi);                // combined AGI
    expect(mfj.rothMAGI - single.rothMAGI).toBe(200_000); // MFJ adds the full spouse income
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
