// JourneyScreen — WI-2.1 (#91): Flow-Down port for Horizon.
//
// Three editorial chapters telling the lifecycle story of the user's plan:
//   Chapter 1 — Today          (income snapshot from statementView)
//   Chapter 2 — Building years (accumulation + optional Roth window, from flowDown)
//   Chapter 3 — Retirement     (distribution phase, from flowDown + retirementWalk)
//
// DATA RULE (Critical Rule 10): this file contains ZERO arithmetic on model
// values. All numbers come from props.flowDown (calcFlowDown), props.statementView
// (calcStatementView), and props.retirementWalk (buildRetirementDrawdown).
// fmt/fmtMo from shared.jsx are the only operations applied here — they format,
// not compute.  Every field citation is noted in a comment so future readers can
// trace it back to its model source.

import React, { useState } from "react";
import { RMD_START_AGE } from "../../config/irs-2026.js";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";

const SERIF = "Georgia, 'Times New Roman', serif";

// ── Small reusable pieces ─────────────────────────────────────────────────────

function ChapterCard({ t, children, style }) {
  return (
    <div style={{
      background: t.surf, border: `1px solid ${t.line}`,
      borderRadius: 16, padding: "18px 20px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Headline({ t, label, value, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ font: `500 11px ${HF}`, color: t.accent, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ font: `700 32px/1 ${SERIF}`, color: t.ink }}>{value}</div>
      {sub && <div style={{ font: `400 13px ${SERIF}`, color: t.mut, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DetailRow({ t, label, value, muted, source }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "6px 0", borderBottom: `1px solid ${t.line}`,
    }}>
      <span style={{ font: `400 13px ${SERIF}`, color: muted ? t.faint : t.mut }}>
        {label}{source && <span style={{ font: `400 10px ${HF}`, color: t.faint, marginLeft: 4 }}>({source})</span>}
      </span>
      <span style={{ font: `500 13px ${HM}`, color: muted ? t.faint : t.ink, whiteSpace: "nowrap", marginLeft: 12 }}>
        {value}
      </span>
    </div>
  );
}

function ProportionBar({ t, segs }) {
  // segs: [{ pct, color, label }] — pct comes from the model (null = render empty state)
  if (segs.some(s => s.pct == null)) {
    return (
      <div style={{ font: `400 12px ${SERIF}`, color: t.faint, fontStyle: "italic", marginTop: 8 }}>
        Add your income to see this breakdown.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", height: 18, borderRadius: 6, overflow: "hidden", border: `1px solid ${t.line2}` }}>
        {segs.map((s, i) => (
          <div key={i} style={{
            flex: s.pct, background: s.color, opacity: 0.72,
            borderRight: i < segs.length - 1 ? `1px solid ${t.surf}` : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            font: `600 9px ${HF}`, color: "#fff", minWidth: 0, overflow: "hidden",
          }}>
            {s.pct >= 12 ? `${s.pct}%` : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
        {segs.map((s, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, font: `400 11px ${HF}`, color: t.faint }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, opacity: 0.72 }} />
            {s.label} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function Connector({ t, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
      <div style={{ flex: 1, height: 1, background: t.line2 }} />
      <span style={{ font: `400 12px ${SERIF}`, color: t.faint, fontStyle: "italic", flexShrink: 0 }}>
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: t.line2 }} />
    </div>
  );
}

function ToggleDetail({ t, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          font: `500 12px ${HF}`, color: t.accent, padding: "6px 0", display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {open ? "Hide detail ↑" : "Show detail ↓"}
      </button>
      {open && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function JourneyScreen({ t, props, isMobile = false, navigate }) {
  const {
    retirementAge,
    flowDown,
    conversionWindowYrs,
    rmdStartAge,
    statementView,
    retirementWalk,
    householdSS,
    effectivePension,
    isSustainable,
  } = props;

  // Guard — flowDown may be null on first render before App memos settle
  if (!flowDown) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <span style={{ font: `400 14px ${HF}`, color: t.faint }}>Loading your journey…</span>
      </div>
    );
  }

  // ── Chapter 1 — Today ──────────────────────────────────────────────────────
  // statementView fields (calcStatementView):
  //   flowKeep — annual take-home after tax and savings (residual)
  //   keepPct / taxPct / savePct — proportions (null when no income)
  const ch1Headline = statementView?.flowKeep != null ? fmt(statementView.flowKeep) : "—";
  const ch1Bar = [
    { pct: statementView?.keepPct, color: t.good,   label: "Keep" },
    { pct: statementView?.taxPct,  color: "#b09070", label: "Tax"  },
    { pct: statementView?.savePct, color: t.warm,   label: "Save" },
  ];

  // ── Chapter 2 — Building years ─────────────────────────────────────────────
  // flowDown fields: startPortfolio, totalContrib, totalGrowth, peakPortfolio,
  //   totalAtRet, hasConvWindow, portPreRMD, convWindowDraws, convWindowTax,
  //   convWindowGrowth, totalConverted
  const hasConvWindow = conversionWindowYrs > 0; // flowDown.hasConvWindow — same scalar

  // ── Chapter 3 — Retirement years ──────────────────────────────────────────
  // flowDown fields: distStartVal, distDraws, distRMDTax, distGrowth,
  //   distEndVal, actualSustainedYrs, depletionAge
  // retirementWalk.depletionAge — model-provided, no screen math
  const depletionLabel = isSustainable
    ? "funded for life"
    : retirementWalk?.depletionAge != null
      ? `portfolio runs to age ${retirementWalk.depletionAge}`
      : "—";

  // actualSustainedYrs null/0 means the plan sustains beyond the projection horizon
  const sustainedLabel = flowDown.actualSustainedYrs > 0
    ? `${flowDown.actualSustainedYrs} years`  /* flowDown.actualSustainedYrs */
    : "beyond plan horizon";

  return (
    <div style={{
      flex: 1, padding: isMobile ? "12px 14px 80px" : "16px 28px 24px",
      display: "flex", flexDirection: "column", gap: 8,
      overflow: "auto",
    }}>
      {/* page title */}
      <div style={{ font: `600 20px ${HF}`, color: t.ink, letterSpacing: "-0.02em", marginBottom: 4, flexShrink: 0 }}>
        Your financial journey.
      </div>
      <div style={{ font: `400 13px ${SERIF}`, color: t.mut, marginBottom: 10, flexShrink: 0 }}>
        Where you are, how you build, and where you end up — in today's dollars.
      </div>

      {/* ── Chapter 1: Today ── */}
      <ChapterCard t={t}>
        <Headline t={t}
          label="Chapter 1 — Today"
          value={ch1Headline}
          sub="annual take-home after tax and saving"
        />
        <ProportionBar t={t} segs={ch1Bar} />
        <ToggleDetail t={t}>
          {/* statementView.taxTotal */}
          <DetailRow t={t} label="Total tax (fed + FICA + state)" value={fmt(statementView?.taxTotal)} source="statementView.taxTotal" />
          {/* statementView.flowKeep */}
          <DetailRow t={t} label="Take-home (residual)" value={fmt(statementView?.flowKeep)} source="statementView.flowKeep" />
        </ToggleDetail>
      </ChapterCard>

      <Connector t={t} text={`building toward retirement at ${retirementAge}`} />

      {/* ── Chapter 2: Building years ── */}
      <ChapterCard t={t}>
        {/* flowDown.totalAtRet */}
        <Headline t={t}
          label="Chapter 2 — Building years"
          value={fmt(flowDown.totalAtRet)}
          sub="nest egg at retirement"
        />
        <ToggleDetail t={t}>
          {/* flowDown.startPortfolio */}
          <DetailRow t={t} label="Starting today" value={fmt(flowDown.startPortfolio)} source="flowDown.startPortfolio" />
          {/* flowDown.totalContrib */}
          <DetailRow t={t} label="Your contributions" value={fmt(flowDown.totalContrib)} source="flowDown.totalContrib" />
          {/* flowDown.totalGrowth */}
          <DetailRow t={t} label="Market growth" value={fmt(flowDown.totalGrowth)} source="flowDown.totalGrowth" />
          {/* flowDown.peakPortfolio */}
          <DetailRow t={t} label="Peak portfolio" value={fmt(flowDown.peakPortfolio)} source="flowDown.peakPortfolio" />
        </ToggleDetail>

        {hasConvWindow && (
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 11, background: `${t.accent}0c`, border: `1px solid ${t.accent}22` }}>
            <div style={{ font: `600 11px ${HF}`, color: t.accent, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
              Roth conversion window · {conversionWindowYrs} years
            </div>
            {/* flowDown.portPreRMD */}
            <DetailRow t={t} label="Portfolio entering RMDs" value={fmt(flowDown.portPreRMD)} source="flowDown.portPreRMD" />
            {/* flowDown.convWindowDraws */}
            <DetailRow t={t} label="Conversion draws" value={fmt(flowDown.convWindowDraws)} source="flowDown.convWindowDraws" />
            {/* flowDown.convWindowTax */}
            <DetailRow t={t} label="Conversion tax paid" value={fmt(flowDown.convWindowTax)} source="flowDown.convWindowTax" />
            {/* flowDown.convWindowGrowth */}
            <DetailRow t={t} label="Growth during window" value={fmt(flowDown.convWindowGrowth)} source="flowDown.convWindowGrowth" />
            {/* flowDown.totalConverted */}
            <DetailRow t={t} label="Total converted to Roth" value={fmt(flowDown.totalConverted)} source="flowDown.totalConverted" />
          </div>
        )}
      </ChapterCard>

      <Connector t={t} text={`${fmt(flowDown.totalAtRet)} at retirement → entering RMDs with ${fmt(flowDown.portPreRMD)}`} />

      {/* ── Chapter 3: Retirement years ── */}
      <ChapterCard t={t}>
        <Headline t={t}
          label="Chapter 3 — Retirement years"
          value={depletionLabel}
          sub="how long the portfolio sustains you"
        />

        {/* Income floor strip */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {/* props.householdSS — annual, displayed monthly */}
          {householdSS > 0 && (
            <div style={{ padding: "6px 12px", borderRadius: 999, background: `${t.warm}14`, border: `1px solid ${t.warm}44`, font: `500 12px ${HF}`, color: t.ink }}>
              SS {fmtMo(householdSS)}/mo
            </div>
          )}
          {/* props.effectivePension — annual, displayed monthly */}
          {effectivePension > 0 && (
            <div style={{ padding: "6px 12px", borderRadius: 999, background: `${t.good}14`, border: `1px solid ${t.good}44`, font: `500 12px ${HF}`, color: t.ink }}>
              Pension {fmtMo(effectivePension)}/mo
            </div>
          )}
        </div>

        <ToggleDetail t={t}>
          {/* flowDown.distStartVal */}
          <DetailRow t={t} label="Starting retirement portfolio" value={fmt(flowDown.distStartVal)} source="flowDown.distStartVal" />
          {/* flowDown.distDraws */}
          <DetailRow t={t} label="Total portfolio draws" value={fmt(flowDown.distDraws)} source="flowDown.distDraws" />
          {/* flowDown.distRMDTax */}
          <DetailRow t={t} label={`RMD tax (ages ${RMD_START_AGE}+)`} value={fmt(flowDown.distRMDTax)} source="flowDown.distRMDTax" />
          {/* flowDown.distGrowth */}
          <DetailRow t={t} label="Market growth" value={fmt(flowDown.distGrowth)} source="flowDown.distGrowth" />
          {/* flowDown.distEndVal */}
          <DetailRow t={t} label="Ending value" value={fmt(flowDown.distEndVal)} source="flowDown.distEndVal" />
          {/* flowDown.actualSustainedYrs */}
          <DetailRow t={t} label="Years sustained" value={sustainedLabel} source="flowDown.actualSustainedYrs" />
        </ToggleDetail>

        {/* Stub action note — deep-links to Strategies when that screen ships (WI-3.3) */}
        <div style={{ marginTop: 14, font: `400 12px ${SERIF}`, color: t.faint, fontStyle: "italic" }}>
          <span
            style={{ color: t.accent, cursor: "default", borderBottom: `1px dotted ${t.accent}55` }}
            title="Strategies screen coming in Level 3"
          >
            See Strategies for Roth conversion + SS timing →
          </span>
        </div>
      </ChapterCard>
    </div>
  );
}
