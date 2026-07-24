// ── Signals — severity-ranked, dollar-quantified nudges (WI-1.2 / #89) ───────
//
// The "one brain" behind the Plan screen's signals strip (and, later, the
// Strategies screen's "For you" strip — SP-1 in docs/ROADMAP.md, so the two
// surfaces can never rank differently).
//
// calcSignals does NOT recompute anything: every input is a value App.jsx
// already derives from the model layer —
//   extraMatch                   ← calcOptimizedAllocation (budget.js)
//   adjustedNetConversionBenefit ← evaluateConversionPlan (conversion-evaluation.js)
//   budgetDeficit                ← calcSavingsCapacity (budget.js)
// Recomputing here would be the BUG-25 #4 / BUG-31 "two implementations of one
// calc" shape; passing the values keeps one definition per number.
//
// Returns at most `max` signals (default 2 — the Plan strip's hard cap lives
// HERE so it is unit-tested in the model, not implied by screen slicing).
// Ranking: the dollar-quantified nudges rank first (by dollars descending); the
// low-market-odds CONFIDENCE signal (no `dollars`, carries `pct` instead)
// follows them. Each entry is render-ready:
//   dollar nudges:      { id, title, body, dollars, target: { screen, subView } }
//   confidence signal:  { id, title, body, pct,     target: { screen } }
// dollars/pct are integers; target deep-links via HorizonShell's navigate().
// No qualifying signals → [] (the strip renders nothing — no empty chrome).

import { ASSUMPTIONS } from "../config/irs-2026.js";

export function calcSignals({
  extraMatch = 0,                   // unclaimed-match headroom the surplus could capture
  adjustedNetConversionBenefit = 0, // net conversion benefit after IRMAA/ACA costs
  budgetDeficit = 0,                // expenses + contributions overshoot of after-tax income
  monteCarloSuccessPct = null,      // Monte Carlo success rate (integer %), null when unavailable
  preTaxConcentrationPct = null,    // pre-tax share of the portfolio (integer %), null when unavailable
  preTaxConcentrationCost = null,   // $ the pre-tax concentration adds to the RMD bill if rates rise (rate-rise companion)
}, max = 2) {
  const signals = [];

  // 1. Unclaimed employer match — only fires in formula-match mode, where the
  //    match is contingent on the employee's own deferral (extraMatch is 0 in
  //    flat mode by construction in calcOptimizedAllocation).
  if (extraMatch > 0) {
    signals.push({
      id: "match",
      title: "Free employer match on the table",
      body: "Your 401k contribution is below what your employer will match. Redirecting surplus captures it.",
      dollars: Math.round(extraMatch),
      // BUG-43: "numbers"/"flow" hasn't existed since PR #38 consolidated the
      // Money-flow tab into Statement (2026-06-24) — the tab list is
      // statement/budget/accounts/taxes/yearly. Retargeted to Budget, which
      // owns the savings waterfall this nudge is about.
      target: { screen: "numbers", subView: "budget" },
    });
  }

  // 2. Roth conversion benefit — material only above one optimizer search step
  //    (ASSUMPTIONS.CONVERSION_STEP, $5k): below that, the "benefit" is within
  //    the search granularity and not an actionable nudge.
  if (adjustedNetConversionBenefit > ASSUMPTIONS.CONVERSION_STEP) {
    signals.push({
      id: "conversion",
      title: "A Roth conversion window is open",
      body: "Converting in your low-income years beats paying RMD tax later — even after healthcare costs.",
      dollars: Math.round(adjustedNetConversionBenefit),
      // WI-3.6: the conversion planner flow is now the decision surface for this
      // nudge (was Numbers → Year by year, a pre-flow stopgap before the
      // Strategies screen's interactive flow existed).
      target: { screen: "strategies", subView: "conversion" },
    });
  }

  // 3. Budget deficit — planned spending + saving exceeds after-tax income.
  if (budgetDeficit > 0) {
    signals.push({
      id: "deficit",
      title: "Your plan spends more than you earn",
      body: "Living expenses plus contributions exceed after-tax income. Something has to give.",
      dollars: Math.round(budgetDeficit),
      // BUG-43: see the match signal's comment above — retargeted to Budget.
      target: { screen: "numbers", subView: "budget" },
    });
  }

  // 3b. Pre-tax concentration — most of the portfolio is tax-deferred, so a
  //     future rate hike quietly taxes a larger share. Dollar-quantified via the
  //     rate-rise companion (preTaxConcentrationCost) so it ranks among the
  //     dollar nudges, not the confidence signal. Fires only above the HIGH
  //     threshold (calcTaxDiversification.concentrated), gated in App.jsx.
  if (preTaxConcentrationPct != null && preTaxConcentrationCost != null
      && preTaxConcentrationPct > ASSUMPTIONS.TAX_DIVERSIFICATION_HIGH_PCT) {
    signals.push({
      id: "concentration",
      title: "Most of your savings is pre-tax",
      body: "A large pre-tax balance means a future rate increase taxes more of your retirement. Roth space diversifies that risk.",
      dollars: Math.round(preTaxConcentrationCost),
      target: { screen: "numbers", subView: "accounts" },
    });
  }

  // 4. Low market-survival odds — the Monte Carlo Range lens says a meaningful
  //    share of market paths deplete before the plan age. This is a CONFIDENCE
  //    signal, not a dollar nudge (it carries `pct`, not `dollars`), so it sorts
  //    after the dollar-quantified signals below. Deep-links to the Strategies
  //    "Working longer" card (#55) — the concrete lever most directly addressed
  //    by "retiring a little later" from the body copy below.
  if (monteCarloSuccessPct != null && monteCarloSuccessPct < ASSUMPTIONS.MONTE_CARLO_LOW_ODDS_PCT) {
    signals.push({
      id: "lowodds",
      title: "Market swings could strain this plan",
      body: "In a meaningful share of market paths your savings run short before your plan age. Retiring a little later or trimming spending lifts the odds.",
      pct: monteCarloSuccessPct,
      target: { screen: "strategies", subView: "worklonger" },
    });
  }

  // Dollar-quantified nudges rank first (by dollars desc); the confidence signal
  // (no `dollars`) follows. SP-3: the pill + confidence driver + Range caption are
  // the primary confidence surfaces, so this warning ranks below actionable dollar
  // nudges here without being the only place the user learns of low odds.
  const dollarSignals = signals.filter(s => s.dollars != null).sort((a, b) => b.dollars - a.dollars);
  const pctSignals    = signals.filter(s => s.dollars == null);
  return [...dollarSignals, ...pctSignals].slice(0, Math.max(0, max));
}

// ── Signal render helpers (one source, two surfaces: Plan's strip + Strategies'
// "For you" strip — CodeRabbit PR #57 dedup finding) ──────────────────────────
// The warm-toned ids (severity signals, no positive-framing dollar figure) vs.
// good-toned (an opportunity to capture). New signal ids default to "good"
// unless added here — keeps future ids from silently drifting between the two
// screens, which is exactly the class of bug this extraction closes.
const SIGNAL_WARM_IDS = new Set(["deficit", "lowodds"]);

// "good" | "warm" — a THEME KEY (t.good / t.good), never a literal color, so
// screens stay theme-aware without re-deriving the map (rule 10).
export function signalToneKey(sig) {
  return SIGNAL_WARM_IDS.has(sig.id) ? "warm" : "good";
}

// Render-ready value text — a signal carries either `pct` (confidence signals)
// or `dollars` (nudges), never both; the caller formats `dollars` (fmt is a
// display concern, kept in the screen) and passes it in.
export function signalValueText(sig, fmtDollars) {
  return sig.pct != null ? `${sig.pct}%` : fmtDollars(sig.dollars);
}
