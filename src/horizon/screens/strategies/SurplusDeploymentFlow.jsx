// SurplusDeploymentFlow — WI-3.7 (#104): deploy unallocated savings surplus in
// IRS-priority order. LAYOUT/FORMATTING ONLY (rule 10): every number comes from
// props.surplusView (the sibling flow bundle) and the props.assumptions
// setter bundle's savingsSurplusPct field; the Apply/Revert interaction is the
// WI-3.9 Apply-with-preview contract (props.surplusView.applyAllocation) —
// this component never computes a preview or a delta, it only opens the modal
// and wires confirm/cancel/revert.

import React, { useState } from "react";
import { HF, HM } from "../../ThemeContext.jsx";
import { DetailField } from "../../fields.jsx";
import { fmt } from "../../../formatters.js";
import { SectionLabel, NoteBox, ListRow, ListCard } from "./flow-ui.jsx";
import ApplyPreviewModal from "../../ApplyPreviewModal.jsx";

export default function SurplusDeploymentFlow({ t, props, isMobile = false }) {
  const sv = props.surplusView;
  const site = sv.applyAllocation;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 1. Explainer + summary ── */}
      <NoteBox t={t}>
        Money you're not yet saving can still go to work. Below is{" "}
        {sv.deployLabel} — deployed in the order that gets the most value out of
        every dollar first (employer match, then tax-advantaged space, then
        taxable overflow).
      </NoteBox>
      <div style={{ font: `400 12px ${HF}`, color: t.mut }}>
        Available surplus: <span style={{ font: `600 12px ${HM}`, color: t.ink }}>{fmt(sv.availableSurplus)}/yr</span>
      </div>

      {/* ── 2. Deploy-percent control ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>How much of the surplus to deploy</SectionLabel>
        <DetailField t={t} isMobile={isMobile} label="Deploy this % of surplus"
          field={props.assumptions.savingsSurplusPct} format={v => `${v}%`} />
      </div>

      {/* ── 3. Allocation breakdown ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>How it's deployed</SectionLabel>
        {sv.extraRows.length > 0 ? (
          <ListCard t={t}>
            {sv.extraRows.map((row, i) => (
              <ListRow key={row.key} t={t} first={i === 0}
                label={row.label} value={`${fmt(row.amount)}/yr`} sub={row.sub} tone="good" />
            ))}
          </ListCard>
        ) : (
          <div style={{ font: `400 12px ${HF}`, color: t.faint }}>No surplus to allocate right now.</div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>New contribution targets if applied</SectionLabel>
        {sv.optRows.length > 0 ? (
          <ListCard t={t}>
            {sv.optRows.map((row, i) => (
              <ListRow key={row.key} t={t} first={i === 0} label={row.label} value={`${fmt(row.amount)}/yr`} />
            ))}
          </ListCard>
        ) : (
          <div style={{ font: `400 12px ${HF}`, color: t.faint }}>Nothing new to target right now.</div>
        )}
      </div>

      {/* ── 4. Apply / Revert (WI-3.9) ── */}
      {site.available && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NoteBox t={t} tone="good">
            Deploying your surplus this way changes your contributions to the targets above.
          </NoteBox>
          <button type="button" onClick={() => setPreviewOpen(true)}
            style={{ alignSelf: "flex-start", minHeight: 44, font: `600 13px ${HF}`, color: "#fff",
              background: t.accent, border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}>
            Apply optimized allocation
          </button>
        </div>
      )}

      {site.applied && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            font: `600 11.5px ${HF}`, color: t.good, background: `${t.good}18`,
            border: `1px solid ${t.good}`, borderRadius: 999, padding: "4px 12px",
          }}>Applied</span>
          <button type="button" onClick={site.revert}
            style={{ minHeight: 44, font: `600 12.5px ${HF}`, color: t.accent, background: "transparent",
              border: `1px solid ${t.line2}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>
            Revert
          </button>
        </div>
      )}

      {previewOpen && site.preview && (
        <ApplyPreviewModal t={t} preview={site.preview}
          onConfirm={() => { site.apply(); setPreviewOpen(false); }}
          onCancel={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}
