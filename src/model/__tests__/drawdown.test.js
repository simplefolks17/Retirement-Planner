import { describe, it, expect } from "vitest";
import {
  calcNetPortfolioNeed,
  calcWithdrawalRate,
  calcYearsSustained,
  calcDrawdownYears,
  calcSSDelayGain,
  calcRetIncomeFlow,
} from "../drawdown.js";

describe("calcRetIncomeFlow (WI-2.6)", () => {
  it("normal case: ss + pension + portfolioDraw == expenses, portfolioDraw = net need", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 80_000, ss: 30_000, pension: 10_000 });
    expect(f.ss).toBe(30_000);
    expect(f.pension).toBe(10_000);
    expect(f.portfolioDraw).toBe(40_000);
    expect(f.ss + f.pension + f.portfolioDraw).toBeCloseTo(80_000, 6);
  });

  it("no income: portfolio funds the whole expense, bands still sum to expenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 60_000, ss: 0, pension: 0 });
    expect(f.portfolioDraw).toBe(60_000);
    expect(f.ss).toBe(0);
    expect(f.ss + f.pension + f.portfolioDraw).toBeCloseTo(60_000, 6);
  });

  it("over-funded edge: income exceeds expenses → scaled down to sum exactly to expenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 40_000, ss: 30_000, pension: 30_000 });
    expect(f.portfolioDraw).toBe(0);
    expect(f.ss + f.pension).toBeCloseTo(40_000, 6);     // scaled, not 60k
    expect(f.ss).toBeCloseTo(20_000, 6);                 // proportional (equal sources)
    expect(f.ss + f.pension + f.portfolioDraw).toBeCloseTo(40_000, 6);
  });
});

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

describe("calcDrawdownYears (BUG-26)", () => {
  it("returns Infinity when SS+pension cover all expenses (no draw)", () => {
    const yrs = calcDrawdownYears({
      startBal: 1_000_000, startAge: 65, effectiveExpenses: 40_000, rReal: 0.02,
      ssAmount: 50_000, ssClaimAge: 65,
    });
    expect(yrs).toBe(Infinity);
  });

  it("returns Infinity when portfolio growth covers the draw", () => {
    // $1M * 3% real = $30K, exactly the net need ($40K - $10K SS active from age 65)
    const yrs = calcDrawdownYears({
      startBal: 1_000_000, startAge: 65, effectiveExpenses: 40_000, rReal: 0.03,
      ssAmount: 10_000, ssClaimAge: 65,
    });
    expect(yrs).toBe(Infinity);
  });

  it("matches the no-real-return closed form when SS is active from day one", () => {
    // No SS/pension, rReal=0: $1M / $40K = 25 years. Year-by-year depletes during year 25.
    const yrs = calcDrawdownYears({
      startBal: 1_000_000, startAge: 65, effectiveExpenses: 40_000, rReal: 0,
    });
    expect(yrs).toBe(25);
  });

  it("counts higher pre-claim draws — deferred SS lasts no longer than immediate SS at the same amount", () => {
    // Same portfolio and SS amount, but claiming later means more full-expense years
    // up front, so the portfolio cannot last longer than the claim-now case.
    const common = {
      startBal: 800_000, startAge: 60, effectiveExpenses: 80_000, rReal: 0.02,
      ssAmount: 45_000,
    };
    const claimNow   = calcDrawdownYears({ ...common, ssClaimAge: 60 });
    const claimAt70  = calcDrawdownYears({ ...common, ssClaimAge: 70 });
    expect(claimAt70).toBeLessThanOrEqual(claimNow);
  });

  it("a larger delayed benefit can still beat a smaller immediate benefit", () => {
    // Delaying to 70 raises the benefit; with enough uplift the lifetime longevity wins.
    const common = {
      startBal: 1_500_000, startAge: 65, effectiveExpenses: 70_000, rReal: 0.015,
    };
    const claimAt67 = calcDrawdownYears({ ...common, ssAmount: 36_000, ssClaimAge: 67 });
    const claimAt70 = calcDrawdownYears({ ...common, ssAmount: 45_000, ssClaimAge: 70 });
    expect(claimAt70).toBeGreaterThan(claimAt67);
  });

  it("the BUG-26 fix yields fewer delay-gain years than the old closed-form overstatement", () => {
    // Worked example from BUGS.md: retire 60, claim 70. Pre-70 need ~$80k, post-70 ~$35k.
    // Old code solved ysSS70 from the FULL retirement balance at the post-70 draw rate.
    const startBal = 1_000_000, startAge = 60, effectiveExpenses = 80_000, rReal = 0.045;
    const need70   = 35_000; // effectiveExpenses - household70SS
    // Old (buggy) closed form: longevity at the low post-70 draw, from totalAtRet.
    const oldYsSS70 = calcYearsSustained(need70, startBal, rReal);
    // New: walk year-by-year, full-expense draws until 70, then $35k net need.
    const newDelayYrs = calcDrawdownYears({
      startBal, startAge, effectiveExpenses, rReal,
      ssAmount: effectiveExpenses - need70, ssClaimAge: 70,
    });
    expect(newDelayYrs).toBeLessThan(oldYsSS70);
  });
});

describe("calcSSDelayGain", () => {
  const base = {
    includeSS: true, ssClaimingAge: 65, ssMaxClaimAge: 70, yearsSustained: 30,
    totalAtRet: 1_000_000, safeRetAge: 60, effectiveExpenses: 80_000, rReal: 0.01,
    householdSS: 30_000, household70SS: 42_000, pensionMonthly: 0, pensionStartAge: 70,
    monthsPerYear: 12,
  };

  it("returns null when SS is excluded", () => {
    expect(calcSSDelayGain({ ...base, includeSS: false })).toBeNull();
  });

  it("returns null when already claiming at/after the max age", () => {
    expect(calcSSDelayGain({ ...base, ssClaimingAge: 70 })).toBeNull();
  });

  it("returns null when the portfolio never depletes (yearsSustained Infinity)", () => {
    expect(calcSSDelayGain({ ...base, yearsSustained: Infinity })).toBeNull();
  });

  it("returns a non-negative integer year gain for a depleting portfolio", () => {
    const gain = calcSSDelayGain(base);
    expect(gain).not.toBeNull();
    expect(Number.isInteger(gain)).toBe(true);
    expect(gain).toBeGreaterThanOrEqual(0);
  });
});
