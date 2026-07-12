// MegaBackdoorFlow — WI-3.7 (#104): mega-backdoor Roth capacity + employer
// match settings. Read-only for the capacity math (no Apply site — Classic's
// mega-backdoor panel is informational, same here); the match-mode inputs are
// live writes through the WI-3.1 `accounts` setter bundle, same as any other
// account field. LAYOUT/FORMATTING ONLY (rule 10): every number comes from
// props.megaView (the sibling flow bundle); the only branch here is a
// value-equality display switch on the `matchMode` enum, the same sanctioned
// pattern ConversionPlannerFlow uses for `conversionMode`/`conversionTaxSource`.

import React from "react";
import { HF } from "../../ThemeContext.jsx";
import { DetailField, money } from "../../fields.jsx";
import { SectionLabel, NoteBox, ListRow, ListCard } from "./flow-ui.jsx";

export default function MegaBackdoorFlow({ t, props, isMobile = false }) {
  const mv = props.megaView;
  const accounts = props.accounts;
  const F = (p) => <DetailField t={t} isMobile={isMobile} {...p} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 1. Explainer ── */}
      <NoteBox t={t}>
        A mega-backdoor Roth uses after-tax 401k contributions — space left over
        once your regular deferral and employer match are counted — converted to
        Roth. It's for savers who've maxed their regular 401k and still have
        room under the IRS's total plan limit.
      </NoteBox>

      {/* ── 2. Capacity breakdown ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>415(c) capacity</SectionLabel>
        <ListCard t={t}>
          {mv.capacityRows.map((row, i) => (
            <ListRow key={row.label} t={t} first={i === 0}
              label={row.label} value={money(row.val)} strong={row.isTotal}
              tone={row.isTotal ? "good" : undefined} />
          ))}
        </ListCard>
        {mv.usesCatchupLimit && (
          <div style={{ font: `400 11px ${HF}`, color: t.faint }}>
            Includes the higher catch-up contribution limit you're eligible for.
          </div>
        )}
      </div>

      {/* ── 3. Match-mode controls (live writes, same as any account field) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>Employer match</SectionLabel>
        {F({ label: "Match formula", field: accounts.matchMode })}
        {accounts.matchMode.value === "flat" && (
          F({ label: "Employer match (% of salary)", field: accounts.employerMatchPct, format: v => `${v}%` })
        )}
        {accounts.matchMode.value === "formula" && (
          <>
            {F({ label: "Match rate", field: accounts.matchFormulaRate, format: v => `${v}%` })}
            {F({ label: "Of the first N% of salary", field: accounts.matchFormulaCap, format: v => `${v}%` })}
          </>
        )}
      </div>

      {/* ── 4. Growth projections ── */}
      {mv.growth.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionLabel t={t}>Where this space could grow</SectionLabel>
          <ListCard t={t}>
            {mv.growth.map((g, i) => (
              <ListRow key={g.yrs} t={t} first={i === 0}
                label={`In ${g.yrs} years`} value={money(g.val)} />
            ))}
          </ListCard>
        </div>
      )}
    </div>
  );
}
