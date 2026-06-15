# CLAUDE.md

## Project
Retirement financial planner. React + Vite. Owner is not a programmer — explain changes simply.

## Critical Rules (check every task)
1. **IRS constants live in `src/config/irs-2026.js` only.** Never hardcode limits, brackets, or thresholds elsewhere.
2. **Portfolio draws use `netPortfolioNeed`** (expenses − SS − pension), never `effectiveExpenses`. This applies to: yearsSustained, withdrawalRate, totalChartData drawdown, optimized scenario. `netPortfolioNeed` must be computed **per-year** in any loop that spans retirement — SS and pension only reduce draws in years they've actually started (see rule 5b).
   - **2b. One retirement walk, gross-seeded, taxed once (BUG-35).** Balances are **GROSS** everywhere (the `"Trad 401k"` display is the full pre-tax value); `totalAtRet` is gross and `spendableAtRet` is an after-tax **display-only reference** (never a formula input). The retirement-phase portfolio is walked by the per-account engine `buildRetirementWalkByAccount` (`src/model/retirement-engine.js`), orchestrated by `buildRetirementPhase` (`src/model/retirement-phase.js`) — the **ONE source** for the chart (`totalChartData`), headline `yearsSustained`, the displayed RMD schedule + `rmdTaxBite`, the Flow-Down waterfall (`calcFlowDown`), and the Roth-conversion benefit + optimizer, so they can never diverge (BUG-31). The engine seeds from gross and taxes each dollar **exactly once** — when it leaves a pre-tax account (Roth conversion, RMD, or extra 401k draw), stacked bracket-accurately on the SS/pension floor; the RMD/conversion **principal** is an internal transfer that keeps compounding (only the tax leaks). **Never reintroduce the after-tax seed, never add a second nominal-growth RMD projection, and never compute a Flow-Down "growth" as a residual plug** — growth must be the independent sum `Σ(row.growth)`. (Follow-up: `what-if.js` + `calcOptimizedScenario` still use the blended `buildRetirementDrawdown` for *deltas* on the gross basis — they don't charge the spending-draw tax; full migration is pending.)
3. **No double-counting.** `grossAfterTax` (household income − all taxes) is the budget basis. Pre-tax deductions are auto-derived from contributions. For MFJ filers, `grossAfterTax` uses `householdIncome` (primary + spouse); for all other filing statuses it uses primary income only.
4. **Sim-level IRS guards required.** Every contribution in the simulation loop must be independently capped at its IRS limit, regardless of UI constraints.
5. **Dependency order matters.** SS and pension must compute before any drawdown metric that depends on them. If adding a new income source, wire it into `netPortfolioNeed` first.
   - **5b. Income timing.** SS only counts from `ssClaimingAge`; pension only counts from `pensionStartAge`. Any year-by-year loop (drawdown chart, conversion window draws, `retIncomeFloors[]`) must check these ages per iteration — never use the static `netPortfolioNeed` scalar inside a retirement-phase loop.
6. **Financial model = pure functions.** No React state inside `src/model/` files. Inputs in, outputs out, testable without rendering.
7. **Test after every model change.** Run `npm test` before committing any change to `src/model/` or `src/config/`. The suite (437 tests) includes a **golden master** (`src/model/__tests__/golden-master.test.js`) that locks every headline number at the default state — if it fails, a model change moved a value. Update the locked values only when the change was intended.
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
- Feature backlog: `feature-tracker.html` (117 items, 50 done, 67 planned)

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
  dedicated **per-account detail screen** is the planned PR-B. 412 → **437** tests
  (+15 engine breakdown/divisor, +6 phase orchestrator, +3 PR-#32 review fixes, rewritten golden
  master / conversion-eval / accumulation / flow-down / what-if). `docs/BUGS.md` BUG-35 → Resolved.
  PR #32 review fixes (Gemini + CodeRabbit on Stage 1): RMD now computed **before** any same-year
  conversion (IRS sequencing); **tax-on-tax gross-up** — when Taxable is exhausted and the 401k funds
  the tax, that withdrawal is now itself taxed (fixed-point solve); one-time money-event shortfalls
  now count toward depletion. All three are inert at the default state (golden master unchanged).

## Commands
- `npm run dev` — start dev server
- `npm test` — run model + formatter + render-smoke tests (437 tests)
- `npm run lint` — ESLint over `src/` (react-hooks `rules-of-hooks` + `exhaustive-deps` as errors; must exit clean)
- `npm run build` — production build
- `node .claude/skills/verifier-browser.cjs` — Playwright visual check of all
  three tabs (start dev server on port 5174 first; see the skill's `.md`)
