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
//   Duration  { label, monthlyAmount, durationMonths, age, isInflow, incomeAnnual }
//     monthlyAmount  — absolute $/month while the event runs (always positive)
//     durationMonths — how many months it runs, starting at the year the user
//                      turns `age` (months are allocated year by year: the first
//                      12 months land in the `age` year, the next 12 in `age`+1, …)
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
//                      months active — the pre-existing, unchanged behavior.
//                      Undefined/non-finite incomeAnnual = "no statement about
//                      income" = no salary replacement, no offset (legacy events).
//
// An event is a duration event when durationMonths > 0 AND monthlyAmount is a
// finite number — see isDurationEvent. Everything else is one-time.
//
// ── NO-DOUBLE-COUNT RULE ──────────────────────────────────────────────────────
// Each event month's incomeAnnual counts exactly once, in exactly one channel:
//   - Months landing in a runSimulation (accumulation) year flow through the
//     SALARY channel: eventsIncomeAdjustment() replaces/adjusts that year's
//     wages (taxed, MAGI'd, contribution-scaled) — runSimulation excludes the
//     income term from its portfolio adjustment by using eventAmountForYear
//     (not eventNetForYear) for the taxable-account event line.
//   - Months landing in a retirement-walk year flow through the PORTFOLIO
//     channel: eventNetForYear's income term (there's no salary to replace).
// A duration event spanning the retirement boundary splits by month exactly as
// spend already does (eventFirstAge/eventLastAge): the sim owns months through
// the retirement-age row, the retirement walks own retAge+1 onward — so a
// boundary-spanning event's income is never double-counted or dropped.
//
// applyMoneyEvents is the ONE source for a RETIREMENT-WALK year's per-event effect
// (it still uses eventNetForYear — the additive/portfolio-channel basis). It
// returns the net portfolio adjustment AND any additional taxable income for that
// age, so the caller can incorporate both without this module knowing the
// caller's data model. Used by the retirement engine (buildRetirementWalkByAccount)
// and the blended what-if walk (buildRetirementDrawdown). runSimulation does NOT
// use applyMoneyEvents/eventNetForYear for its portfolio line — it uses
// eventAmountForYear (income excluded, see the salary channel above) plus
// eventsIncomeAdjustment() for the income/contribution-scaling side.
// NOTE: the blended what-if walk still does NOT charge event income tax on
// one-time taxable inflows outside applyMoneyEvents's own path — tracked as BUG-36.

export function isDurationEvent(ev) {
  return (ev?.durationMonths ?? 0) > 0 && Number.isFinite(ev?.monthlyAmount);
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
  return Math.max(0, Math.min(12, ev.durationMonths - 12 * k));
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
    return (ev.isInflow ? 1 : -1) * months * monthly;
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
  return (months / 12) * Math.abs(ev.incomeAnnual);
}

// Signed net portfolio impact of ONE event in the given age-year — the
// RETIREMENT-WALK basis (portfolio channel + income channel combined, since
// there's no salary there to replace). Literally the sum of the two channels
// above; kept as one function so existing retirement-walk callers (applyMoneyEvents,
// the per-account engine) don't need to change.
export function eventNetForYear(ev, age) {
  return eventAmountForYear(ev, age) + eventIncomeForYear(ev, age);
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
    if (!isDurationEvent(ev) || ev.isInflow !== false || !Number.isFinite(ev.incomeAnnual)) continue;
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
  if (isDurationEvent(ev)) return ev.age + Math.ceil(ev.durationMonths / 12) - 1;
  return ev.age;
}

// Gross size of the event itself, before any income offset (display: "Total: $X").
export function eventGrossCost(ev) {
  if (isDurationEvent(ev)) return Math.abs(ev.monthlyAmount) * ev.durationMonths;
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
    // Taxable-income flag: one-time taxable inflows only (duration events are
    // untaxed by design — documented simplification above).
    if (!isDurationEvent(ev) && ev.age === age && ev.isInflow && ev.isTaxable) {
      taxableIncomeAdjustment += Math.abs(ev.amount);
    }
  }

  return { portfolioAdjustment, taxableIncomeAdjustment };
}

// Convenience: total net portfolio impact of all events across all ages.
// Useful for quick sanity checks in tests.
export function totalEventImpact(events) {
  return events.reduce((s, ev) => s + eventNetTotal(ev), 0);
}
