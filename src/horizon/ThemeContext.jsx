// Horizon design-token system.
// Ported from docs/design-handoff/…/handoff/design-tokens.ts — plain JS, no TS needed.
// Provides React context + useTheme() hook with localStorage persistence.

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export const PALETTES = {
  apricot: {
    name: "Apricot", swatch: "#cd6f4f",
    light: { bg:"#f7efe6", surf:"#fffbf5", surf2:"#f7ede1", line:"#efe3d4", line2:"#e4d3be",
             ink:"#3a3027",  mut:"#8c7d6c",  faint:"#b6a690", accent:"#cd6f4f", warm:"#df9a52", good:"#7a9b74" },
    dark:  { bg:"#231c18", surf:"#2e2620", surf2:"#372d26", line:"#43382f", line2:"#574a3f",
             ink:"#f1e7dc",  mut:"#b4a698",  faint:"#83786b", accent:"#e8896b", warm:"#ecab68", good:"#93b58c" },
  },
  honey: {
    name: "Honey", swatch: "#d9a32b",
    light: { bg:"#f8f2df", surf:"#fffdf4", surf2:"#f7efd9", line:"#efe6cb", line2:"#e6d6ad",
             ink:"#39331f",  mut:"#897f60",  faint:"#b8ac85", accent:"#cf9a22", warm:"#e6b84e", good:"#8aa15f" },
    dark:  { bg:"#211d10", surf:"#2c2715", surf2:"#34301b", line:"#403a22", line2:"#544c2e",
             ink:"#f3ecd6",  mut:"#b6ab8a",  faint:"#857c5e", accent:"#e8be4e", warm:"#ecc764", good:"#a8bd72" },
  },
  blush: {
    name: "Blush", swatch: "#cf6f88",
    light: { bg:"#f9edee", surf:"#fffaf9", surf2:"#f8e6e8", line:"#f0dadc", line2:"#e7c4c9",
             ink:"#3a2c2e",  mut:"#8c7479",  faint:"#bb9ea2", accent:"#cf6f88", warm:"#e6a081", good:"#6fae93" },
    dark:  { bg:"#241a1c", surf:"#2f2326", surf2:"#37292d", line:"#433036", line2:"#573e46",
             ink:"#f3e3e6",  mut:"#b8a0a6",  faint:"#86727a", accent:"#e88aa0", warm:"#e8a585", good:"#73bb9d" },
  },
  sage: {
    name: "Sage", swatch: "#5f8a64",
    light: { bg:"#edf1ea", surf:"#fafdf7", surf2:"#eef3e9", line:"#e2e8dd", line2:"#cdd8c6",
             ink:"#2d332b",  mut:"#7a856f",  faint:"#a8b29d", accent:"#5f8a64", warm:"#e3a06a", good:"#6f9b6a" },
    dark:  { bg:"#181e19", surf:"#222a23", surf2:"#2a332b", line:"#354036", line2:"#475448",
             ink:"#e8efe5",  mut:"#a3b09d",  faint:"#74806f", accent:"#84ad7c", warm:"#e3a672", good:"#84ad7c" },
  },
  periwinkle: {
    name: "Periwinkle", swatch: "#6f7bd6",
    light: { bg:"#ecedf7", surf:"#fafbff", surf2:"#f0f1fb", line:"#e0e2f1", line2:"#ccd0e8",
             ink:"#2f3142",  mut:"#7a7f96",  faint:"#a6abc2", accent:"#6f7bd6", warm:"#e69bb0", good:"#5fb89a" },
    dark:  { bg:"#1b1d2a", surf:"#252839", surf2:"#2e3145", line:"#383c54", line2:"#4a4f6d",
             ink:"#e7e9f5",  mut:"#a6abc4",  faint:"#767b96", accent:"#8f9bee", warm:"#e6a9c8", good:"#6fc6a6" },
  },
  slate: {
    name: "Slate", swatch: "#5a738f",
    light: { bg:"#eef1f4", surf:"#fbfcfe", surf2:"#eef2f6", line:"#e1e6ec", line2:"#cdd5de",
             ink:"#2b3138",  mut:"#76808b",  faint:"#a4adb8", accent:"#5a738f", warm:"#d99a72", good:"#6f9b8a" },
    dark:  { bg:"#161a1f", surf:"#1f242b", surf2:"#262d35", line:"#323a44", line2:"#445063",
             ink:"#e6ebf1",  mut:"#a0abb8",  faint:"#737e8b", accent:"#7d97b6", warm:"#e0a87e", good:"#7fb0a4" },
  },
};

export const HF = "'DM Sans', system-ui, sans-serif";
export const HM = "'IBM Plex Mono', ui-monospace, monospace";
export const HD = "'Newsreader', Georgia, serif";

const ThemeCtx = createContext(null);

const isBrowser = typeof window !== "undefined";

export function safeGet(key) {
  try { return isBrowser ? (localStorage.getItem(key) ?? null) : null; } catch { return null; }
}
export function safeSet(key, val) {
  try { if (isBrowser) localStorage.setItem(key, val); } catch { /* noop */ }
}

function resolveMode(pref) {
  if (pref === "auto") {
    try { return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
    catch { return "light"; }
  }
  return pref;
}

export function HorizonThemeProvider({ children }) {
  const [palKey, setPalKeyRaw] = useState(
    () => safeGet("hz-palette") || "apricot"
  );
  const [modePref, setModePrefRaw] = useState(
    () => safeGet("hz-mode") || "light"
  );
  const [arcStyle, setArcStyleRaw] = useState(
    () => safeGet("hz-arc-style") || "soft"
  );

  const setPalKey = useCallback((k) => {
    setPalKeyRaw(k);
    safeSet("hz-palette", k);
  }, []);

  const setModePref = useCallback((m) => {
    setModePrefRaw(m);
    safeSet("hz-mode", m);
  }, []);

  const setArcStyle = useCallback((s) => {
    setArcStyleRaw(s);
    safeSet("hz-arc-style", s);
  }, []);

  // When following the OS ("auto"), re-resolve if the system theme changes mid-session
  // (resolveMode only snapshots at render time, so we need a listener to force one).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (modePref !== "auto" || !isBrowser) return;
    let mq;
    try { mq = window.matchMedia("(prefers-color-scheme: dark)"); } catch { return; }
    if (!mq?.addEventListener) return;
    const onChange = () => forceTick((n) => n + 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [modePref]);

  const resolvedMode = resolveMode(modePref);
  const pal = PALETTES[palKey] ?? PALETTES.apricot;
  const t = pal[resolvedMode];

  return (
    <ThemeCtx.Provider value={{ t, palKey, setPalKey, modePref, setModePref, resolvedMode, arcStyle, setArcStyle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
