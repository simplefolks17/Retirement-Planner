import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { calcWhatIfScenario } from "../model/what-if.js";
import { coupleContribEndAges } from "../model/simulation.js";

// ── Preview/commit parity ────────────────────────────────────────────────────
//
// THE BUG CLASS THIS FILE EXISTS FOR. `calcWhatIfScenario` is a parallel
// re-implementation of the pipeline App.jsx builds via memos, so anything App derives
// from the retirement age must be RE-DERIVED for the scenario's own age rather than
// inherited. Six separate bugs have been exactly this: BUG-61, BUG-79, BUG-97,
// BUG-102, BUG-134, and (2026-09-06) BUG-137 + BUG-138.
//
// Every one of them was found by adversarial review rather than by the suite, because
// the assertions lived scattered across files organised by FEATURE. This file is
// organised by the INVARIANT instead: previewing change X, then committing change X,
// must agree. New parity findings belong here.
//
// Known remaining gaps, deliberately asserted as CURRENT behaviour below so that
// fixing them fails this file loudly rather than silently: BUG-135 (Social Security is
// not re-derived for the scenario's own working years) and BUG-136 (the Roth-conversion
// schedule is inherited from the base plan).

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

// Preview a retirement age, then commit the SAME age in a fresh mount, and return both.
function previewVsCommit(target, setup = () => {}) {
  const a1 = mount();
  setup(a1);
  const base = a1.latest();
  const baseRetAge = base.assumptions.retirementAge.value;
  const preview = calcWhatIfScenario(base.whatIfSimInputs, { retirementAge: target });
  a1.unmount();

  const a2 = mount();
  setup(a2);
  a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
  const committed = a2.latest();
  const out = {
    baseRetAge,
    preview,
    committedTotalAtRet: committed.totalAtRet,
    // retirementWalk.depletionAge is the far-horizon walk — the apples-to-apples
    // partner for scenarioDepletionAge. planView.depletionAge is lifeExpect-bounded
    // and reads null past it, which is NOT the comparable field.
    committedDepletionAge: committed.retirementWalk.depletionAge,
    committedSpillover: committed.retirementWalk.totalSpouseSpillover,
  };
  a2.unmount();
  return out;
}

describe("coupleContribEndAges (the shared rule, BUG-138)", () => {
  const ends = { contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 60, contribEndHSA: 65 };

  it("moves only the ages that TRACK the retirement age", () => {
    const next = coupleContribEndAges(ends, 65, 70);
    expect(next.contribEnd401k).toBe(70);
    expect(next.contribEndRoth).toBe(70);
    expect(next.contribEndHSA).toBe(70);
    // Deliberately set away from the retirement age by the user — must be left alone,
    // so "stop contributing at 60 but retire at 65" survives a scenario.
    expect(next.contribEndTaxable).toBe(60);
  });

  it("is symmetric (retiring earlier moves them down too)", () => {
    expect(coupleContribEndAges(ends, 65, 58).contribEnd401k).toBe(58);
  });

  it("is identity when the age is unchanged or either age is not finite", () => {
    expect(coupleContribEndAges(ends, 65, 65)).toBe(ends);
    expect(coupleContribEndAges(ends, 65, NaN)).toBe(ends);
    expect(coupleContribEndAges(ends, undefined, 70)).toBe(ends);
  });
});

describe("BUG-138 — a work-longer preview models the same contributions as committing it", () => {
  // The default household: no setters at all, so this is the golden-master state and
  // needs no spouse or other special shape to reproduce.
  for (const k of [1, 3, 5]) {
    it(`+${k} years: scenarioTotalAtRet matches the committed plan exactly`, () => {
      const a = mount();
      const baseRetAge = a.latest().assumptions.retirementAge.value;
      a.unmount();
      const r = previewVsCommit(baseRetAge + k);
      expect(r.preview.scenarioTotalAtRet).toBe(r.committedTotalAtRet);
    });
  }

  it("retiring EARLIER was never affected — the coupling only changes contribution years already past", () => {
    const a = mount();
    const baseRetAge = a.latest().assumptions.retirementAge.value;
    a.unmount();
    const r = previewVsCommit(baseRetAge - 3);
    expect(r.preview.scenarioTotalAtRet).toBe(r.committedTotalAtRet);
  });
});

describe("preview/commit parity — known remaining gaps (asserted as CURRENT behaviour)", () => {
  // These two assertions are inverted on purpose: they pin the BUG as it stands, so
  // that fixing BUG-135/BUG-136 fails HERE with a clear pointer rather than silently
  // changing behaviour somewhere else. Replace each with an equality assertion, and
  // delete its bug reference, as part of that fix.
  it("BUG-135: Social Security is NOT re-derived for the scenario's own working years", () => {
    // currentAge 50 / retire 60: a 10-year-earlier scenario cuts working years 10 -> 0
    // (floored at 1 by ssWorkYears), so the error is at its most severe. The DEFAULT
    // household (currentAge 30) shows the same defect more mildly — 35 vs 25 working
    // years is only a ~1.20x overstatement — which is why this test pins a household
    // near retirement rather than the default: the bug's magnitude scales with how
    // large a FRACTION of the career the scenario moves.
    const setup = (a) => {
      a.fire(() => a.latest().assumptions.currentAge.set(50));
      a.fire(() => a.latest().assumptions.inflationRate.set(0));
      a.fire(() => a.latest().assumptions.retirementAge.set(60));
    };
    const a1 = mount(); setup(a1);
    const baseSS = a1.latest().householdSS;
    a1.unmount();

    const a2 = mount(); setup(a2);
    a2.fire(() => a2.latest().assumptions.retirementAge.set(50));
    const committedSS = a2.latest().householdSS;
    a2.unmount();

    // Retiring 10 years earlier genuinely earns a much smaller benefit (fewer indexed
    // earning years via calcAIME/calcPIA) — but the scenario path still carries the
    // base plan's figure, inflation-re-based only (a no-op at 0% inflation).
    expect(committedSS).toBeLessThan(baseSS);
    expect(baseSS / committedSS).toBeGreaterThan(1.5);   // measured 1.90x
  });

  it("BUG-136: the Roth-conversion window is inherited from the base plan", () => {
    const a1 = mount();
    a1.fire(() => a1.latest().conversion.conversionMode.set("custom"));
    a1.fire(() => a1.latest().conversion.annualConversionAmt.set(60_000));
    const baseAges = Object.keys(a1.latest().whatIfSimInputs.conversionByAge);
    const baseRetAge = a1.latest().assumptions.retirementAge.value;
    a1.unmount();

    const a2 = mount();
    a2.fire(() => a2.latest().conversion.conversionMode.set("custom"));
    a2.fire(() => a2.latest().conversion.annualConversionAmt.set(60_000));
    a2.fire(() => a2.latest().assumptions.retirementAge.set(baseRetAge - 10));
    const committedAges = Object.keys(a2.latest().whatIfSimInputs.conversionByAge);
    a2.unmount();

    // Committing a 10-years-earlier retirement opens a much longer conversion runway;
    // the preview reuses the short base-plan window.
    expect(committedAges.length).toBeGreaterThan(baseAges.length + 5);
  });
});
