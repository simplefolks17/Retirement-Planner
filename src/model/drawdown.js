import { buildRetirementDrawdown } from "./retirement-drawdown.js";

// Returns the amount the portfolio must fund each year.
// SS and pension are external income sources and reduce the draw.
export function calcNetPortfolioNeed(effectiveExpenses, householdSS, effectivePension) {
  return Math.max(0, effectiveExpenses - householdSS - effectivePension);
}

// Retirement-phase money-flow bands (WI-2.6): where each dollar of retirement
// spending comes from — Social Security + pension + portfolio draw. Returned
// pre-split by the model so the Money-flow tab only formats (rule 10), and the
// three bands are GUARANTEED to sum to effectiveExpenses (the screen asserts
// nothing — the invariant lives here, locked by a test).
//
// Normal case (income < expenses): ss + pension + portfolioDraw = expenses with
// portfolioDraw = netPortfolioNeed. Over-funded edge (ss + pension ≥ expenses):
// netPortfolioNeed is 0, so the income bands are scaled down proportionally to
// fill exactly expenses (the surplus isn't "funding expenses"); documented so the
// rare scaled value isn't mistaken for a bug.
//
// ss is the SS actually active at retirement (ssAtRet — already age-gated, rule
// 5b), pension is effectivePension; both are explicit values from the model.
export function calcRetIncomeFlow({ effectiveExpenses, ss, pension }) {
  const exp = Math.max(0, effectiveExpenses);
  const ssRaw = Math.max(0, ss);
  const penRaw = Math.max(0, pension);
  const incomeTotal = ssRaw + penRaw;
  const portfolioDraw = Math.max(0, exp - incomeTotal);
  // Income covers whatever the portfolio doesn't (== min(incomeTotal, exp)).
  const covered = exp - portfolioDraw;
  const scale = incomeTotal > 0 ? covered / incomeTotal : 0;
  return {
    expenses: exp,
    ss: ssRaw * scale,
    pension: penRaw * scale,
    portfolioDraw,
  };
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
  // Delegates to the single shared walk (buildRetirementDrawdown) so the
  // SS-delay comparison, the drawdown chart, and the headline longevity all
  // run the SAME recurrence and can't diverge (BUG-31 root cause). Returns the
  // integer count of years until depletion (depletionAge − startAge), matching
  // this function's original contract; pass no tax maps (SS-delay compares
  // spending-only longevity).
  const { depletionAge } = buildRetirementDrawdown({
    startBal, startAge, endAge: maxAge, rReal, effectiveExpenses,
    ssAmount, ssClaimAge, pensionAmount, pensionStartAge,
  });
  return depletionAge !== null ? depletionAge - startAge : Infinity;
}

// How many extra years the portfolio lasts if SS is delayed to the max claim age
// (70) instead of the user's chosen claiming age. Both scenarios walk year-by-year
// from the same starting portfolio (calcDrawdownYears), so the higher pre-claim
// draws of the delayed plan are charged correctly (BUG-26 — a closed form that
// solved at the post-70 draw overstated the benefit by 3–6 yrs for early retirees).
// Returns null when the comparison is moot: SS off, already claiming at/after the
// max age, or the portfolio never depletes in either scenario.
export function calcSSDelayGain({
  includeSS, ssClaimingAge, ssMaxClaimAge, yearsSustained,
  totalAtRet, safeRetAge, effectiveExpenses, rReal,
  householdSS, household70SS, pensionMonthly, pensionStartAge, monthsPerYear,
}) {
  if (!includeSS || ssClaimingAge >= ssMaxClaimAge || yearsSustained === Infinity) return null;
  const pensionAnnual = pensionMonthly > 0 ? pensionMonthly * monthsPerYear : 0;
  const common = {
    startBal: totalAtRet, startAge: safeRetAge, effectiveExpenses, rReal,
    pensionAmount: pensionAnnual, pensionStartAge,
  };
  const baseYrs  = calcDrawdownYears({ ...common, ssAmount: householdSS,   ssClaimAge: ssClaimingAge });
  const delayYrs = calcDrawdownYears({ ...common, ssAmount: household70SS, ssClaimAge: ssMaxClaimAge });
  if (baseYrs === Infinity || delayYrs === Infinity) return null;
  return Math.max(0, Math.round(delayYrs - baseYrs));
}
