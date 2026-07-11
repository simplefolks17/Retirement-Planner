// Money Events Panel — one-time windfalls, large purchases, inheritances, plus
// READ-ONLY display of duration events (created in the Horizon view's
// LifeEventSheet — see src/model/money-events.js for the two shapes).
// One-time:  { id, label, amount, age, isInflow, isTaxable }
// Duration:  { id, label, monthlyAmount, durationMonths, age, isInflow, incomeAnnual }
//   Classic can delete a duration event but never edits its amount here (that
//   would require the same $/mo × months UI as LifeEventSheet — out of scope
//   for this minimal panel); it renders as a plain summary string instead.

import { C } from "../theme.js";
import { fmt } from "../formatters.js";
import { isDurationEvent, totalEventImpact } from "../model/money-events.js";

const MAX_EVENTS = 6;

function emptyEvent(currentAge) {
  return {
    id: Date.now() + Math.random(),
    label: "",
    amount: 0,
    age: currentAge + 10,
    isInflow: false,
    isTaxable: false,
  };
}

export function MoneyEventsPanel({ events, onChange, currentAge }) {
  const add = () => {
    if (events.length >= MAX_EVENTS) return;
    onChange([...events, emptyEvent(currentAge)]);
  };

  const remove = (id) => onChange(events.filter(e => e.id !== id));

  const update = (id, field, value) =>
    onChange(events.map(e => e.id === id ? { ...e, [field]: value } : e));

  const inputStyle = {
    background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, padding: "4px 8px", fontSize: 12, width: "100%",
  };

  return (
    <div style={{ marginTop: 8 }}>
      {events.length === 0 && (
        <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>
          No one-time events. Click "Add Event" to model a windfall, inheritance, or large purchase.
        </p>
      )}

      {events.map(ev => {
        const duration = isDurationEvent(ev);
        return (
        <div key={ev.id} style={{
          display: "grid", gridTemplateColumns: "1fr 100px 60px auto auto auto",
          gap: 6, alignItems: "center", marginBottom: 6,
          padding: "8px 10px", background: C.card, borderRadius: 8,
          border: `1px solid ${C.border}`,
        }}>
          <input
            style={inputStyle} placeholder="Label (e.g. Car purchase)"
            value={ev.label} onChange={e => update(ev.id, "label", e.target.value)}
          />
          {duration ? (
            <span
              title="Duration event — edit in the Horizon view."
              style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}
            >
              <span style={{ fontSize: 11, color: C.text, whiteSpace: "nowrap" }}>
                {fmt(ev.monthlyAmount)}/mo × {ev.durationMonths} mo
              </span>
              <span style={{ fontSize: 9, color: C.muted, whiteSpace: "nowrap" }}>
                edit in Horizon view
              </span>
            </span>
          ) : (
            <input
              style={inputStyle} type="number" min="0" step="1000"
              placeholder="Amount"
              value={ev.amount || ""}
              onChange={e => update(ev.id, "amount", Math.max(0, Number(e.target.value)))}
            />
          )}
          <input
            style={inputStyle} type="number" min={currentAge} max={120}
            placeholder="Age"
            value={ev.age}
            // Free typing on change; clamp to [currentAge, …] on blur so passing through a
            // transient low value (e.g. typing "6" before "65") doesn't snap the field.
            onChange={e => update(ev.id, "age", Number(e.target.value))}
            onBlur={e => update(ev.id, "age", Math.max(currentAge, Number(e.target.value) || currentAge))}
          />
          {duration ? (
            <span style={{ fontSize: 11, color: C.muted }}>{ev.isInflow ? "Income" : "Expense"}</span>
          ) : (
            <select
              style={{ ...inputStyle, width: "auto", padding: "4px 6px" }}
              value={ev.isInflow ? "in" : "out"}
              onChange={e => update(ev.id, "isInflow", e.target.value === "in")}
            >
              <option value="out">Expense</option>
              <option value="in">Income</option>
            </select>
          )}
          {!duration && ev.isInflow && (
            <label style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <input
                type="checkbox" checked={ev.isTaxable}
                onChange={e => update(ev.id, "isTaxable", e.target.checked)}
              />
              Taxable
            </label>
          )}
          {(duration || !ev.isInflow) && <span />}
          <button
            onClick={() => remove(ev.id)}
            style={{
              background: "transparent", border: "none", color: C.muted,
              cursor: "pointer", fontSize: 16, padding: "0 4px",
            }}
          >×</button>
        </div>
        );
      })}

      {events.length < MAX_EVENTS && (
        <button onClick={add} style={{
          fontSize: 12, padding: "5px 14px", borderRadius: 6,
          border: `1px solid ${C.border}`, background: "transparent",
          color: C.blue, cursor: "pointer", marginTop: 4,
        }}>
          + Add Event
        </button>
      )}

      {events.length > 0 && (
        <p style={{ fontSize: 11, color: C.muted, margin: "8px 0 0" }}>
          Net impact on portfolio:{" "}
          <span style={{ color: C.text }}>
            {fmt(totalEventImpact(events))}
          </span>
        </p>
      )}
    </div>
  );
}
