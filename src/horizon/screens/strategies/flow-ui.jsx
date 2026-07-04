// Shared presentational helpers for Strategy flow bodies (WI-3.4+).
// LAYOUT ONLY — no model values, no math. Kept in one place so the SS / RMD /
// (future) conversion flows render section headers, note boxes, and stat tiles
// identically without duplicating the styling.

import React from "react";
import { HF, HM } from "../../ThemeContext.jsx";

export function SectionLabel({ t, children }) {
  return (
    <div style={{
      font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.05em",
      textTransform: "uppercase", margin: "8px 0 4px",
    }}>{children}</div>
  );
}

// tone: "warm" | "good" | undefined (neutral). A toned note gets a colored left rail.
export function NoteBox({ t, tone, children }) {
  const c = tone === "warm" ? t.warm : tone === "good" ? t.good : null;
  return (
    <div style={{
      font: `400 12px/1.6 ${HF}`, color: c ?? t.mut, background: t.bg,
      border: `1px solid ${t.line}`, borderLeft: c ? `3px solid ${c}` : `1px solid ${t.line}`,
      borderRadius: 9, padding: "9px 11px",
    }}>{children}</div>
  );
}

export function StatTile({ t, label, value, sub, tone, dim }) {
  const c = tone === "good" ? t.good : tone === "warm" ? t.warm : t.ink;
  return (
    <div style={{ flex: 1, minWidth: 120, background: t.surf, border: `1px solid ${t.line}`,
      borderRadius: 12, padding: "11px 13px", opacity: dim ? 0.45 : 1 }}>
      <div style={{ font: `400 11px ${HF}`, color: t.mut, marginBottom: 5 }}>{label}</div>
      <div style={{ font: `600 18px ${HM}`, color: c, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ font: `400 10.5px ${HF}`, color: t.faint, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export const STAT_ROW = { display: "flex", gap: 10, flexWrap: "wrap" };
