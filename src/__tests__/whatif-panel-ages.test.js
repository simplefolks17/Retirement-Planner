import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-162: Classic What-If panel's age inputs were seeded once (useState initial
// value) and never re-synced, so a changed current age / plan-to age was ignored.

const calls = { afford: [] };
vi.mock("../model/what-if.js", () => ({
  calcWhatIfDelta: () => null,
  calcWhatIfDeltaAnchored: () => ({
    // years 10.6 from 65 would Math.round to 76; the model's depletion convention says 76 + ... —
    // deliberately different numbers so the label can only be passing the MODEL's ages through.
    baseYears: 20.4, scenarioYears: 10.6, deltaYears: -9.8, scenarioRetAge: 65,
    baseDepletionAge: 86, scenarioDepletionAge: 76, baseTotalAtRet: 1e6, scenarioTotalAtRet: 9e5,
    baseExpenses: 60000, scenarioExpenses: 60000,
  }),
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
    // BUG-190: the floor is the first CHARGED age (currentAge + 1), not currentAge.
    expect(lastAfford().purchaseAge).toBe(56);
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

describe("WhatIfPanel (R4-B)", () => {
  it("BUG-190: a purchase typed AT the current age is raised to the first charged age", () => {
    calls.afford.length = 0;
    let r; act(() => { r = create(el({})); });
    open(r);
    act(() => inputs(r)[0].props.onChange({ target: { value: "34" } }));
    expect(lastAfford().purchaseAge).toBe(35);
    expect(inputs(r)[0].props.min).toBe(35);
    act(() => r.unmount());
  });

  it("depletion ages are the model's, not re-derived from years", () => {
    let r; act(() => { r = create(el({})); });
    const root = r.root;
    act(() => root.findAll(n => n.type === "div" && typeof n.props.onClick === "function")[0].props.onClick());
    const amount = root.findAllByType("input").find(i => i.props.placeholder === "$ Amount");
    act(() => amount.props.onChange({ target: { value: "50000" } }));
    const text = JSON.stringify(r.toJSON());
    expect(text).toContain("76");
    expect(text).toContain("86");
    // Math.round(65 + 10.6) = 76 would coincide; the base side differs: round(65+20.4)=85, not 86.
    expect(text).not.toContain("85");
    act(() => r.unmount());
  });
});
