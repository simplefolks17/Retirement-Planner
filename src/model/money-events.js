import { ASSUMPTIONS } from "../config/irs-2026.js";

// Money events: windfalls, large purchases, inheritances, travel years, sabbaticals.
//
// TWO kinds share one event shape (kind is inferred, never stored):
//
//   One-time  { label, amount, age, isInflow, isTaxable }
//     amount   — absolute dollar value (always positive)
//     isInflow — true = money coming in (inheritance, bonus); false = going out
//     isTaxable — true = inflow is ordinary income that year (e.g. trad IRA distribution)
//
//   Duration  { label, monthlyAmount, durationMonths, age, isInflow, incomeAnnual,
//                growthPct, untilAge }
//     monthlyAmount  — absolute $/month while the event runs (always positive)
//     durationMonths — how many months it runs, starting at the year the user
//                      turns `age` (months are allocated year by year: the first
//                      12 months land in the `age` year, the next 12 in `age`+1, …)
//     untilAge       — optional OPEN-ENDED alternative to durationMonths: "runs
//                      through the year the person turns `untilAge`" (inclusive).
//                      Resolved to an equivalent month count by spanMonths():
//                      (untilAge − age + 1) × 12. When BOTH durationMonths and
//                      untilAge are present, untilAge WINS (spanMonths prefers
//                      it) — this is how a UI migrates a fixed-length event to
//                      "rest of plan" (untilAge = plan horizon) without touching
//                      durationMonths. untilAge < age resolves to 0 months (not
//                      a duration event at all — degenerate/invalid input).
//                      Legacy events (no untilAge) are byte-identical: spanMonths
//                      falls through to the existing `durationMonths ?? 0`. The
//                      walks themselves stop at their own endAge, so an
//                      open-ended event is naturally bounded by the plan horizon
//                      with no clamp needed in this module.
//     isInflow       — direction of the monthly amount (travel spend = false,
//                      part-time income = false→true)
//     incomeAnnual   — optional $/year of TOTAL income during the event (OWNER
//                      DECISION, this slice): "my total income during this period",
//                      not a bolt-on add-on. Only meaningful for outflow duration
//                      events in a WORKING year — it REPLACES salary for the
//                      months the event runs (0 = sabbatical: no salary, no
//                      401k/match/HSA/Roth/taxable payroll contributions, lower
//                      MAGI; equal to salary = no change, the old inert default).
//                      In RETIREMENT-walk years there is no salary to replace, so
//                      incomeAnnual is additive side income there, prorated by the
//                      months active — the pre-existing, unchanged behavior. As of
//                      this slice that retirement-phase income term is ALSO fed
//                      into applyMoneyEvents's taxableIncomeAdjustment (see below)
//                      — it's real ordinary income (e.g. part-time work) and is
//                      now taxed once, stacked on the SS/pension floor, narrowing
//                      BUG-36. Undefined/non-finite incomeAnnual = "no statement
//                      about income" = no salary replacement, no offset, no tax
//                      (legacy events).
//     growthPct      — optional annual escalation PERCENT applied to BOTH the
//                      monthly spend/income and the incomeAnnual term (e.g. 3 =
//                      3%/yr cost-of-living bump on a long-running event). 0,
//                      absent, or non-finite = flat/no escalation (legacy
//                      events are byte-identical). Compounds once per WHOLE
//                      year offset from the event's start age (k = age −
//                      ev.age; factor = (1 + growthPct/100)^k, k ≤ 0 → 1×) —
//                      see growthFactorForAge. One-time events ignore
//                      growthPct entirely (a single occurrence has nothing to
//                      escalate against).
//
// An event is a duration event when its resolved span (spanMonths — prefers
// untilAge, else durationMonths) is > 0 AND monthlyAmount is a finite number —
// see isDurationEvent. Everything else is one-time.
//
// ── NO-DOUBLE-COUNT RULE ──────────────────────────────────────────────────────
// Each event month's incomeAnnual counts exactly once, in exactly one channel:
//   - Months landing in a runSimulation (accumulation) year flow through the
//     SALARY channel: eventsIncomeAdjustment() replaces/adjusts that year's
//     wages (taxed, MAGI'd, contribution-scaled) — runSimulation excludes the
//     income term from its portfolio adjustment by using eventAmountForYear
//     (not eventNetForYear) for the taxable-account event line.
//   - Months landing in a retirement-walk year flow through the PORTFOLIO
//     channel: eventNetForYear's income term (there's no salary to replace),
//     AND — as of this slice — through the TAX channel: applyMoneyEvents adds
//     that same income term to taxableIncomeAdjustment, so it's taxed once as
//     ordinary income stacked on the SS/pension floor (via the engine's
//     inflowTax), not received tax-free.
// A duration event spanning the retirement boundary splits by month exactly as
// spend already does (eventFirstAge/eventLastAge): the sim owns months through
// the retirement-age row, the retirement walks own retAge+1 onward — so a
// boundary-spanning event's income is never double-counted or dropped.
//
// applyMoneyEvents is the ONE source for a RETIREMENT-WALK year's per-event effect
// (it still uses eventNetForYear — the additive/portfolio-channel basis — for the
// portfolio adjustment). It returns the net portfolio adjustment AND any
// additional taxable income for that age (one-time flagged-taxable inflows PLUS,
// as of this slice, every event's own prorated income term), so the caller can
// incorporate both without this module knowing the caller's data model. Used by
// the retirement engine (buildRetirementWalkByAccount) and the blended what-if
// walk (buildRetirementDrawdown). runSimulation does NOT use
// applyMoneyEvents/eventNetForYear for its portfolio line — it uses
// eventAmountForYear (income excluded, see the salary channel above) plus
// eventsIncomeAdjustment() for the income/contribution-scaling side.
// NOTE: the blended what-if walk still does NOT charge event income tax on
// one-time taxable inflows outside applyMoneyEvents's own path — tracked as BUG-36.

// Resolves a duration event's span in months, preferring the open-ended
// `untilAge` over the fixed `durationMonths` when both are present (see the
// module header). Module-internal — callers use isDurationEvent /
// monthsActiveInYear / eventLastAge / eventGrossCost, not this directly.
function spanMonths(ev) {
  if (Number.isFinite(ev?.untilAge)) {
    return Math.max(0, (ev.untilAge - ev.age + 1) * 12);
  }
  return ev?.durationMonths ?? 0;
}

// Per-year escalation factor for a duration event's dollar terms. k is the
// whole-year offset from the event's start age (k=0 at the start year, no
// escalation yet). Absent/zero/non-finite growthPct → 1× at every age
// (byte-identical to the pre-growth behavior). Module-internal.
function growthFactorForAge(ev, age) {
  const g = ev?.growthPct;
  if (!Number.isFinite(g) || g === 0) return 1;
  const k = age - ev.age;
  if (k <= 0) return 1;
  return Math.pow(1 + g / 100, k);
}

export function isDurationEvent(ev) {
  return spanMonths(ev) > 0 && Number.isFinite(ev?.monthlyAmount);
}

// THE one predicate for "this event replaces salary during working years":
// a duration OUTFLOW (isInflow falsy — undefined signs as an outflow in
// eventAmountForYear, so it must gate as an outflow here too) with a finite
// incomeAnnual. Shared by eventsIncomeAdjustment (the sim's salary channel),
// eventSimAdjustmentForYear (the sim's portfolio line), and what-if.js's
// eventIncomeImpact (the sheet's lost-income bullet) so the three can never
// disagree about which events suppress income (Fable review, PR #53).
export function isIncomeReplacingEvent(ev) {
  return isDurationEvent(ev) && !ev.isInflow && Number.isFinite(ev.incomeAnnual);
}

// Months of a duration event that fall inside the year the person is `age`.
// Year k (k = age − ev.age, 0-based) covers months [12k, 12k+12).
// Exported (layout-internal): used by eventIncomeImpact (what-if.js) to walk
// the same per-year month split as eventIncomeForYear, but needs the raw
// months count (not the incomeAnnual-scaled dollar figure) to compute the
// "usual pay" side of the comparison.
export function monthsActiveInYear(ev, age) {
  const k = age - ev.age;
  if (k < 0) return 0;
  return Math.max(0, Math.min(12, spanMonths(ev) - 12 * k));
}

// The event's OWN signed cash for the year, EXCLUDING the incomeAnnual term.
// One-time: ±amount when ev.age === age. Duration: ±(months × monthly).
// This is the portfolio-channel amount runSimulation charges directly — the
// income term is handled separately by the salary channel (see module header).
export function eventAmountForYear(ev, age) {
  if (!ev) return 0;
  if (isDurationEvent(ev)) {
    const months = monthsActiveInYear(ev, age);
    if (months <= 0) return 0;
    const monthly = Math.abs(ev.monthlyAmount);
    return (ev.isInflow ? 1 : -1) * months * monthly * growthFactorForAge(ev, age);
  }
  if (ev.age !== age || !Number.isFinite(ev.amount)) return 0;
  return ev.isInflow ? Math.abs(ev.amount) : -Math.abs(ev.amount);
}

// The prorated event-period income (always ≥ 0): (months/12) × |incomeAnnual|
// for duration events with a finite incomeAnnual, else 0. One-time events never
// carry an income term.
export function eventIncomeForYear(ev, age) {
  if (!ev || !isDurationEvent(ev) || !Number.isFinite(ev.incomeAnnual)) return 0;
  const months = monthsActiveInYear(ev, age);
  if (months <= 0) return 0;
  return (months / 12) * Math.abs(ev.incomeAnnual) * growthFactorForAge(ev, age);
}

// Signed net portfolio impact of ONE event in the given age-year — the
// RETIREMENT-WALK basis (portfolio channel + income channel combined, since
// there's no salary there to replace). Literally the sum of the two channels
// above; kept as one function so existing retirement-walk callers (applyMoneyEvents,
// the per-account engine) don't need to change.
export function eventNetForYear(ev, age) {
  return eventAmountForYear(ev, age) + eventIncomeForYear(ev, age);
}

// The runSimulation (accumulation-year) portfolio line for ONE event: the
// event's own cash, PLUS the income term for events that do NOT replace salary
// (duration INFLOW income, e.g. "Part-time at 60" side pay — additive cash that
// has no salary channel to travel through). Income-replacing events exclude the
// income term here because eventsIncomeAdjustment routes it through the salary
// channel instead — this pair of functions IS the no-double-count rule for sim
// years. (Fable review, PR #53: using bare eventAmountForYear dropped a duration
// inflow's incomeAnnual in sim years while retirement walks still credited it.)
export function eventSimAdjustmentForYear(ev, age) {
  return eventAmountForYear(ev, age)
    + (isIncomeReplacingEvent(ev) ? 0 : eventIncomeForYear(ev, age));
}

// Working-year (runSimulation) income-replacement adjustment for one age-year.
// Qualifying events: duration events with isInflow === false AND a finite
// incomeAnnual (duration INFLOW events — e.g. "Part-time at 60" income — stay
// additive side cash via the portfolio channel; one-time events never touch
// income; undefined incomeAnnual = legacy event = no statement about income =
// doesn't qualify, same net math as before this feature).
//   pausedMonths — Σ months active across qualifying events, capped at 12 (you
//                  can't pause more than a year of salary in one year — the
//                  simplest honest overlap rule for multiple concurrent events).
//   workedFrac   — 1 − pausedMonths/12.
//   eventIncome  — Σ prorated incomeAnnual across the SAME qualifying events,
//                  UNCAPPED (incomes add — they're real dollars, unlike the
//                  paused-months clock).
export function eventsIncomeAdjustment(events = [], age) {
  let pausedMonths = 0;
  let eventIncome = 0;
  for (const ev of events) {
    if (!isIncomeReplacingEvent(ev)) continue;
    pausedMonths += monthsActiveInYear(ev, age);
    eventIncome += eventIncomeForYear(ev, age);
  }
  pausedMonths = Math.min(12, pausedMonths);
  return { pausedMonths, workedFrac: 1 - pausedMonths / 12, eventIncome };
}

// First / last age-year in which an event has any effect. Used by the phase
// filters (App.jsx retPhaseBase/retDrawShared, what-if.js accum/ret splits) so
// a duration event spanning the retirement boundary reaches BOTH walks — each
// walk then applies only the years inside its own age range via eventNetForYear.
export function eventFirstAge(ev) {
  return ev.age;
}
export function eventLastAge(ev) {
  if (isDurationEvent(ev)) return ev.age + Math.ceil(spanMonths(ev) / 12) - 1;
  return ev.age;
}

// Gross size of the event itself, before any income offset (display: "Total: $X").
// Duration events sum per active YEAR (not a flat monthly × months) so growthPct
// escalation is reflected in the total; flat/no-growth events reduce to the
// same monthly × totalMonths figure as before (growthFactorForAge is 1× there).
export function eventGrossCost(ev) {
  if (isDurationEvent(ev)) {
    let sum = 0;
    for (let age = eventFirstAge(ev); age <= eventLastAge(ev); age++) {
      const months = monthsActiveInYear(ev, age);
      sum += months * Math.abs(ev.monthlyAmount) * growthFactorForAge(ev, age);
    }
    return sum;
  }
  return Number.isFinite(ev?.amount) ? Math.abs(ev.amount) : 0;
}

// Signed net portfolio impact across ALL years of the event — the CASH-FLOW
// net on the retirement-walk basis (eventNetForYear, portfolio + income
// channels combined). For a working-year event this is NOT the same as its
// portfolio delta in runSimulation: the sim charges lost salary through the
// separate salary channel (eventsIncomeAdjustment), not through this total.
// Formula unchanged by the income-replacement feature — still the plain sum.
export function eventNetTotal(ev) {
  if (!ev) return 0;
  if (!isDurationEvent(ev)) return eventNetForYear(ev, ev.age);
  let sum = 0;
  for (let age = eventFirstAge(ev); age <= eventLastAge(ev); age++) {
    sum += eventNetForYear(ev, age);
  }
  return sum;
}

// Max number of one-time/duration events a user can add — re-exported from
// ASSUMPTIONS (irs-2026.js, rule 1) so this file's existing import sites
// (MoneyEventsPanel, eventsView) don't need to change.
export const MAX_MONEY_EVENTS = ASSUMPTIONS.MAX_MONEY_EVENTS;

export function applyMoneyEvents(events = [], age) {
  let portfolioAdjustment = 0;
  let taxableIncomeAdjustment = 0;

  for (const ev of events) {
    portfolioAdjustment += eventNetForYear(ev, age);
    // Taxable-income flag: one-time taxable inflows (e.g. an inherited
    // pre-tax IRA distribution, flagged isTaxable).
    if (!isDurationEvent(ev) && ev.age === age && ev.isInflow && ev.isTaxable) {
      taxableIncomeAdjustment += Math.abs(ev.amount);
    }
    // Every event's own prorated income term (duration-event side income,
    // e.g. part-time work) is real ordinary income in a retirement-walk
    // year — tax it once, stacked on the SS/pension floor (narrows BUG-36;
    // see the module header's NO-DOUBLE-COUNT RULE). Zero for one-time
    // events and for duration events with no/zero incomeAnnual.
    taxableIncomeAdjustment += eventIncomeForYear(ev, age);
  }

  return { portfolioAdjustment, taxableIncomeAdjustment };
}

// Convenience: total net portfolio impact of all events across all ages.
// Useful for quick sanity checks in tests.
export function totalEventImpact(events) {
  return events.reduce((s, ev) => s + eventNetTotal(ev), 0);
}
