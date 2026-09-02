import {
  HSA_LIMIT_2026,
  ROTH_IRA_LIMIT_2026,
  TRAD_401K_LIMIT_2026,
  ROTH_PHASEOUT_2026,
  ASSUMPTIONS,
} from "../config/irs-2026.js";
import { fvAnnuity } from "./finance-math.js";

// Returns income after all taxes — the correct budget basis.
// Pre-tax contributions are NOT subtracted here; they reduce fedTax via AGI instead.
export function calcGrossAfterTax(currentIncome, fedTax, stateTax, fica) {
  return currentIncome - fedTax - stateTax - fica;
}

// Projects future value of maxing the mega-backdoor Roth each year, for a few
// horizons. Uses the shared annuity-FV primitive (returnRate is a percent here,
// so pass it as a decimal). Returns [{yrs, val}] for the requested horizons.
export function calcMegaBackdoorGrowth({ megaCapacity, returnRate, years = [5, 10, 20] }) {
  return years.map(yrs => ({
    yrs,
    val: Math.round(fvAnnuity(megaCapacity, returnRate / 100, yrs)),
  }));
}

// Returns the annual savings capacity and related budget metrics.
// grossAfterTax: from calcGrossAfterTax (income minus all taxes)
// livingExpenses: null → auto-derived as grossAfterTax - currentContribTotal
// budgetDeficit: how far expenses + contributions overshoot after-tax income
// (the unclamped negative side of availableSurplus, as a positive dollar
// amount; 0 when the budget balances). ONE definition — consumed by the
// Plan-screen deficit signal (signals.js, WI-1.2) and by Classic's deficit
// warning copy; the WI-2.2 Budget tab will reuse it.
export function calcSavingsCapacity({
  grossAfterTax,
  contrib401k,
  contribRoth,
  contribTaxable,
  contribHSA,
  livingExpenses,
}) {
  const currentContribTotal = contrib401k + contribRoth + contribTaxable + contribHSA;
  const effectiveLiving     = livingExpenses ?? Math.max(0, grossAfterTax - currentContribTotal);
  const savingsCapacity     = Math.max(0, grossAfterTax - effectiveLiving);
  const availableSurplus    = Math.max(0, savingsCapacity - currentContribTotal);
  const budgetDeficit       = Math.max(0, Math.round(effectiveLiving + currentContribTotal - grossAfterTax));
  return { currentContribTotal, effectiveLiving, savingsCapacity, availableSurplus, budgetDeficit };
}

// Returns the optimized allocation of surplus across accounts in IRS-priority order.
// Priority: 1. Capture employer match  2. Max HSA  3. Max Roth IRA  4. Max 401k  5. Taxable
export function calcOptimizedAllocation({
  availableSurplus,
  savingsSurplusPct,
  contrib401k,
  contribRoth,
  contribHSA,
  contribTaxable,
  rothFullyPhased,
  matchMode,
  matchFormulaCap,
  matchFormulaRate,
  employerMatchPct,
  currentIncome,
}) {
  let remaining = Math.round(availableSurplus * savingsSurplusPct / 100);
  const alloc = { extra401k: 0, extraRoth: 0, extraHSA: 0, extraTaxable: 0, extraMatch: 0 };

  // 1. Employer match: only FORMULA matches are contingent on the employee's own
  //    deferral (e.g. "50% of the first 6%"), so only formula mode needs surplus
  //    steered into the 401k to capture the full match. A FLAT match (salary × pct)
  //    is paid unconditionally — directing surplus there just to "earn" it is wrong,
  //    so flat mode skips this step and lets HSA/Roth take priority.
  if (matchMode === "formula") {
    const matchContribNeeded = Math.min(
      Math.round(currentIncome * matchFormulaCap / 100),
      TRAD_401K_LIMIT_2026,
    );
    if (contrib401k < matchContribNeeded) {
      const matchGap = Math.min(remaining, matchContribNeeded - contrib401k);
      alloc.extraMatch = matchGap;
      alloc.extra401k += matchGap;
      remaining -= matchGap;
    }
  }

  // 2. HSA (triple tax advantage)
  const hsaRoom = Math.max(0, HSA_LIMIT_2026 - contribHSA);
  if (remaining > 0 && hsaRoom > 0) {
    const hsaAdd = Math.min(remaining, hsaRoom);
    alloc.extraHSA = hsaAdd;
    remaining -= hsaAdd;
  }

  // 3. Roth IRA (tax-free growth, no RMDs — unless phased out)
  if (remaining > 0 && !rothFullyPhased) {
    const rothRoom = Math.max(0, ROTH_IRA_LIMIT_2026 - contribRoth);
    const rothAdd = Math.min(remaining, rothRoom);
    alloc.extraRoth = rothAdd;
    remaining -= rothAdd;
  }

  // 4. 401k to annual limit
  const room401k = Math.max(0, TRAD_401K_LIMIT_2026 - contrib401k - alloc.extra401k);
  if (remaining > 0 && room401k > 0) {
    const add401k = Math.min(remaining, room401k);
    alloc.extra401k += add401k;
    remaining -= add401k;
  }

  // 5. Taxable brokerage (overflow)
  if (remaining > 0) {
    alloc.extraTaxable = remaining;
  }

  alloc.totalExtra = alloc.extra401k + alloc.extraRoth + alloc.extraHSA + alloc.extraTaxable;
  alloc.opt401k    = contrib401k + alloc.extra401k;
  alloc.optRoth    = contribRoth  + alloc.extraRoth;
  alloc.optHSA     = contribHSA   + alloc.extraHSA;
  alloc.optTaxable = contribTaxable + alloc.extraTaxable;
  return alloc;
}

// ── Statement view (Horizon Numbers screen) ──────────────────────────────────
// Display-ready numbers for the Statement and Money-flow tabs (V3 fix — these
// percentages, the waterfall residual, and the month conversions used to be
// computed in NumbersScreen.jsx JSX; screens render, never compute).
//
// Inputs come straight from calcTaxBasis / calcSavingsCapacity / calcRetirementIncome.
//
// Two percentage sets, deliberately different bases:
//   keepPct/taxPct/savePct — the statement bar: take-home is the MODEL's takeHome,
//     so keep+tax+save can exceed 100% (pre-tax saving lowers taxable income).
//   flow* — the waterfall set: take-home is the RESIDUAL (gross − tax − savings),
//     so the pieces reconcile to exactly 100% of gross. flowKeep is the honest
//     "cash in your pocket after tax and saving" level for an allocation view.
//
// Designed empty state: when currentIncome is missing or ≤ 0, every percentage
// (and effFedRatePct) is null — NOT 0 — and screens render "—" (principle 10).
export function calcStatementView({
  currentIncome,
  fedTax,
  fica,
  stateTax,
  takeHome,
  currentContribTotal,
  householdSS,
  effectiveExpenses,
  safeDeduc = 0,
  effectivePension = 0,
  totalAtRet = null,
  totalContrib = null,
  // BUG-91: the retirement-year-dollar versions of effectiveExpenses/
  // effectivePension (App.jsx's retSpendBasis/retPensionBasis) — used ONLY for
  // the SS/pension/portfolio-draw breakdown below, which must reconcile with
  // netPortfolioNeed's own basis (the same frame householdSS is already in).
  // Default to the raw values so a caller that doesn't pass them (existing
  // tests, any other consumer) stays byte-identical — inert unless a caller
  // actually has years-to-retirement/inflation to convert with.
  effectiveExpensesRetYear = effectiveExpenses,
  effectivePensionRetYear = effectivePension,
}) {
  const hasIncome = currentIncome != null && currentIncome > 0;
  const gross     = hasIncome ? currentIncome : 0;

  const taxTotal      = fedTax + fica + stateTax;
  const ficaPlusState = fica + stateTax;
  const pct = (n) => hasIncome ? Math.round((n / currentIncome) * 100) : null;

  // Statement bar (model take-home basis)
  const keepPct = pct(takeHome);
  const taxPct  = pct(taxTotal);
  const savePct = pct(currentContribTotal);

  // Waterfall set (residual basis — reconciles to 100% of gross)
  const afterTaxLevel  = gross - taxTotal;
  // Split savings into pre-tax (401k + HSA — reduce taxable income) and after-tax
  // (Roth IRA + taxable brokerage — leave the paycheck, then transfer out).
  // afterTaxLevel − takeHome ≡ safeDeduc; takeHome − flowKeep ≡ afterTaxSavings.
  const afterTaxSavings = Math.max(0, currentContribTotal - safeDeduc);
  const flowKeep        = Math.max(gross - taxTotal - currentContribTotal, 0);
  const flowTaxPct      = pct(taxTotal);
  const flowPreTaxPct   = pct(safeDeduc);
  const flowPostTaxPct  = pct(afterTaxSavings);
  const flowSavePct     = pct(currentContribTotal);   // total (kept for callers that use it)
  const flowKeepPct     = pct(flowKeep);

  // Applicability booleans for the income waterfall — travels with the data (rule 10):
  // the screen must not do positivity checks on dollar amounts.
  const showPreTaxBar    = safeDeduc > 0;
  const showPostTaxBar   = afterTaxSavings > 0;
  const showPaycheckLine = afterTaxSavings > 0 && takeHome > 0;

  // Monthly figures (display-ready — the month conversion lives HERE, not in JSX)
  // ss/pension/exp (the SS + pension + portfolio-draw breakdown, BUG-91) are
  // retirement-YEAR dollars, matching householdSS's own frame, so the three
  // bands actually reconcile to monthlyTotal — unlike incomeReplacementPct
  // below, which is a deliberately different (today's-dollars) comparison.
  //
  // BUG-128: an over-funded household (SS + pension alone exceed spending) used
  // to clamp ONLY the portfolio draw at 0 while leaving ss/pension unscaled, so
  // the three bands summed to MORE than monthlyTotal — the same over-count
  // calcRetIncomeFlow (drawdown.js) already guards against for its own SS/
  // pension/portfolio-draw bands. Reuse that exact scaling here instead of a
  // second implementation: when income covers spending, ss/pension are scaled
  // down proportionally to fill exactly `exp` (the surplus isn't "funding
  // expenses"). A no-op (scale = 1, byte-identical) whenever income doesn't
  // exceed spending — the ordinary, non-over-funded case.
  const ss              = householdSS ?? 0;        // guard null/undefined → NaN leaking to the UI
  const pension         = effectivePensionRetYear ?? 0;
  const exp             = Math.max(0, effectiveExpensesRetYear ?? 0);
  const ssRaw            = Math.max(0, ss);
  const pensionRaw       = Math.max(0, pension);
  const incomeTotal      = ssRaw + pensionRaw;
  const portDraw         = Math.max(0, exp - incomeTotal);
  const incomeCovered    = exp - portDraw;             // == min(incomeTotal, exp)
  const incomeScale      = incomeTotal > 0 ? incomeCovered / incomeTotal : 0;
  const ssBand           = ssRaw * incomeScale;
  const pensionBand      = pensionRaw * incomeScale;
  const monthlyHHSS     = Math.round(ssBand / ASSUMPTIONS.MONTHS_PER_YEAR);
  const monthlyPension  = Math.round(pensionBand / ASSUMPTIONS.MONTHS_PER_YEAR);
  const monthlyPortDraw = Math.round(portDraw / ASSUMPTIONS.MONTHS_PER_YEAR);
  const monthlyTotal    = Math.round(exp / ASSUMPTIONS.MONTHS_PER_YEAR);
  // Each band's share of monthlyTotal, as a display-ready integer percent — the
  // Statement tab's "Where retirement income comes from" companion strip used
  // to compute `Math.round((val / sv.monthlyTotal) * 100)` inline in JSX for
  // each bar's width (rule 10 violation, same class BUG-121 fixed nearby).
  const sharePct = (val) => monthlyTotal > 0 ? Math.round((val / monthlyTotal) * 100) : 0;
  const ssSharePct       = sharePct(monthlyHHSS);
  const pensionSharePct  = sharePct(monthlyPension);
  const portDrawSharePct = sharePct(monthlyPortDraw);
  const monthlyTakeHome = (hasIncome && takeHome > 0)
    ? Math.round(takeHome / ASSUMPTIONS.MONTHS_PER_YEAR)
    : null;
  // "How much of your CURRENT paycheck would retirement replace" — deliberately
  // TODAY's dollars vs. today's take-home (BUG-91 scope decision), not the
  // retirement-year-converted monthlyTotal above.
  const monthlyTodaysExp = Math.round((effectiveExpenses ?? 0) / ASSUMPTIONS.MONTHS_PER_YEAR);
  const incomeReplacementPct = (monthlyTakeHome != null && monthlyTakeHome > 0 && monthlyTodaysExp > 0)
    ? Math.round(monthlyTodaysExp / monthlyTakeHome * 100)
    : null;

  // Effective federal rate footnote (1 decimal place), null when no income
  const effFedRatePct = hasIncome ? Math.round((fedTax / currentIncome) * 1000) / 10 : null;

  // Lifetime compounding multiplier: how many × the user's total contributions becomes
  // the retirement nest egg. null when either input is missing or contributions = 0.
  const lifetimeContribROI = (totalAtRet != null && totalContrib != null && totalContrib > 0)
    ? Math.round((totalAtRet / totalContrib) * 10) / 10
    : null;

  return {
    gross, taxTotal, ficaPlusState,
    saveTotal: currentContribTotal,
    // preTaxDeductions = safeDeduc (401k + HSA + otherPreTax only) — used by the
    // Statement table so the row arithmetic matches takeHome (rule 2b / rule 10).
    // saveTotal is ALL contributions (for the waterfall chart's allocation view).
    preTaxDeductions: safeDeduc,
    afterTaxSavings,          // Roth IRA + taxable brokerage contributions (after-tax)
    takeHomePay: takeHome,    // paycheck deposit = gross − taxes − pre-tax savings
    keepPct, taxPct, savePct,
    afterTaxLevel, flowKeep, flowTaxPct, flowPreTaxPct, flowPostTaxPct, flowSavePct, flowKeepPct,
    showPreTaxBar, showPostTaxBar, showPaycheckLine,
    monthlyHHSS, monthlyPension, monthlyPortDraw, monthlyTotal,
    ssSharePct, pensionSharePct, portDrawSharePct,
    monthlyTakeHome, incomeReplacementPct,
    effFedRatePct,
    lifetimeContribROI,
  };
}

// A composition bar's segment is too narrow to hold its own text label: the
// label is `whiteSpace: nowrap` inside an `overflow: hidden` flex segment, so
// a segment under the threshold renders a truncated fragment ("Ta", "Portfo")
// rather than disappearing cleanly. Below is the ONE place that decides this —
// NumbersScreen's Statement tab (three bars: paycheck split, account mix,
// retirement income mix) all build their segs through this, rather than
// re-deriving the share/threshold check inline in the render (rule 10 — a
// screen formats and lays out, it does not compute).
export const SEG_LABEL_MIN_SHARE_PCT = 12;

// segs: array of { f, c, l } (flex share, colour, label) — f may be missing/
// negative/non-finite for a genuinely empty segment (e.g. no pension), which
// is real 0 width for this purpose, checked explicitly rather than coerced
// with `?? 0` (rule 10). Returns the same segments with `showLabel` added.
//
// CodeRabbit (PR #66 round 2): `total`/`showLabel` were computed from the
// SANITIZED `share(seg.f)` (negative/non-finite → 0), but the returned
// segment still carried the ORIGINAL, unsanitized `seg.f` via the `...seg`
// spread — so a caller rendering `flex: seg.f` for a malformed segment (e.g.
// a negative value that showLabel already treated as 0) would still feed the
// negative raw number straight into CSS `flex`, disagreeing with the very
// threshold decision this function just made. `f` is now the SAME sanitized
// value `total`/`showLabel` are computed from, so a segment's flex-basis and
// its label-visibility decision can never disagree about what its own share
// actually is.
export function buildBarSegments(segs) {
  const list = segs ?? [];
  const share = (f) => (Number.isFinite(f) && f > 0) ? f : 0;
  const total = list.reduce((s, seg) => s + share(seg.f), 0);
  return list.map((seg) => ({
    ...seg,
    f: share(seg.f),
    showLabel: total > 0 && (share(seg.f) / total) * 100 >= SEG_LABEL_MIN_SHARE_PCT,
  }));
}
