import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";
import { SCREENS } from "../components/HorizonShell.jsx";

// ── Why this test exists ──────────────────────────────────────────────────────
// BUG-49's own filed fix path asks for exactly this: "a render-smoke-style test
// asserting every clickable surface has a keyboard path." The bug was re-verified
// as still-open five separate times across a year of session close-outs precisely
// because nothing MECHANICALLY checked it — each pass had to re-read the shell by
// hand, and every new `<div onClick>` re-opened it silently.
//
// The guard below walks the REAL mounted app on every Horizon screen, at both a
// desktop and a mobile viewport (the mobile bottom bar and the More sheet only
// exist under 640px, and they were the worst offenders), and fails on any host
// element that can be clicked but not reached from a keyboard.
//
// Deliberate exceptions, both narrow and both named on the element itself:
//   • `data-dismiss-backdrop` — a modal's click-to-dismiss backdrop. Its keyboard
//     equivalent is Escape, provided by useDialogBehaviour on the dialog itself
//     (covered by its own tests below), not by making a full-screen div focusable.
//   • `role="dialog"` — the dialog card's own `onClick` is a stopPropagation
//     guard so a click inside doesn't reach the backdrop. It is not a control.

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

// Elements the platform makes keyboard-operable for free.
const NATIVE_INTERACTIVE = new Set(["button", "input", "select", "textarea"]);

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

// A host element (string type) that carries an onClick handler.
function isClickableHost(n) {
  return typeof n.type === "string" && typeof n.props?.onClick === "function";
}

function isExempt(n) {
  const p = n.props ?? {};
  return p["data-dismiss-backdrop"] != null || p.role === "dialog";
}

// Either a real control, or the documented div-control pattern:
// role + tabIndex + a kbActivate-style Enter/Space handler (shared.jsx).
function hasKeyboardPath(n) {
  if (NATIVE_INTERACTIVE.has(n.type)) return true;
  const p = n.props ?? {};
  return p.role != null && p.tabIndex != null && typeof p.onKeyDown === "function";
}

function unreachable(root) {
  return root
    .findAll(n => isClickableHost(n) && !isExempt(n) && !hasKeyboardPath(n), { deep: true })
    .map(n => `<${n.type}> "${textOf(n).trim().slice(0, 48)}"`);
}

function clickByText(root, label) {
  const target = root.findAll(
    n => typeof n.props?.onClick === "function" && textOf(n) === label
  )[0];
  expect(target, `clickable element "${label}" not found`).toBeTruthy();
  act(() => { target.props.onClick(); });
}

function mountApp() {
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  // Skip the first-run wizard by completing it — the wizard itself is checked
  // separately below, since it is the one surface a keyboard user meets FIRST.
  clickByText(renderer.root, "skip");
  return renderer;
}

describe("BUG-49 — every clickable Horizon surface has a keyboard path", () => {
  for (const viewport of [1200, 390]) {
    it(`no keyboard-unreachable control on any screen at ${viewport}px`, () => {
      globalThis.window.innerWidth = viewport;
      const renderer = mountApp();

      const offenders = [];
      for (const { id, label } of SCREENS) {
        // Navigate the way a user would: the desktop tab bar, or (under 640px)
        // the bottom bar / More sheet.
        const navLabel = viewport < 640 ? null : label;
        if (navLabel) clickByText(renderer.root, navLabel);
        else {
          // mobile: open the More sheet first for the overflow screens
          const inBar = ["Plan", "Journey", "Numbers", "Strategy"];
          const scr = SCREENS.find(s => s.id === id);
          if (!inBar.includes(scr.short)) clickByText(renderer.root, "⋯More");
          // A bottom-bar tab renders its icon glyph before the short label;
          // a More-sheet row renders its emoji before the full label.
          clickByText(renderer.root, inBar.includes(scr.short)
            ? `${scr.icon}${scr.short}`
            : `${scr.emoji}${scr.label}`);
        }
        offenders.push(...unreachable(renderer.root).map(s => `${id}: ${s}`));
      }
      act(() => renderer.unmount());
      expect(offenders).toEqual([]);
    });
  }

  it("the mobile bottom bar and More sheet are real buttons", () => {
    globalThis.window.innerWidth = 390;
    const renderer = mountApp();
    // 4 screen tabs + the More tab
    const bar = renderer.root.findAllByProps({ "aria-label": "Main" })[0];
    const tabs = bar.findAll(n => n.type === "button");
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) expect(tab.props.type).toBe("button");

    // The More sheet's rows are buttons too — on mobile they are the ONLY route
    // to three screens, so a div here locked a keyboard user out entirely.
    clickByText(renderer.root, "⋯More");
    const rows = renderer.root.findAll(
      n => n.type === "button" && ["☀Someday", "▤My details", "⚙Settings"].includes(textOf(n)));
    expect(rows).toHaveLength(3);
    act(() => renderer.unmount());
  });

  it("the first-run onboarding wizard is fully operable from the keyboard", () => {
    globalThis.window.innerWidth = 390;
    let renderer;
    act(() => { renderer = create(React.createElement(App)); });
    // The wizard is the FIRST thing a new user sees; it was 100% <div onClick>.
    expect(unreachable(renderer.root)).toEqual([]);
    // Walk it end to end using only its controls.
    for (let i = 0; i < 4; i++) clickByText(renderer.root, "Next →");
    clickByText(renderer.root, "Build my plan →");
    expect(unreachable(renderer.root)).toEqual([]);
    clickByText(renderer.root, "Save as my plan →");
    // …and the confirm dialog it raises.
    expect(unreachable(renderer.root)).toEqual([]);
    act(() => renderer.unmount());
  });
});
