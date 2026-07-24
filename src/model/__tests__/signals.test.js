import { describe, it, expect } from "vitest";
import { calcSignals } from "../signals.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";
import { NUMBERS_TABS } from "../../horizon/screens/NumbersScreen.jsx";

// ── WI-1.2 (#89): Plan-screen signals strip ──────────────────────────────────
// calcSignals receives VALUES App.jsx already computes (extraMatch from
// calcOptimizedAllocation, adjustedNetConversionBenefit from
// evaluateConversionPlan, budgetDeficit from calcSavingsCapacity) — it never
// recomputes them. It ranks qualifying signals by dollars descending and caps
// the result at `max` (default 2 — the Plan strip's hard cap lives HERE in the
// model, so the cap is testable and the screen only renders what it receives).

const quiet = { extraMatch: 0, adjustedNetConversionBenefit: 0, budgetDeficit: 0 };

describe("calcSignals — thresholds (each signal on/off independently)", () => {
  it("returns [] when nothing qualifies (default-state quiet inputs)", () => {
    expect(calcSignals(quiet)).toEqual([]);
  });

  it("match signal fires only when extraMatch > 0, with dollars = extraMatch", () => {
    expect(calcSignals({ ...quiet, extraMatch: 0 })).toEqual([]);
    const on = calcSignals({ ...quiet, extraMatch: 1_200 });
    expect(on).toHaveLength(1);
    expect(on[0].id).toBe("match");
    expect(on[0].dollars).toBe(1_200);
  });

  it("conversion signal fires only above the named CONVERSION_STEP threshold ($5k)", () => {
    const at = calcSignals({ ...quiet, adjustedNetConversionBenefit: ASSUMPTIONS.CONVERSION_STEP });
    expect(at).toEqual([]); // exactly at the threshold is NOT above it
    const above = calcSignals({ ...quiet, adjustedNetConversionBenefit: ASSUMPTIONS.CONVERSION_STEP + 1 });
    expect(above).toHaveLength(1);
    expect(above[0].id).toBe("conversion");
    expect(above[0].dollars).toBe(ASSUMPTIONS.CONVERSION_STEP + 1);
    // WI-3.6: deep-links into the Strategies conversion flow (the decision
    // surface), not the old Numbers → Year-by-year stopgap.
    expect(above[0].target).toEqual({ screen: "strategies", subView: "conversion" });
  });

  it("deficit signal fires only when budgetDeficit > 0, with dollars = the deficit", () => {
    expect(calcSignals({ ...quiet, budgetDeficit: 0 })).toEqual([]);
    const on = calcSignals({ ...quiet, budgetDeficit: 7_400 });
    expect(on).toHaveLength(1);
    expect(on[0].id).toBe("deficit");
    expect(on[0].dollars).toBe(7_400);
  });

  // BUG-43 (found 2026-07-11 by the interop audit, fixed same day): the match
  // and deficit signals targeted { screen: "numbers", subView: "flow" }, a tab
  // that PR #38 (2026-06-24) had already folded into Statement — clicking
  // either signal landed on a blank Numbers body. Retargeted to "budget" (the
  // savings waterfall + deficit warning live there).
  it("BUG-43: match and deficit signals deep-link to numbers/budget, not the removed numbers/flow tab", () => {
    const match = calcSignals({ ...quiet, extraMatch: 1_000 });
    expect(match[0].target).toEqual({ screen: "numbers", subView: "budget" });
    const deficit = calcSignals({ ...quiet, budgetDeficit: 1_000 });
    expect(deficit[0].target).toEqual({ screen: "numbers", subView: "budget" });
  });
});

describe("calcSignals — deep-link guard (BUG-43 class)", () => {
  // Machine-checked version of "does this signal's target tab still exist" —
  // iterates NumbersScreen's own exported tab-id list (NUMBERS_TABS) rather than
  // a second hardcoded copy here, so the two can never drift apart again.
  const numbersTabIds = NUMBERS_TABS.map(([id]) => id);

  it("every numbers-screen signal target's subView is a real NumbersScreen tab", () => {
    const all = calcSignals({
      extraMatch: 1_000, adjustedNetConversionBenefit: 60_000, budgetDeficit: 1_000,
    }, 10);
    const numbersTargets = all.filter(s => s.target.screen === "numbers");
    expect(numbersTargets.length).toBeGreaterThan(0);
    for (const sig of numbersTargets) {
      expect(numbersTabIds).toContain(sig.target.subView);
    }
  });
});

describe("calcSignals — low-odds confidence signal (#114 Range lens)", () => {
  it("no lowodds signal when monteCarloSuccessPct is null or omitted", () => {
    expect(calcSignals(quiet)).toEqual([]); // omitted → default null
    expect(calcSignals({ ...quiet, monteCarloSuccessPct: null })).toEqual([]);
  });

  it("fires below MONTE_CARLO_LOW_ODDS_PCT with pct set, target {screen:'plan'}, and NO dollars key", () => {
    const below = calcSignals({ ...quiet, monteCarloSuccessPct: ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT - 1 });
    expect(below).toHaveLength(1);
    expect(below[0].id).toBe("lowodds");
    expect(below[0].pct).toBe(ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT - 1);
    expect(below[0].target).toEqual({ screen: "strategies", subView: "worklonger" });
    expect("dollars" in below[0]).toBe(false);
  });

  it("does NOT fire at/above MONTE_CARLO_LOW_ODDS_PCT", () => {
    expect(calcSignals({ ...quiet, monteCarloSuccessPct: ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT })).toEqual([]);
    expect(calcSignals({ ...quiet, monteCarloSuccessPct: ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT + 5 })).toEqual([]);
  });

  it("dollar signals rank before the dollar-less lowodds signal", () => {
    const s = calcSignals({
      ...quiet,
      budgetDeficit: 12_000,
      monteCarloSuccessPct: ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT - 10,
    }, 5);
    expect(s.map(x => x.id)).toEqual(["deficit", "lowodds"]);
  });
});

describe("calcSignals — ranking and cap", () => {
  const allThree = {
    extraMatch: 3_000,
    adjustedNetConversionBenefit: 77_861, // golden-master default value
    budgetDeficit: 12_000,
  };

  it("ranks qualifying signals by dollars descending", () => {
    const s = calcSignals(allThree, 3);
    expect(s.map(x => x.id)).toEqual(["conversion", "deficit", "match"]);
    expect(s[0].dollars).toBeGreaterThan(s[1].dollars);
    expect(s[1].dollars).toBeGreaterThan(s[2].dollars);
  });

  it("caps at max = 2 by default (the Plan strip hard cap, in the model)", () => {
    const s = calcSignals(allThree);
    expect(s).toHaveLength(2);
    expect(s.map(x => x.id)).toEqual(["conversion", "deficit"]); // the two largest
  });

  it("honors an explicit max (1 → only the largest; 0 → none)", () => {
    expect(calcSignals(allThree, 1).map(x => x.id)).toEqual(["conversion"]);
    expect(calcSignals(allThree, 0)).toEqual([]);
  });
});

describe("calcSignals — shape contract (the strip renders these fields verbatim)", () => {
  it("every signal carries id, title, body, dollars, and a {screen, subView} target", () => {
    const s = calcSignals({ extraMatch: 500, adjustedNetConversionBenefit: 60_000, budgetDeficit: 900 }, 3);
    for (const sig of s) {
      expect(typeof sig.id).toBe("string");
      expect(typeof sig.title).toBe("string");
      expect(sig.title.length).toBeGreaterThan(0);
      expect(typeof sig.body).toBe("string");
      expect(sig.body.length).toBeGreaterThan(0);
      expect(typeof sig.dollars).toBe("number");
      expect(typeof sig.target.screen).toBe("string");
      expect(typeof sig.target.subView).toBe("string");
    }
  });

  it("dollars are integers (display-ready — the screen only formats)", () => {
    const s = calcSignals({ ...quiet, adjustedNetConversionBenefit: 12_345.67 });
    expect(s[0].dollars).toBe(12_346);
  });
});

describe("calcSignals — golden-master default state", () => {
  // At the locked default state: matchMode is "flat" (extraMatch 0), the budget
  // balances (deficit 0), and adjustedNetConversionBenefit is 77,861 — so the
  // strip shows EXACTLY one signal: the conversion nudge.
  it("default state fires only the conversion signal", () => {
    const s = calcSignals({ extraMatch: 0, adjustedNetConversionBenefit: 77_861, budgetDeficit: 0 });
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe("conversion");
    expect(s[0].dollars).toBe(77_861);
  });
});

describe("calcSignals — pre-tax concentration signal (#56)", () => {
  it("fires when preTaxConcentrationPct is above TAX_DIVERSIFICATION_HIGH_PCT, dollars = the rate-rise cost", () => {
    const s = calcSignals({
      ...quiet,
      preTaxConcentrationPct: ASSUMPTIONS.TAX_DIVERSIFICATION_HIGH_PCT + 5, // 85
      preTaxConcentrationCost: 50_000,
    });
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe("concentration");
    expect(s[0].dollars).toBe(50_000);
    expect(s[0].target).toEqual({ screen: "numbers", subView: "accounts" });
  });

  it("does NOT fire at exactly TAX_DIVERSIFICATION_HIGH_PCT or below", () => {
    expect(calcSignals({
      ...quiet,
      preTaxConcentrationPct: ASSUMPTIONS.TAX_DIVERSIFICATION_HIGH_PCT,
      preTaxConcentrationCost: 50_000,
    })).toEqual([]);
    expect(calcSignals({
      ...quiet,
      preTaxConcentrationPct: ASSUMPTIONS.TAX_DIVERSIFICATION_HIGH_PCT - 20,
      preTaxConcentrationCost: 50_000,
    })).toEqual([]);
  });

  it("does NOT fire when preTaxConcentrationCost is null, even if the pct is high", () => {
    expect(calcSignals({
      ...quiet,
      preTaxConcentrationPct: ASSUMPTIONS.TAX_DIVERSIFICATION_HIGH_PCT + 10,
      preTaxConcentrationCost: null,
    })).toEqual([]);
  });

  it("ranks among the dollar-quantified nudges by dollars descending", () => {
    const s = calcSignals({
      extraMatch: 0,
      adjustedNetConversionBenefit: ASSUMPTIONS.CONVERSION_STEP + 1_000, // small dollar signal, above the fire threshold
      budgetDeficit: 0,
      preTaxConcentrationPct: 90,
      preTaxConcentrationCost: 80_000, // large dollar signal
    }, 5);
    expect(s.map(x => x.id)).toEqual(["concentration", "conversion"]);
    expect(s[0].dollars).toBeGreaterThan(s[1].dollars);
  });
});

describe("calcSignals — anti-divergence (#116: Plan strip vs Strategies 'For you' strip)", () => {
  // App.jsx builds ONE signalInputs object and calls calcSignals(signalInputs, 2)
  // for Plan and calcSignals(signalInputs, 3) for Strategies. Because calcSignals
  // ranks then slices, the max-3 list's first two entries must ALWAYS equal the
  // max-2 list — the two surfaces can never show a different top signal.
  const cases = [
    // Only one signal fires.
    { extraMatch: 0, adjustedNetConversionBenefit: 77_861, budgetDeficit: 0 },
    // Two signals fire.
    { extraMatch: 3_000, adjustedNetConversionBenefit: 0, budgetDeficit: 12_000 },
    // 3+ signals fire (extraMatch, conversion, deficit, lowodds all qualify).
    {
      extraMatch: 3_000,
      adjustedNetConversionBenefit: ASSUMPTIONS.CONVERSION_STEP + 20_000,
      budgetDeficit: 12_000,
      monteCarloSuccessPct: ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT - 10,
    },
    // Nothing fires.
    quiet,
  ];

  it.each(cases)("max-3 list's first 2 entries deep-equal the max-2 list (case %#)", (inputs) => {
    const two = calcSignals(inputs, 2);
    const three = calcSignals(inputs, 3);
    expect(three.slice(0, 2)).toEqual(two);
    expect(three.length).toBeLessThanOrEqual(3);
  });
});
