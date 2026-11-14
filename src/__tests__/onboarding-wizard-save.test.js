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

// ── BUG-167 (Opus review R-4, HIGH) ──────────────────────────────────────────
// Q5 is captioned "today's dollars" and its answer is written into annualExpenses (a
// today's-dollar input), but the wizard seeded it from statementView.monthlyTotal, which
// is RETIREMENT-YEAR dollars (3.95x at the default). Clicking through untouched turned a
// plan that lasts to 88 into one that runs out at 70. And a user who did fix the number had
// the auto (null) annualExpenses frozen into a fixed value.
const Q5 = "How much to spend each month\nin retirement?";
function mountWizard() {
  captured.length = 0;
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  return renderer;
}
function walkToSummary(renderer, { beforeNextOnQ5 } = {}) {
  for (let i = 0; i < 4; i++) click(renderer.root, byText("Next →"), "Next");
  beforeNextOnQ5?.();
  click(renderer.root, byText("Build my plan →"), "Build my plan");
  click(renderer.root, byText("Save as my plan →"), "Save as my plan");
  click(renderer.root, byText("Yes, save my plan"), "confirm");
}
const lastProps = () => captured[captured.length - 1];

describe("onboarding wizard → plan (BUG-167: the spend question's basis)", () => {
  it("seeds Q5 with the TODAY's-dollar monthly figure, not the retirement-year one", () => {
    const r = mountWizard();
    const sv = lastProps().statementView;
    expect(sv.monthlyTotal).not.toBe(sv.monthlyTodaysExp); // the two bases genuinely differ
    for (let i = 0; i < 4; i++) click(r.root, byText("Next →"), "Next");
    const input = r.root.findAll(n => n.type === "input")[0];
    const shown = input.props.value;
    expect(shown.replace(/[^0-9]/g, "")).toBe(String(sv.monthlyTodaysExp));
    act(() => r.unmount());
  });

  it("completing the wizard with nothing changed leaves the plan unchanged", () => {
    const r = mountWizard();
    const before = { e: lastProps().effectiveExpenses, y: lastProps().yearsSustained,
                     wr: lastProps().withdrawalRate };
    walkToSummary(r);
    expect(lastProps().effectiveExpenses).toBe(before.e);
    expect(lastProps().yearsSustained).toBe(before.y);
    expect(lastProps().withdrawalRate).toBe(before.wr);
    act(() => r.unmount());
  });

  it("an untouched spend answer keeps annualExpenses on auto (follows income)", () => {
    const r = mountWizard();
    walkToSummary(r);
    // auto spending follows income; a frozen annualExpenses would not.
    const e0 = lastProps().effectiveExpenses;
    act(() => { lastProps().profile.currentIncome.set(250_000); });
    expect(lastProps().effectiveExpenses).toBeGreaterThan(e0);
    act(() => r.unmount());
  });

  it("a CHANGED spend answer lands in today's dollars", () => {
    const r = mountWizard();
    walkToSummary(r, { beforeNextOnQ5: () => {
      for (let i = 0; i < 5; i++) click(r.root, byAria(`increase ${Q5}`), "increase spend");
    } });
    const sv0 = Math.round(captured[0].effectiveExpenses / 12);
    // 5 steps of $100/mo on top of the seeded monthly figure, written x12 into annualExpenses.
    expect(lastProps().effectiveExpenses).toBe((sv0 + 500) * 12);
    act(() => r.unmount());
  });
});

// ── BUG-171 (Opus review R-5): the wizard's typed-answer parse ────────────────────────────
// It stripped every non-digit, so typing "250k" stored $250. Drives the real input's
// focus/change/blur like a person typing.
function typeInto(renderer, text) {
  const input = renderer.root.findAll(n => n.type === "input")[0];
  act(() => input.props.onFocus());
  act(() => renderer.root.findAll(n => n.type === "input")[0].props.onChange({ target: { value: text } }));
  act(() => renderer.root.findAll(n => n.type === "input")[0].props.onBlur());
}
describe("onboarding wizard → typed savings answer (BUG-171)", () => {
  const run = (text) => {
    const r = mountWizard();
    for (let i = 0; i < 2; i++) click(r.root, byText("Next →"), "Next");   // to Q3, savings
    typeInto(r, text);
    for (let i = 0; i < 2; i++) click(r.root, byText("Next →"), "Next");   // Q4, Q5
    click(r.root, byText("Build my plan →"), "Build my plan");
    click(r.root, byText("Save as my plan →"), "Save as my plan");
    click(r.root, byText("Yes, save my plan"), "confirm");
    const saved = lastProps().currentTotalSaved;
    act(() => r.unmount());
    return saved;
  };
  it('"250k" is $250,000', () => { expect(run("250k")).toBe(250_000); });
  it('"1.5M" is $1,500,000', () => { expect(run("1.5M")).toBe(1_500_000); });
  it('"$900,000.75" is $900,001, not $90,000,075', () => { expect(run("$900,000.75")).toBe(900_001); });
  it("unparseable text keeps the previous answer", () => {
    const r = mountWizard();
    const before = lastProps().currentTotalSaved;
    for (let i = 0; i < 2; i++) click(r.root, byText("Next →"), "Next");
    typeInto(r, "lots");
    for (let i = 0; i < 2; i++) click(r.root, byText("Next →"), "Next");
    click(r.root, byText("Build my plan →"), "Build my plan");
    click(r.root, byText("Save as my plan →"), "Save as my plan");
    click(r.root, byText("Yes, save my plan"), "confirm");
    expect(lastProps().currentTotalSaved).toBe(before);
    act(() => r.unmount());
  });
});
