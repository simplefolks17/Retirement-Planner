import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

import ConfirmModal from "../ConfirmModal.jsx";
import ApplyPreviewModal from "../ApplyPreviewModal.jsx";
import LifeEventSheet from "../LifeEventSheet.jsx";

// ── BUG-50 ────────────────────────────────────────────────────────────────────
// The filed bug is OnTrackPill's popover (no outside-click / Escape), covered in
// horizon-shell-dismissal below. Generalising it turned up the same gap on all
// three real overlays: none of ConfirmModal / ApplyPreviewModal / LifeEventSheet
// handled Escape, and ApplyPreviewModal carried no `role`/`aria-*` at all.
//
// Escape is asserted through the dialog card's own React onKeyDown — which is
// the path that fires in a browser, since useDialogBehaviour moves focus INTO
// the card on open, so a keypress originates inside it and bubbles to the card.
// (The hook also installs a document-level listener as a fallback for when focus
// has left the card; the suite runs with `environment: "node"`, where there is
// no `document`, so that branch is inert here by design.)

const t = {
  bg: "#0b0f14", surf: "#131a22", surf2: "#182029", line: "#1f2937", line2: "#2a3441",
  ink: "#e6edf3", mut: "#8b949e", faint: "#5b6572", accent: "#4f8cff",
  good: "#3fb950", warm: "#e3a008",
};

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

const dialogOf = (root) => root.findAll(n => n.props?.role === "dialog")[0];

function pressEscape(root) {
  const dlg = dialogOf(root);
  expect(dlg, "no role=dialog element rendered").toBeTruthy();
  act(() => { dlg.props.onKeyDown({ key: "Escape", stopPropagation: () => {} }); });
}

function pressKey(root, key) {
  const dlg = dialogOf(root);
  act(() => { dlg.props.onKeyDown({ key, stopPropagation: () => {} }); });
}

function buildPreview() {
  return {
    title: "Retire at 63?",
    action: "You'd stop working two years earlier.",
    metrics: [{
      id: "m1", label: "Portfolio at retirement", before: "$3.1M", after: "$2.6M",
      delta: { label: "−$500k", tone: "warm", dir: "down" },
    }],
    note: null,
    verdict: { label: "still comfortable", tone: "good" },
    confirmLabel: "Apply",
  };
}

const bounds = { minAge: 30, maxAge: 90, retirementAge: 65, projectedIncomeByAge: {} };

describe("BUG-50 — ConfirmModal is a real dialog and closes on Escape", () => {
  it("carries role=dialog, aria-modal and an accessible name from its title", () => {
    let r;
    act(() => {
      r = create(React.createElement(ConfirmModal, {
        t, title: "Save your plan?", onConfirm: () => {}, onCancel: () => {},
      }));
    });
    const dlg = dialogOf(r.root);
    expect(dlg.props["aria-modal"]).toBe("true");
    expect(dlg.props.tabIndex).toBe(-1);
    // The name points at the rendered title, not a hand-written duplicate.
    const labelled = r.root.findAll(n => n.props?.id === dlg.props["aria-labelledby"])[0];
    expect(textOf(labelled)).toBe("Save your plan?");
    act(() => r.unmount());
  });

  it("Escape calls onCancel; other keys do not", () => {
    const onCancel = vi.fn();
    let r;
    act(() => {
      r = create(React.createElement(ConfirmModal, {
        t, title: "Save your plan?", onConfirm: () => {}, onCancel,
      }));
    });
    pressKey(r.root, "a");
    pressKey(r.root, "Enter");
    expect(onCancel).not.toHaveBeenCalled();
    pressEscape(r.root);
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });

  it("the click-to-dismiss backdrop still works and is declared as one", () => {
    const onCancel = vi.fn();
    let r;
    act(() => {
      r = create(React.createElement(ConfirmModal, {
        t, title: "Save your plan?", onConfirm: () => {}, onCancel,
      }));
    });
    const backdrop = r.root.findAll(n => n.props?.["data-dismiss-backdrop"] != null)[0];
    expect(backdrop).toBeTruthy();
    act(() => backdrop.props.onClick());
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });
});

describe("BUG-50 — ApplyPreviewModal inherits the dialog contract", () => {
  it("had zero aria before; now exposes role=dialog + a name, and takes Escape", () => {
    const onCancel = vi.fn();
    let r;
    act(() => {
      r = create(React.createElement(ApplyPreviewModal, {
        t, preview: buildPreview(), onConfirm: () => {}, onCancel,
      }));
    });
    const dlg = dialogOf(r.root);
    expect(dlg.props["aria-modal"]).toBe("true");
    const labelled = r.root.findAll(n => n.props?.id === dlg.props["aria-labelledby"])[0];
    expect(textOf(labelled)).toBe("Retire at 63?");
    pressEscape(r.root);
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });
});

describe("BUG-50 — LifeEventSheet is a real dialog and closes on Escape", () => {
  it("exposes role=dialog with a STATIC name and closes on Escape", () => {
    const onCancel = vi.fn();
    let r;
    act(() => {
      r = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle: null, bounds,
        initial: { id: "g1", label: "Buy a home", age: 45, amount: 80_000 },
        onSave: () => {}, onRemove: () => {}, onCancel,
      }));
    });
    const dlg = dialogOf(r.root);
    expect(dlg.props["aria-modal"]).toBe("true");
    // Static, NOT the live `label` state — typing in the name field must not
    // re-announce the dialog on every keystroke.
    expect(dlg.props["aria-label"]).toBe("Edit this goal");
    pressEscape(r.root);
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });
});

describe("the sheet's footer row can no longer produce mismatched button boxes", () => {
  it("all three action buttons declare a 1px border and never wrap", () => {
    let r;
    act(() => {
      r = create(React.createElement(LifeEventSheet, {
        t, whatIfBundle: null, bounds,
        initial: { id: "g1", label: "Buy a home", age: 45, amount: 80_000 },
        onSave: () => {}, onRemove: () => {}, onCancel: () => {},
      }));
    });
    const labels = ["Remove from plan", "Cancel", "Save changes"];
    const footer = r.root.findAll(
      n => n.type === "button" && labels.includes(textOf(n).trim()));
    expect(footer.map(n => textOf(n).trim()).sort()).toEqual([...labels].sort());
    for (const b of footer) {
      // The original bug: "Cancel" had `1px solid …` while its siblings had
      // `border: "none"`, a 2px height difference that alignItems:"center"
      // exposed and that squeezed the label into wrapping on a 390px phone.
      expect(b.props.style.border, textOf(b)).toMatch(/^1px solid /);
      expect(b.props.style.whiteSpace, textOf(b)).toBe("nowrap");
      expect(b.props.style.flexShrink, textOf(b)).toBe(0);
      expect(b.props.style.minHeight, textOf(b)).toBe(44);
    }
    act(() => r.unmount());
  });
});
