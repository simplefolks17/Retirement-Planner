import { describe, it, expect } from "vitest";
import { buildSpouseSimInput, runSpouseSim, spouseHsaLimitFor } from "../spouse-sim.js";
import { HSA_LIMIT_2026 } from "../../config/irs-2026.js";

// R-6 (opus review 2026-11-14): the spouse sim's builder was the documented single derivation
// for App AND scenarios, yet three of its lines could be deleted with 0 failing tests. These
// are model-level tests of THAT builder (the App-level tests exercise a fixture that makes
// several of these terms inert — that is exactly how the gaps hid).

// MFJ, both $90k at 6% growth, 2.5% inflation. Primary 40 with an income plateau at 45;
// spouse 30 retiring at 60, contributing $7k Roth into a $0 start (the review's zz-rev-e).
const base = {
  totalYears: 30, currentAge: 40, currentIncome: 90_000, incomeGrowth: 6, incomeGrowthEndAge: 45,
  filingStatus: "mfj", returnRate: 0, primaryContribHSA: 0, hsaCoverageType: "self",
  inflationRate: 2.5, primaryRetAge: 65, spouseRetirementAge: 60, lifeExp: 90,
  spouseCurrentAge: 30, spouseIncome: 90_000, spouseIncomeGrowth: 6,
  spouseBal401k: 0, spouseBalRoth: 0, spouseBalTaxable: 0, spouseBalHSA: 0,
  spouseContrib401k: 0, spouseContribRoth: 7000, spouseContribTaxable: 0, spouseContribHSA: 0,
  spouseEmployerMatch: () => 0,
};
const rothAt = (rows, age) => rows.find(d => d.age === age);

const at = (rows, age) => rows.find(d => d.age === age);
const run = (over = {}) => runSpouseSim(buildSpouseSimInput({ ...base, returnRate: 7, ...over }));

describe("buildSpouseSimInput / runSpouseSim (BUG-156 / BUG-87 / BUG-161 terms)", () => {
  it("BUG-156 frame conversion: the primary's plateau (age 45) is the spouse-frame age 35 in the spouse's sim", () => {
    const input = buildSpouseSimInput(base);
    // primary 40 -> 45 is 5 years; the spouse is 30, so the same calendar year is spouse age 35.
    expect(input.otherEarnerGrowthEndAge).toBe(35);
  });

  it("BUG-156 frame conversion, VALUE level: the spouse's Roth balance at 60 reflects the converted plateau", () => {
    // Locked from the correct code (frame-converted plateau 35). With the unconverted age 45
    // the primary's income keeps growing 10 more spouse-years, household MAGI crosses the
    // Roth phase-out earlier and the balance at 60 is DIFFERENT (that is what this pins).
    expect(at(run(), 60)["Roth IRA"]).toBe(647613);
  });

  it("BUG-156: the spouse's OWN salary gets NO plateau (it keeps growing at its own rate after the primary's plateau)", () => {
    const rows = run();
    // the primary's plateau (spouse-frame 35) must not flatten the spouse's own salary
    expect(at(rows, 50).salary).toBeGreaterThan(at(rows, 36).salary);
    expect(buildSpouseSimInput(base).incomeGrowthEndAge).toBeNull();
  });

  it("BUG-87 cutoff: spouseIncomeEndAge is the spouse's age in the year the PRIMARY retires (40 -> 65 = 25 yrs; 30 -> 55)", () => {
    expect(buildSpouseSimInput(base).spouseIncomeEndAge).toBe(55);
    expect(buildSpouseSimInput({ ...base, primaryRetAge: 55 }).spouseIncomeEndAge).toBe(45);
  });

  it("BUG-87 cutoff, VALUE level: once the primary has retired their wages stop counting in the spouse's own Roth MAGI", () => {
    // Primary retires 45, the spouse (age 30 -> retires 60) keeps working and earning $200k:
    // the primary's $200k wages end at spouse age 35. With the cutoff dropped the primary's
    // wages count for 25 more years, household MAGI sits above the phase-out and the spouse's
    // Roth contribution is 0 at age 40. With it, MAGI is the spouse's alone and they contribute.
    const rows = runSpouseSim(buildSpouseSimInput({
      ...base, currentIncome: 200_000, spouseIncome: 100_000, incomeGrowth: 0, spouseIncomeGrowth: 0,
      incomeGrowthEndAge: null, primaryRetAge: 45, inflationRate: 0, returnRate: 0,
    }));
    expect(at(rows, 40).cRoth).toBe(7000);
  });

  it("BUG-161 / family-HSA split: the spouse sim's hsaLimit is the spouse's real share (self 4,400; family = ceiling minus primary)", () => {
    expect(buildSpouseSimInput(base).hsaLimit).toBe(HSA_LIMIT_2026);
    const fam = { ...base, hsaCoverageType: "family", primaryContribHSA: 6000 };
    expect(buildSpouseSimInput(fam).hsaLimit).toBe(spouseHsaLimitFor("family", 6000));
    // VALUE level: asking for far more than the share is capped at the share each year.
    const rows = runSpouseSim(buildSpouseSimInput({ ...fam, spouseContribHSA: 8000 }));
    expect(at(rows, 31).cHSA).toBe(spouseHsaLimitFor("family", 6000));
    expect(spouseHsaLimitFor("family", 6000)).toBeLessThan(HSA_LIMIT_2026);
  });
});
