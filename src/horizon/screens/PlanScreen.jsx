import React, { useState, useMemo } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM, safeGet, safeSet } from "../ThemeContext.jsx";
import { StatCard, fmt, fmtMo, kbActivate } from "../shared.jsx";
import ApplyPreviewModal, { PreviewMetricRow } from "../ApplyPreviewModal.jsx";
import LifeEventSheet from "../LifeEventSheet.jsx";
import { VerdictTickRail } from "../fields.jsx";
import { buildLeverPreview, buildLeverRail } from "../../model/what-if.js";

// ── Signals strip (WI-1.2 / #89) ──────────────────────────────────────────────
function SignalsStrip({ t, signals, navigate, isMobile }) {
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  const visible = (signals ?? []).filter(s =>
    !dismissedIds.has(s.id) && safeGet(`hz-signal-dismissed-${s.id}`) !== "1");
  if (visible.length === 0) return null;

  const dismiss = (id) => {
    safeSet(`hz-signal-dismissed-${id}`, "1");
    setDismissedIds(prev => new Set([...prev, id]));
  };

  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      gap: 10, marginTop: 10, flexShrink: 0,
    }}>
      {visible.map(sig => (
        <div key={sig.id} style={{
          flex: 1, display: "flex", alignItems: "stretch", gap: 4,
          borderRadius: 13, background: t.surf2, border: `1px solid ${t.line2}`,
        }}>
          <div
            onClick={() => navigate(sig.target.screen, sig.target.subView)}
            onKeyDown={kbActivate(() => navigate(sig.target.screen, sig.target.subView))}
            role="button"
            tabIndex={0}
            style={{
              flex: 1, display: "flex", alignItems: "center", gap: 12,
              minHeight: 44, padding: "10px 4px 10px 14px", cursor: "pointer", minWidth: 0,
            }}>
            <span style={{
              font: `600 16px ${HM}`, flexShrink: 0,
              color: sig.id === "deficit" ? t.warm : t.good,
            }}>{fmt(sig.dollars)}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", font: `600 13px ${HF}`, color: t.ink }}>
                {sig.title}
              </span>
              <span style={{ display: "block", font: `400 12px ${HF}`, color: t.mut, marginTop: 1 }}>
                {sig.body} <span style={{ color: t.accent }}>→</span>
              </span>
            </span>
          </div>
          <span
            onClick={() => dismiss(sig.id)}
            onKeyDown={kbActivate(() => dismiss(sig.id))}
            role="button"
            tabIndex={0}
            aria-label={`dismiss ${sig.id} signal`}
            style={{
              display: "flex", alignItems: "flex-start", padding: "10px 12px",
              cursor: "pointer", color: t.faint, font: `400 13px ${HF}`,
            }}>✕</span>
        </div>
      ))}
    </div>
  );
}

// ── Portfolio Hero Block ───────────────────────────────────────────────────────
// Shows the single most emotionally impactful number: total portfolio at
// retirement and the wealth multiplier. The live "vs saved plan" delta badge
// (planDelta) was removed with the Plan "Try a change" redesign (2026-07-11):
// a preview-first panel with its own delta chip replaced the old always-on
// QuickTunePanel that mutated real state directly, so there is no longer a
// meaningful "current sliders vs saved plan" comparison to show here.
function PortfolioHero({ t, totalAtRet, planHighlights }) {
  const { wealthMultiplier } = planHighlights ?? {};
  return (
    <div style={{
      background: t.surf, borderRadius: 14,
      border: `1px solid ${t.line}`,
      padding: "16px 18px",
      marginBottom: 10,
    }}>
      <div style={{ font: `500 11px ${HF}`, color: t.mut, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        Portfolio at retirement
      </div>
      <div style={{ font: `700 30px/1.1 ${HM}`, color: t.ink }}>
        {fmt(totalAtRet)}
      </div>
      {wealthMultiplier !== null && wealthMultiplier !== undefined && (
        <div style={{ font: `500 12px ${HF}`, color: t.good, marginTop: 4 }}>
          grows {wealthMultiplier}× from today
        </div>
      )}
    </div>
  );
}

// ── Income Replacement Meter ───────────────────────────────────────────────────
// Shows retirement monthly income + how much of current income it replaces,
// with per-source breakdown bars (SS, portfolio). Bar widths use model-provided
// integer percentages (ssPct, portfolioPct) — no division in JSX (rule 10).
function IncomeMeter({ t, effectiveExpenses, planHighlights }) {
  const { incomeReplacementPct, retIncomeFlow } = planHighlights ?? {};
  if (!retIncomeFlow) return null;

  const { ss, pension, portfolioDraw, hasSS, hasPension, ssPct, pensionPct, portfolioPct } = retIncomeFlow;

  return (
    <div style={{
      background: t.surf, borderRadius: 14,
      border: `1px solid ${t.line}`,
      padding: "14px 18px",
      marginBottom: 10,
    }}>
      <div style={{ font: `500 11px ${HF}`, color: t.mut, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        Retirement income
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ font: `700 22px/1 ${HM}`, color: t.ink }}>
          {fmtMo(effectiveExpenses)}/mo
        </span>
        {incomeReplacementPct !== null && incomeReplacementPct !== undefined && (
          <span style={{ font: `500 12px ${HF}`, color: t.mut }}>
            {incomeReplacementPct}% of current income
          </span>
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {hasSS && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: `400 11px ${HF}`, color: t.mut, width: 78, flexShrink: 0 }}>
              Soc. Security
            </span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: t.line, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${ssPct}%`, borderRadius: 3, background: t.good }} />
            </div>
            <span style={{ font: `600 11px ${HM}`, color: t.good, width: 60, textAlign: "right", flexShrink: 0 }}>
              {fmtMo(ss)}/mo
            </span>
          </div>
        )}
        {hasPension && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: `400 11px ${HF}`, color: t.mut, width: 78, flexShrink: 0 }}>
              Pension
            </span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: t.line, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pensionPct}%`, borderRadius: 3, background: t.warm }} />
            </div>
            <span style={{ font: `600 11px ${HM}`, color: t.warm, width: 60, textAlign: "right", flexShrink: 0 }}>
              {fmtMo(pension)}/mo
            </span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ font: `400 11px ${HF}`, color: t.mut, width: 78, flexShrink: 0 }}>
            Portfolio
          </span>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: t.line, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${portfolioPct}%`, borderRadius: 3, background: t.accent }} />
          </div>
          <span style={{ font: `600 11px ${HM}`, color: t.accent, width: 60, textAlign: "right", flexShrink: 0 }}>
            {fmtMo(portfolioDraw)}/mo
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Try a change panel ──────────────────────────────────────────────────────────
// Preview-first levers (2026-07-11 redesign): dragging a slider NEVER touches
// real App state — it only moves a local offset, which feeds buildLeverPreview
// (what-if.js) for a live dashed-overlay + delta chip. Real state changes only
// when the user explicitly confirms in the ApplyPreviewModal (applyPlanLevers).
// Rule 10: every verdict/delta/tick color comes straight from the model
// (buildLeverPreview / buildLeverRail) — the shared VerdictTickRail (fields.jsx)
// maps a verdict STRING to a theme token and nothing else; it never computes or
// compares dollars.

function TryAChangePanel({
  t, isMobile, navigate,
  retirementAge, monthlySpend, sliderBounds, whatIfSimInputs, applyPlanLevers,
  // Controlled from PlanScreen (not local state here) so the arc — rendered
  // ABOVE this panel — reads the exact same offsets/preview and can never
  // show a different scenario than this panel's own delta chip (V1/principle 7).
  retireOffset, spendOffset, setRetireOffset, setSpendOffset, preview,
}) {
  const [showApply, setShowApply] = useState(false);

  const draggedAge     = retirementAge + retireOffset;
  const draggedMonthly = monthlySpend + spendOffset;

  const retireRail = useMemo(() => {
    const { retireMin: min, retireMax: max } = sliderBounds;
    const step = Math.max(1, Math.ceil((max - min) / 40));
    return buildLeverRail(whatIfSimInputs, { lever: "retirementAge", min, max, step });
  }, [whatIfSimInputs, sliderBounds]);

  const spendRail = useMemo(() => {
    const { spendMin: min, spendMax: max } = sliderBounds;
    const step = Math.max(100, Math.ceil((max - min) / 40 / 100) * 100);
    return buildLeverRail(whatIfSimInputs, { lever: "monthlyExpenses", min, max, step });
  }, [whatIfSimInputs, sliderBounds]);

  const discard = () => { setRetireOffset(0); setSpendOffset(0); };

  const applyPayload = (preview?.changed) ? {
    title: "Apply these changes?",
    action: `Retire at ${draggedAge} · ${fmt(draggedMonthly)}/mo spend`,
    confirmLabel: "Apply changes",
    metrics: preview.metrics,
    note: "Preview uses the same model as your headline numbers.",
    verdict: null, // reserved slot (WI-5.4) — not filled by a lever preview
  } : null;

  const handleConfirm = () => {
    applyPlanLevers({
      ...(retireOffset !== 0 ? { retirementAge: draggedAge } : {}),
      ...(spendOffset  !== 0 ? { monthlySpend: draggedMonthly } : {}),
    });
    discard();
    setShowApply(false);
  };

  const rowLabel = { display: "flex", justifyContent: "space-between", marginBottom: 6 };
  const sliderInput = { width: "100%", cursor: "pointer", accentColor: t.accent, height: 6 };

  return (
    <div style={{
      background: t.surf, borderRadius: 14,
      border: `1px solid ${t.line}`,
      padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ font: `600 11px ${HF}`, color: t.mut, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Try a change
      </div>

      {/* Retire-at slider */}
      <div>
        <div style={rowLabel}>
          <span style={{ font: `500 13px ${HF}`, color: t.ink }}>Retire at</span>
          <span style={{ font: `600 13px ${HM}`, color: t.accent }}>age {draggedAge}</span>
        </div>
        <input
          type="range"
          aria-label="Retire at"
          min={sliderBounds.retireMin}
          max={sliderBounds.retireMax}
          step={1}
          value={draggedAge}
          onChange={e => setRetireOffset(Number(e.target.value) - retirementAge)}
          style={sliderInput}
        />
        <VerdictTickRail t={t} rail={retireRail} />
      </div>

      {/* Monthly-spend slider */}
      <div>
        <div style={rowLabel}>
          <span style={{ font: `500 13px ${HF}`, color: t.ink }}>Monthly spend</span>
          <span style={{ font: `600 13px ${HM}`, color: t.accent }}>${draggedMonthly.toLocaleString()}/mo</span>
        </div>
        <input
          type="range"
          aria-label="Monthly spend"
          min={sliderBounds.spendMin}
          max={sliderBounds.spendMax}
          step={100}
          value={draggedMonthly}
          onChange={e => setSpendOffset(Number(e.target.value) - monthlySpend)}
          style={sliderInput}
        />
        <VerdictTickRail t={t} rail={spendRail} />
      </div>

      {/* Footer: idle link, or a live delta chip + Apply/Discard */}
      {preview?.changed ? (
        <div>
          <div style={{ marginBottom: 4 }}>
            {preview.metrics.map(metric => (
              <PreviewMetricRow key={metric.id} t={t} metric={metric} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setShowApply(true)}
              style={{
                flex: 1, font: `600 13px ${HF}`, color: "#fff",
                background: t.accent, border: `1px solid ${t.accent}`,
                borderRadius: 10, padding: "9px 16px", cursor: "pointer",
              }}
            >
              Apply changes
            </button>
            <button
              type="button"
              onClick={discard}
              style={{
                font: `500 12px ${HF}`, color: t.mut, background: "transparent",
                border: `1px solid ${t.line}`, borderRadius: 10, padding: "9px 14px",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Discard
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => navigate("ideas", "dials")}
          style={{
            font: `500 12.5px ${HF}`, color: t.mut, cursor: "pointer",
            background: "transparent", border: "none", padding: 0, textAlign: "left",
          }}
        >
          More in Ideas <span style={{ color: t.accent }}>→</span>
        </button>
      )}

      {showApply && applyPayload && (
        <ApplyPreviewModal
          t={t}
          preview={applyPayload}
          onConfirm={handleConfirm}
          onCancel={() => setShowApply(false)}
        />
      )}

      {/* Mobile: a slim sticky bar above the tab bar so Apply/Discard stay
          reachable without scrolling back up to the panel. */}
      {isMobile && preview?.changed && (
        <div style={{
          position: "fixed", left: 12, right: 12, bottom: 64, zIndex: 40,
          display: "flex", gap: 8, padding: "10px 12px",
          background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 12,
          boxShadow: "0 6px 24px rgba(0,0,0,.18)",
        }}>
          <button
            type="button"
            onClick={() => setShowApply(true)}
            style={{
              flex: 1, font: `600 13px ${HF}`, color: "#fff",
              background: t.accent, border: `1px solid ${t.accent}`,
              borderRadius: 9, padding: "9px 14px", cursor: "pointer",
            }}
          >
            Apply changes
          </button>
          <button
            type="button"
            onClick={discard}
            style={{
              font: `500 12px ${HF}`, color: t.mut, background: "transparent",
              border: `1px solid ${t.line}`, borderRadius: 9, padding: "9px 12px",
              cursor: "pointer",
            }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

export default function PlanScreen({ t, props, glow, strokeWidth = 3, isMobile = false, navigate }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, isSustainable,
    takeHome, effectiveExpenses, balAt90,
    contribSeries, activity,
    planView, signals, moneyEvents, retirementWalk,
    planHighlights, statementView,
    // Try-a-change panel + life-event edit-in-place.
    whatIfSimInputs, monthlySpend, sliderBounds, applyPlanLevers,
    saveEvent, removeEvent, lifeEventBounds,
  } = props;

  const [arcView, setArcView] = useState("arc");

  // Preview-first lever state lives here (not inside TryAChangePanel) so the
  // arc's dashed overlay and the panel's delta chip share the SAME model run
  // and offsets, even though the arc renders above the panel in the layout.
  const [retireOffset, setRetireOffset] = useState(0);
  const [spendOffset, setSpendOffset]   = useState(0);
  const draggedAge     = retirementAge + retireOffset;
  const draggedMonthly = monthlySpend + spendOffset;
  const arcPreview = useMemo(() => {
    const overrides = {};
    if (retireOffset !== 0) overrides.retirementAge = draggedAge;
    if (spendOffset !== 0) overrides.monthlyExpenses = draggedMonthly;
    return buildLeverPreview(whatIfSimInputs, overrides);
  }, [whatIfSimInputs, retireOffset, spendOffset, draggedAge, draggedMonthly]);

  // Committed-event edit sheet ({ seed, eventId }) — opened by tapping an arc badge.
  const [eventSheet, setEventSheet] = useState(null);
  const openEventSheet = (ev) => setEventSheet({ seed: ev, eventId: ev.id });
  const handleEventSave = (ev) => {
    saveEvent(ev);
    setEventSheet(null);
  };
  const handleEventRemove = () => {
    removeEvent(eventSheet.eventId);
    setEventSheet(null);
  };

  const { progressPct } = planView;
  const wrOk = planView.drivers.find(d => d.id === "withdrawal")?.ok;

  const progressLabel = isSustainable ? "self-sustaining ↗" : `${progressPct}% there`;
  const progressColor = isSustainable ? t.good : progressPct >= 75 ? t.good : t.warm;

  const progressBar = (
    <div style={{ width: isMobile ? "100%" : 210, paddingTop: isMobile ? 0 : 5, flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ font: `600 12px ${HF}`, color: t.ink }}>{progressLabel}</span>
        <span style={{ font: `600 11.5px ${HF}`, color: progressColor }}>
          {isSustainable ? "↗ gaining" : wrOk ? "↗ on target" : "↗ adjust"}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 6, background: t.line, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${progressPct}%`,
          background: `linear-gradient(90deg, ${t.good}, ${t.warm})`,
        }} />
      </div>
    </div>
  );

  const arc = (
    <ArcGraph
      t={t}
      chartData={chartData}
      currentAge={currentAge}
      retirementAge={retirementAge}
      lifeExpect={lifeExpect}
      contribSeries={contribSeries}
      compact={isMobile}
      fillHeight
      glow={glow}
      strokeWidth={strokeWidth}
      activeView={arcView}
      onViewChange={setArcView}
      showToggle={!isMobile}
      events={moneyEvents ?? []}
      walkRows={retirementWalk?.rows ?? []}
      onEventTap={openEventSheet}
      scenarioData={arcPreview?.changed ? arcPreview.chart : null}
    />
  );

  return (
    <div style={{
      flex: 1,
      padding: isMobile ? "14px 16px 12px" : "20px 28px 18px",
      display: "flex", flexDirection: "column", minHeight: 0,
    }}>

      {/* ── headline row ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "flex-start",
        gap: isMobile ? 10 : 0,
        marginBottom: 14,
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            font: `600 ${isMobile ? "20px" : "28px"}/1.1 ${HF}`, color: t.ink,
            letterSpacing: "-0.025em",
          }}>
            {isSustainable
              ? `On track to retire at ${retirementAge}.`
              : `Retire at ${retirementAge} — keep building.`}
          </div>
          <div style={{ font: `500 14px ${HF}`, color: t.mut, marginTop: 7 }}>
            Work optional,{" "}
            <span style={{ color: t.accent, fontWeight: 700 }}>{activity}</span>{" "}
            mandatory.
          </div>
        </div>
        {!isMobile && progressBar}
      </div>

      {/* ── full-width arc ───────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        height: isMobile ? "38vh" : "54vh",
        minHeight: isMobile ? 220 : 300,
        flexShrink: 0,
        marginBottom: isMobile ? 14 : 18,
      }}>
        {arc}
      </div>

      {isMobile && <div style={{ marginBottom: 14, flexShrink: 0 }}>{progressBar}</div>}

      {/* ── hero row + Try a change panel ────────────────────────────────────── */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <PortfolioHero t={t} totalAtRet={totalAtRet} planHighlights={planHighlights} />
            </div>
            <div style={{ flex: 1 }}>
              <IncomeMeter t={t} effectiveExpenses={effectiveExpenses} planHighlights={planHighlights} />
            </div>
          </div>
          <TryAChangePanel
            t={t} isMobile navigate={navigate}
            retirementAge={retirementAge} monthlySpend={monthlySpend}
            sliderBounds={sliderBounds} whatIfSimInputs={whatIfSimInputs}
            applyPlanLevers={applyPlanLevers}
            retireOffset={retireOffset} spendOffset={spendOffset}
            setRetireOffset={setRetireOffset} setSpendOffset={setSpendOffset}
            preview={arcPreview}
          />
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1.1fr 1.2fr", gap: 14, flexShrink: 0,
        }}>
          <PortfolioHero t={t} totalAtRet={totalAtRet} planHighlights={planHighlights} />
          <IncomeMeter t={t} effectiveExpenses={effectiveExpenses} planHighlights={planHighlights} />
          <TryAChangePanel
            t={t} isMobile={false} navigate={navigate}
            retirementAge={retirementAge} monthlySpend={monthlySpend}
            sliderBounds={sliderBounds} whatIfSimInputs={whatIfSimInputs}
            applyPlanLevers={applyPlanLevers}
            retireOffset={retireOffset} spendOffset={spendOffset}
            setRetireOffset={setRetireOffset} setSpendOffset={setSpendOffset}
            preview={arcPreview}
          />
        </div>
      )}

      {/* ── stat cards ───────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
        gap: 10, marginTop: 14, flexShrink: 0,
      }}>
        <StatCard t={t} label="You keep / mo"
          value={fmtMo(takeHome)}
          sub={statementView?.keepPct != null ? `${statementView.keepPct}% of income` : undefined}
          accent={t.good}
          onClick={() => navigate("numbers", "statement")} />
        <StatCard t={t} label="Retire at"
          value={String(retirementAge)}
          sub={planHighlights?.yearsToRetirement != null ? `in ${planHighlights.yearsToRetirement} yrs` : undefined}
          accent={t.ink}
          onClick={() => navigate("ideas", "dials")} />
        <StatCard t={t} label="Income for life"
          value={fmtMo(effectiveExpenses)}
          sub={planHighlights?.incomeReplacementPct != null ? `${planHighlights.incomeReplacementPct}% replaced` : undefined}
          accent={t.warm} warm
          onClick={() => navigate("numbers", "statement")} />
        <StatCard t={t} label={`Left at ${lifeExpect}`}
          value={fmt(balAt90)}
          sub={planHighlights?.retirementDuration != null ? `after ${planHighlights.retirementDuration} yrs` : undefined}
          accent={t.ink}
          onClick={() => navigate("numbers", "yearly")} />
        <StatCard t={t} label="Retirement taxes"
          value={planHighlights?.lifetimeTaxBurden != null ? fmt(planHighlights.lifetimeTaxBurden) : "—"}
          sub="RMDs + conversions"
          accent={t.mut}
          onClick={() => navigate("numbers", "taxes")} />
      </div>

      {/* ── signals strip ────────────────────────────────────────────────────── */}
      <SignalsStrip t={t} signals={signals} navigate={navigate} isMobile={isMobile} />

      {/* ── life-event edit sheet (opened by tapping an arc badge) ───────────── */}
      {eventSheet && (
        <LifeEventSheet
          t={t}
          whatIfBundle={whatIfSimInputs}
          bounds={lifeEventBounds}
          initial={eventSheet.seed}
          onSave={handleEventSave}
          onRemove={handleEventRemove}
          onCancel={() => setEventSheet(null)}
        />
      )}
    </div>
  );
}
