// ── Flow-Down waterfall decomposition (pure) ────────────────────────────────
//
// Consumes the rows of the ONE shared retirement walk (buildRetirementDrawdown)
// — each row carries draw / tax / growth — so every figure here is a TRUE sum,
// never a balancing plug. That is the structural fix for BUG-31: previously the
// waterfall re-derived draws separately and computed "growth" as the residual
// that made the column balance, which silently absorbed taxes the chart never
// subtracted. Now growth = Σ(balStart·rReal) directly, and because the chart
// subtracts the same taxes, the bars reconcile by the walk's conservation law
// (start + growth − draws − tax = end).
//
// Accumulation bridge (Facet A): BUG-35 — balances are now GROSS everywhere (the
// engine taxes withdrawals year-by-year), so the start balance, contributions, and
// totalAtRet are all gross. "Investment Growth" = the true gross residual; no tax
// haircut is applied to any node, so the bridge reconciles in one consistent unit.
export function calcFlowDown({
  bal401k, balRoth, balTaxable, balHSA,
  contribRows,                  // simData rows with c401k/cRoth/cTaxable/cHSA (age <= safeRetAge)
  totalAtRet,
  walkRows,                     // buildRetirementPhase(...).rows  (the shared source of truth)
  depletionAge,                 // buildRetirementPhase(...).depletionAge
  accumChart = [],              // [{age,total}] accumulation rows (for the peak)
  conversionWindowYrs,
  totalConverted = 0,
  safeRetAge, safeLifeExp, rmdStartAge,
}) {
  // Accumulation bridge — all three nodes in GROSS units.
  const startPortfolio = bal401k + balRoth + balTaxable + balHSA;
  const totalContrib = contribRows.reduce((s, d) =>
    s + (d.c401k || 0) + (d.cRoth || 0) + (d.cTaxable || 0) + (d.cHSA || 0), 0);
  const totalGrowth = Math.max(0, totalAtRet - startPortfolio - totalContrib);

  // Retirement phases — split the shared walk rows at RMD start.
  const hasConvWindow = conversionWindowYrs > 0;
  const convRows = hasConvWindow ? walkRows.filter(r => r.age <  rmdStartAge) : [];
  const distRows = hasConvWindow ? walkRows.filter(r => r.age >= rmdStartAge) : walkRows;

  const sumDraw   = rs => Math.round(rs.reduce((s, r) => s + r.draw,   0));
  const sumTax    = rs => Math.round(rs.reduce((s, r) => s + r.tax,    0));
  const sumGrowth = rs => Math.round(rs.reduce((s, r) => s + r.growth, 0));

  const convWindowDraws  = sumDraw(convRows);
  const convWindowTax    = sumTax(convRows);    // conversion tax actually charged to the pool
  const convWindowGrowth = sumGrowth(convRows); // TRUE investment return

  const portPreRMD = hasConvWindow
    ? (convRows.length ? convRows[convRows.length - 1].total : totalAtRet)
    : totalAtRet;

  const distStartAge = hasConvWindow ? rmdStartAge : safeRetAge;
  const distStartVal = portPreRMD;
  const distEndVal   = walkRows.length ? walkRows[walkRows.length - 1].total : totalAtRet;
  const distDraws    = sumDraw(distRows);
  const distRMDTax   = sumTax(distRows);        // RMD tax actually charged in the dist phase
  const distGrowth   = sumGrowth(distRows);     // TRUE investment return
  const actualSustainedYrs = distRows.length;
  const distYears    = Math.max(0, (depletionAge ?? safeLifeExp) - distStartAge);

  const peakPortfolio = Math.max(
    startPortfolio, totalAtRet,
    ...accumChart.map(d => d.total),
    ...walkRows.map(r => r.total),
  );

  return {
    startPortfolio, totalContrib, totalGrowth, totalAtRet,
    hasConvWindow, conversionWindowYrs, portPreRMD,
    convWindowDraws, convWindowTax, convWindowGrowth, totalConverted,
    distStartAge, distStartVal, distEndVal, distYears,
    distDraws, distRMDTax, distGrowth, depletionAge, actualSustainedYrs,
    peakPortfolio,
  };
}
