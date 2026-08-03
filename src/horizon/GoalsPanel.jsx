import React, { useState } from "react";
import { HF, HM } from "./ThemeContext.jsx";
import { Btn, Pill } from "./shared.jsx";
import { fmtFull } from "../formatters.js";
import { isDurationEvent, MAX_MONEY_EVENTS } from "../model/money-events.js";
import { ASSUMPTIONS } from "../config/irs-2026.js";
import { LIFE_EVENTS, presetSeed, CUSTOM_GOAL_SEED } from "./presets.js";

// ── Goals panel ──────────────────────────────────────────────────────────────
// The "Goals" facet of the Plan Explore tray. Multiple life events ("goals")
// live here — placed, listed (numbered), edited, and removed. Everything is
// keyed by the event's unique `id`; a preset ALWAYS seeds a new goal (the sheet
// mints the id), so the same preset can be placed any number of times up to the
// MAX_MONEY_EVENTS cap. Pure render (rule 10): no arithmetic on model values —
// the one-line summary is plain formatting of the event's own seed fields.

const DEFAULT_VISIBLE = ASSUMPTIONS.DEFAULT_VISIBLE_GOALS;

// A plain-language one-liner for a committed goal row. Both dollar figures
// are values the user TYPED into the sheet, so they render full precision
// (two-tier policy) — a calm/rounded formatter here misstated typed amounts
// ($250/mo read "$300/mo"; $49/mo read a fabricated "−$0/mo").
function goalSummary(ev) {
  const at = `at age ${ev.age}`;
  const dir = ev.isInflow ? "+" : "−";
  if (isDurationEvent(ev)) {
    // Span: an open-ended event (untilAge) reads "through age X"; a fixed-length
    // one keeps "N mo". Optional escalation shows as "· +X%/yr". Both are the
    // event's own seed fields — plain formatting, no arithmetic (rule 10).
    const span = ev.untilAge != null ? `through age ${ev.untilAge}` : `${ev.durationMonths} mo`;
    const growth = ev.growthPct ? ` · +${ev.growthPct}%/yr` : "";
    return `${dir}${fmtFull(ev.monthlyAmount)}/mo · ${span}${growth} · ${at}`;
  }
  return `${dir}${fmtFull(ev.amount)} · ${at}`;
}

export default function GoalsPanel({ t, moneyEvents, onNewGoal, onEditGoal, onRemoveGoal, bounds }) {
  const [showAll, setShowAll] = useState(false);
  const goals = moneyEvents ?? [];
  const full = goals.length >= MAX_MONEY_EVENTS;

  const presets = showAll ? LIFE_EVENTS : LIFE_EVENTS.slice(0, DEFAULT_VISIBLE);

  const startCustom = () =>
    onNewGoal({ ...CUSTOM_GOAL_SEED, age: bounds?.retirementAge });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Your goals (numbered) ── */}
      {goals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {goals.map((ev, i) => (
            <div key={ev.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              border: `1px solid ${t.line}`, borderRadius: 11,
              background: t.surf2, padding: "9px 11px",
            }}>
              {/* Border reserved (transparent) so this row and the ✕ beside it
                  can never differ in height, and minHeight 44 so the tap-to-edit
                  region clears the guideline — it sits immediately beside a
                  destructive control, where a mis-tap is expensive. */}
              <button
                type="button"
                onClick={() => onEditGoal(ev)}
                aria-label={`Edit goal ${i + 1}: ${ev.label}`}
                style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 10,
                  background: "transparent", border: "1px solid transparent",
                  cursor: "pointer", minHeight: 44,
                  textAlign: "left", padding: 0, minWidth: 0,
                }}>
                <span style={{ font: `600 11px ${HM}`, color: t.faint, width: 46, flexShrink: 0 }}>
                  Goal {i + 1}
                </span>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{ev.icon ?? (ev.isInflow ? "✳" : "◆")}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", font: `600 13px ${HF}`, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ev.label}
                  </span>
                  <span style={{ display: "block", font: `500 11.5px ${HM}`, color: ev.isInflow ? t.good : t.mut, marginTop: 1 }}>
                    {goalSummary(ev)}
                  </span>
                </span>
              </button>
              <Btn t={t} size="sm" variant="quiet" tone="faint"
                onClick={() => onRemoveGoal(ev.id)}
                ariaLabel={`Remove goal ${i + 1}: ${ev.label}`}
                style={{ padding: "4px 11px", borderRadius: 8, alignSelf: "stretch" }}>✕</Btn>
            </div>
          ))}
        </div>
      )}

      {/* ── Add a goal ── */}
      {full ? (
        <div style={{ font: `500 12px ${HF}`, color: t.warm }}>
          You've reached the max of {MAX_MONEY_EVENTS} goals — remove one to add another.
        </div>
      ) : (
        <div>
          <div style={{ font: `500 11.5px ${HF}`, color: t.mut, marginBottom: 8 }}>
            {goals.length > 0 ? "Add another goal" : "Add a goal — see its effect on your arc."}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {presets.map((ev) => (
              <Pill key={ev.l} t={t} onClick={() => onNewGoal(presetSeed(ev))}>
                {ev.icon}  {ev.l}
              </Pill>
            ))}
            {/* The dashed borders stay — same 1px width as Pill's own, so the
                row's boxes remain identical in height, only the style differs. */}
            {!showAll && LIFE_EVENTS.length > DEFAULT_VISIBLE && (
              <Pill t={t} onClick={() => setShowAll(true)} tone="accent"
                style={{ border: `1px dashed ${t.line2}` }}>
                + Add more goals
              </Pill>
            )}
            {showAll && (
              <Pill t={t} onClick={startCustom} tone="accent"
                style={{ border: `1px dashed ${t.accent}` }}>
                + Custom goal
              </Pill>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
