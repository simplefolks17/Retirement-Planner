// Generic financial-math primitives. Pure, no config, no domain assumptions —
// safe for any module (CLIENT) to import.

// Future value of an ordinary annuity: contribute `annual` at the end of each year
// for `years` years, compounding at `rate` (a DECIMAL, e.g. 0.05 for 5%). Returns
// the raw float; callers round as they need. ONE definition so the what-if optimizer
// and the Mega-Backdoor growth display can't drift (they were separate copies of
// this same formula — the BUG-25 #4 "duplicated calc" shape).
export function fvAnnuity(annual, rate, years) {
  if (annual <= 0 || years <= 0) return 0;
  // Use the geometric annuity formula for ANY non-zero rate, including negative
  // real-return scenarios (rate < 0 still compounds — it shrinks). Only an exactly
  // zero rate degenerates to the linear `annual * years` (the formula's 0/0 limit).
  return rate !== 0
    ? annual * ((Math.pow(1 + rate, years) - 1) / rate)
    : annual * years;
}

// ── Retirement-year dollar basis (BUG-91) ───────────────────────────────────
//
// The retirement engine (retirement-engine.js) grows every account at
// rReal = (1+returnRate/100)/(1+inflationRate/100) - 1 — a REAL rate. BUG-90's
// own proof establishes what that means for the engine's balance UNIT: a seed
// grown at rReal for k years equals the nominal balance in that later year,
// deflated by (1+inflationRate/100)^k. So the walk (after the seed point) is
// denominated in the PRIMARY's RETIREMENT-YEAR purchasing power — a quantity
// entered/derived in TODAY's dollars (a user's stated living expenses, a
// pension quoted in today's terms) must be inflated FORWARD to that frame
// before it can be subtracted from, or compared against, a walk balance.
//
// toRetirementYearDollars: the one-time TODAY's-dollars → retirement-year-
// dollars conversion (always forward — yearsToRetirement clamped at 0, since
// "today" can never be after the retirement year for this purpose).
export function toRetirementYearDollars(todaysDollarAmount, inflationRate, yearsToRetirement) {
  const years = Math.max(0, yearsToRetirement);
  const infl = Number.isFinite(inflationRate) ? inflationRate / 100 : 0;
  if (!(1 + infl > 0)) return todaysDollarAmount; // guard a pathological rate
  return todaysDollarAmount * Math.pow(1 + infl, years);
}

// inflationRebaseFactor: re-bases a quantity ALREADY expressed in one
// reference year's dollars into a DIFFERENT reference year's dollars —
// unlike toRetirementYearDollars (which only ever inflates forward from
// "today"), yearsDiff may be NEGATIVE (an earlier reference year divides,
// it doesn't clamp to a no-op). Used by what-if scenarios that shift the
// retirement age: SS/pension figures already expressed in the base plan's
// retirement-year dollars need re-expressing in the scenario's own
// retirement-year dollars, which can be EARLIER than the base plan's.
export function inflationRebaseFactor(inflationRate, yearsDiff) {
  const infl = Number.isFinite(inflationRate) ? inflationRate / 100 : 0;
  if (!(1 + infl > 0)) return 1;
  return Math.pow(1 + infl, yearsDiff);
}
