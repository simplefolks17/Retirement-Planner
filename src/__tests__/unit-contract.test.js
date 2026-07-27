import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { toRetirementYearDollars } from "../model/finance-math.js";

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
// asserts.
//
// IMPORTANT (revised after the BUG-91 fix-plan audit, 2026-07-27): the first
// version of this file probed `latest.effectiveExpenses`/`latest.effectivePension`
// — the raw DISPLAY passthrough fields (App.jsx horizonProps). BUG-91's fix
// deliberately leaves those raw (today's dollars) — they feed the Statement/
// Budget tabs and the Income Meter's "% of today's take-home" comparison,
// which are legitimately about TODAY's dollars, not the engine's frame. So
// probing them can never distinguish "fixed" from "not fixed" — the contract
// has to be checked against an ENGINE-DERIVED quantity instead. withdrawalRate
// (= netPortfolioNeed / totalAtRet * 100) is exposed on horizonProps and is
// exactly netPortfolioNeed's own basis — at the default state (SS not yet
// claimed, no spouse) netPortfolioNeed reduces to retSpendBasis (spend only)
// or retSpendBasis − retPensionBasis (spend + pension), so it's a direct,
// already-exposed probe of the engine-facing conversion without needing any
// new horizonProps field just for this test.
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

// Imports the REAL conversion (finance-math.js) rather than reimplementing it
// here — a test asserting App.jsx's wiring against a hand-copied formula could
// drift from the production formula and stop meaning anything (test-quality
// review finding, PR #62 review-fix round).

// NOTE on scope: this probes the SPEND and PENSION basis via withdrawalRate —
// it does NOT cover SS's conversion (SS is deliberately excluded from this
// conversion by BUG-91's own scoping — already nominal at the claim date) or
// the spouse gap-year maps' conversion (covered separately, by BUG-90's own
// tests in spouse-household.test.js). A future engine-facing call site added
// without threading it through toRetirementYearDollars would NOT necessarily
// be caught here unless it also flows through withdrawalRate.
describe("unit contract — the spend/pension basis feeding the retirement walk is retirement-year real dollars", () => {
  it("the spend basis feeding withdrawalRate is today's living spend inflated to the retirement year, not the flat today's-dollar figure", () => {
    const app = mount();
    const latest = app.latest();
    const { currentAge, retirementAge, totalAtRet } = latest;
    const inflationRate = latest.assumptions.inflationRate.value;
    const todaysDollarSpend = latest.effectiveExpenses; // as entered/derived, today's dollars — the DISPLAY value, deliberately left raw

    // Default state: SS claims after retirement (ssAtRet = 0) and there's no
    // pension, so netPortfolioNeed reduces to exactly the converted spend —
    // making withdrawalRate a direct probe of retSpendBasis / totalAtRet.
    const expectedRetirementYearSpend =
      toRetirementYearDollars(todaysDollarSpend, inflationRate, retirementAge - currentAge);
    const expectedWithdrawalRate = (expectedRetirementYearSpend / totalAtRet) * 100;

    expect(latest.withdrawalRate).toBeCloseTo(expectedWithdrawalRate, 6);
    // And the DISPLAY value itself must stay raw (today's dollars) — it's a
    // legitimately different quantity from what feeds the engine (rule 10 /
    // BUG-91's own scope decision), not a second copy of the same bug.
    expect(latest.effectiveExpenses).toBe(todaysDollarSpend);
    app.unmount();
  });

  it("the pension amount feeding withdrawalRate is today's pension quote inflated to the retirement year, not the flat today's-dollar figure", () => {
    const app = mount();
    app.fire(() => app.latest().pension.pensionMonthly.set(2_000));
    app.fire(() => app.latest().pension.pensionStartAge.set(65));
    const latest = app.latest();
    const { currentAge, retirementAge, totalAtRet } = latest;
    const inflationRate = latest.assumptions.inflationRate.value;
    const todaysDollarSpend = latest.effectiveExpenses;
    const todaysDollarPension = 2_000 * 12;

    const yearsToRet = retirementAge - currentAge;
    const expectedRetirementYearSpend = toRetirementYearDollars(todaysDollarSpend, inflationRate, yearsToRet);
    const expectedRetirementYearPension = toRetirementYearDollars(todaysDollarPension, inflationRate, yearsToRet);
    // Default state still has ssAtRet = 0 (claims after retirement) — pension
    // starts AT retirement (65 <= 65), so netPortfolioNeed = spend - pension.
    const expectedWithdrawalRate =
      ((expectedRetirementYearSpend - expectedRetirementYearPension) / totalAtRet) * 100;

    expect(latest.withdrawalRate).toBeCloseTo(expectedWithdrawalRate, 6);
    app.unmount();
  });

  it("no-op at 0 years to retirement (already retired) — the conversion factor is exactly 1 regardless of inflationRate", () => {
    const app = mount();
    app.fire(() => app.latest().assumptions.retirementAge.set(app.latest().currentAge));
    app.fire(() => app.latest().assumptions.inflationRate.set(7));
    const latest = app.latest();

    // yearsToRetirement = 0 ⇒ retSpendBasis === effectiveExpenses exactly (no
    // inflation compounding applies) — the contract's own base case.
    const expectedWithdrawalRate = (latest.effectiveExpenses / latest.totalAtRet) * 100;
    expect(latest.withdrawalRate).toBeCloseTo(expectedWithdrawalRate, 6);
    app.unmount();
  });
});
