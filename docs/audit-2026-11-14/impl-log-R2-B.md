# R2-B implementation log

- started: BUG-173/174/175/176

## BUG-174 (R-8) done
- TaxTimeline.jsx: Seg takes `dp`; Working segment dp=0 (fedMarginal), Ret. dp=1 (effectiveRMDTaxRate).
- Test (display-consistency-r2b.test.js, real App Classic): Ret. text "Ret.: 12.8%" == rmdView.effectiveRMDTaxRateLabel; Working matches /\d+%/.
- Revert (Ret. dp 1 -> 0): FAIL "expected 'Working: 22%Ret.: 13%' to contain 'Ret.: 12.8%'". Restored: PASS.

## BUG-173 (R-2) done
- what-if.js calcWorkLongerBreakEven: per-row SS = calcRetirementIncome(...).householdSS using `{...bundle.ssInputs, ...ssInputs}` (the scenario engine's own inputs: override, spouse, basis), defaults keep partial-ssInputs callers working. New fields: `ssPinnedFlat` per row. App.jsx no longer passes a separate ssInputs (bundle's is used). WorkLongerFlow sub = "your entered figure" when model flags it (rule 10).
- Tests (display-consistency-r2b.test.js, real App, T-X.3 fixture): override 38,000 -> baseSSAnnual and all rows 38,000, delta 0, pinned flat; no override + spouse 20,000 -> baseSSAnnual == plan householdSS (41,924) and rows are household (> primary-only).
- Revert-and-confirm: (A) drop bundle.ssInputs from merge -> 2 fail ("expected +0 to be 38000", "+0 to be 41924"); (B) `ssOverride: null` -> pinned test fails ("expected 21924 to be 38000"); (C) spouse zeroed -> household test fails ("21924 to be 41924"). Restored: 3/3 pass.
- Full gate: npm test 1649, lint, build clean; golden masters unmoved.

## BUG-175 (R-13 defect half) done
- conversion-events.js: `conversionEventOutsideWorkingYears` / `conversionEventNotModelled` / `CONVERSION_EVENT_NOT_MODELLED_LABEL` (one predicate). App `activeConversionEvents` filter now uses it; `conversionView.events.rows[i].notModelled` + `estTaxLabel` = the label; Horizon row colours it `t.warm`; Classic `ConversionEventsPanel` shows the label (orange) for the same rows. Only amount>0 events flag.
- Tests (display-consistency-r2b): review repro via real App ($500k trad, event $100k, retirement 65->40): model sum 100,000 -> 0; row.notModelled true, label set, stale age > its own max; Classic panel row (event beyond retirement-1 with working years remaining) shows label, not "401k → Roth, taxed as income".
- Revert-and-confirm: (A) App rows `notModelled:false`/label off -> 2 fail ("expected false to be true"); (B) Classic panel `notModelled=false` -> 2 fail (panel still shows "401k → Roth, taxed as income"). Restored 5/5.
- Gate: npm test / lint / build clean (see commit).

## BUG-176 (R-9) done (display fix only; the BUG-36 port is NOT done, by instruction)
- what-if.js: `anchorWhatIfToHeadline` (before = headline; after = headline + (scenario - noChange), both from the SAME blended engine so its bias cancels; Infinity edges documented) and `calcWhatIfDeltaAnchored` (runs the no-change baseline + scenario). App.jsx `surplusApplySite` preview now uses the anchor (current = headline yearsSustained/depletionAge/totalAtRet). Classic WhatIfPanel uses calcWhatIfDeltaAnchored; its "lasts to age" label now measures from the SCENARIO's retirement age (it used the base age for both: "work 2 more years" printed an age 2 early).
- Repro household (Finding B: 48->57, spouse 37 earning 120k, spend 120k, auto): headline lasts to 70. Before: Apply preview "to age 63" -> "to age 67"; Classic work-2-more "→ -6.7 yrs". After: Apply preview before "to age 70", after >= 70; Classic "to age 73 vs to age 70 → +0.9 yrs".
- Tests: display-consistency-r2b.test.js — Horizon surplus preview (before == `to age ${retirementWalk.depletionAge}`, nest egg before == fmt(totalAtRet), after >= before); Classic WhatIfPanel driven through the rendered preset (before == headline 70, after >= before); 4 unit tests of the anchor incl. no-change == headline and Infinity edges.
- Revert-and-confirm: (A) surplus preview back to `before.scenarioYears` -> FAIL "expected 'to age 63' to be 'to age 70'"; (B) Panel back to raw calcWhatIfDelta -> FAIL (Classic printed "Portfolio lasts to age NaN ... → -6.7 yrs"). Restored 11/11.
- Gate: npm test 1657, lint, build clean; golden masters unmoved.
