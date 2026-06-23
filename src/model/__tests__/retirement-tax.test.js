import { describe, it, expect } from "vitest";
import {
  calcRMDIncomeFloor,
  calcRMDTax,
  calcRMDTaxSchedule,
  calcWithdrawalOrderTax,
} from "../retirement-tax.js";
import { calcTax, marginalRate, ltcgRate } from "../taxes.js";
import { calcRMDProjection } from "../rmd.js";
import { RMD_START_AGE, ASSUMPTIONS } from "../../config/irs-2026.js";

const MAXR = ASSUMPTIONS.MAX_COMBINED_MARGINAL_RATE;

// ── calcRMDIncomeFloor ───────────────────────────────────────────────────────
describe("calcRMDIncomeFloor", () => {
  const base = {
    includeSS: true, ssClaimingAge: 67, ssTaxableRet: 39_000,
    pensionMonthly: 0, pensionStartAge: 65, effectivePension: 0,
    rmdStartAge: RMD_START_AGE,
  };

  it("counts taxable SS when claimed by RMD start age", () => {
    expect(calcRMDIncomeFloor(base)).toBe(39_000);
  });

  it("excludes SS when claiming is deferred past RMD start age", () => {
    // ssClaimingAge 75 > RMD_START_AGE 73 — SS not yet active at the RMD floor.
    expect(calcRMDIncomeFloor({ ...base, ssClaimingAge: 75 })).toBe(0);
  });

  it("excludes SS entirely when includeSS is false", () => {
    expect(calcRMDIncomeFloor({ ...base, includeSS: false })).toBe(0);
  });

  it("adds pension only when it has started and is non-zero", () => {
    const withPension = { ...base, pensionMonthly: 2_000, pensionStartAge: 65, effectivePension: 24_000 };
    expect(calcRMDIncomeFloor(withPension)).toBe(39_000 + 24_000);
    // pension starting after RMD age is not in the floor
    expect(calcRMDIncomeFloor({ ...withPension, pensionStartAge: 80 })).toBe(39_000);
    // zero pension contributes nothing even if "started"
    expect(calcRMDIncomeFloor({ ...withPension, pensionMonthly: 0 })).toBe(39_000);
  });
});

// ── calcRMDTax / calcRMDTaxSchedule ──────────────────────────────────────────
describe("calcRMDTax / calcRMDTaxSchedule", () => {
  const single = "single";

  it("a single RMD on a $0 floor equals the bracket tax on that RMD", () => {
    const opts = { rmdIncomeFloor: 0, filingStatus: single, retStateRate: 0 };
    expect(calcRMDTax([{ rmd: 50_000 }], opts)).toBe(Math.round(calcTax(50_000, single).tax));
  });

  it("adds the state rate linearly on the full RMD", () => {
    const fedOnly = calcRMDTax([{ rmd: 50_000 }], { rmdIncomeFloor: 0, filingStatus: single, retStateRate: 0 });
    const withState = calcRMDTax([{ rmd: 50_000 }], { rmdIncomeFloor: 0, filingStatus: single, retStateRate: 0.05 });
    expect(withState).toBe(fedOnly + Math.round(50_000 * 0.05));
  });

  // Anti-divergence guard: the lifetime bite must be identical whether computed
  // by the schedule (per-row map → reduce) or by calcRMDTax (reduce). These were
  // two separate copies of the same reduce in App.jsx — BUG-25 finding 4.
  it("schedule bite, summed per-row tax, and calcRMDTax all agree", () => {
    const rmdData = [{ age: 73, rmd: 30_000 }, { age: 74, rmd: 40_000 }, { age: 75, rmd: 55_000 }];
    const opts = { rmdIncomeFloor: 39_035.4, filingStatus: single, retStateRate: 0.05 };
    const sched = calcRMDTaxSchedule({ ...opts, rmdData, fedMarginal: 0.22, maxCombinedMarginalRate: MAXR });
    const perRowSum = sched.rmdDataWithTax.reduce((s, d) => s + d.tax, 0);
    expect(sched.rmdTaxBite).toBe(perRowSum);
    expect(sched.rmdTaxBite).toBe(calcRMDTax(rmdData, opts));
  });

  it("effective rate is the bite divided by total RMDs", () => {
    const rmdData = [{ age: 73, rmd: 30_000 }, { age: 74, rmd: 40_000 }];
    const sched = calcRMDTaxSchedule({
      rmdData, rmdIncomeFloor: 20_000, filingStatus: single, retStateRate: 0,
      fedMarginal: 0.22, maxCombinedMarginalRate: MAXR,
    });
    expect(sched.effectiveRMDTaxRate).toBeCloseTo(sched.rmdTaxBite / 70_000, 10);
  });

  it("falls back to clamped fed+state marginal when there are no RMDs", () => {
    const sched = calcRMDTaxSchedule({
      rmdData: [], rmdIncomeFloor: 0, filingStatus: single, retStateRate: 0.05,
      fedMarginal: 0.24, maxCombinedMarginalRate: MAXR,
    });
    expect(sched.rmdTaxBite).toBe(0);
    expect(sched.effectiveRMDTaxRate).toBe(Math.min(MAXR, 0.24 + 0.05));
  });

  // Value lock: reproduce the golden-master default rmdTaxBite ($683,974) through
  // the extracted module, proving the App.jsx extraction is value-preserving.
  // retTradGross (2_120_026) and ssAnnualBenefit (45_924) are the golden-master
  // locked defaults; retirement state TX → 0% state rate.
  it("reproduces the golden-master default rmdTaxBite (value-preserving)", () => {
    const rmdData = calcRMDProjection({
      tradGrossAtRetirement: 2_120_026, safeRetAge: 65, safeLifeExp: 90,
      returnRate: 5, useTable2: false, spouseCurrentAge: 18, currentAge: 30,
    });
    const rmdIncomeFloor = 45_924 * ASSUMPTIONS.SS_TAXABLE_PCT;
    const { rmdTaxBite } = calcRMDTaxSchedule({
      rmdData, rmdIncomeFloor, filingStatus: single, retStateRate: 0,
      fedMarginal: 0.22, maxCombinedMarginalRate: MAXR,
    });
    expect(rmdTaxBite).toBe(683_974);
  });
});

// ── calcWithdrawalOrderTax ───────────────────────────────────────────────────
describe("calcWithdrawalOrderTax", () => {
  const single = "single";
  const baseBalances = {
    retTaxable: 200_000, retTrad: 300_000, retRoth: 100_000, tradGrossAtRet: 384_000,
    rmdIncomeFloor: 39_035, filingStatus: single, retStateRate: 0, maxCombinedMarginalRate: MAXR,
  };

  // Conservation / anti-plug: the three funding sources must exactly cover the
  // need (capped at total available), with no hidden remainder or overshoot.
  it("funding sources sum to the need, capped at total available", () => {
    const r = calcWithdrawalOrderTax({ ...baseBalances, netPortfolioNeed: 350_000 });
    const totalAvail = baseBalances.retTaxable + baseBalances.retTrad + baseBalances.retRoth;
    expect(r.yr1FromTaxable + r.yr1FromTrad + r.yr1FromRoth)
      .toBe(Math.min(350_000, totalAvail));
  });

  it("drains taxable, then trad, then Roth in priority order", () => {
    // need below the taxable balance → entirely from taxable
    const small = calcWithdrawalOrderTax({ ...baseBalances, netPortfolioNeed: 120_000 });
    expect(small.yr1FromTaxable).toBe(120_000);
    expect(small.yr1FromTrad).toBe(0);
    expect(small.yr1FromRoth).toBe(0);
    // need above taxable+trad → Roth covers the remainder
    const big = calcWithdrawalOrderTax({ ...baseBalances, netPortfolioNeed: 550_000 });
    expect(big.yr1FromTaxable).toBe(200_000);
    expect(big.yr1FromTrad).toBe(300_000);
    expect(big.yr1FromRoth).toBe(50_000);
  });

  it("Roth withdrawals are untaxed (tax-optimal counts only taxable + trad)", () => {
    const r = calcWithdrawalOrderTax({ ...baseBalances, netPortfolioNeed: 550_000 });
    const expected = Math.round(
      // LTCG stacks on the ordinary-income floor (SS/pension + trad draw),
      // matching the model fix — not the always-0% bracket.
      r.yr1FromTaxable * ltcgRate(baseBalances.rmdIncomeFloor + r.yr1FromTrad, single) +
      r.yr1FromTrad    * r.yr1TradRate +
      r.yr1FromRoth    * 0
    );
    expect(r.yr1TaxOptimal).toBe(expected);
  });

  it("worst-case (all pre-tax) is never cheaper than tax-optimal → savings ≥ 0", () => {
    const r = calcWithdrawalOrderTax({ ...baseBalances, netPortfolioNeed: 350_000 });
    expect(r.yr1TaxSavings).toBeGreaterThanOrEqual(0);
    expect(r.yr1TaxSavings).toBe(Math.max(0, r.yr1TaxWorstCase - r.yr1TaxOptimal));
  });

  // BUG-26 regression: the worst-case draw is capped at the GROSS trad balance,
  // not the after-tax display value. With a small gross trad balance the draw
  // must clip there, never exceed it.
  it("worst-case draw caps at the gross trad balance (BUG-26 basis)", () => {
    const r = calcWithdrawalOrderTax({
      ...baseBalances, retTrad: 78_000, tradGrossAtRet: 100_000, netPortfolioNeed: 150_000,
    });
    expect(r.worstCaseDraw).toBe(100_000); // min(need 150k, gross 100k) — not retTrad 78k
    const wcRate = Math.min(MAXR, marginalRate(39_035 + 100_000, single) + 0);
    expect(r.yr1TaxWorstCase).toBe(Math.round(100_000 * wcRate));
  });
});
