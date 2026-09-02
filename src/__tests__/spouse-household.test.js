import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { runSimulation } from "../model/simulation.js";
import { calcWhatIfScenario } from "../model/what-if.js";
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

// #30 / BUG-82 interim (Session A) shipped a `rangeView.spouseGapCaveat` field
// because the Range lens ran an older, spouse-blind walk. Session B (Monte
// Carlo engine port) retired the mechanism entirely — the lens now walks
// through the SAME per-account engine (spouse bucket, hold-out, spillover all
// included) as every other headline number, so there is no second walk left
// for a spouse household's outlook to silently disagree with. This describe
// block (and its five caveat-firing-condition tests) is retired along with it;
// see the BUG-93/94 describe block below for the caveat's engine-observable
// successor test.
describe("Monte Carlo Range lens — spouse bucket visible, no separate caveat mechanism (Session B)", () => {
  it("the rangeView bundle no longer carries a spouseGapCaveat field at all (retired, not just silenced)", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(62));
    expect(app.latest().rangeView.spouseGapCaveat).toBeUndefined();
    app.unmount();
  });

  it("a spouse-gap household still produces a well-formed Range lens (populated bands, a real successPct)", () => {
    const app = mount();
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(62));
    const rv = app.latest().rangeView;
    expect(rv.series.length).toBeGreaterThan(0);
    expect(rv.successPct).not.toBeNull();
    expect(rv.successPct).toBeGreaterThanOrEqual(0);
    expect(rv.successPct).toBeLessThanOrEqual(100);
    app.unmount();
  });
});

// BUG-93 + BUG-94 (found 2026-07-26, independently by the adversarial-
// correctness and interoperability review agents; fixed 2026-07-27, spousal-
// engine stabilization session). Root cause shared by both: hasSpouse was
// used as a proxy for "the spouse is a separate, still-working person with
// their own timeline," gating the engine's Option-A hold-out (and therefore
// its penalized escape hatch) on hasSpouse + a finite spouseRetirementAge
// alone — never checking whether the spouse actually has any income or
// contributions flowing through the gap window. A pure rollover balance (no
// ongoing spouse income) was walled out of the drawable pool and could force
// the 10%-penalty escape hatch for money that was never actually locked up.
// Fixed by gating spouseRetirementAge on hasActiveSpouseGap (the SAME real-
// income check the Range-lens caveat already used) instead of hasSpouse — one
// condition now governs both the engine's hold-out and the caveat's firing,
// so they can no longer disagree (closing BUG-94 as a side effect of BUG-93's
// own fix, exactly as docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md's step 4
// anticipated).
describe("BUG-93/94 — Option-A hold-out gated on real spouse income, not just hasSpouse", () => {
  // Mirrors BUG-93's own measured repro: primary retires 65 on a modest
  // portfolio (forcing genuine depletion stress), spouse holds a large
  // Traditional 401k with a real age gap but ZERO income/contributions (a
  // pure rollover). Verified (2026-07-27) against the PRE-fix condition
  // (hasSpouse-gated) that this exact fixture produces a nonzero
  // totalSpouseSpillover ($4,783 at age 71) — this is not a hypothetical.
  function buildRolloverOnlyHousehold() {
    const app = mount();
    app.fire(() => app.latest().assumptions.currentAge.set(55));
    app.fire(() => app.latest().assumptions.retirementAge.set(65));
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(45)); // spouse 55 at primary's retirement
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(62)); // a real 7-yr gap window
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(600_000));
    // spouseIncome stays at its 0 default — no income, no contributions.
    app.fire(() => app.latest().accounts.trad401k.bal.set(100_000));
    app.fire(() => app.latest().accounts.roth.bal.set(0));
    app.fire(() => app.latest().accounts.taxable.bal.set(0));
    app.fire(() => app.latest().spending.annualExpenses.set(60_000));
    app.fire(() => app.latest().ss.includeSS.set(false));
    return app;
  }

  it("a spouse's pure rollover balance (no income) is never walled off — the escape hatch never fires, even under genuine depletion stress", () => {
    const app = buildRolloverOnlyHousehold();
    const rw = app.latest().retirementWalk;
    // The PRIMARY's own portfolio still genuinely depletes in this stressed
    // fixture (proving the scenario is real stress, not a trivially-easy
    // household) — but the spouse's rollover balance, having no ongoing
    // income, was never held out in the first place, so there is nothing to
    // "escape" from and the penalized hatch never fires.
    expect(rw.depletionAge).not.toBeNull();
    expect(rw.totalSpouseSpillover).toBe(0);
    expect(rw.totalSpouseSpilloverTax).toBe(0);
    expect(rw.firstSpouseSpilloverAge).toBeNull();
    app.unmount();
  });

  // BUG-94's engine-observable successor (Session B): before the fix, the
  // engine (hasSpouse-gated) walled the balance off and could force the
  // escape hatch while the interim caveat (already hasActiveSpouseGap-gated)
  // stayed null — a direct contradiction between two SEPARATE walks. The
  // Monte Carlo port removed the second walk entirely, so this class of
  // contradiction is now structurally impossible: the Range lens reads the
  // SAME retPhaseBase (and therefore the SAME spillover behavior) as
  // retirementWalk, not a second, spouse-blind model.
  it("Range lens and retirementWalk can no longer disagree — same engine bundle, pure-rollover household pools normally in both", () => {
    const app = buildRolloverOnlyHousehold();
    const latest = app.latest();
    expect(latest.retirementWalk.totalSpouseSpillover).toBe(0);
    expect(latest.rangeView.series.length).toBeGreaterThan(0);
    expect(latest.rangeView.successPct).not.toBeNull();
    // The old caveat mechanism is retired outright, not merely non-firing.
    expect(latest.rangeView.spouseGapCaveat).toBeUndefined();
    app.unmount();
  });

  it("a spouse with REAL gap-year income still gets Option A exactly as before (hasActiveSpouseGap true) — the Range lens stays well-formed for it, reading the same engine", () => {
    const app = buildRolloverOnlyHousehold();
    app.fire(() => app.latest().profile.spouseIncome.set(60_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    const latest = app.latest();
    // Real income flowing through the gap window ⇒ hasActiveSpouseGap true ⇒
    // Option A hold-out is genuinely active for this household (unit-tested at
    // the engine level in retirement-engine.test.js's T2.x block). There is no
    // longer a second, spouse-blind walk for the Range lens to disagree with.
    expect(latest.rangeView.series.length).toBeGreaterThan(0);
    expect(latest.rangeView.successPct).not.toBeNull();
    expect(latest.rangeView.spouseGapCaveat).toBeUndefined();
    app.unmount();
  });
});

// BUG-127 (final adversarial review of PR #66) — a scenario's spouse retirement age
// was frozen at the BASE plan's resolved value (App.jsx's effectiveSpouseRetAge),
// so a "work longer" scenario re-seeded the spouse's accounts via
// buildSpouseRetirementSeed with the SCENARIO's own (later) primaryRetAge but the
// BASE plan's spouseRetAge — silently shrinking, then deleting, the spouse's
// gap-year income window as the offset grew, instead of extending it. Fixed by
// resolving the spouse's retirement age from the RAW spouseRetirementAge input
// against each caller's OWN primary age (resolveSpouseRetAge, retirement-phase.js;
// retirement-phase.test.js unit-tests the resolver itself). Repro verified live
// (2026-08 review) at exactly this fixture: pre-fix, calcWorkLongerBreakEven
// reported depletion ages 86 / 82 / 78 for +1 / +3 / +5 years worked — MONOTONICALLY
// WORSE — while directly retiring at 58 made the plan sustainable outright.
describe("BUG-127 — work-longer scenarios resolve the spouse's own retirement age against the scenario's own age, not the frozen base value", () => {
  function buildGapHousehold() {
    const app = mount();
    app.fire(() => app.latest().profile.filingStatus.set("mfj"));
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(22));
    app.fire(() => app.latest().profile.spouseIncome.set(500_000));
    app.fire(() => app.latest().spending.annualExpenses.set(120_000));
    app.fire(() => app.latest().assumptions.retirementAge.set(55));
    // spouseAccounts.spouseRetirementAge stays at its default (null / "auto") —
    // the exact case this bug corrupted.
    return app;
  }

  it("calcWorkLongerBreakEven's rows are monotone: a later retirement age never reduces the depletion age (repro fixture)", () => {
    const app = buildGapHousehold();
    const wl = app.latest().workLongerView;
    expect(wl).not.toBeNull();
    const rows = [...wl.rows].sort((a, b) => a.years - b.years);
    expect(rows.map(r => r.years)).toEqual([1, 3, 5]);
    // A sustainable row (never depletes) ranks above any finite depletion age.
    const rank = (r) => (r.sustainable ? Infinity : r.depletionAge);
    for (let i = 1; i < rows.length; i++) {
      expect(rank(rows[i])).toBeGreaterThanOrEqual(rank(rows[i - 1]));
    }
    // The task's own verified repro: +5 years covers the whole plan horizon.
    expect(rows.find(r => r.years === 5).coversPlan).toBe(true);
    app.unmount();
  });

  it("directly retiring at 58 (not a what-if scenario) is sustainable — the base-plan path this scenario path must agree with", () => {
    const app = buildGapHousehold();
    app.fire(() => app.latest().assumptions.retirementAge.set(58));
    const plan = app.latest().planView;
    expect(plan.outlastsPlan).toBe(true);
    expect(plan.depletionAge).toBeNull();
    app.unmount();
  });

  // BUG-134 (CodeRabbit, final pre-merge review of PR #66) — BUG-127's OWN
  // regression, caught before merge. BUG-127 rebuilt the scenario's spouse SEED
  // and gap-year MAPS at the scenario's retirement age, but buildRetirementPhase
  // still received `spouseRetirementAge` from the `...retPhaseBase` spread — the
  // BASE plan's value. The engine reads that field for its Option-A hold-out
  // (retirement-engine.js, `spouseHoldout`), so with a raw null ("auto") spouse
  // age the walk RELEASED the spouse's Traditional bucket into the drawable pool
  // at the BASE retirement age while the SAME walk still had them working and
  // contributing up to the SCENARIO age.
  //
  // Measured on the fixture below (primary lean, spouse holding the household's
  // real money, so the walk must reach for that bucket during the gap):
  //   pre-fix  scenario ret 55 / 58 / 62 → totalSpouseSpillover 0 / 0 / 0
  //   post-fix                           → 982,500 / 1,120,964 / 926,336
  // Pre-fix the bucket was drained silently and WITHOUT the early-withdrawal
  // penalty the hold-out exists to charge, so those scenarios also reported
  // MORE sustained years than they had earned — the optimistic bias this pins.
  describe("BUG-134 — the scenario's spouse hold-out gate moves with its seed", () => {
    function buildHoldoutBindingHousehold() {
      const app = mount();
      app.fire(() => app.latest().profile.filingStatus.set("mfj"));
      app.fire(() => app.latest().ss.isMarried.set(true));
      app.fire(() => app.latest().ss.spouseCurrentAge.set(22));
      app.fire(() => app.latest().profile.spouseIncome.set(60_000));
      app.fire(() => app.latest().spending.annualExpenses.set(150_000));
      app.fire(() => app.latest().assumptions.retirementAge.set(52));
      app.fire(() => app.latest().accounts.trad401k.bal.set(50_000));
      app.fire(() => app.latest().accounts.roth.bal.set(0));
      app.fire(() => app.latest().accounts.taxable.bal.set(0));
      app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(900_000));
      // spouseRetirementAge stays null ("auto") — the case the bug corrupted.
      return app;
    }

    it("a work-longer scenario still holds the spouse's 401k out of the pool, charging spillover instead of draining it silently", () => {
      const app = buildHoldoutBindingHousehold();
      const bundle = app.latest().whatIfSimInputs;
      for (const retAge of [55, 58, 62]) {
        const scen = calcWhatIfScenario(bundle, { retirementAge: retAge });
        expect(scen).not.toBeNull();
        // The hold-out is active, so any reach into the spouse bucket is
        // recorded (and penalised) as spillover. Pre-fix this was exactly 0 —
        // the gate had already released the bucket at the base age of 52.
        expect(scen.totalSpouseSpillover).toBeGreaterThan(0);
      }
      app.unmount();
    });

    it("the base plan's own spillover is unaffected — only the SCENARIO path changed", () => {
      const app = buildHoldoutBindingHousehold();
      // Directly committing the later retirement age exercises the base-plan
      // path, which was already correct; this pins that the fix didn't move it.
      app.fire(() => app.latest().assumptions.retirementAge.set(58));
      expect(app.latest().retirementWalk).toBeTruthy();
      expect(app.latest().planView.depletionAge).toBeGreaterThan(58);
      app.unmount();
    });
  });

  it("the what-if bundle carries the RAW spouseRetirementAge (null) and lifeExp, not a pre-resolved age — the contract resolveSpouseRetAge needs", () => {
    const app = buildGapHousehold();
    const inputs = app.latest().whatIfSimInputs.spouseSeedInputs;
    expect(inputs).not.toBeNull();
    expect(inputs.spouseRetirementAge).toBeNull();
    expect(inputs.lifeExp).toBe(app.latest().assumptions.lifeExpect.value);
    app.unmount();
  });

  it("the BASE plan's own resolved spouse retirement age is unaffected by this fix (still tracks the base retirementAge exactly)", () => {
    const app = buildGapHousehold();
    expect(app.latest().spouseAccounts.spouseRetirementAge.value).toBe(55);
    app.fire(() => app.latest().assumptions.retirementAge.set(58));
    expect(app.latest().spouseAccounts.spouseRetirementAge.value).toBe(58);
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
    // BUG-91: effectiveExpenses is now converted to retirement-year dollars
    // using a factor of (1+inflationRate)^(retirementAge-currentAge) — so
    // changing inflationRate at the DEFAULT 35-year gap would ALSO rescale the
    // entire required spend (a second, much larger effect this test isn't
    // about), and at inflationRate=7 vs. the default returnRate=5 the walk's
    // real return (rReal) goes negative, guaranteeing eventual depletion over
    // the 130-year longevity horizon regardless of spend size — collapsing
    // the comparison to a degenerate 0-vs-0. Retiring IMMEDIATELY
    // (retirementAge = currentAge) makes yearsToRetForBasis exactly 0, so
    // retSpendBasis is invariant to inflationRate — isolating the effect this
    // test is actually about (the spouse gap-year deflator) — and a large
    // balance + modest spend + a small inflation delta (4% → 4.5%, both
    // keeping rReal comfortably positive) keeps the walk solvent at both
    // rates so the comparison is observable instead of 0 vs. 0.
    app.fire(() => app.latest().assumptions.retirementAge.set(30));
    app.fire(() => app.latest().accounts.trad401k.bal.set(5_000_000));
    app.fire(() => app.latest().spending.annualExpenses.set(20_000));
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().profile.spouseIncome.set(80_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(10_000));
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(62));
    const lowInfl = app.latest().retirementWalk.endVal;

    app.fire(() => app.latest().assumptions.inflationRate.set(4.5));
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

// Finding 2 (adversarial review, 2026-07-26) — optimizer wiring (T-F2.8). The
// conversion optimizer must search the SAME model the display shows (BUG-31 "two
// implementations of one quantity"), so its floorArgs must receive the spouse
// wage map too — cheapest proven by showing the optimizer's chosen amount moves
// when a spouse's real gap-year wages are introduced, everything else fixed.
describe("optimizer floorArgs receive spouse gap-year wages (Finding 2, T-F2.8)", () => {
  it("the optimizer's suggested conversion amount changes when spouse wages are introduced", () => {
    const app = mount();
    app.fire(() => app.latest().profile.filingStatus.set("mfj"));
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(20));
    app.fire(() => app.latest().conversion.conversionMode.set("custom"));
    // BUG-91: the default retirement spend (effectiveLiving, inflated to the
    // retirement-year frame) is so large for this household that the optimizer
    // suggests $0 regardless of spouse wages (every dollar is needed for
    // spending, none for conversions) — a degenerate 0-vs-0 comparison. Pin a
    // modest, clearly-sustainable spend so the optimizer has real room to
    // suggest a nonzero conversion, which is what this test needs to observe.
    app.fire(() => app.latest().spending.annualExpenses.set(40_000));
    // Baseline: married, MFJ, but no real spouse wages (spouseIncome still 0) —
    // a real gap window opens by age math alone, but nothing flows through it.
    const baseline = app.latest().conversionView.optimizer.suggestedAmount;
    expect(baseline).not.toBeNull();

    // Introduce real spouse gap-year wages — everything else held fixed.
    app.fire(() => app.latest().profile.spouseIncome.set(150_000));
    const withSpouseWages = app.latest().conversionView.optimizer.suggestedAmount;

    expect(withSpouseWages).not.toBe(baseline);
    app.unmount();
  });
});

// T-X.2 — composed end-to-end (adversarial review, 2026-07-26). The plan's own
// target-demographic walkthrough: primary retires at 58 on modest-but-real
// balances, spouse is 48 at that point and keeps working to 65 (a 17-year gap
// window). All three findings land in the same household at once, so this
// proves they compose without contradiction rather than each only being
// individually correct.
//
// Shared fixture builder — used by BOTH the qualitative T-X.2 test below and
// the exact-locked golden master (spouse-household-golden-master describe,
// same file) so the two never drift into describing two different
// households under the same "T-X.2" name.
function buildTX2Household() {
  const app = mount();
  app.fire(() => app.latest().assumptions.currentAge.set(50));
  app.fire(() => app.latest().assumptions.retirementAge.set(58));
  app.fire(() => app.latest().assumptions.returnRate.set(7));
  app.fire(() => app.latest().assumptions.inflationRate.set(2.5));
  app.fire(() => app.latest().ss.isMarried.set(true));
  app.fire(() => app.latest().ss.spouseCurrentAge.set(40)); // 48 at primary's retirement
  app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(65)); // 17-yr gap
  app.fire(() => app.latest().profile.filingStatus.set("mfj"));
  app.fire(() => app.latest().profile.spouseIncome.set(90_000));
  app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(500_000));
  app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(15_000));
  app.fire(() => app.latest().accounts.trad401k.bal.set(400_000));
  app.fire(() => app.latest().accounts.roth.bal.set(100_000));
  app.fire(() => app.latest().accounts.taxable.bal.set(150_000));
  app.fire(() => app.latest().spending.annualExpenses.set(95_000));
  app.fire(() => app.latest().ss.ssClaimingAge.set(67));
  app.fire(() => app.latest().ss.ssOverride.set(40_000));
  return app;
}

describe("target-demographic walkthrough — all three findings composed (T-X.2)", () => {
  it("a well-funded age-gap household never falsely depletes, never needs the spillover hatch, has no seam discontinuity, and its bracket-fill target reflects the spouse's real wages", () => {
    const app = buildTX2Household();
    const latest = app.latest();

    // (1) Well-funded ⇒ never falsely declared depleted, never needs the
    // penalized escape hatch (Finding 1).
    expect(latest.retirementWalk.depletionAge).toBeNull();
    expect(latest.retirementWalk.totalSpouseSpillover).toBe(0);
    expect(latest.spouseSpilloverNote ?? latest.planHighlights?.spouseSpilloverNote ?? null).toBeFalsy();

    // (2) No discontinuity at the accumulation → retirement seam (Finding 3):
    // the chart point at the retirement age and the very next point must be
    // continuous, not a cliff — the class of artifact a wrong deflation base
    // would introduce.
    const chart = latest.chartData;
    const seamIdx = chart.findIndex(p => p.age === 58);
    expect(seamIdx).toBeGreaterThan(-1);
    expect(seamIdx).toBeLessThan(chart.length - 1);
    const seamJump = Math.abs(chart[seamIdx + 1].total - chart[seamIdx].total) / chart[seamIdx].total;
    expect(seamJump).toBeLessThan(0.25);

    // (3) The bracket-fill target reflects the spouse's real gap-year wages
    // (Finding 2) — far below the naive MFJ-22%-bracket fillTo (243,600) a
    // spouse-blind planner would have shown.
    expect(latest.conversionView.targets.convPeakTarget).toBeLessThan(200_000);
    expect(latest.conversionView.targets.convPeakTarget).toBeGreaterThan(0);

    app.unmount();
  });
});

// ── Spouse-household golden master (SPOUSAL-ENGINE-STABILIZATION-PLAN.md, §2
// step 1) ─────────────────────────────────────────────────────────────────
//
// T-X.2's own assertions above are qualitative ("never depletes", "under
// $200k") — deliberately, since they were written to prove three findings
// compose without contradiction, not to pin exact numbers. That looseness is
// exactly why this engine's bug class (undeclared scope/unit basis — see the
// stabilization plan) has gone five-plus review passes without saturating:
// golden-master.test.js locks the no-spouse default exactly, but nothing
// locked the spouse/household case at all, so a regression there had no test
// to fail against.
//
// This block locks EVERY headline number for the SAME T-X.2 household to its
// exact current value — the same convention golden-master.test.js uses for
// the no-spouse default. Re-lock only when a change is deliberate and
// understood, exactly like golden-master.test.js.
//
// BUG-91 (2026-07-27): re-locked. The retirement engine walks in the PRIMARY's
// RETIREMENT-YEAR real dollars; effectiveExpenses/effectivePension are
// TODAY's dollars, now converted forward via toRetirementYearDollars before
// they reach the engine (App.jsx). This household stays comfortably
// sustainable even at the honest spend (spouse income + healthy balances), so
// yearsSustained/isSustainable/depletionAge are UNCHANGED — but withdrawalRate
// roughly doubles (0.78% → 1.61%, the conversion factor at this fixture's
// 8-years-to-retirement/2.5%-inflation is only ~1.22×, far smaller than the
// no-spouse default's 35-year/4%-inflation ~3.95× factor), and the RMD/
// conversion figures shift because the live 401k balance the engine draws
// down/converts from is now different (a larger draw depletes the primary's
// Traditional bucket faster, changing both the RMD schedule and the
// conversion economics — netConversionBenefit actually RISES here, since a
// larger required spend makes avoiding future RMD tax more valuable for this
// household). endVal (the far-horizon walk's ending balance) drops sharply —
// same higher-draw mechanism, compounded over the 130-year longevity horizon.
describe("spouse-household golden master (T-X.2, exact-locked)", () => {
  const E = {
    totalAtRet:              2_509_497,
    yearsSustainedInfinite:  true,     // still comfortably sustainable at the honest spend
    withdrawalRate:          1.6114494364186185,   // was 0.7846592364924126
    isSustainable:           true,
    depletionAge:            null,
    endVal:                  362_928_420, // far-horizon (safeRetAge+130) walk end — was 485_176_142
    firstRMD:                0,          // primary Trad drained by conversions before age 73 (BUG-96 shape)
    totalRMDs:               1_138_926,  // household (primary + spouse RMDs) — was 1_330_378
    rmdTaxBite:              167_684,    // was 209_803
    totalDrawTax:            83_566,     // was 9_758 — much larger spending draw needs more 401k-funded tax
    conversionCost:          174_196,    // was 190_860
    rmdTaxSaved:             333_941,    // was 291_821
    grossNetBenefit:         159_745,    // was 100_961
    netConversionBenefit:    159_745,    // was 100_961
    totalSpouseSpillover:    0,
    totalSpouseSpilloverTax: 0,
    firstSpouseSpilloverAge: null,
    conversionWindowYrs:     14,
    convPeakTarget:          150_910,
    convSteadyTarget:        110_856,
    effectiveExpenses:       95_000,     // TODAY's dollars — unchanged, this is the raw user-facing figure
    householdSS:             40_000,
    // Session B (Monte Carlo engine port, 2026-07-28): re-locked 83 -> 100.
    // Direction: UP, strongly — this household's spouse gap-year income+
    // contributions ($90k income + $15k/yr contributions over a 17-year gap)
    // are now visible to the Range lens for the first time (the older blended
    // walk had no spouse bucket at all); that inflow dwarfs the new spending-
    // draw tax the port also introduces (totalDrawTax is only $83,566 lifetime
    // per the walk locked above), and the hold-out/spillover mechanisms are
    // inert here (totalSpouseSpillover: 0 above) since this household never
    // needs the escape hatch.
    // Revisit-trigger note: this is one of the two (of six calibration
    // fixtures) where withdrawal/longevity both read "ok" — see
    // docs/FINANCIAL-MODEL.md's "Monte Carlo Threshold Calibration" for why
    // that pairing matters if this value is ever re-locked from a changed
    // fixture.
    rangeSuccessPct:         100,
  };

  it("locks the retirement-walk headline numbers", () => {
    const app = buildTX2Household();
    const latest = app.latest();
    const rw = latest.retirementWalk;

    expect(latest.totalAtRet).toBe(E.totalAtRet);
    expect(latest.yearsSustained === Infinity).toBe(E.yearsSustainedInfinite);
    expect(latest.withdrawalRate).toBeCloseTo(E.withdrawalRate, 8);
    expect(latest.isSustainable).toBe(E.isSustainable);
    expect(latest.effectiveExpenses).toBe(E.effectiveExpenses);
    expect(latest.householdSS).toBe(E.householdSS);

    expect(rw.depletionAge).toBe(E.depletionAge);
    expect(rw.endVal).toBe(E.endVal);
    expect(rw.firstRMD).toBe(E.firstRMD);
    expect(rw.totalRMDs).toBe(E.totalRMDs);
    expect(rw.rmdTaxBite).toBe(E.rmdTaxBite);
    expect(rw.totalDrawTax).toBe(E.totalDrawTax);
    expect(rw.conversionCost).toBe(E.conversionCost);
    expect(rw.rmdTaxSaved).toBe(E.rmdTaxSaved);
    expect(rw.grossNetBenefit).toBe(E.grossNetBenefit);
    expect(rw.totalSpouseSpillover).toBe(E.totalSpouseSpillover);
    expect(rw.totalSpouseSpilloverTax).toBe(E.totalSpouseSpilloverTax);
    expect(rw.firstSpouseSpilloverAge).toBe(E.firstSpouseSpilloverAge);

    app.unmount();
  });

  it("locks the conversion planner + Range lens numbers", () => {
    const app = buildTX2Household();
    const latest = app.latest();

    expect(latest.netConversionBenefit).toBe(E.netConversionBenefit);
    expect(latest.conversionWindowYrs).toBe(E.conversionWindowYrs);
    expect(latest.conversionView.targets.convPeakTarget).toBe(E.convPeakTarget);
    expect(latest.conversionView.targets.convSteadyTarget).toBe(E.convSteadyTarget);
    expect(latest.rangeView.successPct).toBe(E.rangeSuccessPct);
    // Session B (Monte Carlo engine port): the interim spouseGapCaveat is
    // retired outright — the Range lens now reads the same per-account engine
    // as retirementWalk, so there is no second, spouse-blind walk left for
    // this household's outlook to disagree with.
    expect(latest.rangeView.spouseGapCaveat).toBeUndefined();

    app.unmount();
  });
});

// BUG-96 (found 2026-07-26, interoperability review agent; fixed 2026-07-27,
// spousal-engine stabilization session). The T-X.2 household is the exact
// shape the bug describes: the primary's own Traditional bucket is drained by
// conversions (firstRMD/rw.firstRMD = 0, no primary RMD rows at all) while the
// household owes real RMDs from the spouse's bucket (rw.totalRMDs > $1.1M,
// per the golden master locked above) — before the fix, the "Lifetime RMD
// Total" tile showed the household figure over an EMPTY table, and the
// Strategies RMD card hid itself (applicable keyed on firstRMD alone).
describe("BUG-96 — RMD tiles/table scope agreement", () => {
  it("rmdView.totalRMDs (the tile) matches the table's own scope (primary-only), with the real household total surfaced separately", () => {
    const app = buildTX2Household();
    const latest = app.latest();
    const rv = latest.rmdView;

    // The table (rv.rows) is primary-only by design — its sum IS rv.totalRMDs
    // now (the bug: it used to be the unrelated household figure).
    const tableSum = (rv.rows ?? []).reduce((s, r) => s + r.rmd, 0);
    expect(rv.totalRMDs).toBe(tableSum);
    expect(rv.totalRMDs).toBe(0); // this household's primary schedule is empty

    // The real household total is exposed separately, clearly distinguished,
    // and correctly flagged as "worth showing" since it's nonzero here.
    expect(rv.householdTotalRMDs).toBe(latest.retirementWalk.totalRMDs);
    expect(rv.householdTotalRMDs).toBeGreaterThan(0);
    expect(rv.showHouseholdTotal).toBe(true);
    app.unmount();
  });

  it("the Strategies RMD card stays applicable for a household that owes real (spouse-only) RMDs, even though the primary's own schedule is empty", () => {
    const app = buildTX2Household();
    const latest = app.latest();
    // Before the fix this kept `applicable: !!firstRMD` — firstRMD is
    // undefined here (empty primary schedule), which would have hidden the
    // card behind "Browse all strategies" for a household facing $1M+ of RMDs.
    expect(latest.strategiesView.rmd.applicable).toBe(true);
    app.unmount();
  });
});

// ── T-X.3 — third golden master: MFJ + spouse gap + pension + non-TX + open
// conversion window (interoperability audit recommendation, PR #62 review
// battery) ────────────────────────────────────────────────────────────────
// Both existing golden masters (the no-spouse default, and T-X.2 above) have
// pensionMonthly = 0 and filingStatus/state combinations that never exercise
// the pension-timing basis triad this PR's review rounds fixed THREE separate
// times (retPensionAtRMDAge for projectRetirementBracket, retPensionAt70 for
// wr70, the ungated retPensionAnnualBasis for calcRMDIncomeFloor — see the
// "PR #62 review battery" entry in docs/BUGS.md) — meaning all three fixes
// were locked by zero golden-master value, only by the narrower, synthetic
// wiring tests in pension-timing-wiring.test.js. This fixture closes that gap:
// a REAL pension (starts after retirement, before RMD age — the exact shape
// that was double-gated), MFJ filing, a non-TX retirement state (exercises
// calcStateTax's table path instead of TX's 0% no-op), a spouse with an
// active gap window, and a genuinely open conversion window with real RMD,
// wr70, and projected-bracket signal (none of the three locked values is
// degenerate — see the build helper's comment for how each was tuned).
function buildTX3Household() {
  const app = mount();
  app.fire(() => app.latest().assumptions.currentAge.set(50));
  app.fire(() => app.latest().assumptions.retirementAge.set(62));
  app.fire(() => app.latest().ss.isMarried.set(true));
  app.fire(() => app.latest().ss.spouseCurrentAge.set(45)); // 57 at primary's retirement — real gap vs. spouseRetirementAge 65
  app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(65));
  app.fire(() => app.latest().profile.filingStatus.set("mfj"));
  app.fire(() => app.latest().profile.spouseIncome.set(80_000));
  app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(400_000));
  app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(12_000));
  // Trad 401k sized so conversions (the open window below) don't fully drain
  // it before RMD age — unlike T-X.2, this fixture needs a REAL, nonzero
  // primary RMD schedule to exercise the pension-basis fixes at RMD age.
  app.fire(() => app.latest().accounts.trad401k.bal.set(1_400_000));
  app.fire(() => app.latest().accounts.roth.bal.set(80_000));
  app.fire(() => app.latest().accounts.taxable.bal.set(150_000));
  // Expense level tuned so wr70 (the age-70 SS-delay comparison) is nonzero —
  // SS + pension alone don't fully cover it at 70, unlike a lower-spend
  // household where wr70 degenerates to a vacuous 0.
  app.fire(() => app.latest().spending.annualExpenses.set(140_000));
  app.fire(() => app.latest().ss.ssClaimingAge.set(67));
  app.fire(() => app.latest().ss.ssOverride.set(38_000));
  // The pension: starts AFTER retirement (62) but BY RMD age (73) — exactly
  // the double-gated shape Qodo's finding and this fixture's two siblings
  // (retPensionAtRMDAge, retPensionAt70) were about.
  app.fire(() => app.latest().pension.pensionMonthly.set(3_000));
  app.fire(() => app.latest().pension.pensionStartAge.set(65));
  app.fire(() => app.latest().assumptions.retirementState.set("CA")); // non-TX — exercises calcStateTax's real table
  return app;
}

describe("spouse-household golden master (T-X.3, exact-locked — MFJ + pension + non-TX)", () => {
  const E = {
    totalAtRet:           4_429_144,
    withdrawalRate:       3.3378348186348292,
    isSustainable:        true,
    depletionAge:         96,
    effectiveExpenses:    140_000,   // TODAY's dollars — unchanged, raw user-facing figure
    householdSS:          38_000,
    conversionWindowYrs:  10,
    netConversionBenefit: 19_837,
    firstRMD:             16_908,
    totalRMDs:             133_413,
    rmdTaxBite:            28_417,
    projectedRetBracket:  0.12,     // taxView.projectedRetBracket — exercises retPensionAtRMDAge (nonzero pension, MFJ brackets)
    wr70:                 1.4225852835455082,  // ssView.wr70 — exercises retPensionAt70
    // Session B (Monte Carlo engine port, 2026-07-28): re-locked 61 -> 60.
    // Direction: essentially FLAT (-1), not the "up" every other spouse
    // fixture shows — and that's the expected, explained outcome, not a
    // regression. This household's gap is short (8 years) against a large
    // MFJ/CA household spend ($140k), so the port's new spending-draw tax
    // (M1) roughly CANCELS the spouse gap-year income benefit (M2) instead of
    // being dwarfed by it the way T-X.2's 17-year gap dwarfs it. This is the
    // predicted "least certain" fixture from the pre-implementation plan
    // audit, confirmed here by direct measurement rather than left as a
    // surprise for a future session to rediscover.
    // Revisit-trigger note: this household IS the one calibration
    // contradiction found so far (successPct 60 < 80 while withdrawalRate and
    // isSustainable both read "ok") — see docs/FINANCIAL-MODEL.md's "Monte
    // Carlo Threshold Calibration". The decision was to keep the 80/70
    // thresholds (1 contradiction is below the declared 2-household trigger),
    // but if a FUTURE fixture ever produces a second same-direction
    // contradiction, that decision should be revisited, not silently re-locked.
    rangeSuccessPct:      60,
  };

  it("locks the retirement-walk + conversion + Range-lens headline numbers for a pensioned MFJ spouse household", () => {
    const app = buildTX3Household();
    const latest = app.latest();
    const rw = latest.retirementWalk;

    expect(latest.totalAtRet).toBe(E.totalAtRet);
    expect(latest.withdrawalRate).toBeCloseTo(E.withdrawalRate, 8);
    expect(latest.isSustainable).toBe(E.isSustainable);
    expect(latest.effectiveExpenses).toBe(E.effectiveExpenses);
    expect(latest.householdSS).toBe(E.householdSS);

    expect(rw.depletionAge).toBe(E.depletionAge);
    expect(rw.firstRMD).toBe(E.firstRMD);
    expect(rw.totalRMDs).toBe(E.totalRMDs);
    expect(rw.rmdTaxBite).toBe(E.rmdTaxBite);

    expect(latest.conversionWindowYrs).toBe(E.conversionWindowYrs);
    expect(latest.netConversionBenefit).toBe(E.netConversionBenefit);

    // The three pension-basis fixes this golden master exists to cover —
    // untested by any other golden master (both have pensionMonthly = 0).
    expect(latest.taxView.projectedRetBracket).toBeCloseTo(E.projectedRetBracket, 6);
    expect(latest.ssView.wr70).toBeCloseTo(E.wr70, 8);

    expect(latest.rangeView.successPct).toBe(E.rangeSuccessPct);

    app.unmount();
  });
});
