import { describe, it, expect } from "vitest";
import { buildRetirementDrawdown } from "../retirement-drawdown.js";
import { buildRetirementPhase, buildSpouseRetirementSeed } from "../retirement-phase.js";
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

  it("RECONCILES: distStartVal + distGrowth + distSpouseContrib − distDraws − distRMDTax ≈ distEndVal", () => {
    // This is the assertion the old plug made trivially true. It now holds because
    // every term is an independent sum from the SAME walk the chart renders — so a
    // tax the chart forgot to subtract (the original bug) would break it.
    // + distSpouseContrib (#30 / BUG-82): additive term, 0 on this no-spouse fixture,
    // so this is byte-identical to the pre-existing assertion — see the dedicated
    // spouse fixture below for proof the term matters when it's actually non-zero.
    const recon = fd.distStartVal + fd.distGrowth + fd.distSpouseContrib - fd.distDraws - fd.distRMDTax;
    expect(Math.abs(recon - fd.distEndVal)).toBeLessThanOrEqual(5);
  });

  it("RECONCILES the conversion window: totalAtRet + growth + convWindowSpouseContrib − draws − tax ≈ portPreRMD", () => {
    // + convWindowSpouseContrib (#30 / BUG-82): additive term, 0 on this no-spouse
    // fixture — see the dedicated spouse fixture below for the non-zero case.
    const recon = fd.totalAtRet + fd.convWindowGrowth + fd.convWindowSpouseContrib - fd.convWindowDraws - fd.convWindowTax;
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

// ── calcFlowDown — household bridge (#30 / BUG-82) ──────────────────────────
// Before this fix, calcFlowDown was called with primary-only starting balances
// and contribution rows but a HOUSEHOLD totalAtRet, so the entire spouse balance
// silently showed up as "Market growth" in the accumulation bridge. spouseStartBal
// + spouseContribRows fold the spouse's own starting money and working-year
// contributions into the same two nodes the primary already uses, so only the
// TRUE investment return remains in totalGrowth.
describe("calcFlowDown — household bridge (#30 / BUG-82)", () => {
  const spouseContribRows = [
    { age: 60, c401k: 8_000, cRoth: 5_000, cTaxable: 2_000, cHSA: 0 },
    { age: 61, c401k: 8_000, cRoth: 5_000, cTaxable: 2_000, cHSA: 0 },
  ];
  const spouseStartBal = 120_000;

  const baseArgs = {
    bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
    contribRows, totalAtRet: 3_400_000,
    walkRows: walk.rows, depletionAge: walk.depletionAge,
    accumChart: [{ age: 65, total: 3_400_000 }],
    conversionWindowYrs: 7, totalConverted: 7 * 80_000,
    safeRetAge, safeLifeExp, rmdStartAge,
  };

  it("reconciles: startPortfolio + totalContrib + totalGrowth === totalAtRet with spouse terms", () => {
    const fdHH = calcFlowDown({ ...baseArgs, spouseStartBal, spouseContribRows });
    expect(fdHH.startPortfolio + fdHH.totalContrib + fdHH.totalGrowth).toBe(fdHH.totalAtRet);
  });

  it("the spouse balance is NOT reported as growth (regression)", () => {
    const withSpouse = calcFlowDown({ ...baseArgs, spouseStartBal, spouseContribRows });
    const withoutSpouseArgs = calcFlowDown({ ...baseArgs });

    const spouseContribTotal = spouseContribRows.reduce(
      (s, d) => s + d.c401k + d.cRoth + d.cTaxable + d.cHSA, 0);

    expect(withSpouse.startPortfolio).toBe(withoutSpouseArgs.startPortfolio + spouseStartBal);
    expect(withSpouse.totalContrib).toBe(withoutSpouseArgs.totalContrib + spouseContribTotal);
    expect(withSpouse.totalGrowth).toBeLessThan(withoutSpouseArgs.totalGrowth);
    // The drop is exactly the spouse's starting balance + spouse contributions —
    // the same dollars that used to be silently absorbed into "growth".
    expect(withoutSpouseArgs.totalGrowth - withSpouse.totalGrowth).toBe(spouseStartBal + spouseContribTotal);
  });

  it("defaults reproduce the primary-only bridge (byte-identical to the existing fixture)", () => {
    const noSpouseArgs = {
      bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
      contribRows, totalAtRet: 3_000_000,
      walkRows: walk.rows, depletionAge: walk.depletionAge,
      accumChart: [{ age: 65, total: 3_000_000 }],
      conversionWindowYrs: 7, totalConverted: 7 * 80_000,
      safeRetAge, safeLifeExp, rmdStartAge,
    };
    expect(calcFlowDown(noSpouseArgs)).toEqual(fd);
  });
});

// ── calcFlowDown — gap-year spouse contribution reconciliation (#30 / BUG-82) ──
// A still-working spouse's 401k contribution during the retiree's gap years
// (retirement-phase, NOT the accumulation bridge above) is a real inflow the
// per-account engine (buildRetirementWalkByAccount) reports per row as
// `spouseContrib`. It is neither growth, draw, nor tax, so both phase
// reconciliation identities need their own `+ *SpouseContrib` term — this
// fixture proves the term actually matters (non-zero, spanning the RMD
// boundary), unlike the byte-identical-additive checks above.
describe("calcFlowDown — gap-year spouse contribution reconciliation (#30 / BUG-82)", () => {
  // Primary retires at 65; spouse (10 years younger) keeps working+contributing
  // until their OWN age 70 — a gap that maps to primary ages 66..80, straddling
  // rmdStartAge (73) with 7 conversion-window years (66-72) and 8 distribution
  // years (73-80) of genuine spouseContrib.
  const currentAge = 55, spouseCurrentAge = 45, primaryRetAge = 65, spouseRetAge = 70;
  const gapRmdStartAge = 73;

  const spouseSimData = Array.from({ length: 30 }, (_, i) => ({
    age: spouseCurrentAge + i + 1,                 // spouse ages 46..75
    c401k: 12_000, c401kEmployee: 10_000, cHSA: 1_000, salary: 90_000,
    tradGross: 200_000 + i * 5_000,
    "Roth IRA": 40_000, "Taxable": 20_000, "HSA": 5_000,
  }));
  const spouseCurrentSnapshot = {
    age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0,
  };

  // spouseNetRate kept low enough that spouseIncomeFloorByAge (the spouse's NET
  // cash offsetting the draw) never exceeds spendNeed in any gap year — the
  // engine banks any such surplus into Taxable (retirement-engine.js's
  // `rTax += Math.max(0, spouseIncomeFloor - spouseApplied)`), a SEPARATE,
  // not-yet-reported inflow distinct from spouseContrib. Keeping the surplus at
  // exactly 0 isolates this fixture to the spouseContrib identity under test.
  const seed = buildSpouseRetirementSeed({
    spouseSimData, spouseCurrentSnapshot, spouseCurrentAge, currentAge,
    primaryRetAge, spouseRetAge, spouseNetRate: 0.5,
  });

  // Sanity on the fixture itself: the gap really does span the RMD boundary.
  const gapAges = Object.keys(seed.spouseContribByAge).map(Number);
  const gapLifeExp = 95;

  const spousePhase = buildRetirementPhase({
    tradGross: 1_000_000, roth: 200_000, taxable: 300_000, hsa: 50_000,
    tradGrossSpouse: seed.tradSeed, spouseRmdStartAge: gapRmdStartAge,
    startAge: primaryRetAge, lifeExp: gapLifeExp, longevityHorizon: primaryRetAge + 130,
    rReal: 0.02, effectiveExpenses: 80_000,
    ssGross: 30_000, ssTaxable: 25_500, ssClaimAge: 67,
    filingStatus: "single", retStateRate: 0, rmdStartAge: gapRmdStartAge,
    useTable2: false, spouseCurrentAge, currentAge,
    spouseRetirementAge: spouseRetAge,
    spouseContribByAge: seed.spouseContribByAge,
    spouseTaxableIncomeByAge: seed.spouseTaxableIncomeByAge,
    spouseIncomeFloorByAge: seed.spouseIncomeFloorByAge,
  });

  const totalAtRet = 1_000_000 + seed.tradSeed + 200_000 + 300_000 + 50_000;
  const fdSpouse = calcFlowDown({
    bal401k: 1_000_000, balRoth: 200_000, balTaxable: 300_000, balHSA: 50_000,
    contribRows: [], totalAtRet,
    walkRows: spousePhase.rows, depletionAge: spousePhase.depletionAge,
    accumChart: [{ age: primaryRetAge, total: totalAtRet }],
    conversionWindowYrs: gapRmdStartAge - primaryRetAge - 1,
    totalConverted: 0,
    safeRetAge: primaryRetAge, safeLifeExp: gapLifeExp, rmdStartAge: gapRmdStartAge,
  });

  it("fixture sanity: the gap-year map spans both sides of the RMD boundary", () => {
    expect(gapAges.some(a => a < gapRmdStartAge)).toBe(true);
    expect(gapAges.some(a => a >= gapRmdStartAge)).toBe(true);
  });

  it("T5.1 — RECONCILES both phases with a REAL non-zero spouseContrib term", () => {
    expect(fdSpouse.convWindowSpouseContrib).toBeGreaterThan(0);
    expect(fdSpouse.distSpouseContrib).toBeGreaterThan(0);

    const convRecon = fdSpouse.totalAtRet + fdSpouse.convWindowGrowth
      + fdSpouse.convWindowSpouseContrib - fdSpouse.convWindowDraws - fdSpouse.convWindowTax;
    expect(Math.abs(convRecon - fdSpouse.portPreRMD)).toBeLessThanOrEqual(5);

    const distRecon = fdSpouse.distStartVal + fdSpouse.distGrowth
      + fdSpouse.distSpouseContrib - fdSpouse.distDraws - fdSpouse.distRMDTax;
    expect(Math.abs(distRecon - fdSpouse.distEndVal)).toBeLessThanOrEqual(5);
  });

  it("T5.2 — both phases carry the term when the gap spans the RMD boundary", () => {
    expect(fdSpouse.hasConvWindowSpouseContrib).toBe(true);
    expect(fdSpouse.hasDistSpouseContrib).toBe(true);

    const totalRowSpouseContrib = Math.round(
      spousePhase.rows.reduce((s, r) => s + (r.spouseContrib ?? 0), 0));
    expect(fdSpouse.convWindowSpouseContrib + fdSpouse.distSpouseContrib)
      .toBe(totalRowSpouseContrib);
  });
});
