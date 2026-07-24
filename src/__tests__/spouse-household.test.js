import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { runSimulation } from "../model/simulation.js";
import { calcEmployerMatch } from "../model/employer-match.js";
import { HSA_LIMIT_2026, HSA_FAMILY_LIMIT_2026 } from "../config/irs-2026.js";

// ── #30 spouse account modeling — household integration ───────────────────────
// The engine + accumulation slices are unit-tested in retirement-engine.test.js /
// simulation.test.js. This file covers the two HOUSEHOLD-level properties the App
// wiring relies on: (1) adding spouse balances raises the household totalAtRet the
// screens display (aggregation sanity), and (2) the HSA family HDHP limit is a
// SHARED household ceiling — primary + spouse realized HSA contributions can never
// exceed it (rule 4).

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

describe("household aggregation (#30)", () => {
  it("adding spouse accounts raises household totalAtRet and shows the spouse card", () => {
    const app = mount();
    const baseTotal = app.latest().totalAtRet;
    // Spouse card is hidden and totals are primary-only at the default (single) state.
    expect(app.latest().spouseAccountsApplicable).toBe(false);

    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(500_000));
    app.fire(() => app.latest().spouseAccounts.roth.bal.set(100_000));

    // Applicability flips on; household totalAtRet now includes the (grown) spouse balances.
    expect(app.latest().spouseAccountsApplicable).toBe(true);
    expect(app.latest().totalAtRet).toBeGreaterThan(baseTotal + 500_000);
    // retVals (the displayed household cards) reconcile to the household headline.
    const rv = app.latest().retVals;
    const cardSum = rv["Trad 401k"] + rv["Roth IRA"] + rv["Taxable"] + rv["HSA"];
    expect(Math.abs(cardSum - app.latest().totalAtRet)).toBeLessThan(1);
    app.unmount();
  });

  it("no golden-master drift: totalAtRet unchanged while spouse data stays at defaults", () => {
    const app = mount();
    const before = app.latest().totalAtRet;
    // Toggling married alone (no spouse income/balances) must not change household totals.
    app.fire(() => app.latest().ss.isMarried.set(true));
    expect(app.latest().totalAtRet).toBe(before);
    app.unmount();
  });

  // BUG-81 (found by adversarial spousal-scenario audit, 2026-07-20): entering
  // spouse ACCOUNT balances (the #30 entry point) with filingStatus still
  // "single" and no spouse income used to raise no guardrail at all — the
  // household RMD/tax math still sums both accounts under single-filer
  // brackets. The pre-existing #16 guardrail only checked spouseIncome > 0.
  it("entering spouse account balances alone (no spouse income) surfaces the filing-status guardrail", () => {
    const app = mount();
    expect(app.latest().spouseFilingMismatch).toBe(false); // default: no spouse data
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(500_000));
    // spouseIncome is still 0 and filingStatus is still "single" — the OLD
    // guardrail condition (spouseIncome > 0) would stay false here.
    expect(app.latest().spouseFilingMismatch).toBe(true);
    app.unmount();
  });

  it("filing status MFJ never trips the guardrail even with spouse accounts entered", () => {
    const app = mount();
    app.fire(() => app.latest().profile.filingStatus.set("mfj"));
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(500_000));
    expect(app.latest().spouseFilingMismatch).toBe(false);
    app.unmount();
  });
});

describe("HSA family-HDHP shared ceiling (#30, rule 4)", () => {
  // Mirrors App's split: under 'family' the household shares HSA_FAMILY_LIMIT_2026,
  // primary draws first, spouse gets the remainder; under 'self' each keeps the
  // self-only cap. The property under test is that realized contributions never
  // exceed the ceiling, verified by running BOTH sims with the split limits.
  const realizedHSA = (contribHSA, hsaLimit) => {
    const rows = runSimulation({
      totalYears: 1, currentAge: 40, currentIncome: 120_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 0,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA,
      contribEnd401k: 70, contribEndRoth: 70, contribEndTaxable: 70, contribEndHSA: 70,
      calcEmployerMatchFn: (s, e) => calcEmployerMatch(s, e, { matchMode: "flat", employerMatchPct: 0, matchFormulaCap: 0, matchFormulaRate: 0 }),
      hsaLimit,
    });
    return rows[0].cHSA;
  };

  it("under FAMILY coverage, primary + spouse HSA never exceed the family limit", () => {
    for (const [pWant, sWant] of [[8_000, 8_000], [4_000, 6_000], [10_000, 0], [3_000, 3_000]]) {
      const primaryHsaLimit = HSA_FAMILY_LIMIT_2026;
      const spouseHsaLimit  = Math.max(0, HSA_FAMILY_LIMIT_2026 - Math.min(pWant, HSA_FAMILY_LIMIT_2026));
      const pReal = realizedHSA(pWant, primaryHsaLimit);
      const sReal = realizedHSA(sWant, spouseHsaLimit);
      expect(pReal + sReal).toBeLessThanOrEqual(HSA_FAMILY_LIMIT_2026);
    }
  });

  it("under SELF coverage, each person is capped at the self-only limit", () => {
    expect(realizedHSA(99_999, HSA_LIMIT_2026)).toBe(HSA_LIMIT_2026);
  });
});
