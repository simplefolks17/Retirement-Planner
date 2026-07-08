import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { fmtMoney } from "../model/apply-preview.js";

// ── WI-3.6 (#103) conversionView wiring + WI-3.9 Apply-site self-consistency ──
// Renders App (HorizonShell mocked to capture its props, same harness as
// setter-bundles.test.js) and asserts the conversionView bundle is wired
// coherently at the DEFAULT state — every expectation is computed from OTHER
// captured fields (self-consistent), never a hardcoded age or dollar figure,
// so a deliberate golden-master move doesn't break this file.
//
// The second half fires setters through the captured WI-3.1 bundles to make the
// optimizer suggestion applicable (enable Medicare, switch to a $0 custom
// conversion) and locks the WI-3.9 anti-divergence guarantee: the preview's
// netBenefit "after" string must equal the optimizer's own optimalBenefit
// (one objective, two surfaces — the BUG-31/BUG-35 class guard).

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

describe("conversionView wiring (WI-3.6)", () => {
  it("window label is self-consistent with the resolved window fields", () => {
    const app = mount();
    const { window: w } = app.latest().conversionView;

    expect(w.hasConvWindow).toBe(true);
    // Label built from the same fields the flow renders — one construction.
    expect(w.windowLabel).toBe(
      `${w.windowYrs}-year window · age ${w.startAge} → ${w.endAge}`);
    // Default state: both window overrides null → the "Auto" edge state.
    expect(w.isDefaultWindow).toBe(true);
    // Field objects carry their own bounds (rule 1 / rule 10).
    expect(w.startAgeField.value).toBe(w.startAge);
    expect(w.endAgeField.value).toBe(w.endAge);
    expect(w.startAgeField.min).toBeLessThanOrEqual(w.startAgeField.max);

    app.unmount();
  });

  it("Apply site is gated OFF at the default state (no healthcare toggles)", () => {
    const app = mount();
    const site = app.latest().conversionView.optimizer.applySuggestion;

    expect(site.available).toBe(false);
    expect(site.preview).toBeNull();
    expect(typeof site.apply).toBe("function");

    app.unmount();
  });

  it("rmdCompare rows are populated from the noConv baseline (never fabricated)", () => {
    const app = mount();
    const { rmdCompare } = app.latest().conversionView.tables;

    expect(rmdCompare.length).toBeGreaterThan(0);
    for (const row of rmdCompare) {
      // Every baseline row carries a real noConv RMD — the model never
      // synthesizes a 0 for a missing plan-side row (withConv may be null).
      expect(Number.isFinite(row.noConv)).toBe(true);
      expect(row.noConv).toBeGreaterThan(0);
    }

    app.unmount();
  });

  it("events section: empty rows, below cap, working years available at default", () => {
    const app = mount();
    const { events } = app.latest().conversionView;

    expect(events.rows).toEqual([]);
    expect(events.atMax).toBe(false);
    expect(events.hasWorkingYears).toBe(true);
    expect(events.inServiceField.value).toBe(false);

    app.unmount();
  });

  it("preview's netBenefit 'after' equals the optimizer's own objective (anti-divergence)", () => {
    const app = mount();

    // Make the suggestion applicable: Medicare on (healthcare gate) + a $0
    // custom conversion (any positive optimum then differs by > $4,999).
    // Mode switch fired LAST so the (startAge, amount) search runs once.
    app.fire(() => app.latest().conversion.annualConversionAmt.set(0));
    app.fire(() => app.latest().health.hasMedicare.set(true));
    app.fire(() => app.latest().conversion.conversionMode.set("custom"));

    const { optimizer } = app.latest().conversionView;
    const site = optimizer.applySuggestion;

    expect(site.available).toBe(true);
    expect(site.preview).not.toBeNull();
    expect(site.preview.metrics.map(m => m.id)).toEqual(
      ["netBenefit", "longevity", "balAtRef", "rmdTax"]);

    // The anti-divergence lock (BUG-31/BUG-35 class): the preview's candidate
    // net benefit IS the optimizer's optimalBenefit — one objective, rendered
    // on two surfaces, so they can never diverge.
    const netRow = site.preview.metrics.find(m => m.id === "netBenefit");
    expect(netRow.after).toBe(fmtMoney(optimizer.suggestedBenefit));

    app.unmount();
  });
});
