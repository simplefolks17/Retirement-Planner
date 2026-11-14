import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-162: Classic What-If panel's age inputs were seeded once (useState initial
// value) and never re-synced, so a changed current age / plan-to age was ignored.

const calls = { afford: [] };
vi.mock("../model/what-if.js", () => ({
  calcWhatIfDelta: () => null,
  calcAffordabilityMax: (_bundle, args) => { calls.afford.push(args); return null; },
}));
import { WhatIfPanel } from "../components/WhatIfPanel.jsx";

const base = {
  simInputs: {}, fedMarginal: 0.22, retDrawShared: { effectiveExpenses: 60000 },
  safeRetAge: 65, safeLifeExp: 90, baseTotalAtRet: 1e6, baseYearsSustained: 25,
  whatIfBundle: {}, addlPreTaxBal: 0,
};
const el = (over) => React.createElement(WhatIfPanel, { ...base, currentAge: 34, ...over });

function open(r) {
  const root = r.root;
  act(() => root.findAll(n => n.type === "div" && typeof n.props.onClick === "function")[0].props.onClick());
  const modeBtn = root.findAllByType("button").find(b => b.children.join("") === "Max Affordable");
  act(() => modeBtn.props.onClick());
}
const lastAfford = () => calls.afford[calls.afford.length - 1];
const inputs = (r) => r.root.findAllByType("input");

describe("WhatIfPanel age inputs follow the live bounds (BUG-162)", () => {
  it("an untouched purchase age follows a changed current age", () => {
    calls.afford.length = 0;
    let r; act(() => { r = create(el({})); });
    open(r);
    expect(lastAfford().purchaseAge).toBe(39);
    act(() => r.update(el({ currentAge: 60 })));
    expect(lastAfford().purchaseAge).toBe(65);
    expect(inputs(r)[0].props.value).toBe(65);
    act(() => r.unmount());
  });

  it("an untouched sustain-to age follows a changed plan-to age", () => {
    calls.afford.length = 0;
    let r; act(() => { r = create(el({})); });
    open(r);
    expect(lastAfford().targetLifeExpectancy).toBe(90);
    act(() => r.update(el({ safeLifeExp: 95 })));
    expect(lastAfford().targetLifeExpectancy).toBe(95);
    act(() => r.unmount());
  });

  it("a user-typed purchase age is clamped to the new current age", () => {
    calls.afford.length = 0;
    let r; act(() => { r = create(el({})); });
    open(r);
    act(() => inputs(r)[0].props.onChange({ target: { value: "40" } }));
    expect(lastAfford().purchaseAge).toBe(40);
    act(() => r.update(el({ currentAge: 55 })));
    expect(lastAfford().purchaseAge).toBe(55);
    act(() => r.unmount());
  });

  it("a user-typed sustain-to age is clamped to the retirement age", () => {
    calls.afford.length = 0;
    let r; act(() => { r = create(el({})); });
    open(r);
    act(() => inputs(r)[1].props.onChange({ target: { value: "70" } }));
    expect(lastAfford().targetLifeExpectancy).toBe(70);
    act(() => r.update(el({ safeRetAge: 75 })));
    expect(lastAfford().targetLifeExpectancy).toBe(75);
    act(() => r.unmount());
  });
});
