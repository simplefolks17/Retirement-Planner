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
const bounds = { minAge: currentAge + 1, maxAge: safeLifeExp, retirementAge: safeRetAge };

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
