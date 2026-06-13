import React, { useState } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM, safeGet, safeSet } from "../ThemeContext.jsx";
import { StatCard, fmt, fmtMo } from "../shared.jsx";
import ConfirmModal from "../ConfirmModal.jsx";

// ── Signals strip (WI-1.2 / #89) ──────────────────────────────────────────────
// Renders the ≤2 ranked signals from calcSignals (props.signals) — title, body,
// and dollars verbatim from the model; tapping deep-links via navigate(target).
// Dismissing persists per-signal via safeSet("hz-signal-dismissed-<id>") so a
// dismissed signal doesn't reappear on reload. No qualifying signals → renders
// nothing (no empty chrome).
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
          {/* tap target ≥ 44px (minHeight + padding) */}
          <div
            onClick={() => navigate(sig.target.screen, sig.target.subView)}
            role="button"
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
            role="button"
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

export default function PlanScreen({ t, props, glow, strokeWidth = 3, isMobile = false, navigate }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, isSustainable,
    takeHome, effectiveExpenses, balAt90,
    contribSeries, activity,
    commitPlan,
    // WI-0.1 (V6): progress % computed by calcPlanProgress in the model
    // (Infinity / zero-horizon guards live there) — the screen only picks
    // labels and colors from the provided numbers. WI-1.1: planView.drivers
    // carries the pill/trend ok booleans (rule 10 — no comparisons here).
    planView,
    // WI-1.2: ranked nudges from calcSignals
    signals,
    // WI-1.3: committed money events shown as dots on the arc
    moneyEvents,
    // WI-2.7: retirement walk rows feed the arc tap-to-scrub chip
    retirementWalk,
  } = props;

  const [arcView, setArcView]       = useState("arc");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved]           = useState(false);

  const { progressPct } = planView;
  // Field selection, not math: the withdrawal-rate verdict comes from the model.
  const wrOk = planView.drivers.find(d => d.id === "withdrawal")?.ok;

  const progressLabel = isSustainable
    ? "self-sustaining ↗"
    : `${progressPct}% there`;

  const progressColor = isSustainable ? t.good : progressPct >= 75 ? t.good : t.warm;

  const handleConfirm = () => {
    commitPlan({ retirementAge, annualExpenses: effectiveExpenses });
    setShowConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      flex: 1, padding: isMobile ? "14px 16px 12px" : "20px 28px 18px",
      display: "flex", flexDirection: "column", minHeight: 0
    }}>
      {/* headline row */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "flex-start",
        gap: isMobile ? 10 : 0,
        marginBottom: 14,
      }}>
        <div>
          <div style={{
            font: `600 ${isMobile ? "20px" : "28px"}/1.1 ${HF}`, color: t.ink,
            letterSpacing: "-0.025em"
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
        {/* progress bar */}
        <div style={{ width: isMobile ? "100%" : 210, paddingTop: isMobile ? 0 : 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ font: `600 12px ${HF}`, color: t.ink }}>{progressLabel}</span>
            <span style={{ font: `600 11.5px ${HF}`, color: progressColor }}>
              {isSustainable ? "↗ gaining" : wrOk ? "↗ on target" : "↗ adjust"}
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 6, background: t.line, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${t.good}, ${t.warm})`
            }} />
          </div>
        </div>
      </div>

      {/* arc graph — fills the available vertical space so there's no dead gap */}
      <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minHeight: isMobile ? 220 : 260 }}>
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
          activeView={arcView}
          onViewChange={setArcView}
          showToggle={!isMobile}
          events={moneyEvents ?? []}
          walkRows={retirementWalk?.rows ?? []}
        />
      </div>

      {/* stats row — 2×2 grid on mobile, single row on desktop.
          WI-1.1: every number is a door — each card navigates to the screen
          that explains it (take-home & income → Numbers/Statement; retire age
          → Ideas dials; balance at 90 → Numbers/Year by year). */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: 10, marginTop: 14,
      }}>
        <StatCard t={t} label="You keep / mo"   value={fmtMo(takeHome)}          accent={t.good}
          onClick={() => navigate("numbers", "statement")} />
        <StatCard t={t} label="Retire at"        value={String(retirementAge)}    accent={t.ink}
          onClick={() => navigate("ideas", "dials")} />
        <StatCard t={t} label="Income for life"  value={fmtMo(effectiveExpenses)} accent={t.warm} warm
          onClick={() => navigate("numbers", "statement")} />
        <StatCard t={t} label="Left at 90"       value={fmt(balAt90)}             accent={t.ink}
          onClick={() => navigate("numbers", "yearly")} />
      </div>

      {/* signals strip (WI-1.2) — renders nothing when no signals qualify */}
      <SignalsStrip t={t} signals={signals} navigate={navigate} isMobile={isMobile} />

      {/* plan action */}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => !saved && setShowConfirm(true)}
          style={{
            font: `600 13px ${HF}`, color: saved ? t.good : t.mut,
            background: "transparent",
            border: `1px solid ${saved ? t.good : t.line}`,
            borderRadius: 8, padding: "8px 16px", cursor: saved ? "default" : "pointer",
            transition: "all .2s",
          }}
        >
          {saved ? "✓ Plan saved" : "Make this my plan"}
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          t={t}
          title="Lock in your plan?"
          body={`Retire at ${retirementAge} · ${fmtMo(effectiveExpenses)}/mo income`}
          confirmLabel="Save plan"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
