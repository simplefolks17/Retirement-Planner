import { C } from "../theme.js";
import { FED_BRACKETS_2026 } from "../config/irs-2026.js";
import { fmtRate } from "../formatters.js";

export function TaxPhaseCard({ phaseNum, label, color, yearRange, rate, setRate, combinedRate, children }) {
  return (
    <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${color}` }}>
      <p style={{ margin: "0 0 2px", fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {phaseNum} {label}
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 10, color: C.muted }}>{yearRange}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {FED_BRACKETS_2026.map(pct => (
          <button key={pct} onClick={() => setRate(pct)} style={{
            padding: "4px 8px", fontSize: 11, fontWeight: 700, border: "none",
            borderRadius: 4, cursor: "pointer",
            background: rate === pct ? color : C.border,
            color:      rate === pct ? "#0d1117" : C.muted,
            fontFamily: "'IBM Plex Mono', monospace",
          }}>{pct}%</button>
        ))}
      </div>
      {combinedRate !== undefined && combinedRate !== rate && (
        <p style={{ margin: "0 0 4px", fontSize: 9, color: C.muted }}>
          Combined (fed+state): <span style={{ color, fontWeight: 700 }}>{fmtRate(combinedRate)}</span>
        </p>
      )}
      {children}
    </div>
  );
}
