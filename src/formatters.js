// Currency abbreviation. Preserves the sign for negatives (then abbreviates the
// magnitude) and maps non-finite inputs (NaN/Infinity) to "$0" so a bad upstream
// value can never render as "$NaN".
export const fmt = (n) => {
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  return a >= 1_000_000 ? `${sign}$${(a / 1_000_000).toFixed(2)}M`
       : a >= 1_000     ? `${sign}$${(a / 1_000).toFixed(0)}K`
       : `${sign}$${Math.round(a)}`;
};
export const fmtPct = (n) => Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
