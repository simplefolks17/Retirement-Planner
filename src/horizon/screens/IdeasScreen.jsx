import React, { useState, useMemo } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";
import ConfirmModal from "../ConfirmModal.jsx";
import { calcWhatIfScenario } from "../../model/what-if.js";

// Scenario definitions — overrides only, no display numbers. Every figure shown
// for a scenario comes from ONE calcWhatIfScenario run (the same run the arc
// overlay renders), so the stats and the arc can never disagree (V1/principle 7).
// `scenarioEvents` are one-time events applied to the retirement walk for
// scenarios that don't shift the retirement age.
// Exported for the preset value-lock tests (V11/principle 14).
export const SCENARIOS = [
  { k: "retire63", label: "Retire 2 yrs earlier", sub: "Save $250/mo more.",  color: "good",
    retireAdj: -2 },
  { k: "retire60", label: "Retire at 60",          sub: "5 yrs sooner.",       color: "warm",
    retireAdj: -5 },
  { k: "saveMore", label: "Save $300 more/mo",     sub: "Retire at 64.",       color: "good",
    retireAdj: -1 },
  { k: "bigTrip",  label: "Big trip at 70",        sub: "Still funded.",       color: "accent",
    retireAdj:  0,
    scenarioEvents: [{ label: "Big trip", amount: 40_000, age: 70, isInflow: false, isTaxable: false }] },
];

// Life events that can be added to the user's plan as one-time money events.
export const LIFE_EVENTS = [
  { l: "Buy a home",      age: 40, scen: "retire63", amount: 60_000, isInflow: false },
  { l: "Kid's college",   age: 52, scen: "retire60", amount: 50_000, isInflow: false },
  { l: "Big trip · $40k", age: 70, scen: "bigTrip",  amount: 40_000, isInflow: false },
  { l: "Downsize",        age: 72, scen: "saveMore",  amount: 80_000, isInflow: true  },
  { l: "Part-time at 60", age: 60, scen: "retire60", amount: 24_000, isInflow: true  },
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

export default function IdeasScreen({ t, props, glow = false, strokeWidth = 3, isMobile = false }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, effectiveExpenses, balAt90,
    contribSeries,
    // Batch B additions:
    whatIfSimInputs: whatIfBundle,
    commitPlan,
    setMoneyEvents,
    // WI-0.1: model-provided monthly figure for the spend dial seed
    statementView,
  } = props;

  const [mode, setMode] = useState(null);
  const [activeScen, setActiveScen] = useState(null);
  const [placedEvents, setPlacedEvents] = useState([]);

  // Dial offsets (relative to current props so they stay useful after a commitPlan)
  const [dialRetireOffset, setDialRetireOffset] = useState(0);
  const [dialSpendOffset, setDialSpendOffset]   = useState(0);
  const [dialOverlay, setDialOverlay]           = useState(null);

  // Confirm state — one modal at a time
  const [pendingEvent, setPendingEvent]         = useState(null); // life event waiting to be added
  const [showMakePlan, setShowMakePlan]         = useState(false);
  const [planSaved, setPlanSaved]               = useState(false);

  const scen = activeScen ? SCENARIOS.find(s => s.k === activeScen) : null;

  // ONE model run per active scenario (V1): calcWhatIfScenario returns BOTH the
  // arc chart series and the stat scalars, so the stats row and the overlay can
  // never show different answers. The screen only passes the scenario's overrides
  // through and formats what comes back — no arithmetic on model values here.
  const scenario = useMemo(() => {
    if (!scen || !whatIfBundle) return null;
    return calcWhatIfScenario(whatIfBundle, {
      retireAdj:      scen.retireAdj,
      scenarioEvents: scen.scenarioEvents ?? [],
    });
  }, [scen, whatIfBundle]);

  const scenarioData = scenario?.chart?.length ? scenario.chart : null;

  // Overlay shown on the arc — dials take precedence when that mode is open
  const activeOverlay = mode === "dials" ? dialOverlay : scenarioData;

  // Real scenario stats from the SAME run as the arc. scenarioBalAt90 === null
  // means the walk never reaches age 90 (not applicable, NOT zero) — designed
  // "—" state; a genuine depletion at/before 90 arrives as a real 0.
  const scenRetire = scenario ? String(scenario.scenarioRetAge) : null;
  const scenIncome = scenario ? fmtMo(scenario.scenarioExpenses) : null;
  const scenNest   = scenario ? fmt(scenario.scenarioTotalAtRet) : null;
  const scenLeft90 = scenario ? fmt(scenario.scenarioBalAt90) : null; // fmt(null) → "—"

  // Dial display values — input staging: the dials EDIT a value (offset is screen
  // state), seeded from the model's display-ready monthly figure (no /12 here).
  const dialRetireAge    = retirementAge + dialRetireOffset;
  const dialMonthlySpend = statementView.monthlyTotal + dialSpendOffset;

  const clearScen = () => {
    setActiveScen(null);
    setPlacedEvents([]);
    setDialOverlay(null);
  };

  // Compute arc overlay from current dial values and display it (#69)
  const handleDialsShow = () => {
    if (!whatIfBundle) return;
    const raOverride = dialRetireOffset !== 0 ? dialRetireAge : undefined;
    const moOverride = dialSpendOffset  !== 0 ? dialMonthlySpend : undefined;
    if (raOverride == null && moOverride == null) { setDialOverlay(null); return; }
    const result = calcWhatIfScenario(whatIfBundle, {
      retirementAge:   raOverride,
      monthlyExpenses: moOverride,  // month→year conversion happens in the model
    });
    setDialOverlay(result?.chart?.length ? result.chart : null);
  };

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
        {(scen || dialOverlay) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {scen && (
              <span style={{ display: "flex", alignItems: "center", gap: 7,
                font: `600 12px ${HF}`, color: t.accent }}>
                <svg width="24" height="8">
                  <line x1="0" y1="4" x2="24" y2="4" stroke={t.accent} strokeWidth="2.4" strokeDasharray="8 5"/>
                </svg>
                {scen.label}
              </span>
            )}
            {dialOverlay && !scen && (
              <span style={{ font: `600 12px ${HF}`, color: t.accent }}>
                ↗ what-if overlay
              </span>
            )}
            <button onClick={clearScen} style={{
              font: `400 12px ${HF}`, color: t.faint, background: "transparent",
              border: `1px solid ${t.line}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer"
            }}>✕ clear</button>
          </div>
        )}
      </div>

      {/* arc hero with scenario overlay — grows to fill, so no dead bottom gap */}
      <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minHeight: 200 }}>
        <ArcGraph
          t={t}
          chartData={chartData}
          currentAge={currentAge}
          retirementAge={retirementAge}
          lifeExpect={lifeExpect}
          contribSeries={contribSeries}
          fillHeight
          compact={isMobile}
          glow={glow}
          strokeWidth={strokeWidth}
          activeView="arc"
          showToggle={false}
          scenarioData={activeOverlay}
        />
      </div>

      {/* mode buttons */}
      <div style={{ display: "flex", gap: 7, margin: "10px 0 0", flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        {modeButtons.map(({ k, l }) => {
          const on = mode === k;
          return (
            <div key={k}
              onClick={() => { setMode(on ? null : k); if (!on) clearScen(); }}
              style={{
                flex: isMobile ? "1 1 45%" : 1, padding: "9px 10px", borderRadius: 10,
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
                  Tap to add to your plan:
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {LIFE_EVENTS.map((ev) => {
                    const placed = placedEvents.includes(ev.l);
                    return (
                      <div key={ev.l} onClick={() => {
                        if (placed) {
                          setPlacedEvents(prev => prev.filter(e => e !== ev.l));
                          setActiveScen(null);
                        } else {
                          setPendingEvent(ev);
                        }
                      }} style={{
                        padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid ${placed ? t.warm : t.line2}`,
                        background: placed ? `${t.warm}14` : "transparent",
                        font: `${placed ? 600 : 400} 13px ${HF}`,
                        color: placed ? t.ink : t.mut
                      }}>
                        {placed ? "✓  " : ""}{ev.l}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Dial your future ── */}
            {mode === "dials" && (
              <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
                {/* Retire-at dial */}
                <div style={{ minWidth: 140 }}>
                  <div style={{ font: `500 12px ${HF}`, color: t.mut, marginBottom: 6 }}>Retire at</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span onClick={() => setDialRetireOffset(o => o - 1)} style={dialBtnStyle(t)}>−</span>
                    <div style={dialValStyle(t)}>
                      <span style={{ font: `600 17px ${HM}`, color: dialRetireOffset !== 0 ? t.accent : t.ink }}>
                        {dialRetireAge}
                      </span>
                    </div>
                    <span onClick={() => setDialRetireOffset(o => o + 1)} style={dialBtnStyle(t)}>+</span>
                  </div>
                </div>
                {/* Monthly spend dial */}
                <div style={{ minWidth: 140 }}>
                  <div style={{ font: `500 12px ${HF}`, color: t.mut, marginBottom: 6 }}>Monthly spend</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span onClick={() => setDialSpendOffset(o => o - 100)} style={dialBtnStyle(t)}>−</span>
                    <div style={dialValStyle(t)}>
                      <span style={{ font: `600 17px ${HM}`, color: dialSpendOffset !== 0 ? t.accent : t.ink }}>
                        ${dialMonthlySpend.toLocaleString()}
                      </span>
                    </div>
                    <span onClick={() => setDialSpendOffset(o => o + 100)} style={dialBtnStyle(t)}>+</span>
                  </div>
                </div>
                {/* Show on arc */}
                <div
                  onClick={handleDialsShow}
                  style={{
                    padding: "11px 18px", borderRadius: 11, background: t.accent,
                    cursor: "pointer", flexShrink: 0, alignSelf: "flex-end"
                  }}
                >
                  <span style={{ font: `600 14px ${HF}`, color: "#fff" }}>Show on arc →</span>
                </div>
                {dialOverlay && (
                  <span style={{ font: `500 12px ${HF}`, color: t.good, alignSelf: "flex-end", paddingBottom: 12 }}>
                    ✓ showing on arc
                  </span>
                )}
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
                      <div style={{ font: `600 14px/1.05 ${HF}`, color: t.ink }}>{label}</div>
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
                    I retire two years earlier, instead of at {retirementAge}?
                  </span>
                </div>
                <div
                  onClick={() => setActiveScen("retire63")}
                  style={{
                    padding: "11px 18px", borderRadius: 11, background: t.accent,
                    cursor: "pointer", flexShrink: 0
                  }}
                >
                  <span style={{ font: `600 14px ${HF}`, color: "#fff" }}>Show on arc →</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* stats row */}
      <div style={{ display: "flex", gap: 9, marginTop: 8, flexShrink: 0 }}>
        <ScenStatCard t={t} label="Retire at"   baseVal={String(retirementAge)} scenVal={scenRetire} />
        <ScenStatCard t={t} label="Income / mo" baseVal={fmtMo(effectiveExpenses)} scenVal={scenIncome} warm />
        <ScenStatCard t={t} label="Nest egg"    baseVal={fmt(totalAtRet)} scenVal={scenNest} />
        <ScenStatCard t={t} label="Left at 90"  baseVal={fmt(balAt90)} scenVal={scenLeft90} />
        {scen && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", flexShrink: 0 }}>
            <div
              onClick={() => !planSaved && setShowMakePlan(true)}
              style={{
                padding: "11px 16px", borderRadius: 11,
                background: planSaved ? t.good : t.accent,
                cursor: planSaved ? "default" : "pointer",
                transition: "background .25s",
              }}
            >
              <span style={{ font: `600 13px ${HF}`, color: "#fff" }}>
                {planSaved ? "✓ Saved" : "Make this my plan"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Confirm: add life event to plan ── */}
      {pendingEvent && (
        <ConfirmModal
          t={t}
          title={`Add "${pendingEvent.l}" to your plan?`}
          body={`${pendingEvent.isInflow ? "Adds" : "Removes"} ${fmt(pendingEvent.amount)} at age ${pendingEvent.age}. It will update your arc and longevity estimate.`}
          confirmLabel="Add to plan"
          onConfirm={() => {
            setPlacedEvents(prev => [...prev, pendingEvent.l]);
            setActiveScen(pendingEvent.scen);
            setMoneyEvents(prev => [
              ...prev,
              {
                id: String(Date.now()),
                label: pendingEvent.l,
                amount: pendingEvent.amount,
                age: pendingEvent.age,
                isInflow: pendingEvent.isInflow,
                isTaxable: false,
              },
            ]);
            setPendingEvent(null);
          }}
          onCancel={() => setPendingEvent(null)}
        />
      )}

      {/* ── Confirm: make this my plan ── */}
      {showMakePlan && scenario && (
        <ConfirmModal
          t={t}
          title="Save this as your plan?"
          body={`Retire at ${scenario.scenarioRetAge} · Est. income ${fmtMo(scenario.scenarioExpenses)}/mo`}
          confirmLabel="Save plan"
          onConfirm={() => {
            commitPlan({ retirementAge: scenario.scenarioRetAge });
            setShowMakePlan(false);
            setPlanSaved(true);
            setTimeout(() => setPlanSaved(false), 2000);
          }}
          onCancel={() => setShowMakePlan(false)}
        />
      )}
    </div>
  );
}

// ── local style helpers ───────────────────────────────────────────────────────
function dialBtnStyle(t) {
  return {
    width: 36, height: 36, flexShrink: 0, borderRadius: 9,
    border: `1.5px solid ${t.line2}`, background: t.bg,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    font: `600 18px ${HF}`, color: t.accent,
    cursor: "pointer", userSelect: "none",
  };
}
function dialValStyle(t) {
  return {
    flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${t.line2}`,
    background: t.bg, display: "flex", alignItems: "center", justifyContent: "center",
  };
}
