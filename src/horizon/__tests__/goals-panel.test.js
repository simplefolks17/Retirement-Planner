// ── GoalsPanel — the multi-goal "Goals" facet of the Plan Explore tray ────────
//
// Covers the behavior that lets a user place MANY goals (multiple trips, etc.):
//   1. Presets each seed a NEW goal (no id) — the same preset can be placed
//      repeatedly; two same-label goals can coexist (id-keyed, not label-keyed).
//   2. Progressive disclosure: DEFAULT_VISIBLE_GOALS presets shown, "+ Add more
//      goals" reveals the rest + a "+ Custom goal" button.
//   3. Committed goals list numbered (Goal 1, Goal 2 …), tap → edit, ✕ → remove.
//   4. Cap: at MAX_MONEY_EVENTS the add affordances are replaced by a note.

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import GoalsPanel from "../GoalsPanel.jsx";
import { MAX_MONEY_EVENTS } from "../../model/money-events.js";
import { ASSUMPTIONS } from "../../config/irs-2026.js";

const t = {
  bg: "#fff", surf: "#f9f7f4", surf2: "#ede9e2",
  line: "#e8e3d9", line2: "#d4cfc3", ink: "#1a1815", mut: "#6b6560",
  faint: "#b0a99e", accent: "#7c4a2e", good: "#2d7a4f", warm: "#c05f1e",
};

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}
const allText = (root) => textOf({ children: [root] });
const btns = (root, sub) =>
  root.findAll(n => n.type === "button" && textOf({ children: n.children }).includes(sub));

function mount(props = {}) {
  const cb = {
    onNewGoal: vi.fn(), onEditGoal: vi.fn(), onRemoveGoal: vi.fn(),
    bounds: { retirementAge: 65 },
  };
  let renderer;
  act(() => {
    renderer = create(React.createElement(GoalsPanel, {
      t, moneyEvents: [], ...cb, ...props,
    }));
  });
  return { renderer, cb };
}

describe("GoalsPanel", () => {
  it("shows DEFAULT_VISIBLE_GOALS presets by default, then 'add more goals'", () => {
    const { renderer } = mount();
    expect(allText(renderer.root)).toContain("Add a goal");
    // Exactly the first N presets are shown initially.
    expect(btns(renderer.root, "Buy a home").length).toBe(1);          // #1
    expect(btns(renderer.root, "Big trip").length).toBe(0);            // #6, hidden
    expect(btns(renderer.root, "+ Add more goals").length).toBe(1);
    expect(btns(renderer.root, "+ Custom goal").length).toBe(0);
    act(() => renderer.unmount());
  });

  it("'add more goals' reveals the rest + a custom-goal button", () => {
    const { renderer, cb } = mount();
    act(() => { btns(renderer.root, "+ Add more goals")[0].props.onClick(); });
    expect(btns(renderer.root, "Big trip").length).toBe(1);           // now visible
    const custom = btns(renderer.root, "+ Custom goal");
    expect(custom.length).toBe(1);
    act(() => { custom[0].props.onClick(); });
    // Custom seed carries NO id (new goal) and a default label.
    expect(cb.onNewGoal).toHaveBeenCalledTimes(1);
    const seed = cb.onNewGoal.mock.calls[0][0];
    expect(seed.id).toBeUndefined();
    expect(seed.label).toBe("New goal");
    act(() => renderer.unmount());
  });

  it("a preset seeds a NEW goal (no id) — so the same preset can be placed repeatedly", () => {
    const { renderer, cb } = mount();
    act(() => { btns(renderer.root, "Buy a home")[0].props.onClick(); });
    const seed = cb.onNewGoal.mock.calls[0][0];
    expect(seed.id).toBeUndefined();
    expect(seed.label).toBe("Buy a home");
    act(() => renderer.unmount());
  });

  it("lists committed goals numbered; two same-label goals both appear and edit/remove by id", () => {
    const goals = [
      { id: "a", label: "Big trip", icon: "🧳", age: 60, amount: 40_000, isInflow: false },
      { id: "b", label: "Big trip", icon: "🧳", age: 72, amount: 25_000, isInflow: false },
    ];
    const { renderer, cb } = mount({ moneyEvents: goals });
    const text = allText(renderer.root);
    expect(text).toContain("Goal 1");
    expect(text).toContain("Goal 2");
    // Both same-label goals are individually present (id-keyed, not deduped).
    expect(text.split("Big trip").length - 1).toBe(2);

    act(() => { btns(renderer.root, "Big trip")[0].props.onClick(); });
    expect(cb.onEditGoal).toHaveBeenCalledWith(goals[0]);

    const rmB = renderer.root.findAll(n =>
      n.type === "button" && n.props["aria-label"] === "Remove goal 2: Big trip");
    act(() => { rmB[0].props.onClick(); });
    expect(cb.onRemoveGoal).toHaveBeenCalledWith("b");
    act(() => renderer.unmount());
  });

  it("at the cap, add affordances are replaced by a note", () => {
    const many = Array.from({ length: MAX_MONEY_EVENTS }, (_, i) => ({
      id: `g${i}`, label: `Goal ${i}`, age: 60 + i, amount: 1_000, isInflow: false,
    }));
    const { renderer } = mount({ moneyEvents: many });
    expect(allText(renderer.root)).toContain(`max of ${MAX_MONEY_EVENTS} goals`);
    expect(btns(renderer.root, "Buy a home").length).toBe(0);
    expect(btns(renderer.root, "+ Add more goals").length).toBe(0);
    act(() => renderer.unmount());
  });

  it("DEFAULT_VISIBLE_GOALS is the configured default", () => {
    expect(ASSUMPTIONS.DEFAULT_VISIBLE_GOALS).toBe(3);
    expect(MAX_MONEY_EVENTS).toBe(12);
  });
});
