import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";

// ── BUG-50, as originally filed ───────────────────────────────────────────────
// OnTrackPill's popover closed ONLY via its own ✕ or by re-clicking the pill.
// Clicking anywhere else — including navigating to a different screen — left it
// pinned over the top-right corner. It is the one overlay in the app with no
// backdrop, so it gets its own document-level outside-click listener rather than
// ConfirmModal's backdrop-click; Escape is handled alongside it.
//
// The suite runs with `environment: "node"`, so this file installs the minimal
// `document` the listener needs and captures the handlers it registers, then
// invokes them — the same thing a real click/keypress would do.

const listeners = {};
let sawRemove = [];

function stubDocument() {
  for (const k of Object.keys(listeners)) delete listeners[k];
  sawRemove = [];
  globalThis.document = {
    activeElement: null,
    addEventListener: (kind, fn) => { (listeners[kind] ??= new Set()).add(fn); },
    removeEventListener: (kind, fn) => { sawRemove.push(kind); listeners[kind]?.delete(fn); },
  };
}

const fire = (kind, event) => {
  for (const fn of [...(listeners[kind] ?? [])]) act(() => fn(event));
};

beforeEach(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { innerWidth: 1200, addEventListener: () => {}, removeEventListener: () => {} };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  stubDocument();
});
afterEach(() => {
  delete globalThis.window;
  delete globalThis.ResizeObserver;
  delete globalThis.document;
});

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

const INSIDE = { id: "inside-the-pill" };

function mount() {
  let r;
  act(() => {
    r = create(React.createElement(App), {
      // The popover's wrapper uses ref.contains() to tell an inside click from
      // an outside one; react-test-renderer has no DOM nodes, so supply one.
      createNodeMock: (el) => (el.type === "span" ? { contains: (n) => n === INSIDE } : null),
    });
  });
  const skip = r.root.findAll(n => typeof n.props?.onClick === "function" && textOf(n) === "skip")[0];
  act(() => skip.props.onClick());
  return r;
}

const pill = (root) => root.findAll(
  n => n.type === "button" && typeof n.props?.["aria-label"] === "string"
    && n.props["aria-label"].startsWith("Plan status:"))[0];

const isOpen = (root) => pill(root).props["aria-expanded"] === true;

describe("BUG-50 — the OnTrackPill popover can be dismissed", () => {
  it("is a real <button> with aria-expanded, and opens on activation", () => {
    const r = mount();
    expect(pill(r.root).props.type).toBe("button");
    expect(isOpen(r.root)).toBe(false);
    act(() => pill(r.root).props.onClick());
    expect(isOpen(r.root)).toBe(true);
    expect(r.root.findAll(n => textOf(n) === "What drives this").length).toBeGreaterThan(0);
    act(() => r.unmount());
  });

  it("closes on a click outside it, and stays open for a click inside", () => {
    const r = mount();
    act(() => pill(r.root).props.onClick());
    expect(isOpen(r.root)).toBe(true);

    fire("pointerdown", { target: INSIDE });
    expect(isOpen(r.root), "a click inside the popover must not dismiss it").toBe(true);

    fire("pointerdown", { target: { id: "somewhere-else" } });
    expect(isOpen(r.root)).toBe(false);
    act(() => r.unmount());
  });

  it("closes on Escape", () => {
    const r = mount();
    act(() => pill(r.root).props.onClick());
    expect(isOpen(r.root)).toBe(true);
    fire("keydown", { key: "a" });
    expect(isOpen(r.root)).toBe(true);
    fire("keydown", { key: "Escape" });
    expect(isOpen(r.root)).toBe(false);
    act(() => r.unmount());
  });

  it("registers no listeners while closed, and removes them when it closes", () => {
    const r = mount();
    expect(listeners.pointerdown?.size ?? 0).toBe(0);
    act(() => pill(r.root).props.onClick());
    expect(listeners.pointerdown.size).toBe(1);
    fire("keydown", { key: "Escape" });
    expect(listeners.pointerdown.size).toBe(0);
    expect(sawRemove).toContain("pointerdown");
    expect(sawRemove).toContain("keydown");
    act(() => r.unmount());
  });
});
