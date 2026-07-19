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

import { runSimulation, projectedIncomeAtAge } from "./simulation.js";
import { buildRetirementDrawdown } from "./retirement-drawdown.js";
import { buildRetirementPhase } from "./retirement-phase.js";
import { buildAccumChart } from "./accumulation.js";
import { ASSUMPTIONS } from "../config/irs-2026.js";
import {
  eventFirstAge, eventLastAge, eventGrossCost, eventNetTotal,
  isIncomeReplacingEvent, monthsActiveInYear,
} from "./money-events.js";
import { buildPreviewMetric } from "./apply-preview.js";

// Infinity-aware longevity delta: scenarioYears vs baseYearsSustained, with
// the ±Infinity edges handled explicitly (plain subtraction gives NaN when
// both sides are Infinity). Shared by calcWhatIfDelta, calcWhatIfScenario's
// two walk paths (M1 engine + fallback) so the three can't drift apart.
function deltaYearsFrom(scenarioYears, baseYearsSustained) {
  if (scenarioYears === Infinity && baseYearsSustained === Infinity) return 0;
  if (scenarioYears === Infinity) return Infinity;
  if (baseYearsSustained === Infinity) return -Infinity;
  return scenarioYears - baseYearsSustained;
}

// ── verdictForMargin ─────────────────────────────────────────────────────────
// The ONE definition of the comfortable/tight/unaffordable verdict from a
// sustainability margin (scenarioYears sustained minus the plan horizon in
// years). Used by evaluateLifeEvent (below) and the lever-preview/rail
// builders (buildLeverPreview/buildLeverRail/buildDurationRail) so every
// verdict in the app comes from one formula (rule 10 / principle 7).
//   margin < 0                              → "unaffordable" (depletes before the plan age)
//   0 <= margin < EVENT_COMFORT_BUFFER_YEARS → "tight"
//   margin >= EVENT_COMFORT_BUFFER_YEARS     → "comfortable"
// Exported (#85 readiness, fix pass 2): verdictDisplay (apply-preview.js) maps
// this string to a render-ready { label, tone } — the vocabulary lives here,
// the display mapping lives there, so a future consumer never re-derives the
// three-way threshold itself.
export function verdictForMargin(marginYears) {
  return marginYears < 0
    ? "unaffordable"
    : marginYears < ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS
      ? "tight"
      : "comfortable";
}

// ── marginForScenario (BUG-73 fix) ──────────────────────────────────────────
// THE one sustainability-margin computation — replaces four inlined copies of
// `scenarioYears === Infinity ? Infinity : scenarioYears - planHorizon`
// (evaluateLifeEvent, buildLeverPreview, buildLeverRail, buildDurationRail).
//
// BUG-73: a scenario that never depletes within the 130-year walk always
// reported `marginYears = Infinity`, which saturates verdictForMargin at
// "comfortable" — a plan that spends down to a razor-thin balance at the plan
// age (but doesn't quite hit $0 within the walk horizon) showed the exact
// same "comfortable" verdict as a plan sitting on a 10x cushion. Fixed by
// giving the never-depletes case its own margin basis instead of a flat
// Infinity:
//
//   depletion basis (scenario.scenarioYears finite) — unchanged semantics:
//     marginYears = scenarioYears − (safeLifeExp − scenario.scenarioRetAge)
//     (buildDurationRail used to anchor this at bundle.safeRetAge rather than
//     scenario.scenarioRetAge; identical in practice — a duration event never
//     overrides the retirement age — but this helper always anchors on the
//     scenario's own retirement age, the more general-purpose choice.)
//
//   cushion basis (scenario.scenarioYears === Infinity) — the fix: years of
//     runway still held in reserve AT the plan age:
//       marginYears = scenarioBalAt90 / scenarioDrawAtPlanAge
//     The denominator is the walk's own NET draw in the plan-age year
//     (spending minus SS/pension), NOT the full retirement spend. Pricing at
//     full expenses (the first cut of this fix) made the margin non-monotonic
//     at the depletion-horizon crossover for SS-heavy plans: the depletion
//     basis measures runway net of the income floor, so a $200k reserve at a
//     $7k/yr net draw is ~30 yrs of runway (continuous with the depletion
//     figure just across the crossover), not the 3 yrs that a full-$62k-spend
//     pricing claimed — which read "tight" while spending $2k MORE flipped the
//     same rail to a "comfortable" 31-yr depletion margin (Fable review,
//     PR #53). Net-draw pricing is still conservative (ignores growth on the
//     reserve); it just measures in the same currency as the depletion basis.
//     Edges: scenarioDrawAtPlanAge == 0 (SS/pension cover everything — the
//     reserve is never drawn) → Infinity; scenarioDrawAtPlanAge null/undefined
//     (older callers / synthetic test scenarios without the field) → fall back
//     to the full-expenses pricing; scenarioBalAt90 null → Infinity.
//
// Threshold note (owner-reviewed): both bases reuse
// ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS (5) — "years of runway beyond plan
// age" is the same unit either way. A dedicated cushion-specific buffer
// constant would be a constants-only change later if the two bases ever need
// to diverge.
export function marginForScenario(scenario, safeLifeExp) {
  if (scenario.scenarioYears !== Infinity) {
    return {
      marginYears: scenario.scenarioYears - (safeLifeExp - scenario.scenarioRetAge),
      marginBasis: "depletion",
    };
  }
  const { scenarioBalAt90, scenarioExpenses, scenarioDrawAtPlanAge } = scenario;
  // Denominator: the plan-age net draw when the scenario provides it (both
  // calcWhatIfScenario paths do); full expenses as the legacy fallback.
  const drainRate = scenarioDrawAtPlanAge != null ? scenarioDrawAtPlanAge : scenarioExpenses;
  const marginYears = (scenarioBalAt90 != null && drainRate > 0)
    ? scenarioBalAt90 / drainRate
    : Infinity;
  return { marginYears, marginBasis: "cushion" };
}

// Human sentence for a margin (whole-year rounding — rule 10: the sheet/rail
// callers render this verbatim, never re-deriving the wording).
// Cushion labels cap at CUSHION_LABEL_CAP_YEARS: SS/pension-covered plans can
// compute a technically-true but absurd-looking runway ("≈366 yrs" — the net
// draw at the plan age is nearly zero); the label says "50+ yrs" while the
// underlying marginYears stays exact for the verdict math.
function buildMarginLabel({ marginYears, marginBasis }, safeLifeExp) {
  if (marginBasis === "cushion") {
    const cap = ASSUMPTIONS.CUSHION_LABEL_CAP_YEARS;
    if (marginYears === Infinity) return "still growing at your plan age";
    if (marginYears > cap) return `${cap}+ yrs of runway left at ${safeLifeExp}`;
    return `≈${Math.round(marginYears)} yrs of runway left at ${safeLifeExp}`;
  }
  return marginYears >= 0
    ? `${Math.round(marginYears)} yrs to spare past ${safeLifeExp}`
    : `runs out ${Math.round(Math.abs(marginYears))} yrs early`;
}

// ── verdictForScenarioResult ─────────────────────────────────────────────────
// THE one scenario → verdict resolution, shared by verdictInfoForScenario and
// both tick rails so a rail tick can never disagree with the verdict card.
// Two overrides on top of the margin math (undefined fields — synthetic test
// scenarios / lever previews without events — simply don't trigger them, since
// `undefined > 0` is false; no `?? 0` fabrication needed):
//   1. BUG-74: events that could not be fully funded during accumulation
//      (eventFundingShortfall > 0 — every account drained, dollars still owed)
//      are "unaffordable" by definition — the walk ran on spending the plan
//      couldn't actually do.
//   2. Owner spec (PR #54 review): events that forced EARLY RETIREMENT-ACCOUNT
//      withdrawals (eventRetirementDraw > 0) can never read "comfortable" —
//      raiding the 401k/Roth (with penalties) for a discretionary event is at
//      best "tight", however healthy the end-state walk looks.
export function verdictForScenarioResult(scenario, safeLifeExp) {
  if (scenario.eventFundingShortfall > 0) return "unaffordable";
  const { marginYears } = marginForScenario(scenario, safeLifeExp);
  const verdict = verdictForMargin(marginYears);
  if (scenario.eventRetirementDraw > 0 && verdict === "comfortable") return "tight";
  return verdict;
}

// ── buildVerdictLegend ───────────────────────────────────────────────────────
// The labeled comfortable/tight/unaffordable ranges, in the user's own units
// (years of runway / the plan age) — owner requirement: users must SEE the
// value range behind each verdict color, not just the color. Uses the real
// ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS and the real plan age — never
// hardcodes 5 or 90 (rule 1 / rule 10).
export function buildVerdictLegend(planAge) {
  const buffer = ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS;
  return [
    { verdict: "comfortable",  label: `${buffer}+ yrs of runway` },
    { verdict: "tight",        label: `0–${buffer} yrs of runway` },
    { verdict: "unaffordable", label: `runs out before ${planAge}` },
  ];
}

// ── verdictInfoForScenario ───────────────────────────────────────────────────
// Render-ready verdict package for a calcWhatIfScenario result — rule 10: every
// copy string and number here is model-provided, so a screen never re-derives
// wording or thresholds. Wraps marginForScenario + verdictForMargin +
// buildMarginLabel + buildVerdictLegend into ONE call.
export function verdictInfoForScenario(scenario, safeLifeExp) {
  const { marginYears, marginBasis } = marginForScenario(scenario, safeLifeExp);
  const thresholds = {
    comfortableMin: ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS,
    tightMin: 0,
  };
  const common = { marginYears, marginBasis, rangeLegend: buildVerdictLegend(safeLifeExp), thresholds };
  // Verdict from THE shared resolver (both overrides included), with an honest
  // label for each override — the margin sentence would be misleading when the
  // verdict wasn't decided by the margin. Override labels carry the REASON
  // only, no dollar figure: the sheet's dedicated fundingShortfall /
  // retirementFunding bullets are the sole carriers of the amounts (CodeRabbit
  // PR #54 — the first cut stated the same fact twice with two dollar formats).
  const verdict = verdictForScenarioResult(scenario, safeLifeExp);
  if (scenario.eventFundingShortfall > 0) {
    return {
      ...common,
      verdict,
      marginLabel: "part of this can't be funded from savings",
    };
  }
  if (scenario.eventRetirementDraw > 0 && verdict === "tight"
      && verdictForMargin(marginYears) === "comfortable") {
    return {
      ...common,
      verdict,
      marginLabel: "needs early retirement-account withdrawals to fund",
    };
  }
  return {
    ...common,
    verdict,
    marginLabel: buildMarginLabel({ marginYears, marginBasis }, safeLifeExp),
  };
}

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
  moneyEvents = [],             // scenario ADDITIONS only ({ label, amount, age, isInflow, isTaxable }).
                                // Committed events travel inside the bundle — simInputs.moneyEvents
                                // for the sim, retDrawShared.moneyEvents for the walk — and are merged
                                // below on BOTH phases. Passing committed events here double-counts
                                // them in the retirement walk (BUG-75).
  annualExpensesOverride = null, // change annual retirement spending (number or null)
  retirementAgeOverride  = null, // shift retirement age (number or null — re-runs sim)
  contribOverrides = null,       // { contrib401k?, contribRoth?, contribTaxable?, contribHSA? } — re-runs sim
  addlPreTaxBal = 0,             // outside pre-tax balance (App.jsx) — baseTotalAtRet already
                                  // includes it; the re-sim below must add it too or a forced
                                  // resim's scenarioTotalAtRet silently drops it (basis mismatch).
}) {
  const scenarioRetAge    = retirementAgeOverride ?? safeRetAge;
  const scenarioExpenses  = annualExpensesOverride ?? retDrawShared.effectiveExpenses;

  // Split events by phase — kind-aware (money-events.js): a duration event
  // spanning the retirement boundary goes to BOTH walks; each walk applies only
  // the years inside its own age range via eventNetForYear.
  // Boundary: <= (not <) — an event at exactly the retirement age belongs in the
  // re-sim, since the sim row read below IS the retirement-age row (matches
  // calcWhatIfScenario's documented convention below). With `<` an event dated
  // exactly at scenarioRetAge fell into neither the sim (excluded by `<`) nor the
  // walk (which starts at startAge+1) — a complete no-op.
  const accumEvents = moneyEvents.filter(ev => eventFirstAge(ev) <= scenarioRetAge);
  const retEvents   = moneyEvents.filter(ev => eventLastAge(ev) >= scenarioRetAge);

  // ── Step 1: determine scenario starting balance at retirement ──────────────
  let scenarioTotalAtRet = baseTotalAtRet;

  // Guard a degenerate retirement-age override: retiring at or before the
  // current age has no accumulation phase, so re-running the sim and indexing
  // at a negative row would fabricate a $0 starting balance / depletion. Skip
  // the sim and keep the baseline starting balance in that case.
  if ((accumEvents.length > 0 || retirementAgeOverride !== null || contribOverrides !== null)
      && scenarioRetAge > simInputs.currentAge) {
    // contribOverrides spread AFTER simInputs so it takes precedence; moneyEvents
    // is written explicitly last so a stray key in contribOverrides (not part of
    // its documented shape) can never silently override the real event list.
    // Committed events (simInputs.moneyEvents) must ride along in the re-sim —
    // the no-resim baseline (baseTotalAtRet) already includes them, so dropping
    // them here would make a forced re-sim's basis asymmetric (BUG-75 fix; same
    // class as the BUG-34/BUG-61 basis mismatches).
    const raw = runSimulation({
      ...simInputs, ...(contribOverrides ?? {}),
      moneyEvents: [...(simInputs.moneyEvents ?? []), ...accumEvents],
    });
    // Mirror App.jsx: the row at index (scenarioRetAge - currentAge - 1)
    const retIdx = scenarioRetAge - simInputs.currentAge - 1;
    const at = raw[retIdx];
    if (at) {
      // BUG-35: gross basis (the 401k is no longer haircut) — matches the gross
      // baseTotalAtRet so scenario-vs-baseline deltas are apples-to-apples. Also
      // add addlPreTaxBal — baseTotalAtRet already includes it (App.jsx), and
      // runSimulation has no concept of it, so it must be added back here too.
      scenarioTotalAtRet = (at.tradGross ?? 0)
        + (at["Roth IRA"] ?? 0)
        + (at["Taxable"]  ?? 0)
        + (at["HSA"]      ?? 0)
        + addlPreTaxBal;
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
  const deltaYears = deltaYearsFrom(scenarioYears, baseYearsSustained);

  return {
    baseTotalAtRet,
    scenarioTotalAtRet,
    baseYears:    baseYearsSustained,
    scenarioYears,
    deltaYears,
    baseExpenses:    retDrawShared.effectiveExpenses,
    scenarioExpenses,
    scenarioEndVal: scenarioLifeWalk.endVal,
    scenarioDepletionAge: scenarioWalk.depletionAge,
  };
}

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
// overrides: { retireAdj, retirementAge, annualExpenses, monthlyExpenses, scenarioEvents, excludeEventId }
//   retireAdj       — convenience shift from safeRetAge (e.g. -2 = retire 2 yrs early)
//   retirementAge   — absolute retirement age override (takes precedence over retireAdj)
//   annualExpenses  — override for retirement spending
//   monthlyExpenses — same override expressed monthly (annualExpenses wins if both
//                     are given); the month→year conversion lives HERE, not in JSX
//   scenarioEvents  — additional one-time events for this scenario only (e.g. a lump-sum trip spend)
//   excludeEventId  — strip a committed event (by id) out of every committed-event
//                     source (simInputs.moneyEvents, retDrawShared.moneyEvents, and
//                     the gap-events derived from them) before the walk, and force a
//                     re-sim so the starting-balance baseline recomputes too (H1: lets
//                     a caller re-price a committed event — e.g. LifeEventSheet's edit
//                     mode — without it also being priced as part of the "committed"
//                     background via scenarioEvents, which would double-count it)
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
//     scenarioBalAt90,    // balance at safeLifeExp from the walk rows (field keeps its
//                         //   historical "90" name — matches App.jsx's balAt90, which
//                         //   is also lifeExp-based despite the name; review fix — this
//                         //   used to be hardcoded to literal age 90, comparing against
//                         //   the already-lifeExp-based baseline at a DIFFERENT age).
//                         //   null  → the walk never reaches safeLifeExp: "not applicable",
//                         //           NOT zero — screens render "—".
//                         //   0     → a genuine depletion at/before safeLifeExp (a real $0).
//     scenarioDepletionAge, // age the far-horizon walk hits $0, or null if it never does.
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
  const excludeEventId   = overrides.excludeEventId ?? null;

  // H1: strip a committed event (by id) out of every committed-event source
  // before the walk — used when re-pricing a committed event (e.g. an edit in
  // LifeEventSheet) so it isn't ALSO counted via the committed background AND
  // via scenarioEvents. A no-op (identity) when excludeEventId is null.
  const stripExcluded = (events) => (excludeEventId == null
    ? (events ?? [])
    : (events ?? []).filter(ev => ev.id !== excludeEventId));

  // Scenario events with pre-retirement activity force a re-sim even when the
  // retirement age is unchanged — they change the compounded balance AT
  // retirement. (Previously scenarioEvents reached only the retirement walk, so
  // a pre-retirement scenario event was silently ignored — BUG-42.)
  // Boundary: the sim row that is read below IS the retirement-age row, so an
  // event landing exactly at the retirement age belongs in the sim (this matches
  // the main App path, where runSimulation gets the full event list) — hence <=.
  // excludeEventId also forces a re-sim (even with no other override) so the
  // starting-balance baseline recomputes from a committed-event set that no
  // longer includes the excluded id (H1) — needed for a pre-retirement or
  // boundary-spanning excluded event to actually leave the compounding balance.
  const committedEvents = stripExcluded(simInputs.moneyEvents);
  const scenarioAccum   = scenarioEvents.filter(ev => eventFirstAge(ev) <= scenarioRetAge);
  const needsResim = scenarioRetAge !== safeRetAge || scenarioAccum.length > 0 || excludeEventId != null;

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

  // BUG-74: event dollars NO account could fund during accumulation (the sim's
  // funding cascade drained taxable → Roth → 401k and still came up short).
  // Summed over the sim years this scenario actually uses (through the
  // retirement-age row). A positive value means the plan literally cannot pay
  // for its events — the verdict layer treats that as "unaffordable" regardless
  // of how the (unfunded) walk looks afterward.
  const eventFundingShortfall = needsResim
    ? resimRaw.reduce((s, d) => (d.age <= scenarioRetAge ? s + (d.eventShortfall ?? 0) : s), 0)
    : 0;
  const firstShortfallAge = needsResim
    ? (resimRaw.find(d => d.age <= scenarioRetAge && (d.eventShortfall ?? 0) > 0)?.age ?? null)
    : null;
  // Early retirement-account withdrawals the events forced (gross Roth + 401k
  // draws) and the tax/penalty they leaked. A discretionary event funded by
  // raiding retirement accounts can never read "comfortable" (owner spec,
  // PR #54 review) — the verdict layer caps it at "tight".
  const eventRetirementDraw = needsResim
    ? resimRaw.reduce((s, d) => (d.age <= scenarioRetAge
        ? s + (d.eventDrawRoth ?? 0) + (d.eventDraw401k ?? 0) : s), 0)
    : 0;
  const eventRetirementDrawTax = needsResim
    ? resimRaw.reduce((s, d) => (d.age <= scenarioRetAge ? s + (d.eventDrawTax ?? 0) : s), 0)
    : 0;

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
  const mergedEvents = [...stripExcluded(retDrawShared.moneyEvents), ...gapEvents, ...scenarioEvents];

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

    // Balance at safeLifeExp (the field keeps its historical "90" name — see
    // the fallback branch below for the same fix's rationale: a hardcoded 90
    // here would be apples-to-oranges against baseTotalAtRet's balAt90
    // whenever lifeExpect != 90). null means "the walk never reaches
    // safeLifeExp" (not applicable, NOT zero); a genuine depletion at/before
    // safeLifeExp is a real 0.
    let scenarioBalAt90;
    let scenarioDrawAtPlanAge = null;
    if (rp.depletionAge != null && rp.depletionAge <= safeLifeExp) {
      scenarioBalAt90 = 0;
    } else {
      const row90 = walkRows.find(r => r.age === safeLifeExp);
      scenarioBalAt90 = row90 ? row90.total : null;
      // Net portfolio draw in the plan-age year (engine rows: draw = spending
      // net of SS/pension + any event cash folded into `needed`). Feeds the
      // cushion-basis margin's denominator — see marginForScenario.
      scenarioDrawAtPlanAge = row90 ? row90.draw : null;
    }

    const scenarioYears = rp.yearsSustained;
    const deltaYears = deltaYearsFrom(scenarioYears, baseYearsSustained);

    return {
      chart,
      scenarioRetAge,
      scenarioTotalAtRet,
      scenarioExpenses,
      scenarioYears,
      deltaYears,
      scenarioBalAt90,
      scenarioDrawAtPlanAge,
      eventFundingShortfall,   // BUG-74: unfundable event $ (0 = fully funded)
      firstShortfallAge,       //   … and the first age it happens (null = none)
      eventRetirementDraw,     // gross Roth+401k drawn early to fund events (0 = cash-funded)
      eventRetirementDrawTax,  //   … and the tax + penalties those draws leaked
      // M2: the engine's own depletion age (rp.depletionAge) — exact, not a
      // round(retAge + yearsSustained) derivation, which lands one year early
      // whenever the failure year is < 50% funded (yearsSustained's fractional
      // part < 0.5 rounds DOWN past a depletion that already happened).
      scenarioDepletionAge: rp.depletionAge ?? null,
    };
  }

  // ── Fallback: the older blended-pool walk (buildRetirementDrawdown). App.jsx
  // always supplies retPhaseBase, so this branch does not run in production —
  // kept for any caller/test that hasn't been migrated to the engine bundle.
  let startBal = baseTotalAtRet ?? 0;
  if (needsResim) {
    // BUG-35: gross basis (no 401k haircut) — consistent with baseTotalAtRet.
    // addlPreTaxBal added back for the same reason as the primary (engine)
    // path above and calcWhatIfDelta's resim — baseTotalAtRet already
    // includes it, so a resim that omits it is a basis mismatch.
    startBal = (resimAt.tradGross ?? 0)
      + (resimAt["Roth IRA"] ?? 0) + (resimAt["Taxable"] ?? 0) + (resimAt["HSA"] ?? 0)
      + (addlPreTaxBal ?? 0);
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

  // Balance at safeLifeExp (the field keeps its historical "90" name, matching
  // App.jsx's balAt90 — both were literally age-90 once; both now use the user's
  // actual plan-to-age). Review fix: this used to be a hardcoded age-90 lookup,
  // comparing against baseTotalAtRet's balAt90 (already lifeExp-based) at a
  // DIFFERENT age whenever lifeExpect != 90 — an apples-to-oranges "Left at 90"
  // stat. null means "the walk never reaches safeLifeExp" (not applicable, NOT
  // zero — can't happen in practice since lifeWalk's endAge is >= safeLifeExp,
  // but kept as a guard); a genuine depletion at/before safeLifeExp is a real 0.
  let scenarioBalAt90;
  let scenarioDrawAtPlanAge = null;
  if (lifeWalk.depletionAge != null && lifeWalk.depletionAge <= safeLifeExp) {
    scenarioBalAt90 = 0;
  } else {
    const refRow = (lifeWalk.rows ?? []).find(r => r.age === safeLifeExp);
    scenarioBalAt90 = refRow ? refRow.total : null;
    // Net portfolio draw in the plan-age year (blended-walk rows: draw =
    // max(0, expenses − SS − pension)). Feeds the cushion-basis margin's
    // denominator — see marginForScenario.
    scenarioDrawAtPlanAge = refRow ? refRow.draw : null;
  }

  const scenarioYears = farWalk.yearsSustained;
  const deltaYears = deltaYearsFrom(scenarioYears, baseYearsSustained);

  return {
    chart,
    scenarioRetAge,
    scenarioTotalAtRet: startBal,
    scenarioExpenses,
    scenarioYears,
    deltaYears,
    scenarioBalAt90,
    scenarioDrawAtPlanAge,
    eventFundingShortfall,   // BUG-74: unfundable event $ (0 = fully funded)
    firstShortfallAge,       //   … and the first age it happens (null = none)
    eventRetirementDraw,     // gross Roth+401k drawn early to fund events (0 = cash-funded)
    eventRetirementDrawTax,  //   … and the tax + penalties those draws leaked
    // Fallback path only (dead in production — App.jsx always supplies
    // retPhaseBase, see the M1 engine branch above): use the walk's own exact
    // depletion age rather than the local round(retAge + yearsSustained)
    // derivation, which can land one year early (same fix as the M1 branch's
    // rp.depletionAge, applied here for consistency).
    scenarioDepletionAge: farWalk.depletionAge,
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

// ── eventIncomeImpact ────────────────────────────────────────────────────────
// Income impact of ONE candidate duration event over its WORKING-phase months
// (owner decision: a duration outflow's incomeAnnual now means "my total
// income during this period," replacing salary — see money-events.js's
// module header). This is the "what did I actually give up in pay" figure,
// separate from the portfolio-cost bullets evaluateLifeEvent already builds:
// a sabbatical that pauses salary shows up on the walk via
// eventsIncomeAdjustment (lower contributions, lower MAGI), but nothing in
// evaluateLifeEvent's existing fields names the lost PAYCHECK itself — this
// does, so LifeEventSheet can show it as its own bullet (rule 10 — the sheet
// renders this verbatim, never re-derives it).
//
// Returns null for: one-time events (no incomeAnnual concept), inflow
// duration events (additive side income, not a salary replacement — see
// eventsIncomeAdjustment's own isInflow gate), events with a non-finite
// incomeAnnual (legacy/undefined = "no statement about income"), or events
// entirely past safeRetAge (no salary to lose once retired — post-retirement
// incomeAnnual is additive side income, handled elsewhere). Otherwise:
//   {
//     monthsWorking,     // Σ months of the event that land at ages <= safeRetAge
//     usualPay,          // Σ (monthsInYear/12) × projectedIncomeAtAge(simInputs, age)
//                        //   over those working years — what the person would have
//                        //   earned WITHOUT the event
//     eventPay,          // Σ (monthsInYear/12) × |incomeAnnual| over the same years —
//                        //   what the event says they'll actually earn
//     netLostIncome,     // usualPay − eventPay (negative = a net income GAIN,
//                        //   e.g. incomeAnnual set above usual pay)
//     netLostIncomeAbs,  // Math.abs(netLostIncome), pre-computed so the sheet never
//                        //   does Math.abs in JSX (matches deltaAbs's convention below)
//     dir,               // "down" when netLostIncome > 0 (a real pay cut),
//                        // "up" when netLostIncome < 0 (a net gain),
//                        // null when exactly 0 (no change) — rule 10, no sign math in JSX
//   }
export function eventIncomeImpact(event, simInputs, safeRetAge) {
  // isIncomeReplacingEvent is the SAME predicate the sim's salary channel uses
  // (eventsIncomeAdjustment) — shared so this bullet can never claim an income
  // impact the sim doesn't apply (Fable review, PR #53: the old inline
  // `event.isInflow` truthy-check disagreed with the sim's gate for an event
  // whose isInflow was left undefined).
  if (!event || !isIncomeReplacingEvent(event)) return null;
  if (eventFirstAge(event) > safeRetAge) return null;

  let monthsWorking = 0;
  let usualPay = 0;
  let eventPay = 0;
  const lastWorkingAge = Math.min(eventLastAge(event), safeRetAge);
  for (let age = eventFirstAge(event); age <= lastWorkingAge; age++) {
    const months = monthsActiveInYear(event, age);
    if (months <= 0) continue;
    monthsWorking += months;
    usualPay += (months / 12) * projectedIncomeAtAge(simInputs, age);
    eventPay += (months / 12) * Math.abs(event.incomeAnnual);
  }
  if (monthsWorking <= 0) return null;

  const netLostIncome = usualPay - eventPay;
  const dir = netLostIncome > 0 ? "down" : netLostIncome < 0 ? "up" : null;

  return {
    monthsWorking, usualPay, eventPay, netLostIncome,
    netLostIncomeAbs: Math.abs(netLostIncome),
    dir,
  };
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
//     verdict,               // "comfortable" | "tight" | "unaffordable" — same string as
//                            //   verdictInfo.verdict below (kept for back-compat callers)
//     verdictInfo,           // verdictInfoForScenario(scen, safeLifeExp) — the full
//                            //   render-ready package: { verdict, marginYears, marginBasis,
//                            //   marginLabel, rangeLegend, thresholds } (BUG-73)
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
//       marginYears,                       // marginForScenario's margin (BUG-73: a
//                                           //   finite cushion-basis figure when
//                                           //   scenarioYears is Infinity, not a flat Infinity)
//       marginBasis,                       // "depletion" | "cushion" — which basis produced
//                                           //   marginYears (see marginForScenario)
//       stillSustainable,                  // scenario sustains to the plan age
//       newlyDepletes, depletionMoved,     // display flags (rule 10 — no comparisons in JSX)
//     },
//     incomeImpact,           // eventIncomeImpact(event, bundle.simInputs, safeRetAge) — null
//                             //   unless the event is a working-phase, income-replacing outflow
//                             //   duration event (see eventIncomeImpact's own doc above)
//   }
export function evaluateLifeEvent(bundle, event) {
  if (!event) return null;
  // H1: when editing a committed event (event.id set — LifeEventSheet's edit
  // mode), the bundle's committed-event lists already bake the ORIGINAL event
  // into every walk. Pricing the (possibly edited) candidate on top of that via
  // scenarioEvents alone would count it twice (an unchanged edit of a $40k trip
  // showed ≈ −$59k instead of "no change"). Only the SCENARIO run excludes the
  // original and re-adds the candidate in its place; the BASE run stays the
  // plan exactly as currently committed, so an edit that changes nothing
  // reproduces the base run (small resim-vs-direct rounding noise is expected
  // and tolerated by callers). New (unsaved) events carry no id, so this is a
  // no-op for the add-new-event flow — unchanged from before.
  const excludeEventId = event.id ?? null;
  const base = calcWhatIfScenario(bundle, {});
  const scen = calcWhatIfScenario(bundle, {
    ...(excludeEventId != null ? { excludeEventId } : {}),
    scenarioEvents: [event],
  });
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

  // BUG-73: the verdict info package (verdictInfoForScenario) is THE margin
  // computation — never a locally-inlined Infinity/depletion branch.
  const verdictInfo = verdictInfoForScenario(scen, safeLifeExp);
  const { verdict, marginYears, marginBasis } = verdictInfo;

  const walkDepletion = (run) => {
    if (run.scenarioYears === Infinity) return null;
    // M2: prefer the engine's own scenarioDepletionAge (exact) over the
    // round(retAge + yearsSustained) derivation, which can land one year early.
    return run.scenarioDepletionAge ?? Math.round(run.scenarioRetAge + run.scenarioYears);
  };

  return {
    verdict,
    verdictInfo,
    grossCost: Math.round(eventGrossCost(event)),
    netTotal:  Math.round(eventNetTotal(event)),
    chart: scen.chart,
    incomeImpact: eventIncomeImpact(event, bundle.simInputs, safeRetAge),
    // BUG-74: non-null when the event can't be fully funded — every account
    // (taxable → Roth → 401k) was drained and dollars were still owed. The
    // verdict above is already forced to "unaffordable" in that case; this
    // named field lets the sheet render the honest warning line (rule 10).
    fundingShortfall: (scen.eventFundingShortfall ?? 0) > 0
      ? { amount: Math.round(scen.eventFundingShortfall), firstAge: scen.firstShortfallAge }
      : null,
    // Owner spec (PR #54 review): non-null when funding the event required
    // EARLY retirement-account withdrawals (gross Roth+401k drawn, and the
    // tax + penalties leaked). The verdict is capped at "tight" in that case;
    // this field lets the sheet say why (rule 10).
    retirementFunding: (scen.eventRetirementDraw ?? 0) > 0
      ? {
          drawTotal: Math.round(scen.eventRetirementDraw),
          taxAndPenalty: Math.round(scen.eventRetirementDrawTax ?? 0),
        }
      : null,
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
        marginBasis,
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
//
// Takes the SAME bundle shape as calcWhatIfScenario (the `whatIfBundle` shape
// documented above it) rather than the older calcWhatIfDelta arg shape — this
// is the "must precede any solver UI" fix (fix-pass-2, 2026-07-11): everything
// visible on the Ideas/Plan arc already walks retirement with the per-account
// engine (buildRetirementPhase) via calcWhatIfScenario; a future affordability
// solver built on the OLD blended calcWhatIfDelta walk would silently contradict
// what the arc shows for the same candidate purchase. The probe below is exactly
// evaluateLifeEvent's pattern — one candidate one-time outflow via
// `scenarioEvents`, sustainability read off `scenarioYears` — so a solver and
// the life-event sheet can never disagree about whether an amount is affordable.
//
// Returns { maxAmount, deltaYears, canAfford } for the affordable amount.
// `deltaYears` is calcWhatIfScenario's own `deltaYears` for the final
// candidate (±Infinity handled there), not a locally recomputed value.
export function calcAffordabilityMax(bundle, {
  purchaseAge,
  targetLifeExpectancy,
  step = ASSUMPTIONS.AFFORDABILITY_STEP,
  maxSearch = ASSUMPTIONS.AFFORDABILITY_MAX_SEARCH,
} = {}) {
  if (!bundle) return { maxAmount: 0, deltaYears: 0, canAfford: false };
  const { safeRetAge } = bundle;
  const targetYears = targetLifeExpectancy - safeRetAge;

  // Guard degenerate inputs: a non-positive step would loop forever in the
  // binary search; a target life expectancy at or before retirement leaves no
  // horizon to sustain. Return a safe zero result rather than spin / fabricate.
  if (!(step > 0) || targetLifeExpectancy <= safeRetAge) {
    return { maxAmount: 0, deltaYears: 0, canAfford: false };
  }

  const runScenario = (amount) => calcWhatIfScenario(bundle, {
    scenarioEvents: [{ label: "Affordability check", amount, age: purchaseAge, isInflow: false, isTaxable: false }],
  });

  const isSustainable = (amount) => {
    const scenario = runScenario(amount);
    if (!scenario) return false;
    const years = scenario.scenarioYears === Infinity ? targetYears + 1 : scenario.scenarioYears;
    return years >= targetYears;
  };

  // Quick check: can they even afford $0? (i.e. is baseline sustainable)
  if (!isSustainable(0)) return { maxAmount: 0, deltaYears: 0, canAfford: false };

  // Binary search
  let lo = 0;
  let hi = maxSearch;
  while (hi - lo > step) {
    const mid = Math.round((lo + hi) / 2 / step) * step;
    if (isSustainable(mid)) lo = mid;
    else hi = mid - step;
  }

  const finalScenario = runScenario(lo);

  return {
    maxAmount: lo,
    deltaYears: finalScenario ? finalScenario.deltaYears : 0,
    canAfford: lo > 0,
  };
}

// Balance at a given age from a chart series ([{age, total}]). Shared by
// buildLeverPreview below (mirrors evaluateLifeEvent's local `balAt`).
function balAtAge(chart, age) {
  const row = (chart ?? []).find(r => r.age === age);
  return row ? row.total : null;
}

// Depletion age implied by a years-sustained figure measured from `retAge`.
// Infinity years → null (never depletes — "not applicable", not a real age);
// mirrors evaluateLifeEvent's walkDepletion.
function depletionAgeFrom(years, retAge) {
  return years === Infinity ? null : Math.round(retAge + years);
}

// ── LEVERS ───────────────────────────────────────────────────────────────────
// Per-lever knowledge shared by buildLeverPreview's `changed` computation and
// buildLeverRail's lever whitelist + override construction (#123 readiness,
// fix pass 2) — lifted verbatim from the branching each function already did,
// not new behavior:
//   overrideKey  — the calcWhatIfScenario override field this lever writes.
//                  Identical to the lever's own key today, but kept explicit
//                  rather than assumed: #123's future lever will NOT share its
//                  name with its override key (see the reserved note below).
//   round        — buildLeverRail's per-step value rounding (retirementAge:
//                  whole years; monthlyExpenses: cents) — was a ternary on
//                  `lever === "retirementAge"` inline in that function.
//   toComparable — normalizes a raw lever value into the SAME units as
//                  baseValue(bundle), for buildLeverPreview's `changed` check.
//                  retirementAge needs no conversion; monthlyExpenses is
//                  annualized (× ASSUMPTIONS.MONTHS_PER_YEAR) to compare
//                  against the annual `effectiveExpenses` baseline — mirrors
//                  what calcWhatIfScenario itself does with the override.
//   baseValue    — reads the current/committed value off the bundle to diff
//                  the candidate against (safeRetAge;
//                  retDrawShared.effectiveExpenses).
//
// RESERVED (future #123): an `annualSavings` lever — override key
// `annualContributions` — unit is ANNUAL dollars (the owner's unit decision;
// NOT monthly, unlike the spend lever). See the matching savingsMin/savingsMax
// reservation note in App.jsx's sliderBounds memo. Not added as a table entry
// until #123 actually threads a savings override through calcWhatIfScenario —
// an empty reservation entry here would be dead code no caller exercises.
export const LEVERS = {
  retirementAge: {
    overrideKey: "retirementAge",
    round: v => Math.round(v),
    toComparable: v => v,
    baseValue: bundle => bundle.safeRetAge,
  },
  monthlyExpenses: {
    overrideKey: "monthlyExpenses",
    round: v => Math.round(v * 100) / 100,
    toComparable: v => v * ASSUMPTIONS.MONTHS_PER_YEAR,
    baseValue: bundle => bundle.retDrawShared.effectiveExpenses,
  },
};

// ── buildLeverPreview ────────────────────────────────────────────────────────
// The model behind the Plan screen's "Try a change" panel: ONE candidate
// override (a new retirement age and/or a new monthly spend) → the dashed
// overlay chart AND the three headline preview metrics, all from the SAME
// calcWhatIfScenario run (so the panel's numbers and its chart overlay can
// never disagree — V1/principle 7). Metrics are built with buildPreviewMetric
// (apply-preview.js, WI-3.9) — the ONE dir/tone/formatting implementation —
// never hand-rolled here (rule 10).
//
// bundle: the `whatIfBundle` shape documented above calcWhatIfScenario.
// overrides: { retirementAge, monthlyExpenses, scenarioEvents } — any subset.
//   Omitted fields simply aren't overridden (calcWhatIfScenario semantics).
//   scenarioEvents (M1) — one-time/duration events for this preview only (e.g.
//   an Ideas scenario card's lump-sum trip) — passed straight through to
//   calcWhatIfScenario so the preview and the eventual moneyEvents commit can
//   never disagree about what "applying this scenario" means.
//
// Returns null when the bundle is invalid (calcWhatIfScenario itself returns
// null); otherwise:
//   {
//     changed,        // true when a provided override actually differs from
//                     // the base (retirementAge vs bundle.safeRetAge, the
//                     // annualized monthly value vs bundle.retDrawShared.effectiveExpenses,
//                     // or a non-empty scenarioEvents list)
//     chart,          // the scenario's full lifetime series (for the dashed overlay)
//     metrics,        // [portfolio-at-retirement, longevity, balance-at-plan-age]
//                     // — buildPreviewMetric rows, ready to render verbatim
//     verdict,        // "comfortable" | "tight" | "unaffordable" — from the
//                     // scenario's own retirement age (a retire-later override
//                     // shifts the plan horizon, not just the balance)
//     verdictInfo,    // verdictInfoForScenario(scenario, safeLifeExp) — the full
//                     // render-ready package (BUG-73's cushion-basis fix included)
//     scenarioStats,  // { scenarioRetAge, scenarioExpenses, scenarioTotalAtRet,
//                     //   scenarioYears, scenarioBalAt90 } — passthrough scalars
//   }
export function buildLeverPreview(bundle, { retirementAge, monthlyExpenses, scenarioEvents = [] } = {}) {
  if (!bundle) return null;

  const overrides = {};
  if (retirementAge != null) overrides[LEVERS.retirementAge.overrideKey] = retirementAge;
  if (monthlyExpenses != null) overrides[LEVERS.monthlyExpenses.overrideKey] = monthlyExpenses;
  if (scenarioEvents.length > 0) overrides.scenarioEvents = scenarioEvents;

  const scenario = calcWhatIfScenario(bundle, overrides);
  if (!scenario) return null;

  const {
    safeRetAge, safeLifeExp, baseTotalAtRet, baseYearsSustained, baseChart,
    baseDepletionAge,
  } = bundle;

  // LEVERS table (below): toComparable normalizes each lever's raw preview
  // value into the same units as baseValue(bundle) before comparing — identity
  // for retirementAge, annualized for monthlyExpenses (mirrors what
  // calcWhatIfScenario itself does with the override).
  const changedRetAge = retirementAge != null
    && LEVERS.retirementAge.toComparable(retirementAge) !== LEVERS.retirementAge.baseValue(bundle);
  const changedExpenses = monthlyExpenses != null
    && LEVERS.monthlyExpenses.toComparable(monthlyExpenses) !== LEVERS.monthlyExpenses.baseValue(bundle);
  const changed = changedRetAge || changedExpenses || scenarioEvents.length > 0;

  const metrics = [
    buildPreviewMetric({
      id: "totalAtRet", label: "Portfolio at retirement",
      before: baseTotalAtRet, after: scenario.scenarioTotalAtRet, betterDir: "up",
    }),
    buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity",
      // M2: prefer the bundle/scenario's own engine-derived depletion age over
      // the round(retAge + years) derivation (which can land one year early).
      before: { years: baseYearsSustained, depletionAge: baseDepletionAge ?? depletionAgeFrom(baseYearsSustained, safeRetAge) },
      after: { years: scenario.scenarioYears, depletionAge: scenario.scenarioDepletionAge ?? depletionAgeFrom(scenario.scenarioYears, scenario.scenarioRetAge) },
      betterDir: "up",
    }),
    buildPreviewMetric({
      id: "balAtPlanAge", label: `Balance at ${safeLifeExp}`,
      before: balAtAge(baseChart, safeLifeExp), after: balAtAge(scenario.chart, safeLifeExp), betterDir: "up",
    }),
  ];

  // BUG-73: verdictInfoForScenario is THE margin computation — never a
  // locally-inlined Infinity/depletion branch.
  const verdictInfo = verdictInfoForScenario(scenario, safeLifeExp);

  return {
    changed,
    chart: scenario.chart,
    metrics,
    verdict: verdictInfo.verdict,
    verdictInfo,
    scenarioStats: {
      scenarioRetAge: scenario.scenarioRetAge,
      scenarioExpenses: scenario.scenarioExpenses,
      scenarioTotalAtRet: scenario.scenarioTotalAtRet,
      scenarioYears: scenario.scenarioYears,
      scenarioBalAt90: scenario.scenarioBalAt90,
    },
  };
}

// Entries cap shared by buildLeverRail and buildDurationRail — a slider tick
// rail with more than this many points has no visual value and would just be
// extra model runs; both coarsen their step to fit rather than truncate the
// range (so the rail still spans min..max / the full duration).
const RAIL_MAX_ENTRIES = 80;

// ── buildLeverRail ───────────────────────────────────────────────────────────
// A verdict at every step of a lever's range, for the colored tick rail under
// a Plan/Ideas slider (e.g. "which retirement ages are still comfortable").
// One calcWhatIfScenario run per step — never a special-cased walk (BUG-31
// rule; the model is 1-2ms/run so this is cheap even at the entry cap).
//
// lever: a key in the LEVERS table (today: "retirementAge" | "monthlyExpenses")
// — which override each step sets. Guards (invalid bundle, min > max,
// step <= 0, unrecognized lever) return [].
//
// Returns [{ value, verdict }] — verdict is per-step, using THAT step's own
// scenario retirement age for the plan horizon (so a retirementAge rail's
// verdict reflects retiring at that step's age, not the current plan's).
export function buildLeverRail(bundle, { lever, min, max, step } = {}) {
  if (!bundle) return [];
  const leverDef = LEVERS[lever];
  if (!leverDef) return [];
  if (!(min <= max) || !(step > 0)) return [];

  const rawCount = Math.floor((max - min) / step + 1e-9) + 1;
  const count = Math.min(rawCount, RAIL_MAX_ENTRIES);
  // Coarsen the step to fit the cap while still spanning min..max exactly.
  const effStep = count === rawCount ? step : (max - min) / (count - 1);

  const { safeLifeExp } = bundle;
  const rail = [];
  for (let i = 0; i < count; i++) {
    const raw = min + i * effStep;
    const value = leverDef.round(raw);
    const overrides = { [leverDef.overrideKey]: value };
    const scenario = calcWhatIfScenario(bundle, overrides);
    if (!scenario) continue;
    // BUG-73: marginForScenario is THE margin computation (same one
    // evaluateLifeEvent/buildLeverPreview use) — never a locally-inlined
    // Infinity/depletion branch. verdictForScenarioResult also applies the
    // BUG-74 unfundable-event override, so a tick can't disagree with the card.
    rail.push({ value, verdict: verdictForScenarioResult(scenario, safeLifeExp) });
  }
  return rail;
}

// ── buildDurationRail ────────────────────────────────────────────────────────
// A verdict at every duration step for the LifeEventSheet's "how many months"
// slider — lets the sheet show a tick rail alongside the live verdict card.
// One calcWhatIfScenario run per step (scenarioEvents: [candidate]); the plan
// horizon is the CURRENT plan's (safeLifeExp − safeRetAge — the event never
// moves the retirement age), matching evaluateLifeEvent's own margin formula
// exactly so a rail entry and evaluateLifeEvent's verdict for the same months
// can never disagree.
//
// eventBase: the candidate event's fields minus durationMonths (must carry
//   monthlyAmount/age/isInflow — the same shape evaluateLifeEvent takes for a
//   duration event); durationMonths is set per-step here. When eventBase.id
//   matches a COMMITTED event (edit mode), that id is excluded from every
//   step's run — mirroring evaluateLifeEvent's own excludeEventId use — so an
//   edited event's rail can't price the original alongside the edited
//   candidate (the same double-count H1 fixed for the verdict card).
// Guards (invalid bundle, missing eventBase, maxMonths <= 0, step <= 0)
// return [].
//
// Returns [{ months, verdict }] for months = step, 2*step, … up to maxMonths
// (coarsened to fit the RAIL_MAX_ENTRIES cap, same as buildLeverRail).
export function buildDurationRail(bundle, eventBase, { maxMonths, step = 1 } = {}) {
  if (!bundle || !eventBase) return [];
  if (!(maxMonths > 0) || !(step > 0)) return [];

  const rawCount = Math.floor(maxMonths / step + 1e-9);
  if (rawCount <= 0) return [];
  const count = Math.min(rawCount, RAIL_MAX_ENTRIES);
  // Coarsen the step to fit the cap while still spanning up to maxMonths.
  const effStep = count === rawCount ? step : maxMonths / count;

  const { safeLifeExp } = bundle;

  const rail = [];
  for (let i = 1; i <= count; i++) {
    const months = Math.round(i * effStep);
    const candidate = { ...eventBase, durationMonths: months };
    const scenario = calcWhatIfScenario(bundle, {
      scenarioEvents: [candidate],
      ...(eventBase.id != null ? { excludeEventId: eventBase.id } : {}),
    });
    if (!scenario) continue;
    // BUG-73: marginForScenario anchors on scenario.scenarioRetAge, which
    // equals bundle.safeRetAge here (a duration event never overrides the
    // retirement age) — identical to the old local planHorizon, so this is
    // the same margin evaluateLifeEvent computes for the same candidate.
    // verdictForScenarioResult also applies the BUG-74 unfundable-event
    // override, so a tick can't disagree with the verdict card.
    rail.push({ months, verdict: verdictForScenarioResult(scenario, safeLifeExp) });
  }
  return rail;
}
