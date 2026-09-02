import React, { useId } from "react";
import { HF } from "./ThemeContext.jsx";
import { Btn } from "./shared.jsx";
import { useDialogBehaviour } from "./useDialogBehaviour.js";

// Shared confirm dialog. Renders a backdrop + centered card.
// Parent controls visibility (unmount to dismiss); onConfirm/onCancel fire once.
//
// BUG-50: this dialog (and ApplyPreviewModal, which delegates its whole chrome
// to it) previously had no Escape handler, no `role="dialog"`, and no focus
// move — a keyboard user could open it and have focus stranded behind the
// backdrop. useDialogBehaviour supplies all three; the backdrop click that was
// already here is unchanged.
export default function ConfirmModal({ t, title, body, confirmLabel = "Confirm", onConfirm, onCancel }) {
  const titleId = useId();
  const { cardRef, escapeProps } = useDialogBehaviour(onCancel);

  return (
    <div
      onClick={onCancel}
      // Click-to-dismiss backdrop. NOT keyboard-focusable by design — the
      // keyboard equivalent is Escape (useDialogBehaviour), and a focusable
      // full-screen div would just add a dead stop to the tab order. The
      // attribute is what keyboard-access.test.js keys its exemption on, so the
      // exemption is declared at the element rather than hard-coded in the test.
      data-dismiss-backdrop="true"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.38)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        {...escapeProps}
        onClick={e => e.stopPropagation()}
        style={{
          background: t.surf, border: `1px solid ${t.line2}`,
          borderRadius: 16, padding: "22px 24px",
          maxWidth: 380, width: "90%",
          boxShadow: "0 8px 40px rgba(0,0,0,.22)",
        }}
      >
        <div id={titleId} style={{ font: `600 16px ${HF}`, color: t.ink, marginBottom: body ? 8 : 18 }}>
          {title}
        </div>
        {body && (
          <div style={{ font: `400 14px/1.5 ${HF}`, color: t.mut, marginBottom: 18 }}>
            {body}
          </div>
        )}
        {/* `stretch` (the flex default) is deliberate — see Btn's note 1 in
            shared.jsx. Both buttons reserve a 1px border either way, so this row
            stays aligned even if a future variant changes. */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn t={t} size="sm" variant="quiet" onClick={onCancel}>Cancel</Btn>
          <Btn t={t} size="sm" variant="primary" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
