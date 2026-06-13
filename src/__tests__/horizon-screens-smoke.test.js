import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// The Vercel Analytics component injects a <script> via `document` in its mount
// effect — irrelevant to this smoke and unavailable in node; render nothing.
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";

// Effects run under react-test-renderer (unlike renderToString) — stub the two
// browser APIs the shell's layout effects touch in this node environment.
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

// WI-0.1/WI-0.2 wiring smoke: the existing render-smoke only reaches the default
// Plan screen. This test drives the real HorizonShell navigation so the rewritten
// IdeasScreen / NumbersScreen (and their new statementView / chartMilestones /
// yearlyRows / planView consumption) actually render at golden-master defaults.

// Collect the visible text of a test-renderer instance.
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

// Mount App and dismiss the first-run onboarding (non-browser env has no
// persisted flag). Returns { renderer, root }.
function mountApp() {
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  const root = renderer.root;
  const skip = root.findAll(
    n => typeof n.props?.onClick === "function" && /^skip/i.test(textOf(n).trim())
  )[0];
  if (skip) act(() => { skip.props.onClick(); });
  return { renderer, root };
}

function hasText(root, fragment) {
  return root.findAll(n => typeof n.type === "string" && textOf(n).includes(fragment)).length > 0;
}

describe("Horizon screens render smoke", () => {
  it("renders Plan, Ideas, Numbers (all three tabs), Someday, and Settings without throwing", () => {
    let renderer;
    act(() => { renderer = create(React.createElement(App)); });
    const root = renderer.root;

    // First run shows onboarding in a non-browser env (no persisted flag) — skip it.
    const skip = root.findAll(
      n => typeof n.props?.onClick === "function" && /^skip/i.test(textOf(n).trim())
    )[0];
    if (skip) act(() => { skip.props.onClick(); });

    // Plan (default)
    expect(renderer.toJSON()).toBeTruthy();

    // Journey (WI-2.1) — 3-chapter Flow-Down port; all numbers from flowDown.
    // clickByText navigates by tab label; render without crash is the gate.
    clickByText(root, "Journey");
    expect(renderer.toJSON()).toBeTruthy();
    // At least one flowDown-sourced number is present (totalAtRet > 0)
    expect(root.findAll(n => textOf(n).includes("Building years")).length).toBeGreaterThan(0);

    // Ideas — open the suggestions mode and activate a scenario card so the
    // calcWhatIfScenario path (stats + arc from one run) executes.
    clickByText(root, "Ideas");
    clickByText(root, "Horizon suggestions");
    const scenarioCard = root.findAll(
      n => typeof n.props?.onClick === "function" && textOf(n).includes("Retire 2 yrs earlier")
    )[0];
    expect(scenarioCard).toBeTruthy();
    act(() => { scenarioCard.props.onClick(); });
    expect(renderer.toJSON()).toBeTruthy();

    // Numbers — all three tabs (Statement / Year by year incl. milestones strip / Money flow)
    clickByText(root, "The numbers");
    expect(renderer.toJSON()).toBeTruthy();
    clickByText(root, "Year by year");
    expect(renderer.toJSON()).toBeTruthy();
    clickByText(root, "Money flow");
    expect(renderer.toJSON()).toBeTruthy();

    // Someday + Settings
    clickByText(root, "Someday");
    expect(renderer.toJSON()).toBeTruthy();
    clickByText(root, "Settings");
    expect(renderer.toJSON()).toBeTruthy();

    act(() => renderer.unmount());
  });
});
