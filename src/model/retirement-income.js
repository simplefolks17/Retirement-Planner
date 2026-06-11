// ── Retirement income composition (pure) ────────────────────────────────────
//
// Composes the Social Security leaf functions (social-security.js) and pension
// into the household income figures that feed the drawdown: householdSS, ssAtRet
// (the headline gate), ssTaxableRet, effectivePension, and the delay-to-70
// comparison amounts. Extracted from App.jsx so the gating logic — which is the
// BUG-10 family (SS only reduces the at-retirement need if already claimed) — is
// unit-tested instead of re-derived inline.
//
// Per CLAUDE.md rule 5 / 5b: ssAtRet and effectivePension are the only figures
// gated to "active at retirement"; householdSS / ssTaxableRet are the full
// amounts used by the per-year drawdown loops (which apply their own age gates).

import { calcAIME, calcPIA, calcBenefit, calcSpousal } from "./social-security.js";
import { SS_FRA, SS_MAX_CLAIM_AGE, SS_FACTORS, ASSUMPTIONS } from "../config/irs-2026.js";

export function calcRetirementIncome({
  currentIncome, incomeGrowth, incomeGrowthEndAge = null, safeRetAge, currentAge,
  ssClaimingAge, includeSS, ssOverride, spouseSsEstimate,
  pensionMonthly, pensionStartAge,
  isMarried = false, spouseClaimingAge = SS_FRA, spouseBenefitBasis = "own",
}) {
  const MPY = ASSUMPTIONS.MONTHS_PER_YEAR;

  const ssWorkYears      = Math.max(1, safeRetAge - currentAge);
  const ssAIME           = calcAIME(currentIncome, incomeGrowth, ssWorkYears, incomeGrowthEndAge, currentAge);
  const ssPIA            = calcPIA(ssAIME);
  const ssMonthlyBenefit = calcBenefit(ssPIA, ssClaimingAge);
  const ssAnnualBenefit  = ssMonthlyBenefit * MPY;
  const ss67Monthly      = calcBenefit(ssPIA, SS_FRA);

  // ssOverride lets the user pin their own annual SS figure; includeSS zeroes it.
  const effectiveSS  = includeSS ? (ssOverride !== null ? ssOverride : ssAnnualBenefit) : 0;

  // Spouse SS: choose between own record (earns delayed credits) or spousal floor
  // (capped at 50% of PIA — no delayed credits). The unchosen basis is reported as
  // spouseAlt for the advisory note. Gated by isMarried; default state is single → 0.
  const factor       = SS_FACTORS[spouseClaimingAge] ?? 1;          // own benefit earns delayed credits
  const ownReduced   = Math.round(spouseSsEstimate * factor);        // estimate is an at-FRA figure
  const spousalFloor = calcSpousal(ssPIA, spouseClaimingAge);        // capped at 50% (no delayed credits)
  const spouseChosen = isMarried ? (spouseBenefitBasis === "spousal" ? spousalFloor : ownReduced) : 0;
  const spouseAlt    = isMarried ? (spouseBenefitBasis === "spousal" ? ownReduced : spousalFloor) : 0;
  const spouseAltHigher = isMarried && spouseAlt > spouseChosen;

  const spouseSsBenefit = spouseChosen;
  const householdSS     = includeSS ? effectiveSS + spouseSsBenefit : 0;
  // SS reduces the headline at-retirement need only if it is already claimed by
  // retirement; otherwise it is deferred (mirrors the effectivePension gate). BUG-10.
  const ssAtRet         = includeSS && ssClaimingAge <= safeRetAge ? householdSS : 0;
  const ssTaxableRet    = householdSS * ASSUMPTIONS.SS_TAXABLE_PCT;

  // Delay-to-70 comparison: benefit if SS is instead claimed at the max age.
  const ss70Annual        = Math.round(ssPIA * SS_FACTORS[SS_MAX_CLAIM_AGE]) * MPY;
  const household70SS     = ss70Annual + spouseSsBenefit;
  const ss70DrawReduction = Math.max(0, household70SS - householdSS);

  // Pension counts only once it has started by retirement (rule 5b gate).
  const effectivePension = pensionStartAge <= safeRetAge && pensionMonthly > 0
    ? pensionMonthly * MPY : 0;

  return {
    ssWorkYears, ssAIME, ssPIA, ssMonthlyBenefit, ssAnnualBenefit, ss67Monthly,
    effectiveSS, spouseSsBenefit, householdSS, ssAtRet, ssTaxableRet,
    ss70Annual, household70SS, ss70DrawReduction, effectivePension,
    spouseAlt, spouseAltHigher, spouseBenefitBasis,
  };
}

// SS break-even age: the age at which cumulative benefits from a non-FRA claiming
// age cross the cumulative-at-FRA line. Returns null at FRA (no comparison) or if
// they never cross within a 50-year horizon. Walks month by month so the crossing
// is found at the right age regardless of which side started ahead.
export function calcSSBreakEven({ ssClaimingAge, ssMonthlyBenefit, ss67Monthly }) {
  if (ssClaimingAge === SS_FRA) return null;
  const MPY = ASSUMPTIONS.MONTHS_PER_YEAR;
  const tStart = Math.min(ssClaimingAge, SS_FRA);
  let cumClaim = 0, cum67 = 0;
  for (let m = 1; m <= 50 * MPY; m++) {
    const ageNow = tStart + m / MPY;
    if (ageNow >= ssClaimingAge) cumClaim += ssMonthlyBenefit;
    if (ageNow >= SS_FRA)        cum67    += ss67Monthly;
    if (ssClaimingAge < SS_FRA && cum67 >= cumClaim && ageNow > SS_FRA)
      return Math.floor(ageNow);
    if (ssClaimingAge > SS_FRA && cumClaim >= cum67 && ageNow > ssClaimingAge)
      return Math.floor(ageNow);
  }
  return null;
}
