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

// #30 / BUG-82 interim (Session A): the Monte Carlo "Range" lens still runs the
// older blended walk (no spouse bucket at all), so it needs a caveat whenever the
// spouse has a real gap window — until the MC engine is ported to the per-account
// walk (Session B), which removes this caveat entirely.
describe("Monte Carlo Range lens — spouse-gap caveat (#30 / BUG-82 interim)", () => {
  it("no caveat at the default (single, no spouse) state", () => {
    const app = mount();
    expect(app.latest().rangeView.spouseGapCaveat).toBeNull();
    app.unmount();
  });

  it("no caveat when the spouse's retirement lands in the same calendar year as the primary's (no gap)", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    // currentAge 30, retirementAge 65 (defaults): spouse age at the primary's own
    // retirement is 20 + (65 - 30) = 55 — setting the spouse's own retirement age
    // to exactly that opens a zero-length gap window (byte generalization case).
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(55));
    expect(app.latest().rangeView.spouseGapCaveat).toBeNull();
    app.unmount();
  });

  it("shows the caveat once the spouse's own retirement age opens a real gap window WITH real income/contributions", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    // Same setup, but the spouse now retires 7 years after the primary (age 62 vs.
    // the 55 no-gap value above) — a real gap window opens.
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(62));
    const caveat = app.latest().rangeView.spouseGapCaveat;
    expect(caveat).not.toBeNull();
    expect(caveat).toContain("spouse");
    app.unmount();
  });

  it("married with no spouse retirement-age override still opens a gap for an age-gap couple WITH real income (the default 'auto' case)", () => {
    // effectiveSpouseRetAge defaults (null) to the PRIMARY's numeric retirement
    // age (65) — for a 10-year-younger spouse that is 10 years AFTER the primary
    // retires, so the gap is real even without the user touching the new slider.
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    expect(app.latest().spouseAccounts.spouseRetirementAge.value).toBe(65); // resolved "auto" value
    expect(app.latest().rangeView.spouseGapCaveat).not.toBeNull();
    app.unmount();
  });

  // Adversarial-review finding (finding 4): buildSpouseRetirementSeed writes a
  // map KEY for every gap year regardless of the dollar amount, so checking
  // key presence alone (the pre-fix formula) produced a false-positive caveat
  // for a married household with an age gap but $0 spouse income/contributions
  // — a real, if inert-looking, household (e.g. a non-working spouse).
  it("no caveat for a married age-gap household with $0 spouse income/contributions (false-positive fix)", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    // No spouseIncome, no spouseAccounts contributions set — gap window opens
    // by age math alone, but nothing flows through it.
    expect(app.latest().rangeView.spouseGapCaveat).toBeNull();
    app.unmount();
  });
});

// Finding 3 (adversarial review, 2026-07-26) — wiring gate (T-F3.4). The model-only
// fix (retirement-phase.test.js) proves the deflator works in isolation; this proves
// BOTH App.jsx call sites actually hand it a live inflationRate, not a stale default,
// so a future caller can't silently forget it (principle 13, "tests gate the wiring").
describe("inflationRate wiring into the spouse gap-year deflator (Finding 3, T-F3.4)", () => {
  it("the what-if re-seed bundle carries the live inflationRate at the default assumption", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    const infl = app.latest().assumptions.inflationRate.value;
    expect(infl).toBeGreaterThan(0);
    expect(app.latest().whatIfSimInputs.spouseSeedInputs.inflationRate).toBe(infl);
    app.unmount();
  });

  it("the bundle tracks a live change to inflationRate, not a stale snapshot", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    app.fire(() => app.latest().assumptions.inflationRate.set(6));
    expect(app.latest().whatIfSimInputs.spouseSeedInputs.inflationRate).toBe(6);
    app.unmount();
  });

  it("end-to-end: raising inflationRate lowers the retirement walk's ending balance for a spouse-gap household (proves the main-path spouseSeed, not just the what-if bundle, actually consumes it)", () => {
    // NOTE: totalAtRet is the balance AT retirement (sTrad = spouseSeed.tradSeed,
    // T-F3.6-proven inflation-invariant) — the gap-year maps only apply INSIDE the
    // retirement walk, after that point. So the observable here is the walk's
    // own endVal, not totalAtRet.
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(62));
    const lowInfl = app.latest().retirementWalk.endVal;

    app.fire(() => app.latest().assumptions.inflationRate.set(7));
    const highInfl = app.latest().retirementWalk.endVal;

    // More inflation deflates every gap-year contribution and income-floor offset
    // more, so the walk ends with a strictly lower balance — this can only move if
    // the main-path spouseSeed memo (not just the what-if resim bundle) actually
    // received the new inflationRate.
    expect(highInfl).toBeLessThan(lowInfl);
    app.unmount();
  });

  it("no spouse data ⇒ inert: the spouse-seed deflator path is never constructed regardless of inflationRate (golden master is guarded separately)", () => {
    // NOTE: endVal/totalAtRet are NOT asserted invariant here — rReal already
    // depends on inflationRate for everyone (spouse or not), pre-existing and
    // unrelated to this fix. What IS specific to this fix, and must stay inert
    // with no spouse, is that buildSpouseRetirementSeed (and its deflator) is
    // never invoked at all — spouseSeedInputs stays null no matter what
    // inflationRate is set to.
    const app = mount();
    expect(app.latest().whatIfSimInputs.spouseSeedInputs).toBeNull();
    app.fire(() => app.latest().assumptions.inflationRate.set(7));
    expect(app.latest().whatIfSimInputs.spouseSeedInputs).toBeNull();
    app.unmount();
  });
});
