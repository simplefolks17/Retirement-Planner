import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

import App from "../App.jsx";

// ── BUG-50 gap, found by CodeRabbit's review of PR #66 ────────────────────────
// MoreSheet's trigger declared `aria-haspopup="dialog" aria-expanded={showMore}`
// but the sheet itself had none of the real dialog behaviour every OTHER
// Horizon overlay already got in BUG-50 (ConfirmModal, LifeEventSheet,
// ApplyPreviewModal, all covered by dialog-dismissal.test.js): no
// `role="dialog"`, no `aria-modal`, no Escape handler, no focus move/restore.
// On mobile MoreSheet is the ONLY route to Someday / My details / Settings, so
// this was user-facing, not a cosmetic ARIA gap. Fixed by wiring the same
// shared `useDialogBehaviour` hook the other three overlays use.
//
// Mirrors dialog-dismissal.test.js's assertions but reaches MoreSheet through
// the real App at a mobile viewport (it is a HorizonShell-local, unexported
// component — the same reason horizon-shell-dismissal.test.js reaches
// OnTrackPill's popover the same way).

beforeAll(() => {
  globalThis.window = { innerWidth: 390, addEventListener: () => {}, removeEventListener: () => {} };
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
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
function mount() {
  let r;
  act(() => { r = create(React.createElement(App)); });
  clickByText(r.root, "skip");
  return r;
}
const dialogOf = (root) => root.findAll(n => n.props?.role === "dialog")[0];

describe("BUG-50 (round 2) — MoreSheet is a real dialog, not just a labelled one", () => {
  it("carries role=dialog, aria-modal=true, tabIndex=-1 and a real accessible name", () => {
    const r = mount();
    clickByText(r.root, "⋯More");
    const dlg = dialogOf(r.root);
    expect(dlg, "MoreSheet did not render role=dialog").toBeTruthy();
    expect(dlg.props["aria-modal"]).toBe("true");
    expect(dlg.props.tabIndex).toBe(-1);
    expect(typeof dlg.props["aria-label"]).toBe("string");
    expect(dlg.props["aria-label"].length).toBeGreaterThan(0);
    act(() => r.unmount());
  });

  it("closes on Escape via the card's own onKeyDown (useDialogBehaviour's escapeProps)", () => {
    const r = mount();
    clickByText(r.root, "⋯More");
    expect(dialogOf(r.root)).toBeTruthy();
    const dlg = dialogOf(r.root);
    act(() => { dlg.props.onKeyDown({ key: "Escape", stopPropagation: () => {} }); });
    expect(dialogOf(r.root)).toBeUndefined();
    act(() => r.unmount());
  });

  it("a non-Escape key does not close it", () => {
    const r = mount();
    clickByText(r.root, "⋯More");
    const dlg = dialogOf(r.root);
    act(() => { dlg.props.onKeyDown({ key: "a", stopPropagation: () => {} }); });
    expect(dialogOf(r.root)).toBeTruthy();
    act(() => r.unmount());
  });

  it("the click-to-dismiss backdrop still works and is declared as one", () => {
    const r = mount();
    clickByText(r.root, "⋯More");
    const backdrop = r.root.findAll(n => n.props?.["data-dismiss-backdrop"] != null)[0];
    expect(backdrop, "backdrop missing data-dismiss-backdrop").toBeTruthy();
    act(() => backdrop.props.onClick());
    expect(dialogOf(r.root)).toBeUndefined();
    act(() => r.unmount());
  });

  it("a click inside the sheet does not bubble to the backdrop and close it", () => {
    const r = mount();
    clickByText(r.root, "⋯More");
    const dlg = dialogOf(r.root);
    act(() => { dlg.props.onClick({ stopPropagation: () => {} }); });
    expect(dialogOf(r.root), "clicking inside the card must not dismiss it").toBeTruthy();
    act(() => r.unmount());
  });
});
