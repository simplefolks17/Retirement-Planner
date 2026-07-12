import { ASSUMPTIONS } from "../config/irs-2026.js";
import { eventNetForYear } from "./money-events.js";

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
  moneyEvents = [],         // one-time or duration events (see money-events.js) — applied per active year after draw
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
    // Money events (windfalls, purchases, duration events like a travel year)
    // applied after normal recurrence. eventNetForYear is the ONE per-year source
    // (it splits duration events across their active years).
    const eventAdj    = moneyEvents.reduce((s, ev) => s + eventNetForYear(ev, age), 0);
    const balEnd      = afterGrowth - draw - tax + eventAdj;

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

// ── Plan progress (Horizon Plan screen) ──────────────────────────────────────
// V6 fix — this percentage used to be computed in PlanScreen.jsx JSX, dividing
// by (lifeExpect − retirementAge) with yearsSustained potentially Infinity.
//
// progressPct: how far the portfolio's longevity gets toward covering the
// retirement horizon. 100 when sustainable (incl. yearsSustained === Infinity);
// otherwise capped at 99 so an unsustainable plan never reads as "done".
// The Math.max(1, …) guards the zero/negative-horizon edge (retiring at or past
// life expectancy).
export function calcPlanProgress({ yearsSustained, isSustainable, lifeExpect, retirementAge }) {
  if (isSustainable || yearsSustained === Infinity) return { progressPct: 100 };
  const horizon = Math.max(1, lifeExpect - retirementAge);
  return { progressPct: Math.min(99, Math.round((yearsSustained / horizon) * 100)) };
}

// ── On-track drivers (WI-1.1 / #88 — the pill's "why this verdict" popover) ──
// The three plain-language drivers behind the Plan screen's on-track verdict,
// returned render-ready (rounded numbers + ok booleans) so the screen does
// copy and formatting ONLY — the comparisons/ratios live HERE (rule 10).
// Guideline thresholds come from ASSUMPTIONS (heuristics, documented there).
//
// Row shapes and edge states (documented per principle 10):
//   { id: "withdrawal", ok, withdrawalRatePct, guidelinePct }
//       withdrawalRatePct rounded to 1 decimal; ok = rate ≤ guideline.
//   { id: "longevity",  ok, sustainedYears, horizonYears }
//       sustainedYears is null when the portfolio never depletes
//       (yearsSustained === Infinity) — "lasts beyond your plan", NOT a number;
//       otherwise rounded to 1 decimal. ok = covers the lifeExpect horizon.
//   { id: "savings",    ok, savingsRatePct, guidelinePct }
//       savingsRatePct (contributions / take-home, whole %) is null when
//       take-home is missing/≤ 0 — and then ok is null too (not knowable),
//       never a synthesized false. Screens render a designed "—" state.
export function calcPlanDrivers({
  withdrawalRate,        // percent, from calcWithdrawalRate
  yearsSustained,        // years, may be Infinity (never depletes)
  isSustainable,
  lifeExpect,
  retirementAge,
  currentContribTotal,   // from calcSavingsCapacity
  takeHome,              // from calcTaxBasis
}) {
  const wrGuideline   = ASSUMPTIONS.SAFE_WITHDRAWAL_GUIDELINE_PCT;
  const saveGuideline = ASSUMPTIONS.SAVINGS_RATE_GUIDELINE_PCT;

  const horizonYears   = Math.max(0, lifeExpect - retirementAge);
  const sustainedYears = yearsSustained === Infinity
    ? null
    : Math.round(yearsSustained * 10) / 10;

  const hasTakeHome    = takeHome != null && takeHome > 0;
  const savingsRatePct = hasTakeHome
    ? Math.round((currentContribTotal / takeHome) * 100)
    : null;

  return [
    {
      id: "withdrawal",
      ok: withdrawalRate <= wrGuideline,
      withdrawalRatePct: Math.round(withdrawalRate * 10) / 10,
      guidelinePct: wrGuideline,
    },
    {
      id: "longevity",
      ok: isSustainable || yearsSustained === Infinity || yearsSustained >= horizonYears,
      sustainedYears,
      horizonYears,
    },
    {
      id: "savings",
      ok: hasTakeHome ? savingsRatePct >= saveGuideline : null,
      savingsRatePct,
      guidelinePct: saveGuideline,
    },
  ];
}

// ── Year-by-year display rows ────────────────────────────────────────────────
// Retirement-phase walk rows plus their calendar year, display-ready for the
// Numbers screen's Year-by-year table — the age→year arithmetic lives HERE, not
// in JSX (principle 6). currentYear is the caller's clock (new Date().getFullYear()).
//
// WI-2.5: each row is also joined (by age) to the RMD and Roth-conversion
// schedules so the table can show those driver columns:
//   rmdByAge        { [age]: rmd amount }        — gross RMD withdrawal that year
//   conversionByAge { [age]: conversion amount } — Roth conversion that year
// Absent ages yield null (→ "—" in the screen), never a synthesized 0 (principle 10).
// `tax` on the walk row is the income tax that actually left the pool that year
// (RMD tax + conversion tax); the rmd/conversion columns are the underlying
// amounts and are informational — they are NOT part of the ledger identity
//   prevTotal + growth − draw − tax = nextTotal
// which the walk already satisfies. phase:"ret" tags these as retirement rows;
// contrib is null (no contributions in retirement).
export function buildYearlyRows({ rows, currentAge, currentYear, rmdByAge = {}, conversionByAge = {} }) {
  return (rows ?? []).map(r => ({
    age: r.age,
    year: currentYear + (r.age - currentAge),
    total: r.total,
    contrib: null,
    growth: Math.round(r.growth ?? 0),
    draw: Math.round(r.draw ?? 0),
    tax: Math.round(r.tax ?? 0),
    rmd: rmdByAge[r.age] != null ? Math.round(rmdByAge[r.age]) : null,
    conversion: conversionByAge[r.age] != null ? Math.round(conversionByAge[r.age]) : null,
    phase: "ret",
    // Withdrawal rate: (draw + tax) / balStart — shows what fraction of the
    // portfolio was consumed that year. null when balStart = 0 (no divide-by-zero).
    withdrawalRatePct: (r.balStart > 0)
      ? Math.round((r.draw + r.tax) / r.balStart * 1000) / 10
      : null,
  }));
}
