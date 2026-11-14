import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-154 — App-level: pinning your own SS figure must not kill the delay-to-70 comparison,
// and withdrawalRate / wr70 must stay on the same SS basis.
const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";

function mount() {
  captured.length = 0;
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  return {
    latest: () => captured[captured.length - 1],
    fire: (fn) => act(() => fn()),
    unmount: () => act(() => renderer.unmount()),
  };
}

describe("ssOverride vs the delay-to-70 leg (BUG-154)", () => {
  it("a pinned override keeps the delay card applicable and wr70 on the override basis", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(62));
    const before = app.latest().ssView;
    expect(before.delayApplicable).toBe(true);

    app.fire(() => app.latest().ss.ssOverride.set(90_000));
    const after = app.latest();
    expect(after.ss.ssOverride.value).toBe(90_000);
    expect(after.ssView.delayApplicable).toBe(true);           // pre-fix: false
    expect(after.ssView.ss70DrawReduction).toBeGreaterThan(0); // pre-fix: 0
    expect(after.ssView.wr70).not.toBe(before.wr70);           // pre-fix: unchanged by the override
    // Delaying must never read as worse than claiming now.
    expect(after.ssView.wr70).toBeLessThanOrEqual(after.withdrawalRate);
    app.unmount();
  });
});
