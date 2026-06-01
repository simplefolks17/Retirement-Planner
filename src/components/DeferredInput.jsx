import { useState, useRef } from "react";

export function DeferredInput({ value, min, max, onChange, style }) {
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
      const clamped = Math.min(max, Math.max(min, n));
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
    />
  );
}
