// ── WI-2.2/#92, WI-2.3/#93, WI-2.4/#94 — Numbers screen new tabs render-smoke ─
//
// Mounts NumbersScreen directly (no App) with a minimal props shape matching
// the golden-master default state. Asserts:
//   1. Each new tab renders without crashing (Budget, Accounts, Taxes).
//   2. A screen-specific always-visible text marker is present in each tab.
//   3. At least one wiring assertion per tab (a value from the bundle appears
//      in the rendered output, proving the data path is connected).
//
// Pattern follows src/horizon/__tests__/journey-screen.test.js.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import NumbersScreen from "../screens/NumbersScreen.jsx";

// Stub browser APIs (ResizeObserver is used by IncomeWaterfall inside NumbersScreen).
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

// ── Minimal theme token object ────────────────────────────────────────────────
const t = {
  bg: "#fff", surf: "#f9f7f4", surf2: "#ede9e2",
  line: "#e8e3d9", line2: "#d4cfc3", ink: "#1a1815", mut: "#6b6560",
  faint: "#b0a99e", accent: "#7c4a2e", good: "#2d7a4f", warm: "#c05f1e",
};

// ── Minimal statementView shape ───────────────────────────────────────────────
const statementView = {
  gross:           100_000,
  taxTotal:         26_000,
  saveTotal:        24_850,
  afterTaxLevel:    74_000,
  flowKeep:         49_150,
  keepPct:          49,
  taxPct:           26,
  savePct:          25,
  effFedRatePct:    18,
  flowTaxPct:       26,
  flowSavePct:      25,
  flowKeepPct:      49,
  ficaPlusState:     8_000,
  monthlyPortDraw:   2_000,
  monthlyTotal:      5_000,
  monthlyHHSS:       3_096,
};

// ── Minimal chartMilestones shape ─────────────────────────────────────────────
const chartMilestones = {
  rows: [
    { tag: "Retire", age: 65, total: 3_484_197, tc: "accent" },
    { tag: "Peak",   age: 73, total: 4_200_000, tc: "good"   },
  ],
  peakTotal: 4_200_000,
};

// ── Minimal retirementWalk shape ──────────────────────────────────────────────
const retirementWalk = {
  depletionAge: null,
  yearsSustained: Infinity,
  rows: [
    { age: 65, total: 3_484_197, draw: 120_000, growth: 174_210, tax: 5_000 },
    { age: 66, total: 3_550_000, draw: 120_000, growth: 185_803, tax: 5_000 },
  ],
};

// ── WI-2.2: Budget bundle (golden-master-order-of-magnitude values) ───────────
const budget = {
  grossAfterTax:       74_000,  // calcTaxBasis — after-tax income
  effectiveLiving:     60_000,  // calcSavingsCapacity — living expenses
  savingsCapacity:     14_000,  // grossAfterTax − effectiveLiving
  currentContribTotal: 24_850,  // sum of all contributions
  availableSurplus:   -10_850,  // savingsCapacity − contributions (deficit case)
  optimizedAllocation: {
    extraMatch:   0,
    extraHSA:     0,
    extraRoth:    0,
    extra401k:    0,
    extraTaxable: 0,
    totalExtra:   0,
    opt401k:      19_500,
    optRoth:       7_000,
    optHSA:        4_300,
    optTaxable:    0,
  },
};

// Budget with surplus (for wiring assertions that test the no-deficit path).
const budgetSurplus = {
  ...budget,
  availableSurplus: 5_000,
};

// ── WI-2.4: taxView bundle ────────────────────────────────────────────────────
const taxView = {
  fedMarginal:          0.22,    // 22% marginal bracket
  fedEffective:         0.18,    // 18% effective rate
  effectiveRMDTaxRate:  0.24,    // 24% blended RMD rate
  projectedRetBracket:  0.12,    // 12% projected retirement bracket (BUG-33 fixed)
  rmdTaxBite:         683_974,   // golden-master rmdTaxBite
  convTaxTotal:        82_765,   // golden-master conversion tax
};

// ── Composite props object ────────────────────────────────────────────────────
const minimalProps = {
  currentIncome:       100_000,
  fedTax:               18_000,
  takeHome:             49_150,
  totalAtRet:        3_484_197,
  retVals: {
    "Trad 401k": 1_800_000,
    "Roth IRA":    900_000,
    "Taxable":     600_000,
    "HSA":         184_197,
  },
  effectiveExpenses:   120_000,
  balAt90:           3_566_026,
  householdSS:          45_924,
  isSustainable:         true,
  withdrawalRate:          3.4,
  retirementAge:            65,
  netConversionBenefit:  77_861,
  yr1TaxSavings:          4_290,
  retirementWalk,
  statementView,
  chartMilestones,
  yearlyRows: retirementWalk.rows.map((r, i) => ({ ...r, year: 2026 + i })),
  budget,
  taxView,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function mountTab(tab, propsOverride = {}) {
  let renderer;
  act(() => {
    renderer = create(React.createElement(NumbersScreen, {
      t,
      props: { ...minimalProps, ...propsOverride },
      initialTab: tab,
    }));
  });
  return renderer;
}

// ── WI-2.2: Budget tab ────────────────────────────────────────────────────────
describe("NumbersScreen — Budget tab (WI-2.2 / #92)", () => {
  it("renders without crashing", () => {
    const renderer = mountTab("budget");
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("renders the 'Savings waterfall' section label (always-visible marker)", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Savings waterfall");
    act(() => renderer.unmount());
  });

  it("wiring: grossAfterTax value appears in the waterfall rows", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // fmt(74_000) → "$74k"
    expect(allText).toContain("$74k");
    act(() => renderer.unmount());
  });

  it("deficit warning renders when availableSurplus < 0", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // budget.availableSurplus = -10_850 → deficit callout visible
    expect(allText.toLowerCase()).toContain("spending exceeds");
    act(() => renderer.unmount());
  });

  it("no deficit warning when availableSurplus >= 0", () => {
    const renderer = mountTab("budget", { budget: budgetSurplus });
    const allText = textOf(renderer.root);
    expect(allText.toLowerCase()).not.toContain("spending exceeds");
    act(() => renderer.unmount());
  });

  it("allocation stack renders contribution amounts from optimizedAllocation", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // opt401k = 19_500 → fmt → "$20k" (rounded), optRoth = 7_000 → "$7k"
    expect(allText).toContain("$7k");
    act(() => renderer.unmount());
  });

  it("null budget renders graceful empty state", () => {
    const renderer = mountTab("budget", { budget: null });
    expect(renderer.toJSON()).toBeTruthy();
    const allText = textOf(renderer.root);
    expect(allText).toContain("Add your income");
    act(() => renderer.unmount());
  });
});

// ── WI-2.3: Accounts tab ─────────────────────────────────────────────────────
describe("NumbersScreen — Accounts tab (WI-2.3 / #93)", () => {
  it("renders without crashing", () => {
    const renderer = mountTab("accounts");
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("renders 'Projected account balances' label (always-visible marker)", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Projected account balances");
    act(() => renderer.unmount());
  });

  it("wiring: milestone pill text present (chartMilestones reuse)", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    // chartMilestones.rows[0].tag = "Retire"
    expect(allText).toContain("Retire");
    act(() => renderer.unmount());
  });

  it("wiring: Roth IRA balance appears in the bar list", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    // fmt(900_000) → "$900k"
    expect(allText).toContain("$900k");
    act(() => renderer.unmount());
  });

  it("wiring: totalAtRet appears in the total row", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    // fmt(3_484_197) → "$3.5M" (1 decimal place for millions — see shared.jsx)
    expect(allText).toContain("$3.5M");
    act(() => renderer.unmount());
  });

  it("all four account labels are present", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Traditional 401k");
    expect(allText).toContain("Roth IRA");
    expect(allText).toContain("Taxable");
    expect(allText).toContain("HSA");
    act(() => renderer.unmount());
  });
});

// ── WI-2.4: Taxes tab ────────────────────────────────────────────────────────
describe("NumbersScreen — Taxes tab (WI-2.4 / #94)", () => {
  it("renders without crashing", () => {
    const renderer = mountTab("taxes");
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("renders 'Tax rates' section label (always-visible marker)", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Tax rates");
    act(() => renderer.unmount());
  });

  it("wiring: fedMarginal rate appears as formatted percentage", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // taxView.fedMarginal = 0.22 → "22%"
    expect(allText).toContain("22%");
    act(() => renderer.unmount());
  });

  it("wiring: projectedRetBracket appears as formatted percentage", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // taxView.projectedRetBracket = 0.12 → "12%"
    expect(allText).toContain("12%");
    act(() => renderer.unmount());
  });

  it("wiring: rmdTaxBite appears in the lifetime composition legend", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // fmt(683_974) → "$684k" (rounded)
    expect(allText).toContain("$684k");
    act(() => renderer.unmount());
  });

  it("lifetime composition bar renders all three segments (working / RMD / conversion)", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Working tax");
    expect(allText).toContain("RMD tax");
    expect(allText).toContain("Conversion tax");
    act(() => renderer.unmount());
  });

  it("null taxView renders graceful empty state", () => {
    const renderer = mountTab("taxes", { taxView: null });
    expect(renderer.toJSON()).toBeTruthy();
    const allText = textOf(renderer.root);
    expect(allText).toContain("Add your income");
    act(() => renderer.unmount());
  });
});
