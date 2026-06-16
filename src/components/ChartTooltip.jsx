import { C, mono } from "../theme.js";
import { fmt } from "../formatters.js";

export function ChartTooltip({ active, payload, label, valueFormatter = fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ margin: "0 0 6px", color: C.muted, fontSize: 12 }}>Age {label}</p>
      {payload.map((p, i) => (
        <p key={p.dataKey ?? p.name ?? i} style={{ margin: "2px 0", fontSize: 13, ...mono }}>
          <span style={{ color: C.text }}>{p.name}: </span>
          <span style={{ color: p.color }}>{valueFormatter(p.value)}</span>
        </p>
      ))}
    </div>
  );
}
