import { describe, it, expect } from "vitest";
import { buildRetirementDrawdown } from "../retirement-drawdown.js";
import { calcFlowDown } from "../flow-down.js";

// Build a realistic walk with both a conversion window (66-72) and an RMD phase
// (73+), with per-year taxes in each, on a portfolio large enough not to deplete.
const safeRetAge = 65, safeLifeExp = 90, rmdStartAge = 73;
const conversionTaxByAge = Object.fromEntries(
  Array.from({ length: 7 }, (_, i) => [66 + i, 18_000]),      // conversion-window tax
);
const rmdTaxByAge = Object.fromEntries(
  Array.from({ length: 18 }, (_, i) => [73 + i, 10_000 + i * 500]), // RMD-phase tax
);
const walk = buildRetirementDrawdown({
  startBal: 3_000_000, startAge: safeRetAge, endAge: safeLifeExp, rReal: 0.03,
  effectiveExpenses: 90_000, ssAmount: 40_000, ssClaimAge: 67,
  rmdTaxByAge, conversionTaxByAge,
});

const contribRows = [
  { age: 64, c401k: 10_000, cRoth: 7_000, cTaxable: 4_000, cHSA: 3_850 },
  { age: 65, c401k: 10_000, cRoth: 7_000, cTaxable: 4_000, cHSA: 3_850 },
];
const fd = calcFlowDown({
  bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
  contribRows, totalAtRet: 3_000_000,
  walkRows: walk.rows, depletionAge: walk.depletionAge,
  accumChart: [{ age: 65, total: 3_000_000 }],
  conversionWindowYrs: 7,
  totalConverted: 7 * 80_000,
  safeRetAge, safeLifeExp, rmdStartAge,
});

describe("calcFlowDown — growth is a true sum, not a plug (BUG-31)", () => {
  it("distGrowth equals Σ(dist-row growth), independent of draws/taxes", () => {
    const distRows = walk.rows.filter(r => r.age >= rmdStartAge);
    const realGrowth = Math.round(distRows.reduce((s, r) => s + r.growth, 0));
    expect(fd.distGrowth).toBe(realGrowth);
  });

  it("convWindowGrowth equals Σ(conv-row growth)", () => {
    const convRows = walk.rows.filter(r => r.age < rmdStartAge);
    expect(fd.convWindowGrowth).toBe(Math.round(convRows.reduce((s, r) => s + r.growth, 0)));
  });

  it("accumulation growth is NOT clamped — negative real growth still reconciles (review fix)", () => {
    // totalAtRet below start + contributions means the portfolio lost real value.
    // The old Math.max(0,…) clamp would zero the growth and break the bridge.
    const shrunk = calcFlowDown({
      bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
      contribRows, totalAtRet: 150_000,
      walkRows: walk.rows, depletionAge: walk.depletionAge,
      accumChart: [{ age: 65, total: 150_000 }],
      conversionWindowYrs: 7, totalConverted: 0,
      safeRetAge, safeLifeExp, rmdStartAge,
    });
    expect(shrunk.totalGrowth).toBeLessThan(0);
    expect(shrunk.startPortfolio + shrunk.totalContrib + shrunk.totalGrowth)
      .toBe(shrunk.totalAtRet);
  });

  it("the displayed RMD-tax bar equals the tax the walk actually charged", () => {
    const distRows = walk.rows.filter(r => r.age >= rmdStartAge);
    expect(fd.distRMDTax).toBe(Math.round(distRows.reduce((s, r) => s + r.tax, 0)));
    // ...and that equals the sum of the RMD tax schedule (ages present in the walk).
    const scheduledTax = distRows.reduce((s, r) => s + (rmdTaxByAge[r.age] ?? 0), 0);
    expect(fd.distRMDTax).toBe(scheduledTax);
  });

  it("RECONCILES: distStartVal + distGrowth − distDraws − distRMDTax ≈ distEndVal", () => {
    // This is the assertion the old plug made trivially true. It now holds because
    // every term is an independent sum from the SAME walk the chart renders — so a
    // tax the chart forgot to subtract (the original bug) would break it.
    const recon = fd.distStartVal + fd.distGrowth - fd.distDraws - fd.distRMDTax;
    expect(Math.abs(recon - fd.distEndVal)).toBeLessThanOrEqual(5);
  });

  it("RECONCILES the conversion window: totalAtRet + growth − draws − tax ≈ portPreRMD", () => {
    const recon = fd.totalAtRet + fd.convWindowGrowth - fd.convWindowDraws - fd.convWindowTax;
    expect(Math.abs(recon - fd.portPreRMD)).toBeLessThanOrEqual(5);
  });

  it("no off-by-one: distribution draws span exactly the RMD-phase walk rows", () => {
    const distRowCount = walk.rows.filter(r => r.age >= rmdStartAge).length;
    expect(fd.actualSustainedYrs).toBe(distRowCount);
  });
});

describe("calcFlowDown — accumulation bridge units (BUG-35: gross)", () => {
  it("start balance & contributions are GROSS (no 401k haircut), matching the gross totalAtRet", () => {
    // bal401k 50k at full pre-tax value, NOT haircut.
    expect(fd.startPortfolio).toBe(50_000 + 25_000 + 80_000 + 10_000);
    // all contributions at face (gross); the engine taxes withdrawals, not the bridge.
    const expectedContrib = contribRows.reduce(
      (s, d) => s + d.c401k + d.cRoth + d.cTaxable + d.cHSA, 0);
    expect(fd.totalContrib).toBe(expectedContrib);
  });

  it("investment growth is positive and not clamped for a normal plan", () => {
    expect(fd.totalGrowth).toBeGreaterThan(0);
  });
});
