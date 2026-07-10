// WithdrawalOrderFlow — WI-3.7 (#104): the tax-smart withdrawal-order flow.
// Read-only (no Apply site — the order is a fixed, tax-optimal sequence, not a
// tunable setting). LAYOUT/FORMATTING ONLY (rule 10): every number comes from
// props.withdrawalView (the sibling flow bundle), already pre-filtered
// (steps only include amount > 0 rows) and pre-gated (hasSavings) — this
// component performs zero arithmetic and zero comparisons on model values.

import React from "react";
import { money } from "../../fields.jsx";
import { SectionLabel, NoteBox, StatTile, STAT_ROW, ListRow, ListCard } from "./flow-ui.jsx";

export default function WithdrawalOrderFlow({ t, props }) {
  const wv = props.withdrawalView;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 1. Explainer ── */}
      <NoteBox t={t}>
        In your first year of retirement, your plan draws from your accounts in
        the order below — the sequence that leaves you with the least tax bill.
        Pulling from the wrong account first can push you into a higher tax
        bracket for no reason.
      </NoteBox>

      {/* ── 2. Draw order ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>Year-1 draw order</SectionLabel>
        <ListCard t={t}>
          {wv.steps.map((step, i) => (
            <ListRow key={step.key} t={t} first={i === 0}
              index={i + 1} label={step.label} value={money(step.amount)} sub={step.note} />
          ))}
        </ListCard>
      </div>

      {/* ── 3. Optimal vs. worst-case comparison ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel t={t}>Tax-optimal vs. worst case</SectionLabel>
        <div style={STAT_ROW}>
          <StatTile t={t} label="This order" value={money(wv.yr1TaxOptimal)} tone="good" />
          <StatTile t={t} label="Worst case" value={money(wv.yr1TaxWorstCase)}
            sub="drawing all pre-tax first" tone="warm" />
        </div>
      </div>

      {/* ── 4. Savings callout (only when there IS a saving to claim) ── */}
      {wv.hasSavings && (
        <NoteBox t={t} tone="good">
          {money(wv.yr1TaxSavings)} saved in year-1 tax by drawing in this order, instead of
          worst case.
        </NoteBox>
      )}
    </div>
  );
}
