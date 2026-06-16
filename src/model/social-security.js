import {
  FICA_WAGE_BASE,
  SS_BEND1,
  SS_BEND2,
  SS_FACTORS,
  SS_FRA,
  SS_MIN_CLAIM_AGE,
  SS_MAX_CLAIM_AGE,
  SS_AIME_YEARS,
  ASSUMPTIONS,
} from "../config/irs-2026.js";

// Returns the AIME (Average Indexed Monthly Earnings) from working-year earnings.
// Sum income for each working year (capped at FICA wage base), divide by max(workYears, 35).
// incomeGrowthEndAge + currentAge: if set, income stops growing once the user reaches that age.
export function calcAIME(currentIncome, incomeGrowth, workYears, incomeGrowthEndAge = null, currentAge = 0) {
  const g = incomeGrowth / 100;
  let total = 0;
  for (let y = 0; y < workYears; y++) {
    const growthYears = incomeGrowthEndAge != null
      ? Math.min(y, incomeGrowthEndAge - currentAge)
      : y;
    const yearEarnings = currentIncome * Math.pow(1 + g, growthYears);
    total += Math.min(yearEarnings, FICA_WAGE_BASE);
  }
  return (total / Math.max(workYears, SS_AIME_YEARS)) / ASSUMPTIONS.MONTHS_PER_YEAR;
}

// Returns the PIA (Primary Insurance Amount) given AIME.
export function calcPIA(aime) {
  if (aime <= SS_BEND1) {
    return aime * ASSUMPTIONS.PIA_FACTOR_1;
  } else if (aime <= SS_BEND2) {
    return SS_BEND1 * ASSUMPTIONS.PIA_FACTOR_1 + (aime - SS_BEND1) * ASSUMPTIONS.PIA_FACTOR_2;
  }
  return (
    SS_BEND1 * ASSUMPTIONS.PIA_FACTOR_1 +
    (SS_BEND2 - SS_BEND1) * ASSUMPTIONS.PIA_FACTOR_2 +
    (aime - SS_BEND2) * ASSUMPTIONS.PIA_FACTOR_3
  );
}

// Returns the rounded monthly benefit at the given claiming age.
// Clamp to the [62, 70] table range first: delayed credits stop at 70 and there is no
// early-claim factor below 62, so an out-of-range age should pin to the nearest boundary
// (the table ceiling/floor) — NOT silently fall back to the FRA factor (1.0), which would
// understate a 71+ claim. In practice the claiming-age slider already stays within 62–70,
// so this changes no current output; it makes the lookup correct-by-construction.
export function calcBenefit(pia, claimingAge) {
  const age = Math.max(SS_MIN_CLAIM_AGE, Math.min(SS_MAX_CLAIM_AGE, Math.round(claimingAge)));
  return Math.round(pia * (SS_FACTORS[age] ?? SS_FACTORS[SS_FRA]));
}

// Returns the annual spousal floor benefit: 50% of the primary's PIA at FRA, reduced
// for early claims. Spousal benefits earn NO delayed credits — the factor is capped at 1
// so claiming after 67 does not inflate it above the FRA amount.
export function calcSpousal(pia, spouseClaimingAge = SS_FRA) {
  const factor = Math.min(1, SS_FACTORS[spouseClaimingAge] ?? 1);
  return Math.round(pia * ASSUMPTIONS.MONTHS_PER_YEAR * ASSUMPTIONS.SPOUSAL_BENEFIT_PCT * factor);
}
