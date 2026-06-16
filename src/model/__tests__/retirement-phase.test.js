import { describe, it, expect } from "vitest";
import { buildRetirementPhase } from "../retirement-phase.js";

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
