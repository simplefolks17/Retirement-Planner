import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// ── Unit-contract invariant (SPOUSAL-ENGINE-STABILIZATION-PLAN.md, §2 step 2)
//
// The retirement engine (buildRetirementWalkByAccount / retirement-engine.js)
// grows every account at `rReal = (1+returnRate/100)/(1+inflationRate/100) - 1`
// — a REAL rate. BUG-90's own derivation proves what that means for the
// engine's balance UNIT: a seed grown at rReal for k years equals the nominal
// balance in that later year, deflated by (1+inflationRate/100)^k — i.e. the
// engine's whole walk is denominated in the PRIMARY's RETIREMENT-YEAR
// purchasing power, not today's.
//
// Every quantity fed into the walk's spending/income floor must therefore
// ALREADY be expressed in that same unit. A quantity the user enters in
// TODAY's dollars (their current living spend, a pension quoted in today's
// terms) must first be inflated FORWARD to the retirement year — by the exact
// factor (1+inflationRate/100)^(retirementAge-currentAge) — before it can be
// compared against, or subtracted from, a balance the engine is walking in
// retirement-year dollars. That conversion is the "unit contract" this file
// asserts; BUG-91 is that App.jsx does not perform it (effectiveExpenses and
// effectivePension are both passed through flat, at their as-entered,
// today's-dollar value).
//
// This file is deliberately RED against the current implementation, using
// `it.fails` so `npm test` stays green while the contract is documented and
// checked mechanically rather than only in a docs/BUGS.md paragraph. Per the
// stabilization plan, this must exist and be understood BEFORE BUG-91's fix
// (step 3) lands. Once that fix ships, each `it.fails` below must be flipped
// to a plain `it` — if the assertion doesn't pass at that point, the fix is
// incomplete, not the test wrong.

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

// The forward conversion the contract requires: a today's-dollar amount,
// carried forward to what it becomes in the primary's retirement year at the
// plan's own inflation assumption.
const toRetirementYearDollars = (todaysDollarAmount, inflationRate, yearsToRetirement) =>
  todaysDollarAmount * Math.pow(1 + inflationRate / 100, yearsToRetirement);

describe("unit contract — every quantity entering the retirement walk is retirement-year real dollars", () => {
  // it.fails: CURRENTLY effectiveExpenses is passed through unchanged from
  // effectiveLiving (App.jsx: `effectiveExpenses = annualExpenses ?? effectiveLiving`)
  // with no inflation compounding at all — the bug verbatim (BUG-91).
  it.fails("the spend basis fed to the engine is today's living spend inflated to the retirement year, not the flat today's-dollar figure", () => {
    const app = mount();
    const latest = app.latest();
    const { currentAge, retirementAge } = latest;
    const inflationRate = latest.assumptions.inflationRate.value;
    const todaysDollarSpend = latest.effectiveExpenses; // as entered/derived, today's dollars

    const expectedRetirementYearSpend =
      toRetirementYearDollars(todaysDollarSpend, inflationRate, retirementAge - currentAge);

    // The contract: what actually reaches the engine (also `latest.effectiveExpenses`
    // today, since no conversion exists yet) must match the retirement-year figure.
    expect(latest.effectiveExpenses).toBeCloseTo(expectedRetirementYearSpend, 0);
    app.unmount();
  });

  // it.fails: CURRENTLY effectivePension = pensionMonthly * 12 (retirement-income.js),
  // a flat today's-dollar figure with no compounding either.
  it.fails("the pension amount fed to the engine is today's pension quote inflated to the retirement year, not the flat today's-dollar figure", () => {
    const app = mount();
    app.fire(() => app.latest().pension.pensionMonthly.set(2_000));
    app.fire(() => app.latest().pension.pensionStartAge.set(65));
    const latest = app.latest();
    const { currentAge, retirementAge } = latest;
    const inflationRate = latest.assumptions.inflationRate.value;
    const todaysDollarPension = 2_000 * 12;

    const expectedRetirementYearPension =
      toRetirementYearDollars(todaysDollarPension, inflationRate, retirementAge - currentAge);

    expect(latest.effectivePension).toBeCloseTo(expectedRetirementYearPension, 0);
    app.unmount();
  });
});
