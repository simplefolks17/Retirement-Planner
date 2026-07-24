import { ASSUMPTIONS } from "../config/irs-2026.js";
import { buildRetirementDrawdown } from "./retirement-drawdown.js";

// ── Monte Carlo "Range" lens ─────────────────────────────────────────────────
//
// A pure, DETERMINISTIC seeded Monte Carlo engine that models the RANGE of
// retirement outcomes under variable annual market returns.
//
// DETERMINISM. There is no Math.random anywhere. A small mulberry32 PRNG is
// seeded ONCE per run and drawn sequentially across every iteration, so the same
// (inputs, seed, iterations, stdDev) always produces byte-identical output — the
// lens is reproducible and its numbers can be value-locked in tests.
//
// WHAT IT MODELS — RETURN RISK ONLY (honesty label). Each iteration keeps the
// SAME fixed real spending path (expenses net of SS/pension, per-year gated) and
// the SAME baseline year-by-year RMD/conversion tax estimates, and varies only
// the annual market return: a fresh Gaussian draw per year (mean = returnRate,
// sd = stdDev, both on the NOMINAL return), deflated to a real return. It does
// NOT re-optimize withdrawal order under stress and does NOT re-derive taxes per
// path. See MONTE_CARLO_LIMITATION_NOTE — surfaced to the user verbatim.
//
// HOW IT WALKS. Every iteration reuses buildRetirementDrawdown — the blended
// secondary retirement walk, the SAME walk the what-if delta uses — via its
// optional `rRealByYear` per-year real-return override. So the lens is
// consistent with those secondary surfaces. It is NOT the per-account engine
// that produces headline numbers, and it never feeds any headline number — it is
// a display-only confidence lens. Per-year SS/pension gating (CLAUDE.md rule 5b)
// is inherited unchanged from buildRetirementDrawdown.
//
// Constants (stdDev, iteration count, guideline thresholds) live in
// ASSUMPTIONS (irs-2026.js, rule 1) — modeling heuristics, documented there.

export const MONTE_CARLO_LIMITATION_NOTE =
  "Models return risk only — a fixed real spending path with variable annual market returns. It does not re-optimize withdrawal order under stress, and it reuses your baseline year-by-year RMD and conversion tax estimates. A guide to the range of outcomes, not a guarantee.";

// mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Deterministic from a
// single uint32 seed; returns a float in [0, 1). No global state.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller standard-normal generator over a given uniform PRNG, with a cached
// spare value (each Box-Muller step yields TWO independent normals). Returns a
// closure so successive calls consume the PRNG sequentially and deterministically.
function makeGaussian(rand) {
  let spare = null;
  return function gaussian() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    // Guard u1 away from 0 so Math.log is finite.
    let u1 = rand();
    const u2 = rand();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2 * Math.log(u1));
    spare = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  };
}

// Nearest-rank percentile over an ASCENDING-sorted numeric array.
// index = clamp(round((p/100)*(n-1)), 0, n-1). Monotonic in p by construction,
// so p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 always holds.
function percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  let idx = Math.round((p / 100) * (n - 1));
  if (idx < 0) idx = 0;
  if (idx > n - 1) idx = n - 1;
  return sortedAsc[idx];
}

function emptyResult(seed, stdDev) {
  return {
    successRate: 0,
    bands: [],
    depletionAgePercentiles: null,
    iterations: 0,
    seed,
    stdDev,
    limitation: MONTE_CARLO_LIMITATION_NOTE,
  };
}

// Run the Monte Carlo Range lens.
//
// inputs — provided entirely by the caller (App.jsx); this function reaches for
//   nothing else:
//     startBal            gross portfolio at retirement (totalAtRet)
//     startAge            safeRetAge
//     endAge              safeLifeExp — the band-series AND the success horizon
//     returnRate          mean NOMINAL annual return, as a PERCENT (5 = 5%)
//     inflationRate       as a PERCENT (4 = 4%)
//     effectiveExpenses   fixed real annual spend
//     ssAmount, ssClaimAge, pensionAmount, pensionStartAge  (rule 5b gated by the walk)
//     rmdTaxByAge, conversionTaxByAge  baseline per-age tax maps
//     moneyEvents         one-time / duration events
//
// options — { iterations, seed, stdDev }.
//
// Returns { successRate, bands, depletionAgePercentiles, iterations, seed,
//   stdDev, limitation }:
//   successRate  fraction in [0,1] of paths still solvent at endAge.
//   bands        [{ age, p10, p25, p50, p75, p90 }] for age in startAge+1..endAge
//                — the balance distribution across paths at each age (depleted
//                paths contribute 0). p10 ≤ … ≤ p90 by construction.
//   depletionAgePercentiles  { p10, p25, p50, p75, p90 } of the depletion age;
//                a null percentile means that share of paths NEVER deplete within
//                the horizon (they were represented by +Infinity and mapped back
//                to null).
export function runMonteCarlo(inputs, options = {}) {
  const {
    iterations = ASSUMPTIONS.MONTE_CARLO_ITERATIONS,
    seed = 12345,
    stdDev = ASSUMPTIONS.MONTE_CARLO_STD_DEV,
  } = options;

  const {
    startBal,
    startAge,
    endAge,
    returnRate,
    inflationRate,
    effectiveExpenses,
    ssAmount = 0,
    ssClaimAge = Infinity,
    pensionAmount = 0,
    pensionStartAge = Infinity,
    rmdTaxByAge = {},
    conversionTaxByAge = {},
    moneyEvents = [],
  } = inputs ?? {};

  // Guard invalid inputs → well-formed empty result.
  if (
    !Number.isFinite(startBal) ||
    !Number.isFinite(startAge) ||
    !Number.isFinite(endAge) ||
    endAge <= startAge ||
    !(iterations > 0)
  ) {
    return emptyResult(seed, stdDev);
  }

  const nYears = endAge - startAge;                 // walked years: startAge+1 .. endAge
  const meanNominal = returnRate / 100;
  const inflFactor = 1 + inflationRate / 100;
  // Scalar real return used as the per-year fallback and the deterministic mean path.
  const rRealScalar = (1 + meanNominal) / inflFactor - 1;

  const rand = mulberry32(seed);
  const gaussian = makeGaussian(rand);

  // Per-age balance samples across iterations (index j = age offset 0..nYears-1,
  // age = startAge + 1 + j). Depleted-early ages get 0.
  const balancesByYear = Array.from({ length: nYears }, () => new Array(iterations));
  // Per-iteration depletion age (or +Infinity sentinel when it survives to endAge).
  const depletionAges = new Array(iterations);
  let successCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Sample this path's per-year REAL returns.
    const rRealByYear = new Array(nYears);
    for (let j = 0; j < nYears; j++) {
      const rNominal = meanNominal + stdDev * gaussian();
      rRealByYear[j] = (1 + rNominal) / inflFactor - 1;
    }

    const { rows, depletionAge } = buildRetirementDrawdown({
      startBal,
      startAge,
      endAge,
      rReal: rRealScalar,
      effectiveExpenses,
      ssAmount,
      ssClaimAge,
      pensionAmount,
      pensionStartAge,
      rmdTaxByAge,
      conversionTaxByAge,
      moneyEvents,
      rRealByYear,
    });

    // age → balance for this iteration; default 0 (walk stopped early).
    const balByAge = new Map();
    for (const r of rows) balByAge.set(r.age, r.total);
    for (let j = 0; j < nYears; j++) {
      const age = startAge + 1 + j;
      balancesByYear[j][iter] = balByAge.get(age) ?? 0;
    }

    if (depletionAge == null) {
      successCount++;
      depletionAges[iter] = Number.POSITIVE_INFINITY;  // survived the whole horizon
    } else {
      depletionAges[iter] = depletionAge;
    }
  }

  const successRate = successCount / iterations;

  // Percentile bands per age.
  const bands = [];
  for (let j = 0; j < nYears; j++) {
    const col = balancesByYear[j].slice().sort((a, b) => a - b);
    bands.push({
      age: startAge + 1 + j,
      p10: percentile(col, 10),
      p25: percentile(col, 25),
      p50: percentile(col, 50),
      p75: percentile(col, 75),
      p90: percentile(col, 90),
    });
  }

  // Depletion-age percentiles. Surviving paths sort last (+Infinity); an Infinity
  // percentile maps to null = "still solvent at endAge for that share of paths".
  const depSorted = depletionAges.slice().sort((a, b) => a - b);
  const mapInf = (v) => (Number.isFinite(v) ? v : null);
  const depletionAgePercentiles = {
    p10: mapInf(percentile(depSorted, 10)),
    p25: mapInf(percentile(depSorted, 25)),
    p50: mapInf(percentile(depSorted, 50)),
    p75: mapInf(percentile(depSorted, 75)),
    p90: mapInf(percentile(depSorted, 90)),
  };

  return {
    successRate,
    bands,
    depletionAgePercentiles,
    iterations,
    seed,
    stdDev,
    limitation: MONTE_CARLO_LIMITATION_NOTE,
  };
}
