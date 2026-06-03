/**
 * Golden master — asserts that model functions produce correct outputs
 * for the default UI state documented below.
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
 *   annualExpenses=null, livingExpenses=null
 *   savingsSurplusPct=50
 */

import { describe, it, expect } from "vitest";
import { calcTax, marginalRate } from "../taxes.js";
import { calcAIME, calcPIA, calcBenefit, calcSpousal } from "../social-security.js";
import { runSimulation } from "../simulation.js";
import { calcEmployerMatch } from "../employer-match.js";
import { calcNetPortfolioNeed, calcWithdrawalRate, calcYearsSustained } from "../drawdown.js";
import { calcRMDProjection, calcRMDPostConversion } from "../rmd.js";
import { calcConversionSim } from "../roth-conversion.js";
import { TAX_DATA_2026, RETIREMENT_STATE_TAX, RMD_START_AGE } from "../../config/irs-2026.js";

// ── Shared setup (mirrors App.jsx logic at default state) ────────────────────

const currentAge = 30, safeRetAge = 65, safeLifeExp = 90;
const returnRate = 5, inflationRate = 4, incomeGrowth = 3;
const currentIncome = 100_000, filingStatus = "single";
const bal401k = 50_000, balRoth = 25_000, balTaxable = 80_000, balHSA = 10_000;
const contrib401k = 10_000, contribRoth = 7_000, contribTaxable = 4_000, contribHSA = 3_850;
const rate1 = 22, rate2 = 24, rate3 = 18, showPhase2 = false, phase2Start = 2;
const employerMatchPct = 3, matchMode = "flat", matchFormulaRate = 50, matchFormulaCap = 6;
const totalYears = safeLifeExp - currentAge;
const phase2End  = safeRetAge - currentAge;

const safeDeduc  = Math.min(contrib401k + contribHSA, currentIncome);
const agi        = currentIncome - safeDeduc;
const em = (s, c) => calcEmployerMatch(s, c, { matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct });

const sim = runSimulation({
  totalYears, currentAge, currentIncome, incomeGrowth, filingStatus,
  spouseIncome: 0, spouseIncomeGrowth: 3, returnRate,
  rate1, rate2, rate3, phase2Start, phase2End, showPhase2,
  bal401k, balRoth, balTaxable, balHSA,
  contrib401k, contribRoth, contribTaxable, contribHSA,
  contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
  calcEmployerMatchFn: em,
});
const at = sim[phase2End - 1];
const totalAtRet = at["Trad 401k"] + at["Roth IRA"] + at["Taxable"] + at["HSA"];
const effectiveExpenses = Math.round(totalAtRet * 0.03);
const ssAIME = calcAIME(currentIncome, incomeGrowth, Math.max(1, safeRetAge - currentAge));
const ssPIA  = calcPIA(ssAIME);
const householdSS = calcBenefit(ssPIA, 67) * 12 + calcSpousal(ssPIA, 0);
const rReal  = (1 + returnRate / 100) / (1 + inflationRate / 100) - 1;
const netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, householdSS, 0);
const rmd = calcRMDProjection({ tradGrossAtRetirement: at.tradGross, safeRetAge, safeLifeExp, returnRate, useTable2: false, spouseCurrentAge: 18, currentAge });
const totalRMDs = rmd.reduce((s, d) => s + d.rmd, 0);
const retStateRate  = RETIREMENT_STATE_TAX["TX"]?.rate ?? 0;
const ssTaxableRet  = householdSS * 0.85;
// Bracket-accurate RMD tax: SS active at RMD start (claiming age 67 ≤ 73), no pension.
const rmdIncomeFloor  = ssTaxableRet; // SS taxable fraction, pension = 0
const { tax: rmdBaseFedTax } = calcTax(rmdIncomeFloor, filingStatus);
const rmdTaxBite = rmd.reduce((sum, { rmd: r }) => {
  const { tax } = calcTax(rmdIncomeFloor + r, filingStatus);
  return sum + Math.round((tax - rmdBaseFedTax) + r * retStateRate);
}, 0);
const conversionWindowYrs = Math.max(0, RMD_START_AGE - 1 - safeRetAge);
const retIncomeFloor = ssTaxableRet;
const retTaxData = TAX_DATA_2026[filingStatus];
const annualConversion = Math.max(0, Math.round(retTaxData.brackets[2].max + retTaxData.deduction - ssTaxableRet));
const conv = calcConversionSim({ conversionWindowYrs, annualConversion, returnRate, retIncomeFloor, filingStatus, conversionTaxSource: "converted", tradGrossAtRetirement: at.tradGross, rothBalAtRet: at["Roth IRA"], taxableBalAtRet: at["Taxable"] });
const rmdPost = calcRMDPostConversion({ conversionWindowYrs, rmdData: rmd, tradBal73: conv.tradBal73, safeLifeExp, returnRate, useTable2: false, spouseCurrentAge: 18, currentAge });
const rmdTaxBitePost = rmdPost.reduce((sum, { rmd: r }) => {
  const { tax } = calcTax(rmdIncomeFloor + r, filingStatus);
  return sum + Math.round((tax - rmdBaseFedTax) + r * retStateRate);
}, 0);
const rmdTaxSaved = Math.max(0, rmdTaxBite - rmdTaxBitePost);
const netConversionBenefit = rmdTaxSaved - conv.totalTax;

// ── Expected values (updated 2026-06-03: bracket-accurate RMD tax replaces flat rate3Combined) ───

const E = {
  fedTax:               10_123,
  fedEffRate:           0.11750435287289611,
  fedMarginal:          0.22,
  ssAIME:               12399.151279681775,
  ssPIA:                3827.422691952266,
  ssMonthlyBenefit:     3827,
  ssAnnualBenefit:      45_924,
  retTrad401k:          1_738_421,
  retTradGross:         2_120_026,
  retRoth:              573_820,
  retTaxable:           836_477,
  retHSA:               420_280,
  totalAtRet:           3_568_998,
  netPortfolioNeed:     61_146,
  withdrawalRate:       1.7132539721232682,
  yearsSustained:       86.08558689162889,
  firstRMD:             118_198,
  totalRMDs:            3_106_334,
  rmdTaxBite:           683_974,   // bracket-accurate (was 559_140 at flat 18%)
  conversionWindowYrs:  7,
  netConversionBenefit: 17_345,    // flipped positive — flat rate was understating RMD burden
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("golden master — default state", () => {
  it("taxes", () => {
    const { tax, effectiveRate } = calcTax(agi, filingStatus);
    expect(tax).toBe(E.fedTax);
    expect(effectiveRate).toBeCloseTo(E.fedEffRate, 10);
    expect(marginalRate(agi, filingStatus)).toBe(E.fedMarginal);
  });

  it("social security", () => {
    expect(ssAIME).toBeCloseTo(E.ssAIME, 6);
    expect(ssPIA).toBeCloseTo(E.ssPIA, 6);
    expect(calcBenefit(ssPIA, 67)).toBe(E.ssMonthlyBenefit);
    expect(calcBenefit(ssPIA, 67) * 12).toBe(E.ssAnnualBenefit);
  });

  it("simulation retirement snapshot", () => {
    expect(at["Trad 401k"]).toBe(E.retTrad401k);
    expect(at.tradGross).toBe(E.retTradGross);
    expect(at["Roth IRA"]).toBe(E.retRoth);
    expect(at["Taxable"]).toBe(E.retTaxable);
    expect(at["HSA"]).toBe(E.retHSA);
    expect(totalAtRet).toBe(E.totalAtRet);
  });

  it("drawdown metrics", () => {
    expect(netPortfolioNeed).toBe(E.netPortfolioNeed);
    expect(calcWithdrawalRate(netPortfolioNeed, totalAtRet)).toBeCloseTo(E.withdrawalRate, 8);
    expect(calcYearsSustained(netPortfolioNeed, totalAtRet, rReal)).toBeCloseTo(E.yearsSustained, 6);
  });

  it("RMD projection", () => {
    expect(rmd[0].rmd).toBe(E.firstRMD);
    expect(totalRMDs).toBe(E.totalRMDs);
    expect(rmdTaxBite).toBe(E.rmdTaxBite);
  });

  it("Roth conversion window", () => {
    expect(conversionWindowYrs).toBe(E.conversionWindowYrs);
    expect(netConversionBenefit).toBe(E.netConversionBenefit);
  });
});
