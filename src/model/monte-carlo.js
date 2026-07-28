import { ASSUMPTIONS } from "../config/irs-2026.js";
import { buildRetirementWalkByAccount } from "./retirement-engine.js";

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
// varies only the annual market return: a fresh Gaussian draw per year (mean =
// returnRate, sd = stdDev, both on the NOMINAL return), deflated to a real
// return. It does NOT re-optimize withdrawal order under stress — every path
// draws in the same fixed Taxable → 401k → Roth → HSA order the headline walk
// uses. See MONTE_CARLO_LIMITATION_NOTE — surfaced to the user verbatim.
//
// HOW IT WALKS (Session B port). Every iteration walks through
// buildRetirementWalkByAccount — the SAME per-account engine that produces
// every other headline number (chart, yearsSustained, RMD schedule, Flow-Down,
// conversion benefit; CLAUDE.md rule 2b) — via its `rRealByYear` per-year
// real-return override. So the Range lens can no longer disagree with the
// solid arc line about anything except return risk itself: taxes, RMDs,
// conversions, and the spouse bucket (hold-out + spillover) are re-derived
// per sampled path, not reused from a fixed baseline. Per-year SS/pension/
// spouse-gap-year gating (CLAUDE.md rule 5b) is inherited unchanged from the
// engine, since `walk` is the same input bundle App feeds the headline walk.
//
// CONTRACT. `runMonteCarlo({ walk, returnRate, inflationRate }, options)` —
// `walk` is a complete buildRetirementWalkByAccount parameter object PLUS
// `endAge` (the success horizon; NOT the 130-year longevity cap — App passes
// `safeLifeExp`). `walk.rReal` is not read for the mean path: this function
// derives its own `rRealScalar` from `returnRate`/`inflationRate` (the values
// it also uses to sample each path) and overrides `walk.rReal` with it before
// calling the engine, so there is exactly ONE formula for the mean real return
// feeding both the sampled paths and the stdDev-0 anchor test — no second,
// silently-divergible source. The three spouse gap-year maps
// (spouseContribByAge/spouseTaxableIncomeByAge/spouseIncomeFloorByAge) are
// fixed real dollars (already deflated to the primary's retirement year, BUG-90)
// and pass through UNCHANGED every iteration — a paycheck doesn't move with
// the sampled market return.
//
// Constants (stdDev, iteration count, guideline thresholds) live in
// ASSUMPTIONS (irs-2026.js, rule 1) — modeling heuristics, documented there.

export const MONTE_CARLO_LIMITATION_NOTE =
  "Models return risk only — a fixed real spending path with variable annual market returns. It does not re-optimize withdrawal order under stress. Taxes, RMDs, and Roth conversions are re-derived on each simulated path, but bracket thresholds and Roth-conversion amounts stay fixed at today's plan. A guide to the range of outcomes, not a guarantee.";

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
// inputs:
//   walk           a complete buildRetirementWalkByAccount parameter object
//                   (startAge, tradGross/roth/taxable/hsa, tradGrossSpouse,
//                   effectiveExpenses, ssGross/ssTaxable/ssClaimAge,
//                   pension/pensionStartAge, filingStatus, retStateRate,
//                   conversionByAge, rmdStartAge, useTable2, spouseCurrentAge,
//                   currentAge, moneyEvents, spouseRetirementAge, and the
//                   three spouse gap-year maps) PLUS `endAge` — the success
//                   horizon (App passes safeLifeExp, not the longevity cap).
//   returnRate     mean NOMINAL annual return, as a PERCENT (5 = 5%)
//   inflationRate  as a PERCENT (4 = 4%)
//
// options — { iterations, seed, stdDev }.
//
// Returns { successRate, bands, depletionAgePercentiles, iterations, seed,
//   stdDev, limitation }:
//   successRate  fraction in [0,1] of paths that walked to endAge without
//                depleting (rows.length === nYears AND depletionAge == null —
//                a walk that never ran at all, e.g. a malformed endAge, must
//                NOT be scored as success).
//   bands        [{ age, p10, p25, p50, p75, p90 }] for age in
//                walk.startAge+1..endAge — the balance distribution across
//                paths at each age (depleted paths contribute 0).
//                p10 ≤ … ≤ p90 by construction.
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

  const { walk, returnRate, inflationRate } = inputs ?? {};
  const startAge = walk?.startAge;
  const endAge = walk?.endAge;

  // Guard invalid inputs → well-formed empty result. `endAge` must be finite
  // and strictly after startAge, or buildRetirementWalkByAccount's loop never
  // executes (rows: [], depletionAge: null) — which a bare `depletionAge ==
  // null` success test would silently score as 100% success on zero data.
  // Ages are integers (walked year-by-year) — Number.isInteger, not just
  // isFinite, or a fractional endAge/startAge makes `nYears` fractional and
  // `new Array(nYears)` below throws RangeError. inflationRate <= -100 would
  // divide by zero in `inflFactor` (bot-review finding, PR #64); stdDev must
  // be finite or every sampled return is NaN; iterations must be a genuine
  // positive integer or the `for` loop below runs a different count than the
  // `iterations` this function reports.
  if (
    !walk ||
    !Number.isInteger(startAge) ||
    !Number.isInteger(endAge) ||
    endAge <= startAge ||
    !Number.isFinite(returnRate) ||
    !Number.isFinite(inflationRate) ||
    inflationRate <= -100 ||
    !Number.isFinite(stdDev) ||
    !Number.isSafeInteger(iterations) ||
    iterations <= 0
  ) {
    return emptyResult(seed, stdDev);
  }

  const nYears = endAge - startAge;                 // walked years: startAge+1 .. endAge
  const meanNominal = returnRate / 100;
  const inflFactor = 1 + inflationRate / 100;
  // The ONE formula for the mean real return — feeds both the per-path sampling
  // below AND overrides walk.rReal, so there is no second, silently-divergible
  // source for the scalar fallback the engine would otherwise use.
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
    // Sample this path's per-year REAL returns. Clamped (ASSUMPTIONS, rule 1)
    // so a multi-sigma draw can never send a nominal return to/below -100% —
    // the engine multiplies five account balances by (1 + yearReal) and
    // assumes non-negative results.
    const rRealByYear = new Array(nYears);
    for (let j = 0; j < nYears; j++) {
      const rNominal = Math.max(ASSUMPTIONS.MONTE_CARLO_MIN_NOMINAL_RETURN, meanNominal + stdDev * gaussian());
      rRealByYear[j] = (1 + rNominal) / inflFactor - 1;
    }

    const { rows, depletionAge } = buildRetirementWalkByAccount({
      ...walk,
      rReal: rRealScalar,
      rRealByYear,
    });

    // age → balance for this iteration; default 0 (walk stopped early or never ran).
    // A non-finite row.total (a NaN/Infinity monetary input inside `walk`
    // propagating through the engine — bot-review finding, PR #64) is treated
    // as failure from that age forward: the engine's own depletion check is a
    // numeric comparison (`balEnd <= 0`), which NaN always evaluates false
    // against, so a NaN walk would otherwise run its full length and be
    // silently scored a success with NaN bands. Sanitizing at this single
    // choke point (rather than exhaustively validating every monetary field
    // in `walk`) catches it regardless of which upstream input was bad.
    let badAge = null;
    for (const r of rows) {
      const j = r.age - startAge - 1;
      if (j < 0 || j >= nYears) continue;
      if (Number.isFinite(r.total)) {
        balancesByYear[j][iter] = r.total;
      } else {
        badAge ??= r.age;
        balancesByYear[j][iter] = 0;
      }
    }
    for (let j = 0; j < nYears; j++) {
      if (balancesByYear[j][iter] === undefined) balancesByYear[j][iter] = 0;
    }

    const effectiveDepletionAge = depletionAge ?? badAge;

    // Success requires the walk to have actually run its full course — depleted
    // rows.length < nYears; a malformed/absent endAge (rows.length 0, depletionAge
    // null) must NOT count as success; neither may a NaN-propagating walk.
    const success = effectiveDepletionAge == null && rows.length === nYears;
    if (success) {
      successCount++;
      depletionAges[iter] = Number.POSITIVE_INFINITY;  // survived the whole horizon
    } else {
      // A non-null effectiveDepletionAge is the common case. The fallback
      // chain only matters for a malformed/incomplete walk that reports
      // neither a depletion age nor a bad row (e.g. zero rows) — reporting
      // `endAge` there would bias it toward "survived to the horizon,"
      // exactly backwards for a walk that didn't survive (CodeRabbit finding,
      // PR #64). Fall back to the last row actually walked, or startAge if
      // there were none.
      depletionAges[iter] = effectiveDepletionAge ?? rows[rows.length - 1]?.age ?? startAge;
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
