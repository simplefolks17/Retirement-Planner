// ── Per-account retirement engine (BUG-35 fix, Stage 1) ─────────────────────
//
// Replaces the single-blended-pool retirement walk (buildRetirementDrawdown) with
// a walk that tracks the four accounts SEPARATELY and taxes every dollar exactly
// ONCE — when it actually leaves a pre-tax account. This fixes BUG-35: the old
// walk was seeded from the *after-tax* total (401k shrunk by the marginal rate)
// AND then charged per-year RMD/conversion tax on the *gross* 401k, taxing the
// Traditional 401k twice.
//
// Here the pool is seeded from GROSS balances, and the only tax that leaks is the
// real ordinary-income tax on money pulled from the 401k that year:
//   • Roth conversions (window)        — 401k → Roth, taxed
//   • RMDs (age ≥ rmdStartAge)         — forced 401k withdrawal, taxed
//   • extra 401k draw to fund spending — taxed
// All three stack on the SS/pension income floor for ONE bracket-accurate tax
// (stackedIncomeTax, shared with the RMD/conversion paths). Roth, HSA, and the
// already-LTCG-drag-adjusted Taxable account are never re-taxed on withdrawal.
//
// Spending is funded in the tax-smart order Taxable → 401k → Roth → HSA (spend
// the taxed money first, preserve tax-free accounts longest). RMD principal is
// NOT a separate outflow (rule 2b): it moves 401k → Taxable (only the tax leaks)
// and is then available to fund the draw, so it keeps compounding in the pool.
//
// IMPORTANT — the AGGREGATE recurrence still matches buildRetirementDrawdown:
//   balEnd(total) = balStart(total)·(1 + rReal) − draw − tax (+ events + spouseContrib)
// because conversions and RMDs are internal transfers that preserve the total;
// only `draw` (net spending) and `tax` leave the pool. So every existing consumer
// of the walk (chart, longevity, Flow-Down, Year-by-year) reads the same
// row shape — now with correct, gross-seeded, taxed-once numbers, plus per-account
// detail. This keeps the BUG-31 single-walk guarantee intact.
// `spouseContrib` is the still-working spouse's gap-year inflow (0 without a
// spouse) — their 401k contribution PLUS any banked income surplus (cash beyond
// that year's spending need, which would otherwise be an unlabeled inflow to
// `rTax`). Reported per row so downstream reconciliation surfaces (Flow-Down,
// Year-by-year) can close their identities completely, not just partially.

import { calcTax } from "./taxes.js";
import { getDivisor } from "./rmd.js";
import { applyMoneyEvents } from "./money-events.js";

export function buildRetirementWalkByAccount({
  startAge,                 // safeRetAge
  endAge,                   // safeLifeExp (chart) or a high cap (longevity)
  rReal,
  // GROSS balances at retirement (no after-tax haircut — that is the BUG-35 fix)
  tradGross = 0,
  roth = 0,
  taxable = 0,
  hsa = 0,
  // OPTIONAL second (spouse) Traditional 401k bucket (#30, model-layer slice).
  // Defaults to the no-spouse case: tradGrossSpouse=0 keeps every existing
  // number byte-identical (tradSp stays 0 for the whole walk). Its RMD is
  // keyed to the SPOUSE's age (spouseCurrentAge/currentAge, already engine
  // params for Table II) against spouseRmdStartAge, which App resolves from
  // RMD_START_AGE (rule 1 — the constant itself is never imported here).
  tradGrossSpouse = 0,
  spouseRmdStartAge = Infinity,
  effectiveExpenses,
  // Income that reduces the draw (cash received) vs. the taxable floor it stacks on.
  // ssGross = benefit actually received; ssTaxable = its taxable portion (≈85%).
  ssGross = 0,
  ssTaxable = 0,
  ssClaimAge = Infinity,
  pension = 0,
  pensionStartAge = Infinity,
  filingStatus = "single",
  retStateRate = 0,
  conversionByAge = {},     // { [age]: conversion amount } — from the conversion plan
  rmdStartAge = Infinity,
  useTable2 = false,
  spouseCurrentAge = null,
  currentAge = null,
  moneyEvents = [],
  // ── Spouse's own retirement timing (#30 / BUG-82) ──────────────────────────
  // All four default INERT: a no-spouse (or pre-BUG-82) caller gets a
  // byte-identical walk. spouseRetirementAge finite ⇒ Option-A gating active.
  spouseRetirementAge = null,      // the SPOUSE's own retirement age (their age, not the primary's)
  spouseContribByAge = {},         // { [primaryAge]: gross spouse Traditional 401k contribution that gap year }
  spouseTaxableIncomeByAge = {},   // { [primaryAge]: spouse ORDINARY WAGES that gap year — stacks in the bracket floor }
  spouseIncomeFloorByAge = {},     // { [primaryAge]: spouse NET cash offsetting the draw that gap year }
}) {
  const rows = [];
  let trad = tradGross, rRoth = roth, rTax = taxable, rHsa = hsa;
  let tradSp = tradGrossSpouse;
  // Drawable portion of tradSp THIS year — recomputed per iteration below and
  // decremented by drawInOrder so the two draw calls (spending, then tax) share one cap.
  let spouseDrawable = 0;
  let depletionAge = null;
  let yearsSustained = Infinity;

  const spouseAgeAt = (age) =>
    useTable2 && spouseCurrentAge != null && currentAge != null
      ? Math.round(spouseCurrentAge + (age - currentAge))
      : null;

  // Spouse's own age each year — used for the spouse RMD gate, independent of
  // useTable2 (which only governs whether the PRIMARY's RMD uses the joint
  // Table II divisor). null when either age is unknown (no spouse configured).
  const spouseAgeFor = (age) =>
    (spouseCurrentAge != null && currentAge != null)
      ? Math.round(spouseCurrentAge + (age - currentAge))
      : null;

  const spouseOptionA = spouseRetirementAge != null && Number.isFinite(spouseRetirementAge);

  // Draw `amount` from the accounts in a fixed order; returns the split actually
  // withdrawn and mutates the running balances. Used for both spending and tax.
  // "trad" draws from the PRIMARY Traditional 401k first, then spills into the
  // spouse's bucket (tradSp) — one combined pre-tax draw order (#30).
  const drawInOrder = (amount, order) => {
    let rem = amount;
    const taken = { trad: 0, roth: 0, taxable: 0, hsa: 0 };
    for (const acct of order) {
      if (rem <= 0) break;
      if (acct === "trad") {
        const bal = trad + spouseDrawable;                 // was trad + tradSp
        const t = Math.min(rem, Math.max(0, bal));
        taken.trad = t;
        rem -= t;
        const fromTrad = Math.min(t, Math.max(0, trad));
        trad -= fromTrad;
        const fromSpouse = t - fromTrad;                    // <= spouseDrawable by construction
        tradSp -= fromSpouse;
        spouseDrawable -= fromSpouse;                       // so the 2nd call (tax) can't over-draw
        continue;                                           // the held-out portion
      }
      const bal = acct === "roth" ? rRoth : acct === "taxable" ? rTax : rHsa;
      const t = Math.min(rem, Math.max(0, bal));
      taken[acct] = t;
      rem -= t;
      if (acct === "roth") rRoth -= t;
      else if (acct === "taxable") rTax -= t;
      else rHsa -= t;
    }
    return { taken, shortfall: rem };
  };

  for (let age = startAge + 1; age <= endAge; age++) {
    const balStart = trad + tradSp + rRoth + rTax + rHsa;

    // 1. Growth (real return) per account.
    const gTrad = trad * rReal, gRoth = rRoth * rReal, gTax = rTax * rReal, gHsa = rHsa * rReal;
    const gTradSp = tradSp * rReal;
    trad += gTrad; rRoth += gRoth; rTax += gTax; rHsa += gHsa; tradSp += gTradSp;
    const growth = gTrad + gRoth + gTax + gHsa + gTradSp;

    // 2. RMD (forced) BEFORE any conversion (IRS sequencing — review fix): the
    //    first dollars out of a pre-tax account in an RMD year satisfy the RMD, and
    //    RMD dollars can't be converted. So compute the RMD on the FULL balance, then
    //    convert only what's left. 401k → Taxable; principal stays in the pool.
    let rmd = 0;
    let rmdDivisor = null;
    if (age >= rmdStartAge) {
      rmdDivisor = getDivisor(age, useTable2, spouseAgeAt(age));
      if (rmdDivisor) { rmd = trad / rmdDivisor; trad -= rmd; rTax += rmd; }
    }

    // 2b. SPOUSE's own Traditional 401k RMD (#30) — a separate forced withdrawal
    //   on the SPOUSE's age, computed after the primary's RMD (and its 401k→Taxable
    //   move) but before the conversion step (conversions only ever touch the
    //   primary's bucket, unchanged). Always Table III (spouse-as-owner Table II —
    //   i.e. the spouse's OWN spouse being >10yrs younger — is out of scope; the
    //   engine's `useTable2` already models the opposite direction, primary-owner
    //   with spouse-as-beneficiary). Principal moves to the shared household
    //   Taxable bucket and stays in the pool (rule 2b) — only the tax leaks below.
    let rmdSp = 0;
    const spouseAge = spouseAgeFor(age);
    if (tradSp > 0 && spouseAge != null && spouseAge >= spouseRmdStartAge) {
      const divSp = getDivisor(spouseAge, false, null);
      if (divSp) { rmdSp = tradSp / divSp; tradSp -= rmdSp; rTax += rmdSp; }
    }

    // Spouse still working (Option A, #30 / BUG-82): add this gap-year's contribution to
    // the held-out spouse bucket. Sourced from the accumulation sim's own per-year c401k
    // (deferral + match + IRS caps + income growth) via spouseContribByAge — reuse, not
    // re-derive. Placed AFTER growth so row.growth stays pure earnings (rule 2b), and
    // AFTER the spouse RMD so this year's contribution does not inflate this year's own
    // required distribution (the IRS divisor applies to the prior 31-Dec balance). It
    // compounds starting next year. Inert with an empty map (golden-master safe).
    const spouseContrib = spouseContribByAge[age] ?? 0;
    if (spouseContrib > 0) tradSp += spouseContrib;

    // 3. Roth conversion (window): 401k → Roth principal, on the post-RMD balance.
    //   Converts from the PRIMARY trad bucket only (unchanged — spouse conversions
    //   are out of scope for this slice).
    const conversion = Math.min(Math.max(0, conversionByAge[age] ?? 0), Math.max(0, trad));
    trad -= conversion; rRoth += conversion;

    // Income floor + cash income for THIS year (age-gated, rule 5b). spouseWages
    //   (Option A gap-year wages, #30 / BUG-82) stacks into the bracket floor like
    //   SS/pension — it is never itself withdrawn, only used to determine which
    //   bracket other withdrawals land in (see spouseIncomeFloor below for the
    //   CASH offset). 0 by default (empty map) ⇒ inert.
    const spouseWages = spouseTaxableIncomeByAge[age] ?? 0;
    const floor   = (age >= ssClaimAge ? ssTaxable : 0)
                  + (age >= pensionStartAge ? pension : 0)
                  + spouseWages;
    const ssCash  = age >= ssClaimAge ? ssGross : 0;
    const penCash = age >= pensionStartAge ? pension : 0;

    // One-time money events (windfall / purchase) for THIS year, via the shared
    //   applyMoneyEvents helper (ONE source — the engine no longer re-implements the
    //   sign logic inline). Applied BEFORE the tax solve (review fix — Gemini): an
    //   inflow lands in Taxable so it can fund the year; an outflow is folded into
    //   `needed` so the 401k dollars that fund it are taxed + grossed up like any draw.
    //   `taxableIncomeAdjustment` is the ordinary-income portion of an inflow (a flagged
    //   taxable windfall — e.g. an inherited pre-tax IRA), taxed on the floor below so
    //   a taxable inflow can't enter the pool tax-free (was dropped: the helper was
    //   orphaned and each walk inlined only the portfolio sign).
    const { portfolioAdjustment, taxableIncomeAdjustment } = applyMoneyEvents(moneyEvents, age);
    const eventInflow  = Math.max(0,  portfolioAdjustment);
    const eventOutflow = Math.max(0, -portfolioAdjustment);
    rTax += eventInflow;
    // Spouse's NET cash (Option A gap-year income, #30 / BUG-82) offsets the draw
    //   like SS/pension, but — UNLIKE SS/pension — any surplus beyond this year's
    //   spending need is BANKED into the taxable pool rather than discarded (a
    //   working spouse whose income exceeds expenses is common; silently dropping
    //   the excess would vaporize a large share of this fix's own benefit). 0 by
    //   default (empty map) ⇒ spendNeed === needed and the bank-line below adds 0.
    const spouseIncomeFloor = spouseIncomeFloorByAge[age] ?? 0;
    const spendNeed     = Math.max(0, effectiveExpenses - ssCash - penCash);
    const spouseApplied = Math.min(spouseIncomeFloor, spendNeed);
    const needed         = (spendNeed - spouseApplied) + eventOutflow;
    // The banked surplus (spouse cash beyond this year's need) is, like the 401k
    // contribution below, a real inflow that is neither growth, draw, nor tax — found
    // during the Flow-Down/ledger reconciliation work: without folding it into
    // spouseContrib's report, every downstream reconciliation surface would silently
    // misattribute it (the exact BUG-31 residual-plug class this fix exists to avoid),
    // in the common case of a working spouse earning more than the household spends.
    const spouseSurplusBanked = Math.max(0, spouseIncomeFloor - spouseApplied);
    rTax += spouseSurplusBanked;   // bank the surplus, don't drop it

    // Option A: hold the spouse Traditional bucket OUT of the drawable pool until the
    //   spouse's OWN retirement age (they are still working and still contributing to
    //   it; it is also likely pre-59½). Fully pooled from the year the spouse retires.
    //   Option A off (no spouse / no spouseRetirementAge) ⇒ pooled exactly as before.
    //   `spouseAge` is already bound from the RMD block above — reuse it, do not
    //   recompute/shadow it.
    spouseDrawable = (spouseOptionA && spouseAge != null && spouseAge < spouseRetirementAge)
      ? 0
      : tradSp;

    // Available to cover this year's outflow (spending + tax) before depletion check.
    const availableBeforeDraw = trad + spouseDrawable + rRoth + rTax + rHsa;

    // 4–5. Fund net spending (incl. one-time outflows) AND the income tax it (plus
    //   conversion/RMD) triggers, both from the pool in order Taxable → 401k → Roth →
    //   HSA. Pulling 401k dollars to fund spending OR to PAY the tax is itself ordinary
    //   income, so the tax is solved with a FIXED POINT (tax-on-tax gross-up) — the
    //   Stage-1 omission the review flagged: once Taxable is exhausted, 401k-funded tax
    //   went untaxed. The breakdown stacks conversion → RMD → (401k-funded draw+tax) on
    //   the floor and telescopes to exactly calcTax(floor+ordinary) − calcTax(floor).
    const ORDER = ["taxable", "trad", "roth", "hsa"];
    // 401k dollars consumed to fund an outflow X drawn in ORDER (Taxable absorbs
    //   first). Combined trad availability spans BOTH buckets (#30) — drawInOrder's
    //   "trad" case spills primary → spouse the same way. Uses spouseDrawable (not
    //   the raw tradSp) so a held-out gap-year bucket (Option A, BUG-82) is not
    //   counted as fundable before the spouse actually retires.
    const tradPortionOf = (X) => Math.min(Math.max(0, X - rTax), Math.max(0, trad + spouseDrawable));
    // A taxable inflow is ordinary income this year — it stacks at the BOTTOM (it fills
    //   low brackets before conversion/RMD/draw) and is taxed once via inflowTax.
    const incFloor = floor + taxableIncomeAdjustment;
    // Combined household RMD (primary + spouse) stacks as ONE bracket-accurate
    //   layer on the floor — two separate RMDs are not taxed twice (#30).
    const totalRmd = rmd + rmdSp;
    const tFloor  = calcTax(floor, filingStatus).tax;
    const tInflow = calcTax(incFloor, filingStatus).tax;
    const tConv   = calcTax(incFloor + conversion, filingStatus).tax;
    const tRmd    = calcTax(incFloor + conversion + totalRmd, filingStatus).tax;
    const inflowTax = (tInflow - tFloor) + taxableIncomeAdjustment * retStateRate;
    const convTax   = (tConv - tInflow)  + conversion * retStateRate;
    const rmdTax    = (tRmd  - tConv)    + totalRmd   * retStateRate;
    let tradDraw = 0, drawTax = 0, tax = Math.round(inflowTax + convTax + rmdTax);
    for (let i = 0; i < 8; i++) {
      tradDraw   = tradPortionOf(needed + tax);   // 401k funding spending + tax
      const tDraw = calcTax(incFloor + conversion + totalRmd + tradDraw, filingStatus).tax;
      drawTax = (tDraw - tRmd) + tradDraw * retStateRate;
      const nt = Math.round(inflowTax + convTax + rmdTax + drawTax);
      if (nt === tax) break;
      tax = nt;
    }
    // Actually withdraw spending (incl. events) + tax from the pool.
    const { shortfall: spendShort } = drawInOrder(needed, ORDER);
    const { shortfall: taxShort }   = drawInOrder(tax, ORDER);

    const balEnd = trad + tradSp + rRoth + rTax + rHsa;
    rows.push({
      age,
      balStart,
      growth,
      draw: needed,
      tax,
      inflowTax,          // raw component taxes (sum to `tax` before rounding);
      convTax,            // rmdTax feeds the displayed rmdTaxBite, convTax the
      rmdTax,             // conversion-benefit calc; inflowTax is the ordinary-income
      drawTax,            // tax on a flagged taxable inflow — one walk, no second source.
      conversion,
      rmd,                // primary RMD only — unchanged shape for existing consumers
      rmdDivisor,         // IRS divisor used this year (null when no RMD) — for the RMD table
      rmdSpouse: rmdSp,   // spouse's own RMD (0 when no spouse bucket) — #30
      tradDraw,
      trad, roth: rRoth, taxable: rTax, hsa: rHsa,
      tradSpouse: tradSp, // spouse Traditional 401k balance after this year (0 when no spouse bucket)
      // Gap-year spouse-attributable inflow THIS row (0 without a spouse): the 401k
      // contribution PLUS any banked income surplus. Both are real inflows that are
      // neither growth, draw, nor tax, so every reconciliation surface (Flow-Down,
      // the Year-by-year ledger) needs the combined figure, not just the 401k piece.
      spouseContrib: Math.round(spouseContrib + spouseSurplusBanked),
      balEnd,
      total: Math.max(0, Math.round(balEnd)),
    });

    // Depletion: the pool couldn't fund this year's spending (incl. one-time events) + tax.
    if (spendShort > 0 || taxShort > 0 || balEnd <= 0) {
      depletionAge = age;
      const outflow = needed + tax;
      const frac = outflow > 0 ? Math.min(1, Math.max(0, availableBeforeDraw / outflow)) : 0;
      yearsSustained = (age - startAge - 1) + frac;
      break;
    }
  }

  const endVal = rows.length ? rows[rows.length - 1].total : Math.max(0, Math.round(tradGross + tradGrossSpouse + roth + taxable + hsa));
  return { rows, depletionAge, yearsSustained, endVal };
}
