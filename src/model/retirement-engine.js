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
//   balEnd(total) = balStart(total)·(1 + rReal) − draw − tax (+ events)
// because conversions and RMDs are internal transfers that preserve the total;
// only `draw` (net spending) and `tax` leave the pool. So every existing consumer
// of the walk (chart, longevity, Flow-Down, Year-by-year) reads the same
// row shape — now with correct, gross-seeded, taxed-once numbers, plus per-account
// detail. This keeps the BUG-31 single-walk guarantee intact.

import { calcTax } from "./taxes.js";
import { getDivisor } from "./rmd.js";

export function buildRetirementWalkByAccount({
  startAge,                 // safeRetAge
  endAge,                   // safeLifeExp (chart) or a high cap (longevity)
  rReal,
  // GROSS balances at retirement (no after-tax haircut — that is the BUG-35 fix)
  tradGross = 0,
  roth = 0,
  taxable = 0,
  hsa = 0,
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
}) {
  const rows = [];
  let trad = tradGross, rRoth = roth, rTax = taxable, rHsa = hsa;
  let depletionAge = null;
  let yearsSustained = Infinity;

  const spouseAgeAt = (age) =>
    useTable2 && spouseCurrentAge != null && currentAge != null
      ? Math.round(spouseCurrentAge + (age - currentAge))
      : null;

  // Draw `amount` from the accounts in a fixed order; returns the split actually
  // withdrawn and mutates the running balances. Used for both spending and tax.
  const drawInOrder = (amount, order) => {
    let rem = amount;
    const taken = { trad: 0, roth: 0, taxable: 0, hsa: 0 };
    for (const acct of order) {
      if (rem <= 0) break;
      const bal = acct === "trad" ? trad : acct === "roth" ? rRoth : acct === "taxable" ? rTax : rHsa;
      const t = Math.min(rem, Math.max(0, bal));
      taken[acct] = t;
      rem -= t;
      if (acct === "trad") trad -= t;
      else if (acct === "roth") rRoth -= t;
      else if (acct === "taxable") rTax -= t;
      else rHsa -= t;
    }
    return { taken, shortfall: rem };
  };

  for (let age = startAge + 1; age <= endAge; age++) {
    const balStart = trad + rRoth + rTax + rHsa;

    // 1. Growth (real return) per account.
    const gTrad = trad * rReal, gRoth = rRoth * rReal, gTax = rTax * rReal, gHsa = rHsa * rReal;
    trad += gTrad; rRoth += gRoth; rTax += gTax; rHsa += gHsa;
    const growth = gTrad + gRoth + gTax + gHsa;

    // 2. Roth conversion (window): 401k → Roth principal (tax handled in step 5).
    const conversion = Math.min(Math.max(0, conversionByAge[age] ?? 0), Math.max(0, trad));
    trad -= conversion; rRoth += conversion;

    // 3. RMD (forced): 401k → Taxable; principal stays in the pool, only tax leaks.
    let rmd = 0;
    let rmdDivisor = null;
    if (age >= rmdStartAge) {
      rmdDivisor = getDivisor(age, useTable2, spouseAgeAt(age));
      if (rmdDivisor) { rmd = trad / rmdDivisor; trad -= rmd; rTax += rmd; }
    }

    // Income floor + cash income for THIS year (age-gated, rule 5b).
    const floor   = (age >= ssClaimAge ? ssTaxable : 0) + (age >= pensionStartAge ? pension : 0);
    const ssCash  = age >= ssClaimAge ? ssGross : 0;
    const penCash = age >= pensionStartAge ? pension : 0;
    const needed  = Math.max(0, effectiveExpenses - ssCash - penCash);

    // Available to cover this year's outflow (spending + tax) before depletion check.
    const availableBeforeDraw = trad + rRoth + rTax + rHsa;

    // 4. Fund the net spending need: Taxable → 401k → Roth → HSA.
    const ORDER = ["taxable", "trad", "roth", "hsa"];
    const { taken: spendTaken, shortfall: spendShort } = drawInOrder(needed, ORDER);
    const tradDraw = spendTaken.trad;   // ordinary-income portion of the draw

    // 5. ONE bracket-accurate ordinary tax on conversion + RMD + extra 401k draw,
    //    DECOMPOSED by source so each component's tax is attributable: the RMD
    //    component feeds the displayed rmdTaxBite, the conversion component feeds
    //    the conversion-benefit calc — all read out of this ONE walk (BUG-31), so
    //    the headline RMD/conversion numbers can never diverge from longevity.
    //    Stacking conversion → RMD → draw on the income floor and summing
    //    telescopes to exactly calcTax(floor+ordinary) − calcTax(floor), so the
    //    total `tax` equals a single stackedIncomeTax(ordinary, floor) call.
    //    (In practice conversions (pre-RMD window) and RMDs (73+) don't co-occur,
    //    so the split is unambiguous year to year.)
    const tFloor = calcTax(floor, filingStatus).tax;
    const tConv  = calcTax(floor + conversion, filingStatus).tax;
    const tRmd   = calcTax(floor + conversion + rmd, filingStatus).tax;
    const tDraw  = calcTax(floor + conversion + rmd + tradDraw, filingStatus).tax;
    // Raw (unrounded) component taxes — sum across years then round ONCE so the
    // displayed rmdTaxBite/conversion cost don't accumulate per-year rounding drift.
    const convTax = (tConv - tFloor) + conversion * retStateRate;
    const rmdTax  = (tRmd  - tConv)  + rmd        * retStateRate;
    const drawTax = (tDraw - tRmd)   + tradDraw   * retStateRate;
    const tax = Math.round(convTax + rmdTax + drawTax);
    // Tax leaks from the pool in the same order (taxed money first).
    const { shortfall: taxShort } = drawInOrder(tax, ORDER);

    // 6. One-time money events (windfall/purchase) applied to taxable after the draw.
    const eventAdj = moneyEvents.reduce((s, ev) =>
      ev.age === age ? s + (ev.isInflow ? Math.abs(ev.amount) : -Math.abs(ev.amount)) : s, 0);
    if (eventAdj >= 0) rTax += eventAdj;
    else { const { shortfall } = drawInOrder(-eventAdj, ORDER); void shortfall; }

    const balEnd = trad + rRoth + rTax + rHsa;
    rows.push({
      age,
      balStart,
      growth,
      draw: needed,
      tax,
      convTax,            // raw component taxes (sum to `tax` before rounding);
      rmdTax,             // rmdTax feeds the displayed rmdTaxBite, convTax the
      drawTax,            // conversion-benefit calc — one walk, no second source.
      conversion,
      rmd,
      rmdDivisor,         // IRS divisor used this year (null when no RMD) — for the RMD table
      tradDraw,
      trad, roth: rRoth, taxable: rTax, hsa: rHsa,
      balEnd,
      total: Math.max(0, Math.round(balEnd)),
    });

    // Depletion: the pool couldn't fund this year's spending + tax.
    if (spendShort > 0 || taxShort > 0 || balEnd <= 0) {
      depletionAge = age;
      const outflow = needed + tax;
      const frac = outflow > 0 ? Math.min(1, Math.max(0, availableBeforeDraw / outflow)) : 0;
      yearsSustained = (age - startAge - 1) + frac;
      break;
    }
  }

  const endVal = rows.length ? rows[rows.length - 1].total : Math.max(0, Math.round(tradGross + roth + taxable + hsa));
  return { rows, depletionAge, yearsSustained, endVal };
}
