// ── PlanScreen — Command Center + "Try a change" panel ────────────────────────
//
// Tests the Plan screen's preview-first lever panel (2026-07-11 redesign):
//   1. Command-Center survivors: PortfolioHero (value + multiplier, no delta
//      badge), IncomeMeter, stat cards + subtitles.
//   2. TryAChangePanel renders both sliders with aria-labels + a tick rail.
//   3. Dragging a slider shows a live delta chip + Apply/Discard, and the
//      dashed scenario overlay reaches ArcGraph.
//   4. Discard clears the preview back to idle.
//   5. Apply opens ApplyPreviewModal; confirming fires applyPlanLevers with
//      the dragged value(s) and returns the panel to idle.
//   6. The idle footer's "More in Ideas →" button navigates.
//
// whatIfSimInputs is a REAL what-if bundle (mirrors the life-event-sheet.test.js
// fixture) so buildLeverPreview/buildLeverRail run the actual model — the panel
// is never tested against a mocked preview result.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import PlanScreen from "../screens/PlanScreen.jsx";
import { runSimulation } from "../../model/simulation.js";
import { buildRetirementDrawdown } from "../../model/retirement-drawdown.js";
import { buildRetirementPhase } from "../../model/retirement-phase.js";
import { buildAccumChart } from "../../model/accumulation.js";
import { calcEmployerMatch } from "../../model/employer-match.js";
import { buildVerdictLegend } from "../../model/what-if.js";

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

// ── Real what-if bundle (mirrors life-event-sheet.test.js) ────────────────────
const em = (s, c) => calcEmployerMatch(s, c, {
  matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3,
});
const safeRetAge = 65, safeLifeExp = 90, currentAge = 30;
const rReal = (1 + 5 / 100) / (1 + 4 / 100) - 1;
const simInputs = {
  totalYears: safeLifeExp - currentAge, currentAge,
  currentIncome: 100_000, incomeGrowth: 3,
  filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 5,
  bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
  contrib401k: 10_000, contribRoth: 7_000, contribTaxable: 4_000, contribHSA: 3_850,
  contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
  calcEmployerMatchFn: em, moneyEvents: [],
};
const _at = runSimulation(simInputs)[safeRetAge - currentAge - 1];
const baseTotalAtRet = (_at.tradGross ?? 0) + _at["Roth IRA"] + _at["Taxable"] + _at["HSA"];
const retDrawShared = {
  rReal, effectiveExpenses: 75_000,
  ssAmount: 30_000, ssClaimAge: 67,
  pensionAmount: 0, pensionStartAge: Infinity,
  rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
};
const { yearsSustained: baseYearsSustained } = buildRetirementDrawdown({
  ...retDrawShared, startBal: baseTotalAtRet, startAge: safeRetAge, endAge: safeRetAge + 130,
});
const retPhaseBase = {
  tradGross: 0, roth: 0, taxable: baseTotalAtRet, hsa: 0,
  startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
  rReal, effectiveExpenses: retDrawShared.effectiveExpenses,
  ssGross: retDrawShared.ssAmount, ssTaxable: retDrawShared.ssAmount,
  ssClaimAge: retDrawShared.ssClaimAge,
  pension: retDrawShared.pensionAmount, pensionStartAge: retDrawShared.pensionStartAge,
  filingStatus: "single", retStateRate: 0,
  rmdStartAge: Infinity, useTable2: false, spouseCurrentAge: null, currentAge,
  moneyEvents: retDrawShared.moneyEvents ?? [],
};
const _simWithTrad = runSimulation(simInputs)
  .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
const _accumChart = buildAccumChart({
  simData: _simWithTrad, safeRetAge, currentAge,
  bal401k: simInputs.bal401k, balRoth: simInputs.balRoth,
  balTaxable: simInputs.balTaxable, balHSA: simInputs.balHSA,
});
const _retPhase = buildRetirementPhase({ ...retPhaseBase, conversionByAge: {} });
const baseChart = [
  ..._accumChart,
  ..._retPhase.rows.map(r => ({ age: r.age, total: r.total })),
];
const whatIfBundle = {
  simInputs, fedMarginal: 0.22, retDrawShared,
  safeRetAge, safeLifeExp, baseTotalAtRet, baseYearsSustained,
  retPhaseBase, conversionByAge: {}, baseChart, addlPreTaxBal: 0,
};

// ── Mock props (real model bundle + plain display scalars) ────────────────────
const makeMockProps = (overrides = {}) => ({
  chartData:         baseChart,
  currentAge,
  retirementAge:     safeRetAge,
  lifeExpect:        safeLifeExp,
  totalAtRet:        baseTotalAtRet,
  isSustainable:     true,
  takeHome:          6_000,
  effectiveExpenses: retDrawShared.effectiveExpenses,
  balAt90:           1_000_000,
  contribSeries:     [],
  activity:          "golf course",
  planView: {
    progressPct: 100,
    drivers: [{ id: "withdrawal", ok: true }],
  },
  signals:           [],
  moneyEvents:       [],
  retirementWalk:    { rows: _retPhase.rows },
  planHighlights: {
    wealthMultiplier: 14.2,
    incomeReplacementPct: 82,
    retIncomeFlow: {
      ss: 25_200, pension: 0, portfolioDraw: 44_664,
      hasSS: true, hasPension: false,
      ssPct: 36, pensionPct: 0, portfolioPct: 64,
    },
    lifetimeTaxBurden: 207_557,
    yearsToRetirement: 14,
    retirementDuration: 25,
  },
  statementView:     { keepPct: 52 },
  whatIfSimInputs:   whatIfBundle,
  monthlySpend:      Math.round(retDrawShared.effectiveExpenses / 12),
  sliderBounds: {
    retireMin: 60, retireMax: 75,
    spendMin: 2_000, spendMax: 10_000,
  },
  applyPlanLevers:   vi.fn(),
  saveEvent:         vi.fn(),
  removeEvent:       vi.fn(),
  lifeEventBounds:   { minAge: currentAge + 1, maxAge: safeLifeExp, retirementAge: safeRetAge },
  verdictLegend:     buildVerdictLegend(safeLifeExp),
  ...overrides,
});

// ── Tree helpers ────────────────────────────────────────────────────────────
function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}
const allText = (root) => textOf({ children: [root] });
const rangeInputs = (root) => root.findAll(n => n.type === "input" && n.props?.type === "range");
const buttonsByText = (root, label) =>
  root.findAll(n => n.type === "button" && textOf({ children: n.children }) === label);
const buttonContaining = (root, substr) =>
  root.findAll(n => n.type === "button" && textOf({ children: n.children }).includes(substr));
// The Explore tray is collapsed by default — open a facet before asserting on
// its body (levers or goals).
const openFacet = (renderer, label) =>
  act(() => { buttonContaining(renderer.root, label)[0].props.onClick(); });
const dashedPaths = (root) =>
  root.findAll(n => n.type === "path" && n.props?.strokeDasharray === "8 5");
const tickDivs = (root) =>
  root.findAll(n => n.type === "div" && n.props?.style?.borderRadius === 2);

function mount(overrides = {}) {
  const props = makeMockProps(overrides);
  let renderer;
  act(() => {
    renderer = create(
      React.createElement(PlanScreen, { t, props, navigate: vi.fn(), isMobile: false }),
    );
  });
  return { renderer, props };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PlanScreen — command center survivors", () => {
  it("renders portfolio hero with totalAtRet and wealth multiplier, no delta badge", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("Portfolio at retirement");
    expect(text).toContain("grows 14.2× from today");
    expect(text).not.toContain("vs saved plan");
    act(() => renderer.unmount());
  });

  it("renders income replacement meter", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("Retirement income");
    expect(text).toContain("82% of current income");
    expect(text).toContain("Soc. Security");
    act(() => renderer.unmount());
  });

  it("renders stat cards with subtitles", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("52% of income");
    expect(text).toContain("in 14 yrs");
    expect(text).toContain("82% replaced");
    expect(text).toContain("after 25 yrs");
    expect(text).toContain("Retirement taxes");
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — Explore tray: Try a change facet", () => {
  it("levers live behind the collapsed tray; opening 'Try a change' reveals both sliders + a tick rail, idle", () => {
    const { renderer } = mount();
    // Collapsed by default — no sliders rendered yet.
    expect(rangeInputs(renderer.root).length).toBe(0);

    openFacet(renderer, "Try a change");
    const labels = rangeInputs(renderer.root).map(n => n.props["aria-label"]);
    expect(labels).toContain("Retire at");
    expect(labels).toContain("Monthly spend");
    expect(tickDivs(renderer.root).length).toBeGreaterThan(0);
    // Idle: no dashed overlay, no Apply/Discard, calm hint (no "More in Ideas").
    expect(dashedPaths(renderer.root).length).toBe(0);
    expect(allText(renderer.root)).not.toContain("More in Ideas");
    expect(allText(renderer.root)).toContain("nothing changes until you Apply");
    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);
    act(() => renderer.unmount());
  });

  // BUG-73: the labeled comfortable/tight/unaffordable ranges must be visible
  // (owner requirement), but shown ONCE per panel.
  it("shows the verdict legend once under the rail group, not once per rail", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const text = allText(renderer.root);
    expect(text).toContain("5+ yrs of runway");
    expect(text).toContain("runs out before 90");
    const occurrences = text.split("5+ yrs of runway").length - 1;
    expect(occurrences).toBe(1);
    act(() => renderer.unmount());
  });

  it("dragging the retire slider shows a delta chip + Apply/Discard, and a dashed overlay reaches ArcGraph", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    const text = allText(renderer.root);
    expect(text).toContain("Portfolio lasts"); // a buildPreviewMetric row label
    expect(buttonsByText(renderer.root, "Apply changes").length).toBeGreaterThan(0);
    expect(buttonsByText(renderer.root, "Discard").length).toBe(1);
    expect(dashedPaths(renderer.root).length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  // Gemini review (PR #56): with a change staged, the auto-open fallback used
  // to re-open the tray on every render, so the collapse click silently did
  // nothing. The explicit "closed" sentinel must let the user collapse a dirty
  // tray — and reopening must still offer Apply (the offsets survive).
  it("the tray can be collapsed while a change is staged, and reopening restores Apply", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });
    expect(buttonsByText(renderer.root, "Apply changes").length).toBeGreaterThan(0);

    // Collapse: the facet body (sliders + Apply) must actually disappear.
    openFacet(renderer, "Try a change");
    expect(rangeInputs(renderer.root).length).toBe(0);
    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);

    // Reopen: the staged change survived — Apply/Discard are back.
    openFacet(renderer, "Try a change");
    expect(buttonsByText(renderer.root, "Apply changes").length).toBeGreaterThan(0);
    expect(buttonsByText(renderer.root, "Discard").length).toBe(1);
    act(() => renderer.unmount());
  });

  it("Discard clears the preview back to idle", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });
    expect(buttonsByText(renderer.root, "Discard").length).toBe(1);

    act(() => { buttonsByText(renderer.root, "Discard")[0].props.onClick(); });

    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);
    expect(dashedPaths(renderer.root).length).toBe(0);
    expect(allText(renderer.root)).toContain("nothing changes until you Apply");
    act(() => renderer.unmount());
  });

  it("Apply opens ApplyPreviewModal; confirming fires applyPlanLevers and returns to idle", () => {
    const { renderer, props } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    // First "Apply changes" click opens the modal (the panel's own inline button).
    act(() => { buttonsByText(renderer.root, "Apply changes")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Apply these changes?");

    // Confirm inside the modal (the LAST "Apply changes"-labeled button once open).
    const applyBtns = buttonsByText(renderer.root, "Apply changes");
    expect(applyBtns.length).toBeGreaterThan(1);
    act(() => { applyBtns[applyBtns.length - 1].props.onClick(); });

    expect(props.applyPlanLevers).toHaveBeenCalledTimes(1);
    expect(props.applyPlanLevers).toHaveBeenCalledWith({ retirementAge: safeRetAge - 2 });

    // Back to idle: offsets cleared, modal closed.
    expect(allText(renderer.root)).not.toContain("Apply these changes?");
    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);
    act(() => renderer.unmount());
  });

  it("#85: Apply modal shows a real verdict badge from the lever preview", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    act(() => { buttonsByText(renderer.root, "Apply changes")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Apply these changes?");

    const text = allText(renderer.root);
    expect(["Comfortable", "Tight", "Doesn't fit"].some(v => text.includes(v))).toBe(true);

    act(() => renderer.unmount());
  });
});

describe("PlanScreen — Explore tray: Goals facet", () => {
  it("opening 'Goals' reveals preset quick-adds; a preset seeds a NEW goal sheet (no eventId)", () => {
    const { renderer } = mount();
    openFacet(renderer, "Goals");
    const text = allText(renderer.root);
    expect(text).toContain("Add a goal");
    // First 3 presets visible by default (DEFAULT_VISIBLE_GOALS).
    expect(buttonContaining(renderer.root, "Buy a home").length).toBe(1);
    // A preset opens the LifeEventSheet in NEW mode (its own header input appears).
    act(() => { buttonContaining(renderer.root, "Buy a home")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Buy a home");
    act(() => renderer.unmount());
  });

  it("lists committed goals as numbered rows, tappable to edit", () => {
    const goal = { id: "g1", label: "Big trip", icon: "🧳", age: 70, amount: 40_000, isInflow: false };
    const { renderer, props } = mount({ moneyEvents: [goal] });
    // Collapsed tray shows a "Goals · 1" affordance.
    expect(allText(renderer.root)).toContain("Goals · 1");
    openFacet(renderer, "Goals");
    const text = allText(renderer.root);
    expect(text).toContain("Goal 1");
    expect(text).toContain("Big trip");
    // Remove wired to removeEvent by id.
    const rm = buttonContaining(renderer.root, "✕").find(n => n.props["aria-label"]?.startsWith("Remove goal 1"));
    act(() => { rm.props.onClick(); });
    expect(props.removeEvent).toHaveBeenCalledWith("g1");
    act(() => renderer.unmount());
  });
});
