// Shared primitives for Horizon screen components.
// Screens import fmt, fmtMo, StatCard, Btn and Pill from here.
//
// fmt/fmtMo/fmtMonthly are re-exports of the canonical formatters (2026-07-16
// "calm money" consolidation, src/formatters.js) — kept as named exports here
// so no Horizon screen import needs to change.

import React from "react";
import { HF, HM } from "./ThemeContext.jsx";
import { fmt, fmtMo, fmtMonthly } from "../formatters.js";

export { fmt, fmtMo, fmtMonthly };

// onClick (optional, WI-1.1): makes the card a door to the screen that explains
// its number. The card's natural size (~70px tall) already exceeds the 44px
// minimum touch target; minHeight guards it if padding ever shrinks.
// Keyboard activation for click-driven divs: fire on Enter/Space like a real button.
// Pair with role="button" + tabIndex={0} so a div control is keyboard-accessible.
export const kbActivate = (fn) => (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

// ── Btn / Pill — the shared interactive primitives ────────────────────────────
// Added 2026-08-03 (Horizon design review, Slice 2). Before these, EVERY button
// row in src/horizon/ was a hand-rolled inline style object, so three things had
// to be remembered independently at ~40 call sites — and weren't:
//
//   1. RESERVE THE BORDER, TOGGLE ONLY ITS COLOUR. A row mixing
//      `border: "1px solid …"` with `border: "none"` siblings gives the bordered
//      button a 2px-taller box. Under the flexbox default (`stretch`) that is
//      invisible; under `alignItems: "center"` it is not — the confirmed
//      LifeEventSheet footer bug, where the height mismatch squeezed "Cancel"
//      into wrapping on a 390px phone. Btn/Pill ALWAYS emit `1px solid <colour>`
//      and switch the colour to "transparent" for the borderless look, so
//      sibling heights are identical by construction and no author has to know.
//   2. NEVER LET A LABEL WRAP. `whiteSpace: "nowrap"` + `flexShrink: 0` — the
//      other half of the same bug (a shrinking flex row squeezing a two-word
//      label onto two lines).
//   3. HIT A REAL TOUCH TARGET. minHeight 44 (Btn) / 40 (Pill — StatCard's own
//      tier, for the denser chip/segment role). ~35 controls were under 40px.
//
// Semantics are modelled on ExploreTray's facet tab — a real
// `<button type="button">` carrying `aria-pressed` — NOT on the nav TabBar,
// which was a keyboard-unreachable `<div onClick>` (BUG-49). Copying TabBar
// would have baked that bug into every future call site permanently.
//
// `pressed` is ONE prop that drives both the visual "on" state and
// `aria-pressed`, so the two can never disagree. Leave it undefined for a plain
// action button (no `aria-pressed` attribute is emitted at all).

// Text on a filled accent button. This USED to be a hardcoded "#fff", justified
// by "every accent in PALETTES is a mid-tone that white reads against in both
// modes" — which measurement disproved (BUG-112): white on a dark-mode accent
// ran 1.76–3.01:1, because dark-mode accents are deliberately light (they are
// text on a dark ground). `onAccent` is now a real palette token that each
// palette/mode picks for itself, and `palette-contrast.test.js` holds all 12 to
// 4.5:1. The `?? "#fff"` is a defensive fallback for a hand-built theme object
// in a test that predates the token, not a live path.
const onAccent = (t) => t.onAccent ?? "#fff";

const BTN_SIZES = {
  md: { padding: "10px 16px", fontSize: 13,   radius: 9 },
  sm: { padding: "8px 13px",  fontSize: 12.5, radius: 8 },
};

// variant → the three colours + weight, given the theme and the pressed state.
// Every branch returns a real `border` colour (never "none"): see note 1 above.
// `hue` is the resolved tint token (t.accent unless the call site named another,
// e.g. LifeEventSheet's warm "Money out" / good "Money in" segments).
function btnSkin(t, variant, on, hue) {
  switch (variant) {
    // Filled call-to-action. Border matches the fill so the 1px is reserved
    // and invisible rather than absent.
    case "primary": return { bg: hue, border: hue, fg: onAccent(t), weight: 600 };
    // Link-like / low-chrome. Border reserved but transparent.
    case "ghost":   return { bg: "transparent", border: "transparent", fg: t.mut, weight: 500 };
    // A segment inside a track (`background: t.line` + small padding) — the
    // Numbers tab strip, the arc's view toggle, Settings' theme/arc rows.
    case "seg":     return on
      ? { bg: t.surf2, border: t.line2, fg: t.ink, weight: 600 }
      : { bg: "transparent", border: "transparent", fg: t.mut, weight: 500 };
    // Default: an outlined control that tints when on (ExploreTray's facet tab).
    default:        return on
      ? { bg: `${hue}16`, border: hue, fg: t.ink, weight: 600 }
      : { bg: "transparent", border: t.line2, fg: t.mut, weight: 500 };
  }
}

export function Btn({
  t, children, onClick,
  variant = "quiet",     // "primary" | "quiet" | "ghost" | "seg"
  size = "md",           // "md" | "sm"
  tint = "accent",       // theme-token NAME for the "on"/filled hue
  tone,                  // theme-token NAME overriding the TEXT colour only
  pressed,               // undefined = plain action; boolean = toggle (drives aria-pressed too)
  disabled = false,
  full = false,          // stretch to the row's width
  // Opt OUT of invariant 2, for full-width segments in a `flex: 1` row ONLY.
  // Safe there and nowhere else: every segment in such a row is the same width
  // and the row keeps the flexbox `stretch` default, so a two-line label makes
  // ALL segments two lines — heights stay identical, which is the property the
  // invariant exists to protect. In an `alignItems: "center"` action row
  // (LifeEventSheet's footer, the original bug) it would reintroduce the bug.
  wrap = false,
  ariaLabel, ariaExpanded, title,
  style,                 // per-call-site layout only (flex, margin, width) — not colours
}) {
  const on = pressed === true;
  const sz = BTN_SIZES[size] ?? BTN_SIZES.md;
  const skin = btnSkin(t, variant, on, t[tint] ?? t.accent);
  const fg = tone && t[tone] ? t[tone] : skin.fg;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : on}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      title={title}
      style={{
        // ── invariants (never overridable per call site) ──
        minHeight: 44,
        whiteSpace: wrap ? "normal" : "nowrap",
        flexShrink: 0,
        border: `1px solid ${skin.border}`,
        boxSizing: "border-box",
        // ── shape ──
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: sz.padding, borderRadius: sz.radius,
        textAlign: "center", lineHeight: 1.25,
        width: full ? "100%" : undefined,
        // ── skin ──
        background: skin.bg,
        font: `${skin.weight} ${sz.fontSize}px ${HF}`,
        color: fg,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background .12s, border-color .12s",
        ...style,
      }}>
      {children}
    </button>
  );
}

// The compact sibling: a chip/pill (radius 999) for preset lists, quick-set
// chips, jump links, and activity choices. Same three invariants as Btn; the
// only differences are the radius and the 40px tier (StatCard's convention),
// which keeps a dense wrapped chip row from becoming a wall of 44px blocks.
export function Pill({
  t, children, onClick,
  pressed, disabled = false, tone,
  ariaLabel, title, style,
}) {
  const on = pressed === true;
  const fg = tone && t[tone] ? t[tone] : (on ? t.accent : t.mut);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : on}
      aria-label={ariaLabel}
      title={title}
      style={{
        minHeight: 40,
        whiteSpace: "nowrap",
        flexShrink: 0,
        border: `1px solid ${on ? t.accent : t.line2}`,
        boxSizing: "border-box",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "7px 14px", borderRadius: 999,
        background: on ? `${t.accent}18` : "transparent",
        font: `${on ? 600 : 400} 12.5px ${HF}`,
        color: fg,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background .12s, border-color .12s",
        ...style,
      }}>
      {children}
    </button>
  );
}

export function StatCard({ t, label, value, accent, warm, large, onClick, sub }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? kbActivate(onClick) : undefined}
      style={{
        flex: 1,
        // A grid/flex item's default `min-width: auto` is its CONTENT width, so
        // a card whose label doesn't fit pushes its whole track wider and the
        // row overflows instead of the label wrapping. Every StatCard sits in a
        // `1fr`-track grid, so this belongs here once rather than at each call
        // site — needed the moment a label got longer than "Retire at"
        // ("Guaranteed for life", "Spending each month"). `boxSizing` keeps the
        // 15px padding + 1px border inside that track.
        minWidth: 0, boxSizing: "border-box",
        background: warm ? `${t.warm}12` : t.surf,
        border: `1px solid ${warm ? `${t.warm}40` : t.line}`,
        borderRadius: 13, padding: 15,
        cursor: onClick ? "pointer" : "default",
        minHeight: onClick ? 44 : undefined,
      }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 6,
        font: `500 11px ${HF}`, color: warm ? t.warm : t.mut, marginBottom: 9
      }}>
        {/* Wraps to a second line rather than overflowing the card; the chevron
            keeps its own width (flexShrink: 0 below). */}
        <span style={{ minWidth: 0 }}>{label}</span>
        {onClick && <span style={{ font: `400 13px ${HF}`, color: t.faint, flexShrink: 0 }}>›</span>}
      </div>
      <div style={{
        font: `500 ${large ? 26 : 23}px ${HM}`,
        color: accent, letterSpacing: "-0.01em"
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ font: `400 11px ${HF}`, color: t.mut, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
