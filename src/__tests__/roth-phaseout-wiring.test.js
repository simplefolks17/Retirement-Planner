import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { calcWhatIfScenario } from "../model/what-if.js";

// BUG-159 — App-level wiring of the inflation-indexed Roth phase-out. The model test
// (model/__tests__/roth-phaseout-indexing.test.js) cannot see App.jsx glue.
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
// simData rows carry cRoth; sum contributions to age 65 (primary).
const rothSum = (props) => props.simData.filter(d => d.age <= 65).reduce((s, d) => s + d.cRoth, 0);

describe("Roth phase-out indexing — App wiring (BUG-159)", () => {
  it("at the default, Roth contributions continue past age 53 (pre-fix: 0 from 53)", () => {
    const a = mount();
    const rows = a.latest().simData;
    expect(rows.find(d => d.age === 52).cRoth).toBe(7000);
    expect(rows.find(d => d.age === 53).cRoth).toBe(7000);
    expect(rows.find(d => d.age === 65).cRoth).toBe(7000);
    a.unmount();
  });

  it("changing assumptions.inflationRate changes Roth contributions in simData", () => {
    const a = mount();
    // $140k puts the household in/near the phase-out band, so inflation matters.
    a.fire(() => a.latest().profile.currentIncome.set(140_000));
    a.fire(() => a.latest().assumptions.inflationRate.set(8));
    const hi = rothSum(a.latest());
    a.fire(() => a.latest().assumptions.inflationRate.set(1));
    const lo = rothSum(a.latest());
    a.unmount();
    expect(hi).toBeGreaterThan(lo);
  });

  it("whatIfSimInputs carries the live inflationRate (scenario re-sims index too)", () => {
    const a = mount();
    expect(a.latest().whatIfSimInputs.simInputs.inflationRate).toBe(a.latest().assumptions.inflationRate.value);
    a.fire(() => a.latest().assumptions.inflationRate.set(6));
    expect(a.latest().whatIfSimInputs.simInputs.inflationRate).toBe(6);
    a.unmount();
  });

  it("preview equals commit for an inflation-sensitive household (scenario re-sim indexes Roth)", () => {
    const setup = (a) => {
      a.fire(() => a.latest().profile.currentIncome.set(140_000));
      a.fire(() => a.latest().assumptions.inflationRate.set(6));
    };
    const target = 70;
    const a1 = mount(); setup(a1);
    const preview = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: target });
    a1.unmount();
    const a2 = mount(); setup(a2);
    a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
    const committedTotal = a2.latest().totalAtRet;
    a2.unmount();     // mount() shares one `captured` array — snapshot, unmount, then mount again
    expect(preview.scenarioTotalAtRet).toBe(committedTotal);
    // Non-vacuous: inflation is genuinely changing the answer for this household.
    const flat = mount(); flat.fire(() => flat.latest().profile.currentIncome.set(140_000));
    flat.fire(() => flat.latest().assumptions.retirementAge.set(target));
    flat.fire(() => flat.latest().assumptions.inflationRate.set(1));
    expect(flat.latest().totalAtRet).not.toBe(committedTotal);
    flat.unmount();
  });

  // The SPOUSE's own accumulation sim (spouse-sim.js, shared by App and what-if.js) indexes too.
  describe("spouse household", () => {
    const setup = (a, infl) => {
      a.fire(() => a.latest().profile.filingStatus.set("mfj"));
      a.fire(() => a.latest().ss.isMarried.set(true));
      a.fire(() => a.latest().ss.spouseCurrentAge.set(30));
      a.fire(() => a.latest().profile.currentIncome.set(130_000));
      a.fire(() => a.latest().profile.spouseIncome.set(120_000));
      a.fire(() => a.latest().spouseAccounts.roth.contrib.set(7_000));
      a.fire(() => a.latest().assumptions.inflationRate.set(infl));
    };
    const spouseRoth = (props) => props.whatIfSimInputs.spouseSeedInputs.spouseSimData
      .reduce((s, d) => s + (d.cRoth ?? 0), 0);

    it("the spouse's own sim Roth contributions respond to inflationRate (App -> buildSpouseSimInput)", () => {
      const a = mount(); setup(a, 8);
      const hi = spouseRoth(a.latest());
      a.fire(() => a.latest().assumptions.inflationRate.set(1));
      const lo = spouseRoth(a.latest());
      a.unmount();
      expect(hi).toBeGreaterThan(lo);
    });

    it("preview equals commit with a spouse (scenario spouse re-sim carries inflationRate)", () => {
      const target = 62;
      const a1 = mount(); setup(a1, 8);
      const preview = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: target });
      a1.unmount();
      const a2 = mount(); setup(a2, 8);
      a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
      const committedTotal = a2.latest().totalAtRet;
      a2.unmount();
      expect(preview.scenarioTotalAtRet).toBe(committedTotal);
    });
  });
});
