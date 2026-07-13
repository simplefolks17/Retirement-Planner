import { describe, it, expect } from "vitest";
import {
  applyMoneyEvents, totalEventImpact,
  eventNetForYear, eventFirstAge, eventLastAge, eventGrossCost, eventNetTotal,
  isDurationEvent, eventAmountForYear, eventIncomeForYear, eventsIncomeAdjustment,
} from "../money-events.js";

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

// ── Duration events ($X/mo for N months, optional income offset) ──────────────
describe("duration events", () => {
  const travel6mo = {
    label: "Travel", monthlyAmount: 6_000, durationMonths: 6, age: 40,
    isInflow: false, incomeAnnual: 0,
  };
  const travel18mo = {
    label: "Long travel", monthlyAmount: 6_000, durationMonths: 18, age: 40,
    isInflow: false, incomeAnnual: 0,
  };

  it("isDurationEvent distinguishes the two kinds", () => {
    expect(isDurationEvent(travel6mo)).toBe(true);
    expect(isDurationEvent({ amount: 40_000, age: 70, isInflow: false })).toBe(false);
    expect(isDurationEvent({ monthlyAmount: 6_000, durationMonths: 0, age: 40 })).toBe(false);
  });

  it("a 6-month event lands entirely in its start year", () => {
    expect(eventNetForYear(travel6mo, 40)).toBe(-36_000);
    expect(eventNetForYear(travel6mo, 41)).toBe(0);
    expect(eventNetForYear(travel6mo, 39)).toBe(0);
  });

  it("an 18-month event splits 12 months / 6 months across two years", () => {
    expect(eventNetForYear(travel18mo, 40)).toBe(-72_000);
    expect(eventNetForYear(travel18mo, 41)).toBe(-36_000);
    expect(eventNetForYear(travel18mo, 42)).toBe(0);
  });

  it("income while traveling offsets the outflow, prorated by active months", () => {
    const withIncome = { ...travel6mo, incomeAnnual: 24_000 };
    // −(6 × 6k) + (6/12 × 24k) = −36k + 12k
    expect(eventNetForYear(withIncome, 40)).toBe(-24_000);
  });

  it("an inflow duration event adds monthly amounts plus income", () => {
    const partTime = { monthlyAmount: 2_000, durationMonths: 12, age: 60, isInflow: true, incomeAnnual: 0 };
    expect(eventNetForYear(partTime, 60)).toBe(24_000);
  });

  it("isDurationEvent takes precedence when BOTH amount and monthlyAmount/durationMonths are present", () => {
    // Locks the precedence rule documented at isDurationEvent: an event carrying
    // both shapes (e.g. a stale/malformed record) is treated as duration, not
    // one-time — eventNetForYear should use the monthly×months formula, not `amount`.
    const both = { amount: 999_999, monthlyAmount: 1_000, durationMonths: 3, age: 40, isInflow: false };
    expect(isDurationEvent(both)).toBe(true);
    expect(eventNetForYear(both, 40)).toBe(-3_000); // 3 × 1,000, NOT -999,999
  });

  it("eventFirstAge / eventLastAge cover the active year span", () => {
    expect(eventFirstAge(travel6mo)).toBe(40);
    expect(eventLastAge(travel6mo)).toBe(40);
    expect(eventLastAge(travel18mo)).toBe(41);
    expect(eventLastAge({ ...travel6mo, durationMonths: 24 })).toBe(41);
    expect(eventLastAge({ ...travel6mo, durationMonths: 25 })).toBe(42);
    expect(eventLastAge({ amount: 40_000, age: 70, isInflow: false })).toBe(70);
  });

  it("eventGrossCost is monthly × months (income offset excluded)", () => {
    expect(eventGrossCost({ ...travel6mo, incomeAnnual: 24_000 })).toBe(36_000);
    expect(eventGrossCost({ amount: 40_000, age: 70, isInflow: false })).toBe(40_000);
  });

  it("eventNetTotal sums the signed impact across all active years", () => {
    expect(eventNetTotal(travel18mo)).toBe(-108_000);
    expect(eventNetTotal({ ...travel18mo, incomeAnnual: 24_000 })).toBe(-72_000); // +18/12 × 24k
    expect(eventNetTotal({ amount: 40_000, age: 70, isInflow: false })).toBe(-40_000);
  });

  it("applyMoneyEvents folds duration events into portfolioAdjustment per year", () => {
    const events = [travel18mo, { amount: 10_000, age: 41, isInflow: true, isTaxable: false }];
    expect(applyMoneyEvents(events, 40).portfolioAdjustment).toBe(-72_000);
    expect(applyMoneyEvents(events, 41).portfolioAdjustment).toBe(-26_000); // −36k + 10k
    expect(applyMoneyEvents(events, 42).portfolioAdjustment).toBe(0);
  });

  it("duration events never produce taxable income (documented simplification)", () => {
    const flagged = { ...travel6mo, isInflow: true, isTaxable: true };
    expect(applyMoneyEvents([flagged], 40).taxableIncomeAdjustment).toBe(0);
  });

  it("totalEventImpact includes duration events", () => {
    expect(totalEventImpact([travel6mo, { amount: 50_000, age: 65, isInflow: true }]))
      .toBe(14_000); // −36k + 50k
  });

  it("runSimulation applies a duration event's years to the taxable account", async () => {
    const { runSimulation } = await import("../simulation.js");
    const em = () => 0;
    const base = {
      totalYears: 30, currentAge: 30, currentIncome: 100_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 500_000, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 0, contribEndRoth: 0, contribEndTaxable: 0, contribEndHSA: 0,
      calcEmployerMatchFn: em,
    };
    const withEvent = runSimulation({
      ...base,
      moneyEvents: [{ monthlyAmount: 6_000, durationMonths: 18, age: 40, isInflow: false, incomeAnnual: 0 }],
    });
    const without = runSimulation(base);
    const at = (rows, age) => rows.find(r => r.age === age)["Taxable"];
    // 0% return → deltas are exactly the event months
    expect(at(without, 40) - at(withEvent, 40)).toBe(72_000);
    expect(at(without, 41) - at(withEvent, 41)).toBe(108_000);
    expect(at(without, 42) - at(withEvent, 42)).toBe(108_000);
  });

  it("buildRetirementDrawdown applies a duration event across its retirement years", async () => {
    const { buildRetirementDrawdown } = await import("../retirement-drawdown.js");
    const base = {
      startBal: 2_000_000, startAge: 65, endAge: 90, rReal: 0,
      effectiveExpenses: 0, moneyEvents: [],
    };
    const withEvent = buildRetirementDrawdown({
      ...base,
      moneyEvents: [{ monthlyAmount: 5_000, durationMonths: 24, age: 70, isInflow: false, incomeAnnual: 0 }],
    });
    const without = buildRetirementDrawdown(base);
    const at = (walk, age) => walk.rows.find(r => r.age === age).total;
    expect(at(without, 70) - at(withEvent, 70)).toBe(60_000);
    expect(at(without, 71) - at(withEvent, 71)).toBe(120_000);
    expect(at(without, 72) - at(withEvent, 72)).toBe(120_000);
  });
});

// ── Income-replacement channel: eventAmountForYear / eventIncomeForYear /
//    eventsIncomeAdjustment (owner decision: incomeAnnual on a duration outflow
//    event now means "my TOTAL income during this period", replacing salary in a
//    working year rather than bolting on) ─────────────────────────────────────
describe("eventAmountForYear + eventIncomeForYear (channel split)", () => {
  it("sum to eventNetForYear for a mixed set: one-time, duration in/outflow, with/without incomeAnnual", () => {
    const events = [
      { amount: 40_000, age: 70, isInflow: false, isTaxable: false },              // one-time outflow
      { amount: 25_000, age: 70, isInflow: true, isTaxable: false },               // one-time inflow (same age)
      { monthlyAmount: 6_000, durationMonths: 6, age: 40, isInflow: false, incomeAnnual: 24_000 }, // duration outflow w/ income
      { monthlyAmount: 2_000, durationMonths: 12, age: 60, isInflow: true, incomeAnnual: 0 },      // duration inflow, no income
      { monthlyAmount: 1_500, durationMonths: 12, age: 50, isInflow: false },      // duration outflow, incomeAnnual undefined
    ];
    for (const age of [40, 50, 60, 70, 71]) {
      for (const ev of events) {
        expect(eventAmountForYear(ev, age) + eventIncomeForYear(ev, age)).toBe(eventNetForYear(ev, age));
      }
    }
    // Spot-check the split itself for the income-bearing event.
    expect(eventAmountForYear(events[2], 40)).toBe(-36_000);
    expect(eventIncomeForYear(events[2], 40)).toBe(12_000);
    // Undefined incomeAnnual never contributes an income term.
    expect(eventIncomeForYear(events[4], 50)).toBe(0);
    expect(eventAmountForYear(events[4], 50)).toBe(-18_000);
  });

  it("eventIncomeForYear is always >= 0 even for an inflow event's own monthly amount", () => {
    const partTime = { monthlyAmount: 2_000, durationMonths: 12, age: 60, isInflow: true, incomeAnnual: 5_000 };
    expect(eventIncomeForYear(partTime, 60)).toBe(5_000);
    expect(eventAmountForYear(partTime, 60)).toBe(24_000); // still additive — duration inflow unaffected
  });

  it("one-time events never carry an income term", () => {
    const ev = { amount: 100_000, age: 65, isInflow: true, isTaxable: false };
    expect(eventIncomeForYear(ev, 65)).toBe(0);
    expect(eventAmountForYear(ev, 65)).toBe(100_000);
  });
});

describe("eventsIncomeAdjustment", () => {
  it("defaults to no-op for an empty array", () => {
    expect(eventsIncomeAdjustment([], 45)).toEqual({ pausedMonths: 0, workedFrac: 1, eventIncome: 0 });
  });

  it("mid-event proration: an 18-month event pauses 12 months yr1, 6 yr2", () => {
    const ev = { monthlyAmount: 6_000, durationMonths: 18, age: 40, isInflow: false, incomeAnnual: 12_000 };
    const yr1 = eventsIncomeAdjustment([ev], 40);
    expect(yr1.pausedMonths).toBe(12);
    expect(yr1.workedFrac).toBe(0);
    expect(yr1.eventIncome).toBe(12_000); // 12/12 × 12k

    const yr2 = eventsIncomeAdjustment([ev], 41);
    expect(yr2.pausedMonths).toBe(6);
    expect(yr2.workedFrac).toBe(0.5);
    expect(yr2.eventIncome).toBe(6_000); // 6/12 × 12k
  });

  it("two overlapping qualifying events cap pausedMonths at 12 while eventIncome adds uncapped", () => {
    const evA = { monthlyAmount: 1_000, durationMonths: 12, age: 40, isInflow: false, incomeAnnual: 10_000 };
    const evB = { monthlyAmount: 500, durationMonths: 12, age: 40, isInflow: false, incomeAnnual: 5_000 };
    const result = eventsIncomeAdjustment([evA, evB], 40);
    expect(result.pausedMonths).toBe(12); // 12 + 12 = 24, capped
    expect(result.workedFrac).toBe(0);
    expect(result.eventIncome).toBe(15_000); // 10k + 5k, uncapped
  });

  it("a duration INFLOW event is a no-op (stays additive side cash, not salary replacement)", () => {
    const partTime = { monthlyAmount: 2_000, durationMonths: 12, age: 60, isInflow: true, incomeAnnual: 5_000 };
    expect(eventsIncomeAdjustment([partTime], 60)).toEqual({ pausedMonths: 0, workedFrac: 1, eventIncome: 0 });
  });

  it("a one-time event is a no-op", () => {
    const ev = { amount: 40_000, age: 60, isInflow: false };
    expect(eventsIncomeAdjustment([ev], 60)).toEqual({ pausedMonths: 0, workedFrac: 1, eventIncome: 0 });
  });

  it("a duration outflow with undefined incomeAnnual does not qualify (legacy event = no statement about income)", () => {
    const ev = { monthlyAmount: 1_500, durationMonths: 12, age: 50, isInflow: false };
    expect(eventsIncomeAdjustment([ev], 50)).toEqual({ pausedMonths: 0, workedFrac: 1, eventIncome: 0 });
  });
});
