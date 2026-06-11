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
      const retTrad = Math.round((at.tradGross ?? 0) * (1 - fedMarginal));
      scenarioTotalAtRet = retTrad
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

// ── calcWhatIfChart ──────────────────────────────────────────────────────────
// Returns a [{age, total}] series for a scenario override, suitable for passing
// as the `scenarioData` prop to ArcGraph. Covers the retirement phase only.
//
// Accepts the same argument shape as calcWhatIfDelta but returns a chart series
// instead of summary scalars. The `whatIfBundle` passed from App.jsx via
// horizonProps.whatIfSimInputs includes simInputs, fedMarginal, retDrawShared,
// safeRetAge, safeLifeExp, and baseTotalAtRet.
//
// overrides: { retireAdj, retirementAge, annualExpenses }
//   retireAdj  — convenience shift from safeRetAge (e.g. -2 = retire 2 yrs early)
//   retirementAge — absolute retirement age override (takes precedence over retireAdj)
//   annualExpenses — override for retirement spending
//
// Returns [] when inputs are invalid or the retirement walk produces no rows.
export function calcWhatIfChart({
  simInputs,
  fedMarginal,
  retDrawShared,
  safeRetAge,
  safeLifeExp,
  baseTotalAtRet,
}, overrides = {}) {
  if (!simInputs || !retDrawShared || safeRetAge == null || safeLifeExp == null) return [];

  const retireAdj      = overrides.retireAdj ?? 0;
  const scenarioRetAge = overrides.retirementAge ?? (safeRetAge + retireAdj);
  const scenarioExpenses = overrides.annualExpenses ?? retDrawShared.effectiveExpenses;

  // Determine starting portfolio balance at the scenario retirement age
  let startBal = baseTotalAtRet ?? 0;

  if (scenarioRetAge !== safeRetAge) {
    try {
      const raw    = runSimulation({ ...simInputs, moneyEvents: [] });
      const retIdx = scenarioRetAge - simInputs.currentAge - 1;
      const at     = raw[retIdx];
      if (!at) return [];
      startBal = Math.round((at.tradGross ?? 0) * (1 - (fedMarginal ?? 0)))
        + (at["Roth IRA"] ?? 0) + (at["Taxable"] ?? 0) + (at["HSA"] ?? 0);
    } catch {
      return [];
    }
  }

  const endAge = Math.max(safeLifeExp, scenarioRetAge + 5);

  let walk;
  try {
    walk = buildRetirementDrawdown({
      ...retDrawShared,
      effectiveExpenses: scenarioExpenses,
      startBal,
      startAge: scenarioRetAge,
      endAge,
    });
  } catch {
    return [];
  }

  return (walk.rows ?? []).map(r => ({ age: r.age, total: r.total }));
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
