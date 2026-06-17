import { describe, it, expect } from "vitest";
import { calcAIME, calcPIA, calcBenefit, calcSpousal, claimFactor } from "../social-security.js";

describe("calcAIME", () => {
  it("caps earnings at FICA wage base ($184,500)", () => {
    // $300K earner — each year capped at $184,500 (2026 SS wage base)
    const aime = calcAIME(300_000, 0, 35);
    // max possible: 184,500 * 35 / 35 / 12 = 15,375
    expect(aime).toBeCloseTo(184_500 / 12, 0);
  });

  it("SS benefit for $300K earner must be less than $60K/yr (wage-base cap)", () => {
    const aime = calcAIME(300_000, 0, 35);
    const pia  = calcPIA(aime);
    const annual = calcBenefit(pia, 67) * 12;
    expect(annual).toBeLessThan(60_000); // capped — far below what uncapped $300K would imply
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

  it("clamps an out-of-range claiming age to the nearest 62/70 boundary (review hardening)", () => {
    // Above 70 → pin to the age-70 ceiling (1.24), NOT the FRA factor (the old fallback,
    // which understated a 71+ claim). Below 62 → pin to the age-62 floor (0.70).
    expect(calcBenefit(2_000, 99)).toBe(Math.round(2_000 * 1.240)); // clamps to 70
    expect(calcBenefit(2_000, 55)).toBe(Math.round(2_000 * 0.700)); // clamps to 62
  });
});

describe("calcSpousal", () => {
  // PIA = $2,500 → spousal floor at FRA = $2,500 * 12 * 0.5 = $15,000/yr

  it("returns 50% of PIA × 12 at FRA (age 67)", () => {
    expect(calcSpousal(2_500, 67)).toBe(Math.round(2_500 * 12 * 0.5));  // $15,000
  });

  it("reduces the spousal floor for an early claim (age 62, factor 0.70)", () => {
    const expected = Math.round(2_500 * 12 * 0.5 * 0.70);
    expect(calcSpousal(2_500, 62)).toBe(expected);
  });

  it("does NOT inflate the spousal floor for a delayed claim (age 70 === FRA value — key correctness guard)", () => {
    // Spousal benefit earns NO delayed credits; factor is capped at 1.
    expect(calcSpousal(2_500, 70)).toBe(calcSpousal(2_500, 67));
  });

  it("uses FRA factor (1) when spouseClaimingAge is omitted", () => {
    expect(calcSpousal(2_500)).toBe(calcSpousal(2_500, 67));
  });

  it("clamps a fractional early age to its reduced factor (not a lookup-miss fallback to 1)", () => {
    // 62.4 rounds to 62 → reduced. The old raw SS_FACTORS[62.4] missed → ?? 1 → wrongly
    // returned the un-reduced FRA floor. Must now match the age-62 reduced amount.
    expect(calcSpousal(2_500, 62.4)).toBe(calcSpousal(2_500, 62));
    expect(calcSpousal(2_500, 62.4)).toBeLessThan(calcSpousal(2_500, 67));
  });

  it("clamps an out-of-range high age (71) to the 70 boundary, still capped at 1", () => {
    expect(calcSpousal(2_500, 71)).toBe(calcSpousal(2_500, 67));
  });
});

describe("claimFactor", () => {
  it("clamps below 62 to the age-62 factor and above 70 to the age-70 factor", () => {
    expect(claimFactor(55)).toBe(claimFactor(62));
    expect(claimFactor(75)).toBe(claimFactor(70));
  });

  it("rounds a fractional age to the nearest whole year", () => {
    expect(claimFactor(64.6)).toBe(claimFactor(65));
  });
});
