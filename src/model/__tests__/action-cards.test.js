import { describe, it, expect } from "vitest";
import { generatePhaseActions, generatePhaseSteps } from "../action-cards.js";

// Minimal base params — real enough to trigger cards, minimal enough to be maintainable
const baseAlloc = {
  totalExtra: 5_000, extra401k: 2_000, extraRoth: 1_500, extraHSA: 1_500,
  extraTaxable: 0, extraMatch: 0,
  opt401k: 12_000, optRoth: 8_500, optHSA: 5_350, optTaxable: 4_000,
};

const baseConvSim = {
  totalTax: 15_000, rothAdvantage: 12_000,
  rothBalEnd_conv: 300_000, rothBalEnd_tax: 312_000,
  taxableBalEnd_conv: 80_000, taxableBalEnd_tax: 68_000,
};

const base = {
  totalAtRet: 1_200_000,
  netPortfolioNeed: 40_000,
  withdrawalRate: 3.3,
  yearsSustained: Infinity,
  isSustainable: true,
  safeRetAge: 65,
  safeLifeExp: 90,
  currentAge: 30,
  effectivePension: 0,

  availableSurplus: 8_000,
  savingsSurplusPct: 50,
  effectiveLiving: 55_000,
  grossAfterTax: 75_000,
  currentContribTotal: 20_000,
  contrib401k: 10_000,
  contribHSA: 2_000,

  matchMode: "flat",
  matchFormulaCap: 6,
  matchFormulaRate: 50,
  employerMatchPct: 3,
  employerMatchAmt: 3_000,
  currentIncome: 100_000,

  rothPhaseoutWarning: false,
  rothFullyPhased: false,
  rothMAGI: 100_000,
  filingStatus: "single",

  megaCapacity: 10_000,

  netConversionBenefit: 25_000,
  conversionSim: baseConvSim,
  annualConversion: 30_000,
  conversionWindowYrs: 7,
  rmdTaxSaved: 40_000,

  totalRMDs: 800_000,
  rmdTaxBite: 144_000,
  firstRMD: { rmd: 45_000 },
  rate3Combined: 0.18,

  includeSS: true,
  ssClaimingAge: 67,
  effectiveSS: 28_000,
  ss70Annual: 34_000,
  ss70DrawReduction: 6_000,
  ssDelayGainYrs: 4,
  wr70: 2.8,

  pensionMonthly: 0,
  yr1TaxSavings: 3_500,

  optimizedAllocation: baseAlloc,
  optimized: { extraPortfolio: 85_000 },

  depletionAge: null,
  hasConvWindow: true,
  retTaxable: 150_000,
};

describe("generatePhaseActions — phase1", () => {
  it("returns prescriptive surplus card when optimizedAllocation.totalExtra > 0", () => {
    const { phase1Actions } = generatePhaseActions(base);
    const card = phase1Actions.find(c => c.title.includes("Surplus"));
    expect(card).toBeDefined();
    expect(card.mode).toBe("prescriptive");
  });

  it("returns educational no-surplus card when availableSurplus <= 0", () => {
    const { phase1Actions } = generatePhaseActions({ ...base, availableSurplus: 0, optimizedAllocation: { ...baseAlloc, totalExtra: 0 } });
    expect(phase1Actions.some(c => c.title === "Your Budget Has No Surplus")).toBe(true);
  });

  it("returns Roth phase-out comparative card when rothPhaseoutWarning is true", () => {
    const { phase1Actions } = generatePhaseActions({ ...base, rothPhaseoutWarning: true, rothMAGI: 158_000 });
    expect(phase1Actions.some(c => c.title.includes("Roth IRA"))).toBe(true);
  });

  it("mega backdoor card only appears when megaCapacity > 20,000", () => {
    const { phase1Actions: low } = generatePhaseActions({ ...base, megaCapacity: 15_000 });
    const { phase1Actions: high } = generatePhaseActions({ ...base, megaCapacity: 25_000 });
    expect(low.some(c => c.title.includes("Mega"))).toBe(false);
    expect(high.some(c => c.title.includes("Mega"))).toBe(true);
  });
});

describe("generatePhaseActions — phase2", () => {
  it("returns conversion ladder card when netConversionBenefit > 0 and hasConvWindow", () => {
    const { phase2Actions } = generatePhaseActions(base);
    expect(phase2Actions.some(c => c.title.includes("Roth Conversion Ladder"))).toBe(true);
  });

  it("returns no phase2 cards when hasConvWindow is false", () => {
    const { phase2Actions } = generatePhaseActions({ ...base, hasConvWindow: false });
    expect(phase2Actions).toHaveLength(0);
  });

  it("returns SS delay comparative card when claiming before 70", () => {
    const { phase2Actions } = generatePhaseActions(base);
    expect(phase2Actions.some(c => c.title.includes("Social Security"))).toBe(true);
  });

  it("SS comparative card has vsA and vsB fields", () => {
    const { phase2Actions } = generatePhaseActions(base);
    const ssCard = phase2Actions.find(c => c.title.includes("Social Security"));
    expect(ssCard.vsA).toBeDefined();
    expect(ssCard.vsB).toBeDefined();
  });
});

describe("generatePhaseActions — phase3", () => {
  it("returns withdrawal order card when yr1TaxSavings > 0", () => {
    const { phase3Actions } = generatePhaseActions(base);
    expect(phase3Actions.some(c => c.title.includes("Tax-Optimal Order"))).toBe(true);
  });

  it("returns RMD warning card when rmdTaxBite > 50,000", () => {
    const { phase3Actions } = generatePhaseActions(base);
    expect(phase3Actions.some(c => c.title.includes("RMD"))).toBe(true);
  });

  it("returns high withdrawal rate card when rate > 6%", () => {
    const { phase3Actions } = generatePhaseActions({ ...base, withdrawalRate: 7.5, depletionAge: 82 });
    expect(phase3Actions.some(c => c.title.includes("High Withdrawal Rate"))).toBe(true);
  });

  it("returns gap card when not sustainable", () => {
    const { phase3Actions } = generatePhaseActions({
      ...base,
      isSustainable: false,
      yearsSustained: 20,
      safeRetAge: 65,
      safeLifeExp: 90,
    });
    expect(phase3Actions.some(c => c.title.includes("Year Gap"))).toBe(true);
  });

  it("action objects include impactLabel when set", () => {
    const { phase3Actions } = generatePhaseActions(base);
    const taxCard = phase3Actions.find(c => c.title.includes("Tax-Optimal Order"));
    expect(taxCard.impactLabel).toBe("saved in Year 1 tax");
  });
});

describe("generatePhaseSteps", () => {
  const flowData = {
    startPortfolio: 165_000,
    totalContrib: 400_000,
    totalGrowth: 635_000,
    totalAtRet: 1_200_000,
    hasConvWindow: true,
    convWindowGrowth: 80_000,
    conversionWindowYrs: 7,
    convWindowDraws: 280_000,
    convWindowTax: 15_000,
    totalConverted: 210_000,
    portPreRMD: 985_000,
    distStartVal: 985_000,
    distGrowth: 200_000,
    distDraws: 1_000_000,
    distRMDTax: 144_000,
    distEndVal: 41_000,
    actualSustainedYrs: 25,
    depletionAge: null,
  };

  const opts = {
    returnRate: 5,
    rReal: 0.0096,
    netPortfolioNeed: 40_000,
    effectivePension: 0,
    rate3Combined: 0.18,
    safeRetAge: 65,
    currentAge: 30,
    safeLifeExp: 90,
  };

  it("phase1Steps has 4 entries", () => {
    const { phase1Steps } = generatePhaseSteps(flowData, opts);
    expect(phase1Steps).toHaveLength(4);
  });

  it("phase2Steps has entries when hasConvWindow is true", () => {
    const { phase2Steps } = generatePhaseSteps(flowData, opts);
    expect(phase2Steps.length).toBeGreaterThan(0);
  });

  it("phase2Steps is empty when hasConvWindow is false", () => {
    const { phase2Steps } = generatePhaseSteps({ ...flowData, hasConvWindow: false }, opts);
    expect(phase2Steps).toHaveLength(0);
  });

  it("phase3Steps includes RMD row when distRMDTax > 0", () => {
    const { phase3Steps } = generatePhaseSteps(flowData, opts);
    expect(phase3Steps.some(s => s.label.includes("RMD"))).toBe(true);
  });

  it("phase1Steps last entry is type 'total'", () => {
    const { phase1Steps } = generatePhaseSteps(flowData, opts);
    expect(phase1Steps[phase1Steps.length - 1].type).toBe("total");
  });
});
