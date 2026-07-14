// ── LifeEventSheet — sheet-first life-event placement flow ────────────────────
//
// The sheet is the video-inspired "configure an event, watch a live verdict,
// commit it" surface. These tests exercise:
//   1. Render with a one-time seed: fields + live verdict from a REAL
//      evaluateLifeEvent run (no mocked model).
//   2. Save composes a one-time event with an id.
//   3. Duration seed: monthly fields render; save composes a duration event.
//   4. Edit mode: "Save changes" + "Remove from plan" wired.
//   5. ArcGraph badges: committed events render as icon badges; tapping fires
//      onEventTap; events=[] renders no badge layer.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import LifeEventSheet from "../LifeEventSheet.jsx";
import ArcGraph from "../../components/ArcGraph.jsx";
import { runSimulation, buildProjectedIncomeByAge } from "../../model/simulation.js";
import { buildRetirementDrawdown } from "../../model/retirement-drawdown.js";
import { buildRetirementPhase } from "../../model/retirement-phase.js";
import { buildAccumChart } from "../../model/accumulation.js";
import { calcEmployerMatch } from "../../model/employer-match.js";
import { evaluateLifeEvent } from "../../model/what-if.js";
import { fmt } from "../shared.jsx";

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

const t = {
  bg: "#fff", surf: "#f9f7f4", surf2: "#ede9e2",
  line: "#e8e3d9", line2: "#d4cfc3", ink: "#1a1815", mut: "#6b6560",
  faint: "#b0a99e", accent: "#7c4a2e", good: "#2d7a4f", warm: "#c05f1e",
};

// ── Real what-if bundle (mirrors the what-if.test.js fixture) ─────────────────
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

// Per-account engine fixture (mirrors what-if.test.js's baseRetPhaseBase — seeds
// the ENTIRE balance into `taxable` so the engine's walk degenerates to the same
// recurrence buildRetirementDrawdown used above; existing expected values hold).
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
// Projected salary by age — mirrors what App.jsx's lifeEventBounds memo builds
// (buildProjectedIncomeByAge, simulation.js) from the SAME simInputs above, so
// the seeding/hint tests below exercise the real production wiring, not a
// hand-picked stand-in map.
const projectedIncomeByAge = buildProjectedIncomeByAge({
  currentIncome: simInputs.currentIncome, incomeGrowth: simInputs.incomeGrowth,
  incomeGrowthEndAge: null, currentAge,
  retirementAge: safeRetAge, minAge: currentAge + 1, maxAge: safeLifeExp,
});
const bounds = { minAge: currentAge + 1, maxAge: safeLifeExp, retirementAge: safeRetAge, projectedIncomeByAge };

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}
const allText = (tree) => {
  const json = tree.toJSON();
  return Array.isArray(json) ? json.map(textOf).join("") : textOf(json ?? {});
};

const findButton = (root, label) =>
  root.findAll(n => n.type === "button" && textOf({ children: n.children }) === label)[0];

describe("LifeEventSheet", () => {
  const oneTimeSeed = { label: "Buy a home", icon: "🏠", age: 40, amount: 60_000, isInflow: false };

  it("renders seed values and a live verdict from the real model", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds, initial: oneTimeSeed, onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const text = allText(tree);
    // Verdict block present with the cost bullet and one of the verdict words
    expect(text).toContain("This plan…");
    expect(text).toContain("Total: $60k");
    expect(/is comfortable|is tight — watch it|doesn't fit your plan/.test(text)).toBe(true);
    // Pre-retirement outflow must surface the at-retirement impact bullet
    expect(text).toContain("Portfolio at 65");
  });

  // BUG-73: the margin label (e.g. "3 yrs to spare past 90" / "≈12 yrs of
  // spending still in reserve at 90") sits under the verdict word — sourced
  // straight from evaluateLifeEvent's verdictInfo.marginLabel (rule 10).
  it("shows the model's margin label under the verdict word (BUG-73)", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds, initial: oneTimeSeed, onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const expected = evaluateLifeEvent(whatIfBundle, {
      ...oneTimeSeed, isTaxable: false, id: undefined,
    }).verdictInfo.marginLabel;
    expect(allText(tree)).toContain(expected);
  });

  it("save composes a one-time event with an id and the edited values", () => {
    const onSave = vi.fn();
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds, initial: oneTimeSeed, onSave, onCancel: vi.fn(),
      }));
    });
    act(() => { findButton(tree.root, "Add to plan").props.onClick(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.id).toBeTruthy();
    expect(saved).toMatchObject({
      label: "Buy a home", icon: "🏠", age: 40, amount: 60_000,
      isInflow: false, isTaxable: false,
    });
    expect(saved.monthlyAmount).toBeUndefined();
  });

  it("a duration seed renders monthly fields and saves a duration event", () => {
    const onSave = vi.fn();
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Travel 6 months", icon: "✈️", age: 70,
          monthlyAmount: 6_000, durationMonths: 6, incomeAnnual: 0, isInflow: false },
        onSave, onCancel: vi.fn(),
      }));
    });
    const text = allText(tree);
    expect(text).toContain("Monthly spending");
    expect(text).toContain("6 months");
    // Duration cost bullet: monthly × months from the model run
    expect(text).toContain("Total: $36k");
    act(() => { findButton(tree.root, "Add to plan").props.onClick(); });
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ monthlyAmount: 6_000, durationMonths: 6, incomeAnnual: 0 });
    expect(saved.amount).toBeUndefined();
  });

  it("toggling a duration outflow to 'Money in' clears a stale incomeAnnual before save (H2)", () => {
    const onSave = vi.fn();
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Travel 6 months", icon: "✈️", age: 70,
          monthlyAmount: 6_000, durationMonths: 6, incomeAnnual: 24_000, isInflow: false },
        onSave, onCancel: vi.fn(),
      }));
    });
    // The "Your income during this time" field is only rendered for money-out
    // events — confirm it's present (and carrying the seeded value) before the toggle.
    expect(allText(tree)).toContain("Your income during this time");
    const moneyIn = tree.root.findAll(
      n => typeof n.props?.onClick === "function" && textOf({ children: n.children }) === "Money in"
    )[0];
    expect(moneyIn).toBeTruthy();
    act(() => { moneyIn.props.onClick(); });
    // Field hides once isInflow is true, but the stale value must not survive to save.
    expect(allText(tree)).not.toContain("Your income during this time");
    act(() => { findButton(tree.root, "Add to plan").props.onClick(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.isInflow).toBe(true);
    expect(saved.incomeAnnual).toBe(0);
  });

  // ── "Your income during this time" seeding (income-replacement slice) ───────
  // Quick-set chips ("My usual pay" / "No income") are plain <button> elements,
  // so the existing findButton(root, label) helper (top of file) locates them too.

  it("a new pre-retirement duration event with no explicit incomeAnnual seeds from the projected-income map", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Sabbatical", icon: "🌴", age: 40,
          monthlyAmount: 5_000, durationMonths: 6, isInflow: false },
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const incomeInput = tree.root.findAll(n => n.props?.["aria-label"] === "Your income during this time")[0];
    expect(incomeInput.props.value).toBe(projectedIncomeByAge[40]);
    expect(allText(tree)).toContain("Usual pay at 40");
  });

  it("a new post-retirement duration event seeds income to 0 with a retired hint", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Trip", icon: "✈️", age: 75,
          monthlyAmount: 3_000, durationMonths: 6, isInflow: false },
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const incomeInput = tree.root.findAll(n => n.props?.["aria-label"] === "Your income during this time")[0];
    expect(incomeInput.props.value).toBe(0);
    expect(allText(tree)).toContain("you'd be retired");
  });

  it("editing a committed event / a preset with an explicit incomeAnnual keeps it (does not auto-seed)", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { id: "ev-9", label: "Part-time", icon: "💼", age: 40,
          monthlyAmount: 2_000, durationMonths: 6, incomeAnnual: 15_000, isInflow: false },
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const incomeInput = tree.root.findAll(n => n.props?.["aria-label"] === "Your income during this time")[0];
    // 15_000 is deliberately far from projectedIncomeByAge[40] — proves the
    // explicit seed wasn't overwritten by the auto-follow lookup.
    expect(incomeInput.props.value).toBe(15_000);
    expect(incomeInput.props.value).not.toBe(projectedIncomeByAge[40]);
  });

  it("shows a model-fed 'Income while it runs' bullet when the event replaces working-year salary", () => {
    const candidateEvent = { label: "Sabbatical", icon: "🌴", age: 40,
      monthlyAmount: 4_000, durationMonths: 6, incomeAnnual: 50_000, isInflow: false };
    const expected = evaluateLifeEvent(whatIfBundle, candidateEvent).incomeImpact;
    expect(expected).not.toBeNull();
    expect(expected.dir).toBe("down");

    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds, initial: candidateEvent,
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const text = allText(tree);
    expect(text).toContain("Income while it runs");
    expect(text).toContain(fmt(expected.eventPay));
    expect(text).toContain(fmt(expected.usualPay));
    // Phrase format (owner spec): "$40k less", not "−$40k" — the bare sign was
    // easy to misread. Balance bullets use "decreases/increases by $X".
    expect(text).toContain(`${fmt(expected.netLostIncomeAbs)} less`);
    expect(text).toMatch(/decreases by|increases by/);
  });

  it("no 'Income while it runs' bullet for a one-time or post-retirement event", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds, initial: oneTimeSeed,
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    expect(allText(tree)).not.toContain("Income while it runs");
  });

  it("quick-set chips write the expected income values", () => {
    const onSaveNoIncome = vi.fn();
    let treeA;
    act(() => {
      treeA = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Sabbatical", icon: "🌴", age: 40,
          monthlyAmount: 5_000, durationMonths: 6, isInflow: false },
        onSave: onSaveNoIncome, onCancel: vi.fn(),
      }));
    });
    act(() => { findButton(treeA.root, "No income").props.onClick(); });
    act(() => { findButton(treeA.root, "Add to plan").props.onClick(); });
    expect(onSaveNoIncome.mock.calls[0][0].incomeAnnual).toBe(0);

    const onSaveUsualPay = vi.fn();
    let treeB;
    act(() => {
      treeB = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Sabbatical", icon: "🌴", age: 40,
          monthlyAmount: 5_000, durationMonths: 6, incomeAnnual: 0, isInflow: false },
        onSave: onSaveUsualPay, onCancel: vi.fn(),
      }));
    });
    act(() => { findButton(treeB.root, "My usual pay").props.onClick(); });
    act(() => { findButton(treeB.root, "Add to plan").props.onClick(); });
    expect(onSaveUsualPay.mock.calls[0][0].incomeAnnual).toBe(projectedIncomeByAge[40]);
  });

  it("renders a 36-tick verdict rail for a duration event, and none when the bundle is missing", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds,
        initial: { label: "Travel 6 months", icon: "✈️", age: 70,
          monthlyAmount: 6_000, durationMonths: 6, incomeAnnual: 0, isInflow: false },
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const ticks = tree.root.findAll(n => n.type === "div" && n.props?.style?.borderRadius === 2);
    expect(ticks.length).toBe(36);
    // Every tick's background resolves to one of the verdict tokens (rule 10 —
    // the mapping is a fixed enum, never a computed color).
    const validColors = new Set([t.good, t.warm, t.accent, t.line]);
    for (const tick of ticks) {
      expect(validColors.has(tick.props.style.background)).toBe(true);
    }
    // BUG-73: the duration rail carries a legend caption (from
    // result.verdictInfo.rangeLegend) so users see the value range behind
    // each tick color, not just the color.
    expect(allText(tree)).toContain("5+ yrs of runway");
    expect(allText(tree)).toContain("runs out before 90");

    let treeNoBundle;
    act(() => {
      treeNoBundle = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle: null, bounds,
        initial: { label: "Travel 6 months", icon: "✈️", age: 70,
          monthlyAmount: 6_000, durationMonths: 6, incomeAnnual: 0, isInflow: false },
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const ticksNoBundle = treeNoBundle.root.findAll(n => n.type === "div" && n.props?.style?.borderRadius === 2);
    expect(ticksNoBundle.length).toBe(0);
  });

  it("edit mode shows Save changes + Remove from plan and wires both", () => {
    const onSave = vi.fn(), onRemove = vi.fn();
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle, bounds, initial: { ...oneTimeSeed, id: "ev-1" },
        onSave, onRemove, onCancel: vi.fn(),
      }));
    });
    act(() => { findButton(tree.root, "Remove from plan").props.onClick(); });
    expect(onRemove).toHaveBeenCalledTimes(1);
    act(() => { findButton(tree.root, "Save changes").props.onClick(); });
    // Editing preserves the committed event's id
    expect(onSave.mock.calls[0][0].id).toBe("ev-1");
  });

  it("renders without a verdict block when the bundle is missing (guard)", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle: null, bounds, initial: oneTimeSeed,
        onSave: vi.fn(), onCancel: vi.fn(),
      }));
    });
    expect(allText(tree)).not.toContain("This plan…");
    expect(findButton(tree.root, "Add to plan")).toBeTruthy();
  });
});

// ── LifeEventSheet — edit mode double-count regression (H1) ───────────────────
// A real per-account-engine bundle (mirrors what-if.test.js's H1 fixture — the
// all-taxable-seed trick the fixture above uses is NOT valid here: editing a
// committed event forces a re-sim, which reads REAL per-account balances, so an
// artificially-collapsed retPhaseBase would show a spurious divergence unrelated
// to the bug under test) with a COMMITTED event already baked into every
// committed-event source, exactly how App.jsx wires a real moneyEvents entry.
describe("LifeEventSheet — edit mode double-count regression (H1)", () => {
  const editEm = (s, c) => calcEmployerMatch(s, c, {
    matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3,
  });
  const editSimInputsBase = {
    totalYears: 60, currentAge: 40, currentIncome: 120_000, incomeGrowth: 2,
    filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 6,
    bal401k: 100_000, balRoth: 40_000, balTaxable: 60_000, balHSA: 15_000,
    contrib401k: 15_000, contribRoth: 6_000, contribTaxable: 5_000, contribHSA: 3_000,
    contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
    calcEmployerMatchFn: editEm, moneyEvents: [],
  };
  const editSafeRetAge = 65, editSafeLifeExp = 90, editCurrentAge = 40;
  const committedTrip = {
    id: "trip-1", label: "Big trip", icon: "✈️", amount: 40_000, age: 70,
    isInflow: false, isTaxable: false,
  };
  const editSimInputs = { ...editSimInputsBase, moneyEvents: [committedTrip] };
  const editSim = runSimulation(editSimInputs)
    .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
  const editAt = editSim[editSafeRetAge - editCurrentAge - 1];
  const editTradGrossAtRet = editAt.tradGross ?? 0;
  const editRoth    = editAt["Roth IRA"] ?? 0;
  const editTaxable = editAt["Taxable"]  ?? 0;
  const editHsa     = editAt["HSA"]      ?? 0;
  const editTotalAtRet = editTradGrossAtRet + editRoth + editTaxable + editHsa;
  const editRetPhaseBase = {
    tradGross: editTradGrossAtRet, roth: editRoth, taxable: editTaxable, hsa: editHsa,
    startAge: editSafeRetAge, lifeExp: editSafeLifeExp, longevityHorizon: editSafeRetAge + 130,
    rReal: 0.02, effectiveExpenses: 60_000,
    ssGross: 24_000, ssTaxable: 20_000, ssClaimAge: 67,
    pension: 0, pensionStartAge: Infinity,
    filingStatus: "single", retStateRate: 0,
    rmdStartAge: 73, useTable2: false, spouseCurrentAge: null, currentAge: editCurrentAge,
    moneyEvents: [committedTrip],
  };
  const editRetPhase = buildRetirementPhase({ ...editRetPhaseBase, conversionByAge: {} });
  const editAccumChart = buildAccumChart({
    simData: editSim, safeRetAge: editSafeRetAge, currentAge: editCurrentAge,
    bal401k: editSimInputsBase.bal401k, balRoth: editSimInputsBase.balRoth,
    balTaxable: editSimInputsBase.balTaxable, balHSA: editSimInputsBase.balHSA,
  });
  const editBaseChart = [
    ...editAccumChart,
    ...editRetPhase.rows.map(r => ({ age: r.age, total: r.total })),
  ];
  const editRetDrawShared = {
    rReal: editRetPhaseBase.rReal, effectiveExpenses: editRetPhaseBase.effectiveExpenses,
    ssAmount: editRetPhaseBase.ssGross, ssClaimAge: editRetPhaseBase.ssClaimAge,
    pensionAmount: 0, pensionStartAge: Infinity,
    rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [committedTrip],
  };
  const editBundle = {
    simInputs: editSimInputs, fedMarginal: 0.22, retDrawShared: editRetDrawShared,
    safeRetAge: editSafeRetAge, safeLifeExp: editSafeLifeExp,
    baseTotalAtRet: editTotalAtRet, baseYearsSustained: editRetPhase.yearsSustained,
    retPhaseBase: editRetPhaseBase, conversionByAge: {},
    baseChart: editBaseChart, addlPreTaxBal: 0,
  };
  const editBounds = { minAge: editCurrentAge + 1, maxAge: editSafeLifeExp, retirementAge: editSafeRetAge };

  it("editing a committed event with unchanged values shows no impact bullet (no double-count)", () => {
    let tree;
    act(() => {
      tree = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle: editBundle, bounds: editBounds, initial: committedTrip,
        onSave: vi.fn(), onRemove: vi.fn(), onCancel: vi.fn(),
      }));
    });
    const text = allText(tree);
    // Before the fix this bullet showed a large spurious delta (≈ −$59k) from
    // pricing the already-committed event a second time via scenarioEvents.
    // Fixed: base and scenario runs price it exactly once, so the "Left at ___"
    // delta bullet (rendered only when result.atPlanAge.dir is truthy) is absent.
    expect(text).not.toContain("Left at");
    expect(text).toContain("This plan…");
  });
});

describe("ArcGraph event badges", () => {
  const chartData = [];
  for (let a = 35; a <= 90; a++) chartData.push({ age: a, total: 1_000_000 + a * 10_000 });

  const renderArc = (events, onEventTap) => {
    let tree;
    act(() => {
      tree = create(React.createElement(ArcGraph, {
        t, chartData, currentAge: 35, retirementAge: 65,
        lifeExpect: 90, events, onEventTap, showToggle: false,
      }));
    });
    return tree;
  };

  it("renders an icon badge with a <title> for each committed event", () => {
    const tree = renderArc([
      { id: "1", label: "Buy a home", icon: "🏠", age: 40, amount: 60_000, isInflow: false },
      { id: "2", label: "Part-time", icon: "💼", age: 60, monthlyAmount: 2_000, durationMonths: 12, isInflow: true },
    ]);
    const texts = tree.root.findAll(n => n.type === "text").map(n => textOf({ children: n.children }));
    expect(texts).toContain("🏠");
    expect(texts).toContain("💼");
    const titles = tree.root.findAll(n => n.type === "title").map(n => textOf({ children: n.children }));
    expect(titles.some(s => s.includes("Buy a home") && s.includes("40"))).toBe(true);
  });

  it("tapping a badge fires onEventTap with the event", () => {
    const onTap = vi.fn();
    const ev = { id: "1", label: "Buy a home", icon: "🏠", age: 40, amount: 60_000, isInflow: false };
    const tree = renderArc([ev], onTap);
    const badge = tree.root.findAll(n => n.type === "g" && n.props.onClick)[0];
    expect(badge).toBeTruthy();
    act(() => { badge.props.onClick(); });
    expect(onTap).toHaveBeenCalledWith(ev);
  });

  it("events=[] renders no badge layer (pixel-identical guarantee)", () => {
    const tree = renderArc([]);
    expect(tree.root.findAll(n => n.type === "g" && n.props.onClick).length).toBe(0);
    expect(tree.root.findAll(n => n.type === "text").length).toBe(0);
  });
});
