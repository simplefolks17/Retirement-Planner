import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";
import { SCREENS } from "../components/HorizonShell.jsx";

// ── Why this test exists ──────────────────────────────────────────────────────
// The Horizon design review's exhaustive sweep found ~35 interactive elements
// under the 44px touch-target guideline — the worst at ~14px (a bare `<button>`
// with no padding at all). They were all the same failure: every button was a
// one-off inline style object, so nobody was checking.
//
// Slice 2 migrated them onto the shared Btn (44px) / Pill (40px) primitives.
// This guard keeps them there. It walks the REAL app at a phone viewport, on
// every screen, and requires every rendered <button> to DECLARE a height floor.
//
// "Declare" is the deliberate bar. react-test-renderer has no layout engine, so
// a computed height is not available — but requiring the declaration is stricter
// than measuring anyway: a card that happens to be 80px tall today can shrink
// when its content changes, whereas `minHeight` cannot. Two big-by-nature cards
// (LockedCard, StrategyCard) therefore declare 44 even though they never render
// near it, which is the point — the floor is a contract, not an observation.

const FLOOR = 40; // Pill's tier (StatCard's existing convention); Btn is 44.

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { innerWidth: 390, addEventListener: () => {}, removeEventListener: () => {} };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => {
  delete globalThis.window;
  delete globalThis.ResizeObserver;
});

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function clickByText(root, label) {
  const target = root.findAll(
    n => typeof n.props?.onClick === "function" && textOf(n) === label)[0];
  expect(target, `clickable element "${label}" not found`).toBeTruthy();
  act(() => { target.props.onClick(); });
}

function undersized(root) {
  return root.findAll(n => n.type === "button")
    .filter(n => {
      const st = n.props?.style ?? {};
      // A fixed `height` counts: the square ± steppers set both.
      const h = typeof st.minHeight === "number" ? st.minHeight : st.height;
      return !(typeof h === "number" && h >= FLOOR);
    })
    .map(n => `"${textOf(n).trim().slice(0, 40)}" (${n.props?.style?.minHeight ?? "none"})`);
}

function mountApp() {
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  clickByText(renderer.root, "skip");
  return renderer;
}

describe("every Horizon button declares a ≥40px touch target", () => {
  it("holds on every screen at a 390px phone viewport", () => {
    globalThis.window.innerWidth = 390;
    const renderer = mountApp();

    const offenders = [];
    const inBar = ["Plan", "Journey", "Numbers", "Strategy"];
    for (const scr of SCREENS) {
      if (!inBar.includes(scr.short)) clickByText(renderer.root, "⋯More");
      clickByText(renderer.root, inBar.includes(scr.short)
        ? `${scr.icon}${scr.short}` : `${scr.emoji}${scr.label}`);
      offenders.push(...undersized(renderer.root).map(s => `${scr.id}: ${s}`));
    }
    act(() => renderer.unmount());
    expect(offenders).toEqual([]);
  });

  it("holds inside Plan's Explore tray, both facets", () => {
    globalThis.window.innerWidth = 390;
    const renderer = mountApp();
    // The tray's own facet tabs, the retire-at quick-jump chips, and the goal
    // preset pills all live behind a collapsed bar, so the screen sweep above
    // never reaches them.
    clickByText(renderer.root, "⚙Try a change");
    expect(undersized(renderer.root)).toEqual([]);
    clickByText(renderer.root, "✦Goals");
    expect(undersized(renderer.root)).toEqual([]);
    act(() => renderer.unmount());
  });

  it("holds across the Numbers tabs, which each render their own controls", () => {
    globalThis.window.innerWidth = 390;
    const renderer = mountApp();
    clickByText(renderer.root, "▦Numbers");
    for (const tab of ["Statement", "Budget", "Accounts", "Taxes", "Year by year"]) {
      clickByText(renderer.root, tab);
      expect(undersized(renderer.root), `Numbers → ${tab}`).toEqual([]);
    }
    act(() => renderer.unmount());
  });
});
