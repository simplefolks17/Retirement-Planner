import { describe, it, expect } from "vitest";
import { acaCliffThreshold, irmaaAnnualSurcharge, calcHealthcareExposure } from "../healthcare.js";

describe("acaCliffThreshold", () => {
  it("1-person household: 400% × $15,060 = $60,240", () => {
    expect(acaCliffThreshold(1)).toBe(60_240);
  });
  it("2-person household", () => {
    expect(acaCliffThreshold(2)).toBe(81_760);
  });
  it("clamps at 6", () => {
    expect(acaCliffThreshold(10)).toBe(acaCliffThreshold(6));
  });
});

describe("irmaaAnnualSurcharge", () => {
  it("returns 0 below $103k (single)", () => {
    expect(irmaaAnnualSurcharge(100_000, "single")).toBe(0);
  });
  it("returns tier-1 at $110k (single)", () => {
    expect(irmaaAnnualSurcharge(110_000, "single")).toBe(1_044);
  });
  it("returns tier-2 at $140k (single)", () => {
    expect(irmaaAnnualSurcharge(140_000, "single")).toBe(2_640);
  });
  it("uses MFJ thresholds", () => {
    // $110k is under MFJ Tier 1 threshold ($206k)
    expect(irmaaAnnualSurcharge(110_000, "mfj")).toBe(0);
    // $210k hits MFJ tier 1
    expect(irmaaAnnualSurcharge(210_000, "mfj")).toBe(1_044);
  });
});

describe("calcHealthcareExposure", () => {
  const baseYears = [
    { age: 63, conversion: 40_000 },
    { age: 64, conversion: 40_000 },
    { age: 65, conversion: 40_000 },
  ];
  const floors = [0, 0, 0]; // no SS/pension yet

  it("ACA cliff flagged when MAGI >= 400% FPL (1-person = $60,240)", () => {
    const result = calcHealthcareExposure({
      conversionYears: baseYears, convMAGIFloors: floors,
      hasMarketplaceInsurance: true, householdSize: 1,
      hasMedicare: false, filingStatus: "single",
    });
    // $40k < $60,240 — no cliff crossing
    expect(result[0].aca.crossesCliff).toBe(false);
  });

  it("ACA cliff crossed when conversion pushes MAGI over threshold", () => {
    const result = calcHealthcareExposure({
      conversionYears: [{ age: 63, conversion: 70_000 }],
      convMAGIFloors: [0],
      hasMarketplaceInsurance: true, householdSize: 1,
      hasMedicare: false, filingStatus: "single",
    });
    expect(result[0].aca.crossesCliff).toBe(true);
    expect(result[0].aca.margin).toBeLessThan(0);
  });

  it("no ACA exposure when age >= 65 (Medicare eligible)", () => {
    const result = calcHealthcareExposure({
      conversionYears: [{ age: 65, conversion: 70_000 }],
      convMAGIFloors: [0],
      hasMarketplaceInsurance: true, householdSize: 1,
      hasMedicare: false, filingStatus: "single",
    });
    expect(result[0].aca).toBeNull();
  });

  it("IRMAA applies at age+2 >= 65 (conversion at 63 → IRMAA at 65)", () => {
    const result = calcHealthcareExposure({
      conversionYears: [{ age: 63, conversion: 110_000 }],
      convMAGIFloors: [0],
      hasMarketplaceInsurance: false, householdSize: 1,
      hasMedicare: true, filingStatus: "single",
    });
    expect(result[0].irmaa.surcharge).toBe(1_044);
  });

  it("IRMAA not applied when age+2 < 65", () => {
    const result = calcHealthcareExposure({
      conversionYears: [{ age: 60, conversion: 110_000 }],
      convMAGIFloors: [0],
      hasMarketplaceInsurance: false, householdSize: 1,
      hasMedicare: true, filingStatus: "single",
    });
    expect(result[0].irmaa).toBeNull();
  });
});
