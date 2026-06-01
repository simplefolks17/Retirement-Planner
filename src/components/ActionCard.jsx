import { C, mono } from "../theme.js";
import { fmt } from "../formatters.js";

export function ActionCard({ mode, title, body, impact, impactColor, impactLabel, vsA, vsB }) {
  const modeConfig = {
    prescriptive: { icon: "→", accent: C.green,  label: "ACTION" },
    comparative:  { icon: "⇄", accent: C.blue,   label: "COMPARE" },
    educational:  { icon: "i",  accent: C.purple, label: "INSIGHT" },
  };
  const { icon, accent, label: modeLabel } = modeConfig[mode] ?? modeConfig.educational;

  return (
    <div style={{
      background: `${accent}06`, border: `1px solid ${accent}20`,
      borderRadius: 8, padding: "10px 12px", marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: `${accent}20`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: accent, flexShrink: 0, marginTop: 1,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: accent,
              textTransform: "uppercase", letterSpacing: "0.1em" }}>{modeLabel}</span>
            <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{title}</span>
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>{body}</p>

          {mode === "prescriptive" && impact !== undefined && (
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4,
              background: `${impactColor ?? accent}15`, borderRadius: 4, padding: "2px 8px" }}>
              <span style={{ fontSize: 12, color: impactColor ?? accent, fontWeight: 700, ...mono }}>
                {typeof impact === "string" ? impact : fmt(impact)}
              </span>
              {impactLabel && (
                <span style={{ fontSize: 9, color: C.muted }}>{impactLabel}</span>
              )}
            </div>
          )}

          {mode === "comparative" && vsA && vsB && (
            <div className="fd-action-vs" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6,
              alignItems: "center", marginTop: 4 }}>
              <div style={{ background: C.surface, borderRadius: 5, padding: "4px 8px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 9, color: C.muted }}>{vsA.label}</p>
                <p style={{ margin: 0, fontSize: 13, color: vsA.color ?? C.muted, fontWeight: 600, ...mono }}>
                  {typeof vsA.value === "string" ? vsA.value : fmt(vsA.value)}
                </p>
                {vsA.sub && <p style={{ margin: 0, fontSize: 8, color: C.muted }}>{vsA.sub}</p>}
              </div>
              <span style={{ fontSize: 10, color: C.muted }}>vs</span>
              <div style={{ background: `${C.green}10`, borderRadius: 5, padding: "4px 8px",
                textAlign: "center", border: `1px solid ${C.green}20` }}>
                <p style={{ margin: 0, fontSize: 9, color: C.green }}>{vsB.label}</p>
                <p style={{ margin: 0, fontSize: 13, color: vsB.color ?? C.green, fontWeight: 600, ...mono }}>
                  {typeof vsB.value === "string" ? vsB.value : fmt(vsB.value)}
                </p>
                {vsB.sub && <p style={{ margin: 0, fontSize: 8, color: C.muted }}>{vsB.sub}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
