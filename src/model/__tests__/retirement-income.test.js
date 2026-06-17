import { describe, it, expect } from "vitest";
import { calcRetirementIncome, calcSSBreakEven } from "../retirement-income.js";
import { SS_FRA, SS_FACTORS, ASSUMPTIONS } from "../../config/irs-2026.js";

// Default UI state (mirrors the golden master).
const defaults = {
  currentIncome: 100_000, incomeGrowth: 3, safeRetAge: 65, currentAge: 30,
  ssClaimingAge: SS_FRA, includeSS: true, ssOverride: null, spouseSsEstimate: 0,
  pensionMonthly: 0, pensionStartAge: 65,
};

describe("calcRetirementIncome — default state (golden-master value lock)", () => {
  const r = calcRetirementIncome(defaults);

  it("matches the golden-master SS figures", () => {
    expect(r.ssAIME).toBeCloseTo(12977.734696107114, 6);  // 2026 wage base 184,500 (was 168,600)
    expect(r.ssPIA).toBeCloseTo(4009.8702044160673, 6);  // 2026 bend points 1,286/7,749
    expect(r.ssMonthlyBenefit).toBe(4010);
    expect(r.ssAnnualBenefit).toBe(48_120);
    expect(r.spouseSsBenefit).toBe(0);          // no spouse estimate
    expect(r.householdSS).toBe(48_120);
    expect(r.ssTaxableRet).toBeCloseTo(48_120 * ASSUMPTIONS.SS_TAXABLE_PCT, 6);
  });

  it("defers SS from the at-retirement need when claimed after retirement (BUG-10)", () => {
    // default: claim 67 > retire 65 → ssAtRet is 0 even though householdSS > 0
    expect(r.ssAtRet).toBe(0);
    const claimedEarly = calcRetirementIncome({ ...defaults, ssClaimingAge: 65 });
    expect(claimedEarly.ssAtRet).toBe(claimedEarly.householdSS);
  });
});

describe("calcRetirementIncome — toggles and gates", () => {
  it("includeSS=false zeroes household SS but not the underlying PIA", () => {
    const r = calcRetirementIncome({ ...defaults, includeSS: false });
    expect(r.householdSS).toBe(0);
    expect(r.ssAtRet).toBe(0);
    expect(r.ssTaxableRet).toBe(0);
    expect(r.ssPIA).toBeGreaterThan(0); // PIA is still computed
  });

  it("ssOverride pins the annual SS figure", () => {
    const r = calcRetirementIncome({ ...defaults, ssOverride: 30_000 });
    expect(r.effectiveSS).toBe(30_000);
    expect(r.householdSS).toBe(30_000 + r.spouseSsBenefit);
  });

  it("includes a spousal benefit only when isMarried=true", () => {
    // Without isMarried, spouseSsEstimate is ignored — gating is by isMarried.
    const notMarried = calcRetirementIncome({ ...defaults, spouseSsEstimate: 15_000 });
    expect(notMarried.spouseSsBenefit).toBe(0);

    const married = calcRetirementIncome({ ...defaults, isMarried: true, spouseSsEstimate: 15_000 });
    expect(married.spouseSsBenefit).toBeGreaterThan(0);
    expect(married.householdSS).toBe(married.effectiveSS + married.spouseSsBenefit);
  });

  it("counts pension only once started by retirement (rule 5b)", () => {
    const started = calcRetirementIncome({ ...defaults, pensionMonthly: 2_000, pensionStartAge: 65 });
    expect(started.effectivePension).toBe(2_000 * ASSUMPTIONS.MONTHS_PER_YEAR);
    const notYet = calcRetirementIncome({ ...defaults, pensionMonthly: 2_000, pensionStartAge: 70 });
    expect(notYet.effectivePension).toBe(0); // starts after retirement (65)
  });

  it("delaying to 70 yields a larger benefit and a positive draw reduction", () => {
    const r = calcRetirementIncome(defaults); // claiming at FRA (67)
    expect(r.ss70Annual).toBeGreaterThan(r.ssAnnualBenefit);
    expect(r.household70SS).toBe(r.ss70Annual + r.spouseSsBenefit);
    expect(r.ss70DrawReduction).toBe(r.household70SS - r.householdSS);
    expect(r.ss70DrawReduction).toBeGreaterThan(0);
  });
});

describe("calcRetirementIncome — spouse claiming age and basis", () => {
  const sBase = { ...defaults, isMarried: true, spouseSsEstimate: 18_000 };

  it("isMarried=false → spouse benefit is 0 regardless of spouseSsEstimate", () => {
    const r = calcRetirementIncome({ ...defaults, spouseSsEstimate: 18_000 });
    expect(r.spouseSsBenefit).toBe(0);
  });

  it("basis 'own' + early claim (62) reduces own benefit by SS_FACTORS[62]=0.70", () => {
    const r = calcRetirementIncome({ ...sBase, spouseClaimingAge: 62, spouseBenefitBasis: "own" });
    const expected = Math.round(18_000 * SS_FACTORS[62]);
    expect(r.spouseSsBenefit).toBe(expected);
  });

  it("basis 'spousal' at FRA returns 50% of primary PIA × 12", () => {
    const r = calcRetirementIncome({ ...sBase, spouseClaimingAge: SS_FRA, spouseBenefitBasis: "spousal" });
    // spousal floor at FRA = round(ssPIA * 12 * 0.5)
    const expectedFloor = Math.round(r.ssPIA * 12 * 0.5);
    expect(r.spouseSsBenefit).toBe(expectedFloor);
  });

  it("basis 'spousal' at age 70 is NOT inflated above FRA value (no delayed credits for spousal)", () => {
    const at70     = calcRetirementIncome({ ...sBase, spouseClaimingAge: 70,    spouseBenefitBasis: "spousal" });
    const atFRA    = calcRetirementIncome({ ...sBase, spouseClaimingAge: SS_FRA, spouseBenefitBasis: "spousal" });
    expect(at70.spouseSsBenefit).toBe(atFRA.spouseSsBenefit);
  });

  it("spouseAltHigher is true when the unchosen basis pays more", () => {
    // Low own estimate ($5,000) → spousal floor will be higher → should flag altHigher
    const r = calcRetirementIncome({ ...defaults, isMarried: true, spouseSsEstimate: 5_000,
      spouseClaimingAge: SS_FRA, spouseBenefitBasis: "own" });
    // spouseAlt is the spousal floor; if floor > ownReduced then altHigher = true
    expect(r.spouseAlt).toBeGreaterThan(r.spouseSsBenefit);
    expect(r.spouseAltHigher).toBe(true);
  });

  it("spouseAltHigher is false when the chosen basis is already optimal", () => {
    // Choose 'spousal' explicitly when it's higher → alt (own) is lower
    const r = calcRetirementIncome({ ...defaults, isMarried: true, spouseSsEstimate: 5_000,
      spouseClaimingAge: SS_FRA, spouseBenefitBasis: "spousal" });
    expect(r.spouseAltHigher).toBe(false);
  });
});

describe("calcSSBreakEven", () => {
  const { ssMonthlyBenefit: m67 } = calcRetirementIncome(defaults);

  it("returns null when claiming exactly at FRA", () => {
    expect(calcSSBreakEven({ ssClaimingAge: SS_FRA, ssMonthlyBenefit: m67, ss67Monthly: m67 })).toBeNull();
  });

  // BUG-32 is fixed: the timeline now starts at min(claim, FRA) so the FRA
  // baseline gets its 67→claim head start even for delayed claims.
  it("delayed claim reproduces the corrected break-even — BUG-32 fixed", () => {
    const { ssMonthlyBenefit: m70 } = calcRetirementIncome({ ...defaults, ssClaimingAge: 70 });
    const age = calcSSBreakEven({ ssClaimingAge: 70, ssMonthlyBenefit: m70, ss67Monthly: m67 });
    expect(age).toBe(82);
    expect(age).toBeGreaterThan(70);
  });

  it("returns a sensible integer crossing age for an early claim", () => {
    const { ssMonthlyBenefit: m62 } = calcRetirementIncome({ ...defaults, ssClaimingAge: 62 });
    const age = calcSSBreakEven({ ssClaimingAge: 62, ssMonthlyBenefit: m62, ss67Monthly: m67 });
    expect(Number.isInteger(age)).toBe(true);
    expect(age).toBeGreaterThan(SS_FRA);
  });
});
