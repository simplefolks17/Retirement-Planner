import { describe, it, expect } from "vitest";
import { fvAnnuity } from "../finance-math.js";

describe("fvAnnuity", () => {
  it("compounds an annual contribution at a positive rate", () => {
    // 10000/yr for 5yr at 5%: 10000 * ((1.05^5 - 1)/0.05) = 55256.3125
    expect(fvAnnuity(10_000, 0.05, 5)).toBeCloseTo(55_256.3125, 4);
  });

  it("is linear (annual × years) when the rate is 0", () => {
    expect(fvAnnuity(10_000, 0, 20)).toBe(200_000);
  });

  it("returns 0 for a non-positive contribution", () => {
    expect(fvAnnuity(0, 0.05, 10)).toBe(0);
    expect(fvAnnuity(-100, 0.05, 10)).toBe(0);
  });

  it("returns 0 for a non-positive horizon", () => {
    expect(fvAnnuity(10_000, 0.05, 0)).toBe(0);
  });
});
