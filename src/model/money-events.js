// One-time money events: windfalls, large purchases, inheritances, etc.
// Each event: { label, amount, age, isInflow, isTaxable }
//   amount   — absolute dollar value (always positive)
//   isInflow — true = money coming in (inheritance, bonus); false = going out (car, home down payment)
//   isTaxable — true = inflow is ordinary income that year (e.g. traditional IRA distribution)
//
// applyMoneyEvents is called per-year inside runSimulation (accumulation) and
// buildRetirementDrawdown (retirement). It returns the net portfolio adjustment
// and any additional taxable income for that age so the caller can incorporate
// both effects without this module knowing the caller's data model.

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
