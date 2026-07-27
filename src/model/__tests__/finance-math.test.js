import { describe, it, expect } from "vitest";
import { fvAnnuity, toRetirementYearDollars, inflationRebaseFactor } from "../finance-math.js";

describe("fvAnnuity", () => {
  it("compounds an annual contribution at a positive rate", () => {
    // 10000/yr for 5yr at 5%: 10000 * ((1.05^5 - 1)/0.05) = 55256.3125
    expect(fvAnnuity(10_000, 0.05, 5)).toBeCloseTo(55_256.3125, 4);
  });

  it("is linear (annual × years) when the rate is 0", () => {
    expect(fvAnnuity(10_000, 0, 20)).toBe(200_000);
  });

  it("compounds (shrinks), not linear, at a NEGATIVE real rate", () => {
    // 10000/yr for 5yr at -2%: 10000 * ((0.98^5 - 1)/-0.02) = 48,039.6016
    // Must use the geometric formula — the old `rate > 0` guard wrongly fell
    // through to annual*years (50,000), overstating a declining-balance FV.
    const fv = fvAnnuity(10_000, -0.02, 5);
    expect(fv).toBeCloseTo(48_039.6016, 3);
    expect(fv).toBeLessThan(50_000); // strictly less than the zero-rate linear case
  });

  it("returns 0 for a non-positive contribution", () => {
    expect(fvAnnuity(0, 0.05, 10)).toBe(0);
    expect(fvAnnuity(-100, 0.05, 10)).toBe(0);
  });

  it("returns 0 for a non-positive horizon", () => {
    expect(fvAnnuity(10_000, 0.05, 0)).toBe(0);
  });
});

describe("toRetirementYearDollars (BUG-91)", () => {
  it("inflates a today's-dollar amount forward by (1+inflation)^years", () => {
    expect(toRetirementYearDollars(57_377, 4, 35)).toBeCloseTo(57_377 * Math.pow(1.04, 35), 6);
  });

  it("is a no-op at 0 years to retirement", () => {
    expect(toRetirementYearDollars(50_000, 4, 0)).toBe(50_000);
  });

  it("is a no-op at 0% inflation", () => {
    expect(toRetirementYearDollars(50_000, 0, 20)).toBe(50_000);
  });

  it("clamps a negative years-to-retirement to 0 (never deflates)", () => {
    expect(toRetirementYearDollars(50_000, 4, -5)).toBe(50_000);
  });

  it("guards a pathological rate (<=-100%) by returning the amount unchanged", () => {
    expect(toRetirementYearDollars(50_000, -150, 10)).toBe(50_000);
  });
});

describe("inflationRebaseFactor (BUG-91 / what-if scenario re-basing)", () => {
  it("is 1 at zero years difference", () => {
    expect(inflationRebaseFactor(4, 0)).toBe(1);
  });

  it("inflates forward for a positive years difference", () => {
    expect(inflationRebaseFactor(4, 5)).toBeCloseTo(Math.pow(1.04, 5), 10);
  });

  it("deflates (factor < 1) for a NEGATIVE years difference — unlike toRetirementYearDollars", () => {
    const f = inflationRebaseFactor(4, -5);
    expect(f).toBeCloseTo(Math.pow(1.04, -5), 10);
    expect(f).toBeLessThan(1);
  });

  it("guards a pathological rate by returning 1 (no rebase)", () => {
    expect(inflationRebaseFactor(-150, 5)).toBe(1);
  });
});
