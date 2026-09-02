import { describe, it, expect } from "vitest";
import {
  buildRetirementPhase, buildConversionByAge, buildRmdTaxByAge, buildSpouseRetirementSeed,
  resolveSpouseRetAge,
} from "../retirement-phase.js";
import { buildRetirementWalkByAccount } from "../retirement-engine.js";
import { runSimulation } from "../simulation.js";
import { fvAnnuity } from "../finance-math.js";
import { RMD_START_AGE } from "../../config/irs-2026.js";

// The orchestrator that makes the per-account engine the ONE source for the whole
// retirement phase (BUG-35 / BUG-31): longevity AND the displayed RMD/conversion
// numbers come from the same walk(s).

const base = (over = {}) => buildRetirementPhase({
  tradGross: 2_000_000, roth: 300_000, taxable: 400_000, hsa: 50_000,
  startAge: 65, lifeExp: 90, longevityHorizon: 65 + 130, rReal: 0.0096,
  effectiveExpenses: 80_000,
  ssGross: 45_924, ssTaxable: 39_035, ssClaimAge: 67,
  filingStatus: "single", retStateRate: 0, rmdStartAge: 73,
  ...over,
});

describe("buildRetirementPhase — single source", () => {
  it("derives the displayed RMD schedule from the plan walk (73+, withdrawal-aware)", () => {
    const { rmdSchedule, firstRMD } = base();
    expect(rmdSchedule.length).toBeGreaterThan(0);
    expect(rmdSchedule[0].age).toBe(73);
    expect(firstRMD).toBe(rmdSchedule[0].rmd);
    expect(firstRMD).toBeGreaterThan(0);
  });

  it("longevity comes from the far-horizon plan walk", () => {
    const { yearsSustained, planWalk } = base();
    expect(yearsSustained).toBe(planWalk.yearsSustained);
  });

  it("RMD schedule 'bal' is the Traditional 401k balance, not the whole portfolio (review fix)", () => {
    const { rmdSchedule, rmdScheduleNoConv, planWalk, noConvWalk } = base();
    const first = rmdSchedule[0];
    const row = planWalk.rows.find(r => r.age === first.age);
    expect(first.bal).toBe(Math.round(row.trad));            // the 401k balance…
    expect(first.bal).toBeLessThan(Math.round(row.total));   // …not the total (incl Roth/Taxable/HSA)
    // Same guarantee for the no-conversion comparison schedule.
    const firstNoConv = rmdScheduleNoConv[0];
    const noConvRow = noConvWalk.rows.find(r => r.age === firstNoConv.age);
    expect(firstNoConv.bal).toBe(Math.round(noConvRow.trad));
    expect(firstNoConv.bal).toBeLessThan(Math.round(noConvRow.total));
  });

  it("conversions reduce lifetime RMD tax: rmdTaxBite ≤ rmdTaxBiteNoConv", () => {
    const withConv = base({ conversionByAge: { 65: 80_000, 66: 80_000, 67: 80_000, 68: 80_000 } });
    expect(withConv.rmdTaxBite).toBeLessThanOrEqual(withConv.rmdTaxBiteNoConv);
    expect(withConv.conversionCost).toBeGreaterThan(0);
    // rmdTaxSaved is the apples-to-apples saving over the span BOTH walks are active (clamped
    // ≥ 0) — assert that exact common-span value, not just non-negativity.
    const planRows   = withConv.planWalk.rows.filter(r => r.age <= 90);
    const noConvRows = withConv.noConvWalk.rows.filter(r => r.age <= 90);
    const commonMaxAge = Math.min(planRows[planRows.length - 1].age, noConvRows[noConvRows.length - 1].age);
    const sumRmdTaxTo = rs => rs.reduce((s, r) => s + (r.age <= commonMaxAge ? (r.rmdTax ?? 0) : 0), 0);
    expect(withConv.rmdTaxSaved).toBe(Math.max(0, Math.round(sumRmdTaxTo(noConvRows) - sumRmdTaxTo(planRows))));
    expect(withConv.grossNetBenefit).toBe(withConv.rmdTaxSaved - withConv.conversionCost);
  });

  it("totalDrawTax is Σ(row.drawTax) over display rows, and positive when the 401k funds draws (BUG-40)", () => {
    const sumDisplay = rs => Math.round(
      rs.filter(r => r.age <= 90).reduce((s, r) => s + (r.drawTax ?? 0), 0));
    const p = base();
    expect(p.totalDrawTax).toBe(sumDisplay(p.planWalk.rows));
    // With no taxable/Roth/HSA to draw from, every pre-RMD spending draw comes
    // from the 401k → drawTax must be strictly positive and still equal the Σ.
    const tradOnly = base({ taxable: 0, roth: 0, hsa: 0 });
    expect(tradOnly.totalDrawTax).toBe(sumDisplay(tradOnly.planWalk.rows));
    expect(tradOnly.totalDrawTax).toBeGreaterThan(0);
  });

  it("no conversion → zero cost, rmdTaxBite equals the no-conversion baseline, zero savings", () => {
    const { conversionCost, rmdTaxBite, rmdTaxBiteNoConv, rmdTaxSaved, grossNetBenefit } =
      base({ conversionByAge: {} });
    expect(conversionCost).toBe(0);
    expect(rmdTaxBite).toBe(rmdTaxBiteNoConv);
    expect(rmdTaxSaved).toBe(0);
    expect(grossNetBenefit).toBe(0);
  });

  it("the displayed firstRMD reflects the ACTUAL plan — conversions shrink it", () => {
    const noConv   = base({ conversionByAge: {} });
    const withConv = base({ conversionByAge: { 65: 100_000, 66: 100_000, 67: 100_000 } });
    // Converting before 73 lowers the 401k, so the first RMD is smaller.
    expect(withConv.firstRMD).toBeLessThan(noConv.firstRMD);
  });

  it("chart rows stop at the display life expectancy, longevity walk runs past it", () => {
    const { rows, planWalk } = base();
    expect(rows[rows.length - 1].age).toBeLessThanOrEqual(90);
    expect(planWalk.rows.length).toBeGreaterThanOrEqual(rows.length);
  });

  // T-F1.9 (Finding 1, adversarial review, 2026-07-26): the lifetime spillover
  // rollups are the lifeExp-bounded sums of the display rows — same bounding
  // convention as rmdTaxBite/conversionCost/totalDrawTax above.
  it("T-F1.9 — totalSpouseSpillover/totalSpouseSpilloverTax/firstSpouseSpilloverAge are the lifeExp-bounded sums, and 0/0/null with no spouse", () => {
    const noSpouse = base();
    expect(noSpouse.totalSpouseSpillover).toBe(0);
    expect(noSpouse.totalSpouseSpilloverTax).toBe(0);
    expect(noSpouse.firstSpouseSpilloverAge).toBeNull();

    const spouseIncomeFloorByAge = {};
    const spouseContribByAge = {};
    for (let a = 61; a <= 75; a++) { spouseIncomeFloorByAge[a] = 15_000; spouseContribByAge[a] = 12_000; }
    const withSpouse = base({
      tradGross: 50_000, tradGrossSpouse: 3_000_000, roth: 0, taxable: 0, hsa: 0,
      startAge: 60, lifeExp: 90, longevityHorizon: 60 + 130, effectiveExpenses: 60_000,
      currentAge: 60, spouseCurrentAge: 45,
      spouseRetirementAge: 75, spouseContribByAge, spouseIncomeFloorByAge,
    });
    expect(withSpouse.totalSpouseSpillover).toBeGreaterThan(0);
    const sumSpill    = Math.round(withSpouse.rows.reduce((s, r) => s + (r.spouseSpillover    ?? 0), 0));
    const sumSpillTax = Math.round(withSpouse.rows.reduce((s, r) => s + (r.spouseSpilloverTax ?? 0), 0));
    expect(withSpouse.totalSpouseSpillover).toBe(sumSpill);
    expect(withSpouse.totalSpouseSpilloverTax).toBe(sumSpillTax);
    expect(withSpouse.firstSpouseSpilloverAge)
      .toBe(withSpouse.rows.find(r => (r.spouseSpillover ?? 0) > 0)?.age ?? null);
  });
});

// ── buildConversionByAge — window decoupling (B1) ──────────────────────────────
describe("buildConversionByAge — flexible window", () => {
  // The default window (startAge = safeRetAge+1, endAge = RMD_START_AGE-1) must
  // reproduce the prior hardcoded `safeRetAge + yr + 1` indexing exactly. We rebuild
  // the legacy map by hand and assert deep equality (the golden-master equivalence pin).
  const legacy = (safeRetAge, annualConversions, annualConversion) => {
    const windowYrs = Math.max(0, RMD_START_AGE - 1 - safeRetAge);
    const out = {};
    for (let yr = 0; yr < windowYrs; yr++) {
      const amt = annualConversions ? (annualConversions[yr] ?? annualConversion) : annualConversion;
      if (amt > 0) out[safeRetAge + yr + 1] = amt;
    }
    return out;
  };

  it("default window equals the legacy safeRetAge+yr+1 schedule (flat)", () => {
    for (const safeRetAge of [55, 60, 65, 70]) {
      const out = buildConversionByAge({
        startAge: safeRetAge + 1, endAge: RMD_START_AGE - 1, annualConversion: 25_000,
      });
      expect(out).toEqual(legacy(safeRetAge, null, 25_000));
    }
  });

  it("default window equals the legacy schedule (per-year bracket-fill array)", () => {
    const safeRetAge = 62;
    const perYear = [120_000, 110_000, 90_000, 80_000, 80_000, 80_000, 80_000, 80_000, 80_000, 80_000];
    const out = buildConversionByAge({
      startAge: safeRetAge + 1, endAge: RMD_START_AGE - 1, annualConversions: perYear, annualConversion: 0,
    });
    expect(out).toEqual(legacy(safeRetAge, perYear, 0));
  });

  it("a later start / earlier end confines conversions to [startAge, endAge]", () => {
    const out = buildConversionByAge({ startAge: 67, endAge: 70, annualConversion: 30_000 });
    expect(Object.keys(out).map(Number).sort((a, b) => a - b)).toEqual([67, 68, 69, 70]);
    expect(out[66]).toBeUndefined();
    expect(out[71]).toBeUndefined();
  });

  it("annualConversions is indexed from startAge (offset travels with the window)", () => {
    const out = buildConversionByAge({
      startAge: 67, endAge: 69, annualConversions: [10_000, 20_000, 30_000],
    });
    expect(out).toEqual({ 67: 10_000, 68: 20_000, 69: 30_000 });
  });

  it("empty window (endAge < startAge) yields no conversions", () => {
    expect(buildConversionByAge({ startAge: 66, endAge: 65, annualConversion: 50_000 })).toEqual({});
  });
});

// ── buildRmdTaxByAge — union RMD-tax filter (BUG-78 partial) ───────────────────
describe("buildRmdTaxByAge — union filter (BUG-78)", () => {
  it("includes a spouse-only-RMD year", () => {
    // Primary's own RMD hasn't started (rmdStartAge 73, primary walk ages 66..72
    // below that), but the spouse is already 2+/72 years ahead and has her own
    // Traditional bucket, so she has a required distribution while the primary
    // does not — a year the OLD primary-only rmdSchedule filter would have dropped.
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 90, rReal: 0.03,
      tradGross: 100_000, roth: 0, taxable: 0, hsa: 0,
      tradGrossSpouse: 600_000, spouseRmdStartAge: 72,
      effectiveExpenses: 40_000,
      ssGross: 0, ssTaxable: 0, ssClaimAge: Infinity,
      pension: 0, pensionStartAge: Infinity,
      filingStatus: "single", retStateRate: 0,
      conversionByAge: {}, rmdStartAge: 73,
      useTable2: false, spouseCurrentAge: 70, currentAge: 65,
    });
    const spouseOnlyRow = rows.find(r => (r.rmd ?? 0) === 0 && (r.rmdSpouse ?? 0) > 0);
    expect(spouseOnlyRow).toBeDefined();
    expect(spouseOnlyRow.rmdTax).toBeGreaterThan(0);

    const map = buildRmdTaxByAge(rows);
    expect(map[spouseOnlyRow.age]).toBe(Math.round(spouseOnlyRow.rmdTax));
  });

  it("no spouse → identical to the primary-only rmdSchedule filter, incl. a zero-tax RMD year", () => {
    // A tiny Traditional balance (and zero spending draw, so it isn't depleted
    // before RMDs even start) keeps every RMD — and its tax — trivially small:
    // every RMD year's tax rounds to exactly 0, exercising the fact that we
    // deliberately do NOT add `&& r.rmdTax > 0` to the filter.
    const retPhase = buildRetirementPhase({
      tradGross: 50_000, roth: 0, taxable: 0, hsa: 0,
      startAge: 65, lifeExp: 90, longevityHorizon: 65 + 130, rReal: 0.0096,
      effectiveExpenses: 0,
      ssGross: 0, ssTaxable: 0, ssClaimAge: Infinity,
      filingStatus: "single", retStateRate: 0, rmdStartAge: 73,
    });
    const zeroTaxRow = retPhase.rmdSchedule.find(d => d.tax === 0);
    expect(zeroTaxRow).toBeDefined();

    const legacy = Object.fromEntries(retPhase.rmdSchedule.map(d => [d.age, d.tax]));
    expect(buildRmdTaxByAge(retPhase.rows)).toEqual(legacy);
  });
});

// ── buildSpouseRetirementSeed — the spouse retirement seed + gap-year maps ─────
// (#30 / BUG-82 integration batch)
describe("buildSpouseRetirementSeed", () => {
  // Synthetic spouse accumulation rows — deliberately NOT a runSimulation call for
  // most of these (that engine's own accuracy is exercised elsewhere; these tests
  // are about the builder's own windowing/netting logic), except T3.1a and T3.5
  // which need the real engine to anchor against/reproduce.
  const buildRows = (spouseCurrentAge, count, perRow = {}) =>
    Array.from({ length: count }, (_, i) => ({
      age: spouseCurrentAge + i + 1,
      c401k: 12_000, c401kEmployee: 10_000, cHSA: 1_000, salary: 90_000,
      tradGross: 200_000 + i * 10_000,
      "Roth IRA": 50_000, "Taxable": 30_000, "HSA": 5_000,
      ...perRow,
    }));

  // T3.1a — independent, fully-reproducible closed-form anchor for runSimulation's
  // own 401k accumulation math (not the builder — this pins the ground truth the
  // builder's seed reads from). NOTE: runSimulation adds each year's contribution
  // BEFORE that year's growth compounds (`tradBase = trad + c401k; trad = tradBase *
  // (1 + r)` — see simulation.js's "contribution-before-growth" comment), which is
  // annuity-DUE timing (every dollar earns a full year of growth in the year it's
  // contributed). fvAnnuity is documented as the ordinary-annuity form (deposit at
  // the END of each period), so the byte-for-byte equivalent closed form is
  // fvAnnuity(...) scaled by one extra period of growth, (1 + rate) — verified
  // empirically against the engine before writing this assertion.
  it("T3.1a — 25 years of constant $24,500 401k contributions at 7% match the closed-form annuity-due anchor", () => {
    const rows = runSimulation({
      totalYears: 25, currentAge: 40, currentIncome: 200_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 7,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 24_500, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    });
    const row65 = rows.find(r => r.age === 65);
    expect(row65).toBeDefined();
    const expected = fvAnnuity(24_500, 0.07, 25) * 1.07;
    expect(Math.abs(row65.tradGross - expected)).toBeLessThan(1);
  });

  it("T3.2 — gap window excludes the seed's own age, includes the spouse's retirement year", () => {
    // currentAge 60, spouseCurrentAge 50, primaryRetAge 65 ⇒ spouseAgeAtPrimaryRet
    // = 50 + (65-60) = 55 (the seed row). spouseRetAge 60 ⇒ gap sAges 56..60 map to
    // primaryAges 66..70 (primaryAgeAt(60,50,sAge) = 60 + (sAge-50)).
    const currentAge = 60, spouseCurrentAge = 50, primaryRetAge = 65, spouseRetAge = 60;
    const rows = buildRows(spouseCurrentAge, 15); // spouse ages 51..65
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };

    const seed = buildSpouseRetirementSeed({
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.7,
    });

    const keys = Object.keys(seed.spouseContribByAge).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([66, 67, 68, 69, 70]);
    expect(seed.spouseContribByAge[66]).toBe(12_000);
    expect(Object.keys(seed.spouseTaxableIncomeByAge).map(Number).sort((a, b) => a - b)).toEqual(keys);
    expect(Object.keys(seed.spouseIncomeFloorByAge).map(Number).sort((a, b) => a - b)).toEqual(keys);
    // No key at or below the seed's own primary age (65).
    expect(keys.every(k => k > primaryRetAge)).toBe(true);
  });

  it("T3.3 — spouse retires before or at the same time as the primary ⇒ all three maps are empty", () => {
    const currentAge = 60, spouseCurrentAge = 50, primaryRetAge = 65; // spouseAgeAtPrimaryRet = 55
    const rows = buildRows(spouseCurrentAge, 15);
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const seedRow = rows[primaryRetAge - currentAge - 1]; // rows[4], spouse age 55

    for (const spouseRetAge of [54, 55]) { // before, and exactly equal
      const seed = buildSpouseRetirementSeed({
        spouseSimData: rows, spouseCurrentSnapshot: snapshot,
        spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.7,
      });
      expect(seed.spouseContribByAge).toEqual({});
      expect(seed.spouseTaxableIncomeByAge).toEqual({});
      expect(seed.spouseIncomeFloorByAge).toEqual({});
      expect(seed.tradSeed).toBe(seedRow.tradGross);
      expect(seed.rothSeed).toBe(seedRow["Roth IRA"]);
      expect(seed.taxableSeed).toBe(seedRow["Taxable"]);
      expect(seed.hsaSeed).toBe(seedRow["HSA"]);
    }
  });

  it("T3.4 — income floor nets the spouse's own deferral; net rate clamps both directions", () => {
    const currentAge = 60, spouseCurrentAge = 50, primaryRetAge = 61, spouseRetAge = 53;
    // spouseAgeAtPrimaryRet = 50 + (61-60) = 51; gap sAges 52..53 → primaryAges 62..63.
    const rows = [
      { age: 51, c401k: 1_000, c401kEmployee: 800, cHSA: 100, salary: 5_000,
        tradGross: 100_000, "Roth IRA": 0, "Taxable": 0, "HSA": 0 },
      { age: 52, c401k: 20_000, c401kEmployee: 15_000, cHSA: 2_000, salary: 100_000,
        tradGross: 120_000, "Roth IRA": 0, "Taxable": 0, "HSA": 0 },
      { age: 53, c401k: 20_000, c401kEmployee: 15_000, cHSA: 2_000, salary: 100_000,
        tradGross: 140_000, "Roth IRA": 0, "Taxable": 0, "HSA": 0 },
    ];
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };

    // (i) exact net-wages arithmetic.
    const normal = buildSpouseRetirementSeed({
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.7,
    });
    expect(normal.spouseTaxableIncomeByAge[62]).toBe(100_000 - 15_000 - 2_000); // 83,000

    // (ii) a deeply negative net rate (the non-MFJ worked example) clamps to 0 —
    // the floor is never negative; it reduces to just the added-back HSA dollars.
    const negRate = buildSpouseRetirementSeed({
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: -1.74,
    });
    expect(negRate.spouseIncomeFloorByAge[62]).toBe(2_000);
    expect(negRate.spouseIncomeFloorByAge[62]).toBeGreaterThanOrEqual(0);

    // (iii) a net rate above 1 clamps to 1 — the floor is the full net wages + HSA.
    const bigRate = buildSpouseRetirementSeed({
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 5,
    });
    expect(bigRate.spouseIncomeFloorByAge[62]).toBe(83_000 + 2_000);
  });

  it("T3.5 — same-calendar-year retirement reproduces the pre-fix pooled pipeline, at full wiring level", () => {
    const currentAge = 60, spouseCurrentAge = 55, safeRetAge = 65;
    const spouseAgeAtPrimaryRetVal = spouseCurrentAge + (safeRetAge - currentAge); // 60 — old spouseContribEnd formula

    const spouseRows = runSimulation({
      totalYears: 20, currentAge: spouseCurrentAge, currentIncome: 90_000, incomeGrowth: 2,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 6,
      bal401k: 150_000, balRoth: 20_000, balTaxable: 10_000, balHSA: 5_000,
      contrib401k: 15_000, contribRoth: 5_000, contribTaxable: 2_000, contribHSA: 3_000,
      contribEnd401k: spouseAgeAtPrimaryRetVal, contribEndRoth: spouseAgeAtPrimaryRetVal,
      contribEndTaxable: spouseAgeAtPrimaryRetVal, contribEndHSA: spouseAgeAtPrimaryRetVal,
      calcEmployerMatchFn: (salary, contrib) => Math.min(contrib, salary * 0.03),
    });
    const spouseCurrentSnapshot = {
      age: currentAge, tradGross: 150_000, "Roth IRA": 20_000, "Taxable": 10_000, "HSA": 5_000,
    };

    const seed = buildSpouseRetirementSeed({
      spouseSimData: spouseRows, spouseCurrentSnapshot, spouseCurrentAge, currentAge,
      primaryRetAge: safeRetAge, spouseRetAge: spouseAgeAtPrimaryRetVal, spouseNetRate: 0.65,
    });
    // The same-calendar-year case is exactly T3.3's "empty maps" case — re-verified
    // here because this test's whole guarantee depends on it.
    expect(seed.spouseContribByAge).toEqual({});

    const commonRet = {
      tradGross: 1_800_000, roth: 250_000, taxable: 300_000, hsa: 40_000,
      spouseRmdStartAge: 73,
      startAge: safeRetAge, lifeExp: 90, longevityHorizon: safeRetAge + 130, rReal: 0.0096,
      effectiveExpenses: 90_000,
      ssGross: 45_924, ssTaxable: 39_035, ssClaimAge: 67,
      filingStatus: "single", retStateRate: 0, rmdStartAge: 73,
      useTable2: false, spouseCurrentAge, currentAge,
    };

    // NEW pipeline: seed via the builder, engine given spouseRetirementAge + maps.
    const newPipeline = buildRetirementPhase({
      ...commonRet,
      tradGrossSpouse: seed.tradSeed,
      spouseRetirementAge: spouseAgeAtPrimaryRetVal,
      spouseContribByAge: seed.spouseContribByAge,
      spouseTaxableIncomeByAge: seed.spouseTaxableIncomeByAge,
      spouseIncomeFloorByAge: seed.spouseIncomeFloorByAge,
    });

    // OLD pre-fix pipeline: tradGrossSpouse read directly off the seed row (the old
    // `spouseAtRet.tradGross`), no maps, no spouseRetirementAge (engine defaults).
    const phase2End = safeRetAge - currentAge;
    const oldSeedRow = spouseRows[phase2End - 1] ?? spouseCurrentSnapshot;
    const oldPipeline = buildRetirementPhase({
      ...commonRet,
      tradGrossSpouse: oldSeedRow.tradGross ?? 0,
    });

    expect(seed.tradSeed).toBe(oldSeedRow.tradGross ?? 0);
    expect(JSON.stringify(newPipeline.rows)).toBe(JSON.stringify(oldPipeline.rows));
  });

  it("T3.6 — golden anchor: explicit default spouse params reproduce the no-spouse base() fixture exactly", () => {
    const withoutSpouseParams = base();
    const withDefaultSpouseParams = base({
      spouseRetirementAge: null, spouseContribByAge: {},
      spouseTaxableIncomeByAge: {}, spouseIncomeFloorByAge: {},
    });
    expect(JSON.stringify(withDefaultSpouseParams.rows)).toBe(JSON.stringify(withoutSpouseParams.rows));
    expect(withDefaultSpouseParams.yearsSustained).toBe(withoutSpouseParams.yearsSustained);
    expect(withDefaultSpouseParams.rmdSchedule).toEqual(withoutSpouseParams.rmdSchedule);
  });

  // ── Finding 3 (adversarial review, 2026-07-26): nominal spouse gap-year flows
  // in a real-dollar walk. runSimulation compounds nominally; the retirement
  // engine walks at rReal against a flat effectiveExpenses — its balance unit is
  // the purchasing power of the primary's RETIREMENT year. The gap-year maps
  // above were copying each later year's nominal dollars verbatim, so a spouse's
  // paycheck was the only stream whose purchasing power silently grew inside a
  // walk that never re-inflates anything. inflationRate deflates the three maps
  // back to the retirement year; the seeds are untouched (already correct).
  it("T-F3.1 — the bug, verbatim: a 10-year gap deflates the income floor by ~13%, the last year by exactly (1+infl)^10", () => {
    const currentAge = 50, spouseCurrentAge = 40, primaryRetAge = 60, spouseRetAge = 60;
    const rows = buildRows(spouseCurrentAge, 20); // spouse ages 41..60
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const common = {
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.7,
    };
    const nominal = buildSpouseRetirementSeed(common);
    const real = buildSpouseRetirementSeed({ ...common, inflationRate: 2.5 });

    const sumNominal = Object.values(nominal.spouseIncomeFloorByAge).reduce((a, b) => a + b, 0);
    const sumReal = Object.values(real.spouseIncomeFloorByAge).reduce((a, b) => a + b, 0);
    const pctBelow = 1 - sumReal / sumNominal;
    expect(pctBelow).toBeGreaterThan(0.10);
    expect(pctBelow).toBeLessThan(0.16);

    const lastAge = primaryRetAge + 10; // k = 10, the final gap year
    const expectedDeflator = Math.pow(1.025, 10);
    expect(real.spouseContribByAge[lastAge])
      .toBe(Math.round(nominal.spouseContribByAge[lastAge] / expectedDeflator));
  });

  it("T-F3.2 — seam continuity: the first gap-year contribution stays close to the in-seed contribution (locks the deflation base to primaryRetAge)", () => {
    const currentAge = 50, spouseCurrentAge = 40, primaryRetAge = 60, spouseRetAge = 70;
    const rows = buildRows(spouseCurrentAge, 30); // spouse ages 41..70
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const inSeedContrib = rows[9].c401k; // spouse age 50 — the seed row itself (phase2End-1 = 9)

    const seed = buildSpouseRetirementSeed({
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.7,
      inflationRate: 2.5,
    });
    const firstGapContrib = seed.spouseContribByAge[primaryRetAge + 1]; // k = 1
    // Deflating to the retirement year keeps the seam smooth — within a few percent
    // of the in-seed value. A today's-dollar base (k = age - currentAge = 11 here)
    // would put a ~22% cliff at this exact seam instead — the bug this test locks against.
    expect(Math.abs(firstGapContrib - inSeedContrib) / inSeedContrib).toBeLessThan(0.05);
  });

  it("T-F3.3 — inertness: inflationRate omitted / 0 / non-finite all reduce to the pre-fix (undeflated) maps", () => {
    const currentAge = 55, spouseCurrentAge = 45, primaryRetAge = 62, spouseRetAge = 68;
    const rows = buildRows(spouseCurrentAge, 25);
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const common = {
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.6,
    };
    const omitted = buildSpouseRetirementSeed(common);
    const zero = buildSpouseRetirementSeed({ ...common, inflationRate: 0 });
    const nonFinite = buildSpouseRetirementSeed({ ...common, inflationRate: NaN });
    expect(zero.spouseContribByAge).toEqual(omitted.spouseContribByAge);
    expect(nonFinite.spouseContribByAge).toEqual(omitted.spouseContribByAge);
    expect(zero.spouseIncomeFloorByAge).toEqual(omitted.spouseIncomeFloorByAge);
    expect(nonFinite.spouseIncomeFloorByAge).toEqual(omitted.spouseIncomeFloorByAge);
  });

  it("T-F3.5 — monotonicity: a higher inflationRate strictly lowers every gap-year map value", () => {
    const currentAge = 52, spouseCurrentAge = 42, primaryRetAge = 63, spouseRetAge = 71;
    const rows = buildRows(spouseCurrentAge, 30);
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const common = {
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.7,
    };
    const low = buildSpouseRetirementSeed({ ...common, inflationRate: 1.5 });
    const high = buildSpouseRetirementSeed({ ...common, inflationRate: 4.5 });
    const ages = Object.keys(low.spouseContribByAge).map(Number);
    expect(ages.length).toBeGreaterThan(0);
    for (const age of ages) {
      expect(high.spouseContribByAge[age]).toBeLessThan(low.spouseContribByAge[age]);
      expect(high.spouseTaxableIncomeByAge[age]).toBeLessThan(low.spouseTaxableIncomeByAge[age]);
      expect(high.spouseIncomeFloorByAge[age]).toBeLessThan(low.spouseIncomeFloorByAge[age]);
    }
  });

  it("T-F3.6 — seeds unchanged: tradSeed/rothSeed/taxableSeed/hsaSeed never depend on inflationRate (proves the fix touches maps only)", () => {
    const currentAge = 58, spouseCurrentAge = 48, primaryRetAge = 64, spouseRetAge = 69;
    const rows = buildRows(spouseCurrentAge, 20);
    const snapshot = { age: currentAge, tradGross: 0, "Roth IRA": 0, "Taxable": 0, "HSA": 0 };
    const common = {
      spouseSimData: rows, spouseCurrentSnapshot: snapshot,
      spouseCurrentAge, currentAge, primaryRetAge, spouseRetAge, spouseNetRate: 0.65,
    };
    const noInfl = buildSpouseRetirementSeed(common);
    const withInfl = buildSpouseRetirementSeed({ ...common, inflationRate: 6 });
    expect(withInfl.tradSeed).toBe(noInfl.tradSeed);
    expect(withInfl.rothSeed).toBe(noInfl.rothSeed);
    expect(withInfl.taxableSeed).toBe(noInfl.taxableSeed);
    expect(withInfl.hsaSeed).toBe(noInfl.hsaSeed);
  });
});

// ── resolveSpouseRetAge (BUG-127) ───────────────────────────────────────────
// The ONE shared resolver App.jsx's base-plan effectiveSpouseRetAge and
// what-if.js's per-scenario re-seed both call, so "auto" (null) can never be
// interpreted two different ways in the same app.
describe("resolveSpouseRetAge", () => {
  it("null spouseRetirementAge (auto) falls back to primaryRetAge", () => {
    expect(resolveSpouseRetAge({
      spouseRetirementAge: null, primaryRetAge: 58, spouseCurrentAge: 40, lifeExp: 90,
    })).toBe(58);
  });

  it("an explicit spouseRetirementAge is used verbatim, independent of primaryRetAge", () => {
    expect(resolveSpouseRetAge({
      spouseRetirementAge: 75, primaryRetAge: 58, spouseCurrentAge: 40, lifeExp: 90,
    })).toBe(75);
    // Changing primaryRetAge must not move an explicit spouseRetirementAge —
    // this is the exact invariant a what-if "work longer" scenario needs.
    expect(resolveSpouseRetAge({
      spouseRetirementAge: 75, primaryRetAge: 63, spouseCurrentAge: 40, lifeExp: 90,
    })).toBe(75);
  });

  it("the BUG-127 bug directly: auto (null) tracks a LATER scenario retirement age instead of freezing at an earlier one", () => {
    const base = resolveSpouseRetAge({
      spouseRetirementAge: null, primaryRetAge: 55, spouseCurrentAge: 22, lifeExp: 90,
    });
    const scenario = resolveSpouseRetAge({
      spouseRetirementAge: null, primaryRetAge: 60, spouseCurrentAge: 22, lifeExp: 90,
    });
    expect(base).toBe(55);
    // Pre-fix, the scenario call was never made — the frozen base value (55)
    // was reused verbatim, which is LESS than the scenario's own retirement
    // age (60) and would falsely tell buildSpouseRetirementSeed the spouse had
    // already retired 5 years earlier than the scenario itself assumes.
    expect(scenario).toBe(60);
    expect(scenario).toBeGreaterThan(base);
  });

  it("clamps to [spouseCurrentAge+1, max(that, lifeExp-1)] in both directions", () => {
    // Below the floor (spouse already older than the raw candidate).
    expect(resolveSpouseRetAge({
      spouseRetirementAge: 50, primaryRetAge: 50, spouseCurrentAge: 55, lifeExp: 90,
    })).toBe(56);
    // Above the ceiling.
    expect(resolveSpouseRetAge({
      spouseRetirementAge: 95, primaryRetAge: 95, spouseCurrentAge: 60, lifeExp: 90,
    })).toBe(89);
  });

  it("a same-age-or-older spouse never produces an inverted [min,max] clamp range", () => {
    // spouseCurrentAge (89) pushes min (90) past lifeExp-1 (89) — max must
    // widen to min, not stay at the smaller lifeExp-derived value.
    expect(resolveSpouseRetAge({
      spouseRetirementAge: null, primaryRetAge: 60, spouseCurrentAge: 89, lifeExp: 90,
    })).toBe(90);
  });

  it("non-finite spouseCurrentAge/lifeExp fail open (no NaN) rather than corrupting the resolved age (BUG-98 convention)", () => {
    expect(resolveSpouseRetAge({
      spouseRetirementAge: 65, primaryRetAge: 60, spouseCurrentAge: undefined, lifeExp: undefined,
    })).toBe(65);
    expect(resolveSpouseRetAge({
      spouseRetirementAge: null, primaryRetAge: 60, spouseCurrentAge: undefined, lifeExp: undefined,
    })).toBe(60);
    // A non-finite primaryRetAge with no explicit spouseRetirementAge has no
    // sensible numeric fallback — returns NaN rather than fabricating an age,
    // instead of the pre-guard behavior (silently disabling the clamp so an
    // out-of-range NaN could sail through unclamped).
    expect(Number.isNaN(resolveSpouseRetAge({
      spouseRetirementAge: null, primaryRetAge: NaN, spouseCurrentAge: 40, lifeExp: 90,
    }))).toBe(true);
  });
});
