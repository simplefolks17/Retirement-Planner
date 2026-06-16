# Review Guide — Whole-Codebase Review

This document is the shared brief for any automated or human reviewer of this codebase. It is
included in every review PR. Read it before filing findings — it defines the architecture, the
invariants that matter, and the cross-layer contracts that prevent false positives.

## What this app is
A retirement financial planner (React + Vite). Pure-function financial model in `src/model/`,
constants in `src/config/irs-2026.js`, React UI in `src/components/` and `src/horizon/`, and
`src/App.jsx` as the state/layout shell that wires inputs → model → UI.

## How this review is chunked
The codebase is surfaced to diff-based reviewers as **three layer PRs**, each containing
**complete files** for one architectural layer (no partial files), so nothing appears "undefined"
that is actually defined in a sibling layer:

| Layer | Contents | Defining invariant |
|---|---|---|
| **1 — Model** | `src/config/irs-2026.js` + `src/model/*.js` | Pure functions; financial correctness |
| **2 — View** | `src/components/*`, `src/horizon/*`, `theme.js`, `formatters.js` | Render only, never compute (rule 10) |
| **3 — Shell** | `App.jsx`, `main.jsx`, build config | Wiring + memoization/referential stability |

Tests (`**/__tests__/**`) are excluded from the diffs to keep focus on source; the suite is green
(441 tests) and includes a golden master + conservation/"anti-plug" guards.

## Invariants (the rules a finding should respect)
1. **IRS constants live only in `src/config/irs-2026.js`.** A literal there is correct; a hardcoded
   limit/bracket/threshold *anywhere else* is a real finding.
2. **Portfolio draws use per-year `netPortfolioNeed`** (expenses − SS − pension), never the static
   scalar inside a retirement loop. SS counts only from `ssClaimingAge`, pension only from
   `pensionStartAge` — gated per iteration (rule 5b).
3. **One retirement walk, gross-seeded, taxed once.** `retirement-engine.js` + `retirement-phase.js`
   are the single source for the chart, longevity, the RMD schedule, `rmdTaxBite`, Flow-Down, and
   the conversion benefit/optimizer. Balances are GROSS everywhere; `spendableAtRet` is an
   after-tax **display-only** reference, never a formula input. Do not propose a second projection.
4. **No double-counting.** `grossAfterTax` is the budget basis. MFJ uses combined household income
   for agi/stateTax/grossAfterTax; FICA is always per-earner.
5. **Model = pure functions.** No React state in `src/model/`.
6. **Horizon/Classic screens render, never compute (rule 10).** No arithmetic on model values in
   `src/horizon/`. Derived numbers come from the model via named `horizonProps` fields. No
   `?? 0`-style fabrication, no scaling/approximating a number to fill a gap — designed empty state
   instead. Decorative fakes only in isolated `Ghost*` components.
7. **Referential stability is correctness (BUG-22 / V9).** Everything placed into `horizonProps` and
   its sub-bundles must be memoized with complete, correct dependency arrays.

## Cross-layer contracts — do NOT flag these as bugs
- **Screens receiving pre-computed numbers** from `horizonProps` is correct by design. Do not flag a
  screen for "not validating/normalizing/recomputing" a value — that is the model's job (layer 1),
  reviewed separately.
- **App calling model functions** (`calcTaxBasis`, `buildRetirementPhase`, `evaluateConversionPlan`,
  …): review *how* they're called (args, memo deps), not their internals — internals are layer 1.
- **Imports of `src/config/irs-2026.js`** from any layer are correct.

## Known / intentional — do NOT re-file (tracked in `docs/BUGS.md`)
- **BUG-36** — `what-if.js` + `calcOptimizedScenario` use the blended `buildRetirementDrawdown` for
  *deltas* and don't charge the spending-draw tax. Known follow-up.
- **BUG-37** — the engine ignores `conversionTaxSource` (owner-deferred; would move the golden master).
- **BUG-38** — the engine charges only *incremental* tax above the SS/pension floor, so SS/pension is
  effectively tax-free at the default. Known follow-up.
- **BUG-39** — Flow-Down *accumulation* growth is a residual plug, not `Σ(row.growth)`. This is the
  **one sanctioned exception** to the "no residual plug" rule, pending fix.
- The conversion optimizer reading only 4 of `evaluateConversionPlan`'s 10 returned fields is a
  **documented non-bug** (the other 6 are free byproducts; splitting would re-introduce divergence).

A finding that restates one of the above will be marked *KNOWN* and dropped. Everything else —
correctness bugs, off-by-ones, sign errors, stale memo deps, hidden math in screens, real
double-counting — is in scope and wanted.
