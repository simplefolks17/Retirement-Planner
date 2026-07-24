// The ONE money-formatting module (2026-07-16 "calm money" consolidation).
// Every screen/component that renders a dollar figure imports from here —
// no file outside this one builds a `$${...}` template literal (enforced by
// the source-scan guard test in src/__tests__/formatters.test.js). Dependency-
// free: this file imports nothing, so src/model/ (which must stay import-free
// of src/horizon/) can safely import it too.
//
// Two tiers, by design (rule 10 / CLAUDE.md):
//   - fmt / fmtSigned / fmtMo — CALM, abbreviated, for headline stats, card
//     values, and anywhere the model DERIVES a number for at-a-glance display.
//   - fmtFull / fmtMonthly — FULL PRECISION, for editable-input readouts
//     (sliders, DetailField) and detail/ledger tables (Statement tab, the
//     Classic sliders) where the exact figure matters.
// Missing data is never fabricated as $0 (rule 10): null/undefined/non-finite
// always renders "—".

// fmt(n) — calm abbreviated money, sign-aware.
//   |n| < 1000    -> "$980"
//   |n| < 1e6     -> "$118k"  (nearest k; 999,600 rounds to 1000k -> promoted
//                    to the M branch so it never displays as "$1000k")
//   |n| >= 1e6    -> "$1.2M"  (1 decimal; trimmed to "$4M" when the decimal
//                    rounds to 0)
// Negative values get a U+2212 (minus sign) prefix before the $, never an
// ASCII hyphen: "−$118k".
export function fmt(n) {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a < 1_000) {
    // Sign only when the ROUNDED magnitude is nonzero — fmt(-0.4) is "$0",
    // never "−$0". (Rounding |n| also keeps halves symmetric: ±1.5 → ±$2.)
    const r = Math.round(a);
    return `${n < 0 && r > 0 ? "−" : ""}$${r}`;
  }
  const sign = n < 0 ? "−" : "";
  if (a < 1_000_000) {
    const k = Math.round(a / 1_000);
    if (k >= 1_000) return `${sign}$${(k / 1_000).toFixed(1).replace(/\.0$/, "")}M`;
    return `${sign}$${k}k`;
  }
  const m = a / 1_000_000;
  const mStr = m.toFixed(1).replace(/\.0$/, "");
  return `${sign}$${mStr}M`;
}

// fmtFull(n) — sign-aware whole-dollar figure with commas: "$1,240,000",
// "−$9,854". ONLY for editable-input readouts (sliders, DetailField) and
// detail/ledger tables (Statement tab, Classic sliders) — never for a
// headline stat, which should read calm via fmt().
export function fmtFull(n) {
  if (!Number.isFinite(n)) return "—";
  // Round the ABSOLUTE value (Math.round on a signed value rounds halves
  // toward +∞, making ±X.5 asymmetric), and sign only a nonzero result.
  const r = Math.round(Math.abs(n));
  const sign = n < 0 && r > 0 ? "−" : "";
  return `${sign}$${r.toLocaleString("en-US")}`;
}

// fmtSigned(d) — a signed calm DELTA: "+$22k" / "−$60k" / "+$500". Always
// carries an explicit sign (even for +0 -> "+$0"), unlike fmt() which only
// signs negatives. Use for before/after deltas, never for a plain value.
export function fmtSigned(d) {
  if (!Number.isFinite(d)) return "—";
  // fmt() of a non-negative magnitude never carries its own sign, so we can
  // just prepend the delta's sign to the abbreviated magnitude untouched.
  const magnitude = fmt(Math.abs(d));
  return (d < 0 ? "−" : "+") + magnitude;
}

// fmtMonthly(m) — an ALREADY-monthly value, rounded to the nearest $100, full
// commas: "$5,200". Monthly figures stay full-dollar (abbreviating to
// "$5k/mo" loses too much) but never show stray odd dollars. null/non-finite
// -> "—".
export function fmtMonthly(m) {
  if (!Number.isFinite(m)) return "—";
  // Same symmetry/no-−$0 rules as fmtFull, at $100 granularity.
  const r = Math.round(Math.abs(m) / 100) * 100;
  const sign = m < 0 && r > 0 ? "−" : "";
  return `${sign}$${r.toLocaleString("en-US")}`;
}

// fmtMo(annual) — an annual value, converted to monthly then fmtMonthly'd.
export function fmtMo(annual) {
  if (!Number.isFinite(annual)) return "—";
  return fmtMonthly(annual / 12);
}

// fmtPct(n, dp = 1) — "3.4%"; "—" for non-finite. dp keeps the existing
// default of 1 decimal place but lets callers ask for more/fewer.
export function fmtPct(n, dp = 1) {
  return Number.isFinite(n) ? `${n.toFixed(dp)}%` : "—";
}

// fmtRate(fraction, dp = 1) — a FRACTIONAL rate (0.237 → "23.7%"). Counterpart to
// fmtPct for the OTHER unit convention: some scalars are fractions (0.24 = 24%),
// others already whole percents (15.3 = 15.3%). Does the ×100 so no call site has
// to remember which. Computed/blended rates render dp=1 (fmtRate(x)); statutory
// brackets dp=0 (fmtRate(x, 0) → "24%"). "—" for non-finite. NOTE: fmtRate(0) is
// "0.0%", so a site needing a bare "0%" keeps its own `x === 0 ? "0%"` case.
export function fmtRate(fraction, dp = 1) {
  return Number.isFinite(fraction) ? fmtPct(fraction * 100, dp) : "—";
}
