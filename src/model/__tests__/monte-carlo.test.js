import { describe, it, expect } from "vitest";
import { runMonteCarlo, MONTE_CARLO_LIMITATION_NOTE } from "../monte-carlo.js";
import { buildRetirementDrawdown } from "../retirement-drawdown.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";

// A representative, borderline-ish retirement scenario: a 25-year horizon with
// meaningful market variance so percentiles and success rate are exercised.
const base = {
  startBal: 1_200_000,
  startAge: 65,
  endAge: 90,
  returnRate: 6,        // percent, nominal
  inflationRate: 3,     // percent
  effectiveExpenses: 70_000,
  ssAmount: 30_000,
  ssClaimAge: 67,
  pensionAmount: 0,
  pensionStartAge: Infinity,
};

const bandAt = (bands, age) => bands.find((b) => b.age === age);

describe("runMonteCarlo — determinism & value-lock", () => {
  it("is deterministic: same seed → deeply-equal output", () => {
    const a = runMonteCarlo(base, { seed: 12345, iterations: 600 });
    const b = runMonteCarlo(base, { seed: 12345, iterations: 600 });
    expect(a).toEqual(b);
  });

  it("locks concrete numbers for a fixed input + seed (regression guard)", () => {
    const r = runMonteCarlo(base, { seed: 12345, iterations: 600 });
    expect(r.iterations).toBe(600);
    expect(r.seed).toBe(12345);
    expect(r.stdDev).toBe(ASSUMPTIONS.MONTE_CARLO_STD_DEV);
    expect(r.bands).toHaveLength(base.endAge - base.startAge); // 25 walked years
    expect(bandAt(r.bands, 66).age).toBe(66);
    expect(bandAt(r.bands, 90).age).toBe(90);

    // Locked to the engine's current deterministic output.
    expect(r.successRate).toBeCloseTo(0.9033, 3);
    expect(bandAt(r.bands, 70).p50).toBeCloseTo(1_137_253, -1);
    expect(bandAt(r.bands, 80).p50).toBeCloseTo(936_539, -1);
    expect(bandAt(r.bands, 90).p50).toBeCloseTo(698_773, -1);
  });
});

describe("runMonteCarlo — distribution properties", () => {
  it("different seeds generally differ (well-formed either way)", () => {
    const a = runMonteCarlo(base, { seed: 1, iterations: 600 });
    const b = runMonteCarlo(base, { seed: 2, iterations: 600 });
    // Both well-formed.
    for (const r of [a, b]) {
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(1);
      expect(r.bands).toHaveLength(base.endAge - base.startAge);
    }
    // Robust: at least one of successRate OR the band arrays must differ.
    const bandsDiffer = JSON.stringify(a.bands) !== JSON.stringify(b.bands);
    const rateDiffers = a.successRate !== b.successRate;
    expect(bandsDiffer || rateDiffers).toBe(true);
  });

  it("percentile monotonicity: p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 for every band row", () => {
    const r = runMonteCarlo(base, { seed: 7, iterations: 400 });
    for (const b of r.bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p25);
      expect(b.p25).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p75);
      expect(b.p75).toBeLessThanOrEqual(b.p90);
    }
  });

  it("successRate is always within [0, 1]", () => {
    for (const seed of [1, 42, 12345, 99999]) {
      const r = runMonteCarlo(base, { seed, iterations: 300 });
      expect(r.successRate).toBeGreaterThanOrEqual(0);
      expect(r.successRate).toBeLessThanOrEqual(1);
    }
  });

  it("extreme: huge portfolio, tiny expenses → successRate ~1", () => {
    const r = runMonteCarlo(
      { ...base, startBal: 50_000_000, effectiveExpenses: 20_000 },
      { seed: 3, iterations: 300 },
    );
    expect(r.successRate).toBeGreaterThanOrEqual(0.99);
  });

  it("extreme: tiny portfolio, big expenses, no SS → successRate ~0", () => {
    const r = runMonteCarlo(
      {
        ...base,
        startBal: 200_000,
        effectiveExpenses: 150_000,
        ssAmount: 0,
        ssClaimAge: Infinity,
      },
      { seed: 3, iterations: 300 },
    );
    expect(r.successRate).toBeLessThanOrEqual(0.01);
  });
});

describe("runMonteCarlo — stdDev 0 (zero variance) matches the deterministic walk", () => {
  it("every iteration is identical: successRate is exactly 0 or 1", () => {
    const r = runMonteCarlo(base, { seed: 12345, iterations: 200, stdDev: 0 });
    expect([0, 1]).toContain(r.successRate);
  });

  it("bands collapse (p10 === p50 === p90) and equal a single deterministic walk", () => {
    const r = runMonteCarlo(base, { seed: 12345, iterations: 200, stdDev: 0 });
    const rReal = (1 + base.returnRate / 100) / (1 + base.inflationRate / 100) - 1;
    const det = buildRetirementDrawdown({ ...base, rReal });
    const detByAge = new Map(det.rows.map((row) => [row.age, row.total]));

    for (const b of r.bands) {
      // zero variance → no spread at any age
      expect(b.p10).toBe(b.p50);
      expect(b.p50).toBe(b.p90);
      // the mean path equals the headline scalar walk (0 where depleted)
      expect(b.p50).toBe(detByAge.get(b.age) ?? 0);
    }
  });
});

describe("runMonteCarlo — guards & metadata", () => {
  it("invalid inputs return the documented empty result shape", () => {
    const shape = (r) => {
      expect(r.successRate).toBe(0);
      expect(r.bands).toEqual([]);
      expect(r.depletionAgePercentiles).toBeNull();
      expect(r.iterations).toBe(0);
      expect(r.limitation).toBe(MONTE_CARLO_LIMITATION_NOTE);
    };
    shape(runMonteCarlo({ ...base, startBal: NaN }));
    shape(runMonteCarlo({ ...base, endAge: 65 })); // endAge <= startAge
    shape(runMonteCarlo(base, { iterations: 0 }));
    shape(runMonteCarlo(null));
  });

  it("depletionAgePercentiles: null percentile means solvent through the horizon", () => {
    // Comfortable plan: most/all paths survive → high percentiles are null.
    const r = runMonteCarlo(
      { ...base, startBal: 50_000_000, effectiveExpenses: 20_000 },
      { seed: 3, iterations: 200 },
    );
    expect(r.depletionAgePercentiles.p90).toBeNull();
  });

  it("limitation field is the exported note and mentions withdrawal order", () => {
    const r = runMonteCarlo(base, { seed: 1, iterations: 50 });
    expect(r.limitation).toBe(MONTE_CARLO_LIMITATION_NOTE);
    expect(r.limitation).toMatch(/withdrawal order/i);
  });
});
