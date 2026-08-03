import React, { useState } from "react";
import { HM } from "./ThemeContext.jsx";
import { Btn } from "./shared.jsx";

// ── Explore tray ─────────────────────────────────────────────────────────────
// The single arc-anchored control surface on the Plan screen. Both ways to
// shape the arc live here as facets: "Try a change" (the preview-first levers)
// and "Goals" (life-event placement). Collapsed by default (one quiet bar) so
// Plan stays calm; opening a facet shows its full-width body — only one facet
// open at a time, so neither is ever cramped.
//
// The facet bodies are passed in as nodes (changeFacet / goalsFacet) — the tray
// owns only layout + which facet is open. If a lever change is currently staged
// (changeStaged), the tray defaults to the "change" facet so Apply/Discard stay
// reachable even from a collapsed resting state.

const FACETS = [
  { k: "change", label: "Try a change", icon: "⚙" },
  { k: "goals",  label: "Goals",        icon: "✦" },
];

// `isMobile` is accepted but deliberately unread: the tray owns only the quiet
// bar, which already wraps, and both facet TABS are Btn call sites carrying the
// shared 44px floor — there is no width-dependent decision left to make here.
// Kept in the signature (rather than dropped) because the facet bodies passed in
// as nodes are built by PlanScreen, which will hand this prop down if a mobile
// branch is ever needed; a fake usage would be worse than a documented no-op.
export default function ExploreTray({
  t, isMobile, goalsCount = 0, changeStaged = false, changeFacet, goalsFacet,
}) {
  // Tri-state: null = auto (falls back to "change" while a change is staged,
  // so a staged Apply/Discard is never silently hidden by default), "closed" =
  // the user explicitly collapsed (wins over the staged fallback — without
  // this sentinel the fallback re-opened the tray on every render and the
  // collapse click silently did nothing), or a facet key.
  const [open, setOpen] = useState(null);
  const effOpen = open === "closed" ? null : (open ?? (changeStaged ? "change" : null));

  // Collapsing while a change is staged is allowed: the offsets live in
  // PlanScreen (nothing is lost), the staged dot on the facet tab stays
  // visible on the collapsed bar, and one click reopens to Apply/Discard.
  const toggle = (k) => setOpen(effOpen === k ? "closed" : k);

  // This tab was the model for the shared Btn primitive (a real
  // `<button type="button">` carrying `aria-pressed`, with the border reserved
  // and only its colour toggled). It now uses Btn itself, so the exemplar and
  // the primitive can't drift — and it picks up the 44px touch target it was
  // ~30px short of.
  const tab = (f) => {
    const on = effOpen === f.k;
    return (
      <Btn key={f.k} t={t} onClick={() => toggle(f.k)} pressed={on}
        style={{ justifyContent: "flex-start" }}>
        <span aria-hidden style={{ fontSize: 13 }}>{f.icon}</span>
        {f.label}
        {f.k === "change" && changeStaged && (
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: 999, background: t.accent, marginLeft: 1,
          }} />
        )}
      </Btn>
    );
  };

  return (
    <div style={{
      background: t.surf, borderRadius: 14, border: `1px solid ${t.line}`,
      padding: effOpen ? "12px 14px 14px" : "10px 14px",
    }}>
      {/* ── the quiet bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 7 }}>{FACETS.map(tab)}</div>
        {/* Was the worst target in the app — a bare `<button>` with zero padding
            (~14px tall). Btn's `ghost` variant keeps the quiet, link-like look
            while giving it a real 44px hit area. */}
        {goalsCount > 0 && effOpen !== "goals" && (
          <Btn t={t} size="sm" variant="ghost" tone="faint" onClick={() => toggle("goals")}
            style={{ fontFamily: HM }}>
            Goals · {goalsCount}
          </Btn>
        )}
      </div>

      {/* ── the open facet body ── */}
      {effOpen && (
        <div style={{ marginTop: 12 }}>
          {effOpen === "change" ? changeFacet : goalsFacet}
        </div>
      )}
    </div>
  );
}
