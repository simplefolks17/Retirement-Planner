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

export function StatCard({ t, label, value, accent, warm, large }) {
  return (
    <div style={{
      flex: 1,
      background: warm ? `${t.warm}12` : t.surf,
      border: `1px solid ${warm ? `${t.warm}40` : t.line}`,
      borderRadius: 13, padding: 15
    }}>
      <div style={{ font: `500 11px ${HF}`, color: warm ? t.warm : t.mut, marginBottom: 9 }}>
        {label}
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
