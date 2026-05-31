import { describe, it, expect } from "vitest";
import { calcAIME, calcPIA, calcBenefit, calcSpousal } from "../social-security.js";

describe("calcAIME", () => {
  it("caps earnings at FICA wage base ($168,600)", () => {
    // $300K earner — each year capped at $168,600
    const aime = calcAIME(300_000, 0, 35);
    // max possible: 168,600 * 35 / 35 / 12 = 14,050
    expect(aime).toBeCloseTo(168_600 / 12, 0);
  });

  it("SS benefit for $300K earner must be less than $50K/yr (wage-base cap)", () => {
    const aime = calcAIME(300_000, 0, 35);
    const pia  = calcPIA(aime);
    const annual = calcBenefit(pia, 67) * 12;
    expect(annual).toBeLessThan(50_000);
  });

  it("divides by 35 minimum even with fewer work years", () => {
    const aime10  = calcAIME(100_000, 0, 10);
    const aime35  = calcAIME(100_000, 0, 35);
    // 10 years of $100k / 35 = lower AIME than 35 years
    expect(aime10).toBeLessThan(aime35);
  });

  it("returns 0 for zero income", () => {
    expect(calcAIME(0, 0, 35)).toBe(0);
  });
});

describe("calcPIA", () => {
  it("applies 90% factor below first bend point ($1,226)", () => {
    const pia = calcPIA(1_000);
    expect(pia).toBeCloseTo(900, 0);
  });

  it("applies 32% factor in middle segment", () => {
    // AIME at $2,000: 1226 * 0.90 + (2000 - 1226) * 0.32
    const pia = calcPIA(2_000);
    const expected = 1_226 * 0.90 + (2_000 - 1_226) * 0.32;
    expect(pia).toBeCloseTo(expected, 1);
  });

  it("applies 15% factor above second bend point ($7,391)", () => {
    const aime = 10_000;
    const pia  = calcPIA(aime);
    const expected =
      1_226 * 0.90 +
      (7_391 - 1_226) * 0.32 +
      (aime - 7_391) * 0.15;
    expect(pia).toBeCloseTo(expected, 1);
  });
});

describe("calcBenefit", () => {
  it("returns 100% of PIA at age 67 (FRA)", () => {
    expect(calcBenefit(2_000, 67)).toBe(2_000);
  });

  it("returns 70% of PIA at age 62", () => {
    expect(calcBenefit(2_000, 62)).toBe(Math.round(2_000 * 0.700));
  });

  it("returns 124% of PIA at age 70", () => {
    expect(calcBenefit(2_000, 70)).toBe(Math.round(2_000 * 1.240));
  });

  it("falls back to FRA factor for unknown age", () => {
    expect(calcBenefit(2_000, 99)).toBe(2_000); // 100% of PIA
  });
});

describe("calcSpousal", () => {
  it("returns 0 when spouseEstimate is 0", () => {
    expect(calcSpousal(2_500, 0)).toBe(0);
  });

  it("returns the spousal floor when it exceeds spouse estimate", () => {
    // PIA = $2,500, spousal floor = $2,500 * 12 * 0.5 = $15,000/yr
    expect(calcSpousal(2_500, 5_000)).toBe(15_000);
  });

  it("returns spouse's own estimate when it exceeds the spousal floor", () => {
    // Spouse estimate $20K > spousal floor $15K
    expect(calcSpousal(2_500, 20_000)).toBe(20_000);
  });
});
