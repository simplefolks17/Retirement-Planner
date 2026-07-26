import { describe, it, expect } from "vitest";
import { buildIncomeFloors, calcBracketFillTargets } from "../conversion-planning.js";
import { TAX_DATA_2026, ASSUMPTIONS } from "../../config/irs-2026.js";

const MPY = ASSUMPTIONS.MONTHS_PER_YEAR;
const SINGLE = TAX_DATA_2026.single;

// startAge 66 = the default window start (safeRetAge 65 + 1); window year i is age 66+i.
const floorArgs = (overrides = {}) => ({
  conversionWindowYrs: 7, startAge: 66,
  includeSS: true, ssClaimingAge: 67, ssAmount: 39_035.4,
  pensionMonthly: 0, pensionStartAge: 65, monthsPerYear: MPY,
  ...overrides,
});

// ── buildIncomeFloors ────────────────────────────────────────────────────────
describe("buildIncomeFloors", () => {
  it("produces one entry per conversion-window year", () => {
    expect(buildIncomeFloors(floorArgs())).toHaveLength(7);
    expect(buildIncomeFloors(floorArgs({ conversionWindowYrs: 0 }))).toEqual([]);
  });

  // BUG-25 finding 3 regression: conversion year 0 is displayed at safeRetAge+1.
  // When SS is claimed exactly the year after retirement, that first year IS an
  // SS year and its floor must include SS. (age = safeRetAge + i, the old bug,
  // would have checked 65 >= 66 = false and dropped it.)
  it("includes SS in the first year when claimed the year after retirement", () => {
    const floors = buildIncomeFloors(floorArgs({ ssClaimingAge: 66 }));
    expect(floors[0]).toBe(39_035.4); // age 66 >= claim 66 → SS active
  });

  it("excludes SS until the claiming year, then includes it (deferred claim)", () => {
    // retire 65, claim 70 → ages 66..72; SS starts at index 4 (age 70)
    const floors = buildIncomeFloors(floorArgs({ ssClaimingAge: 70 }));
    expect(floors.slice(0, 4)).toEqual([0, 0, 0, 0]); // ages 66-69
    expect(floors[4]).toBe(39_035.4);                 // age 70
    expect(floors[6]).toBe(39_035.4);                 // age 72
  });

  it("excludes SS entirely when includeSS is false", () => {
    expect(buildIncomeFloors(floorArgs({ includeSS: false }))).toEqual(Array(7).fill(0));
  });

  it("adds pension only from its start age, annualized by monthsPerYear", () => {
    // retire 65, pension $2k/mo from age 68 → ages 66..72; index i is age 66+i,
    // so pension starts at index 2 (age 68).
    const floors = buildIncomeFloors(floorArgs({
      includeSS: false, pensionMonthly: 2_000, pensionStartAge: 68,
    }));
    expect(floors[1]).toBe(0);            // age 67, before pension
    expect(floors[2]).toBe(2_000 * MPY);  // age 68, pension starts
  });
});

// ── Finding 2 (adversarial review, 2026-07-26): the conversion window's income
// floors never got the spouse's gap-year wages — the retirement engine builds
// its own floor as ssTaxable + pension + spouseWages (retirement-engine.js),
// but buildIncomeFloors returned yearSS + yearPension only, so the planner and
// the engine modeled DIFFERENT households for any spouse-gap window. CLAUDE.md
// rule 5b names retIncomeFloors[] explicitly. ────────────────────────────────
describe("buildIncomeFloors — spouse gap-year wages (Finding 2, #30/BUG-82)", () => {
  const MFJ = TAX_DATA_2026.mfj;

  it("T-F2.1 — the bug, verbatim: MFJ retire 60, window 61-72, $120k/yr spouse wages ⇒ the first year's bracket-fill target is $123,600, not $243,600", () => {
    const spouseTaxableIncomeByAge = {};
    for (let age = 61; age <= 72; age++) spouseTaxableIncomeByAge[age] = 120_000;
    const convFloors = buildIncomeFloors({
      conversionWindowYrs: 12, startAge: 61, includeSS: true, ssClaimingAge: 67, ssAmount: 40_000,
      pensionMonthly: 0, pensionStartAge: 65, monthsPerYear: MPY, spouseTaxableIncomeByAge,
    });
    // Age 61: no SS yet (claims at 67) ⇒ floor is spouse wages only ⇒ $120,000.
    expect(convFloors[0]).toBe(120_000);
    const { bracketFillConversions } = calcBracketFillTargets({
      retTaxData: MFJ, conversionBracketTarget: 22, convFloors, retIncomeFloor: convFloors[0],
    });
    // MFJ 22% top (211,400) + deduction (32,200) = 243,600 fillTo.
    expect(bracketFillConversions[0]).toBe(123_600);
    expect(bracketFillConversions[0]).not.toBe(243_600);
  });

  it("T-F2.2 — fills exactly to the bracket top even with spouse wages in the floor", () => {
    const spouseTaxableIncomeByAge = { 61: 120_000, 62: 80_000, 63: 0 };
    const convFloors = buildIncomeFloors({
      conversionWindowYrs: 3, startAge: 61, includeSS: false, ssClaimingAge: 67, ssAmount: 0,
      pensionMonthly: 0, pensionStartAge: 65, monthsPerYear: MPY, spouseTaxableIncomeByAge,
    });
    const fillTo22 = MFJ.brackets.find(b => b.rate === 0.22).max + MFJ.deduction;
    const { bracketFillConversions } = calcBracketFillTargets({
      retTaxData: MFJ, conversionBracketTarget: 22, convFloors, retIncomeFloor: convFloors[2],
    });
    convFloors.forEach((floor, i) => {
      expect(bracketFillConversions[i] + floor).toBe(fillTo22);
    });
  });

  it("T-F2.3 — inertness: spouseTaxableIncomeByAge omitted / {} / all-zero all reduce to the pre-fix arrays; existing value-locks untouched", () => {
    const base = floorArgs();
    const omitted = buildIncomeFloors(base);
    const empty   = buildIncomeFloors({ ...base, spouseTaxableIncomeByAge: {} });
    const zeroed  = buildIncomeFloors({ ...base, spouseTaxableIncomeByAge: { 66: 0, 67: 0 } });
    expect(empty).toEqual(omitted);
    expect(zeroed).toEqual(omitted);
    // The existing golden-master value-lock (steady $82,765 / peak $121,800) is
    // untouched — re-verified here since it's the exact call this fix touches.
    const ssTaxableRet = 45_924 * ASSUMPTIONS.SS_TAXABLE_PCT;
    const r = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22,
      convFloors: buildIncomeFloors(floorArgs({ ssAmount: ssTaxableRet })),
      retIncomeFloor: ssTaxableRet,
    });
    expect(r.convSteadyTarget).toBe(82_765);
    expect(r.convPeakTarget).toBe(121_800);
  });

  it("T-F2.4 — both floor arrays get the identical wage term; only the SS fraction differs between them", () => {
    const spouseTaxableIncomeByAge = { 66: 100_000, 67: 100_000 };
    const common = {
      conversionWindowYrs: 2, startAge: 66, includeSS: true, ssClaimingAge: 66,
      pensionMonthly: 0, pensionStartAge: 65, monthsPerYear: MPY, spouseTaxableIncomeByAge,
    };
    const ssTaxable85 = 39_035.4; // 85%-taxable fraction (convFloors)
    const ssGross100  = 45_924;  // 100% gross (convMAGIFloors)
    const floor = buildIncomeFloors({ ...common, ssAmount: ssTaxable85 });
    const magiFloor = buildIncomeFloors({ ...common, ssAmount: ssGross100 });
    for (let i = 0; i < 2; i++) {
      // The delta is EXACTLY the SS fraction difference — the wage term cancels,
      // proving it contributed identically to both arrays.
      expect(magiFloor[i] - floor[i]).toBeCloseTo(ssGross100 - ssTaxable85, 5);
    }
  });

  it("T-F2.7 — anti-divergence: the planner's floor equals the engine's own internal floor construction for the same year", () => {
    // Reconstructs retirement-engine.js's own formula verbatim:
    //   floor = (age>=ssClaimAge ? ssTaxable : 0) + (age>=pensionStartAge ? pension : 0) + spouseWages
    // This is the test that would have prevented the finding existing at all —
    // if the two formulas ever diverge again, this fails immediately.
    const spouseTaxableIncomeByAge = { 66: 50_000, 67: 50_000, 68: 50_000 };
    const ssClaimAge = 67, ssTaxable = 39_035.4, pensionStartAge = 68, pension = 24_000;
    const convFloors = buildIncomeFloors({
      conversionWindowYrs: 3, startAge: 66, includeSS: true, ssClaimingAge: ssClaimAge,
      ssAmount: ssTaxable, pensionMonthly: pension / MPY, pensionStartAge, monthsPerYear: MPY,
      spouseTaxableIncomeByAge,
    });
    for (let i = 0; i < 3; i++) {
      const age = 66 + i;
      const engineFloor = (age >= ssClaimAge ? ssTaxable : 0)
        + (age >= pensionStartAge ? pension : 0)
        + (spouseTaxableIncomeByAge[age] ?? 0);
      expect(convFloors[i]).toBeCloseTo(engineFloor, 5);
    }
  });
});

// ── calcBracketFillTargets ────────────────────────────────────────────────────
describe("calcBracketFillTargets", () => {
  // The 22% bracket top for single is 105_700; deduction 16_100 → fillTo 121_800.
  const fillTo22 = SINGLE.brackets.find(b => b.rate === 0.22).max + SINGLE.deduction;

  it("fills each year's taxable income exactly to the bracket top", () => {
    const convFloors = [0, 20_000, 50_000];
    const { bracketFillConversions } = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22, convFloors, retIncomeFloor: 50_000,
    });
    // conversion + floor === fillTo for every (non-clamped) year — the core invariant
    convFloors.forEach((floor, i) => {
      expect(bracketFillConversions[i] + floor).toBe(fillTo22);
      expect(bracketFillConversions[i]).toBe(fillTo22 - floor);
    });
  });

  it("a lower income floor leaves more conversion room (and clamps at 0)", () => {
    const { bracketFillConversions } = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22,
      convFloors: [0, 60_000, 200_000], retIncomeFloor: 60_000,
    });
    expect(bracketFillConversions[0]).toBeGreaterThan(bracketFillConversions[1]); // less income → more room
    expect(bracketFillConversions[2]).toBe(0); // floor above the bracket top → clamp, never negative
  });

  it("peak is the max target, steady is the min, and targetsVary flags variation", () => {
    const r = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22,
      convFloors: [0, 39_035.4], retIncomeFloor: 39_035.4,
    });
    expect(r.convPeakTarget).toBe(Math.max(...r.bracketFillConversions));
    expect(r.convSteadyTarget).toBe(Math.min(...r.bracketFillConversions));
    expect(r.targetsVary).toBe(true);
    // identical floors → no variation
    const flat = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22,
      convFloors: [39_035.4, 39_035.4], retIncomeFloor: 39_035.4,
    });
    expect(flat.targetsVary).toBe(false);
  });

  it("falls back to the 22% bracket top for an unknown target bracket", () => {
    const r = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 99, convFloors: [], retIncomeFloor: 0,
    });
    expect(r.bracketTarget).toBe(r.bracketTops[22]);
  });

  it("with no conversion window, peak and steady fall back to the scalar fill", () => {
    const r = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22, convFloors: [], retIncomeFloor: 39_035.4,
    });
    expect(r.bracketFillConversions).toEqual([]);
    expect(r.convPeakTarget).toBe(r.bracketFillConversion);
    expect(r.convSteadyTarget).toBe(r.bracketFillConversion);
  });

  // Value lock: the default state (single, 22% target, SS claimed at 67, retire
  // 65, no pension) must reproduce the golden-master annualConversion ($82,765),
  // with the pre-SS year (age 66) peaking at the full bracket ($121,800).
  it("reproduces the golden-master default conversion targets (value-preserving)", () => {
    const ssTaxableRet = 45_924 * ASSUMPTIONS.SS_TAXABLE_PCT; // householdSS × 0.85
    const convFloors = buildIncomeFloors(floorArgs({ ssAmount: ssTaxableRet }));
    const r = calcBracketFillTargets({
      retTaxData: SINGLE, conversionBracketTarget: 22, convFloors, retIncomeFloor: ssTaxableRet,
    });
    expect(r.bracketFillConversion).toBe(82_765);
    expect(r.convSteadyTarget).toBe(82_765);
    expect(r.convPeakTarget).toBe(121_800); // age 66, no SS yet → fills the whole bracket
  });
});
