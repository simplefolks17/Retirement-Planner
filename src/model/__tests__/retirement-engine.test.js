import { describe, it, expect } from "vitest";
import { buildRetirementWalkByAccount } from "../retirement-engine.js";

// Stage 1 (BUG-35): the per-account engine in isolation. These lock the
// invariants that make it a correct, taxed-exactly-once, gross-seeded walk —
// before it is wired into App (Stage 2) where the golden master moves.

const base = (over = {}) => buildRetirementWalkByAccount({
  startAge: 65, endAge: 95, rReal: 0.03,
  tradGross: 500_000, roth: 200_000, taxable: 300_000, hsa: 50_000,
  effectiveExpenses: 60_000, filingStatus: "single", rmdStartAge: 73,
  ...over,
});

describe("buildRetirementWalkByAccount — aggregate recurrence (BUG-31 shape preserved)", () => {
  it("each row: balEnd == balStart*(1+rReal) − draw − tax (no events, funded years)", () => {
    const { rows, depletionAge } = base();
    // The recurrence is exact for every fully-funded year; the depletion year
    // funds only part of its draw+tax, so it is excluded.
    for (const r of rows) {
      if (r.age === depletionAge) continue;
      const expected = r.balStart * 1.03 - r.draw - r.tax;
      expect(Math.abs(r.balEnd - expected)).toBeLessThan(1e-6);
    }
  });

  it("balances chain: each year's balStart equals the prior year's balEnd", () => {
    const { rows } = base();
    for (let i = 1; i < rows.length; i++) {
      expect(Math.abs(rows[i].balStart - rows[i - 1].balEnd)).toBeLessThan(1e-6);
    }
  });

  it("per-account balances sum to the row total each year", () => {
    const { rows } = base();
    for (const r of rows) {
      expect(Math.abs((r.trad + r.roth + r.taxable + r.hsa) - r.balEnd)).toBeLessThan(1e-6);
    }
  });
});

describe("buildRetirementWalkByAccount — taxed exactly once", () => {
  it("a pure-Roth portfolio never pays tax (Roth is never re-taxed)", () => {
    const { rows } = base({ tradGross: 0, taxable: 0, hsa: 0, roth: 2_000_000 });
    for (const r of rows) expect(r.tax).toBe(0);
  });

  it("a pure-Taxable portfolio never pays ordinary tax on withdrawals", () => {
    const { rows } = base({ tradGross: 0, roth: 0, hsa: 0, taxable: 2_000_000 });
    for (const r of rows) expect(r.tax).toBe(0);
  });

  it("a 401k-funded draw is taxed (ordinary income) before RMD age", () => {
    // Only a 401k: the spending draw must come from it and be taxed every year.
    const { rows } = base({ roth: 0, taxable: 0, hsa: 0, tradGross: 2_000_000 });
    const early = rows.find(r => r.age === 68);
    expect(early.tradDraw).toBeGreaterThan(0);
    expect(early.tax).toBeGreaterThan(0);
  });

  it("gross seed: a $1M 401k is NOT pre-shrunk — year-1 total reflects the full balance growing", () => {
    // With no spending and no RMD yet, the 401k simply grows at the real rate —
    // proving it was seeded gross (≈1.03M), not after-tax (≈0.76M).
    const { rows } = base({
      tradGross: 1_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 0, endAge: 66,
    });
    expect(rows[0].total).toBeGreaterThan(1_020_000);
  });
});

describe("buildRetirementWalkByAccount — RMDs and conversions", () => {
  it("forces an RMD (and its tax) at the RMD start age", () => {
    const { rows } = base({ roth: 0, taxable: 0, hsa: 0, tradGross: 2_000_000, effectiveExpenses: 0 });
    const at73 = rows.find(r => r.age === 73);
    expect(at73.rmd).toBeGreaterThan(0);
    expect(at73.tax).toBeGreaterThan(0);
    const at72 = rows.find(r => r.age === 72);
    expect(at72.rmd).toBe(0); // no RMD before start age
  });

  it("a Roth conversion moves 401k → Roth and is taxed that year", () => {
    const noConv = base({ effectiveExpenses: 0, endAge: 66 });
    const withConv = base({ effectiveExpenses: 0, endAge: 66, conversionByAge: { 66: 50_000 } });
    // Roth ends higher, 401k lower, and tax is charged on the conversion.
    expect(withConv.rows[0].roth).toBeGreaterThan(noConv.rows[0].roth);
    expect(withConv.rows[0].trad).toBeLessThan(noConv.rows[0].trad);
    expect(withConv.rows[0].tax).toBeGreaterThan(0);
    expect(noConv.rows[0].tax).toBe(0);
  });
});

describe("buildRetirementWalkByAccount — tax breakdown (one walk, attributable)", () => {
  it("inflowTax + convTax + rmdTax + drawTax rounds to the row's total tax every year", () => {
    // Mixed portfolio with a conversion window and RMDs so all components fire.
    const { rows } = base({
      tradGross: 2_000_000, roth: 0, taxable: 100_000, hsa: 0,
      effectiveExpenses: 80_000, conversionByAge: { 66: 40_000, 67: 40_000 },
      retStateRate: 0.04,
    });
    for (const r of rows) {
      expect(Math.round(r.inflowTax + r.convTax + r.rmdTax + r.drawTax)).toBe(r.tax);
    }
  });

  it("attributes tax to the right source: conversion tax in the window, RMD tax at 73+", () => {
    const { rows } = base({
      tradGross: 2_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 0, conversionByAge: { 66: 50_000 },
    });
    const at66 = rows.find(r => r.age === 66);
    expect(at66.convTax).toBeGreaterThan(0);   // conversion taxed in its year
    expect(at66.rmdTax).toBe(0);               // no RMD before 73
    const at74 = rows.find(r => r.age === 74);
    expect(at74.rmdTax).toBeGreaterThan(0);    // RMD taxed once started
    expect(at74.convTax).toBe(0);              // no conversion outside the window
  });
});

describe("buildRetirementWalkByAccount — review fixes (PR #32)", () => {
  it("grosses up tax when the 401k funds BOTH spending and the tax (no Taxable buffer)", () => {
    // Taxable/Roth/HSA empty, so the 401k must fund the net spending AND the income
    // tax on it — the tax is on a base that includes itself (tax-on-tax gross-up).
    const { rows } = base({
      tradGross: 3_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 120_000,
    });
    const r = rows.find(x => x.age === 67);
    expect(r.tradDraw).toBeGreaterThan(r.draw);                       // funds more than net spending
    expect(Math.abs(r.tradDraw - (r.draw + r.tax))).toBeLessThan(2);  // = spending + tax (grossed up)
  });

  it("a large one-time purchase that drains the pool triggers depletion", () => {
    // The event outflow is folded into `needed`, so a purchase that exhausts the pool
    // surfaces as spendShort and triggers depletion (was previously discarded).
    const { depletionAge, yearsSustained } = base({
      tradGross: 0, roth: 300_000, taxable: 0, hsa: 0, effectiveExpenses: 0,
      moneyEvents: [{ age: 70, amount: 1_000_000, isInflow: false }],
    });
    expect(depletionAge).toBe(70);
    expect(Number.isFinite(yearsSustained)).toBe(true);
  });

  it("taxes a one-time purchase funded from the 401k (event is ordinary income)", () => {
    // A purchase paid from a pre-tax account is a taxable distribution. With no Taxable
    // buffer, the 401k funds the event, so its dollars are taxed + grossed up like any
    // other draw — the year's tax must jump in the event year vs. an event-free run.
    const common = { tradGross: 3_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 0 };
    const noEvent   = base({ ...common });
    const withEvent = base({ ...common, moneyEvents: [{ age: 68, amount: 100_000, isInflow: false }] });
    const a = noEvent.rows.find(r => r.age === 68);
    const b = withEvent.rows.find(r => r.age === 68);
    expect(b.draw).toBeCloseTo(a.draw + 100_000, 5);   // event folded into the draw
    expect(b.tax).toBeGreaterThan(a.tax);              // and taxed (was 0 before the fix)
    expect(b.tradDraw).toBeGreaterThan(b.draw);        // 401k funds spending + the tax on it
  });

  it("taxes a flagged taxable inflow as ordinary income (and leaves a non-taxable one untaxed)", () => {
    // A taxable windfall (e.g. inherited pre-tax IRA) is ordinary income the year it
    // lands; a non-taxable one (Roth inheritance, gift) is not. Both add to the pool.
    const common = { tradGross: 0, roth: 0, taxable: 200_000, hsa: 0, effectiveExpenses: 0 };
    const taxableIn    = base({ ...common, moneyEvents: [{ age: 68, amount: 100_000, isInflow: true, isTaxable: true  }] });
    const nonTaxableIn = base({ ...common, moneyEvents: [{ age: 68, amount: 100_000, isInflow: true, isTaxable: false }] });
    const t = taxableIn.rows.find(r => r.age === 68);
    const n = nonTaxableIn.rows.find(r => r.age === 68);
    expect(t.inflowTax).toBeGreaterThan(0);                 // taxable inflow is taxed
    expect(n.inflowTax).toBe(0);                            // non-taxable inflow is not
    expect(t.tax).toBeGreaterThan(n.tax);                   // and it shows up in the year's tax
    expect(t.balEnd).toBeLessThan(n.balEnd);                // net pool is lower by the tax paid
  });

  it("computes the RMD BEFORE any same-year conversion (IRS sequencing)", () => {
    // A conversion in the same year as an RMD must NOT shrink the RMD base.
    const noConv   = base({ tradGross: 2_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 0 });
    const withConv = base({ tradGross: 2_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 0,
      conversionByAge: { 73: 100_000 } });
    const a = noConv.rows.find(r => r.age === 73);
    const b = withConv.rows.find(r => r.age === 73);
    expect(b.rmd).toBeCloseTo(a.rmd, 5);   // RMD identical — computed on the full pre-conversion balance
    expect(b.conversion).toBe(100_000);    // the conversion still happens, on the post-RMD balance
  });
});

describe("buildRetirementWalkByAccount — income timing (rule 5b)", () => {
  it("SS reduces the draw only from its claim age", () => {
    const { rows } = base({ ssGross: 30_000, ssTaxable: 25_500, ssClaimAge: 70 });
    expect(rows.find(r => r.age === 68).draw).toBe(60_000);       // before claim: full expenses
    expect(rows.find(r => r.age === 72).draw).toBe(30_000);       // after claim: expenses − SS
  });

  it("pension reduces the draw only from its start age", () => {
    const { rows } = base({ pension: 20_000, pensionStartAge: 67 });
    expect(rows.find(r => r.age === 66).draw).toBe(60_000);
    expect(rows.find(r => r.age === 68).draw).toBe(40_000);
  });
});

describe("buildRetirementWalkByAccount — depletion", () => {
  it("reports a depletion age when spending outruns the portfolio", () => {
    const { depletionAge, yearsSustained } = base({
      tradGross: 50_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 60_000,
    });
    expect(depletionAge).not.toBeNull();
    expect(yearsSustained).toBeLessThan(5);
  });

  it("never depletes a portfolio that out-earns its draw (yearsSustained = Infinity)", () => {
    const { depletionAge, yearsSustained } = base({
      tradGross: 0, roth: 5_000_000, taxable: 0, hsa: 0, effectiveExpenses: 40_000,
    });
    expect(depletionAge).toBeNull();
    expect(yearsSustained).toBe(Infinity);
  });
});
