import React, { useState, useMemo, useRef, useEffect } from "react";
import ArcGraph from "../../components/ArcGraph.jsx";
import { HF, HM, safeGet, safeSet } from "../ThemeContext.jsx";
import { StatCard, Btn, Pill, fmt, fmtMo, fmtMonthly } from "../shared.jsx";
import { RETIRE_JUMPS, resolveRetireJump } from "../presets.js";
import ApplyPreviewModal, { PreviewMetricRow } from "../ApplyPreviewModal.jsx";
import LifeEventSheet from "../LifeEventSheet.jsx";
import { VerdictTickRail } from "../fields.jsx";
import { buildLeverPreview, buildLeverRail } from "../../model/what-if.js";
import { verdictDisplay } from "../../model/apply-preview.js";
import { signalToneKey, signalValueText } from "../../model/signals.js";
import ExploreTray from "../ExploreTray.jsx";
import GoalsPanel from "../GoalsPanel.jsx";

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
          {/* Was a `role="button"` div (keyboard-reachable via kbActivate, but
              still not a real control). A native <button> gives it the button
              role, Enter/Space, and the global focus ring for free. */}
          <button
            type="button"
            onClick={() => navigate(sig.target.screen, sig.target.subView)}
            style={{
              flex: 1, display: "flex", alignItems: "center", gap: 12,
              minHeight: 44, padding: "10px 4px 10px 14px", cursor: "pointer", minWidth: 0,
              background: "transparent", border: "1px solid transparent",
              textAlign: "left", font: "inherit",
            }}>
            <span style={{
              font: `600 16px ${HM}`, flexShrink: 0,
              color: t[signalToneKey(sig)],
            }}>{signalValueText(sig, fmt)}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", font: `600 13px ${HF}`, color: t.ink }}>
                {sig.title}
              </span>
              <span style={{ display: "block", font: `400 12px ${HF}`, color: t.mut, marginTop: 1 }}>
                {sig.body} <span style={{ color: t.accent }}>→</span>
              </span>
            </span>
          </button>
          <Btn t={t} size="sm" variant="ghost" tone="faint"
            onClick={() => dismiss(sig.id)}
            ariaLabel={`dismiss ${sig.id} signal`}
            style={{ alignSelf: "stretch", padding: "10px 12px", borderRadius: 13 }}>✕</Btn>
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

// ── Paycheck card (the TODAY anchor) ──────────────────────────────────────────
// Was "You keep / mo", the first of five cards in a row of otherwise
// RETIREMENT-labelled stats — a today's-paycheck figure with nothing saying so.
// It now sits beside "Portfolio at retirement" as an explicit today→retirement
// pairing, and its sub-copy states the year it belongs to.
//
// The label is household-aware: takeHome is a HOUSEHOLD figure for MFJ filers
// (rule 9) while "You keep" was unconditionally primary-voiced. The scope test
// is a model-provided boolean (planHighlights.takeHomeIsHousehold), never a
// filingStatus/spouseIncome comparison here (rule 8) — same shape as BUG-96's
// showHouseholdTotal and Classic's own conditional paycheck label.
function PaycheckCard({ t, takeHome, keepPct, isHousehold }) {
  return (
    <div style={{
      background: t.surf, borderRadius: 14,
      border: `1px solid ${t.line}`,
      padding: "16px 18px",
      marginBottom: 10,
    }}>
      <div style={{ font: `500 11px ${HF}`, color: t.mut, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        {isHousehold ? "Household paycheck" : "Your paycheck"}
      </div>
      <div style={{ font: `700 30px/1.1 ${HM}`, color: t.ink }}>
        {fmtMo(takeHome)}<span style={{ font: `500 14px ${HM}`, color: t.mut }}>/mo</span>
      </div>
      <div style={{ font: `500 12px ${HF}`, color: t.good, marginTop: 4 }}>
        {keepPct != null ? `${keepPct}% of income · today` : "what you take home today"}
      </div>
    </div>
  );
}

// ── Dollar-basis toggle ───────────────────────────────────────────────────────
// The Plan screen used to contradict itself: the Income Meter showed
// retirement-year dollars while the card below it showed today's dollars for
// the same concept. Rather than silently picking one, the user picks — today's
// money by default. Scoped DELIBERATELY to genuinely dollar-denominated
// figures (this meter + the "Spending each month" card); ages, percentages,
// "Guaranteed for life" and "Money lasts to" are basis-invariant and are not
// wired to it. Options + captions come from the model (no age math in JSX).
function DollarBasisToggle({ t, options, activeId, onChange }) {
  return (
    <div role="group" aria-label="Show dollars in"
      style={{ display: "flex", gap: 3, background: t.line, borderRadius: 9, padding: 2 }}>
      {options.map(o => (
        <Btn key={o.id} t={t} size="sm" variant="seg" pressed={o.id === activeId}
          onClick={() => onChange(o.id)}
          style={{ padding: "6px 10px" }}>
          {o.label}
        </Btn>
      ))}
    </div>
  );
}

// ── Income Replacement Meter ───────────────────────────────────────────────────
// Shows retirement monthly income + how much of current income it replaces,
// with per-source breakdown bars (SS, portfolio). Bar widths use model-provided
// integer percentages (ssPct, portfolioPct) — no division in JSX (rule 10).
// `flow` is the basis the user selected (planHighlights.incomeFlowByBasis[id]) —
// the meter never converts, it renders whichever of the two the screen handed it.
function IncomeMeter({ t, planHighlights, flow, basisOption, basisApplicable, onBasisChange }) {
  const { incomeReplacementPct, spouseIncomeScopeNote, spouseSpilloverNote,
          dollarBasisOptions } = planHighlights ?? {};
  if (!flow) return null;

  const {
    ss, pension, spouseIncome, portfolioDraw,
    hasSS, hasPension, hasSpouseIncome,
    ssPct, pensionPct, spouseIncomePct, portfolioPct,
  } = flow;

  return (
    <div style={{
      background: t.surf, borderRadius: 14,
      border: `1px solid ${t.line}`,
      padding: "14px 18px",
      marginBottom: 10,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, flexWrap: "wrap", marginBottom: 4,
      }}>
        <span style={{ font: `500 11px ${HF}`, color: t.mut, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Retirement income
        </span>
        {basisApplicable && (
          <DollarBasisToggle t={t} options={dollarBasisOptions ?? []}
            activeId={basisOption?.id} onChange={onBasisChange} />
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ font: `700 22px/1 ${HM}`, color: t.ink }}>
          {fmtMo(flow.expenses)}/mo
        </span>
        {incomeReplacementPct !== null && incomeReplacementPct !== undefined && (
          <span style={{ font: `500 12px ${HF}`, color: t.mut }}>
            replaces {incomeReplacementPct}% of today's take-home pay
          </span>
        )}
      </div>
      {basisApplicable && basisOption && (
        <div style={{ font: `400 11px ${HF}`, color: t.faint, marginTop: 4 }}>
          {basisOption.caption}
        </div>
      )}

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
        {hasSpouseIncome && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: `400 11px ${HF}`, color: t.mut, width: 78, flexShrink: 0 }}>
              Spouse income
            </span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: t.line, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${spouseIncomePct}%`, borderRadius: 3, background: t.line2 }} />
            </div>
            <span style={{ font: `600 11px ${HM}`, color: t.line2, width: 60, textAlign: "right", flexShrink: 0 }}>
              {fmtMo(spouseIncome)}/mo
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
      {spouseIncomeScopeNote && (
        <p style={{ margin: "8px 0 0", font: `400 10px ${HF}`, color: t.mut, lineHeight: 1.4 }}>
          {spouseIncomeScopeNote}
        </p>
      )}
      {spouseSpilloverNote && (
        <p style={{ margin: "8px 0 0", font: `400 10px ${HF}`, color: t.warm, lineHeight: 1.4 }}>
          {spouseSpilloverNote}
        </p>
      )}
    </div>
  );
}

// ── Headline second line: the tagline, or an honest verdict ───────────────────
// "Work optional, {activity} mandatory." is earned when the plan actually
// works, and misleading when it doesn't — the previous version showed it to
// every user regardless of whether their money lasted. The two are strictly
// EITHER/OR (they occupy the same line and would contradict each other side by
// side): a plan that covers its whole horizon keeps the tagline, one that
// doesn't gets the number and its biggest lever instead.
//
// Every value here is a named model field — `planView.outlastsPlan` /
// `.depletionAge` / `.yearsShortOfPlan` (calcPlanProgress) and
// `workLongerView.minYearsToSustain` (calcWorkLongerBreakEven). The screen
// compares no ages and derives no counts (rule 10), and each missing value has
// a designed sentence rather than a fabricated number:
//   depletionAge null    → no age is claimed at all.
//   yearsShortOfPlan null→ the "N years before" clause is dropped, not zeroed.
//   minYearsToSustain null→ "retiring later alone won't close the gap" (the
//                          model tested its offsets and none of them worked) —
//                          never a made-up number of years.
//   workLongerView null  → already retired / no bundle: no work-longer clause.
function PlanVerdict({ t, planView, workLongerView, activity, lifeExpect, onOpenLevers }) {
  const { outlastsPlan, depletionAge, yearsShortOfPlan } = planView ?? {};

  if (outlastsPlan) {
    return (
      <div style={{ font: `500 14px ${HF}`, color: t.mut, marginTop: 7 }}>
        Work optional,{" "}
        <span style={{ color: t.accent, fontWeight: 700 }}>{activity}</span>{" "}
        mandatory.
      </div>
    );
  }

  const minYears = workLongerView?.minYearsToSustain ?? null;
  const leverText = workLongerView == null
    ? null
    : minYears != null
      ? `Working ${minYears} more year${minYears === 1 ? "" : "s"} would make them last.`
      : "Retiring later alone won't close the gap — trimming monthly spending is the other lever.";

  return (
    <div style={{ marginTop: 7 }}>
      <span style={{ font: `500 14px ${HF}`, color: t.mut }}>
        {depletionAge != null ? (
          <>
            Your savings run out at{" "}
            <span style={{ color: t.warm, fontWeight: 700 }}>age {depletionAge}</span>
            {yearsShortOfPlan != null
              ? ` — ${yearsShortOfPlan} year${yearsShortOfPlan === 1 ? "" : "s"} before your plan ends at ${lifeExpect}.`
              : "."}
          </>
        ) : (
          <>Your plan doesn&rsquo;t cover every year yet.</>
        )}
        {leverText ? ` ${leverText}` : ""}
      </span>
      <Btn t={t} size="sm" variant="ghost" tone="accent" onClick={onOpenLevers}
        style={{ padding: "8px 10px", marginLeft: 2 }}>
        Try a change →
      </Btn>
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
  t, isMobile,
  retirementAge, monthlySpend, sliderBounds, whatIfSimInputs, applyPlanLevers,
  // Controlled from PlanScreen (not local state here) so the arc — rendered
  // ABOVE this panel — reads the exact same offsets/preview and can never
  // show a different scenario than this panel's own delta chip (V1/principle 7).
  retireOffset, spendOffset, setRetireOffset, setSpendOffset, preview,
  // BUG-73: the labeled comfortable/tight/unaffordable ranges (model-provided,
  // horizonProps.verdictLegend) — shown ONCE per panel, under the first rail,
  // rather than repeated under both sliders.
  verdictLegend,
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
    action: `Retire at ${draggedAge} · ${fmtMonthly(draggedMonthly)}/mo spend`,
    confirmLabel: "Apply changes",
    metrics: preview.metrics,
    note: "Preview uses the same model as your headline numbers.",
    verdict: verdictDisplay(preview.verdict), // #85: real verdict from the lever preview (years-gap based; comfortable/tight/unaffordable → label+tone). Shown ONLY in the Apply modal — the OnTrackPill remains Plan's glance verdict (SP-3).
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

  const applyJump = (jump) =>
    setRetireOffset(resolveRetireJump(jump, retirementAge, sliderBounds) - retirementAge);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Quick-jump chips — pure nudges of the retire-at offset below. */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {RETIRE_JUMPS.map(jump => (
          <Pill key={jump.k} t={t} onClick={() => applyJump(jump)}>
            {jump.label}
          </Pill>
        ))}
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
        <VerdictTickRail t={t} rail={retireRail} legend={verdictLegend} />
      </div>

      {/* Monthly-spend slider */}
      <div>
        <div style={rowLabel}>
          <span style={{ font: `500 13px ${HF}`, color: t.ink }}>Monthly spend</span>
          <span style={{ font: `600 13px ${HM}`, color: t.accent }}>{fmtMonthly(draggedMonthly)}/mo</span>
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
            <Btn t={t} size="sm" variant="primary" onClick={() => setShowApply(true)}
              style={{ flex: 1, borderRadius: 10 }}>
              Apply changes
            </Btn>
            <Btn t={t} size="sm" variant="quiet" onClick={discard}
              style={{ borderRadius: 10 }}>
              Discard
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ font: `500 12.5px ${HF}`, color: t.faint }}>
          Drag a slider to preview it on your arc — nothing changes until you Apply.
        </div>
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
          <Btn t={t} size="sm" variant="primary" onClick={() => setShowApply(true)}
            style={{ flex: 1 }}>
            Apply changes
          </Btn>
          <Btn t={t} size="sm" variant="quiet" onClick={discard}>
            Discard
          </Btn>
        </div>
      )}
    </div>
  );
}

export default function PlanScreen({ t, props, glow, strokeWidth = 3, isMobile = false, navigate }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, isSustainable,
    takeHome,
    contribSeries, activity,
    planView, signals, moneyEvents, retirementWalk,
    planHighlights, statementView,
    // The card's total must be the SAME total its own destination (Numbers →
    // Taxes) shows: taxView.composition.total, which includes the 401k-draw tax
    // the old planHighlights.lifetimeTaxBurden left out. That duplicate field is
    // gone rather than kept in sync — one definition, one number.
    taxView,
    // #55: minYearsToSustain for the honest verdict sentence (null when already
    // retired — the sentence drops its work-longer clause, see PlanVerdict).
    workLongerView,
    // WI-5.3 (#114): Monte Carlo Range lens — passed straight through to the arc's Range view.
    rangeView,
    // Try-a-change panel + life-event edit-in-place.
    whatIfSimInputs, monthlySpend, sliderBounds, applyPlanLevers,
    saveEvent, removeEvent, lifeEventBounds,
    // BUG-73: labeled comfortable/tight/unaffordable ranges for the rail legend.
    verdictLegend,
  } = props;

  const [arcView, setArcView] = useState("arc");

  // ── Dollar basis (owner decision): today's money by default, with a visible
  // toggle rather than the app silently picking one. Local, unpersisted state —
  // a viewing lens, not a plan input. `dollarBasisApplicable` is false once
  // there is nothing to inflate over (already retired): the two bases are then
  // the same number, so the screen pins to "today" and shows no control.
  const [dollarBasis, setDollarBasis] = useState("today");
  const basisApplicable = planHighlights?.dollarBasisApplicable === true;
  const activeBasisId   = basisApplicable ? dollarBasis : "today";
  const basisOption     = (planHighlights?.dollarBasisOptions ?? [])
    .find(o => o.id === activeBasisId) ?? null;
  const incomeFlow      = planHighlights?.incomeFlowByBasis?.[activeBasisId] ?? null;

  // "Guaranteed for life" sub-copy — copy selection from model booleans only, no
  // dollar comparisons or age comparisons here (rule 10). The spouse branch
  // exists because calcRetIncomeFlow deliberately keeps a spouse's gap-year pay
  // OUT of the guaranteed numerator while leaving it in the denominator:
  // without naming it, "the rest comes from your savings" would be false for
  // that household.
  //
  // BUG-131 Item 2: source naming reads `everHasSS`/`everHasPension` — UNGATED
  // eligibility, matching what `pct` itself is built from (BUG-122) — never the
  // gated `hasSS`/`hasPension`. Those gated flags described a DIFFERENT
  // question (has this started by retirement) and naming sources off them could
  // omit a source pct is mostly built from because it simply hasn't started yet
  // — the repro that shipped this fix: a pension worth ~76 of a 100% card,
  // never once mentioned. `activeNow` keeps that gated question alive for a
  // different purpose below: whether ANYTHING is already paying, which decides
  // whether the honest "is there a gap to bridge" framing applies. Every
  // pending source (not just the earliest) gets its own start age from
  // `pendingSources`, and `fullyCovered` suppresses "the rest comes from your
  // savings" once the model's own number says there is no rest.
  //
  // BUG-122 Item 2: "savings cover you until then" used to render unconditionally
  // whenever startsAtAge was set, with no check that savings actually last that
  // long — it could (and did, at a plausible input combo) sit directly next to
  // the "Money lasts to" card contradicting it outright. Each pendingSources
  // entry carries its own pre-computed savingsCoverUntilStart (App.jsx, from
  // calcPlanProgress's own outlastsPlan/depletionAge — the SAME numbers "Money
  // lasts to" itself renders), so this screen still does no age arithmetic of
  // its own (rule 10). That framing fires whenever NOTHING is active yet
  // (activeNow false) and something is pending — the household's income is
  // 100% savings today, so whether savings bridge the gap is the load-bearing
  // question — checked against the LATEST pending age (monotonic: once
  // savings last that far, every earlier pending source is covered too).
  const guaranteedSub = (() => {
    const g = planHighlights?.guaranteed;
    if (!g) return undefined;
    const rest = g.hasSpouseIncome
      ? "the rest comes from your savings and your spouse's pay"
      : "the rest comes from your savings";
    const source = g.everHasSS && g.everHasPension ? "Social Security + pension"
      : g.everHasSS ? "Social Security"
      : g.everHasPension ? "Your pension"
      : null;
    if (!source) return `Nothing guaranteed — ${rest}`;

    const pending = g.pendingSources ?? [];
    const activeNow = g.hasSS || g.hasPension;
    const namedList = pending.map(p => `${p.label} at ${p.age}`).join(", ");
    const lastPending = pending[pending.length - 1] ?? null;

    if (g.fullyCovered) {
      if (pending.length === 0) return source;
      return pending.length === 1
        ? `${source} — full coverage starts at ${lastPending.age}`
        : `${source} — full coverage once ${namedList}`;
    }
    // pct < 100%, so "the rest comes from savings" is genuinely true.
    if (!activeNow && pending.length > 0) {
      const label = pending.length === 1
        ? `${lastPending.label} starts at ${lastPending.age}`
        : namedList;
      return lastPending.savingsCoverUntilStart
        ? `${label} — savings cover you until then`
        : `${label} — but your savings may not stretch that far, see "Money lasts to" below`;
    }
    if (pending.length === 0) return `${source} — ${rest}`;
    return pending.length === 1
      ? `${source} — ${rest} · more from ${lastPending.age}`
      : `${source} — ${rest} · ${namedList}`;
  })();

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

  // Life-event sheet. Opened as EDIT ({ seed, eventId }) from an arc badge or a
  // goal row, or as NEW ({ seed }) from a Goals-panel preset / custom button.
  const [eventSheet, setEventSheet] = useState(null);
  const openEventSheet = (ev) => setEventSheet({ seed: ev, eventId: ev.id }); // arc badge → edit
  const openEditGoal   = (ev) => setEventSheet({ seed: ev, eventId: ev.id });
  const openNewGoal    = (seed) => setEventSheet({ seed });
  const handleEventSave = (ev) => {
    saveEvent(ev);
    setEventSheet(null);
  };
  const handleEventRemove = () => {
    removeEvent(eventSheet.eventId);
    setEventSheet(null);
  };

  // ── Explore-tray state, lifted out of ExploreTray ────────────────────────────
  // The "Retire at" card used to navigate to the static My-Details facts screen;
  // the retirement-age slider it describes actually lives in this page's own
  // "Try a change" facet, one scroll up. Same for "Spending each month" and the
  // monthly-spend slider. A card can only open that facet if the tray's open
  // state lives here — hence the controlled refactor. The value keeps
  // ExploreTray's original TRI-state exactly (null = auto-follow a staged
  // change, "closed" = an explicit user collapse that beats the auto-open, or a
  // facet key); collapsing it to a boolean is what the tray's own comment
  // records as a real prior bug.
  const [trayOpen, setTrayOpen] = useState(null);
  const trayRef = useRef(null);
  // Two-step so the scroll happens AFTER the facet body has actually rendered
  // (the tray is short when collapsed — scrolling first lands in the wrong
  // place). scrollIntoView is feature-detected: the test renderer has no DOM.
  const [pendingTrayScroll, setPendingTrayScroll] = useState(false);
  useEffect(() => {
    if (!pendingTrayScroll) return;
    setPendingTrayScroll(false);
    const el = trayRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pendingTrayScroll]);
  const openLevers = () => { setTrayOpen("change"); setPendingTrayScroll(true); };

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
      rangeBands={rangeView}
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
          <PlanVerdict
            t={t} planView={planView} workLongerView={workLongerView}
            activity={activity} lifeExpect={lifeExpect} onOpenLevers={openLevers} />
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

      {/* ── Explore tray: one arc-anchored control surface (Try a change · Goals) ── */}
      <div ref={trayRef} style={{ flexShrink: 0, scrollMarginTop: 12 }}>
        <ExploreTray
          t={t} isMobile={isMobile}
          goalsCount={(moneyEvents ?? []).length}
          changeStaged={!!arcPreview?.changed}
          open={trayOpen} onOpenChange={setTrayOpen}
          changeFacet={
            <TryAChangePanel
              t={t} isMobile={isMobile}
              retirementAge={retirementAge} monthlySpend={monthlySpend}
              sliderBounds={sliderBounds} whatIfSimInputs={whatIfSimInputs}
              applyPlanLevers={applyPlanLevers}
              retireOffset={retireOffset} spendOffset={spendOffset}
              setRetireOffset={setRetireOffset} setSpendOffset={setSpendOffset}
              preview={arcPreview}
              verdictLegend={verdictLegend}
            />
          }
          goalsFacet={
            <GoalsPanel
              t={t} moneyEvents={moneyEvents}
              onNewGoal={openNewGoal} onEditGoal={openEditGoal} onRemoveGoal={removeEvent}
              bounds={lifeEventBounds}
            />
          }
        />
      </div>

      {/* ── today anchor: this month's paycheck → the portfolio it builds ────── */}
      {/* The paycheck used to sit as card 1 of a five-card RETIREMENT row with
          nothing marking it as a today figure. Pairing it with "Portfolio at
          retirement" makes the today→retirement step the point of the pair,
          and leaves the row below unambiguously about retirement. */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        // Item 11 (BUG-122 batch): was 14px here vs the stat-card grid's flat
        // 10px below — two adjacent card rows in the same visual system with
        // different gaps. Normalized to the same 10px both grids already
        // agree on at mobile width.
        gap: 10, marginTop: 14, flexShrink: 0,
      }}>
        <PaycheckCard t={t} takeHome={takeHome} keepPct={statementView?.keepPct}
          isHousehold={planHighlights?.takeHomeIsHousehold === true} />
        <PortfolioHero t={t} totalAtRet={totalAtRet} planHighlights={planHighlights} />
      </div>

      {/* ── retirement income meter (carries the dollar-basis toggle) ────────── */}
      <div style={{ flexShrink: 0 }}>
        <IncomeMeter
          t={t} planHighlights={planHighlights}
          flow={incomeFlow} basisOption={basisOption}
          basisApplicable={basisApplicable} onBasisChange={setDollarBasis} />
      </div>

      {/* ── stat cards ───────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
        gap: 10, marginTop: 4, flexShrink: 0,
      }}>
        <StatCard t={t} label="Retire at"
          value={String(retirementAge)}
          sub={planHighlights?.yearsToRetirement != null ? `in ${planHighlights.yearsToRetirement} yrs` : undefined}
          accent={t.ink}
          onClick={openLevers} />
        {/* Was "Income for life" showing the total SPENDING target — a label
            promising a guarantee over a number that is nothing of the kind
            (its own destination lists a "Runs dry at" row). It is the monthly
            spend, said plainly, in whichever dollar basis is selected. */}
        <StatCard t={t} label="Spending each month"
          value={incomeFlow ? fmtMo(incomeFlow.expenses) : "—"}
          sub={basisOption?.cardSub}
          accent={t.warm} warm
          onClick={openLevers} />
        {/* The guarantee question the old card only pretended to answer.
            A percentage, so it is basis-invariant and the toggle leaves it
            alone. Social Security + pension ONLY — a spouse's gap-year pay is
            excluded from the numerator by calcRetIncomeFlow, and named here
            instead so "the rest" is honest about where it comes from. */}
        <StatCard t={t} label="Guaranteed for life"
          value={planHighlights?.guaranteed?.pct != null ? `${planHighlights.guaranteed.pct}%` : "—"}
          sub={guaranteedSub}
          accent={t.good}
          onClick={() => navigate("numbers", "statement")} />
        <StatCard t={t} label="Money lasts to"
          value={planView?.outlastsPlan
            ? `past ${lifeExpect}`
            : planView?.depletionAge != null ? `age ${planView.depletionAge}` : "—"}
          sub={planView?.outlastsPlan
            ? "your savings outlast your plan"
            : planView?.yearsShortOfPlan != null
              ? `${planView.yearsShortOfPlan} year${planView.yearsShortOfPlan === 1 ? "" : "s"} short of your plan`
              : "see the year-by-year detail"}
          accent={planView?.outlastsPlan ? t.ink : t.warm}
          onClick={() => navigate("numbers", "yearly")} />
        {/* Item 8 (BUG-122 batch): "total, across all" overclaimed completeness
            — the engine only charges INCREMENTAL tax above the SS/pension floor
            (BUG-38, open/accepted), so this sum is systematically low by
            construction, not actually complete. Softened, and given its own
            basis note (a retirement-year-dollar cumulative sum) — see BUG-124
            for why it's not wired to the toggle. */}
        {/* Item 11 (BUG-122 batch): 5 cards in a 2-column mobile grid leaves
            this last one alone on its own row, half-width — an orphan. Full
            width on mobile only; desktop's 5-column row is unaffected. */}
        <StatCard t={t} label="Tax in retirement"
          value={taxView?.composition?.total != null ? fmt(taxView.composition.total) : "—"}
          sub="across your retirement years, in retirement-year dollars"
          accent={t.mut}
          onClick={() => navigate("numbers", "taxes")}
          style={isMobile ? { gridColumn: "1 / -1" } : undefined} />
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
