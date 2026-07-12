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
//   "money"     — a plain before/after dollar figure (sign-aware: a negative
//                 Roth benefit reads "−$9,854", matching src/horizon/fields.jsx
//                 `money`).
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

// Sign-aware dollar formatter — same visual rule as fields.jsx `money` (kept
// as a separate copy here rather than importing across the model/horizon
// boundary: src/model/ must stay import-free of src/horizon/, and this one
// is small/stable enough that duplication is cheaper than a shared-import
// detour). U+2212 (minus sign), not the ASCII hyphen, for the negative case.
export function fmtMoney(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Math.round(v);
  return r < 0 ? `−$${Math.abs(r).toLocaleString("en-US")}` : `$${r.toLocaleString("en-US")}`;
}

// Signed delta label for a nonzero money delta, e.g. "+$22,254" / "−$9,854".
function signedMoneyLabel(delta) {
  const r = Math.round(delta);
  const abs = Math.abs(r).toLocaleString("en-US");
  return r < 0 ? `−$${abs}` : `+$${abs}`;
}

function moneyMetric({ id, label, before, after, betterDir }) {
  const beforeStr = fmtMoney(before);
  const afterStr = fmtMoney(after);

  let delta;
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) {
    // Missing either side — nothing to compare (e.g. a candidate that hasn't
    // been computed yet). Never fabricate a delta from a half-known pair.
    delta = { dir: "none", label: "—", tone: "neutral" };
  } else {
    // Round before differencing — matches what fmtMoney actually displays, so a
    // sub-dollar float gap between before/after can never render a "+$0"/"−$0"
    // delta beside two identical-looking dollar figures (Gemini review).
    const d = Math.round(after) - Math.round(before);
    if (d === 0) {
      delta = { dir: "none", label: "no change", tone: "neutral" };
    } else {
      const dir = d > 0 ? "up" : "down";
      delta = { dir, label: signedMoneyLabel(d), tone: dir === betterDir ? "good" : "warm" };
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
  if (depletionAge == null) return `${years.toFixed(1)} yrs`;
  return `depletes at ${depletionAge} (${years.toFixed(1)} yrs)`;
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
      // Diff the SAME one-decimal rounding renderLongevity displays (Gemini
      // review) — a raw-float gap smaller than 0.05yr would otherwise show a
      // nonzero delta beside two identically-displayed "X.X yrs" figures.
      const d = Number(after.years.toFixed(1)) - Number(before.years.toFixed(1));
      if (d === 0) {
        delta = { dir: "none", label: "no change", tone: "neutral" };
      } else {
        const dir = d > 0 ? "up" : "down";
        const sign = d > 0 ? "+" : "−";
        delta = { dir, label: `${sign}${Math.abs(d).toFixed(1)} yrs`, tone: dir === betterDir ? "good" : "warm" };
      }
    }
  }
  return { id, label, before: beforeStr, after: afterStr, delta };
}

// Sign-aware whole-number-percent formatter — "15.3%" (one decimal place).
// Matches this codebase's convention that percent fields are already
// whole-number percents (15.3 means 15.3%, not 0.153).
function fmtPercent(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function percentMetric({ id, label, before, after, betterDir }) {
  const beforeStr = fmtPercent(before);
  const afterStr = fmtPercent(after);

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
// Tone values are constrained to what VerdictBadge (ApplyPreviewModal.jsx)
// actually renders: it maps "good"/"warm" to their tokens and falls back to
// `t.mut` for anything else — its accepted set is good/warm/neutral (also the
// enum apply-site-contract.test.js checks). There is no "bad"/red tone today,
// so "unaffordable" is deliberately mapped to "warm" — the closest supported
// tone, not a new one invented here; revisit if a future design pass adds a
// dedicated danger tone to VerdictBadge.
const VERDICT_DISPLAY = {
  comfortable:  { label: "Comfortable", tone: "good" },
  tight:        { label: "Tight",       tone: "warm" },
  unaffordable: { label: "Doesn't fit", tone: "warm" }, // closest supported tone — see note above
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
    action: `Convert ${fmtMoney(suggestion.optimalConversion)}/yr starting at age ${suggestion.optimalStartAge} `
      + `(now: ${fmtMoney(current.annualConversion)}/yr from age ${current.startAge})`,
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
    action: `Deploy ${fmtMoney(deployment.totalExtra)}/yr (${deployment.pct}% of your `
      + `${fmtMoney(deployment.availableSurplus)} surplus) in IRS-priority order`,
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
