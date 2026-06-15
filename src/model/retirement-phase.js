import { buildRetirementWalkByAccount } from "./retirement-engine.js";

// Build the engine's { [age]: amount } Roth-conversion schedule from the plan's
// per-year (bracket-fill) or flat conversion targets. Conversions occur at ages
// safeRetAge+1 .. safeRetAge+conversionWindowYrs (the sim grows one year before
// the first conversion, so the window starts the year AFTER retirement). Shared
// by the display path and the optimizer so they feed the engine the same schedule.
export function buildConversionByAge({
  conversionWindowYrs, safeRetAge, annualConversions = null, annualConversion = 0,
}) {
  const out = {};
  for (let yr = 0; yr < conversionWindowYrs; yr++) {
    const amt = annualConversions ? (annualConversions[yr] ?? annualConversion) : annualConversion;
    if (amt > 0) out[safeRetAge + yr + 1] = amt;
  }
  return out;
}

// ── Single source of truth for the ENTIRE retirement phase (BUG-35 / BUG-31) ──
//
// One per-account engine walk drives BOTH the headline longevity AND the
// displayed RMD / Roth-conversion numbers, so they can never diverge again — the
// core BUG-31 guarantee, now extended to the RMD schedule and conversion benefit
// (which previously came from a SEPARATE nominal-growth, withdrawal-ignoring
// projection: calcRMDProjection / calcRMDPostConversion).
//
// We run the engine TWICE, both to a far horizon:
//   • plan      — with the Roth-conversion schedule (the real plan everything reads)
//   • noConv    — with conversions removed, ONLY to value the conversion's RMD-tax
//                 reduction (rmdTaxSaved). It is never displayed.
//
// All RMDs here are computed on the LIVE 401k balance in real (today's) dollars,
// after conversions and spending draws have actually left the account — so the
// displayed firstRMD / rmdTaxBite reflect the ACTUAL plan (with conversions),
// not a counterfactual that ignores them.
//
// The conversion tax and RMD tax come from the engine's per-row breakdown
// (row.convTax / row.rmdTax — raw, summed then rounded ONCE so the displayed
// totals don't accumulate per-year rounding drift). Healthcare costs (IRMAA/ACA)
// are orthogonal cost adders layered on in conversion-evaluation.js — they consume
// the conversion AMOUNTS (conversionByAge), not anything the engine re-derives.
export function buildRetirementPhase({
  // per-account GROSS balances at retirement (the BUG-35 gross seed)
  tradGross = 0, roth = 0, taxable = 0, hsa = 0,
  startAge,                 // safeRetAge
  lifeExp,                  // safeLifeExp — display/chart horizon
  longevityHorizon,         // far cap (e.g. safeRetAge + 130) for "years sustained" + lifetime tax
  rReal,
  effectiveExpenses,
  ssGross = 0, ssTaxable = 0, ssClaimAge = Infinity,
  pension = 0, pensionStartAge = Infinity,
  filingStatus = "single", retStateRate = 0,
  conversionByAge = {},
  rmdStartAge = Infinity,
  useTable2 = false, spouseCurrentAge = null, currentAge = null,
  moneyEvents = [],
}) {
  const common = {
    startAge, endAge: longevityHorizon, rReal, effectiveExpenses,
    tradGross, roth, taxable, hsa,
    ssGross, ssTaxable, ssClaimAge,
    pension, pensionStartAge,
    filingStatus, retStateRate,
    rmdStartAge, useTable2, spouseCurrentAge, currentAge,
    moneyEvents,
  };

  const plan   = buildRetirementWalkByAccount({ ...common, conversionByAge });
  const noConv = buildRetirementWalkByAccount({ ...common, conversionByAge: {} });

  const sumRmdTax  = rows => rows.reduce((s, r) => s + (r.rmdTax  ?? 0), 0);
  const sumConvTax = rows => rows.reduce((s, r) => s + (r.convTax ?? 0), 0);

  // Chart/Flow-Down rows + all lifetime tax sums are bounded to the display life
  // expectancy: RMDs past the planning horizon (death) don't happen, and the prior
  // model (calcRMDProjection → safeLifeExp) measured the bite the same way. The
  // FAR walk is used only for the headline "years sustained" (longevity past 90).
  const rows      = plan.rows.filter(r => r.age <= lifeExp);
  const noConvRows = noConv.rows.filter(r => r.age <= lifeExp);

  // RMD schedule (display) — 73+, withdrawal-aware, real $. Zero-RMD years dropped
  // (the section lists required ones only). Each row carries divisor + per-year RMD
  // tax so it feeds the RMD table directly (this IS rmdDataWithTax — one source, no
  // separate calcRMDTaxSchedule pass).
  const rmdSchedule = rows
    .filter(r => r.age >= rmdStartAge && r.rmd > 0)
    .map(r => ({
      age: r.age, rmd: Math.round(r.rmd), bal: r.total,
      divisor: r.rmdDivisor, tax: Math.round(r.rmdTax),
    }));
  const firstRMD  = rmdSchedule[0]?.rmd ?? 0;
  const totalRMDs = Math.round(rows.reduce((s, r) => s + r.rmd, 0));

  // No-conversion RMD schedule (same shape) for the pre/post-conversion comparison
  // table — the counterfactual "what your RMDs would be without converting".
  const rmdScheduleNoConv = noConvRows
    .filter(r => r.age >= rmdStartAge && r.rmd > 0)
    .map(r => ({ age: r.age, rmd: Math.round(r.rmd), bal: r.total }));

  // Lifetime taxes (to life expectancy). rmdTaxBite is the ACTUAL plan (post-conversion);
  // rmdTaxBiteNoConv is the counterfactual that values the conversion's RMD-tax saving.
  const rmdTaxBite       = Math.round(sumRmdTax(rows));
  const conversionCost   = Math.round(sumConvTax(rows));
  const rmdTaxBiteNoConv = Math.round(sumRmdTax(noConvRows));
  const rmdTaxSaved      = Math.max(0, rmdTaxBiteNoConv - rmdTaxBite);
  const grossNetBenefit  = rmdTaxSaved - conversionCost;

  return {
    // chart / longevity
    rows,
    depletionAge: plan.depletionAge,
    yearsSustained: plan.yearsSustained,
    endVal: plan.endVal,
    // RMD display
    rmdSchedule, rmdScheduleNoConv, firstRMD, totalRMDs, rmdTaxBite,
    // conversion benefit (before IRMAA/ACA — those layer on in conversion-evaluation)
    conversionCost, rmdTaxBiteNoConv, rmdTaxSaved, grossNetBenefit,
    // full far-horizon walks for any consumer that needs the tail
    planWalk: plan, noConvWalk: noConv,
  };
}
