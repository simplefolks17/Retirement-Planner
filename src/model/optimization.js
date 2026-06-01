import { TRAD_401K_LIMIT_2026, SS_MAX_CLAIM_AGE, ASSUMPTIONS } from "../config/irs-2026.js";

// Returns the optimized "what-if" scenario projecting additional portfolio value
// from deploying surplus + delaying SS to 70.
// All 23 deps mirror the monolith's optimized useMemo dep array (lines 1281-1285).
export function calcOptimizedScenario({
  totalAtRet,
  optimizedAllocation,
  returnRate,
  incomeGrowth,
  safeRetAge,
  currentAge,
  rate3,
  contrib401k,
  includeSS,
  ssClaimingAge,
  ss70Annual,
  spouseSsBenefit,
  householdSS,
  effectiveExpenses,
  effectivePension,
  rReal,
  safeLifeExp,
  yr1TaxSavings,
  netConversionBenefit,
  isSustainable,
  yearsSustained,
  conversionSim,
  retTaxable,
}) {
  const r = returnRate / 100;
  const g = incomeGrowth / 100;
  const yearsToRet = Math.max(1, safeRetAge - currentAge);
  const oa = optimizedAllocation;

  const fvAnnuity = (annual, rate, years) => {
    if (annual <= 0 || years <= 0) return 0;
    return rate > 0
      ? annual * ((Math.pow(1 + rate, years) - 1) / rate)
      : annual * years;
  };

  // Extra 401k: year-by-year (room shrinks as income-scaled contributions grow)
  let extra401kFV = 0;
  if (oa.extra401k > 0) {
    for (let y = 1; y <= yearsToRet; y++) {
      const growFactor  = Math.pow(1 + g, y - 1);
      const currentC    = contrib401k * growFactor;
      const roomThisYr  = Math.max(0, TRAD_401K_LIMIT_2026 - currentC);
      const extraThisYr = Math.min(oa.extra401k, roomThisYr);
      extra401kFV += extraThisYr * Math.pow(1 + r, yearsToRet - y);
    }
    extra401kFV *= (1 - rate3 / 100);
  }

  const extraHSAFV     = fvAnnuity(oa.extraHSA, r, yearsToRet);
  const extraRothFV    = fvAnnuity(oa.extraRoth, r, yearsToRet);
  // LTCG drag: r * (1 - LTCG_DRAG_PROXY) — NOT r * LTCG_DRAG_PROXY
  const extraTaxableFV = fvAnnuity(oa.extraTaxable, r * (1 - ASSUMPTIONS.LTCG_DRAG_PROXY), yearsToRet);

  const extraPortfolio = Math.round(extra401kFV) + Math.round(extraHSAFV)
                       + Math.round(extraRothFV) + Math.round(extraTaxableFV);
  const optTotalAtRet  = totalAtRet + extraPortfolio;

  const optSS = includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE
    ? ss70Annual + spouseSsBenefit
    : householdSS;
  const optNetNeed = Math.max(0, effectiveExpenses - optSS - effectivePension);
  const optWR = optTotalAtRet > 0 ? (optNetNeed / optTotalAtRet) * 100 : 0;

  const optYS = optNetNeed <= 0 || optTotalAtRet * rReal >= optNetNeed
    ? Infinity
    : rReal !== 0
      ? Math.log(1 - (optTotalAtRet * rReal) / optNetNeed) / Math.log(1 / (1 + rReal))
      : optTotalAtRet / optNetNeed;

  const optSustainable  = optYS === Infinity || optYS >= (safeLifeExp - safeRetAge);
  const optDepletionAge = optYS === Infinity ? null : Math.floor(safeRetAge + optYS);

  const actionCount = [
    oa.extra401k > 0,
    oa.extraHSA > 0,
    oa.extraRoth > 0,
    includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE,
    netConversionBenefit > 0,
    yr1TaxSavings > 0,
    conversionSim.rothAdvantage > 0 && retTaxable > 0,
  ].filter(Boolean).length;

  const hasImprovement = extraPortfolio > totalAtRet * 0.005
    || optYS > yearsSustained * 1.05
    || (optSustainable && !isSustainable);

  return {
    totalAtRet: optTotalAtRet,
    extraPortfolio,
    extra401kFV: Math.round(extra401kFV),
    extraHSAFV:  Math.round(extraHSAFV),
    extraRothFV: Math.round(extraRothFV),
    extraTaxableFV: Math.round(extraTaxableFV),
    ss: optSS,
    netNeed: optNetNeed,
    withdrawalRate: optWR,
    yearsSustained: optYS,
    sustainable: optSustainable,
    depletionAge: optDepletionAge,
    annualTaxSaving:     yr1TaxSavings,
    lifetimeConvBenefit: Math.max(0, netConversionBenefit),
    actionCount,
    hasImprovement,
    allocation: oa,
  };
}
