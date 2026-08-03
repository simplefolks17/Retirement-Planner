import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";

// ── Why this test exists ──────────────────────────────────────────────────────
// Horizon has no CSS media queries: ALL responsiveness runs through one
// `isMobile` boolean that HorizonShell threads to each screen as a prop. That
// makes a missing prop invisible — the screen just quietly renders its desktop
// layout forever, and its own default (`isMobile = false`) hides the omission
// from a screen-level unit test too.
//
// Two of the seven screens were in exactly that state (Someday, Settings). This
// mounts the REAL app, so it fails if the prop stops being passed OR if the
// branch it drives is removed — the same "mount the real thing" reasoning as
// golden-master-app-wiring.test.js, applied to layout.

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

function mountAppAt(width) {
  globalThis.window.innerWidth = width;
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  clickByText(renderer.root, "skip");
  return renderer;
}

// Every declared style object in the tree, flattened.
function styles(root) {
  return root.findAll(n => n.props?.style != null && typeof n.type === "string")
    .map(n => n.props.style);
}

// The overflow screens (Someday, Settings) live behind the mobile More sheet
// and behind the desktop tab bar, so navigation differs by width.
function goToOverflow(renderer, label, emoji, width) {
  if (width < 640) {
    clickByText(renderer.root, "⋯More");
    clickByText(renderer.root, `${emoji}${label}`);
  } else {
    clickByText(renderer.root, label);
  }
}

describe("SettingsScreen honours isMobile (it was never passed the prop)", () => {
  it("stacks into one column at 390px", () => {
    const renderer = mountAppAt(390);
    goToOverflow(renderer, "Settings", "⚙", 390);
    const st = styles(renderer.root);
    // The two-column shell: a ≥260px controls column beside a fixed 300px
    // preview, gap 44 — 604px of declared minimum inside a 390px viewport.
    expect(st.some(s => s.flexDirection === "column" && s.gap === 28)).toBe(true);
    expect(st.some(s => s.width === 300)).toBe(false);
    expect(st.some(s => s.minWidth === 260)).toBe(false);
    act(() => renderer.unmount());
  });

  it("keeps the two-column desktop layout at 1200px", () => {
    const renderer = mountAppAt(1200);
    goToOverflow(renderer, "Settings", "⚙", 1200);
    const st = styles(renderer.root);
    expect(st.some(s => s.width === 300)).toBe(true);
    expect(st.some(s => s.minWidth === 260)).toBe(true);
    act(() => renderer.unmount());
  });
});

describe("SomedayScreen honours isMobile (it was never passed the prop)", () => {
  const has62px = (st) => st.some(s => typeof s.font === "string" && s.font.includes("62px"));

  it("drops the 62px display headline at 390px", () => {
    const renderer = mountAppAt(390);
    goToOverflow(renderer, "Someday", "☀", 390);
    const st = styles(renderer.root);
    expect(has62px(st)).toBe(false);
    expect(st.some(s => typeof s.font === "string" && s.font.includes("40px"))).toBe(true);
    // 44px of side padding on a 390px screen, too.
    expect(st.some(s => s.padding === "32px 44px")).toBe(false);
    act(() => renderer.unmount());
  });

  it("keeps the 62px display headline at 1200px", () => {
    const renderer = mountAppAt(1200);
    goToOverflow(renderer, "Someday", "☀", 1200);
    expect(has62px(styles(renderer.root))).toBe(true);
    act(() => renderer.unmount());
  });
});
