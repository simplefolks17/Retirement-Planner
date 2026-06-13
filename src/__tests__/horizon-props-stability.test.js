import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// ── V9 / WI-0.2 enforcement test: referential stability is correctness ───────
// horizonProps (and the whatIfBundle / whatIfSimInputs chain inside it) must be
// memoized with complete dependency arrays in App.jsx. This test renders App,
// forces a no-op re-render, and asserts that every prop HorizonShell receives is
// IDENTITY-stable — it fails if someone removes a useMemo/useCallback anywhere
// in the chain (a fresh object/function reference would break the assertion),
// the same bug class as the fixed commitPlan missing-deps incident.
//
// HorizonShell is module-mocked to capture its props per render; App's state is
// untouched between renders, so any reference change is a memoization bug.

const captured = [];

vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => {
    captured.push(props);
    return null;
  },
}));

// App is imported AFTER the mock is registered (vi.mock is hoisted, but keep
// the import here for clarity).
import App from "../App.jsx";

describe("horizonProps referential stability (V9)", () => {
  it("every prop HorizonShell receives is identity-stable across a no-op re-render", () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(App));
    });
    // Force a re-render of the same App instance with no state change.
    act(() => {
      renderer.update(React.createElement(App));
    });

    expect(captured.length).toBeGreaterThanOrEqual(2);
    const first = captured[captured.length - 2];
    const second = captured[captured.length - 1];

    const unstable = Object.keys(first).filter(k => !Object.is(first[k], second[k]));
    // Every key — including the nested whatIfSimInputs bundle, retirementWalk,
    // statementView/chartMilestones/planView/yearlyRows, commitPlan, and
    // onShowClassic — must keep its identity.
    expect(unstable).toEqual([]);

    // Spot-check the memo chain explicitly (these are the objects screens memo on):
    expect(first.whatIfSimInputs).toBe(second.whatIfSimInputs);             // whatIfBundle
    expect(first.whatIfSimInputs.simInputs).toBe(second.whatIfSimInputs.simInputs);
    expect(first.whatIfSimInputs.retDrawShared).toBe(second.whatIfSimInputs.retDrawShared);
    expect(first.retirementWalk).toBe(second.retirementWalk);
    expect(first.statementView).toBe(second.statementView);
    expect(first.chartMilestones).toBe(second.chartMilestones);
    expect(first.planView).toBe(second.planView);
    expect(first.commitPlan).toBe(second.commitPlan);

    act(() => renderer.unmount());
  });
});
