import { C } from "../theme.js";

export function TaxTimeline({ phase2End, totalYears, fedMarginal, effectiveRMDTaxRate }) {
  const workingPct   = (phase2End / totalYears) * 100;
  const retirementPct = ((totalYears - phase2End) / totalYears) * 100;

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
            {label}: {Math.round(rate * 100)}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ borderRadius: 6, overflow: "hidden", height: 26, display: "flex", marginBottom: 4 }}>
      <Seg pct={workingPct}    color={C.gold}  label="Working" rate={fedMarginal} />
      <Seg pct={retirementPct} color={C.green} label="Ret."    rate={effectiveRMDTaxRate} />
    </div>
  );
}
