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
  EARLY_WITHDRAWAL_AGE,
  EARLY_WITHDRAWAL_PENALTY,
} from "../config/irs-2026.js";
import { ltcgRate, stackedIncomeTax } from "./taxes.js";
import { applyConversionEvents } from "./conversion-events.js";

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
  conversionEvents = [], // { age, amount } — one-time 401k→Roth conversion in a working year
  stateRate = 0,      // working-year state income-tax rate, applied only to conversion-event tax
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
    const cHSA  = age <= contribEndHSA ? Math.min(contribHSA, HSA_LIMIT_2026) : 0;

    const primaryMAGI = currentIncome * growFactor;
    // Spouse income plateaus at incomeGrowthEndAge too (same growthYears cap as primary)
    const spouseGrown = spouseIncome * Math.pow(1 + spouseIncomeGrowth / 100, growthYears);
    // MAGI ≈ AGI: net out this year's pre-tax deductions (401k deferral + HSA). Used for
    // BOTH the Roth phase-out and the LTCG bracket so the two can't diverge. MFJ adds spouse
    // gross (no spouse deductions tracked); non-MFJ is primary-only (BUG-12).
    const netOrdinaryIncome = (primaryMAGI - employeeDeferral - cHSA)
                            + (filingStatus === "mfj" ? spouseGrown : 0);

    const cRoth = (() => {
      if (age > contribEndRoth || contribRoth <= 0) return 0;
      const rothCap = isEligibleForCatchup
        ? ROTH_IRA_LIMIT_2026 + CATCHUP_ROTH_2026
        : ROTH_IRA_LIMIT_2026;
      const baseContrib = Math.min(contribRoth, rothCap);
      // AGI-net MAGI (see netOrdinaryIncome): MFJ uses combined, every other status uses
      // primary-only (spouse income/contributions tracked separately). CLAUDE.md rules 3 & 9, BUG-12.
      const yearMAGI    = netOrdinaryIncome;
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

    // Capped working-year conversion for THIS age (0 when none). Computed before the
    // LTCG-rate selection because the conversion is ordinary income that can push this
    // year's capital gains into a higher LTCG bracket. Inert when no events (conv = 0).
    const requestedConv = conversionEvents.length
      ? applyConversionEvents(conversionEvents, age).convAmount : 0;
    const conv = Math.min(Math.max(0, requestedConv), Math.max(0, trad));

    const capGainsRate       = ltcgRate(netOrdinaryIncome + conv, filingStatus);
    const taxableBase        = Math.max(0, taxable + cTaxable + eventAdj);
    const taxableRate        = r * (1 - capGainsRate);
    const taxableGrowth      = taxableBase * taxableRate;
    taxable = taxableBase * (1 + taxableRate);

    // Total gross growth across the four accounts (Taxable already net of LTCG drag).
    // Computed BEFORE any conversion event so growth = investment earnings only — a
    // conversion is a transfer, not earnings, and must not perturb the growth figure.
    const growth = tradGrowth + rothBase * r + hsaBase * r + taxableGrowth;

    // Working-year one-time Roth conversion(s) at this age (rule 2b: the principal
    // moves trad→Roth and is taxed ONCE as ordinary income stacked on this year's
    // wages — only the tax leaks). Tax is funded from the taxable brokerage so the
    // full principal lands in Roth; any shortfall comes out of the converted amount,
    // and that withheld portion is an early distribution hit with the 10% penalty
    // when under 59½ (retirement-phase conversions never see this — they're post-59½).
    let convEvent = 0, convEventTax = 0, convEventPenalty = 0;
    if (conv > 0) {
      const tax = stackedIncomeTax(conv, netOrdinaryIncome, filingStatus, stateRate);
      trad -= conv;
      roth += conv;                                  // principal moves in full
      const taxFromTaxable   = Math.min(tax, Math.max(0, taxable));
      const taxFromConverted = tax - taxFromTaxable; // shortfall when taxable can't cover
      taxable -= taxFromTaxable;
      roth    -= taxFromConverted;                   // leaks from the Roth deposit (no dollar conjured)
      const penalty = age < EARLY_WITHDRAWAL_AGE
        ? EARLY_WITHDRAWAL_PENALTY * taxFromConverted : 0;
      roth -= penalty;                               // penalty also leaks from the converted dollars
      convEvent        = conv;
      convEventTax     = tax + penalty;              // total bite (penalty folded in)
      convEventPenalty = penalty;
    }

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
      convEvent:        Math.round(convEvent),        // pre-tax $ converted this working year (0 = none)
      convEventTax:     Math.round(convEventTax),     // ordinary tax + any early-withdrawal penalty
      convEventPenalty: Math.round(convEventPenalty), // 10% penalty component (under-59½ shortfall)
    });
  }

  return arr;
}
