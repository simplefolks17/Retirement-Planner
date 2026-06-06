# Bug & Oddity Tracker

This file tracks known bugs, UI oddities, and design questions in the app.
Each entry records **what was found**, **why it happens** (root cause), **status**, and **fix notes** once resolved.

---

## Open Issues

---

### BUG-29 — Roth conversion tax is not bracket-accurate (flat top-marginal rate, no state tax)

**Reported:** 2026-06-05  
**Status:** Open — **verified, fix deferred pending owner review** (decision 2026-06-05: document the math before moving a headline number). Filed Open, not fixed.  
**File:** `src/model/roth-conversion.js` line ~70 (`taxOnConversion` in `calcConversionSim`)

**Symptom:**  
The displayed **net Roth-conversion benefit is understated.** At the default state it shows ~$47,047 when a bracket-accurate calculation gives ~$77,861 — the conversion *cost* is overstated by ≈ **$30,814** across the 7-year window (~$4,402/yr).

**Root cause (two compounding issues):**  
1. **Flat rate on a multi-bracket conversion.** Conversion tax is `conversion × marginalRate(floor + conversion)` — the *entire* conversion taxed at the single marginal rate at its top. In bracket-fill mode the conversion spans from the income floor (default: taxable income ≈ $22,935, in the **12%** bracket) up to the bracket ceiling, so dollars that are really taxed at 10%/12% get charged the top rate. The RMD tax, by contrast, is bracket-accurate (`calcTax(floor+rmd) − calcTax(floor)`), so the two sides of `netConversionBenefit = rmdTaxSaved − conv.totalTax` are computed on **different tax models.**
2. **Rounding overshoot into the next bracket.** The bracket-fill target lands at taxable income **$105,700.40** — $0.40 *over* the 22% ceiling ($105,700) — so `marginalRate` returns **24%**, and the whole $82,765 conversion is taxed at 24% (not even 22%). In the actual app (bracket mode, per-year floors), early pre-SS years fill from a $0 floor, so the entire ~$121,800 conversion is taxed at 24% in those years — a larger overstatement than the scalar default case.
3. **State tax omitted.** RMD tax includes a state component (`rmd × retStateRate`); conversion tax has none. Dormant in the default (retirement state TX = 0%), but for a user in a taxed state the conversion cost is *understated*, which makes conversions look better and partially offsets (1)–(2) for those users.

**This contradicts the codebase's own design.** Feature #33 ("Bracket-accurate retirement tax") states the bracket-accurate rate replaces the flat proxy "for `rmdTaxBite`, `netConversionBenefit`, and withdrawal strategy." The RMD side was converted; the conversion-cost side was left on the flat-rate proxy — an incomplete rollout of #33, not a deliberate conservative choice.

**Verification:**  
`calcTax(floor+conversion) − calcTax(floor)` = $15,462/yr vs. the current `conversion × marginalRate` = $19,864/yr (the 24% overshoot). Scalar-default delta × 7 yrs = $30,814; `netConversionBenefit` would move $47,047 → ~$77,861.

**Proposed fix (when approved):**  
In `calcConversionSim`, replace `conversion * marginalRate(floor + conversion)` with `(calcTax(floor + conversion).tax − calcTax(floor).tax)` for the federal portion, and thread `retStateRate` through so the state component (`conversion × retStateRate`) is added — making conversion tax mirror the RMD-tax formula exactly. Model change → update the golden master `netConversionBenefit` deliberately and add a test asserting a single-bracket conversion still matches `conversion × rate` while a multi-bracket conversion is taxed less than the flat-rate proxy.

---

### BUG-30 — MFJ capital-gains rate uses primary-only income (taxable-account drag understated)

**Reported:** 2026-06-05  
**Status:** Open — **deferred to premium feature #30** (Spouse account modeling), where combined-income tax treatment belongs. Verified; minor.  
**File:** `src/model/simulation.js` lines ~86–88 (`ordinaryIncome` → `ltcgRate`)

**Symptom:**  
For an MFJ household with two earners, the taxable brokerage account's annual tax drag can be too low, slightly **overstating** projected taxable-account growth.

**Root cause:**  
`ordinaryIncome = currentIncome × growFactor − employeeDeferral − cHSA` is **primary-only**, but it's passed to `ltcgRate(ordinaryIncome, "mfj")` — the MFJ brackets. Per CLAUDE.md rule 9, MFJ tax calcs (`agi`, `stateTax`, `grossAfterTax`) use **combined** household income; the LTCG bracket position should too, since a joint return stacks both incomes. Verified: a dual-$80k MFJ couple gets a **0%** LTCG rate from primary-only income vs. **15%** from combined ($160k) — so the taxable account grows with no tax drag when it should carry 15%.

**Impact:**  
Low. Only bites when combined income crosses a LTCG bracket boundary (0%/15% ≈ $96k MFJ, 15%/20% ≈ $600k MFJ) that primary-only income does not. Entangled with the spouse-modeling scope: spouse income detail is a premium-tier concern (#30), so the fix belongs there alongside the combined-income tax engine.

**Proposed fix (within #30):**  
Compute `yearOrdinaryIncome = filingStatus === "mfj" ? primary + spouse (each net of their deferrals) : primary` and pass that to `ltcgRate`, mirroring the `yearMAGI` pattern already used for the Roth phase-out a few lines above.

---

### BUG-16 (Audit Finding C) — Spousal SS benefit not reduced for early spouse claiming

**Reported:** 2026-06-02  
**Status:** Open — **deferred to premium feature #30** (Spouse account modeling engine). Closing this bug is a deliverable of that feature, not a standalone fix. See `feature-tracker.html` #30 (priority raised P2 → P1).  
**File:** `src/model/social-security.js` line 44 (`calcSpousal`)

**Symptom:**  
The spousal Social Security benefit is always computed as if the spouse claims at Full Retirement Age. A spouse who claims early should receive a permanently reduced benefit, but the model has no way to express that.

**Root cause:**  
There is no spouse-claiming-age input in the UI at all — the model consistently assumes FRA for the spousal benefit. This is a modeling *gap*, not a wrong calculation given the available inputs.

**Impact:**  
Low. Only affects households relying on a spousal benefit where the spouse plans to claim early. Overstates that benefit (and therefore slightly understates portfolio need).

**Why deferred (decision 2026-06-04, owner):**  
The fix requires a new `spouseClaimingAge` input + UI control, then applying `SS_FACTORS[spouseClaimingAge]` to both the spouse's own benefit and the 50% spousal floor inside `calcSpousal`. A spouse-claiming-age control only makes sense alongside the broader spouse profile, so this work belongs to the premium household-modeling scope rather than a one-off change. Feature #30's tracker entry now lists **"calcSpousal (BUG-16 fix)"** as an explicit deliverable and flags it as the quick-win to ship first within that feature. Feature #30 priority was bumped **P2 → P1** specifically so this bug is not stranded waiting on the full engine. When #30 ships, move this entry to Resolved.

---

## Resolved Issues

---

### ~~BUG-32~~ — SS break-even age wrong for delayed claims (collapsed to ≈ the claim age)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06  
**File:** `src/model/retirement-income.js` (`calcSSBreakEven`), test in `src/model/__tests__/retirement-income.test.js`.

**Symptom:**  
For a user claiming Social Security **after** Full Retirement Age (claim 68–70), the displayed "break-even age" collapsed to ≈ the claiming age (claim at 70 → showed ~70). It should land in the low 80s — where the larger delayed monthly benefit overtakes the cumulative payments an FRA claimer had been collecting since 67.

**Root cause:**  
The month loop started its timeline at `ssClaimingAge`. For a delayed claim, `ageNow` already starts above FRA, so the FRA baseline (`cum67`) began accumulating at the claim age too — the FRA claimer was never credited for the `SS_FRA → claimAge` months it had already collected. With no head start to overcome, the higher delayed monthly made `cumClaim >= cum67` true on the first iteration, returning ≈ the claim age.

**Fix:**  
Start the timeline at the **earlier** of the two ages: `const tStart = Math.min(ssClaimingAge, SS_FRA)` and walk `ageNow = tStart + m/MPY`. The two gated accumulators and both crossing checks are unchanged. This is symmetric:
- **Early claim (62):** `tStart = 62` = the old start → behavior identical (the early-claim test passes unchanged, proving no regression).
- **Delayed claim (70):** `tStart = 67` → `cum67` now gets its rightful 67→70 head start → the crossing lands at **age 82**.

Display-only; affects no portfolio/headline number. Default state claims at FRA (`ssBreakEven` is `null`), so the golden master is unaffected and test count is unchanged (230 — one existing locked test updated from `toBe(70)` to `toBe(82)`).

---

### ~~BUG-31~~ — Flow-Down "Growth" was a plug hiding cross-equation mismatches; chart/longevity ignored retirement taxes

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05 (Path A — make the model tax-honest)  
**Files:** new `src/model/retirement-drawdown.js` (`buildRetirementDrawdown`), new `src/model/flow-down.js` (`calcFlowDown`), `src/App.jsx`, `src/model/drawdown.js`, `src/model/optimization.js`, `src/model/__tests__/golden-master.test.js`.

**Root cause (as filed):**  
The retirement portfolio was walked in ≥4 separate places (`totalChartData`, closed-form `calcYearsSustained`, `calcDrawdownYears`, `calcOptimizedScenario`), each with the tax-blind recurrence `bal = bal*(1+rReal) − yearNeed`. The Flow-Down waterfall then computed every "growth" figure as a **residual plug** (`distGrowth = distEndVal − distStartVal + distDraws + distRMDTax`), so it always balanced visually while silently absorbing: (A) a gross-vs-after-tax unit mismatch in the accumulation bridge; (B) the conversion-window tax the chart never subtracted; (C) the full `rmdTaxBite` (~$683,974 default) the chart never subtracted, plus an off-by-one in `distDraws`. Because the chart never charged the taxes, the headline longevity / depletion age were optimistic.

**Fix (Path A — owner-approved 2026-06-05):**  
- **One shared walk.** `buildRetirementDrawdown` is now the single source of truth; the chart, the headline longevity, the Flow-Down waterfall, `calcDrawdownYears`, and the optimizer all consume it, so they can never diverge again. Each row exposes `growth` (= `balStart·rReal`), `draw`, and `tax`.
- **Tax-honest.** The per-year recurrence is `balEnd = balStart*(1+rReal) − draw − tax`, where `tax` = the bracket-accurate per-year RMD tax (ages 73+) plus Roth-conversion tax (conversion window), passed in as per-age maps built from the existing `rmdDataWithTax` / `conversionSim.years` schedules. Only the **tax** leaks from the single pool; the RMD/conversion *principal* is not double-charged (single-pool assumption documented in `docs/FINANCIAL-MODEL.md`).
- **Growth is a true sum, not a plug.** `calcFlowDown` computes each "growth" as `Σ(row.growth)` independently; the bars reconcile by the walk's conservation law rather than by construction.
- **Facet A** fixed: the accumulation bridge puts the 401k start balance and contributions in the same after-tax units as `totalAtRet`. **Facet C off-by-one** fixed: phase draw ranges come straight from the walk rows.
- **Headline impact (default):** `yearsSustained` 88.60 → **61.99** (runs-out age 153 → 126). Still far beyond life expectancy, so the plan stays sustainable; the number is now honest. Golden master updated deliberately with a dated comment.

**Tests added (169 → 187):** `retirement-drawdown.test.js` (conservation `start+Σgrowth=Σdraw+Σtax+end`, anti-plug `residual==Σgrowth`, monotonicity, closed-form-vs-walk reconciliation incl. the BUG-26 deferred-SS trap) and `flow-down.test.js` (growth-is-a-true-sum, waterfall reconciliation, displayed RMD-tax == tax actually charged, off-by-one guard, Facet A units). These would have caught the original bug.

---

### ~~BUG-28~~ — Flow-Down distribution waterfall draws used the static `netPortfolioNeed` (ignored SS claimed after retirement)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05  
**File:** `src/App.jsx` (`flowData` → `distDraws`, ~line 644)

**Symptom:**  
In the Flow-Down tab's Phase 3 (distribution) waterfall, the "Living Expenses" step — and the "Portfolio Growth" step derived from it — were overstated for any plan where the user **retires before claiming Social Security** (e.g. retire 65, claim 67 or 70). The waterfall's start and end totals were correct (they come from the per-year chart), so the error was hidden: the inflated draws were exactly offset by inflated growth.

**Root cause:**  
`distDraws = netPortfolioNeed * actualSustainedYrs` used the **static** at-retirement `netPortfolioNeed` scalar. That scalar only subtracts SS when `ssClaimingAge <= safeRetAge` (`ssAtRet` gate). But the distribution phase is age 73+ — by then SS is always active (claiming age ≤ 70). So for an early retiree the per-year need in this phase is `expenses − SS − pension`, while the scalar was `expenses − pension`. The draws were too high by ≈ `householdSS × years` (~$780k in a typical case). Same family as BUG-10 (static `netPortfolioNeed` mis-handling deferred SS); the chart loop and `convWindowDraws` already gate SS/pension per year (CLAUDE.md rule 5b), but this one site was missed.

**Fix:**  
Replaced the scalar multiply with a per-year loop that gates SS and pension on their start ages, mirroring `convWindowDraws` and the `totalChartData` drawdown loop exactly. First draw age is `(distStartVal's age) + 1` — `RMD_START_AGE` when a conversion window exists (start value is the age-72 `portPreRMD`), else `safeRetAge + 1`. **Value-preserving in the default state** (default claims SS at retirement, so every distribution year already has SS → per-year sum equals the old scalar × years), so the golden master is unchanged; the fix only corrects the early-retiree case the default state doesn't exercise. Display-layer (component) computation, not in `src/model/`, so no golden-master/model-test movement.

---

### ~~BUG-27~~ — Roth post-conversion RMDs double-counted a year of growth (understated conversion benefit)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05  
**Files:** `src/model/rmd.js` (`calcRMDPostConversion`), `src/model/__tests__/rmd.test.js` (regression), `src/model/__tests__/golden-master.test.js` (locked value updated)

**Symptom:**  
The "net Roth-conversion benefit" was understated. At the default state the displayed figure was **$17,345** when the correct value is **$47,047** — the bug suppressed roughly $30k of benefit and would cause the conversion optimizer to recommend converting too little.

**Root cause:**  
`calcRMDPostConversion` starts from `tradBal73`, which `calcConversionSim` has **already grown to age 73** (it applies "one final year of growth on the trad balance to reach age 73"). But the RMD loop's first iteration (`age = RMD_START_AGE`) did `bal = bal * (1 + r)` *before* taking the age-73 RMD — growing the balance a second time. Every post-conversion RMD was therefore computed on a balance one year over-grown, and the whole post-conversion RMD schedule was shifted forward by a year. Because the baseline schedule (`calcRMDProjection`) has no such extra growth, the two sides of `rmdTaxSaved = rmdTaxBite − rmdTaxBitePost` were on different growth clocks, corrupting `netConversionBenefit` and the optimizer's `getNetBenefit`. The existing test only checked that post-conversion RMDs were *lower* than baseline (relative), so it never caught the absolute shift.

**Proof:**  
Ran the conversion engine with conversion amount = **0**. With no money actually moving, the post-conversion RMD schedule must equal the baseline exactly. It didn't — the post-conversion age-73 RMD equalled the baseline age-**74** RMD (one year of growth too high).

**Fix:**  
`calcRMDPostConversion` now skips the growth step in the first iteration (`if (age > RMD_START_AGE) bal = bal * (1 + r)`), because `tradBal73` is already the age-73 balance — matching `calcRMDProjection`'s convention. Added a regression test asserting the zero-conversion post-conversion schedule equals the baseline age-by-age. Golden master `netConversionBenefit` updated **17_345 → 47_047** as a deliberate, dated correctness change (CLAUDE.md rule 7).

---

### ~~BUG-26~~ — SS-delay gain years overstated (used full retirement portfolio, ignoring pre-70 drawdowns)

**Reported:** 2026-06-04 · **Fixed:** 2026-06-04  
**Files:** `src/model/drawdown.js` (new `calcDrawdownYears`), `src/App.jsx` (`ssDelayGainYrs`), `src/model/__tests__/drawdown.test.js`

**Symptom:**  
The "SS delay gain years" metric (`~X yrs longer`) overstated the portfolio-longevity benefit of delaying Social Security to age 70 — by 3–6 years for users who retire well before 70 and defer SS to the maximum.

**Root cause:**  
The old `ysSS70` solved a closed-form: "how long does the portfolio last drawing at the *post-SS-70* (lower) rate, starting from the full `totalAtRet`?" But between retirement and the age-70 claim, the user draws at a *higher* rate (no SS yet), so the portfolio is already partly depleted by 70. Starting the calculation from `totalAtRet` at the low post-70 draw ignored those higher pre-70 draws and inflated the result.

**Fix:**  
Replaced the closed-form with a new pure helper `calcDrawdownYears({ startBal, startAge, effectiveExpenses, rReal, ssAmount, ssClaimAge, pensionAmount, pensionStartAge })` that walks the drawdown **year by year**, gating SS and pension on their start ages per year — exactly mirroring the `totalChartData` chart loop (and honoring CLAUDE.md rule 5b: per-year income timing). `ssDelayGainYrs` now computes two year-by-year longevities from the same `totalAtRet` — one under the user's actual claiming age, one delaying to 70 with the larger age-70 benefit — and reports the rounded difference. The higher pre-70 draws in the delay scenario are now correctly captured. Returns `null` (no badge) when either scenario is sustainable indefinitely, matching prior behavior. The headline `yearsSustained` closed-form is unchanged; only this comparison metric moved to the per-year walk. Model layer, so golden master and all model tests still pass (6 new tests added for `calcDrawdownYears`, including a regression asserting the new delay figure is below the old closed-form overstatement).

---

### ~~BUG-17~~ (Audit Finding D) — SS claiming-age slider could be set below current age

**Reported:** 2026-06-02 · **Fixed:** 2026-06-04  
**File:** `src/App.jsx` (SS claiming-age `Slider`)

**Symptom:**  
The Social Security claiming-age slider allowed values below the user's current age (you can't claim in the past). Cosmetic only — the drawdown loops gate SS on `age >= ssClaimingAge`, so a past claiming age was already treated as "active from the start."

**Fix:**  
Slider `min` is now `Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge))` — floored at the current age but never exceeding the max claiming age (70), so the control stays valid even for users already past 70. No model change.

---

### ~~BUG-07~~ — Chart 1 Trad 401k normalization used Phase 1 rate for Phase 2 years

**Reported:** 2026-06-01 · **Closed (obsolete):** 2026-06-04  
**File:** `src/App.jsx` (Trad 401k chart normalization)

**Resolution — obsolete by refactor.**  
This bug described a mismatch between the mid-career *Phase 2 tax rate* (`rate2`) and the rate used to normalize the Trad 401k accumulation line. The entire phase-rate mechanism it depended on no longer exists: the rate1/rate2/rate3 sliders were removed in commit `cdca9be` ("Remove rate3/phase sliders — all tax rates now bracket-accurate"). The Trad 401k line is now normalized for **every** accumulation year at a single bracket-accurate `fedMarginal` rate (`App.jsx` `simData`), so there is no per-phase rate to mismatch and no retirement-year dip. The mid-career *scenario tool* itself is now tracked as premium feature #29.5 with its own state; the `phase2Actions` references that remain in `action-cards.js` are the unrelated action-plan grouping (Phase 1/2/3 = now / mid-career / retirement). Nothing to fix.

---

### ~~BUG-18~~ (Audit Finding G) — Retirement age could momentarily exceed `lifeExpectancy − 1`

**Reported:** 2026-06-02 · **Closed (already guarded):** 2026-06-04  
**File:** `src/App.jsx` (life-expectancy and retirement-age `Slider`s)

**Resolution — already guarded; verified.**  
The crossing is prevented by two independent layers that are both present in the current code: (1) the Life Expectancy slider has `min={retirementAge + 1}` and the Retirement Age slider has `max={lifeExpect - 1}`, so neither can be dragged past the other; and (2) the life-expectancy `onChange` handler explicitly clamps retirement age down (`if (retirementAge >= v) setRetirementAge(v - 1)`) within the same interaction. Verified by reading both handlers — no gap remains. Downstream loops additionally use `Math.max(1, safeLifeExp - safeRetAge)` guards as defense in depth. No change required.

---

### ~~BUG-25~~ — Optimizer bracket-mode mismatch, ACA omission, floor off-by-one, rmdTaxPost duplication

**Reported:** 2026-06-04 · **Fixed:** 2026-06-04 (code review findings 1–5)  
**Files:** `src/App.jsx`, `src/model/roth-conversion.js`

**Three correctness bugs + two architectural fixes from a post-batch-2 code review:**

**Finding 1 — Optimizer ignored ACA cliff costs (most severe).**  
`getNetBenefit` in `optimizerResult` returned `{ rmdTaxSaved, totalTax, irmaaCost }` and maximized `rmdTaxSaved − totalTax − irmaaCost`. The displayed "Adjusted Net Benefit" correctly subtracts `acaAnnualLoss` (lost ACA subsidies when a conversion crosses the 400% FPL cliff), but the optimizer never computed this. A user on marketplace insurance could receive an optimizer recommendation that crossed the ACA cliff, while the display simultaneously showed a negative adjusted benefit. Fix: replaced the inline IRMAA loop with a `calcHealthcareExposure` call (which already computes both IRMAA and ACA cliff exposure per year). Added `acaLoss` to the `getNetBenefit` return shape and updated `findOptimalConversion` to subtract it: `rmdTaxSaved − totalTax − irmaaCost − (acaLoss ?? 0)`. Optimizer display guard widened from `hasMedicare` to `hasMedicare || hasMarketplaceInsurance`.

**Finding 2 — Optimizer ran in bracket mode against a different model than displayed.**  
In bracket mode, `conversionSim` uses `annualConversions: bracketFillConversions` (a per-year array where pre-SS/pension years have more bracket room). The optimizer's inner `calcConversionSim` only received `annualConversion: amount` — a flat scalar that always overrides the array. Optimizing a flat scalar produces a different conversion profile than what bracket mode computes, making the suggestion inconsistent with the numbers shown. Fix: `optimizerResult` now early-returns `null` in bracket mode. The optimizer is only meaningful in custom mode (choosing the best flat annual amount); the per-year bracket targets are already determined by the bracket choice.

**Finding 3 — `buildIncomeFloors` age gate off by one (SS floor missing from the first SS year).**  
The `buildIncomeFloors` helper computed `age = safeRetAge + i` for i = 0…N−1, so `convFloors[0]` applied the SS gate using age `safeRetAge`. But the first conversion year in the simulation is displayed as age `safeRetAge + 1` (because `calcConversionSim` produces 1-indexed years and App.jsx adds the offset). The arrays are paired by index, so `convFloors[0]` (gate at `safeRetAge`) was used as the income floor for the year displayed as `safeRetAge + 1`. When `ssClaimingAge == safeRetAge + 1` (e.g., retire at 65, claim SS at 66 — a common setup), `convFloors[0]` checked `65 >= 66 = false` (no SS), but the displayed conversion year 0 IS the first SS year. The bracket-fill conversion target for that year was computed without the SS income floor — over-estimating the available room by approximately `ssTaxableRet` (~$20–24k). The same error propagated into `calcConversionSim`'s `retIncomeFloors`, understating the tax on that year's conversion. Fix: `age = safeRetAge + i + 1` — now aligned with the displayed year ages.

**Finding 4 — `rmdTaxPost` reduce in optimizer duplicated `rmdTaxBitePost` formula.**  
The same reduce (calcTax on rmdIncomeFloor + rmd, accumulate (tax − rmdBaseFedTax) + rmd × retStateRate) appeared verbatim at two sites: lines ~448–451 (display path) and lines ~493–496 (optimizer inner loop). Fix: extracted a `calcRMDTax(rows)` helper defined once in the component and called at both sites.

**Finding 5 — `healthcareExposure` not memoized.**  
`calcHealthcareExposure` and its three derived values (`acaCliffYears`, `totalIRMAACost`, `acaAnnualLoss`) were computed inline on every render, including unrelated UI events like tab switches. Fix: wrapped in `useMemo([conversionSim, convMAGIFloors, hasMarketplaceInsurance, householdSize, hasMedicare, filingStatus])` — recomputes only when healthcare-relevant inputs actually change.

**Tests added:** `findOptimalConversion` subtracts `acaLoss`; `acaLoss ?? 0` backward compatibility; per-year floor produces higher tax once SS income is included in the floor (guards the off-by-one fix).

---

### ~~BUG-22~~ — `convFloors` / `convMAGIFloors` duplicated loop + optimizer re-ran every render

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx`

**Symptom:**  
Two nearly identical per-year income-floor loops existed (`convFloors` for tax math using 85% taxable SS, `convMAGIFloors` for ACA/IRMAA MAGI using 100% SS). Separately, `convFloors`, `convMAGIFloors`, `retVals`, `currentSnapshot`, and `bracketFillConversions` were all created inline (`Array.from` / `Object.fromEntries` / object literal) on every render, so they produced new references each render. Because those references are dependencies of the `conversionSim` and `optimizerResult` memos, the 61-candidate conversion optimizer (≈3,000 inner iterations) re-ran on **every keystroke**, not only when its real inputs changed.

**Root cause:**  
The duplicated loop differed only in the SS amount; the unstable references defeated `useMemo` dependency comparison.

**Fix:**  
Extracted a single `buildIncomeFloors(ssAmount)` helper used for both arrays (the only difference — `ssTaxableRet` vs `householdSS` — is now an explicit argument). Memoized `convFloors`, `convMAGIFloors`, `bracketFillConversions`, `retVals`, and `currentSnapshot` with complete dependency lists (every reactive value each one reads), so they refresh exactly when an input changes and stay referentially stable otherwise. The optimizer now re-runs only when a genuine input changes. Pure refactor — all computed values are byte-identical (golden master unchanged).

---

### ~~BUG-21~~ — Roth-conversion optimizer dropped the first IRMAA year for early retirees

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx` (`optimizerResult` IRMAA loop)

**Symptom:**  
The conversion optimizer's IRMAA cost loop computed each conversion year's age as `safeRetAge + i`, but the conversion sim (and the on-screen IRMAA figure via `calcHealthcareExposure`) treats conversion year `i` as age `safeRetAge + i + 1` — conversions start the tax year **after** retirement, ending at age 72 before RMDs at 73. For an early retiree (≈ `safeRetAge ≤ 63`), the optimizer's age was one year low, so the first conversion year's IRMAA surcharge (`age + 2 ≥ 65`) fell below the Medicare threshold and was skipped. The optimizer therefore under-counted IRMAA cost and could recommend a larger conversion than the displayed numbers support.

**Root cause:**  
Same off-by-one family as ~~BUG-11~~ (age-gated conversion-window loop starting at `safeRetAge + i` instead of `safeRetAge + i + 1`), reintroduced in the new optimizer code (batch-2).

**Fix:**  
The optimizer now derives the age from the conversion sim's own 1-indexed `years[i].age` (`safeRetAge + (sim.years[i].age ?? i + 1)`), identical to the display path in `calcHealthcareExposure`. Verified against a retire-at-62 scenario: optimizer and UI now both count 10 IRMAA years (previously 9 vs 10). Also tightened the MAGI fallback from `?? amount` to `?? 0` for clarity (the year row always exists, and `??` never triggered on a `0` conversion anyway). Test-side: `action-cards.test.js` was passing the obsolete `rate3Combined` key instead of `effectiveRMDTaxRate`, leaving the rate `undefined` ("~NaN% effective") with no assertion to catch it — renamed the key and added a test asserting the RMD row renders the rate and contains no "NaN".

---

### ~~BUG-20~~ — App crashed on render: `fedMarginal` used before initialization (TDZ)

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx` (lines ~140 / ~144 / ~155, declaration at ~177)

**Symptom:**  
The entire app threw `ReferenceError: Cannot access 'fedMarginal' before initialization` on first render — a blank page. The `simData` memo (body + dependency array) and `currentSnapshot` read `fedMarginal`, but it was declared ~35 lines further down. `const` bindings sit in the temporal dead zone until their declaration line runs, so reading it earlier is a hard crash.

**Root cause:**  
The rate3-slider removal (batch-2) switched the `"Trad 401k"` after-tax normalization from the early `rate3` state to the later-computed `fedMarginal`, but left `fedMarginal`'s declaration below the code that now consumes it. It shipped undetected because `npm test` only exercises the pure-function model layer — nothing rendered `App.jsx`.

**Fix:**  
Moved the tax-basis block (`combinedIncome`, `totalPreTaxDeduc`, `safeDeduc`, `agi`, `fedTax`/`fedEffRate`, `fedMarginal`) above the `simData` memo so the value exists before it's read. Added a permanent render smoke test (`src/__tests__/render-smoke.test.js`) that `renderToString`s `App` once, so any future TDZ/runtime error in the component body fails CI instead of only the browser.

---

### ~~BUG-15~~ (Audit Finding F) — "Household Gross" / "FICA (both earners)" labels shown for non-MFJ filers

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` line 794

**Symptom:**  
The 2026 Tax Breakdown card labeled the gross-income row "Household Gross" whenever `spouseIncome > 0`, even for non-MFJ filers (single / MFS / HoH) where the displayed `householdIncome` is *primary-only*. The label implied the spouse's income was included when it was not.

**Root cause:**  
The label keyed on `spouseIncome > 0` rather than on filing status. Per CLAUDE.md rules 3 & 9, only MFJ uses combined household income; for every other status `householdIncome = currentIncome` (primary only).

**Fix:**  
The gross-income label now keys on `filingStatus === "mfj"` ("Household Gross") vs. otherwise ("Gross Income"), matching the value actually shown. The FICA label is left keyed on `spouseIncome > 0` ("FICA (both earners)") — that is correct, because FICA is always computed per-earner across both spouses regardless of filing status.

---

### ~~BUG-14~~ (Audit Finding E) — Flat employer match treated as contingent in the surplus optimizer

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/model/budget.js` (`calcOptimizedAllocation`, lines 51–63)

**Symptom:**  
With employer match set to **flat** mode (employer contributes `salary × pct` unconditionally), the "Optimized" surplus allocation still steered the user's own surplus into the 401k "to capture the match" — money that should go to HSA/Roth first in IRS-priority order. The advice was wrong because a flat match is paid regardless of what the employee contributes.

**Root cause:**  
The match-capture step ran for both modes and, for flat mode, computed the match *amount* (`salary × employerMatchPct`) and treated it as a contribution the user must make.

**Fix:**  
The match-capture step now runs only when `matchMode === "formula"` (the only mode where the match is contingent on the employee's own deferral, e.g. "50% of the first 6%"). In flat mode, surplus flows to HSA → Roth → 401k → taxable in correct priority. Added a flat-mode test asserting `extraMatch === 0` with HSA/Roth funded first; kept a formula-mode test asserting the match gap is still captured.

---

### ~~BUG-13~~ (Audit Finding B) — Roth conversion bracket-fill used a single steady-state target for every year

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` (bracket-fill block + display), `src/model/roth-conversion.js`, `src/model/action-cards.js`

**Symptom:**  
In "fill a bracket" mode, the recommended annual conversion was a single static amount computed as if Social Security and pension income were active in every year of the conversion window. A user who retires early and defers SS has several low-income years with far more bracket room available, but the app recommended the same conservative amount throughout — under-converting in the cheap early years.

**Root cause:**  
The per-year *tax* was already correct (`convFloors` gates SS/pension on claiming/start age per year, and `calcConversionSim` uses `retIncomeFloors`), but the conversion *target* (`annualConversion`) was a single scalar derived from the steady-state floor.

**Fix:**  
- `calcConversionSim` gained an optional `annualConversions` array (mirrors the existing `retIncomeFloors` pattern); each loop year uses `annualConversions[yr] ?? annualConversion`. Fully backward-compatible — omitting it reproduces the scalar behavior, so the golden master is unchanged.
- App.jsx now builds `bracketFillConversions` per year from `convFloors[i]` (bracket top + deduction − that year's income floor) and passes it in bracket mode only.
- The headline "Annual Conversion" metric and the "Suggested annual conversion" line show a range (`peak → steady`) with a "tapers as SS/pension begin" note when the amounts vary; the Roth-ladder action card wording adapts the same way. The year-by-year table already reflects the varying amounts.

---

### ~~BUG-12~~ (Audit Finding A) — Roth IRA phase-out used combined income for non-MFJ filers

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` (~line 179), `src/model/simulation.js` (~line 81), `src/model/action-cards.js`

**Symptom:**  
The Roth IRA contribution phase-out was tested against *combined* household income (`currentIncome + spouseIncome`) for every filing status. A single / MFS / HoH filer with a working spouse was falsely warned they were in (or over) the Roth phase-out zone, and the projection simulation wrongly reduced or zeroed their projected Roth contributions.

**Root cause:**  
Both the live-year flags (`rothPhaseoutWarning`, `rothFullyPhased`) and the per-year simulation phase-out test summed primary + spouse income unconditionally. Per CLAUDE.md rules 3 & 9, only MFJ files jointly; every other status reports separately and should be tested on the primary earner's MAGI alone.

**Fix:**  
Introduced `rothMAGI = filingStatus === "mfj" ? combinedIncome : currentIncome` (mirrors the existing `agi` gate) and used it for both phase-out flags; the phase-out action card now prints `rothMAGI` with "combined" wording only for MFJ. In `simulation.js`, the per-year test is now `yearMAGI = filingStatus === "mfj" ? primaryMAGI + spouseMAGI : primaryMAGI`. Added simulation tests: a single filer with a high-earning spouse is no longer phased out, while an MFJ household with the same combined income still is.

---

---

### ~~BUG-11~~ — Flow-Down conversion window draws counted from wrong starting year

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` lines 454–470, `src/model/action-cards.js` line 307

**Symptom:**  
The Flow-Down tab "Optimize & Convert" phase card showed "Living Expenses" (convWindowDraws) and "Portfolio Growth" (convWindowGrowth) that didn't balance against the actual chart trajectory. The "entering RMDs" connector value also showed the portfolio after the first RMD draw rather than before.

**Root cause:**  
Two related issues:

1. `convWindowDraws` loop started at `safeRetAge + i` (i=0 → age=safeRetAge, the retirement year). The chart makes no draw at the retirement year (drawdown starts at `safeRetAge + 1`), so `convWindowDraws` counted one phantom draw at retirement and missed the last actual draw at `RMD_START_AGE - 1`.

2. `portAt73` was sourced from `totalChartData.find(d => d.age === RMD_START_AGE)?.total`. The chart value at age 73 is the portfolio *after* the age-73 draw (first RMD), so `convWindowGrowth = portAt73 - totalAtRet + convWindowDraws + taxes` absorbed the first RMD draw as negative growth — making convWindowGrowth appear lower than actual investment return.

**Fix:**  
- Renamed `portAt73` → `portPreRMD` and changed the lookup to `RMD_START_AGE - 1` (age 72 — portfolio after the last conversion-window draw, before any RMD).
- Changed `convWindowDraws` loop to start at `safeRetAge + 1 + i` so it covers the same years as the chart drawdown ([safeRetAge+1, safeRetAge+conversionWindowYrs]).
- With both changes, `convWindowGrowth = portPreRMD - totalAtRet + convWindowDraws + taxes` equals pure investment return during the window.
- Updated `action-cards.js` label from "Portfolio at 73" → "Portfolio entering RMDs".
- Updated `action-cards.test.js` mock key accordingly.

---

### ~~BUG-09~~ — `totalChartData` SS/pension income off by one year (`>` vs `>=`)

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` lines 290–291

**Symptom:**  
The Portfolio Lifecycle and Total Portfolio — Full Lifecycle charts showed Social Security and pension income reducing portfolio draws starting one year later than the claiming/start age. For example, if SS claiming age was 67, the chart did not reduce draws at age 67 — only from age 68 onward.

**Root cause:**  
`totalChartData` drawdown loop used `age > ssClaimingAge` and `age > pensionStartAge` (strict greater-than). Every other age-gated loop in the codebase (`flowData.convWindowDraws`, `convFloors`) correctly uses `>=`. The `>` operator skips the claiming-age year itself, offsetting income by one year.

**Fix:**  
Changed both comparisons to `>=` (two character changes). The Portfolio Lifecycle and Total Portfolio charts now include SS/pension income starting at the exact claiming/start age, consistent with all other income-timing loops.

---

### ~~BUG-10~~ — Static `netPortfolioNeed` included SS even when `ssClaimingAge > safeRetAge`

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` lines 238–244, 1385–1396, 2185

**Symptom:**  
The Withdrawal Rate and Years Sustained headline cards, along with the "Portfolio draws" breakdown, showed SS income reducing the portfolio need even when the user's SS claiming age was after their retirement age. For example, retiring at 65 with SS claiming age 67 (FRA) would show `netPortfolioNeed = expenses − SS`, as if SS was available from day 1 — making the withdrawal rate appear lower than reality.

**Root cause:**  
`netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, householdSS, effectivePension)` used `householdSS` (full SS amount) without checking if `ssClaimingAge <= safeRetAge`. `effectivePension` was already correctly gated on `pensionStartAge <= safeRetAge`, but SS had no equivalent gate.

**Fix:**  
Added `ssAtRet = includeSS && ssClaimingAge <= safeRetAge ? householdSS : 0` — mirrors the pension gate exactly. `netPortfolioNeed` now uses `ssAtRet`. The breakdown card shows SS as "starts age X · deferred" (muted, not subtracted) when claiming age is after retirement, so the user understands their full portfolio draw requirement. The `householdSS` variable is unchanged for per-year loops and display contexts.

---

### ~~BUG-08~~ — RMD reference line missing in Portfolio Lifecycle chart for users retiring at 72

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 2489

**Symptom:**  
In the Flow-Down tab's "Portfolio Lifecycle" chart, the orange "RMDs age 73" reference line only appeared when `flowData.hasConvWindow` was true (i.e., `safeRetAge ≤ 71`). A user retiring at age 72 has zero conversion window years but RMDs begin at 73 — the reference line didn't appear even though it was directly relevant.

**Root cause:**  
The condition `flowData.hasConvWindow` (`conversionWindowYrs > 0`) was used as the gate. `conversionWindowYrs = RMD_START_AGE − 1 − safeRetAge`. At `safeRetAge = 72`, this equals 0, so `hasConvWindow` is false and the line was suppressed.

**Fix:**  
Changed the gate to `safeRetAge < RMD_START_AGE`. The RMD marker now appears whenever retirement precedes age 73, regardless of whether a conversion window exists. When `safeRetAge ≥ RMD_START_AGE` (already in RMD territory at retirement), the line is correctly suppressed because it would overlap or precede the retirement marker.

---

### ~~BUG-01~~ — Retirement age minimum is current age + 2

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**Files:** `src/App.jsx` (8 edits), `feature-tracker.html`

**Root cause:** `safeRetAge = Math.max(retirementAge, currentAge + phase2Start + 1)` applied the Phase 2 constraint unconditionally, even when Phase 2 was off. With `phase2Start` defaulting to 2, the floor was always `currentAge + 3` internally and `currentAge + 2` on the slider.

**Changes:**
- `safeRetAge` formula is now conditional: uses the Phase 2 constraint only when `showPhase2 = true`; otherwise `safeRetAge = retirementAge` directly.
- Retirement Age slider `min` is now `showPhase2 ? currentAge + 2 : currentAge`, allowing retirement age as low as current age (already retired).
- Current Age `onChange` guard updated to match: bumps retirement age to `currentAge + 2` only when Phase 2 is on; otherwise only prevents retirement age going below current age.
- Phase 2 toggle button bumps retirement age up to `currentAge + 2` proactively when Phase 2 is enabled from a low retirement age.
- `currentSnapshot` object introduced as a "year-0" fallback (current balance values with the same shape as `simData` rows). Used by: `atRetirement`, `rmdData`, `conversionSim`, and `totalChartData` when `retirementAge === currentAge`.
- `totalChartData` seeds a starting data point at `age = currentAge` when the user is already retired, so the drawdown chart starts from actual current balances rather than $0.
- Mid-career phase tagged as planned premium feature in `feature-tracker.html` (item #29.5), to be gated via the `isPremium` flag when #29 ships. No lock overlay built yet.

---

### ~~BUG-02~~ — "Fed / AGI" label reads as a division expression

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 764  
**Change:** Sub-label changed from `"fed / AGI"` to `"fed tax ÷ AGI"`. Same treatment applied to the Combined sub-label (`"all / gross"` → `"all ÷ gross · ref only"` and `"all / household"` → `"all ÷ household · ref only"`).

---

### ~~BUG-02a~~ — "Combined" effective rate unexplained

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` lines 766, 778  
**Change:** Marginal and Combined stats are now rendered in muted color with "ref only" in their sub-labels, visually distinguishing them from the headline Fed Effective rate. The explanatory note now explicitly states that these two figures are current-year reference only and do not feed into projections; it also points the user to the Phase 3 Retirement Federal Rate as the value that actually drives all projections.

---

### ~~BUG-03~~ — "Other Pre-Tax" row appearing from nothing causes layout jump

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 611  
**Change:** Removed the `{otherPreTaxDeduc > 0 && ...}` conditional. The "Other pre-tax" row is now always rendered; it shows `—` in muted color when the slider is at $0, and switches to the dollar amount in blue once a value is entered. Card height no longer changes as the slider moves off zero.

---

### ~~BUG-03a~~ — HSA default appears in Pre-Tax Deductions but is set far below

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 608  
**Change:** Added `(set in Accounts below)` in italics next to the "HSA contribution" label in the Pre-Tax Deductions breakdown. No model changes.

---

### ~~BUG-04~~ — "→ $X at ret." annotation is unexplained

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` lines 1135–1174  
**Change:** Added a small sub-line beneath the annotation reading *"contrib. amount scaled with income growth"* so the user understands the number is a projected contribution dollar amount, not a portfolio value.

---

### ~~BUG-04a~~ — "→ $X at ret." projection can show values above IRS limits

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1136  
**Change:** The projected contribution is now capped at `contribMax` (the per-account IRS limit) before display. When the projection hits the cap, `(IRS cap)` is appended to the annotation, making it clear the number represents the maximum allowed rather than an unconstrained projection. The growth calculation is also guarded to only run when `incomeGrowth > 0` to avoid showing a projection that equals the current contribution.

---

### ~~BUG-05~~ — Retirement Federal Rate: unclear what it drives

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1063  
**Change:** Added a short paragraph inside the Phase 3 card above the retirement-state selector: *"This rate drives all post-retirement calculations: portfolio charts, drawdown model, Roth conversion analysis, and the withdrawal strategy card. An incorrect estimate will silently skew every projection."*

---

## Conventions

- Add new entries at the top of "Open Issues."
- When fixing a bug, move it to "Resolved" and add: **Fixed:** date, commit SHA, brief description of change.
- Link relevant file + line numbers for every entry so they stay navigable as the codebase evolves.
- **Re-verify, don't just append.** "Make BUGS.md up to date" means a *verification pass*, not a logging pass. For **every** entry still under "Open Issues," open the referenced file + line and confirm the symptom still reproduces in the current code before leaving it open. If the cause is gone (the code was removed/refactored — e.g. BUG-07) or already guarded (e.g. BUG-18), move it to Resolved with a dated note explaining why. Stale-open entries are a documentation bug.
- **When you change code, sweep the open list.** A refactor or removal can silently moot an open entry that lives in a different file. After any non-trivial code change, scan "Open Issues" for anything the change affects and reconcile it in the same session — don't let obsolescence outlive the commit that caused it.
- A speculative or audit finding must be **verified against the code before** it is filed as Open. If it can't be reproduced, either don't file it or file it as Resolved/"already guarded" with the reason.
