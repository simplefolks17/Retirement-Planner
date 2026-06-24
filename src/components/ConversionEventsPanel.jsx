// Conversion Events Panel — sporadic one-time 401k → Roth conversions in low-income
// working years (a job-change gap year, a sabbatical, etc.). Distinct from money events:
// a conversion moves pre-tax principal into Roth and is taxed once as ordinary income.
// Each event: { id, age, amount }. Minimal/functional UI (design polish deferred).

import { C } from "../theme.js";
import { fmt } from "../formatters.js";

const MAX_CONVERSION_EVENTS = 3; // sporadic by nature — a handful of lifetime events

function emptyEvent(currentAge, safeRetAge) {
  // Default to a year mid-career, clamped inside the working window.
  const mid = Math.round((currentAge + safeRetAge) / 2);
  return {
    id: Date.now() + Math.random(),
    age: Math.min(Math.max(currentAge + 1, mid), Math.max(currentAge + 1, safeRetAge - 1)),
    amount: 0,
  };
}

export function ConversionEventsPanel({ events, onChange, currentAge, safeRetAge, estTaxByAge = {} }) {
  const minAge = currentAge + 1;
  const maxAge = Math.max(minAge, safeRetAge - 1); // strictly before retirement (window owns ≥ retirement)

  const add = () => {
    if (events.length >= MAX_CONVERSION_EVENTS) return;
    onChange([...events, emptyEvent(currentAge, safeRetAge)]);
  };
  const remove = (id) => onChange(events.filter(e => e.id !== id));
  const update = (id, field, value) =>
    onChange(events.map(e => e.id === id ? { ...e, [field]: value } : e));
  const clampAge = (v) => Math.min(maxAge, Math.max(minAge, Number(v) || minAge));

  const inputStyle = {
    background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, padding: "4px 8px", fontSize: 12, width: "100%",
  };

  return (
    <div style={{ marginTop: 8 }}>
      {events.length === 0 && (
        <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>
          No working-year conversions. If you have a low-income year before retiring (a job
          change, a sabbatical), converting some 401k → Roth then can lock in a low tax rate.
        </p>
      )}

      {events.map(ev => {
        const estTax = estTaxByAge[ev.age];
        return (
          <div key={ev.id} style={{
            display: "grid", gridTemplateColumns: "70px 120px 1fr auto",
            gap: 8, alignItems: "center", marginBottom: 6,
            padding: "8px 10px", background: C.card, borderRadius: 8,
            border: `1px solid ${C.border}`,
          }}>
            <input
              style={inputStyle} type="number" min={minAge} max={maxAge}
              placeholder="Age"
              value={ev.age}
              // Free typing on change; clamp on blur so a transient low value doesn't snap.
              onChange={e => update(ev.id, "age", Number(e.target.value))}
              onBlur={e => update(ev.id, "age", clampAge(e.target.value))}
            />
            <input
              style={inputStyle} type="number" min="0" step="5000"
              placeholder="Convert $"
              value={ev.amount || ""}
              onChange={e => update(ev.id, "amount", Math.max(0, Number(e.target.value)))}
            />
            <span style={{ fontSize: 10, color: C.muted }}>
              {ev.amount > 0 && estTax != null
                ? <>est. tax <span style={{ color: C.gold, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(estTax)}</span> this year</>
                : "401k → Roth, taxed as income"}
            </span>
            <button
              onClick={() => remove(ev.id)}
              style={{ background: "transparent", border: "none", color: C.muted,
                cursor: "pointer", fontSize: 16, padding: "0 4px" }}
            >×</button>
          </div>
        );
      })}

      {events.length < MAX_CONVERSION_EVENTS && (
        <button onClick={add} style={{
          fontSize: 12, padding: "5px 14px", borderRadius: 6,
          border: `1px solid ${C.border}`, background: "transparent",
          color: C.blue, cursor: "pointer", marginTop: 4,
        }}>
          + Add Conversion Year
        </button>
      )}

      {events.length > 0 && (
        <p style={{ fontSize: 11, color: C.muted, margin: "8px 0 0" }}>
          Total converted before retirement:{" "}
          <span style={{ color: C.text }}>
            {fmt(events.reduce((s, e) => s + Math.max(0, e.amount), 0))}
          </span>
          {" "}· lowers future RMDs (shows up as longer longevity, not in the window benefit figure).
        </p>
      )}
    </div>
  );
}
