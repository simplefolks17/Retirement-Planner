// Horizon design review, Slice 2.5 — the arc's overlay geometry.
//
// Both bugs here are the same mechanism: the SVG is drawn in a 1200-unit
// coordinate space whose HEIGHT is derived from the container's WIDTH, while
// the labels/badges are a sibling HTML overlay in FIXED CSS pixels. Anything
// that has to agree with a pixel size must convert through `VW / w`, and two
// places didn't — the axis padding budget (which shrank until the tick row no
// longer fit) and the end-of-plan badge (centred on a point that, for a
// depleted plan, IS the plot floor).
//
// react-test-renderer has no layout engine, so these assert the pure geometry
// helpers the components use rather than measured pixels — the same "declare
// the contract, don't measure it" approach as touch-targets.test.js.

import { describe, it, expect } from "vitest";
import { axisPadBottom, axisLabelClearancePx, clampOverlayY } from "../ArcGraph.jsx";

// A 10px mono tick label's line box. The clearance must exceed this or the
// chart box's `overflow: hidden` cuts the label in half.
const LABEL_LINE_BOX_PX = 12;

// Real container widths: a 320px phone through a full-width desktop chart.
// (Plan's arc box is the viewport minus ~32px of screen padding.)
const WIDTHS = [288, 320, 358, 390, 430, 600, 640, 900, 1180];

describe("axisPadBottom — the axis tick row always fits (the original clipping bug)", () => {
  it("leaves room for a full label line box at every container width", () => {
    for (const w of WIDTHS) {
      for (const floor of [40, 46]) {          // compact / desktop pad.b floors
        const clearance = axisLabelClearancePx(w, axisPadBottom(w, floor));
        expect(clearance).toBeGreaterThanOrEqual(LABEL_LINE_BOX_PX);
      }
    }
  });

  it("the OLD constant padding is what fails — 390px left under 8px for a 12px label", () => {
    // Documents the bug this replaced: pad.b was a flat 40 on mobile.
    expect(axisLabelClearancePx(390, 40)).toBeLessThan(LABEL_LINE_BOX_PX);
    expect(axisLabelClearancePx(390, 40)).toBeCloseTo(7.8, 1);
  });

  it("desktop is untouched — the floors already cleared the requirement", () => {
    expect(axisPadBottom(1180, 46)).toBe(46);
    expect(axisPadBottom(900, 46)).toBe(46);
  });

  it("never returns LESS than the floor it was given (nothing gets tighter)", () => {
    for (const w of [...WIDTHS, 0, -1, NaN]) {
      expect(axisPadBottom(w, 40)).toBeGreaterThanOrEqual(40);
    }
  });

  it("grows as the container narrows (the budget is pixels, not units)", () => {
    expect(axisPadBottom(320, 40)).toBeGreaterThan(axisPadBottom(640, 40));
    expect(axisPadBottom(640, 40)).toBeGreaterThan(axisPadBottom(1180, 40));
  });
});

describe("clampOverlayY — the end-of-plan badge can't hang off the plot floor", () => {
  // A representative 390px-wide plot: u = 1200/390 ≈ 3.08 units per CSS pixel.
  const u = 1200 / 390;
  const top = 30, bot = 1000;

  it("keeps a badge centred on a $0 ending balance inside the plot", () => {
    const y = clampOverlayY(bot, top, bot, 24, u);      // depleted plan: yEnd === s.bot
    expect(y).toBeLessThan(bot);
    // its lower half must land above the floor
    expect(y + 24 * u).toBeLessThanOrEqual(bot + 1e-9);
  });

  it("clamps at the top edge too (a balance at the very top of the scale)", () => {
    const y = clampOverlayY(top, top, bot, 24, u);
    expect(y).toBeGreaterThan(top);
    expect(y - 24 * u).toBeGreaterThanOrEqual(top - 1e-9);
  });

  it("leaves an ordinary mid-plot position exactly where it was", () => {
    expect(clampOverlayY(500, top, bot, 24, u)).toBe(500);
  });

  it("falls back to the plot midpoint when the plot is too short for either bound", () => {
    expect(clampOverlayY(60, 0, 100, 24, u)).toBe(50);
  });
});
