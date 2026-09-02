// Horizon design-token system.
// Ported from docs/design-handoff/…/handoff/design-tokens.ts — plain JS, no TS needed.
// Provides React context + useTheme() hook with localStorage persistence.

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// ── Contrast contract (BUG-112, 2026-08-13) ──────────────────────────────────
// Every text token below is measured against EVERY background it can land on
// (bg, surf AND surf2 — a token used on three grounds has to clear its bar on
// the worst of them, not just the one it was eyeballed against), by
// `palette-contrast.test.js`, for all 6 palettes × 2 modes. The bars:
//
//   ink            ≥ 7.0:1   primary text (AAA — it was already there)
//   mut            ≥ 5.5:1   secondary text: every 11px card label
//   faint          ≥ 4.5:1   tertiary text: hints, axis ticks, table zero-cells
//   accent         ≥ 4.5:1   used as TEXT at 60 sites, not just as a fill
//   good / warm    ≥ 4.5:1   real dollar figures at 11px bold (the Income Meter)
//   onAccent       ≥ 4.5:1   against `accent` — the filled-CTA label
//
// `mut` deliberately gets a HIGHER bar than `faint` rather than both sitting on
// 4.5: solving both to the same bar collapses the ink > mut > faint ladder the
// palettes are designed around (in the first pass `faint` came out *darker*
// than `mut` in Apricot). 5.5/4.5 keeps a visible step under compliance.
//
// `faint` is held to the full 4.5 text bar, NOT the 3:1 large-text/non-text-UI
// bar, even though a couple of its ~80 call sites are decorative (StatCard's
// chevron, one dashed SVG gridline): 75 of them are real informational text —
// including dollar figures in the year-by-year table — so a single 4.5 bar is
// both correct for the overwhelming majority and the version a future author
// cannot apply to the wrong site.
//
// Adjustments hold each token's HUE constant (HSL hue+saturation fixed, lightness
// searched) so every palette still reads as itself — Apricot's accent is a deeper
// terracotta, not a generic dark red.
//
// `onAccent` (added here) is the label colour for a filled-accent CTA. It exists
// because no single literal works: light-mode accents are mid-tones that white
// reads against, but dark-mode accents are deliberately LIGHT (they are text on a
// dark ground, 5–8.5:1) and white on them measured 1.76–3.01:1. Dark-mode
// `onAccent` is the palette's own `bg`, so the CTA label stays in-family.
export const PALETTES = {
  apricot: {
    name: "Apricot", swatch: "#cd6f4f",
    light: { bg:"#f7efe6", surf:"#fffbf5", surf2:"#f7ede1", line:"#efe3d4", line2:"#e4d3be",
             ink:"#3a3027",  mut:"#695d51",  faint:"#7b6951", accent:"#ad5131", warm:"#9c5d1d", good:"#587353", onAccent:"#ffffff" },
    dark:  { bg:"#231c18", surf:"#2e2620", surf2:"#372d26", line:"#43382f", line2:"#574a3f",
             ink:"#f1e7dc",  mut:"#b4a698",  faint:"#9e9589", accent:"#e8896b", warm:"#ecab68", good:"#93b58c", onAccent:"#231c18" },
  },
  honey: {
    name: "Honey", swatch: "#d9a32b",
    // Honey's accent sits at 5.65:1 rather than the 4.5 bar the other five use.
    // Its accent and warm are the same gold hue, so solving both to 4.5 landed
    // them one hex digit apart (#8a6717 vs #8b6714) and erased the distinction
    // between "brand/interactive" and "attention". Deepening the accent to bronze
    // restores a visible two-step without leaving the honey family.
    light: { bg:"#f8f2df", surf:"#fffdf4", surf2:"#f7efd9", line:"#efe6cb", line2:"#e6d6ad",
             ink:"#39331f",  mut:"#675f48",  faint:"#786c46", accent:"#785914", warm:"#8b6714", good:"#627243", onAccent:"#ffffff" },
    dark:  { bg:"#211d10", surf:"#2c2715", surf2:"#34301b", line:"#403a22", line2:"#544c2e",
             ink:"#f3ecd6",  mut:"#b6ab8a",  faint:"#a09778", accent:"#e8be4e", warm:"#ecc764", good:"#a8bd72", onAccent:"#211d10" },
  },
  blush: {
    name: "Blush", swatch: "#cf6f88",
    light: { bg:"#f9edee", surf:"#fffaf9", surf2:"#f8e6e8", line:"#f0dadc", line2:"#e7c4c9",
             ink:"#3a2c2e",  mut:"#6a585c",  faint:"#875f65", accent:"#b83d5d", warm:"#ad4d22", good:"#41735e", onAccent:"#ffffff" },
    dark:  { bg:"#241a1c", surf:"#2f2326", surf2:"#37292d", line:"#433036", line2:"#573e46",
             ink:"#f3e3e6",  mut:"#b8a0a6",  faint:"#a08f96", accent:"#e88aa0", warm:"#e8a585", good:"#73bb9d", onAccent:"#241a1c" },
  },
  sage: {
    name: "Sage", swatch: "#5f8a64",
    light: { bg:"#edf1ea", surf:"#fafdf7", surf2:"#eef3e9", line:"#e2e8dd", line2:"#cdd8c6",
             ink:"#2d332b",  mut:"#5a6252",  faint:"#657159", accent:"#517555", warm:"#a45a1f", good:"#53754f", onAccent:"#ffffff" },
    // dark good was byte-identical to accent (#84ad7c) — a reader couldn't
    // distinguish an interactive accent from a positive dollar figure in this
    // one palette/mode (the same collision class Honey's accent-vs-warm fix
    // addressed, deepening accent to bronze there). Sage's own brand hue is
    // green, so accent stays put; good shifts toward the teal-leaning green
    // the other five palettes already use for it (Slate #7fb0a4, Blush
    // #73bb9d, Periwinkle #6fc6a6) — a small, on-brand hue shift (dE ≈ 10.3
    // from accent, still clearing 4.5:1 on bg/surf/surf2), not a new hue.
    dark:  { bg:"#181e19", surf:"#222a23", surf2:"#2a332b", line:"#354036", line2:"#475448",
             ink:"#e8efe5",  mut:"#a3b09d",  faint:"#919b8c", accent:"#84ad7c", warm:"#e3a672", good:"#7ab894", onAccent:"#181e19" },
  },
  periwinkle: {
    name: "Periwinkle", swatch: "#6f7bd6",
    light: { bg:"#ecedf7", surf:"#fafbff", surf2:"#f0f1fb", line:"#e0e2f1", line2:"#ccd0e8",
             ink:"#2f3142",  mut:"#595e71",  faint:"#626a90", accent:"#5361ce", warm:"#c5315b", good:"#357761", onAccent:"#ffffff" },
    dark:  { bg:"#1b1d2a", surf:"#252839", surf2:"#2e3145", line:"#383c54", line2:"#4a4f6d",
             ink:"#e7e9f5",  mut:"#a6abc4",  faint:"#9599ad", accent:"#8f9bee", warm:"#e6a9c8", good:"#6fc6a6", onAccent:"#1b1d2a" },
  },
  slate: {
    name: "Slate", swatch: "#5a738f",
    light: { bg:"#eef1f4", surf:"#fbfcfe", surf2:"#eef2f6", line:"#e1e6ec", line2:"#cdd5de",
             ink:"#2b3138",  mut:"#5a616a",  faint:"#626f7e", accent:"#57708b", warm:"#a45a2c", good:"#517568", onAccent:"#ffffff" },
    dark:  { bg:"#161a1f", surf:"#1f242b", surf2:"#262d35", line:"#323a44", line2:"#445063",
             ink:"#e6ebf1",  mut:"#a0abb8",  faint:"#8b949f", accent:"#7d97b6", warm:"#e0a87e", good:"#7fb0a4", onAccent:"#161a1f" },
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
