import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-151 — retirement state must follow the work state until the user picks a
// different one. Mounts the REAL App (App.jsx glue is exactly what model-only tests
// cannot see; before this file, zeroing retStateRate failed 0 of 1,408 tests).

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
const rs = app => app.latest().assumptions.retirementState;

describe("retirement state follows the work state (BUG-151)", () => {
  it("starts in auto mode at the default (TX/TX)", () => {
    const app = mount();
    expect(rs(app).value).toBe("TX");
    expect(rs(app).isAuto).toBe(true);
    app.unmount();
  });

  it("follows the work state when it changes, and the retirement state tax follows too", () => {
    const app = mount();
    const before = app.latest().yearsSustained;
    app.fire(() => app.latest().profile.selectedState.set("CA"));
    expect(rs(app).value).toBe("CA");
    expect(rs(app).isAuto).toBe(true);
    expect(app.latest().yearsSustained).not.toBe(before);
    // Isolate the RETIREMENT-state effect (take-home is the same in both): with work
    // state CA, following it (CA retirement tax) must differ from an explicit TX.
    const followed = app.latest().yearsSustained;
    app.fire(() => app.latest().assumptions.retirementState.set("TX"));
    expect(rs(app).isAuto).toBe(false);
    expect(app.latest().yearsSustained).not.toBe(followed);
    app.unmount();
  });

  it("stops following once the user picks a different retirement state", () => {
    const app = mount();
    app.fire(() => app.latest().assumptions.retirementState.set("CA"));
    expect(rs(app).value).toBe("CA");
    expect(rs(app).isAuto).toBe(false);
    app.fire(() => app.latest().profile.selectedState.set("NY"));
    expect(rs(app).value).toBe("CA");
    expect(rs(app).isAuto).toBe(false);
    app.unmount();
  });

  it("goes back to following when the user picks the work state again", () => {
    const app = mount();
    app.fire(() => app.latest().assumptions.retirementState.set("CA"));
    app.fire(() => app.latest().assumptions.retirementState.set("TX")); // == work state
    expect(rs(app).isAuto).toBe(true);
    app.fire(() => app.latest().profile.selectedState.set("NY"));
    expect(rs(app).value).toBe("NY");
    app.unmount();
  });

  it("retirement state tax changes retirement outcomes (retStateRate wired into the walk)", () => {
    const a = mount();
    const base = a.latest().yearsSustained;
    a.fire(() => a.latest().assumptions.retirementState.set("CA"));
    expect(a.latest().yearsSustained).not.toBe(base);
    a.unmount();
  });
});

describe("work state flows into take-home (BUG-151)", () => {
  it("a CA work state lowers take-home vs TX", () => {
    const app = mount();
    const tx = app.latest().budget.grossAfterTax;
    app.fire(() => app.latest().profile.selectedState.set("CA"));
    const ca = app.latest().budget.grossAfterTax;
    expect(tx).toBeDefined();
    expect(ca).toBeLessThan(tx);
    app.unmount();
  });
});
