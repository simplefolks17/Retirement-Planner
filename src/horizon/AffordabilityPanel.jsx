// AffordabilityPanel — Ideas "Solvers" mode (WI-3.10/Level-3 slice 5): "what's the
// biggest one-time expense my plan can absorb?" Follows the SAME sanctioned pattern
// as IdeasScreen's existing calcWhatIfScenario-in-a-screen-useMemo call (rule 10's
// documented exception) — this component calls the pure model function
// calcAffordabilityMax with a model-provided bundle (whatIfBundle) plus locally
// staged purchase/target ages, and renders only what the model call returns
// (result.canAfford / result.maxAmount / result.deltaYears). No arithmetic or
// comparisons on model VALUES happen here beyond that one call and branching on
// its own boolean output.

import React, { useState, useMemo } from "react";
import { HF, HM } from "./ThemeContext.jsx";
import { StepBtn } from "./fields.jsx";
import { fmt } from "./shared.jsx";
import { calcAffordabilityMax } from "../model/what-if.js";

function inputStyle(t) {
  return {
    font: `500 14px ${HM}`, color: t.ink, background: t.bg,
    border: `1.5px solid ${t.line2}`, borderRadius: 8, padding: "7px 10px", width: 90,
  };
}

function AgeControl({ t, label, value, min, max, step, onChange, isMobile }) {
  if (isMobile) {
    const clamp = v => Math.max(min, Math.min(max, v));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ font: `500 11px ${HF}`, color: t.mut }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StepBtn t={t} ariaLabel={`decrease ${label}`}
            onClick={() => onChange(clamp(value - step))} disabled={value <= min}>−</StepBtn>
          <span style={{ minWidth: 44, textAlign: "center", font: `600 15px ${HM}`, color: t.ink }}>
            {value}
          </span>
          <StepBtn t={t} ariaLabel={`increase ${label}`}
            onClick={() => onChange(clamp(value + step))} disabled={value >= max}>+</StepBtn>
        </div>
      </div>
    );
  }
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ font: `500 11px ${HF}`, color: t.mut }}>{label}</span>
      <input type="number" aria-label={label} min={min} max={max} step={step} value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        style={inputStyle(t)} />
    </label>
  );
}

// Longevity-impact chip — mirrors WhatIfPanel's Classic DeltaChip (green/positive,
// warm/negative, ∞ for a non-finite delta). Purely presentational formatting of the
// model-returned deltaYears, same precedent as fields.jsx's money()/pct() formatters.
function DeltaChip({ t, years }) {
  if (years == null) return null;
  if (!isFinite(years)) {
    return <span style={{ font: `600 12px ${HM}`, color: t.good }}>∞</span>;
  }
  const pos = years >= 0;
  return (
    <span style={{ font: `600 12px ${HM}`, color: pos ? t.good : t.warm }}>
      {pos ? "+" : ""}{years.toFixed(1)} yrs
    </span>
  );
}

export default function AffordabilityPanel({ t, whatIfBundle, affordView, isMobile }) {
  const [purchaseAge, setPurchaseAge] = useState(affordView.defaultPurchaseAge);
  const [targetAge, setTargetAge] = useState(affordView.defaultTargetAge);

  const result = useMemo(() => {
    if (!whatIfBundle) return null;
    return calcAffordabilityMax({
      ...whatIfBundle,
      purchaseAge,
      targetLifeExpectancy: targetAge,
      step: affordView.step,
    });
  }, [whatIfBundle, purchaseAge, targetAge, affordView.step]);

  const { min: purchaseMin, max: purchaseMax, step: purchaseStep } = affordView.purchaseAgeField;
  const { min: targetMin, max: targetMax, step: targetStep } = affordView.targetAgeField;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ font: `400 12px/1.5 ${HF}`, color: t.mut }}>
        Find the biggest one-time expense your plan can absorb and still last as long
        as you want.
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <AgeControl t={t} label="One-time purchase at age" value={purchaseAge}
          min={purchaseMin} max={purchaseMax} step={purchaseStep}
          onChange={setPurchaseAge} isMobile={isMobile} />
        <AgeControl t={t} label="Still sustaining to age" value={targetAge}
          min={targetMin} max={targetMax} step={targetStep}
          onChange={setTargetAge} isMobile={isMobile} />
      </div>

      {result && (
        result.canAfford ? (
          <div style={{
            background: t.surf, border: `1px solid ${t.line}`, borderRadius: 12,
            padding: "13px 15px",
          }}>
            <div style={{ font: `400 13px/1.5 ${HF}`, color: t.ink }}>
              You could spend up to{" "}
              <strong style={{ font: `700 16px ${HM}`, color: t.accent }}>
                {fmt(result.maxAmount)}
              </strong>{" "}
              at age {purchaseAge} and still last to {targetAge}.
            </div>
            <div style={{
              marginTop: 6, font: `400 12px ${HF}`, color: t.mut,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              Longevity impact: <DeltaChip t={t} years={result.deltaYears} />
            </div>
          </div>
        ) : (
          <div style={{
            background: `${t.warm}10`, border: `1px solid ${t.warm}40`, borderRadius: 12,
            padding: "13px 15px",
          }}>
            <div style={{ font: `400 13px/1.5 ${HF}`, color: t.warm }}>
              Your plan has no room for an additional expense at age {purchaseAge}
              while still sustaining to age {targetAge}.
            </div>
          </div>
        )
      )}
    </div>
  );
}
