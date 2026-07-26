import { buildRetirementWalkByAccount } from "./retirement-engine.js";

// Convert between the primary's age and the spouse's age in the same calendar year.
// Inverses of each other by construction — used anywhere a per-year map needs to be
// keyed in one person's frame from data computed in the other's (the gap-year maps,
// the RMD gate, income-tax gating). Extracting this once removes the risk of the two
// frames drifting out of sync across files.
export const spouseAgeAt  = (currentAge, spouseCurrentAge, primaryAge) =>
  spouseCurrentAge + (primaryAge - currentAge);
export const primaryAgeAt = (currentAge, spouseCurrentAge, spouseAge) =>
  currentAge + (spouseAge - spouseCurrentAge);

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
//
// spouseRetirementAge / spouseContribByAge / spouseTaxableIncomeByAge /
// spouseIncomeFloorByAge (#30 / BUG-82) are new pass-through params: plain
// pass-through into `common`, so BOTH the `plan` and `noConv` engine calls see
// the spouse's gap-year contributions/wages/income identically — the
// counterfactual must differ from the plan ONLY in Roth conversions, never in
// whether the spouse kept working. All four default inert (see
// retirement-engine.js for the no-spouse byte-identical guarantee).
export function buildRetirementPhase({
  // per-account GROSS balances at retirement (the BUG-35 gross seed)
  tradGross = 0, roth = 0, taxable = 0, hsa = 0,
  // OPTIONAL second (spouse) Traditional 401k bucket (#30). Defaults keep this
  // byte-identical to the no-spouse case — see retirement-engine.js.
  tradGrossSpouse = 0, spouseRmdStartAge = Infinity,
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
  // Spouse's own retirement timing (#30 / BUG-82) — pass-through to the engine;
  // see retirement-engine.js for the inert defaults and Option-A gating.
  spouseRetirementAge = null, spouseContribByAge = {},
  spouseTaxableIncomeByAge = {}, spouseIncomeFloorByAge = {},
}) {
  const common = {
    startAge, endAge: longevityHorizon, rReal, effectiveExpenses,
    tradGross, roth, taxable, hsa,
    tradGrossSpouse, spouseRmdStartAge,
    ssGross, ssTaxable, ssClaimAge,
    pension, pensionStartAge,
    filingStatus, retStateRate,
    rmdStartAge, useTable2, spouseCurrentAge, currentAge,
    moneyEvents,
    spouseRetirementAge, spouseContribByAge,
    spouseTaxableIncomeByAge, spouseIncomeFloorByAge,
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
  // separate calcRMDTaxSchedule pass). PRIMARY-only — the spouse RMD sub-schedule
  // display is a deferred household-dashboard follow-up (#31); the household TOTAL
  // (totalRMDs, below) already includes it.
  const rmdSchedule = rows
    .filter(r => r.age >= rmdStartAge && r.rmd > 0)
    .map(r => ({
      age: r.age, rmd: Math.round(r.rmd), bal: Math.round(r.trad),
      divisor: r.rmdDivisor, tax: Math.round(r.rmdTax),
    }));
  const firstRMD  = rmdSchedule[0]?.rmd ?? 0;
  // Household total — primary + spouse RMDs (rmdSpouse is 0 with no spouse bucket,
  // so this is byte-identical to the pre-#30 sum in the default case).
  const totalRMDs = Math.round(rows.reduce((s, r) => s + r.rmd + (r.rmdSpouse ?? 0), 0));

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

  // Finding 1 (#30 / BUG-82 follow-up): lifetime rollups of the escape-hatch
  // spillover, bounded to lifeExp like the other lifetime tax sums above (0/0/null
  // with no spouse, or whenever the hatch never fires — inert by construction).
  const sumSpill    = rs => rs.reduce((s, r) => s + (r.spouseSpillover    ?? 0), 0);
  const sumSpillTax = rs => rs.reduce((s, r) => s + (r.spouseSpilloverTax ?? 0), 0);
  const totalSpouseSpillover    = Math.round(sumSpill(rows));
  const totalSpouseSpilloverTax = Math.round(sumSpillTax(rows));
  const firstSpouseSpilloverAge = rows.find(r => (r.spouseSpillover ?? 0) > 0)?.age ?? null;

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
    // spouse hold-out escape-hatch rollups (Finding 1) — already included in
    // totalDrawTax/tax above (a breakdown, not an addend); reported separately so
    // a UI surface can flag "this plan needed early spouse-401k withdrawals."
    totalSpouseSpillover, totalSpouseSpilloverTax, firstSpouseSpilloverAge,
    // full far-horizon walks for any consumer that needs the tail
    planWalk: plan, noConvWalk: noConv,
  };
}

// Per-age household RMD tax map, keyed by every year with a required distribution
// from EITHER spouse (union filter) — fixes BUG-78: a spouse-only-RMD year (spouse
// older, or primary trad depleted) was dropped when the map was built from the
// primary-only rmdSchedule. row.rmdTax is the JOINT (primary + spouse) tax already.
// No spouse → rmdSpouse = 0 on every row → this reduces to the old `r.rmd > 0`
// filter with identical values (Math.round(r.rmdTax) is exactly what rmdSchedule's
// `tax` field already was) → golden-master safe.
export function buildRmdTaxByAge(rows) {
  const out = {};
  for (const r of rows ?? []) {
    if ((r.rmd ?? 0) > 0 || (r.rmdSpouse ?? 0) > 0) out[r.age] = Math.round(r.rmdTax ?? 0);
  }
  return out;
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

// Spouse retirement seed + gap-year maps for the per-account engine (#30 / BUG-82).
//
// The spouse's accounts are seeded at the PRIMARY's retirement year (the walk's
// startAge). The spouse keeps contributing during the gap years until their OWN
// retirement age, so those extra contributions are handed to the engine as a
// per-(primary-age) MAP rather than baked into the seed — baking them in would be a
// temporal double-count (a future-dated balance grown/drawn from an earlier start).
// Traditional-only for v1 (BUG-85 tracks Roth/Taxable/HSA parity); the Roth/Taxable/
// HSA seeds are returned for the shared pools exactly as today.
//
// Income split: spouseTaxableIncomeByAge is GROSS ordinary wages net of the spouse's
// OWN pre-tax deductions (their 401k deferral + HSA) and stacks in the engine's
// bracket floor; spouseIncomeFloorByAge is the NET cash that offsets the draw. The
// deferral is excluded from BOTH because it is separately credited to the spouse 401k
// bucket via spouseContribByAge — the same dollar must never be saved AND spent.
export function buildSpouseRetirementSeed({
  spouseSimData,          // the spouse's runSimulation rows
  spouseCurrentSnapshot,  // fallback when there is no accumulation phase
  spouseCurrentAge,
  currentAge,
  primaryRetAge,          // safeRetAge (main path) or a scenario's retirement age (a later batch)
  spouseRetAge,           // effectiveSpouseRetAge
  spouseNetRate,          // clamp01(1 − combinedEffRate) — tax-only rate, see below
  // Annual inflation %, used ONLY to deflate the gap-year flows below into the
  // engine's own dollar unit (BUG-82 follow-up). 0 (the default) ⇒ deflator 1 ⇒
  // byte-identical to the pre-fix maps, so every existing caller/test is inert.
  inflationRate = 0,
}) {
  const phase2End = primaryRetAge - currentAge;
  const spouseAgeAtPrimaryRet = spouseAgeAt(currentAge, spouseCurrentAge, primaryRetAge);
  const rows = spouseSimData ?? [];
  const seedRow = phase2End > 0
    ? (rows[phase2End - 1] ?? spouseCurrentSnapshot)
    : spouseCurrentSnapshot;

  // Clamp defensively: a non-finite or out-of-range rate must never scale a draw offset.
  const netRate = Math.max(0, Math.min(1, Number.isFinite(spouseNetRate) ? spouseNetRate : 0));

  // ── Unit correction (#30 / BUG-82 follow-up) ──────────────────────────────
  // runSimulation compounds NOMINALLY (returnRate, incomeGrowth), but the retirement
  // engine walks at rReal against a flat effectiveExpenses — its balance unit is the
  // purchasing power of the primary's RETIREMENT year (a seed B grown at rReal for k
  // years is exactly B(1+r)^k deflated by (1+i)^k). The seed above is already in that
  // unit by construction (it IS the nominal balance in that calendar year). The
  // per-year maps below were not: they carried each LATER year's nominal dollars into
  // a walk that never re-inflates anything, so a spouse's gap-year paycheck was the
  // only stream whose purchasing power silently grew inside the walk. Deflate each gap
  // year back to the retirement year. Base = primaryRetAge (NOT currentAge): the
  // spouse's contribution in the primary's retirement year is already inside the seed
  // at full nominal value, so any other base puts a discontinuity right at the seam.
  const infl = Number.isFinite(inflationRate) ? inflationRate / 100 : 0;
  const deflatorFor = (primaryAge) => {
    const k = primaryAge - primaryRetAge;               // 1, 2, 3 … over the gap window
    if (!(k > 0) || !(1 + infl > 0)) return 1;           // guards k<=0 and a pathological rate
    return Math.pow(1 + infl, k);
  };

  const spouseContribByAge = {};
  const spouseTaxableIncomeByAge = {};
  const spouseIncomeFloorByAge = {};
  for (const row of rows) {
    const sAge = row.age;
    if (sAge <= spouseAgeAtPrimaryRet) continue;   // already inside the seed
    if (sAge > spouseRetAge) break;                // spouse retired — no more contributions
    const primaryAge = primaryAgeAt(currentAge, spouseCurrentAge, sAge);
    const defl     = deflatorFor(primaryAge);
    const deferral = Math.min(row.c401kEmployee ?? 0, row.salary ?? 0);
    const hsa      = (row.cHSA ?? 0) / defl;
    const wages    = Math.max(0, (row.salary ?? 0) - deferral - (row.cHSA ?? 0)) / defl;
    spouseContribByAge[primaryAge]       = Math.round((row.c401k ?? 0) / defl);
    spouseTaxableIncomeByAge[primaryAge] = Math.round(wages);
    // v1: the spouse's Roth/Taxable/HSA gap contributions are treated as SPENT
    // (BUG-85 tracks full parity), so cRoth/cTaxable stay inside the net wage figure
    // and the pre-tax HSA dollars are added back untaxed. Dollar-conserving.
    spouseIncomeFloorByAge[primaryAge]   = Math.round(wages * netRate) + Math.round(hsa);
  }

  return {
    tradSeed:    seedRow.tradGross     ?? 0,
    rothSeed:    seedRow["Roth IRA"]   ?? 0,   // v1: merged into the hh pools unchanged
    taxableSeed: seedRow["Taxable"]    ?? 0,
    hsaSeed:     seedRow["HSA"]        ?? 0,
    spouseContribByAge, spouseTaxableIncomeByAge, spouseIncomeFloorByAge,
  };
}
