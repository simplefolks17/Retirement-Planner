import React, { useState } from "react";
import { HF, HM } from "./ThemeContext.jsx";

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

  const tab = (f) => {
    const on = effOpen === f.k;
    return (
      <button key={f.k} type="button" onClick={() => toggle(f.k)} aria-pressed={on}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 13px", borderRadius: 9, cursor: "pointer",
          border: `1px solid ${on ? t.accent : t.line2}`,
          background: on ? `${t.accent}14` : "transparent",
          font: `${on ? 600 : 500} 13px ${HF}`, color: on ? t.ink : t.mut,
          transition: "all .12s",
        }}>
        <span aria-hidden style={{ fontSize: 13 }}>{f.icon}</span>
        {f.label}
        {f.k === "change" && changeStaged && (
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: 999, background: t.accent, marginLeft: 1,
          }} />
        )}
      </button>
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
        {goalsCount > 0 && effOpen !== "goals" && (
          <button type="button" onClick={() => toggle("goals")}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              font: `500 12px ${HM}`, color: t.faint,
            }}>
            Goals · {goalsCount}
          </button>
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
