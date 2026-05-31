import { describe, it, expect } from "vitest";
import {
  calcNetPortfolioNeed,
  calcWithdrawalRate,
  calcYearsSustained,
} from "../drawdown.js";

describe("calcNetPortfolioNeed", () => {
  it("subtracts SS and pension from expenses", () => {
    expect(calcNetPortfolioNeed(80_000, 30_000, 10_000)).toBe(40_000);
  });

  it("clamps to 0 when SS+pension cover all expenses", () => {
    expect(calcNetPortfolioNeed(50_000, 40_000, 20_000)).toBe(0);
  });

  it("never goes negative", () => {
    expect(calcNetPortfolioNeed(30_000, 50_000, 20_000)).toBe(0);
  });

  it("full draw when no SS and no pension", () => {
    expect(calcNetPortfolioNeed(80_000, 0, 0)).toBe(80_000);
  });
});

describe("calcWithdrawalRate", () => {
  it("returns 4% for $40K need on $1M portfolio", () => {
    expect(calcWithdrawalRate(40_000, 1_000_000)).toBeCloseTo(4.0, 4);
  });

  it("returns 0 when portfolio is 0", () => {
    expect(calcWithdrawalRate(40_000, 0)).toBe(0);
  });
});

describe("calcYearsSustained", () => {
  it("returns Infinity when need <= 0", () => {
    expect(calcYearsSustained(0, 1_000_000, 0.01)).toBe(Infinity);
  });

  it("returns Infinity when portfolio return >= draw (sustainable)", () => {
    // $1M * 3% real = $30K — just covers $30K need
    expect(calcYearsSustained(30_000, 1_000_000, 0.03)).toBe(Infinity);
  });

  it("returns finite years for unsustainable scenario", () => {
    const yrs = calcYearsSustained(50_000, 500_000, 0.02);
    expect(yrs).toBeGreaterThan(0);
    expect(yrs).toBeLessThan(100);
  });

  it("yearsSustained WITH $20K SS > WITHOUT SS (same portfolio)", () => {
    const expenses = 70_000;
    const portfolio = 800_000;
    const rReal = 0.01;
    const withSS    = calcYearsSustained(calcNetPortfolioNeed(expenses, 20_000, 0), portfolio, rReal);
    const withoutSS = calcYearsSustained(calcNetPortfolioNeed(expenses, 0, 0), portfolio, rReal);
    expect(withSS).toBeGreaterThan(withoutSS);
  });

  it("handles rReal = 0 (no real return)", () => {
    const yrs = calcYearsSustained(40_000, 1_000_000, 0);
    expect(yrs).toBeCloseTo(25, 0); // $1M / $40K = 25 years
  });
});
