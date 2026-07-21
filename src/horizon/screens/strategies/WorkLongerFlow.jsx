// WorkLongerFlow — #55: the "is it worth working a few more years?" comparison.
// Read-only. LAYOUT/FORMATTING ONLY (rule 10): every number comes from
// props.workLongerView (calcWorkLongerBreakEven), already computed. Each offset
// row shows portfolio-at-retirement (+delta), longevity, the SS companion, and
// the shrinking Roth-conversion window.

import React from "react";
import { fmt, fmtSigned } from "../../../formatters.js";
import { SectionLabel, NoteBox, StatTile, STAT_ROW } from "./flow-ui.jsx";

export default function WorkLongerFlow({ t, props }) {
  const wl = props.workLongerView;
  if (!wl) {
    return <NoteBox t={t}>You're already retired in this plan, so there's no "work longer" tradeoff to weigh.</NoteBox>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <NoteBox t={t}>
        Every extra year you work adds contributions and market growth, lifts the Social Security
        benefit your record earns, and shortens the low-tax Roth-conversion window before RMDs begin.
        Here's what each option is worth against retiring at {wl.baseRetAge}.
      </NoteBox>

      {wl.rows.map((row) => (
        <div key={row.years} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionLabel t={t}>Work {row.years} more {row.years === 1 ? "year" : "years"} — retire at {row.retAge}</SectionLabel>
          <div style={STAT_ROW}>
            <StatTile t={t} label="Portfolio at retirement" value={fmt(row.portfolioAtRet)}
              sub={`${fmtSigned(row.portfolioDelta)} vs now`} tone="good" />
            <StatTile t={t} label="Portfolio lasts"
              value={row.sustainable ? "For life" : (row.depletionAge != null ? `to age ${row.depletionAge}` : "—")}
              sub={row.longevityDeltaYears != null ? `${row.longevityDeltaYears >= 0 ? "+" : ""}${row.longevityDeltaYears} yrs` : (row.sustainable ? "still for life" : undefined)} />
            {wl.includeSS && (
              <StatTile t={t} label="Social Security / yr" value={fmt(row.ssAnnual)}
                sub={`${fmtSigned(row.ssDelta)}/yr`} tone="good" />
            )}
            <StatTile t={t} label="Roth-conversion window" value={`${row.conversionWindowYrs} yrs`}
              sub={row.conversionWindowDelta !== 0 ? `${row.conversionWindowDelta >= 0 ? "+" : ""}${row.conversionWindowDelta} vs now` : "unchanged"} tone="warm" />
          </div>
        </div>
      ))}
    </div>
  );
}
