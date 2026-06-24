import { calcConversionSim } from "./roth-conversion.js";
import { calcHealthcareExposure, calcConversionCosts } from "./healthcare.js";

// The ONE Roth-conversion evaluation pipeline. Both the display path and the
// optimizer's per-amount search call this, so they can never compute the plan
// differently (the divergence the optimizer comment used to warn about, and the
// BUG-31 "two implementations of one calc" root cause).
//
// BUG-35: the RMD-tax savings and the conversion tax now come from the SINGLE
// per-account retirement engine (buildRetirementPhase) — passed in as
// `rmdTaxSaved` and `conversionCost` — instead of a separate nominal-growth,
// withdrawal-ignoring projection (calcRMDPostConversion / calcRMDTax, removed).
// This function no longer re-derives the RMD side at all; it only:
//   1. runs the conversion sim — for the per-year window DISPLAY (amounts, the
//      "tax from converted vs from taxable" Roth-advantage) and the ACA/IRMAA MAGI,
//   2. computes the per-year ACA/IRMAA exposure + real healthcare costs,
//   3. assembles net benefit = (engine rmdTaxSaved − engine conversionCost), then
//      the adjusted benefit after healthcare costs.
//
// The caller resolves the retirement row first (already-retired fallback) and
// passes conversionWindowYrs of 0 when there is no row.
export function evaluateConversionPlan({
  // conversion simulation (display + healthcare MAGI)
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
  // window start age (1-indexed sim years → real ages: year yr → windowStartAge + yr).
  // At the default window this equals safeRetAge+1; a user-chosen later start shifts it.
  windowStartAge,
  // engine-derived benefit (single source — from buildRetirementPhase)
  rmdTaxSaved,
  conversionCost,
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
  // raw years are 1-indexed (yr+1), so real age = (yr+1) + (windowStartAge-1) = windowStartAge + yr.
  const conversionSim = { ...raw, years: raw.years.map(y => ({ ...y, age: y.age + windowStartAge - 1 })) };

  // Net benefit comes straight from the engine: RMD tax saved minus the conversion
  // tax the engine actually charged on the live balances.
  const netConversionBenefit = rmdTaxSaved - conversionCost;

  const healthcareExposure = calcHealthcareExposure({
    conversionYears: conversionSim.years, convMAGIFloors,
    hasMarketplaceInsurance, householdSize, hasMedicare, filingStatus,
  });
  const { irmaaCost, acaLoss, cliffYears } = calcConversionCosts({
    exposure: healthcareExposure, personOnMedicare,
    hasMarketplaceInsurance, marketplaceMonthlyPremium, monthsPerYear,
  });
  const adjustedNetConversionBenefit = netConversionBenefit - irmaaCost - acaLoss;

  return {
    conversionSim, rmdTaxSaved, conversionCost, netConversionBenefit,
    healthcareExposure, irmaaCost, acaLoss, cliffYears, adjustedNetConversionBenefit,
  };
}
