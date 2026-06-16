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
// Outputs tradGross (the pre-tax 401k balance) — displayed as-is now (BUG-35: the
// "Trad 401k" line shows the gross balance, no after-tax normalization).
// calcEmployerMatchFn: bound function (salary, employeeContrib) → match amount
export function runSimulation({
  totalYears,
  currentAge,
  currentIncome,
  incomeGrowth,
  incomeGrowthEndAge = null, // null = grows until retirement; age = plateau year
  filingStatus,
  spouseIncome,
  spouseIncomeGrowth,
  returnRate,
  bal401k, balRoth, balTaxable, balHSA,
  contrib401k, contribRoth, contribTaxable, contribHSA,
  contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
  calcEmployerMatchFn,
  moneyEvents = [],   // { amount, age, isInflow } — applied to taxable account at matching age
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
    const growthYears = incomeGrowthEndAge != null
      ? Math.min(y - 1, incomeGrowthEndAge - currentAge)
      : y - 1;
    const growFactor = Math.pow(1 + g, growthYears);

    const isEligibleForCatchup = age >= CATCHUP_AGE;
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

    const primaryMAGI = currentIncome * growFactor;
    const spouseGrown = spouseIncome * Math.pow(1 + spouseIncomeGrowth / 100, y - 1);

    const cRoth = (() => {
      if (age > contribEndRoth || contribRoth <= 0) return 0;
      const rothCap = isEligibleForCatchup
        ? ROTH_IRA_LIMIT_2026 + CATCHUP_ROTH_2026
        : ROTH_IRA_LIMIT_2026;
      const baseContrib = Math.min(contribRoth, rothCap);
      // Only MFJ filers report combined income on one return; for every other
      // status the Roth phase-out is tested against the primary earner's MAGI
      // alone (spouse income/contributions are tracked separately). See CLAUDE.md rules 3 & 9.
      const yearMAGI    = filingStatus === "mfj" ? primaryMAGI + spouseGrown : primaryMAGI;
      const po = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
      if (yearMAGI >= po.end) return 0;
      if (yearMAGI <= po.start) return baseContrib;
      // Phase-out reduces the contribution LIMIT, then you contribute min(desired, reduced
      // limit) — NOT the desired amount scaled down. Scaling the desired amount wrongly
      // denied contributions to anyone in the band who wasn't already maxing out. (Review
      // fix. IRS also rounds the reduced limit up to the nearest $10 / $200 floor — omitted.)
      const phasePct   = (po.end - yearMAGI) / (po.end - po.start);
      const reducedCap = rothCap * phasePct;
      return Math.round(Math.min(contribRoth, reducedCap));
    })();

    const cTaxable = age <= contribEndTaxable ? contribTaxable * growFactor : 0;
    const cHSA     = age <= contribEndHSA     ? Math.min(contribHSA, HSA_LIMIT_2026) : 0;

    // Per-account growth = investment earnings this year = base × rate, where the
    // base is the prior balance PLUS this year's contribution (contributions are
    // added before growth compounds — see the contribution-before-growth tests).
    // Captured here so the Year-by-year table can show a real per-year growth figure
    // instead of a JSX residual (WI-2.5). All balances/growth are GROSS now (BUG-35):
    // the Trad 401k line and Year-by-year table display the pre-tax balance, and the
    // table reconciles prevPortfolio + contributions + growth = nextPortfolio on the
    // gross basis. `tradGrowth` is exposed separately as the 401k's share of growth.
    const tradBase = trad + c401k;
    const rothBase = roth + cRoth;
    const hsaBase  = hsa  + cHSA;
    const tradGrowth = tradBase * r;
    trad = tradBase * (1 + r);
    roth = rothBase * (1 + r);
    hsa  = hsaBase  * (1 + r);

    // One-time money events applied to the taxable account before growth compounds.
    // Outflows (purchases) reduce the base; inflows (windfalls) increase it.
    // Clamped at 0 so a large purchase can't produce a negative balance.
    const eventAdj = moneyEvents.reduce((s, ev) =>
      ev.age === age ? s + (ev.isInflow ? Math.abs(ev.amount) : -Math.abs(ev.amount)) : s, 0);

    const yearOrdinaryIncome = primaryMAGI - employeeDeferral - cHSA
                             + (filingStatus === "mfj" ? spouseGrown : 0);
    const capGainsRate       = ltcgRate(yearOrdinaryIncome, filingStatus);
    const taxableBase        = Math.max(0, taxable + cTaxable + eventAdj);
    const taxableRate        = r * (1 - capGainsRate);
    const taxableGrowth      = taxableBase * taxableRate;
    taxable = taxableBase * (1 + taxableRate);

    // Total gross growth across the four accounts (Taxable already net of LTCG drag).
    const growth = tradGrowth + rothBase * r + hsaBase * r + taxableGrowth;

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
      growth:     Math.round(growth),      // gross investment earnings this year
      tradGrowth: Math.round(tradGrowth),  // 401k's share of gross growth (per-account detail)
    });
  }

  return arr;
}
