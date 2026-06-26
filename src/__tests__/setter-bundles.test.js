import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { SS_MIN_CLAIM_AGE } from "../config/irs-2026.js";

// ── WI-3.1 (#98) setter-bundle plumbing test ─────────────────────────────────
// The eight topic-grouped bundles on horizonProps (profile / spending / accounts
// / ss / pension / conversion / health / assumptions) give Horizon write access
// to the shared App state. This test renders App (HorizonShell mocked to capture
// its props), then for EACH bundle fires one representative setter and asserts
// the value round-trips back through the same bundle field — i.e. Horizon and
// Classic share one state. It also checks the constraint metadata the screens
// rely on (the BUG-17 SS floor, the dynamic contribution step) and the
// snap-to-null setter wrappers ported from Classic.

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

describe("WI-3.1 setter bundles", () => {
  it("exposes all eight bundles on horizonProps", () => {
    const app = mount();
    const p = app.latest();
    for (const key of ["profile", "spending", "accounts", "ss", "pension",
                       "conversion", "health", "assumptions"]) {
      expect(p[key], `missing bundle: ${key}`).toBeTruthy();
    }
    app.unmount();
  });

  it("round-trips one setter per bundle without crashing", () => {
    const app = mount();

    const writes = [
      ["profile",     (p) => p.profile.currentIncome.set(123_000),       (p) => p.profile.currentIncome.value,        123_000],
      ["spending",    (p) => p.spending.annualExpenses.set(81_000),      (p) => p.spending.annualExpenses.value,      81_000],
      ["accounts",    (p) => p.accounts.trad401k.contrib.set(15_000),    (p) => p.accounts.trad401k.contrib.value,    15_000],
      ["ss",          (p) => p.ss.ssClaimingAge.set(68),                 (p) => p.ss.ssClaimingAge.value,             68],
      ["pension",     (p) => p.pension.pensionMonthly.set(2_000),        (p) => p.pension.pensionMonthly.value,       2_000],
      ["conversion",  (p) => p.conversion.annualConversionAmt.set(35_000), (p) => p.conversion.annualConversionAmt.value, 35_000],
      ["health",      (p) => p.health.householdSize.set(3),              (p) => p.health.householdSize.value,         3],
      ["assumptions", (p) => p.assumptions.returnRate.set(7),            (p) => p.assumptions.returnRate.value,        7],
    ];

    for (const [name, write, read, expected] of writes) {
      app.fire(() => write(app.latest()));
      expect(read(app.latest()), `${name} did not round-trip`).toBe(expected);
    }

    app.unmount();
  });

  it("round-trips a toggle and a select", () => {
    const app = mount();

    const before = app.latest().ss.includeSS.value;
    app.fire(() => app.latest().ss.includeSS.set(!before));
    expect(app.latest().ss.includeSS.value).toBe(!before);

    app.fire(() => app.latest().profile.filingStatus.set("mfj"));
    expect(app.latest().profile.filingStatus.value).toBe("mfj");
    // Options are the documented {value,label} shape.
    expect(app.latest().profile.filingStatus.options.some(o => o.value === "mfj")).toBe(true);

    app.unmount();
  });

  it("carries the BUG-17 SS claim-age floor and the dynamic contribution step", () => {
    const app = mount();
    const p = app.latest();
    // Default current age (18) < SS min, so the floor is the SS minimum.
    expect(p.ss.ssClaimingAge.min).toBe(Math.max(SS_MIN_CLAIM_AGE, p.currentAge));
    // Dynamic step by contribution cap: Roth (≤10k)→100, 401k (≤30k)→500,
    // Taxable (100k)→1_000 — copied verbatim from the Classic accounts JSX.
    expect(p.accounts.roth.contrib.step).toBe(100);
    expect(p.accounts.trad401k.contrib.step).toBe(500);
    expect(p.accounts.taxable.contrib.step).toBe(1_000);
    // Stepper-driven fields carry a min so the ± control can't go negative, and a
    // sensible step (Gemini review on PR #44).
    expect(p.health.marketplaceMonthlyPremium.min).toBe(0);
    expect(p.health.marketplaceMonthlyPremium.step).toBe(50);
    expect(p.ss.ssOverride.step).toBe(500);
    // ssOverride max expands to fit a current override above the default cap.
    expect(p.ss.ssOverride.max).toBeGreaterThanOrEqual(60_000);
    app.unmount();
  });

  it("applies the snap-to-null wrappers ported from Classic", () => {
    const app = mount();

    // incomeGrowthEndAge: writing a value ≥ retirement age clears it to null.
    const retAge = app.latest().assumptions.retirementAge.value;
    app.fire(() => app.latest().profile.incomeGrowthEndAge.set(retAge));
    expect(app.latest().profile.incomeGrowthEndAge.value).toBeNull();

    // ssOverride: writing the estimated benefit back clears the override to null.
    const est = app.latest().ss.ssOverride.estimated;
    app.fire(() => app.latest().ss.ssOverride.set(est));
    expect(app.latest().ss.ssOverride.value).toBeNull();

    app.unmount();
  });

  it("keeps ssClaimingAge.min ≤ max even when current age is past 70", () => {
    const app = mount();
    // currentAge ranges to 80; without capping the floor at SS_MAX_CLAIM_AGE the
    // BUG-17 floor (max(SS_MIN, currentAge)) would exceed max (PR #47 CodeRabbit).
    app.fire(() => app.latest().assumptions.currentAge.set(78));
    const ss = app.latest().ss.ssClaimingAge;
    expect(ss.min).toBeLessThanOrEqual(ss.max);
    expect(ss.min).toBe(ss.max); // floor clamped down to SS_MAX_CLAIM_AGE
    // setCurrentAgeCoupled also clamps the STORED value, not just the metadata,
    // so the slider never holds a value below its own min (PR #46 CodeRabbit).
    expect(ss.value).toBeGreaterThanOrEqual(ss.min);
    expect(ss.value).toBe(ss.max);
    app.unmount();
  });

  it("lets the state-rate stepper escape the default (snap threshold < step)", () => {
    const app = mount();
    // One 0.1 step off the default must NOT snap back to null (PR #46 Gemini fix:
    // the 0.05 threshold is below the 0.1 step). defaultPct is 0 at the TX default.
    const dflt = app.latest().profile.stateRateOverride.defaultPct;
    app.fire(() => app.latest().profile.stateRateOverride.set(dflt + 0.1));
    expect(app.latest().profile.stateRateOverride.value).not.toBeNull();
    app.unmount();
  });
});
