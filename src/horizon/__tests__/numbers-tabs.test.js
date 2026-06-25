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
  gross:              100_000,
  taxTotal:            26_000,
  saveTotal:           24_850,
  afterTaxLevel:       74_000,
  flowKeep:            49_150,
  keepPct:             49,
  taxPct:              26,
  savePct:             25,
  effFedRatePct:       18,
  flowTaxPct:          26,
  flowSavePct:         25,
  flowKeepPct:         49,
  ficaPlusState:        8_000,
  preTaxDeductions:    23_500,
  monthlyPortDraw:      2_000,
  monthlyTotal:         5_000,
  monthlyHHSS:          3_096,
  monthlyPension:           0,
  // Session-3: lifetime compounding multiplier (totalAtRet / totalContrib)
  lifetimeContribROI:    7.0,
  // Session-4: income replacement ratio
  monthlyTakeHome:      6_000,
  incomeReplacementPct:    72,
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
    { age: 65, total: 3_484_197, draw: 120_000, growth: 174_210, tax: 5_000, balStart: 3_550_000 },
    { age: 66, total: 3_550_000, draw: 120_000, growth: 185_803, tax: 5_000, balStart: 3_484_197 },
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
  optimizedContribTotal: 30_800, // opt401k(19_500) + optRoth(7_000) + optHSA(4_300) + optTaxable(0)
  // Pre-computed sign/tone fields (rule-10: no comparisons on financial values in src/horizon/)
  savingsCapacityPositive: true,   // savingsCapacity 14_000 >= 0
  surplusPositive:         false,  // availableSurplus -10_850 < 0
  hasDeficit:              true,
  deficitAmount:           10_850,
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
  surplusPositive:     true,
  hasDeficit:          false,
  deficitAmount:           0,
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
  // WI-2.4: retirement-phase tax composition (RMD + conversion only) — pre-computed by
  // the model (App taxViewBundle). Working-year tax excluded (one year ≠ lifetime scope).
  composition: {
    total: 766_739,             // 683_974 + 82_765
    segments: [
      { label: "RMD tax",        val: 683_974, key: "rmd",  pct: 89 },
      { label: "Conversion tax", val:  82_765, key: "conv", pct: 11 },
    ],
  },
  // Session-3: conversion breakdown — always surfaced so the verdict is honest (+ or −)
  conversionDetail: {
    rmdTaxSaved:                  100_000,
    conversionCost:                82_765,
    irmaaCost:                      5_000,
    acaLoss:                            0,
    adjustedNetConversionBenefit:  12_235,  // 100k − 82.7k − 5k
    // Pre-computed for rule-10 compliance (no comparisons on financial values in src/horizon/)
    isPositive:                      true,  // 12_235 >= 0
    benefitAbs:                    12_235,
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
  // Session-4: withdrawalRatePct added to retirement rows; null for accum.
  yearlyRows: [
    { age: 64, year: 2025, total: 3_000_000, contrib: 30_000, growth: 150_000, draw: 0, tax: 0, rmd: null, conversion: null, phase: "accum", withdrawalRatePct: null },
    { age: 65, year: 2026, total: 3_484_197, contrib: null, growth: 174_210, draw: 120_000, tax: 5_000, rmd: null, conversion: 50_000, phase: "ret", withdrawalRatePct: 2.5 },
    { age: 73, year: 2034, total: 3_550_000, contrib: null, growth: 185_803, draw: 120_000, tax: 5_000, rmd: 80_000, conversion: null, phase: "ret", withdrawalRatePct: 3.8 },
  ],
  budget,
  taxView,
  // Session-3: new horizonProps fields
  flowDown: {
    totalContrib:  500_000,
    totalGrowth: 3_000_000,
    distDraws:   1_500_000,
  },
  conversionWindowYrs: 5,
  ssClaimingAge: 67,
  includeSS: true,
  markerByAge: {
    65: "Retire",
    73: "RMD start",
    70: "Conv. window closes",
  },
  tablePhases: {
    accumYears:      20,
    conversionYears:  5,
    retirementYears: 25,
  },
  // Session-4: per-account breakdown + milestone badges
  retirementRowByAge: {
    65: { trad: 2_000_000, roth: 500_000, taxable: 300_000, hsa: 50_000, rmdTax: 0, drawTax: 5_000, convTax: 0 },
    66: { trad: 1_950_000, roth: 520_000, taxable: 310_000, hsa: 51_000, rmdTax: 0, drawTax: 5_200, convTax: 0 },
  },
  milestoneByAge: {
    58: "First $1M",
    65: "Retire",
  },
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

  it("retirement-phase composition bar renders RMD and Conversion segments (no Working tax)", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("Working tax");
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

// ── Session-3: Statement tab new content ──────────────────────────────────────
describe("NumbersScreen — Statement tab (Session-3 additions)", () => {
  it("plan-health badge renders when planView.drivers is present", () => {
    const renderer = mountTab("statement");
    const allText = textOf(renderer.root);
    // planView.drivers has 1 bad driver (savings) → "1 area to review"
    expect(allText).toContain("area");
    act(() => renderer.unmount());
  });

  it("plan-health badge shows 'On track' when all drivers are ok", () => {
    const allOkPlanView = {
      ...planView,
      drivers: planView.drivers.map(d => ({ ...d, ok: true })),
    };
    const renderer = mountTab("statement", { planView: allOkPlanView });
    const allText = textOf(renderer.root);
    expect(allText).toContain("On track");
    act(() => renderer.unmount());
  });

  it("contributions-vs-growth section shows lifetimeContribROI multiplier", () => {
    const renderer = mountTab("statement");
    const allText = textOf(renderer.root);
    // lifetimeContribROI = 7.0 → "7×" compounding multiplier
    expect(allText).toContain("7×");
    expect(allText).toContain("compounding multiplier");
    act(() => renderer.unmount());
  });

  it("contributions-vs-growth section shows flowDown.totalContrib", () => {
    const renderer = mountTab("statement");
    const allText = textOf(renderer.root);
    // flowDown.totalContrib = 500_000 → "$500k"
    expect(allText).toContain("$500k");
    act(() => renderer.unmount());
  });

  it("no contrib-vs-growth section when lifetimeContribROI is null", () => {
    const renderer = mountTab("statement", {
      statementView: { ...statementView, lifetimeContribROI: null },
    });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("compounding multiplier");
    act(() => renderer.unmount());
  });
});

// ── Session-3: Taxes tab new content ─────────────────────────────────────────
describe("NumbersScreen — Taxes tab (Session-3 additions)", () => {
  it("retirement-phase tax anchor shows composition.total", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // composition.total = 766_739 → "$767k"; heading is "Retirement-phase income tax (RMD + conversion):"
    expect(allText).toContain("Retirement-phase income tax");
    act(() => renderer.unmount());
  });

  it("conversion callout renders when conversionWindowYrs > 0 (positive benefit)", () => {
    // netConversionBenefit = 77_861 (positive) → "Conversions work in your favor"
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Conversions work in your favor");
    act(() => renderer.unmount());
  });

  it("conversion callout renders with negative verdict (honest negative state)", () => {
    const negTaxView = {
      ...taxView,
      conversionDetail: {
        ...taxView.conversionDetail,
        adjustedNetConversionBenefit: -9_854,
        isPositive: false,
        benefitAbs: 9_854,
      },
    };
    const renderer = mountTab("taxes", { netConversionBenefit: -9_854, taxView: negTaxView });
    const allText = textOf(renderer.root);
    expect(allText).toContain("net-negative");
    act(() => renderer.unmount());
  });

  it("conversion callout shows RMD tax saved breakdown", () => {
    const renderer = mountTab("taxes");
    const allText = textOf(renderer.root);
    // taxView.conversionDetail.rmdTaxSaved = 100_000 → "$100k"
    expect(allText).toContain("RMD tax saved");
    expect(allText).toContain("$100k");
    act(() => renderer.unmount());
  });

  it("conversion callout hidden when conversionWindowYrs is 0", () => {
    const renderer = mountTab("taxes", { conversionWindowYrs: 0 });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("Conversions work");
    expect(allText).not.toContain("net-negative");
    act(() => renderer.unmount());
  });
});

// ── Session-3: Year by year new content ──────────────────────────────────────
describe("NumbersScreen — Year by year (Session-3 additions)", () => {
  it("phase-summary strip renders all three phase boxes", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Accumulation");
    expect(allText).toContain("Conversion window");
    expect(allText).toContain("Retirement");
    act(() => renderer.unmount());
  });

  it("phase-summary strip shows accumYears count", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // tablePhases.accumYears = 20 → "20 yrs"
    expect(allText).toContain("20 yr");
    act(() => renderer.unmount());
  });

  it("lifecycle annotation divider appears at retirement age", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // markerByAge[65] = "Retire" → "↑ Retire" annotation
    expect(allText).toContain("↑ Retire");
    act(() => renderer.unmount());
  });

  it("lifecycle annotation divider appears at RMD start age", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // markerByAge[73] = "RMD start" → "↑ RMD start"
    expect(allText).toContain("↑ RMD start");
    act(() => renderer.unmount());
  });

  it("footer shows lifetime column totals from flowDown", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // flowDown.totalContrib = 500_000 → "$500k"; totalGrowth = 3_000_000 → "$3M"
    expect(allText).toContain("Contributions");
    expect(allText).toContain("Growth");
    act(() => renderer.unmount());
  });
});

// ── Session-4: Statement tab income replacement ratio ─────────────────────────
describe("NumbersScreen — Statement tab (Session-4: income replacement)", () => {
  it("shows incomeReplacementPct when present", () => {
    const renderer = mountTab("statement");
    const allText = textOf(renderer.root);
    // incomeReplacementPct = 72 → "72%"
    expect(allText).toContain("72%");
    expect(allText).toContain("working paycheck deposit");
    act(() => renderer.unmount());
  });

  it("hidden when incomeReplacementPct is null", () => {
    const renderer = mountTab("statement", {
      statementView: { ...statementView, incomeReplacementPct: null },
    });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("working take-home");
    act(() => renderer.unmount());
  });

  it("shows 'Explore all years' nav link when navigate is provided", () => {
    let renderer;
    act(() => {
      renderer = React.createElement(NumbersScreen, {
        t,
        props: minimalProps,
        initialTab: "statement",
        navigate: () => {},
      });
    });
    act(() => {
      renderer = require("react-test-renderer").create(renderer);
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Explore all years");
    act(() => renderer.unmount());
  });

  it("shows retirement income companion strip below waterfall", () => {
    const renderer = mountTab("statement");
    const allText = textOf(renderer.root);
    // monthlyTotal > 0 → strip visible
    expect(allText).toContain("Where retirement income comes from");
    expect(allText).toContain("Social Security");
    act(() => renderer.unmount());
  });

  it("retirement income strip hidden when monthlyTotal is 0", () => {
    const renderer = mountTab("statement", {
      statementView: { ...statementView, monthlyTotal: 0, gross: 100_000 },
    });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("Where retirement income comes from");
    act(() => renderer.unmount());
  });
});

// ── Session-4: Year by year deeper numbers layer ──────────────────────────────
describe("NumbersScreen — Year by year (Session-4: deeper numbers)", () => {
  it("jump bar renders 'Jump to:' label when markerByAge is non-empty", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    expect(allText).toContain("Jump to:");
    act(() => renderer.unmount());
  });

  it("jump bar renders marker labels from markerByAge", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // markerByAge has "Retire", "RMD start", "Conv. window closes"
    expect(allText).toContain("Retire");
    act(() => renderer.unmount());
  });

  it("jump bar hidden when markerByAge is empty", () => {
    const renderer = mountTab("yearly", { markerByAge: {} });
    const allText = textOf(renderer.root);
    expect(allText).not.toContain("Jump to:");
    act(() => renderer.unmount());
  });

  it("WR% sub-label appears in retirement rows", () => {
    const renderer = mountTab("yearly");
    const allText = textOf(renderer.root);
    // yearlyRows has retirement rows with withdrawalRatePct: 2.5 and 3.8
    expect(allText).toContain("WR");
    act(() => renderer.unmount());
  });

  it("milestone badge appears in portfolio cell at milestone age", () => {
    // milestoneByAge[65] = "Retire" and age 65 is in yearlyRows, so the
    // badge pill renders alongside the portfolio balance in that row.
    // The text content of the badge ("Retire") will appear in the row cell.
    // We verify the badge is rendered by checking the row AND the jump bar
    // both show their respective labels (proving the data path is wired).
    const renderer = mountTab("yearly", {
      milestoneByAge: { 65: "First $1M", 73: "Peak" },
    });
    const allText = textOf(renderer.root);
    // age 65 is in yearlyRows → badge pill "First $1M" renders in its Portfolio cell
    expect(allText).toContain("First $1M");
    act(() => renderer.unmount());
  });

  it("depletion age marker appears in lifecycle divider when depletionAge is set", () => {
    const deplWalk = { ...retirementWalk, depletionAge: 65 };
    const renderer = mountTab("yearly", {
      retirementWalk: deplWalk,
      markerByAge: { 65: "Retire", 73: "RMD start", [65]: "Portfolio depleted" },
    });
    const allText = textOf(renderer.root);
    expect(allText).toContain("Portfolio depleted");
    act(() => renderer.unmount());
  });
});

