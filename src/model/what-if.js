// What-if scenario engine — pure functions, no React state.
//
// calcWhatIfDelta: runs a parallel scenario with modified inputs and returns
// the delta in portfolio longevity and key retirement metrics vs baseline.
// The what-if overlay calls this inside useMemo; the main App.jsx state is
// NEVER modified (the overlay is always isolated and ephemeral).
//
// Design: calls buildRetirementDrawdown (and optionally runSimulation for
// accumulation-phase events) — never reimplements the walk (BUG-31 rule).
// Baseline values are passed in from App.jsx to avoid re-computing them.

import { runSimulation } from "./simulation.js";
import { buildRetirementDrawdown } from "./retirement-drawdown.js";
import { ASSUMPTIONS } from "../config/irs-2026.js";

// ── calcWhatIfDelta ──────────────────────────────────────────────────────────
// Computes the impact of scenario overrides vs the baseline.
//
// Accumulation-phase events (age < safeRetAge) cause a full runSimulation
// re-run to get the correct compounded totalAtRet; the overhead is negligible
// for a useMemo that only fires when the user's what-if inputs change.
//
// Retirement-phase events (age >= safeRetAge) are threaded directly into
// buildRetirementDrawdown as moneyEvents, which applies them per-year.
//
// The baseline tax maps (rmdTaxByAge, conversionTaxByAge) are reused as-is —
// they are a close approximation for modest portfolio changes and avoid the
// circular dependency of recomputing RMD schedules from a new balance.
export function calcWhatIfDelta({
  // ── simulation inputs (needed when accumulation events are present) ──
  simInputs,              // { totalYears, currentAge, currentIncome, incomeGrowth,
                          //   filingStatus, spouseIncome, spouseIncomeGrowth, returnRate,
                          //   bal401k, balRoth, balTaxable, balHSA,
                          //   contrib401k, contribRoth, contribTaxable, contribHSA,
                          //   contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
                          //   calcEmployerMatchFn }
  fedMarginal,            // to normalize tradGross → after-tax Trad 401k
  // ── retirement walk inputs ──
  retDrawShared,          // { rReal, effectiveExpenses, ssAmount, ssClaimAge,
                          //   pensionAmount, pensionStartAge, rmdTaxByAge, conversionTaxByAge }
  safeRetAge,
  safeLifeExp,
  // ── baseline (pre-computed in App.jsx, passed in to avoid redundant work) ──
  baseTotalAtRet,
  baseYearsSustained,
  // ── scenario overrides ──
  moneyEvents = [],             // { label, amount, age, isInflow, isTaxable }
  annualExpensesOverride = null, // change annual retirement spending (number or null)
  retirementAgeOverride  = null, // shift retirement age (number or null — re-runs sim)
}) {
  const scenarioRetAge    = retirementAgeOverride ?? safeRetAge;
  const scenarioExpenses  = annualExpensesOverride ?? retDrawShared.effectiveExpenses;

  // Split events by phase
  const accumEvents = moneyEvents.filter(ev => ev.age < scenarioRetAge);
  const retEvents   = moneyEvents.filter(ev => ev.age >= scenarioRetAge);

  // ── Step 1: determine scenario starting balance at retirement ──────────────
  let scenarioTotalAtRet = baseTotalAtRet;

  if (accumEvents.length > 0 || retirementAgeOverride !== null) {
    const raw = runSimulation({ ...simInputs, moneyEvents: accumEvents });
    // Mirror App.jsx: the row at index (scenarioRetAge - currentAge - 1)
    const retIdx = scenarioRetAge - simInputs.currentAge - 1;
    const at = raw[retIdx];
    if (at) {
      // BUG-35: gross basis (the 401k is no longer haircut) — matches the gross
      // baseTotalAtRet so scenario-vs-baseline deltas are apples-to-apples.
      scenarioTotalAtRet = (at.tradGross ?? 0)
        + (at["Roth IRA"] ?? 0)
        + (at["Taxable"]  ?? 0)
        + (at["HSA"]      ?? 0);
    } else {
      scenarioTotalAtRet = 0;
    }
  }

  // ── Step 2: retirement longevity walk ──────────────────────────────────────
  // Far horizon (same as App.jsx headline) so yearsSustained is meaningful
  // even past life expectancy.
  // Merge scenario events on top of any baseline events from retDrawShared
  // (retDrawShared.moneyEvents = main-state permanent events; retEvents = what-if additions).
  const mergedRetEvents = [...(retDrawShared.moneyEvents ?? []), ...retEvents];

  const scenarioWalk = buildRetirementDrawdown({
    ...retDrawShared,
    effectiveExpenses: scenarioExpenses,
    startBal:  scenarioTotalAtRet,
    startAge:  scenarioRetAge,
    endAge:    scenarioRetAge + 130,
    moneyEvents: mergedRetEvents,
  });

  // Also walk to life expectancy for chart comparison
  const scenarioLifeWalk = buildRetirementDrawdown({
    ...retDrawShared,
    effectiveExpenses: scenarioExpenses,
    startBal: scenarioTotalAtRet,
    startAge: scenarioRetAge,
    endAge:   safeLifeExp,
    moneyEvents: mergedRetEvents,
  });

  const scenarioYears = scenarioWalk.yearsSustained;
  const deltaYears = (scenarioYears === Infinity && baseYearsSustained === Infinity)
    ? 0
    : scenarioYears === Infinity
      ? Infinity
      : baseYearsSustained === Infinity
        ? -Infinity
        : scenarioYears - baseYearsSustained;

  return {
    baseTotalAtRet,
    scenarioTotalAtRet,
    baseYears:    baseYearsSustained,
    scenarioYears,
    deltaYears,
    baseExpenses:    retDrawShared.effectiveExpenses,
    scenarioExpenses,
    scenarioEndVal: scenarioLifeWalk.endVal,
  };
}

// Reference age for the "Left at 90" stat — the Ideas scenario stat row compares
// the scenario's balance at this age against the baseline card. Not an IRS value;
// a product-level display anchor.
const BAL_REFERENCE_AGE = 90;

// ── calcWhatIfScenario ───────────────────────────────────────────────────────
// ONE model run returning BOTH the arc chart series and the real stat scalars
// for a scenario override, so a screen showing them side by side can never show
// two different answers (principle 7 / the V1 anti-divergence form).
//
// bundle (the `whatIfBundle` App.jsx passes via horizonProps.whatIfSimInputs):
//   { simInputs, fedMarginal, retDrawShared, safeRetAge, safeLifeExp,
//     baseTotalAtRet, baseYearsSustained }
//
// overrides: { retireAdj, retirementAge, annualExpenses, monthlyExpenses, scenarioEvents }
//   retireAdj       — convenience shift from safeRetAge (e.g. -2 = retire 2 yrs early)
//   retirementAge   — absolute retirement age override (takes precedence over retireAdj)
//   annualExpenses  — override for retirement spending
//   monthlyExpenses — same override expressed monthly (annualExpenses wins if both
//                     are given); the month→year conversion lives HERE, not in JSX
//   scenarioEvents  — additional one-time events for this scenario only (e.g. a lump-sum trip spend)
//
// Returns null when inputs are invalid; otherwise:
//   {
//     chart,              // [{age, total}] retirement-phase series for the arc overlay
//     scenarioRetAge,
//     scenarioTotalAtRet, // portfolio at the scenario retirement age
//     scenarioExpenses,   // annual retirement spending under the scenario
//     scenarioYears,      // years sustained (far-horizon walk; Infinity = never depletes)
//     deltaYears,         // scenarioYears − baseYearsSustained (±Infinity handled)
//     scenarioBalAt90,    // balance at age 90 from the walk rows.
//                         //   null  → the walk never reaches 90 (e.g. life expectancy < 90):
//                         //           "not applicable", NOT zero — screens render "—".
//                         //   0     → a genuine depletion at/before 90 (a real $0).
//   }
//
// Never reimplements the walk: both walks are buildRetirementDrawdown, and
// permanent plan events are honored on both phases (retDrawShared.moneyEvents
// merged into the retirement walk; simInputs.moneyEvents kept for re-sims).
export function calcWhatIfScenario({
  simInputs,
  fedMarginal,
  retDrawShared,
  safeRetAge,
  safeLifeExp,
  baseTotalAtRet,
  baseYearsSustained,
}, overrides = {}) {
  if (!simInputs || !retDrawShared || safeRetAge == null || safeLifeExp == null) return null;

  const retireAdj        = overrides.retireAdj ?? 0;
  const scenarioRetAge   = overrides.retirementAge ?? (safeRetAge + retireAdj);
  const scenarioExpenses = overrides.annualExpenses
    ?? (overrides.monthlyExpenses != null
      ? overrides.monthlyExpenses * ASSUMPTIONS.MONTHS_PER_YEAR
      : retDrawShared.effectiveExpenses);
  const scenarioEvents   = overrides.scenarioEvents ?? [];

  // Determine starting portfolio balance at the scenario retirement age
  let startBal = baseTotalAtRet ?? 0;

  if (scenarioRetAge !== safeRetAge) {
    try {
      // Keep permanent accumulation-phase plan events in the re-sim (BUG-34):
      // only events at/after the scenario retirement age move to the walk below.
      const accumEvents = (simInputs.moneyEvents ?? []).filter(ev => ev.age < scenarioRetAge);
      const raw    = runSimulation({ ...simInputs, moneyEvents: accumEvents });
      const retIdx = scenarioRetAge - simInputs.currentAge - 1;
      const at     = raw[retIdx];
      if (!at) return null;
      // BUG-35: gross basis (no 401k haircut) — consistent with baseTotalAtRet.
      startBal = (at.tradGross ?? 0)
        + (at["Roth IRA"] ?? 0) + (at["Taxable"] ?? 0) + (at["HSA"] ?? 0);
    } catch {
      return null;
    }
  }

  const endAge = Math.max(safeLifeExp, scenarioRetAge + 5);
  // Permanent plan events + this scenario's own events (same merge the chart
  // always used — see the fixed Batch-A incident in docs/ROADMAP.md). When the
  // scenario retires EARLIER than the base plan, permanent events between the
  // two retirement ages move from the accumulation phase into the walk
  // (retDrawShared.moneyEvents was filtered at the BASE retirement age).
  const gapEvents = scenarioRetAge < safeRetAge
    ? (simInputs.moneyEvents ?? []).filter(ev => ev.age >= scenarioRetAge && ev.age < safeRetAge)
    : [];
  const mergedEvents = [...(retDrawShared.moneyEvents ?? []), ...gapEvents, ...scenarioEvents];

  let lifeWalk, farWalk;
  try {
    // Chart walk to life expectancy — what the arc renders.
    lifeWalk = buildRetirementDrawdown({
      ...retDrawShared,
      effectiveExpenses: scenarioExpenses,
      startBal,
      startAge: scenarioRetAge,
      endAge,
      moneyEvents: mergedEvents,
    });
    // Far-horizon walk for yearsSustained (same semantics as the App headline).
    farWalk = buildRetirementDrawdown({
      ...retDrawShared,
      effectiveExpenses: scenarioExpenses,
      startBal,
      startAge: scenarioRetAge,
      endAge: scenarioRetAge + 130,
      moneyEvents: mergedEvents,
    });
  } catch {
    return null;
  }

  const chart = (lifeWalk.rows ?? []).map(r => ({ age: r.age, total: r.total }));

  // Balance at age 90 — null means "the walk never reaches 90" (not applicable,
  // NOT zero); a genuine depletion at/before 90 is a real 0.
  let scenarioBalAt90;
  if (lifeWalk.depletionAge != null && lifeWalk.depletionAge <= BAL_REFERENCE_AGE) {
    scenarioBalAt90 = 0;
  } else {
    const row90 = (lifeWalk.rows ?? []).find(r => r.age === BAL_REFERENCE_AGE);
    scenarioBalAt90 = row90 ? row90.total : null;
  }

  const scenarioYears = farWalk.yearsSustained;
  const deltaYears = (scenarioYears === Infinity && baseYearsSustained === Infinity)
    ? 0
    : scenarioYears === Infinity
      ? Infinity
      : baseYearsSustained === Infinity
        ? -Infinity
        : scenarioYears - baseYearsSustained;

  return {
    chart,
    scenarioRetAge,
    scenarioTotalAtRet: startBal,
    scenarioExpenses,
    scenarioYears,
    deltaYears,
    scenarioBalAt90,
  };
}

// ── calcWhatIfChart ──────────────────────────────────────────────────────────
// Returns a [{age, total}] series for a scenario override, suitable for passing
// as the `scenarioData` prop to ArcGraph. Covers the retirement phase only.
//
// Thin wrapper over calcWhatIfScenario — the chart and the scenario stats come
// from the SAME run by construction, so they can never diverge.
// Returns [] when inputs are invalid or the retirement walk produces no rows.
export function calcWhatIfChart(bundle, overrides = {}) {
  const scenario = calcWhatIfScenario(bundle, overrides);
  return scenario ? scenario.chart : [];
}

// ── calcAffordabilityMax ─────────────────────────────────────────────────────
// Binary search for the largest one-time outflow at `purchaseAge` such that
// the portfolio still sustains to `targetLifeExpectancy`.
// Returns { maxAmount, deltaYears } for the affordable amount.
export function calcAffordabilityMax({
  purchaseAge,
  targetLifeExpectancy,
  step = 1_000,
  maxSearch = 5_000_000,
  // all other args forwarded to calcWhatIfDelta
  ...deltaArgs
}) {
  const { safeRetAge } = deltaArgs;
  const targetYears = targetLifeExpectancy - safeRetAge;

  const isSustainable = (amount) => {
    const result = calcWhatIfDelta({
      ...deltaArgs,
      moneyEvents: [{ label: "Affordability check", amount, age: purchaseAge, isInflow: false, isTaxable: false }],
    });
    const years = result.scenarioYears === Infinity ? targetYears + 1 : result.scenarioYears;
    return years >= targetYears;
  };

  // Quick check: can they even afford $0? (i.e. is baseline sustainable)
  if (!isSustainable(0)) return { maxAmount: 0, deltaYears: 0 };

  // Binary search
  let lo = 0;
  let hi = maxSearch;
  while (hi - lo > step) {
    const mid = Math.round((lo + hi) / 2 / step) * step;
    if (isSustainable(mid)) lo = mid;
    else hi = mid - step;
  }

  const finalResult = calcWhatIfDelta({
    ...deltaArgs,
    moneyEvents: [{ label: "Affordability max", amount: lo, age: purchaseAge, isInflow: false, isTaxable: false }],
  });

  return {
    maxAmount: lo,
    deltaYears: finalResult.deltaYears,
  };
}
