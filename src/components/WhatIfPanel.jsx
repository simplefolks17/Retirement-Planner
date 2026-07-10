// What-If Overlay — ephemeral scenario panel, never modifies main App state.
// Minimal/functional UI; design polish deferred to the design pass.
//
// Two modes:
//   delta       — user defines a change, sees impact on yearsSustained
//   affordability — user sets a target age, finds max affordable one-time expense

import { useState, useMemo } from "react";
import { C } from "../theme.js";
import { fmt, fmtPct } from "../formatters.js";
import { calcWhatIfDelta, calcAffordabilityMax } from "../model/what-if.js";
import { ASSUMPTIONS } from "../config/irs-2026.js";

const PRESETS = [
  { label: "Work 2 more years",  retirementAgeOffset: +2 },
  { label: "Retire 2 years early", retirementAgeOffset: -2 },
  { label: "Custom",             retirementAgeOffset: 0  },
];

function DeltaChip({ delta }) {
  if (delta === null || delta === undefined) return null;
  if (!isFinite(delta)) {
    return <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>∞</span>;
  }
  const pos = delta >= 0;
  const color = pos ? C.green : "#f85149";
  const sign  = pos ? "+" : "";
  return (
    <span style={{ color, fontSize: 12, fontWeight: 700 }}>
      {sign}{delta.toFixed(1)} yrs
    </span>
  );
}

function YearsSustainedLabel({ years, safeRetAge }) {
  if (years === Infinity) return <span style={{ color: C.green }}>Sustainable indefinitely</span>;
  const depletionAge = Math.round(safeRetAge + years);
  return <span>Portfolio lasts to age <strong>{depletionAge}</strong></span>;
}

export function WhatIfPanel({
  // All inputs the panel needs to run its own isolated computation
  simInputs,
  fedMarginal,
  retDrawShared,
  safeRetAge,
  safeLifeExp,
  baseTotalAtRet,
  baseYearsSustained,
  currentAge,
  addlPreTaxBal = 0,
}) {
  const [open,     setOpen]     = useState(false);
  const [mode,     setMode]     = useState("delta");
  const [preset,   setPreset]   = useState(null);

  // Delta mode inputs
  const [label,    setLabel]    = useState("");
  const [amount,   setAmount]   = useState("");
  const [eventAge, setEventAge] = useState(currentAge + 5);
  const [isInflow, setIsInflow] = useState(false);
  const [retAgeOff,setRetAgeOff]= useState(0);
  const [expenseDelta, setExpenseDelta] = useState("");

  // Affordability mode inputs
  const [affAge,   setAffAge]   = useState(currentAge + 5);
  const [targetAge,setTargetAge]= useState(safeLifeExp);

  // Memoized so deltaResult/affordResult can list it honestly in their deps
  // (a fresh object each render would re-run them every render — principle 13).
  const sharedArgs = useMemo(() => ({
    simInputs, fedMarginal, retDrawShared,
    safeRetAge, safeLifeExp,
    baseTotalAtRet, baseYearsSustained,
    addlPreTaxBal,
  }), [simInputs, fedMarginal, retDrawShared,
       safeRetAge, safeLifeExp, baseTotalAtRet, baseYearsSustained, addlPreTaxBal]);

  const deltaResult = useMemo(() => {
    if (mode !== "delta") return null;
    const events = [];
    if (Number(amount) > 0) {
      events.push({
        label: label || "What-if event",
        amount: Number(amount),
        age: Number(eventAge),
        isInflow,
        isTaxable: false,
      });
    }
    const retOff = preset?.retirementAgeOffset ?? retAgeOff;
    const retirementAgeOverride = retOff !== 0 ? safeRetAge + retOff : null;
    const annualExpensesOverride = expenseDelta !== "" && Number(expenseDelta) !== 0
      ? retDrawShared.effectiveExpenses + Number(expenseDelta)
      : null;

    if (events.length === 0 && retirementAgeOverride === null && annualExpensesOverride === null) return null;

    return calcWhatIfDelta({ ...sharedArgs, moneyEvents: events, retirementAgeOverride, annualExpensesOverride });
  }, [mode, amount, eventAge, isInflow, label, retAgeOff, preset, expenseDelta, sharedArgs,
      safeRetAge, retDrawShared.effectiveExpenses]);

  const affordResult = useMemo(() => {
    if (mode !== "affordability") return null;
    return calcAffordabilityMax({
      ...sharedArgs,
      purchaseAge: Number(affAge),
      targetLifeExpectancy: Number(targetAge),
      step: ASSUMPTIONS.AFFORDABILITY_STEP,
    });
  }, [mode, affAge, targetAge, sharedArgs]);

  const inputStyle = {
    background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, padding: "4px 8px", fontSize: 12,
  };

  const applyPreset = (p) => {
    setPreset(p);
    setRetAgeOff(p.retirementAgeOffset);
    if (p.retirementAgeOffset !== 0) {
      setAmount("");
      setExpenseDelta("");
    }
  };

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10,
      background: "#0d1117", marginBottom: 20, overflow: "hidden",
    }}>
      {/* Header / toggle */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", cursor: "pointer",
          borderBottom: open ? `1px solid ${C.border}` : "none",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: C.gold }}>
          What-If Calculator
        </span>
        <span style={{ fontSize: 11, color: C.muted }}>
          {open ? "▲ hide" : "▼ explore scenarios"}
        </span>
      </div>

      {open && (
        <div style={{ padding: "14px 16px" }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["delta", "affordability"].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${mode === m ? C.gold : C.border}`,
                background: mode === m ? "#2d1f00" : "transparent",
                color: mode === m ? C.gold : C.muted, fontWeight: mode === m ? 700 : 400,
              }}>
                {m === "delta" ? "Scenario Delta" : "Max Affordable"}
              </button>
            ))}
          </div>

          {mode === "delta" && (
            <>
              {/* Quick presets */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${preset?.label === p.label ? C.blue : C.border}`,
                    background: preset?.label === p.label ? "#001f2d" : "transparent",
                    color: preset?.label === p.label ? C.blue : C.muted,
                  }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Inputs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px auto", gap: 8, alignItems: "center" }}>
                  <input style={{ ...inputStyle, width: "100%" }} placeholder="What are you modeling? (optional)"
                    value={label} onChange={e => setLabel(e.target.value)} />
                  <input style={{ ...inputStyle, width: "100%" }} type="number" min="0" step="1000"
                    placeholder="$ Amount"
                    value={amount} onChange={e => setAmount(e.target.value)} />
                  <input style={{ ...inputStyle, width: "100%" }} type="number" min={currentAge} max={120}
                    placeholder="At age"
                    value={eventAge} onChange={e => setEventAge(Number(e.target.value))} />
                  <select style={{ ...inputStyle, width: "auto" }} value={isInflow ? "in" : "out"}
                    onChange={e => setIsInflow(e.target.value === "in")}>
                    <option value="out">Expense</option>
                    <option value="in">Windfall</option>
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Annual spending change (retirement):</span>
                  <input style={{ ...inputStyle, width: 140 }} type="number" step="1000"
                    placeholder="e.g. -5000 or +3000"
                    value={expenseDelta} onChange={e => setExpenseDelta(e.target.value)} />
                </div>

                {!preset || preset.label === "Custom" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Retirement age shift:</span>
                    <input style={{ ...inputStyle, width: 80 }} type="number" min={-10} max={10}
                      placeholder="years (±)"
                      value={retAgeOff} onChange={e => setRetAgeOff(Number(e.target.value))} />
                  </div>
                ) : null}
              </div>

              {/* Result */}
              {deltaResult ? (
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: C.text }}>
                      <YearsSustainedLabel years={deltaResult.scenarioYears} safeRetAge={safeRetAge} />
                    </span>
                    <span style={{ fontSize: 12, color: C.muted }}>
                      vs&nbsp;
                      <YearsSustainedLabel years={deltaResult.baseYears} safeRetAge={safeRetAge} />
                      &nbsp;→&nbsp;<DeltaChip delta={deltaResult.deltaYears} />
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>PORTFOLIO AT RETIREMENT</div>
                      <div style={{ fontSize: 13 }}>{fmt(deltaResult.scenarioTotalAtRet)}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>was {fmt(deltaResult.baseTotalAtRet)}</div>
                    </div>
                    {deltaResult.scenarioExpenses !== deltaResult.baseExpenses && (
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>ANNUAL SPEND</div>
                        <div style={{ fontSize: 13 }}>{fmt(deltaResult.scenarioExpenses)}/yr</div>
                        <div style={{ fontSize: 10, color: C.muted }}>was {fmt(deltaResult.baseExpenses)}/yr</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: C.muted }}>
                  Enter an amount, retirement age shift, or spending change above to see the impact.
                </p>
              )}
            </>
          )}

          {mode === "affordability" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 100px auto 100px", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.muted }}>One-time purchase at age</span>
                  <input style={{ ...inputStyle, width: "100%" }} type="number" min={currentAge} max={120}
                    value={affAge} onChange={e => setAffAge(Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: C.muted }}>sustaining to age</span>
                  <input style={{ ...inputStyle, width: "100%" }} type="number" min={safeRetAge} max={120}
                    value={targetAge} onChange={e => setTargetAge(Number(e.target.value))} />
                </div>
              </div>

              {affordResult && (
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    Maximum affordable:{" "}
                    <strong style={{ color: C.gold, fontSize: 16 }}>
                      {affordResult.maxAmount > 0 ? fmt(affordResult.maxAmount) : "$0"}
                    </strong>
                  </div>
                  {affordResult.maxAmount > 0 ? (
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Spending {fmt(affordResult.maxAmount)} at age {affAge} reduces longevity by{" "}
                      <DeltaChip delta={affordResult.deltaYears} />
                      {" "}while still sustaining to age {targetAge}.
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#f85149" }}>
                      Your current plan doesn't sustain to age {targetAge} — no room for additional expenses.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Export */}
          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button
              onClick={() => window.print()}
              style={{
                fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${C.border}`, background: "transparent", color: C.muted,
              }}
            >
              Export as PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
