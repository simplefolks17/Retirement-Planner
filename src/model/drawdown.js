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
