import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// The Vercel Analytics component injects a <script> via `document` in its mount
// effect — irrelevant to this smoke and unavailable in node; render nothing.
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";
import { SCREENS } from "../components/HorizonShell.jsx";

// Effects run under react-test-renderer (unlike renderToString) — stub the two
// browser APIs the shell's layout effects touch in this node environment.
beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {
      innerWidth: 1200,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => {
  delete globalThis.window;
  delete globalThis.ResizeObserver;
});

// ── Why this test exists ──────────────────────────────────────────────────────
// The plain render-smoke only reaches the default Plan screen. This drives the
// real HorizonShell navigation so every screen actually mounts at golden-master
// defaults (exercising statementView / chartMilestones / yearlyRows / planView /
// flowDown consumption and the calcWhatIfScenario one-run path).
//
// Two anti-"slip-through" mechanisms here:
//   1. The screen list is driven from the EXPORTED `SCREENS` (HorizonShell's own
//      source of truth), not a hand-maintained copy — so a newly added screen is
//      navigated to automatically by the per-screen loop below.
//   2. A truthy render tree (`toJSON()`) is NOT accepted as proof a screen
//      worked: a blanked-out screen or an error-boundary fallback still yields a
//      truthy tree. Each screen asserts an always-visible, screen-specific text
//      MARKER, and the coverage guard fails if a screen lacks one.

// Per-screen proof-of-render markers, keyed by screen id. Each is an
// always-visible text fragment that ONLY that screen renders — never behind a
// collapsed toggle or a non-default sub-tab — so finding it proves the screen's
// own body mounted (not a fallback). See the coverage guard below.
const SCREEN_MARKERS = {
  plan:     "Income for life",        // PlanScreen stat-card label
  journey:  "Building years",         // JourneyScreen Chapter 2 headline
  numbers:  "Year by year",           // NumbersScreen tab label (always rendered)
  strategies: "Ways to keep more of what you've built", // StrategiesScreen subtitle (card-grid root)
  someday:  "work optional.",         // SomedayScreen display copy
  details:  "The facts behind your plan", // MyDetailsScreen subtitle (always visible)
  settings: "Theme",                  // SettingsScreen section header
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Collect the visible text of a test-renderer instance.
function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function clickByText(root, label) {
  const target = root.findAll(
    n => typeof n.props?.onClick === "function" && textOf(n) === label
  )[0];
  expect(target, `clickable element "${label}" not found`).toBeTruthy();
  act(() => { target.props.onClick(); });
}

function hasText(root, fragment) {
  return root.findAll(n => textOf(n).includes(fragment)).length > 0;
}

// Total visible text length of the mounted app — a blank / collapsed screen
// renders a near-empty content area even when the chrome is present.
function visibleTextLength(renderer) {
  const json = renderer.toJSON();
  return textOf(Array.isArray(json) ? { children: json } : json).trim().length;
}

// Mount App and dismiss the first-run onboarding (non-browser env has no
// persisted flag). Returns { renderer, root }.
function mountApp() {
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  const root = renderer.root;
  const skip = root.findAll(
    n => typeof n.props?.onClick === "function" && /^skip/i.test(textOf(n).trim())
  )[0];
  if (skip) act(() => { skip.props.onClick(); });
  return { renderer, root };
}

describe("Horizon screens render smoke", () => {
  // Coverage guard: every screen the shell knows about must have a marker, and
  // every marker must map to a real screen. This is what stops a newly added
  // screen from silently going untested — adding to SCREENS without a marker
  // (or vice-versa) fails here loudly instead of slipping through.
  it("has a render marker for every screen in SCREENS (and no orphan markers)", () => {
    const screenIds = SCREENS.map(s => s.id).sort();
    const markerIds = Object.keys(SCREEN_MARKERS).sort();
    expect(markerIds, "SCREEN_MARKERS must cover exactly the screens in SCREENS").toEqual(screenIds);
  });

  // One isolated test per screen, driven from the exported SCREENS list. A fresh
  // App per screen avoids cross-screen state bleed, and each failure points at
  // exactly one screen instead of halting a monolithic walk at the first break.
  it.each(SCREENS.map(s => [s.id, s.label]))(
    "renders the %s screen with its own content (not a blank/fallback tree)",
    (id, label) => {
      const { renderer, root } = mountApp();
      // Plan is the default screen; the rest need a tab click.
      if (id !== "plan") clickByText(root, label);

      // 1. tree exists
      expect(renderer.toJSON(), `${id}: render tree is empty`).toBeTruthy();
      // 2. screen-specific marker present (proves the right body mounted)
      expect(hasText(root, SCREEN_MARKERS[id]), `${id}: marker "${SCREEN_MARKERS[id]}" not found`).toBe(true);
      // 3. substantial visible text (guards against a blanked content area)
      expect(visibleTextLength(renderer), `${id}: content area looks empty`).toBeGreaterThan(80);

      act(() => renderer.unmount());
    }
  );

  // Deep-path coverage that a single per-screen marker can't reach:

  it("Numbers renders all five sub-tabs (Statement / Budget / Accounts / Taxes / Year by year)", () => {
    const { renderer, root } = mountApp();
    clickByText(root, "The numbers");
    for (const tab of ["Statement", "Budget", "Accounts", "Taxes", "Year by year"]) {
      clickByText(root, tab);
      expect(renderer.toJSON(), `Numbers/${tab}: render tree is empty`).toBeTruthy();
      expect(visibleTextLength(renderer), `Numbers/${tab}: content looks empty`).toBeGreaterThan(80);
    }
    act(() => renderer.unmount());
  });

  it("Plan runs the lever-preview path when a 'Try a change' quick-jump chip is tapped", () => {
    const { renderer, root } = mountApp();
    // Plan is the default screen. Open the Explore tray's "Try a change" facet.
    const changeTab = root.findAll(
      n => n.type === "button" && textOf(n).includes("Try a change")
    )[0];
    expect(changeTab, "Explore tray 'Try a change' facet not found").toBeTruthy();
    act(() => { changeTab.props.onClick(); });
    const jumpChip = root.findAll(
      n => n.type === "button" && textOf(n).includes("Retire 2 yrs earlier")
    )[0];
    expect(jumpChip, "Try-a-change quick-jump chip not found").toBeTruthy();
    act(() => { jumpChip.props.onClick(); });
    expect(renderer.toJSON()).toBeTruthy();
    act(() => renderer.unmount());
  });

  it("Plan places a goal via the Explore tray Goals facet (LifeEventSheet opens)", () => {
    const { renderer, root } = mountApp();
    const goalsTab = root.findAll(
      n => n.type === "button" && textOf(n).includes("Goals")
    )[0];
    expect(goalsTab, "Explore tray 'Goals' facet not found").toBeTruthy();
    act(() => { goalsTab.props.onClick(); });
    // A preset quick-add opens the sheet in NEW mode.
    const preset = root.findAll(
      n => n.type === "button" && textOf(n).includes("Buy a home")
    )[0];
    expect(preset, "Goals preset quick-add not found").toBeTruthy();
    act(() => { preset.props.onClick(); });
    expect(renderer.toJSON()).toBeTruthy();
    expect(visibleTextLength(renderer)).toBeGreaterThan(80);
    act(() => renderer.unmount());
  });
});
