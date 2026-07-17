# CLAUDE.md

## Project
Retirement financial planner. React + Vite. Owner is not a programmer — explain changes simply.

## Critical Rules (check every task)
1. **IRS constants live in `src/config/irs-2026.js` only.** Never hardcode limits, brackets, or thresholds elsewhere.
2. **Portfolio draws use `netPortfolioNeed`** (expenses − SS − pension), never `effectiveExpenses`. This applies to: yearsSustained, withdrawalRate, totalChartData drawdown, optimized scenario. `netPortfolioNeed` must be computed **per-year** in any loop that spans retirement — SS and pension only reduce draws in years they've actually started (see rule 5b).
   - **2b. One retirement walk, gross-seeded, taxed once (BUG-35).** Balances are **GROSS** everywhere (the `"Trad 401k"` display is the full pre-tax value); `totalAtRet` is gross and `spendableAtRet` is an after-tax **display-only reference** (never a formula input). The retirement-phase portfolio is walked by the per-account engine `buildRetirementWalkByAccount` (`src/model/retirement-engine.js`), orchestrated by `buildRetirementPhase` (`src/model/retirement-phase.js`) — the **ONE source** for the chart (`totalChartData`), headline `yearsSustained`, the displayed RMD schedule + `rmdTaxBite`, the Flow-Down waterfall (`calcFlowDown`), and the Roth-conversion benefit + optimizer, so they can never diverge (BUG-31). The engine seeds from gross and taxes each dollar **exactly once** — when it leaves a pre-tax account (Roth conversion, RMD, or extra 401k draw), stacked bracket-accurately on the SS/pension floor; the RMD/conversion **principal** is an internal transfer that keeps compounding (only the tax leaks). **Never reintroduce the after-tax seed, never add a second nominal-growth RMD projection, and never compute a Flow-Down "growth" as a residual plug** — growth must be the independent sum `Σ(row.growth)`. (Follow-ups, tracked in `docs/BUGS.md`: `what-if.js` + `calcOptimizedScenario` still use the blended `buildRetirementDrawdown` for *deltas* on the gross basis — they don't charge the spending-draw tax — **BUG-36**; the engine charges only *incremental* tax above the SS/pension floor, so SS/pension is effectively tax-free — **BUG-38**; and Flow-Down **accumulation** growth is still a residual plug, not `Σ(row.growth)` — **BUG-39** (a known exception to the "no residual plug" rule above, pending the fix).)
3. **No double-counting.** `grossAfterTax` (household income − all taxes) is the budget basis. Pre-tax deductions are auto-derived from contributions. For MFJ filers, `grossAfterTax` uses `householdIncome` (primary + spouse); for all other filing statuses it uses primary income only.
4. **Sim-level IRS guards required.** Every contribution in the simulation loop must be independently capped at its IRS limit, regardless of UI constraints.
5. **Dependency order matters.** SS and pension must compute before any drawdown metric that depends on them. If adding a new income source, wire it into `netPortfolioNeed` first.
   - **5b. Income timing.** SS only counts from `ssClaimingAge`; pension only counts from `pensionStartAge`. Any year-by-year loop (drawdown chart, conversion window draws, `retIncomeFloors[]`) must check these ages per iteration — never use the static `netPortfolioNeed` scalar inside a retirement-phase loop.
6. **Financial model = pure functions.** No React state inside `src/model/` files. Inputs in, outputs out, testable without rendering.
7. **Test after every model change.** Run `npm test` before committing any change to `src/model/` or `src/config/`. The suite (840 tests) includes a **golden master** (`src/model/__tests__/golden-master.test.js`) that locks every headline number at the default state — if it fails, a model change moved a value. Update the locked values only when the change was intended.
8. **Hybrid client/server split (pre-launch, not during development).** Model files marked [SERVER] in ARCHITECTURE.md will move behind API routes before launch. During development, import them directly — do NOT set up API routes until feature-complete. See `docs/INTEGRATIONS.md`.
9. **MFJ tax calculations use combined household income.** `agi`, `stateTax`, and `grossAfterTax` all include `spouseIncome` when `filingStatus === "mfj"`. FICA is always computed per-earner separately (`Math.min(primaryIncome, FICA_WAGE_BASE) + Math.min(spouseIncome, FICA_WAGE_BASE)`). Contribution limits and account sliders remain per-person (primary earner's accounts only — spouse accounts are a planned premium feature, #30).
10. **Horizon screens render, never compute.** No arithmetic on model values in `src/horizon/` — screens format and lay out only; derived numbers (percentages, month↔year, residuals, deltas, age math) come from `src/model/` via named `horizonProps` fields, pre-gated for applicability (eligibility booleans from the model, never age comparisons in JSX), with documented null/Infinity edge states instead of `?? 0`-style fallbacks. Never scale or approximate a real number to fill a gap — designed empty state instead; decorative fakes only in isolated `Ghost*` components. Full principles (15) + violations register: `docs/ROADMAP.md` → Design principles.

## Git & PR Workflow
- **Always use a feature branch.** Never commit directly to `main`.
- **Open a PR before merging.** For any feature, refactor, or substantive change: push the branch, open a PR with a clear title and description explaining what changed and why, then merge. This creates a permanent GitHub record with the full diff.
- **Bug fixes** are the exception — small, contained bug fixes can be committed directly to the feature branch and merged without a formal PR, as long as `docs/BUGS.md` is updated with root cause, files changed, and fix description.
- **`docs/BUGS.md` is the bug record.** Every bug fix must be logged there before merging, whether or not a PR is opened.
- **Test count in `CLAUDE.md` must stay current.** Update the test count in the Commands section whenever new tests are added.

## Session Close-Out (run when the user ends/closes a session, or asks to "make sure files are up to date")
"Up to date" means a **thorough read + re-verification pass**, never a quick append. Do all of the following before reporting the session done:

1. **Read each doc end-to-end** — `docs/BUGS.md`, `CLAUDE.md`, `feature-tracker.html`, and any `docs/*.md` this session touched. Read the whole file, not just the section you edited, so cross-references and counts stay consistent.
2. **Re-verify every open bug.** For each entry under "Open Issues" in `docs/BUGS.md`, open the referenced file + line and confirm it still reproduces in the *current* code. Close (move to Resolved, with a dated reason) anything that's been fixed, made obsolete by a refactor/removal, or was never actually live. See the re-verification rules in `docs/BUGS.md` → Conventions.
3. **Reconcile what changed this session.** Every code change must be reflected in the docs: bugs fixed → moved to Resolved with root cause + files + fix; new bugs found → filed (verified first); features shipped/repriotized → `feature-tracker.html` updated.
4. **Reconcile all counts and cross-links.** Test count appears in *two* places in `CLAUDE.md` (rule 7 and Commands) — both must match `npm test`. Feature-tracker header counts (done/planned) must match the entries. Any "BUG-NN ↔ feature #NN" link must be consistent in both files.
5. **Run `npm test` and confirm green**, and confirm the count matches the docs.
6. **Report the close-out explicitly** — list which files were read, which entries were re-verified (and the outcome of each), and what was reconciled. If something was checked and needed no change, say so; don't go silent on it.

The failure mode to avoid: logging new work while leaving stale "Open" entries un-rechecked. A refactor in one file can silently moot a bug documented in another — the close-out pass is what catches that.

## Quick Links
- Architecture & data flow: `docs/ARCHITECTURE.md`
- Formulas & assumptions: `docs/FINANCIAL-MODEL.md`
- Classic UI design system & tokens: `docs/DESIGN.md` *(dark dashboard — the original UI)*
- Horizon UI design system & open items: `docs/HORIZON.md` *(new warm shell — see below)*
- Horizon depth-ladder roadmap (Classic → Horizon parity plan): `docs/ROADMAP.md`
- External services & integration: `docs/INTEGRATIONS.md`
- Feature backlog: `feature-tracker.html` (124 items, 64 done, 60 planned)

## Status
- Refactored from a 3,988-line monolith into a module structure: pure-function
  model layer (`src/model/`), extracted UI components (`src/components/`),
  constants (`src/config/irs-2026.js`), App.jsx as the state/layout shell.
- Four modeling correctness bugs fixed (Jun 2026):
  1. SS and pension timing in drawdown — per-year `netPortfolioNeed` in all loops
  2. Pension not counted post-`pensionStartAge` when pension starts after retirement
  3. Spouse FICA missing — now computed per-earner
  4. MFJ tax calc incomplete — AGI, state tax, and `grossAfterTax` now use combined household income
- Feature backlog expanded to 48 items including premium tier, household modeling,
  Monte Carlo analytics, and new income sources.
- Six features shipped (Jun 2026):
  1. #8 — Additional pre-tax balances: addlPreTaxBal input feeds RMD and conversion basis
  2. #33 — Bracket-accurate retirement tax: `effectiveRMDTaxRate` from real bracket math
     replaces flat `rate3Combined` proxy for `rmdTaxBite`, `netConversionBenefit`, and
     withdrawal strategy; golden master updated deliberately
  3. Rate3 slider removal: `"Trad 401k"` display now uses `fedMarginal` (bracket-accurate
     working-year rate) computed from actual income/deductions; sliders for phase rates
     removed entirely; TaxTimeline simplified to working/retirement 2-segment view
  4. #7 — ACA cliff warning: per-year MAGI exposure computed for conversion window years
     before Medicare age; subsidy cliff threshold and affected ages shown in UI
  5. #34 — IRMAA exposure: 2-year lookback surcharge computed per conversion year;
     per-person and 2-person options; total IRMAA cost shown against net conversion benefit
  6. #46 — Conversion optimizer: coarse $5k-step search maximizing net benefit after
     IRMAA costs; suggestion shown when optimal differs from current setting by >$5k
- Bug-closure pass (Jun 4 2026) — all five open bugs in `docs/BUGS.md` cleared:
  1. BUG-26 fixed — SS-delay gain years now computed via a per-year drawdown walk
     (`calcDrawdownYears` in `drawdown.js`), not a closed form that ignored higher
     pre-70 draws; was overstating the delay benefit by 3–6 yrs for early retirees.
  2. BUG-17 fixed — SS claiming-age slider min floored at current age.
  3. BUG-07 closed (obsolete) — phase tax-rate sliders it depended on were removed;
     Trad 401k line now normalizes at a single bracket-accurate `fedMarginal`.
  4. BUG-18 closed (already guarded) — slider min/max + onChange clamp prevent the cross.
  5. BUG-16 left open but reassigned to premium feature #30 (Spouse account modeling);
     #30 priority bumped P2 → P1 and its tracker entry now owns the BUG-16 fix.
- Constants-hygiene pass (Jun 4 2026) — value-preserving, golden master unchanged:
  1. `bracketTops` (App.jsx) now reads bracket tops by rate from the active filing
     status's brackets — dropped hardcoded single-filer fallbacks (`?? 50_400…`)
     that were stale duplicates of config and wrong for MFJ/HoH if ever reached.
  2. Default retirement-expense rate (3% of portfolio) moved inline → `ASSUMPTIONS.
     DEFAULT_RETIREMENT_EXPENSE_RATE`; UI labels derive the % from it.
  3. 95% combined-marginal-rate clamp (3 call sites) → `ASSUMPTIONS.MAX_COMBINED_MARGINAL_RATE`.
  4. Display month↔year conversions in App.jsx now use `ASSUMPTIONS.MONTHS_PER_YEAR`
     instead of raw `* 12` / `/ 12`.
  5. `optimization.js` imports `buildRetirementDrawdown` (shared walk) instead of
     re-implementing the closed form, so the optimizer and headline longevity can't
     diverge. (`calcYearsSustained` kept for reference; no longer used for headline.)
- Bug-hunt pass (Jun 5 2026) — two verified correctness bugs found and fixed:
  1. BUG-27 — `calcRMDPostConversion` double-counted a year of growth before the first
     RMD (`tradBal73` is already the age-73 balance). Understated `netConversionBenefit`;
     default state moved 17_345 → 47_047 (golden master updated deliberately). Regression
     test added: zero-conversion post-conversion schedule must equal the baseline.
  2. BUG-28 — Flow-Down distribution waterfall `distDraws` used the static
     `netPortfolioNeed` scalar, ignoring SS for users who retire before claiming it.
     Now a per-year loop gating SS/pension like the chart loop. Value-preserving in the
     default state (claims SS at retirement); fixes the early-retiree case.
  - Deeper pass also filed three verified issues as **Open** (not changed, by owner
    decision — all move/affect displayed or headline numbers and need review first):
    BUG-29 (conversion tax not bracket-accurate + omits state — understates
    `netConversionBenefit`, default ~47k vs ~78k; incomplete rollout of feature #33),
    BUG-30 (MFJ cap-gains uses primary-only income; deferred to premium #30).
- Tax-honest retirement walk (BUG-31 fixed, Jun 5 2026 — Path A): the retirement
  portfolio is now walked in ONE place (`buildRetirementDrawdown`, consumed by the
  chart, headline longevity, `calcFlowDown` waterfall, `calcDrawdownYears`, and the
  optimizer), and it actually charges per-year RMD + conversion tax to the pool.
  Flow-Down "growth" is now the independent sum `Σ(row.growth)`, not a residual plug.
  Headline `yearsSustained` 88.60 → 61.99 at default (still sustainable). Logic
  extracted from App.jsx into `retirement-drawdown.js` + `flow-down.js`; new
  conservation / anti-plug / reconciliation tests (169 → 187) guard the bug class.
- Calculation-extraction pass (Jun 5 2026) — value-preserving, golden master unchanged:
  continuing PR #7's direction (pull model math out of App.jsx so it is testable and
  reusable in various places). Extracted the retirement-phase **tax engine** into
  `src/model/retirement-tax.js`: `calcRMDIncomeFloor`; `calcRMDTax` (now ONE shared
  definition — App's display path and the conversion optimizer no longer keep duplicate
  copies of the same reduce, which was the shape of BUG-25 finding 4); `calcRMDTaxSchedule`
  (`rmdDataWithTax` / `rmdTaxBite` / `effectiveRMDTaxRate`); and `calcWithdrawalOrderTax`
  (year-1 tax-optimal taxable→trad→Roth vs worst-case all-pre-tax — the worst-case GROSS-
  balance cap is the BUG-26 basis fix, now locked by a test). 15 new invariant/anti-plug
  tests (187 → 202): source-conservation for the withdrawal order, the
  schedule-vs-`calcRMDTax` anti-divergence guard, and a value-lock reproducing the
  golden-master default `rmdTaxBite` ($683,974). App.jsx imports it directly (no behavior
  change). Then extracted **conversion planning** into `src/model/conversion-planning.js`:
  `buildIncomeFloors` (per-year conversion-window income floor — the per-year SS/pension gate
  that is the BUG-25 #3 off-by-one) and `calcBracketFillTargets` (per-year + steady bracket-fill
  amounts and the peak/steady range); App keeps both behind `useMemo` for referential stability
  (BUG-22). 11 more invariant tests (202 → 213): the first-SS-year off-by-one regression, a
  "fills exactly to the bracket top" invariant, and a value-lock reproducing the golden-master
  default conversion ($82,765 steady / $121,800 peak). Then extracted the **working-year tax
  basis** into `src/model/tax-basis.js` (`calcTaxBasis` → agi, fed/state/FICA, take-home, Roth
  phase-out, grossAfterTax) — computed as ONE early call, which structurally removes the
  temporal-dead-zone split that caused the BUG-20 blank-page crash. 7 more tests (213 → 220):
  golden-master value-lock (agi / fedTax / fedMarginal / grossAfterTax), MFJ combined-income
  (rules 3 & 9), per-earner FICA wage-base cap, and the BUG-12 filing-status-aware Roth
  phase-out. Then extracted the **SS-income chain** into `src/model/retirement-income.js`:
  `calcRetirementIncome` (SS + pension composition → householdSS, the ssAtRet / effectivePension
  "active-at-retirement" gates [BUG-10 / rule 5b], ssTaxableRet, and the delay-to-70 figures) and
  `calcSSBreakEven`. 10 more tests (220 → 230): SS value-lock (ssAIME / ssPIA / ssAnnualBenefit /
  householdSS), the ssAtRet deferred-SS gate, includeSS / ssOverride / pension gates, and the SS
  break-even. **Writing those tests surfaced BUG-32** — the SS break-even age is wrong for delayed
  claims (collapses to ≈ the claim age because the FRA baseline loses its 67→claim head start).
  Filed Open in `docs/BUGS.md` and locked by a test; not fixed here (it would move a displayed
  value — value-preserving extraction only). App.jsx's calculation body is now almost entirely
  delegated to the model layer (only small display-derived glue remains inline).
- Bug close-out — Batch 1 (Jun 6 2026): **BUG-32 fixed.** `calcSSBreakEven` now walks the
  timeline from `min(ssClaimingAge, SS_FRA)` so a delayed claimer's FRA baseline gets its
  67→claim head start; delayed break-even at default-derived inputs lands at age 82 (was ≈ the
  claim age). Symmetric — the early-claim path is provably unchanged. Display-only, golden master
  unaffected (default claims at FRA → `ssBreakEven` is `null`); no new tests.
- Bug close-out — Batch 2 (Jun 6 2026): **BUG-29 fixed** (owner-approved headline move). Roth-
  conversion tax is now bracket-accurate via a single shared primitive `stackedIncomeTax`
  (`taxes.js`), used by BOTH the conversion side (`calcConversionSim`, new `retStateRate` param)
  and the RMD side (`retirement-tax.js:rmdRowTax` de-duplicated to delegate to it — value-
  preserving, `rmdTaxBite` held at 683,974). Default `netConversionBenefit` 47,047 → 77,861 and
  `yearsSustained` 61.99935 → 62.92429 (the tax-honest walk pays less conversion tax). Golden
  master updated deliberately; 3 new bracket-accuracy tests.
- Bug close-out — Batch 3 (Jun 6 2026): **BUG-30 + BUG-16 fixed** (shipped standalone ahead of
  the full #30 engine, per the tracker's "quick win" note; both value-preserving at default).
  BUG-30: MFJ LTCG drag now uses combined household income (`simulation.js`, mirrors the existing
  `yearMAGI` pattern) — inert for single filers. BUG-16: spousal SS now reduces for early claims —
  new `spouseClaimingAge` slider + `spouseBenefitBasis` toggle ("own record" vs "spousal / 50% of
  primary"); `calcSpousal` is now `(pia, spouseClaimingAge)` with the factor **capped at 1.0**
  (spousal earns no delayed credits) while the own-benefit path gets the full factor; selection +
  `isMarried` gating + the advisory note live in `calcRetirementIncome`. Default is single/unmarried
  → spouse benefit 0 → golden master unchanged. BUG-30 +1 test, BUG-16 +7 tests. Closes the
  "calcSpousal (BUG-16)" and "ltcgRate combined-income (BUG-30)" deliverables on feature #30.
- Cumulative across the three batches: test suite 230 → **241** (BUG-29 +3, BUG-30 +1, BUG-16 +7).
- Calculation-extraction pass 2 (Jun 6 2026) — value-preserving, golden master unchanged:
  finished pulling the remaining inline math out of App.jsx (red + yellow + green). Two active
  DUPLICATIONS eliminated structurally — the class behind the worst past bugs:
  - `calcConversionCosts` (`healthcare.js`) — the IRMAA/ACA cost rollup the display path and the
    optimizer each computed separately now has ONE definition (BUG-25 #4 shape).
  - `evaluateConversionPlan` (new `conversion-evaluation.js`) — the whole conversion pipeline
    (sim → post-conversion RMD tax → net benefit → ACA/IRMAA costs) was implemented twice
    (display path + optimizer `getNetBenefit`); both now call one function, so the optimizer can
    never search a different model than the screen shows (BUG-31 "two implementations of one calc").
    The display path collapses ~5 memos into one for referential stability (BUG-22). Locked by a
    value-lock (`netConversionBenefit` = 77,861) + an anti-divergence test (optimizer objective ==
    display's adjusted net benefit).
  Smaller blocks extracted too: `sumAccountRow` / `calcMilestones` / `buildAccumChart` (new
  `accumulation.js`), `calcSSDelayGain` (`drawdown.js`), `projectRetirementBracket` (`taxes.js`),
  `calcMegaBackdoorGrowth` (`budget.js`). 241 → **267** tests (26 new). App.jsx 2,774 → 2,711 lines;
  its JSX body now holds no calculation logic. New files: `accumulation.js`, `conversion-evaluation.js`.
- Post-extraction cleanup (Jun 6 2026) — from the extraction-pass-2 code review:
  1. **FV-annuity dedup** — the future-value-of-an-annuity formula was written twice
     (`optimization.js`'s local closure + `calcMegaBackdoorGrowth`). Extracted to a shared
     `fvAnnuity(annual, rate, years)` in new `src/model/finance-math.js`; both import it.
     Value-preserving (identical formula + guard). +4 tests.
  2. **BUG-33 fixed** — `projectRetirementBracket` matched the bracket on *gross* retirement
     income against *taxable*-income thresholds (skipped the standard deduction that
     `marginalRate`/`calcTax` apply), so the "projected marginal bracket" label read one bracket
     high — **32% → 24%** at default. Now subtracts the deduction once (no double-count;
     apples-to-apples with working bracket + actual retirement tax). Display-only — golden
     master unmoved. +1 test; logged in `docs/BUGS.md`.
  3. **Optimizer "discarded fields" — investigated, not a bug.** The review flagged that the
     conversion optimizer reads only 4 of `evaluateConversionPlan`'s 10 returned fields. The
     other 6 are free byproducts of computing those 4; the heavy calls are required; splitting
     into lean/full variants would re-introduce the divergence the single function prevents.
     Documented at the `return` in `conversion-evaluation.js` and in `ARCHITECTURE.md` →
     Feature Design Notes so it isn't re-flagged. No code change.
  267 → **272** tests (23 files). New file: `finance-math.js`.
- What-if overlay + money events system (Jun 10 2026):
  1. **Feature tracker corrected** — removed #51 (retirementState already fully wired); downgraded #52 to P3. Count: 68 → 67 items, 44 → 43 planned.
  2. **`src/model/money-events.js`** (new) — `applyMoneyEvents(events, age)` / `totalEventImpact`. Pure helper called per-year in both the accumulation and retirement walks.
  3. **`src/model/simulation.js`** — added `moneyEvents = []` param; outflows reduce taxable account balance at matching age (before growth); inflows add to it. No-op at `[]`.
  4. **`src/model/retirement-drawdown.js`** — added `moneyEvents = []` param; events applied to `balEnd` at matching age after normal recurrence. No golden master impact (default `[]`).
  5. **`src/model/what-if.js`** (new) — `calcWhatIfDelta` (parallel scenario: re-runs sim for accum events, threads ret-phase events into `buildRetirementDrawdown`; never reimplements the walk) and `calcAffordabilityMax` (binary search for max one-time expense while sustaining to a target age).
  6. **`src/components/WhatIfPanel.jsx`** (new) — always-on collapsible overlay: Scenario Delta mode (presets: work longer / retire early / custom; amount + age + direction; retirement age shift; expense delta) and Max Affordable mode (binary search, purchase age + target age). PDF export via `window.print()`. Completely isolated from main state.
  7. **`src/components/MoneyEventsPanel.jsx`** (new) — up to 6 one-time events (label, amount, age, inflow/outflow, taxable flag); renders in main planner; events flow through `simData` and `retDrawShared` so all downstream calculations (RMD, conversion, longevity) see them.
  8. **`App.jsx`** — added `moneyEvents` state, `whatIfSimInputs` object; threaded `moneyEvents` into `simData` (accum) and `retDrawShared` (retirement); rendered `WhatIfPanel` after retirement snapshot, `MoneyEventsPanel` before Tax Rate Phases.
  272 → **299** tests (25 files). New: `money-events.test.js`, `what-if.test.js`.
- Income growth plateau feature (Jun 11 2026, feature #87 — tracker ID, renumbered from #75
  in the Jun 12 de-duplication pass): unrealistic compounding fixed.
  New optional `incomeGrowthEndAge` param in `runSimulation` and `calcAIME`; income stops
  growing at the specified age, capping contributions, employer match, MAGI, and SS AIME.
  UI: "Income plateau age" slider + live projected-retirement-income preview. Default `null`
  = no cap = zero golden master impact. 299 → **303** tests (+4 plateau regression tests).
- Horizon UI shell shipped (Jun 11 2026): a warm, additive second interface layered on top of
  the classic dark dashboard. Horizon is now the default view; Classic is always accessible via
  the "Classic view" button and returns to Horizon via "✦ Horizon view" in the Classic header.
  **No model logic was changed** — Horizon is purely layout, styling, and navigation.
  New files: `src/horizon/ThemeContext.jsx` (6-palette token system), `src/components/ArcGraph.jsx`
  (SVG portfolio arc, 4 views), `src/components/HorizonShell.jsx` (Plan/Ideas/Numbers/Someday/Settings).
  10 follow-up items tracked in `feature-tracker.html` (section "Horizon UI", IDs 69–80) and
  documented in `docs/HORIZON.md`. **`docs/DESIGN.md` describes the Classic (dark) UI only —
  do not merge the two; they are separate design systems.**
- Horizon Batch A shipped (Jun 11 2026, PRs #16): foundation work for iterative Horizon delivery.
  HorizonShell.jsx split into per-screen files (`src/horizon/screens/`). New pure model export
  `calcWhatIfChart` in `what-if.js` returns `[{age,total}]` series for a scenario override.
  `safeGet`/`safeSet` exported from ThemeContext for onboarding detection. `horizonProps` extended
  with `moneyEvents`, `setMoneyEvents`, `whatIfSimInputs` bundle, `commitPlan` (confirm-commit
  wrapper), and `retirementWalk`. Two bugs fixed: `commitPlan` missing deps; `calcWhatIfChart`
  silently dropping permanent `moneyEvents` from the retirement walk. 303 → **307** tests.
- Horizon Batch B shipped (Jun 11 2026, PR #16): Ideas screen fully functional.
  #70 — Scenario cards use `calcWhatIfChart` for real model arc overlays; `bigTrip` passes a
  `scenarioEvents` override ($40k outflow at 70). #69 — Dial your future ± buttons live-update
  offsets and "Show on arc →" calls `calcWhatIfChart`. #71 — Life event pills show a
  ConfirmModal before writing to `moneyEvents` (arc + longevity update immediately). #75 —
  "Make this my plan" in both IdeasScreen (saves scenario's retire age) and PlanScreen (saves
  current values) uses confirm modal → `commitPlan` → 2-second toast. New shared component:
  `src/horizon/ConfirmModal.jsx`.
- Horizon Batch C shipped (Jun 11 2026, PR #17): onboarding wired end-to-end.
  #78 — First-run detection via `safeGet("hz-onboarded")` initializer (was defaulting to false).
  #79 — Onboarding stepper now holds live numeric state; ± buttons clamp per field; done screen
  offers "Save as my plan" (ConfirmModal → `commitPlan` → dismiss) vs "Skip for now" (dismiss
  only). `commitPlan` expanded to accept `currentAge` + `currentIncome` alongside the existing
  `retirementAge` + `annualExpenses`. No model changes; 307 tests unchanged.
- Horizon Batch D shipped (Jun 11 2026, PR #18): Numbers screen visual upgrades and arc polish.
  #72 — Income Sankey: inline SVG `IncomeSankey` component in `NumbersScreen.jsx`; bezier-filled
  bands show Gross Income → Tax / Savings / Take-home with heights proportional to dollar amounts;
  colors from theme tokens (`t.line2`, `t.warm`, `t.good`); HM monospace labels; no charting library.
  #73 — Vivid arc style: numeric `strokeWidth` prop added to `ArcGraph` (default 3);
  `HorizonShell` derives `strokeWidth = arcStyle === "vivid" ? 5 : 3` and passes it through
  `PlanScreen` and `IdeasScreen`; Glow bloom filter remains independent. #80 — Full yearly table:
  Year by year tab now sources from `retirementWalk.rows` (Age | Year | Portfolio | Draw | Growth
  | Tax columns); first 50 rows with "Show all N years" toggle; zebra rows + HM monospace numbers.
  No model changes; 307 tests unchanged.
- Horizon Batch E shipped (Jun 11 2026, PR #19): mobile layout, activity in Settings, photo upload.
  #74 — Mobile layout: window resize listener + `isMobile = windowWidth < 640` in `HorizonShell`;
  top nav + OnTrackPill hidden on mobile; fixed 60px bottom tab bar with emoji icons; `PlanScreen`
  gets 2×2 stat grid, reduced padding, smaller headline font, and arc height 200px. #76 — Activity
  in Settings: `ACTIVITIES` now exported from `SomedayScreen.jsx`; `SettingsScreen` imports it and
  renders the same 6-chip selector; `activity` + `setActivity` passed as props from `HorizonShell`.
  #77 — Someday photo upload: hidden file `<input>` + `FileReader.readAsDataURL` stores a session-
  only `customPhoto` in `useState`; click the photo area to pick, hover for "change photo" hint;
  gradient placeholder replaced by `<img objectFit="cover">` when photo loaded. No model changes;
  307 tests unchanged.
- Depth Ladder roadmap recorded (Jun 12 2026, docs-only — no `src/` changes, 307 tests unchanged):
  owner-approved plan to close the Classic↔Horizon depth gap level by level (Glance → Understand →
  Control → Retire Classic) and eventually remove the Classic view. Full plan with per-work-item
  targets, actions, and done-metrics in new `docs/ROADMAP.md`; summary + link in `docs/HORIZON.md`;
  22 tracker entries added (IDs 88–109, section "Horizon Depth Ladder"). Headlines: new **Journey**
  screen (Flow-Down port), Numbers 3→6 tabs (Budget/Accounts/Taxes + retirement money flow), new
  **Strategies** screen (conversion planner, RMD, SS timing, withdrawal order, surplus, mega
  backdoor), Settings → "My details" topic cards, signals strip on Plan, arc tap-to-scrub. Binding
  rule: zero math in `src/horizon/` — screens render `horizonProps` fields only (BUG-31 prevention).
  Also fixed a tracker data bug found during the pass: the "What-If Scenarios" section reused IDs
  69–74 (and "Overview / Income" reused 75) already taken by the Horizon UI section; since the
  tracker's status map keys by ID, the shipped Horizon items #70–#74 displayed as "planned" and the
  header counts were wrong. Renumbered the colliding entries to 81–87 (cross-refs updated) — IDs are
  unique again and counts render correctly (109 items, 38 done, 71 planned).
- Horizon design principles expanded (Jun 12 2026, docs-only — 307 tests unchanged): after real
  incidents where Horizon screens used numbers that didn't apply (scenario stats row showing
  hardcoded `totalAtRet × 0.92` approximations beside an arc showing the real model run), a code
  audit inventoried all live violations and the ROADMAP principles grew 5 → 15 in four groups:
  Product direction (model-first; every PR advances a named WI), Data integrity (screens format
  never transform; real data or no data; applicability travels with the data; constants from
  config even in copy; missing data is not zero), Forward compatibility (grow by named bundles,
  never repurpose a field; degrade by absence), Enforcement (referential stability is correctness;
  tests gate the wiring; mobile parity ship gate). New CLAUDE.md Critical Rule 10 is the compact
  version. Findings filed as a Violations register in `docs/ROADMAP.md` (V1–V11) plus a new
  **Level 0 — Foundations** build batch: WI-0.1/#110 compliance pass (fix V1–V8; note: scenario
  stats will visibly change fake → real) and WI-0.2/#111 enforcement tooling (memoize
  `horizonProps`/`whatIfBundle`, add ESLint `react-hooks/exhaustive-deps`, value-lock the
  SCENARIOS/LIFE_EVENTS preset tables — V9–V11). Tracker 109 → 111 items (38 done, 73 planned).
- End-state review canonicalized (Jun 12 2026, docs-only — 307 tests unchanged): a full backlog
  inventory found 23 planned items with no obvious home in the end-state navigation; a pressure
  test of the IA (design principles + 3 stress scenarios) concluded the content screens **hold —
  an 8th "Analytics" screen would be the regression vector back to Classic** — but only with six
  named scaling patterns now recorded in `docs/ROADMAP.md` → **End state**: SP-1 Strategies
  catalogue (applicability gating, 4 editorial sections, For-you strip on the `calcSignals`
  brain), SP-2 one money timeline (#48 `sources[]` subsumes `moneyEvents`), SP-3 uncertainty is
  a lens not a screen (Monte Carlo behind the arc band view, renamed "Scenarios" → "Range" —
  naming collision with Ideas' scenario cards), SP-4 platform is chrome (PDF = Journey export,
  compare = Ideas shelf, advisor share = read-only entitlements), SP-5 surface governance
  (Numbers ≤ 6 tabs; Ideas = one mode control; My details grows by collapsed cards), SP-6
  household scope toggle. Four owner decisions recorded: mobile bar swaps Strategies in at L3;
  premium locks quiet by default; Monte Carlo = lens with one verdict (+ a binding revisit note);
  **"My details" is its own top-level screen, NOT part of Settings** (WI-3.2/#99 rewritten —
  Settings stays app-centric for Appearance/Sharing/About and future login/subscription, rendered
  as a desktop gear utility). Also: a per-item capacity map (every unhomed backlog item → fact
  home / output / decision surface / tier), a stress-test record (forced the shared
  `bracketRoomByYear` model view — #57 — consumed by #59/#67/#68/conversions, and day-one
  `readOnly` in the entitlements design), three disposition upgrades (PDF, A/B compare, Monte
  Carlo: Defer → Adopt), and a new **Level 5 — End-state build-out** batch WI-5.1…5.6.
  Tracker 111 → 117 items (38 done, 79 planned; IDs 112–117).
- Level 0 — Foundations shipped (Jun 12 2026, WI-0.1/#110 + WI-0.2/#111): the Violations
  register (V1–V11) is fully resolved and the enforcement tooling is installed.
  WI-0.1: Ideas scenario stats now come from ONE `calcWhatIfScenario` run (new pure export in
  `what-if.js` returning chart + real stat scalars; `calcWhatIfChart` is a thin wrapper, so the
  stats row and the arc overlay can never diverge) — the fake `stats` multipliers are gone and
  the displayed scenario numbers changed fake → real (owner-approved; e.g. Income/mo now
  honestly shows "no change" for scenarios that don't override expenses). New display bundles
  wired via `horizonProps`: `statementView` (`calcStatementView`, budget.js — percentages,
  waterfall residual set, monthly conversions; null pcts when no income), `chartMilestones`
  (`calcChartMilestones`, accumulation.js — RMD gate from `RMD_START_AGE`, no `?? 90`),
  `planView` (`calcPlanProgress`, retirement-drawdown.js — Infinity/zero-horizon guards),
  `yearlyRows` (`buildYearlyRows` — age→calendar-year in the model). NumbersScreen's
  depletion label reads `retirementWalk.depletionAge`; ArcGraph's cone factor is the named
  `CONE_LOWER_ASYMMETRY` (documented illustrative). Side fix BUG-34 (what-if re-sims dropped
  permanent accumulation-phase money events) logged in `docs/BUGS.md`.
  WI-0.2: `whatIfSimInputs` / `whatIfBundle` / `retDrawShared` / `horizonProps` (and
  `calcRMDTaxSchedule`) memoized with complete deps; ESLint flat config with
  `react-hooks/rules-of-hooks` + `exhaustive-deps` as errors (`npm run lint`, clean — 11
  findings fixed); referential-stability test (mocks HorizonShell, asserts every prop
  identity-stable across a no-op re-render); SCENARIOS/LIFE_EVENTS value-locks
  (`src/horizon/__tests__/presets.test.js`); full-nav screens render smoke. 307 → **338**
  tests; golden master untouched. Tracker: #110 + #111 done (40 done, 77 planned).
- Level 1 — Glance shipped (Jun 13 2026, WI-1.1/#88, WI-1.2/#89, WI-1.3/#90):
  Plan screen is now fully interactive — every number is tappable and navigates
  to its explanation. WI-1.1: `navigate(screenId, subView)` wired through
  HorizonShell; four stat cards deep-link (You keep → Numbers/Statement, Retire
  at → Ideas/dials, Income for life → Numbers/Statement, Left at 90 →
  Numbers/Year by year); OnTrackPill opens a popover with 3 model-provided
  drivers (`calcPlanDrivers`, retirement-drawdown.js — withdrawal rate vs 4%
  guideline, longevity vs horizon, savings rate vs 15% guideline; ok booleans
  used for the trend badge — no comparisons in the screen). WI-1.2: new
  `src/model/signals.js` — `calcSignals` ranks ≤2 dollar-weighted nudges
  (unclaimed employer match, conversion benefit > $5k, budget deficit); signals
  wire through App memo → horizonProps; `SignalsStrip` in PlanScreen dismisses
  per-signal via localStorage and deep-links via navigate. WI-1.3: committed
  `moneyEvents` shown as dots on the arc (good-token inflow / warm-token
  outflow; events=[] renders pixel-identical to before). Named IRS constants
  added: CONVERSION_STEP, SAFE_WITHDRAWAL_GUIDELINE_PCT, SAVINGS_RATE_GUIDELINE_PCT.
  338 → **355** tests (+17: signals ×10, calcPlanDrivers ×6, budgetDeficit ×1);
  golden master untouched. Tracker: #88 + #89 + #90 done (43 done, 74 planned).
- Horizon Batch A shipped (Jun 11 2026, PRs #16): foundation work for iterative Horizon delivery.
  HorizonShell.jsx split into per-screen files (`src/horizon/screens/`). New pure model export
  `calcWhatIfChart` in `what-if.js` returns `[{age,total}]` series for a scenario override.
  `safeGet`/`safeSet` exported from ThemeContext for onboarding detection. `horizonProps` extended
  with `moneyEvents`, `setMoneyEvents`, `whatIfSimInputs` bundle, `commitPlan` (confirm-commit
  wrapper), and `retirementWalk`. Two bugs fixed: `commitPlan` missing deps; `calcWhatIfChart`
  silently dropping permanent `moneyEvents` from the retirement walk. 303 → **307** tests.
- Horizon Batch B shipped (Jun 11 2026, PR #16): Ideas screen fully functional.
  #70 — Scenario cards use `calcWhatIfChart` for real model arc overlays; `bigTrip` passes a
  `scenarioEvents` override ($40k outflow at 70). #69 — Dial your future ± buttons live-update
  offsets and "Show on arc →" calls `calcWhatIfChart`. #71 — Life event pills show a
  ConfirmModal before writing to `moneyEvents` (arc + longevity update immediately). #75 —
  "Make this my plan" in both IdeasScreen (saves scenario's retire age) and PlanScreen (saves
  current values) uses confirm modal → `commitPlan` → 2-second toast. New shared component:
  `src/horizon/ConfirmModal.jsx`.
- Level 2a — Journey screen shipped (Jun 13 2026, WI-2.1/#91): new top-level Horizon screen
  porting all 20 Flow-Down metrics (`calcFlowDown`) as a 3-chapter narrative (Today /
  Building years / Retirement years). Chapter 2 shows the optional Roth conversion window
  callout (`conversionWindowYrs > 0`). Chapter 3 shows the income floor strip (SS + pension)
  and the depletion verdict. All numbers from `horizonProps.flowDown` — zero recomputation.
  Mobile MoreSheet added to HorizonShell (SCREENS now 6; first 4 in the mobile bar, remaining
  2 in a slide-up sheet). Journey wired in screen render switch. New test file
  `src/horizon/__tests__/journey-screen.test.js` (+7 tests: render smoke, chapter
  headings, totalAtRet wiring, sustainable verdict, conversion window callout,
  no-window case, null-flowDown guard). 355 → **362** tests; golden master untouched.
  Tracker: #91 done (44 done, 73 planned).
- Render-smoke hardening (Jun 13 2026, test-only — no `src/` model or screen logic
  changed; golden master untouched): the Horizon render-smoke was one monolithic `it()`
  that walked all screens in sequence (stopping at the first failure) and accepted a
  truthy `toJSON()` tree as proof a screen rendered — a blanked-out screen or an error-
  boundary fallback could pass. Rewritten to (1) drive navigation from the now-EXPORTED
  `SCREENS` source of truth in `HorizonShell.jsx` via `it.each`, so a newly added screen
  is auto-covered; (2) a coverage-guard test that fails if `SCREENS` and the per-screen
  marker map drift apart (you cannot add a screen and forget to test it); (3) per-screen
  assertions of an always-visible, screen-specific text MARKER plus a min visible-text-
  length check (blank/fallback no longer slips through); (4) isolated tests per screen
  (fresh App mount each → failures pinpoint one screen, no state bleed). Deep paths kept:
  Numbers' 3 sub-tabs and the Ideas `calcWhatIfScenario` one-run path. The stale `it()`
  description ("Plan, Ideas, Numbers…" — omitted Journey) is gone. 362 → **370** tests.
- Level 2b — Numbers tabs (Budget / Accounts / Taxes) shipped (Jun 13 2026,
  WI-2.2/#92, WI-2.3/#93, WI-2.4/#94): three new tabs added to the Numbers screen,
  bringing the total to 6 (Statement | Budget | Accounts | Taxes | Year by year |
  Money flow). All data comes from model-provided `horizonProps` bundles — zero new
  arithmetic in `src/horizon/` (rule 10 / principle 6).
  - WI-2.2: `horizonProps.budget` bundle (`grossAfterTax`, `effectiveLiving`,
    `savingsCapacity`, `currentContribTotal`, `availableSurplus`, `optimizedAllocation`).
    `calcOptimizedAllocation` memoized with `useMemo` (was inline — caused `budget`
    reference to be unstable, failing the V9 stability test). Budget tab shows a
    savings waterfall (4 rows, deficit warning when `availableSurplus < 0`) and a
    read-only allocation stack (account types with amounts, only rows where amount > 0).
  - WI-2.3: `horizonProps.retVals` (already present) + `chartMilestones` (reused).
    Accounts tab shows 4-bucket horizontal bars (width is CSS layout math — not
    financial math) and milestone pills from `calcChartMilestones`.
  - WI-2.4: `horizonProps.taxView` bundle (`fedMarginal`, `fedEffective`,
    `effectiveRMDTaxRate`, `projectedRetBracket`, `rmdTaxBite`, `convTaxTotal`).
    Taxes tab shows a 2-segment working/retirement timeline, rate rows, and a
    lifetime composition bar (working tax / RMD tax / conversion tax segments).
  Both new bundles (`budgetView`, `taxViewBundle`) memoized separately before
  inclusion in `horizonProps` (V9 / principle 13). `horizon-screens-smoke` extended
  to drive all 6 Numbers sub-tabs. New test file
  `src/horizon/__tests__/numbers-tabs.test.js` (+20 tests across 3 describes).
  Golden master untouched; no model logic changed.
  370 → **390** tests. Tracker: #92 + #93 + #94 done (47 done, 70 planned).
- Level 2c — Year-by-year + money flow + arc scrub shipped (Jun 13 2026,
  WI-2.5/#95, WI-2.6/#96, WI-2.7/#97): completes the Level 2 "Understand" exit gate —
  a user can trace every dollar through every life stage without opening Classic. No
  math added to `src/horizon/` (rule 10); golden master untouched.
  - WI-2.5 (#95) — Year-by-year is now the **whole life** (accumulation + retirement),
    9 columns (Age | Year | Portfolio | Contrib. | Growth | Draw | Tax | RMD | Conversion).
    `runSimulation` now emits per-year **gross `growth` + `tradGrowth`** (locked by a
    test); `buildAccumulationRows` (`accumulation.js`) builds the working-year rows on
    the **after-tax basis** with a **reconciling** contrib/growth split — the Trad 401k
    share of both is discounted by the same marginal factor as the displayed balance, so
    `prevTotal + contrib + growth = total` holds (locked by a reconciliation test). This
    was an owner decision after a trust review: a pre-tax growth figure beside an
    after-tax Portfolio is a trust bug, so the table is one consistent ledger. RMD +
    Conversion columns join `rmdDataWithTax.rmd` and `conversionSim.years.conversion` by
    age via the extended `buildYearlyRows` (null → "—", never synthesized 0). A footer
    note explains the after-tax growth.
  - WI-2.6 (#96) — Money-flow tab gains a **Working / Retirement** toggle; the retirement
    view shows Expenses ← Social Security + Pension + Portfolio draw. New model
    `calcRetIncomeFlow` (`drawdown.js`) pre-splits the bands and **guarantees they sum to
    `effectiveExpenses`** (uses ssAtRet, the age-gated SS — rule 5b); the over-funded edge
    scales income bands down so the sum still equals expenses. `retIncomeFlow` bundle in
    `horizonProps` (memoized, V9).
  - WI-2.7 (#97) — Arc **tap-to-scrub**: pointer/touch handlers on `ArcGraph`'s SVG;
    inverse x→age (layout math), nearest charted year via pure exported `scrubPointForAge`,
    floating chip with age + total (plus draw/growth/tax when a `retirementWalk.rows` entry
    exists). New optional `walkRows` prop, passed by Plan + Ideas. No-scrub renders
    pixel-identical to before; uses only existing series.
  - Cross-app reconciliation audit (owner request): the Year-by-year table was the only
    "laid-out math" surface that didn't reconcile — now fixed. The Budget waterfall
    (running balances) and the Statement waterfall (documented residual `flowKeep`) already
    reconcile by model construction; Journey's growth is the independent `Σ(row.growth)`
    (rule 2b). No further changes needed.
  390 → **412** tests (+22). Tracker: #95 + #96 + #97 done (50 done, 67 planned).
- **BUG-35 fixed — per-account retirement engine as the single source (Jun 15 2026, PR-A):**
  the Traditional 401k was taxed twice (after-tax retirement seed + RMD/conversion tax on the
  gross balance), and the displayed RMD schedule used a separate nominal-growth, withdrawal-
  ignoring projection. Fixed via direction A (owner-approved): a per-account, GROSS-seeded,
  taxed-once engine (`retirement-engine.js`) + orchestrator (`retirement-phase.js`) is now the
  ONE source for longevity, the RMD schedule, `rmdTaxBite`, and the conversion benefit/optimizer.
  Balances are gross everywhere (chart, Statement/Accounts, Flow-Down, accumulation rows, what-if);
  `totalAtRet` is gross with a `spendableAtRet` after-tax reference chip (haircut at the
  **retirement** rate — also fixes the old working-rate haircut). Default retirement expense is now
  the user's current living spend (`effectiveLiving`), portfolio-independent, replacing the
  self-referential `3% × portfolio`. Deliberate golden-master moves (re-locked): `totalAtRet`
  3,484,197 → 3,950,603; default expense ~104,525 → 57,377; `firstRMD` 118,198 → 62,071;
  `rmdTaxBite` 683,974 → 202,423; `netConversionBenefit` 77,861 → −10,096 (aggressive bracket-fill
  is net-negative at this spend); `yearsSustained` 62.9 → Infinity (trivially sustainable at the
  honest spend). `evaluateConversionPlan` now consumes the engine's benefit; the optimizer searches
  via the same engine (`retPhaseBase`). Follow-ups: `what-if.js` + `calcOptimizedScenario` still use
  the blended `buildRetirementDrawdown` for deltas (gross basis, engine-consistent tax maps), and a
  dedicated **per-account detail screen** is the planned PR-B. The suite is **441 tests** (was 412
  before BUG-35). `docs/BUGS.md` BUG-35 → Resolved.
  PR #32 review fixes (Gemini + CodeRabbit), all inert at the default state (golden master unchanged):
  (1) RMD computed **before** any same-year conversion (IRS sequencing); (2) **tax-on-tax gross-up** —
  when Taxable is exhausted and the 401k funds the income tax, that withdrawal is now itself taxed
  (fixed-point solve); (3) **one-time money events** folded into `needed` before the tax solve, so a
  purchase funded from the 401k is taxed + grossed up like any draw (and depletion sees it via
  `spendShort`); (4) stale "after-tax" display copy in App.jsx updated to **gross (pre-tax)** — the
  "Trad 401k" line and Year-by-year table already show gross balances (rule 2b); (5) **taxable inflows
  taxed** — the engine now routes events through the shared `applyMoneyEvents` helper (was orphaned)
  and taxes a flagged taxable inflow (e.g. inherited pre-tax IRA) as ordinary income on the floor
  (`inflowTax` component). Stale after-tax comments swept from simulation/what-if/retirement-tax.
  Round-4 review fixes (Gemini + CodeRabbit + Copilot, all inert at default): (6) RMD-schedule
  `bal` now the Traditional 401k balance (`r.trad`), not the whole portfolio, matching the
  "Est. 401k Balance" column; (7) conversion-benefit `rmdTaxSaved` compared over the span BOTH
  walks are active (apples-to-apples when conversions change longevity); (8) Flow-Down accumulation
  growth no longer clamped at 0 (negative real growth reconciles the bridge); (9) per-account cards
  reconcile to gross `totalAtRet` when `addlPreTaxBal > 0` (Trad card includes it; `retTrad` tax
  scalar decoupled, = `tradGrossAtRet`). +2 regression tests.
  **PR #32 merged 2026-06-15** after 6 review rounds (CodeRabbit + Gemini; Copilot was requested but
  isn't provisioned on the repo). Four follow-ups left open + detailed in `docs/BUGS.md`: **BUG-36**
  (what-if/optimized deltas + accumulation event income tax not yet on the engine), **BUG-37** (engine
  ignores `conversionTaxSource` — owner-deferred, would move the golden master), **BUG-38** (engine
  doesn't charge the base tax on the SS/pension floor — SS/pension effectively tax-free; inert at
  default, needs income-surplus handling), **BUG-39** (Flow-Down accumulation growth is a residual
  plug, not `Σ(row.growth)` — rule 2b). Next planned work is **PR-B** (per-account detail screen).
- **Constants correction + whole-codebase-review close-out (2026-06-23, branch
  `claude/ai-codebase-review-fpigu3` → PR to `main`):** two threads of work landed together.
  1. **IRS/SSA/state constants audit + correction.** A stale `FICA_WAGE_BASE` (2024's 168,600 under a
     "2026" label) triggered a full web-sourced audit of `irs-2026.js`; it turned up ~30 more stale
     dollar figures. All corrected to verified 2026 values: wage base → **184,500**; SS PIA bend points
     → **1,286 / 7,749**; HoH std deduction → **24,150**; all 8 LTCG thresholds (were 2024); Roth
     phase-out (single/mfj/hoh, were 2025); 401k catch-up **8,000** / 415(c) **72,000** / +catch-up
     **80,000** / HSA **4,400**; IRMAA breakpoints+surcharges → 2026 **combined Part B+D** (owner
     choice); ACA FPL → the **2025-published** set, with a documented prior-year rule (ACA subsidy
     eligibility for plan year N uses year N−1's FPL — refresh note in the file). State tables: **HI
     factual fix** (was "fully exempts 401k/IRA" — it taxes them; now 0.075), 2026 rate cuts (KY 3.5,
     GA 4.99, OK 4.5, UT 4.5), NE "flat"→graduated, KS 5.58. New **`src/config/__tests__/irs-2026.test.js`**
     integrity guard: structural invariants (ascending brackets, monotonic SS factors, descending RMD
     divisors, etc.) + value-locks on every verified figure, so a future stale refresh fails loudly.
     Deliberate golden-master moves (re-locked, all direction-verified): ssAIME 12399→12977,
     ssAnnualBenefit 45,924→48,120, firstRMD →62,508, totalRMDs →1,152,878, rmdTaxBite →207,557,
     `retRoth` →659,072, `totalAtRet` →4,035,855, `spendableAtRet` →3,654,179, `withdrawalRate`
     →1.42168, `netConversionBenefit` →−9,854. Full detail: `docs/BUGS.md` (2026-06-23 batch).
  2. **Whole-codebase AI review (CodeRabbit + Gemini) — both passes closed.** The review was run as 3
     layer PRs (#34 Model / #35 View / #36 Shell) against an empty `review-base` so the bots saw whole
     files; setup in `docs/REVIEW-GUIDE.md` + `.coderabbit.yaml`, findings consolidated + triaged in
     **`docs/REVIEW-FINDINGS.md`** (first + second pass). ~50% of bot volume was false positives
     (filtered with reasons). Real fixes landed this session: `optWR` SS/pension claim-age gating
     (rule 5b); `marginalRate` 0 below the standard deduction; spouse income plateau at
     `incomeGrowthEndAge`; **Roth phase-out switched to AGI-net MAGI** (was gross — owner-approved,
     moved `retRoth`, shared `netOrdinaryIncome` used by both the phase-out and the LTCG bracket);
     `fvAnnuity` negative-rate; shared `claimFactor()` SS clamp; defensive NaN/negative guards
     (employer-match, healthcare, conversion-planning, budget, tax-basis/money-events defaults);
     removed a **fabricated "9 in 10 markets" probability** from the arc (rule 6 — no Monte Carlo);
     formatter hardening; file-upload validation; keyboard-a11y (`kbActivate` + StatCard/Settings);
     money-event age clamp-on-blur; NumbersScreen footnote now shows the real `returnRate`. The 3
     review PRs were **closed** (vehicles, not merge candidates); `review/*` + `review-base` branches
     remain for reference. Intentionally deferred (documented in REVIEW-FINDINGS.md): cosmetic
     micro-perf nits only. Suite **481 tests**, lint clean, production build OK.
- **Numbers screen depth build-out — Sessions 1–4 (2026-06-13 through 2026-06-24, PR #38):**
  completed the Level 2 "Understand" Numbers tabs (Budget / Accounts / Taxes) and hardened the
  Year-by-year and Money-flow tabs. PR #38 on branch `claude/kind-euler-rh0qvs` was reviewed by
  CodeRabbit and Gemini across 4 sessions and 4 review rounds; all real findings fixed, noise
  triaged and recorded. Fixes shipped in PR #38:
  1. **MFJ income in `calcStatementView`** — was calling with `currentIncome` (primary only);
     fixed to `householdIncome` (combined for MFJ per rules 3 & 9). Display-only; golden master
     untouched.
  2. **Composition bar scope** — `taxView.composition` mixed `fedTax` (one working year) with
     lifetime `rmdTaxBite` + `conversionCost`. Removed the working-year segment; renamed heading
     to "Retirement-phase tax composition"; total changed 784_739 → 766_739 (RMD + conversion
     only). Renamed `taxViewBundle` field accordingly.
  3. **`taxSaveFromPreTax` scope** (`App.jsx`) — was using `safeDeduc` (all pre-tax deductions)
     for the 401k+HSA tax-saving callout; fixed to `Math.round((contrib401k + contribHSA) *
     fedMarginal)` so the copy "401k + HSA saves you $X in taxes this year" matches what it says.
  4. **Tab-strip keyboard accessibility** — Numbers tab `<div>` controls converted to
     `<button type="button">` with `aria-pressed`; expandable year-by-year rows gained
     `role="button"` + `tabIndex={0}` + `aria-expanded` + `onKeyDown` Enter handler.
  5. **Jump bar filtered to displayed ages** — was showing age buttons for unmounted rows (ages
     past row 50); now filtered to ages present in `displayedRows`.
  6. **`WITHDRAWAL_RATE_DANGER_PCT: 6`** — formerly hardcoded `wr <= 6` threshold; moved to
     `irs-2026.js` ASSUMPTIONS and imported (rule 1).
  7. **Null driver edge state** — `d.ok === null` (inapplicable metric, e.g. longevity=Infinity)
     was counted as a failing driver in the plan view; fixed to only count explicit `false`.
  8. **`markerByAge` key collision** — object literal with the same numeric age key silently
     dropped earlier label (e.g. retire-at-73 lost either "Retire" or "RMD start"); fixed with
     a `reduce` that concatenates labels: `"Retire · RMD start"`.
  9. **Budget footer total** — allocation-stack rows showed optimized values (`oa.opt*`) but the
     footer showed `currentContribTotal`; fixed by adding `optimizedContribTotal` to `budgetView`
     and using it in the screen footer.
  10. **Ref callback memory leak** — year-by-year `ref={el => { if (el) rowRefs.current[...] = el }}`
      prevented React's null-on-unmount from clearing stale DOM refs; fixed to always assign
      (including null on unmount).
  11. **V9 referential stability** — `markerByAge` and `tablePhases` memoized separately so their
      deps (`safeRetAge`, `depletionAge`, `safeLifeExp`) no longer appear in the `horizonProps`
      dep array. `budgetView` and `taxViewBundle` dep arrays cleaned up (removed stale `fedTax`
      and age deps that had moved to child memos). All stability tests pass.
  12. **Footer copy** — year-by-year footer now reads "balances and growth shown gross; taxes
      appear in the Tax and Draw columns" (was "growth after tax", inaccurate after BUG-35).
  13. **`fmtMo` / `fmt` guard** — retirement income companion strip values were already monthly;
      corrected from `fmtMo(val)` to `fmt(val)` (would have shown 1/12 of correct amount).
  14. **`?? null` for savings guideline** — was `?? 15` (fabricated); changed to `?? null` with
      a null guard on render (shows "—" when driver unavailable — rule 10).
  15. **Null display in expanded row** — `fmt(engRow.rmdTax ?? 0)` → `fmt(engRow.rmdTax)` and
      `Math.round(X ?? 0).toLocaleString()` → `fmt(X)` so null cells show "—" not "$0".
  Suite **516 tests**, lint clean, golden master untouched.
  New open bug filed: **BUG-40** — `taxView.composition.total` = RMD tax + conversion tax only;
  misses `drawTax` (tax on extra 401k draws beyond conversions/RMDs) so the retirement-phase
  tax total is understated in Taxes tab. Needs `totalTax` added to `retirementWalk` (model
  change); deferred to a future PR.
- **User-controlled Roth-conversion timing (2026-06-24, branch `claude/401k-roth-conversion-rules-5dtodw`):**
  conversions were hardcoded to the gap-years window (retirement+1 → 72). Now: (1) **flexible window** —
  `buildConversionByAge` (`retirement-phase.js`) and `buildIncomeFloors` (`conversion-planning.js`) take
  explicit `startAge`/`endAge` instead of `safeRetAge`+offset; App resolves them from new
  `conversionStartAge`/`conversionEndAge` state (null = default window, the golden-master pin) with
  start/stop-age sliders. `evaluateConversionPlan`'s age-offset param renamed `safeRetAge`→`windowStartAge`.
  (2) **Pre-retirement one-time conversions** — new `conversionEvents:[{id,age,amount}]` + helper
  `src/model/conversion-events.js`; `runSimulation` applies them in the working-year loop (rule 2b: principal
  trad→Roth, taxed once via `stackedIncomeTax` on `netOrdinaryIncome`, tax funded from taxable with a
  converted-amount fallback). Under-59½ funded-from-converted shortfalls charge the **10% early-withdrawal
  penalty** (new `EARLY_WITHDRAWAL_AGE`/`EARLY_WITHDRAWAL_PENALTY` constants). Lowered trad seed carries
  forward to `tradGrossAtRet` automatically → lower future RMDs (the benefit shows in longevity/`rmdTaxBite`,
  NOT in the window `netConversionBenefit` headline — the `noConv` counterfactual seeds from the lowered
  balance; documented). Gated behind an **in-service-eligibility** toggle (`ConversionEventsPanel`). (3)
  **Optimizer suggests start age + amount** — `findOptimalConversionPlan` (sibling of `findOptimalConversion`)
  searches `(startAge, amount)`; the suggestion line shows both. New working-year `convEvent`/`convEventTax`
  row fields flow into the Year-by-year ledger (`accumulation.js`, reconciles `prev+contrib+growth−tax=total`).
  Default state unchanged (events `[]`, window null, in-service off) → **golden master untouched**. 516 → **540**
  tests (+24: window-equivalence, working-year conservation/penalty/carry-forward, optimizer-plan, LTCG-bracket
  with conversion, conversion-event NaN guard, optimizer input-guard). PR #39 reviewed by CodeRabbit + Gemini
  across multiple rounds; real findings fixed (working-year conversion now bumps that year's LTCG bracket; NaN
  guards in `conversion-events.js` + the panel; `maxSearch` + `startAgeRange` guards in `findOptimalConversionPlan`;
  optimizer floor-cache + zero-baseline perf; panel a11y/empty-state; optimizer suggestion also surfaces a better
  start age). Skipped with reason: the "displayed cost omits penalty" flag (false positive — `convEventTax` already
  folds in the penalty) and an optimizer-extraction refactor (deferred follow-up). CodeRabbit's full 14-scenario
  edge-case audit found no bugs. Docs: `FINANCIAL-MODEL.md` Roth Conversion Model section + Correctness Fix Log +
  Known Simplifications updated; `BUGS.md` BUG-36 scope note added (conversion events now taxed in accumulation).

- **Plan screen "Command Center" wow factor (2026-06-25, branch `claude/plan-page-redesign-lcy9sh` → PR #41):**
  transformed the Plan screen from a static view into an interactive command center with emotional financial narrative. No model changes — all new fields are pre-computed in App.jsx memos and passed via named `horizonProps` fields (rule 10). 560 tests unchanged, golden master untouched.
  **QuickTunePanel** (shipped earlier on this branch): up to 10 sliders (Retire at, Monthly spend, Plan to age, 401k savings, Income growth, Growth rate, Inflation, SS age, Spouse SS age [conditional on `isMarried`], Roth conversion [conditional on `canTuneRothConversion`]), activity pill rail, "Save as my plan" → `commitPlan` callback, "Reset" restores to `committedPlan` snapshot; live arc updates on every drag.
  **Portfolio Hero block:** large `totalAtRet` in bold with `wealthMultiplier` subtitle ("grows 14× from today") from `planHighlights.wealthMultiplier` = `totalAtRet / currentTotalSaved`. Live `planDelta.badge` shows "↑ $X more" / "↓ $X less" (green/warm) only when `isDirty`; badge pre-computed in App.jsx with `{dir, atRetAbs, yearsGain}` so no sign/abs math in the screen.
  **Income Replacement Meter:** monthly retirement income + income-replacement % from `planHighlights.incomeReplacementPct`; per-source bars (SS / Pension / Portfolio) with integer `ssPct`/`pensionPct`/`portfolioPct` + `hasSS`/`hasPension` guards from `planHighlights.retIncomeFlow` — all width values model-provided (rule 10). `calcRetIncomeFlow` (drawdown.js) guarantees the three bands sum to `effectiveExpenses`.
  **Enriched stat cards:** 4 existing cards gain one-line context subtitles (`yearsToRetirement`, `incomeReplacementPct`, `retirementDuration`) from `planHighlights`; new 5th "Retirement taxes" card shows `planHighlights.lifetimeTaxBurden` = `rmdTaxBite + convTaxTotal`.
  **New App.jsx additions:**
  - `committedOutputs` state + `shouldSnapshotOutputs` ref + `useEffect` deferred snapshot (avoids reading stale closure values inside `commitPlan`)
  - `planHighlights` memo: `wealthMultiplier`, `incomeReplacementPct`, `retIncomeFlow` (wraps `calcRetIncomeFlow` + integer `ssPct`/`pensionPct`/`portfolioPct` + `hasSS`/`hasPension` booleans), `lifetimeTaxBurden`, `yearsToRetirement`, `retirementDuration`
  - `planDelta` memo with pre-computed `badge` sub-object: `{dir, atRetAbs, yearsGain}` — no comparisons in PlanScreen
  - `sliderBounds` memo: 9 slider min/max values + `canTuneRothConversion` boolean — no bounds math in src/horizon/
  - `setRetirementAgeCoupled` callback (mirrors Classic's `contribEnd*` coupling)
  - `setMonthlySpend` callback (month→year conversion in model layer, not the screen)
  **Bug fix — `isDirty` asymmetry (commit `01960b9`):** comparing `(annualExpenses ?? effectiveExpenses)` vs `committedPlan.annualExpenses` was asymmetric — when a plan was saved from Ideas/onboarding, `committedPlan.annualExpenses` is `null` but the left side resolved `effectiveExpenses` (non-null), making `isDirty = true` immediately after saving. Fixed to compare raw `annualExpenses` state on both sides: `null !== null → false` (correctly not dirty).
  **Review:** 6 rounds by CodeRabbit + Gemini across multiple sessions; all real findings fixed, noise triaged. Tracker: #120 done (52 done, 68 planned).

- **Level 3 — Control begins: setter bundles + My details (2026-06-26, branch
  `claude/laughing-galileo-nj8p83` → PR #44, squash-merged to `main`):** opened the Depth
  Ladder's Level 3 with two work items (plus two review-fix rounds folding in the CodeRabbit +
  Gemini findings on PRs #44/#46/#47). Display/plumbing only — **golden master untouched**,
  560 → **575** tests, lint clean, build OK.
  - **WI-3.1 (#98) — setter bundles in `horizonProps`.** The write-access plumbing all of
    Level 3 builds on. Eight topic-grouped, separately-memoized bundles (`profile`, `spending`,
    `accounts`, `ss`, `pension`, `conversion`, `health`, `assumptions`) let Horizon write back to
    the **shared** App.jsx state — one state, both UIs in sync, no duplication (principle 11).
    Self-describing field shapes so screens carry zero constants/bounds math (rule 1 / rule 10):
    numeric → `{ value, set, min, max, step }` (+ `sliderMax` on balances, `pct`/`defaultPct` on
    `stateRateOverride`, `estimated` on `ssOverride`); toggle → `{ value, set }`; choice →
    `{ value, set, options:[{value,label}] }`. `min`/`max`/`step` + option labels copied **verbatim**
    from Classic; dynamic bounds (`livingExpenses.max`, the per-account contribution step, the
    **BUG-17** `ssClaimingAge.min = max(SS_MIN_CLAIM_AGE, currentAge)` floor) computed in the bundle
    memos. Setter wrappers preserve Classic behaviour (snap-to-null on `stateRateOverride`/
    `incomeGrowthEndAge`/`ssOverride`, `preApplySnapshot` clears, `selectedState` clears its rate
    override). New coupled setters `setCurrentAgeCoupled`/`setLifeExpectCoupled` mirror Classic's
    cross-field invariants (`setRetirementAgeCoupled` reused); the `assumptions` bundle includes the
    timeline trio `currentAge`/`retirementAge`/`lifeExpect`. Shapes documented in `ARCHITECTURE.md`.
    New `src/__tests__/setter-bundles.test.js` (round-trip per bundle + BUG-17 floor / dynamic step /
    snap-to-null wrappers); `horizon-props-stability.test.js` (V9) auto-covers the bundles.
  - **WI-3.2 (#99) — "My details" screen** (`src/horizon/screens/MyDetailsScreen.jsx`), the first
    real consumer of the bundles. A calm accordion of five plan-fact cards (Income & job / Spending /
    Accounts & match / Health & Medicare / Assumptions) over the `profile`/`spending`/`accounts`/
    `health`/`assumptions` bundles. One reusable `DetailField` drives every control off a bundle
    field's shape: desktop sliders, mobile ± steppers (onboarding pattern), segmented buttons /
    `<select>` for choices, Yes/No toggles — all bounds/labels from the bundle, never the screen
    (rule 10). Closed-card summaries are pure formatting of raw bundle values. Nullable fields
    (living/retirement expenses, income plateau, state-rate override, marketplace premium) render an
    explicit **"Auto"/"Not set"** edge state seeded from the model's effective value, never a
    fabricated number (rule 10). SS + pension deliberately excluded — they belong to their Strategies
    flows (WI-3.4/3.5). **SettingsScreen already held no plan-fact inputs**, so the WI's "Settings has
    no plan-fact inputs" criterion was already met and Settings was left unchanged; the desktop
    "Settings → gear utility" repositioning (owner decision 4) is a **deferred follow-up**, noted in
    `ROADMAP.md`. Added `details` to `SCREENS` (desktop tab; mobile More sheet) + render-smoke marker.
    New `src/horizon/__tests__/my-details-screen.test.js` (render, summaries, numeric/toggle/choice
    write-through, nullable seed).
  - **Review (CodeRabbit + Gemini).** PR #44 squash-merged before the bots finished, so the full
    cumulative Level-3 diff was re-surfaced via a **throwaway whole-diff PR #47** (base = pre-Level-3
    commit) and all fixes landed on **PR #46** across several rounds (merged 2026-06-26). Real
    functional bugs caught + fixed: `ssClaimingAge.min > max` past age 70 and the stored-value clamp;
    `lifeExpect` sync in the shared current-age handler (latent in Classic, surfaced by DRYing the
    duplicate handler onto `setCurrentAgeCoupled`); the state-rate stepper snap threshold (0.15 ≥ 0.1
    step → stuck on mobile); `ssOverride` dynamic max; `marketplaceMonthlyPremium` negative-stepper.
    Plus rule-10 / a11y: removed `?? 0` + `seed:0` fabrication behind a `canEdit` guard, honoured
    `sliderMax`, native-`<button>` card header, conditional-render declutter matching Classic. One
    false positive skipped (the "560 → N" regression-history note is internally consistent). **Full
    root-cause/files/fix log: `docs/BUGS.md` → "Level 3 (Control) review fixes" (2026-06-26).**
  - Docs reconciled: `ROADMAP.md` Level-3 shipped notes + `ARCHITECTURE.md` bundle-shape registry +
    `feature-tracker.html` #98/#99 done (54 done, 66 planned) + `docs/BUGS.md` review batch. Next:
    WI-3.3 Strategies scaffold + WI-3.9 Apply-with-preview (shared infra for the WI-3.4–3.7 flows).

- **Level 3 — WI-3.3 (#100): Strategies screen scaffold (2026-06-28, branch
  `claude/wi-3-3-plan-review-18861e`):** the decide-here destination — a registry-driven card
  grid (editorial sections **Taxes / Income timing / Accounts**) where each strategy shows its
  dollar stakes and opens a back-button detail flow. Display/plumbing only — **golden master
  untouched**, 575 → **582** tests, lint clean, build OK. The plan was leak-tested by two
  adversarial reviews (interconnectivity + future-usability) before coding; their must-fixes are
  folded in below.
  - **`strategiesView` bundle** (new, separately-memoized for V9; shape in `ARCHITECTURE.md`):
    per-card `applicable` flags + ONLY the not-yet-wired card scalars (`rmd.firstRMDAmount/Age`,
    the SS scalars `ssMonthly/ssAnnual/claimAge/breakEven/delayGainYrs`, `mega.capacity/growth`).
    Cards whose headline already has a `horizonProps` home read it **directly**
    (`netConversionBenefit`, `yr1TaxSavings`, `budget.availableSurplus`) — one number, one source
    (principle 11), no duplication. Every `applicable` boolean + the `> 0` comparisons behind them
    are computed in the App memo, never in JSX (rule 10); `firstRMDAmount/Age` pre-extracted behind
    the `firstRMD ? … : null` guard so the screen never derefs `firstRMD.rmd`.
  - **`StrategiesScreen.jsx`** (new): a `STRATEGIES` registry (mirrors `SCREENS`) drives layout and
    reserves a per-entry `Flow` slot — **null at L3** — so WI-3.4–3.7 attach an interactive flow to
    an id without reshaping the registry. The detail body is a single swappable slot
    (`entry.Flow ?? <ReadOnlyStub/>`); the WI-3.9 ApplyPreviewModal + interactive controls mount
    there later, so the container + read-only data path survive. **Two card states only**
    (`active` / `notset` = free-but-unconfigured) — premium **locking is deferred to WI-5.2's
    `entitlements` + `LockedCard`** (a third, additive branch) to avoid a second source of truth.
    **Sign-aware Roth headline:** the golden-master default `netConversionBenefit = −9,854` shows as
    "−$9,854 — not worth it at this spend" (value-locked in the test). Deep-link via
    `initialStrategy={subView}` (mirrors Numbers' `initialTab` / Ideas' `initialMode`).
  - **HorizonShell:** Strategies added to `SCREENS` at desktop **position 5**; mobile bottom bar
    swapped per owner decision 1 to **Plan · Ideas · Numbers · Strategies · More** (Journey moves to
    the More sheet) — `MOBILE_BAR_SCREENS`/`MORE_SCREENS` are now **explicit id lists**, not
    `slice(0,4)`/`slice(4)`, updated across all three consumers (bar render, More-active highlight,
    MoreSheet). Side fix: `megaGrowth` memoized at its definition (returned a fresh array each
    render → would have broken V9 stability for `strategiesView`).
  - **Deferred to later WIs** (recorded so they aren't re-litigated): the interactive flow bundles
    `ssView`/`rmdView`/`conversionView` attach as **sibling** `horizonProps` fields keyed by the
    same strategy id (WI-3.4–3.7); the "For you" signals strip + applicability *hiding*
    (`notset`-renders-a-teaser → may-not-render) + the 4th "Assets" section → WI-5.5; premium
    locking → WI-5.2.
  - Tests: new `src/horizon/__tests__/strategies-screen.test.js` (6-card render, three sections,
    headline value-locks incl. the negative Roth, `notset` edge state, flow open/back, deep-link,
    deep-link-clear); smoke `SCREEN_MARKERS` gains a `strategies` entry (the new screen is
    auto-driven by the `it.each(SCREENS)` loop). V9 auto-covered by `horizon-props-stability.test.js`.
  - **Review fixes (PR #49 — CodeRabbit + Gemini + the two pre-code agents), all display-only,
    golden master untouched:** (1) **Roth card now shows the healthcare-adjusted verdict** —
    `taxView.conversionDetail.{adjustedNetConversionBenefit,isPositive}` (the same field
    Numbers→Taxes uses), not the pre-healthcare `netConversionBenefit` the label claimed; removes a
    `?? 0` sign-guess from the screen (CodeRabbit 🟠). Inert at default (healthcare costs 0 → still
    −9,854). (2) **Deep-link clears both ways** — `useEffect` now `setSelected(initialStrategy ?? null)`
    so re-selecting the tab returns to the grid (CodeRabbit 🟡; regression-tested). (3) **SS card is
    override-aware** — `ssMonthly`/`ssAnnual` mirror Classic (`ssOverride`/`effectiveSS`) so the card
    can't diverge from Plan/Numbers when an SS override is pinned (agent finding). (4) **RMD 73 / SS
    FRA 67 in copy** now come from `RMD_START_AGE`/`SS_FRA` in `irs-2026.js` (rule 1 / principle 9).
    (5) `MOBILE_BAR_SCREENS` gets `.filter(Boolean)` guarding a typo'd id; `surplus.applicable` (`> 0`)
    documented as intentionally stricter than `budget.surplusPositive` (`>= 0`). **Skipped:** Gemini's
    blanket optional-chaining / `props={}` / `?? false` (props are shell-guaranteed; rule 10 forbids
    the `?? 0`/`?? false` fabrication, and real nullables are already guarded).

- **Level 3 — WI-3.4 (#101) SS timing + WI-3.5 (#102) RMD outlook flows (2026-06-28, same PR #49
  for continuity):** the first two interactive flows mounted into the WI-3.3 scaffold's reserved
  `Flow` slots — proving the slot-in path end to end. Display/plumbing only — **golden master
  untouched**, 582 → **583** tests, lint clean, build OK. **WI-3.9 (Apply-with-preview) was
  deliberately deferred** to the WI-3.6 conversion PR where its first Apply button appears (building
  it now would ship unused infra against principle 5; SS/RMD write live through setter bundles).
  - **Foundation refactor:** the editable-field primitives (`DetailField`/`FieldRow`/`StepBtn`/`seg`
    + the `money`/`ageFmt`/`pctYr`/`pct` formatters) were extracted from `MyDetailsScreen.jsx` into
    new **`src/horizon/fields.jsx`** so the flows reuse one implementation (no duplication). Small
    flow presentation helpers (`SectionLabel`/`NoteBox`/`StatTile`) live in new
    **`src/horizon/screens/strategies/flow-ui.jsx`**.
  - **Sibling flow bundles** (forward contract realized): `ssView` (#101) + `rmdView` (#102) added
    to `horizonProps`, each memoized separately (V9), keyed by the same id as their `strategiesView`
    card. Consequently `strategiesView.ss`/`.rmd` shrank to `{ applicable }` only — the card face now
    reads its headline from the flow bundle (one number, one source, principle 11), matching how the
    conversion/withdrawal/surplus cards already read `taxView`/`yr1TaxSavings`/`budget`. Both bundles
    are built from already-computed App scalars (no new model math); `householdSS`/`withdrawalRate`/
    `effectivePension`/`effectiveExpenses` are read directly from `horizonProps` by the flows.
  - **`SSTimingFlow.jsx`** (#101): include toggle, claim-age stepper/slider (FRA/early/delayed
    label), override (seeded from the PIA estimate), 3 benefit stats + AIME note + coverage %,
    delay-to-70 impact box (gated `delayApplicable`), married spouse section (basis toggle, spouse
    estimate + claim age, `spouseAltHigher` advisory, household stats), and a pension income card.
    Writes via the `ss` + `pension` setter bundles. Mirrors the Classic SS + Spouse SS + Pension
    sections value-for-value.
  - **`RMDOutlookFlow.jsx`** (#102): explainer; IRS-table selection (married / spouse-sole-benef /
    spouse-age with the Table II >10-yr-gap note + active-table label); `addlPreTaxBal` input;
    3 outlook stats (first RMD / lifetime total / est. tax) with the retire-after-73 edge note;
    first-10-years schedule (Age/Divisor/Balance/RMD/Tax) from the ONE engine `rmdSchedule`. Writes
    via the `ss` + `accounts` bundles. IRS start age from `RMD_START_AGE` (config).
  - Tests: `strategies-screen.test.js` extended (flow open/back, a setter write-through, RMD
    deep-link, deep-link-clear, + a `delayApplicable` regression) — the flows render off synthetic
    view+setter bundles. `ARCHITECTURE.md` documents the `ssView`/`rmdView` shapes.
  - **Review fixes (PR #49 — 3 Gemini passes + 3 Opus agents + CodeRabbit), all display-only,
    golden master untouched (582 → 584 tests):** (1) **`HM` crash** — `SSTimingFlow` referenced the
    monospace token after the shared-helper extraction dropped it from the import; the delay-to-70
    box throws at the *default* state (claiming < 70). Fixed + a `delayApplicable: true` regression
    test (it slipped past lint — no `no-undef` rule — and the smoke only renders the grid).
    (2) **rule-10 math out of JSX** — `householdSS/12` → `ssView.householdSSMonthly`;
    `SS_MAX_CLAIM_AGE − claimAge` → `ssView.delayGapYrs`; RMD `(rate*100)` → preformatted
    `rmdView.effectiveRMDTaxRateLabel`. (3) `fields.jsx` `money` made sign-aware (one formatter;
    StrategiesScreen's local copy removed). (4) `<select>` got `aria-label`. (5) RMD table rows
    wrapped in `<React.Fragment key>`. (6) `ss.ssOverride` passed directly (no redundant rebuild).
    **Skipped (with reason):** the `addlPreTaxBal.value > 0` note-gate (a raw-input UI conditional,
    identical to the accepted `pensionMonthly.value > 0` / `incomeGrowth.value > 0` pattern — rule
    10 targets derived-number applicability, not raw-input toggles) and Gemini's blanket
    optional-chaining / `props={}` (props are shell-guaranteed; rule 10 forbids `?? 0`/`?? false`).
  - **Review fixes (round 3 — CodeRabbit on b78aebd; Gemini came back clean):** more render-only
    (rule 10) + a11y polish, all display-only, golden master untouched: (1) FRA age-comparison labels
    moved out of `SSTimingFlow` JSX into `ssView.claimAgeLabel` / `ssView.breakEvenContext`
    (`claimAgeFmt` stays only as the editable claim-age field's live formatter); (2) the DERIVED
    `effectivePension > 0` gate → model flag `ssView.showEffectivePension` (the raw-input
    `pensionMonthly.value > 0` gate stays — accepted pattern); (3) `fields.jsx` ± steppers +
    segmented/boolean buttons got `aria-label`s (parity with the `<select>`/slider). **Skipped:**
    conversion-window `${n} yr${n===1?…}` pluralization (display formatting, not model arithmetic).
  - Next: WI-3.6 (conversion planner) + WI-3.9 (Apply-with-preview) + WI-3.7 (withdrawal order /
    surplus / mega flows).

- **Level 3c — Apply-with-preview shell + Roth conversion planner flow (2026-07-08, branch
  `claude/roadmap-review-3.6-3.9-tmzy01`):** WI-3.9 (#106) and WI-3.6 (#103) shipped together —
  the shared "no Apply without a preview" pattern, proven on its first and deepest consumer.
  Display/plumbing only — **golden master untouched**.
  - **WI-3.9 — the shell.** New `src/model/apply-preview.js`: `buildPreviewMetric` (signed
    delta + `dir`/`tone` + money/longevity formatting with Infinity/null edges — one row renders
    both "years sustained" and "depletion age"), `isSuggestionApplicable` (the `available` gate,
    machine-checked to go false once the candidate equals the current setting — "suggestion
    clears once applied" is now a test, not a manual check), `buildConversionPreview`. New
    `src/horizon/ApplyPreviewModal.jsx` wraps `ConfirmModal` as a pure renderer (zero model calls,
    zero arithmetic); exports `PreviewMetricRow`/`VerdictBadge` for WI-5.4 reuse; a null-guarded
    `verdict` slot is reserved for #85. The payload shape, the Apply-site shape
    (`{ available, preview, apply, revert? }`), the Apply-site registry, and the
    gating-composition rule (entitlements/`readOnly` AND into `available` App-side, for WI-5.2)
    are documented in `docs/ARCHITECTURE.md`.
  - **WI-3.6 — the conversion flow.** New `conversionView` sibling bundle (App.jsx, keyed like
    `ssView`/`rmdView`): window (start/stop-age fields with Classic's cross-clamps,
    `isDefaultWindow`), bracket targets, outcome + tax-source comparison, a healthcare breakdown
    (pre-mapped `cliffAges`, pre-multiplied `irmaaRows`), tables (`buildRmdComparison`,
    `walkBalanceAt` — new `retirement-phase.js` helpers), **#118 working-year conversion events
    as App-built row objects** (`{ id, ageField, amountField, estTaxLabel, remove }` — one
    wrappable write path, not a raw array setter WI-5.2's readOnly wrapper couldn't see), and the
    optimizer's display fields + its Apply site. New `ConversionPlannerFlow.jsx` renders 10
    sections mirroring Classic (explainer, no-window edge state, window steppers, strategy,
    tax-source with the BUG-37 honesty note, outcome stat row — GROSS `netConversionBenefit`,
    sign-aware, the healthcare-**adjusted** verdict shown separately in the healthcare strip,
    tables, working-year events with the in-service gate + #119 limitation note, and the
    optimizer suggestion → `ApplyPreviewModal`). Registered in `STRATEGIES` — the conversion card
    now opens a live flow. `src/model/signals.js`'s conversion nudge retargets its deep-link to
    `{ screen: "strategies", subView: "conversion" }` (was the Numbers/yearly stopgap).
  - **Three resolutions recorded** (so they aren't re-litigated): (i) `adjustedNetConversionBenefit`
    stays in `taxView.conversionDetail` only — not duplicated onto `conversionView` — per
    ARCHITECTURE's principle 11, overriding an earlier roadmap draft that listed it as a
    `conversionView` field; (ii) `commitPlan` sites (Plan/Ideas "Save as my plan") stay on plain
    `ConfirmModal` — deferred to L3d, now with a named line in WI-3.8's Actions in
    `docs/ROADMAP.md`; (iii) **#57 `bracketRoomByYear`** (the shared conversion-window tax
    calendar) remains open — no headroom table shipped this round; its attachment point is
    documented in `ARCHITECTURE.md` for the future rental-sale/stock/DAF flows.
  - **Execution note:** implementation was delegated to Sonnet/Haiku subagents working from a
    detailed written plan (model layer, then App.jsx wiring, then the flow component, then a
    verification pass), with the orchestrator reviewing every diff against the plan's contracts
    before the next step started and making the commits — no implementation code was written by
    the orchestrating session itself.
  - **Browser verification:** verifier-browser passed every Horizon screen, the Classic
    round-trip, and the new flow. One pre-existing issue surfaced and was baseline-confirmed
    (reproduces before this build, at commit `9ba231b`): the verifier's "Numbers / Money flow"
    tab click times out. Filed same-day as **BUG-41**, initially misdiagnosed as a locator defect.
    **Re-diagnosed + fixed at the same-session close-out:** the "Money flow" tab doesn't exist —
    PR #38 (commit `434caf8`, 2026-06-24) consolidated it into Statement as a "Retirement income
    companion strip" without documenting the removal; only the verifier's hardcoded tab list had
    drifted. Fixed in `.claude/skills/verifier-browser.cjs`; see `docs/BUGS.md` BUG-41 (Resolved).
  - 584 → **643** tests, lint clean, build OK. Tracker: #103 + #106 done (59 done, 61 planned).

- **L3d — Withdrawal order / Surplus deployment / Mega backdoor + Ideas events/affordability
  (2026-07-09, branch `claude/l3d-horizon-depth-ladder-dr4gvv`): WI-3.7 (#104) + WI-3.8 (#105)
  shipped, closing the Level 3 "Control" exit gate's build work.** Full recon → plan → adversarial
  plan review (2 Fable agents) → implementation (5 Sonnet slices, model layer first) → post-ship
  review (2 Opus agents) → docs pipeline, per `docs/ROADMAP.md`'s stated process. **Merged into
  `main` separately from this branch while it was still open** — see the 2026-07-12 correction
  note at the end of this entry for what changed on integration.
  - **WI-3.7 (#104):** `withdrawalView` bundle feeds a read-only `WithdrawalOrderFlow.jsx`
    (draw-order sequence + tax-optimal-vs-worst-case + a savings callout gated on `hasSavings`).
    Classic's inline optimized-allocation Apply/Revert handlers extracted into
    `applyAllocation`/`revertAllocation` `useCallback`s — **Classic's own buttons now call these
    same callbacks**, closing a duplication the review flagged (BUG-25 #4 shape): one
    implementation, shared by both UIs, reading/writing the single `preApplySnapshot` state so
    Horizon and Classic can never disagree about applied/reverted state. `surplusApplySite` is the
    Apply-with-preview site for the surplus suggestion (docs/ARCHITECTURE.md's contract) — its
    "current" and "candidate" previews both run through `calcWhatIfDelta` (one with no override,
    one with a new optional `contribOverrides` param) so a no-change candidate can't show a
    spurious delta from a mechanism mismatch; **first real consumer of the contract's optional
    `revert` field** (an exact `preApplySnapshot` restore — no modal, no preview, by design).
    `megaView` bundle (415(c) capacity breakdown, growth projections, match-mode inputs read
    directly from the existing `accounts` bundle) feeds `MegaBackdoorFlow.jsx`; `strategiesView.mega`
    shrank to `{applicable}` (capacity/growth moved to `megaView`) in the same commit as its
    `StrategiesScreen` consumer switch, avoiding a red intermediate state.
  - **WI-3.8 (#105):** a new `eventsView` bundle wraps every `moneyEvents` mutation as per-field
    `{value,set}` objects + `add`/`remove` list-mutation callbacks, **replacing the raw
    `setMoneyEvents`** that was previously exposed directly on `horizonProps` — same underlying
    state/shape/6-event cap (now one shared `MAX_MONEY_EVENTS` constant), but no bundle exposes an
    un-wrapped write surface anymore (the Apply-with-preview contract's "no raw setter" rule, which
    postdates WI-3.8's original wording — a deliberate, documented supersession). `EventsEditorPanel.jsx`
    renders it as a new "Events" mode on Ideas' existing segmented mode control. A new
    `AffordabilityPanel.jsx` ("Solvers" mode) calls `calcAffordabilityMax` directly — the same
    sanctioned in-screen pure-function-call pattern `IdeasScreen` already used for
    `calcWhatIfScenario` — fed by a new `affordView` bundle (model-provided age defaults/bounds);
    Classic's `WhatIfPanel` now shares the same `ASSUMPTIONS.AFFORDABILITY_STEP` constant, so both
    UIs are step-identical by construction. Both `commitPlan` sites deferred from WI-3.9's L3c
    shell now route through `ApplyPreviewModal`: Plan reads a static `planCommit` site built in
    App.jsx; Ideas' candidate retirement age varies per scenario card, so it uses a new
    **site-builder callback** `buildScenarioCommitSite(candidateAge)` instead of a static site
    object — a documented new variant of the Apply-site shape, built the same App-side way (both
    "current" and "candidate" through one `calcWhatIfDelta` mechanism) so it can't diverge either.
    Onboarding (`HorizonShell.jsx`) intentionally kept on plain `ConfirmModal` — no committed
    baseline exists yet there to preview against.
  - **Post-ship review (2 Opus agents) — one confirmed bug fixed, one confirmed copy bug fixed.**
    `calcWhatIfDelta`'s forced re-sim path silently dropped `addlPreTaxBal` (an outside pre-tax
    balance App.jsx already folds into the headline `totalAtRet`/`tradGrossAtRet`) — a
    **pre-existing gap** in the resim branch, newly made user-visible because `surplusApplySite`
    and `buildScenarioCommitSite` are the first features to market a prominent "same mechanism,
    current vs candidate" preview built on it; a user with `addlPreTaxBal` set could see a spurious
    six-figure "decrease" for a genuinely beneficial optimization. Fixed with an optional
    `addlPreTaxBal` param (default 0, inert everywhere else), wired through `whatIfBundle`
    (Horizon) and `WhatIfPanel`'s `sharedArgs` (Classic) identically. Also fixed:
    `AffordabilityPanel`'s "doesn't sustain" message was only accurate for one of the two states
    that produce `canAfford:false` (a sustainable plan with zero purchase headroom showed the same
    false claim) — reworded to a message accurate in both cases without a new model field.
    Forward-compat findings recorded (not code changes): the Level 3 exit gate's "(parity
    checklist)" clause has no artifact yet (deferred to WI-4.1); `revert` isn't yet explicitly
    named in the Apply-site contract's gating-composition paragraph (harmless today — nothing is
    `readOnly` yet — but noted for WI-5.2); the `buildScenarioCommitSite` site-builder variant and
    the shipped bundle shapes are recorded in `docs/ARCHITECTURE.md`'s registry.
  - 687 → **702** tests (+15 across the WI-3.7/3.8 slices and the review-fix commit), lint clean,
    build OK, golden master untouched throughout. Tracker: #104 + #105 done (61 done, 59 planned).
  - **PR #51 in-house 8-angle review (2026-07-09), after CodeRabbit (free-tier summary only) and
    Gemini (two passes, one minor finding already triaged) returned nothing further.** Ran the
    `/code-review` skill at high effort — 8 parallel finder angles (3 correctness + reuse +
    simplification + efficiency + altitude + CLAUDE.md conventions) against the full PR diff,
    independently verified. Found 3 real bugs the paid bots missed (2 fixed immediately, 1 flagged
    for an owner decision) plus several accepted-as-noted architecture observations:
    **BUG-63 fixed** (originally numbered BUG-44 on this branch, renumbered 2026-07-12 — see the
    correction note below) — `AffordabilityPanel`'s desktop age input had no bounds clamp (the mobile
    stepper clamped, the typed-number path didn't), so a typo'd age past the walk horizon made
    `calcAffordabilityMax` converge on `maxSearch`, displaying a nonsensical "$5,000,000
    affordable" result. **BUG-64 fixed, then BUG-47 deepened it** (BUG-64 originally numbered
    BUG-45) — the life-event pill's "placed"
    checkmark was tracked as local shadow state (`placedEvents`) disconnected from the real
    `moneyEvents`; independently corroborated by 3 of the 8 finder angles. BUG-64's first pass
    added a narrow `atMax` guard (a false-success state once the events cap was hit); asked to
    reconsider rather than accept the rest as debt, BUG-47 removed `placedEvents` entirely and made
    "placed" a live derivation off `eventsView.rows` — fixing two more drift directions in the same
    pass (toggling a pill "off" not removing the underlying event; a mode switch's `clearScen()`
    blanket-resetting every pill's checkmark). **BUG-46 filed, not fixed** — Ideas' "Big trip at
    70" scenario card computes its displayed numbers with `scenarioEvents` included, but
    `buildScenarioCommitSite`'s Apply-preview only forwards the retirement-age override, so the
    preview can show "no change" for a scenario whose whole point was a $40k event; needs an owner
    call on whether to fix the preview's honesty or expand `commitPlan`'s scope to persist scenario
    events (`apply()` has never persisted them, before or after this PR). Noted, not changed:
    several reuse/duplication opportunities in the new `AffordabilityPanel.jsx` (a bespoke stepper
    instead of `fields.jsx`'s `DetailField`; a second `DeltaChip` copy of Classic's), and a few
    architecture observations on `calcWhatIfDelta`'s growing override-param surface and the
    `buildScenarioCommitSite` site-builder shape — recorded in the PR/BUGS.md, not blocking.
  - 702 → **707** tests (+5: BUG-63's clamp test, BUG-47's rewritten 4-test life-event-pill block),
    lint clean, build OK, golden master untouched.
  - **Fable UI/UX review of PR #51 (2026-07-09), by request — separate from the correctness-focused
    reviews above.** With the WI-3.7/3.8 build, post-ship review, and in-house code-review pass all
    done, ran a Fable agent adversarially against the Horizon UI specifically (not model math),
    scoped first to this PR's new screens then the surrounding Horizon shell/Ideas/Plan/arc, asked
    to surface "a few bugs worth fixing" in the UI as it stands — not limited to this session's
    diff — so they could ship in the same package. The agent read broadly, then ran a live
    Playwright session to verify its top candidates rather than reporting from static reading alone.
    10 findings; 7 fixed, 3 logged as Open (BUG-49/50/51) with reasoning for deferring each:
    **BUG-52** — QuickTune's SS-age slider had drifted to a hardcoded flat `62-70`, regressing
    BUG-17's `currentAge` floor (browser-verified: a 66-year-old could drag the slider to 62).
    **BUG-53** — the Events editor's age field (new this PR) had the exact clamp-on-every-keystroke
    defect BUG-48 had just fixed in `AffordabilityPanel`, but at its actual origin site — typing
    "70" produced "120" (browser-verified); fixed with the same draft-then-commit-on-blur pattern.
    **BUG-54** — the arc's hero-endpoint and band-view end labels unconditionally claimed "still
    covered, for life" / "Even lean: covered" regardless of the actual balance shown (browser-
    verified for the depleted-plan case) — the same class of fabricated-verdict bug this codebase
    has fixed before (the removed "9 in 10 markets" copy); both gated on values the component
    already computes locally, no new props. **BUG-55** — Ideas' "Left at 90" stat compared the
    baseline (already `safeLifeExp`-based, despite the name) against a scenario value hardcoded to
    literal age 90 in `calcWhatIfScenario` — an apples-to-oranges comparison whenever
    `lifeExpect != 90`; fixed at the model layer (the hardcoded `BAL_REFERENCE_AGE` constant
    removed, now uses `safeLifeExp`) plus the stale "Left at 90" label, matching a fix PlanScreen
    already had. **BUG-56** — the "Dial your future" ± controls were completely unbounded
    (browser-verified: a far-enough retire-age dial silently failed to show on the arc with zero
    feedback, since the model returns `null` for a degenerate retirement-age override); fixed by
    reusing PlanScreen's own `sliderBounds` for the retire dial (bases match exactly) and a
    self-contained $0 floor for the spend dial (investigated and found `sliderBounds.spendMin`
    would have been a subtly WRONG bound to reuse there — it's based on `annualExpenses ??
    effectiveExpenses`, which diverges from the dial's own `effectiveExpenses`-only base once a
    user has ever touched Plan's spend slider). **BUG-57** — a defensive one-liner
    (`showMakePlan` now clears alongside `activeScen`) for a currently-unreachable but
    easy-to-strand state. **BUG-58** — ported PlanScreen's already-correct `setTimeout`-cleanup +
    dirty-reset pattern for the "✓ Saved" badge to Ideas, which had shipped without either.
    Deferred: **BUG-49** (most of Horizon's nav/Ideas controls are keyboard-unreachable — broad,
    mechanical, needs its own dedicated pass applying the `kbActivate` pattern already used
    correctly elsewhere, not a single contained fix); **BUG-50** (`OnTrackPill` popover has no
    outside-click dismissal — minor polish); **BUG-51** (Events editor amount-field zero-render +
    an `findPlacedRow` matching-semantics question that needs an owner call, not a code fix).
  - 707 → **709** tests (+2: the two new dial-bounds regression tests), lint clean, build OK,
    golden master untouched throughout (checked explicitly — `calcWhatIfScenario` isn't invoked at
    the default App state, so the `scenarioBalAt90` model fix has zero default-state impact).
  - **Correction (2026-07-12, integration into `claude/arc-event-placement-video-61zalx`):** this
    branch had independently built its own #121/#122 redesign of Ideas/Plan on an earlier `main`
    commit, before L3d's work above existed, so the two never saw each other until this merge.
    Ideas' "Events" mode here (`eventsView`/`EventsEditorPanel.jsx`, a raw moneyEvents CRUD list)
    was retired on integration — the owner had separately rejected the raw-editor/preset-card
    pattern that same day in favor of #121's sheet-first `LifeEventSheet` flow (`saveEvent`/
    `removeEvent`, see `docs/BUGS.md` BUG-44 addendum), which already covers every job `eventsView`
    did. The "Solvers" mode (`AffordabilityPanel.jsx` + `affordView`) is a genuinely independent
    addition with no overlap and was kept as a 3rd Ideas segment. `planCommit`/
    `buildScenarioCommitSite` (the "Save as my plan" Apply-with-preview sites, built against the
    QuickTunePanel-era UI) were retired along with QuickTunePanel itself, superseded by #122's
    `applyPlanLevers`. `surplusApplySite`/`surplusView`/`withdrawalView`/`megaView` (WI-3.7) are
    unaffected — common ancestry both branches already shared, untouched by the integration. Four
    bug-ID collisions from this batch's own numbering (BUG-42/43/44/45 vs. this branch's unrelated
    BUG-42/43/44/45) were resolved by renumbering this batch's four colliding entries to
    BUG-61–BUG-64; see `docs/BUGS.md` for the full renumbering note.

- **Life-event placement on the arc (2026-07-10, branch `claude/arc-event-placement-video-61zalx`,
  feature #121):** the video-inspired (Copilot Money "Path") what-if event flow, owner decisions:
  sheet-first placement / duration-based events / verdict + impact bullets / upgrade Ideas + Plan.
  **Model:** `money-events.js` gains **duration events** (`{ monthlyAmount, durationMonths, age,
  isInflow, incomeAnnual }` — "$X/mo for N months", income offset prorated; untaxed by design,
  BUG-36 scope note) beside one-time events; `eventNetForYear` is the ONE per-year source, now
  consumed by `runSimulation`, `buildRetirementDrawdown`, AND the per-account engine (which already
  used `applyMoneyEvents`); new `eventFirstAge`/`eventLastAge` make every phase filter
  (`App.jsx` `retPhaseBase`/`retDrawShared`, `what-if.js` accum/ret splits) **kind-aware**, so a
  boundary-spanning duration event reaches both walks and each applies only its own years.
  New `evaluateLifeEvent` (`what-if.js`): baseline + candidate `calcWhatIfScenario` runs → verdict
  ("comfortable"/"tight"/"unaffordable", buffer `ASSUMPTIONS.EVENT_COMFORT_BUFFER_YEARS: 5`),
  `grossCost`/`netTotal`, `atRetirement`/`atPlanAge` deltas with model-computed `dir`, and
  sustainability flags (`newlyDepletes`/`depletionMoved`) — screens render only (rule 10).
  **BUG-42 found + fixed en route** (`docs/BUGS.md`): `calcWhatIfScenario` silently dropped
  pre-retirement `scenarioEvents` (they only reached the retirement walk) and its re-sim excluded
  events at exactly the retirement age that the main App path counts; pre-/at-retirement scenario
  events now force a re-sim that includes them. **UI:** new `src/horizon/LifeEventSheet.jsx`
  (one-time vs "Monthly, for a while" toggle, income-while-it-runs field, age slider bounded by the
  new memoized `horizonProps.lifeEventBounds`, live verdict card + impact bullets); `ArcGraph`
  event dots upgraded to **tappable icon badges with stems** (`icon` field, `onEventTap` prop;
  `events=[]` still renders pixel-identical); Ideas life-event pills open the sheet seeded from the
  preset (LIFE_EVENTS got icons, `scen` coupling dropped, "Travel 6 months" + "Part-time at 60"
  became duration seeds — preset value-locks updated deliberately), placed pills + arc badges
  re-open it in edit mode with Remove; Plan arc badges tap-to-edit too. Classic panels untouched.
  Golden master untouched (defaults empty). 643 → **674** tests (+23 model, +8 sheet/badge);
  lint clean; build OK; Playwright verifier all screens + a scripted end-to-end drive of the new
  flow (open sheet → duration change updates verdict → commit → badge on both arcs → edit →
  remove).

- **Plan/Ideas re-differentiation + preview-first levers (2026-07-11, branch
  `claude/arc-event-placement-video-61zalx`, feature #122):** the two screens had converged
  after #121; two Fable design rounds (owner feedback folded in) re-split them. **Plan** is now
  a calm dashboard of the COMMITTED plan: full-width arc (54vh desktop / 38vh mobile — the
  320px scrolling right rail is gone), a 3-column band (PortfolioHero [delta badge retired] |
  IncomeMeter | new **TryAChangePanel**), then stat cards + signals. TryAChangePanel's two
  levers (Retire at, Monthly spend) are **preview-first**: dragging draws the DASHED what-if
  overlay on Plan's own arc + a delta chip (ONE `buildLeverPreview` run feeds both) and
  explicit **Apply** (via `ApplyPreviewModal` → new App callback `applyPlanLevers` →
  `commitPlan`, which now accepts `monthlySpend`) / **Discard** — real state never moves on
  drag. QuickTunePanel and the `planDelta`/`committedOutputs` dirty-state machinery are
  RETIRED; the 8 assumption sliders live in My details. **Ideas** stays the deep workshop
  (SP-5 tidy): ONE segmented control Dials · Events · Scenarios (askit folded into Scenarios;
  mode ids unchanged for deep links), Dials are live sliders whose dashed overlay + strikethrough
  stats come from ONE run, and the commit verb is unified to **"Apply to my plan"** via
  `ApplyPreviewModal` — fixing the old bug where the spend dial was never committed.
  **Overlay-continuity fix (closes the scenario half of BUG-36):** `calcWhatIfScenario` now
  walks retirement with the per-account engine (`buildRetirementPhase`) using the SAME memoized
  inputs as the solid arc (whatIfBundle gained `retPhaseBase`/`conversionByAge`/`baseChart`/
  `addlPreTaxBal`), locked by an invariant test: a no-op scenario's chart deep-equals
  `totalChartData`; `ArcGraph.trimScenarioOverlay` starts the dashed line exactly at the
  divergence age. **Colored verdict tick rails** (the video's rail idea): `buildLeverRail` /
  `buildDurationRail` (what-if.js) run the model once per slider step → comfortable/tight/
  unaffordable ticks under Plan levers, Ideas dials, and the LifeEventSheet duration slider
  (shared `VerdictTickRail` in `fields.jsx`); `verdictForMargin` is the ONE verdict formula,
  shared with `evaluateLifeEvent`. New model exports: `buildLeverPreview`, `buildLeverRail`,
  `buildDurationRail`. Golden master + preset value-locks untouched throughout. 674 → **686**
  tests; lint clean; build OK. Execution note: implemented by Sonnet subagents (model layer →
  App plumbing + Plan re-layout → Ideas tidy) from a Fable-written plan, orchestrator reviewing
  every diff and committing; docs by Haiku.
  **Post-ship review battery (2026-07-11, PR #52):** three parallel agents (Fable adversarial,
  Sonnet interoperability, Fable forward-compat) + CodeRabbit/Gemini. Fixed in three passes
  (commits `0ddfb4d`, `8937669`, + bot pass): H1 edit-mode double-count (new `excludeEventId`
  override — unchanged edit of a committed event now shows exactly zero delta, regression-locked);
  Ideas scenario-event Apply drop (Big trip now previews WITH events and commits them);
  engine-exact depletion ages (`scenarioDepletionAge`/`baseDepletionAge` replace a
  round-one-year-early derivation); `calcWhatIfDelta` `<=` boundary; keystroke model-run waste;
  Classic MoneyEventsPanel duration-event NaN→"$0" (net impact via `totalEventImpact`, duration
  rows read-only); **BUG-43** (signals deep-linked to the removed numbers/"flow" tab → blank
  body; retargeted to budget + exported `NUMBERS_TABS` guard); raw `setMoneyEvents` →
  wrapped `saveEvent`/`removeEvent` (WI-5.2 readiness, write-surface registry in ARCHITECTURE);
  `calcAffordabilityMax` onto the engine (solver can never contradict the arc; BUG-36 narrowed
  to calcWhatIfDelta + calcOptimizedScenario); `verdictForMargin` exported + `verdictDisplay`
  (#85 readiness); `LEVERS` table (#123 readiness); stale `incomeAnnual` zeroed on money-in
  events; keyboard a11y (Ideas pills/cards/CTAs → native buttons; arc badges focusable with
  Enter/Space). Skipped with reasons (recorded on the PR): CodeRabbit's "move model calls behind
  App plumbing" (contradicts the documented screens-call-pure-builders pattern), "overlay trim
  to model" (chart-layout math in src/components), input-seed defaults (deliberate preset
  seeding). 686 → **714** tests.
  **Independent post-fix verification (2026-07-11, same day):** a fresh adversarial pass
  re-checked the fix commits themselves rather than trusting them — found and fixed **BUG-45**
  (the H1 exclude-committed-event fix reached `evaluateLifeEvent`'s verdict card but not the
  sibling `buildDurationRail` tick rail, so editing a committed *duration* event could still show
  the rail and the verdict card disagreeing) and flagged **BUG-44** (Ideas' scenario cards had no
  "already applied" state, so re-applying "Big trip at 70" silently duplicated its $40k event).
  BUG-44 was then fixed same-day per an explicit owner design requirement — "either the event
  exists or it doesn't, there is no in-between": scenario cards now show "✓ {label} · Already on
  your plan" once their event(s) are committed, and the shared CTA becomes **"Remove from plan"**
  instead of "Apply to my plan" (`matchCommittedEvents` by-label lookup, mirroring the Events
  pills; `handleRemoveScenario` new). 714 → **716** tests.
- **Retire the locked "Scenarios" preset grid (2026-07-12, branch
  `claude/arc-event-placement-video-61zalx`):** owner pushback on Ideas' "Scenarios" tab — its 4
  preset cards applied a hidden value with one tap and weren't editable, unlike the Events tab's
  sheet-first flow the owner explicitly liked. Scope: Scenarios only (Events already did it
  right). `src/horizon/screens/IdeasScreen.jsx`: deleted `SCENARIOS`, the `mode === "suggest"`
  panel, `activeScen` state, `scen`/`scenario` derivations, `matchCommittedEvents`, `scenApplied`,
  and `handleRemoveScenario`. The 3 age-only cards became two Dials **quick-jump chips**
  (`RETIRE_JUMPS`, exported, value-locked) — `retire2Early` (relative, `-2`) and `retire60`
  (absolute, `targetAge: 60`), resolved uniformly through `handleRetireJump`'s clamp to
  `sliderBounds.retireMin/retireMax` before converting to the offset the slider state already
  speaks. Two chip *kinds* exist specifically because a naive `retireAdj: -5` chip breaks once
  `retirementAge` sits close to `currentAge` (`sliderBounds.retireMin` can exceed the naive
  target) — without the clamp the range input silently desyncs from its label and
  `calcWhatIfScenario` returns `null` (dead overlay, dead Apply). `saveMore` ("Save $300
  more/mo") was dropped, not remapped — Dials has no savings lever (deferred #123) and forcing
  that framing onto a bare retire-age chip would be dishonest. The 4th card ("Big trip at 70")
  folded into `LIFE_EVENTS` as a normal editable pill (`🧳`, $40k/age 70, same seed values) —
  Events' existing `committedByLabel` placed-pill mechanic means the fold-in inherits BUG-44's
  duplicate-prevention fix for free. `MODES` shrinks to Dials · Events; `askit` now aliases to
  `dials` (its old job — "what if I retire earlier" — is literally the `retire2Early` chip).
  This **structurally closes the whole BUG-44 bug class**: quick-jump chips are a pure slider
  nudge with no committed write, so the only committed-state writes left are Dials' Apply (one
  path) and the LifeEventSheet's Save/Remove (one path, upsert-by-id) — no "tap a card, a hidden
  value silently applies" surface remains; BUG-44's fix code retired with the surface it
  protected (addendum logged in `docs/BUGS.md`). No model-layer change — `buildLeverPreview`/
  `buildLeverRail` already take `{ retirementAge, monthlyExpenses }` overrides with no event
  support, so the age-only chips map onto the existing `retirementAge` lever 1:1.
  `docs/ROADMAP.md` (4 touch-points), `docs/HORIZON.md`, `docs/ARCHITECTURE.md`, and
  `feature-tracker.html` corrected to drop the retired "Scenarios" naming (dated amendments, not
  rewrites — the historical Violations-register and WI-0.1/0.2 text are left as written).
  716 → **715** tests (net: 2 segmented-control tests + 5 Dials-mode tests incl. the two new
  quick-jump chip tests + 2 Events-mode tests incl. a placed-pill regression replacing the
  deleted BUG-44 test's coverage — down from 10 in the old 3-segment file).

- **Integration: L3d (WI-3.7/3.8) merged into the arc-event-placement branch (2026-07-12).**
  While PR #52 (this branch — #121/#122 + the Scenarios removal above) sat open, a separate
  branch (`claude/l3d-horizon-depth-ladder-dr4gvv`) shipped WI-3.7/3.8 and merged to `main`
  independently — built on an *older* `main` commit, so it never saw #121/#122's redesign of
  IdeasScreen/PlanScreen. Merging `main` back into this branch surfaced real conflicts requiring
  judgment, not just text reconciliation (owner-directed integration plan, see the git history for
  the full back-and-forth): kept this branch's redesigned Ideas (Dials · Events sheet-first, no
  Scenarios) and Plan (`TryAChangePanel`, `QuickTunePanel` retired) as the base; ported forward
  WI-3.8's genuinely new, non-overlapping **"Solvers" mode** (`AffordabilityPanel.jsx` +
  `affordView` — "what's the biggest one-time expense my plan can absorb") as Ideas' 3rd segment;
  retired WI-3.8's **`eventsView`**/`EventsEditorPanel.jsx` (a raw `moneyEvents` CRUD editor) —
  functionally superseded by the sheet-first `LifeEventSheet` flow, and the pattern itself is what
  the owner had rejected earlier that same day; retired `planCommit`/`buildScenarioCommitSite`
  (the QuickTunePanel-era "Save as my plan" Apply-with-preview sites) since QuickTunePanel itself
  was gone. `surplusApplySite`/`surplusView`/`withdrawalView`/`megaView` (WI-3.7) were common
  ancestry both branches already shared — untouched, auto-merged cleanly.
  **Real bugs found and fixed during the merge itself** (not pre-existing — introduced by the
  merge's own mechanics, caught by re-testing rather than trusting the auto-merge): (1) a dropped
  `const BAL_REFERENCE_AGE = 90;` declaration left two call sites referencing an undefined name
  (`ReferenceError` on every `calcWhatIfScenario`/`buildLeverRail`/`buildDurationRail` call) —
  fixed by adopting main's own review-fix pattern (use `safeLifeExp`, not a hardcoded 90) for the
  M1 engine branch too, which a dedicated regression test (`ideas-modes.test.js`, ported over)
  proves was the intended behavior; (2) `AffordabilityPanel.jsx` called the merged
  `calcAffordabilityMax` with the OLD single-object-spread signature instead of this branch's
  newer `(bundle, options)` signature — would have silently misbehaved (Solvers mode's amount/
  target fields absorbed into the bundle instead of read as options). **Bug-ID collision**: main
  independently reused BUG-42/43/44/45 for four different bugs than this branch's own BUG-42–45;
  renumbered to BUG-61–64 (`docs/BUGS.md`), cross-references updated in lockstep. The now-
  incompatible `ideas-modes.test.js` (tested the retired raw-editor UI) was deleted; its 3 still-
  relevant Solvers-mode tests (anti-divergence lock, `canAfford:false` edge state, blur-clamp
  regression) were ported into `ideas-screen.test.js`'s "Solvers mode" describe block; `MODES`
  gained a 3rd `"solvers"` entry. `EventsEditorPanel.jsx` deleted (dead code post-retirement).
  Docs reconciled with dated correction notes (not rewrites) in `CLAUDE.md`, `docs/BUGS.md`,
  `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/HORIZON.md` — each explains what was retired
  and why, pointing at the others for full detail rather than duplicating it.
  763 tests (was 715 before the merge, 709 on main's side — net +48 after dedup/renumber/port),
  lint clean, build OK, **golden master byte-identical to this branch's pre-merge tip**.
- **PR #52 CodeRabbit review-fix round (2026-07-12, same branch, after the L3d merge).** Two
  fresh CodeRabbit passes over the post-merge diff surfaced 7 real findings, all fixed same-day
  (BUG-65 through BUG-71 in `docs/BUGS.md`): `commitPlan` used the bare (uncoupled)
  `setRetirementAge` instead of `setRetirementAgeCoupled` — real for onboarding's `handleSave`,
  which calls `commitPlan` directly with no pre-coupling, so a first-run retirement-age pick could
  silently desync `contribEnd*` ages; `surplusApplySite`'s two `calcWhatIfDelta` calls defaulted
  `moneyEvents` to `[]` instead of the committed state, so the surplus-deployment preview silently
  ignored any committed events; `MAX_MONEY_EVENTS` moved into `ASSUMPTIONS` (was a standalone
  export in `money-events.js`, now re-exported from there, matching the `AFFORDABILITY_STEP`
  precedent); three Trivial dedups (`IdeasScreen`'s `dialOverrides`, `App.jsx`'s
  `retirementMoneyEvents`, `what-if.js`'s `deltaYearsFrom`); `AffordabilityPanel` now re-clamps
  its staged ages if `affordView`'s bounds shift while mounted; `LifeEventSheet`'s 4 segmented
  toggles gained `aria-pressed`; `calcWhatIfScenario`'s dead-in-production fallback resim path
  now adds `addlPreTaxBal` back into `startBal` (the same basis-mismatch class already fixed
  twice elsewhere in this PR). Four architecture-pattern findings (ArcGraph `trimScenarioOverlay`,
  LifeEventSheet's two model-call sites, PlanScreen's lever-derivation calls) were reviewed and
  replied to inline with the established reasoning — screens calling pure model builders directly
  for a live per-drag/per-keystroke preview is this repo's documented, deliberate pattern, not a
  rule-10 violation — and left unchanged. CodeRabbit independently re-verified every fix against
  the diff both rounds and reported no further findings. 763 tests throughout (no new tests — all
  fixes were argument-wiring/dedup/a11y with existing coverage), lint clean, build OK, golden
  master untouched.
- **Duration-event lost-income modeling + cushion-based verdict (2026-07-13, branch
  `claude/ideas-solvers-events-review-3npdhg`, 4 commits).** Three concurrent fixes across the
  model and UI: (1) **BUG-72 fixed** — duration events ("Big trip," sabbaticals) now suppress the
  user's income during the event period via a new working-year income channel
  (`eventsIncomeAdjustment`); salary, 401k deferral, employer match, HSA/Roth/taxable
  contributions, and MAGI (Roth phase-out + LTCG bracket) all see the suppressed income —
  `incomeAnnual` now means "your total income during this time" (0 = sabbatical), seeded in the
  LifeEventSheet from the model-projected salary at the event age
  (`lifeEventBounds.projectedIncomeByAge`). No double-count rule: each month's income is handled exactly once (accumulation
  via `eventsIncomeAdjustment`, retirement via portfolio channel). Known simplifications: SS AIME
  not suppressed (< 1% 3-yr effect), spouse never suppressed (#30 scope), retirement event income
  untaxed (BUG-36 scope). (2) **BUG-73 fixed** — verdict displays now show margin context (cushion
  basis = years of spending in reserve at plan age) instead of saturating to "comfortable" for any
  non-depleting plan; labeled ranges ("5+ yrs = comfortable," etc.) from `EVENT_COMFORT_BUFFER_YEARS`
  constant. (3) **BUG-74 filed** — accumulation taxable-account purchase events can silently
  overflow the balance with no warning; deferred (needs cross-account draws + penalties). Horizon
  **Solvers tab removed** by owner decision (Dials + Events cover the job; calcAffordabilityMax
  retained for Classic WhatIfPanel Max Affordable mode; stale "solvers" deep-links degrade to
  Dials). 763 → **807 tests** (net: −2 Solvers removal, +~32 income channel incl. a big-trip
  regression reproducing the user-reported scenario, +11 verdict margin/ranges); golden master
  untouched throughout (defaults have no events). Docs: BUG-72/73/74 logged, feature-tracker #105
  updated (Solvers retired), FINANCIAL-MODEL.md + ARCHITECTURE.md + HORIZON.md + ROADMAP.md
  reconciled with dated notes.
- **PR #53 review-fix pass (2026-07-13, same branch).** A Fable adversarial review plus CodeRabbit
  + Gemini found real bugs in the BUG-72/73 work above, all fixed same-day, golden master untouched:
  (1) flat-mode employer match capped at `baseSalary` — a duration event's `incomeAnnual` above the
  user's actual salary was tripling employer match dollars on income the employer never paid;
  (2) a duration *inflow* event's income was silently dropped from `runSimulation`'s portfolio line
  (only replacing/outflow events should route through the salary channel) — new
  `eventSimAdjustmentForYear` + a single shared `isIncomeReplacingEvent` predicate now used by the
  sim's salary channel, the sim's portfolio line, and `eventIncomeImpact` so the three can never
  disagree about which events suppress income; (3) the cushion-basis verdict margin was
  non-monotonic across the depletion/never-depletes crossover for SS-heavy plans (pricing the
  reserve at full expenses instead of the plan-age NET draw meant spending MORE could flip a rail
  tight → comfortable) — `marginForScenario` now prices the cushion at the walk's own
  `scenarioDrawAtPlanAge`, continuous with the depletion basis at the crossover; (4)
  `projectedIncomeAtAge` clamped at zero growth years (Gemini: a committed event's age at/below
  `currentAge` was discounting income backward); (5) Classic's "Projected at retirement" line moved
  onto the shared `projectedIncomeAtAge` helper (CodeRabbit: was compounding one extra year vs the
  sim's own convention); (6) LifeEventSheet's redundant raw age-comparison in `seedIncomeForAge`
  removed (CodeRabbit rule-10 nitpick — the model table already zeroes post-retirement ages) while
  the "you'd be retired" hint copy kept its own explicit age gate (so a working user with genuinely
  $0 projected income isn't told they're retired). 807 → **812 tests**.
- **BUG-74 fixed — event-funding cascade (2026-07-13, post-merge follow-up, same branch restarted
  from `main`).** The user re-tested with a bigger trip ($15k/mo × 36 mo, $0 income) and the impact
  barely moved — root cause was BUG-74's deferred clamp: `Math.max(0, taxable + cTaxable + eventAdj)`
  silently FORGAVE any event spend beyond the taxable balance (tripling the trip's spend, +$324k,
  moved the at-65 impact by only ~$75k). Now the shortfall cascades: taxable → Roth (basis
  simplification) → Traditional 401k GROSSED UP (stacked ordinary tax + 10% early-withdrawal
  penalty under 59½, fixed-point solve to sub-dollar convergence; the draw joins the LTCG-bracket
  stack and same-year conversions stack on it); HSA never touched. Residual = per-row
  `eventShortfall` → `calcWhatIfScenario.eventFundingShortfall`/`firstShortfallAge` → the NEW shared
  `verdictForScenarioResult` (used by `verdictInfoForScenario` AND both tick rails — one resolver)
  forces **"unaffordable"** with "$X of this can't be funded from savings"; `evaluateLifeEvent`
  exposes `fundingShortfall`, the sheet renders the warning. Ledger honesty: accumulation rows'
  `draw` column (was hardcoded 0) now shows the funded event outflow; `tax` includes the funding
  draw's tax/penalty. Two display fixes from the same report: the sheet's "Portfolio at 65" bullet
  now shows absolute + delta (a bare "−$857k" read as a negative BALANCE), and cushion labels cap at
  `ASSUMPTIONS.CUSHION_LABEL_CAP_YEARS` (50) so an SS-covered plan shows "50+ yrs of runway," not a
  trust-eroding "≈366 yrs" (marginYears stays exact for verdict math). User's scenario verified in
  the browser: Portfolio at 65 now $2.4M (−$1.7M), Left at 90 $2.4M (−$2.0M) — the impact doubled
  once the swallowed spend + funding taxes actually left the portfolio. Follow-up noted in BUGS.md:
  committed-plan surfaces (arc/Plan) don't yet read a committed event's `eventShortfall` — only the
  what-if path does. Golden master untouched. 812 → **819 tests**.
- **PR #54 owner-review refinements (2026-07-13, same branch): pause-aware salary clock,
  Roth penalty, retirement-funding verdict cap, phrase deltas.** Three spec corrections from the
  owner's review of the BUG-74 fix: (1) the sim's salary now uses a growth CLOCK that advances by
  `incomeFrac` per year — a zero-income sabbatical FREEZES raises, so a $100k salary paused 3 years
  resumes where it left off and grows from there ("age 36 = 103k, not ~120k"); the seeded full-pay
  default keeps the clock running (behavior-preserving); spouse stays on the unpaused age clock;
  `projectedIncomeAtAge` remains the NO-EVENT baseline (= the clock when no events; golden-master
  safe); new `salary` sim-row field. (2) Roth funding draws pay the 10% early-withdrawal penalty
  under 59½ (grossed up; basis untracked — conservative middle). (3) events that force ANY early
  retirement-account withdrawal can never read "comfortable": new scenario fields
  `eventRetirementDraw`/`eventRetirementDrawTax` cap the verdict at "tight" via the shared
  `verdictForScenarioResult` ("needs early retirement-account withdrawals to fund"); the sheet
  shows "Needs $X of early withdrawals ($Y in taxes & penalties)". Display: balance bullets now
  say "decreases/increases by $X" (income: "$X less/more") instead of signed parentheticals.
  Plus Gemini PR #54 nitpicks (dropped `?? 0` fallbacks, NaN guard in the gross-up loop).
  Browser-verified: $15k/mo × 36 now reads "is tight — watch it" with the $360k warning.
  Golden master untouched. 819 → **824 tests**.
- **PR #54 CodeRabbit review-fix round (2026-07-14, same branch).** Two more review passes on the
  BUG-74 cascade: (1) the Roth/401k funding cascade ran AFTER `trad`/`roth` had already compounded
  for the year, giving event-funded dollars a phantom extra year of returns — moved the whole
  cascade to run on pre-growth balances, one timing convention for every account. (2) the verdict's
  `marginLabel` override and the sheet's dedicated `fundingShortfall`/`retirementFunding` bullets
  both stated the same funding-shortfall/retirement-draw fact, with two different dollar formats —
  the label now carries the reason only ("part of this can't be funded from savings" / "needs early
  retirement-account withdrawals to fund"), the bullets remain the sole carriers of amounts. Plus a
  trivial rename (gross-up loop's `g` → `grossDraw`, was shadowing the outer income-growth `g`).
  824 tests throughout, golden master untouched.
- **BUG-76 fixed — Accounts-tab "Today" milestone pill always showed $0 (2026-07-15, branch
  `claude/accounts-age-calculation-cgnz5e`, user report).** Root cause: the lifetime chart series
  never contained the current age (`runSimulation` rows start at `currentAge + 1` and
  `buildAccumChart` only seeded today's row in the already-retired case), and `calcChartMilestones`'
  `balAtAge` fabricated $0 for out-of-range ages instead of degrading honestly. Fix in
  `src/model/accumulation.js`: `buildAccumChart` now seeds the current-age row unconditionally
  (same four-balance basis as `currentTotalSaved`, so pill == banner by construction — the arc and
  Classic chart also honestly start at today now), and `balAtAge` returns null out-of-range so the
  existing null-filter drops the anchor rather than rendering a fake $0 (principle 10). All chart
  consumers audited (what-if overlay invariant, Flow-Down peak, ArcGraph clamp) — safe/improved.
  Browser-verified on Numbers → Accounts + full repo verifier. Golden master untouched (locks no
  chart data). 824 → **827 tests** (+3 regressions; 2 what-if series-start assertions updated —
  they had locked the buggy `currentAge + 1` shape). Full record: `docs/BUGS.md` BUG-76.
- **Multi-goal timeline + Ideas retirement + calm numbers (2026-07-16, branch
  `claude/multiple-events-timeline-rkcmev`).** Owner asks: (1) let users place MANY life events,
  framed as numbered "Goals" (Goal 1, Goal 2 …) instead of one-per-preset; (2) holistic UX — retire
  the redundant **Ideas** page and move its capabilities onto **Plan**; (3) calm the numbers
  (Wealthfront-style — no stray decimals, `k`/`M`). Three staged commits, golden master untouched:
  - **Goals on Plan via an arc-anchored Explore tray.** New `ExploreTray.jsx` (collapsed-by-default,
    two facets `⚙ Try a change` · `✦ Goals`) sits under the hero arc as the ONE control surface —
    both facets shape the same arc. New `GoalsPanel.jsx`: numbered goals list, preset quick-adds
    (each ALWAYS seeds a NEW goal — id-keyed, never label-deduped, so multiple trips coexist),
    progressive disclosure (`DEFAULT_VISIBLE_GOALS = 3` → "+ Add more goals" reveals the rest + a
    "+ Custom goal"), cap note at `MAX_MONEY_EVENTS`. The blocker was never the model (events were
    always id-keyed via `saveEvent`/`removeEvent`); it was the old Ideas Events UI gating presets
    by `committedByLabel` (first-match-by-label). Config: `MAX_MONEY_EVENTS` **6 → 12** + new
    `DEFAULT_VISIBLE_GOALS`. `TryAChangePanel` slimmed to a facet body (card/title/"More in Ideas"
    link removed) + the `RETIRE_JUMPS` quick-jump chips; preset tables moved to shared
    `src/horizon/presets.js` (survives Ideas' deletion). PortfolioHero/IncomeMeter moved to a
    summary band below the tray.
  - **Ideas page retired.** Removed from `HorizonShell` SCREENS/import/dispatch; **Journey**
    promoted into the mobile bottom bar (Plan · Journey · Numbers · Strategies · More);
    `navigate()` now degrades a stale `ideas` deep-link to Plan; `IdeasScreen.jsx` +
    `ideas-screen.test.js` deleted; the "Retire at" stat card deep-links to My details; smoke +
    verifier-browser updated (Ideas marker dropped; lever-preview + goal-placement deep paths moved
    onto Plan's Explore tray).
  - **Calm numbers.** `apply-preview.js` longevity now reads as an **age** ("to age 87"), not a
    decimal duration ("depletes at 87 (21.3 yrs)"); year deltas are whole ("+4 yrs"); the
    Try-a-change monthly readout uses the new shared `fmtMonthly` (nearest $100). Rates keep 1
    decimal (policy); Journey "years sustained" was already a whole row-count.
  - Browser-verified end-to-end (Playwright): placed Goal 1 (Big trip @70) + Goal 2 (Buy a home
    @40) → both numbered rows + both arc badges + the portfolio/arc updated ($4.0M → $3.9M). All
    Horizon screens render; Classic round-trip OK. 827 → **823 tests** (−11 ideas-screen.test.js,
    +6 goals-panel.test.js, plan/smoke updated); lint clean; build OK.
  - **Follow-up CLOSED same-day (see next entry):** the full formatter consolidation shipped as
    the "calm money" pass below.
- **Calm-money formatter consolidation (2026-07-16, same branch).** The follow-up flagged above,
  done app-wide: SEVEN money-format implementations (`formatters.js` uppercase-K/2-dec-M,
  `horizon/shared.jsx` fmt, local copies in `ArcGraph.jsx` + `HorizonShell.jsx`, `fields.jsx
  money`, `apply-preview.js` fmtMoney/signedMoneyLabel, `NumbersScreen` fmtK/fmtExact) collapsed
  into ONE canonical, dependency-free `src/formatters.js` importable by model + components +
  horizon: `fmt` (calm: `$980`/`$118k`/`$1.2M`, U+2212 negatives, `—` for missing — never a
  fabricated `$0`), `fmtFull` (whole-dollar commas — ONLY editable-input readouts + Statement/
  Classic ledger tables), `fmtSigned` (`+$22k` deltas), `fmtMonthly`/`fmtMo` (nearest $100),
  `fmtPct`. Everything else re-exports/delegates. **Two-tier policy:** a number the user TYPES
  stays full; a number the model DERIVES for display goes calm. User-visible: Classic goes calm
  everywhere (`$3.57M`→`$3.6M`, `$118K`→`$118k`, `-$2K`→`−$2k`, non-finite `$0`→`—`); preview
  metrics + Strategies card headlines/stat tiles calm (`−$9,854`→`−$10k`, first RMD
  `$62,508`→`$63k`). A **source-scan guard test** (formatters.test.js) fails the suite if any
  file outside `formatters.js`/`DeferredInput.jsx` builds a `$${…}` template literal, locking
  the one-formatter convention. Classic detail-tier JSX-text `$`-companion lines (MAGI notes,
  "Monthly:" readouts) intentionally stay full precision; Classic WhatIfPanel's decimal-year
  delta left as-is (legacy power view). Implemented by a Sonnet subagent from a written spec;
  orchestrator reviewed the diff, fixed a `fmtMonthly` negative-sign edge, browser-verified all
  screens + Classic. 823 → **837 tests** (formatters 9→23 incl. the guard + the 999,600→`$1M`
  promotion edge; strategies/apply-preview/conversion-wiring/money-events locks recalibrated);
  golden master untouched; lint clean; build OK.
- **PR #56 review battery + merge (2026-07-16/17, same branch → merged to `main`).** The
  multi-goal/Ideas-retirement/calm-money PR went through Gemini + CodeRabbit (2 rounds) + an
  internal Fable adversarial review + a Fable **math-contamination audit** (owner concern:
  formatting rounding leaking into calculations — verdict CLEAN app-wide; every formatter output
  dead-ends at a render, every committed value traces to raw state; the only rounding reaching
  committed state is the pre-existing ≤$6/yr whole-dollar monthly-slider quantization, once per
  commit, non-compounding). Five real bugs found + fixed pre-merge — the ExploreTray
  collapse-while-staged trap (Gemini), the P1 longevity-delta/age-display contradiction, typed-tier
  goal-row amounts ("−$0/mo"), Statement-ledger reconciliation, and formatter rounding
  symmetry/−$0 — full record in `docs/BUGS.md` → "PR #56 review-fix batch". One CodeRabbit
  suggestion corrected (`fmtMo` would double-divide already-monthly values), one declined with
  rationale (presets.js layer placement). A separate **convention-drift audit** (same disease as
  the money formatters, other classes) is filed as the next follow-up: percent/rate formatting
  (6–7 conventions, user-visible disagreement on `effectiveRMDTaxRate`), 3 disagreeing
  verdict→tone maps, 4 copies of the draft-commit input pattern, ~20 inline clamps in 2 operand
  orders, mixed id minting, and the money-guard's JSX-text blind spot. 837 → **840 tests**;
  golden master untouched; lint clean; build OK.

## Commands

- `npm run dev` — start dev server
- `npm test` — run model + formatter + render-smoke tests (840 tests)
- `npm run lint` — ESLint over `src/` (react-hooks `rules-of-hooks` + `exhaustive-deps` as errors; must exit clean)
- `npm run build` — production build
- `node .claude/skills/verifier-browser.cjs` — Playwright visual check of all
  three tabs (start dev server on port 5174 first; see the skill's `.md`)
- **post-ship review** — ask "run the post-ship review" (or similar) after merging a
  PR to launch two parallel Opus agents (adversarial correctness + forward-compat
  retrospective) against the diff; no arguments needed, see `.claude/skills/post-ship-review.md`
