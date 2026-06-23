// ── Roth conversion planning (pure) ─────────────────────────────────────────
//
// Two pieces of conversion-window math, extracted from App.jsx so they are
// unit-testable and shared instead of re-derived inline — where the per-year
// SS/pension gate has repeatedly drifted off-by-one (BUG-13, BUG-22, BUG-25).
//
//   1. buildIncomeFloors      — the per-year income floor each conversion stacks
//      on; SS/pension count only in years they have actually started (rule 5b).
//   2. calcBracketFillTargets — how much to convert each year to fill the chosen
//      bracket: (bracket top + deduction) − that year's income floor.
//
// Both are faithful ports of the prior App.jsx expressions — same formulas, same
// rounding — so the golden master is unchanged (value-preserving). App.jsx still
// wraps the calls in useMemo for referential stability (the BUG-22 fix); the
// functions themselves are pure and stateless.

// Per-year income floor for the conversion window. Conversion year i is DISPLAYED
// at age safeRetAge + i + 1 (calcConversionSim returns 1-indexed years and App
// offsets by safeRetAge), so the SS/pension gate must use that age — using
// safeRetAge + i drops SS from the first SS year (BUG-25 finding 3).
//
// ssAmount is the SS figure to apply once active: ssTaxableRet (85% taxable
// fraction) for tax floors, or householdSS (100% gross) for ACA/IRMAA MAGI floors
// — the only difference between the two floor arrays App builds.
export function buildIncomeFloors({
  conversionWindowYrs, safeRetAge,
  includeSS, ssClaimingAge, ssAmount,
  pensionMonthly, pensionStartAge, monthsPerYear,
}) {
  return Array.from({ length: conversionWindowYrs }, (_, i) => {
    const age         = safeRetAge + i + 1;
    const yearSS      = includeSS && age >= ssClaimingAge ? ssAmount : 0;
    const yearPension = pensionMonthly > 0 && age >= pensionStartAge
      ? pensionMonthly * monthsPerYear : 0;
    return yearSS + yearPension;
  });
}

// Bracket-fill conversion targets. For the selected target bracket, the amount to
// convert in a year fills taxable income up to that bracket's top:
//   conversion = max(0, (bracketTop + deduction) − incomeFloor)
// computed per year (lower floors in pre-SS/pension years leave more room) and
// once at the steady-state floor (all sources active — the headline figure and
// the fallback when there is no conversion window). Bracket tops are read by rate
// from the active filing status's brackets, never hardcoded.
export function calcBracketFillTargets({
  retTaxData, conversionBracketTarget, convFloors, retIncomeFloor,
}) {
  const bracketTopForRate = (pct) => retTaxData.brackets.find(b => b.rate === pct / 100)?.max;
  const bracketTops = {
    12: bracketTopForRate(12),
    22: bracketTopForRate(22),
    24: bracketTopForRate(24),
  };
  const bracketTarget = bracketTops[conversionBracketTarget] ?? bracketTops[22];
  // Guard a malformed bracket table (missing 22% top) from poisoning every fill target with NaN
  const fillTo = (Number.isFinite(bracketTarget) ? bracketTarget : 0) + retTaxData.deduction;

  const bracketFillConversions = convFloors.map(floor => Math.max(0, Math.round(fillTo - floor)));
  const bracketFillConversion  = Math.max(0, Math.round(fillTo - retIncomeFloor));

  const convPeakTarget   = bracketFillConversions.length ? Math.max(...bracketFillConversions) : bracketFillConversion;
  const convSteadyTarget = bracketFillConversions.length ? Math.min(...bracketFillConversions) : bracketFillConversion;

  return {
    bracketTops, bracketTarget, bracketFillConversions, bracketFillConversion,
    convPeakTarget, convSteadyTarget, targetsVary: convPeakTarget !== convSteadyTarget,
  };
}
