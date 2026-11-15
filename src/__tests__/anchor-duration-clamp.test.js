// BUG-188 (CodeRabbit, PR #70): anchorWhatIfToHeadline computed headline + delta, which can go
// negative (a lever that hurts more than the whole headline duration). A duration cannot be
// negative, so the anchored years clamp at 0, and the delta is restated so that
// headline + delta still equals the years the screen prints.
import { describe, it, expect } from "vitest";
import { anchorWhatIfToHeadline } from "../model/what-if.js";

describe("BUG-188: anchored duration never goes negative", () => {
  it("headline 5, no-change 20, scenario 10 -> years clamp at 0 (not -5)", () => {
    const out = anchorWhatIfToHeadline({
      scenario: { scenarioYears: 10, scenarioTotalAtRet: 1_000_000 },
      noChange: { scenarioYears: 20, scenarioTotalAtRet: 1_000_000 },
      headline: { years: 5, depletionAge: null, totalAtRet: 1_000_000 },
      scenarioRetAge: 65,
    });
    expect(out.comparable).toBe(true);
    expect(out.scenarioYears).toBe(0);
    expect(out.deltaYears).toBe(-5);                       // headline 5 + (-5) = shown 0
    expect(out.baseYears + out.deltaYears).toBe(out.scenarioYears);
  });

  it("a non-negative anchored result is unchanged (headline 5, scenario 12 vs no-change 20 -> 5 + (-8) is clamped; 5 + 3 is not)", () => {
    const up = anchorWhatIfToHeadline({
      scenario: { scenarioYears: 23, scenarioTotalAtRet: 1 },
      noChange: { scenarioYears: 20, scenarioTotalAtRet: 1 },
      headline: { years: 5, depletionAge: null, totalAtRet: 1 },
      scenarioRetAge: 65,
    });
    expect(up.scenarioYears).toBe(8);
    expect(up.deltaYears).toBe(3);
  });
});

