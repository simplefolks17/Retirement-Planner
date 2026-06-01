# Bug & Oddity Tracker

This file tracks known bugs, UI oddities, and design questions in the app.
Each entry records **what was found**, **why it happens** (root cause), **status**, and **fix notes** once resolved.

---

## Open Issues

---

### BUG-07 — Chart 1 Trad 401k normalization uses Phase 1 rate for Phase 2 years

**Reported:** 2026-06-01  
**Status:** Open  
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

### ~~BUG-06~~ — Trad 401k line dips in "Portfolio Growth Over Time" chart near retirement

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1473

**Symptom:**  
The Trad 401k balance line visibly drops toward the end of the "Portfolio Growth Over Time" accumulation chart, just at or before the retirement age marker. All other account lines (Roth, Taxable, HSA) continue trending upward as expected.

**Root cause:**  
The `"Trad 401k"` value stored in each `simData` row is `tradGross × (1 − taxRate)`. The `taxRate` is determined by `getTaxRate()`, which switches from `rate1` (working phase) to `rate3` (retirement phase) exactly at year `phase2End` — i.e., at age `safeRetAge`. The chart filter was `d.age <= safeRetAge`, so the retirement year (the last data point) was included and already used `rate3`. All preceding points used `rate1`.

If `rate3 > rate1` — which happens whenever users sync their retirement rate to a projected RMD bracket (e.g., rate1=22%, rate3=24%) — the last chart point applies a higher haircut than the rest, producing a visible dip. The other accounts have no such tax factor and always display their gross balances, so they continue rising unaffected.

The chart description also incorrectly stated "using the retirement-phase tax rate **after** age {safeRetAge}" when the code was applying it **at** that age.

**Fix:**  
The chart now normalizes all data points to use `rate1` consistently: `tradGross × (1 − rate1/100)`. Since `tradGross` (pre-tax balance) is already stored in every `simData` row, this is a pure display transform with no model changes. The line is now smooth throughout the accumulation phase. The description was updated to explain that the snapshot cards below the chart show the retirement-rate after-tax value.

---

---

### BUG-02 — "Fed / AGI" label reads as a division expression

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` line 764

**Symptom:**  
In the 2026 Tax Breakdown card, the sub-label beneath the "Fed Effective" rate reads `fed / AGI`. To a non-technical user this looks like a math expression (`federal tax ÷ AGI`) rather than a description of what two numbers are involved.

**Root cause:**  
The `sub` string is hardcoded as `"fed / AGI"`. There is no parenthetical or natural-language phrasing.

**Recommended fix:**  
Change to `"(fed tax ÷ AGI)"` or `"fed tax as % of AGI"`. Either makes clear this is a definition, not an operation.

---

### BUG-02a — "Combined" effective rate has no explanation of how it is used

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` lines 766, 778

**Symptom:**  
The "Combined" stat in the 2026 Tax Breakdown is visually emphasized the same as "Fed Effective" and "Marginal," but its downstream purpose is unclear. The note beneath reads *"Combined uses gross — FICA is assessed on gross wages"* — accurate, but doesn't tell the user why they should care.

**What the numbers actually mean:**

| Stat | Formula | Used in model? |
|---|---|---|
| Fed Effective | Federal tax ÷ AGI | Informational only for current year |
| Marginal | Rate on the next dollar of income | Informational only for current year |
| Combined | (Fed + State + FICA) ÷ gross income | **Informational only for current year** |

The retirement-phase combined rate (`rate3Combined`) used in drawdown and Roth conversion is a *separate* calculation: `rate3 (user-set retirement fed rate) + retirement state tax`. It is not derived from the current-year combined figure.

**Recommendation:**  
Two options:
1. Add a sentence to the explanatory note clarifying that these three rates are reference figures for the current year and do not feed directly into projections.
2. Visually de-emphasize Marginal and Combined (smaller font, muted color, no background highlight) so only Fed Effective stands out as the headline metric.

---

### BUG-03 — "Other Pre-Tax" row appearing from nothing causes layout jump

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` line 611

**Symptom:**  
In the Pre-Tax Deductions card, the "Other pre-tax" row (FSA, dependent care, transit) is hidden when its slider is at $0. As soon as you drag the slider off zero, the row pops into existence, pushing the rest of the card down and causing the whole page to shift.

**Root cause:**  
The row is conditionally rendered:
```jsx
{otherPreTaxDeduc > 0 && (
  <div ...>Other pre-tax ... {fmt(otherPreTaxDeduc)}</div>
)}
```

**Recommended fix:**  
Remove the conditional entirely. Always render the "Other pre-tax" row; just show `$0` (or `—`) when the value is zero. This keeps the card height stable no matter how the slider moves.

---

### BUG-03a — HSA default contribution appears in Pre-Tax Deductions but is set far below

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` lines 68, 608–609

**Symptom:**  
The Pre-Tax Deductions card shows "HSA contribution $3,850" as a pre-filled default, but the HSA contribution slider lives much further down the page inside the "Accounts & Projections" card. New users may not realize these are linked — the pre-tax number comes directly from the HSA contribution field they haven't seen yet.

**Root cause:**  
`contribHSA` defaults to `$3,850` at initialization (line 68) and flows into both the Pre-Tax Deductions display and the Accounts slider. There's no in-context note connecting them.

**Recommended fix:**  
Add a small parenthetical or icon next to "HSA contribution" in the Pre-Tax Deductions breakdown, e.g.:

> HSA contribution &nbsp;·&nbsp; *(set in Accounts section below)*

This sets the expectation without requiring any model changes.

---

### BUG-04 — "→ $X at ret." annotation on account contributions is unexplained

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` lines 1135–1173

**Symptom:**  
In the Accounts & Projections card, some accounts (Traditional 401k and Taxable Brokerage) show a small annotation like `→ $8,400 at ret.` next to the contribution amount. There's no explanation of what this number means.

**Root cause:**  
The annotation is a projection of your *contribution amount* at retirement — not your portfolio value. It assumes contributions scale proportionally with your income growth rate:

```js
projContrib = contrib * (1 + incomeGrowth / 100) ^ yearsToRetirement
```

Example: $5,000/yr contribution + 3% income growth + 30 years to retirement → $5,000 × 1.03³⁰ ≈ $12,136.

The intent is to show that if your salary doubles by retirement, your dollar contribution amount would also double.

**Recommended fix:**  
Add a short tooltip or sub-note such as:
> *Projected contribution amount at retirement, scaled with your income growth rate.*

This removes the mystery without cluttering the UI.

---

### BUG-04a — "→ $X at ret." projection can show values above IRS contribution limits

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` line 1136

**Symptom:**  
The projected contribution annotation (see BUG-04) grows the current contribution by income growth over the full accumulation window. For long windows and high income growth, the projected number can exceed IRS annual limits by a large margin.

Example: $20,000/yr 401k contribution + 3% income growth + 35 years → projection shows ~$56,000, but the 2026 401k limit is $23,500 (or $31,000 with catch-up). The simulation correctly caps contributions at IRS limits (per CLAUDE.md Rule 4), but the UI annotation doesn't.

**Root cause:**  
The annotation formula does not apply any IRS cap:
```js
contrib * Math.pow(1 + incomeGrowth / 100, phase2End - 1)
```

**Recommended fix:**  
The annotation is meant to be approximate guidance, not a simulation output. Two options:
1. Cap the displayed number at `contribMax` (the per-account IRS limit) so it never shows an impossible value.
2. Add a disclaimer: *"actual contributions capped at IRS limits."*

Option 1 is more trustworthy.

---

### BUG-05 — Retirement Federal Rate: unclear what it drives, prominent placement

**Reported:** 2026-06-01  
**Status:** Open  
**File:** `src/App.jsx` lines 1063–1107

**Symptom:**  
"Retirement Federal Rate" (`rate3`) appears as a prominent Phase 3 card in the Tax Rate Phases section. Users may wonder (a) whether this is just a display note or an actual input to calculations, and (b) how to know what value to enter.

**What it actually drives:**  
`rate3` is a user estimate of their expected federal income-tax rate in retirement. It is used in:

- **Simulation loop** — after-tax value of Traditional 401k withdrawals in all projection charts
- **Drawdown model** — year-by-year tax cost on traditional account draws
- **Roth conversion analysis** — bracket-fill math; the combined rate `rate3Combined = rate3 + retirement_state_rate` sets the upper threshold for conversion value
- **Withdrawal strategy card** — tax estimate on worst-case all-traditional draw (`yr1TaxWorstCase`)
- **Optimization engine** — comparison of pre-tax vs. after-tax contribution value

It is *not* merely decorative. An incorrect retirement rate will silently skew every projection.

**Recommendation:**  
Add a short sentence inside the Phase 3 card explaining its reach, e.g.:

> *This rate is used in all post-retirement projections: portfolio charts, Roth conversion analysis, and the withdrawal strategy card.*

The card already shows a "sync" button when projected RMD + SS income puts you in a different bracket — that feature is good. It just needs context so users don't dismiss it as cosmetic.

---

## Resolved Issues

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
