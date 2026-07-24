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

// clamp(v, min, max) — constrain `v` to the [min, max] range. ONE definition so
// the ~20 inline `Math.min(hi, Math.max(lo, v))` / `Math.max(lo, Math.min(hi, v))`
// sites stop disagreeing: the two operand orders diverge exactly when min > max
// (a corner this repo has hit twice — the ssClaimingAge min>max review fix and
// BUG-63), so this normalizes min > max to `min` winning (the lower bound is the
// hard floor — matches what the age-bound sites intend).
export function clamp(v, min, max) {
  if (min > max) return min;
  return Math.min(max, Math.max(min, v));
}
