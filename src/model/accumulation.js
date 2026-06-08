// Accumulation-phase projections derived from the simulation rows (simData).
// All pure: simData rows in, plain values out. No React, no IRS constants here
// (the rows already carry computed balances).

// Sum the four account balances on a single chart/sim row. The rows consumed here
// are App-augmented simData rows that carry a "Trad 401k" key (added after
// runSimulation from tradGross); missing keys coalesce to 0 so partial rows
// (e.g. the currentSnapshot fallback) total correctly.
export function sumAccountRow(row) {
  return (row["Trad 401k"] ?? 0) + (row["Roth IRA"] ?? 0)
       + (row["Taxable"]   ?? 0) + (row["HSA"]       ?? 0);
}
