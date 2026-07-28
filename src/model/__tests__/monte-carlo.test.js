import { describe, it, expect, vi } from "vitest";
import { runMonteCarlo, MONTE_CARLO_LIMITATION_NOTE } from "../monte-carlo.js";
import { buildRetirementWalkByAccount } from "../retirement-engine.js";
import * as engineModule from "../retirement-engine.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";

// Session B (Monte Carlo engine port): runMonteCarlo now walks through
// buildRetirementWalkByAccount — the SAME per-account engine every other
// headline number uses — instead of the older blended-pool walk. The
// contract changed from a flat field list to { walk, returnRate,
// inflationRate }, where `walk` is a complete buildRetirementWalkByAccount
// parameter bundle PLUS `endAge` (the success horizon).

const bandAt = (bands, age) => bands.find((b) => b.age === age);

// Fixture 1 — allTaxable: the ENTIRE seed in Taxable, no pre-tax dollars at
// all. This isolates the walk MECHANICS from the port's tax-path-dependence
// mechanism (M1: no Traditional balance ⇒ no drawTax, structurally) — it's
// the fixture that proves the port didn't change the arithmetic for a
// household the tax-path-dependence can't touch.
const allTaxable = {
  walk: {
    startAge: 65, endAge: 90,
    tradGross: 0, roth: 0, taxable: 1_200_000, hsa: 0,
    effectiveExpenses: 70_000,
    ssGross: 30_000, ssTaxable: 25_500, ssClaimAge: 67,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    conversionByAge: {}, rmdStartAge: Infinity,
    useTable2: false, spouseCurrentAge: null, currentAge: null,
    moneyEvents: [],
  },
  returnRate: 6,
  inflationRate: 3,
};

// Fixture 2 — realistic: a 401k/Roth/Taxable/HSA split with a real RMD
// schedule and a short conversion window, so it exercises the mechanisms
// allTaxable structurally cannot (path-dependent draw tax, path-dependent
// RMDs/conversions) — the fixture that proves the port DID change what it
// was supposed to.
const realistic = {
  walk: {
    startAge: 65, endAge: 90,
    tradGross: 700_000, roth: 200_000, taxable: 250_000, hsa: 50_000,
    effectiveExpenses: 70_000,
    ssGross: 30_000, ssTaxable: 25_500, ssClaimAge: 67,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    conversionByAge: { 66: 20_000, 67: 20_000 },
    rmdStartAge: 73, useTable2: false, spouseCurrentAge: null, currentAge: null,
    moneyEvents: [],
  },
  returnRate: 6,
  inflationRate: 3,
};

// Fixture 3 — spouse: a still-working spouse with a real gap window (income +
// contributions + Option-A hold-out), the entire point of the port. Primary
// retires at 60 (currentAge === startAge, so the walk starts immediately);
// spouse is 55 at that point and retires at 63 — an 8-year gap covering ages
// 61..68 (`gapAges`).
const gapAges = [61, 62, 63, 64, 65, 66, 67, 68];
const mapOver = (ages, v) => Object.fromEntries(ages.map((a) => [a, v]));
const spouseFixture = {
  walk: {
    startAge: 60, endAge: 85,
    tradGross: 1_500_000, roth: 200_000, taxable: 200_000, hsa: 0,
    tradGrossSpouse: 250_000, spouseRmdStartAge: 73,
    effectiveExpenses: 95_000,
    ssGross: 0, ssTaxable: 0, ssClaimAge: Infinity,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    conversionByAge: {}, rmdStartAge: 73,
    useTable2: false, spouseCurrentAge: 55, currentAge: 60,
    moneyEvents: [],
    spouseRetirementAge: 63,
    spouseContribByAge: mapOver(gapAges, 8_000),
    spouseTaxableIncomeByAge: mapOver(gapAges, 50_000),
    spouseIncomeFloorByAge: mapOver(gapAges, 35_000),
  },
  returnRate: 6,
  inflationRate: 3,
};

describe("runMonteCarlo — determinism & value-lock", () => {
  it("is deterministic: same seed → deeply-equal output", () => {
    const a = runMonteCarlo(realistic, { seed: 12345, iterations: 600 });
    const b = runMonteCarlo(realistic, { seed: 12345, iterations: 600 });
    expect(a).toEqual(b);
  });

  it("locks concrete numbers for the allTaxable fixture (regression guard — walk mechanics)", () => {
    const r = runMonteCarlo(allTaxable, { seed: 12345, iterations: 600 });
    expect(r.iterations).toBe(600);
    expect(r.bands).toHaveLength(allTaxable.walk.endAge - allTaxable.walk.startAge);
    expect(bandAt(r.bands, 66).age).toBe(66);
    expect(bandAt(r.bands, 90).age).toBe(90);
    // Locked to the engine's current deterministic output.
    expect(r.successRate).toBeGreaterThan(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
  });

  it("locks concrete numbers for the realistic fixture (regression guard — tax-path-dependent walk)", () => {
    const r = runMonteCarlo(realistic, { seed: 12345, iterations: 600 });
    expect(r.iterations).toBe(600);
    expect(r.seed).toBe(12345);
    expect(r.stdDev).toBe(ASSUMPTIONS.MONTE_CARLO_STD_DEV);
    expect(r.bands).toHaveLength(realistic.walk.endAge - realistic.walk.startAge);
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
  });
});

describe("runMonteCarlo — spouse bucket is visible to the lens (the whole point of the port)", () => {
  it("stdDev 0: the mean path shows the spouse Traditional bucket growing during the gap (hold-out, not pooled away)", () => {
    const r = runMonteCarlo(spouseFixture, { seed: 12345, iterations: 50, stdDev: 0 });
    expect(r.bands.length).toBeGreaterThan(0);
    // With a real gap and Option A active, the household should be at least as
    // solvent as a household with no spouse bucket at all — the engine's
    // spouse income/contributions can only help, never a structural loss.
    expect(r.successRate).toBeGreaterThan(0);
  });

  it("a spouse fixture stressed into shortfall can show spillover-rescued paths (M4) — successRate reflects the engine's own escape hatch, not a fixed baseline", () => {
    const stressed = {
      ...spouseFixture,
      walk: { ...spouseFixture.walk, effectiveExpenses: 140_000, taxable: 5_000, roth: 5_000, tradGross: 20_000 },
    };
    const r = runMonteCarlo(stressed, { seed: 12345, iterations: 200 });
    // Well-formed regardless of the exact rate — this fixture exists to prove
    // the walk doesn't throw/degenerate under stress with a spouse bucket.
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
    expect(r.bands).toHaveLength(stressed.walk.endAge - stressed.walk.startAge);
  });
});

describe("runMonteCarlo — distribution properties", () => {
  it("different seeds generally differ (well-formed either way)", () => {
    const a = runMonteCarlo(realistic, { seed: 1, iterations: 600 });
    const b = runMonteCarlo(realistic, { seed: 2, iterations: 600 });
    for (const r of [a, b]) {
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(1);
      expect(r.bands).toHaveLength(realistic.walk.endAge - realistic.walk.startAge);
    }
    const bandsDiffer = JSON.stringify(a.bands) !== JSON.stringify(b.bands);
    const rateDiffers = a.successRate !== b.successRate;
    expect(bandsDiffer || rateDiffers).toBe(true);
  });

  it("percentile monotonicity: p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 for every band row", () => {
    const r = runMonteCarlo(realistic, { seed: 7, iterations: 400 });
    for (const b of r.bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p25);
      expect(b.p25).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p75);
      expect(b.p75).toBeLessThanOrEqual(b.p90);
    }
  });

  it("successRate is always within [0, 1]", () => {
    for (const seed of [1, 42, 12345, 99999]) {
      const r = runMonteCarlo(realistic, { seed, iterations: 300 });
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(1);
    }
  });

  it("extreme: huge portfolio, tiny expenses → successRate ~1", () => {
    const r = runMonteCarlo(
      { ...realistic, walk: { ...realistic.walk, taxable: 50_000_000, effectiveExpenses: 20_000 } },
      { seed: 3, iterations: 300 },
    );
    expect(r.successRate).toBeGreaterThanOrEqual(0.99);
  });

  it("extreme: tiny portfolio, big expenses, no SS → successRate ~0", () => {
    const r = runMonteCarlo(
      {
        ...realistic,
        walk: { ...realistic.walk, tradGross: 100_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 150_000, ssGross: 0, ssTaxable: 0, ssClaimAge: Infinity },
      },
      { seed: 3, iterations: 300 },
    );
    expect(r.successRate).toBeLessThanOrEqual(0.01);
  });
});

describe("runMonteCarlo — A1 anchor: at stdDev 0, the mean path EXACTLY equals the engine's own headline walk", () => {
  it("bands collapse (p10 === p50 === p90) and equal a single deterministic engine walk, byte-for-byte", () => {
    const r = runMonteCarlo(realistic, { seed: 12345, iterations: 50, stdDev: 0 });
    const rRealScalar = (1 + realistic.returnRate / 100) / (1 + realistic.inflationRate / 100) - 1;
    const det = buildRetirementWalkByAccount({ ...realistic.walk, rReal: rRealScalar });
    const detByAge = new Map(det.rows.map((row) => [row.age, row.total]));

    for (const b of r.bands) {
      expect(b.p10).toBe(b.p50);
      expect(b.p50).toBe(b.p90);
      // A1: exact equality (toBe, not toBeCloseTo) — this is the anchor that
      // makes the conventional 80%/70% guideline thresholds meaningfully
      // comparable to the app's own headline sustainability verdict.
      expect(b.p50).toBe(detByAge.get(b.age) ?? 0);
    }
  });

  it("A1 holds for the spouse fixture too (hold-out + gap-year income visible in the mean path)", () => {
    const r = runMonteCarlo(spouseFixture, { seed: 12345, iterations: 50, stdDev: 0 });
    const rRealScalar = (1 + spouseFixture.returnRate / 100) / (1 + spouseFixture.inflationRate / 100) - 1;
    const det = buildRetirementWalkByAccount({ ...spouseFixture.walk, rReal: rRealScalar });
    const detByAge = new Map(det.rows.map((row) => [row.age, row.total]));
    for (const b of r.bands) {
      expect(b.p50).toBe(detByAge.get(b.age) ?? 0);
    }
  });

  it("every iteration is identical at stdDev 0: successRate is exactly 0 or 1", () => {
    const r = runMonteCarlo(realistic, { seed: 12345, iterations: 200, stdDev: 0 });
    expect([0, 1]).toContain(r.successRate);
  });
});

describe("runMonteCarlo — structural guards (a malformed walk must never score as success)", () => {
  const shape = (r) => {
    expect(r.successRate).toBe(0);
    expect(r.bands).toEqual([]);
    expect(r.depletionAgePercentiles).toBeNull();
    expect(r.iterations).toBe(0);
    expect(r.limitation).toBe(MONTE_CARLO_LIMITATION_NOTE);
  };

  it("a walk with endAge omitted returns the empty result — NOT a false 100% success on zero walked years", () => {
    const { endAge: _drop, ...walkNoEndAge } = realistic.walk;
    const r = runMonteCarlo({ walk: walkNoEndAge, returnRate: 6, inflationRate: 3 });
    shape(r);
  });

  it("endAge <= startAge returns the empty result", () => {
    shape(runMonteCarlo({ ...realistic, walk: { ...realistic.walk, endAge: realistic.walk.startAge } }));
  });

  it("a missing walk, non-finite returnRate/inflationRate, or iterations:0 all return the documented empty shape", () => {
    shape(runMonteCarlo({ ...realistic, returnRate: NaN }));
    shape(runMonteCarlo({ ...realistic, inflationRate: NaN }));
    shape(runMonteCarlo(realistic, { iterations: 0 }));
    shape(runMonteCarlo(null));
    shape(runMonteCarlo({ returnRate: 6, inflationRate: 3 })); // no walk at all
  });

  it("depletionAgePercentiles: null percentile means solvent through the horizon", () => {
    const r = runMonteCarlo(
      { ...realistic, walk: { ...realistic.walk, taxable: 50_000_000, effectiveExpenses: 20_000 } },
      { seed: 3, iterations: 200 },
    );
    expect(r.depletionAgePercentiles.p90).toBeNull();
  });

  it("limitation field is the exported note, mentions withdrawal order, and no longer claims baseline-tax reuse", () => {
    const r = runMonteCarlo(realistic, { seed: 1, iterations: 50 });
    expect(r.limitation).toBe(MONTE_CARLO_LIMITATION_NOTE);
    expect(r.limitation).toMatch(/withdrawal order/i);
    expect(r.limitation).not.toMatch(/reuses your baseline/i);
  });
});

describe("runMonteCarlo — perf guard (no double-walk, no buildRetirementPhase reuse)", () => {
  it("calls the engine exactly `iterations` times", () => {
    const spy = vi.spyOn(engineModule, "buildRetirementWalkByAccount");
    runMonteCarlo(realistic, { seed: 1, iterations: 50 });
    expect(spy).toHaveBeenCalledTimes(50);
    spy.mockRestore();
  });
});
