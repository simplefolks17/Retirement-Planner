// ── Working-year tax basis (pure) ───────────────────────────────────────────
//
// The full current-year tax picture: AGI, federal tax (effective + marginal),
// state tax, FICA (per-earner), the take-home / combined-rate display figures,
// the Roth phase-out gate, and grossAfterTax (the budget basis).
//
// Extracted from App.jsx, where it was split across TWO spots — part hoisted
// above the simData memo (which reads fedMarginal) and part left far below. That
// split was a temporal-dead-zone trap: a consumer ended up above a `const`'s
// declaration and crashed the whole app to a blank page (BUG-20). As one pure,
// order-independent function it cannot recur, and it is now unit-testable
// (npm test never rendered App.jsx, so the original bug shipped green).
//
// MFJ rule (CLAUDE.md 3 & 9): agi, householdIncome, and the Roth phase-out MAGI
// use combined (primary + spouse) income ONLY for filingStatus "mfj"; every other
// status uses primary income alone. FICA is ALWAYS per-earner — each spouse's
// wages capped at the wage base separately — regardless of filing status.

import { calcTax, marginalRate } from "./taxes.js";
import { calcGrossAfterTax } from "./budget.js";
import { STATE_TAX, FICA_WAGE_BASE, SS_TAX_RATE, MEDICARE_RATE,
         ADDL_MEDICARE_RATE, ADDL_MEDICARE_THRESHOLD, ROTH_PHASEOUT_2026 } from "../config/irs-2026.js";

export function calcTaxBasis({
  currentIncome, spouseIncome = 0, filingStatus = "single",
  contrib401k = 0, contribHSA = 0, otherPreTaxDeduc = 0,
  selectedState, stateRateOverride = null,
}) {
  const isMFJ = filingStatus === "mfj";
  const combinedIncome = currentIncome + spouseIncome;

  // Primary pre-tax deductions (401k, HSA, other) reduce primary income first;
  // spouse deductions aren't tracked (no sliders), so spouse income enters as
  // gross for MFJ. Cap the deduction at primary income so AGI never goes negative.
  const totalPreTaxDeduc = contrib401k + contribHSA + otherPreTaxDeduc;
  const safeDeduc        = Math.min(totalPreTaxDeduc, currentIncome);
  const agi = isMFJ ? currentIncome - safeDeduc + spouseIncome : currentIncome - safeDeduc;

  const { tax: fedTax, effectiveRate: fedEffRate } = calcTax(agi, filingStatus);
  const fedMarginal = marginalRate(agi, filingStatus);

  const stateRateDefault = STATE_TAX[selectedState]?.rate ?? 0;
  const stateRate        = stateRateOverride !== null ? stateRateOverride : stateRateDefault;
  const stateTax         = agi * stateRate;
  const noStateTax       = stateRate === 0;

  // FICA = Social Security (6.2%, capped per-earner at the wage base) + Medicare (1.45%,
  // UNCAPPED) + Additional Medicare (0.9% on wages above a filing-status threshold). Lumping
  // all three under one capped rate understated FICA for high earners (review fix). SS stays
  // per-earner (rule 9); Medicare/surtax apply to total FICA wages.
  const ssWages   = Math.min(currentIncome, FICA_WAGE_BASE) + Math.min(spouseIncome, FICA_WAGE_BASE);
  const medWages  = currentIncome + spouseIncome;
  const addlThreshold = ADDL_MEDICARE_THRESHOLD[filingStatus] ?? ADDL_MEDICARE_THRESHOLD.single;
  const fica = ssWages * SS_TAX_RATE
             + medWages * MEDICARE_RATE
             + Math.max(0, medWages - addlThreshold) * ADDL_MEDICARE_RATE;

  const householdIncome = isMFJ ? combinedIncome : currentIncome;
  const takeHome        = householdIncome - fedTax - stateTax - fica - safeDeduc;
  const combinedEffRate = (fedTax + stateTax + fica) / (householdIncome || 1);

  // Roth phase-out tests MAGI ≈ AGI (nets out pre-tax 401k/HSA, so heavy savers aren't
  // phased out too early). `agi` already encodes MFJ-combined vs primary-only (BUG-12).
  const rothMAGI            = agi;
  const rothPhaseout        = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
  const rothPhaseoutWarning = rothMAGI >= rothPhaseout.start;
  const rothFullyPhased     = rothMAGI >= rothPhaseout.end;

  // Budget basis: income minus all taxes (NOT minus pre-tax contributions — those
  // already reduced fedTax via AGI). Uses householdIncome so MFJ counts both earners.
  const grossAfterTax = calcGrossAfterTax(householdIncome, fedTax, stateTax, fica);

  return {
    combinedIncome, totalPreTaxDeduc, safeDeduc, agi, fedTax, fedEffRate, fedMarginal,
    stateRateDefault, stateRate, stateTax, noStateTax, fica,
    householdIncome, takeHome, combinedEffRate,
    rothMAGI, rothPhaseout, rothPhaseoutWarning, rothFullyPhased, grossAfterTax,
  };
}
