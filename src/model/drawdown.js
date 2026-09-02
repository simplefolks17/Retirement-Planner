import { buildRetirementDrawdown } from "./retirement-drawdown.js";

// Returns the amount the portfolio must fund each year.
// SS and pension are external income sources and reduce the draw. The 4th
// (optional) term, spouseIncome, is the spouse's net GAP-YEAR income (#30 /
// BUG-82) — active only while the spouse still works past the primary's
// retirement but before their own (rule 5b: income timing is gated per-year,
// never a stale scalar; the caller is responsible for passing the value for
// the specific year in question). Defaults to 0 — every existing caller that
// omits it is byte-identical to before this param existed.
export function calcNetPortfolioNeed(effectiveExpenses, householdSS, effectivePension, spouseIncome = 0) {
  return Math.max(0, effectiveExpenses - householdSS - effectivePension - spouseIncome);
}

// Retirement-phase money-flow bands (WI-2.6): where each dollar of retirement
// spending comes from — Social Security + pension + portfolio draw. Returned
// pre-split by the model so the Money-flow tab only formats (rule 10), and the
// three bands are GUARANTEED to sum to effectiveExpenses (the screen asserts
// nothing — the invariant lives here, locked by a test).
//
// Normal case (income < expenses): ss + pension + spouseIncome + portfolioDraw =
// expenses with portfolioDraw = netPortfolioNeed. Over-funded edge (income ≥
// expenses): netPortfolioNeed is 0, so the income bands are scaled down
// proportionally to fill exactly expenses (the surplus isn't "funding
// expenses"); documented so the rare scaled value isn't mistaken for a bug.
//
// ss is the SS actually active at retirement (ssAtRet — already age-gated, rule
// 5b), pension is effectivePension; both are explicit values from the model.
// spouseIncome (optional, defaults to 0) is the spouse's net GAP-YEAR income
// (#30 / BUG-82 — active only while the spouse still works past the primary's
// retirement but before their own). Omitting it is byte-identical to before
// this 4th band existed — the return shape gains a `spouseIncome` field but
// every existing field keeps its old value.
//
// guaranteedIncome / guaranteedPct (Plan screen's "Guaranteed for life" card):
// the share of retirement spending covered by income that does NOT stop —
// Social Security + pension, and NOTHING else. The spouse's gap-year paycheck
// is deliberately EXCLUDED from the numerator while staying in the denominator
// (`expenses`): it is real income, but it stops at the spouse's own retirement
// age (rule 5b), so counting it as "guaranteed for life" would tell a
// first-time user that a temporary paycheck is permanent — precisely the
// overclaim this card exists to replace. Defining the field as
// "(ss + pension) / expenses" rather than "everything that isn't portfolio
// draw" is what makes that exclusion structural instead of a caller's promise.
// The band values are already scaled for the over-funded edge above, so the
// numerator can never exceed the denominator.
// guaranteedPct is null (a designed "—", never 0) when there are no expenses to
// take a share of.
//
// BUG-122: guaranteedPct is computed from the RAW (unscaled) ssRaw/penRaw, NOT
// the scaled ssBand/penBand. The scale factor is derived from incomeTotal,
// which includes the spouse's gap-year income — so multiplying a spouse-income
// household's ss/pension bands by that scale dilutes the percentage by income
// that has nothing to do with what share of spending SS+pension cover. The
// scaled ssBand/penBand/guaranteedIncome are still exactly right for the
// meter's bars (which must sum to exp) — only the standalone percentage needs
// the unscaled source. Explicitly capped at 100 since ssRaw+penRaw can exceed
// exp on the over-funded edge (the scaled bands can't, by construction).
export function calcRetIncomeFlow({ effectiveExpenses, ss, pension, spouseIncome = 0 }) {
  const exp = Math.max(0, effectiveExpenses);
  const ssRaw = Math.max(0, ss);
  const penRaw = Math.max(0, pension);
  const spRaw = Math.max(0, spouseIncome);
  const incomeTotal = ssRaw + penRaw + spRaw;
  const portfolioDraw = Math.max(0, exp - incomeTotal);
  // Income covers whatever the portfolio doesn't (== min(incomeTotal, exp)).
  const covered = exp - portfolioDraw;
  const scale = incomeTotal > 0 ? covered / incomeTotal : 0;
  const ssBand = ssRaw * scale;
  const penBand = penRaw * scale;
  const guaranteedIncome = ssBand + penBand;
  // BUG-129: guaranteedRaw (and therefore guaranteedPct) can be NaN if a caller
  // ever hands in a non-finite ss/pension — Math.max(0, NaN) is NaN, same
  // hazard buildBarSegments (budget.js) already guards one function away. No
  // live App path does this today (every input is numeric), but the guard
  // keeps this function's contract symmetric with its sibling: null (the
  // designed "—" state), never a NaN that renders as the literal string "NaN%".
  const guaranteedRaw = ssRaw + penRaw;
  return {
    expenses: exp,
    ss: ssBand,
    pension: penBand,
    spouseIncome: spRaw * scale,
    portfolioDraw,
    guaranteedIncome,
    guaranteedPct: (exp > 0 && Number.isFinite(guaranteedRaw))
      ? Math.min(100, Math.round((guaranteedRaw / exp) * 100))
      : null,
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
