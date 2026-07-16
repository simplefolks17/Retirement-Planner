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
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a < 1_000) return `${sign}$${Math.round(a)}`;
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
  const r = Math.round(n);
  const sign = r < 0 ? "−" : "";
  return `${sign}$${Math.abs(r).toLocaleString("en-US")}`;
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
  const r = Math.round(m / 100) * 100;
  const sign = r < 0 ? "−" : "";
  return `${sign}$${Math.abs(r).toLocaleString("en-US")}`;
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
