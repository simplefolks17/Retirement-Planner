// Shared primitives for Horizon screen components.
// Screens import fmt, fmtMo, and StatCard from here.
//
// fmt/fmtMo/fmtMonthly are re-exports of the canonical formatters (2026-07-16
// "calm money" consolidation, src/formatters.js) — kept as named exports here
// so no Horizon screen import needs to change.

import React from "react";
import { HF, HM } from "./ThemeContext.jsx";
import { fmt, fmtMo, fmtMonthly } from "../formatters.js";

export { fmt, fmtMo, fmtMonthly };

// onClick (optional, WI-1.1): makes the card a door to the screen that explains
// its number. The card's natural size (~70px tall) already exceeds the 44px
// minimum touch target; minHeight guards it if padding ever shrinks.
// Keyboard activation for click-driven divs: fire on Enter/Space like a real button.
// Pair with role="button" + tabIndex={0} so a div control is keyboard-accessible.
export const kbActivate = (fn) => (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

// toneToken(t, tone, fallback) — the ONE verdict/delta tone → theme-token map.
// Consolidates the five hand-rolled `tone === "good" ? t.good : …` renderer
// fallbacks that each invented a different default for an unknown tone (null /
// t.ink / t.mut / t.accent): known tones map to their token; an unknown or
// undefined tone returns the caller's `fallback`, so every call site keeps the
// neutral default it intends while the known-tone mapping lives in one place.
// (There is deliberately no "danger" tone — no `t.danger` token exists;
// "unaffordable" uses "accent", see verdictDisplay in model/apply-preview.js.)
export function toneToken(t, tone, fallback) {
  if (tone === "good") return t.good;
  if (tone === "warm") return t.warm;
  if (tone === "accent") return t.accent;
  return fallback;
}

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
