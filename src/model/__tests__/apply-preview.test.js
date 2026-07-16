import { describe, it, expect } from "vitest";
import {
  fmtMoney, buildPreviewMetric, isSuggestionApplicable, buildConversionPreview, verdictDisplay,
  buildSurplusPreview, buildCommitPlanPreview,
} from "../apply-preview.js";
import { buildRmdComparison, walkBalanceAt } from "../retirement-phase.js";
import { verdictForMargin } from "../what-if.js";

// ── verdictDisplay (#85 readiness) ───────────────────────────────────────────
describe("verdictDisplay", () => {
  it("maps comfortable → { label: 'Comfortable', tone: 'good' }", () => {
    expect(verdictDisplay("comfortable")).toEqual({ label: "Comfortable", tone: "good" });
  });
  it("maps tight → { label: 'Tight', tone: 'warm' }", () => {
    expect(verdictDisplay("tight")).toEqual({ label: "Tight", tone: "warm" });
  });
  it("maps unaffordable → a supported tone (no 'bad' tone exists, so it uses 'warm')", () => {
    const d = verdictDisplay("unaffordable");
    expect(d.label).toBe("Doesn't fit");
    // VerdictBadge (ApplyPreviewModal.jsx) only special-cases "good"/"warm" and
    // falls back to a neutral token for anything else — every verdictDisplay
    // tone must be one VerdictBadge actually renders distinctly.
    expect(["good", "warm"]).toContain(d.tone);
  });
  it("returns null for an unknown/unrecognized verdict string", () => {
    expect(verdictDisplay("nonsense")).toBeNull();
    expect(verdictDisplay(undefined)).toBeNull();
    expect(verdictDisplay(null)).toBeNull();
  });
});

// ── verdictForMargin (what-if.js) — threshold reuse ──────────────────────────
// verdictForMargin is exported from what-if.js (fix pass 2, #85 readiness) so
// verdictDisplay's mapping and this threshold formula can be tested/consumed
// independently while staying the ONE definition (evaluateLifeEvent /
// buildLeverPreview / buildLeverRail / buildDurationRail all call it).
describe("verdictForMargin (exported from what-if.js)", () => {
  it("negative margin → unaffordable", () => {
    expect(verdictForMargin(-0.1)).toBe("unaffordable");
  });
  it("0 <= margin < buffer → tight", () => {
    expect(verdictForMargin(0)).toBe("tight");
    expect(verdictForMargin(4.9)).toBe("tight");
  });
  it("margin >= buffer → comfortable", () => {
    expect(verdictForMargin(5)).toBe("comfortable");
    expect(verdictForMargin(Infinity)).toBe("comfortable");
  });
  it("every verdictForMargin output has a verdictDisplay mapping", () => {
    for (const margin of [-10, -0.1, 0, 2.5, 4.9, 5, 50, Infinity]) {
      expect(verdictDisplay(verdictForMargin(margin))).not.toBeNull();
    }
  });
});

describe("fmtMoney", () => {
  it("formats a positive value", () => {
    expect(fmtMoney(12_400)).toBe("$12,400");
  });
  it("formats a negative value with U+2212 minus", () => {
    expect(fmtMoney(-9_854)).toBe("−$9,854");
    expect(fmtMoney(-9_854)[0]).toBe("−");
  });
  it("renders null/non-finite as an em dash", () => {
    expect(fmtMoney(null)).toBe("—");
    expect(fmtMoney(undefined)).toBe("—");
    expect(fmtMoney(NaN)).toBe("—");
    expect(fmtMoney(Infinity)).toBe("—");
  });
});

describe("buildPreviewMetric — money format", () => {
  it("dir up / tone good when the delta matches betterDir", () => {
    const m = buildPreviewMetric({ id: "x", label: "L", before: -9_854, after: 12_400, betterDir: "up" });
    expect(m.before).toBe("−$9,854");
    expect(m.after).toBe("$12,400");
    expect(m.delta).toEqual({ dir: "up", label: "+$22,254", tone: "good" });
  });

  it("dir down / tone warm when betterDir is up but value fell", () => {
    const m = buildPreviewMetric({ id: "x", label: "L", before: 100_000, after: 80_000, betterDir: "up" });
    expect(m.delta).toEqual({ dir: "down", label: "−$20,000", tone: "warm" });
  });

  it("betterDir 'down' flips the tone mapping (e.g. lifetime RMD tax)", () => {
    const lower = buildPreviewMetric({ id: "rmdTax", label: "L", before: 207_557, after: 180_000, betterDir: "down" });
    expect(lower.delta.dir).toBe("down");
    expect(lower.delta.tone).toBe("good"); // a fall matches betterDir "down" → good

    const higher = buildPreviewMetric({ id: "rmdTax", label: "L", before: 180_000, after: 207_557, betterDir: "down" });
    expect(higher.delta.dir).toBe("up");
    expect(higher.delta.tone).toBe("warm"); // a rise doesn't match betterDir "down" → warm
  });

  it("zero delta reports dir none / tone neutral / label 'no change'", () => {
    const m = buildPreviewMetric({ id: "x", label: "L", before: 50_000, after: 50_000, betterDir: "up" });
    expect(m.delta).toEqual({ dir: "none", label: "no change", tone: "neutral" });
  });

  it("null before or after yields '—' text and a neutral no-op delta", () => {
    const m1 = buildPreviewMetric({ id: "x", label: "L", before: null, after: 12_400, betterDir: "up" });
    expect(m1.before).toBe("—");
    expect(m1.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });

    const m2 = buildPreviewMetric({ id: "x", label: "L", before: 12_400, after: null, betterDir: "up" });
    expect(m2.after).toBe("—");
    expect(m2.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });
});

describe("buildPreviewMetric — longevity format", () => {
  it("both Infinity renders 'lasts beyond your plan' with a no-change delta", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: Infinity, depletionAge: null },
      after: { years: Infinity, depletionAge: null },
    });
    expect(m.before).toBe("lasts beyond your plan");
    expect(m.after).toBe("lasts beyond your plan");
    expect(m.delta).toEqual({ dir: "none", label: "no change", tone: "neutral" });
  });

  it("finite case renders 'to age {age}' (calm, no decimal)", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: 21.3, depletionAge: 87 },
      after: { years: 25.0, depletionAge: 91 },
    });
    expect(m.before).toBe("to age 87");
    expect(m.after).toBe("to age 91");
  });

  it("finite years with a null depletionAge renders whole '~{yrs} yrs'", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: 10.5, depletionAge: null },
      after: { years: 10.5, depletionAge: null },
    });
    expect(m.before).toBe("~11 yrs");
    expect(m.after).toBe("~11 yrs");
  });

  it("crossing from finite to Infinity is an improvement ('beyond plan')", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: 21.3, depletionAge: 87 },
      after: { years: Infinity, depletionAge: null },
    });
    expect(m.delta).toEqual({ dir: "up", label: "beyond plan", tone: "good" });
  });

  it("crossing from Infinity to finite is a regression ('shorter')", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: Infinity, depletionAge: null },
      after: { years: 21.3, depletionAge: 87 },
    });
    expect(m.delta).toEqual({ dir: "down", label: "shorter", tone: "warm" });
  });

  it("both finite renders a signed whole-year delta", () => {
    // 21.3 → 25, 24.8 → 25 rounded: diff of the ROUNDED years (21 vs 25 = +4).
    const gained = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: 21.3, depletionAge: 87 },
      after: { years: 24.8, depletionAge: 90 },
    });
    expect(gained.delta).toEqual({ dir: "up", label: "+4 yrs", tone: "good" });

    const lost = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: 24.8, depletionAge: 90 },
      after: { years: 21.3, depletionAge: 87 },
    });
    expect(lost.delta).toEqual({ dir: "down", label: "−4 yrs", tone: "warm" });
  });
});

describe("buildPreviewMetric — longevity null-years guard", () => {
  it("null before.years renders '—' and a neutral no-op delta", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: null, depletionAge: null },
      after: { years: 21.3, depletionAge: 87 },
    });
    expect(m.before).toBe("—");
    expect(m.after).toBe("to age 87");
    expect(m.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });

  it("null after.years renders '—' and a neutral no-op delta", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: 21.3, depletionAge: 87 },
      after: { years: null, depletionAge: null },
    });
    expect(m.before).toBe("to age 87");
    expect(m.after).toBe("—");
    expect(m.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });

  it("both null renders '—'/'—' and a neutral no-op delta", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: { years: null, depletionAge: null },
      after: { years: null, depletionAge: null },
    });
    expect(m.before).toBe("—");
    expect(m.after).toBe("—");
    expect(m.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });

  it("a null before/after OBJECT (not just null years) is handled the same way", () => {
    const m = buildPreviewMetric({
      id: "longevity", label: "Portfolio lasts", format: "longevity", betterDir: "up",
      before: null,
      after: { years: 21.3, depletionAge: 87 },
    });
    expect(m.before).toBe("—");
    expect(m.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });
});

describe("buildPreviewMetric — percent format", () => {
  it("renders one decimal place with a % sign", () => {
    const m = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down",
      before: 15, after: 15,
    });
    expect(m.before).toBe("15.0%");
    expect(m.after).toBe("15.0%");
  });

  it("dir up / tone good when the delta matches betterDir", () => {
    const m = buildPreviewMetric({
      id: "rate", label: "Savings rate", format: "percent", betterDir: "up",
      before: 18.2, after: 27.9,
    });
    expect(m.delta).toEqual({ dir: "up", label: "+9.7 pts", tone: "good" });
  });

  it("betterDir 'down' flips the tone mapping", () => {
    const lower = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down",
      before: 6.5, after: 4.2,
    });
    expect(lower.delta.dir).toBe("down");
    expect(lower.delta.tone).toBe("good");

    const higher = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down",
      before: 4.2, after: 6.5,
    });
    expect(higher.delta.dir).toBe("up");
    expect(higher.delta.tone).toBe("warm");
  });

  it("uses U+2212 minus (not ASCII hyphen) for a negative delta", () => {
    const m = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down",
      before: 6.5, after: 4.2,
    });
    expect(m.delta.label).toBe("−2.3 pts");
    expect(m.delta.label[0]).toBe("−");
  });

  it("zero delta reports dir none / tone neutral / label 'no change'", () => {
    const m = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down",
      before: 4.2, after: 4.2,
    });
    expect(m.delta).toEqual({ dir: "none", label: "no change", tone: "neutral" });
  });

  it("rounds before diffing — displayed values that round to the SAME 1-decimal figure show 'no change'", () => {
    // 15.001 and 15.004 both round to 15.0% — the delta must not contradict
    // two identically-displayed percent strings.
    const m = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down",
      before: 15.001, after: 15.004,
    });
    expect(m.before).toBe("15.0%");
    expect(m.after).toBe("15.0%");
    expect(m.delta).toEqual({ dir: "none", label: "no change", tone: "neutral" });
  });

  it("rounds before diffing — a delta that crosses a 1-decimal boundary is honestly shown", () => {
    // 15.04 rounds to 15.0%, 15.06 rounds to 15.1% — the two displayed figures
    // genuinely differ by 0.1 pt, so the delta must say so (not "no change",
    // which a naive raw-float diff of 0.02 rounded to 0.0 would wrongly show).
    const m = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "up",
      before: 15.04, after: 15.06,
    });
    expect(m.before).toBe("15.0%");
    expect(m.after).toBe("15.1%");
    expect(m.delta).toEqual({ dir: "up", label: "+0.1 pts", tone: "good" });
  });

  it("null before or after yields '—' text and a neutral no-op delta", () => {
    const m1 = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down", before: null, after: 4.2,
    });
    expect(m1.before).toBe("—");
    expect(m1.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });

    const m2 = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down", before: 4.2, after: null,
    });
    expect(m2.after).toBe("—");
    expect(m2.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });

  it("non-finite (NaN/Infinity) before or after yields '—' and a neutral no-op delta", () => {
    const m = buildPreviewMetric({
      id: "wr", label: "Withdrawal rate", format: "percent", betterDir: "down", before: NaN, after: 4.2,
    });
    expect(m.before).toBe("—");
    expect(m.delta).toEqual({ dir: "none", label: "—", tone: "neutral" });
  });
});

describe("isSuggestionApplicable", () => {
  const base = {
    optimizerResult: { optimalConversion: 90_000, optimalStartAge: 61 },
    annualConversion: 82_765, resolvedStartAge: 61,
  };

  it("false without either healthcare toggle on", () => {
    expect(isSuggestionApplicable({ ...base, hasMedicare: false, hasMarketplaceInsurance: false })).toBe(false);
  });

  it("false when optimizerResult is null, even with healthcare on", () => {
    expect(isSuggestionApplicable({
      ...base, optimizerResult: null, hasMedicare: true, hasMarketplaceInsurance: false,
    })).toBe(false);
  });

  it("true when the amount differs by more than 4,999 and Medicare is on", () => {
    expect(isSuggestionApplicable({
      ...base,
      optimizerResult: { optimalConversion: 82_765 + 5_000, optimalStartAge: 61 },
      hasMedicare: true, hasMarketplaceInsurance: false,
    })).toBe(true);
  });

  it("false at exactly a 4,999 difference (threshold is strictly greater-than)", () => {
    expect(isSuggestionApplicable({
      ...base,
      optimizerResult: { optimalConversion: 82_765 + 4_999, optimalStartAge: 61 },
      hasMedicare: true, hasMarketplaceInsurance: false,
    })).toBe(false);
  });

  it("true when only the start age differs, even with an identical amount", () => {
    expect(isSuggestionApplicable({
      ...base,
      optimizerResult: { optimalConversion: 82_765, optimalStartAge: 63 },
      annualConversion: 82_765, resolvedStartAge: 61,
      hasMedicare: true, hasMarketplaceInsurance: false,
    })).toBe(true);
  });

  // WI-3.6's done-when, machine-checked: applying the suggestion writes
  // candidate === current (amount + start age both match), which must
  // falsify the gate so the "Optimizer Suggestion" box disappears.
  it("false once the candidate has been applied (candidate === current)", () => {
    expect(isSuggestionApplicable({
      optimizerResult: { optimalConversion: 90_000, optimalStartAge: 62 },
      annualConversion: 90_000, resolvedStartAge: 62,
      hasMedicare: true, hasMarketplaceInsurance: true,
    })).toBe(false);
  });
});

describe("buildConversionPreview", () => {
  const current = {
    adjustedNetConversionBenefit: -9_854, yearsSustained: 21.3, depletionAge: 87,
    balAtRef: 1_200_000, rmdTaxBite: 207_557, annualConversion: 82_765, startAge: 61,
  };
  const candidate = {
    netBenefit: 12_400, yearsSustained: Infinity, depletionAge: null,
    balAtRef: 1_500_000, rmdTaxBite: 150_000,
  };
  const suggestion = { optimalStartAge: 61, optimalConversion: 90_000 };

  it("has the full payload shape with metrics in the specified order", () => {
    const preview = buildConversionPreview({ current, candidate, suggestion, refAge: 90 });
    expect(preview.title).toBe("Apply optimizer suggestion");
    expect(preview.confirmLabel).toBe("Apply");
    expect(preview.note).toBe("Preview uses the same per-account engine as your headline numbers.");
    expect(preview.verdict).toBe(null);
    expect(preview.metrics.map(m => m.id)).toEqual(["netBenefit", "longevity", "balAtRef", "rmdTax"]);
  });

  it("action string names both the suggested and the current amount/age", () => {
    const preview = buildConversionPreview({ current, candidate, suggestion, refAge: 90 });
    expect(preview.action).toContain("$90,000/yr starting at age 61");
    expect(preview.action).toContain("$82,765/yr from age 61");
  });

  it("the balAtRef label uses refAge", () => {
    const preview = buildConversionPreview({ current, candidate, suggestion, refAge: 90 });
    expect(preview.metrics.find(m => m.id === "balAtRef").label).toBe("Balance at 90");
  });
});

describe("buildRmdComparison", () => {
  it("joins baseline and plan rows by age", () => {
    const noConv = [{ age: 73, rmd: 60_000 }, { age: 74, rmd: 62_000 }];
    const plan = [{ age: 73, rmd: 50_000 }, { age: 74, rmd: 62_000 }];
    const rows = buildRmdComparison(noConv, plan);
    expect(rows).toEqual([
      { age: 73, noConv: 60_000, withConv: 50_000, improved: true },
      { age: 74, noConv: 62_000, withConv: 62_000, improved: false },
    ]);
  });

  it("a baseline age missing from the plan schedule reports withConv null, improved false", () => {
    const noConv = [{ age: 73, rmd: 60_000 }];
    const plan = [];
    const rows = buildRmdComparison(noConv, plan);
    expect(rows).toEqual([{ age: 73, noConv: 60_000, withConv: null, improved: false }]);
  });

  it("improved is true only when strictly lower, never on a tie", () => {
    const noConv = [{ age: 73, rmd: 60_000 }];
    const plan = [{ age: 73, rmd: 60_000 }];
    expect(buildRmdComparison(noConv, plan)[0].improved).toBe(false);
  });

  it("iterates the baseline — a baseline row absent from the plan still appears", () => {
    const noConv = [{ age: 73, rmd: 60_000 }, { age: 90, rmd: 5_000 }];
    const plan = [{ age: 73, rmd: 50_000 }]; // no row for age 90 (plan depleted earlier)
    const rows = buildRmdComparison(noConv, plan);
    expect(rows.map(r => r.age)).toEqual([73, 90]);
    expect(rows[1]).toEqual({ age: 90, noConv: 5_000, withConv: null, improved: false });
  });
});

describe("walkBalanceAt", () => {
  it("returns the exact-age row's total", () => {
    const rows = [{ age: 65, total: 1_000_000 }, { age: 66, total: 950_000 }];
    expect(walkBalanceAt(rows, 66)).toBe(950_000);
  });

  it("returns the last row's total when age is past the end of the walk", () => {
    const rows = [{ age: 65, total: 1_000_000 }, { age: 87, total: 0 }];
    expect(walkBalanceAt(rows, 90)).toBe(0);
  });

  it("returns 0 for empty or undefined rows", () => {
    expect(walkBalanceAt([], 90)).toBe(0);
    expect(walkBalanceAt(undefined, 90)).toBe(0);
  });

  it("clamps a negative total to 0", () => {
    const rows = [{ age: 90, total: -500 }];
    expect(walkBalanceAt(rows, 90)).toBe(0);
  });
});
