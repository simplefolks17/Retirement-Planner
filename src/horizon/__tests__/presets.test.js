import { describe, it, expect } from "vitest";
import { RETIRE_JUMPS, LIFE_EVENTS } from "../presets.js";

// ── V11 / WI-0.2: value-locks for the hardcoded Ideas preset tables ──────────
// These tables drive real model runs (calcWhatIfScenario overrides via the
// Dials sliders) and real plan mutations (moneyEvents commits). A silent edit
// to an amount, age, or offset changes what users simulate/commit without any
// test noticing — so the exact values are locked here (principle 14). Update
// deliberately, together with this file, when a preset is intentionally changed.

describe("RETIRE_JUMPS preset table (IdeasScreen)", () => {
  // Replaces the old locked "Scenarios" preset cards (owner decision,
  // 2026-07-12): these are pure nudges of the Dials retire-age slider offset,
  // not committed state. Two chip kinds — "relative" and "absolute" — resolve
  // uniformly through handleRetireJump's clamp (see IdeasScreen.jsx).
  it("locks the exact quick-jump chip definitions (keys, labels, kind, offsets)", () => {
    expect(RETIRE_JUMPS).toEqual([
      { k: "retire2Early", label: "Retire 2 yrs earlier", kind: "relative", retireAdj: -2 },
      { k: "retire60",     label: "Retire at 60",          kind: "absolute", targetAge: 60 },
    ]);
  });

  it("carries no display numbers — chips are slider nudges only (V1: stats come from the model run)", () => {
    for (const jump of RETIRE_JUMPS) {
      expect(jump).not.toHaveProperty("stats");
      // Only override/presentation fields are allowed on a chip entry.
      const allowed = ["k", "label", "kind", "retireAdj", "targetAge"];
      expect(Object.keys(jump).every(key => allowed.includes(key))).toBe(true);
    }
  });
});

describe("LIFE_EVENTS preset table (IdeasScreen)", () => {
  it("locks the exact life-event definitions (labels, ages, amounts, direction)", () => {
    // Deliberately updated for the sheet-first life-event flow (arc-event
    // placement): presets are SEEDS for LifeEventSheet — `scen` coupling
    // removed, `icon` added (the arc badge), and two presets became duration
    // events (monthlyAmount/durationMonths/incomeAnnual — money-events.js).
    // "Big trip" folded in from the retired Scenarios card (2026-07-12,
    // owner decision) — same seed values, now a normal editable pill.
    // "Mortgage paid off" + "Higher early-retirement spend" added 2026-07-20
    // (moneyEvents extension): open-ended durations via `untilAge` (#53 / #10),
    // which fixed-length events couldn't model. Mortgage is the freed-cash
    // INFLOW from payoff (the baseline already contains the payment — an added
    // pre-payoff outflow would double-count it; coordinator review fix).
    expect(LIFE_EVENTS).toEqual([
      { l: "Buy a home",      icon: "🏠", age: 40, amount: 60_000, isInflow: false },
      { l: "Kid's college",   icon: "🎓", age: 52, amount: 50_000, isInflow: false },
      { l: "Travel 6 months", icon: "✈️", age: 70, monthlyAmount: 6_000, durationMonths: 6,
        incomeAnnual: 0, isInflow: false },
      { l: "Downsize",        icon: "🏡", age: 72, amount: 80_000, isInflow: true  },
      { l: "Part-time at 60", icon: "💼", age: 60, monthlyAmount: 2_000, durationMonths: 12,
        incomeAnnual: 0, isInflow: true  },
      { l: "Big trip",        icon: "🧳", age: 70, amount: 40_000, isInflow: false },
      { l: "Mortgage paid off", icon: "🔑", age: 60, monthlyAmount: 2_000, untilAge: 90,
        incomeAnnual: 0, isInflow: true },
      { l: "Higher early-retirement spend", icon: "🎢", age: 65, monthlyAmount: 1_500,
        untilAge: 75, isInflow: false },
    ]);
  });

  it("presets carry no display numbers beyond their seed values", () => {
    // Only seed/presentation fields are allowed — every displayed verdict/delta
    // comes from evaluateLifeEvent at open time (V1: stats come from the model run).
    const allowed = ["l", "icon", "age", "amount", "monthlyAmount", "durationMonths",
      "untilAge", "growthPct", "incomeAnnual", "isInflow"];
    for (const ev of LIFE_EVENTS) {
      expect(Object.keys(ev).every(key => allowed.includes(key))).toBe(true);
    }
  });
});
