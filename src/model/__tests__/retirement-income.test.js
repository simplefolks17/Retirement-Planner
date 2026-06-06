import { describe, it, expect } from "vitest";
import { calcRetirementIncome, calcSSBreakEven } from "../retirement-income.js";
import { SS_FRA, ASSUMPTIONS } from "../../config/irs-2026.js";

// Default UI state (mirrors the golden master).
const defaults = {
  currentIncome: 100_000, incomeGrowth: 3, safeRetAge: 65, currentAge: 30,
  ssClaimingAge: SS_FRA, includeSS: true, ssOverride: null, spouseSsEstimate: 0,
  pensionMonthly: 0, pensionStartAge: 65,
};

describe("calcRetirementIncome — default state (golden-master value lock)", () => {
  const r = calcRetirementIncome(defaults);

  it("matches the golden-master SS figures", () => {
    expect(r.ssAIME).toBeCloseTo(12399.151279681775, 6);
    expect(r.ssPIA).toBeCloseTo(3827.422691952266, 6);
    expect(r.ssMonthlyBenefit).toBe(3827);
    expect(r.ssAnnualBenefit).toBe(45_924);
    expect(r.spouseSsBenefit).toBe(0);          // no spouse estimate
    expect(r.householdSS).toBe(45_924);
    expect(r.ssTaxableRet).toBeCloseTo(45_924 * ASSUMPTIONS.SS_TAXABLE_PCT, 6);
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

  it("includes a spousal benefit when the spouse estimate is set", () => {
    const r = calcRetirementIncome({ ...defaults, spouseSsEstimate: 15_000 });
    expect(r.spouseSsBenefit).toBeGreaterThan(0);
    expect(r.householdSS).toBe(r.effectiveSS + r.spouseSsBenefit);
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

describe("calcSSBreakEven", () => {
  const { ssMonthlyBenefit: m67 } = calcRetirementIncome(defaults);

  it("returns null when claiming exactly at FRA", () => {
    expect(calcSSBreakEven({ ssClaimingAge: SS_FRA, ssMonthlyBenefit: m67, ss67Monthly: m67 })).toBeNull();
  });

  // KNOWN LIMITATION (BUG-32): for a DELAYED claim the loop starts counting at the
  // claim age, so the FRA baseline loses the 67→claim months it was already
  // collecting and the break-even collapses to ≈ the claim age (should be early
  // 80s). Locked here to preserve current behavior — this extraction is a faithful
  // port, not a fix. See docs/BUGS.md BUG-32.
  it("delayed claim reproduces the current (under-reported) metric — BUG-32", () => {
    const { ssMonthlyBenefit: m70 } = calcRetirementIncome({ ...defaults, ssClaimingAge: 70 });
    const age = calcSSBreakEven({ ssClaimingAge: 70, ssMonthlyBenefit: m70, ss67Monthly: m67 });
    expect(age).toBe(70);
  });

  it("returns a sensible integer crossing age for an early claim", () => {
    const { ssMonthlyBenefit: m62 } = calcRetirementIncome({ ...defaults, ssClaimingAge: 62 });
    const age = calcSSBreakEven({ ssClaimingAge: 62, ssMonthlyBenefit: m62, ss67Monthly: m67 });
    expect(Number.isInteger(age)).toBe(true);
    expect(age).toBeGreaterThan(SS_FRA);
  });
});
