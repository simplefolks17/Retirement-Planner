import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import ApplyPreviewModal from "../ApplyPreviewModal.jsx";

// Minimal fake theme covering every token the modal + ConfirmModal use.
const t = {
  bg: "#0b0f14", surf: "#131a22", line: "#1f2937", line2: "#2a3441",
  ink: "#e6edf3", mut: "#8b949e", faint: "#5b6572", accent: "#4f8cff",
  good: "#3fb950", warm: "#e3a008",
};

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function buildPreview(overrides = {}) {
  return {
    title: "Apply optimizer suggestion",
    action: "Convert $90,000/yr starting at age 61 (now: $82,765/yr from age 61)",
    confirmLabel: "Apply",
    metrics: [
      {
        id: "netBenefit", label: "Net benefit after healthcare",
        before: "−$9,854", after: "$12,400",
        delta: { dir: "up", label: "+$22,254", tone: "good" },
      },
      {
        id: "longevity", label: "Portfolio lasts",
        before: "depletes at 87 (21.3 yrs)", after: "lasts beyond your plan",
        delta: { dir: "up", label: "beyond plan", tone: "good" },
      },
    ],
    note: "Preview uses the same per-account engine as your headline numbers.",
    verdict: null,
    ...overrides,
  };
}

function mount(preview, { onConfirm = vi.fn(), onCancel = vi.fn() } = {}) {
  let r;
  act(() => {
    r = create(React.createElement(ApplyPreviewModal, { t, preview, onConfirm, onCancel }));
  });
  const clickByText = (label) => {
    const target = r.root.findAll(
      n => typeof n.props?.onClick === "function" && textOf(n) === label,
    )[0];
    expect(target).toBeTruthy();
    act(() => target.props.onClick());
  };
  return { r, clickByText, text: () => textOf(r.toJSON()), onConfirm, onCancel };
}

describe("ApplyPreviewModal", () => {
  it("renders the title, action line, note, and metric labels/before/after", () => {
    const app = mount(buildPreview());
    const txt = app.text();
    expect(txt).toContain("Apply optimizer suggestion");
    expect(txt).toContain("Convert $90,000/yr starting at age 61 (now: $82,765/yr from age 61)");
    expect(txt).toContain("Net benefit after healthcare");
    expect(txt).toContain("−$9,854");
    expect(txt).toContain("$12,400");
    expect(txt).toContain("Portfolio lasts");
    expect(txt).toContain("depletes at 87 (21.3 yrs)");
    expect(txt).toContain("lasts beyond your plan");
    expect(txt).toContain("Preview uses the same per-account engine as your headline numbers.");
    act(() => app.r.unmount());
  });

  it("shows delta chip text for each metric", () => {
    const app = mount(buildPreview());
    const txt = app.text();
    expect(txt).toContain("+$22,254");
    expect(txt).toContain("beyond plan");
    act(() => app.r.unmount());
  });

  it("defaults the confirm button label to 'Apply'", () => {
    const app = mount(buildPreview({ confirmLabel: undefined }));
    expect(app.text()).toContain("Apply");
    act(() => app.r.unmount());
  });

  it("honors a custom confirmLabel", () => {
    const app = mount(buildPreview({ confirmLabel: "Save as my plan" }));
    expect(app.text()).toContain("Save as my plan");
    act(() => app.r.unmount());
  });

  it("fires onConfirm once when the confirm button is clicked", () => {
    const app = mount(buildPreview());
    app.clickByText("Apply");
    expect(app.onConfirm).toHaveBeenCalledTimes(1);
    expect(app.onCancel).not.toHaveBeenCalled();
    act(() => app.r.unmount());
  });

  it("fires onCancel once when the cancel button is clicked", () => {
    const app = mount(buildPreview());
    app.clickByText("Cancel");
    expect(app.onCancel).toHaveBeenCalledTimes(1);
    expect(app.onConfirm).not.toHaveBeenCalled();
    act(() => app.r.unmount());
  });

  it("renders no verdict badge text when verdict is null", () => {
    const app = mount(buildPreview({ verdict: null }));
    expect(app.text()).not.toContain("Still on track");
    act(() => app.r.unmount());
  });

  it("renders the verdict badge label when a verdict is supplied", () => {
    const app = mount(buildPreview({ verdict: { label: "Still on track", tone: "good" } }));
    expect(app.text()).toContain("Still on track");
    act(() => app.r.unmount());
  });
});
