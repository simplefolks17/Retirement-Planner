import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// ── Why this test exists (BUG-152, oversight audit 2026-11-14) ────────────────
// The wizard asked "How much have you saved so far?", echoed the answer back as
// "Savings today", then never sent it: the bug lived in HorizonShell's handleSave,
// not in commitPlan. onboarding-coupling-wiring.test.js calls commitPlan directly
// with HorizonShell mocked away, so deleting `totalSaved: vals.totalSaved` from
// handleSave left all 1,427 tests green (verified). This test drives the REAL wizard
// end to end through its own controls and reads the result off the props the real
// shell receives, so the answer has to make the whole trip.

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

const captured = [];
vi.mock("../components/HorizonShell.jsx", async (importOriginal) => {
  const mod = await importOriginal();
  const Real = mod.default;
  return { ...mod, default: (props) => { captured.push(props); return React.createElement(Real, props); } };
});
import App from "../App.jsx";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { innerWidth: 1200, addEventListener: () => {}, removeEventListener: () => {} };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => {
  delete globalThis.window;
  delete globalThis.ResizeObserver;
});

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}
function click(root, pred, what) {
  const target = root.findAll(n => typeof n.props?.onClick === "function" && pred(n))[0];
  expect(target, `clickable "${what}" not found`).toBeTruthy();
  act(() => { target.props.onClick(); });
}
const byText = (label) => (n) => textOf(n) === label;
const byAria = (label) => (n) => n.props?.["aria-label"] === label;

describe("onboarding wizard → plan (BUG-152)", () => {
  it("the savings answer entered in the wizard reaches the model", () => {
    captured.length = 0;
    let renderer;
    act(() => { renderer = create(React.createElement(App)); });
    const before = captured[captured.length - 1].currentTotalSaved;

    // Q1 age, Q2 income → advance to Q3 ("How much have you saved so far?").
    click(renderer.root, byText("Next →"), "Next");
    click(renderer.root, byText("Next →"), "Next");
    // Ten +$10,000 steps on the savings question.
    for (let i = 0; i < 10; i++) {
      click(renderer.root, byAria("increase How much have you saved so far?"), "increase savings");
    }
    // Q4 retirement age, Q5 monthly spend → summary → save → confirm.
    click(renderer.root, byText("Next →"), "Next");
    click(renderer.root, byText("Next →"), "Next");
    click(renderer.root, byText("Build my plan →"), "Build my plan");
    click(renderer.root, byText("Save as my plan →"), "Save as my plan");
    click(renderer.root, byText("Yes, save my plan"), "confirm");

    const after = captured[captured.length - 1].currentTotalSaved;
    expect(after).toBe(before + 100_000);
    act(() => renderer.unmount());
  });
});
