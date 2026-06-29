import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import StrategiesScreen from "../screens/StrategiesScreen.jsx";

// ── WI-3.3 (#100) + WI-3.4/3.5 flows ─────────────────────────────────────────
// The screen is pure layout over horizonProps. Card faces read the bundle that
// owns each number: conversion → taxView.conversionDetail, withdrawal →
// yr1TaxSavings, surplus → budget, ss → ssView, rmd → rmdView. SS + RMD cards
// open live interactive flows (WI-3.4/3.5) that read those same view bundles and
// write through the WI-3.1 ss/pension/accounts setter bundles. Synthetic props
// mirror the golden-master default so the headline value-locks (incl. the
// NEGATIVE Roth benefit) catch a wiring regression.

const t = new Proxy({}, { get: () => "#334155" });

const num = (value, min, max, step, extra = {}) => ({ value, set: vi.fn(), min, max, step, ...extra });
const bool = (value) => ({ value, set: vi.fn() });
const choice = (value, options) => ({ value, set: vi.fn(), options });

function makeProps(overrides = {}) {
  return {
    // ── already-wired headlines (read directly) ──
    taxView: { conversionDetail: { adjustedNetConversionBenefit: -9_854, isPositive: false, benefitAbs: 9_854 } },
    conversionWindowYrs: 7,
    yr1TaxSavings: 12_400,
    budget: { availableSurplus: 18_000 },
    // ── scalars the flows read directly from horizonProps ──
    isMarried: false,
    includeSS: true,
    withdrawalRate: 3.2,
    householdSS: 48_120,
    effectivePension: 0,
    effectiveExpenses: 60_000,
    // ── strategiesView: applicability flags (+ mega summary until its flow) ──
    strategiesView: {
      conversion: { applicable: true },
      rmd:        { applicable: true },
      ss:         { applicable: true },
      withdrawal: { applicable: true },
      surplus:    { applicable: true },
      mega:       { applicable: true, capacity: 30_000, growth: [{ yrs: 5, val: 170_000 }] },
    },
    // ── WI-3.4 ssView flow bundle ──
    ssView: {
      ssMonthly: 4_010, ssAnnual: 48_120, ssEstimateAnnual: 48_120, ssAIME: 9_500,
      claimAge: 67, breakEven: null, ssCoveragePct: 80,
      delayApplicable: false, ss70DrawReduction: 0, wr70: 0, delayGainYrs: null,
      spouseSsBenefit: 0, spouseAlt: 0, spouseAltHigher: false, householdCoveragePct: 80,
    },
    // ── WI-3.5 rmdView flow bundle ──
    rmdView: {
      firstRMDAmount: 62_508, firstRMDAge: 73, totalRMDs: 1_150_000, rmdTaxBite: 207_000,
      effectiveRMDTaxRate: 0.21,
      rows: [{ age: 73, rmd: 62_508, bal: 1_500_000, divisor: 27.4, tax: 13_000 }],
      rowCount: 1, retAtOrAfterRMD: false,
      activeTableLabel: "Table III (Uniform Lifetime)", qualifiesTable2: false, spouseAgeGap: 0,
    },
    // ── setter bundles the flows write through (WI-3.1) ──
    ss: {
      includeSS: bool(true),
      ssClaimingAge: num(67, 62, 70, 1),
      ssOverride: { value: null, set: vi.fn(), min: 0, max: 60_000, step: 500, estimated: 48_120 },
      spouseBenefitBasis: choice("own", [{ value: "own", label: "Own record" }, { value: "spousal", label: "Spousal (50%)" }]),
      spouseSsEstimate: num(0, 0, 60_000, 500),
      spouseClaimingAge: num(67, 62, 70, 1),
      isMarried: bool(false),
      spouseIsSoleBenef: bool(false),
      spouseCurrentAge: num(33, 18, 33, 1),
    },
    pension: { pensionMonthly: num(0, 0, 10_000, 100), pensionStartAge: num(65, 50, 75, 1) },
    accounts: { addlPreTaxBal: num(0, 0, undefined, 10_000) },
    ...overrides,
  };
}

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function mount(props, extra = {}) {
  let r;
  act(() => { r = create(React.createElement(StrategiesScreen, { t, props, isMobile: false, ...extra })); });
  const click = (pred) => {
    const target = r.root.findAll(n => typeof n.props?.onClick === "function" && pred(n))[0];
    expect(target).toBeTruthy();
    act(() => target.props.onClick());
  };
  return { r, click, text: () => textOf(r.toJSON()) };
}

describe("StrategiesScreen", () => {
  it("renders the marker, the three editorial sections, and all six cards", () => {
    const app = mount(makeProps());
    const txt = app.text();
    expect(txt).toContain("Ways to keep more of what you've built");   // smoke marker (card-grid root)
    for (const s of ["Taxes", "Income timing", "Accounts"]) {
      expect(txt, `missing section: ${s}`).toContain(s);
    }
    for (const c of ["Roth conversion", "Withdrawal order", "Social Security timing",
                     "RMD outlook", "Surplus deployment", "Mega backdoor"]) {
      expect(txt, `missing card: ${c}`).toContain(c);
    }
    act(() => app.r.unmount());
  });

  it("shows correct headline dollars, including the NEGATIVE Roth benefit", () => {
    const app = mount(makeProps());
    const txt = app.text();
    expect(txt).toContain("−$9,854");          // sign-aware Roth headline (value-lock)
    expect(txt).toContain("not worth it");     // negative framing
    expect(txt).toContain("$12,400");          // withdrawal yr1 savings
    expect(txt).toContain("$4,010/mo");        // SS monthly (ssView)
    expect(txt).toContain("$62,508");          // first RMD (rmdView)
    expect(txt).toContain("$18,000/yr");       // surplus
    expect(txt).toContain("$30,000/yr");       // mega capacity
    act(() => app.r.unmount());
  });

  it("shows the 'Not set up' state for an inapplicable card", () => {
    const props = makeProps();
    props.strategiesView.mega = { applicable: false };
    const app = mount(props);
    expect(app.text()).toContain("Not set up");
    act(() => app.r.unmount());
  });

  it("opens the SS timing flow and returns via back", () => {
    const app = mount(makeProps());
    app.click(n => textOf(n).startsWith("Social Security timing"));   // open the SS card
    const txt = app.text();
    expect(txt).toContain("All strategies");          // back affordance present
    expect(txt).toContain("Annual benefit");          // SSTimingFlow stat tile
    expect(txt).toContain("$48,120");                 // ssView.ssAnnual value-lock
    expect(txt).toContain("Include Social Security");  // live control from the ss bundle
    app.click(n => textOf(n) === "‹ All strategies");
    expect(app.text()).toContain("Ways to keep more of what you've built");  // back at the grid
    act(() => app.r.unmount());
  });

  it("a flow control writes through its setter bundle", () => {
    const props = makeProps();
    const app = mount(props);
    app.click(n => textOf(n).startsWith("Social Security timing"));
    // Toggle "Include Social Security" off via the No button.
    app.click(n => textOf(n) === "No");
    expect(props.ss.includeSS.set).toHaveBeenCalledWith(false);
    act(() => app.r.unmount());
  });

  it("deep-links straight into the RMD flow via initialStrategy", () => {
    const app = mount(makeProps(), { initialStrategy: "rmd" });
    const txt = app.text();
    expect(txt).toContain("RMD outlook");                     // detail title
    expect(txt).toContain("First RMD at 73");                 // RMD_START_AGE-driven stat label
    expect(txt).toContain("$62,508");                         // firstRMDAmount value-lock
    expect(txt).toContain("Table III (Uniform Lifetime)");   // active table label
    act(() => app.r.unmount());
  });

  it("returns to the grid when the deep-link target is cleared (re-selecting the tab)", () => {
    let r;
    act(() => { r = create(React.createElement(StrategiesScreen, { t, props: makeProps(), isMobile: false, initialStrategy: "ss" })); });
    expect(textOf(r.toJSON())).toContain("All strategies");                  // detail open via deep-link
    act(() => { r.update(React.createElement(StrategiesScreen, { t, props: makeProps(), isMobile: false, initialStrategy: null })); });
    expect(textOf(r.toJSON())).toContain("Ways to keep more of what you've built");  // back at the grid
    act(() => r.unmount());
  });
});
