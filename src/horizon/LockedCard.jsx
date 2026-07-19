import React from "react";
import { HF } from "./ThemeContext.jsx";
import { fmt } from "../formatters.js";

// WI-5.2 (#113) Slice 3: shared quiet-lock card (SP-1 premium-lock pattern).
// Purely a renderer — no entitlements logic lives here; a screen decides
// WHETHER to show a LockedCard (isPremium gate) and passes it a title/teaser.
// The dollar line renders ONLY when `teaserValue` is provided — no fabricated
// "$0" or approximated figure when the caller has nothing to show (rule 10's
// "missing data is not zero" applied to the locked state itself).
export default function LockedCard({ t, title, teaser, teaserValue = null, chipLabel = "Premium", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: t.surf, border: `1px solid ${t.line}`, borderRadius: 14,
        padding: "16px 18px", cursor: "pointer", font: `400 14px ${HF}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ color: t.mut, fontSize: 15 }}>&#128274;</span>
          <span style={{ font: `600 15px ${HF}`, color: t.ink }}>{title}</span>
        </div>
        <span
          style={{
            font: `600 11px ${HF}`, color: t.mut, background: t.line,
            borderRadius: 999, padding: "3px 9px", letterSpacing: 0.3,
          }}
        >
          {chipLabel}
        </span>
      </div>
      <div style={{ font: `400 13px ${HF}`, color: t.mut }}>{teaser}</div>
      {teaserValue != null && (
        <div style={{ font: `600 15px ${HF}`, color: t.mut, marginTop: 6 }}>{fmt(teaserValue)}</div>
      )}
    </button>
  );
}
