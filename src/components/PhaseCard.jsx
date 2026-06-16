import { C, panel } from "../theme.js";
import { WaterfallStep } from "./WaterfallStep.jsx";

// peakPortfolio: explicit prop (was a closure over flowData.peakPortfolio in the original IIFE)
export function PhaseCard({ num, title, ageRange, years, color, steps, note, actions, peakPortfolio }) {
  return (
    <div style={{
      ...panel, marginBottom: 0, borderRadius: 0,
      borderLeft: `4px solid ${color}`,
      borderTop: `1px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%", background: color,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "#0d1117", flexShrink: 0,
          }}>{num}</span>
          <div>
            <p style={{ margin: 0, fontSize: 14, color: C.text, fontWeight: 700 }}>{title}</p>
            <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{ageRange}</p>
          </div>
        </div>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>
          {years} yr{years !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        {steps.map((s, i) => {
          const divider = s.type === "total" ? (
            <div key={`div-${i}`} style={{ borderTop: `1px dashed ${C.border}`, margin: "6px 0 4px" }} />
          ) : null;
          return (
            <div key={i}>
              {divider}
              <WaterfallStep {...s} maxVal={peakPortfolio} />
            </div>
          );
        })}
      </div>

      {note && (
        <div style={{ marginTop: 10, padding: "6px 10px",
          background: `${color}08`, borderRadius: 5, borderLeft: `2px solid ${color}30` }}>
          <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{note}</p>
        </div>
      )}

      {actions?.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
          <p style={{ margin: "0 0 8px", fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
            Recommended Actions
          </p>
          {actions.map((a, i) => (
            <ActionCardWrapper key={i} {...a} />
          ))}
        </div>
      )}
    </div>
  );
}

// Local wrapper to avoid circular import — ActionCard is used inside PhaseCard
// but PhaseCard is not used inside ActionCard. Import directly here.
import { ActionCard } from "./ActionCard.jsx";
function ActionCardWrapper(props) {
  return <ActionCard {...props} />;
}
