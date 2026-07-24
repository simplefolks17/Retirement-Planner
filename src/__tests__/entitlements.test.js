import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// ── WI-5.2 (#113) Slice 3: entitlements + guardWrite ─────────────────────────
// Default state must render byte-identical to today (isPremium:true,
// readOnly:false, every setter live). Flipping the dev/test-only
// `globalThis.__HZ_ENTITLEMENTS__` override to readOnly:true must neuter
// EVERY write surface mechanically (guardWrite at construction, not a
// per-surface hunt) — this test fires a representative setter from several
// bundles plus both Apply-with-preview sites and asserts nothing moves.

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

describe("WI-5.2 entitlements — default state", () => {
  it("defaults to isPremium:true, readOnly:false and every setter live", () => {
    const app = mount();
    const p = app.latest();
    expect(p.entitlements).toEqual({ isPremium: true, readOnly: false });

    app.fire(() => p.profile.currentIncome.set(133_000));
    expect(app.latest().profile.currentIncome.value).toBe(133_000);

    const before = app.latest().moneyEvents.length;
    app.fire(() => app.latest().saveEvent({ id: 1, age: 70, amount: 40_000, isInflow: false }));
    expect(app.latest().moneyEvents.length).toBe(before + 1);

    app.unmount();
  });
});

describe("WI-5.2 entitlements — readOnly flip", () => {
  beforeEach(() => { globalThis.__HZ_ENTITLEMENTS__ = { readOnly: true }; });
  afterEach(() => { delete globalThis.__HZ_ENTITLEMENTS__; });

  it("neuters every write surface when readOnly is flipped on", () => {
    const app = mount();
    const p0 = app.latest();
    expect(p0.entitlements).toEqual({ isPremium: true, readOnly: true });

    // Snapshot values BEFORE firing any (now-neutered) setter.
    const snap = {
      currentIncome: p0.profile.currentIncome.value,
      tradContrib: p0.accounts.trad401k.contrib.value,
      ssClaimingAge: p0.ss.ssClaimingAge.value,
      annualConversionAmt: p0.conversion.annualConversionAmt.value,
      retirementAge: p0.assumptions.retirementAge.value,
      moneyEventsLength: p0.moneyEvents.length,
      activity: p0.activity,
    };

    app.fire(() => p0.profile.currentIncome.set(snap.currentIncome + 10_000));
    app.fire(() => p0.accounts.trad401k.contrib.set(snap.tradContrib + 1_000));
    app.fire(() => p0.ss.ssClaimingAge.set(snap.ssClaimingAge === 70 ? 62 : 70));
    app.fire(() => p0.conversion.annualConversionAmt.set(snap.annualConversionAmt + 5_000));
    app.fire(() => p0.assumptions.retirementAge.set(snap.retirementAge === 60 ? 65 : 60));
    app.fire(() => p0.saveEvent({ id: 999, age: 70, amount: 40_000, isInflow: false }));
    app.fire(() => p0.setActivity(p0.activity === "golf course" ? "travel" : "golf course"));
    app.fire(() => p0.surplusView.applyAllocation.apply());
    app.fire(() => p0.conversionView.optimizer.applySuggestion.apply());

    const p1 = app.latest();
    expect(p1.profile.currentIncome.value).toBe(snap.currentIncome);
    expect(p1.accounts.trad401k.contrib.value).toBe(snap.tradContrib);
    expect(p1.ss.ssClaimingAge.value).toBe(snap.ssClaimingAge);
    expect(p1.conversion.annualConversionAmt.value).toBe(snap.annualConversionAmt);
    expect(p1.assumptions.retirementAge.value).toBe(snap.retirementAge);
    expect(p1.moneyEvents.length).toBe(snap.moneyEventsLength);
    expect(p1.activity).toBe(snap.activity);

    expect(p1.surplusView.applyAllocation.available).toBe(false);
    expect(p1.conversionView.optimizer.applySuggestion.available).toBe(false);

    app.unmount();
  });
});
