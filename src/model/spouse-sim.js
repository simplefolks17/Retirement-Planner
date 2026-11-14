// The spouse's own accumulation sim input + the primary-frame "spouse income ends"
// cutoff — ONE builder each, shared by App.jsx (the committed plan) and what-if.js
// (both scenario re-sims). Pure functions; no React state (rule 6).
//
// WHY THIS EXISTS (BUG-157 / BUG-158). Both quantities depend on the PRIMARY's
// retirement age whenever `spouseRetirementAge` is null ("auto" — the spouse retires the
// same calendar year as the primary): the spouse's contribution end follows it, and so
// does the cutoff after which the spouse's wages stop counting in the primary's MAGI.
// App.jsx used to build them inline from its own already-RESOLVED values and the
// scenario code reused those frozen results, so a work-longer preview modelled a spouse
// whose contributions stopped / whose MAGI cutoff sat at the BASE plan's age (the
// BUG-127/BUG-134/BUG-138 class: two implementations of one derivation drift). Now both
// callers pass RAW inputs and the derivation lives only here.
import { runSimulation } from "./simulation.js";
import { plateauAgeInFrame } from "./income-growth.js";
import { resolveSpouseRetAge, primaryAgeAt, spouseAgeAt } from "./retirement-phase.js";
import { HSA_LIMIT_2026, HSA_FAMILY_LIMIT_2026 } from "../config/irs-2026.js";

// HSA family HDHP limit is a SHARED household ceiling (rule 4): under 'self' each person
// keeps the self-only cap; under 'family' the primary draws first and the spouse gets the
// rest. (Moved here verbatim from App.jsx so the scenario path uses the same split.)
export function spouseHsaLimitFor(hsaCoverageType, primaryContribHSA) {
  return hsaCoverageType === "family"
    ? Math.max(0, HSA_FAMILY_LIMIT_2026 - Math.min(primaryContribHSA, HSA_FAMILY_LIMIT_2026))
    : HSA_LIMIT_2026;
}

// The PRIMARY's age in the calendar year the SPOUSE retires (inclusive — income counts
// THROUGH the retirement year, matching contribEnd*'s `age <= end`). null with no spouse.
// Takes the RAW spouseRetirementAge + the primary retirement age in play, so a scenario
// resolves "auto" against ITS OWN retirement age.
export function resolveSpouseIncomeEndAge({
  hasSpouse, currentAge, spouseCurrentAge, spouseRetirementAge, primaryRetAge, lifeExp,
}) {
  if (!hasSpouse) return null;
  return primaryAgeAt(currentAge, spouseCurrentAge,
    resolveSpouseRetAge({ spouseRetirementAge, primaryRetAge, spouseCurrentAge, lifeExp }));
}

// The exact runSimulation argument for the spouse's own accumulation sim. It mirrors the
// primary's call with the spouse's own age/income/accounts/match terms; the primary's
// salary rides in the "other earner" slot so MFJ combined-income math inside
// runSimulation sees the same household income the primary sim does (rule 9). Money
// events and conversion events are primary/household-modelled only (never run here).
//   primaryRetAge        — the primary's retirement age IN PLAY (base plan or scenario)
//   spouseRetirementAge  — RAW (null = auto)
export function buildSpouseSimInput({
  totalYears, currentAge, currentIncome, incomeGrowth, incomeGrowthEndAge, filingStatus,
  returnRate, primaryContribHSA, hsaCoverageType,
  primaryRetAge, spouseRetirementAge, lifeExp,
  spouseCurrentAge, spouseIncome, spouseIncomeGrowth,
  spouseBal401k, spouseBalRoth, spouseBalTaxable, spouseBalHSA,
  spouseContrib401k, spouseContribRoth, spouseContribTaxable, spouseContribHSA,
  spouseEmployerMatch,
}) {
  const spouseContribEnd = resolveSpouseRetAge({
    spouseRetirementAge, primaryRetAge, spouseCurrentAge, lifeExp,
  });
  return {
    totalYears, currentAge: spouseCurrentAge,
    // BUG-156: the spouse's OWN salary has no plateau input (null); the PRIMARY's plateau
    // applies only to the primary's income (the "other earner" here), re-expressed in the
    // spouse's age frame (same calendar year).
    currentIncome: spouseIncome, incomeGrowth: spouseIncomeGrowth, incomeGrowthEndAge: null, filingStatus,
    otherEarnerGrowthEndAge: plateauAgeInFrame(incomeGrowthEndAge, currentAge, spouseCurrentAge),
    spouseIncome: currentIncome, spouseIncomeGrowth: incomeGrowth, returnRate,
    bal401k: spouseBal401k, balRoth: spouseBalRoth, balTaxable: spouseBalTaxable, balHSA: spouseBalHSA,
    contrib401k: spouseContrib401k, contribRoth: spouseContribRoth,
    contribTaxable: spouseContribTaxable, contribHSA: spouseContribHSA,
    contribEnd401k: spouseContribEnd, contribEndRoth: spouseContribEnd,
    contribEndTaxable: spouseContribEnd, contribEndHSA: spouseContribEnd,
    calcEmployerMatchFn: spouseEmployerMatch,
    hsaLimit: spouseHsaLimitFor(hsaCoverageType, primaryContribHSA),
    // = spouseAgeAtPrimaryRet. Without this the spouse's own sim counted the PRIMARY's
    // salary in household MAGI forever, including years after the primary retired —
    // wrongly suppressing the spouse's Roth contributions during the gap years.
    spouseIncomeEndAge: spouseAgeAt(currentAge, spouseCurrentAge, primaryRetAge),
  };
}

// Rows exactly as App.jsx shapes them ("Trad 401k" = gross display key).
export function runSpouseSim(input) {
  return runSimulation(input).map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
}
