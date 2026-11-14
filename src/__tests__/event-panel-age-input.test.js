import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { MoneyEventsPanel } from "../components/MoneyEventsPanel.jsx";
import { ConversionEventsPanel } from "../components/ConversionEventsPanel.jsx";
import { DeferredInput } from "../components/DeferredInput.jsx";

// BUG-164 — the invariant (not the keystroke): an intermediate value typed into an event
// panel's age field never reaches committed state, and the committed value is clamped.

function typeThenBlur(renderer, ariaLabel, typed) {
  const input = renderer.root.findByProps({ "aria-label": ariaLabel });
  act(() => { input.props.onFocus(); });
  const calls = [];
  for (const v of typed) {
    act(() => { renderer.root.findByProps({ "aria-label": ariaLabel }).props.onChange({ target: { value: v } }); });
    calls.push(v);
  }
  return () => act(() => { renderer.root.findByProps({ "aria-label": ariaLabel }).props.onBlur(); });
}

describe("DeferredInput passthrough", () => {
  it("passes placeholder and aria-label to the <input>", () => {
    let r;
    act(() => { r = create(React.createElement(DeferredInput, {
      value: 5, onChange: () => {}, placeholder: "Age", ariaLabel: "My age" })); });
    const input = r.root.findByType("input");
    expect(input.props.placeholder).toBe("Age");
    expect(input.props["aria-label"]).toBe("My age");
  });
});

describe("MoneyEventsPanel age input (BUG-164)", () => {
  const ev = { id: "a", label: "x", amount: 1000, age: 50, isInflow: false, isTaxable: false };

  it("intermediate keystrokes do not commit; blur commits once, clamped to [currentAge, 120]", () => {
    const onChange = vi.fn();
    let r;
    act(() => { r = create(React.createElement(MoneyEventsPanel, { events: [ev], onChange, currentAge: 40 })); });
    const blur = typeThenBlur(r, "Event age", ["6", "65"]);
    expect(onChange).not.toHaveBeenCalled();
    blur();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].age).toBe(65);
  });

  it("clamps below the minimum and above the maximum on commit", () => {
    for (const [typed, expected] of [["6", 40], ["999", 120]]) {
      const onChange = vi.fn();
      let r;
      act(() => { r = create(React.createElement(MoneyEventsPanel, { events: [ev], onChange, currentAge: 40 })); });
      typeThenBlur(r, "Event age", [typed])();
      expect(onChange.mock.calls[0][0][0].age).toBe(expected);
    }
  });
});

describe("ConversionEventsPanel age input (BUG-164)", () => {
  const ev = { id: "c", age: 50, amount: 10_000 };
  const props = { currentAge: 40, safeRetAge: 65 }; // window [41, 64]

  it("intermediate keystrokes do not commit; committed value is clamped to [min, max]", () => {
    for (const [typed, expected] of [[["5", "55"], 55], [["6"], 41], [["99"], 64]]) {
      const onChange = vi.fn();
      let r;
      act(() => { r = create(React.createElement(ConversionEventsPanel, { events: [ev], onChange, ...props })); });
      const blur = typeThenBlur(r, "Conversion age", typed);
      expect(onChange).not.toHaveBeenCalled();
      blur();
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0][0].age).toBe(expected);
    }
  });
});
