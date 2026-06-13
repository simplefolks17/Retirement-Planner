// ── WI-2.1 (#91) Journey screen render-smoke test ────────────────────────────
//
// Mounts JourneyScreen with a minimal props shape matching the golden-master
// default state (see src/model/__tests__/golden-master.test.js). Asserts:
//   1. Renders without crashing.
//   2. Chapter headings visible.
//   3. flowDown.totalAtRet is present and a number (wiring check).
//
// Follows the pattern in src/horizon/__tests__/presets.test.js (pure unit, no
// App mounting needed here — JourneyScreen is a pure presentational component).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import JourneyScreen from "../screens/JourneyScreen.jsx";

// Stub browser APIs used by HorizonShell sub-components (not used by
// JourneyScreen itself, but vitest hoists imports so the module graph loads).
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

// ── Minimal theme token object matching HorizonShell's `t` shape ─────────────
const t = {
  bg: "#fff", surf: "#f9f7f4", surf2: "#ede9e2",
  line: "#e8e3d9", line2: "#d4cfc3", ink: "#1a1815", mut: "#6b6560",
  faint: "#b0a99e", accent: "#7c4a2e", good: "#2d7a4f", warm: "#c05f1e",
};

// ── Minimal flowDown shape (golden-master default, key fields only) ───────────
// Source: src/model/__tests__/golden-master.test.js + flow-down.js return shape.
// We use realistic-order-of-magnitude values so fmt() renders non-trivially.
const flowDown = {
  startPortfolio:     165_000,    // flowDown.startPortfolio
  totalContrib:       980_000,    // flowDown.totalContrib
  totalGrowth:      2_339_197,    // flowDown.totalGrowth
  totalAtRet:       3_484_197,    // flowDown.totalAtRet  (golden-master default)
  hasConvWindow:    true,
  conversionWindowYrs: 7,
  portPreRMD:       3_600_000,    // flowDown.portPreRMD
  convWindowDraws:    560_000,    // flowDown.convWindowDraws
  convWindowTax:       82_765,    // flowDown.convWindowTax
  convWindowGrowth:   758_568,    // flowDown.convWindowGrowth
  totalConverted:     578_555,    // flowDown.totalConverted
  distStartVal:     3_600_000,    // flowDown.distStartVal
  distDraws:        2_100_000,    // flowDown.distDraws
  distRMDTax:         683_974,    // flowDown.distRMDTax (golden-master rmdTaxBite)
  distGrowth:       2_850_000,    // flowDown.distGrowth
  distEndVal:       3_566_026,    // flowDown.distEndVal
  depletionAge:     null,         // null = sustainable (designed edge state)
  actualSustainedYrs: 25,         // flowDown.actualSustainedYrs
  peakPortfolio:    4_200_000,    // flowDown.peakPortfolio
  distStartAge:     73,
  distYears:        17,
};

// ── Minimal statementView shape (calcStatementView golden-master defaults) ───
const statementView = {
  gross:        100_000,   // statementView.gross
  flowTax:       26_000,   // statementView.flowTax
  flowSave:      24_850,   // statementView.flowSave
  flowKeep:      49_150,   // statementView.flowKeep (take-home)
  taxTotal:      26_000,   // statementView.taxTotal
  keepPct:       49.15,    // statementView.keepPct
  taxPct:        26.0,     // statementView.taxPct
  savePct:       24.85,    // statementView.savePct
  monthlyTotal:   4_096,   // statementView.monthlyTotal
};

// ── Minimal retirementWalk shape ─────────────────────────────────────────────
const retirementWalk = {
  depletionAge: null,   // null = sustainable
  yearsSustained: Infinity,
  rows: [],
};

// ── Composite props object (mirrors horizonProps fields JourneyScreen reads) ──
const minimalProps = {
  retirementAge:      65,
  flowDown,
  conversionWindowYrs: 7,
  rmdStartAge:        73,
  statementView,
  retirementWalk,
  householdSS:        45_924,    // props.householdSS (annual, displayed monthly)
  effectivePension:   0,         // props.effectivePension — 0 → pension strip hidden
  isSustainable:      true,
};

// Helper: collect all text from a react-test-renderer node.
function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("JourneyScreen (WI-2.1)", () => {
  it("renders without crashing at golden-master-default props", () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: minimalProps }));
    });
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("renders all three chapter headings", () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: minimalProps }));
    });
    const root = renderer.root;
    const allText = textOf(root);
    expect(allText).toContain("Chapter 1");
    expect(allText).toContain("Chapter 2");
    expect(allText).toContain("Chapter 3");
    act(() => renderer.unmount());
  });

  it("flowDown.totalAtRet is wired through — rendered as a dollar value", () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: minimalProps }));
    });
    const root = renderer.root;
    const allText = textOf(root);
    // fmt(3_484_197) → "$3.5M" — confirm a formatted version appears
    expect(allText).toContain("$3.5M");
    // Confirm the raw prop shape carries the expected key
    expect(minimalProps.flowDown).toHaveProperty("totalAtRet", 3_484_197);
    act(() => renderer.unmount());
  });

  it("sustainable plan shows 'funded for life' headline (no depletion age)", () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: minimalProps }));
    });
    const allText = textOf(renderer.root);
    // depletionAge is null → isSustainable true → "funded for life" copy
    expect(allText.toLowerCase()).toContain("funded for life");
    act(() => renderer.unmount());
  });

  it("conversion window callout renders when conversionWindowYrs > 0", () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: minimalProps }));
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Roth conversion window");
    act(() => renderer.unmount());
  });

  it("no conversion window callout when conversionWindowYrs = 0", () => {
    const noConvProps = {
      ...minimalProps,
      conversionWindowYrs: 0,
      flowDown: { ...flowDown, hasConvWindow: false, conversionWindowYrs: 0 },
    };
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: noConvProps }));
    });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("Roth conversion window");
    act(() => renderer.unmount());
  });

  it("renders graceful loading state when flowDown is null", () => {
    const noFlowProps = { ...minimalProps, flowDown: null };
    let renderer;
    act(() => {
      renderer = create(React.createElement(JourneyScreen, { t, props: noFlowProps }));
    });
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });
});
