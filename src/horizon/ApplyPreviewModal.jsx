// Apply-with-preview shell (WI-3.9). Delegates all chrome (backdrop, card,
// buttons) to the existing ConfirmModal — this file owns only the BODY layout
// for an apply-preview.js payload: the plain-language action line, the metric
// rows, an optional note, and the reserved verdict slot. Rule 10: everything
// rendered here is a pre-computed string or enum from the payload (tone,
// dir) — this component performs zero arithmetic and zero comparisons on
// model values.
//
// `PreviewMetricRow` and `VerdictBadge` are exported (not just used locally)
// because they are the SAME visual primitive two future surfaces need:
// WI-5.4's (#40) scenario-compare view is "metric rows without the modal
// chrome around them", and WI-5.4's (#85) verdict badge appears both here and
// in that compare view. One implementation, reused, so the two surfaces can
// never drift apart cosmetically.

import React from "react";
import { HF, HM } from "./ThemeContext.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import { toneToken } from "./shared.jsx";

// tone → theme token, shared by the delta chip and the verdict badge. Delegates
// to the ONE toneToken map (shared.jsx) with t.mut as this surface's neutral
// fallback; "accent" now resolves too, so an unaffordable verdict badge reads
// accent-toned (the deliberate warm-downgrade is retired).
function toneColor(t, tone) {
  return toneToken(t, tone, t.mut);
}

export function PreviewMetricRow({ t, metric }) {
  const chipColor = toneColor(t, metric.delta.tone);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 14, padding: "9px 0", borderTop: `1px solid ${t.line}`,
    }}>
      <div style={{ font: `500 12.5px ${HF}`, color: t.ink, minWidth: 0 }}>{metric.label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
        <span style={{ font: `500 12.5px ${HM}`, color: t.mut }}>{metric.before}</span>
        <span style={{ font: `400 12px ${HF}`, color: t.faint }}>→</span>
        <span style={{ font: `600 12.5px ${HM}`, color: t.ink }}>{metric.after}</span>
        <span style={{
          font: `600 11px ${HM}`, color: chipColor, background: `${chipColor}18`,
          borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap",
        }}>
          {metric.delta.label}
        </span>
      </div>
    </div>
  );
}

export function VerdictBadge({ t, verdict }) {
  if (verdict == null) return null;
  const c = toneColor(t, verdict.tone);
  return (
    <div style={{
      display: "inline-block", marginTop: 10, font: `600 11.5px ${HF}`, color: c,
      background: `${c}18`, border: `1px solid ${c}`, borderRadius: 999, padding: "4px 12px",
    }}>
      {verdict.label}
    </div>
  );
}

export default function ApplyPreviewModal({ t, preview, onConfirm, onCancel }) {
  const body = (
    <div>
      <div style={{ font: `400 13px/1.5 ${HF}`, color: t.mut, marginBottom: 10 }}>
        {preview.action}
      </div>
      <div>
        {preview.metrics.map(metric => (
          <PreviewMetricRow key={metric.id} t={t} metric={metric} />
        ))}
      </div>
      {preview.note && (
        <div style={{ font: `400 11px/1.5 ${HF}`, color: t.faint, marginTop: 12 }}>
          {preview.note}
        </div>
      )}
      <VerdictBadge t={t} verdict={preview.verdict} />
    </div>
  );

  return (
    <ConfirmModal
      t={t}
      title={preview.title}
      body={body}
      confirmLabel={preview.confirmLabel ?? "Apply"}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
