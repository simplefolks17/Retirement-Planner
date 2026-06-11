import React, { useState } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM } from "../ThemeContext.jsx";
import { StatCard, fmt, fmtMo } from "../shared.jsx";
import ConfirmModal from "../ConfirmModal.jsx";

export default function PlanScreen({ t, props, glow }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, yearsSustained, isSustainable,
    takeHome, effectiveExpenses, balAt90,
    withdrawalRate, contribSeries, activity,
    commitPlan,
  } = props;

  const [arcView, setArcView]       = useState("arc");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved]           = useState(false);

  const progressPct = isSustainable ? 100
    : Math.min(99, Math.round((yearsSustained / Math.max(1, lifeExpect - retirementAge)) * 100));

  const progressLabel = isSustainable
    ? "self-sustaining ↗"
    : `${Math.round(progressPct)}% there`;

  const progressColor = isSustainable ? t.good : progressPct >= 75 ? t.good : t.warm;

  const handleConfirm = () => {
    commitPlan({ retirementAge, annualExpenses: effectiveExpenses });
    setShowConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      flex: 1, padding: "20px 28px 18px",
      display: "flex", flexDirection: "column", minHeight: 0
    }}>
      {/* headline row */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 14
      }}>
        <div>
          <div style={{
            font: `600 28px ${HF}`, color: t.ink,
            letterSpacing: "-0.025em", lineHeight: 1.1
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
        <div style={{ width: 210, paddingTop: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ font: `600 12px ${HF}`, color: t.ink }}>{progressLabel}</span>
            <span style={{ font: `600 11.5px ${HF}`, color: progressColor }}>
              {isSustainable ? "↗ gaining" : withdrawalRate <= 0.04 ? "↗ on target" : "↗ adjust"}
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

      {/* arc graph */}
      <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <ArcGraph
          t={t}
          chartData={chartData}
          currentAge={currentAge}
          retirementAge={retirementAge}
          lifeExpect={lifeExpect}
          contribSeries={contribSeries}
          height={280}
          glow={glow}
          activeView={arcView}
          onViewChange={setArcView}
          showToggle
        />
      </div>

      {/* stats row */}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <StatCard t={t} label="You keep / mo"   value={fmtMo(takeHome)}          accent={t.good} />
        <StatCard t={t} label="Retire at"        value={String(retirementAge)}    accent={t.ink} />
        <StatCard t={t} label="Income for life"  value={fmtMo(effectiveExpenses)} accent={t.warm} warm />
        <StatCard t={t} label="Left at 90"       value={fmt(balAt90)}             accent={t.ink} />
      </div>

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
