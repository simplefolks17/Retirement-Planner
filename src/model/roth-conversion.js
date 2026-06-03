import { marginalRate } from "./taxes.js";

// Optimizer: finds the scalar annual conversion that maximizes net benefit
// accounting for IRMAA costs. Coarse $5k search up to $300k.
// getNetBenefit(amount) → { rmdTaxSaved, totalTax, irmaaCost }
// is provided by the caller (App.jsx) to avoid circular deps with rmd.js.
export function findOptimalConversion({ maxSearch = 300_000, step = 5_000, getNetBenefit }) {
  let bestAmount = 0;
  let bestNet;
  // Seed with 0
  { const r = getNetBenefit(0); bestNet = r.rmdTaxSaved - r.totalTax - r.irmaaCost; }

  for (let amount = step; amount <= maxSearch; amount += step) {
    const r = getNetBenefit(amount);
    const net = r.rmdTaxSaved - r.totalTax - r.irmaaCost;
    if (net > bestNet) { bestNet = net; bestAmount = amount; }
  }
  return { optimalConversion: bestAmount, optimalBenefit: Math.round(bestNet) };
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
    const taxOnConversion = Math.round(
      conversion * marginalRate(floor + conversion, filingStatus)
    );

    // Scenario A: deduct tax from the converted amount itself
    tradA -= conversion;
    rothA += (conversion - taxOnConversion);
    totalTaxA += taxOnConversion;

    // Scenario B: pay tax from taxable brokerage
    tradB -= conversion;
    rothB += conversion;
    taxableB -= taxOnConversion;
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
