# Whole-Codebase Review — Consolidated Findings

**Date:** 2026-06-16 · **Reviewers:** Claude (deep, per-layer) · CodeRabbit (ASSERTIVE) · Gemini Code Assist
**Method:** codebase surfaced as 3 layer PRs (Model #34, View #35, Shell #36) against an empty base so each
bot saw whole files; Claude reviewed the same 3 layers locally against the invariants in `docs/REVIEW-GUIDE.md`.
Baseline before review: **441 tests green, lint clean.**

Reviewer raw counts: CodeRabbit 18 (Model) + 26 (View) + 6 (Shell) = 50 · Gemini 3 summaries · Claude 9 findings + many invariant confirmations.

---

## Executive summary (plain language)
The codebase is in **good shape**. There is **one clear correctness bug worth fixing** (a contribution limit applied
one year too late), **one real "screen doing math" issue** (a tax chart computes its own percentages instead of
getting them from the model), and a tail of **small defensive hardening + tidy-ups**. A large share of the bots'
volume — especially CodeRabbit's — was **false positives** that Claude verified and cleared: treating every bit of
UI state and every "divide by 12 for a monthly number" as a violation. The multi-reviewer setup did its job: the
bots surfaced real bugs Claude also found (independent corroboration), and Claude filtered the bots' noise.

**Agreement signal:** the two findings rated highest were each flagged by **two independent reviewers**.

---

## What to actually fix (prioritized)

### P1 — Real correctness, worth fixing now
1. **Catch-up contribution off-by-one** — `src/model/simulation.js:51` *(Claude MEDIUM + CodeRabbit)*
   `isEligibleForCatchup = currentAge + (y-1) >= CATCHUP_AGE` uses *start-of-year* age, so the year you **turn 50**
   gets the under-50 limits ($24,500 / $70k 415c) instead of $32,000 / $77,500. IRS allows catch-up for the whole
   calendar year you turn 50. **It ships green because a test asserts the wrong behavior** (`simulation.test.js:138`
   says age 50 is NOT eligible). Fix: test `age >= CATCHUP_AGE` (year-end age) and correct the test.
2. **Tax chart computes its own percentages (genuine rule-10)** — `src/horizon/screens/NumbersScreen.jsx:720–779`
   *(Claude MEDIUM + CodeRabbit)* The Taxes tab sums `fedTax + rmdTaxBite + convTaxTotal` and computes per-segment
   `%` inline — the one place a Horizon screen still does financial math, inconsistent with the Statement tab which
   reads pre-computed pcts from `calcStatementView`. Fix: add a `composition` field to the `taxViewBundle` (App/model);
   screen formats only.

### P2 — Real but minor / defensive / display-only
3. `src/model/action-cards.js:68–84` *(CodeRabbit)* — "Capture full employer match" card fires for **flat-match** mode too; only meaningful for formula mode. Add `matchMode === "formula"` guard.
4. `src/model/budget.js:74–81` *(CodeRabbit)* — `matchContribNeeded` can exceed the 401k limit; cap with `Math.min(..., TRAD_401K_LIMIT_2026)` (rule 4).
5. `src/model/healthcare.js:38–40` *(CodeRabbit)* — ACA cliff uses `>=`; income exactly at the threshold shouldn't count as crossing. Use `>`.
6. `src/model/what-if.js:295–316` & `:61–75` *(Gemini + CodeRabbit)* — guard degenerate inputs (`step <= 0`, `scenarioRetAge <= currentAge`, `targetLifeExpectancy <= safeRetAge`) to avoid early-terminating / fabricated-depletion results.
7. `src/model/accumulation.js` *(CodeRabbit :60–69 + Claude :86)* — guard `balAtAge` interpolation against equal-age denominator (NaN); first-$1M milestone dropped on a strict `<` when crossing == retirement year.
8. `src/model/roth-conversion.js:9–17` & `:70–84` *(CodeRabbit)* — validate `step > 0` (infinite-loop guard); cap conversion so `taxableB` can't go negative (implicit borrowing).
9. **Taxable withdrawals modeled at 0% LTCG** — `src/model/taxes.js` / `retirement-tax.js calcWithdrawalOrderTax` *(Claude LOW + Gemini)* — `ltcgRate(0, …)` always picks the 0% bracket, overstating year-1 tax savings for higher-income retirees (display-only strategy card).
10. **Hardcoded ages in copy** — `action-cards.js:140–150` ("72"/"73") and `JourneyScreen.jsx:286` ("73+") *(CodeRabbit)* — pull from `RMD_START_AGE`/config per rule 1.
11. `NumbersScreen.jsx:590–593` *(Claude LOW)* — `retVals[...] ?? 0` dead fallbacks contradict the file's own principle-10 comment; drop to match the Statement tab.
12. React correctness nits *(CodeRabbit, View)* — `ChartTooltip` key (`i` → `p.dataKey ?? p.name`); `ArcGraph` event-marker key collisions + `useId()` for SVG gradient/filter ids; `ThemeContext` should listen for OS `prefers-color-scheme` changes; `DeferredInput`/`TaxTimeline` divide-by-zero / undefined-bound guards.
13. `ArcGraph.jsx:475` *(Claude + CodeRabbit)* — decorative band uses literal `0.92`; use the named `CONE_LOWER_ASYMMETRY`.

### P3 — Shell perf/style (all Classic-view, off the default path)
14. *(Claude + CodeRabbit, App.jsx)* — `generatePhaseSteps/Actions` inline IIFE (fresh arrays; **not** a memo bug — see disagreements); inline `Tooltip` content lambdas; `new Date().getFullYear()` per-render used as a memo dep → hoist to module const; `calcTaxBasis` unmemoized (intentional per BUG-20 — leave); dead `rmdDataWithTax` alias of `rmdData`; inline tab array → module const.

---

## Notable disagreements — where Claude overruled a bot (likely false positives)
These are the high-value reconciliations; **verify before acting** but Claude gave a concrete reason in each case.

| Bot finding | Claude's verdict | Reason |
|---|---|---|
| CodeRabbit 🔴 "PhaseCard IIFE breaks memoization" (App.jsx:2942) | **Downgrade to perf nit** | `PhaseCard` is a plain function component, **not `React.memo`** — fresh arrays defeat no memoization. CodeRabbit's claim was explicitly conditional ("*if* PhaseCard wraps in React.memo"); it doesn't. |
| Gemini: change vite test env `node` → `jsdom` | **False positive** | `react-test-renderer` renders to plain JS objects; needs no DOM. All 441 tests pass under `node`. |
| CodeRabbit: ~6× "screen uses `useState` → violates Horizon contract" (IdeasScreen, PlanScreen, SomedayScreen, JourneyScreen) | **False positives** | Local UI state (toggle open, hover, dismissed-signal ids, file refs) is not a rule-10 breach. Rule 10 forbids **financial math** on model values, not all state. |
| CodeRabbit: ~4× formatter/`bar-width` division "is financial math" (`shared.jsx` fmt/fmtMo, FlowConn, WaterfallStep, TaxTimeline) | **False positives** | `/12`, `/1e6` display-unit formatting and `value/max*100` pixel layout are not value transformations. |
| CodeRabbit: `conversion-planning.js:50` bracket-rate keys `12/22/24` hardcoded | **Cleared** | Keys are rate labels; the dollar tops are read by rate from config brackets. No constant duplicated. |
| CodeRabbit: `tax-basis.js:47` "FICA wrongly includes spouseIncome for non-MFJ" | **Likely false positive** | Contradicts rule 9 — FICA is **always** per-earner (`min(primary,base)+min(spouse,base)`), independent of filing status. CodeRabbit's "fix" would break the documented design. |

## Disputed — RE-REVIEWED 2026-06-16 (owner asked to re-validate; 2 of 4 were real)
| Finding | Outcome |
|---|---|
| Gemini: Roth IRA phase-out "penalizes contributions instead of capping the limit" (`simulation.js`) | **REAL → FIXED.** The first pass checked the *direction* (correct) but not the in-band *formula*: it scaled the desired amount by the phase-out fraction instead of reducing the limit and taking `min(desired, reduced limit)`. Under-counted Roth for below-max contributors in the band. Fix applied + regression test; golden master moved deliberately (retRoth/totalAtRet/spendableAtRet/withdrawalRate). |
| Gemini: FICA understates Medicare for high earners (Medicare is uncapped) | **REAL → FIXED.** Medicare (1.45%) is genuinely uncapped, plus a 0.9% surtax above $200k/$250k; the model capped the whole 7.65% at the SS wage base. Split into SS+Medicare+Additional Medicare with new config constants + high-earner test. Value-preserving at the default ($100k), so golden master unaffected; two tests that had locked the capped high-earner value were corrected. |
| Gemini: SS benefit boundary outside 62–70 | **Dismissal holds → HARDENED anyway.** The `calcBenefit` FRA fallback is wrong logic but unreachable (slider clamps claiming age to 62–70, table covers 62–70). Changed no current output; now clamps to the nearest boundary so a future out-of-range call is correct-by-construction. |
| CodeRabbit: `MoneyEventsPanel:59` `ev.amount \|\| ""` collapses a legit 0 | **Dismissal holds — not a bug.** For a money-event amount, `0` = "nothing entered," so the placeholder is the intended empty state; `?? ""` would render a meaningless $0 row. `onChange` already floors at `Math.max(0, …)`. |

## Known / intentional — correctly NOT re-filed
Claude verified all four are present and accurately documented in `docs/BUGS.md`; **do not re-file**:
**BUG-36** (what-if/optimizer use the blended walk for deltas), **BUG-37** (engine ignores `conversionTaxSource`),
**BUG-38** (no base tax on the SS/pension floor), **BUG-39** (Flow-Down accumulation growth is a residual plug).
The conversion optimizer reading 4 of 10 `evaluateConversionPlan` fields is the documented non-bug.

## Invariants verified clean (Claude)
One-walk / gross-seeded / taxed-once (rule 2/2b/3) holds; per-year `netPortfolioNeed` + SS/pension age-gating (rule 5b)
correct everywhere; MFJ combined income + per-earner FICA (rules 4/9); model layer is pure (rule 6); `horizonProps` and
all sub-bundles memoized with honest deps and enforced by `horizon-props-stability.test.js` (rule/BUG-22, V9); no screen
reads a field App doesn't provide; the historical `totalAtRet × 0.92` fake-number class is gone (WI-0.1 landed).

---

# Second pass — re-synced PRs, triaged 2026-06-23

After the first-pass fixes, the three layer PRs (#34/#35/#36) were re-synced to HEAD and the bots
re-ran (commits `341bee3`/`309e4e2`/`d4026e3`). Those second-pass findings sat un-triaged until now.
Re-triaged against the **current branch HEAD** (which also carries this session's full IRS/SSA/state
constants correction). Headline: **most genuinely-valid bugs were already fixed on the branch**; the
remainder was a short tail of correctness + defensive items, and again ~half the bot volume was noise.

**Already fixed before this triage** (re-flagged but resolved): catch-up off-by-one, Roth phase-out
limit-scaling, ACA cliff `>=`→`>`, both roth-conversion guards, withdrawal-order LTCG floor, the
NumbersScreen rule-10 tax-percentage math, the action-cards flat-match guard + hardcoded ages,
accumulation NaN guard — plus this session's `fvAnnuity` negative-rate fix and the shared
`claimFactor()` SS clamp (the "spouseClaimingAge rounding" finding).

**Fixed in this triage** (all inert at the default → golden master unchanged; suite 478 → 481):
- *Model (correctness):* `optimization.js` `optWR` now gates SS/pension by claim/start age (rule 5b;
  was understating the optimized withdrawal rate) + `yearsToRet` `Math.max(1→0)`; `taxes.js`
  `marginalRate` returns 0 below the standard deduction (was the 10% bracket — corrected the test that
  locked it); `simulation.js` spouse income plateaus at `incomeGrowthEndAge` like the primary.
- *Model (defensive):* negative-input clamp (`employer-match.js`), `personOnMedicare` finite-guard
  (`healthcare.js`), bracket-fill `Number.isFinite` guard (`conversion-planning.js`), monthly `?? 0`
  guards (`budget.js`), safe param defaults (`tax-basis.js`, `money-events.js`).
- *View:* removed the fabricated "9 in 10 markets" probability from `ArcGraph.jsx` (rule 6 — the cone
  is illustrative, no Monte Carlo); hardened `formatters.js` for negative/non-finite inputs; file
  type/size validation in `SomedayScreen.jsx`.

**Resolved — owner decision (2026-06-23): switched to AGI-net.**
- **Roth-MAGI basis** (`tax-basis.js` + `simulation.js`) — the Roth phase-out tested **gross** income,
  not AGI (which nets out pre-tax 401k/HSA), phasing heavy savers out of Roth earlier than the IRS
  would. Owner chose the AGI-net basis. `tax-basis.js` `rothMAGI` is now `agi` (which already encodes
  MFJ-combined vs primary-only, BUG-12); `simulation.js` hoists a shared `netOrdinaryIncome`
  (gross − 401k deferral − HSA) used by BOTH the Roth phase-out and the LTCG bracket, so they can't
  diverge. Deliberate golden-master move (re-locked): `retRoth` 587,692 → 659,072, `totalAtRet`
  → 4,035,855, `spendableAtRet` → 3,654,179, `withdrawalRate` → 1.42168 (trad-based RMD/conversion
  unaffected). Band phase-out tests set deductions to 0 (MAGI = gross) to keep their demonstration;
  BUG-12 test now asserts `rothMAGI === agi`.

**Resolved — minor polish (2026-06-23):**
- `NumbersScreen` footnote now shows the real `returnRate` assumption (threaded via `horizonProps`)
  instead of a hardcoded/mislabeled "5% real return" (rule 1/10).
- Keyboard-a11y: new shared `kbActivate()` helper; `StatCard` (Plan-screen stat cards) and the
  `SettingsScreen` palette/theme/arc selectors are now keyboard-activatable (role=button, tabIndex,
  Enter/Space, aria-pressed).
- `MoneyEventsPanel` age input clamps on blur (free typing on change).

**Still deferred — intentional (cosmetic, regression-risk-without-benefit; revisit post-merge):** the
micro-perf/structure nits only — hoisting the nested `Seg` component, moving one bottom-of-file
import to the top, and injecting Horizon fonts via CSS rather than during render. No correctness or
a11y impact; left out of the pre-merge batch deliberately.

**Not actionable:** `tax-basis.js` FICA "includes spouse for non-MFJ" (FALSE — rule 9, FICA is always
per-earner); `vite` `node`→`jsdom` (FALSE — `react-test-renderer` needs no DOM); the `useState` /
display-division / pixel-layout "rule-10" flags (cross-layer contract allows them). No new KNOWN
(BUG-36/37/38/39) re-files. Note: Gemini's GitHub reviewer is being sunset (new installs blocked
2026-06-18; activity ends 2026-07-17).
