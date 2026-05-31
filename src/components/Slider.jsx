import { C, mono } from "../theme.js";

export function Slider({ label, value, min, max, step = 1, format, onChange, valueColor }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontSize: 13, color: valueColor ?? C.gold, ...mono }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: valueColor ?? C.gold, cursor: "pointer" }}
      />
    </div>
  );
}
