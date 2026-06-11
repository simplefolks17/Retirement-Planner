# CLAUDE.md

## Project
Retirement financial planner. React + Vite. Owner is not a programmer — explain changes simply.

## Critical Rules (check every task)
1. **IRS constants live in `src/config/irs-2026.js` only.** Never hardcode limits, brackets, or thresholds elsewhere.
2. **Portfolio draws use `netPortfolioNeed`** (expenses − SS − pension), never `effectiveExpenses`. This applies to: yearsSustained, withdrawalRate, totalChartData drawdown, optimized scenario. `netPortfolioNeed` must be computed **per-year** in any loop that spans retirement — SS and pension only reduce draws in years they've actually started (see rule 5b).
   - **2b. One retirement walk, tax-honest.** The retirement-phase portfolio is walked in exactly ONE place — `buildRetirementDrawdown` (`src/model/retirement-drawdown.js`). The chart (`totalChartData`), the headline `yearsSustained`, the Flow-Down waterfall (`calcFlowDown`), `calcDrawdownYears`, and the optimizer all consume it, so they can never diverge (BUG-31). The per-year recurrence is `balEnd = balStart*(1+rReal) − draw − tax`: the portfolio actually pays its per-year **RMD tax** (ages 73+) and **Roth-conversion tax** (conversion window), passed in as per-age maps. Only the tax leaks from the single pool — the RMD/conversion principal is never double-charged. **Never reintroduce a second retirement-phase walk, and never compute a Flow-Down "growth" as a residual plug** (`end − start + draws + tax`); growth must be the independent sum `Σ(row.growth)` so a forgotten tax can't hide in it.
3. **No double-counting.** `grossAfterTax` (household income − all taxes) is the budget basis. Pre-tax deductions are auto-derived from contributions. For MFJ filers, `grossAfterTax` uses `householdIncome` (primary + spouse); for all other filing statuses it uses primary income only.
4. **Sim-level IRS guards required.** Every contribution in the simulation loop must be independently capped at its IRS limit, regardless of UI constraints.
5. **Dependency order matters.** SS and pension must compute before any drawdown metric that depends on them. If adding a new income source, wire it into `netPortfolioNeed` first.
   - **5b. Income timing.** SS only counts from `ssClaimingAge`; pension only counts from `pensionStartAge`. Any year-by-year loop (drawdown chart, conversion window draws, `retIncomeFloors[]`) must check these ages per iteration — never use the static `netPortfolioNeed` scalar inside a retirement-phase loop.
6. **Financial model = pure functions.** No React state inside `src/model/` files. Inputs in, outputs out, testable without rendering.
7. **Test after every model change.** Run `npm test` before committing any change to `src/model/` or `src/config/`. The suite (303 tests) includes a **golden master** (`src/model/__tests__/golden-master.test.js`) that locks every headline number at the default state — if it fails, a model change moved a value. Update the locked values only when the change was intended.
8. **Hybrid client/server split (pre-launch, not during development).** Model files marked [SERVER] in ARCHITECTURE.md will move behind API routes before launch. During development, import them directly — do NOT set up API routes until feature-complete. See `docs/INTEGRATIONS.md`.
9. **MFJ tax calculations use combined household income.** `agi`, `stateTax`, and `grossAfterTax` all include `spouseIncome` when `filingStatus === "mfj"`. FICA is always computed per-earner separately (`Math.min(primaryIncome, FICA_WAGE_BASE) + Math.min(spouseIncome, FICA_WAGE_BASE)`). Contribution limits and account sliders remain per-person (primary earner's accounts only — spouse accounts are a planned premium feature, #30).

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
- Design system & tokens: `docs/DESIGN.md`
- External services & integration: `docs/INTEGRATIONS.md`
- Feature backlog: `feature-tracker.html` (74 items, 26 done, 48 planned)

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
- Income growth plateau feature (Jun 11 2026, feature #75): unrealistic compounding fixed.
  New optional `incomeGrowthEndAge` param in `runSimulation` and `calcAIME`; income stops
  growing at the specified age, capping contributions, employer match, MAGI, and SS AIME.
  UI: "Income plateau age" slider + live projected-retirement-income preview. Default `null`
  = no cap = zero golden master impact. 299 → **303** tests (+4 plateau regression tests).

## Commands
- `npm run dev` — start dev server
- `npm test` — run model + formatter + render-smoke tests (303 tests)
- `npm run build` — production build
- `node .claude/skills/verifier-browser.cjs` — Playwright visual check of all
  three tabs (start dev server on port 5174 first; see the skill's `.md`)
