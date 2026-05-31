import { C, mono } from "../theme.js";
import { fmt } from "../formatters.js";

// peakPortfolio: explicit prop (was a closure over flowData.peakPortfolio in the original IIFE)
export function FlowConn({ value, color = C.gold, label, peakPortfolio }) {
  const pct = peakPortfolio > 0
    ? Math.max(12, (value / peakPortfolio) * 65)
    : 12;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 2, height: 10, background: `${color}35` }} />
      <div style={{
        width: `${pct}%`, minWidth: 90,
        padding: "5px 14px",
        background: `${color}10`,
        border: `1px solid ${color}25`,
        borderRadius: 5,
        textAlign: "center",
        position: "relative",
      }}>
        <span style={{ fontSize: 13, color, fontWeight: 700, ...mono }}>{fmt(value)}</span>
        {label && <span style={{ fontSize: 9, color: C.muted, marginLeft: 6 }}>{label}</span>}
      </div>
      <div style={{ width: 2, height: 10, background: `${color}35` }} />
    </div>
  );
}
