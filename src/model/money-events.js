// One-time money events: windfalls, large purchases, inheritances, etc.
// Each event: { label, amount, age, isInflow, isTaxable }
//   amount   — absolute dollar value (always positive)
//   isInflow — true = money coming in (inheritance, bonus); false = going out (car, home down payment)
//   isTaxable — true = inflow is ordinary income that year (e.g. traditional IRA distribution)
//
// applyMoneyEvents is the ONE source for an event's per-year effect. It returns the
// net portfolio adjustment AND any additional taxable income for that age, so the
// caller can incorporate both without this module knowing the caller's data model.
// Used by the retirement engine (buildRetirementWalkByAccount), which taxes
// `taxableIncomeAdjustment` as ordinary income on the SS/pension floor.
// NOTE: runSimulation (accumulation) and the blended what-if walk still inline only
// the portfolio sign and do NOT yet charge event income tax — tracked as BUG-36.

export function applyMoneyEvents(events, age) {
  let portfolioAdjustment = 0;
  let taxableIncomeAdjustment = 0;

  for (const ev of events) {
    if (ev.age !== age) continue;
    const signed = ev.isInflow ? Math.abs(ev.amount) : -Math.abs(ev.amount);
    portfolioAdjustment += signed;
    if (ev.isInflow && ev.isTaxable) taxableIncomeAdjustment += Math.abs(ev.amount);
  }

  return { portfolioAdjustment, taxableIncomeAdjustment };
}

// Convenience: total net portfolio impact of all events across all ages.
// Useful for quick sanity checks in tests.
export function totalEventImpact(events) {
  return events.reduce((s, ev) => s + (ev.isInflow ? Math.abs(ev.amount) : -Math.abs(ev.amount)), 0);
}
