// Apply-with-preview payload builders (WI-3.9). This is the ONE construction
// path for "here's what applying this suggestion changes" payloads —
// ApplyPreviewModal.jsx renders them VERBATIM (rule 10: the modal computes
// nothing, not even a sign). Everything a screen needs — formatted strings,
// delta direction, delta tone — is decided here, once, so every Apply site
// (today's conversion optimizer; WI-3.7's surplus allocation; WI-3.8's
// commitPlan sites; #86's scenario-overlaid recompute) shows the same visual
// language without re-implementing delta/edge-case semantics per site.
//
// The two format kinds:
//   "money"     — a plain before/after dollar figure (sign-aware: a negative
//                 Roth benefit reads "−$9,854", matching src/horizon/fields.jsx
//                 `money`).
//   "longevity" — a { years, depletionAge } pair. `years === Infinity` means
//                 "never depletes within the walk horizon" (BUG-35's
//                 trivially-sustainable case) and gets its own copy + delta
//                 vocabulary instead of pretending it's a finite number.

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
    const d = after - before;
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
function renderLongevity({ years, depletionAge }) {
  if (years === Infinity) return "lasts beyond your plan";
  if (depletionAge == null) return `${years.toFixed(1)} yrs`;
  return `depletes at ${depletionAge} (${years.toFixed(1)} yrs)`;
}

function longevityMetric({ id, label, before, after, betterDir }) {
  const beforeStr = renderLongevity(before);
  const afterStr = renderLongevity(after);
  const beforeInf = before.years === Infinity;
  const afterInf = after.years === Infinity;

  let delta;
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
    const d = after.years - before.years;
    if (d === 0) {
      delta = { dir: "none", label: "no change", tone: "neutral" };
    } else {
      const dir = d > 0 ? "up" : "down";
      const sign = d > 0 ? "+" : "−";
      delta = { dir, label: `${sign}${Math.abs(d).toFixed(1)} yrs`, tone: dir === betterDir ? "good" : "warm" };
    }
  }
  return { id, label, before: beforeStr, after: afterStr, delta };
}

// One metric row: signed-delta computation, dir/tone mapping (`betterDir`
// says which direction reads as "good"), formatting, and the Infinity/null
// edge states — all in one place so no Apply site re-derives this logic.
export function buildPreviewMetric({ id, label, before, after, betterDir = "up", format = "money" }) {
  return format === "longevity"
    ? longevityMetric({ id, label, before, after, betterDir })
    : moneyMetric({ id, label, before, after, betterDir });
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
