import React, { useState, useMemo, useEffect } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";
import ApplyPreviewModal from "../ApplyPreviewModal.jsx";
import LifeEventSheet from "../LifeEventSheet.jsx";
import { VerdictTickRail } from "../fields.jsx";
import { calcWhatIfScenario, buildLeverPreview, buildLeverRail } from "../../model/what-if.js";

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

// Life-event presets — SEEDS for the LifeEventSheet (sheet-first placement flow):
// tapping a pill opens the sheet pre-filled with these values; the user tunes
// amount/age/duration there, sees the live verdict, and commits. Presets carry
// no display numbers — every figure the sheet shows comes from evaluateLifeEvent.
// One-time seeds have `amount`; duration seeds have monthlyAmount/durationMonths/
// incomeAnnual ($X/mo for N months, money-events.js). `icon` is the arc badge.
export const LIFE_EVENTS = [
  { l: "Buy a home",      icon: "🏠", age: 40, amount: 60_000, isInflow: false },
  { l: "Kid's college",   icon: "🎓", age: 52, amount: 50_000, isInflow: false },
  { l: "Travel 6 months", icon: "✈️", age: 70, monthlyAmount: 6_000, durationMonths: 6,
    incomeAnnual: 0, isInflow: false },
  { l: "Downsize",        icon: "🏡", age: 72, amount: 80_000, isInflow: true  },
  { l: "Part-time at 60", icon: "💼", age: 60, monthlyAmount: 2_000, durationMonths: 12,
    incomeAnnual: 0, isInflow: true  },
];

// Segmented-control modes. Ids stay "dials"/"life"/"suggest" for deep-link
// compat (Plan navigates with subView "dials"; signals.js with "suggest") —
// only the visible labels changed in the SP-5 tidy. "askit" is not a mode
// anymore; it's aliased to "suggest" below so any stale deep-link still lands
// on the right segment, and its canned prompt is the first row of that panel.
const MODES = [
  { k: "dials",   l: "Dials" },
  { k: "life",    l: "Events" },
  { k: "suggest", l: "Scenarios" },
];
const resolveMode = (m) => (m === "askit" ? "suggest" : m);

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

// initialMode (optional, WI-1.1): mode panel to open on arrival when another
// screen deep-links here via navigate("ideas", modeId) — e.g. the Plan
// "Retire at" stat card opens the "dials" panel. Mode buttons still control
// the state after arrival.
export default function IdeasScreen({ t, props, glow = false, strokeWidth = 3, isMobile = false, initialMode = null }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, effectiveExpenses, balAt90,
    contribSeries,
    // Batch B additions:
    whatIfSimInputs: whatIfBundle,
    setMoneyEvents,
    // WI-0.1: model-provided monthly figure for the spend dial seed
    statementView,
    // WI-1.3: committed money events shown as icon badges on the arc
    moneyEvents,
    // WI-2.7: retirement walk rows feed the arc tap-to-scrub chip
    retirementWalk,
    // Life-event sheet: age bounds computed in App.jsx (rule 10)
    lifeEventBounds,
    // Preview-first apply (2026-07-11 redesign, SP-5 tidy): the ONE write path
    // for both scenario and dial commits — never a bare setter (mirrors Plan's
    // TryAChangePanel).
    sliderBounds, applyPlanLevers,
  } = props;

  const [mode, setMode] = useState(() => resolveMode(initialMode) ?? null);
  const [activeScen, setActiveScen] = useState(null);

  // Adopt a new deep-link target if one arrives while already mounted.
  useEffect(() => { if (initialMode) setMode(resolveMode(initialMode)); }, [initialMode]);

  // Life-event sheet state: { seed } for a new event (preset values),
  // { seed, eventId } when editing a committed event (seed IS the event).
  const [eventSheet, setEventSheet] = useState(null);

  // Dial offsets (relative to current props so they stay useful after an apply)
  const [dialRetireOffset, setDialRetireOffset] = useState(0);
  const [dialSpendOffset, setDialSpendOffset]   = useState(0);

  // Apply-with-preview state — one modal at a time.
  const [showApply, setShowApply] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);

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

  // Dial display values — input staging: the sliders EDIT a value (offset is
  // screen state), seeded from the model's display-ready monthly figure (no
  // /12 here). Live — no separate "Show on arc" step; the overlay below
  // recomputes on every drag via calcWhatIfScenario.
  const dialRetireAge    = retirementAge + dialRetireOffset;
  const dialMonthlySpend = statementView.monthlyTotal + dialSpendOffset;
  const dialsActive      = dialRetireOffset !== 0 || dialSpendOffset !== 0;

  const dialScenario = useMemo(() => {
    if (!whatIfBundle || !dialsActive) return null;
    const overrides = {};
    if (dialRetireOffset !== 0) overrides.retirementAge = dialRetireAge;
    if (dialSpendOffset  !== 0) overrides.monthlyExpenses = dialMonthlySpend;
    return calcWhatIfScenario(whatIfBundle, overrides);
  }, [whatIfBundle, dialsActive, dialRetireOffset, dialSpendOffset, dialRetireAge, dialMonthlySpend]);

  // Scenario takes precedence when both happen to be active (e.g. dials dragged,
  // then a scenario card tapped) — one run drives BOTH the arc overlay and the
  // strikethrough stats below, so they can never disagree (widened V1 form).
  const activeRun     = scenario ?? dialScenario;
  const activeOverlay = activeRun?.chart?.length ? activeRun.chart : null;

  // Real scenario stats from the SAME run as the arc. scenarioBalAt90 === null
  // means the walk never reaches age 90 (not applicable, NOT zero) — designed
  // "—" state; a genuine depletion at/before 90 arrives as a real 0.
  const scenRetire = activeRun ? String(activeRun.scenarioRetAge) : null;
  const scenIncome = activeRun ? fmtMo(activeRun.scenarioExpenses) : null;
  const scenNest   = activeRun ? fmt(activeRun.scenarioTotalAtRet) : null;
  const scenLeft90 = activeRun ? fmt(activeRun.scenarioBalAt90) : null; // fmt(null) → "—"

  // Verdict tick rails for the dial sliders (colored ticks under the track) —
  // same buildLeverRail primitive Plan's "Try a change" panel uses.
  const dialRetireRail = useMemo(() => {
    const { retireMin: min, retireMax: max } = sliderBounds;
    const step = Math.max(1, Math.ceil((max - min) / 40));
    return buildLeverRail(whatIfBundle, { lever: "retirementAge", min, max, step });
  }, [whatIfBundle, sliderBounds]);

  const dialSpendRail = useMemo(() => {
    const { spendMin: min, spendMax: max } = sliderBounds;
    const step = Math.max(100, Math.ceil((max - min) / 40 / 100) * 100);
    return buildLeverRail(whatIfBundle, { lever: "monthlyExpenses", min, max, step });
  }, [whatIfBundle, sliderBounds]);

  const clearAll = () => {
    setActiveScen(null);
    setDialRetireOffset(0);
    setDialSpendOffset(0);
  };

  // ── Apply-with-preview (one commit verb) ────────────────────────────────────
  // Scenario active → preview the scenario's own retirement age. Dial active →
  // preview whichever dial(s) actually moved. Either way, buildLeverPreview
  // (what-if.js) is the SAME model call Plan's TryAChangePanel uses, so the
  // preview metrics and the eventual applyPlanLevers write can never disagree.
  const applyPreview = useMemo(() => {
    if (!whatIfBundle) return null;
    if (scen && scenario) {
      return buildLeverPreview(whatIfBundle, { retirementAge: scenario.scenarioRetAge });
    }
    if (dialsActive) {
      const overrides = {};
      if (dialRetireOffset !== 0) overrides.retirementAge = dialRetireAge;
      if (dialSpendOffset  !== 0) overrides.monthlyExpenses = dialMonthlySpend;
      return buildLeverPreview(whatIfBundle, overrides);
    }
    return null;
  }, [whatIfBundle, scen, scenario, dialsActive, dialRetireOffset, dialSpendOffset, dialRetireAge, dialMonthlySpend]);

  const applyPayload = applyPreview ? {
    title: "Apply these changes?",
    action: scen
      ? `Retire at ${scenario.scenarioRetAge} · Est. income ${fmtMo(scenario.scenarioExpenses)}/mo`
      : `Retire at ${dialRetireAge} · ${fmt(dialMonthlySpend)}/mo spend`,
    confirmLabel: "Apply changes",
    metrics: applyPreview.metrics,
    note: "Preview uses the same model as your headline numbers.",
    verdict: null, // reserved slot (WI-5.4) — not filled by a lever preview
  } : null;

  const handleApplyConfirm = () => {
    if (scen && scenario) {
      applyPlanLevers({ retirementAge: scenario.scenarioRetAge });
    } else if (dialsActive) {
      applyPlanLevers({
        ...(dialRetireOffset !== 0 ? { retirementAge: dialRetireAge } : {}),
        ...(dialSpendOffset  !== 0 ? { monthlySpend: dialMonthlySpend } : {}),
      });
    }
    setShowApply(false);
    clearAll();
    setPlanSaved(true);
    setTimeout(() => setPlanSaved(false), 2000);
  };

  // ── Life-event sheet handlers (sheet-first placement) ──────────────────────
  // A preset pill is "placed" when a committed event carries its label; tapping
  // it again re-opens the sheet in edit mode for that committed event.
  const committedByLabel = (label) => (moneyEvents ?? []).find(me => me.label === label);
  const presetSeed = ({ l, ...rest }) => ({ ...rest, label: l });

  const handleEventSave = (ev) => {
    setMoneyEvents(prev => eventSheet?.eventId
      ? prev.map(me => (me.id === eventSheet.eventId ? ev : me))
      : [...prev, ev]);
    setEventSheet(null);
  };
  const handleEventRemove = () => {
    setMoneyEvents(prev => prev.filter(me => me.id !== eventSheet.eventId));
    setEventSheet(null);
  };

  const rowLabel = { display: "flex", justifyContent: "space-between", marginBottom: 6 };
  const sliderInput = { width: "100%", cursor: "pointer", accentColor: t.accent, height: 6 };

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
        {(scen || dialsActive) && (
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
            {!scen && dialsActive && (
              <span style={{ font: `600 12px ${HF}`, color: t.accent }}>
                ↗ what-if overlay
              </span>
            )}
            <button type="button" onClick={clearAll} style={{
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
          events={moneyEvents ?? []}
          walkRows={retirementWalk?.rows ?? []}
          onEventTap={(ev) => setEventSheet({ seed: ev, eventId: ev.id })}
        />
      </div>

      {/* ── segmented control: Dials · Events · Scenarios ── */}
      <div style={{
        display: "flex", gap: 7, margin: "10px 0 0", flexShrink: 0,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        {MODES.map(({ k, l }) => {
          const on = mode === k;
          return (
            <button key={k} type="button"
              onClick={() => setMode(on ? null : k)}
              aria-pressed={on}
              style={{
                flex: isMobile ? "1 1 30%" : 1, padding: "9px 10px", borderRadius: 10,
                cursor: "pointer", textAlign: "center",
                border: `1px solid ${on ? t.accent : t.line2}`,
                background: on ? `${t.accent}14` : t.surf,
                font: `${on ? 600 : 400} 13px ${HF}`,
                color: on ? t.ink : t.mut,
                transition: "all .12s"
              }}>
              {l}
            </button>
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
            {/* ── Events (life events, sheet-first placement) ── */}
            {mode === "life" && (
              <div>
                <div style={{ font: `500 12px ${HF}`, color: t.mut, marginBottom: 9 }}>
                  Tap to shape an event, see its impact, then add it to your plan.
                  Placed events live on the arc — tap a badge (or its pill) to edit.
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {LIFE_EVENTS.map((ev) => {
                    const committed = committedByLabel(ev.l);
                    const placed = !!committed;
                    return (
                      <div key={ev.l} onClick={() => setEventSheet(placed
                        ? { seed: committed, eventId: committed.id }
                        : { seed: presetSeed(ev) })}
                        style={{
                          padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                          border: `1px solid ${placed ? t.warm : t.line2}`,
                          background: placed ? `${t.warm}14` : "transparent",
                          font: `${placed ? 600 : 400} 13px ${HF}`,
                          color: placed ? t.ink : t.mut
                        }}>
                        {ev.icon}  {placed ? "✓ " : ""}{ev.l}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Dials (live sliders) ── */}
            {mode === "dials" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Retire-at slider */}
                <div>
                  <div style={rowLabel}>
                    <span style={{ font: `500 13px ${HF}`, color: t.ink }}>Retire at</span>
                    <span style={{ font: `600 13px ${HM}`, color: t.accent }}>age {dialRetireAge}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Retire at"
                    min={sliderBounds.retireMin}
                    max={sliderBounds.retireMax}
                    step={1}
                    value={dialRetireAge}
                    onChange={e => setDialRetireOffset(Number(e.target.value) - retirementAge)}
                    style={sliderInput}
                  />
                  <VerdictTickRail t={t} rail={dialRetireRail} />
                </div>

                {/* Monthly-spend slider */}
                <div>
                  <div style={rowLabel}>
                    <span style={{ font: `500 13px ${HF}`, color: t.ink }}>Monthly spend</span>
                    <span style={{ font: `600 13px ${HM}`, color: t.accent }}>${dialMonthlySpend.toLocaleString()}/mo</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Monthly spend"
                    min={sliderBounds.spendMin}
                    max={sliderBounds.spendMax}
                    step={100}
                    value={dialMonthlySpend}
                    onChange={e => setDialSpendOffset(Number(e.target.value) - statementView.monthlyTotal)}
                    style={sliderInput}
                  />
                  <VerdictTickRail t={t} rail={dialSpendRail} />
                </div>
              </div>
            )}

            {/* ── Scenarios (Horizon suggestions + the "What if…" prompt) ── */}
            {mode === "suggest" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
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
        {(scen || dialsActive) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", flexShrink: 0 }}>
            <div
              onClick={() => !planSaved && setShowApply(true)}
              style={{
                padding: "11px 16px", borderRadius: 11,
                background: planSaved ? t.good : t.accent,
                cursor: planSaved ? "default" : "pointer",
                transition: "background .25s",
              }}
            >
              <span style={{ font: `600 13px ${HF}`, color: "#fff" }}>
                {planSaved ? "✓ Applied" : "Apply to my plan"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Life-event sheet: configure → live verdict → commit (replaces the
             old bare ConfirmModal path) ── */}
      {eventSheet && (
        <LifeEventSheet
          t={t}
          whatIfBundle={whatIfBundle}
          bounds={lifeEventBounds}
          initial={eventSheet.seed}
          onSave={handleEventSave}
          onRemove={eventSheet.eventId ? handleEventRemove : undefined}
          onCancel={() => setEventSheet(null)}
        />
      )}

      {/* ── Apply-with-preview: scenario or dial diff → applyPlanLevers ── */}
      {showApply && applyPayload && (
        <ApplyPreviewModal
          t={t}
          preview={applyPayload}
          onConfirm={handleApplyConfirm}
          onCancel={() => setShowApply(false)}
        />
      )}
    </div>
  );
}
