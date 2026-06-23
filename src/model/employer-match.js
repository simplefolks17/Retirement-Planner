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
  const safeSalary  = Math.max(0, salary);          // negative inputs can't produce a negative match
  const safeContrib = Math.max(0, employeeContrib);
  if (matchMode === "formula") {
    const matchableContrib = Math.min(safeContrib, safeSalary * matchFormulaCap / 100);
    return Math.round(matchableContrib * matchFormulaRate / 100);
  }
  return Math.round(safeSalary * employerMatchPct / 100);
}
