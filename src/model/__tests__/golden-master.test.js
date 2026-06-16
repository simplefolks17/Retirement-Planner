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
 *   retirementState="TX", employerMatchPct=3, matchMode="flat"
 *   matchFormulaRate=50, matchFormulaCap=6
 *   ssClaimingAge=67, includeSS=true, ssOverride=null
 *   isMarried=false, spouseIsSoleBenef=false, spouseCurrentAge=18
 *   pensionMonthly=0, pensionStartAge=65
 *   conversionMode="bracket", conversionBracketTarget=22
 *   conversionTaxSource="converted"
 *   annualExpenses=null, livingExpenses=null
 *
 * BUG-35 (2026-06-15): rewritten to the single per-account retirement ENGINE
 * (buildRetirementPhase) — the same path App now uses. Headline numbers moved
 * deliberately and are re-locked here:
 *   • balances are GROSS (the 401k is no longer shrunk by the marginal rate);
 *     totalAtRet is the gross portfolio; spendableAtRet is the after-tax reference.
 *   • the default retirement expense is the user's CURRENT living spend
 *     (effectiveLiving), not 3% of the portfolio.
 *   • RMDs are computed on the LIVE 401k (real $, after conversions/draws), so
 *     firstRMD / rmdTaxBite drop sharply; the conversion benefit and longevity
 *     come from the same walk.
 */

import { describe, it, expect } from "vitest";
import { calcTax, marginalRate } from "../taxes.js";
import { calcAIME, calcPIA, calcBenefit } from "../social-security.js";
import { runSimulation } from "../simulation.js";
import { calcEmployerMatch } from "../employer-match.js";
import { calcTaxBasis } from "../tax-basis.js";
import { calcSavingsCapacity } from "../budget.js";
import { calcRetirementIncome } from "../retirement-income.js";
import { calcNetPortfolioNeed, calcWithdrawalRate } from "../drawdown.js";
import { buildIncomeFloors, calcBracketFillTargets } from "../conversion-planning.js";
import { buildRetirementPhase, buildConversionByAge } from "../retirement-phase.js";
import { TAX_DATA_2026, RETIREMENT_STATE_TAX, RMD_START_AGE } from "../../config/irs-2026.js";

// ── Shared setup (mirrors App.jsx logic at default state) ────────────────────

const currentAge = 30, safeRetAge = 65, safeLifeExp = 90;
const returnRate = 5, inflationRate = 4, incomeGrowth = 3;
const currentIncome = 100_000, filingStatus = "single";
const bal401k = 50_000, balRoth = 25_000, balTaxable = 80_000, balHSA = 10_000;
const contrib401k = 10_000, contribRoth = 7_000, contribTaxable = 4_000, contribHSA = 3_850;
const employerMatchPct = 3, matchMode = "flat", matchFormulaRate = 50, matchFormulaCap = 6;
const totalYears = safeLifeExp - currentAge;
const phase2End  = safeRetAge - currentAge;

const safeDeduc  = Math.min(contrib401k + contribHSA, currentIncome);
const agi        = currentIncome - safeDeduc;
const fedMarginal = marginalRate(agi, filingStatus);
const em = (s, c) => calcEmployerMatch(s, c, { matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct });

const sim = runSimulation({
  totalYears, currentAge, currentIncome, incomeGrowth, incomeGrowthEndAge: null, filingStatus,
  spouseIncome: 0, spouseIncomeGrowth: 3, returnRate,
  bal401k, balRoth, balTaxable, balHSA,
  contrib401k, contribRoth, contribTaxable, contribHSA,
  contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
  calcEmployerMatchFn: em,
});
const at = sim[phase2End - 1];

// BUG-35: balances are gross; the 401k is displayed at its full pre-tax value.
const retTrad401k = at.tradGross;
const totalAtRet  = at.tradGross + at["Roth IRA"] + at["Taxable"] + at["HSA"];
const rReal       = (1 + returnRate / 100) / (1 + inflationRate / 100) - 1;

// Default retirement expense = current living spend (effectiveLiving).
const taxBasis = calcTaxBasis({
  currentIncome, spouseIncome: 0, filingStatus, contrib401k, contribHSA,
  otherPreTaxDeduc: 0, selectedState: "TX", stateRateOverride: null, isMarried: false,
});
const { effectiveLiving } = calcSavingsCapacity({
  grossAfterTax: taxBasis.grossAfterTax, contrib401k, contribRoth, contribTaxable, contribHSA,
  livingExpenses: null,
});
const effectiveExpenses = Math.round(effectiveLiving);

const ssAIME = calcAIME(currentIncome, incomeGrowth, Math.max(1, safeRetAge - currentAge));
const ssPIA  = calcPIA(ssAIME);
const ri = calcRetirementIncome({
  currentIncome, incomeGrowth, incomeGrowthEndAge: null, safeRetAge, currentAge,
  ssClaimingAge: 67, includeSS: true, ssOverride: null, spouseSsEstimate: 0,
  pensionMonthly: 0, pensionStartAge: 65, isMarried: false, spouseClaimingAge: 67, spouseBenefitBasis: "own",
});
const householdSS = ri.householdSS;
const netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, ri.ssAtRet, ri.effectivePension);

// Conversion schedule (bracket-fill to 22%) → engine.
const retTaxData = TAX_DATA_2026[filingStatus];
const conversionWindowYrs = Math.max(0, RMD_START_AGE - 1 - safeRetAge);
const convFloors = buildIncomeFloors({
  conversionWindowYrs, safeRetAge, includeSS: true, ssClaimingAge: 67, ssAmount: ri.ssTaxableRet,
  pensionMonthly: 0, pensionStartAge: 65, monthsPerYear: 12,
});
const retIncomeFloor = ri.ssTaxableRet;
const { bracketFillConversions, bracketFillConversion } =
  calcBracketFillTargets({ retTaxData, conversionBracketTarget: 22, convFloors, retIncomeFloor });
const conversionByAge = buildConversionByAge({
  conversionWindowYrs, safeRetAge, annualConversions: bracketFillConversions, annualConversion: bracketFillConversion,
});
const retStateRate = RETIREMENT_STATE_TAX["TX"]?.rate ?? 0;

// THE single retirement-phase walk — the source for longevity + RMD + conversion.
const retPhase = buildRetirementPhase({
  tradGross: at.tradGross, roth: at["Roth IRA"], taxable: at["Taxable"], hsa: at["HSA"],
  startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
  rReal, effectiveExpenses,
  ssGross: householdSS, ssTaxable: ri.ssTaxableRet, ssClaimAge: 67,
  pension: 0, pensionStartAge: Infinity,
  filingStatus, retStateRate, conversionByAge, rmdStartAge: RMD_START_AGE,
  useTable2: false, spouseCurrentAge: 18, currentAge,
});

const effectiveRMDTaxRate = retPhase.rmdTaxBite / retPhase.totalRMDs;
const spendableAtRet = Math.round(
  at.tradGross * (1 - effectiveRMDTaxRate) + at["Roth IRA"] + at["Taxable"] + at["HSA"]);

// ── Expected values (BUG-35, 2026-06-15) ─────────────────────────────────────

const E = {
  fedTax:               10_123,
  fedEffRate:           0.11750435287289611,
  fedMarginal:          0.22,
  ssAIME:               12977.734696107114,  // 2026 wage base 184,500 caps fewer high-income years (was 12399 @ stale 168,600)
  ssPIA:                3914.210204416067,
  ssMonthlyBenefit:     3914,
  ssAnnualBenefit:      46_968,     // higher AIME → higher benefit (was 45_924)
  retTrad401k:          2_120_026,   // GROSS (BUG-35; was 1_653_620 after-tax)
  retTradGross:         2_120_026,
  retRoth:              576_295,     // +2_475: Roth phase-out review fix lifts band-year contributions (ages ~44–47)
  retTaxable:           836_477,
  retHSA:               420_280,
  totalAtRet:           3_953_078,   // gross (+2_475 from the Roth fix; was 3_950_603)
  spendableAtRet:       3_574_967,   // higher SS floor → higher stacked retirement rate (was 3_578_221)
  effectiveExpenses:    57_377,      // current living spend (was ~104_525 = 3% of portfolio)
  netPortfolioNeed:     57_377,      // ssAtRet = 0 (claims at 67, retires at 65)
  withdrawalRate:       1.4514512488749274,  // slightly lower draw % on the larger portfolio (Roth fix)
  yearsSustained:       Infinity,    // trivially sustainable at this spend (was 62.9)
  firstRMD:             62_279,      // higher SS floor → less pre-RMD drawdown → higher trad bal at 73 (was 62_071)
  totalRMDs:            1_148_650,   // higher trad bal at 73 → higher lifetime RMDs (was 1_144_815)
  rmdTaxBite:           204_864,     // higher lifetime RMDs → higher RMD tax (was 202_423)
  conversionWindowYrs:  7,
  netConversionBenefit: -9_981,      // higher SS floor shifts conversion economics (was -10_096)
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

  it("simulation retirement snapshot (gross balances)", () => {
    expect(retTrad401k).toBe(E.retTrad401k);
    expect(at.tradGross).toBe(E.retTradGross);
    expect(at["Roth IRA"]).toBe(E.retRoth);
    expect(at["Taxable"]).toBe(E.retTaxable);
    expect(at["HSA"]).toBe(E.retHSA);
    expect(totalAtRet).toBe(E.totalAtRet);
  });

  it("spendable reference + default expense", () => {
    expect(spendableAtRet).toBe(E.spendableAtRet);
    expect(effectiveExpenses).toBe(E.effectiveExpenses);
  });

  it("drawdown metrics", () => {
    expect(netPortfolioNeed).toBe(E.netPortfolioNeed);
    expect(calcWithdrawalRate(netPortfolioNeed, totalAtRet)).toBeCloseTo(E.withdrawalRate, 8);
    expect(retPhase.yearsSustained).toBe(E.yearsSustained);
  });

  it("RMD schedule (from the engine)", () => {
    expect(retPhase.firstRMD).toBe(E.firstRMD);
    expect(retPhase.totalRMDs).toBe(E.totalRMDs);
    expect(retPhase.rmdTaxBite).toBe(E.rmdTaxBite);
  });

  it("Roth conversion window", () => {
    expect(conversionWindowYrs).toBe(E.conversionWindowYrs);
    expect(retPhase.grossNetBenefit).toBe(E.netConversionBenefit);
  });
});
