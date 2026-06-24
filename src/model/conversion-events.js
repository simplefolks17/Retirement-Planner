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
