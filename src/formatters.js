export const fmt    = (n) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${Math.round(n)}`;
export const fmtPct = (n) => `${n.toFixed(1)}%`;
