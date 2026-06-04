import {
  TRAD_401K_LIMIT_2026,
  CATCHUP_401K_2026,
  ROTH_IRA_LIMIT_2026,
  CATCHUP_ROTH_2026,
  HSA_LIMIT_2026,
  LIMIT_415C_2026,
  LIMIT_415C_CATCHUP_2026,
  CATCHUP_AGE,
  ROTH_PHASEOUT_2026,
} from "../config/irs-2026.js";
import { ltcgRate } from "./taxes.js";

// Runs the accumulation simulation.
// Returns an array of yearly rows from year 1 through totalYears.
// "Trad 401k" display normalization is computed in App.jsx using bracket-accurate rates;
// this function outputs tradGross (pre-tax balance) only.
// calcEmployerMatchFn: bound function (salary, employeeContrib) → match amount
export function runSimulation({
  totalYears,
  currentAge,
  currentIncome,
  incomeGrowth,
  filingStatus,
  spouseIncome,
  spouseIncomeGrowth,
  returnRate,
  bal401k, balRoth, balTaxable, balHSA,
  contrib401k, contribRoth, contribTaxable, contribHSA,
  contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
  calcEmployerMatchFn,
}) {
  let trad    = bal401k;
  let roth    = balRoth;
  let taxable = balTaxable;
  let hsa     = balHSA;

  const r = returnRate / 100;
  const g = incomeGrowth / 100;
  const arr = [];

  for (let y = 1; y <= totalYears; y++) {
    const age        = currentAge + y;
    const growFactor = Math.pow(1 + g, y - 1);

    const isEligibleForCatchup = currentAge + (y - 1) >= CATCHUP_AGE;
    const limit415cYr    = isEligibleForCatchup ? LIMIT_415C_CATCHUP_2026 : LIMIT_415C_2026;
    const electiveLimit  = isEligibleForCatchup
      ? TRAD_401K_LIMIT_2026 + CATCHUP_401K_2026
      : TRAD_401K_LIMIT_2026;

    const employeeDeferral = age <= contribEnd401k
      ? Math.min(contrib401k * growFactor, electiveLimit)
      : 0;
    const matchAmt = age <= contribEnd401k
      ? calcEmployerMatchFn(currentIncome * growFactor, employeeDeferral)
      : 0;
    const c401k = Math.min(employeeDeferral + matchAmt, limit415cYr);

    const cRoth = (() => {
      if (age > contribEndRoth || contribRoth <= 0) return 0;
      const rothCap = isEligibleForCatchup
        ? ROTH_IRA_LIMIT_2026 + CATCHUP_ROTH_2026
        : ROTH_IRA_LIMIT_2026;
      const baseContrib = Math.min(contribRoth, rothCap);
      const primaryMAGI = currentIncome * growFactor;
      const spouseMAGI  = spouseIncome * Math.pow(1 + spouseIncomeGrowth / 100, y - 1);
      // Only MFJ filers report combined income on one return; for every other
      // status the Roth phase-out is tested against the primary earner's MAGI
      // alone (spouse income/contributions are tracked separately). See CLAUDE.md rules 3 & 9.
      const yearMAGI    = filingStatus === "mfj" ? primaryMAGI + spouseMAGI : primaryMAGI;
      const po = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
      if (yearMAGI >= po.end) return 0;
      if (yearMAGI <= po.start) return baseContrib;
      const phasePct = (po.end - yearMAGI) / (po.end - po.start);
      return Math.round(baseContrib * phasePct);
    })();

    const cTaxable = age <= contribEndTaxable ? contribTaxable * growFactor : 0;
    const cHSA     = age <= contribEndHSA     ? Math.min(contribHSA, HSA_LIMIT_2026) : 0;

    trad = (trad + c401k) * (1 + r);
    roth = (roth + cRoth) * (1 + r);
    hsa  = (hsa  + cHSA)  * (1 + r);

    const ordinaryIncome = currentIncome * growFactor - employeeDeferral - cHSA;
    const capGainsRate   = ltcgRate(ordinaryIncome, filingStatus);
    taxable = (taxable + cTaxable) * (1 + r * (1 - capGainsRate));

    arr.push({
      age,
      "Roth IRA":  Math.round(roth),
      "Taxable":   Math.round(taxable),
      "HSA":       Math.round(hsa),
      tradGross:   Math.round(trad),
      c401k:    Math.round(c401k),
      cRoth:    Math.round(cRoth),
      cTaxable: Math.round(cTaxable),
      cHSA:     Math.round(cHSA),
    });
  }

  return arr;
}
