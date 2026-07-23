import { describe, it, expect } from "vitest";
import { runSimulation } from "../simulation.js";
import { buildRetirementWalkByAccount } from "../retirement-engine.js";
import { buildRetirementPhase } from "../retirement-phase.js";
import { getDivisor } from "../rmd.js";
import { HSA_FAMILY_LIMIT_2026, HSA_LIMIT_2026, RMD_START_AGE } from "../../config/irs-2026.js";

function log(label, obj) {
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(obj, null, 2));
}

// ---------- SCENARIO 6: spouse's own retirement age (the big one) ----------
describe("SCENARIO 6: spouse own retirement age", () => {
  it("spouse younger, still working when primary retires - does spouse keep contributing?", () => {
    // primary 60 retires at 65 (5 yrs), spouse currently 45.
    // In reality spouse would keep working & contributing until ~65 (their own).
    const currentAge = 60, retirementAge = 65, lifeExpect = 90;
    const phase2End = retirementAge - currentAge;      // 5
    const safeLifeExp = Math.max(lifeExpect, retirementAge + 1);
    const totalYears = safeLifeExp - currentAge;        // 30
    const spouseCurrentAge = 45;
    const spouseContribEnd = spouseCurrentAge + (retirementAge - currentAge); // 45+5 = 50

    const spouseSim = runSimulation({
      totalYears, currentAge: spouseCurrentAge,
      currentIncome: 100000, incomeGrowth: 3, incomeGrowthEndAge: null, filingStatus: "mfj",
      spouseIncome: 100000, spouseIncomeGrowth: 3, returnRate: 7,
      bal401k: 200000, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 20000, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: spouseContribEnd, contribEndRoth: spouseContribEnd,
      contribEndTaxable: spouseContribEnd, contribEndHSA: spouseContribEnd,
      calcEmployerMatchFn: () => 0,
      hsaLimit: HSA_LIMIT_2026,
    });
    // spouseAtRet is read at index phase2End-1 (=index 4 -> spouse age 50)
    const spouseAtRet = spouseSim[phase2End - 1];
    log("Spouse row read as spouseAtRet (index phase2End-1)", {
      spouseAge: spouseAtRet.age, tradGross: spouseAtRet.tradGross, c401k: spouseAtRet.c401k,
    });
    // Show that spouse contributions STOP at age 50 (=spouseContribEnd) even though spouse is 45 now
    const contribAges = spouseSim.filter(r => r.c401k > 0).map(r => r.age);
    log("Spouse ages with a 401k contribution", contribAges);
    // The spouse balance the household walk actually seeds from = spouseAtRet.tradGross,
    // frozen at spouse age 50. From primary retirement (age65) the spouse bucket just
    // compounds with NO contributions for spouse ages 50->73 in the retirement walk.
    expect(spouseAtRet.age).toBe(50); // spouse is only 50 when household "retires"
    expect(Math.max(...contribAges)).toBe(50); // last contribution at spouse age 50, not 65
  });
});

// ---------- SCENARIO 2: spouse much younger; sim truncation ----------
describe("SCENARIO 2: spouse much younger", () => {
  it("primary 60 retire 65 (5y), spouse 30 - spouse frozen at 35", () => {
    const currentAge = 60, retirementAge = 65, lifeExpect = 90;
    const phase2End = retirementAge - currentAge;      // 5
    const totalYears = Math.max(lifeExpect, retirementAge + 1) - currentAge; // 30
    const spouseCurrentAge = 30;
    const spouseContribEnd = spouseCurrentAge + (retirementAge - currentAge); // 35

    const spouseSim = runSimulation({
      totalYears, currentAge: spouseCurrentAge,
      currentIncome: 80000, incomeGrowth: 3, incomeGrowthEndAge: null, filingStatus: "mfj",
      spouseIncome: 80000, spouseIncomeGrowth: 3, returnRate: 7,
      bal401k: 50000, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 15000, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: spouseContribEnd, contribEndRoth: spouseContribEnd,
      contribEndTaxable: spouseContribEnd, contribEndHSA: spouseContribEnd,
      calcEmployerMatchFn: () => 0,
      hsaLimit: HSA_LIMIT_2026,
    });
    const spouseAtRet = spouseSim[phase2End - 1];
    log("Spouse frozen at index phase2End-1", { spouseAge: spouseAtRet.age, tradGross: spouseAtRet.tradGross });
    const contribAges = spouseSim.filter(r => r.c401k > 0).map(r => r.age);
    log("Spouse contributes only at ages", contribAges);
    expect(spouseAtRet.age).toBe(35);
  });
});

// ---------- SCENARIO 1: spouse OLDER than primary (bypass UI cap) ----------
describe("SCENARIO 1: spouse older than primary (model-level, UI forbids)", () => {
  it("primary 45, spouse 65 - can spouse be RMD-age while primary works?", () => {
    // The retirement walk starts at the PRIMARY's retirement age. If primary is 45 and
    // retires at 65 (20yrs), the spouse is 85 by then. But what about the years 45-65
    // where the spouse (65-85) is already RMD-age? The retirement walk never runs then
    // (it starts at primary retirement). So a spouse older than primary has ~decades of
    // RMDs that are simply never modeled. Confirm spouseAgeFor mapping.
    const currentAge = 45, retirementAge = 65;
    const spouseCurrentAge = 65;
    // walk starts at age 66 (startAge+1). spouse age then:
    const startAge = retirementAge;
    const walk = buildRetirementWalkByAccount({
      startAge, endAge: 95, rReal: 0.03,
      tradGross: 500000, tradGrossSpouse: 800000,
      spouseRmdStartAge: RMD_START_AGE, effectiveExpenses: 60000,
      filingStatus: "mfj", retStateRate: 0,
      rmdStartAge: RMD_START_AGE, useTable2: false,
      spouseCurrentAge, currentAge,
      ssClaimAge: 67, ssGross: 30000, ssTaxable: 25500, pensionStartAge: Infinity,
    });
    // Spouse age at first walk year (age 66): spouseCurrentAge + (66-45) = 65+21 = 86
    const firstRow = walk.rows[0];
    log("Scenario1 first walk row (age 66)", {
      age: firstRow.age, rmdSpouse: firstRow.rmdSpouse, tradSpouse: firstRow.tradSpouse,
    });
    // Spouse was RMD-eligible from spouse-age 73, which was primary-age 53 — a full
    // 12 years BEFORE the walk begins. Those spouse RMD years (53-64) are never modeled.
    const spouseAgeAtWalkStart = spouseCurrentAge + (firstRow.age - currentAge);
    log("Spouse age when the walk finally begins", { spouseAgeAtWalkStart });
    expect(spouseAgeAtWalkStart).toBeGreaterThan(RMD_START_AGE); // spouse already deep into RMDs
  });
});

// ---------- SCENARIO 4: HSA family ceiling ----------
describe("SCENARIO 4: HSA family ceiling split", () => {
  it("primary maxes family limit, spouse gets remainder = 0", () => {
    const contribHSA = HSA_FAMILY_LIMIT_2026; // primary takes the whole family limit
    const spouseHsaLimit = Math.max(0, HSA_FAMILY_LIMIT_2026 - Math.min(contribHSA, HSA_FAMILY_LIMIT_2026));
    log("HSA split", { HSA_FAMILY_LIMIT_2026, primaryTakes: contribHSA, spouseHsaLimit });
    expect(spouseHsaLimit).toBe(0);

    // But: what if BOTH have coverageType self (not family)? Then each gets HSA_LIMIT_2026
    // (self-only) INDEPENDENTLY -> combined can exceed the family limit? Actually two
    // self-only HDHP holders CAN each have their own self-only HSA, so that's fine.
    // The real edge: coverageType 'family' means ONE family HDHP. IRS: family limit is
    // shared, BUT each spouse who is 55+ gets their OWN $1000 catch-up. Model ignores
    // HSA catch-up entirely (no age-55 HSA catch-up anywhere). Note only.
  });

  it("spouse contributes MORE than family limit alone - capped?", () => {
    // coverageType family, primary contributes 0, spouse wants 10000 (> family limit)
    const contribHSA = 0;
    const spouseHsaLimit = Math.max(0, HSA_FAMILY_LIMIT_2026 - Math.min(contribHSA, HSA_FAMILY_LIMIT_2026));
    const spouseSim = runSimulation({
      totalYears: 10, currentAge: 40,
      currentIncome: 100000, incomeGrowth: 0, filingStatus: "mfj",
      spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 10000,
      contribEnd401k: 100, contribEndRoth: 100, contribEndTaxable: 100, contribEndHSA: 100,
      calcEmployerMatchFn: () => 0,
      hsaLimit: spouseHsaLimit,
    });
    log("Spouse HSA capped at family limit?", {
      spouseHsaLimit, firstYearHSA: spouseSim[0].HSA, firstYearCHSA: spouseSim[0].cHSA,
    });
    expect(spouseSim[0].cHSA).toBeLessThanOrEqual(HSA_FAMILY_LIMIT_2026);
  });
});

// ---------- SCENARIO 5: negative / zero inputs ----------
describe("SCENARIO 5: negative inputs guard", () => {
  it("negative spouse trad balance", () => {
    const walk = buildRetirementWalkByAccount({
      startAge: 65, endAge: 80, rReal: 0.03,
      tradGross: 500000, tradGrossSpouse: -100000, // negative!
      spouseRmdStartAge: RMD_START_AGE, effectiveExpenses: 40000,
      filingStatus: "mfj", rmdStartAge: RMD_START_AGE,
      spouseCurrentAge: 60, currentAge: 65,
      ssClaimAge: 67, ssGross: 30000, ssTaxable: 25500,
    });
    log("Negative spouse balance -> first/last totals", {
      firstTotal: walk.rows[0]?.total, tradSpouse0: walk.rows[0]?.tradSpouse,
      depletionAge: walk.depletionAge,
    });
    // does a negative bucket suppress the total wrongly / never guarded?
  });
});

// ---------- SCENARIO 7: extreme household RMD stacking (progressive bracket) ----------
describe("SCENARIO 7: joint RMD bracket stacking", () => {
  it("both large trad balances RMD-eligible - is second RMD taxed progressively?", () => {
    // primary 73, spouse 73 (spouseCurrentAge chosen so spouse hits RMD same year).
    const currentAge = 73, spouseCurrentAge = 73;
    const walk = buildRetirementWalkByAccount({
      startAge: 72, endAge: 80, rReal: 0.0,
      tradGross: 2000000, tradGrossSpouse: 2000000,
      spouseRmdStartAge: RMD_START_AGE, effectiveExpenses: 40000,
      filingStatus: "mfj", retStateRate: 0,
      rmdStartAge: RMD_START_AGE, useTable2: false,
      spouseCurrentAge, currentAge,
      ssClaimAge: Infinity, pensionStartAge: Infinity,
    });
    const r = walk.rows.find(row => row.age === 73);
    const div = getDivisor(73, false, null);
    const rmdP = 2000000 / div, rmdS = 2000000 / div;
    log("Joint RMD year (age73)", {
      divisor: div, primaryRMD: r.rmd, spouseRMD: r.rmdSpouse,
      rmdTaxCharged: r.rmdTax, totalRmd: r.rmd + r.rmdSpouse,
    });
    // sanity: single RMD tax vs double RMD tax should be progressive (2x RMD > 2x tax)
    expect(r.rmdSpouse).toBeGreaterThan(0);
  });
});

// ---------- SCENARIO 8: near-miss boundary ----------
describe("SCENARIO 8: hasSpouse boundary cleanliness", () => {
  it("tradGrossSpouse exactly 0 with spouse ages set - byte identical to no-spouse", () => {
    const base = {
      startAge: 65, endAge: 90, rReal: 0.03, tradGross: 1000000,
      roth: 200000, taxable: 300000, hsa: 50000, effectiveExpenses: 60000,
      filingStatus: "mfj", rmdStartAge: RMD_START_AGE,
      ssClaimAge: 67, ssGross: 30000, ssTaxable: 25500,
    };
    const noSpouse = buildRetirementWalkByAccount({ ...base });
    const zeroSpouse = buildRetirementWalkByAccount({
      ...base, tradGrossSpouse: 0, spouseRmdStartAge: RMD_START_AGE,
      spouseCurrentAge: 60, currentAge: 65,
    });
    const same = JSON.stringify(noSpouse.rows) === JSON.stringify(zeroSpouse.rows);
    log("Zero-spouse boundary byte-identical?", { same });
    expect(same).toBe(true);
  });
});
