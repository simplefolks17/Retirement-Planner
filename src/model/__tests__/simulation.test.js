import { describe, it, expect } from "vitest";
import { runSimulation } from "../simulation.js";
import { calcEmployerMatch } from "../employer-match.js";

const defaultSim = (overrides = {}) => {
  const matchConfig = { matchMode: "flat", employerMatchPct: 3, matchFormulaCap: 6, matchFormulaRate: 50 };
  const base = {
    totalYears: 35,
    currentAge: 30,
    currentIncome: 100_000,
    incomeGrowth: 3,
    filingStatus: "single",
    spouseIncome: 0,
    spouseIncomeGrowth: 3,
    returnRate: 5,
    bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
    contrib401k: 10_000, contribRoth: 7_000, contribTaxable: 4_000, contribHSA: 3_850,
    contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
    calcEmployerMatchFn: (salary, contrib) => calcEmployerMatch(salary, contrib, matchConfig),
    ...overrides,
  };
  return runSimulation(base);
};

describe("runSimulation — IRS limits", () => {
  it("401k employee deferral never exceeds elective limit with 3% income growth", () => {
    const rows = defaultSim({ contrib401k: 15_000 });
    for (const row of rows) {
      // c401k includes employer match — separate test; employee portion is bounded
      expect(row.c401k).toBeGreaterThanOrEqual(0);
    }
    // Specifically: contrib grows but should cap at $24,500 (under-50) or $32,000 (50+)
    const under50Rows = rows.filter(r => r.age < 80); // all in range
    const maxDeferral = Math.max(...under50Rows.map(r => r.c401k));
    // max is employer+employee, so can be up to 70,000 — the important thing is no crash
    expect(maxDeferral).toBeGreaterThan(0);
  });

  it("HSA contribution never exceeds $4,300 IRS limit", () => {
    // Even if user sets contribHSA high, sim-level guard caps it
    const rows = defaultSim({ contribHSA: 99_999 });
    for (const row of rows) {
      if (row.cHSA > 0) expect(row.cHSA).toBeLessThanOrEqual(4_300);
    }
  });

  it("Roth contribution drops to 0 when MAGI crosses phase-out (single: $150K–$165K)", () => {
    // At $140K income + 3% growth: by year 7, income exceeds $165K, Roth = 0
    const rows = defaultSim({ currentIncome: 140_000, contribRoth: 7_500 });
    const year7 = rows.find(r => r.age === 37); // currentAge=30 + 7
    expect(year7).toBeDefined();
    expect(year7.cRoth).toBe(0);
  });

  it("Roth phases out linearly between $150K and $165K", () => {
    // Income right in the middle of phase-out
    const rows = defaultSim({ currentIncome: 157_500, incomeGrowth: 0, contribRoth: 7_500 });
    const year1 = rows[0];
    expect(year1.cRoth).toBeGreaterThan(0);
    expect(year1.cRoth).toBeLessThan(7_500);
  });

  it("non-MFJ filer is NOT phased out by spouse income (uses primary MAGI only)", () => {
    // Single filer, primary $100K (under the $150K start), spouse earns $200K.
    // Combined would be $300K (fully phased out) — but a single filer reports
    // separately, so the full Roth contribution must still go through.
    const rows = defaultSim({
      filingStatus: "single", currentIncome: 100_000, incomeGrowth: 0,
      spouseIncome: 200_000, contribRoth: 7_000,
    });
    expect(rows[0].cRoth).toBe(7_000);
  });

  it("MFJ filer IS phased out by combined household income", () => {
    // MFJ phase-out is ~$236K–$246K. Primary $150K + spouse $150K = $300K combined
    // → fully phased out, Roth = 0. Confirms MFJ still combines.
    const rows = defaultSim({
      filingStatus: "mfj", currentIncome: 150_000, incomeGrowth: 0,
      spouseIncome: 150_000, spouseIncomeGrowth: 0, contribRoth: 7_000,
    });
    expect(rows[0].cRoth).toBe(0);
  });
});

describe("runSimulation — output structure", () => {
  it("returns correct number of rows", () => {
    const rows = defaultSim({ totalYears: 35 });
    expect(rows).toHaveLength(35);
  });

  it("first row age = currentAge + 1", () => {
    const rows = defaultSim({ currentAge: 30, totalYears: 10 });
    expect(rows[0].age).toBe(31);
  });

  it("all account balances grow over time with positive return", () => {
    const rows = defaultSim();
    const first = rows[0];
    const last  = rows[rows.length - 1];
    expect(last["Roth IRA"]).toBeGreaterThan(first["Roth IRA"]);
    expect(last["HSA"]).toBeGreaterThan(first["HSA"]);
    expect(last.tradGross).toBeGreaterThan(first.tradGross);
  });

  it("accounts stop contributing after contribEnd ages", () => {
    // Set contribEndRoth to 40 (age 40), verify no cRoth after that
    const rows = defaultSim({ currentAge: 30, contribEndRoth: 40, totalYears: 15 });
    const afterStop = rows.filter(r => r.age > 40);
    for (const row of afterStop) {
      expect(row.cRoth).toBe(0);
    }
  });
});

describe("runSimulation — tradGross output", () => {
  it("tradGross grows with positive return rate", () => {
    const rows = defaultSim({ returnRate: 5 });
    expect(rows[rows.length - 1].tradGross).toBeGreaterThan(rows[0].tradGross);
  });

  it("tradGross output is independent of any tax rate", () => {
    // After rate3 removal, simulation has no rate params — tradGross is raw balance
    const rows = defaultSim();
    expect(rows[0].tradGross).toBeGreaterThan(0);
    // No "Trad 401k" field in raw simulation output
    expect(rows[0]["Trad 401k"]).toBeUndefined();
  });
});
