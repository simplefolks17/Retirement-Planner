import { buildRetirementWalkByAccount } from "./retirement-engine.js";

// Build the engine's { [age]: amount } Roth-conversion schedule from the plan's
// per-year (bracket-fill) or flat conversion targets. Conversions occur at ages
// startAge .. endAge (inclusive). At the default window (startAge = safeRetAge+1,
// endAge = RMD_START_AGE-1) this is byte-identical to the previous
// safeRetAge+yr+1 indexing — the equivalence pin that keeps the golden master
// unchanged. annualConversions is indexed by (age - startAge). Shared by the
// display path and the optimizer so they feed the engine the same schedule.
export function buildConversionByAge({
  startAge, endAge, annualConversions = null, annualConversion = 0,
}) {
  const out = {};
  for (let age = startAge; age <= endAge; age++) {
    const i = age - startAge;
    const amt = annualConversions ? (annualConversions[i] ?? annualConversion) : annualConversion;
    if (amt > 0) out[age] = amt;
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
  // drawTax is the engine's INCREMENTAL tax on extra 401k draws beyond
  // RMDs/conversions (retirement-engine.js) — additive with rmdTax/convTax,
  // never overlapping, so the three sum to the full retirement-phase tax (BUG-40).
  const sumDrawTax = rows => rows.reduce((s, r) => s + (r.drawTax ?? 0), 0);

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
      age: r.age, rmd: Math.round(r.rmd), bal: Math.round(r.trad),
      divisor: r.rmdDivisor, tax: Math.round(r.rmdTax),
    }));
  const firstRMD  = rmdSchedule[0]?.rmd ?? 0;
  const totalRMDs = Math.round(rows.reduce((s, r) => s + r.rmd, 0));

  // No-conversion RMD schedule (same shape) for the pre/post-conversion comparison
  // table — the counterfactual "what your RMDs would be without converting".
  // bal is the Traditional 401k balance (r.trad), matching the "Est. 401k Balance"
  // column — NOT r.total (which would include Roth/Taxable/HSA). [review fix]
  const rmdScheduleNoConv = noConvRows
    .filter(r => r.age >= rmdStartAge && r.rmd > 0)
    .map(r => ({ age: r.age, rmd: Math.round(r.rmd), bal: Math.round(r.trad) }));

  // Lifetime taxes (to life expectancy). rmdTaxBite is the ACTUAL plan (post-conversion);
  // rmdTaxBiteNoConv is the counterfactual that values the conversion's RMD-tax saving.
  const rmdTaxBite       = Math.round(sumRmdTax(rows));
  const conversionCost   = Math.round(sumConvTax(rows));
  const totalDrawTax     = Math.round(sumDrawTax(rows));
  const rmdTaxBiteNoConv = Math.round(sumRmdTax(noConvRows));
  // Apples-to-apples saving: when conversions change longevity, the two walks can end at
  // different ages (one depletes earlier → fewer RMD years → its bite drops spuriously).
  // Compare RMD tax only over the span BOTH plans are still active so the saving isn't
  // distorted by a longevity difference (which is already captured by yearsSustained).
  // [review fix — Gemini] Inert at default (both walks reach lifeExp → common span = full).
  const lastAge = rs => (rs.length ? rs[rs.length - 1].age : startAge);
  const commonMaxAge = Math.min(lastAge(rows), lastAge(noConvRows));
  const sumRmdTaxTo = (rs, maxAge) =>
    rs.reduce((s, r) => s + (r.age <= maxAge ? (r.rmdTax ?? 0) : 0), 0);
  const rmdTaxSaved = Math.max(0,
    Math.round(sumRmdTaxTo(noConvRows, commonMaxAge) - sumRmdTaxTo(rows, commonMaxAge)));
  const grossNetBenefit  = rmdTaxSaved - conversionCost;

  return {
    // chart / longevity
    rows,
    depletionAge: plan.depletionAge,
    yearsSustained: plan.yearsSustained,
    endVal: plan.endVal,
    // RMD display
    rmdSchedule, rmdScheduleNoConv, firstRMD, totalRMDs, rmdTaxBite,
    // lifetime tax on extra 401k draws beyond RMDs/conversions (BUG-40) —
    // bounded to lifeExp like rmdTaxBite/conversionCost so the three compose.
    totalDrawTax,
    // conversion benefit (before IRMAA/ACA — those layer on in conversion-evaluation)
    conversionCost, rmdTaxBiteNoConv, rmdTaxSaved, grossNetBenefit,
    // full far-horizon walks for any consumer that needs the tail
    planWalk: plan, noConvWalk: noConv,
  };
}

// Balance at a given age from a walk's `rows` — the accessor behind App's
// "Left at {lifeExp}" stat card (formerly inlined as `balAt90`, App.jsx:584-592)
// and now reused by the WI-3.9 Apply-preview builder so both read the exact
// same rule: exact-age row if present, else the LAST row (the walk ended before
// the target age — e.g. depletion), else 0 when there are no rows at all.
// Never negative — a depleted account displays as $0, not a negative balance.
export function walkBalanceAt(rows, age) {
  if (!rows || rows.length === 0) return 0;
  const exact = rows.find(r => r.age === age);
  if (exact) return Math.max(0, exact.total);
  const last = rows[rows.length - 1];
  return Math.max(0, last.total);
}

// Pre/post-conversion RMD comparison table (replaces the JSX join at
// App.jsx:3341-3358). Iterates the NO-CONVERSION baseline schedule (parameter
// order reflects this — it's the "what RMDs would be without converting" list)
// and looks up the matching plan-schedule row by age. A baseline age with no
// corresponding plan row (the conversion plan depleted, changed longevity, or
// simply has no RMD that year) reports `withConv: null` — never a synthesized
// 0 (principle 10) — so the screen renders "—" instead of a fake improvement.
// `improved` is true only when the plan actually lowered that year's RMD.
export function buildRmdComparison(rmdScheduleNoConv, rmdSchedule) {
  const baseline = rmdScheduleNoConv ?? [];
  const plan = rmdSchedule ?? [];
  return baseline.map(({ age, rmd }) => {
    const planRow = plan.find(d => d.age === age);
    const withConv = planRow ? planRow.rmd : null;
    return {
      age,
      noConv: rmd,
      withConv,
      improved: withConv != null && withConv < rmd,
    };
  });
}
