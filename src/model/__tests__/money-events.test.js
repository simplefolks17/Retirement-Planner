import { describe, it, expect } from "vitest";
import { applyMoneyEvents, totalEventImpact } from "../money-events.js";

describe("applyMoneyEvents", () => {
  it("returns zero adjustment when events array is empty", () => {
    const { portfolioAdjustment, taxableIncomeAdjustment } = applyMoneyEvents([], 45);
    expect(portfolioAdjustment).toBe(0);
    expect(taxableIncomeAdjustment).toBe(0);
  });

  it("ignores events at other ages", () => {
    const events = [{ amount: 50_000, age: 70, isInflow: true, isTaxable: false }];
    const { portfolioAdjustment } = applyMoneyEvents(events, 65);
    expect(portfolioAdjustment).toBe(0);
  });

  it("adds inflow amount to portfolio at matching age", () => {
    const events = [{ amount: 100_000, age: 70, isInflow: true, isTaxable: false }];
    const { portfolioAdjustment } = applyMoneyEvents(events, 70);
    expect(portfolioAdjustment).toBe(100_000);
  });

  it("subtracts outflow amount from portfolio at matching age", () => {
    const events = [{ amount: 80_000, age: 45, isInflow: false, isTaxable: false }];
    const { portfolioAdjustment } = applyMoneyEvents(events, 45);
    expect(portfolioAdjustment).toBe(-80_000);
  });

  it("taxable inflows add to taxableIncomeAdjustment", () => {
    const events = [{ amount: 200_000, age: 72, isInflow: true, isTaxable: true }];
    const { portfolioAdjustment, taxableIncomeAdjustment } = applyMoneyEvents(events, 72);
    expect(portfolioAdjustment).toBe(200_000);
    expect(taxableIncomeAdjustment).toBe(200_000);
  });

  it("non-taxable inflows do not affect taxableIncomeAdjustment", () => {
    const events = [{ amount: 50_000, age: 68, isInflow: true, isTaxable: false }];
    const { taxableIncomeAdjustment } = applyMoneyEvents(events, 68);
    expect(taxableIncomeAdjustment).toBe(0);
  });

  it("outflows never add to taxableIncomeAdjustment regardless of flag", () => {
    const events = [{ amount: 30_000, age: 50, isInflow: false, isTaxable: true }];
    const { taxableIncomeAdjustment } = applyMoneyEvents(events, 50);
    expect(taxableIncomeAdjustment).toBe(0);
  });

  it("sums multiple events at the same age", () => {
    const events = [
      { amount: 100_000, age: 65, isInflow: true,  isTaxable: false },
      { amount:  30_000, age: 65, isInflow: false, isTaxable: false },
    ];
    const { portfolioAdjustment } = applyMoneyEvents(events, 65);
    expect(portfolioAdjustment).toBe(70_000);  // +100k - 30k
  });

  it("treats amount as absolute value regardless of sign in data", () => {
    // Defensive: if someone accidentally passes a negative amount, it should still work
    const events = [{ amount: -50_000, age: 60, isInflow: false, isTaxable: false }];
    const { portfolioAdjustment } = applyMoneyEvents(events, 60);
    expect(portfolioAdjustment).toBe(-50_000); // Math.abs(-50k) = 50k, then negated for outflow
  });
});

describe("totalEventImpact", () => {
  it("returns 0 for empty array", () => {
    expect(totalEventImpact([])).toBe(0);
  });

  it("sums inflows minus outflows across all ages", () => {
    const events = [
      { amount: 200_000, age: 70, isInflow: true  },
      { amount:  80_000, age: 45, isInflow: false },
      { amount:  50_000, age: 65, isInflow: true  },
    ];
    expect(totalEventImpact(events)).toBe(170_000); // 200k + 50k - 80k
  });
});

describe("buildRetirementDrawdown with moneyEvents", () => {
  // Integration: verify events actually move the balance in the walk
  it("inflow at a retirement age increases balance beyond normal growth", async () => {
    const { buildRetirementDrawdown } = await import("../retirement-drawdown.js");
    const base = {
      startBal: 1_000_000, startAge: 65, endAge: 90,
      rReal: 0.03, effectiveExpenses: 50_000,
      ssAmount: 20_000, ssClaimAge: 65,
    };
    const withEvent = buildRetirementDrawdown({
      ...base,
      moneyEvents: [{ amount: 100_000, age: 70, isInflow: true }],
    });
    const noEvent = buildRetirementDrawdown(base);

    const rowWithEvent = withEvent.rows.find(r => r.age === 71);
    const rowNoEvent   = noEvent.rows.find(r => r.age === 71);
    // The event is applied at the END of age 70 (after growth), so balStart at age 71
    // is exactly 100k higher — no extra growth round in the injection year itself.
    expect(rowWithEvent.balStart).toBeCloseTo(rowNoEvent.balStart + 100_000, 0);
  });

  it("outflow at retirement age reduces balance and shortens longevity", async () => {
    const { buildRetirementDrawdown } = await import("../retirement-drawdown.js");
    const base = {
      startBal: 1_000_000, startAge: 65, endAge: 200,
      rReal: 0.03, effectiveExpenses: 80_000,
      ssAmount: 0, ssClaimAge: Infinity,
    };
    const withEvent = buildRetirementDrawdown({
      ...base,
      moneyEvents: [{ amount: 200_000, age: 68, isInflow: false }],
    });
    const noEvent = buildRetirementDrawdown(base);
    expect(withEvent.yearsSustained).toBeLessThan(noEvent.yearsSustained);
  });

  it("empty moneyEvents is a no-op (no golden master impact)", async () => {
    const { buildRetirementDrawdown } = await import("../retirement-drawdown.js");
    const base = {
      startBal: 800_000, startAge: 65, endAge: 100,
      rReal: 0.02, effectiveExpenses: 40_000,
      ssAmount: 15_000, ssClaimAge: 67,
    };
    const withEmpty = buildRetirementDrawdown({ ...base, moneyEvents: [] });
    const noParam   = buildRetirementDrawdown(base);
    expect(withEmpty.yearsSustained).toBe(noParam.yearsSustained);
    expect(withEmpty.endVal).toBe(noParam.endVal);
  });
});

describe("runSimulation with moneyEvents", () => {
  it("outflow at accumulation age reduces balance for subsequent years", async () => {
    const { runSimulation } = await import("../simulation.js");
    const { calcEmployerMatch } = await import("../employer-match.js");
    const em = (s, c) => calcEmployerMatch(s, c, { matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3 });
    const base = {
      totalYears: 35, currentAge: 30, currentIncome: 100_000, incomeGrowth: 3,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 5,
      bal401k: 0, balRoth: 0, balTaxable: 100_000, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: em,
    };
    const withEvent = runSimulation({
      ...base,
      moneyEvents: [{ amount: 50_000, age: 35, isInflow: false }],
    });
    const noEvent = runSimulation(base);

    // At age 36+ the taxable balance should be lower in the event scenario
    const age40With = withEvent.find(r => r.age === 40);
    const age40None = noEvent.find(r => r.age === 40);
    expect(age40With["Taxable"]).toBeLessThan(age40None["Taxable"]);
  });

  it("empty moneyEvents produces identical output to no-param call", async () => {
    const { runSimulation } = await import("../simulation.js");
    const { calcEmployerMatch } = await import("../employer-match.js");
    const em = (s, c) => calcEmployerMatch(s, c, { matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3 });
    const base = {
      totalYears: 10, currentAge: 30, currentIncome: 80_000, incomeGrowth: 2,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 6,
      bal401k: 10_000, balRoth: 5_000, balTaxable: 20_000, balHSA: 2_000,
      contrib401k: 5_000, contribRoth: 3_000, contribTaxable: 2_000, contribHSA: 1_000,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: em,
    };
    const withEmpty = runSimulation({ ...base, moneyEvents: [] });
    const noParam   = runSimulation(base);
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(noParam));
  });
});
