import {
  HSA_LIMIT_2026,
  ROTH_IRA_LIMIT_2026,
  TRAD_401K_LIMIT_2026,
  ROTH_PHASEOUT_2026,
} from "../config/irs-2026.js";
import { fvAnnuity } from "./finance-math.js";

// Returns income after all taxes — the correct budget basis.
// Pre-tax contributions are NOT subtracted here; they reduce fedTax via AGI instead.
export function calcGrossAfterTax(currentIncome, fedTax, stateTax, fica) {
  return currentIncome - fedTax - stateTax - fica;
}

// Projects future value of maxing the mega-backdoor Roth each year, for a few
// horizons. Uses the shared annuity-FV primitive (returnRate is a percent here,
// so pass it as a decimal). Returns [{yrs, val}] for the requested horizons.
export function calcMegaBackdoorGrowth({ megaCapacity, returnRate, years = [5, 10, 20] }) {
  return years.map(yrs => ({
    yrs,
    val: Math.round(fvAnnuity(megaCapacity, returnRate / 100, yrs)),
  }));
}

// Returns the annual savings capacity and related budget metrics.
// grossAfterTax: from calcGrossAfterTax (income minus all taxes)
// livingExpenses: null → auto-derived as grossAfterTax - currentContribTotal
export function calcSavingsCapacity({
  grossAfterTax,
  contrib401k,
  contribRoth,
  contribTaxable,
  contribHSA,
  livingExpenses,
}) {
  const currentContribTotal = contrib401k + contribRoth + contribTaxable + contribHSA;
  const effectiveLiving     = livingExpenses ?? Math.max(0, grossAfterTax - currentContribTotal);
  const savingsCapacity     = Math.max(0, grossAfterTax - effectiveLiving);
  const availableSurplus    = Math.max(0, savingsCapacity - currentContribTotal);
  return { currentContribTotal, effectiveLiving, savingsCapacity, availableSurplus };
}

// Returns the optimized allocation of surplus across accounts in IRS-priority order.
// Priority: 1. Capture employer match  2. Max HSA  3. Max Roth IRA  4. Max 401k  5. Taxable
export function calcOptimizedAllocation({
  availableSurplus,
  savingsSurplusPct,
  contrib401k,
  contribRoth,
  contribHSA,
  contribTaxable,
  rothFullyPhased,
  matchMode,
  matchFormulaCap,
  matchFormulaRate,
  employerMatchPct,
  currentIncome,
}) {
  let remaining = Math.round(availableSurplus * savingsSurplusPct / 100);
  const alloc = { extra401k: 0, extraRoth: 0, extraHSA: 0, extraTaxable: 0, extraMatch: 0 };

  // 1. Employer match: only FORMULA matches are contingent on the employee's own
  //    deferral (e.g. "50% of the first 6%"), so only formula mode needs surplus
  //    steered into the 401k to capture the full match. A FLAT match (salary × pct)
  //    is paid unconditionally — directing surplus there just to "earn" it is wrong,
  //    so flat mode skips this step and lets HSA/Roth take priority.
  if (matchMode === "formula") {
    const matchContribNeeded = Math.round(currentIncome * matchFormulaCap / 100);
    if (contrib401k < matchContribNeeded) {
      const matchGap = Math.min(remaining, matchContribNeeded - contrib401k);
      alloc.extraMatch = matchGap;
      alloc.extra401k += matchGap;
      remaining -= matchGap;
    }
  }

  // 2. HSA (triple tax advantage)
  const hsaRoom = Math.max(0, HSA_LIMIT_2026 - contribHSA);
  if (remaining > 0 && hsaRoom > 0) {
    const hsaAdd = Math.min(remaining, hsaRoom);
    alloc.extraHSA = hsaAdd;
    remaining -= hsaAdd;
  }

  // 3. Roth IRA (tax-free growth, no RMDs — unless phased out)
  if (remaining > 0 && !rothFullyPhased) {
    const rothRoom = Math.max(0, ROTH_IRA_LIMIT_2026 - contribRoth);
    const rothAdd = Math.min(remaining, rothRoom);
    alloc.extraRoth = rothAdd;
    remaining -= rothAdd;
  }

  // 4. 401k to annual limit
  const room401k = Math.max(0, TRAD_401K_LIMIT_2026 - contrib401k - alloc.extra401k);
  if (remaining > 0 && room401k > 0) {
    const add401k = Math.min(remaining, room401k);
    alloc.extra401k += add401k;
    remaining -= add401k;
  }

  // 5. Taxable brokerage (overflow)
  if (remaining > 0) {
    alloc.extraTaxable = remaining;
  }

  alloc.totalExtra = alloc.extra401k + alloc.extraRoth + alloc.extraHSA + alloc.extraTaxable;
  alloc.opt401k    = contrib401k + alloc.extra401k;
  alloc.optRoth    = contribRoth  + alloc.extraRoth;
  alloc.optHSA     = contribHSA   + alloc.extraHSA;
  alloc.optTaxable = contribTaxable + alloc.extraTaxable;
  return alloc;
}
