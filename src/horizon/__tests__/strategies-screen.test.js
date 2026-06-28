import { describe, it, expect } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import StrategiesScreen from "../screens/StrategiesScreen.jsx";

// ── WI-3.3 (#100) StrategiesScreen ───────────────────────────────────────────
// The screen is pure layout over horizonProps: cards whose headline is already
// wired read it directly (netConversionBenefit / yr1TaxSavings / budget.*); the
// rest come from strategiesView, where the App memo pre-computes `applicable`.
// These synthetic props mirror the golden-master default so the headline
// value-locks (incl. the NEGATIVE Roth benefit) catch a wiring regression.

const t = new Proxy({}, { get: () => "#334155" });

function makeProps(overrides = {}) {
  return {
    // already-wired headlines (read directly by the screen):
    netConversionBenefit: -9_854,   // golden-master default — negative on purpose
    conversionWindowYrs: 7,
    yr1TaxSavings: 12_400,
    budget: { availableSurplus: 18_000 },
    // not-yet-wired card scalars + applicability flags:
    strategiesView: {
      conversion: { applicable: true },
      rmd:        { applicable: true, firstRMDAmount: 62_508, firstRMDAge: 73 },
      ss:         { applicable: true, ssMonthly: 4_010, ssAnnual: 48_120, claimAge: 67, breakEven: null, delayGainYrs: null },
      withdrawal: { applicable: true },
      surplus:    { applicable: true },
      mega:       { applicable: true, capacity: 30_000, growth: [{ yrs: 5, val: 170_000 }, { yrs: 10, val: 390_000 }] },
    },
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
    expect(txt).toContain("$4,010/mo");        // SS monthly
    expect(txt).toContain("$62,508");          // first RMD
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

  it("opens a strategy's detail flow and returns via back", () => {
    const app = mount(makeProps());
    app.click(n => textOf(n).startsWith("Social Security timing"));   // open the SS card
    let txt = app.text();
    expect(txt).toContain("All strategies");          // back affordance present
    expect(txt).toContain("Annual benefit");          // read-only stub detail row
    expect(txt).toContain("$48,120");                 // ss annual value-lock
    app.click(n => textOf(n) === "‹ All strategies");
    expect(app.text()).toContain("Ways to keep more of what you've built");  // back at the grid
    act(() => app.r.unmount());
  });

  it("deep-links straight into a strategy via initialStrategy", () => {
    const app = mount(makeProps(), { initialStrategy: "rmd" });
    const txt = app.text();
    expect(txt).toContain("RMD outlook");             // detail title
    expect(txt).toContain("First RMD age");           // stub row only in detail
    expect(txt).toContain("age 73");
    act(() => app.r.unmount());
  });
});
