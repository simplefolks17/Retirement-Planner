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

// A single row in an ordered/labeled list (withdrawal steps, surplus allocation,
// mega-backdoor capacity breakdown). Shared so the three WI-3.7 flows render
// list rows identically instead of each inventing its own markup. `index` is an
// optional leading ordinal (e.g. "1", "①"); `strong` bolds a total/summary row;
// `tone` colors the value ("good" | "warm" | undefined = neutral ink).
export function ListRow({ t, index, label, value, sub, strong, tone, first }) {
  const valColor = tone === "good" ? t.good : tone === "warm" ? t.warm : t.ink;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
      padding: "10px 0", borderTop: first ? "none" : `1px solid ${t.line}`,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        {index != null && (
          <span style={{ font: `600 11px ${HM}`, color: t.faint, flexShrink: 0 }}>{index}</span>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `${strong ? 600 : 500} 13px ${HF}`, color: t.ink }}>{label}</div>
          {sub && <div style={{ font: `400 11px ${HF}`, color: t.faint, marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <span style={{ font: `${strong ? 700 : 600} 14px ${HM}`, color: valColor, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// A bordered card wrapping a set of ListRows (first row's top border suppressed).
export function ListCard({ t, children }) {
  return (
    <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 12, padding: "0 14px" }}>
      {children}
    </div>
  );
}
