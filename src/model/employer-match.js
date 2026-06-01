// Returns annual employer match amount.
// flat mode: match = salary × employerMatchPct%
// formula mode: match = min(employeeContrib, salary × matchFormulaCap%) × matchFormulaRate%
//   e.g. "50% of the first 6% of salary" = min(contrib, salary * 6%) * 50%
export function calcEmployerMatch(salary, employeeContrib, {
  matchMode,
  matchFormulaCap,
  matchFormulaRate,
  employerMatchPct,
}) {
  if (matchMode === "formula") {
    const matchableContrib = Math.min(employeeContrib, salary * matchFormulaCap / 100);
    return Math.round(matchableContrib * matchFormulaRate / 100);
  }
  return Math.round(salary * employerMatchPct / 100);
}
