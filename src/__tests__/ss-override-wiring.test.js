import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-154 — App-level: pinning your own SS figure must not kill the delay-to-70 comparison,
// and withdrawalRate / wr70 must stay on the same SS basis.
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

describe("ssOverride vs the delay-to-70 leg (BUG-154)", () => {
  it("a pinned override keeps the delay card applicable and wr70 on the override basis", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(62));
    const before = app.latest().ssView;
    expect(before.delayApplicable).toBe(true);

    app.fire(() => app.latest().ss.ssOverride.set(90_000));
    const after = app.latest();
    expect(after.ss.ssOverride.value).toBe(90_000);
    expect(after.ssView.delayApplicable).toBe(true);           // pre-fix: false
    expect(after.ssView.ss70DrawReduction).toBeGreaterThan(0); // pre-fix: 0
    expect(after.ssView.wr70).not.toBe(before.wr70);           // pre-fix: unchanged by the override
    // Delaying must never read as worse than claiming now.
    expect(after.ssView.wr70).toBeLessThanOrEqual(after.withdrawalRate);
    app.unmount();
  });
});

// BUG-177 (owner decision 2026-11-14): a pinned override is the benefit at the claim age it was
// ENTERED at; moving the claim age rescales it by the SS_FACTORS ratio. No fake delay gain.
describe("ssOverride anchor age (BUG-177)", () => {
  const FAC = { 62: 0.7, 65: 0.867, 67: 1.0, 70: 1.24 };

  it("entered at 70: claim leg rescales down by factor ratios, age-70 leg stays put", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(70));
    app.fire(() => app.latest().ss.ssOverride.set(38_000));
    expect(app.latest().ssView.ssAnnual).toBe(38_000);
    const ss70At70 = app.latest().ssView.ss70Annual ?? null;
    for (const age of [67, 65, 62]) {
      app.fire(() => app.latest().ss.ssClaimingAge.set(age));
      expect(app.latest().ss.ssOverride.value).toBe(38_000);             // shown as entered
      expect(app.latest().ssView.ssAnnual).toBe(Math.round(38_000 * FAC[age] / FAC[70]));
      expect(app.latest().ssView.ssMonthly).toBe(Math.round(Math.round(38_000 * FAC[age] / FAC[70]) / 12));
      expect(app.latest().ssView.overrideRescaleNote).toContain("age 70");
    }
    // the age-70 leg never inflates: ss70DrawReduction == 70-leg minus claim-leg, with 70-leg = 38,000
    const v = app.latest().ssView;
    expect(v.ss70DrawReduction).toBe(38_000 - Math.round(38_000 * FAC[62] / FAC[70]));
    void ss70At70;
    app.unmount();
  });

  it("entered at the claim age and left there: unchanged, no note", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(67));
    app.fire(() => app.latest().ss.ssOverride.set(38_000));
    expect(app.latest().ssView.ssAnnual).toBe(38_000);
    expect(app.latest().ssView.overrideRescaleNote).toBeNull();
    app.unmount();
  });

  // BUG-183 (review S-3): editing a live pin must keep its anchor age. Pre-fix the write
  // re-anchored to the CURRENT claim age, turning a $500 nudge into a +79% SS raise.
  it("editing an existing pin keeps its anchor age (BUG-183)", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(70));
    app.fire(() => app.latest().ss.ssOverride.set(38_000));
    app.fire(() => app.latest().ss.ssClaimingAge.set(62));
    app.fire(() => app.latest().ss.ssOverride.set(38_500));
    // anchor still 70: the claim leg rescales the 38,500 entered at 70, not treated as entered at 62
    expect(app.latest().ssView.ssAnnual).toBe(Math.round(38_500 * 0.7 / 1.24));
    expect(app.latest().ssView.overrideRescaleNote).toContain("age 70");
    app.fire(() => app.latest().ss.ssClaimingAge.set(70));
    expect(app.latest().ssView.ssAnnual).toBe(38_500);
    app.unmount();
  });

  it("clearing the override clears the anchor (re-pin later anchors to the then-current age)", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(70));
    app.fire(() => app.latest().ss.ssOverride.set(38_000));
    app.fire(() => app.latest().ss.ssOverride.set(null));
    app.fire(() => app.latest().ss.ssClaimingAge.set(62));
    app.fire(() => app.latest().ss.ssOverride.set(30_000));   // anchors at 62 now
    expect(app.latest().ssView.ssAnnual).toBe(30_000);
    expect(app.latest().ssView.overrideRescaleNote).toBeNull();
    app.fire(() => app.latest().ss.ssClaimingAge.set(67));
    expect(app.latest().ssView.ssAnnual).toBe(Math.round(30_000 * 1.0 / 0.7));
    app.unmount();
  });

  it("preview equals commit: a retirement-age what-if reads the same rescaled SS as the base plan", async () => {
    const { calcRetirementIncome } = await import("../model/retirement-income.js");
    const base = { currentIncome: 100_000, incomeGrowth: 0.03, incomeGrowthEndAge: null, safeRetAge: 65,
      currentAge: 40, ssClaimingAge: 62, includeSS: true, ssOverride: 38_000, ssOverrideAnchorAge: 70,
      spouseSsEstimate: 0, pensionMonthly: 0, pensionStartAge: 67 };
    const a = calcRetirementIncome(base);
    expect(a.effectiveSS).toBe(Math.round(38_000 * 0.7 / 1.24));
    expect(a.ss70Annual).toBe(38_000);
    // scenario path (what-if calls calcRetirementIncome with the same ssInputs incl. the anchor)
    const b = calcRetirementIncome({ ...base, safeRetAge: 68 });
    expect(b.effectiveSS).toBe(a.effectiveSS);
    expect(b.ss70Annual).toBe(38_000);
    // no anchor => pre-fix behaviour
    expect(calcRetirementIncome({ ...base, ssOverrideAnchorAge: null }).effectiveSS).toBe(38_000);
  });

  it("work-longer rows (scenario SS path) honour the anchor: same rescaled figure as the headline", () => {
    const app = mount();
    app.fire(() => app.latest().ss.ssClaimingAge.set(70));
    app.fire(() => app.latest().ss.ssOverride.set(38_000));
    app.fire(() => app.latest().ss.ssClaimingAge.set(62));
    const want = Math.round(38_000 * 0.7 / 1.24);
    const rows = app.latest().workLongerView.rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.ssAnnual).toBe(want);
    app.unmount();
  });
});
