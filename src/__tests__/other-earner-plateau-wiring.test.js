// BUG-187 (CodeRabbit, PR #70): runSimulation's `otherEarnerGrowthEndAge` defaults to the
// SUBJECT's own incomeGrowthEndAge when omitted. Every PRIMARY simulation must therefore pass
// `otherEarnerGrowthEndAge: null` explicitly, or the primary's income plateau also caps the
// SPOUSE's salary. (The spouse sim passes its own value and is untouched.)
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { runSimulation } from "../model/simulation.js";
import { calcWhatIfDelta, calcWhatIfScenario } from "../model/what-if.js";

// Records every runSimulation call the real App makes (pass-through spy).
const calls = vi.hoisted(() => []);
vi.mock("../model/simulation.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runSimulation: (args) => { calls.push(args); return actual.runSimulation(args); },
  };
});

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

describe("BUG-187 model: the omitted default leaks the primary's plateau into the spouse's salary", () => {
  // Primary salary is 0 so ONLY the spouse's growth can differ between runs. MFJ, spouse 200k
  // growing 3%: the uncapped spouse income crosses the 242k-252k Roth phase-out band by
  // year 8, so a capped spouse (plateau at 45 from age 40) visibly changes cRoth.
  const base = {
    totalYears: 12, currentAge: 40, currentIncome: 0, incomeGrowth: 0,
    filingStatus: "mfj", spouseIncome: 200_000, spouseIncomeGrowth: 3, returnRate: 5,
    inflationRate: 0,
    bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
    contrib401k: 0, contribRoth: 7_000, contribTaxable: 0, contribHSA: 0,
    contribEnd401k: 99, contribEndRoth: 99, contribEndTaxable: 99, contribEndHSA: 99,
    calcEmployerMatchFn: () => 0,
  };
  it("explicit otherEarnerGrowthEndAge: null (the primary's wiring) matches the no-plateau run exactly", () => {
    const noPlateau = runSimulation({ ...base, incomeGrowthEndAge: null });
    const wired = runSimulation({ ...base, incomeGrowthEndAge: 45, otherEarnerGrowthEndAge: null });
    expect(wired).toEqual(noPlateau);
  });
  it("the omitted default (the bug) DOES cap the spouse, so the test is not vacuous", () => {
    const noPlateau = runSimulation({ ...base, incomeGrowthEndAge: null });
    const buggy = runSimulation({ ...base, incomeGrowthEndAge: 45 });
    expect(buggy.map(r => r.cRoth)).not.toEqual(noPlateau.map(r => r.cRoth));
  });
});

describe("BUG-187 (App): every primary runSimulation call passes otherEarnerGrowthEndAge: null", () => {
  it("the primary sim with a plateau never hands that plateau to the spouse's salary", () => {
    const a = mount();
    calls.length = 0; // only App's own calls below (the model tests above also hit the spy)
    a.fire(() => a.latest().assumptions.currentAge.set(40));
    a.fire(() => a.latest().assumptions.retirementAge.set(65));
    a.fire(() => a.latest().profile.currentIncome.set(150_000));
    a.fire(() => a.latest().profile.incomeGrowthEndAge.set(45));
    a.fire(() => a.latest().profile.spouseIncome.set(100_000));
    const primaryCalls = calls.filter(c => c.incomeGrowthEndAge === 45);
    expect(primaryCalls.length).toBeGreaterThan(0);
    for (const c of primaryCalls) expect(c.otherEarnerGrowthEndAge).toBeNull();
    a.unmount();
  });

  it("the what-if resim sites (calcWhatIfDelta, calcWhatIfScenario) pass null too", () => {
    const a = mount();
    calls.length = 0; // only App's own calls below (the model tests above also hit the spy)
    a.fire(() => a.latest().assumptions.currentAge.set(40));
    a.fire(() => a.latest().assumptions.retirementAge.set(65));
    a.fire(() => a.latest().profile.currentIncome.set(150_000));
    a.fire(() => a.latest().profile.incomeGrowthEndAge.set(45));
    a.fire(() => a.latest().profile.spouseIncome.set(100_000));
    const bundle = a.latest().whatIfSimInputs;
    calls.length = 0;
    // Retiring at 60 instead of 65 forces a what-if resim (the re-walk the bug lives in).
    calcWhatIfScenario(bundle, { retirementAge: 60 });
    calcWhatIfDelta({ ...bundle, retirementAgeOverride: 60 });
    const plateauCalls = calls.filter(c => c.incomeGrowthEndAge != null);
    expect(plateauCalls.length).toBeGreaterThan(0);
    for (const c of plateauCalls) expect(c.otherEarnerGrowthEndAge).toBeNull();
    a.unmount();
  });
});
