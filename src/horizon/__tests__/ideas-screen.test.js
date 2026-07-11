// ── IdeasScreen — SP-5 tidy: segmented control + live dials + Apply-with-preview
//
// Tests the Ideas screen "deep workshop" redesign (2026-07-11):
//   1. Segmented control renders exactly 3 segments: Dials / Events / Scenarios.
//   2. Dials mode: two live range sliders + verdict tick rails; dragging updates
//      the dashed arc overlay AND the strikethrough stats from ONE model run.
//   3. Apply (dial diff) → ApplyPreviewModal → confirm fires applyPlanLevers with
//      BOTH retirementAge and monthlySpend when both dials moved (the spend-
//      commit fix this redesign was for).
//   4. Apply (scenario) → ApplyPreviewModal → confirm fires
//      applyPlanLevers({ retirementAge }).
//   5. The "What if…" row lives under Scenarios (not its own mode).
//   6. SCENARIOS / LIFE_EVENTS preset tables are untouched (see presets.test.js
//      for the value-lock; this file just checks they still render).
//
// whatIfSimInputs is a REAL what-if bundle (mirrors plan-screen.test.js /
// life-event-sheet.test.js) so calcWhatIfScenario/buildLeverPreview/buildLeverRail
// run the actual model — the screen is never tested against a mocked result.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import IdeasScreen from "../screens/IdeasScreen.jsx";
import { runSimulation } from "../../model/simulation.js";
import { buildRetirementDrawdown } from "../../model/retirement-drawdown.js";
import { buildRetirementPhase } from "../../model/retirement-phase.js";
import { buildAccumChart } from "../../model/accumulation.js";
import { calcEmployerMatch } from "../../model/employer-match.js";

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

// ── Real what-if bundle (mirrors plan-screen.test.js) ──────────────────────────
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

const monthlyTotal = Math.round(retDrawShared.effectiveExpenses / 12);

// ── Mock props (real model bundle + plain display scalars) ────────────────────
const makeMockProps = (overrides = {}) => ({
  chartData:         baseChart,
  currentAge,
  retirementAge:     safeRetAge,
  lifeExpect:        safeLifeExp,
  totalAtRet:        baseTotalAtRet,
  effectiveExpenses: retDrawShared.effectiveExpenses,
  balAt90:           1_000_000,
  contribSeries:     [],
  whatIfSimInputs:   whatIfBundle,
  setMoneyEvents:    vi.fn(),
  statementView:     { monthlyTotal },
  moneyEvents:       [],
  retirementWalk:    { rows: _retPhase.rows },
  lifeEventBounds:   { minAge: currentAge + 1, maxAge: safeLifeExp, retirementAge: safeRetAge },
  sliderBounds: {
    retireMin: 60, retireMax: 75,
    spendMin: 2_000, spendMax: 10_000,
  },
  applyPlanLevers:   vi.fn(),
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
// The "Apply to my plan" trigger and the scenario cards are plain divs with an
// onClick (matches the original "Make this my plan" pattern) — this helper
// finds any clickable element (div or button) by its exact visible text.
const clickableByText = (root, label) =>
  root.findAll(n => typeof n.props?.onClick === "function" && textOf(n) === label);
const dashedPaths = (root) =>
  root.findAll(n => n.type === "path" && n.props?.strokeDasharray === "8 5");
const tickDivs = (root) =>
  root.findAll(n => n.type === "div" && n.props?.style?.borderRadius === 2);

function mount(overrides = {}) {
  const props = makeMockProps(overrides);
  let renderer;
  act(() => {
    renderer = create(
      React.createElement(IdeasScreen, { t, props, isMobile: false }),
    );
  });
  return { renderer, props };
}

describe("IdeasScreen — segmented control", () => {
  it("renders exactly 3 segments: Dials, Events, Scenarios", () => {
    const { renderer } = mount();
    for (const label of ["Dials", "Events", "Scenarios"]) {
      expect(buttonsByText(renderer.root, label).length, `${label} segment missing`).toBe(1);
    }
    // no leftover 4th-mode buttons from the old layout
    expect(buttonsByText(renderer.root, "Horizon suggestions").length).toBe(0);
    expect(buttonsByText(renderer.root, "What if…").length).toBe(0);
    act(() => renderer.unmount());
  });

  it("the 'What if…' prompt lives under Scenarios, not its own mode", () => {
    const { renderer } = mount();
    expect(allText(renderer.root)).not.toContain("What if…");
    act(() => { buttonsByText(renderer.root, "Scenarios")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("What if…");
    expect(allText(renderer.root)).toContain("Retire 2 yrs earlier");
    act(() => renderer.unmount());
  });

  it("initialMode 'askit' aliases to the Scenarios segment", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(IdeasScreen, { t, props, isMobile: false, initialMode: "askit" }),
      );
    });
    expect(allText(renderer.root)).toContain("What if…");
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — Dials mode", () => {
  it("renders both sliders with aria-labels and non-empty tick rails", () => {
    const { renderer } = mount();
    act(() => { buttonsByText(renderer.root, "Dials")[0].props.onClick(); });
    const inputs = rangeInputs(renderer.root);
    const labels = inputs.map(n => n.props["aria-label"]);
    expect(labels).toContain("Retire at");
    expect(labels).toContain("Monthly spend");
    expect(tickDivs(renderer.root).length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it("dragging a dial slider live-updates the arc overlay AND the strikethrough stats from one run", () => {
    const { renderer } = mount();
    act(() => { buttonsByText(renderer.root, "Dials")[0].props.onClick(); });
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    expect(dashedPaths(renderer.root).length).toBeGreaterThan(0);
    // Retire-at stat card now shows the dragged age via the strikethrough pair.
    expect(allText(renderer.root)).toContain(String(safeRetAge - 2));
    expect(clickableByText(renderer.root, "Apply to my plan").length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it("Apply (both dials moved) fires applyPlanLevers with BOTH retirementAge and monthlySpend", () => {
    const { renderer, props } = mount();
    act(() => { buttonsByText(renderer.root, "Dials")[0].props.onClick(); });
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    const spendInput  = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Monthly spend");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });
    act(() => { spendInput.props.onChange({ target: { value: String(monthlyTotal - 300) } }); });

    act(() => { clickableByText(renderer.root, "Apply to my plan")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Apply these changes?");

    // Confirm inside the modal (the "Apply changes" button, distinct label from
    // the panel's own "Apply to my plan" trigger).
    const applyBtns = buttonsByText(renderer.root, "Apply changes");
    expect(applyBtns.length).toBeGreaterThan(0);
    act(() => { applyBtns[applyBtns.length - 1].props.onClick(); });

    expect(props.applyPlanLevers).toHaveBeenCalledTimes(1);
    expect(props.applyPlanLevers).toHaveBeenCalledWith({
      retirementAge: safeRetAge - 2,
      monthlySpend: monthlyTotal - 300,
    });
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — Scenarios mode", () => {
  it("activating a scenario card shows the strikethrough stats + Apply, and Apply fires applyPlanLevers({retirementAge})", () => {
    const { renderer, props } = mount();
    act(() => { buttonsByText(renderer.root, "Scenarios")[0].props.onClick(); });
    const scenarioCard = renderer.root.findAll(
      n => typeof n.props?.onClick === "function" && textOf(n).includes("Retire 2 yrs earlier")
    )[0];
    expect(scenarioCard).toBeTruthy();
    act(() => { scenarioCard.props.onClick(); });

    expect(dashedPaths(renderer.root).length).toBeGreaterThan(0);
    expect(clickableByText(renderer.root, "Apply to my plan").length).toBeGreaterThan(0);

    act(() => { clickableByText(renderer.root, "Apply to my plan")[0].props.onClick(); });
    const applyBtns = buttonsByText(renderer.root, "Apply changes");
    act(() => { applyBtns[applyBtns.length - 1].props.onClick(); });

    expect(props.applyPlanLevers).toHaveBeenCalledTimes(1);
    expect(props.applyPlanLevers).toHaveBeenCalledWith({ retirementAge: safeRetAge - 2 });
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — Events mode", () => {
  it("renders the life-event preset pills", () => {
    const { renderer } = mount();
    act(() => { buttonsByText(renderer.root, "Events")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Buy a home");
    expect(allText(renderer.root)).toContain("Downsize");
    act(() => renderer.unmount());
  });
});
