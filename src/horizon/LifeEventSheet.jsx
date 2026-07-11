import React, { useMemo, useState } from "react";
import { HF, HM } from "./ThemeContext.jsx";
import { fmt, kbActivate } from "./shared.jsx";
import { evaluateLifeEvent, buildDurationRail } from "../model/what-if.js";
import { VerdictTickRail } from "./fields.jsx";

// LifeEventSheet — the sheet-first life-event placement flow (video-inspired):
// configure a one-time or duration ("$X/mo for N months") event, watch a live
// verdict + impact bullets, then commit it to the plan. On save the event lands
// on the arc as an icon badge at its age.
//
// Rule 10: every verdict/delta shown here comes from ONE evaluateLifeEvent run
// (what-if.js) on the App-provided whatIfBundle — the sheet renders and formats
// only. Direction glyphs come from the model's `dir` strings, never sign math.
//
// Props:
//   t            — theme tokens
//   whatIfBundle — horizonProps.whatIfSimInputs (model inputs for the runs)
//   bounds       — horizonProps.lifeEventBounds { minAge, maxAge, retirementAge }
//   initial      — event seed: a preset ({ label, icon, age, amount | monthlyAmount
//                  + durationMonths + incomeAnnual, isInflow }) or a committed
//                  moneyEvent being edited (has an id)
//   onSave(ev)   — called with the composed event (id preserved when editing)
//   onRemove     — present only when editing a committed event
//   onCancel     — dismiss without changes
const DURATION_MAX_MONTHS = 36; // UI slider ceiling, not a model rule

const VERDICT_COPY = {
  comfortable:  { word: "is comfortable",        tone: "good"   },
  tight:        { word: "is tight — watch it",   tone: "warm"   },
  unaffordable: { word: "doesn't fit your plan", tone: "accent" },
};

export default function LifeEventSheet({
  t, whatIfBundle, bounds, initial, onSave, onRemove, onCancel,
}) {
  const isEdit = initial?.id != null;
  const seedIsDuration = (initial?.durationMonths ?? 0) > 0;

  const [label, setLabel]                   = useState(initial?.label ?? "Life event");
  const [isInflow, setIsInflow]             = useState(initial?.isInflow ?? false);
  const [mode, setMode]                     = useState(seedIsDuration ? "monthly" : "once");
  const [amount, setAmount]                 = useState(initial?.amount ?? 25_000);
  const [monthlyAmount, setMonthlyAmount]   = useState(initial?.monthlyAmount ?? 5_000);
  const [durationMonths, setDurationMonths] = useState(initial?.durationMonths ?? 6);
  const [incomeAnnual, setIncomeAnnual]     = useState(initial?.incomeAnnual ?? 0);
  const [age, setAge]                       = useState(initial?.age ?? bounds.retirementAge);

  const icon = initial?.icon ?? (isInflow ? "✳" : "◆");

  // The SAVE candidate — includes label/icon (display-only fields the model
  // never reads). H1: `id: initial?.id` carries the committed event's id
  // through when editing (undefined for a new/unsaved event — harmless), so
  // evaluateLifeEvent can tell "editing this committed event" from "adding a
  // new one" and avoid double-counting the original (see modelCandidate below).
  const candidate = useMemo(() => {
    const common = { label, icon, age, isInflow, isTaxable: false, id: initial?.id };
    return mode === "monthly"
      ? { ...common, monthlyAmount, durationMonths, incomeAnnual }
      : { ...common, amount };
  }, [label, icon, age, isInflow, mode, amount, monthlyAmount, durationMonths, incomeAnnual, initial?.id]);

  // L1: the MODEL-facing candidate — numeric/model fields only (no label/icon,
  // which the model never reads but which change on every keystroke in the
  // name field). Keeping this separate from `candidate` means typing a label
  // doesn't re-run evaluateLifeEvent/buildDurationRail (dozens of walks) —
  // only a field that can actually change the model's answer does.
  const modelCandidate = useMemo(() => {
    const common = { age, isInflow, isTaxable: false, id: initial?.id };
    return mode === "monthly"
      ? { ...common, monthlyAmount, durationMonths, incomeAnnual }
      : { ...common, amount };
  }, [age, isInflow, mode, amount, monthlyAmount, durationMonths, incomeAnnual, initial?.id]);

  // ONE model run per model-candidate change — verdict, deltas, and (future)
  // overlay all come from this result, so they can never disagree (V1/principle 7).
  const result = useMemo(
    () => (whatIfBundle ? evaluateLifeEvent(whatIfBundle, modelCandidate) : null),
    [whatIfBundle, modelCandidate]);

  // Duration tick rail (monthly mode only): one calcWhatIfScenario run per
  // month of duration, verdict-colored, so the slider shows which durations
  // are still comfortable before the user drags to the edge. eventBase is the
  // model candidate minus durationMonths (buildDurationRail's contract — it
  // sets durationMonths per step itself).
  const durationEventBase = useMemo(() => {
    if (mode !== "monthly") return null;
    const { durationMonths: _drop, ...base } = modelCandidate;
    return base;
  }, [modelCandidate, mode]);

  const durationRail = useMemo(
    () => (whatIfBundle && durationEventBase
      ? buildDurationRail(whatIfBundle, durationEventBase, { maxMonths: DURATION_MAX_MONTHS })
      : []),
    [whatIfBundle, durationEventBase]);

  const verdict = result ? VERDICT_COPY[result.verdict] : null;
  const vColor  = verdict ? t[verdict.tone] : t.mut;

  const handleSave = () => {
    onSave({
      ...candidate,
      id: initial?.id ?? String(Date.now()),
    });
  };

  const seg = (on, color = t.accent) => ({
    flex: 1, padding: "7px 10px", borderRadius: 8, cursor: "pointer", textAlign: "center",
    border: `1px solid ${on ? color : t.line2}`,
    background: on ? `${color}16` : "transparent",
    font: `${on ? 600 : 400} 12.5px ${HF}`, color: on ? t.ink : t.mut,
    userSelect: "none",
  });

  const fieldLabel = { font: `500 11.5px ${HF}`, color: t.mut, marginBottom: 5 };
  const numInput = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${t.line2}`, background: t.bg, color: t.ink,
    font: `600 14px ${HM}`, outline: "none",
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.38)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.surf, border: `1px solid ${t.line2}`,
          borderRadius: 18, padding: "20px 22px",
          maxWidth: 470, width: "92%", maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 8px 40px rgba(0,0,0,.24)",
        }}
      >
        {/* header — icon + editable name */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: `${t.accent}14`, border: `1px solid ${t.line2}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>{icon}</div>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            aria-label="Event name"
            style={{
              flex: 1, border: "none", borderBottom: `1px dashed ${t.line2}`,
              background: "transparent", color: t.ink, outline: "none",
              font: `600 17px ${HF}`, padding: "2px 0",
            }}
          />
        </div>

        {/* direction + shape */}
        <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
          <div role="button" tabIndex={0} onClick={() => setIsInflow(false)}
            onKeyDown={kbActivate(() => setIsInflow(false))} style={seg(!isInflow, t.warm)}>
            Money out
          </div>
          <div role="button" tabIndex={0} onClick={() => setIsInflow(true)}
            onKeyDown={kbActivate(() => setIsInflow(true))} style={seg(isInflow, t.good)}>
            Money in
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
          <div role="button" tabIndex={0} onClick={() => setMode("once")}
            onKeyDown={kbActivate(() => setMode("once"))} style={seg(mode === "once")}>
            One-time
          </div>
          <div role="button" tabIndex={0} onClick={() => setMode("monthly")}
            onKeyDown={kbActivate(() => setMode("monthly"))} style={seg(mode === "monthly")}>
            Monthly, for a while
          </div>
        </div>

        {/* amount fields */}
        {mode === "once" ? (
          <div style={{ marginBottom: 12 }}>
            <div style={fieldLabel}>Amount</div>
            <input type="number" min="0" step="1000" value={amount}
              onChange={e => setAmount(Math.max(0, Number(e.target.value) || 0))}
              aria-label="One-time amount" style={numInput} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={fieldLabel}>{isInflow ? "Monthly amount" : "Monthly spending"}</div>
                <input type="number" min="0" step="500" value={monthlyAmount}
                  onChange={e => setMonthlyAmount(Math.max(0, Number(e.target.value) || 0))}
                  aria-label="Monthly amount" style={numInput} />
              </div>
              {!isInflow && (
                <div style={{ flex: 1 }}>
                  <div style={fieldLabel}>Income while it runs ($/yr)</div>
                  <input type="number" min="0" step="1000" value={incomeAnnual}
                    onChange={e => setIncomeAnnual(Math.max(0, Number(e.target.value) || 0))}
                    aria-label="Income while the event runs" style={numInput} />
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={fieldLabel}>For how long</div>
                <div style={{ font: `600 12px ${HM}`, color: t.accent }}>
                  {durationMonths} month{durationMonths === 1 ? "" : "s"}
                </div>
              </div>
              <input type="range" min="1" max={DURATION_MAX_MONTHS} step="1" value={durationMonths}
                onChange={e => setDurationMonths(Number(e.target.value))}
                aria-label="Duration in months" style={{ width: "100%", accentColor: t.accent }} />
              <VerdictTickRail t={t} rail={durationRail} />
            </div>
          </>
        )}

        {/* age */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={fieldLabel}>{mode === "monthly" ? "Starting at age" : "Happens at age"}</div>
            <div style={{ font: `600 12px ${HM}`, color: t.accent }}>{age}</div>
          </div>
          <input type="range" min={bounds.minAge} max={bounds.maxAge} step="1" value={age}
            onChange={e => setAge(Number(e.target.value))}
            aria-label="Event age" style={{ width: "100%", accentColor: t.accent }} />
        </div>

        {/* verdict + impact — all values straight from the ONE model run */}
        {result && verdict && (
          <div style={{
            border: `1.5px solid ${vColor}55`, background: `${vColor}0e`,
            borderRadius: 13, padding: "13px 15px", marginBottom: 16,
          }}>
            <div style={{ font: `400 12px ${HF}`, color: t.mut }}>This plan…</div>
            <div style={{ font: `700 17px ${HF}`, color: vColor, margin: "2px 0 9px" }}>
              {verdict.word}
            </div>
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "grid", gap: 5 }}>
              <li style={{ font: `500 12.5px ${HF}`, color: t.ink }}>
                Total: {fmt(result.grossCost)}
                {mode === "monthly" && (
                  <span style={{ color: t.mut }}>
                    {" "}({fmt(monthlyAmount)}/mo for {durationMonths} mos
                    {incomeAnnual > 0 && !isInflow ? `, less ${fmt(incomeAnnual)}/yr income` : ""})
                  </span>
                )}
              </li>
              {result.atRetirement.dir && (
                <li style={{ font: `500 12.5px ${HF}`, color: t.ink }}>
                  Portfolio at {result.atRetirement.age}:{" "}
                  <span style={{ color: result.atRetirement.dir === "down" ? t.warm : t.good }}>
                    {result.atRetirement.dir === "down" ? "−" : "+"}{fmt(result.atRetirement.deltaAbs)}
                  </span>
                </li>
              )}
              {result.atPlanAge.dir && (
                <li style={{ font: `500 12.5px ${HF}`, color: t.ink }}>
                  Left at {result.atPlanAge.age}: {fmt(result.atPlanAge.scenario)}{" "}
                  <span style={{ color: result.atPlanAge.dir === "down" ? t.warm : t.good }}>
                    ({result.atPlanAge.dir === "down" ? "−" : "+"}{fmt(result.atPlanAge.deltaAbs)})
                  </span>
                </li>
              )}
              <li style={{ font: `500 12.5px ${HF}`, color: t.ink }}>
                {result.sustainability.scenarioDepletionAge == null
                  ? "Still covered, for life"
                  : `Money runs out at ${result.sustainability.scenarioDepletionAge}`}
                {result.sustainability.newlyDepletes
                  && <span style={{ color: t.warm }}> (was covered for life)</span>}
                {result.sustainability.depletionMoved
                  && <span style={{ color: t.mut }}> (was {result.sustainability.baseDepletionAge})</span>}
              </li>
            </ul>
          </div>
        )}

        {/* actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {isEdit && onRemove && (
            <button onClick={onRemove} style={{
              font: `500 13px ${HF}`, color: t.warm, background: "transparent",
              border: "none", cursor: "pointer", marginRight: "auto", padding: "8px 2px",
            }}>
              Remove from plan
            </button>
          )}
          <button onClick={onCancel} style={{
            font: `500 13px ${HF}`, color: t.mut, background: "transparent",
            border: `1px solid ${t.line}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{
            font: `600 13px ${HF}`, color: "#fff", background: t.accent,
            border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer",
          }}>
            {isEdit ? "Save changes" : "Add to plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
