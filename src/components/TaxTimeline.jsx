import { C } from "../theme.js";

export function TaxTimeline({ phase1End, phase2End, totalYears, rate1, rate2, rate3, showPhase2 }) {
  const p1pct = showPhase2 ? (phase1End / totalYears) * 100 : (phase2End / totalYears) * 100;
  const p2pct = showPhase2 ? ((phase2End - phase1End) / totalYears) * 100 : 0;
  const p3pct = ((totalYears - phase2End) / totalYears) * 100;

  const Seg = ({ pct, color, label, rate }) => {
    if (pct <= 0) return null;
    return (
      <div style={{
        width: `${pct}%`, minWidth: 30,
        background: color, opacity: 0.85,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transition: "width 0.3s",
      }}>
        {pct > 8 && (
          <span style={{ fontSize: 10, color: "#0d1117", fontWeight: 700, whiteSpace: "nowrap" }}>
            {label}: {rate}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ borderRadius: 6, overflow: "hidden", height: 26, display: "flex", marginBottom: 4 }}>
      <Seg pct={p1pct} color={C.gold}  label={showPhase2 ? "Now" : "Working"} rate={rate1} />
      {showPhase2 && <Seg pct={p2pct} color={C.blue}  label="Mid"  rate={rate2} />}
      <Seg pct={p3pct} color={C.green} label="Ret."   rate={rate3} />
    </div>
  );
}
