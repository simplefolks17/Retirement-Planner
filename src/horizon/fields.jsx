// Shared editable-field primitives for Horizon screens (rule 10: layout only).
// Extracted from MyDetailsScreen (WI-3.2) so the Strategies flows (WI-3.4+) reuse
// the exact same control behaviour off the WI-3.1 setter-bundle field shapes —
// one implementation of the stepper/slider/choice/toggle logic, no duplication.
//
// A "field" is a self-describing bundle entry: numeric → { value, set, min, max,
// step, sliderMax }; choice → { value, set, options:[{value,label}] }; toggle →
// { value:boolean, set }. The control reads `.value` and writes through `.set`,
// and never computes a bound (rule 1 / rule 10).

import React from "react";
import { HF, HM } from "./ThemeContext.jsx";

// ── display-only formatters (shared so screens format values identically) ──────
// Sign-aware: a negative figure (e.g. a Roth net benefit) reads "−$9,854", never
// "$-9,854". Non-negative values are unchanged, so existing callers are unaffected.
export const money = v => {
  if (v == null || isNaN(v)) return "—";
  const r = Math.round(v);
  return r < 0 ? `−$${Math.abs(r).toLocaleString()}` : `$${r.toLocaleString()}`;
};
export const ageFmt = v => (v == null ? "—" : `age ${v}`);
export const pctYr  = v => (v == null ? "—" : `${v}%/yr`);
export const pct    = v => (v == null ? "—" : `${v}%`);

export function FieldRow({ t, label, hint, children }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 18, padding: "11px 0", borderTop: `1px solid ${t.line}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: `500 13px ${HF}`, color: t.ink }}>{label}</div>
        {hint && <div style={{ font: `400 11px ${HF}`, color: t.faint, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export function seg(t, on) {
  return {
    font: `${on ? 600 : 500} 12.5px ${HF}`,
    color: on ? t.accent : t.mut,
    background: on ? `${t.accent}18` : "transparent",
    border: `1px solid ${on ? t.accent : t.line2}`,
    borderRadius: 8, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap",
  };
}

// ── Verdict tick rail ────────────────────────────────────────────────────────
// Shared by the Plan "Try a change" sliders, the Ideas "Dials" sliders, and the
// LifeEventSheet duration slider: a row of colored ticks under a range input,
// one tick per buildLeverRail/buildDurationRail entry. Rule 10: this component
// maps a verdict STRING (comfortable/tight/unaffordable) to a theme token and
// nothing else — it never computes or compares dollars; every verdict comes
// straight from the model (what-if.js).
export const VERDICT_TINT = { comfortable: "good", tight: "warm", unaffordable: "accent" };

// `legend` (optional, BUG-73 fix): [{ verdict, label }] from
// buildVerdictLegend/verdictInfoForScenario (what-if.js) — renders a small
// caption row under the ticks so users can SEE the value range behind each
// verdict color, not just infer it from the tint (owner requirement). Rule
// 10: the label text is verbatim from the model; this component only maps
// the verdict string to the SAME tint the ticks already use. Absent → no
// caption row, pixel-identical to before this prop existed.
export function VerdictTickRail({ t, rail, legend }) {
  if (!rail?.length) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: 2, marginTop: 6 }} aria-hidden="true">
        {rail.map(entry => (
          <div key={entry.value ?? entry.months} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: t[VERDICT_TINT[entry.verdict]] ?? t.line,
          }} />
        ))}
      </div>
      {legend?.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
          {legend.map(item => (
            <span key={item.verdict} style={{ font: `400 10px ${HF}` }}>
              <span style={{ color: t[VERDICT_TINT[item.verdict]] ?? t.mut, fontWeight: 600 }}>
                {item.verdict}
              </span>
              <span style={{ color: t.faint }}> {item.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StepBtn({ t, children, onClick, disabled, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      style={{
        width: 34, height: 34, flexShrink: 0, borderRadius: 8,
        border: `1.5px solid ${t.line2}`, background: t.surf,
        font: `600 17px ${HF}`, color: disabled ? t.faint : t.accent,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
      }}>{children}</button>
  );
}

// One editable field driven entirely by a bundle field object.
export function DetailField({ t, label, hint, field, isMobile, format = String, seed, nullLabel }) {
  const { value, set, min, max, sliderMax, step = 1, options } = field;

  // ── choice: many options → <select>, few → segmented buttons ──
  if (options) {
    if (options.length > 3) {
      return (
        <FieldRow t={t} label={label} hint={hint}>
          {/* Pass the option's ORIGINAL typed value (e.target.value is always a
              string) so numeric/boolean choices don't get coerced — parity with
              the segmented-button path below. */}
          <select value={value} aria-label={label}
            onChange={e => { const o = options.find(o => String(o.value) === e.target.value); if (o) set(o.value); }}
            style={{
              font: `500 13px ${HF}`, color: t.ink, background: t.surf,
              border: `1px solid ${t.line2}`, borderRadius: 8, padding: "7px 10px",
              maxWidth: 220, cursor: "pointer",
            }}>
            {options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
          </select>
        </FieldRow>
      );
    }
    return (
      <FieldRow t={t} label={label} hint={hint}>
        <div style={{ display: "flex", gap: 6 }}>
          {options.map(o => (
            <button key={String(o.value)} type="button" aria-pressed={o.value === value}
              aria-label={`${label}: ${o.label}`}
              onClick={() => set(o.value)} style={seg(t, o.value === value)}>{o.label}</button>
          ))}
        </div>
      </FieldRow>
    );
  }

  // ── boolean toggle ──
  if (typeof value === "boolean") {
    return (
      <FieldRow t={t} label={label} hint={hint}>
        <div style={{ display: "flex", gap: 6 }}>
          {[["Yes", true], ["No", false]].map(([l, v]) => (
            <button key={l} type="button" aria-pressed={value === v}
              aria-label={`${label}: ${l}`}
              onClick={() => set(v)} style={seg(t, value === v)}>{l}</button>
          ))}
        </div>
      </FieldRow>
    );
  }

  // ── numeric ──
  const isNull    = value == null;
  // No "?? 0" fabrication (rule 10): a nullable field becomes editable only when
  // the model supplies a seed or a min to start from; otherwise it stays a
  // read-only edge state rather than inventing a 0.
  const seedValue = seed ?? min;
  const editVal   = isNull ? seedValue : value;
  const canEdit   = typeof editVal === "number" && Number.isFinite(editVal);
  const display   = isNull ? (nullLabel ?? "Auto") : format(value);
  const hasMax    = typeof max === "number";
  const clamp = v => {
    let n = v;
    if (typeof min === "number") n = Math.max(min, n);
    if (hasMax) n = Math.min(max, n);
    return n;
  };
  const bump = dir => set(clamp(editVal + dir * step));

  // Read-only edge state: the model gave neither a value nor a seed to edit from.
  if (!canEdit) {
    return (
      <FieldRow t={t} label={label} hint={hint}>
        <span style={{ font: `600 15px ${HM}`, color: t.faint }}>{display}</span>
      </FieldRow>
    );
  }

  // Stepper for mobile, and for any unbounded field (no max → no slider track).
  if (isMobile || !hasMax) {
    return (
      <FieldRow t={t} label={label} hint={hint}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StepBtn t={t} ariaLabel={`decrease ${label}`} onClick={() => bump(-1)}
            disabled={!isNull && typeof min === "number" && value <= min}>−</StepBtn>
          <span style={{ minWidth: 96, textAlign: "center", font: `600 15px ${HM}`,
            color: isNull ? t.faint : t.ink }}>{display}</span>
          <StepBtn t={t} ariaLabel={`increase ${label}`} onClick={() => bump(1)}
            disabled={!isNull && hasMax && value >= max}>+</StepBtn>
        </div>
      </FieldRow>
    );
  }

  // Desktop slider.
  return (
    <FieldRow t={t} label={label} hint={hint}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 220 }}>
        <span style={{ textAlign: "right", font: `600 14px ${HM}`, color: isNull ? t.faint : t.ink }}>{display}</span>
        {/* Track top (pure layout): sliderMax gives fine resolution, but never
            below the current value so a large balance isn't visually clamped. */}
        <input type="range" min={min} max={Math.max(sliderMax ?? max, editVal)} step={step} value={editVal}
          aria-label={label} aria-valuetext={display}
          onChange={e => set(Number(e.target.value))}
          style={{ width: "100%", accentColor: t.accent, height: 6, cursor: "pointer" }} />
      </div>
    </FieldRow>
  );
}
