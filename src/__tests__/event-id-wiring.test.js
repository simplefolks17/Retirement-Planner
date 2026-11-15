import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-163 — App-level: events created through the real App wiring get unique STRING ids.
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

describe("event id minting through the real App (BUG-163)", () => {
  it("conversion events added back-to-back get distinct string ids", () => {
    const app = mount();
    app.fire(() => app.latest().conversionView.events.add());
    app.fire(() => app.latest().conversionView.events.add());
    const ids = app.latest().conversionView.events.rows.map(r => r.id);
    expect(ids.length).toBe(2);
    ids.forEach(id => expect(typeof id).toBe("string"));
    expect(new Set(ids).size).toBe(2);
    app.unmount();
  });

  it("an id lookup (remove) on a minted string id still finds its event", () => {
    const app = mount();
    app.fire(() => app.latest().conversionView.events.add());
    app.fire(() => app.latest().conversionView.events.add());
    const [first, second] = app.latest().conversionView.events.rows;
    app.fire(() => first.remove());
    const left = app.latest().conversionView.events.rows.map(r => r.id);
    expect(left).toEqual([second.id]);
    app.unmount();
  });
});
