import { describe, it, expect } from "vitest";
import { evaluateConversionPlan } from "../conversion-evaluation.js";
import { calcRMDProjection } from "../rmd.js";
import { TAX_DATA_2026 } from "../../config/irs-2026.js";

// Default-state inputs mirroring the golden master (single, retire 65, claim SS 67).
// at-retirement balances + rmdTaxBite are the values golden-master.test.js locks.
const tradGross = 2_120_026, rothBal = 573_820, taxableBal = 836_477;
const ssTaxableRet = 45_924 * 0.85;        // 39_035.4
const rmdTaxBite = 683_974;                 // pre-conversion lifetime RMD tax (locked)
const conversionWindowYrs = 7;
const retTaxData = TAX_DATA_2026.single;
const annualConversion = Math.max(0, Math.round(retTaxData.brackets[2].max + retTaxData.deduction - ssTaxableRet));

const rmdData = calcRMDProjection({
  tradGrossAtRetirement: tradGross, safeRetAge: 65, safeLifeExp: 90,
  returnRate: 5, useTable2: false, spouseCurrentAge: 18, currentAge: 30,
});

// Factory: the flat-conversion default state (matches the golden master's conv path).
const planArgs = (overrides = {}) => ({
  conversionWindowYrs, annualConversion, annualConversions: null,
  returnRate: 5, retIncomeFloor: ssTaxableRet, retIncomeFloors: null,
  filingStatus: "single", conversionTaxSource: "converted", retStateRate: 0,
  tradGrossAtRetirement: tradGross, rothBalAtRet: rothBal, taxableBalAtRet: taxableBal,
  safeRetAge: 65,
  rmdData, safeLifeExp: 90, useTable2: false, spouseCurrentAge: 18, currentAge: 30,
  rmdTaxBite, rmdIncomeFloor: ssTaxableRet,
  convMAGIFloors: Array(conversionWindowYrs).fill(0),
  hasMarketplaceInsurance: false, householdSize: 1, hasMedicare: false,
  personOnMedicare: 1, marketplaceMonthlyPremium: null, monthsPerYear: 12,
  ...overrides,
});

describe("evaluateConversionPlan", () => {
  it("reproduces the golden-master net conversion benefit at default state", () => {
    const plan = evaluateConversionPlan(planArgs());
    expect(plan.netConversionBenefit).toBe(77_861);
    // No Medicare / no marketplace at default → no healthcare cost.
    expect(plan.irmaaCost).toBe(0);
    expect(plan.acaLoss).toBe(0);
    expect(plan.adjustedNetConversionBenefit).toBe(plan.netConversionBenefit);
  });

  it("ANTI-DIVERGENCE: the optimizer's objective equals the display's adjusted benefit", () => {
    // The optimizer scores netOf = rmdTaxSaved − totalTax − irmaaCost − acaLoss.
    // The display shows adjustedNetConversionBenefit. They must be the SAME number
    // for the same inputs, or the optimizer optimizes a model the screen doesn't show.
    const plan = evaluateConversionPlan(planArgs({ hasMedicare: true, convMAGIFloors: Array(7).fill(120_000) }));
    const optimizerNetOf = plan.rmdTaxSaved - plan.conversionSim.totalTax - plan.irmaaCost - plan.acaLoss;
    expect(optimizerNetOf).toBe(plan.adjustedNetConversionBenefit);
  });

  it("is deterministic (same inputs → identical results)", () => {
    const a = evaluateConversionPlan(planArgs());
    const b = evaluateConversionPlan(planArgs());
    expect(a.netConversionBenefit).toBe(b.netConversionBenefit);
    expect(a.adjustedNetConversionBenefit).toBe(b.adjustedNetConversionBenefit);
  });

  it("offsets conversion-year ages by safeRetAge (first window year = 66)", () => {
    const plan = evaluateConversionPlan(planArgs());
    expect(plan.conversionSim.years).toHaveLength(conversionWindowYrs);
    expect(plan.conversionSim.years[0].age).toBe(66);
    expect(plan.conversionSim.years.at(-1).age).toBe(72);
  });

  it("charges IRMAA only when on Medicare; cost subtracts from net benefit", () => {
    const floors = Array(7).fill(150_000); // push MAGI into IRMAA tiers
    const off = evaluateConversionPlan(planArgs({ hasMedicare: false, convMAGIFloors: floors }));
    const on  = evaluateConversionPlan(planArgs({ hasMedicare: true,  convMAGIFloors: floors, personOnMedicare: 2 }));
    expect(off.irmaaCost).toBe(0);
    expect(on.irmaaCost).toBeGreaterThan(0);
    expect(on.adjustedNetConversionBenefit).toBe(on.netConversionBenefit - on.irmaaCost - on.acaLoss);
  });

  it("handles a zero-length conversion window without crashing", () => {
    const plan = evaluateConversionPlan(planArgs({ conversionWindowYrs: 0 }));
    expect(plan.conversionSim.years).toHaveLength(0);
    expect(Number.isFinite(plan.netConversionBenefit)).toBe(true);
  });
});
