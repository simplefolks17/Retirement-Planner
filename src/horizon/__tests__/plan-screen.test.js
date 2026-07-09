// ── PlanScreen — QuickTunePanel tests ─────────────────────────────────────────
//
// Tests the Plan screen's new Quick Tune interactive panel:
//   1. Panel renders (smoke).
//   2. All core sliders present with aria-label attributes.
//   3. Each slider fires its setter when changed.
//   4. Reset button absent when committedPlan is null.
//   5. Reset button present when committedPlan exists and values differ.
//   6. Conditional sliders: spouse SS only when isMarried; Roth only when conversionWindowYrs > 0.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import PlanScreen from "../screens/PlanScreen.jsx";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {
      innerWidth: 1200,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => {
  delete globalThis.window;
  delete globalThis.ResizeObserver;
});

// ── Minimal theme ─────────────────────────────────────────────────────────────
const t = {
  bg: "#fff", surf: "#f9f7f4", surf2: "#ede9e2",
  line: "#e8e3d9", line2: "#d4cfc3", ink: "#1a1815", mut: "#6b6560",
  faint: "#b0a99e", accent: "#7c4a2e", good: "#2d7a4f", warm: "#c05f1e",
};

// ── Stable no-op setters (spies) ──────────────────────────────────────────────
const makeMockProps = (overrides = {}) => ({
  // Core display values
  chartData:        [{ age: 35, total: 165_000 }, { age: 65, total: 3_950_000 }],
  currentAge:       35,
  retirementAge:    65,
  lifeExpect:       90,
  totalAtRet:       3_950_000,
  isSustainable:    true,
  takeHome:         6_000,
  effectiveExpenses: 4_787,
  annualExpenses:   57_444,
  balAt90:          4_000_000,
  contribSeries:    [],
  activity:         "golf course",
  moneyEvents:      [],
  retirementWalk:   { rows: [] },
  planView: {
    progressPct: 100,
    drivers: [
      { id: "withdrawal", ok: true, withdrawalRatePct: 1.42, guidelinePct: 4 },
      { id: "longevity",  ok: null, sustainedYears: null, horizonYears: 55 },
      { id: "savings",    ok: true, savingsRatePct: 17, guidelinePct: 15 },
    ],
  },
  signals: [],
  // Quick Tune raw values
  returnRate:          5,
  inflationRate:       4,
  incomeGrowth:        3,
  contrib401k:         10_000,
  ssClaimingAge:       67,
  spouseClaimingAge:   67,
  annualConversionAmt: 20_000,
  trad401kMax:         24_500,
  isMarried:           false,
  conversionWindowYrs: 0,
  committedPlan:       null,
  // Setters (spies)
  setRetirementAge:          vi.fn(),
  setAnnualExpenses:         vi.fn(),
  setLifeExpect:             vi.fn(),
  setContrib401k:            vi.fn(),
  setIncomeGrowth:           vi.fn(),
  setReturnRate:             vi.fn(),
  setInflationRate:          vi.fn(),
  setSsClaimingAge:          vi.fn(),
  setSpouseClaimingAge:      vi.fn(),
  setAnnualConversionAmt:    vi.fn(),
  // Coupled callbacks passed from App.jsx (rule 10 + invariant-preserving)
  setRetirementAgeCoupled:   vi.fn(),
  setMonthlySpend:           vi.fn(),
  setConversionMode:         vi.fn(),
  // Pre-computed monthly spend (rule 10: no division in PlanScreen)
  monthlySpend:              Math.round(57_444 / 12),
  // Pre-computed slider bounds (rule 10: no bounds math in PlanScreen)
  sliderBounds: {
    retireMin: 36, retireMax: 80,
    spendMin: 500, spendMax: 30_000,
    horizonMin: 70, horizonMax: 115,
    contribMax: 24_500, rothMax: 200_000,
    canTuneRothConversion: false,
  },
  commitPlan:                vi.fn(),
  planCommit: {
    available: true,
    preview: {
      title: "Save this as your plan?",
      action: "Retire at 65 · $4,787/mo spend",
      confirmLabel: "Save plan",
      metrics: [
        { id: "totalAtRet", label: "Nest egg at retirement",
          before: "—", after: "$3.95M", delta: { dir: "up", label: "+$3.95M", tone: "good" } },
      ],
      note: null,
      verdict: null,
    },
    apply: vi.fn(),
  },
  ...overrides,
});

// Collect all text from a react-test-renderer tree.
function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

// Find all nodes matching a predicate in the tree.
function findAll(node, pred, results = []) {
  if (!node || typeof node === "string") return results;
  if (pred(node)) results.push(node);
  (node.children ?? []).forEach(c => findAll(c, pred, results));
  return results;
}

// Find all range inputs.
function rangeInputs(root) {
  return findAll(root, n => n.type === "input" && n.props?.type === "range");
}

// Click the first clickable node (onClick handler) whose text matches exactly.
function clickByText(root, label) {
  const target = root.findAll(
    n => typeof n.props?.onClick === "function" && textOf(n) === label
  )[0];
  expect(target, `clickable element "${label}" not found`).toBeTruthy();
  act(() => { target.props.onClick(); });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PlanScreen — QuickTunePanel smoke", () => {
  it("renders without crashing", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("renders the 'Tune your plan' section header", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root).toLowerCase()).toContain("tune your plan");
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — pill rail renders all core sliders", () => {
  const CORE_PILLS = ["Retire at", "Monthly spend", "Plan to age", "401k savings",
                      "Income growth", "Growth rate", "Inflation", "SS age"];

  it("all 8 core pill labels are present", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    for (const pill of CORE_PILLS) {
      expect(allText).toContain(pill);
    }
    act(() => renderer.unmount());
  });

  it("active slider has aria-label attribute", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const inputs = rangeInputs(renderer.root);
    expect(inputs.length).toBeGreaterThan(0);
    // The active slider must have an aria-label set to the slider headline
    expect(inputs[0].props["aria-label"]).toBeTruthy();
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — slider onChange fires the correct setter", () => {
  it("changing the active (retire) slider calls setRetirementAgeCoupled", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const inputs = rangeInputs(renderer.root);
    act(() => {
      inputs[0].props.onChange({ target: { value: "62" } });
    });
    expect(props.setRetirementAgeCoupled).toHaveBeenCalledWith(62);
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — Reset button visibility", () => {
  it("Reset button is absent when committedPlan is null", () => {
    const props = makeMockProps({ committedPlan: null });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).not.toContain("Reset");
    act(() => renderer.unmount());
  });

  it("Reset button is absent when committed values match current values", () => {
    const props = makeMockProps({
      committedPlan: {
        retirementAge: 65, annualExpenses: 57_444, lifeExpect: 90,
        returnRate: 5, inflationRate: 4, incomeGrowth: 3, contrib401k: 10_000,
        ssClaimingAge: 67, spouseClaimingAge: 67, annualConversionAmt: 20_000,
      },
    });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).not.toContain("Reset");
    act(() => renderer.unmount());
  });

  it("Reset button is present when a slider value differs from the snapshot", () => {
    const props = makeMockProps({
      retirementAge: 62,   // changed from snapshot's 65
      committedPlan: {
        retirementAge: 65, annualExpenses: 57_444, lifeExpect: 90,
        returnRate: 5, inflationRate: 4, incomeGrowth: 3, contrib401k: 10_000,
        ssClaimingAge: 67, spouseClaimingAge: 67, annualConversionAmt: 20_000,
      },
    });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).toContain("Reset");
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — Save as my plan (Apply-with-preview, WI-3.9)", () => {
  it("opens ApplyPreviewModal sourced from planCommit.preview", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    clickByText(renderer.root, "Save as my plan");
    const allText = textOf(renderer.root);
    expect(allText).toContain(props.planCommit.preview.title);
    expect(allText).toContain(props.planCommit.preview.action);
    expect(allText).toContain("Nest egg at retirement");
    act(() => renderer.unmount());
  });

  it("Cancel closes the modal without calling planCommit.apply", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    clickByText(renderer.root, "Save as my plan");
    clickByText(renderer.root, "Cancel");
    expect(props.planCommit.apply).not.toHaveBeenCalled();
    expect(textOf(renderer.root)).not.toContain(props.planCommit.preview.title);
    act(() => renderer.unmount());
  });

  it("Confirm calls planCommit.apply() and shows the saved state", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    clickByText(renderer.root, "Save as my plan");
    clickByText(renderer.root, "Save plan");
    expect(props.planCommit.apply).toHaveBeenCalledTimes(1);
    expect(textOf(renderer.root)).toContain("✓ Plan saved");
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — conditional sliders", () => {
  it("Spouse SS pill is absent when isMarried = false", () => {
    const props = makeMockProps({ isMarried: false });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).not.toContain("Spouse SS");
    act(() => renderer.unmount());
  });

  it("Spouse SS pill is present when isMarried = true", () => {
    const props = makeMockProps({ isMarried: true });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).toContain("Spouse SS");
    act(() => renderer.unmount());
  });

  it("Roth conv. pill is absent when conversionWindowYrs = 0", () => {
    const props = makeMockProps({ conversionWindowYrs: 0 });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).not.toContain("Roth conv.");
    act(() => renderer.unmount());
  });

  it("Roth conv. pill is present when conversionWindowYrs > 0", () => {
    const props = makeMockProps({
      conversionWindowYrs: 7,
      sliderBounds: {
        retireMin: 36, retireMax: 80,
        spendMin: 500, spendMax: 30_000,
        horizonMin: 70, horizonMax: 115,
        contribMax: 24_500, rothMax: 200_000,
        canTuneRothConversion: true,
      },
    });
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    expect(textOf(renderer.root)).toContain("Roth conv.");
    act(() => renderer.unmount());
  });
});

describe("plan screen wow additions", () => {
  const wowProps = {
    chartData:        [{ age: 35, total: 165_000 }, { age: 65, total: 3_950_000 }],
    currentAge:       35,
    retirementAge:    65,
    lifeExpect:       90,
    totalAtRet:       3_950_000,
    isSustainable:    true,
    takeHome:         6_000,
    effectiveExpenses: 4_787,
    annualExpenses:   57_444,
    balAt90:          4_000_000,
    contribSeries:    [],
    activity:         "golf course",
    moneyEvents:      [],
    retirementWalk:   { rows: [] },
    planView: {
      progressPct: 100,
      drivers: [
        { id: "withdrawal", ok: true, withdrawalRatePct: 1.42, guidelinePct: 4 },
        { id: "longevity",  ok: null, sustainedYears: null, horizonYears: 55 },
        { id: "savings",    ok: true, savingsRatePct: 17, guidelinePct: 15 },
      ],
    },
    signals: [],
    returnRate:          5,
    inflationRate:       4,
    incomeGrowth:        3,
    contrib401k:         10_000,
    ssClaimingAge:       67,
    spouseClaimingAge:   67,
    annualConversionAmt: 20_000,
    trad401kMax:         24_500,
    isMarried:           false,
    conversionWindowYrs: 0,
    committedPlan:       null,
    setRetirementAge:          vi.fn(),
    setAnnualExpenses:         vi.fn(),
    setLifeExpect:             vi.fn(),
    setContrib401k:            vi.fn(),
    setIncomeGrowth:           vi.fn(),
    setReturnRate:             vi.fn(),
    setInflationRate:          vi.fn(),
    setSsClaimingAge:          vi.fn(),
    setSpouseClaimingAge:      vi.fn(),
    setAnnualConversionAmt:    vi.fn(),
    setRetirementAgeCoupled:   vi.fn(),
    setMonthlySpend:           vi.fn(),
    setConversionMode:         vi.fn(),
    monthlySpend:              Math.round(57_444 / 12),
    sliderBounds: {
      retireMin: 36, retireMax: 80,
      spendMin: 500, spendMax: 30_000,
      horizonMin: 70, horizonMax: 115,
      contribMax: 24_500, rothMax: 200_000,
      canTuneRothConversion: false,
    },
    commitPlan:             vi.fn(),
    planCommit: {
      available: true,
      preview: {
        title: "Save this as your plan?",
        action: "Retire at 65 · $4,787/mo spend",
        confirmLabel: "Save plan",
        metrics: [
          { id: "totalAtRet", label: "Nest egg at retirement",
            before: "—", after: "$3.95M", delta: { dir: "up", label: "+$3.95M", tone: "good" } },
        ],
        note: null,
        verdict: null,
      },
      apply: vi.fn(),
    },
    planHighlights: {
      wealthMultiplier: 14.2,
      incomeReplacementPct: 82,
      retIncomeFlow: {
        ss: 25_200,
        pension: 0,
        portfolioDraw: 44_664,
        hasSS: true,
        hasPension: false,
        ssPct: 36,
        pensionPct: 0,
        portfolioPct: 64,
      },
      lifetimeTaxBurden: 207_557,
      yearsToRetirement: 14,
      retirementDuration: 25,
    },
    planDelta: null,
    statementView: { keepPct: 52 },
  };

  it("renders portfolio hero with totalAtRet", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Portfolio at retirement");
    expect(allText).toContain("$4.0M");
    act(() => renderer.unmount());
  });

  it("renders wealth multiplier when wealthMultiplier is non-null", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("grows 14.2× from today");
    act(() => renderer.unmount());
  });

  it("renders income replacement percent", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Retirement income");
    expect(allText).toContain("82% of current income");
    act(() => renderer.unmount());
  });

  it("renders SS bar in income meter when ss > 0", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Soc. Security");
    expect(allText).toContain("2,100/mo");
    act(() => renderer.unmount());
  });

  it("renders retirement taxes stat card", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Retirement taxes");
    expect(allText).toContain("$208k");
    expect(allText).toContain("RMDs + conversions");
    act(() => renderer.unmount());
  });

  it("renders stat card subtitles (sub prop)", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("52% of income");
    expect(allText).toContain("in 14 yrs");
    expect(allText).toContain("82% replaced");
    expect(allText).toContain("after 25 yrs");
    act(() => renderer.unmount());
  });

  it("delta badge absent when planDelta is null", () => {
    const props = wowProps;
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("vs saved plan");
    act(() => renderer.unmount());
  });

  it("delta badge shows increase when planDelta.badge.dir is 'up' and isDirty", () => {
    const props = {
      ...wowProps,
      retirementAge: 62,  // differs from committedPlan.retirementAge → isDirty = true
      committedPlan: {
        retirementAge: 65, annualExpenses: 57_444, lifeExpect: 90,
        returnRate: 5, inflationRate: 4, incomeGrowth: 3, contrib401k: 10_000,
        ssClaimingAge: 67, spouseClaimingAge: 67, annualConversionAmt: 20_000,
      },
      planDelta: {
        atRet: 125_000,
        yearsSustained: 2,
        badge: { dir: "up", atRetAbs: 125_000, yearsGain: 2 },
      },
    };
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(PlanScreen, { t, props, navigate: () => {}, isMobile: false }),
      );
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("vs saved plan");
    expect(allText).toContain("$125k");
    expect(allText).toContain("+2 yrs");
    act(() => renderer.unmount());
  });
});
