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
