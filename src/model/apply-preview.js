// Apply-with-preview payload builders (WI-3.9). This is the ONE construction
// path for "here's what applying this suggestion changes" payloads —
// ApplyPreviewModal.jsx renders them VERBATIM (rule 10: the modal computes
// nothing, not even a sign). Everything a screen needs — formatted strings,
// delta direction, delta tone — is decided here, once, so every Apply site
// (today's conversion optimizer; WI-3.7's surplus allocation; WI-3.8's
// commitPlan sites; #86's scenario-overlaid recompute) shows the same visual
// language without re-implementing delta/edge-case semantics per site.
//
// The three format kinds:
//   "money"     — a CALM, abbreviated before/after dollar figure via the
//                 canonical `fmt` (src/formatters.js) — "−$10k" not
//                 "−$9,854" (2026-07-16 "calm money" consolidation: a preview
//                 metric is a headline-style at-a-glance figure, not an
//                 editable-input readout, so it gets the calm tier).
//   "longevity" — a { years, depletionAge } pair. `years === Infinity` means
//                 "never depletes within the walk horizon" (BUG-35's
//                 trivially-sustainable case) and gets its own copy + delta
//                 vocabulary instead of pretending it's a finite number.
//                 `years == null` means "not knowable yet" (e.g. no prior
//                 committed plan to compare against) — renders "—", same as
//                 a missing money side, never a fabricated number.
//   "percent"   — a WHOLE-NUMBER percent (15.3 means 15.3%, matching this
//                 codebase's existing convention, e.g. withdrawalRate). Delta
//                 is in percentage points ("+2.1 pts" / "−2.1 pts").

import { fmt, fmtFull, fmtSigned, fmtPct } from "../formatters.js";

// `fmtMoney` — kept as a named export (aliased to the canonical fmtFull) for
// existing importers (action-line copy below, and tests that check exact
// full-precision formatting). New code that wants FULL precision should
// import fmtFull from "../formatters.js" directly; this alias exists only so
// nothing importing `fmtMoney` from this module needs to change.
export const fmtMoney = fmtFull;

function moneyMetric({ id, label, before, after, betterDir }) {
  // Calm, abbreviated display — a preview metric is a headline-style figure.
  const beforeStr = fmt(before);
  const afterStr = fmt(after);

  let delta;
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) {
    // Missing either side — nothing to compare (e.g. a candidate that hasn't
    // been computed yet). Never fabricate a delta from a half-known pair.
    delta = { dir: "none", label: "—", tone: "neutral" };
  } else {
    // Round before differencing — matches what fmt() actually displays (to
    // the nearest whole dollar/k/M step), so a sub-dollar float gap between
    // before/after can never render a nonzero delta beside two identical-
    // looking dollar figures (Gemini review; rounding rule preserved from the
    // pre-calm implementation, now rounding to the whole dollar the abbrev-
    // iation itself is built from).
    const d = Math.round(after) - Math.round(before);
    if (d === 0) {
      delta = { dir: "none", label: "no change", tone: "neutral" };
    } else {
      const dir = d > 0 ? "up" : "down";
      delta = { dir, label: fmtSigned(d), tone: dir === betterDir ? "good" : "warm" };
    }
  }
  return { id, label, before: beforeStr, after: afterStr, delta };
}

// Longevity's own copy — "lasts beyond your plan" instead of "$Infinity",
// and the depletion age folded into the SAME row as the years-sustained
// figure (one row, two views of one fact — the roadmap's explicit framing).
// A missing/null `years` (e.g. no prior committed plan to compare against)
// renders "—" — never a fabricated number.
function renderLongevity(v) {
  if (v == null || v.years == null) return "—";
  const { years, depletionAge } = v;
  if (years === Infinity) return "lasts beyond your plan";
  // Calm numbers (2026-07-16): phrase longevity as an AGE, not a decimal
  // duration — "to age 87" reads clearer than "depletes at 87 (21.3 yrs)" and
  // drops the stray decimal. The rare null-depletion case shows whole years.
  if (depletionAge == null) return `~${Math.round(years)} yrs`;
  return `to age ${depletionAge}`;
}

function longevityMetric({ id, label, before, after, betterDir }) {
  const beforeStr = renderLongevity(before);
  const afterStr = renderLongevity(after);

  const beforeMissing = before == null || before.years == null;
  const afterMissing  = after == null || after.years == null;

  let delta;
  if (beforeMissing || afterMissing) {
    // Missing either side — mirrors moneyMetric's null/non-finite guard:
    // never fabricate a delta from a half-known pair.
    delta = { dir: "none", label: "—", tone: "neutral" };
  } else {
    const beforeInf = before.years === Infinity;
    const afterInf = after.years === Infinity;

    if (beforeInf && afterInf) {
      delta = { dir: "none", label: "no change", tone: "neutral" };
    } else if (afterInf && !beforeInf) {
      // Crossing INTO trivially-sustainable — always an improvement in years,
      // but its tone still respects betterDir (a longevity row could in theory
      // be framed the other way by a future consumer).
      delta = { dir: "up", label: "beyond plan", tone: betterDir === "up" ? "good" : "warm" };
    } else if (beforeInf && !afterInf) {
      // Crossing OUT of trivially-sustainable — the plan now has a depletion
      // age where it didn't before. Always framed as "shorter".
      delta = { dir: "down", label: "shorter", tone: betterDir === "up" ? "warm" : "good" };
    } else {
      // Diff the SAME basis renderLongevity displays: depletion AGES when both
      // are known ("to age X" is the display), whole years only in the rare
      // null-depletion fallback. Rounding years here while showing ages could
      // render "to age 87 → to age 88 · no change" (or "+2 yrs" beside two
      // identical ages) whenever the walks' year-fractions straddle .5
      // differently — the ages and the rounded durations are different bases.
      const bothAges = before.depletionAge != null && after.depletionAge != null;
      const d = bothAges
        ? after.depletionAge - before.depletionAge
        : Math.round(after.years) - Math.round(before.years);
      if (d === 0) {
        delta = { dir: "none", label: "no change", tone: "neutral" };
      } else {
        const dir = d > 0 ? "up" : "down";
        const sign = d > 0 ? "+" : "−";
        delta = { dir, label: `${sign}${Math.abs(d)} yrs`, tone: dir === betterDir ? "good" : "warm" };
      }
    }
  }
  return { id, label, before: beforeStr, after: afterStr, delta };
}

// Percent metric before/after strings use the canonical fmtPct (src/formatters.js),
// which takes an ALREADY-whole percent (15.3 → "15.3%") — matching this
// codebase's convention that percent FIELDS are whole-number percents, not
// fractions. (Byte-identical to the private fmtPercent this replaced, incl.
// null/non-finite → "—".)
function percentMetric({ id, label, before, after, betterDir }) {
  const beforeStr = fmtPct(before);
  const afterStr = fmtPct(after);

  let delta;
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) {
    delta = { dir: "none", label: "—", tone: "neutral" };
  } else {
    // Round BEFORE differencing (same rule as money/longevity) so a sub-0.1-pt
    // float gap never shows a delta beside two identically-displayed "X.X%"
    // figures — e.g. before=15.04, after=15.06 rounds to 15.0/15.1 → "no
    // change" would be wrong; both round to the SAME displayed value only
    // when their rounded forms agree.
    const b = Number(before.toFixed(1));
    const a = Number(after.toFixed(1));
    const d = Number((a - b).toFixed(1));
    if (d === 0) {
      delta = { dir: "none", label: "no change", tone: "neutral" };
    } else {
      const dir = d > 0 ? "up" : "down";
      const sign = d > 0 ? "+" : "−";
      delta = { dir, label: `${sign}${Math.abs(d).toFixed(1)} pts`, tone: dir === betterDir ? "good" : "warm" };
    }
  }
  return { id, label, before: beforeStr, after: afterStr, delta };
}

// One metric row: signed-delta computation, dir/tone mapping (`betterDir`
// says which direction reads as "good"), formatting, and the Infinity/null
// edge states — all in one place so no Apply site re-derives this logic.
export function buildPreviewMetric({ id, label, before, after, betterDir = "up", format = "money" }) {
  if (format === "longevity") return longevityMetric({ id, label, before, after, betterDir });
  if (format === "percent") return percentMetric({ id, label, before, after, betterDir });
  return moneyMetric({ id, label, before, after, betterDir });
}

// ── verdictDisplay (#85 readiness) ──────────────────────────────────────────
// Maps a `verdictForMargin` (what-if.js) result string to a render-ready
// { label, tone } pair — the ONE place that turns the comfortable/tight/
// unaffordable vocabulary into copy + a color token, so #85's verdict badge
// (reserved on every apply-preview payload above) and any future surface that
// shows a verdict (the Strategies "For you" strip, a Range/Monte-Carlo lens)
// use identical wording and tone.
//
// This is the ONE source of truth for the verdict → { label, tone } mapping.
// The two Horizon maps that used to disagree with it — VERDICT_TINT (fields.jsx,
// the tick rails) and VERDICT_COPY (LifeEventSheet, the verdict card) — now
// DERIVE their tone from verdictDisplay(v).tone, so the three can never drift
// again (they only carry their own surface-specific COPY). Tones map through the
// shared toneToken helper (horizon/shared.jsx): good / warm / accent. VerdictBadge
// now renders "accent" too, so "unaffordable" is accent-toned — the earlier
// warm-downgrade (a workaround for VerdictBadge lacking an accent branch) is
// retired. The tone enum is locked in apply-site-contract.test.js.
const VERDICT_DISPLAY = {
  comfortable:  { label: "Comfortable", tone: "good" },
  tight:        { label: "Tight",       tone: "warm" },
  unaffordable: { label: "Doesn't fit", tone: "accent" },
};

export function verdictDisplay(verdict) {
  return VERDICT_DISPLAY[verdict] ?? null;
}

// The `available` gate for the conversion-optimizer Apply site. Mirrors
// Classic App.jsx:3291-3293 VERBATIM: a healthcare toggle must be on (the
// optimizer only searches with IRMAA/ACA costs in the objective when one
// applies) AND the suggestion must actually differ from the current setting
// (amount by more than $4,999, or a different start age). This doubles as
// the "suggestion clears once applied" guarantee: `applyConversionSuggestion`
// writes the candidate's amount/start age as the new current ones, which
// makes both OR-branches false on the next render — locked by a test so the
// guarantee is machine-checked, not just a manual observation.
export function isSuggestionApplicable({
  optimizerResult, annualConversion, resolvedStartAge, hasMedicare, hasMarketplaceInsurance,
}) {
  return !!optimizerResult
    && (hasMedicare || hasMarketplaceInsurance)
    && (Math.abs(optimizerResult.optimalConversion - annualConversion) > 4_999
      || optimizerResult.optimalStartAge !== resolvedStartAge);
}

// The full Apply-preview payload for the conversion optimizer suggestion.
// `current` and `candidate` are two already-computed engine outputs (this
// function never runs the engine — App.jsx runs both, per Part A4, so the
// preview and the optimizer search can never diverge). `refAge` is the age
// the "Balance at ___" row is measured at (safeLifeExp).
export function buildConversionPreview({ current, candidate, suggestion, refAge }) {
  return {
    title: "Apply optimizer suggestion",
    action: `Convert ${fmt(suggestion.optimalConversion)}/yr starting at age ${suggestion.optimalStartAge} `
      + `(now: ${fmt(current.annualConversion)}/yr from age ${current.startAge})`,
    confirmLabel: "Apply",
    metrics: [
      buildPreviewMetric({
        id: "netBenefit", label: "Net benefit after healthcare",
        before: current.adjustedNetConversionBenefit, after: candidate.netBenefit, betterDir: "up",
      }),
      buildPreviewMetric({
        id: "longevity", label: "Portfolio lasts", format: "longevity",
        before: { years: current.yearsSustained, depletionAge: current.depletionAge },
        after: { years: candidate.yearsSustained, depletionAge: candidate.depletionAge },
        betterDir: "up",
      }),
      buildPreviewMetric({
        id: "balAtRef", label: `Balance at ${refAge}`,
        before: current.balAtRef, after: candidate.balAtRef, betterDir: "up",
      }),
      buildPreviewMetric({
        id: "rmdTax", label: "Lifetime RMD tax",
        before: current.rmdTaxBite, after: candidate.rmdTaxBite, betterDir: "down",
      }),
    ],
    note: "Preview uses the same per-account engine as your headline numbers.",
    verdict: null, // RESERVED render slot — WI-5.4 (#85) attaches { label, tone }
  };
}

// The full Apply-preview payload for the WI-3.7 surplus-allocation Apply site
// (the Budget tab's "optimized allocation" suggestion). `current`/`candidate`
// are two already-computed scenario outputs — this function never runs the
// engine itself. `deployment` describes the allocation being proposed
// (`totalExtra`/yr, the `savingsSurplusPct` slider value, and the surplus
// dollar figure it's a percent of) so the action line can spell out exactly
// what "Apply" does.
//
// NOTE: the candidate scenario here is produced via calcWhatIfDelta (a
// contribOverrides re-sim), which walks the retirement phase with the
// BLENDED buildRetirementDrawdown, not the per-account engine
// (buildRetirementWalkByAccount) that produces the app's headline numbers —
// see what-if.js's module doc. The `note` below says so honestly rather than
// reusing buildConversionPreview's "per-account engine" language, which
// would be inaccurate here.
export function buildSurplusPreview({ current, candidate, deployment }) {
  return {
    title: "Apply optimized allocation",
    action: `Deploy ${fmt(deployment.totalExtra)}/yr (${deployment.pct}% of your `
      + `${fmt(deployment.availableSurplus)} surplus) in IRS-priority order`,
    confirmLabel: "Apply",
    metrics: [
      buildPreviewMetric({
        id: "contribTotal", label: "Annual contributions",
        before: current.contribTotal, after: candidate.contribTotal, betterDir: "up",
      }),
      buildPreviewMetric({
        id: "savingsRate", label: "Savings rate", format: "percent",
        before: current.savingsRatePct, after: candidate.savingsRatePct, betterDir: "up",
      }),
      buildPreviewMetric({
        id: "totalAtRet", label: "Nest egg at retirement",
        before: current.totalAtRet, after: candidate.totalAtRet, betterDir: "up",
      }),
      buildPreviewMetric({
        id: "longevity", label: "Portfolio lasts", format: "longevity",
        before: { years: current.yearsSustained, depletionAge: current.depletionAge },
        after: { years: candidate.yearsSustained, depletionAge: candidate.depletionAge },
        betterDir: "up",
      }),
    ],
    note: "Preview uses the same blended retirement walk as your what-if scenarios "
      + "(not the per-account engine behind your headline numbers), evaluated at "
      + "today's income and spending.",
    verdict: null,
  };
}

// ONE shared preview builder for every "save as my plan" Apply site (Plan
// screen's own save, Ideas' "make this scenario my plan" — WI-3.8). The two
// sites differ only in their `action` copy; the metrics shown are identical.
// `current`/`candidate` fields may individually be null — e.g. a first-ever
// save has no prior committed plan to compare against, which is exactly why
// the longevity/money metrics' null-guards exist.
export function buildCommitPlanPreview({
  action, current, candidate, title = "Save as my plan?", confirmLabel = "Save plan", note = null,
}) {
  return {
    title,
    action,
    confirmLabel,
    metrics: [
      buildPreviewMetric({
        id: "totalAtRet", label: "Nest egg at retirement",
        before: current.totalAtRet, after: candidate.totalAtRet, betterDir: "up",
      }),
      buildPreviewMetric({
        id: "longevity", label: "Portfolio lasts", format: "longevity",
        before: { years: current.yearsSustained, depletionAge: current.depletionAge },
        after: { years: candidate.yearsSustained, depletionAge: candidate.depletionAge },
        betterDir: "up",
      }),
    ],
    note,
    verdict: null,
  };
}
