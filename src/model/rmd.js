import { RMD_START_AGE, RMD_TABLE3, RMD_TABLE2 } from "../config/irs-2026.js";

// Helper: returns the RMD divisor for a given owner age and optional spouse age.
function getDivisor(ownerAge, useTable2, spouseAge) {
  let divisor = null;
  if (useTable2) {
    divisor = RMD_TABLE2[ownerAge]?.[spouseAge] ?? null;
  }
  if (divisor === null) divisor = RMD_TABLE3[ownerAge] ?? null;
  return divisor;
}

// Returns array of RMD rows from retirement through life expectancy.
// tradGrossAtRetirement: pre-tax 401k balance at the retirement snapshot.
// useTable2: true when married + spouse is sole beneficiary + spouse > 10 yrs younger.
// spouseCurrentAge / currentAge: used to compute spouse age in future years.
export function calcRMDProjection({
  tradGrossAtRetirement,
  safeRetAge,
  safeLifeExp,
  returnRate,
  useTable2,
  spouseCurrentAge,
  currentAge,
}) {
  const r = returnRate / 100;
  const result = [];
  let bal = tradGrossAtRetirement;

  // If retiring at or after RMD_START_AGE, the retirement year itself requires an RMD
  if (safeRetAge >= RMD_START_AGE) {
    const sAge0 = useTable2 ? Math.round(spouseCurrentAge + (safeRetAge - currentAge)) : null;
    const d0 = getDivisor(safeRetAge, useTable2, sAge0);
    const rmd0 = d0 ? Math.round(bal / d0) : 0;
    if (d0) bal -= rmd0;
    result.push({ age: safeRetAge, rmd: rmd0, bal: Math.round(bal), required: !!d0, divisor: d0 });
  }

  for (let age = safeRetAge + 1; age <= safeLifeExp; age++) {
    bal = bal * (1 + r);
    const sAge = useTable2 ? Math.round(spouseCurrentAge + (age - currentAge)) : null;
    const divisor = getDivisor(age, useTable2, sAge);
    const rmd = divisor ? Math.round(bal / divisor) : 0;
    if (divisor) bal -= rmd;
    result.push({ age, rmd, bal: Math.round(bal), required: !!divisor, divisor });
  }

  return result.filter(d => d.age >= RMD_START_AGE);
}

// Returns RMD rows using the post-conversion 401k balance (tradBal73) starting at RMD_START_AGE.
// Falls through to rmdData unchanged if conversionWindowYrs is 0.
export function calcRMDPostConversion({
  conversionWindowYrs,
  rmdData,
  tradBal73,
  safeLifeExp,
  returnRate,
  useTable2,
  spouseCurrentAge,
  currentAge,
}) {
  if (conversionWindowYrs === 0) return rmdData;

  const r = returnRate / 100;
  const result = [];
  let bal = tradBal73;

  for (let age = RMD_START_AGE; age <= safeLifeExp; age++) {
    // tradBal73 already represents the balance AT age 73 (calcConversionSim applies
    // a final year of growth to reach 73), so the first RMD year must NOT grow again —
    // only ages after RMD_START_AGE compound. Growing in the first iteration double-
    // counted a year of return, inflating every post-conversion RMD by ~one year's
    // growth and shifting the whole schedule forward by one year (see BUG-27).
    if (age > RMD_START_AGE) bal = bal * (1 + r);
    const sAge = useTable2 ? Math.round(spouseCurrentAge + (age - currentAge)) : null;
    const divisor = getDivisor(age, useTable2, sAge);
    const rmd = divisor ? Math.round(bal / divisor) : 0;
    if (divisor) bal -= rmd;
    result.push({ age, rmd, bal: Math.round(bal), required: !!divisor, divisor });
  }

  return result.filter(d => d.age >= RMD_START_AGE);
}
