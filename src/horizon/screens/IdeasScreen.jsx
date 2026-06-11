import React, { useState, useMemo } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";

// Scenario definitions: scale factors applied to chartData totals (indicative paths, not model output)
const SCENARIOS = [
  { k: "retire63", label: "Retire 2 yrs earlier", sub: "Save $250/mo more.",  color: "good",   retireAdj: -2, scale: 0.92, stats: { retire: -2,  incomeScale: 0.90, nestScale: 0.92 } },
  { k: "retire60", label: "Retire at 60",          sub: "5 yrs sooner.",       color: "warm",   retireAdj: -5, scale: 0.82, stats: { retire: -5,  incomeScale: 0.80, nestScale: 0.82 } },
  { k: "saveMore", label: "Save $300 more/mo",     sub: "Retire at 64.",       color: "good",   retireAdj: -1, scale: 1.10, stats: { retire: -1,  incomeScale: 1.10, nestScale: 1.10 } },
  { k: "bigTrip",  label: "Big trip at 70",        sub: "Still funded.",       color: "accent", retireAdj:  0, scale: 0.96, stats: { retire:  0,  incomeScale: 0.97, nestScale: 0.96 } },
];

export const LIFE_EVENTS = [
  { l: "Buy a home",      age: 40, scen: "retire63" },
  { l: "Kid's college",   age: 52, scen: "retire60" },
  { l: "Big trip · $40k", age: 70, scen: "bigTrip"  },
  { l: "Downsize",        age: 72, scen: "saveMore"  },
  { l: "Part-time at 60", age: 60, scen: "retire60"  },
];

function ScenStatCard({ t, label, baseVal, scenVal, warm }) {
  const changed = scenVal != null && scenVal !== baseVal;
  return (
    <div style={{
      flex: 1, background: t.surf, border: `1px solid ${t.line}`,
      borderRadius: 12, padding: "11px 13px"
    }}>
      <div style={{ font: `400 11px ${HF}`, color: t.mut, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "nowrap" }}>
        {changed ? (
          <>
            <span style={{ font: `400 14px ${HM}`, color: t.faint, textDecoration: "line-through" }}>
              {baseVal}
            </span>
            <span style={{ font: `600 18px ${HM}`, color: warm ? t.warm : t.accent }}>
              {scenVal}
            </span>
          </>
        ) : (
          <span style={{ font: `600 18px ${HM}`, color: warm ? t.warm : t.ink }}>{baseVal}</span>
        )}
      </div>
    </div>
  );
}

export default function IdeasScreen({ t, props }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, effectiveExpenses, balAt90, isSustainable,
    contribSeries,
  } = props;

  const [mode, setMode] = useState(null);
  const [activeScen, setActiveScen] = useState(null);
  const [placedEvents, setPlacedEvents] = useState([]);

  const scen = activeScen ? SCENARIOS.find(s => s.k === activeScen) : null;

  // Compute scenario overlay data (indicative — not model output)
  const scenarioData = useMemo(() => {
    if (!scen || !chartData?.length) return null;
    return chartData.map(d => ({ age: d.age, total: d.total * scen.scale }));
  }, [scen, chartData]);

  // Scenario-adjusted stats
  const scenRetire = scen ? retirementAge + (scen.stats.retire ?? 0) : null;
  const scenIncome = scen ? fmtMo(effectiveExpenses * (scen.stats.incomeScale ?? 1)) : null;
  const scenNest   = scen ? fmt(totalAtRet * (scen.stats.nestScale ?? 1)) : null;
  const scenLeft90 = scen ? fmt(balAt90 * (scen.stats.nestScale ?? 1)) : null;

  const clearScen = () => { setActiveScen(null); setPlacedEvents([]); };

  const modeButtons = [
    { k: "life",    l: "Drop life onto timeline" },
    { k: "dials",   l: "Dial your future" },
    { k: "suggest", l: "Horizon suggestions" },
    { k: "askit",   l: "What if…" },
  ];

  return (
    <div style={{
      flex: 1, padding: "16px 26px 14px",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      {/* page title */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12, flexShrink: 0
      }}>
        <div style={{ font: `600 20px ${HF}`, color: t.ink, letterSpacing: "-0.02em" }}>
          Your future, explored.
        </div>
        {scen && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7,
              font: `600 12px ${HF}`, color: t.accent }}>
              <svg width="24" height="8">
                <line x1="0" y1="4" x2="24" y2="4" stroke={t.accent} strokeWidth="2.4" strokeDasharray="8 5"/>
              </svg>
              {scen.label}
            </span>
            <button onClick={clearScen} style={{
              font: `400 12px ${HF}`, color: t.faint, background: "transparent",
              border: `1px solid ${t.line}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer"
            }}>✕ clear</button>
          </div>
        )}
      </div>

      {/* arc hero with optional scenario overlay */}
      <div style={{ flexShrink: 0 }}>
        <ArcGraph
          t={t}
          chartData={chartData}
          currentAge={currentAge}
          retirementAge={retirementAge}
          lifeExpect={lifeExpect}
          contribSeries={contribSeries}
          height={240}
          glow={false}
          activeView="arc"
          showToggle={false}
          scenarioData={scenarioData}
        />
      </div>

      {/* mode buttons */}
      <div style={{ display: "flex", gap: 7, margin: "10px 0 0", flexShrink: 0 }}>
        {modeButtons.map(({ k, l }) => {
          const on = mode === k;
          return (
            <div key={k}
              onClick={() => { setMode(on ? null : k); if (!on) clearScen(); }}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 10,
                cursor: "pointer", textAlign: "center",
                border: `1px solid ${on ? t.accent : t.line2}`,
                background: on ? `${t.accent}14` : t.surf,
                font: `${on ? 600 : 400} 13px ${HF}`,
                color: on ? t.ink : t.mut,
                transition: "all .12s"
              }}>
              {l}
            </div>
          );
        })}
      </div>

      {/* mode panel */}
      {mode && (
        <div style={{ marginTop: 10, flexShrink: 0 }}>
          <div style={{
            background: t.surf, border: `1px solid ${t.line}`,
            borderRadius: 13, padding: 14
          }}>
            {/* ── Life events ── */}
            {mode === "life" && (
              <div>
                <div style={{ font: `500 12px ${HF}`, color: t.mut, marginBottom: 9 }}>
                  Click to place on your arc:
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {LIFE_EVENTS.map(({ l, scen: s }) => {
                    const placed = placedEvents.includes(l);
                    return (
                      <div key={l} onClick={() => {
                        if (placed) { setPlacedEvents(ev => ev.filter(e => e !== l)); setActiveScen(null); }
                        else { setPlacedEvents(ev => [...ev, l]); setActiveScen(s); }
                      }} style={{
                        padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid ${placed ? t.warm : t.line2}`,
                        background: placed ? `${t.warm}14` : "transparent",
                        font: `${placed ? 600 : 400} 13px ${HF}`,
                        color: placed ? t.ink : t.mut
                      }}>
                        {placed ? "✓  " : ""}{l}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Dial your future ── */}
            {mode === "dials" && (
              <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
                {[
                  { label: "Retire at", val: String(retirementAge) },
                  { label: "Extra savings / mo", val: "+$0" },
                  { label: "Monthly spend", val: fmtMo(effectiveExpenses) },
                ].map(({ label, val }) => (
                  <div key={label} style={{ minWidth: 140 }}>
                    <div style={{ font: `500 12px ${HF}`, color: t.mut, marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        width: 36, height: 36, flexShrink: 0, borderRadius: 9,
                        border: `1.5px solid ${t.line2}`, background: t.bg,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        font: `600 18px ${HF}`, color: t.accent, cursor: "pointer"
                      }}>−</span>
                      <div style={{
                        flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${t.line2}`,
                        background: t.bg, display: "flex", alignItems: "center", justifyContent: "center",
                        font: `600 17px ${HM}`, color: t.ink
                      }}>{val}</div>
                      <span style={{
                        width: 36, height: 36, flexShrink: 0, borderRadius: 9,
                        border: `1.5px solid ${t.line2}`, background: t.bg,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        font: `600 18px ${HF}`, color: t.accent, cursor: "pointer"
                      }}>+</span>
                    </div>
                  </div>
                ))}
                <div onClick={() => setActiveScen("retire63")}
                  style={{
                    padding: "11px 18px", borderRadius: 11, background: t.accent,
                    cursor: "pointer", flexShrink: 0, alignSelf: "flex-end"
                  }}>
                  <span style={{ font: `600 14px ${HF}`, color: "#fff" }}>Show on arc →</span>
                </div>
              </div>
            )}

            {/* ── Horizon suggestions ── */}
            {mode === "suggest" && (
              <div style={{ display: "flex", gap: 9 }}>
                {SCENARIOS.map(({ k, label, sub, color }) => {
                  const on = activeScen === k;
                  const c = t[color];
                  return (
                    <div key={k} onClick={() => setActiveScen(on ? null : k)}
                      style={{
                        flex: 1, padding: "12px 12px", borderRadius: 10, cursor: "pointer",
                        border: `1px solid ${on ? c : t.line2}`,
                        background: on ? `${c}12` : "transparent"
                      }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 999,
                        background: c, display: "block", marginBottom: 6
                      }} />
                      <div style={{ font: `600 14px ${HF}`, color: t.ink, lineHeight: 1.05 }}>{label}</div>
                      <div style={{ font: `400 12px ${HF}`, color: t.mut, marginTop: 3 }}>{sub}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── What if… ── */}
            {mode === "askit" && (
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span style={{ font: `600 16px ${HF}`, color: t.accent, flexShrink: 0 }}>What if…</span>
                <div style={{
                  flex: 1, height: 40, borderRadius: 10,
                  border: `1px solid ${t.line2}`, background: t.bg,
                  display: "flex", alignItems: "center", paddingLeft: 12
                }}>
                  <span style={{ font: `400 14px ${HF}`, color: t.mut }}>
                    I retire at {retirementAge - 2} instead of {retirementAge}?
                  </span>
                </div>
                <div onClick={() => setActiveScen("retire63")}
                  style={{
                    padding: "11px 18px", borderRadius: 11, background: t.accent,
                    cursor: "pointer", flexShrink: 0
                  }}>
                  <span style={{ font: `600 14px ${HF}`, color: "#fff" }}>Show on arc →</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* stats row */}
      <div style={{ display: "flex", gap: 9, marginTop: 8, flexShrink: 0 }}>
        <ScenStatCard t={t} label="Retire at"   baseVal={String(retirementAge)} scenVal={scen ? String(scenRetire) : null} />
        <ScenStatCard t={t} label="Income / mo" baseVal={fmtMo(effectiveExpenses)} scenVal={scenIncome} warm />
        <ScenStatCard t={t} label="Nest egg"    baseVal={fmt(totalAtRet)} scenVal={scenNest} />
        <ScenStatCard t={t} label="Left at 90"  baseVal={fmt(balAt90)} scenVal={scenLeft90} />
        {scen && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", flexShrink: 0 }}>
            <div style={{ padding: "11px 16px", borderRadius: 11, background: t.accent, cursor: "pointer" }}>
              <span style={{ font: `600 13px ${HF}`, color: "#fff" }}>Make this my plan</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
