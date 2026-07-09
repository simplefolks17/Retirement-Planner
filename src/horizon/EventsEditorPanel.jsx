// EventsEditorPanel — Ideas "Events" mode (WI-3.10/Level-3 slice 5). Horizon-styled
// editor for one-time money events (windfalls, big purchases). LAYOUT ONLY (rule 10):
// every row, bound, and flag comes from props.eventsView (App.jsx's wrapped write
// surface over moneyEvents — see App.jsx's eventsView memo). This file never reads
// or writes moneyEvents directly and never computes a total, a max, or a bound —
// it renders row.*.value/.set and the pre-built atMax/hasEvents/netImpactLabel flags.

import React from "react";
import { HF, HM } from "./ThemeContext.jsx";
import { seg } from "./fields.jsx";

function AddButton({ t, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      font: `600 12.5px ${HF}`, color: t.accent, background: "transparent",
      border: `1px dashed ${t.line2}`, borderRadius: 9, padding: "8px 14px",
      cursor: "pointer", minHeight: 36,
    }}>
      + Add event
    </button>
  );
}

function EventRow({ t, row, isMobile }) {
  const inputStyle = {
    font: `400 12.5px ${HF}`, color: t.ink, background: t.bg,
    border: `1px solid ${t.line2}`, borderRadius: 7, padding: "6px 8px",
    width: "100%", minWidth: 0,
  };
  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      flexWrap: isMobile ? "nowrap" : "wrap",
      gap: 8, alignItems: isMobile ? "stretch" : "center",
      padding: "10px 12px", background: t.surf, border: `1px solid ${t.line}`,
      borderRadius: 11,
    }}>
      <input
        style={{ ...inputStyle, flex: isMobile ? undefined : "2 1 140px" }}
        placeholder="Label (e.g. Car purchase)"
        value={row.labelField.value}
        onChange={e => row.labelField.set(e.target.value)}
      />
      <input
        style={{ ...inputStyle, flex: isMobile ? undefined : "1 1 100px" }}
        type="number" min={row.amountField.min} step={row.amountField.step}
        placeholder="Amount"
        value={row.amountField.value || ""}
        onChange={e => row.amountField.set(e.target.value)}
      />
      <input
        style={{ ...inputStyle, flex: isMobile ? undefined : "1 1 80px" }}
        type="number" min={row.ageField.min} max={row.ageField.max} step={row.ageField.step}
        placeholder="Age"
        value={row.ageField.value}
        onChange={e => row.ageField.set(e.target.value)}
      />
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {row.directionField.options.map(o => (
          <button key={o.value} type="button" aria-pressed={o.value === row.directionField.value}
            onClick={() => row.directionField.set(o.value)}
            style={seg(t, o.value === row.directionField.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {row.showTaxable && (
        <button type="button" aria-pressed={row.taxableField.value}
          onClick={() => row.taxableField.set(!row.taxableField.value)}
          style={seg(t, row.taxableField.value)}>
          Taxable
        </button>
      )}
      <button
        type="button" onClick={row.remove} aria-label="Remove event"
        style={{
          marginLeft: isMobile ? 0 : "auto", flexShrink: 0,
          font: `600 15px ${HF}`, color: t.faint, background: "transparent",
          border: "none", cursor: "pointer", padding: "2px 6px",
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function EventsEditorPanel({ t, eventsView, isMobile }) {
  const { rows, add, atMax, count, maxEvents, hasEvents, netImpactLabel } = eventsView;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ font: `400 12px/1.5 ${HF}`, color: t.mut }}>
        One-time money events — a windfall, a big purchase — plan for them and see
        the impact on your arc and longevity.
      </div>

      {!hasEvents ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
          padding: "14px 2px",
        }}>
          <div style={{ font: `400 13px ${HF}`, color: t.faint }}>No events yet.</div>
          <AddButton t={t} onClick={() => add()} />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map(row => (
              <EventRow key={row.id} t={t} row={row} isMobile={isMobile} />
            ))}
          </div>
          {!atMax && <AddButton t={t} onClick={() => add()} />}
        </>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: `1px solid ${t.line}`, paddingTop: 10, flexWrap: "wrap", gap: 6,
      }}>
        <span style={{ font: `400 11px ${HF}`, color: t.faint }}>
          {atMax ? `${count}/${maxEvents} events` : `Up to ${maxEvents} events`}
        </span>
        {hasEvents && (
          <span style={{ font: `600 12px ${HM}`, color: t.ink }}>
            Net impact: {netImpactLabel}
          </span>
        )}
      </div>
    </div>
  );
}
