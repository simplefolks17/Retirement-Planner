// ── IdeasScreen — Events + Solvers modes (Level 3 slice 5) ────────────────────
//
// Events mode: adding/editing/removing a money event calls the right
// eventsView.* write callback; the Add affordance respects atMax.
// Solvers mode: the displayed max-affordable amount comes from the SAME
// calcAffordabilityMax call a direct test invocation would make (Classic-
// parity anti-divergence lock — same function, same inputs, can't diverge
// from WhatIfPanel's equivalent); the canAfford:false state renders the
// designed message, not a fabricated number.
// Mode switching: only one mode panel is visible at a time.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import IdeasScreen, { LIFE_EVENTS } from "../screens/IdeasScreen.jsx";
import { fmt } from "../shared.jsx";
import { calcAffordabilityMax } from "../../model/what-if.js";
import { calcEmployerMatch } from "../../model/employer-match.js";
import { runSimulation } from "../../model/simulation.js";
import { buildRetirementDrawdown } from "../../model/retirement-drawdown.js";

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

// ── whatIfBundle fixture (mirrors src/model/__tests__/what-if.test.js) ─────────
const em = (s, c) => calcEmployerMatch(s, c, {
  matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3,
});
const safeRetAge  = 65;
const safeLifeExp = 90;
const currentAge  = 30;
const fedMarginal = 0.22;
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

// Depleting scenario — deliberate low portfolio + high expenses so it's NOT
// trivially sustainable (bounded, non-capped calcAffordabilityMax results).
const depletingRetDrawShared = {
  rReal, effectiveExpenses: 80_000,
  ssAmount: 0, ssClaimAge: Infinity,
  pensionAmount: 0, pensionStartAge: Infinity,
  rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
};
const depletingBase = 800_000;
const { yearsSustained: depletingBaseYears } = buildRetirementDrawdown({
  ...depletingRetDrawShared,
  startBal: depletingBase, startAge: safeRetAge, endAge: safeRetAge + 130,
});

const depletingArgs = {
  simInputs, fedMarginal,
  retDrawShared: depletingRetDrawShared,
  safeRetAge, safeLifeExp,
  baseTotalAtRet: depletingBase, baseYearsSustained: depletingBaseYears,
};

// ── eventsView mock builder ─────────────────────────────────────────────────
function makeEventsView(rows = []) {
  return {
    rows: rows.map(r => ({
      id: r.id,
      labelField: { value: r.label, set: vi.fn() },
      amountField: { value: r.amount, set: vi.fn(), min: 0, step: 1_000 },
      ageField: { value: r.age, set: vi.fn(), min: currentAge, max: 120, step: 1 },
      directionField: {
        value: r.isInflow ? "in" : "out", set: vi.fn(),
        options: [{ value: "out", label: "Expense" }, { value: "in", label: "Income" }],
      },
      taxableField: { value: r.isTaxable ?? false, set: vi.fn() },
      showTaxable: !!r.isInflow,
      remove: vi.fn(),
    })),
    add: vi.fn(),
    atMax: rows.length >= 6,
    count: rows.length,
    maxEvents: 6,
    hasEvents: rows.length > 0,
    netImpactLabel: rows.length === 0 ? "no net impact" : "+$1k",
  };
}

function makeBaseProps(overrides = {}) {
  return {
    chartData: [{ age: currentAge, total: 165_000 }, { age: safeRetAge, total: 3_950_000 }],
    currentAge, retirementAge: safeRetAge, lifeExpect: safeLifeExp,
    totalAtRet: 3_950_000, effectiveExpenses: 75_000, balAt90: 3_000_000,
    contribSeries: [],
    whatIfSimInputs: depletingArgs,
    statementView: { monthlyTotal: 4_000, keepPct: 50 },
    moneyEvents: [],
    retirementWalk: { rows: [] },
    eventsView: makeEventsView(),
    affordView: {
      defaultPurchaseAge: 68, purchaseAgeField: { min: 60, max: 89, step: 1 },
      defaultTargetAge: 74, targetAgeField: { min: 66, max: 115, step: 1 },
      step: 10_000,
    },
    buildScenarioCommitSite: vi.fn(() => null),
    ...overrides,
  };
}

// ── Render helpers ───────────────────────────────────────────────────────────
function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}
function clickByText(root, label) {
  const target = root.findAll(
    n => typeof n.props?.onClick === "function" && textOf(n) === label
  )[0];
  expect(target, `clickable element "${label}" not found`).toBeTruthy();
  act(() => { target.props.onClick(); });
}
function mount(props) {
  let renderer;
  act(() => {
    renderer = create(React.createElement(IdeasScreen, { t, props, isMobile: false }));
  });
  return renderer;
}
function findByPlaceholder(root, placeholder) {
  return root.findAll(n => n.type === "input" && n.props?.placeholder === placeholder)[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("IdeasScreen — Events mode", () => {
  it("empty state shows 'No events yet' and an Add button that calls eventsView.add", () => {
    const props = makeBaseProps();
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    expect(textOf(renderer.root)).toContain("No events yet");
    clickByText(renderer.root, "+ Add event");
    expect(props.eventsView.add).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it("editing the label field calls labelField.set", () => {
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: "Car", amount: 20_000, age: 40, isInflow: false },
      ]),
    });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    const input = findByPlaceholder(renderer.root, "Label (e.g. Car purchase)");
    expect(input).toBeTruthy();
    act(() => { input.props.onChange({ target: { value: "New car" } }); });
    expect(props.eventsView.rows[0].labelField.set).toHaveBeenCalledWith("New car");
    act(() => renderer.unmount());
  });

  it("editing the amount field calls amountField.set", () => {
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: "Car", amount: 20_000, age: 40, isInflow: false },
      ]),
    });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    const input = findByPlaceholder(renderer.root, "Amount");
    act(() => { input.props.onChange({ target: { value: "25000" } }); });
    expect(props.eventsView.rows[0].amountField.set).toHaveBeenCalledWith("25000");
    act(() => renderer.unmount());
  });

  it("switching direction calls directionField.set", () => {
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: "Windfall", amount: 20_000, age: 40, isInflow: false },
      ]),
    });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    clickByText(renderer.root, "Income");
    expect(props.eventsView.rows[0].directionField.set).toHaveBeenCalledWith("in");
    act(() => renderer.unmount());
  });

  it("removing a row calls row.remove", () => {
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: "Car", amount: 20_000, age: 40, isInflow: false },
      ]),
    });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    clickByText(renderer.root, "×");
    expect(props.eventsView.rows[0].remove).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it("Add affordance is hidden and a count caption shown when atMax", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), label: `Ev${i}`, amount: 1_000, age: 40 + i, isInflow: false,
    }));
    const props = makeBaseProps({ eventsView: makeEventsView(rows) });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    expect(textOf(renderer.root)).not.toContain("+ Add event");
    expect(textOf(renderer.root)).toContain("6/6 events");
    act(() => renderer.unmount());
  });

  it("shows the net impact label footer when events exist", () => {
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: "Windfall", amount: 20_000, age: 40, isInflow: true },
      ]),
    });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    expect(textOf(renderer.root)).toContain("Net impact: +$1k");
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — Solvers mode", () => {
  it("displayed max-affordable amount equals a direct calcAffordabilityMax call (anti-divergence)", () => {
    const props = makeBaseProps(); // depletingArgs, purchaseAge 68, target 74 — affordable & bounded
    const expected = calcAffordabilityMax({
      ...depletingArgs, purchaseAge: 68, targetLifeExpectancy: 74, step: 10_000,
    });
    expect(expected.canAfford).toBe(true);

    const renderer = mount(props);
    clickByText(renderer.root, "Solvers");
    const txt = textOf(renderer.root);
    expect(txt).toContain(fmt(expected.maxAmount));
    expect(txt).toContain("You could spend up to");
    act(() => renderer.unmount());
  });

  it("canAfford:false renders the designed message, not a fabricated number", () => {
    const props = makeBaseProps({
      affordView: {
        defaultPurchaseAge: 68, purchaseAgeField: { min: 60, max: 89, step: 1 },
        defaultTargetAge: safeLifeExp, // 90 — beyond depletingArgs longevity
        targetAgeField: { min: 66, max: 115, step: 1 },
        step: 10_000,
      },
    });
    const expected = calcAffordabilityMax({
      ...depletingArgs, purchaseAge: 68, targetLifeExpectancy: safeLifeExp, step: 10_000,
    });
    expect(expected.canAfford).toBe(false);

    const renderer = mount(props);
    clickByText(renderer.root, "Solvers");
    const txt = textOf(renderer.root);
    expect(txt).toContain("no room for an additional expense");
    expect(txt).not.toContain("You could spend up to");
    act(() => renderer.unmount());
  });

  it("desktop age input allows free typing then clamps an out-of-range value on blur (review-fix regression)", () => {
    // Before the first fix, the desktop <input type=number> passed Number(e.target.value)
    // straight through with no clamp at all (only the mobile stepper clamped), so typing an
    // absurd age (e.g. 500) produced an event the retirement walk never reaches —
    // isSustainable() then returns true for every amount, and the binary search converges
    // on maxSearch (a nonsensical "$5,000,000 affordable" result). A second review pass
    // found that clamping on every onChange keystroke locks the input mid-typing (typing
    // "68" with min=60 clamps to 60 after the first digit) — clamping moved to onBlur,
    // with onChange left free so the draft can hold any intermediate typed text.
    const props = makeBaseProps();
    const renderer = mount(props);
    clickByText(renderer.root, "Solvers");

    const findInput = () => renderer.root.findAll(
      n => n.type === "input" && n.props["aria-label"] === "One-time purchase at age"
    )[0];

    // Mid-typing: onChange must NOT clamp — the draft holds the raw typed text.
    act(() => { findInput().props.onChange({ target: { value: "6" } }); });
    expect(findInput().props.value).toBe("6");

    // Finishing an absurd value and blurring clamps to the field's bounds.
    act(() => { findInput().props.onChange({ target: { value: "500" } }); });
    act(() => { findInput().props.onBlur({ target: { value: "500" } }); });
    // affordView.purchaseAgeField.max is 89 (safeLifeExp - 1) in this fixture.
    expect(findInput().props.value).toBe("89");
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — life-event pill state (review-fix regression)", () => {
  // A pill's "placed" state is DERIVED from eventsView.rows (== moneyEvents), never
  // tracked as separate shadow state — see the findPlacedRow comment in IdeasScreen.jsx.
  const atMaxRows = Array.from({ length: 6 }, (_, i) => ({
    id: String(i), label: `Existing ${i}`, amount: 1_000, age: 40, isInflow: false,
  }));

  it("clicking an unplaced pill does not open the confirm modal when at the events cap", () => {
    const props = makeBaseProps({ eventsView: makeEventsView(atMaxRows) });
    expect(props.eventsView.atMax).toBe(true);

    let renderer;
    act(() => {
      renderer = create(React.createElement(
        IdeasScreen, { t, props, isMobile: false, initialMode: "life" }
      ));
    });

    clickByText(renderer.root, LIFE_EVENTS[0].l);
    // The confirm modal must never open — no "Add to plan" button rendered.
    expect(renderer.root.findAll(
      n => typeof n.props?.onClick === "function" && textOf(n) === "Add to plan"
    )).toHaveLength(0);
    expect(props.eventsView.add).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("confirming an unplaced pill under the cap calls eventsView.add with no id override", () => {
    const props = makeBaseProps({ eventsView: makeEventsView([]) });
    expect(props.eventsView.atMax).toBe(false);

    let renderer;
    act(() => {
      renderer = create(React.createElement(
        IdeasScreen, { t, props, isMobile: false, initialMode: "life" }
      ));
    });

    const life = LIFE_EVENTS[0];
    clickByText(renderer.root, life.l);
    clickByText(renderer.root, "Add to plan");

    expect(props.eventsView.add).toHaveBeenCalledTimes(1);
    // The add() call must not pass its own id override — eventsView.add generates
    // its own id (Date.now() + Math.random()); a caller-supplied id would silently
    // win (spread order) and defeat that generator's collision-jitter.
    const written = props.eventsView.add.mock.calls[0][0];
    expect(written).not.toHaveProperty("id");
    expect(written).toMatchObject({
      label: life.l, amount: life.amount, age: life.age, isInflow: life.isInflow,
    });
    act(() => renderer.unmount());
  });

  it("a pill whose exact event already exists in eventsView.rows renders placed, with no click needed", () => {
    const life = LIFE_EVENTS[0]; // { l: "Buy a home", age: 40, amount: 60_000, isInflow: false }
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: life.l, amount: life.amount, age: life.age, isInflow: life.isInflow },
      ]),
    });

    const renderer = mount(props);
    clickByText(renderer.root, "Drop life onto timeline"); // enter "life" mode
    expect(textOf(renderer.root)).toContain(`✓  ${life.l}`);
    act(() => renderer.unmount());
  });

  it("clicking a placed pill removes the matching row and clears activeScen", () => {
    const life = LIFE_EVENTS[0];
    const removeFn = vi.fn();
    const eventsView = makeEventsView([
      { id: "1", label: life.l, amount: life.amount, age: life.age, isInflow: life.isInflow },
    ]);
    eventsView.rows[0].remove = removeFn;
    const props = makeBaseProps({ eventsView });

    const renderer = mount(props);
    clickByText(renderer.root, "Drop life onto timeline");
    clickByText(renderer.root, `✓  ${life.l}`);

    expect(removeFn).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });
});

describe("IdeasScreen — mode switching (one panel visible at a time)", () => {
  it("switching from Events to Solvers unmounts the events panel", () => {
    const props = makeBaseProps({
      eventsView: makeEventsView([
        { id: "1", label: "Car", amount: 20_000, age: 40, isInflow: false },
      ]),
    });
    const renderer = mount(props);
    clickByText(renderer.root, "Events");
    expect(textOf(renderer.root)).toContain("One-time money events");
    expect(findByPlaceholder(renderer.root, "Label (e.g. Car purchase)")).toBeTruthy();

    clickByText(renderer.root, "Solvers");
    const txt = textOf(renderer.root);
    expect(txt).not.toContain("One-time money events");
    expect(findByPlaceholder(renderer.root, "Label (e.g. Car purchase)")).toBeFalsy();
    expect(txt).toContain("One-time purchase at age");
    act(() => renderer.unmount());
  });
});
