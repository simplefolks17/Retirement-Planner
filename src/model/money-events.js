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
//     incomeAnnual   — optional $/year of offsetting income while the event runs
//                      (e.g. "income while traveling"); always an INFLOW component,
//                      prorated by the months active that year. Duration events are
//                      never taxed (known simplification, same scope as BUG-36 —
//                      the isTaxable flag applies to one-time inflows only).
//
// An event is a duration event when durationMonths > 0 AND monthlyAmount is a
// finite number — see isDurationEvent. Everything else is one-time.
//
// applyMoneyEvents is the ONE source for an event's per-year effect. It returns the
// net portfolio adjustment AND any additional taxable income for that age, so the
// caller can incorporate both without this module knowing the caller's data model.
// Used by the retirement engine (buildRetirementWalkByAccount), runSimulation, and
// the blended what-if walk (buildRetirementDrawdown) — all three consume
// eventNetForYear through this module, so year-splitting can never diverge.
// NOTE: runSimulation (accumulation) and the blended what-if walk still use only
// the portfolio sign and do NOT charge event income tax — tracked as BUG-36.

export function isDurationEvent(ev) {
  return (ev?.durationMonths ?? 0) > 0 && Number.isFinite(ev?.monthlyAmount);
}

// Months of a duration event that fall inside the year the person is `age`.
// Year k (k = age − ev.age, 0-based) covers months [12k, 12k+12).
function monthsActiveInYear(ev, age) {
  const k = age - ev.age;
  if (k < 0) return 0;
  return Math.max(0, Math.min(12, ev.durationMonths - 12 * k));
}

// Signed net portfolio impact of ONE event in the given age-year.
// One-time: ±amount when ev.age === age. Duration: ±(months × monthly)
// plus the prorated income offset (always an inflow).
export function eventNetForYear(ev, age) {
  if (!ev) return 0;
  if (isDurationEvent(ev)) {
    const months = monthsActiveInYear(ev, age);
    if (months <= 0) return 0;
    const monthly = Math.abs(ev.monthlyAmount);
    const income  = Number.isFinite(ev.incomeAnnual) ? Math.abs(ev.incomeAnnual) : 0;
    const signed  = (ev.isInflow ? 1 : -1) * months * monthly;
    return signed + (months / 12) * income;
  }
  if (ev.age !== age || !Number.isFinite(ev.amount)) return 0;
  return ev.isInflow ? Math.abs(ev.amount) : -Math.abs(ev.amount);
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

// Signed net portfolio impact across ALL years of the event.
export function eventNetTotal(ev) {
  if (!ev) return 0;
  if (!isDurationEvent(ev)) return eventNetForYear(ev, ev.age);
  let sum = 0;
  for (let age = eventFirstAge(ev); age <= eventLastAge(ev); age++) {
    sum += eventNetForYear(ev, age);
  }
  return sum;
}

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
