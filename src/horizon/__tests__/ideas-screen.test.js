// ── IdeasScreen — SP-5 tidy + Scenarios retirement: segmented control + live
//    dials + Apply-with-preview
//
// Tests the Ideas screen "deep workshop" redesign (2026-07-11) and the
// follow-up removal of the locked "Scenarios" segment (2026-07-12, owner
// decision — preset cards felt restrictive; see docs/BUGS.md BUG-44 addendum):
//   1. Segmented control renders 2 segments: Dials / Events.
//   2. Dials mode: two live range sliders + verdict tick rails; dragging updates
//      the dashed arc overlay AND the strikethrough stats from ONE model run.
//      Dials also gains two quick-jump chips (RETIRE_JUMPS) that nudge the
//      retire-at slider offset — a relative chip and a clamped absolute chip.
//   3. Apply (dial diff) → ApplyPreviewModal → confirm fires applyPlanLevers with
//      BOTH retirementAge and monthlySpend when both dials moved (the spend-
//      commit fix this redesign was for).
//   4. Events pills include the folded-in "Big trip" preset, and the
//      committedByLabel placed-pill guarantee (BUG-44's fix surface) still
//      holds now that it's the only place an event can be pre-seeded.
//   5. RETIRE_JUMPS / LIFE_EVENTS preset tables are untouched here (see
//      presets.test.js for the value-lock; this file just checks they render
//      and wire correctly).
//
// 2026-07-13: the "Solvers" mode (AffordabilityPanel/affordView, WI-3.8) was
// removed from Horizon by owner decision — Dials + Events cover the job.
// `calcAffordabilityMax` and Classic's WhatIfPanel remain untouched. A
// "solvers" initialMode/deep-link degrades gracefully to Dials (tested below).
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
  saveEvent:         vi.fn(),
  removeEvent:       vi.fn(),
  statementView:     { monthlyTotal },
  moneyEvents:       [],
  retirementWalk:    { rows: _retPhase.rows },
  lifeEventBounds:   { minAge: currentAge + 1, maxAge: safeLifeExp, retirementAge: safeRetAge },
  sliderBounds: {
    retireMin: 60, retireMax: 75,
    spendMin: 2_000, spendMax: 10_000,
  },
  applyPlanLevers:   vi.fn(),
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
  it("renders 2 segments: Dials, Events — no Scenarios, no Solvers segment", () => {
    const { renderer } = mount();
    for (const label of ["Dials", "Events"]) {
      expect(buttonsByText(renderer.root, label).length, `${label} segment missing`).toBe(1);
    }
    // the locked Scenarios segment (and its old suggestion-panel affordances)
    // is retired (2026-07-12) — no dead affordance anywhere. Solvers (WI-3.8's
    // AffordabilityPanel) is retired (2026-07-13) — see the module comment.
    expect(buttonsByText(renderer.root, "Scenarios").length).toBe(0);
    expect(buttonsByText(renderer.root, "Solvers").length).toBe(0);
    expect(buttonsByText(renderer.root, "Horizon suggestions").length).toBe(0);
    expect(buttonsByText(renderer.root, "What if…").length).toBe(0);
    act(() => renderer.unmount());
  });

  it("initialMode 'askit' aliases to the Dials segment", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(IdeasScreen, { t, props, isMobile: false, initialMode: "askit" }),
      );
    });
    expect(allText(renderer.root)).toContain("Retire at");
    expect(allText(renderer.root)).toContain("Monthly spend");
    act(() => renderer.unmount());
  });

  // Degrade-gracefully guarantee (2026-07-13): a stale "solvers" deep-link or
  // subView (e.g. a bookmarked URL, or a signal that used to target Solvers)
  // must not blank the screen — it lands on Dials, same as "askit".
  it("initialMode 'solvers' degrades gracefully to the Dials segment", () => {
    const props = makeMockProps();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(IdeasScreen, { t, props, isMobile: false, initialMode: "solvers" }),
      );
    });
    expect(allText(renderer.root)).toContain("Retire at");
    expect(allText(renderer.root)).toContain("Monthly spend");
    expect(buttonsByText(renderer.root, "Solvers").length).toBe(0);
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

  // BUG-73: the labeled comfortable/tight/unaffordable ranges must be visible
  // (owner requirement), sourced from props.verdictLegend, shown once — not
  // once per rail (retire-at AND monthly-spend both render a rail here).
  it("shows the verdict legend once from props.verdictLegend, not once per rail", () => {
    const { renderer } = mount();
    act(() => { buttonsByText(renderer.root, "Dials")[0].props.onClick(); });
    const text = allText(renderer.root);
    expect(text).toContain("5+ yrs of runway");
    expect(text).toContain("runs out before 90");
    const occurrences = text.split("5+ yrs of runway").length - 1;
    expect(occurrences).toBe(1);
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

  // Replaces the retired "Scenarios" mode's retire63 card coverage: the same
  // outcome (retire 2 years earlier → overlay → Apply → applyPlanLevers) now
  // flows through the Dials quick-jump chip instead of a locked preset card.
  it("quick-jump chip 'Retire 2 yrs earlier' nudges the slider, shows the overlay, and Apply fires applyPlanLevers({retirementAge})", () => {
    const { renderer, props } = mount();
    act(() => { buttonsByText(renderer.root, "Dials")[0].props.onClick(); });

    const chip = clickableByText(renderer.root, "Retire 2 yrs earlier")[0];
    expect(chip).toBeTruthy();
    act(() => { chip.props.onClick(); });

    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    expect(Number(retireInput.props.value)).toBe(safeRetAge - 2);
    expect(dashedPaths(renderer.root).length).toBeGreaterThan(0);

    act(() => { clickableByText(renderer.root, "Apply to my plan")[0].props.onClick(); });
    const applyBtns = buttonsByText(renderer.root, "Apply changes");
    act(() => { applyBtns[applyBtns.length - 1].props.onClick(); });

    expect(props.applyPlanLevers).toHaveBeenCalledTimes(1);
    expect(props.applyPlanLevers).toHaveBeenCalledWith({ retirementAge: safeRetAge - 2 });
    act(() => renderer.unmount());
  });

  // Fable review regression: the "Retire at 60" ABSOLUTE chip must clamp to
  // sliderBounds.retireMin, never land the slider thumb below it. Without the
  // clamp, a fixture where retirementAge sits close to sliderBounds.retireMin
  // (mirroring currentAge 62 / retirementAge 65 → retireMin 63) would silently
  // desync the range input from the label AND make calcWhatIfScenario compute
  // a negative re-sim index (null overlay, dead Apply button).
  it("quick-jump chip 'Retire at 60' clamps to sliderBounds.retireMin and keeps the overlay/Apply live", () => {
    const tightBounds = { retireMin: 63, retireMax: 75, spendMin: 2_000, spendMax: 10_000 };
    const { renderer, props } = mount({ sliderBounds: tightBounds });
    act(() => { buttonsByText(renderer.root, "Dials")[0].props.onClick(); });

    const chip = clickableByText(renderer.root, "Retire at 60")[0];
    expect(chip).toBeTruthy();
    act(() => { chip.props.onClick(); });

    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    // Clamped to retireMin (63), never the naive unclamped target (60).
    expect(Number(retireInput.props.value)).toBe(tightBounds.retireMin);
    expect(Number(retireInput.props.value)).toBeGreaterThanOrEqual(tightBounds.retireMin);

    // Overlay + Apply stay live (non-null) — the clamp prevents the dead-Apply
    // symptom the unclamped chip would have produced.
    expect(dashedPaths(renderer.root).length).toBeGreaterThan(0);
    const applyBtn = clickableByText(renderer.root, "Apply to my plan")[0];
    expect(applyBtn).toBeTruthy();

    act(() => { applyBtn.props.onClick(); });
    const applyBtns = buttonsByText(renderer.root, "Apply changes");
    act(() => { applyBtns[applyBtns.length - 1].props.onClick(); });

    expect(props.applyPlanLevers).toHaveBeenCalledTimes(1);
    expect(props.applyPlanLevers).toHaveBeenCalledWith({ retirementAge: tightBounds.retireMin });
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — Events mode", () => {
  it("renders the life-event preset pills", () => {
    const { renderer } = mount();
    act(() => { buttonsByText(renderer.root, "Events")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Buy a home");
    expect(allText(renderer.root)).toContain("Downsize");
    expect(allText(renderer.root)).toContain("Big trip");
    act(() => renderer.unmount());
  });

  // Replaces the deleted BUG-44 regression's coverage (per Fable review — no
  // other test in the repo exercises committedByLabel's placed state) now
  // that "Big trip" only lives here (folded in from the retired Scenarios
  // card, same seed values). Proves the fold-in inherits BUG-44's fix: a
  // placed pill always reopens by id — saveEvent upserts, never appends — so
  // re-tapping a placed "Big trip" pill can't duplicate it.
  it("a placed 'Big trip' pill shows ✓, reopens the sheet in edit mode, and never re-saves as a fresh id", () => {
    const committedTrip = {
      id: "existing-trip", label: "Big trip", amount: 40_000, age: 70,
      isInflow: false, isTaxable: false, icon: "🧳",
    };
    const { renderer, props } = mount({ moneyEvents: [committedTrip] });
    act(() => { buttonsByText(renderer.root, "Events")[0].props.onClick(); });

    const pill = renderer.root.findAll(
      n => n.type === "button" && textOf(n).includes("Big trip")
    )[0];
    expect(pill).toBeTruthy();
    expect(textOf(pill)).toContain("✓");
    act(() => { pill.props.onClick(); });

    // Sheet opens in edit mode: the "Remove from plan" affordance is present
    // (only rendered by LifeEventSheet when isEdit + onRemove — i.e. eventId
    // was passed through, not a fresh preset seed).
    expect(buttonsByText(renderer.root, "Remove from plan").length).toBe(1);
    expect(props.saveEvent).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});
