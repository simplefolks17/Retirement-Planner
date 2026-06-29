// SSTimingFlow — WI-3.4 (#101): the Social Security timing strategy, interactive.
// Mounts in the StrategiesScreen detail slot (the scaffold's reserved `Flow`).
// LAYOUT/FORMATTING ONLY (rule 10): every number comes from props.ssView (the
// sibling flow bundle) or directly from horizonProps scalars already wired
// (householdSS / withdrawalRate / effectivePension / effectiveExpenses); every
// control writes through the WI-3.1 `ss` / `pension` setter bundles. Nothing here
// computes a financial value — even the coverage %s and the override-aware
// monthly/annual figures are model-provided.

import React from "react";
import { HF } from "../../ThemeContext.jsx";
import { DetailField, money } from "../../fields.jsx";
import { SectionLabel, NoteBox, StatTile, STAT_ROW } from "./flow-ui.jsx";
import { SS_FRA, SS_MAX_CLAIM_AGE } from "../../../config/irs-2026.js";

const claimAgeFmt = v =>
  v == null ? "—" : v === SS_FRA ? `age ${v} (FRA)` : v < SS_FRA ? `age ${v} (early)` : `age ${v} (delayed)`;

export default function SSTimingFlow({ t, props, isMobile = false }) {
  const sv = props.ssView;
  const ss = props.ss;            // WI-3.1 setter bundle
  const pension = props.pension;  // WI-3.1 setter bundle
  const isMarried = props.isMarried;
  const includeSS = props.includeSS;

  const F = (p) => <DetailField t={t} isMobile={isMobile} {...p} />;
  const row3 = STAT_ROW;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NoteBox t={t}>
        When you claim Social Security sets your monthly benefit for life. Claiming before your
        full retirement age (FRA, {SS_FRA}) permanently reduces it; delaying past FRA grows it
        with delayed credits up to {SS_MAX_CLAIM_AGE}.
      </NoteBox>

      {/* ── Your Social Security ── */}
      <div>
        <SectionLabel t={t}>Your Social Security</SectionLabel>
        {F({ label: "Include Social Security", field: ss.includeSS })}
        {includeSS && F({ label: "Claiming age", field: ss.ssClaimingAge, format: claimAgeFmt })}
        {includeSS && F({ label: "Override estimate", hint: "your own SSA.gov annual figure",
          field: { value: ss.ssOverride.value, set: ss.ssOverride.set,
                   min: ss.ssOverride.min, max: ss.ssOverride.max, step: ss.ssOverride.step },
          format: money, seed: sv.ssEstimateAnnual,
          nullLabel: `Estimate · ${money(sv.ssEstimateAnnual)}` })}
      </div>

      <div style={row3}>
        <StatTile t={t} label="Monthly benefit" value={`${money(sv.ssMonthly)}/mo`}
          sub={`at ${claimAgeFmt(sv.claimAge)}`} tone="good" dim={!includeSS} />
        <StatTile t={t} label="Annual benefit" value={money(sv.ssAnnual)}
          sub={!includeSS ? "excluded from calcs"
            : sv.ssCoveragePct != null ? `${sv.ssCoveragePct}% of expenses` : "—"}
          tone="good" dim={!includeSS} />
        <StatTile t={t} label={`Break-even vs ${SS_FRA}`}
          value={sv.breakEven != null ? `age ${sv.breakEven}` : "—"}
          sub={sv.claimAge < SS_FRA ? "when FRA catches up" : sv.claimAge > SS_FRA ? "when delay pays off" : "claiming at FRA"} />
      </div>

      <div style={{ font: `400 11px ${HF}`, color: t.faint }}>
        Estimated AIME {money(sv.ssAIME)}/mo · up to 85% of the benefit may be taxable depending on combined income.
      </div>

      {/* ── Delay-to-70 impact (only when delaying still helps) ── */}
      {sv.delayApplicable && (
        <NoteBox t={t} tone="good">
          <div style={{ font: `600 12px ${HF}`, color: t.ink, marginBottom: 6 }}>
            Delay to {SS_MAX_CLAIM_AGE} <span style={{ color: t.mut, fontWeight: 400 }}>vs claiming at {sv.claimAge}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span>Additional SS income</span>
            <span style={{ font: `600 12px ${HM}`, color: t.good }}>+{money(sv.ss70DrawReduction)}/yr</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span>Portfolio draw drops</span>
            <span style={{ font: `600 12px ${HM}`, color: t.good }}>{props.withdrawalRate.toFixed(1)}% → {sv.wr70.toFixed(1)}%</span>
          </div>
          {sv.delayGainYrs != null && sv.delayGainYrs > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Portfolio longevity</span>
              <span style={{ font: `600 12px ${HM}`, color: t.good }}>~{sv.delayGainYrs} yr{sv.delayGainYrs !== 1 ? "s" : ""} longer</span>
            </div>
          )}
          <div style={{ font: `400 10.5px/1.5 ${HF}`, color: t.faint, marginTop: 6, fontStyle: "italic" }}>
            Longevity estimate assumes the {SS_MAX_CLAIM_AGE - sv.claimAge}-year gap before claiming is covered by other income, not this portfolio.
          </div>
        </NoteBox>
      )}

      {/* ── Spouse Social Security (married only) ── */}
      {isMarried && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionLabel t={t}>Spouse Social Security</SectionLabel>
          <NoteBox t={t}>
            SSA pays whichever is larger: the spouse's own earned benefit or 50% of the primary's PIA.
            Spousal benefits earn no delayed credits; own-record benefits do (up to {SS_MAX_CLAIM_AGE}).
          </NoteBox>
          {F({ label: "Benefit basis", field: ss.spouseBenefitBasis })}
          {F({ label: `Spouse's own benefit at ${SS_FRA} (annual)`, field: ss.spouseSsEstimate,
            format: v => (v === 0 ? "None" : money(v)) })}
          {F({ label: "Spouse claiming age", field: ss.spouseClaimingAge, format: claimAgeFmt })}
          {sv.spouseAltHigher && (
            <NoteBox t={t} tone="warm">
              Their {ss.spouseBenefitBasis.value === "spousal" ? "own-record" : "spousal"} benefit would be
              higher (~{money(sv.spouseAlt)}/yr) — consider switching basis.
            </NoteBox>
          )}
          <div style={row3}>
            <StatTile t={t} label="Spouse benefit" value={`${money(sv.spouseSsBenefit)}/yr`}
              sub={ss.spouseBenefitBasis.value === "own" ? "own record" : "spousal (50%)"} tone="good" dim={!includeSS} />
            <StatTile t={t} label="Household SS" value={`${money(props.householdSS)}/yr`}
              sub={`${money(props.householdSS / 12)}/mo`} tone="good" dim={!includeSS} />
            <StatTile t={t} label="SS coverage"
              value={sv.householdCoveragePct != null ? `${sv.householdCoveragePct}%` : "—"}
              sub="of annual expenses" />
          </div>
        </div>
      )}

      {/* ── Pension income ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionLabel t={t}>Pension income</SectionLabel>
        <NoteBox t={t}>
          A monthly pension reduces how much you draw from your portfolio — like Social Security —
          and flows into drawdown, Roth-conversion bracket fill, and withdrawal strategy.
        </NoteBox>
        {F({ label: "Monthly pension", field: pension.pensionMonthly,
          format: v => (v === 0 ? "None" : `${money(v)}/mo`) })}
        {pension.pensionMonthly.value > 0 &&
          F({ label: "Pension start age", field: pension.pensionStartAge, format: v => `age ${v}` })}
        {props.effectivePension > 0 && (
          <div style={{ font: `400 11px ${HF}`, color: t.faint }}>
            Counts as {money(props.effectivePension)}/yr of retirement income.
          </div>
        )}
      </div>
    </div>
  );
}
