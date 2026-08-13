# CLAUDE.md

## Project
Retirement financial planner. React + Vite. Owner is not a programmer — explain changes simply.

## Critical Rules (check every task)
1. **IRS constants live in `src/config/irs-2026.js` only.** Never hardcode limits, brackets, or thresholds elsewhere.
2. **Portfolio draws use `netPortfolioNeed`** (expenses − SS − pension − any active spouse gap-year income; see rule 5b), never `effectiveExpenses`. This applies to: yearsSustained, withdrawalRate, totalChartData drawdown, optimized scenario. `netPortfolioNeed` must be computed **per-year** in any loop that spans retirement — SS, pension, and the spouse's gap-year income only reduce draws in years they've actually started / are still active (see rule 5b).
   - **2b. One retirement walk, gross-seeded, taxed once (BUG-35).** Balances are **GROSS** everywhere (the `"Trad 401k"` display is the full pre-tax value); `totalAtRet` is gross and `spendableAtRet` is an after-tax **display-only reference** (never a formula input). The retirement-phase portfolio is walked by the per-account engine `buildRetirementWalkByAccount` (`src/model/retirement-engine.js`), orchestrated by `buildRetirementPhase` (`src/model/retirement-phase.js`) — the **ONE source** for the chart (`totalChartData`), headline `yearsSustained`, the displayed RMD schedule + `rmdTaxBite`, the Flow-Down waterfall (`calcFlowDown`), and the Roth-conversion benefit + optimizer, so they can never diverge (BUG-31). The engine seeds from gross and taxes each dollar **exactly once** — when it leaves a pre-tax account (Roth conversion, RMD, or extra 401k draw), stacked bracket-accurately on the SS/pension floor; the RMD/conversion **principal** is an internal transfer that keeps compounding (only the tax leaks). **Never reintroduce the after-tax seed, never add a second nominal-growth RMD projection, and never compute a Flow-Down "growth" as a residual plug** — growth must be the independent sum `Σ(row.growth)`. (Follow-ups, tracked in `docs/BUGS.md`: `what-if.js` + `calcOptimizedScenario` still use the blended `buildRetirementDrawdown` for *deltas* on the gross basis — they don't charge the spending-draw tax — **BUG-36**; the engine charges only *incremental* tax above the SS/pension floor, so SS/pension is effectively tax-free — **BUG-38**; and Flow-Down **accumulation** growth is still a residual plug, not `Σ(row.growth)` — **BUG-39** (a known exception to the "no residual plug" rule above, pending the fix).)
3. **No double-counting.** `grossAfterTax` (household income − all taxes) is the budget basis. Pre-tax deductions are auto-derived from contributions. For MFJ filers, `grossAfterTax` uses `householdIncome` (primary + spouse); for all other filing statuses it uses primary income only.
4. **Sim-level IRS guards required.** Every contribution in the simulation loop must be independently capped at its IRS limit, regardless of UI constraints.
5. **Dependency order matters.** SS and pension must compute before any drawdown metric that depends on them. If adding a new income source, wire it into `netPortfolioNeed` first.
   - **5b. Income timing.** SS only counts from `ssClaimingAge`; pension only counts from `pensionStartAge`. Any year-by-year loop (drawdown chart, conversion window draws, `retIncomeFloors[]`) must check these ages per iteration — never use the static `netPortfolioNeed` scalar inside a retirement-phase loop. **A still-working spouse's gap-year income** (#30/BUG-82 — active only between the primary's retirement and the spouse's own `spouseRetirementAge`) is a fourth such source: it offsets the engine's per-year draw internally, AND (BUG-82's rule-5 wiring, Step 6) `netPortfolioNeed`/`withdrawalRate`/`calcOptimizedScenario`/Plan's Income Meter all read the same per-year map (`spouseSeed.spouseIncomeFloorByAge`) so the headline can never disagree with what the walk actually offset that year.
6. **Financial model = pure functions.** No React state inside `src/model/` files. Inputs in, outputs out, testable without rendering.
7. **Test after every model change.** Run `npm test` before committing any change to `src/model/` or `src/config/`. The suite (1260 tests) includes a **golden master** (`src/model/__tests__/golden-master.test.js`) that locks every headline number at the default state — if it fails, a model change moved a value. Update the locked values only when the change was intended. A second, married/spouse-household golden master (`src/__tests__/spouse-household.test.js`) locks the same class of headline numbers for a spouse-gap fixture — the no-spouse default alone was structurally blind to the scope/unit bugs #30 kept producing (see BUG-91's Resolved entry in `docs/BUGS.md`).
8. **Hybrid client/server split (pre-launch, not during development).** Model files marked [SERVER] in ARCHITECTURE.md will move behind API routes before launch. During development, import them directly — do NOT set up API routes until feature-complete. See `docs/INTEGRATIONS.md`.
9. **MFJ tax calculations use combined household income.** `agi`, `stateTax`, and `grossAfterTax` all include `spouseIncome` when `filingStatus === "mfj"`. FICA is always computed per-earner separately (`Math.min(primaryIncome, FICA_WAGE_BASE) + Math.min(spouseIncome, FICA_WAGE_BASE)`). Contribution limits and account sliders remain per-person (primary earner's accounts only — spouse accounts are a planned premium feature, #30).
10. **Horizon screens render, never compute.** No arithmetic on model values in `src/horizon/` — screens format and lay out only; derived numbers (percentages, month↔year, residuals, deltas, age math) come from `src/model/` via named `horizonProps` fields, pre-gated for applicability (eligibility booleans from the model, never age comparisons in JSX), with documented null/Infinity edge states instead of `?? 0`-style fallbacks. Never scale or approximate a real number to fill a gap — designed empty state instead; decorative fakes only in isolated `Ghost*` components. Full principles (15) + violations register: `docs/ROADMAP.md` → Design principles.
11. **Every dollar figure has a declared basis — today's dollars or retirement-year real dollars — and mixing them is the single most common bug class in this codebase (BUG-91's diagnosis: 14+ bugs, #77–#101, decompose into this or the sibling primary-vs-household scope axis).** The retirement engine walks in the PRIMARY's RETIREMENT-YEAR real dollars (`rReal`, proven by BUG-90); `effectiveExpenses`/`effectivePension`/user-entered dollar inputs are TODAY's dollars. Converting forward uses `toRetirementYearDollars` (App.jsx computes this ONCE per quantity — `retSpendBasis`, `retPensionBasis`, `retPensionAnnualBasis`, `retPensionAtRMDAge`, `retPensionAt70`, etc. — never inline a second conversion); a what-if scenario re-basing SS/pension to a DIFFERENT retirement age uses the bidirectional `inflationRebaseFactor` instead (a scenario can retire earlier than the base plan — `toRetirementYearDollars` clamps negative years to 0, which is wrong there). **Before wiring any pension/expense/income figure into a new call site, ask which basis that specific consumer needs** — a function that does its own internal timing gate (like `calcRMDIncomeFloor`) needs the UNGATED annual figure; a function with no internal gate (like `projectRetirementBracket`) needs a figure PRE-gated to that function's own horizon, not the retirement age (this exact mismatch — "double-gating" — was found and fixed three separate times in one PR: BUG-91/Qodo's original finding, then `wr70`, review-fix round, PR #62). Deliberately-mixed-basis bundles (e.g. `retDrawShared`, which keeps `effectiveExpenses` raw but converts `pensionAmount`) carry an explicit `⚠ MIXED-BASIS BUNDLE` comment — never "tidy" one without reading it first. A display site captioning or describing another already-converted value (a chart, a breakdown total) must read the SAME converted figure, not re-derive or re-read the raw one — three such sites (a Classic chart caption, a Horizon income-meter headline, two pension display pills) were found still on the raw figure after BUG-91 landed everywhere else, in the PR #62 review-fix round, precisely because this rule didn't exist yet to check against.

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
- Feature backlog: `feature-tracker.html` (126 items, 78 done, 48 planned)
- Session history archive (everything before BUG-82, 2026-07-25): `docs/HISTORY.md`

## Status
**Full session-by-session history before 2026-07-25 (BUG-82) has moved to `docs/HISTORY.md`**
— same content, same chronological order, verbatim (this section was getting too large for
a session to hold in full context; see the forward-compat audit's recommendation in the PR #62
review battery entry, `docs/BUGS.md`). This section now keeps only the current active work arc.
- **BUG-82 fixed — the spouse's own retirement age + gap-year modeling (2026-07-25, branch
  `claude/spousal-planning-design-cjxl0i`, Session A of a two-session plan).** A second,
  differently-angled adversarial audit (execute-the-model, not just read-the-code) had found the
  #30 spouse engine assumed both spouses retire the same calendar year — a younger spouse's
  contributions stopped and their account froze the instant the PRIMARY retired, understating
  household wealth by $2.38M in the audit's own repro (a 10-year age gap). Research → an
  Opus-authored implementation plan → a fresh Opus audit of that plan → a third Opus pass focused
  specifically on cross-variable systemic coherence (which found the highest-severity issue: a
  naive surplus-discard formula that would have erased 25–40% of the fix's own benefit) → 8
  sequential, independently gated batches (implement → review the diff → re-run the full suite +
  lint + golden master + build → commit → push), per an explicit owner request for early,
  per-batch review gates rather than one large end-of-session review.
  1. **The design-doc's original approach (re-index the accumulation seed to the spouse's own
     retirement age) was REFUTED during implementation planning** — the seed was already correct
     for a walk starting at the primary's retirement; re-indexing it to a later date would have
     double-counted investment growth. The real fix: keep the seed where it is and inject the
     spouse's gap-year contributions/income INSIDE the retirement-phase engine via per-(primary-age)
     maps (new `buildSpouseRetirementSeed`, `retirement-phase.js`).
  2. **The engine fix (Batch 3):** the spouse's Traditional 401k (`tradSp`) keeps receiving
     contributions during the gap, their gross wages stack in the bracket floor, their net cash
     offsets the draw (surplus BANKED, not discarded — a defect found and fixed during
     implementation), and their bucket is held out of the drawable pool until they actually retire
     (Option A). The spouse RMD guard was also fixed to key on the live balance, not the frozen seed.
  3. **Integration (Batch 4):** new `spouseRetirementAge` input (My Details → "Spouse & household");
     `spouseSeed` memo wires the builder's output into `retPhaseBase`.
  4. **Conservation (Batch 5):** the gap-year inflow is neither growth, draw, nor tax — Flow-Down,
     the Year-by-year ledger, and Journey all now carry it so their reconciliation identities close.
  5. **MAGI gate + what-if resim (Batch 6):** a `spouseIncomeEndAge` cutoff stops an already-retired
     earner's income from counting in the OTHER earner's household MAGI forever (BUG-87); BUG-77
     fixed (the spouse balance re-seeds through a what-if scenario resim instead of staying frozen).
  6. **Rule-5 wiring (Batch 7, CLAUDE.md rule 5/5b):** `netPortfolioNeed`/`withdrawalRate`/the
     optimizer/Plan's Income Meter/`calcPlanDrivers`' verdict all now read the spouse's gap-year
     income from the same map the engine itself offsets — closing what would otherwise have been a
     brand-new BUG-31-class divergence between the engine and the headline.
  7. **Interim Monte Carlo caveat:** the Range lens still runs the older blended walk (no spouse
     bucket at all) — `rangeView.spouseGapCaveat` warns the user rather than silently disagreeing
     with the solid arc line, until a future session (**Session B**, deliberately out of scope here —
     independently sized "comparable to the rest of this fix combined," with its own stop-and-surface
     abort clause and a since-corrected false performance premise) ports the lens onto the engine.
  8. **v1 scope:** Traditional 401k only — Roth/Taxable/HSA gap-year contributions are
     dollar-conserving but not separately tracked (**BUG-85**, filed, Open). **BUG-84**
     (withdrawal-order/conversion scalars stay primary-only) remains Open — a genuine owner tax-law
     call between two fix shapes, with an interim "your accounts" relabel already shipped. **BUG-86**
     (Flow-Down accumulation bridge) and **BUG-87** (the MAGI gate) were two more genuinely separate,
     pre-existing bugs found during planning and fixed in the same session.
  929 → **998 tests** across the 8 batches. Golden master untouched throughout — every new
  parameter defaults to its zero/null/false value. Full root cause, fix mechanism, and file list:
  `docs/BUGS.md` → BUG-82 (Resolved). `docs/FINANCIAL-MODEL.md`'s "Years Sustained" section
  corrected in the same pass (had gone stale describing `buildRetirementDrawdown` as "the one
  tax-honest walk," untrue since BUG-35).
- **BUG-88/89/90 fixed — three findings from an adversarial review of BUG-82's own PR (2026-07-26,
  same branch, PR #59):** an Opus adversarial review of the just-merged spouse-engine work surfaced
  three real, non-overlapping bugs. Rather than implementing them piecemeal, the owner asked for a
  plan first — a dedicated Opus planning-and-audit pass wrote a detailed implementation plan,
  re-verified every claim in the original review against the actual code (correcting the review's own
  numbers in two places), and caught that my own first-draft fix for one finding was itself broken
  (a sub-dollar fixed-point residual still tripped the depletion check). All three then shipped in
  gated batches (implement → review → full gate → commit), per this codebase's established process:
  1. **BUG-88 (highest severity)** — Option A's spouse hold-out could produce a genuine contradiction:
     a shortfall caused purely by the hold-out was reported as depletion while the household's total
     (still counting the untouched spouse bucket) kept climbing. Fixed with a gated, penalized
     last-resort draw from the held-out bucket (a mechanism named and deliberately deferred in the
     original spousal-planning design doc as "the rare case" — the adversarial review's repro showed
     the deferral premise fails for exactly the target demographic). Surfaced via new
     `totalSpouseSpillover`/`totalSpouseSpilloverTax`/`firstSpouseSpilloverAge` rollups and a caption
     in both UIs.
  2. **BUG-89** — the conversion window's income floors never got the spouse's gap-year wages, so the
     conversion planner and the retirement engine modeled different households — real converted
     dollars overshot the intended bracket (verified: $243,600 vs. the honest $123,600 in an MFJ/$120k-
     spouse-wages fixture). Fixed by wiring the engine's own spouse-wage map into `buildIncomeFloors`
     and all three App.jsx call sites, including the conversion optimizer (missing that one would have
     let the optimizer search a spouse-blind model — the BUG-31 "two implementations" class again).
  3. **BUG-90** — the spouse's gap-year maps carried nominal dollars into a walk that measures
     everything in retirement-year purchasing power, so a spouse's paycheck was the only income stream
     whose real value silently grew inside the walk. The adversarial review's own suggested fix
     (deflate to today's dollars) was independently refuted during planning — it creates a ~22% cliff
     at the seed/map seam and doesn't reproduce the review's own cited ratio. Fixed by deflating to the
     *primary's retirement year* instead.
  Two new findings surfaced *by the planning pass itself* (beyond the three it was scoped to fix) were
  deliberately NOT folded in and filed instead: **BUG-91** (Open, high severity) — a much larger,
  pre-existing, model-wide real/nominal dollar mismatch (`effectiveExpenses`/`pensionMonthly` are
  today's-dollars applied flat against a retirement-year-dollar walk) that predates BUG-82 entirely and
  would move the golden master — recommended as its own dedicated session; **BUG-92** (Open) — no
  verdict signal when a plan leans on the new spillover hatch, deferred because it touches the shared
  verdict resolver used by three other surfaces. A third finding (ND-3) was folded into BUG-84's
  existing entry as a documented addendum rather than a new bug number, and a fourth (ND-4, the
  escape hatch's contribute-then-raid-the-same-bucket behavior) was recorded as an accepted, conservative
  simplification in `docs/FINANCIAL-MODEL.md` rather than filed as a bug.
  Also added T-X.2, a composed end-to-end test reproducing the plan's target-demographic household
  (primary retires at 58 on modest balances, spouse is 48 and works to 65 — a 17-year gap) to prove
  all three fixes work together in the same household without contradiction, not just individually.
  1002 → **1027 tests**. Golden master untouched throughout — every new parameter defaults to its
  zero/null/false value. Full root cause, fix mechanism, and file list: `docs/BUGS.md` →
  BUG-88/BUG-89/BUG-90 (Resolved), BUG-91/BUG-92 (Open), BUG-84 (addendum).
- **Three-agent Opus review battery + stabilization handoff (2026-07-26, same branch/PR #59, after
  BUG-88/89/90 shipped).** Owner request: three parallel Opus agents, each auditing a different
  angle of the just-landed spouse engine — (1) adversarial correctness (does the BUG-88/89/90 diff
  actually deliver what it claims, verified empirically, not just re-read), (2) cross-feature
  interoperability (do Classic/Horizon, the conversion planner, the Monte Carlo lens, and what-if
  scenarios agree with each other for the same household), (3) roadmap alignment / foundation
  health (is this a solid base for #113/#114/Session B/#126, or does it need stabilization first).
  All three converged independently on the same headline conclusion: **the feature isn't
  converging** — severity across five-plus review passes isn't decaying, and the root cause is a
  pattern, not a bug: nearly every spouse-engine defect decomposes into one of two undeclared-basis
  axes (primary-only vs. household scope; nominal vs. real dollars) that `golden-master.test.js`
  structurally cannot see (one filer, one fixed default). Two agents independently constructed the
  *same* repro scenario (a spouse with a balance but no income) and found the same bug from it.
  New findings filed: **BUG-93** (the Option-A hold-out/penalty fires for a non-working spouse —
  fired in 9/9 tested cells for that household shape) + **BUG-94** (the Monte Carlo spouse-gap
  caveat has a false negative on exactly that household, and is one-directional in wording for a
  two-directional error) — one root cause, two symptoms; **BUG-95** (`spouseCurrentAge` defaults to
  18 and its only editor is buried behind an unrelated RMD-beneficiary toggle — a $4.2M/$1.6M swing
  with zero signal on any headline number); **BUG-96** (the RMD screen's household tiles vs.
  primary-only table disagree by up to 71%, with a mislabeled tax-rate header and a card that can
  hide itself exactly when RMDs are largest); **BUG-98** (defensive-contract gaps in the gap-year
  maps, unhardened unlike their sibling `spouseHoldout`, low severity). **BUG-91 amended** with an
  independent re-derivation against the golden-master default (worse than originally filed —
  `withdrawalRate` should read ~5.61%, failing the app's own 4% guideline, not the locked 1.42%) plus
  a `livingExpenseGrowth` dead-input finding (a fully-wired UI control with zero model consumers).
  **BUG-97 found AND fixed same-day** (small enough to close now rather than defer): the roadmap
  agent's own new finding — `calcWhatIfDelta`'s forced-resim branch dropped the spouse balance
  entirely, a phantom −$900,000 delta reproduced on the live `surplusApplySite` Apply button; same
  bug class as BUG-61/BUG-79, third occurrence. Minor correctness-review findings (fixed-point
  truncation ≤ ~$226, the spouse HSA add-back not exactly dollar-conserving, "byte-identical" being
  1-ULP-identical) folded as addenda into BUG-88/BUG-90 or `docs/FINANCIAL-MODEL.md`'s Known
  Simplifications rather than filed as new bugs.
  **Owner decision:** don't fix everything now — this PR is already large. Isolate the minimal work
  that reduces risk for near-term work (BUG-97, done), write up the full findings + a sequenced
  handoff plan, then close this PR and continue the rest in a dedicated new session. New document:
  **`docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md`** — the single "start here" reference for that
  session, laying out why (the diagnosis above) and the exact order to work the remaining list:
  (1) promote the BUG-88/89/90 session's `T-X.2` target-demographic fixture into a permanent
  spouse-household golden master; (2) add a unit-contract invariant test; (3) **then** fix BUG-91
  itself — coupled to BUG-90's already-locked deflation base (`T-F3.2`), and must land before
  Session B (Monte Carlo port) or #126 (survivor scenario), both of which it would otherwise
  silently miscalibrate; (4) BUG-93+94 together; (5) BUG-95+96 (independent, UI-only); (6) the
  pre-existing backlog (BUG-84/85/92/98).
  1027 → **1030 tests** (BUG-97's fix only — everything else in this pass is documentation, filed
  bugs, and the new plan doc; no other code changed). Golden master untouched, lint clean, build OK.
- **PR review bot survey + free Gemini fallback (2026-07-26, docs/CI only — no `src/` change,
  1030 tests unchanged):** owner asked what's connected for automated PR review and to add free
  alternatives alongside the existing CodeRabbit (Pro Plus, `.coderabbit.yaml`). Findings, verified
  live against this repo's own PR history and a throwaway probe PR (#60, closed):
  1. **`gemini-code-assist[bot]` is now fully dead.** It reviewed PRs through 2026-07-21 but its own
     comment on the throwaway probe PR now reads *"The consumer version of Gemini Code Assist on
     GitHub has been sunset. All code review activity has officially ceased."* Google killed the
     free/individual GitHub integration; only the paid Standard/Enterprise editions (Google Cloud
     billing account required) still work.
  2. **GitHub Copilot code review verified NOT free on this account** — `request_copilot_review`
     was called live against probe PR #60; no reviewer was added and no comment was posted (a silent
     no-op, confirmed by inspecting the rendered PR page). PR-level Copilot review needs Copilot Pro
     ($10/mo minimum) — the free Copilot tier only does in-editor selection review, not PR review.
  3. **Added, then removed, `.github/workflows/gemini-review.yml`** — a free drop-in replacement
     for the sunset Gemini App (`derailed-dash/gemini-review-action`), calling the Gemini API
     directly with a free-tier key from Google AI Studio. Once the `GEMINI_API_KEY` secret was
     added, the workflow ran but failed on every PR of any real size with `429
     RESOURCE_EXHAUSTED` (the free tier's 250k-input-token/model/minute quota) — including
     repeatedly on PR #64's own pushes. A failing, non-blocking check that never actually
     produces a review is pure CI noise, not a working second opinion — **removed 2026-07-28**,
     owner request. CodeRabbit remains the primary automated reviewer.
  4. **Recommended, not yet installed** (both require the repo owner's own GitHub OAuth click — an
     agent session cannot install a GitHub App on someone else's account): Qodo Merge Pro
     (`github.com/marketplace/qodo-merge-pro`, free developer tier, ~30 PR reviews/org/month) as a
     second opinion alongside CodeRabbit. Greptile ruled out (paid-only, per owner). Codex code
     review to be done via Codex Cloud (chatgpt.com/codex, uses the owner's existing ChatGPT plan
     instead of pay-per-token API billing) — also an owner-side sign-in/connect step.
- **Spousal-engine stabilization session (2026-07-27, branch `claude/spouse-engine-stabilization-6s97pc`):**
  worked `docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md` (written at the close of PR #59) end to end, in
  its recommended order. The plan's diagnosis: nearly every #30 bug decomposed into an undeclared
  scope (primary-only vs. household) or unit (nominal vs. real dollars) basis mismatch, and
  `golden-master.test.js` was structurally blind to both (one filer, one fixed default).
  1. **Step 1** — promoted the target-demographic fixture (`T-X.2`, `src/__tests__/spouse-household.test.js`)
     into a permanent, exact-locked spouse-household golden master, converting the whole scope axis
     from "found by whoever looks hardest" into a test `npm test` enforces.
  2. **Step 2** — added a unit-contract invariant test (every quantity entering the retirement walk
     is retirement-year real dollars).
  3. **Step 3 — BUG-91 fixed (the big one):** `effectiveExpenses`/`effectivePension` were today's-dollar
     figures fed into a walk denominated in the primary's retirement-year purchasing power (proven by
     BUG-90) with **zero unit conversion**. New `toRetirementYearDollars`/`inflationRebaseFactor`
     (`finance-math.js`) inflate spend/pension forward to the same frame BUG-90's spouse deflator
     already uses, so the two compose without a seam. **Golden master moved substantially and
     conservatively, deliberately** — this is the fix working: no-spouse default `withdrawalRate`
     1.42% → **5.61%** (now *fails* the app's own 4% guideline, correctly), `firstRMD` → 32,213,
     `totalRMDs` → 79,341, `rmdTaxBite` → 10,182, `netConversionBenefit` → −70,844,
     `spendableAtRet` → 3,763,788 (`totalAtRet` itself is unaffected — only spend/pension/SS-comparison
     inputs changed, never balances). The spouse-household golden master (`T-X.2`) moved too:
     `withdrawalRate` 0.78% → 1.61%, `totalRMDs` 1,330,378 → 1,138,926, `rmdTaxBite` 209,803 → 167,684,
     `netConversionBenefit` 100,961 → 159,745, Monte Carlo `rangeSuccessPct` 95% → 83%. Filed three
     scoped follow-ups rather than folding them in: BUG-99 (money events still nominal against the
     corrected walk), BUG-100 (the pre-existing "brackets aren't inflated" simplification now bites at
     full strength, no longer partially offset by the old error), BUG-101 (accumulation-phase
     `contrib401k` stays nominal).
  4. **Step 4 — BUG-93+94 fixed (one root cause):** the Option-A hold-out gated on bare `hasSpouse`
     instead of real gap-year income, so a spouse holding only a rollover balance (no income) got
     penalized-early-withdrawal treatment it never needed — fired in 9/9 tested cells. Re-gated on the
     existing `hasActiveSpouseGap` flag (the same real-income check the Monte Carlo caveat already
     used), which closes BUG-94's engine/caveat disagreement as a structural side effect.
  5. **Step 5 — BUG-95+96 fixed:** `spouseCurrentAge` (defaults to 18, drove the whole spouse engine)
     gets an always-reachable editor in "My details → Spouse & household" (was buried behind an
     unrelated RMD-beneficiary toggle) and its bound widened `currentAge-1` → 80 (a same-age-or-older
     spouse was previously unrepresentable). The RMD screen's household-scoped stat tiles disagreed
     with its primary-only schedule table by up to 71%; tiles now match the table exactly
     (`primaryTotalRMDs`), with the real household figure surfaced separately
     (`householdTotalRMDs`/`showHouseholdTotal`) instead of silently substituted.
  6. **Step 6 — backlog triage:** BUG-98 fixed (the three spouse gap-year maps now fail safe on
     negative/non-finite inputs, matching `spouseHoldout`'s existing fail-closed contract). BUG-92
     fixed (a plan sustainable only by repeatedly raiding a still-working spouse's 401k now caps at
     "tight," not "comfortable" — the same treatment `eventRetirementDraw` already got). BUG-84 (owner
     call, per an `AskUserQuestion` prompt): stays deferred — confirmed its two candidate fix shapes
     aren't a second multi-decade simulation (the engine is already shared), but fix shape 2 is
     coupled to BUG-85's not-yet-built spouse Roth/Taxable/HSA buckets, so both stay deferred together
     (noted on `feature-tracker.html`'s #30 entry). BUG-85 left as the already-correctly-scoped
     feature addition it was filed as.
  `docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md` marked DONE and retired (kept as a historical record).
  1030 → **1059 tests** across the session. Full root cause / fix / test detail for every item:
  `docs/BUGS.md`.
- **PR #62 review battery + full follow-through (2026-07-27, same branch, same day as the
  stabilization session above).** Owner asked for an adversarial code review before closing the
  PR, plus the interoperability/forward-compat Opus audits used earlier in this arc — then, once
  those audits' non-bug-fix recommendations came back, asked for them to be followed through
  IN this PR rather than filed for later ("the context available is highest here").
  1. **Bot review (Qodo + CodeRabbit, auto-triggered on push) fixed first:** a real,
     pre-existing pension double-gating bug (`calcRMDIncomeFloor`/`projectRetirementBracket`
     receiving the retirement-gated `retPensionBasis` instead of the correct basis) + a missing
     `aria-label`.
  2. **Adversarial code review, replicated manually** (the repo's `/code-review` skill is
     locked to direct user-invocation, so 4 parallel Sonnet finder agents covered the same
     ground: BUG-91 wiring correctness, spouse-gating correctness, reuse/duplication +
     CLAUDE.md-convention compliance, test-coverage/golden-master integrity) **+ 2 Opus
     reasoning audits** (cross-feature interoperability, forward-compatibility/foundation
     health) — mirroring the BUG-79/80 and post-ship-review precedents.
  3. **Real findings fixed:** the headline one — BUG-91's basis fix landed in the engine but
     missed 4 DISPLAY sites, one **live at the golden-master default** (Classic's main chart
     caption showed $57,377/yr captioning a chart that actually draws $226,415/yr — a ~4×
     mismatch on the headline dashboard); Plan's Income Meter headline didn't match its own
     breakdown bars; two Horizon pension pills missed a fix `ConversionPlannerFlow` already got.
     A genuinely NEW scope regression from this PR's own BUG-96 fix (`avgAnnualRMD`'s primary-only
     narrowing leaked into `projectRetirementBracket`, which needs the household figure). `wr70`
     — a THIRD instance of the exact double-gate class Qodo caught once already. A real
     duplication in `what-if.js` (one scenario-basis conversion, written twice). Two test-quality
     gaps (a reimplemented-instead-of-imported formula; zero coverage of one specific wiring
     path). **CodeRabbit re-reviewed after that push and found 2 more** in the SAME fixes: the
     new `avgAnnualRMDHousehold` divided by the wrong denominator (a spouse-only-RMD household
     has an empty primary schedule, silently dropping the spouse's RMD income from the bracket
     projection — the exact bug class being fixed, reintroduced one line later); a Horizon
     screen's pension-pill gate stayed on a raw prop comparison instead of the model-provided
     applicability flag. Every fix backed by a regression test verified against the pre-fix
     condition (reverted the line, confirmed the new test fails, restored the fix) before being
     trusted — not just asserted post-fix.
  4. **Non-bug-fix recommendations, followed through this same session (not deferred):**
     - **New CLAUDE.md Critical Rule 11** — the "declared dollar basis" convention BUG-91 fixed
       instances of but never promoted to an enforced rule (the forward-compat audit's top
       finding: the pattern existed only in code comments and one bug entry, nowhere a future
       contributor would look before wiring a new call site).
     - **`golden-master-app-wiring.test.js` (new)** — `golden-master.test.js` hand-builds its
       inputs and never mounts App, so it structurally cannot catch an App.jsx WIRING bug (the
       exact class Qodo caught). This new file mounts the REAL App at the same default state and
       asserts the SAME locked headline numbers from real `horizonProps` — added additively
       (lower risk than rewriting the existing file) and **verified to actually catch what the
       old file misses**: reverted `netPortfolioNeed` to the pre-BUG-91 raw `effectiveExpenses`
       in App.jsx, confirmed `golden-master.test.js` stayed green (false reassurance) while the
       new file failed immediately, then restored the fix.
     - **Third golden master (T-X.3, new)** — both existing golden masters have
       `pensionMonthly = 0`, so the pension-basis triad this PR fixed three times
       (`retPensionAtRMDAge`, `retPensionAt70`, the ungated `retPensionAnnualBasis`) was locked
       by ZERO golden-master value. New fixture: MFJ + an active spouse gap + a real pension
       (starts after retirement, before RMD age — the exact double-gated shape) + a non-TX state
       + an open conversion window, tuned so `firstRMD`/`totalRMDs`/`rmdTaxBite`/`wr70`/
       `projectedRetBracket` are all real, non-degenerate values (not vacuous zeros).
     - **Documentation-debt cleanup** — `CLAUDE.md`'s `## Status` section (1,700+ lines, 42
       session entries, one confirmed byte-identical duplicate found and removed) was
       structurally becoming a context problem: split into this section (current active arc
       only) + new `docs/HISTORY.md` (everything before BUG-82, verbatim, same order). New
       "Open Issues — Index" table at the top of `docs/BUGS.md` (12 rows: ID / severity /
       one-line / files) so a session can locate a relevant open bug without reading the
       ~3,400-line file; the Resolved section (~100 entries) stays chronological, no index
       (a full index there was assessed as more maintenance burden than the value it'd add).
  1059 → **1064 tests** across this session (2 bot-fix regressions, 3 review-battery
  regressions, 1 App-wiring cross-check, 1 third golden master). Golden master untouched
  throughout — every fix is inert at default or a pure refactor/addition. Lint clean, build OK.
  Full root cause / fix / verification detail for every item: `docs/BUGS.md` → "PR #62 review
  battery" (+ its "Round 2" addendum).
- **Session B — Monte Carlo Range lens ported onto the per-account engine (2026-07-28, branch
  `claude/monte-carlo-engine-port-17l6gu`).** The kickoff doc
  (`docs/SESSION-B-MONTE-CARLO-ENGINE-PORT-PLAN.md`, written at the close of PR #62 once BUG-91
  unblocked it) laid out a two-agent-then-implement process: a dedicated Opus agent wrote a
  concrete implementation plan (the `rRealByYear` engine change, a measured build-vs-reuse-
  vs-bespoke perf decision, the caveat-retirement inventory, the threshold-calibration method,
  golden-master direction predictions, a batch sequence), then a SECOND, independent Opus agent
  adversarially audited that plan's robustness before any code was written — mirroring the
  BUG-82/BUG-88-89-90 plan-then-audit precedent. The audit found the plan's three load-bearing
  decisions correct (reuse `buildRetirementWalkByAccount`, no fallback walk, retire the caveat
  while keeping `hasActiveSpouseGap`) but caught a real, reproduced-against-the-live-default-
  bundle bug before implementation started: the proposed contract had no guard against a
  malformed/omitted `endAge`, which would silently score a zero-row walk as 100% success — plus
  a wrong direction prediction for one of the two locked spouse fixtures (T-X.3, predicted "up,"
  measured "flat"). Both were fixed in the plan before any code landed.
  1. **Batch 1 — the engine change.** `buildRetirementWalkByAccount` gained an optional
     `rRealByYear` per-year real-return override (mirroring `buildRetirementDrawdown`'s existing
     contract), default `null` ⇒ byte-identical to the scalar walk. All five per-account growth
     lines use the resolved per-year rate, including the spouse Traditional bucket (`gTradSp`) —
     flagged by both planning agents as the highest-probability silent slip, since it is a
     separate statement from the other four and invisible in any no-spouse fixture; a dedicated
     regression test covers it. Zero golden-master movement (proof of inertness).
  2. **Batch 2 — the port itself, merged with the caveat retirement.** The audit found that
     landing the contract change alone (its own originally-proposed Batch 2) would have shipped a
     real, false user-facing claim — the caveat still saying "doesn't yet fully model your
     spouse's working years" over a lens that, as of that commit, did — so the two were merged
     into one batch. `runMonteCarlo`'s contract changed from a flat field list to `{ walk,
     returnRate, inflationRate }`, where `walk` is the SAME `retPhaseBase` + `conversionByAge` +
     `endAge` bundle App already feeds the headline engine walk — so the Range lens can no longer
     drift from the engine's dollar basis, spouse hold-out, or path-dependent RMD/conversion tax.
     Two structural guards ship from the audit's own finding: `endAge` is validated
     finite-and-greater-than-`startAge` before walking, and success additionally requires
     `rows.length === nYears`. `hasActiveSpouseGap` is kept (it still gates the engine's Option-A
     hold-out, BUG-93) — only its caveat consumer (`rangeView.spouseGapCaveat`) is retired, not
     silenced; `spouseGapCaveat` no longer exists on the bundle at all.
     `MONTE_CARLO_LIMITATION_NOTE` rewritten to drop the now-false "reuses your baseline RMD/
     conversion tax estimates" claim.
  3. **Batch 4 — threshold calibration.** Measured `rangeSuccessPct` beside the withdrawal/
     longevity/confidence Plan drivers across 6 households against a pre-declared contradiction
     rule (≥ 2 of 6 disagreeing in the same direction moves the thresholds). Result: 1 of 6
     (T-X.3, explained by its gap-cancels-draw-tax mechanism) — below the trigger.
     `MONTE_CARLO_SUCCESS_GUIDELINE_PCT`/`MONTE_CARLO_LOW_ODDS_PCT` stay at 80/70, decision and
     full table written up in `docs/FINANCIAL-MODEL.md`'s new "Monte Carlo Threshold Calibration"
     section (not just a commit message).
  4. **Golden masters re-locked with per-fixture mechanism attribution, each confirmed by direct
     measurement** (not assumed from the planning agents' estimates): no-spouse default
     (`golden-master-app-wiring.test.js`, locked PRE-port at 37 first and confirmed to fail
     post-port per the repo's revert-and-confirm discipline) 37 → **24** (down — the only live
     mechanism for a no-spouse household is the new spending-draw tax); T-X.2 (17-year spouse
     gap) 83 → **100** (up strongly — gap-year income dwarfs the new draw tax); T-X.3 (8-year
     gap, MFJ, high spend) 61 → **60** (essentially flat — the shorter gap's income roughly
     cancels the new draw tax instead of being dwarfed by it; this was the audit's flagged
     "least certain" prediction, confirmed by measurement here rather than left for a future
     session to rediscover).
  1064 → **1074 tests** across the five implementation batches. `docs/SESSION-B-MONTE-CARLO-ENGINE-PORT-PLAN.md`
  marked DONE and retained as a historical record (the `SPOUSAL-ENGINE-STABILIZATION-PLAN.md`
  precedent). Golden master (no-spouse, no-Monte-Carlo-dependency assertions) otherwise
  untouched; lint clean, build OK.
  - **PR #64 review battery (bots + in-house adversarial audit), 2026-07-28, same branch.**
    CodeRabbit + Qodo both found real, small issues on the first push (a NaN-monetary-value-in-
    `walk` scores-as-success bug; fractional-age/`inflationRate=-100`/non-finite-`stdDev`/non-
    integer-`iterations` guard gaps) — fixed and bot-confirmed. A 6-agent in-house battery (4
    Sonnet finders + 2 Opus reasoning audits, mirroring PR #62's convention) then ran in parallel:
    3 reports came back clean (each independently re-verified via revert-and-confirm rather than
    reading the diff and taking it on faith); 3 had real findings, all triaged. Fixed: the `-0.99`
    sampling clamp moved to a named `ASSUMPTIONS` constant (`MONTE_CARLO_MIN_NOMINAL_RETURN`);
    `buildRetirementDrawdown`'s orphaned `rRealByYear` param removed outright (zero callers, zero
    tests); a doc-honesty fix to the threshold-calibration table (an approximate probe fixture's
    number was unlabeled next to the exact golden-master lock); revisit-trigger pointers added to
    the three golden-master `rangeSuccessPct` locks; a `BUG-36` addendum (this port widened, not
    created, the engine-vs-blended-walk accuracy gap that bug tracks). Filed, not built: **BUG-103**
    — Monte Carlo's `successPct` doesn't distinguish a clean-surviving path from one rescued only
    by the penalized spouse-401k spillover hatch (BUG-92's exact problem class, newly live on this
    surface) — deliberately deferred as new UI/product surface area, same treatment BUG-84/102 got.
    Also removed `.github/workflows/gemini-review.yml` (separate PR #65, merged) — it ran on every
    push but failed with `429 RESOURCE_EXHAUSTED` (free-tier quota) on every PR of real size,
    including three times in a row on this PR — pure CI noise, no working review ever produced.
    1074 → **1076 tests**. PR #64 merged 2026-07-28.

## Commands

- `npm run dev` — start dev server
- `npm test` — run model + formatter + render-smoke tests (1260 tests)
- `npm run lint` — ESLint over `src/` (react-hooks `rules-of-hooks` + `exhaustive-deps` as errors; must exit clean)
- `npm run build` — production build
- `node .claude/skills/verifier-browser.cjs` — Playwright visual check of all
  three tabs (start dev server on port 5174 first; see the skill's `.md`)
- **post-ship review** — ask "run the post-ship review" (or similar) after merging a
  PR to launch two parallel Opus agents (adversarial correctness + forward-compat
  retrospective) against the diff; no arguments needed, see `.claude/skills/post-ship-review.md`
