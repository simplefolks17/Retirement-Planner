import { describe, it, expect } from "vitest";
import { buildRetirementPhase, buildConversionByAge, buildRmdTaxByAge } from "../retirement-phase.js";
import { buildRetirementWalkByAccount } from "../retirement-engine.js";
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
