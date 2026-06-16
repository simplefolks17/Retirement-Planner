// ── Retirement-phase income tax (pure) ──────────────────────────────────────
//
// Everything here was previously inline in App.jsx, where it could not be
// unit-tested (npm test only exercises src/model/) and where the same RMD-tax
// reduce was duplicated at two sites — the exact shape of BUG-25 (finding 4) and
// the BUG-26 worst-case-basis bug. Extracting it makes the math testable and
// gives the chart/optimizer/withdrawal-card ONE definition to share.
//
// Two concerns live here:
//   1. RMD tax — each year's RMD stacked on the SS+pension income floor, taxed
//      bracket-accurately (calcTax(floor+rmd) − calcTax(floor)) plus state rate.
//   2. Withdrawal-order tax — the year-1 "tax-optimal" (taxable → trad → Roth)
//      vs "worst-case" (all from pre-tax) comparison shown on the strategy card.
//
// All functions are faithful ports of the prior App.jsx expressions — same
// formulas, same rounding — so the golden master is unchanged (value-preserving).

import { calcTax, marginalRate, ltcgRate, stackedIncomeTax } from "./taxes.js";

// The income floor that retirement RMDs / withdrawals stack on top of: the
// taxable fraction of Social Security plus pension, each counted only if it has
// started by RMD start age (73). Mirrors App.jsx's rmdIncomeSS/rmdIncomePension.
export function calcRMDIncomeFloor({
  includeSS, ssClaimingAge, ssTaxableRet,
  pensionMonthly, pensionStartAge, effectivePension, rmdStartAge,
}) {
  const ss      = includeSS && ssClaimingAge <= rmdStartAge ? ssTaxableRet : 0;
  const pension = pensionMonthly > 0 && pensionStartAge <= rmdStartAge ? effectivePension : 0;
  return ss + pension;
}

// Bracket-accurate tax on ONE year's RMD: the federal marginal cost of stacking
// `rmd` on top of `rmdIncomeFloor`, plus the flat state rate on the full RMD.
// Delegates to stackedIncomeTax (shared with Roth-conversion tax, BUG-29).
function rmdRowTax(rmd, rmdIncomeFloor, filingStatus, retStateRate) {
  return stackedIncomeTax(rmd, rmdIncomeFloor, filingStatus, retStateRate);
}

// Lifetime RMD tax for a set of RMD rows (e.g. the post-conversion schedule).
// Self-contained: each row calls stackedIncomeTax independently so it can be
// called anywhere without threading `baseFedTax` through. This is the single
// definition that App.jsx's display path AND the conversion optimizer now share
// (previously two copies of this reduce — BUG-25 finding 4).
export function calcRMDTax(rows, { rmdIncomeFloor, filingStatus, retStateRate }) {
  return rows.reduce(
    (sum, { rmd }) => sum + rmdRowTax(rmd, rmdIncomeFloor, filingStatus, retStateRate),
    0,
  );
}

// Full RMD tax schedule: per-year tax attached to each row, the lifetime bite,
// and the effective rate used for display captions. The effective rate falls
// back to a clamped fed+state marginal when there are no RMDs (empty schedule).
export function calcRMDTaxSchedule({
  rmdData, rmdIncomeFloor, filingStatus, retStateRate,
  fedMarginal, maxCombinedMarginalRate,
}) {
  const { tax: rmdBaseFedTax } = calcTax(rmdIncomeFloor, filingStatus);
  const rmdDataWithTax = rmdData.map(({ age, rmd, bal, divisor }) => ({
    age, rmd, bal, divisor,
    tax: rmdRowTax(rmd, rmdIncomeFloor, filingStatus, retStateRate),
  }));
  const rmdTaxBite = rmdDataWithTax.reduce((s, d) => s + d.tax, 0);
  const totalRMDs  = rmdData.reduce((s, d) => s + d.rmd, 0);
  const effectiveRMDTaxRate = totalRMDs > 0
    ? rmdTaxBite / totalRMDs
    : Math.min(maxCombinedMarginalRate, fedMarginal + retStateRate);
  return { rmdBaseFedTax, rmdDataWithTax, rmdTaxBite, effectiveRMDTaxRate };
}

// Year-1 withdrawal-order tax comparison.
//   Tax-optimal: fund the year's need from taxable (LTCG) → trad (ordinary) →
//                Roth (tax-free), in that order.
//   Worst-case:  fund it all from the pre-tax trad balance first.
// The trad marginal rate is stacked on the SS+pension floor and clamped at
// `maxCombinedMarginalRate`. The worst-case draw is capped at the GROSS trad
// balance (tradGrossAtRet) — the BUG-26 worst-case-basis fix, preserved here.
// (Both retTrad and tradGrossAtRet are gross now, BUG-35; the cap uses the
// addlPreTaxBal-inclusive tradGrossAtRet.)
export function calcWithdrawalOrderTax({
  netPortfolioNeed, retTaxable, retTrad, retRoth, tradGrossAtRet,
  rmdIncomeFloor, filingStatus, retStateRate, maxCombinedMarginalRate,
}) {
  const yr1FromTaxable = Math.min(netPortfolioNeed, retTaxable);
  const yr1FromTrad    = Math.min(Math.max(0, netPortfolioNeed - yr1FromTaxable), retTrad);
  const yr1FromRoth    = Math.min(Math.max(0, netPortfolioNeed - yr1FromTaxable - yr1FromTrad), retRoth);

  const yr1TradRate = Math.min(
    maxCombinedMarginalRate,
    marginalRate(rmdIncomeFloor + yr1FromTrad, filingStatus) + retStateRate,
  );
  // The LTCG rate stacks on the ordinary-income floor (SS/pension + any trad
  // draw), mirroring how the trad path stacks on rmdIncomeFloor — passing 0
  // always picked the 0% bracket and overstated savings for higher-income
  // retirees. Display-only year-1 figure.
  const yr1TaxOptimal = Math.round(
    yr1FromTaxable * ltcgRate(rmdIncomeFloor + yr1FromTrad, filingStatus) +
    yr1FromTrad    * yr1TradRate +
    yr1FromRoth    * 0
  );

  const worstCaseDraw = Math.min(netPortfolioNeed, tradGrossAtRet);
  const yr1TradRateWC = Math.min(
    maxCombinedMarginalRate,
    marginalRate(rmdIncomeFloor + worstCaseDraw, filingStatus) + retStateRate,
  );
  const yr1TaxWorstCase = Math.round(worstCaseDraw * yr1TradRateWC);
  const yr1TaxSavings   = Math.max(0, yr1TaxWorstCase - yr1TaxOptimal);

  return {
    yr1FromTaxable, yr1FromTrad, yr1FromRoth, yr1TradRate,
    yr1TaxOptimal, worstCaseDraw, yr1TaxWorstCase, yr1TaxSavings,
  };
}
