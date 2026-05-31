/**
 * Golden master — asserts that refactored model functions produce byte-identical
 * outputs to the original monolith for the default UI state.
 *
 * Default state (from financial-scenarios.jsx useState defaults):
 *   currentAge=30, retirementAge=65, lifeExpect=90
 *   returnRate=5, inflationRate=4, incomeGrowth=3
 *   currentIncome=100_000, filingStatus="single", selectedState="TX"
 *   bal401k=50_000, balRoth=25_000, balTaxable=80_000, balHSA=10_000
 *   contrib401k=10_000, contribRoth=7_000, contribTaxable=4_000, contribHSA=3_850
 *   contribEnd*=65, otherPreTaxDeduc=0, stateRateOverride=null
 *   rate1=22, rate2=24, rate3=18, showPhase2=false, phase2Start=2
 *   retirementState="TX", employerMatchPct=3, matchMode="flat"
 *   matchFormulaRate=50, matchFormulaCap=6
 *   ssClaimingAge=67, includeSS=true, ssOverride=null
 *   isMarried=false, spouseIsSoleBenef=false, spouseCurrentAge=18
 *   spouseIncome=0, spouseIncomeGrowth=3, spouseSsEstimate=0
 *   pensionMonthly=0, pensionStartAge=65
 *   conversionMode="bracket", conversionBracketTarget=22
 *   annualConversionAmt=20_000, conversionTaxSource="converted"
 *   annualExpenses=null, livingExpenses=null, livingExpenseGrowth=3
 *   savingsSurplusPct=50
 *
 * Phase 2 populates EXPECTED after model functions are extracted.
 * Phase 8 asserts all values match.
 */

import { describe, it, expect } from "vitest";

// These imports will resolve once Phase 2–3 extraction is complete.
// Until then, this file documents the expected values.

// EXPECTED values — computed from monolith with default state (populated in Phase 2):
const EXPECTED = {
  // taxes.js
  fedTax:          null, // calcTax(agi, "single").tax
  fedEffRate:      null, // calcTax(agi, "single").effectiveRate
  fedMarginal:     null, // marginalRate(agi, "single")

  // social-security.js
  ssAIME:          null, // calcAIME(100_000, 3, 35)
  ssPIA:           null, // calcPIA(ssAIME)
  ssMonthlyBenefit:null, // calcBenefit(ssPIA, 67)
  ssAnnualBenefit: null, // ssMonthlyBenefit * 12

  // simulation.js — retirement snapshot (age 65, year 35)
  retTrad401k:     null, // atRetirement["Trad 401k"]  (after-tax display)
  retTradGross:    null, // atRetirement.tradGross
  retRoth:         null, // atRetirement["Roth IRA"]
  retTaxable:      null, // atRetirement["Taxable"]
  retHSA:          null, // atRetirement["HSA"]
  totalAtRet:      null, // sum of 4 account values at retirement

  // drawdown.js
  netPortfolioNeed:null,
  withdrawalRate:  null,
  yearsSustained:  null,

  // rmd.js
  firstRMD:        null, // rmdData[0].rmd
  totalRMDs:       null,
  rmdTaxBite:      null,

  // roth-conversion.js
  conversionWindowYrs: null,
  netConversionBenefit: null,
};

// Placeholder — filled when Phase 2-3 extraction is complete.
describe.skip("golden master (populate values in Phase 2)", () => {
  it("taxes match monolith default state", () => {
    expect(EXPECTED.fedTax).not.toBeNull();
  });
  it("simulation retirement snapshot matches monolith default state", () => {
    expect(EXPECTED.totalAtRet).not.toBeNull();
  });
  it("drawdown metrics match monolith default state", () => {
    expect(EXPECTED.netPortfolioNeed).not.toBeNull();
  });
});
