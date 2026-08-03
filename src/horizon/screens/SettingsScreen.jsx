import React from "react";
import { GhostArc } from "../../components/ArcGraph.jsx";
import { PALETTES, HF, useTheme } from "../ThemeContext.jsx";
import { ACTIVITIES } from "./SomedayScreen.jsx";
import { Btn, Pill } from "../shared.jsx";

export default function SettingsScreen({ t, activity, setActivity, onResetOnboarding }) {
  const { palKey, setPalKey, modePref, setModePref, arcStyle, setArcStyle } = useTheme();
  const activeAct = ACTIVITIES.find(a => a.l.toLowerCase() === (activity ?? "golf course").toLowerCase())
    ?? ACTIVITIES[0];

  return (
    <div style={{
      flex: 1, padding: "28px 36px",
      display: "flex", gap: 44, overflow: "auto"
    }}>
      {/* left: controls */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28, minWidth: 260 }}>

        <div>
          <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 16 }}>
            Palette
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(PALETTES).map(([key, pal]) => {
              const on = palKey === key;
              return (
                <button key={key} type="button" onClick={() => setPalKey(key)}
                  aria-pressed={on} aria-label={`Palette: ${pal.name}`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    cursor: "pointer", background: "transparent",
                    border: "1px solid transparent", borderRadius: 12,
                    padding: 4, minHeight: 44, flexShrink: 0,
                  }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 999, background: pal.swatch,
                    border: `3px solid ${on ? t.ink : "transparent"}`,
                    boxShadow: `0 0 0 2px ${t.bg}`
                  }} />
                  <span style={{ font: `${on ? 600 : 400} 12px ${HF}`, color: on ? t.ink : t.mut, whiteSpace: "nowrap" }}>
                    {pal.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
            Theme
          </div>
          <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, background: t.line, width: "fit-content" }}>
            {[["light","Light"],["dark","Dark"],["auto","Auto"]].map(([k, l]) => (
              <Btn key={k} t={t} size="sm" variant="seg" pressed={modePref === k}
                onClick={() => setModePref(k)} style={{ padding: "8px 20px" }}>{l}</Btn>
            ))}
          </div>
        </div>

        <div>
          <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
            Arc style
          </div>
          <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, background: t.line, width: "fit-content" }}>
            {[["soft","Soft"],["vivid","Vivid"],["glow","Glow"]].map(([k, l]) => (
              <Btn key={k} t={t} size="sm" variant="seg" pressed={arcStyle === k}
                onClick={() => setArcStyle(k)} style={{ padding: "8px 20px" }}>{l}</Btn>
            ))}
          </div>
          <div style={{ font: `400 12px ${HF}`, color: t.faint, marginTop: 8 }}>
            Vivid thickens the arc stroke. Glow adds a light bloom effect.
          </div>
        </div>

        <div>
          <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
            Your activity
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* BUG-49: the only one of Settings' four groups with no keyboard
                path at all (the other three already carried kbActivate). */}
            {ACTIVITIES.map(a => (
              <Pill key={a.k} t={t} pressed={a.k === activeAct.k}
                onClick={() => setActivity?.(a.l.toLowerCase())}>{a.l}</Pill>
            ))}
          </div>
          <div style={{ font: `400 12px ${HF}`, color: t.faint, marginTop: 8 }}>
            Drives the "Work optional, {activeAct.l.toLowerCase()} mandatory" tagline on Plan.
          </div>
        </div>

        <div>
          <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
            About
          </div>
          <p style={{ font: `400 13px/1.6 ${HF}`, color: t.mut, maxWidth: 460, margin: "0 0 14px" }}>
            Horizon is a retirement planning tool that shows you the complete picture of your financial life —
            from today through retirement and beyond. All calculations use 2026 IRS limits.
          </p>
          <Btn t={t} size="sm" variant="quiet" tone="faint" onClick={onResetOnboarding}>
            Replay onboarding
          </Btn>
        </div>
      </div>

      {/* right: live preview */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
          Preview
        </div>
        <div style={{
          background: t.bg, border: `1px solid ${t.line}`,
          borderRadius: 16, overflow: "hidden", padding: "14px 14px 10px"
        }}>
          <GhostArc t={t} opacity={arcStyle === "soft" ? 0.70 : 0.90} blur={0} H={160} />
          <div style={{
            marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ font: `500 12px ${HF}`, color: t.mut }}>
              {PALETTES[palKey]?.name} · {modePref === "auto" ? "Auto" : modePref.charAt(0).toUpperCase() + modePref.slice(1)}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 999,
              border: `1px solid ${t.good}55`, background: `${t.good}18`,
              font: `600 11px ${HF}`, color: t.good
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: t.good }} />
              On track
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
