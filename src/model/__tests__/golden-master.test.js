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
 *
 * BUG-91 (2026-07-27): the retirement engine walks in the PRIMARY's
 * RETIREMENT-YEAR real dollars (rReal = (1+returnRate)/(1+inflationRate) - 1 —
 * see BUG-90's proof), but effectiveExpenses/effectivePension are TODAY's
 * dollars. App.jsx now converts every engine-facing quantity forward via
 * toRetirementYearDollars before it reaches netPortfolioNeed/the engine; this
 * file hand-builds those same inputs (it never mounts App), so it mirrors the
 * SAME conversion here — otherwise this test would silently stop reflecting
 * what the app actually computes. At the default (35 years to retirement, 4%
 * inflation) the conversion factor is 1.04^35 ≈ 3.9461, moving every headline
 * number substantially in the conservative direction (spend requirements
 * rise): withdrawalRate 1.42% → 5.61% (now FAILING the app's own 4%
 * SAFE_WITHDRAWAL_GUIDELINE_PCT instead of comfortably passing it),
 * yearsSustained Infinity → 21.65 (isSustainable flips true → false,
 * depletionAge 87), firstRMD/totalRMDs/rmdTaxBite drop sharply (conversions +
 * the much larger spending draw deplete the Traditional 401k well before 73),
 * netConversionBenefit drops (RMD tax savings shrink along with the RMDs).
 * This is the fix working as intended — see docs/BUGS.md BUG-91.
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
import { toRetirementYearDollars } from "../finance-math.js";
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

// BUG-91: the engine walks in retirement-year real dollars (rReal); every
// engine-facing quantity — App.jsx's retSpendBasis/retPensionBasis — is
// effectiveExpenses/effectivePension inflated forward to that frame. Mirrors
// App.jsx exactly (this file never mounts App, so it must apply the SAME
// conversion by hand). ri.effectivePension is 0 at this default (no pension),
// so retPensionBasis is inert here — included for parity with App.jsx.
const yearsToRetForBasis = Math.max(0, safeRetAge - currentAge);
const retSpendBasis = toRetirementYearDollars(effectiveExpenses, inflationRate, yearsToRetForBasis);

const ssAIME = calcAIME(currentIncome, incomeGrowth, Math.max(1, safeRetAge - currentAge));
const ssPIA  = calcPIA(ssAIME);
const ri = calcRetirementIncome({
  currentIncome, incomeGrowth, incomeGrowthEndAge: null, safeRetAge, currentAge,
  ssClaimingAge: 67, includeSS: true, ssOverride: null, spouseSsEstimate: 0,
  pensionMonthly: 0, pensionStartAge: 65, isMarried: false, spouseClaimingAge: 67, spouseBenefitBasis: "own",
});
const retPensionBasis = toRetirementYearDollars(ri.effectivePension, inflationRate, yearsToRetForBasis);
const householdSS = ri.householdSS;
const netPortfolioNeed = calcNetPortfolioNeed(retSpendBasis, ri.ssAtRet, retPensionBasis);

// Conversion schedule (bracket-fill to 22%) → engine.
const retTaxData = TAX_DATA_2026[filingStatus];
// Default window: retirement+1 → RMD_START_AGE-1 (inclusive). The new inclusive-range
// derivation reproduces the prior `RMD_START_AGE - 1 - safeRetAge` length exactly.
const resolvedStartAge = safeRetAge + 1;
const resolvedEndAge   = RMD_START_AGE - 1;
const conversionWindowYrs = Math.max(0, resolvedEndAge - resolvedStartAge + 1);
const convFloors = buildIncomeFloors({
  conversionWindowYrs, startAge: resolvedStartAge, includeSS: true, ssClaimingAge: 67, ssAmount: ri.ssTaxableRet,
  pensionMonthly: 0, pensionStartAge: 65, monthsPerYear: 12,
});
const retIncomeFloor = ri.ssTaxableRet;
const { bracketFillConversions, bracketFillConversion } =
  calcBracketFillTargets({ retTaxData, conversionBracketTarget: 22, convFloors, retIncomeFloor });
const conversionByAge = buildConversionByAge({
  startAge: resolvedStartAge, endAge: resolvedEndAge, annualConversions: bracketFillConversions, annualConversion: bracketFillConversion,
});
const retStateRate = RETIREMENT_STATE_TAX["TX"]?.rate ?? 0;

// THE single retirement-phase walk — the source for longevity + RMD + conversion.
const retPhase = buildRetirementPhase({
  tradGross: at.tradGross, roth: at["Roth IRA"], taxable: at["Taxable"], hsa: at["HSA"],
  startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
  rReal, effectiveExpenses: retSpendBasis,
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
  ssPIA:                4009.8702044160673,  // 2026 bend points 1,286/7,749 (were 1,226/7,391)
  ssMonthlyBenefit:     4010,
  ssAnnualBenefit:      48_120,     // higher PIA from 2026 bend points (was 46_968)
  retTrad401k:          2_120_026,   // GROSS (BUG-35; was 1_653_620 after-tax)
  retTradGross:         2_120_026,
  retRoth:              659_072,     // AGI-net Roth MAGI: pre-tax deductions delay the phase-out → more in-band Roth (was 587_692)
  retTaxable:           836_477,
  retHSA:               420_280,
  totalAtRet:           4_035_855,   // gross (+retRoth delta; was 3_964_475) — unaffected by BUG-91 (accumulation-side, not touched)
  spendableAtRet:       3_763_788,   // BUG-91: effectiveRMDTaxRate drops (was 3_654_179) — much smaller lifetime RMD bite
  effectiveExpenses:    57_377,      // current living spend, TODAY's dollars — unchanged, this is the raw user-facing figure
  // BUG-91: netPortfolioNeed/withdrawalRate/yearsSustained now use retSpendBasis
  // (effectiveExpenses inflated to the retirement-year frame the engine walks
  // in — factor 1.04^35 ≈ 3.9461 at this default). This is the fix's own
  // headline result: withdrawalRate now FAILS the app's 4% guideline instead
  // of comfortably passing it, and the plan is no longer trivially sustainable.
  netPortfolioNeed:     226_414.74822089862,  // = retSpendBasis (ssAtRet = 0, no pension) — was 57_377
  withdrawalRate:       5.610081338920716,    // was 1.4216814033209817 — now fails SAFE_WITHDRAWAL_GUIDELINE_PCT (4%)
  yearsSustained:       21.648529319276392,   // was Infinity — the honest spend is NOT trivially sustainable
  firstRMD:             32_213,      // much larger draw depletes the Traditional 401k faster (was 62_508)
  totalRMDs:            79_341,      // conversions + spending drain the 401k well before age 73 (was 1_152_878)
  rmdTaxBite:           10_182,      // far fewer/smaller RMDs to tax (was 207_557)
  conversionWindowYrs:  7,
  netConversionBenefit: -70_844,     // RMD tax savings shrink along with the (now much smaller) RMDs (was -9_854)
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
    expect(netPortfolioNeed).toBeCloseTo(E.netPortfolioNeed, 6);
    expect(calcWithdrawalRate(netPortfolioNeed, totalAtRet)).toBeCloseTo(E.withdrawalRate, 8);
    expect(retPhase.yearsSustained).toBeCloseTo(E.yearsSustained, 8);
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
