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
import { buildRetirementPhase } from "./retirement-phase.js";
import { buildAccumChart } from "./accumulation.js";
import { ASSUMPTIONS } from "../config/irs-2026.js";
import {
  eventFirstAge, eventLastAge, eventGrossCost, eventNetTotal,
} from "./money-events.js";

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
  fedMarginal,            // accepted for signature parity; unused now (balances are gross, BUG-35)
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

  // Split events by phase — kind-aware (money-events.js): a duration event
  // spanning the retirement boundary goes to BOTH walks; each walk applies only
  // the years inside its own age range via eventNetForYear.
  const accumEvents = moneyEvents.filter(ev => eventFirstAge(ev) < scenarioRetAge);
  const retEvents   = moneyEvents.filter(ev => eventLastAge(ev) >= scenarioRetAge);

  // ── Step 1: determine scenario starting balance at retirement ──────────────
  let scenarioTotalAtRet = baseTotalAtRet;

  // Guard a degenerate retirement-age override: retiring at or before the
  // current age has no accumulation phase, so re-running the sim and indexing
  // at a negative row would fabricate a $0 starting balance / depletion. Skip
  // the sim and keep the baseline starting balance in that case.
  if ((accumEvents.length > 0 || retirementAgeOverride !== null)
      && scenarioRetAge > simInputs.currentAge) {
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
//     baseTotalAtRet, baseYearsSustained,
//     retPhaseBase, conversionByAge, baseChart, addlPreTaxBal }
//   retPhaseBase/conversionByAge/baseChart are the SAME memoized objects App.jsx
//   feeds the main per-account engine (retirement-phase.js) for the solid line —
//   passing them through here means the scenario walk uses the identical engine
//   + inputs, so a no-change scenario's dashed overlay sits EXACTLY on the solid
//   line (the overlay-continuity fix, 2026-07-11). When retPhaseBase is absent
//   this falls back to the older blended-pool walk (buildRetirementDrawdown) —
//   App.jsx always supplies retPhaseBase, so that branch is dead in production
//   (kept only for callers/tests that haven't been migrated).
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
//     chart,              // [{age, total}] the FULL lifetime series (accumulation +
//                         //   retirement) — the same shape as App's totalChartData,
//                         //   so a no-op scenario's chart deep-equals it exactly.
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
// Never reimplements the walk: the retirement-phase portion is buildRetirementPhase
// (the SAME per-account engine the main chart uses — BUG-35/BUG-31), and permanent
// plan events are honored on both phases (retDrawShared.moneyEvents merged into the
// retirement walk; simInputs.moneyEvents kept for re-sims).
export function calcWhatIfScenario({
  simInputs,
  fedMarginal,
  retDrawShared,
  safeRetAge,
  safeLifeExp,
  baseTotalAtRet,
  baseYearsSustained,
  retPhaseBase,
  conversionByAge,
  baseChart,
  addlPreTaxBal,
}, overrides = {}) {
  if (!simInputs || !retDrawShared || safeRetAge == null || safeLifeExp == null) return null;

  const retireAdj        = overrides.retireAdj ?? 0;
  const scenarioRetAge   = overrides.retirementAge ?? (safeRetAge + retireAdj);
  const scenarioExpenses = overrides.annualExpenses
    ?? (overrides.monthlyExpenses != null
      ? overrides.monthlyExpenses * ASSUMPTIONS.MONTHS_PER_YEAR
      : retDrawShared.effectiveExpenses);
  const scenarioEvents   = overrides.scenarioEvents ?? [];

  // Scenario events with pre-retirement activity force a re-sim even when the
  // retirement age is unchanged — they change the compounded balance AT
  // retirement. (Previously scenarioEvents reached only the retirement walk, so
  // a pre-retirement scenario event was silently ignored — BUG-42.)
  // Boundary: the sim row that is read below IS the retirement-age row, so an
  // event landing exactly at the retirement age belongs in the sim (this matches
  // the main App path, where runSimulation gets the full event list) — hence <=.
  const committedEvents = simInputs.moneyEvents ?? [];
  const scenarioAccum   = scenarioEvents.filter(ev => eventFirstAge(ev) <= scenarioRetAge);
  const needsResim = scenarioRetAge !== safeRetAge || scenarioAccum.length > 0;

  let resimRaw = null;
  if (needsResim) {
    try {
      // Keep permanent accumulation-phase plan events in the re-sim (BUG-34).
      // Kind-aware filter (money-events.js): a duration event spanning the
      // boundary stays in — the sim result is read at the retirement-age row,
      // so only its months up to that row land in the starting balance; the
      // walk below applies the later months (it starts one year after).
      const accumEvents = [
        ...committedEvents.filter(ev => eventFirstAge(ev) <= scenarioRetAge),
        ...scenarioAccum,
      ];
      // Mirror App.jsx's simData wrapper: buildAccumChart's sumAccountRow reads
      // the "Trad 401k" key (added after runSimulation from tradGross), which
      // the raw simulation rows don't carry — without this, a re-sim's
      // accumulation chart would silently drop the 401k balance (BUG-35 display key).
      resimRaw = runSimulation({ ...simInputs, moneyEvents: accumEvents })
        .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
    } catch {
      return null;
    }
  }
  const resimAt = needsResim ? resimRaw[scenarioRetAge - simInputs.currentAge - 1] : null;
  if (needsResim && !resimAt) return null;

  // Permanent plan events + this scenario's own events (same merge the chart
  // always used — see the fixed Batch-A incident in docs/ROADMAP.md). When the
  // scenario retires EARLIER than the base plan, permanent events between the
  // two retirement ages move from the accumulation phase into the walk
  // (retDrawShared.moneyEvents was filtered at the BASE retirement age).
  // Kind-aware gap filter: an event whose LAST active year falls in the gap moves
  // to the walk; one that also spans past the base retirement age is already in
  // retDrawShared.moneyEvents (filtered by eventLastAge in App.jsx) and must not
  // be duplicated here.
  const gapEvents = scenarioRetAge < safeRetAge
    ? committedEvents.filter(ev =>
        eventLastAge(ev) >= scenarioRetAge && eventLastAge(ev) < safeRetAge)
    : [];
  const mergedEvents = [...(retDrawShared.moneyEvents ?? []), ...gapEvents, ...scenarioEvents];

  // ── Primary path: the per-account engine (BUG-35/BUG-31) ──────────────────
  if (retPhaseBase) {
    const seeds = needsResim
      ? {
          tradGross: (resimAt.tradGross ?? 0) + (addlPreTaxBal ?? 0),
          roth:      resimAt["Roth IRA"] ?? 0,
          taxable:   resimAt["Taxable"]  ?? 0,
          hsa:       resimAt["HSA"]      ?? 0,
        }
      : {
          tradGross: retPhaseBase.tradGross ?? 0,
          roth:      retPhaseBase.roth ?? 0,
          taxable:   retPhaseBase.taxable ?? 0,
          hsa:       retPhaseBase.hsa ?? 0,
        };

    // Accumulation-phase portion of the chart: reuse the main chart's rows
    // (no re-sim) or rebuild them from the scenario's own re-sim with the SAME
    // helper App.jsx uses (buildAccumChart) — one source, no re-derivation.
    const accumChartRows = needsResim
      ? buildAccumChart({
          simData: resimRaw, safeRetAge: scenarioRetAge, currentAge: simInputs.currentAge,
          bal401k: simInputs.bal401k, balRoth: simInputs.balRoth,
          balTaxable: simInputs.balTaxable, balHSA: simInputs.balHSA,
        })
      : (baseChart ?? []).filter(r => r.age <= scenarioRetAge);

    // lifeExp mirrors App's own safeLifeExp guard (≥ startAge + 1); longevityHorizon
    // is the far cap for yearsSustained — buildRetirementPhase computes BOTH from
    // ONE walk (it runs to longevityHorizon, then truncates rows to lifeExp for
    // display), so a single call covers both the chart and the headline longevity.
    const lifeExp = Math.max(safeLifeExp, scenarioRetAge + 1);

    let rp;
    try {
      rp = buildRetirementPhase({
        ...retPhaseBase,
        tradGross: seeds.tradGross, roth: seeds.roth, taxable: seeds.taxable, hsa: seeds.hsa,
        startAge: scenarioRetAge,
        lifeExp,
        longevityHorizon: scenarioRetAge + 130,
        effectiveExpenses: scenarioExpenses,
        // The conversion schedule stays at ABSOLUTE ages even when the retirement
        // age shifts — the same approximation the blended walk already made with
        // its per-age tax maps (rmdTaxByAge/conversionTaxByAge above); a schedule
        // that re-anchors to the new retirement age is a documented follow-up,
        // not a regression introduced here.
        conversionByAge: conversionByAge ?? {},
        moneyEvents: mergedEvents,
      });
    } catch {
      return null;
    }

    const walkRows = rp.rows ?? [];
    const scenarioTotalAtRet = seeds.tradGross + seeds.roth + seeds.taxable + seeds.hsa;
    const chart = [...accumChartRows, ...walkRows.map(r => ({ age: r.age, total: r.total }))];

    // Balance at age 90 — null means "the walk never reaches 90" (not applicable,
    // NOT zero); a genuine depletion at/before 90 is a real 0.
    let scenarioBalAt90;
    if (rp.depletionAge != null && rp.depletionAge <= BAL_REFERENCE_AGE) {
      scenarioBalAt90 = 0;
    } else {
      const row90 = walkRows.find(r => r.age === BAL_REFERENCE_AGE);
      scenarioBalAt90 = row90 ? row90.total : null;
    }

    const scenarioYears = rp.yearsSustained;
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
      scenarioTotalAtRet,
      scenarioExpenses,
      scenarioYears,
      deltaYears,
      scenarioBalAt90,
    };
  }

  // ── Fallback: the older blended-pool walk (buildRetirementDrawdown). App.jsx
  // always supplies retPhaseBase, so this branch does not run in production —
  // kept for any caller/test that hasn't been migrated to the engine bundle.
  let startBal = baseTotalAtRet ?? 0;
  if (needsResim) {
    // BUG-35: gross basis (no 401k haircut) — consistent with baseTotalAtRet.
    startBal = (resimAt.tradGross ?? 0)
      + (resimAt["Roth IRA"] ?? 0) + (resimAt["Taxable"] ?? 0) + (resimAt["HSA"] ?? 0);
  }

  const endAge = Math.max(safeLifeExp, scenarioRetAge + 5);
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

// ── evaluateLifeEvent ────────────────────────────────────────────────────────
// The model behind the Horizon life-event sheet (sheet-first placement flow):
// ONE candidate event → a plain-language verdict plus concrete impact deltas,
// all computed HERE so the sheet renders and formats only (rule 10).
//
// Both runs are calcWhatIfScenario (baseline = no overrides, scenario = the
// candidate event), so the verdict, the deltas, and any arc overlay drawn from
// scenario.chart come from the SAME walk and can never disagree (V1/principle 7).
//
// Verdict (thresholds in ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS):
//   "unaffordable" — with the event, the portfolio depletes before the plan age
//   "tight"        — sustains to plan age with less than the buffer to spare
//   "comfortable"  — sustains at least buffer years past plan age (or forever)
//
// Returns null when inputs are invalid; otherwise:
//   {
//     verdict,               // "comfortable" | "tight" | "unaffordable"
//     grossCost,             // total $ of the event itself (duration: monthly × months)
//     netTotal,              // signed net portfolio impact across all event years
//     chart,                 // scenario arc series (same run as the verdict)
//     atRetirement: { age, base, scenario, deltaAbs, dir },
//         // portfolio at the retirement age; dir "down" | "up" | null (no change —
//         // e.g. a post-retirement event never moves this number)
//     atPlanAge: { age, base, scenario, deltaAbs, dir },
//         // balance at the plan (life-expectancy) age from the walk rows;
//         // base/scenario are null when the walk doesn't reach that age —
//         // "not applicable", NOT zero (screens render "—")
//     sustainability: {
//       baseYears, scenarioYears,          // years sustained; Infinity = never depletes
//       baseDepletionAge, scenarioDepletionAge,  // null = never depletes
//       marginYears,                       // scenarioYears − plan horizon (Infinity ok)
//       stillSustainable,                  // scenario sustains to the plan age
//       newlyDepletes, depletionMoved,     // display flags (rule 10 — no comparisons in JSX)
//     },
//   }
export function evaluateLifeEvent(bundle, event) {
  if (!event) return null;
  const base = calcWhatIfScenario(bundle, {});
  const scen = calcWhatIfScenario(bundle, { scenarioEvents: [event] });
  if (!base || !scen) return null;

  const { safeRetAge, safeLifeExp } = bundle;

  const balAt = (run, age) => {
    const row = (run.chart ?? []).find(r => r.age === age);
    return row ? row.total : null;
  };
  const dirOf = (delta) =>
    Math.round(delta) < 0 ? "down" : Math.round(delta) > 0 ? "up" : null;

  const retBase = base.scenarioTotalAtRet;
  const retScen = scen.scenarioTotalAtRet;
  const planBase = balAt(base, safeLifeExp);
  const planScen = balAt(scen, safeLifeExp);

  const planHorizon = safeLifeExp - safeRetAge;
  const marginYears = scen.scenarioYears === Infinity
    ? Infinity
    : scen.scenarioYears - planHorizon;
  const verdict = marginYears < 0
    ? "unaffordable"
    : marginYears < ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS
      ? "tight"
      : "comfortable";

  const walkDepletion = (run) => {
    if (run.scenarioYears === Infinity) return null;
    // yearsSustained is measured from the retirement age (far-horizon walk).
    return Math.round(run.scenarioRetAge + run.scenarioYears);
  };

  return {
    verdict,
    grossCost: Math.round(eventGrossCost(event)),
    netTotal:  Math.round(eventNetTotal(event)),
    chart: scen.chart,
    atRetirement: {
      age: safeRetAge,
      base: retBase,
      scenario: retScen,
      deltaAbs: Math.abs(Math.round(retScen - retBase)),
      dir: dirOf(retScen - retBase),
    },
    atPlanAge: {
      age: safeLifeExp,
      base: planBase,
      scenario: planScen,
      deltaAbs: (planBase != null && planScen != null)
        ? Math.abs(Math.round(planScen - planBase))
        : null,
      dir: (planBase != null && planScen != null) ? dirOf(planScen - planBase) : null,
    },
    sustainability: (() => {
      const baseDepletionAge     = walkDepletion(base);
      const scenarioDepletionAge = walkDepletion(scen);
      return {
        baseYears: base.scenarioYears,
        scenarioYears: scen.scenarioYears,
        baseDepletionAge,
        scenarioDepletionAge,
        marginYears,
        stillSustainable: marginYears >= 0,
        // Pre-computed display flags so screens never compare model values (rule 10):
        // the event newly introduced a depletion / moved an existing depletion age.
        newlyDepletes: scenarioDepletionAge != null && baseDepletionAge == null,
        depletionMoved: scenarioDepletionAge != null && baseDepletionAge != null
          && baseDepletionAge !== scenarioDepletionAge,
      };
    })(),
  };
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

  // Guard degenerate inputs: a non-positive step would loop forever in the
  // binary search; a target life expectancy at or before retirement leaves no
  // horizon to sustain. Return a safe zero result rather than spin / fabricate.
  if (!(step > 0) || targetLifeExpectancy <= safeRetAge) {
    return { maxAmount: 0, deltaYears: 0 };
  }

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
