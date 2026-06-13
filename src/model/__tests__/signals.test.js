import { describe, it, expect } from "vitest";
import { calcSignals } from "../signals.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";

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
  });

  it("deficit signal fires only when budgetDeficit > 0, with dollars = the deficit", () => {
    expect(calcSignals({ ...quiet, budgetDeficit: 0 })).toEqual([]);
    const on = calcSignals({ ...quiet, budgetDeficit: 7_400 });
    expect(on).toHaveLength(1);
    expect(on[0].id).toBe("deficit");
    expect(on[0].dollars).toBe(7_400);
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
