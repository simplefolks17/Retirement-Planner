import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { calcWhatIfScenario, calcWhatIfDelta } from "../model/what-if.js";

// ── App-level wiring tests for inputs the audit's MUTATION table showed unprotected ─────
// (docs/audit-2026-11-14/oversight-root-causes.md, Lens 4). The audit deleted each of these
// calculations outright, one line at a time, and ran the full 1,408-test suite: nothing failed.
// Each block below drives the REAL App through its setter bundles and asserts the input reaches
// its consumer. Each was verified by re-running its mutation and watching the block fail (see
// docs/audit-2026-11-14/impl-log-L1-F.md for the printed output).
//
//   1. other pre-tax deductions            tax-basis.js `totalPreTaxDeduc`
//   2. spouse income growth -> primary sim App.jsx primary runSimulation `spouseIncomeGrowth`
//   3. extra pre-tax balance               App.jsx `tradGrossAtRet` (+ addlPreTaxBal)
//   4. RMD joint-life table                App.jsx `useTable2`
//   5. work state -> working-year events   App.jsx primary runSimulation `stateRate`
//   5b. work state -> scenario re-sim      App.jsx `whatIfSimInputs.stateRate` (R-11)
//   6. primary HSA family limit            App.jsx `primaryHsaLimit`

const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";

// `captured` is shared by every mount: snapshot what you need, then unmount before mounting again.
function mount() {
  captured.length = 0;
  let r;
  act(() => { r = create(React.createElement(App)); });
  return { L: () => captured[captured.length - 1], fire: (fn) => act(() => fn()), unmount: () => act(() => r.unmount()) };
}
const set = (a, path, v) => a.fire(() => path.split(".").reduce((o, k) => o[k], a.L()).set(v));
const MARRY = (a, spouseAge = 32, spouseIncome = 80_000) => {
  set(a, "ss.isMarried", true);
  set(a, "profile.filingStatus", "mfj");
  set(a, "ss.spouseCurrentAge", spouseAge);
  set(a, "profile.spouseIncome", spouseIncome);
};
// Build a household, read a plain-number snapshot, unmount.
function snap(setup, read) {
  const a = mount();
  setup?.(a);
  const out = read(a.L(), a);
  a.unmount();
  return out;
}

describe("1. other pre-tax deductions reach the tax basis", () => {
  it("a $6,000 pre-tax deduction lowers federal tax by roughly its marginal-bracket value", () => {
    const read = (l) => ({ fed: l.fedTax, fica: l.ficaTotal });
    const base = snap((a) => set(a, "profile.otherPreTaxDeduc", 0), read);
    const ded = snap((a) => set(a, "profile.otherPreTaxDeduc", 6_000), read);
    const saved = base.fed - ded.fed;
    // 10%-37% of $6,000. Pre-fix mutation (deduction ignored) -> saved === 0.
    expect(saved).toBeGreaterThan(600);
    expect(saved).toBeLessThan(2_220);
    // It is an income-tax deduction, not a FICA one.
    expect(ded.fica).toBe(base.fica);
  });
});

describe("2. spouse income growth reaches the PRIMARY's own simulation", () => {
  // The spouse's wages enter the primary's sim as household MAGI, which drives the Roth IRA
  // income phase-out. A spouse whose pay grows fast enough pushes the household past the
  // phase-out and the primary's Roth contribution falls; one whose pay barely grows does not.
  it("faster spouse income growth phases the primary's Roth contribution out sooner", () => {
    const setup = (g) => (a) => { MARRY(a, 32, 150_000); set(a, "profile.spouseIncomeGrowth", g); };
    const read = (l) => ({ cRoth: l.simData.map(r => r.cRoth), total: l.totalAtRet });
    const slow = snap(setup(3), read);
    const fast = snap(setup(10), read);
    const sum = (xs) => xs.reduce((s, v) => s + v, 0);
    // Pre-fix mutation (growth hard-wired to 3 inside the primary sim) -> identical rows.
    expect(sum(fast.cRoth)).toBeLessThan(sum(slow.cRoth));
    expect(fast.cRoth).not.toEqual(slow.cRoth);
  });
});

describe("3. extra pre-tax balance (addlPreTaxBal) reaches the retirement balance", () => {
  it("adding $100,000 of extra pre-tax balance raises totalAtRet by exactly that amount", () => {
    const read = (l) => ({ total: l.totalAtRet, spendable: l.spendableAtRet });
    const base = snap((a) => set(a, "accounts.addlPreTaxBal", 0), read);
    const plus = snap((a) => set(a, "accounts.addlPreTaxBal", 100_000), read);
    // It is held flat (not grown) at retirement, so the delta is the amount itself.
    expect(plus.total - base.total).toBeCloseTo(100_000, 0);
    expect(plus.spendable).toBeGreaterThan(base.spendable);
  });
});

describe("4. RMD joint-life table (spouse sole beneficiary, > 10-year gap)", () => {
  const setup = (spouseAge, sole) => (a) => { MARRY(a, spouseAge); set(a, "accounts.trad401k.bal", 1_500_000); set(a, "ss.spouseIsSoleBenef", sole); };
  const read = (l) => ({ q: l.rmdView.qualifiesTable2, total: l.rmdView.totalRMDs, label: l.rmdView.activeTableLabel });

  it("a 12-year-younger sole-beneficiary spouse switches to the joint table and lowers lifetime RMDs", () => {
    const uniform = snap(setup(18, false), read);
    const joint = snap(setup(18, true), read);
    expect(uniform.q).toBe(false);
    expect(joint.q).toBe(true);
    expect(joint.label).not.toBe(uniform.label);
    // Pre-fix mutation (useTable2 = false) -> equal totals.
    expect(joint.total).toBeLessThan(uniform.total);
  });

  it("a gap of 10 years or less leaves the uniform table in force (flag has no effect)", () => {
    const off = snap(setup(25, false), read);
    const on = snap(setup(25, true), read);
    expect(on.q).toBe(false);
    expect(on.total).toBe(off.total);
  });
});

describe("5. the work state reaches working-year Roth-conversion events", () => {
  // A conversion event in a working year is taxed at federal + the WORK state's rate.
  const setup = (state) => (a) => {
    set(a, "profile.selectedState", state);
    set(a, "accounts.trad401k.bal", 500_000);
    a.fire(() => a.L().conversionView.events.inServiceField.set(true));
    a.fire(() => a.L().conversionView.events.add());
    a.fire(() => a.L().conversionView.events.rows[0].amountField.set(100_000));
  };
  const read = (l) => {
    const age = l.conversionView.events.rows[0].ageField.value;
    const row = l.simData.find(r => r.age === age);
    return { conv: row.convEvent, tax: row.convEventTax, total: l.totalAtRet };
  };

  it("a California worker pays more tax on the same $100k working-year conversion than a Texan", () => {
    const tx = snap(setup("TX"), read);
    const ca = snap(setup("CA"), read);
    expect(tx.conv).toBe(100_000);
    expect(ca.conv).toBe(100_000);
    // Pre-fix mutation (stateRate: 0 into the primary sim) -> identical tax.
    expect(ca.tax).toBeGreaterThan(tx.tax);
    expect(ca.total).toBeLessThan(tx.total);
  });
});

describe("5b. the work state reaches the SCENARIO re-sim's conversion events too (R-11, sibling site of #5)", () => {
  // App.jsx builds the working-year conversion tax rate at TWO sites: the committed plan's
  // primary sim (pinned by #5) and `whatIfSimInputs.simInputs.stateRate`, which every scenario
  // re-sim reads. Mutating the second to 0 failed 0 tests; a CA household's preview read
  // +$20,508 more than committing the same retirement age (review probe J1: 7,400,213 vs
  // 7,379,705). Preview must equal commit for a CA household with a working-year event.
  const setupCA = (a) => {
    set(a, "profile.selectedState", "CA");
    set(a, "accounts.trad401k.bal", 500_000);
    a.fire(() => a.L().conversionView.events.inServiceField.set(true));
    a.fire(() => a.L().conversionView.events.add());
    a.fire(() => a.L().conversionView.events.rows[0].amountField.set(100_000));
  };
  it("whatIfSimInputs carries the work state's rate (not 0) for a CA household", () => {
    const a = mount(); setupCA(a);
    const stateRate = a.L().whatIfSimInputs.simInputs.stateRate;
    a.unmount();
    expect(stateRate).toBeGreaterThan(0);
  });
  for (const target of [67]) {
    it(`preview of retiring at ${target} equals committing it (calcWhatIfScenario and calcWhatIfDelta)`, () => {
      const a1 = mount(); setupCA(a1);
      const bundle = a1.L().whatIfSimInputs;
      const scenario = calcWhatIfScenario(bundle, { retirementAge: target });
      const delta = calcWhatIfDelta({ ...bundle, retirementAgeOverride: target });
      a1.unmount();
      const a2 = mount(); setupCA(a2);
      a2.fire(() => a2.L().assumptions.retirementAge.set(target));
      const committed = a2.L().totalAtRet;
      a2.unmount();
      expect(scenario.scenarioTotalAtRet).toBe(committed);
      expect(delta.scenarioTotalAtRet).toBe(committed);
    });
  }
});

describe("6. the primary's HSA family limit reaches the simulation", () => {
  const read = (l) => ({ stored: l.accounts.hsa.contrib.value, modelled: l.simData[1].cHSA, total: l.totalAtRet });
  const setup = (cov, amt) => (a) => { set(a, "spouseAccounts.hsaCoverageType", cov); set(a, "accounts.hsa.contrib", amt); };

  it("under family coverage a $8,000 HSA contribution is modelled in full (not capped at the self limit)", () => {
    const self = snap(setup("self", 4_400), read);
    const fam = snap(setup("family", 8_000), read);
    expect(fam.stored).toBe(8_000);
    // Pre-fix mutation (limit pinned to the self-only figure) -> modelled 4,400.
    expect(fam.modelled).toBe(8_000);
    expect(self.modelled).toBe(4_400);
    expect(fam.total).toBeGreaterThan(self.total);
  });
});
