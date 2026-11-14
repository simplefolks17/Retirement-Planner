// Pre-retirement one-time Roth conversions: { id, age, amount }.
//   amount — pre-tax dollars moved from the Traditional 401k to Roth that year.
//
// A conversion is fundamentally different from a money event (money-events.js): it is
// an INTERNAL transfer (trad → Roth principal) plus a one-time ordinary-income tax on
// the converted amount — NOT a portfolio inflow/outflow. Keeping it in its own helper
// avoids overloading applyMoneyEvents (the engine's "ONE source" for in/outflows) with
// transfer semantics a future caller could mistake for a taxable inflow.
//
// This helper only SUMS the amounts requested at a given age. The caller caps against
// the live Traditional balance, computes the tax on the year's income floor, applies
// any early-withdrawal penalty, and decides the tax-funding source — only the caller
// knows the balances and the wage floor.

// Lifetime cap on pre-retirement conversion events — sporadic by nature (a job
// change, a sabbatical, a handful of low-income years, not a recurring plan).
// Shared by the Classic panel (ConversionEventsPanel.jsx) and the Horizon
// conversion flow (WI-3.6) so the cap has ONE definition (the BUG-25 shape:
// two copies of the same constant drifting apart).
export const MAX_CONVERSION_EVENTS = 3;

export function applyConversionEvents(conversionEvents = [], age) {
  let convAmount = 0;
  for (const ev of conversionEvents) {
    const amount = Number(ev?.amount);
    if (ev?.age === age && Number.isFinite(amount)) convAmount += Math.max(0, amount);
  }
  return { convAmount };
}

// Convenience: total requested conversion across all events (pre-cap). Test sanity only.
export function totalConversionRequested(conversionEvents = []) {
  return conversionEvents.reduce((s, ev) => {
    const amount = Number(ev?.amount);
    return s + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
}

// BUG-175 (Opus review R-13): the ONE definition of "this working-year conversion event is
// outside the years the model converts in". Valid working years are strictly after today and
// strictly before retirement (the retirement-phase window owns >= retirement). App's
// `activeConversionEvents` filter and both UIs' per-row "not modelled" state read THIS, so a row
// can never show an event the model has silently dropped (a field displaying an input the model
// isn't using — BUG-161's class). The flag is AGE-only, not amount-gated: a $0 event stranded past
// retirement still sits outside its own range and still carries the "401k -> Roth" label, so it
// must be flagged too (BUG-185, review 2 S-9). The model's own filter (App's
// `activeConversionEvents`, what-if) still drops a $0 event, which is harmless.
export function conversionEventOutsideWorkingYears(ev, currentAge, safeRetAge) {
  const age = Number(ev?.age);
  return !(age >= currentAge + 1 && age <= safeRetAge - 1);
}
export function conversionEventNotModelled(ev, currentAge, safeRetAge) {
  return conversionEventOutsideWorkingYears(ev, currentAge, safeRetAge);
}
export const CONVERSION_EVENT_NOT_MODELLED_LABEL =
  "outside your working years — not modelled";
