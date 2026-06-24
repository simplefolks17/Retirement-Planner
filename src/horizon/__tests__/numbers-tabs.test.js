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
  preTaxDeductions: 23_500,
  monthlyPortDraw:   2_000,
  monthlyTotal:      5_000,
  monthlyHHSS:       3_096,
  monthlyPension:        0,
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
  surplusFutureValue:      0,   // fvAnnuity(availableSurplus, ...) — 0 when deficit
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
  availableSurplus:    5_000,
  surplusFutureValue: 85_000,  // fvAnnuity(5_000, 0.07, 10) ≈ 69k; round number for test
};

// ── planView shape (savings driver used by Budget tab) ───────────────────────
const planView = {
  progressPct: 78,
  drivers: [
    { id: "withdrawal", ok: true,  withdrawalRatePct: 3.4, guidelinePct: 4 },
    { id: "longevity",  ok: true,  sustainedYears: null,   horizonYears: 25 },
    { id: "savings",    ok: false, savingsRatePct: 31,     guidelinePct: 15 },
  ],
};

// ── WI-2.4: taxView bundle (expanded for two-section Taxes tab) ───────────────
const taxView = {
  // Section 1 — Working Year Tax
  householdIncome:    100_000,
  safeDeduc:           23_500,
  agi:                 76_500,
  stateTax:             3_000,
  fica:                 7_650,
  combinedEffRate:      0.29,    // (18k + 3k + 7.65k) / 100k ≈ 28.65%
  taxSaveFromPreTax:    5_170,   // 23_500 × 0.22 = 5_170
  fedMarginal:           0.22,   // 22% marginal bracket
  fedEffective:          0.18,   // 18% effective rate
  // Section 2 — Retirement Tax
  effectiveRMDTaxRate:   0.24,   // 24% blended RMD rate
  projectedRetBracket:   0.12,   // 12% projected retirement bracket (decimal, not integer — BUG-33 + Phase-1 fix)
  rmdTaxBite:         683_974,   // golden-master rmdTaxBite
  convTaxTotal:        82_765,   // golden-master conversion tax
  // WI-2.4: lifetime tax composition — pre-computed by the model (App taxViewBundle),
  // so the Taxes tab formats only (rule 10). Mirrors workingTax/rmdTax/convTax split.
  composition: {
    total: 784_739,             // 18_000 + 683_974 + 82_765
    segments: [
      { label: "Working tax",    val:  18_000, key: "working", pct:  2 },
      { label: "RMD tax",        val: 683_974, key: "rmd",     pct: 87 },
      { label: "Conversion tax", val:  82_765, key: "conv",    pct: 11 },
    ],
  },
};

// ── Composite props object ────────────────────────────────────────────────────
const minimalProps = {
  currentIncome:       100_000,
  fedTax:               18_000,
  takeHome:             49_150,
  totalAtRet:        3_484_197,
  spendableAtRet:    3_150_000,  // gross 401k haircut at retirement rate + Roth/HSA/Taxable
  currentTotalSaved:   450_000,  // sum of today's account balances
  currentAge:               45,
  retVals: {
    "Trad 401k": 1_800_000,
    "Roth IRA":    900_000,
    "Taxable":     600_000,
    "HSA":         184_197,
  },
  effectiveExpenses:   120_000,
  balAt90:           3_566_026,
  householdSS:          45_924,
  effectivePension:          0,
  isSustainable:         true,
  withdrawalRate:          3.4,
  retirementAge:            65,
  rmdStartAge:              73,
  netConversionBenefit:  77_861,
  yr1TaxSavings:          4_290,
  retirementWalk,
  statementView,
  chartMilestones,
  planView,
  // WI-2.5: whole-life ledger — one accumulation row + retirement rows with
  // RMD/conversion driver columns (matching the App-built yearlyRows shape).
  yearlyRows: [
    { age: 64, year: 2025, total: 3_000_000, contrib: 30_000, growth: 150_000, draw: 0, tax: 0, rmd: null, conversion: null, phase: "accum" },
    { age: 65, year: 2026, total: 3_484_197, contrib: null, growth: 174_210, draw: 120_000, tax: 5_000, rmd: null, conversion: 50_000, phase: "ret" },
    { age: 73, year: 2034, total: 3_550_000, contrib: null, growth: 185_803, draw: 120_000, tax: 5_000, rmd: 80_000, conversion: null, phase: "ret" },
  ],
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

  it("renders 'Where your income goes' section label (always-visible marker)", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Where your income goes");
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

  it("waterfall row 1 shows gross income from taxView.householdIncome", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // taxView.householdIncome = 100_000 → "$100k"; grossAfterTax = 74_000 → "$74k"
    expect(allText).toContain("Gross income");
    expect(allText).toContain("$100k");
    act(() => renderer.unmount());
  });

  it("savings rate benchmark renders with rate and guideline", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // savingsDriver.savingsRatePct = 31 → "31%"; guidelinePct = 15 → "≥15%"
    expect(allText).toContain("31%");
    expect(allText).toContain("savings rate");
    act(() => renderer.unmount());
  });

  it("saving opportunity section renders when totalExtra === 0", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // budget.optimizedAllocation.totalExtra = 0 → "already saving the maximum" state
    expect(allText.toLowerCase()).toContain("already saving the maximum");
    act(() => renderer.unmount());
  });

  it("surplus → retirement bridge callout renders when surplus > 0", () => {
    const renderer = mountTab("budget", { budget: { ...budgetSurplus, availableSurplus: 5_000, surplusFutureValue: 85_000 } });
    const allText = textOf(renderer.root);
    expect(allText.toLowerCase()).toContain("investing this surplus");
    act(() => renderer.unmount());
  });

  it("no surplus callout when availableSurplus <= 0", () => {
    const renderer = mountTab("budget");
    const allText = textOf(renderer.root);
    // default budget has availableSurplus = -10_850
    expect(allText.toLowerCase()).not.toContain("investing this surplus");
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

  it("renders tax-character bucket labels (always-visible markers)", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Tax-deferred");
    expect(allText).toContain("Tax-free");
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

  it("now→retirement banner shows currentTotalSaved and totalAtRet", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    // currentTotalSaved = 450_000 → "$450k"; totalAtRet = 3_484_197 → "$3.5M"
    expect(allText).toContain("$450k");
    expect(allText).toContain("$3.5M");
    act(() => renderer.unmount());
  });

  it("spendable reference appears in banner", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    // spendableAtRet = 3_150_000 → "$3.2M"
    expect(allText).toContain("after retirement taxes");
    act(() => renderer.unmount());
  });

  it("RMD exposure flag appears on tax-deferred bucket", () => {
    const renderer = mountTab("accounts");
    const allText = textOf(renderer.root);
    // rmdStartAge = 73 → "age 73"; rmdTaxBite = 683_974 → "$684k"
    expect(allText).toContain("Required distributions");
    expect(allText).toContain("73");
    act(() => renderer.unmount());
  });
});

// ── WI-2.4: Taxes tab (expanded two-section layout) ──────────────────────────
describe("NumbersScreen — Taxes tab (WI-2.4 / #94)", () => {
  it("renders without crashing", () => {
    const renderer = mountTab("taxes");
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("renders 'Working Year Tax' section label (section-1 always-visible marker)", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Working Year Tax");
    act(() => renderer.unmount());
  });

  it("renders 'Retirement Tax' section label (section-2 always-visible marker)", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Retirement Tax");
    act(() => renderer.unmount());
  });

  it("wiring section 1: AGI derivation shows householdIncome, safeDeduc, and AGI", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // householdIncome = 100_000 → "$100,000"
    expect(allText).toContain("$100,000");
    // safeDeduc = 23_500 → "−$23,500"
    expect(allText).toContain("−$23,500");
    // agi = 76_500 → "$76,500"
    expect(allText).toContain("$76,500");
    act(() => renderer.unmount());
  });

  it("wiring section 1: 3-stat card — fedEffective, fedMarginal, combinedEffRate", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // fedEffective = 0.18 → "18%"
    expect(allText).toContain("18%");
    // fedMarginal = 0.22 → "22%"
    expect(allText).toContain("22%");
    // combinedEffRate = 0.29 → "29%"
    expect(allText).toContain("29%");
    act(() => renderer.unmount());
  });

  it("wiring section 1: taxSaveFromPreTax callout appears", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // taxSaveFromPreTax = 5_170 → "$5,170"
    expect(allText).toContain("$5,170");
    act(() => renderer.unmount());
  });

  it("wiring section 2: projectedRetBracket appears as formatted percentage", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // taxView.projectedRetBracket = 0.12 → "12%"
    expect(allText).toContain("12%");
    act(() => renderer.unmount());
  });

  it("wiring section 2: rmdTaxBite appears in both detail row and composition legend", () => {
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

// ── WI-2.5: Year-by-year (whole-life ledger + RMD/Conversion columns) ─────────
describe("NumbersScreen — Year by year (WI-2.5 / #95)", () => {
  it("renders the new column headers including Contrib., RMD and Conversion", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Contrib.");
    expect(allText).toContain("RMD");
    expect(allText).toContain("Conversion");
    act(() => renderer.unmount());
  });

  it("renders an accumulation row (age 64) with its contribution", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // accumulation row age 64 present, contrib +$30k shown
    expect(allText).toContain("64");
    expect(allText).toContain("+$30k");
    act(() => renderer.unmount());
  });

  it("wiring: RMD column shows the joined RMD amount at age 73", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // rmd 80_000 → "$80k"
    expect(allText).toContain("$80k");
    act(() => renderer.unmount());
  });

  it("wiring: Conversion column shows the joined conversion amount at age 65", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // conversion 50_000 → "$50k"
    expect(allText).toContain("$50k");
    act(() => renderer.unmount());
  });
});

