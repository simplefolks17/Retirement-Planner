// Returns the amount the portfolio must fund each year.
// SS and pension are external income sources and reduce the draw.
export function calcNetPortfolioNeed(effectiveExpenses, householdSS, effectivePension) {
  return Math.max(0, effectiveExpenses - householdSS - effectivePension);
}

// Returns the withdrawal rate as a percentage.
export function calcWithdrawalRate(netPortfolioNeed, totalAtRet) {
  return totalAtRet > 0 ? (netPortfolioNeed / totalAtRet) * 100 : 0;
}

// Returns the number of years the portfolio can be sustained.
// Returns Infinity if the portfolio grows faster than the draw.
// rReal: real (inflation-adjusted) return rate as a decimal.
export function calcYearsSustained(netPortfolioNeed, totalAtRet, rReal) {
  if (netPortfolioNeed <= 0 || totalAtRet * rReal >= netPortfolioNeed) return Infinity;
  if (rReal !== 0) {
    return Math.log(1 - (totalAtRet * rReal) / netPortfolioNeed) / Math.log(1 / (1 + rReal));
  }
  return totalAtRet / netPortfolioNeed;
}

// Simulates per-year portfolio drawdown from startAge and returns the number of
// years the portfolio is sustained. SS and pension are gated on their start ages
// *per year* (mirrors the drawdown chart loop in App.jsx), so income that begins
// after retirement only reduces the draw in the years it is actually received.
// Returns Infinity if the portfolio survives to maxAge (grows at least as fast
// as it is drawn).
//
// Unlike the closed-form calcYearsSustained — which assumes a single static draw
// for the whole horizon — this walks year by year, so it correctly captures the
// higher pre-claim draws before a deferred income source begins. Used by the
// SS-delay comparison (BUG-26): delaying SS to 70 depletes the portfolio faster
// between retirement and 70, which a static draw cannot represent.
export function calcDrawdownYears({
  startBal,
  startAge,
  effectiveExpenses,
  rReal,
  ssAmount = 0,
  ssClaimAge = Infinity,
  pensionAmount = 0,
  pensionStartAge = Infinity,
  maxAge = 200,
}) {
  let bal = startBal;
  for (let age = startAge + 1; age <= maxAge; age++) {
    const yearSS      = age >= ssClaimAge ? ssAmount : 0;
    const yearPension = age >= pensionStartAge ? pensionAmount : 0;
    const yearNeed    = calcNetPortfolioNeed(effectiveExpenses, yearSS, yearPension);
    bal = bal * (1 + rReal) - yearNeed;
    if (bal <= 0) return age - startAge;
  }
  return Infinity;
}
