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

// Milestone cards from the accumulation simulation: every 5th age from the next
// multiple of 5 up to retirement, plus retirement itself. Stops at the first card
// that reaches the savings target; if the target is hit between milestone ages,
// appends the exact crossing year so the user sees when they get there.
export function calcMilestones({ simData, currentAge, safeRetAge, retirementTarget }) {
  const ages = [];
  let a = Math.ceil((currentAge + 1) / 5) * 5;
  while (a <= safeRetAge) { ages.push(a); a += 5; }
  if (!ages.includes(safeRetAge)) ages.push(safeRetAge);
  ages.sort((x, y) => x - y);
  const cards = ages.map(age => {
    const row = simData.find(d => d.age === age);
    if (!row) return null;
    return { age, total: sumAccountRow(row), isRetirement: age === safeRetAge };
  }).filter(Boolean);
  const crossIdx = cards.findIndex(c => c.total >= retirementTarget);
  if (crossIdx !== -1) return cards.slice(0, crossIdx + 1);
  const crossRow = simData.find(d => sumAccountRow(d) >= retirementTarget);
  if (crossRow) {
    return [...cards, { age: crossRow.age, total: sumAccountRow(crossRow), isRetirement: false }];
  }
  return cards;
}

// Accumulation chart rows ({age, total}) from current age through retirement — the
// portfolio's growth phase, and the starting balance for the retirement walk.
// When already retired (safeRetAge === currentAge there are no accumulation years),
// seeds a single row from the current balances so the walk has a starting point.
export function buildAccumChart({ simData, safeRetAge, currentAge, bal401k, balRoth, balTaxable, balHSA }) {
  const rows = [];
  if (safeRetAge === currentAge) {
    rows.push({ age: currentAge, total: bal401k + balRoth + balTaxable + balHSA });
  }
  for (const d of simData) {
    rows.push({ age: d.age, total: sumAccountRow(d) });
    if (d.age >= safeRetAge) break;
  }
  return rows;
}
