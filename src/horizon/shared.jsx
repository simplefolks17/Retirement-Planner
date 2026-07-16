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

// Calm monthly formatter for a value that is ALREADY monthly (not annual):
// rounds to the nearest $100 so lever readouts read "$5,200", not "$5,183".
// Callers append "/mo". (Monthly figures stay full-dollar — abbreviating to
// "$5k/mo" would lose too much — but they never show stray odd dollars.)
export function fmtMonthly(monthly) {
  if (monthly == null || isNaN(monthly)) return "—";
  return `$${(Math.round(monthly / 100) * 100).toLocaleString()}`;
}

// onClick (optional, WI-1.1): makes the card a door to the screen that explains
// its number. The card's natural size (~70px tall) already exceeds the 44px
// minimum touch target; minHeight guards it if padding ever shrinks.
// Keyboard activation for click-driven divs: fire on Enter/Space like a real button.
// Pair with role="button" + tabIndex={0} so a div control is keyboard-accessible.
export const kbActivate = (fn) => (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

export function StatCard({ t, label, value, accent, warm, large, onClick, sub }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? kbActivate(onClick) : undefined}
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
      {sub && (
        <div style={{ font: `400 11px ${HF}`, color: t.mut, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
