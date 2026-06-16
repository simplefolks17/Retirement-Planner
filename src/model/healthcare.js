import { ACA_FPL_2026, ACA_CLIFF_PCT, IRMAA_BRACKETS_2026, MEDICARE_AGE } from "../config/irs-2026.js";

// Returns the 400% FPL cliff MAGI threshold for a household.
// householdSize: 1–6 (capped at 6).
export function acaCliffThreshold(householdSize) {
  const fpl = ACA_FPL_2026[Math.min(Math.max(1, householdSize), 6)];
  return Math.round(fpl * ACA_CLIFF_PCT / 100);
}

// Returns annual IRMAA surcharge (Part B + D) per person for a given MAGI.
export function irmaaAnnualSurcharge(magi, filingStatus) {
  const key = filingStatus === "mfj" ? "mfj" : "single";
  const brackets = IRMAA_BRACKETS_2026[key];
  let surcharge = 0;
  for (const b of brackets) {
    if (magi >= b.magi) surcharge = b.annualSurcharge;
    else break;
  }
  return surcharge;
}

// Per-year ACA and IRMAA analysis across the conversion window.
// Returns array (one entry per conversion year) with cliff/surcharge details.
export function calcHealthcareExposure({
  conversionYears,       // array of {age, conversion} from conversionSim.years
  convMAGIFloors,        // per-year 100%-SS + pension floor (for MAGI, not 85% SS)
  hasMarketplaceInsurance,
  householdSize,
  hasMedicare,
  filingStatus,
}) {
  const cliffMAGI = hasMarketplaceInsurance ? acaCliffThreshold(householdSize) : null;

  return conversionYears.map((yr, i) => {
    const age  = yr.age; // already offset by safeRetAge in App.jsx
    const magi = (convMAGIFloors[i] ?? 0) + yr.conversion;

    const aca = hasMarketplaceInsurance && age < MEDICARE_AGE
      ? { magi, cliffMAGI, crossesCliff: magi > cliffMAGI, margin: cliffMAGI - magi }
      : null;

    const irmaaAge = age + 2; // 2-year lookback: conversion today affects premiums at age+2
    const irmaa = hasMedicare && irmaaAge >= MEDICARE_AGE
      ? { magi, surcharge: irmaaAnnualSurcharge(magi, filingStatus) }
      : null;

    return { age, aca, irmaa };
  });
}

// Rolls a healthcare-exposure array (from calcHealthcareExposure) into the real
// dollar costs charged against a Roth conversion's net benefit. ONE definition
// shared by the display path and the optimizer so the two can never compute the
// cost differently (the BUG-25 #4 duplicated-reduce class).
//   irmaaCost — total Part B+D surcharge across the window × number of enrollees.
//   acaLoss   — full marketplace premium for each year the conversion crosses the
//               subsidy cliff (subsidies are all-or-nothing past the cliff).
//   cliffYears— the exposure entries that cross the cliff (for display).
export function calcConversionCosts({
  exposure,
  personOnMedicare,
  hasMarketplaceInsurance,
  marketplaceMonthlyPremium,
  monthsPerYear,
}) {
  const cliffYears = exposure.filter(e => e.aca?.crossesCliff);
  const irmaaCost  = exposure.reduce((s, e) => s + (e.irmaa?.surcharge ?? 0), 0) * personOnMedicare;
  const acaLoss    = hasMarketplaceInsurance && marketplaceMonthlyPremium
    ? cliffYears.length * marketplaceMonthlyPremium * monthsPerYear
    : 0;
  return { irmaaCost, acaLoss, cliffYears };
}
