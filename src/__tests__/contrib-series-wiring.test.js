import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { sumAccountRow } from "../model/accumulation.js";

// ── contribSeries — the Sources view's "money you put in" line ────────────────
//
// This series is subtracted from the total arc to shade the "Market growth" band
// (ArcGraph.jsx `sourcesModel`/`SourcesSvg`, legend "Market growth" / "Your
// contributions"). Before 2026-09-06 it was asserted by NO test at all, and it was
// broken three ways at the SHIPPED DEFAULT:
//
//   BUG-139  the per-row cap inlined a fourth copy of the account-sum using key names
//            runSimulation has never produced (`row.trad` etc. vs "Trad 401k"), so
//            every term coalesced to 0 via `?? 0`, the cap was 0, and Math.min pinned
//            the series to zero from the second point on — 1 nonzero point of 60. The
//            chart credited 100% of the portfolio to market growth.
//   BUG-140  primary-only, while the chart it is drawn against is household — so a
//            spouse's entire rollover balance was shaded as market growth.
//   BUG-141  started a year late and ran the full 60-year sim to age 90, while
//            sourcesModel closes the band with `tPts.slice(0, cPts.length)` (a slice
//            by COUNT, not age) — so the band was a year out of register and extended
//            decades past retirement.
//
// These assertions are deliberately structural (shape, alignment, invariants) rather
// than exact dollar locks: the golden masters pin headline numbers, and what was
// missing here was any check that the series is a real series at all.

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

describe("contribSeries (Sources view)", () => {
  it("BUG-139: is a real series at the shipped default, not pinned to zero", () => {
    const app = mount();
    const cs = app.latest().contribSeries;
    expect(cs.length).toBeGreaterThan(2);
    // Pre-fix this was exactly 1 (the initial balance, then zeros forever).
    expect(cs.filter(p => p.contrib > 0).length).toBe(cs.length);
    // And it must actually GROW — a flat line would also pass a bare > 0 check.
    expect(cs[cs.length - 1].contrib).toBeGreaterThan(cs[0].contrib);
    app.unmount();
  });

  it("BUG-139: the cap reads the same account keys the simulation actually emits", () => {
    const app = mount();
    const row = app.latest().simData[0];
    // The names the buggy code used. If any of these ever becomes defined, the
    // original inlined cap would silently start "working" and this test should be
    // revisited rather than deleted.
    expect(row.trad).toBeUndefined();
    expect(row.roth).toBeUndefined();
    expect(row.taxable).toBeUndefined();
    expect(row.hsa).toBeUndefined();
    // The canonical accessor is what contribSeries now uses.
    expect(sumAccountRow(row)).toBeGreaterThan(0);
    app.unmount();
  });

  it("BUG-141: starts at currentAge and stops at the retirement age, matching the chart", () => {
    const app = mount();
    const l = app.latest();
    const cs = l.contribSeries;
    const currentAge = l.assumptions.currentAge.value;
    const retAge = l.assumptions.retirementAge.value;
    expect(cs[0].age).toBe(currentAge);
    expect(cs[cs.length - 1].age).toBe(retAge);
    // Same first row as buildAccumChart, so sourcesModel's slice-by-count aligns.
    expect(l.chartData[0].age).toBe(cs[0].age);
    app.unmount();
  });

  it("BUG-141: never exceeds the total it is subtracted from (no negative growth band)", () => {
    const app = mount();
    const l = app.latest();
    for (const p of l.contribSeries) {
      const chartPoint = l.chartData.find(d => d.age === p.age);
      expect(chartPoint).toBeDefined();
      // +1 for rounding: the chart rounds, the series does not.
      expect(p.contrib).toBeLessThanOrEqual(chartPoint.total + 1);
    }
    app.unmount();
  });

  it("BUG-140: is HOUSEHOLD — a spouse's starting balance is not shaded as market growth", () => {
    const app = mount();
    const primaryOnlyStart = app.latest().contribSeries[0].contrib;

    app.fire(() => app.latest().profile.filingStatus.set("mfj"));
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(30));
    app.fire(() => app.latest().profile.spouseIncome.set(120_000));
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(400_000));

    const l = app.latest();
    // The spouse's rollover is money PUT IN, so it must appear in the contribution
    // line's first point — pre-fix the line stayed at the primary-only figure and the
    // chart's extra $400k was attributed entirely to growth.
    expect(l.contribSeries[0].contrib).toBe(primaryOnlyStart + 400_000);
    // ...and the two series agree at t0, which is the property that makes the band real.
    expect(l.contribSeries[0].contrib).toBe(l.chartData[0].total);
    app.unmount();
  });

  it("stays byte-identical to the primary-only series when there is no spouse", () => {
    const app = mount();
    const l = app.latest();
    // No spouse ⇒ spouseSimData is [] and the spouse scalars are 0, so every point is
    // reproducible from the primary sim alone. This is the inertness guarantee that
    // keeps the no-spouse golden masters unmoved.
    const contribAnnual = l.accounts.trad401k.contrib.value + l.accounts.roth.contrib.value
      + l.accounts.taxable.contrib.value + l.accounts.hsa.contrib.value;
    const start = l.accounts.trad401k.bal.value + l.accounts.roth.bal.value
      + l.accounts.taxable.bal.value + l.accounts.hsa.bal.value;
    expect(l.contribSeries[0].contrib).toBe(start);
    expect(l.contribSeries[1].contrib).toBe(start + contribAnnual);
    app.unmount();
  });
});
