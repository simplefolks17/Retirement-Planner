import { useState, useRef } from "react";
import { clamp } from "../model/finance-math.js";

// Draft locally, clamp to [min, max] and commit on blur/Enter only — an intermediate keystroke
// value (typing "6" on the way to "65") never reaches committed state. Optional `placeholder`
// and `ariaLabel` pass straight through to the <input>.
export function DeferredInput({ value, min = -Infinity, max = Infinity, onChange, style, placeholder, ariaLabel }) {
  const [local,   setLocal]   = useState(String(value));
  const [focused, setFocused] = useState(false);
  const prev = useRef(value);

  if (prev.current !== value) {
    prev.current = value;
    const parsed = parseInt(local.replace(/,/g, ""), 10);
    if (isNaN(parsed) || parsed !== value) setLocal(String(value));
  }

  const commit = () => {
    const n = parseInt(local.replace(/,/g, ""), 10);
    if (!isNaN(n)) {
      const clamped = clamp(n, min, max);
      onChange(clamped);
      setLocal(String(clamped));
    } else {
      setLocal(String(value));
    }
    setFocused(false);
  };

  const display = focused ? local : Number(local.replace(/,/g, "") || value).toLocaleString();

  return (
    <input
      type="text" inputMode="numeric" value={display}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { setFocused(true); setLocal(local.replace(/,/g, "")); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={style}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}
