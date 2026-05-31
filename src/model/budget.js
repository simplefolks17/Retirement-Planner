import {
  HSA_LIMIT_2026,
  ROTH_IRA_LIMIT_2026,
  TRAD_401K_LIMIT_2026,
  ROTH_PHASEOUT_2026,
} from "../config/irs-2026.js";

// Returns income after all taxes — the correct budget basis.
// Pre-tax contributions are NOT subtracted here; they reduce fedTax via AGI instead.
export function calcGrossAfterTax(currentIncome, fedTax, stateTax, fica) {
  return currentIncome - fedTax - stateTax - fica;
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

  // 1. Employer match: ensure 401k contribution is high enough to capture full match
  const matchContribNeeded = matchMode === "formula"
    ? Math.round(currentIncome * matchFormulaCap / 100)
    : Math.round(currentIncome * employerMatchPct / 100);
  if ((employerMatchPct > 0 || matchMode === "formula") && contrib401k < matchContribNeeded) {
    const matchGap = Math.min(remaining, matchContribNeeded - contrib401k);
    alloc.extraMatch = matchGap;
    alloc.extra401k += matchGap;
    remaining -= matchGap;
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
