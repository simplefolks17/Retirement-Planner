import React, { useState, useCallback, useEffect } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM, safeGet, safeSet } from "../ThemeContext.jsx";
import { StatCard, fmt, fmtMo, kbActivate } from "../shared.jsx";
import ApplyPreviewModal from "../ApplyPreviewModal.jsx";

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
// Shows the single most emotionally impactful number: total portfolio at retirement,
// the wealth multiplier, and a live delta badge when sliders have moved from the
// committed plan.
function PortfolioHero({ t, totalAtRet, planHighlights, planDelta, isDirty }) {
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
      {isDirty && planDelta?.badge && (
        <div style={{
          marginTop: 8, padding: "5px 10px",
          background: planDelta.badge.dir === "up" ? `${t.good}18` : `${t.warm}18`,
          borderRadius: 8,
          font: `600 12px ${HF}`,
          color: planDelta.badge.dir === "up" ? t.good : t.warm,
        }}>
          {planDelta.badge.dir === "up" ? "↑" : "↓"} {fmt(planDelta.badge.atRetAbs)} vs saved plan
          {planDelta.badge.yearsGain != null && (
            <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.8 }}>
              · +{planDelta.badge.yearsGain} yrs
            </span>
          )}
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

// ── Quick Tune Panel ───────────────────────────────────────────────────────────
// One active slider at a time; pill rail lets the user switch which lever is live.
// Sliders call App.jsx setters directly — the arc re-renders in the same cycle.
// Rule 10: no math here; all values come from model-provided horizonProps fields.
function QuickTunePanel({ t, isMobile, props, onDirtyChange }) {
  const {
    // Current values (what the sliders display)
    retirementAge, annualExpenses, lifeExpect,
    returnRate, inflationRate, incomeGrowth, contrib401k,
    ssClaimingAge, spouseClaimingAge, annualConversionAmt,
    currentAge,
    // Pre-computed display values and slider bounds (rule 10: no bounds math in screens)
    monthlySpend, sliderBounds,
    // Conditional flags
    isMarried,
    // Setters
    setAnnualExpenses, setLifeExpect, setContrib401k,
    setIncomeGrowth, setReturnRate, setInflationRate,
    setSsClaimingAge, setSpouseClaimingAge, setAnnualConversionAmt,
    // Coupled callbacks (invariant-preserving + rule 10 write-backs)
    setRetirementAgeCoupled, setMonthlySpend, setConversionMode,
    // Save + Reset (WI-3.9: planCommit is the Apply-with-preview site — preview +
    // apply() come pre-built from App.jsx, this screen never calls commitPlan directly)
    planCommit, committedPlan,
  } = props;

  const [activeKey, setActiveKey] = useState("retire");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved]           = useState(false);

  // Build slider definitions — only filtering out conditionally absent ones.
  const sliders = [
    {
      key: "retire",
      label: "Retire at",
      headline: "When do you retire?",
      value: retirementAge,
      min: sliderBounds.retireMin, max: sliderBounds.retireMax, step: 1,
      format: v => `age ${v}`,
      onChange: v => setRetirementAgeCoupled(v),
    },
    {
      key: "spend",
      label: "Monthly spend",
      headline: "How much will you spend in retirement?",
      value: monthlySpend,
      min: sliderBounds.spendMin, max: sliderBounds.spendMax, step: 100,
      format: v => `$${v.toLocaleString()}/mo`,
      onChange: v => setMonthlySpend(v),
    },
    {
      key: "horizon",
      label: "Plan to age",
      headline: "How long should your money last?",
      value: lifeExpect,
      min: sliderBounds.horizonMin, max: sliderBounds.horizonMax, step: 1,
      format: v => `age ${v}`,
      onChange: v => setLifeExpect(v),
    },
    {
      key: "contrib",
      label: "401k savings",
      headline: "How much do you save in your 401k each year?",
      value: contrib401k,
      min: 0, max: sliderBounds.contribMax, step: 500,
      format: v => `$${v.toLocaleString()}/yr`,
      onChange: v => setContrib401k(v),
    },
    {
      key: "growth",
      label: "Income growth",
      headline: "How fast does your income grow each year?",
      value: incomeGrowth,
      min: 0, max: 10, step: 0.5,
      format: v => `${v}%/yr`,
      onChange: v => setIncomeGrowth(v),
    },
    {
      key: "return",
      label: "Growth rate",
      headline: "How fast will your investments grow?",
      value: returnRate,
      min: 1, max: 12, step: 0.5,
      format: v => `${v}%/yr`,
      onChange: v => setReturnRate(v),
    },
    {
      key: "inflation",
      label: "Inflation",
      headline: "What inflation rate do you want to plan for?",
      value: inflationRate,
      min: 0, max: 6, step: 0.5,
      format: v => `${v}%/yr`,
      onChange: v => setInflationRate(v),
    },
    {
      key: "ss",
      label: "SS age",
      headline: "When will you claim Social Security?",
      value: ssClaimingAge,
      min: 62, max: 70, step: 1,
      format: v => `age ${v}`,
      onChange: v => setSsClaimingAge(v),
    },
    isMarried && {
      key: "spouseSS",
      label: "Spouse SS",
      headline: "When will your spouse claim Social Security?",
      value: spouseClaimingAge,
      min: 62, max: 70, step: 1,
      format: v => `age ${v}`,
      onChange: v => setSpouseClaimingAge(v),
    },
    sliderBounds.canTuneRothConversion && {
      key: "roth",
      label: "Roth conv.",
      headline: "How much do you convert to Roth each year?",
      value: annualConversionAmt,
      min: 0, max: sliderBounds.rothMax, step: 1_000,
      format: v => `$${v.toLocaleString()}/yr`,
      // Switch to custom mode so the amount actually takes effect (bracket mode ignores it).
      onChange: v => { setConversionMode("custom"); setAnnualConversionAmt(v); },
    },
  ].filter(Boolean);

  // Guard: if activeKey was for a conditional slider that's now hidden, fall back.
  const activeSlider = sliders.find(s => s.key === activeKey) ?? sliders[0];

  // isDirty: any slider value differs from the committed snapshot.
  const isDirty = committedPlan !== null && (
    retirementAge                                !== committedPlan.retirementAge          ||
    annualExpenses                               !== committedPlan.annualExpenses         ||
    lifeExpect             !== committedPlan.lifeExpect             ||
    returnRate             !== committedPlan.returnRate             ||
    inflationRate          !== committedPlan.inflationRate          ||
    incomeGrowth           !== committedPlan.incomeGrowth           ||
    contrib401k            !== committedPlan.contrib401k            ||
    ssClaimingAge          !== committedPlan.ssClaimingAge          ||
    spouseClaimingAge      !== committedPlan.spouseClaimingAge      ||
    annualConversionAmt    !== committedPlan.annualConversionAmt
  );

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Clear the "Plan saved" badge immediately when the user edits a slider after saving.
  useEffect(() => { if (isDirty) setSaved(false); }, [isDirty]);

  // Clear the "Plan saved" checkmark after 2 s; cleanup prevents the fire-on-unmount leak.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const handleConfirmSave = useCallback(() => {
    planCommit.apply();
    setShowConfirm(false);
    setSaved(true);
  }, [planCommit]);

  const handleReset = useCallback(() => {
    if (!committedPlan) return;
    setRetirementAgeCoupled(committedPlan.retirementAge);
    setAnnualExpenses(committedPlan.annualExpenses);
    setLifeExpect(committedPlan.lifeExpect);
    setReturnRate(committedPlan.returnRate);
    setInflationRate(committedPlan.inflationRate);
    setIncomeGrowth(committedPlan.incomeGrowth);
    setContrib401k(committedPlan.contrib401k);
    setSsClaimingAge(committedPlan.ssClaimingAge);
    setSpouseClaimingAge(committedPlan.spouseClaimingAge);
    setAnnualConversionAmt(committedPlan.annualConversionAmt);
  }, [committedPlan, setRetirementAgeCoupled, setAnnualExpenses, setLifeExpect, setReturnRate,
      setInflationRate, setIncomeGrowth, setContrib401k, setSsClaimingAge,
      setSpouseClaimingAge, setAnnualConversionAmt]);

  const panelPad = isMobile ? "14px 0 0" : "0";

  return (
    <div style={{ padding: panelPad, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* section header */}
      <div style={{ font: `600 11px ${HF}`, color: t.mut, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Tune your plan
      </div>

      {/* pill rail — horizontally scrollable, one pill per slider.
          Toggle buttons with aria-pressed (matches the Numbers tab strip
          pattern); not an ARIA tablist since there's no arrow-key tab nav. */}
      <div
        aria-label="Select a plan lever"
        style={{
          display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2,
          scrollbarWidth: "none",
        }}>
        {sliders.map(s => {
          const isActive = s.key === activeSlider.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveKey(s.key)}
              style={{
                flexShrink: 0,
                font: `${isActive ? 600 : 500} 12px ${HF}`,
                color: isActive ? t.ink : t.mut,
                background: isActive ? t.surf2 : "transparent",
                border: `1px solid ${isActive ? t.line2 : t.line}`,
                borderRadius: 20, padding: "5px 12px",
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "all .15s",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* active slider area */}
      <div style={{
        background: t.surf, borderRadius: 14,
        border: `1px solid ${t.line}`,
        padding: "16px 18px",
      }}>
        <div style={{ font: `500 13px ${HF}`, color: t.mut, marginBottom: 6 }}>
          {activeSlider.headline}
        </div>
        <div style={{
          font: `700 28px/1 ${HM}`, color: t.ink, marginBottom: 14,
        }}>
          {activeSlider.format(activeSlider.value)}
        </div>
        <input
          type="range"
          aria-label={activeSlider.headline}
          aria-valuetext={activeSlider.format(activeSlider.value)}
          min={activeSlider.min}
          max={activeSlider.max}
          step={activeSlider.step}
          value={activeSlider.value}
          onChange={e => activeSlider.onChange(Number(e.target.value))}
          style={{
            width: "100%", cursor: "pointer",
            accentColor: t.accent,
            height: 6,
          }}
        />
        <div style={{
          display: "flex", justifyContent: "space-between",
          font: `400 11px ${HF}`, color: t.faint, marginTop: 6,
        }}>
          <span>{activeSlider.format(activeSlider.min)}</span>
          <span>{activeSlider.format(activeSlider.max)}</span>
        </div>
      </div>

      {/* save + reset buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => !saved && setShowConfirm(true)}
          style={{
            flex: 1, font: `600 13px ${HF}`,
            color: saved ? t.good : t.ink,
            background: saved ? "transparent" : t.accent,
            border: `1px solid ${saved ? t.good : t.accent}`,
            borderRadius: 10, padding: "9px 16px",
            cursor: saved ? "default" : "pointer",
            transition: "all .2s",
          }}
        >
          <span style={{ color: saved ? t.good : "#fff" }}>
            {saved ? "✓ Plan saved" : "Save as my plan"}
          </span>
        </button>
        {isDirty && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset to saved plan"
            style={{
              font: `500 12px ${HF}`, color: t.mut,
              background: "transparent",
              border: `1px solid ${t.line}`,
              borderRadius: 10, padding: "9px 14px",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            ↺ Reset
          </button>
        )}
      </div>

      {showConfirm && (
        <ApplyPreviewModal
          t={t}
          preview={planCommit.preview}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowConfirm(false)}
        />
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
    planHighlights, planDelta, statementView,
  } = props;

  const [arcView, setArcView] = useState("arc");
  const [isDirty, setIsDirty] = useState(false);

  const { progressPct } = planView;
  const wrOk = planView.drivers.find(d => d.id === "withdrawal")?.ok;

  const progressLabel = isSustainable ? "self-sustaining ↗" : `${progressPct}% there`;
  const progressColor = isSustainable ? t.good : progressPct >= 75 ? t.good : t.warm;

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
        {/* progress bar */}
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
      </div>

      {/* ── main content: arc + Quick Tune panel ─────────────────────────────── */}
      {isMobile ? (
        // Mobile: arc stacked above the tune panel
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
          <div style={{ minHeight: 220 }}>
            <ArcGraph
              t={t}
              chartData={chartData}
              currentAge={currentAge}
              retirementAge={retirementAge}
              lifeExpect={lifeExpect}
              contribSeries={contribSeries}
              height={220}
              compact
              glow={glow}
              strokeWidth={strokeWidth}
              activeView={arcView}
              onViewChange={setArcView}
              showToggle={false}
              events={moneyEvents ?? []}
              walkRows={retirementWalk?.rows ?? []}
            />
          </div>
          {/* Hero row — 2-up on mobile */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <PortfolioHero
                t={t}
                totalAtRet={totalAtRet}
                planHighlights={planHighlights}
                planDelta={planDelta}
                isDirty={isDirty}
              />
            </div>
            <div style={{ flex: 1 }}>
              <IncomeMeter t={t} effectiveExpenses={effectiveExpenses} planHighlights={planHighlights} />
            </div>
          </div>
          <QuickTunePanel t={t} isMobile props={props} onDirtyChange={setIsDirty} />
        </div>
      ) : (
        // Desktop: arc on the left, tune panel fixed-width on the right
        <div style={{ display: "flex", gap: 24, flex: "1 1 0", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 260 }}>
            <ArcGraph
              t={t}
              chartData={chartData}
              currentAge={currentAge}
              retirementAge={retirementAge}
              lifeExpect={lifeExpect}
              contribSeries={contribSeries}
              fillHeight
              glow={glow}
              strokeWidth={strokeWidth}
              activeView={arcView}
              onViewChange={setArcView}
              showToggle
              events={moneyEvents ?? []}
              walkRows={retirementWalk?.rows ?? []}
            />
          </div>
          <div style={{ width: 320, flexShrink: 0, overflowY: "auto" }}>
            <PortfolioHero
              t={t}
              totalAtRet={totalAtRet}
              planHighlights={planHighlights}
              planDelta={planDelta}
              isDirty={isDirty}
            />
            <IncomeMeter t={t} effectiveExpenses={effectiveExpenses} planHighlights={planHighlights} />
            <QuickTunePanel t={t} isMobile={false} props={props} onDirtyChange={setIsDirty} />
          </div>
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
    </div>
  );
}
