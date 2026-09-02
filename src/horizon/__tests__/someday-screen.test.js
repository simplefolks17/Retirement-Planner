// ── SomedayScreen — the photo-upload well ──────────────────────────────────
//
// Regression coverage for a paint-order bug: the clickable photo-upload
// `<div onClick>` (BUG-49's keyboard fix — role="button" + tabIndex + kbActivate)
// sits underneath a purely decorative, full-`inset:0` gradient div rendered
// AFTER it in the JSX. With no `pointerEvents` declared, the later-painted
// gradient intercepted every mouse/touch tap on the photo well — only the
// keyboard path (real onKeyDown on the div itself) still worked. Fixed by
// giving the gradient `pointerEvents: "none"`.

import { describe, it, expect } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import SomedayScreen from "../screens/SomedayScreen.jsx";

function render(el) {
  let r;
  act(() => { r = create(el); });
  return r;
}

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

const t = { ink: "#1a1815", mut: "#6b6560" };
const baseProps = {
  effectiveExpenses: 6500, retirementAge: 65, isSustainable: true,
  activity: "Golf course", setActivity: () => {},
};

describe("SomedayScreen — the photo-upload well", () => {
  it("the decorative gradient overlay never intercepts pointer events", () => {
    const r = render(React.createElement(SomedayScreen, { t, props: baseProps }));
    // Identified structurally by its gradient (it carries no interactive props
    // of its own), not by position — the point is it must stay inert no matter
    // where it sits in the tree.
    const overlay = r.root.findAll(n =>
      typeof n.props?.style?.background === "string"
      && n.props.style.background.includes("rgba(18,14,10")
    )[0];
    expect(overlay, "gradient overlay not found").toBeTruthy();
    expect(overlay.props.style.pointerEvents).toBe("none");
    act(() => r.unmount());
  });

  // Rule 11: effectiveExpenses is today's dollars — the hero figure needs a
  // scoped, local basis caption (there is no other dollar figure on this
  // screen for it to disagree with, unlike NumbersScreen's mixed-basis tab).
  it("the hero dollar figure carries a today's-dollars caption", () => {
    const r = render(React.createElement(SomedayScreen, { t, props: baseProps }));
    const allText = textOf(r.toJSON());
    expect(allText).toContain("in today's dollars");
    act(() => r.unmount());
  });

  it("the photo well underneath is still a real click + keyboard target", () => {
    const r = render(React.createElement(SomedayScreen, { t, props: baseProps }));
    const well = r.root.findAll(n =>
      n.props?.role === "button" && n.props?.["aria-label"] === "Add a photo")[0];
    expect(well).toBeTruthy();
    expect(typeof well.props.onClick).toBe("function");
    expect(typeof well.props.onKeyDown).toBe("function");
    expect(well.props.tabIndex).toBe(0);
    act(() => r.unmount());
  });
});
