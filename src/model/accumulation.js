// Accumulation-phase projections derived from the simulation rows (simData).
// All pure: simData rows in, plain values out. No React. The only IRS constant
// used is RMD_START_AGE (for the lifetime-chart milestone gate); balances come
// pre-computed on the rows.

import { RMD_START_AGE, ASSUMPTIONS } from "../config/irs-2026.js";

// Sum the four account balances on a single chart/sim row. The rows consumed here
// are App-augmented simData rows that carry a "Trad 401k" key (added after
// runSimulation from tradGross); missing keys coalesce to 0 so partial rows
// (e.g. the currentSnapshot fallback) total correctly.
export function sumAccountRow(row) {
  return (row["Trad 401k"] ?? 0) + (row["Roth IRA"] ?? 0)
       + (row["Taxable"]   ?? 0) + (row["HSA"]       ?? 0);
}

// Milestone cards from the accumulation simulation: every 5th age from the next
// multiple of 5 up to retirement, plus retirement itself. Stops at the first card
// that reaches the savings target; if the target is hit between milestone ages,
// appends the exact crossing year so the user sees when they get there.
export function calcMilestones({ simData, currentAge, safeRetAge, retirementTarget }) {
  const ages = [];
  let a = Math.ceil((currentAge + 1) / 5) * 5;
  while (a <= safeRetAge) { ages.push(a); a += 5; }
  if (!ages.includes(safeRetAge)) ages.push(safeRetAge);
  ages.sort((x, y) => x - y);
  const cards = ages.map(age => {
    const row = simData.find(d => d.age === age);
    if (!row) return null;
    return { age, total: sumAccountRow(row), isRetirement: age === safeRetAge };
  }).filter(Boolean);
  const crossIdx = cards.findIndex(c => c.total >= retirementTarget);
  if (crossIdx !== -1) return cards.slice(0, crossIdx + 1);
  const crossRow = simData.find(d => sumAccountRow(d) >= retirementTarget);
  if (crossRow) {
    return [...cards, { age: crossRow.age, total: sumAccountRow(crossRow), isRetirement: false }];
  }
  return cards;
}

// Lifetime-chart milestones for the Horizon Numbers screen (V2/V5 fix — this
// logic used to live, with a hardcoded `rmdAge = 73` and a `lifeExpect ?? 90`
// fallback, inside NumbersScreen.jsx; screens render, never compute).
//
// chartData: the full lifetime series [{age, total}] (accumulation + retirement).
// lifeExpect is REQUIRED — no `?? 90` fallback; absent data is the caller's bug,
// not a number to invent (principle 10).
//
// Returns:
//   rows      — [{age, total, tag, tc}] sorted by age:
//               Today / First $1M crossing (interpolated, accumulation only) /
//               Retire / Peak (only if after retirement) /
//               RMDs start (only if RMD_START_AGE falls inside the retirement window) /
//               For life (at lifeExpect)
//   peakTotal — max total across the milestone rows (min 1), for proportional bars.
export function calcChartMilestones({ chartData, currentAge, retirementAge, lifeExpect }) {
  if (!chartData?.length) return { rows: [], peakTotal: 1 };
  const rows = [];

  const balAtAge = (age) => {
    const exact = chartData.find(d => d.age === age);
    if (exact) return exact.total;
    for (let i = 0; i < chartData.length - 1; i++) {
      const a0 = chartData[i], a1 = chartData[i + 1];
      // Skip a zero-width interval (duplicate ages) — dividing by (a1.age -
      // a0.age) === 0 would yield NaN.
      if (a1.age === a0.age) continue;
      if (age >= a0.age && age <= a1.age)
        return a0.total + (a1.total - a0.total) * (age - a0.age) / (a1.age - a0.age);
    }
    // Age outside the charted range: null, never a fabricated $0 (principle 10 —
    // missing data is not zero). The filter below drops null-total anchor rows,
    // so the milestone simply doesn't render instead of showing a fake value.
    return null;
  };

  // First $1M crossing (linear interpolation between the bracketing rows)
  let firstMilAge = null;
  for (let i = 0; i < chartData.length - 1; i++) {
    if (chartData[i].total < 1e6 && chartData[i + 1].total >= 1e6) {
      firstMilAge = Math.round(chartData[i].age +
        (1e6 - chartData[i].total) / (chartData[i + 1].total - chartData[i].total));
      break;
    }
  }

  // Peak balance row
  const peakRow = chartData.reduce((best, d) => d.total > (best?.total ?? 0) ? d : best, null);

  rows.push({ age: currentAge, total: balAtAge(currentAge), tag: "Today", tc: "good" });

  if (firstMilAge && firstMilAge > currentAge && firstMilAge < retirementAge) {
    rows.push({ age: firstMilAge, total: 1e6, tag: "First $1M", tc: "accent" });
  }

  rows.push({ age: retirementAge, total: balAtAge(retirementAge), tag: "Retire", tc: "accent" });

  if (peakRow && peakRow.age > retirementAge) {
    rows.push({ age: peakRow.age, total: peakRow.total, tag: "Peak", tc: "warm" });
  }

  if (RMD_START_AGE > retirementAge && RMD_START_AGE < lifeExpect) {
    rows.push({ age: RMD_START_AGE, total: balAtAge(RMD_START_AGE), tag: "RMDs start", tc: "warm" });
  }

  rows.push({ age: lifeExpect, total: balAtAge(lifeExpect), tag: "For life", tc: "warm" });

  const sorted = rows.sort((a, b) => a.age - b.age).filter(r => r.total != null);
  const peakTotal = sorted.reduce((m, r) => Math.max(m, r.total), 1);
  return { rows: sorted, peakTotal };
}

// ── Accumulation display rows for the Year-by-year table (WI-2.5) ────────────
// BUG-35: working-year rows on the GROSS basis, matching the rest of the app now
// (the 401k is shown at its full pre-tax value; Roth/HSA full; Taxable net of LTCG
// drag). `contrib` and `growth` are the gross simulation figures, so the row
// reconciles exactly:  prevTotal + contrib + growth = total  (locked by a test).
//
// Returns rows for ages currentAge+1 … safeRetAge (the building years up to and
// including the nest-egg year). Retirement-phase rows come from the walk
// (buildYearlyRows) and start the year after. When already retired
// (safeRetAge === currentAge) there are no rows and this returns [].
//
// Each row: { age, year, total, contrib, growth, draw: 0, tax,
//             rmd: null, conversion, phase: "accum" }.
// draw is an explicit 0 (no spending withdrawals while accumulating). `conversion`
// is the working-year 401k→Roth event amount (null when none → screen renders "—"),
// and `tax` is the tax + any early-withdrawal penalty that conversion leaked from the
// portfolio — so the ledger still reconciles: prevTotal + contrib + growth − tax = total.
// rmd is null (not applicable in working years).
// fedMarginal is accepted for signature compatibility (callers/tests still pass it)
// but no longer used — rows are gross now (BUG-35), so there's no marginal discount.
export function buildAccumulationRows({ simData, fedMarginal, currentAge, currentYear, safeRetAge }) {
  void fedMarginal; // intentionally unused; kept in the signature for callers
  return (simData ?? [])
    .filter(d => d.age <= safeRetAge)
    .map(d => {
      const contrib = Math.round((d.c401k ?? 0) + (d.cRoth ?? 0) + (d.cTaxable ?? 0) + (d.cHSA ?? 0));
      const growth  = Math.round(d.growth ?? 0);
      const convEvent = Math.round(d.convEvent ?? 0);
      // Money-event outflow that actually LEFT the portfolio this year (BUG-74:
      // the requested eventNet minus any unfundable shortfall — you can't show
      // a draw the accounts never paid). Was a hardcoded 0, which hid event
      // spending from the ledger entirely. Inflow events (positive eventNet)
      // still surface only in the Portfolio column (no dedicated column).
      const eventOutflow = Math.max(0, -(d.eventNet ?? 0) - (d.eventShortfall ?? 0));
      return {
        age: d.age,
        year: currentYear + (d.age - currentAge),
        total: sumAccountRow(d),
        contrib,
        growth,
        draw: Math.round(eventOutflow),
        // conversion tax/penalty + BUG-74 event-funding 401k draw tax/penalty —
        // every dollar the events leaked from the portfolio beyond the draw itself.
        tax: Math.round((d.convEventTax ?? 0) + (d.eventDrawTax ?? 0)),
        rmd: null,
        conversion: convEvent > 0 ? convEvent : null,
        phase: "accum",
        withdrawalRatePct: null,
      };
    });
}

// Accumulation chart rows ({age, total}) from current age through retirement — the
// portfolio's growth phase, and the starting balance for the retirement walk.
// Always seeds the current-age row from the current balances (the simulation's own
// rows start at currentAge + 1): without it the lifetime series has no "today"
// point, and calcChartMilestones' Today anchor had no row to read — the source of
// the Accounts-tab "Today · $0" pill. Same basis as horizonProps.currentTotalSaved,
// so the pill and the Accounts banner agree by construction.
export function buildAccumChart({ simData, safeRetAge, currentAge, bal401k, balRoth, balTaxable, balHSA }) {
  const rows = [{ age: currentAge, total: bal401k + balRoth + balTaxable + balHSA }];
  for (const d of simData) {
    rows.push({ age: d.age, total: sumAccountRow(d) });
    if (d.age >= safeRetAge) break;
  }
  return rows;
}

// ── Tax diversification score (#56) ──────────────────────────────────────────
// The tax-character split of the portfolio AT RETIREMENT (same three buckets the
// Accounts tab shows): pre-tax (Traditional 401k), tax-free (Roth + HSA), and
// taxable. Returns integer percentages of totalAtRet, a threshold-classified
// concentration level + render-ready label + tone (rule 10 — the screen maps a
// STRING to a color, never compares a %), and the "if rates rise N pts" companion
// cost against the projected lifetime RMD tax bill.
//
// Concentration keys off the PRE-TAX share (the rising-rate risk): below MODERATE
// = "low" (well diversified, good tone); MODERATE..HIGH = "moderate" (pre-tax
// heavy, warm); above HIGH = "high" (highly concentrated, warm — there is no red
// tone in the Horizon palette, so "high" differs from "moderate" by COPY, not a
// fabricated color).
//
// rateRiseCost = rmdTaxBite × (RATE_RISE_SCENARIO_PCT/100) / effectiveRMDTaxRate —
// null when effectiveRMDTaxRate is 0 (div-by-zero guard) so the screen renders "—".
// Returns null when totalAtRet ≤ 0 (nothing to classify) — screen shows nothing.
export function calcTaxDiversification({ trad, roth, taxable, hsa, totalAtRet, rmdTaxBite, effectiveRMDTaxRate }) {
  if (!(totalAtRet > 0)) return null;
  const preTax  = Math.max(0, trad ?? 0);
  const taxFree = Math.max(0, roth ?? 0) + Math.max(0, hsa ?? 0);
  const taxableAmt = Math.max(0, taxable ?? 0);

  const preTaxPct  = Math.round((preTax  / totalAtRet) * 100);
  const taxFreePct = Math.round((taxFree / totalAtRet) * 100);
  const taxablePct = Math.round((taxableAmt / totalAtRet) * 100);

  const level = preTaxPct > ASSUMPTIONS.TAX_DIVERSIFICATION_HIGH_PCT ? "high"
    : preTaxPct >= ASSUMPTIONS.TAX_DIVERSIFICATION_MODERATE_PCT ? "moderate" : "low";
  const levelLabel = level === "high" ? "Highly concentrated"
    : level === "moderate" ? "Pre-tax heavy" : "Well diversified";
  const tone = level === "low" ? "good" : "warm";

  const riseRatePct = ASSUMPTIONS.RATE_RISE_SCENARIO_PCT;
  const rateRiseCost = effectiveRMDTaxRate > 0
    ? Math.round((rmdTaxBite ?? 0) * (riseRatePct / 100) / effectiveRMDTaxRate)
    : null;

  return {
    preTax, taxFree, taxable: taxableAmt,
    preTaxPct, taxFreePct, taxablePct,
    level, levelLabel, tone,
    riseRatePct, rateRiseCost,
    // The pre-tax share crossing the HIGH threshold is what the concentration
    // signal fires on — the flag travels with the data (principle 8).
    concentrated: level === "high",
  };
}
