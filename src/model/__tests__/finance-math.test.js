import { describe, it, expect } from "vitest";
import { fvAnnuity, clamp } from "../finance-math.js";

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

describe("clamp", () => {
  it("returns the value unchanged when within [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it("pins to the bound when out of range", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("agrees with BOTH inline operand orders when min <= max", () => {
    for (const [v, lo, hi] of [[5,0,10],[-2,0,10],[12,0,10],[62,62,70],[71,62,70]]) {
      expect(clamp(v, lo, hi)).toBe(Math.min(hi, Math.max(lo, v)));
      expect(clamp(v, lo, hi)).toBe(Math.max(lo, Math.min(hi, v)));
    }
  });
  it("normalizes min > max to the lower bound (the corner the two inline forms disagree on)", () => {
    expect(clamp(65, 72, 70)).toBe(72);
    expect(Math.min(70, Math.max(72, 65))).toBe(70); // "min wins" order -> ceiling
    expect(Math.max(72, Math.min(70, 65))).toBe(72); // "max wins" order -> floor
  });
});
