import { describe, it, expect } from "vitest";
import { SCENARIOS, LIFE_EVENTS } from "../screens/IdeasScreen.jsx";

// ── V11 / WI-0.2: value-locks for the hardcoded Ideas preset tables ──────────
// These tables drive real model runs (calcWhatIfScenario overrides) and real
// plan mutations (moneyEvents commits). A silent edit to an amount, age, or
// retireAdj changes what users simulate/commit without any test noticing —
// so the exact values are locked here (principle 14). Update deliberately,
// together with this file, when a preset is intentionally changed.

describe("SCENARIOS preset table (IdeasScreen)", () => {
  it("locks the exact scenario definitions (keys, labels, overrides — no stats field)", () => {
    expect(SCENARIOS).toEqual([
      { k: "retire63", label: "Retire 2 yrs earlier", sub: "Save $250/mo more.", color: "good",
        retireAdj: -2 },
      { k: "retire60", label: "Retire at 60", sub: "5 yrs sooner.", color: "warm",
        retireAdj: -5 },
      { k: "saveMore", label: "Save $300 more/mo", sub: "Retire at 64.", color: "good",
        retireAdj: -1 },
      { k: "bigTrip", label: "Big trip at 70", sub: "Still funded.", color: "accent",
        retireAdj: 0,
        scenarioEvents: [{ label: "Big trip", amount: 40_000, age: 70, isInflow: false, isTaxable: false }] },
    ]);
  });

  it("carries no display numbers — scenarios are overrides only (V1: stats come from the model run)", () => {
    for (const s of SCENARIOS) {
      expect(s).not.toHaveProperty("stats");
      // Only override/presentation fields are allowed on a scenario entry.
      const allowed = ["k", "label", "sub", "color", "retireAdj", "scenarioEvents"];
      expect(Object.keys(s).every(key => allowed.includes(key))).toBe(true);
    }
  });
});

describe("LIFE_EVENTS preset table (IdeasScreen)", () => {
  it("locks the exact life-event definitions (labels, ages, amounts, direction)", () => {
    // Deliberately updated for the sheet-first life-event flow (arc-event
    // placement): presets are SEEDS for LifeEventSheet — `scen` coupling
    // removed, `icon` added (the arc badge), and two presets became duration
    // events (monthlyAmount/durationMonths/incomeAnnual — money-events.js).
    expect(LIFE_EVENTS).toEqual([
      { l: "Buy a home",      icon: "🏠", age: 40, amount: 60_000, isInflow: false },
      { l: "Kid's college",   icon: "🎓", age: 52, amount: 50_000, isInflow: false },
      { l: "Travel 6 months", icon: "✈️", age: 70, monthlyAmount: 6_000, durationMonths: 6,
        incomeAnnual: 0, isInflow: false },
      { l: "Downsize",        icon: "🏡", age: 72, amount: 80_000, isInflow: true  },
      { l: "Part-time at 60", icon: "💼", age: 60, monthlyAmount: 2_000, durationMonths: 12,
        incomeAnnual: 0, isInflow: true  },
    ]);
  });

  it("presets carry no display numbers beyond their seed values", () => {
    // Only seed/presentation fields are allowed — every displayed verdict/delta
    // comes from evaluateLifeEvent at open time (V1: stats come from the model run).
    const allowed = ["l", "icon", "age", "amount", "monthlyAmount", "durationMonths",
      "incomeAnnual", "isInflow"];
    for (const ev of LIFE_EVENTS) {
      expect(Object.keys(ev).every(key => allowed.includes(key))).toBe(true);
    }
  });
});
