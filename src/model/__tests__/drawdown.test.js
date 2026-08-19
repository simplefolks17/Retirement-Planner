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
    expect(f.spouseIncome).toBe(0);
    expect(f.portfolioDraw).toBe(40_000);
    expect(f.ss + f.pension + f.spouseIncome + f.portfolioDraw).toBeCloseTo(80_000, 6);
  });

  it("no income: portfolio funds the whole expense, bands still sum to expenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 60_000, ss: 0, pension: 0 });
    expect(f.portfolioDraw).toBe(60_000);
    expect(f.ss).toBe(0);
    expect(f.spouseIncome).toBe(0);
    expect(f.ss + f.pension + f.spouseIncome + f.portfolioDraw).toBeCloseTo(60_000, 6);
  });

  it("over-funded edge: income exceeds expenses → scaled down to sum exactly to expenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 40_000, ss: 30_000, pension: 30_000 });
    expect(f.portfolioDraw).toBe(0);
    expect(f.ss + f.pension).toBeCloseTo(40_000, 6);     // scaled, not 60k
    expect(f.ss).toBeCloseTo(20_000, 6);                 // proportional (equal sources)
    expect(f.ss + f.pension + f.portfolioDraw).toBeCloseTo(40_000, 6);
  });

  // #30 / BUG-82: spouse gap-year income is a 4th band.
  it("spouseIncome defaults to 0 → byte-identical to omitting it", () => {
    const withDefault = calcRetIncomeFlow({ effectiveExpenses: 80_000, ss: 30_000, pension: 10_000 });
    const explicitZero = calcRetIncomeFlow({ effectiveExpenses: 80_000, ss: 30_000, pension: 10_000, spouseIncome: 0 });
    expect(withDefault).toEqual(explicitZero);
  });

  it("with spouse gap income: all 4 bands sum to effectiveExpenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 90_000, ss: 30_000, pension: 10_000, spouseIncome: 20_000 });
    expect(f.ss).toBe(30_000);
    expect(f.pension).toBe(10_000);
    expect(f.spouseIncome).toBe(20_000);
    expect(f.portfolioDraw).toBe(30_000);
    expect(f.ss + f.pension + f.spouseIncome + f.portfolioDraw).toBeCloseTo(90_000, 6);
  });

  it("spouse gap income alone exceeds expenses → scaled down, portfolioDraw 0, bands still sum to expenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 20_000, ss: 0, pension: 0, spouseIncome: 50_000 });
    expect(f.portfolioDraw).toBe(0);
    expect(f.spouseIncome).toBeCloseTo(20_000, 6);   // scaled down from 50k to fill exactly expenses
    expect(f.ss + f.pension + f.spouseIncome + f.portfolioDraw).toBeCloseTo(20_000, 6);
  });
});

// ── guaranteedPct — Plan's "Guaranteed for life" card ────────────────────────
// The card exists to stop the page overclaiming; the field's whole job is that
// a spouse's TEMPORARY gap-year paycheck can never be counted as permanent
// income. That is the property these tests pin, not just the arithmetic.
describe("calcRetIncomeFlow — guaranteedPct (SS + pension only)", () => {
  it("is (ss + pension) / expenses", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 80_000, ss: 30_000, pension: 10_000 });
    expect(f.guaranteedIncome).toBe(40_000);
    expect(f.guaranteedPct).toBe(50);
  });

  it("EXCLUDES a spouse's gap-year income from the numerator but keeps it in the denominator", () => {
    // Same household, same $80k spend, same $20k SS. The only difference is a
    // spouse still working. Their pay reduces the PORTFOLIO draw — it must not
    // move the guaranteed share, because it stops at their own retirement.
    const withoutSpouse = calcRetIncomeFlow({ effectiveExpenses: 80_000, ss: 20_000, pension: 0 });
    const withSpouse = calcRetIncomeFlow({
      effectiveExpenses: 80_000, ss: 20_000, pension: 0, spouseIncome: 40_000,
    });
    expect(withSpouse.portfolioDraw).toBe(20_000);   // spouse pay did reduce the draw
    expect(withSpouse.spouseIncome).toBe(40_000);
    expect(withSpouse.guaranteedIncome).toBe(20_000); // …and not the guarantee
    expect(withSpouse.guaranteedPct).toBe(25);
    expect(withSpouse.guaranteedPct).toBe(withoutSpouse.guaranteedPct);
    // The "everything that isn't portfolio draw" definition this replaces would
    // have read 75% here — the exact overclaim the card is meant to prevent.
    const naive = Math.round(((80_000 - withSpouse.portfolioDraw) / 80_000) * 100);
    expect(naive).toBe(75);
    expect(withSpouse.guaranteedPct).not.toBe(naive);
  });

  it("a spouse-income-only household is 0% guaranteed, not 100%", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 60_000, ss: 0, pension: 0, spouseIncome: 60_000 });
    expect(f.portfolioDraw).toBe(0);       // nothing drawn from savings that year…
    expect(f.guaranteedPct).toBe(0);       // …and nothing guaranteed for life either
  });

  it("uses the SCALED bands on the over-funded edge, so it can never exceed 100", () => {
    const f = calcRetIncomeFlow({ effectiveExpenses: 40_000, ss: 30_000, pension: 30_000 });
    expect(f.guaranteedPct).toBe(100);
  });

  // BUG-122: this is the case the two tests above can't reach. "Over-funded"
  // alone (no spouse) never discriminates the raw-vs-scaled source, because
  // `scale` is 1 unless incomeTotal > exp; "spouse-exclusion" alone never
  // discriminates it either, because that fixture's incomeTotal stays under
  // exp (scale is still 1 there). Only BOTH together — spouse income pushing
  // incomeTotal over exp — puts a live `scale < 1` factor on the SS/pension
  // bands, which is exactly what used to leak spouse income into the percent.
  it("is identical with and without a spouse's income even in the SCALED (over-funded) regime — the actual dilution repro (BUG-122)", () => {
    // exp 40k, ss 30k alone: under-funded, scale=1, guaranteedPct = 75.
    const withoutSpouse = calcRetIncomeFlow({ effectiveExpenses: 40_000, ss: 30_000, pension: 0 });
    expect(withoutSpouse.guaranteedPct).toBe(75);
    // Same household, spouse adds 30k: incomeTotal (60k) > exp (40k) — the
    // scaled regime. Pre-fix, ssBand was scaled down by spouseIncome's own
    // share of incomeTotal, diluting the percent even though ss itself didn't
    // change. Post-fix, the percent must stay unchanged.
    const withSpouse = calcRetIncomeFlow({
      effectiveExpenses: 40_000, ss: 30_000, pension: 0, spouseIncome: 30_000,
    });
    expect(withSpouse.portfolioDraw).toBe(0);        // fully over-funded, nothing drawn
    expect(withSpouse.guaranteedPct).toBe(75);
    expect(withSpouse.guaranteedPct).toBe(withoutSpouse.guaranteedPct);
    // The scaled-band formula this replaces would have read 50 here
    // (ssBand = 30k * (40k/60k) = 20k → 20k/40k = 50%) — proving this fixture
    // actually reaches the regime the earlier tests couldn't.
    const scaleDilutedFormula = Math.round((30_000 * (40_000 / 60_000) / 40_000) * 100);
    expect(scaleDilutedFormula).toBe(50);
    expect(withSpouse.guaranteedPct).not.toBe(scaleDilutedFormula);
  });

  it("is null — a designed '—', never 0 — when there are no expenses to take a share of", () => {
    expect(calcRetIncomeFlow({ effectiveExpenses: 0, ss: 20_000, pension: 0 }).guaranteedPct).toBeNull();
  });

  it("is basis-INVARIANT: inflating every input by the same factor leaves it unchanged", () => {
    // The Plan screen's dollar-basis toggle must not move this number, which is
    // only true because numerator and denominator scale together.
    const factor = 1.03 ** 35;
    const today = calcRetIncomeFlow({ effectiveExpenses: 57_377, ss: 24_000, pension: 6_000 });
    const retYear = calcRetIncomeFlow({
      effectiveExpenses: 57_377 * factor, ss: 24_000 * factor, pension: 6_000 * factor,
    });
    expect(retYear.guaranteedPct).toBe(today.guaranteedPct);
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

  // #30 / BUG-82: optional 4th spouse-gap-income term.
  it("spouseIncome defaults to 0 → byte-identical to omitting it", () => {
    expect(calcNetPortfolioNeed(80_000, 30_000, 10_000)).toBe(calcNetPortfolioNeed(80_000, 30_000, 10_000, 0));
  });

  it("subtracts spouse gap income too", () => {
    expect(calcNetPortfolioNeed(80_000, 30_000, 10_000, 15_000)).toBe(25_000);
  });

  it("clamps to 0 when spouse income alone exceeds remaining expenses", () => {
    expect(calcNetPortfolioNeed(80_000, 30_000, 10_000, 100_000)).toBe(0);
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
