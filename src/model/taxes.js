import {
  TAX_DATA_2026,
  LTCG_BRACKETS_2026,
  STATE_TAX,
  RETIREMENT_STATE_TAX,
} from "../config/irs-2026.js";

// Returns { tax, effectiveRate } where effectiveRate = tax / agi
export function calcTax(agi, filingStatus = "single") {
  const { deduction, brackets } = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  const taxable = Math.max(0, agi - deduction);
  let tax = 0;
  for (const { min, max, rate } of brackets) {
    if (taxable <= min) break;
    tax += (Math.min(taxable, max) - min) * rate;
  }
  return { tax, effectiveRate: agi > 0 ? tax / agi : 0 };
}

// Returns the marginal rate on the next dollar of income
export function marginalRate(agi, filingStatus = "single") {
  const { deduction, brackets } = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  const taxable = Math.max(0, agi - deduction);
  for (const { min, max, rate } of brackets) {
    if (taxable <= max) return rate;
  }
  return brackets[brackets.length - 1].rate;
}

// Returns the LTCG rate given ordinary taxable income and filing status
export function ltcgRate(ordinaryIncome, filingStatus = "single") {
  const brackets = LTCG_BRACKETS_2026[filingStatus] ?? LTCG_BRACKETS_2026.single;
  for (const { max, rate } of brackets) {
    if (ordinaryIncome <= max) return rate;
  }
  return brackets[brackets.length - 1].rate;
}

// Returns annual state tax amount.
// tableKey: "working" (uses STATE_TAX) or "retirement" (uses RETIREMENT_STATE_TAX).
// rateOverride: if non-null, bypasses the table and uses this rate directly.
export function calcStateTax(agi, tableKey, stateCode, rateOverride = null) {
  if (rateOverride !== null) return agi * rateOverride;
  const table = tableKey === "retirement" ? RETIREMENT_STATE_TAX : STATE_TAX;
  const rate = table[stateCode]?.rate ?? 0;
  return agi * rate;
}
