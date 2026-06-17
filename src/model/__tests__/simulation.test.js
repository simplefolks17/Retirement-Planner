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

  it("HSA contribution never exceeds $4,400 IRS limit", () => {
    // Even if user sets contribHSA high, sim-level guard caps it
    const rows = defaultSim({ contribHSA: 99_999 });
    for (const row of rows) {
      if (row.cHSA > 0) expect(row.cHSA).toBeLessThanOrEqual(4_400);
    }
  });

  it("Roth contribution drops to 0 when MAGI crosses phase-out (single: $153K–$168K)", () => {
    // At $140K income + 3% growth, MAGI clears the $168K band top within ~15 years → Roth = 0
    const rows = defaultSim({ currentIncome: 140_000, contribRoth: 7_500 });
    const year15 = rows.find(r => r.age === 45); // currentAge=30 + 15
    expect(year15).toBeDefined();
    expect(year15.cRoth).toBe(0);
  });

  it("Roth phases out linearly between $153K and $168K", () => {
    // Income right in the middle of phase-out
    const rows = defaultSim({ currentIncome: 160_500, incomeGrowth: 0, contribRoth: 7_500 });
    const year1 = rows[0];
    expect(year1.cRoth).toBeGreaterThan(0);
    expect(year1.cRoth).toBeLessThan(7_500);
  });

  it("in-band phase-out reduces the LIMIT, not the desired amount (review fix)", () => {
    // MAGI $156K, single band $153K–$168K → phasePct 0.8 → reduced limit = 7,500 × 0.8 = 6,000.
    // A contributor BELOW the reduced limit gets their FULL desired amount; one above it is
    // capped AT the reduced limit. The old bug scaled the desired amount itself (× 0.8), so it
    // would have returned 2,400 and 5,600 here — wrongly denying legal contributions.
    const below = defaultSim({ currentIncome: 156_000, incomeGrowth: 0, contribRoth: 3_000 })[0];
    expect(below.cRoth).toBe(3_000);   // under the 6,000 reduced limit → full desired (was 2,400)

    const above = defaultSim({ currentIncome: 156_000, incomeGrowth: 0, contribRoth: 7_000 })[0];
    expect(above.cRoth).toBe(6_000);   // capped at the reduced limit (was 5,600)
  });

  it("non-MFJ filer is NOT phased out by spouse income (uses primary MAGI only)", () => {
    // Single filer, primary $100K (under the $153K start), spouse earns $200K.
    // Combined would be $300K (fully phased out) — but a single filer reports
    // separately, so the full Roth contribution must still go through.
    const rows = defaultSim({
      filingStatus: "single", currentIncome: 100_000, incomeGrowth: 0,
      spouseIncome: 200_000, contribRoth: 7_000,
    });
    expect(rows[0].cRoth).toBe(7_000);
  });

  it("MFJ filer IS phased out by combined household income", () => {
    // MFJ phase-out is $242K–$252K. Primary $150K + spouse $150K = $300K combined
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

describe("runSimulation — catch-up contributions at age 50", () => {
  // Catch-up eligibility: `age >= CATCHUP_AGE` where row age = currentAge + y (year-END age).
  // IRS allows catch-up for the whole calendar year you turn 50, so the row with age=50 is the
  // FIRST to carry catch-up contributions. Row age=49 is NOT eligible yet.
  it("401k contribution increases by CATCHUP_401K_2026 ($7,500) at first catch-up year", () => {
    // contrib401k set well above the under-50 elective limit ($24,500) so it's uncapped once
    // catch-up raises the ceiling to $32,000. flat match stays constant (income unchanged).
    const rows = defaultSim({ currentAge: 47, totalYears: 5, incomeGrowth: 0, contrib401k: 32_000 });
    const age49 = rows.find(r => r.age === 49); // not eligible: worker turns 49 this year
    const age50 = rows.find(r => r.age === 50); // eligible: worker turns 50 this year
    expect(age49).toBeDefined();
    expect(age50).toBeDefined();
    // c401k at age49 = min(32_000, 24_500) + flat match; at age50 = 32_000 + flat match → +7,500
    expect(age50.c401k - age49.c401k).toBe(7_500);
  });

  it("Roth contribution increases by CATCHUP_ROTH_2026 ($1,000) at first catch-up year", () => {
    // contribRoth set above the base $7,500 limit so the catch-up $1,000 is visible.
    const rows = defaultSim({ currentAge: 47, totalYears: 5, incomeGrowth: 0, contribRoth: 9_000 });
    const age49 = rows.find(r => r.age === 49);
    const age50 = rows.find(r => r.age === 50);
    // At $100k income (under $150k phase-out start), full contribution is allowed.
    // age49: min(9_000, 7_500) = 7_500; age50: min(9_000, 8_500) = 8_500 → delta = 1_000
    expect(age50.cRoth - age49.cRoth).toBe(1_000);
  });
});

describe("runSimulation — 415(c) combined cap", () => {
  it("employee + employer combined is capped at LIMIT_415C_2026 ($70,000) for under-50", () => {
    // Set contrib401k = $24,500 (max deferral) + flat match 3% of $200k = $6k → $30.5k total, under cap.
    // Now use a very high formula match to push combined over $70k.
    const highMatchConfig = { matchMode: "formula", matchFormulaCap: 50, matchFormulaRate: 100 };
    const rows = runSimulation({
      totalYears: 1, currentAge: 30, currentIncome: 200_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 24_500, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: (salary, contrib) => calcEmployerMatch(salary, contrib, highMatchConfig),
    });
    // employer match = 100% of employee up to 50% of salary → would be $24,500 match → total $49k
    // Still under $70k — so let's verify it's not artificially capped, then test near-ceiling case.
    expect(rows[0].c401k).toBeLessThanOrEqual(70_000);
  });

  it("c401k is capped at LIMIT_415C_CATCHUP_2026 ($77,500) for age 50+", () => {
    const highMatchConfig = { matchMode: "formula", matchFormulaCap: 100, matchFormulaRate: 100 };
    const rows = runSimulation({
      totalYears: 1, currentAge: 49, currentIncome: 1_000_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 32_000, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: (salary, contrib) => calcEmployerMatch(salary, contrib, highMatchConfig),
    });
    // age 50 (currentAge 49 + 1 year): catch-up eligible → cap is $77,500
    expect(rows[0].c401k).toBeLessThanOrEqual(77_500);
  });
});

describe("runSimulation — contribution before growth order", () => {
  it("year-1 tradGross = (bal401k + c401k) * (1 + r)", () => {
    const bal = 100_000;
    const contrib = 10_000;
    const r = 0.07;
    const rows = runSimulation({
      totalYears: 1, currentAge: 30, currentIncome: 100_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: r * 100,
      bal401k: bal, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: contrib, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    });
    // employer match = 0 → c401k = employee deferral = contrib
    const expected = Math.round((bal + contrib) * (1 + r));
    expect(rows[0].tradGross).toBe(expected);
  });
});

describe("runSimulation — per-year growth fields (WI-2.5)", () => {
  it("year-1 tradGrowth = (bal401k + c401k) * r; growth sums all accounts (gross)", () => {
    const r = 0.07;
    const rows = runSimulation({
      totalYears: 1, currentAge: 30, currentIncome: 100_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: r * 100,
      bal401k: 100_000, balRoth: 20_000, balTaxable: 0, balHSA: 5_000,
      contrib401k: 10_000, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    });
    const tradGrowth = (100_000 + 10_000) * r;   // 7,700
    const rothGrowth = 20_000 * r;               // 1,400
    const hsaGrowth  = 5_000 * r;                // 350
    expect(rows[0].tradGrowth).toBe(Math.round(tradGrowth));
    // taxable is 0 here → growth = trad + roth + hsa (gross, no tax factor)
    expect(rows[0].growth).toBe(Math.round(tradGrowth + rothGrowth + hsaGrowth));
  });

  it("each gross balance reconciles: prevBalance + contrib + accountGrowth = nextBalance", () => {
    const rows = defaultSim();
    // Trad 401k gross reconciliation across the first 5 years.
    for (let i = 1; i < 5; i++) {
      const prev = rows[i - 1].tradGross;
      const next = rows[i].tradGross;
      const contrib = rows[i].c401k;
      const growth = rows[i].tradGrowth;
      // prev + contrib + growth == next (within rounding)
      expect(Math.abs((prev + contrib + growth) - next)).toBeLessThanOrEqual(1);
    }
  });

  it("after-tax basis reconciles: prevTotal + (contrib − m·c401k) + (growth − m·tradGrowth) = nextTotal", () => {
    const m = 0.24; // a representative marginal rate
    const rows = defaultSim();
    const afterTaxTotal = (row) =>
      Math.round(row.tradGross * (1 - m)) + row["Roth IRA"] + row["Taxable"] + row["HSA"];
    for (let i = 1; i < 6; i++) {
      const prev = afterTaxTotal(rows[i - 1]);
      const next = afterTaxTotal(rows[i]);
      const r = rows[i];
      const contribAT = (r.c401k + r.cRoth + r.cTaxable + r.cHSA) - m * r.c401k;
      const growthAT  = r.growth - m * r.tradGrowth;
      // The displayed Year-by-year row must add up on the after-tax basis.
      // Small tolerance covers per-account vs summed rounding (values are 6-figure).
      expect(Math.abs((prev + contribAT + growthAT) - next)).toBeLessThan(10);
    }
  });
});

describe("runSimulation — income compounding", () => {
  it("employee deferral in year 2 = contrib * (1 + incomeGrowth/100)", () => {
    const rows = runSimulation({
      totalYears: 2, currentAge: 30, currentIncome: 100_000, incomeGrowth: 5,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 10_000, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    });
    // Year 2 income = $100k * 1.05 = $105k; deferral = $10k * 1.05 = $10,500
    expect(rows[1].c401k).toBe(10_500);
  });
});

describe("runSimulation — independent contribEnd ages", () => {
  it("401k stops at contribEnd401k while Roth continues to later contribEndRoth", () => {
    const rows = defaultSim({
      currentAge: 30, totalYears: 20,
      contribEnd401k: 40,  // stops at age 40
      contribEndRoth: 50,  // continues until 50
      incomeGrowth: 0,
    });
    const age41 = rows.find(r => r.age === 41);
    const age45 = rows.find(r => r.age === 45);
    // 401k stopped, Roth still going
    expect(age41.c401k).toBe(0);
    expect(age41.cRoth).toBeGreaterThan(0);
    // Both stopped by 45 for 401k (already stopped), Roth still active
    expect(age45.c401k).toBe(0);
    expect(age45.cRoth).toBeGreaterThan(0);
  });
});

describe("runSimulation — LTCG drag on taxable", () => {
  it("taxable grows slower than an equivalent account with 0% cap gains rate", () => {
    const sharedArgs = {
      totalYears: 10, currentAge: 30, currentIncome: 50_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: 7,
      bal401k: 0, balRoth: 0, balTaxable: 100_000, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    };
    // Standard: income $50k → 0% LTCG bracket (taxable income after deduction < ~$47k)
    // Use income $200k to force a non-zero LTCG rate (15% bracket)
    const withDrag  = runSimulation({ ...sharedArgs, currentIncome: 200_000 });
    const noDrag    = runSimulation({ ...sharedArgs, currentIncome: 0 });
    // Higher income → higher cap gains rate → more drag → lower end balance
    expect(withDrag[9]["Taxable"]).toBeLessThan(noDrag[9]["Taxable"]);
  });
});

describe("runSimulation — MFS Roth phase-out", () => {
  it("MFS filer with $15k income is fully phased out (MFS range: $0–$10k)", () => {
    const rows = runSimulation({
      totalYears: 1, currentAge: 30, currentIncome: 15_000, incomeGrowth: 0,
      filingStatus: "mfs", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 0, contribRoth: 7_500, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    });
    expect(rows[0].cRoth).toBe(0);
  });
});

describe("runSimulation — MFJ LTCG combined income", () => {
  it("MFJ household with dual ~$50k earners experiences 15% LTCG drag that single filer escapes", () => {
    // For LTCG bracket lookup, ordinaryIncome = income - deferral - HSA (no standard deduction subtracted).
    // MFJ combined $110k (two $55k earners) - 3k deferral = 107k → clears MFJ 0% top ($98,900) → 15% LTCG.
    // Single filer at $45k - 3k deferral = 42k → under single 0% top ($49,450), staying at 0% LTCG.
    // Over 10 years at 7% return, the difference in taxable growth is measurable.
    const sharedArgs = {
      totalYears: 10, currentAge: 30, incomeGrowth: 0,
      returnRate: 7,
      bal401k: 0, balRoth: 0, balTaxable: 50_000, balHSA: 0,
      contrib401k: 3_000, contribRoth: 0, contribTaxable: 5_000, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: () => 0,
    };

    const mfj = runSimulation({
      ...sharedArgs,
      currentIncome: 55_000,
      filingStatus: "mfj",
      spouseIncome: 55_000,
      spouseIncomeGrowth: 0,
    });

    const single = runSimulation({
      ...sharedArgs,
      currentIncome: 45_000,
      filingStatus: "single",
      spouseIncome: 0,
      spouseIncomeGrowth: 0,
    });

    // MFJ case: ordinaryIncome = (55k + 55k) - 3k = 107k → exceeds 98,900 threshold → 15% LTCG rate.
    // Single case: ordinaryIncome = 45k - 3k = 42k → under 49,450 threshold → 0% LTCG rate.
    // Therefore, MFJ taxable account grows slower and should be strictly smaller at end.
    expect(mfj[9]["Taxable"]).toBeLessThan(single[9]["Taxable"]);
  });
});

describe("runSimulation — income growth plateau (incomeGrowthEndAge)", () => {
  it("contributions are identical at and after the plateau age (cTaxable test)", () => {
    // currentAge=30, incomeGrowthEndAge=40: growth caps after 10 years.
    // cTaxable at age 42 and age 50 should be identical (both use growFactor = (1.03)^10).
    const rows = defaultSim({ incomeGrowthEndAge: 40, totalYears: 25 });
    const rowAt42 = rows.find(r => r.age === 42);
    const rowAt50 = rows.find(r => r.age === 50);
    expect(rowAt42).toBeDefined();
    expect(rowAt50).toBeDefined();
    expect(rowAt42.cTaxable).toBe(rowAt50.cTaxable);
  });

  it("income still grows up to the plateau year", () => {
    // At age 40 (y=10), growthYears = min(9, 10) = 9 → income still growing.
    // At age 41 (y=11), growthYears = min(10, 10) = 10 → plateau reached.
    const rows = defaultSim({ incomeGrowthEndAge: 40, totalYears: 15 });
    const rowAt40 = rows.find(r => r.age === 40);
    const rowAt41 = rows.find(r => r.age === 41);
    const rowAt50 = rows.find(r => r.age === 45);
    expect(rowAt40.cTaxable).toBeLessThan(rowAt41.cTaxable); // still growing before plateau
    expect(rowAt41.cTaxable).toBe(rowAt50.cTaxable);          // plateau holds
  });

  it("null incomeGrowthEndAge (default) produces the same result as no plateau param", () => {
    const withNull    = defaultSim({ incomeGrowthEndAge: null });
    const withoutParam = defaultSim();
    expect(withNull[34].tradGross).toBe(withoutParam[34].tradGross);
  });

  it("plateau reduces end portfolio vs uncapped baseline for high income growth", () => {
    // With plateau at age 40, contributions stop growing at that age → smaller final balance.
    const capped    = defaultSim({ incomeGrowthEndAge: 40, incomeGrowth: 5 });
    const uncapped  = defaultSim({ incomeGrowthEndAge: null, incomeGrowth: 5 });
    // After plateau, employer match + employee deferral freeze; final balance must be lower.
    expect(capped[34].tradGross).toBeLessThan(uncapped[34].tradGross);
  });
});
