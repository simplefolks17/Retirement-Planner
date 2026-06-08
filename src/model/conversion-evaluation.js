import { calcConversionSim } from "./roth-conversion.js";
import { calcRMDPostConversion } from "./rmd.js";
import { calcRMDTax } from "./retirement-tax.js";
import { calcHealthcareExposure, calcConversionCosts } from "./healthcare.js";

// The ONE Roth-conversion evaluation pipeline. Both the display path and the
// optimizer's per-amount search call this, so they can never compute the plan
// differently (the divergence the optimizer comment used to warn about, and the
// BUG-31 "two implementations of one calc" root cause).
//
// Pipeline: simulate the conversion → offset the per-year ages by safeRetAge ONCE
// (so display and healthcare both see real ages) → project post-conversion RMDs
// → bracket-accurate RMD tax → RMD tax saved vs no conversion → net benefit →
// per-year ACA/IRMAA exposure → real healthcare costs → adjusted net benefit.
//
// The caller resolves the retirement row first (already-retired fallback) and
// passes the resolved balances + a conversionWindowYrs of 0 when there is no row;
// this function assumes its inputs are final.
export function evaluateConversionPlan({
  // conversion simulation
  conversionWindowYrs,
  annualConversion,
  annualConversions = null,   // per-year overrides (bracket mode); null = flat amount
  returnRate,
  retIncomeFloor,
  retIncomeFloors,
  filingStatus,
  conversionTaxSource,
  retStateRate,
  tradGrossAtRetirement,
  rothBalAtRet,
  taxableBalAtRet,
  // age offset (1-indexed sim years → real ages)
  safeRetAge,
  // post-conversion RMD projection + savings basis
  rmdData,
  safeLifeExp,
  useTable2,
  spouseCurrentAge,
  currentAge,
  rmdTaxBite,                 // pre-conversion lifetime RMD tax (the savings baseline)
  rmdIncomeFloor,
  // healthcare exposure + costs
  convMAGIFloors,
  hasMarketplaceInsurance,
  householdSize,
  hasMedicare,
  personOnMedicare,
  marketplaceMonthlyPremium,
  monthsPerYear,
}) {
  const raw = calcConversionSim({
    conversionWindowYrs, annualConversion, annualConversions, returnRate,
    retIncomeFloor, retIncomeFloors, filingStatus, conversionTaxSource, retStateRate,
    tradGrossAtRetirement, rothBalAtRet, taxableBalAtRet,
  });
  // Offset year ages once; totalTax / tradBal73 / rothBalEnd* are scalars unaffected.
  const conversionSim = { ...raw, years: raw.years.map(y => ({ ...y, age: y.age + safeRetAge })) };

  const rmdDataPostConversion = calcRMDPostConversion({
    conversionWindowYrs, rmdData, tradBal73: conversionSim.tradBal73,
    safeLifeExp, returnRate, useTable2, spouseCurrentAge, currentAge,
  });
  const rmdTaxBitePost = calcRMDTax(rmdDataPostConversion, { rmdIncomeFloor, filingStatus, retStateRate });
  const rmdTaxSaved          = Math.max(0, rmdTaxBite - rmdTaxBitePost);
  const netConversionBenefit = rmdTaxSaved - conversionSim.totalTax;

  const healthcareExposure = calcHealthcareExposure({
    conversionYears: conversionSim.years, convMAGIFloors,
    hasMarketplaceInsurance, householdSize, hasMedicare, filingStatus,
  });
  const { irmaaCost, acaLoss, cliffYears } = calcConversionCosts({
    exposure: healthcareExposure, personOnMedicare,
    hasMarketplaceInsurance, marketplaceMonthlyPremium, monthsPerYear,
  });
  const adjustedNetConversionBenefit = netConversionBenefit - irmaaCost - acaLoss;

  // Returns the FULL bundle on purpose. The display path uses ~9 of these fields;
  // the optimizer's getNetBenefit reads only 4 (rmdTaxSaved, conversionSim.totalTax,
  // irmaaCost, acaLoss). That is NOT wasted work — the fields the optimizer "ignores"
  // (cliffYears, adjustedNetConversionBenefit, etc.) are free byproducts already
  // computed while producing the 4 it needs; the genuinely expensive calls
  // (calcRMDPostConversion, calcHealthcareExposure) are required by those 4. Do NOT
  // split this into lean/full variants to "save" the byproducts — that re-introduces
  // the two-implementations divergence this function exists to prevent. See the
  // "evaluateConversionPlan returns a full bundle" design note in docs/ARCHITECTURE.md.
  return {
    conversionSim, rmdDataPostConversion, rmdTaxBitePost, rmdTaxSaved, netConversionBenefit,
    healthcareExposure, irmaaCost, acaLoss, cliffYears, adjustedNetConversionBenefit,
  };
}
