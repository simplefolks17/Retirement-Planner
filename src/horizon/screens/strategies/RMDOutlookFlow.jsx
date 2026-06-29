// RMDOutlookFlow — WI-3.5 (#102): the Required Minimum Distribution outlook,
// interactive. Mounts in the StrategiesScreen detail slot. LAYOUT/FORMATTING ONLY
// (rule 10): all numbers come from props.rmdView (the sibling flow bundle, sourced
// from the ONE retirement engine schedule) or wired horizonProps scalars; the
// table-selection controls + outside-balance write through the WI-3.1 `ss` /
// `accounts` setter bundles. The IRS start age comes from config (never hardcoded).

import React from "react";
import { HF, HM } from "../../ThemeContext.jsx";
import { DetailField, money } from "../../fields.jsx";
import { SectionLabel, NoteBox, StatTile, STAT_ROW } from "./flow-ui.jsx";
import { RMD_START_AGE } from "../../../config/irs-2026.js";

const ratePct = r => `${(r * 100).toFixed(1)}%`;

export default function RMDOutlookFlow({ t, props, isMobile = false }) {
  const rv = props.rmdView;
  const ss = props.ss;            // isMarried / spouseIsSoleBenef / spouseCurrentAge
  const accounts = props.accounts; // addlPreTaxBal
  const isMarried = props.isMarried;
  const soleBenef = ss.spouseIsSoleBenef.value;

  const F = (p) => <DetailField t={t} isMobile={isMobile} {...p} />;
  const rows = (rv.rows ?? []).slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NoteBox t={t}>
        Starting at age {RMD_START_AGE}, the IRS requires you to withdraw a minimum amount from your
        pre-tax 401k each year — Required Minimum Distributions. You can't skip them or reinvest them
        back into the 401k, and they're taxed as ordinary income.
      </NoteBox>

      {/* ── Which IRS table applies ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>RMD table</SectionLabel>
        <NoteBox t={t}>
          Table III (Uniform Lifetime) applies to most people. Table II (Joint Life) gives larger
          divisors — smaller required withdrawals — when your sole beneficiary is a spouse more than
          10 years younger.
        </NoteBox>
        {F({ label: "Married", field: ss.isMarried })}
        {isMarried && F({ label: "Spouse is sole beneficiary", field: ss.spouseIsSoleBenef })}
        {isMarried && soleBenef && F({ label: "Spouse current age", field: ss.spouseCurrentAge, format: v => `age ${v}` })}
        {isMarried && soleBenef && (
          <div style={{ font: `400 11px ${HF}`, color: rv.qualifiesTable2 ? t.good : t.faint }}>
            {rv.spouseAgeGap} yr{rv.spouseAgeGap === 1 ? "" : "s"} younger — {rv.qualifiesTable2
              ? "qualifies for Table II"
              : "Table II needs a gap over 10 yrs"}
          </div>
        )}
        <div style={{ font: `500 12px ${HF}`, color: t.ink }}>Active: {rv.activeTableLabel}</div>
      </div>

      {/* ── Outside pre-tax balances ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>Outside pre-tax balances</SectionLabel>
        {F({ label: "Additional pre-tax balance", hint: "other IRAs / pensions — added to the RMD basis",
          field: accounts.addlPreTaxBal, format: money })}
        {accounts.addlPreTaxBal.value > 0 && (
          <div style={{ font: `400 11px ${HF}`, color: t.warm }}>
            +{money(accounts.addlPreTaxBal.value)} added to the RMD basis — the IRS calculates RMDs on the aggregate total.
          </div>
        )}
      </div>

      {/* ── Outlook stats ── */}
      {rv.retAtOrAfterRMD ? (
        <NoteBox t={t}>
          Your retirement age is at or after {RMD_START_AGE} — RMDs begin as soon as you retire.
        </NoteBox>
      ) : (
        <div style={STAT_ROW}>
          <StatTile t={t} label={`First RMD at ${RMD_START_AGE}`} value={money(rv.firstRMDAmount)}
            sub="mandatory · taxed as income" tone="warm" />
          <StatTile t={t} label="Lifetime RMD total" value={money(rv.totalRMDs)}
            sub="forced out of the 401k" tone="warm" />
          <StatTile t={t} label="Est. total tax on RMDs" value={money(rv.rmdTaxBite)}
            sub={`at ${ratePct(rv.effectiveRMDTaxRate)} effective`} tone="warm" />
        </div>
      )}

      {/* ── First-10-years schedule ── */}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionLabel t={t}>Year-by-year (first 10)</SectionLabel>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, auto)", gap: "4px 18px", minWidth: 420 }}>
              {["Age", "Divisor", "Est. 401k bal.", "RMD", `Tax (~${ratePct(rv.effectiveRMDTaxRate)})`].map(h => (
                <span key={h} style={{ font: `500 10px ${HF}`, color: t.mut, textTransform: "uppercase",
                  letterSpacing: "0.05em", borderBottom: `1px solid ${t.line}`, paddingBottom: 4 }}>{h}</span>
              ))}
              {rows.map(({ age, rmd, bal, divisor, tax }) => ([
                <span key={`a${age}`} style={{ font: `600 12px ${HM}`, color: t.accent }}>{age}</span>,
                <span key={`d${age}`} style={{ font: `400 12px ${HM}`, color: t.mut }}>{divisor ?? "—"}</span>,
                <span key={`b${age}`} style={{ font: `400 12px ${HM}`, color: t.ink }}>{money(bal)}</span>,
                <span key={`r${age}`} style={{ font: `600 12px ${HM}`, color: t.warm }}>{money(rmd)}</span>,
                <span key={`t${age}`} style={{ font: `400 12px ${HM}`, color: t.mut }}>{money(tax)}</span>,
              ]))}
            </div>
          </div>
          {rv.rowCount > 10 && (
            <div style={{ font: `400 10.5px ${HF}`, color: t.faint }}>
              Showing first 10 of {rv.rowCount} projected RMD years.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
