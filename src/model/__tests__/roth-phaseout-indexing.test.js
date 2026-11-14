// BUG-159 — the Roth IRA income phase-out thresholds are indexed to inflation inside
// runSimulation. Convention: sim year y=1 (age currentAge+1) is the "2026" year and uses
// the unindexed ROTH_PHASEOUT_2026 figures; year y uses (1 + inflation)^(y-1).
import { describe, it, expect } from "vitest";
import { runSimulation, indexedRothPhaseout } from "../simulation.js";
import { calcEmployerMatch } from "../employer-match.js";
import { ROTH_PHASEOUT_2026, ROTH_IRA_LIMIT_2026, CATCHUP_ROTH_2026, CATCHUP_AGE,
         TRAD_401K_LIMIT_2026, CATCHUP_401K_2026 } from "../../config/irs-2026.js";

const em = (s, c) => calcEmployerMatch(s, c, { matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3 });

function sim(over = {}) {
  return runSimulation({
    totalYears: 60, currentAge: 30, currentIncome: 100_000, incomeGrowth: 3, incomeGrowthEndAge: null,
    filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 5,
    bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
    contrib401k: 10_000, contribRoth: 7_000, contribTaxable: 4_000, contribHSA: 3_850,
    contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
    calcEmployerMatchFn: em, ...over,
  });
}
const rothByAge = (rows) => Object.fromEntries(rows.map(r => [r.age, r.cRoth]));

describe("indexedRothPhaseout (pure helper)", () => {
  const po = ROTH_PHASEOUT_2026.single;
  it("year 0, inflation 0 and invalid inflation return the unindexed figures", () => {
    expect(indexedRothPhaseout(po, 4, 0)).toEqual(po);
    expect(indexedRothPhaseout(po, 0, 10)).toEqual(po);
    expect(indexedRothPhaseout(po, NaN, 10)).toEqual(po);
    expect(indexedRothPhaseout(po, -100, 10)).toEqual(po);
  });
  it("compounds by (1+i)^years", () => {
    const o = indexedRothPhaseout(po, 4, 3);
    expect(o.start).toBeCloseTo(153_000 * 1.04 ** 3, 6);
    expect(o.end).toBeCloseTo(168_000 * 1.04 ** 3, 6);
  });
});

describe("runSimulation Roth phase-out indexing (BUG-159)", () => {
  it("inflationRate 0 (hand-built default) reproduces the OLD frozen schedule exactly", () => {
    const r = rothByAge(sim());               // default param
    expect(r).toEqual(rothByAge(sim({ inflationRate: 0 })));
    expect(r[50]).toBe(7000);
    expect(r[51]).toBe(5270);
    expect(r[52]).toBe(2507);
    for (let a = 53; a <= 65; a++) expect(r[a]).toBe(0);
  });

  it("at the shipped default (4% inflation, 3% raises) Roth keeps being contributed through age 65", () => {
    const r = rothByAge(sim({ inflationRate: 4 }));
    // The thresholds grow 4%/yr, the salary 3%/yr: real income FALLS, so never phased out.
    for (let a = 31; a <= 65; a++) expect(r[a]).toBe(7000);
    expect(r[66]).toBe(0);                    // contribEndRoth still ends it
  });

  it("exact partial phase-out inside the indexed band (derived independently from the thresholds)", () => {
    // $140k, 3% raises, 2% inflation, single: in-band around age 45-50.
    const over = { currentIncome: 140_000, inflationRate: 2 };
    const rows = sim(over);
    let bandYears = 0;
    for (const row of rows.filter(x => x.age <= 65)) {
      const y = row.age - 30;
      const g = 1.03 ** (y - 1);
      const catchup = row.age >= CATCHUP_AGE;
      const elective = catchup ? TRAD_401K_LIMIT_2026 + CATCHUP_401K_2026 : TRAD_401K_LIMIT_2026;
      const magi = 140_000 * g - Math.min(10_000 * g, elective) - 3_850;
      const f = 1.02 ** (y - 1);
      const start = 153_000 * f, end = 168_000 * f;
      const cap = catchup ? ROTH_IRA_LIMIT_2026 + CATCHUP_ROTH_2026 : ROTH_IRA_LIMIT_2026;
      let want;
      if (magi >= end) want = 0;
      else if (magi <= start) want = Math.min(7000, cap);
      else { want = Math.round(Math.min(7000, cap * (end - magi) / (end - start))); bandYears++; }
      expect(row.cRoth).toBe(want);
    }
    expect(bandYears).toBeGreaterThan(0);     // the case actually exercises the band
  });

  it("higher inflation phases out later (or never) than lower inflation", () => {
    const firstZero = (rows) => rows.find(r => r.age <= 65 && r.cRoth === 0)?.age ?? Infinity;
    const base = { currentIncome: 140_000 };
    const lo = firstZero(sim({ ...base, inflationRate: 1 }));
    const hi = firstZero(sim({ ...base, inflationRate: 3 }));
    const none = firstZero(sim({ ...base, inflationRate: 0 }));
    expect(lo).toBeGreaterThanOrEqual(none);
    expect(hi).toBeGreaterThan(lo);
  });

  it("MFJ uses the indexed MFJ thresholds too (combined income)", () => {
    const over = { filingStatus: "mfj", currentIncome: 150_000, spouseIncome: 120_000 };
    const a = rothByAge(sim({ ...over, inflationRate: 0 }));
    const b = rothByAge(sim({ ...over, inflationRate: 4 }));
    expect(Object.values(b).reduce((s, v) => s + v, 0)).toBeGreaterThan(Object.values(a).reduce((s, v) => s + v, 0));
  });
});
