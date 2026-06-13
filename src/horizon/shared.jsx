// Shared primitives for Horizon screen components.
// Screens import fmt, fmtMo, and StatCard from here.

import React from "react";
import { HF, HM } from "./ThemeContext.jsx";

export function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(Math.abs(n) % 1e6 === 0 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtMo(annual) {
  if (annual == null || isNaN(annual)) return "—";
  return `$${Math.round(annual / 12).toLocaleString()}`;
}

// onClick (optional, WI-1.1): makes the card a door to the screen that explains
// its number. The card's natural size (~70px tall) already exceeds the 44px
// minimum touch target; minHeight guards it if padding ever shrinks.
export function StatCard({ t, label, value, accent, warm, large, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        flex: 1,
        background: warm ? `${t.warm}12` : t.surf,
        border: `1px solid ${warm ? `${t.warm}40` : t.line}`,
        borderRadius: 13, padding: 15,
        cursor: onClick ? "pointer" : "default",
        minHeight: onClick ? 44 : undefined,
      }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        font: `500 11px ${HF}`, color: warm ? t.warm : t.mut, marginBottom: 9
      }}>
        <span>{label}</span>
        {onClick && <span style={{ font: `400 13px ${HF}`, color: t.faint }}>›</span>}
      </div>
      <div style={{
        font: `500 ${large ? 26 : 23}px ${HM}`,
        color: accent, letterSpacing: "-0.01em"
      }}>
        {value}
      </div>
    </div>
  );
}
