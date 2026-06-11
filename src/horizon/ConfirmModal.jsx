import React from "react";
import { HF } from "./ThemeContext.jsx";

// Shared confirm dialog. Renders a backdrop + centered card.
// Parent controls visibility (unmount to dismiss); onConfirm/onCancel fire once.
export default function ConfirmModal({ t, title, body, confirmLabel = "Confirm", onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.38)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.surf, border: `1px solid ${t.line2}`,
          borderRadius: 16, padding: "22px 24px",
          maxWidth: 380, width: "90%",
          boxShadow: "0 8px 40px rgba(0,0,0,.22)",
        }}
      >
        <div style={{ font: `600 16px ${HF}`, color: t.ink, marginBottom: body ? 8 : 18 }}>
          {title}
        </div>
        {body && (
          <div style={{ font: `400 14px ${HF}`, color: t.mut, marginBottom: 18, lineHeight: 1.5 }}>
            {body}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              font: `500 13px ${HF}`, color: t.mut, background: "transparent",
              border: `1px solid ${t.line}`, borderRadius: 8,
              padding: "8px 16px", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              font: `600 13px ${HF}`, color: "#fff", background: t.accent,
              border: "none", borderRadius: 8,
              padding: "8px 16px", cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
