import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

import { Btn, Pill } from "../shared.jsx";

// The three invariants Btn/Pill exist to make unforgettable (shared.jsx's own
// header comment): a reserved 1px border, a label that never wraps, and a real
// touch target. Each was the direct cause of a confirmed bug, so each gets an
// assertion here rather than only being enforced at the call sites.

const t = {
  bg: "#0b0f14", surf: "#131a22", surf2: "#182029", line: "#1f2937", line2: "#2a3441",
  ink: "#e6edf3", mut: "#8b949e", faint: "#5b6572", accent: "#4f8cff",
  good: "#3fb950", warm: "#e3a008",
};

function render(el) {
  let r;
  act(() => { r = create(el); });
  return r;
}
const btnOf = (r) => r.root.findAll(n => n.type === "button")[0];

describe("Btn — the invariants", () => {
  it("is a real <button type=\"button\"> (not a div with a role)", () => {
    const r = render(React.createElement(Btn, { t }, "Go"));
    expect(btnOf(r).props.type).toBe("button");
    act(() => r.unmount());
  });

  it("reserves a 1px solid border in EVERY variant and state — never `none`", () => {
    for (const variant of ["primary", "quiet", "ghost", "seg"]) {
      for (const pressed of [undefined, false, true]) {
        const r = render(React.createElement(Btn, { t, variant, pressed }, "x"));
        const st = btnOf(r).props.style;
        // Longhand, not the `border` shorthand — mixing the two in one style
        // object triggers React's own "conflicting style property" dev
        // warning the instant a caller's `style` also touches a border-family
        // longhand (which `borderWidth` below always does). No `border` key
        // should exist on this object at all.
        expect(st.border, `${variant}/${pressed}`).toBeUndefined();
        expect(st.borderWidth, `${variant}/${pressed}`).toBe(1);
        expect(st.borderStyle, `${variant}/${pressed}`).toBe("solid");
        expect(st.borderColor, `${variant}/${pressed}`).not.toBe("none");
        act(() => r.unmount());
      }
    }
  });

  it("the borderless LOOK is a transparent border, so box heights still match", () => {
    // This is the whole mechanism behind the LifeEventSheet footer fix: a ghost
    // button next to an outlined one must occupy the same box.
    const ghost = render(React.createElement(Btn, { t, variant: "ghost" }, "x"));
    const quiet = render(React.createElement(Btn, { t, variant: "quiet" }, "x"));
    expect(btnOf(ghost).props.style.borderColor).toBe("transparent");
    expect(btnOf(quiet).props.style.borderColor).toBe(t.line2);
    expect(btnOf(ghost).props.style.borderWidth).toBe(btnOf(quiet).props.style.borderWidth);
    expect(btnOf(ghost).props.style.minHeight).toBe(btnOf(quiet).props.style.minHeight);
    expect(btnOf(ghost).props.style.boxSizing).toBe("border-box");
    act(() => { ghost.unmount(); quiet.unmount(); });
  });

  it("never wraps or shrinks by default, and is ≥44px tall in both sizes", () => {
    for (const size of ["md", "sm"]) {
      const r = render(React.createElement(Btn, { t, size }, "Monthly, for a while"));
      const st = btnOf(r).props.style;
      expect(st.whiteSpace, size).toBe("nowrap");
      expect(st.flexShrink, size).toBe(0);
      expect(st.minHeight, size).toBe(44);
      act(() => r.unmount());
    }
  });

  it("`wrap` relaxes ONLY whiteSpace — the height floor and border stay", () => {
    const r = render(React.createElement(Btn, { t, wrap: true }, "Monthly, for a while"));
    const st = btnOf(r).props.style;
    expect(st.whiteSpace).toBe("normal");
    expect(st.minHeight).toBe(44);
    expect(st.flexShrink).toBe(0);
    expect(st.borderWidth).toBe(1);
    expect(st.borderStyle).toBe("solid");
    act(() => r.unmount());
  });

  it("`pressed` drives the visual state AND aria-pressed from one prop", () => {
    // The two cannot desync, which is the point: hand-rolled call sites
    // routinely styled an active toggle without ever setting aria-pressed.
    const off = render(React.createElement(Btn, { t, pressed: false }, "x"));
    const on  = render(React.createElement(Btn, { t, pressed: true }, "x"));
    expect(btnOf(off).props["aria-pressed"]).toBe(false);
    expect(btnOf(on).props["aria-pressed"]).toBe(true);
    expect(btnOf(on).props.style.borderColor).toBe(t.accent);
    expect(btnOf(off).props.style.borderColor).toBe(t.line2);

    // Omitting it emits no attribute at all — a plain action button is not a
    // toggle and must not be announced as one.
    const plain = render(React.createElement(Btn, { t }, "x"));
    expect(btnOf(plain).props["aria-pressed"]).toBeUndefined();
    act(() => { off.unmount(); on.unmount(); plain.unmount(); });
  });

  it("`tint` re-hues the pressed/filled state without touching the invariants", () => {
    const warm = render(React.createElement(Btn, { t, tint: "warm", pressed: true }, "Money out"));
    expect(btnOf(warm).props.style.borderColor).toBe(t.warm);
    expect(btnOf(warm).props.style.minHeight).toBe(44);
    // An unknown token name falls back to accent rather than rendering
    // a `borderColor: undefined`.
    const bogus = render(React.createElement(Btn, { t, tint: "nope", pressed: true }, "x"));
    expect(btnOf(bogus).props.style.borderColor).toBe(t.accent);
    act(() => { warm.unmount(); bogus.unmount(); });
  });

  it("a per-call-site `style` can adjust layout but the border stays 1px", () => {
    const r = render(React.createElement(Btn, { t, style: { flex: 1, marginRight: "auto" } }, "x"));
    const st = btnOf(r).props.style;
    expect(st.flex).toBe(1);
    expect(st.marginRight).toBe("auto");
    expect(st.borderWidth).toBe(1);
    expect(st.borderStyle).toBe("solid");
    act(() => r.unmount());
  });

  it("a per-call-site `style` CANNOT shrink the touch target, unwrap, or unstick — the invariants always win (regression: PlanScreen's DollarBasisToggle shipped `style={{ minHeight: 40 }}` on a Btn and silently shrank it)", () => {
    const r = render(React.createElement(Btn, {
      t,
      style: { minHeight: 10, whiteSpace: "normal", flexShrink: 1, boxSizing: "content-box" },
    }, "x"));
    const st = btnOf(r).props.style;
    expect(st.minHeight).toBe(44);
    expect(st.whiteSpace).toBe("nowrap");
    expect(st.flexShrink).toBe(0);
    expect(st.boxSizing).toBe("border-box");
    act(() => r.unmount());
  });

  // CodeRabbit (PR #66 round 2): border STYLE/COLOUR is deliberately
  // overridable (GoalsPanel's dashed pills), but the earlier fix left the
  // WIDTH itself overridable through the same `style.border` shorthand —
  // `style={{ border: "none" }}` silently zeroed a button's border, the exact
  // misalignment class invariant #1 exists to prevent. Even a stray shorthand
  // override (not the sanctioned `borderColor`/`borderStyle` longhand this
  // codebase's own call sites use) cannot win against the locked `borderWidth`.
  it("a per-call-site `style.border` CANNOT change the border WIDTH — borderWidth stays locked at 1 even when border is overridden to \"none\"", () => {
    const r = render(React.createElement(Btn, { t, style: { border: "none" } }, "x"));
    expect(btnOf(r).props.style.borderWidth).toBe(1);
    act(() => r.unmount());
  });

  it("borderWidth is locked at 1 in every ordinary render too, not just the override case", () => {
    const r = render(React.createElement(Btn, { t }, "x"));
    expect(btnOf(r).props.style.borderWidth).toBe(1);
    act(() => r.unmount());
  });

  // A live-browser check (item 14/15's verification pass, docs/BUGS.md) found
  // that mixing the `border` SHORTHAND with the `borderWidth` LONGHAND in one
  // style object — which the original borderWidth-lock fix did, unconditionally,
  // on every render — trips React's own "conflicting style property" dev
  // warning. Fixed by dropping the `border` shorthand entirely in favour of
  // borderStyle/borderColor/borderWidth, all longhand, no ambiguity. Proven
  // here at the object level: no ordinary render (or override using the
  // sanctioned longhand) ever produces a `border` key at all.
  it("never emits the `border` shorthand key — only borderStyle/borderColor/borderWidth longhand, so React's shorthand-vs-longhand conflict warning can never fire from an ordinary call site", () => {
    const plain  = render(React.createElement(Btn, { t }, "x"));
    const tinted = render(React.createElement(Btn, {
      t, style: { borderColor: "red", borderStyle: "dashed" },
    }, "x"));
    expect(btnOf(plain).props.style.border).toBeUndefined();
    expect(btnOf(tinted).props.style.border).toBeUndefined();
    expect(btnOf(tinted).props.style.borderColor).toBe("red");
    expect(btnOf(tinted).props.style.borderStyle).toBe("dashed");
    expect(btnOf(tinted).props.style.borderWidth).toBe(1);
    act(() => { plain.unmount(); tinted.unmount(); });
  });

  it("disabled blocks activation and is announced", () => {
    const onClick = vi.fn();
    const r = render(React.createElement(Btn, { t, disabled: true, onClick }, "x"));
    expect(btnOf(r).props.disabled).toBe(true);
    expect(btnOf(r).props.style.cursor).toBe("default");
    act(() => r.unmount());
  });
});

describe("Pill — the compact tier", () => {
  it("is a real button at the 40px tier with a reserved border", () => {
    for (const pressed of [undefined, false, true]) {
      const r = render(React.createElement(Pill, { t, pressed }, "Golf course"));
      const st = btnOf(r).props.style;
      expect(btnOf(r).props.type).toBe("button");
      expect(st.minHeight).toBe(40);
      expect(st.borderRadius).toBe(999);
      expect(st.whiteSpace).toBe("nowrap");
      expect(st.flexShrink).toBe(0);
      expect(st.border).toBeUndefined();
      expect(st.borderWidth).toBe(1);
      expect(st.borderStyle).toBe("solid");
      act(() => r.unmount());
    }
  });

  it("`pressed` drives both the tint and aria-pressed, and is absent when unset", () => {
    const on = render(React.createElement(Pill, { t, pressed: true }, "x"));
    expect(btnOf(on).props["aria-pressed"]).toBe(true);
    expect(btnOf(on).props.style.borderColor).toBe(t.accent);
    const plain = render(React.createElement(Pill, { t }, "x"));
    expect(btnOf(plain).props["aria-pressed"]).toBeUndefined();
    expect(btnOf(plain).props.style.borderColor).toBe(t.line2);
    act(() => { on.unmount(); plain.unmount(); });
  });

  it("a dashed border override keeps the same 1px width (GoalsPanel's presets)", () => {
    // GoalsPanel's "+ Add more goals" / "+ Custom goal" are visually dashed but
    // must not change box height relative to the solid pills beside them —
    // via the sanctioned borderStyle/borderColor longhand, not the shorthand
    // (which would trip React's shorthand-vs-longhand conflict warning
    // against the locked borderWidth below).
    const r = render(React.createElement(
      Pill, { t, style: { borderStyle: "dashed", borderColor: t.accent } }, "+ Custom goal"));
    expect(btnOf(r).props.style.border).toBeUndefined();
    expect(btnOf(r).props.style.borderStyle).toBe("dashed");
    expect(btnOf(r).props.style.borderColor).toBe(t.accent);
    expect(btnOf(r).props.style.borderWidth).toBe(1);
    expect(btnOf(r).props.style.minHeight).toBe(40);
    act(() => r.unmount());
  });

  it("a per-call-site `style` CANNOT shrink the 40px tier, unwrap, or unstick", () => {
    const r = render(React.createElement(Pill, {
      t,
      style: { minHeight: 8, whiteSpace: "normal", flexShrink: 1, boxSizing: "content-box" },
    }, "x"));
    const st = btnOf(r).props.style;
    expect(st.minHeight).toBe(40);
    expect(st.whiteSpace).toBe("nowrap");
    expect(st.flexShrink).toBe(0);
    expect(st.boxSizing).toBe("border-box");
    act(() => r.unmount());
  });

  // CodeRabbit (PR #66 round 2) — same fix as Btn's matching test above.
  it("a per-call-site `style.border` CANNOT change the border WIDTH — borderWidth stays locked at 1, even alongside a dashed-style override", () => {
    const none = render(React.createElement(Pill, { t, style: { border: "none" } }, "x"));
    expect(btnOf(none).props.style.borderWidth).toBe(1);
    act(() => none.unmount());

    // The dashed-override test above proves `borderStyle`/`borderColor` still
    // carry the dashed style/colour through; this proves borderWidth is ALSO
    // locked on that same call, so both hold true simultaneously, not just in
    // isolation.
    const dashed = render(React.createElement(
      Pill, { t, style: { borderStyle: "dashed", borderColor: t.accent } }, "+ Custom goal"));
    expect(btnOf(dashed).props.style.borderStyle).toBe("dashed");
    expect(btnOf(dashed).props.style.borderColor).toBe(t.accent);
    expect(btnOf(dashed).props.style.borderWidth).toBe(1);
    act(() => dashed.unmount());
  });

  it("never emits the `border` shorthand key, matching Btn's own contract", () => {
    const r = render(React.createElement(Pill, { t }, "x"));
    expect(btnOf(r).props.style.border).toBeUndefined();
    act(() => r.unmount());
  });
});
