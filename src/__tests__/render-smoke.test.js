import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import App from "../App.jsx";

// App.jsx is a state/layout shell — the model suite never renders it, so runtime
// errors in the component body (e.g. temporal-dead-zone references from reordered
// declarations) are invisible to the rest of the tests. This smoke test renders
// App once so any such error fails CI instead of only surfacing in the browser.
describe("App render smoke test", () => {
  it("renders to HTML without throwing", () => {
    const html = renderToString(React.createElement(App));
    expect(html.length).toBeGreaterThan(100);
  });
});
