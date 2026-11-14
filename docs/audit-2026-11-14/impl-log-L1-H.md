# impl-log L1-H (Sweep 4: percent formatting)

fmtRate added to src/formatters.js (fraction in; "—" for non-finite/non-number, same as fmtPct). Private fmtPercent existed once (apply-preview.js); App.jsx only had a comment (fixed to point at fmtPct).
Guard: formatters.test.js "one-percent-formatter guard" (3 regexes, sample-tested). Revert-and-confirm: put `withdrawalRate.toFixed(1)}%` back in action-cards.js:187 -> guard FAILED listing "src/model/action-cards.js:187"; restored -> pass.
Test expectation changes: numbers-tabs.test.js "18%"->"18.0%" (fedEffective), "29%"->"29.0%" (combinedEffRate): computed rates canonical 1dp; pension-timing-wiring.test.js regex /~(\d+)%/ -> allows decimals (yr1TradRate now 1dp, "~24.0%").
Golden masters: unmoved.

## Site inventory (unit / precision / render change)
- action-cards.js 187,193,225,231,232,253,258,264: withdrawalRate, wr70 whole -> fmtPct 1dp (no change).
- action-cards.js 242,352: effectiveRMDTaxRate fraction -> fmtRate 1dp (no change). 343: rReal fraction -> fmtRate 1dp.
- apply-preview.js: private fmtPercent (whole, 1dp) deleted -> fmtPct (identical).
- TaxPhaseCard.jsx:24 combinedRate fraction -> fmtRate 1dp. TaxTimeline.jsx:20 rate fraction -> fmtRate 0dp (bracket).
- App.jsx: state-table rate (94, 3595) fraction 1dp, "0%" special case kept for no-tax states; 1236 yr1TradRate 0dp->1dp ("~24%"->"~24.0%");
  2571 effectiveRMDTaxRateLabel 1dp; 3220/3241/3246 stateRate(+Default) 1dp; 3289 fedMarginal 0dp; 3288/3290 fmtPct(x*100)->fmtRate 1dp (same text);
  3531/3933 rReal 1dp; 3554 actualMarginalPct -> fmtRate(fedMarginal,0); 3571/3574/3587 effectiveRMDTaxRate/retStateRate 1dp; 3580 projRetBracketPct fmtPct(.,0);
  3807 pctTotal whole fmtPct 1dp; 3914/3949/5042/5043/5207/5217 withdrawalRate/wr70/optimized whole fmtPct 1dp;
  4130 effectiveSS/retSpendBasis fraction fmtRate 0dp; 4229 householdSS/retSpendBasis fmtRate 0dp; 4433/4453 effectiveRMDTaxRate 1dp; 4950/4978 yr1TradRate 1dp.
- SSTimingFlow.jsx:77 withdrawalRate/wr70 whole fmtPct 1dp.
- NumbersScreen.jsx: 1144 per-card dp (fedEffective 1, fedMarginal 0, combined 1); 1160/1202 fedMarginal 0dp; 1213/1223 projectedRetBracket 0dp;
  1224 effectiveRMDTaxRate 0dp -> 1dp ("24%" -> "24.0%", the plan's example).
- Left alone (not rate formatting): integer *Pct model fields rendered as `${pct}%`, App numeric *Pct computations (951,1256,1328,1781-84,2414,2528,2539), slider whole-number inputs, CSS widths.

## Orchestrator re-verification (2026-11-14)
- `npm test` 1609, lint clean, build OK. No golden-master file touched.
- A grep for `toFixed(d)}%` / `toFixed(d) + "%"` outside formatters.js and tests finds none.
- Guard re-confirmed independently: planting `` `${r.toFixed(1)}%` `` in SSTimingFlow.jsx fails the
  guard, naming the file:line. Removed -> green.
