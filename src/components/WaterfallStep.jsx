import { C, mono } from "../theme.js";
import { fmt } from "../formatters.js";

export function WaterfallStep({ label, amount, type, sub, maxVal }) {
  const isAdd   = type === "add";
  const isSub   = type === "subtract";
  const isLoss  = type === "loss";
  const isTotal = type === "total";
  const color   = isAdd ? C.green : (isSub || isLoss) ? C.orange : isTotal ? C.gold : C.muted;
  const prefix  = isAdd ? "+" : (isSub || isLoss) ? "−" : "";
  const barPct  = maxVal > 0 ? Math.max(5, (Math.abs(amount) / maxVal) * 100) : 5;

  return (
    <div className="fd-wf-step" style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
      <div style={{ width: 130, textAlign: "right", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: isTotal ? C.text : C.muted, fontWeight: isTotal ? 600 : 400 }}>
          {label}
        </span>
        {sub && <span style={{ display: "block", fontSize: 9, color: C.muted }}>{sub}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          height: isTotal ? 30 : 24,
          width: `${barPct}%`, minWidth: 60,
          background: isTotal
            ? `linear-gradient(90deg, ${color}45, ${color}20)`
            : `${color}20`,
          borderLeft: `3px solid ${color}`,
          borderRadius: "0 5px 5px 0",
          display: "flex", alignItems: "center", paddingLeft: 8,
          transition: "width 0.4s ease",
        }}>
          <span style={{
            fontSize: isTotal ? 14 : 12,
            color, fontWeight: isTotal ? 700 : 500,
            ...mono, whiteSpace: "nowrap",
          }}>
            {prefix}{fmt(Math.abs(amount))}
          </span>
        </div>
      </div>
    </div>
  );
}
