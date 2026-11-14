import { describe, it, expect } from "vitest";
import { clamp } from "../finance-math.js";

describe("clamp(v, min, max)", () => {
  it("returns v when inside the range (bounds inclusive)", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it("returns min below the range and max above it", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("min > max returns min (the ssClaimingAge / BUG-63 corner), whatever v is", () => {
    expect(clamp(5, 10, 3)).toBe(10);
    expect(clamp(0, 10, 3)).toBe(10);
    expect(clamp(50, 10, 3)).toBe(10);
  });
  it("min === max pins to that value", () => {
    expect(clamp(7, 4, 4)).toBe(4);
  });
  it("+/-Infinity values clamp to the bounds; infinite bounds are open ends", () => {
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
    expect(clamp(5, -Infinity, Infinity)).toBe(5);
    expect(clamp(-5, -Infinity, 10)).toBe(-5);
    expect(clamp(50, 0, Infinity)).toBe(50);
  });
  it("NaN value propagates as NaN (documented: callers must guard, as with the inline form)", () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });
  it("matches the Math.max(min, Math.min(max, v)) spelling it replaces, everywhere", () => {
    for (const v of [-5, 0, 3, 10, 12]) for (const [lo, hi] of [[0, 10], [10, 0], [4, 4]]) {
      expect(clamp(v, lo, hi)).toBe(Math.max(lo, Math.min(hi, v)));
    }
  });
});
