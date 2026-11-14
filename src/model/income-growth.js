// The ONE resolver for the "income plateau" rule (BUG-155/156). Pure, no imports.
//
// `incomeGrowthEndAge` (null = grows until retirement) used to be resolved
// independently at four sites (calcAIME, projectedIncomeAtAge, and runSimulation's
// growthYears + clockYears); two lacked the negative guard and the spouse's sim
// received it in the WRONG age frame. They all call this now.
//
// CONVENTION (documented in docs/FINANCIAL-MODEL.md): a salary is the base income
// compounded by the number of raise steps taken BEFORE that year. The first working year
// (the one after the current year, age currentAge+1) has 0 steps; each later year has one
// more. A plateau at age N caps the step count at (N - currentAge), so a salary in the year
// the person turns a has min(a - currentAge - 1, N - currentAge) raises. Always floored at
// 0: income is never discounted BACKWARD (a stale/past plateau means "no growth yet").
//
// `rawSteps` is the un-plateaued step count (calcAIME's loop index y, runSimulation's
// y-1 or pause-aware growth clock, projectedIncomeAtAge's age-currentAge-1) — these are
// the SAME quantity, so the SS earnings record and the projected-salary table agree.
// `subjectCurrentAge` must be the age frame the plateau is expressed in (see
// plateauAgeInFrame to convert between two people's frames).
export function incomeGrowthSteps(rawSteps, plateauAge, subjectCurrentAge) {
  const capped = plateauAge != null
    ? Math.min(rawSteps, plateauAge - subjectCurrentAge)
    : rawSteps;
  return Math.max(0, capped);
}

// Re-express an age from one person's frame in another's, keeping the SAME calendar year:
// (plateauAge - fromCurrentAge) years from now is (result - toCurrentAge) years from now.
// null passes through (no plateau).
export function plateauAgeInFrame(plateauAge, fromCurrentAge, toCurrentAge) {
  if (plateauAge == null) return null;
  return plateauAge - fromCurrentAge + toCurrentAge;
}

// Keeps a STORED plateau age valid when current/retirement age change:
// within [currentAge + 1, retirementAge), else null. A plateau at/after retirement is
// the same thing as "no plateau" (the bundle's own setter already snaps it to null);
// one at/before the current age is lifted to currentAge + 1 (its own `min`).
export function clampIncomePlateauAge(plateauAge, currentAge, retirementAge) {
  if (plateauAge == null) return null;
  if (plateauAge >= retirementAge) return null;
  const lo = currentAge + 1;
  if (lo >= retirementAge) return null;
  return plateauAge < lo ? lo : plateauAge;
}
