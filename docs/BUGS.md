# Bug & Oddity Tracker

This file tracks known bugs, UI oddities, and design questions in the app.
Each entry records **what was found**, **why it happens** (root cause), **status**, and **fix notes** once resolved.

---

## Open Issues

---

### BUG-07 — Chart 1 Trad 401k normalization uses Phase 1 rate for Phase 2 years

**Reported:** 2026-06-01  
**Status:** Open — deferred until Phase 2 feature review  
**File:** `src/App.jsx` line 1475

**Symptom:**  
In "Portfolio Growth Over Time," the BUG-06 fix normalizes all Trad 401k values to `rate1` for a smooth accumulation line. When the mid-career Phase 2 toggle is on and `rate2 ≠ rate1`, Phase 2 years are displayed using `rate1` instead of `rate2`. The chart description says "Phase 1 rate" which partially explains this, but a user with Phase 2 enabled at a higher bracket would see Phase 2 years overstated (if `rate2 > rate1`) or understated (if `rate2 < rate1`).

**Root cause:**  
The inline `.map()` on chart data applies `tradGross × (1 − rate1/100)` unconditionally for every accumulation year, regardless of which phase that year belongs to.

**Impact:**  
Phase 2 is off by default and rarely enabled. The inaccuracy is purely visual (the model is unaffected). Individual account growth trends are still directionally correct.

**Recommended fix:**  
Apply the correct phase rate per year: use `d["Trad 401k"]` from simData directly for all years *except* the retirement year (where rate3 causes the dip). For the retirement year only, substitute `tradGross × (1 − rate_last_working_phase / 100)`. This requires knowing whether the year falls in Phase 1 or Phase 2, which can be determined by comparing `d.age` to `currentAge + phase2Start`.

---

## Resolved Issues

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
