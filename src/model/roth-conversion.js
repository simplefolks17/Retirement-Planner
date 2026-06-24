import { stackedIncomeTax } from "./taxes.js";
import { ASSUMPTIONS } from "../config/irs-2026.js";

// Optimizer: finds the scalar annual conversion that maximizes net benefit
// accounting for IRMAA and ACA subsidy costs. Coarse search (ASSUMPTIONS.
// CONVERSION_STEP, $5k) up to $300k.
// getNetBenefit(amount) → { rmdTaxSaved, totalTax, irmaaCost, acaLoss? }
// is provided by the caller (App.jsx) to avoid circular deps with rmd.js.
export function findOptimalConversion({ maxSearch = 300_000, step = ASSUMPTIONS.CONVERSION_STEP, getNetBenefit }) {
  const netOf = (r) => r.rmdTaxSaved - r.totalTax - r.irmaaCost - (r.acaLoss ?? 0);
  let bestAmount = 0;
  let bestNet = netOf(getNetBenefit(0));

  // Guard a non-positive / non-finite step: the search loop increments by
  // `step`, so step <= 0 (or NaN) would never terminate. Fall back to the
  // no-conversion result rather than spin forever.
  if (!Number.isFinite(step) || step <= 0) {
    return { optimalConversion: 0, optimalBenefit: Math.round(bestNet) };
  }

  for (let amount = step; amount <= maxSearch; amount += step) {
    const net = netOf(getNetBenefit(amount));
    if (net > bestNet) { bestNet = net; bestAmount = amount; }
  }
  return { optimalConversion: bestAmount, optimalBenefit: Math.round(bestNet) };
}

// Optimizer (timing + amount): searches BOTH the conversion-window start age and the
// flat annual amount that together maximize net benefit after IRMAA/ACA. Same coarse
// objective as findOptimalConversion, with an added age dimension.
//   startAgeRange = [minStart, maxStart] (inclusive) — bound tightly by the caller to
//     the legal window so the nested search stays cheap.
//   getNetBenefit(startAge, amount) → { rmdTaxSaved, totalTax, irmaaCost, acaLoss? }
//     MUST rebuild the SAME model the display uses (engine + evaluateConversionPlan)
//     for the candidate (startAge, amount) — divergence here is the BUG-31/BUG-35 class.
export function findOptimalConversionPlan({
  startAgeRange = [], maxSearch = 300_000,
  step = ASSUMPTIONS.CONVERSION_STEP,
  ageStep = ASSUMPTIONS.CONVERSION_STARTAGE_STEP ?? 1,
  getNetBenefit,
}) {
  const netOf = (r) => r.rmdTaxSaved - r.totalTax - r.irmaaCost - (r.acaLoss ?? 0);
  // Destructure defensively — a missing / non-array range must hit the fallback below,
  // not throw before the guard runs.
  const [minStart, maxStart] = Array.isArray(startAgeRange) ? startAgeRange : [];

  // Guard non-finite / non-positive steps (would never terminate). Fall back to the
  // no-conversion result at the earliest start age (0 when the range itself is invalid).
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(maxSearch) || maxSearch < 0
      || !Number.isFinite(ageStep) || ageStep <= 0
      || !Number.isFinite(minStart) || !Number.isFinite(maxStart)) {
    const safeStart = Number.isFinite(minStart) ? minStart : 0;
    return { optimalStartAge: safeStart, optimalConversion: 0, optimalBenefit: 0 };
  }

  // Baseline: no conversion. Converting $0 nets exactly $0 by definition (no RMD tax
  // saved, no conversion cost, no IRMAA/ACA) — so seed bestNet at 0 directly instead of
  // running the engine twice via getNetBenefit(minStart, 0) (Gemini review).
  let bestStartAge = minStart;
  let bestAmount = 0;
  let bestNet = 0;

  for (let startAge = minStart; startAge <= maxStart; startAge += ageStep) {
    for (let amount = step; amount <= maxSearch; amount += step) {
      const net = netOf(getNetBenefit(startAge, amount));
      if (net > bestNet) { bestNet = net; bestStartAge = startAge; bestAmount = amount; }
    }
  }
  return { optimalStartAge: bestStartAge, optimalConversion: bestAmount, optimalBenefit: Math.round(bestNet) };
}

// Runs the Roth conversion ladder simulation through the conversion window.
// Computes BOTH scenarios simultaneously:
//   Scenario A: tax paid from the converted amount (less efficient)
//   Scenario B: tax paid from the taxable brokerage account (more efficient)
//
// Returns both scenario results plus legacy fields pointing to the selected source.
export function calcConversionSim({
  conversionWindowYrs,
  annualConversion,
  // Optional per-year conversion targets. When provided, overrides annualConversion
  // for each year so the bracket-fill amount can grow in low-income years (e.g.
  // before SS/pension start) where more bracket room is available.
  annualConversions,
  returnRate,
  retIncomeFloor,
  // Optional per-year income floors array. When provided, overrides retIncomeFloor
  // for each year so pre-SS / pre-pension years use the correct (lower) floor.
  retIncomeFloors,
  filingStatus,
  conversionTaxSource,
  tradGrossAtRetirement,
  // Scalar balances at retirement — replaces retVals["Roth IRA"] / retVals["Taxable"]
  rothBalAtRet,
  taxableBalAtRet,
  retStateRate = 0,
}) {
  if (conversionWindowYrs === 0) {
    return {
      years: [],
      tradBal73: tradGrossAtRetirement,
      rothBalEnd_conv: rothBalAtRet,   totalTax_conv: 0,  taxableBalEnd_conv: taxableBalAtRet,
      rothBalEnd_tax:  rothBalAtRet,   totalTax_tax:  0,  taxableBalEnd_tax:  taxableBalAtRet,
      rothBalEnd:      rothBalAtRet,   totalTax: 0,
    };
  }

  const r = returnRate / 100;

  // Scenario A: tax from converted amount
  let tradA = tradGrossAtRetirement, rothA = rothBalAtRet, taxableA = taxableBalAtRet, totalTaxA = 0;
  // Scenario B: tax from taxable brokerage
  let tradB = tradGrossAtRetirement, rothB = rothBalAtRet, taxableB = taxableBalAtRet, totalTaxB = 0;

  const years = [];

  for (let yr = 0; yr < conversionWindowYrs; yr++) {
    tradA *= (1 + r); rothA *= (1 + r); taxableA *= (1 + r);
    tradB *= (1 + r); rothB *= (1 + r); taxableB *= (1 + r);

    const yearTarget = annualConversions ? (annualConversions[yr] ?? annualConversion) : annualConversion;
    const conversion = Math.min(yearTarget, Math.min(tradA, tradB));
    const floor = retIncomeFloors ? (retIncomeFloors[yr] ?? retIncomeFloor) : retIncomeFloor;
    const taxOnConversion = stackedIncomeTax(conversion, floor, filingStatus, retStateRate);

    // Scenario A: deduct tax from the converted amount itself
    tradA -= conversion;
    rothA += (conversion - taxOnConversion);
    totalTaxA += taxOnConversion;

    // Scenario B: pay tax from taxable brokerage. Cap the amount drawn from
    // taxable at the available balance — taxableB can't go negative (that would
    // be implicit borrowing). Any tax the brokerage can't cover falls back to
    // coming out of the converted amount (reducing what lands in Roth), so no
    // dollar is conjured.
    tradB -= conversion;
    const taxFromTaxableB = Math.min(taxOnConversion, Math.max(0, taxableB));
    const taxFromConvertedB = taxOnConversion - taxFromTaxableB;
    rothB += (conversion - taxFromConvertedB);
    taxableB -= taxFromTaxableB;
    totalTaxB += taxOnConversion;

    years.push({
      age: 0 + yr + 1, // caller adds safeRetAge offset if needed
      conversion: Math.round(conversion),
      tradBal: Math.round(conversionTaxSource === "taxable" ? tradB : tradA),
      rothBal: Math.round(conversionTaxSource === "taxable" ? rothB : rothA),
      tax: Math.round(taxOnConversion),
    });
  }

  // One final year of growth on the trad balance to reach age 73
  tradA *= (1 + r);
  tradB *= (1 + r);

  const primaryRoth    = conversionTaxSource === "taxable" ? Math.round(rothB)    : Math.round(rothA);
  const primaryTax     = conversionTaxSource === "taxable" ? Math.round(totalTaxB) : Math.round(totalTaxA);
  const primaryTradBal = conversionTaxSource === "taxable" ? Math.round(tradB)    : Math.round(tradA);

  return {
    years,
    tradBal73:    primaryTradBal,
    rothBalEnd:   primaryRoth,
    totalTax:     primaryTax,
    rothBalEnd_conv:    Math.round(rothA),    totalTax_conv:    Math.round(totalTaxA), taxableBalEnd_conv: Math.round(taxableA),
    rothBalEnd_tax:     Math.round(rothB),    totalTax_tax:     Math.round(totalTaxB), taxableBalEnd_tax:  Math.round(taxableB),
    rothAdvantage: Math.round(rothB - rothA),
  };
}
