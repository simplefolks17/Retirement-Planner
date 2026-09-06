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
  // (BUG-135 was fixed 2026-09-06 — its parity assertion now lives in the
  // "full parity" block below, as an equality rather than an inverted pin.)

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

describe("FULL PARITY — preview equals commit exactly when no known gap is in play", () => {
  // The strongest form of this file's invariant, and the one that would have caught
  // BUG-135 and BUG-138 on their own. No spouse (so BUG-137's gate is not involved)
  // and conversions off (so BUG-136's inherited window is not involved): with those
  // removed, previewing a retirement age and committing it must produce byte-identical
  // numbers, in BOTH directions.
  //
  // When BUG-136 is fixed, delete the two conversion setters from `setup` — this block
  // should then hold with conversions ON as well, which is the real end state.
  const setup = (a) => {
    a.fire(() => a.latest().assumptions.currentAge.set(50));
    a.fire(() => a.latest().assumptions.retirementAge.set(60));
    a.fire(() => a.latest().accounts.trad401k.bal.set(600_000));
    a.fire(() => a.latest().spending.annualExpenses.set(75_000));
    a.fire(() => a.latest().conversion.conversionMode.set("custom"));
    a.fire(() => a.latest().conversion.annualConversionAmt.set(0));   // remove BUG-136's input
  };

  for (const target of [52, 55, 58, 63, 66, 70]) {
    it(`retire at ${target}: scenarioTotalAtRet and scenarioYears match the committed plan exactly`, () => {
      const a1 = mount(); setup(a1);
      const preview = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: target });
      a1.unmount();

      const a2 = mount(); setup(a2);
      a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
      const committed = a2.latest();

      expect(preview.scenarioTotalAtRet).toBe(committed.totalAtRet);
      expect(preview.scenarioYears).toBe(committed.yearsSustained);
      a2.unmount();
    });
  }

  it("Social Security itself moves with the scenario's own working years (BUG-135)", () => {
    // Direct statement of the mechanism: the benefit is derived from ssWorkYears via
    // calcAIME/calcPIA, so a scenario 10 years earlier must model a materially smaller
    // benefit. Pre-fix the scenario carried the base plan's figure unchanged (measured
    // 25,956 where the truth was 13,656 — a 90% overstatement).
    const a1 = mount(); setup(a1);
    // 53, not 50: retiring AT currentAge leaves no accumulation row to read, and
    // calcWhatIfScenario correctly returns null there.
    const early = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: 53 });
    const late  = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: 70 });
    a1.unmount();

    const commit = (t) => {
      const a = mount(); setup(a);
      a.fire(() => a.latest().assumptions.retirementAge.set(t));
      const v = { years: a.latest().yearsSustained, atRet: a.latest().totalAtRet };
      a.unmount();
      return v;
    };
    expect(early.scenarioYears).toBe(commit(53).years);
    expect(late.scenarioYears).toBe(commit(70).years);
  });
});
