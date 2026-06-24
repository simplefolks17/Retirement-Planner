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
