// ── Single source of truth for the retirement-phase portfolio walk ──────────
//
// Both the drawdown chart (App.jsx totalChartData) AND the Flow-Down waterfall
// (App.jsx flowData) consume THIS function, so they can never use different
// equations again (the root cause of BUG-31). The per-year recurrence is:
//
//   balEnd = balStart*(1 + rReal) − draw − tax
//
// where `draw` = expenses net of SS/pension (gated per-year on their start ages,
// CLAUDE.md rule 5b) and `tax` = the income tax that actually leaves the
// portfolio that year (RMD tax once RMDs start, plus any Roth-conversion tax in
// the conversion window). Subtracting `tax` is what makes the longevity / chart
// numbers tax-honest (BUG-31 Path A): to spend `draw` net, the retiree must pull
// enough to also cover the tax, so the tax is a real leak out of the pool. The
// RMD/conversion *principal* is NOT a separate outflow — whether spent or
// reinvested it stays in the single pool and keeps compounding at rReal; only
// the tax leaks. See docs/FINANCIAL-MODEL.md.
//
// Tax is passed in as per-age maps (built once from the bracket-accurate
// rmdDataWithTax / conversionSim schedules) — this module never does bracket
// math, so a future tax-model change (e.g. BUG-29) propagates here automatically.
//
// Each row exposes `growth` (= balStart*rReal, pure investment return) so the
// waterfall can compute growth INDEPENDENTLY instead of as a balancing plug —
// the anti-plug invariant that catches this bug class.
export function buildRetirementDrawdown({
  startBal,
  startAge,                 // safeRetAge
  endAge,                   // walk stops here (chart: safeLifeExp; longevity: a high cap)
  rReal,
  effectiveExpenses,
  ssAmount = 0,
  ssClaimAge = Infinity,
  pensionAmount = 0,
  pensionStartAge = Infinity,
  rmdTaxByAge = {},         // { [age]: tax }  — 0 where absent
  conversionTaxByAge = {},  // { [age]: tax }  — 0 where absent
}) {
  const rows = [];
  let bal = startBal;
  let depletionAge = null;
  let yearsSustained = Infinity;

  for (let age = startAge + 1; age <= endAge; age++) {
    const balStart    = bal;
    const yearSS      = age >= ssClaimAge ? ssAmount : 0;
    const yearPension = age >= pensionStartAge ? pensionAmount : 0;
    const draw        = Math.max(0, effectiveExpenses - yearSS - yearPension);
    const tax         = (rmdTaxByAge[age] ?? 0) + (conversionTaxByAge[age] ?? 0);
    const growth      = balStart * rReal;
    const afterGrowth = balStart + growth;          // balStart*(1+rReal)
    const balEnd      = afterGrowth - draw - tax;

    rows.push({
      age,
      balStart,                                     // raw (unrounded) — for conservation checks
      growth,                                       // raw investment return = balStart*rReal
      draw,
      tax,
      balEnd,                                       // raw, may go negative in the depletion year
      total: Math.max(0, Math.round(balEnd)),       // chart-facing balance, clamped & rounded
    });

    if (balEnd <= 0) {
      depletionAge = age;
      // Fractional years: the portfolio survives the part of the final year it
      // can fund. `afterGrowth` is what's available; `draw+tax` is the year's
      // outflow. Completed full years = (age-1) - startAge.
      const outflow = draw + tax;
      const frac    = outflow > 0 ? Math.min(1, Math.max(0, afterGrowth / outflow)) : 0;
      yearsSustained = (age - startAge - 1) + frac;
      bal = balEnd;
      break;
    }
    bal = balEnd;
  }

  const endVal = rows.length ? rows[rows.length - 1].total : Math.max(0, Math.round(startBal));
  return { rows, depletionAge, yearsSustained, endVal };
}
