# Horizon Depth Ladder — Roadmap

**Status:** approved Jun 12 2026 (owner). This is the build plan for closing the depth gap between the Classic (Legacy) dashboard and the Horizon shell, level by level, until Classic can be retired.
**Tracker:** every work item (WI) below has a `feature-tracker.html` entry — IDs **88–111**, section "Horizon Depth Ladder".
**Related docs:** `docs/HORIZON.md` (Horizon design system & shipped batches) · `docs/ARCHITECTURE.md` (model layer) · `docs/DESIGN.md` (Classic UI only).

---

## Why this plan exists

A business review (Jun 12 2026) compared the two UIs:

- **Classic** — 3 tabs, ~110 inputs, ~150 displayed metrics. Deep, correct, but unwieldy: everything is visible at once, so nothing is approachable.
- **Horizon** — 5 polished screens, mobile-ready, warm. But it surfaces only ~12 outputs and almost no inputs after onboarding — a beautiful surface over a model the user can't reach.

Diagnosis: an **information-architecture gap, not a codebase problem**. The pure-function model layer (`src/model/`, 307 tests, golden master) is shared by both UIs and is the asset. Decision: **continue Horizon — no rewrite — and build a deliberate "depth ladder" inside it**, then retire Classic once parity is audited.

The ladder: **Level 1 Glance** (am I on track?) → **Level 2 Understand** (where does every dollar go?) → **Level 3 Control** (change the plan, run strategies) → **Level 4 Retire Classic**.

---

## Design principles (binding on every WI)

Expanded Jun 12 2026 after a code audit of real Horizon incidents (wrong functions called, numbers shown that didn't apply to the situation). Each rule in group B is grounded in a specific incident — see the **Violations register** at the end of this doc for the live findings and WI-0.1/WI-0.2 for the cleanup.

### A. Product direction
1. **Every number is a door.** Any glance-level stat opens the screen that explains it. Disclosure tiers: headline → expandable card → full screen.
2. **Inputs live next to their outputs.** Controls sit on the screen showing their consequence (the SS claiming stepper lives on the SS timing screen, not in a settings wall).
3. **Education inline.** Classic's explainer boxes return as collapsible "Why this matters" notes in Horizon's voice.
4. **Model first, UI second.** Every new capability lands as a pure `src/model/` function with tests *before* any screen renders it. Screens are the last mile. This is also how Horizon stays ready for future data: when a feature ships its model function, the bundle shape is already defined and the screen work is purely presentational.
5. **Every Horizon PR advances a named work item.** Cite the WI / tracker ID in the PR description. No drive-by features that bypass the ladder — half-wired screens (inert steppers, fake overlays) came from exactly that.

### B. Data integrity — the wrong-number rules
6. **Screens format, never transform.** No `+ − × ÷` on model values in `src/horizon/`: no month↔year conversions, percentages, residuals, deltas, or age arithmetic. If a screen needs a derived number, it is added to the model (or an App.jsx memo calling the model) and passed **by name**. Formatting (`toLocaleString`, display rounding) and pure layout math (pixel positions, SVG scales) are fine. This sharpens the original "zero math in `src/horizon/`" rule — transformation is math even when it looks like display glue. *Incidents: the Statement waterfall residual, depletion age (`retirementAge + yearsSustained`), and the Plan progress % are all computed in JSX today, where no golden-master test can see them.*
7. **Real data or no data.** Never scale, approximate, or invent a number to fill a gap — render a designed empty state instead. Decorative fakes are allowed only when isolated in `Ghost*`-named components that never share a code path with real data (`GhostArc` is the compliant example). *Incident: the Ideas scenario stats row still shows hardcoded multipliers (`totalAtRet × 0.92`) while the arc beside it shows a real `calcWhatIfChart` run — two different answers on one screen.*
8. **Applicability travels with the data.** A number that only applies in some situations (SS after claim age, conversion window if one exists, spousal benefit if married, RMDs from age 73) is passed pre-gated by the model together with its applicability flag (the `hasConvWindow` / `ssAtRet` pattern). Screens never re-implement an eligibility condition — no age comparisons in JSX. *This is CLAUDE.md rule 5b's per-year-gating lesson applied to the UI; screen-side age gates exist today in the Numbers milestone logic.*
9. **Constants come from config — even in copy.** IRS values (RMD age, FRA, contribution limits) are imported from `src/config/irs-2026.js` wherever they appear, including display text. *Incident: `rmdAge = 73` hardcoded in NumbersScreen — the exact class CLAUDE.md rule 1 exists to prevent.*
10. **Missing data is not zero.** No bare `?? 0` / `?? 90` fallbacks that make absent data indistinguishable from real values. Every nullable/Infinity-capable field documents its edge values at the moment it's added to `horizonProps` (`yearsSustained: Infinity`, `depletionAge: null`, `ssBreakEven: null`, …), and screens render a designed state for them ("lasts beyond your plan", "not set up") rather than a defaulted number. A genuinely-zero value (no SS) is passed as an explicit 0 by the model, never synthesized by the screen.

### C. Forward compatibility — ready for data that doesn't exist yet
11. **Grow by named bundles; never repurpose a field.** `horizonProps` expands only as documented topic bundles (`ssView`, `rmdView`, `budget`, …) with shapes recorded in `docs/ARCHITECTURE.md` when added. Fields are added, never silently renamed or re-meant. One number = one prop: if a value appears on two screens it comes from the same field, so the screens can never disagree.
12. **Degrade by absence.** Screens render what exists and show a "Not set up — see what this could be worth" affordance for what doesn't, instead of crashing or zeros. Future features (spouse accounts #30, Monte Carlo, new income sources) then light up automatically when their bundle appears — no screen restructuring.

### D. Enforcement & ship gates — how the rules stay true without relying on memory
13. **Referential stability is correctness.** `horizonProps` and every bundle inside it are memoized with complete dependency arrays, and `react-hooks/exhaustive-deps` lint makes it machine-checked. *Incidents: the `commitPlan` missing-deps bug (Batch A); `horizonProps` is still rebuilt inline on every render today, defeating screen memos.*
14. **Tests gate the wiring.** Every new screen ships a render-smoke test at golden-master defaults; every displayed number that has a locked value gets a wiring assertion; hardcoded UI tables (`SCENARIOS`, `LIFE_EVENTS`) get value-locks so silent edits are caught. (Detailed in the Testing strategy section — listed here because it is the enforcement arm of principles 6–12.)
15. **Mobile parity is a ship gate**, not a follow-up (existing `isMobile = windowWidth < 640` pattern in `HorizonShell.jsx`).

## Target navigation (end state)

- Desktop top nav (7): **Plan · Journey · Ideas · Numbers · Strategies · Someday · Settings**
- Mobile bottom bar (5): **Plan · Journey · Ideas · Numbers · More** — "More" opens a slide-up sheet (Strategies / Someday / Settings).
- Implemented by extending the `SCREENS` array in `HorizonShell.jsx` and adding a `MoreSheet` for mobile once SCREENS > 5.
- New top-level screens: **Journey** (Level 2) and **Strategies** (Level 3). Numbers grows from 3 tabs to 6.

---

# Level 0 — Foundations (make the principles true before building on them)

A Jun 12 2026 code audit found the design principles above already violated in shipped Horizon code (full findings: **Violations register**, end of this doc). These two items clear the register and install the enforcement tooling, and run as the **first build batch** — building Levels 1–3 on top of unmemoized props and screen-side math would multiply the cleanup later.

### WI-0.1 (#110) Principles compliance pass
**Target:** the Violations register is empty; every number on a Horizon screen is a real, applicable model output.
**Actions:**
- Ideas scenario stats: replace the hardcoded multipliers (`SCENARIOS` `nestScale`/`incomeScale`, IdeasScreen.jsx:99–102) with the same real model run the arc already uses — derive the stat deltas from `calcWhatIfDelta`/`calcWhatIfChart` for the active scenario, so the stats row and the arc can never disagree (principle 7). **Owner note: the displayed scenario numbers will change** — they go from illustrative approximations to real model output. That is the point, but it is a visible change.
- `NumbersScreen.jsx:229`: `const rmdAge = 73` → import `RMD_START_AGE` from `src/config/irs-2026.js` (principle 9).
- Move screen-side math into App memos / model (principle 6): Statement waterfall residual + percentages + monthly conversions (NumbersScreen.jsx:158–174) → a `statementView` bundle; depletion age (`retirementAge + yearsSustained`, NumbersScreen.jsx:181) → pass `depletionAge` from `retirementWalk` (already computed); Plan progress % (PlanScreen.jsx:21) → a `planView` field with the Infinity guard in the model; Numbers milestone detection (NumbersScreen.jsx:216–230) → reuse `calcMilestones` (`accumulation.js`) instead of the screen's re-implementation.
- Replace bare fallbacks (`lifeExpect ?? 90`, `?? 0` on tax/income fields, scenario `?? 1`) with explicit edge-state rendering per principle 10.
- Name and document the ArcGraph uncertainty-cone asymmetry factor (`0.92`, ArcGraph.jsx:407) as a constant with a comment stating it is illustrative.
**Done when:** a review grep of `src/horizon/` finds no arithmetic on model values outside layout code; scenario stats equal the arc's model run for the same scenario; `npm test` green (golden master untouched — display-path only; the scenario-stat change is UI-local and deliberate).

### WI-0.2 (#111) Enforcement tooling
**Target:** the principles are machine-checked, not memory-checked.
**Actions:**
- Memoize `horizonProps` and the `whatIfBundle` in App.jsx with complete dependency arrays (today both are rebuilt inline every render — App.jsx:611–638 — which defeats every screen `useMemo` that lists them as deps; same bug class as the fixed `commitPlan` missing-deps incident).
- Add ESLint (flat config) with `react-hooks/rules-of-hooks` + `react-hooks/exhaustive-deps`; wire `npm run lint`; fix whatever it surfaces.
- Value-lock tests for the `SCENARIOS` and `LIFE_EVENTS` arrays (IdeasScreen) so silent edits to preset amounts/ages are caught (principle 14).
**Done when:** lint runs clean; a render-count smoke test shows `horizonProps` referentially stable across a no-op re-render; full suite green.

**Level 0 exit gate:** Violations register fully dispositioned; lint in place; only then does the L1 batch start.

---

# Level 1 — Glance (close the loop on Plan)

### WI-1.1 (#88) Tappable stat cards + on-track explainer
**Target:** every number on PlanScreen navigates to or explains its source.
**Actions:**
- `HorizonShell.jsx`: lift navigation into a callback `navigate(screenId, subView?)` passed to all screens alongside `t`/`props`; `NumbersScreen` accepts an optional `initialTab`.
- `PlanScreen.jsx`: wire the 4 stat cards — "You keep /mo" → Numbers/Statement; "Retire at" → Ideas (dial panel); "Income for life" → Numbers/Statement (income-for-life column); "Left at 90" → Numbers/Year by year.
- On-track pill: tap opens a popover listing the 3 drivers, all from existing props — `withdrawalRate` vs 4%, `yearsSustained` vs `lifeExpect − retirementAge`, savings rate (`currentContribTotal / takeHome`) — one plain-language line each.
**Done when:** 4 cards + pill all navigate/explain (manual checklist); tap targets ≥ 44px on mobile; review confirms zero new math in screens.

### WI-1.2 (#89) Signals strip
**Target:** ≤ 2 severity-ranked, dollar-quantified nudges on Plan, each deep-linking into depth screens. (Classic's Flow-Down action cards reborn as the front door to depth.)
**Actions:**
- New pure module `src/model/signals.js`: `calcSignals({...})` → sorted `[{ id, title, body, dollars, target: {screen, subView} }]`. Launch set of 3: unclaimed employer match (headroom via `calcOptimizedAllocation`'s `extraMatch`, budget.js), conversion benefit > $5k (`adjustedNetConversionBenefit` from `evaluateConversionPlan`), budget deficit (`availableSurplus < 0` from `calcSavingsCapacity`).
- App.jsx computes signals in a memo and passes `signals` via `horizonProps`. `PlanScreen` renders a `SignalsStrip` (hard cap 2, ranked by dollars); dismiss persists via `safeSet("hz-signal-dismissed-<id>")`.
**Done when:** unit tests in `src/model/__tests__/signals.test.js` cover ranking, thresholds, and the cap; dismiss survives reload (manual).

### WI-1.3 (#90) Money-event markers on the arc
**Target:** committed `moneyEvents` are visible on the arc.
**Actions:** `ArcGraph.jsx` gains optional `events` prop (`[{age, label, isInflow}]`); reuse the existing age→x scale (fixed 30–90 axis), interpolate y from `chartData`; render small dots (good-token inflow / warm-token outflow) with desktop hover labels. `PlanScreen`/`IdeasScreen` pass `props.moneyEvents`.
**Done when:** `events=[]` renders pixel-identical to today; 2 events → 2 dots at correct ages; works at minimum in Arc view.

**Level 1 exit gate:** a first-time user can answer "am I on track, and what's my #1 lever?" from Plan alone in ~10 seconds; every Plan number is tappable; `npm test` green with new signals tests.

---

# Level 2 — Understand (Journey screen + Numbers 3→6 tabs, read-only)

### WI-2.1 (#91) Journey screen — the Flow-Down port
**Target:** all ~20 Flow-Down metrics visible in Horizon as a 3-chapter story.
**Actions:**
- Add `{id:"journey"}` to `SCREENS` (position 2); new `src/horizon/screens/JourneyScreen.jsx`. With SCREENS > 5, implement the mobile **MoreSheet** (Plan/Journey/Ideas/Numbers/More).
- App.jsx already computes `calcFlowDown` (flow-down.js) for Classic; pass its full result as `horizonProps.flowDown`, plus `conversionWindowYrs` and `rmdStartAge`.
- Chapters (editorial style — one bold number per block, proportion bars, collapsible detail):
  1. *Today* — `startPortfolio` + income/tax/savings snapshot (reuse Statement fields).
  2. *Building years* — `totalContrib`, `totalGrowth`, `peakPortfolio`, `totalAtRet`; conversion-window callout when `hasConvWindow` (`portPreRMD`, `convWindowDraws/Tax/Growth`, `totalConverted`).
  3. *Retirement years* — `distStartVal`, `distDraws`, `distRMDTax`, `distGrowth`, `distEndVal`, `depletionAge`/`actualSustainedYrs`; income-floor strip (`householdSS`, `effectivePension`).
- Connectors carry handoff numbers ("$X at retirement → entering RMDs with $Y"). Chapter-end action notes deep-link to Strategies (stubbed until Level 3). Desktop: vertical scroll; mobile: swipeable chapters.
**Done when:** every `calcFlowDown` output field is rendered (parity checklist); render-smoke test mounts JourneyScreen with golden-master-default props; review confirms all numbers come from `flowDown` — no recomputation.

### WI-2.2 (#92) Numbers → Budget tab
**Target:** Classic's savings waterfall in Horizon.
**Actions:** pass `horizonProps.budget = { grossAfterTax, effectiveLiving, savingsCapacity, currentContribTotal, availableSurplus, optimizedAllocation }` (from `calcSavingsCapacity` + `calcOptimizedAllocation`, budget.js — both already called in App). New tab: waterfall rows (income after tax → expenses → capacity → contributions → surplus), deficit warning state, read-only allocation suggestion (① match → ⑤ taxable). The Apply button arrives in WI-3.7.
**Done when:** every figure equals Classic's Budget panel at the same state (cross-check at default); smoke test with golden-master props.

### WI-2.3 (#93) Numbers → Accounts tab
**Target:** 4-bucket comparison + milestones in Horizon.
**Actions:** pass `horizonProps.milestones` (`calcMilestones`, accumulation.js) and `retirementTarget`. Tab renders ranked account bars from `retVals` (% of `totalAtRet`), per-account contribution notes, milestone pills with %-of-goal coloring.
**Done when:** bars sum to `totalAtRet`; milestones identical to Classic's; smoke test.

### WI-2.4 (#94) Numbers → Taxes tab
**Target:** phase tax rates + lifetime tax composition visible.
**Actions:** pass `horizonProps.taxView = { fedMarginal, fedEffective, effectiveRMDTaxRate, projectedRetBracket, rmdTaxBite, convTaxTotal }` (all computed today: tax-basis.js, `calcRMDTaxSchedule`, `projectRetirementBracket`, conversion sim totals). Tab renders a 2-segment working/retirement timeline (Classic TaxTimeline restyled), current-bracket line, and a lifetime composition bar (working tax vs RMD tax vs conversion tax).
**Done when:** rates equal Classic's phase cards at the same state; no new math (review).

### WI-2.5 (#95) Year by year: accumulation rows + RMD/Conversion columns
**Target:** the table covers the whole life, with tax drivers visible.
**Actions:** prepend accumulation rows from `simData` (age, year, total via `sumAccountRow`, contributions). Do **not** derive a growth residual in UI — if per-year growth is wanted, add it to `runSimulation` rows in `src/model/simulation.js` first and lock it with a test. Add RMD and Conversion columns for retirement rows: pass `horizonProps.rmdDataWithTax` (from `calcRMDTaxSchedule`) and conversion-year rows (from `evaluateConversionPlan().conversionSim`); join by age. Highlight milestone rows.
**Done when:** existing retirement rows are unchanged; RMD column matches Classic's RMD table (first 10 rows); review confirms no residual-plug computation in JSX.

### WI-2.6 (#96) Retirement-phase money flow
**Target:** "where retirement income comes from" Sankey beside the paycheck one.
**Actions:** pass `horizonProps.effectivePension` and `netPortfolioNeed` (`calcNetPortfolioNeed`, drawdown.js). Money-flow tab gets a Working years / Retirement years toggle; retirement view shows Expenses ← Social Security + Pension + Portfolio draw in the same band style as `IncomeSankey`.
**Done when:** bands sum exactly to `effectiveExpenses`; matches Classic's "Portfolio Needs Breakdown" at the same state.

### WI-2.7 (#97) Arc tap-to-scrub
**Target:** touch a year on the arc → see that year's numbers.
**Actions:** `ArcGraph.jsx`: pointer/touch handlers on the SVG; inverse-scale x→age; nearest `chartData` point; floating chip shows age + total, plus draw/growth/tax when a matching `retirementWalk.rows` entry exists (pass `walkRows` as an optional prop). Desktop hover, mobile touch-drag.
**Done when:** chip values equal the Year-by-year table for the same age (spot-check 3 ages); uses only existing series (review).

**Level 2 exit gate:** a user can trace every dollar through every life stage without opening Classic — Flow-Down (~20 metrics), budget waterfall, account comparison, phase tax rates, and per-year RMD/conversion detail all live in Horizon; zero math added to `src/horizon/`; all new tabs render on mobile; `npm test` green.

---

# Level 3 — Control (inputs + Strategies screen)

### WI-3.1 (#98) Setter bundles — the plumbing for all Level-3 work
**Target:** Horizon can write every Classic input to shared App.jsx state.
**Actions:** extend `horizonProps` with topic-grouped bundles of existing state + setters (names verified in App.jsx):
- `profile`: `currentIncome / incomeGrowth / incomeGrowthEndAge / spouseIncome / spouseIncomeGrowth / filingStatus / selectedState / stateRateOverride / otherPreTaxDeduc` + setters
- `spending`: `livingExpenses / livingExpenseGrowth / annualExpenses / retirementTarget` + setters
- `accounts`: the 4 × (`bal` / `contrib` / `contribEnd`) sets + `addlPreTaxBal`; `matchMode / employerMatchPct / matchFormulaRate / matchFormulaCap`
- `ss`: `includeSS / ssClaimingAge / ssOverride / isMarried / spouseSsEstimate / spouseClaimingAge / spouseBenefitBasis / spouseCurrentAge / spouseIsSoleBenef`
- `pension`: `pensionMonthly / pensionStartAge`
- `conversion`: `conversionMode / conversionBracketTarget / annualConversionAmt / conversionTaxSource`
- `health`: `hasMarketplaceInsurance / householdSize / marketplaceMonthlyPremium / hasMedicare / personOnMedicare`
- `assumptions`: `returnRate / inflationRate / lifeExpect / retirementState / savingsSurplusPct`
Copy each input's min/max/step constraints verbatim from the Classic JSX (e.g., the SS claim-age floor at `currentAge` — BUG-17 guard). Document the bundle shapes in `docs/ARCHITECTURE.md`.
**Done when:** a value changed in Horizon is immediately reflected in Classic (manual round-trip on 3 representative fields); render-smoke test mounts HorizonShell with bundles and fires one setter per bundle without crashing.

### WI-3.2 (#99) Settings split → "My details" + "Appearance"
**Target:** all profile-level Classic inputs reachable in Horizon, calm by default.
**Actions:** `SettingsScreen.jsx` gets two sub-tabs. *Appearance* keeps palette/theme/arc-style/activity/replay-onboarding. *My details* renders collapsed topic cards (income & job, spending, accounts & match, health & Medicare, assumptions) — each closed card shows a one-line summary ("$100k, growing 3%/yr"); expanded cards use the onboarding stepper/preset pattern on mobile, sliders on desktop. Inline "Why this matters" notes ported from Classic explainer text.
**Done when:** every input in the `profile/spending/accounts/health/assumptions` bundles has exactly one home here (checklist); summaries accurate; usable on mobile.

### WI-3.3 (#100) Strategies screen scaffold
**Target:** a card grid where each strategy shows its dollar stakes and opens a guided flow.
**Actions:** add `{id:"strategies"}` to `SCREENS`; new `src/horizon/screens/StrategiesScreen.jsx` with a card grid + detail-flow container (back button). Cards + status lines, all from existing props: Roth conversion ("est. net benefit $X after healthcare"), RMD outlook ("first RMD $X at 73"), SS timing ("claiming at X → $Y/mo"), Withdrawal order ("saves $X in year-1 tax"), Surplus deployment ("$X/yr unallocated"), Mega backdoor ("up to $X after-tax space"). Unconfigured cards show "Not set up — see what this could be worth" (the future premium gating surface for #29/#30/#31).
**Done when:** renders at golden-master defaults with correct headline dollars on every card; smoke test.

### WI-3.4 (#101) Social Security timing flow (incl. spouse)
**Target:** the full Classic SS section, interactive, in Horizon.
**Actions:** pass `horizonProps.ssView` from `calcRetirementIncome` + `calcSSBreakEven` + `calcSSDelayGain` outputs (already computed in App): `ssMonthlyBenefit, ssAnnualBenefit, ss67Monthly, ssBreakEven, ss70Annual, ss70DrawReduction, delayGainYears, spouseSsBenefit, spouseAlt, spouseAltHigher, householdSS`. Flow: include toggle, claim-age stepper (62–70, min `currentAge`), override input, benefit stats, break-even line, delay-to-70 impact box; married section with basis toggle ("own" vs "spousal"), `spouseClaimingAge`, and the advisory note when `spouseAltHigher`. Writes via the `ss` bundle.
**Done when:** every displayed value equals Classic's SS + Spouse SS sections at the same state (cross-check at default and one delayed-claim state); changes round-trip to Classic.

### WI-3.5 (#102) RMD outlook flow
**Target:** Classic's RMD section in Horizon.
**Actions:** pass `horizonProps.rmdView = { rmdDataWithTax, rmdTaxBite, effectiveRMDTaxRate, firstRMD, lifetimeRMDTotal }` (from `calcRMDTaxSchedule`; the two aggregates computed in the model/App memo, not JSX). Flow: explainer note; table-selection controls (`isMarried`, `spouseIsSoleBenef`, `spouseCurrentAge` with the Table-II ≥10-year-gap note); `addlPreTaxBal` input; 3 stat cards; first-10-years table.
**Done when:** equals Classic's RMD section at the same state; the Table II/III switch changes the schedule identically in both UIs.

### WI-3.6 (#103) Roth conversion planner flow
**Target:** the full conversion pipeline — Classic's deepest feature — interactive in Horizon.
**Actions:** pass `horizonProps.conversionView` = the display path's `evaluateConversionPlan` result (`conversionSim, rmdDataPostConversion, rmdTaxSaved, netConversionBenefit, irmaaCost, acaLoss, cliffYears, adjustedNetConversionBenefit`) + `calcBracketFillTargets` outputs (`convSteadyTarget/convPeakTarget/targetsVary`) + the existing optimizer suggestion. Flow sections: window summary; mode toggle (bracket 12/22/24 vs custom amount); tax-source toggle; outcome cards (conversion, tax cost, RMD tax saved, net); healthcare impact (ACA cliff years, IRMAA cost, adjusted net); year-by-year conversion table + RMD before/after; **optimizer suggestion with Apply** (sets `annualConversionAmt` + `conversionMode="custom"` through the WI-3.9 preview modal).
**Done when:** all values equal Classic's conversion section at the same state (incl. the locked default `netConversionBenefit` = 77,861 path); Apply round-trips and the suggestion clears once applied.

### WI-3.7 (#104) Withdrawal order, Surplus deployment, Mega backdoor flows
**Target:** the remaining three Classic strategy sections in Horizon.
**Actions:**
- *Withdrawal order* (read-only): render `calcWithdrawalOrderTax` fields (`yr1FromTaxable/Trad/Roth, yr1TaxOptimal, yr1TaxWorstCase, yr1TaxSavings`) as the ordered sequence + savings card.
- *Surplus deployment*: `calcOptimizedAllocation` outputs + `savingsSurplusPct` stepper + **Apply/Revert** — extract Classic's existing apply handler (writes `opt401k/optRoth/optHSA/optTaxable` into contributions, snapshots into `preApplySnapshot`) into `applyAllocation`/`revertAllocation` callbacks passed via `horizonProps`, so both UIs share one implementation.
- *Mega backdoor*: match-mode inputs (via the `accounts` bundle) + 415(c) capacity stats + `calcMegaBackdoorGrowth` projections.
**Done when:** parity with the three Classic sections; Apply in Horizon → Classic shows the same applied/revert state (shared mechanism); revert restores the snapshot exactly.

### WI-3.8 (#105) Ideas growth: events editor + affordability mode
**Target:** full money-event control and "biggest affordable expense" in Horizon.
**Actions:**
- Events editor: Horizon-styled equivalent of `MoneyEventsPanel` (max 6 events; label/amount/age/inflow-outflow/taxable/delete) using `moneyEvents`/`setMoneyEvents` already in props — same state, no new mechanism.
- Affordability: new Ideas panel calling `calcAffordabilityMax` (what-if.js — currently unused by Horizon) with the existing `whatIfSimInputs` bundle; purchase-age + target-age steppers; result sentence ("You could spend up to $X at age Y and still last to Z").
**Done when:** an event added in Horizon appears in Classic's panel and moves the arc; affordability result equals Classic `WhatIfPanel`'s for identical inputs.

### WI-3.9 (#106) Apply-with-preview pattern
**Target:** no Apply button changes headline numbers without showing the consequence first.
**Actions:** shared `src/horizon/ApplyPreviewModal.jsx` wrapping `ConfirmModal`: given an override, computes before/after via `calcWhatIfDelta`/`calcWhatIfChart` (years sustained, balance at 90) and renders the delta; commit only on confirm. Used by every Apply in WI-3.6/3.7 and by `commitPlan` call sites.
**Done when:** all Strategies Apply buttons route through it (review checklist); a cancel leaves state untouched (smoke test asserts no setter called).

**Level 3 exit gate:** the complete Classic plan — spouse, SS timing, pension, RMD settings, conversion plan with healthcare costs, mega backdoor, withdrawal order, money events — can be built end-to-end in Horizon without opening Classic; every Classic input has exactly one Horizon home (parity checklist); all optimizer suggestions applyable with preview; `npm test` green including new smoke tests.

---

# Level 4 — Retire Classic

### WI-4.1 (#107) Parity audit checklist
**Actions:** complete the seed table below — every Classic input/output → its Horizon home (WI reference) or an explicit disposition *port / merge / drop (reason)*. Owner reviews each "drop". Nothing disappears silently.
**Done when:** 100% of rows dispositioned; zero "TBD".

### WI-4.2 (#108) Classic demotion
**Actions:** move the "Classic view" button from Horizon's top nav into Settings → About ("Legacy view"); Classic keeps its return button. Owner runs an agreed Horizon-only trial period (e.g., 2 weeks).
**Done when:** the trial completes without reaching for Classic; anything reached for gets a WI before proceeding.

### WI-4.3 (#109) Classic removal
**Actions:** one dedicated PR deleting the Classic tab JSX from App.jsx and Classic-only components; `src/model/` untouched; `docs/DESIGN.md` archived with a header note.
**Done when:** `npm test` green (golden master unmoved); production build succeeds; the PR is cleanly revertible.

---

## Parity audit checklist — seed (completed at WI-4.1)

| Classic surface | Planned Horizon home | WI |
|---|---|---|
| Headline stats (take-home, total at retirement, years sustained, withdrawal rate) | Plan stat cards + pill (shipped) | — |
| Income & job inputs (income, growth, plateau, spouse income, filing status, state) | Settings → My details | 3.2 |
| Spending inputs (living expenses + growth, retirement expenses, target) | Settings → My details | 3.2 |
| Account inputs (4 × balance/contribution/end-age) + employer match | Settings → My details | 3.2 |
| Assumptions (return, inflation, life expectancy, retirement state) | Settings → My details | 3.2 |
| Budget savings waterfall + deficit warning | Numbers → Budget | 2.2 |
| Optimized allocation suggestion + Apply/Revert | Numbers → Budget (view) · Strategies → Surplus (apply) | 2.2 / 3.7 |
| Account comparison at retirement + milestones | Numbers → Accounts | 2.3 |
| Tax phase timeline, brackets, effective/marginal rates | Numbers → Taxes | 2.4 |
| Year-by-year projection table | Numbers → Year by year (extended) | 2.5 |
| Working-year income flow | Numbers → Money flow (shipped) | — |
| Portfolio needs breakdown (retirement income sources) | Numbers → Money flow, retirement view | 2.6 |
| Drawdown chart | Arc (shipped) + tap-to-scrub | 2.7 |
| Flow-Down waterfall (3 phases, ~20 metrics, action cards) | Journey | 2.1 |
| SS section (claim age, override, benefit, break-even, delay-to-70) | Strategies → SS timing | 3.4 |
| Spouse SS (estimate, claim age, basis toggle, advisory) | Strategies → SS timing | 3.4 |
| Pension inputs | Strategies → SS timing (income card) | 3.4 |
| RMD section (table selection, outside balances, schedule, tax) | Strategies → RMD outlook | 3.5 |
| Roth conversion section (mode, bracket fill, tax source, sim, net benefit) | Strategies → Conversion planner | 3.6 |
| ACA cliff + IRMAA exposure | Strategies → Conversion planner (healthcare impact) | 3.6 |
| Healthcare inputs (marketplace, household size, premium, Medicare persons) | Settings → My details + Conversion flow | 3.2 / 3.6 |
| Conversion optimizer suggestion | Signals strip + Conversion planner Apply | 1.2 / 3.6 |
| Withdrawal order (taxable→trad→Roth, year-1 tax savings) | Strategies → Withdrawal order | 3.7 |
| Mega backdoor calculator | Strategies → Mega backdoor | 3.7 |
| Money events panel (6 events) | Ideas → events editor | 3.8 |
| What-if overlay: scenario delta mode | Ideas (shipped: dials, scenario cards) | — |
| What-if overlay: max-affordable mode | Ideas → affordability | 3.8 |
| Explainer/education boxes | Inline "Why this matters" notes across all WIs | all |
| Action cards (Flow-Down) | Signals strip + Journey chapter ends | 1.2 / 2.1 |

Rows not covered by a WI by the time Level 3 ships get an explicit *merge* or *drop (reason)* entry here before WI-4.2 starts.

---

## Testing strategy (cross-cutting)

- **Render-smoke tests** (new, vitest): each new screen/tab mounts with golden-master-default props without crashing — one file per screen in `src/horizon/__tests__/`, pattern established in WI-2.1.
- **Value-lock tests** where a screen displays an already-locked model number (e.g., `netConversionBenefit` 77,861; `rmdTaxBite` 683,974) — assert the prop wiring passes the same value.
- **Anti-divergence rule:** never re-derive in UI. If a per-year/derived number is needed, add it to the model function and lock it there first (see WI-2.5's growth column).
- Test count references in `CLAUDE.md` (rule 7 + Commands) updated every batch.

## Sequencing → PR batches (one reviewable PR each; level exit gates between levels)

1. **Docs batch** *(this one)*: `docs/ROADMAP.md` + `docs/HORIZON.md` link + tracker IDs 88–111.
2. **L0 (foundations):** WI-0.1 + WI-0.2 — clear the Violations register and install lint/memoization before any new screens are built.
3. **L1:** WI-1.1, 1.2, 1.3.
4. **L2a:** WI-2.1 (Journey + MoreSheet). **L2b:** WI-2.2–2.4 (Numbers tabs). **L2c:** WI-2.5–2.7.
5. **L3a:** WI-3.1 + 3.2 (plumbing + My details). **L3b:** WI-3.3–3.5. **L3c:** WI-3.6 + 3.9. **L3d:** WI-3.7 + 3.8.
6. **L4:** WI-4.1 → 4.2 → 4.3.

## Creative options explored (disposition record)

| Idea | Disposition |
|---|---|
| Tap-to-scrub arc | **Adopt** — WI-2.7 |
| Journey as its own top-level screen (vs folding into Numbers) | **Adopt** — it's the narrative spine; Numbers stays the data room (WI-2.1) |
| Signals/coach strip on Plan | **Adopt** — WI-1.2; grows with the Strategies catalogue |
| Strategies screen as premium surface | **Adopt** — WI-3.3; prerequisite for premium tier #29/#30/#31 |
| Retirement-phase money-flow Sankey | **Adopt** — WI-2.6 |
| Affordability mode in Ideas | **Adopt** — WI-3.8 (model fn already exists) |
| Printable/PDF "Horizon Statement" | **Defer** — Statement tab is the basis; `WhatIfPanel`'s `window.print()` shows the path; good premium add-on later |
| Plan A vs Plan B side-by-side comparison | **Defer** — `calcWhatIfChart` makes it cheap later; Ideas overlays cover most of it today |
| Monte Carlo / probability of success | **Defer** — already on the backlog; the Scenarios arc view (uncertainty cone) is its placeholder |
| Account import (Plaid etc.) | **Defer** — per `docs/INTEGRATIONS.md`, post-launch |
| Gamified badges/streaks | **Reject** — tone clash with Horizon's calm, premium voice; arc milestones give the same payoff |
| AI chat advisor | **Reject for now** — scope and compliance risk; revisit post-launch |

---

## Violations register (audit Jun 12 2026)

Findings from the code audit that motivated the expanded design principles. **WI-0.1 (#110)** clears the table; **WI-0.2 (#111)** installs the tooling that keeps it clear. Future audits append here rather than starting a new list. Past incidents already fixed before this audit, kept for the record: `calcWhatIfChart` dropped permanent `moneyEvents` from scenario runs (fixed, `what-if.js:180` merge); `commitPlan` had an incomplete `useCallback` deps array (fixed, `App.jsx:602–607`); the original Ideas arc overlay was a `chartData × scale` approximation (replaced by real `calcWhatIfChart` runs in Batch B).

| # | Location | Finding | Principle | Owner |
|---|---|---|---|---|
| V1 | `IdeasScreen.jsx:99–102` + `SCENARIOS` config (lines 12–19) | Scenario stats row multiplies `totalAtRet`/`balAt90`/`effectiveExpenses` by hardcoded factors (0.92/0.82/1.10, 0.90/0.80) while the arc shows a real model run — two answers on one screen | 7 | WI-0.1 |
| V2 | `NumbersScreen.jsx:229` | `const rmdAge = 73` hardcoded; must import `RMD_START_AGE` from `src/config/irs-2026.js` | 9 | WI-0.1 |
| V3 | `NumbersScreen.jsx:158–174` | Statement waterfall residual, three percentages, and month conversions computed in JSX | 6 | WI-0.1 |
| V4 | `NumbersScreen.jsx:181` | Depletion age derived in screen (`retirementAge + yearsSustained`); `retirementWalk.depletionAge` already exists | 6 | WI-0.1 |
| V5 | `NumbersScreen.jsx:216–230` | Milestone detection (First $1M, peak, RMD age gates) re-implemented in screen; `calcMilestones` (`accumulation.js`) already exists | 6, 8 | WI-0.1 |
| V6 | `PlanScreen.jsx:21` | Progress % computed in screen, dividing by `lifeExpect − retirementAge` with `yearsSustained` potentially `Infinity` | 6, 10 | WI-0.1 |
| V7 | `NumbersScreen.jsx` (~10 sites), `IdeasScreen.jsx:100–102` | Bare fallbacks (`?? 0` on tax/income/balances, `lifeExpect ?? 90`, scenario scale `?? 1`) make missing data indistinguishable from real values; a broken scenario config silently renders as "no change" | 10 | WI-0.1 |
| V8 | `ArcGraph.jsx:407` | Undocumented `0.92` asymmetry factor in the uncertainty cone | 7 (document as illustrative) | WI-0.1 |
| V9 | `App.jsx:611–638` | `horizonProps` + `whatIfBundle` rebuilt inline every render — not memoized; defeats screen memos (same class as the fixed `commitPlan` bug) | 13 | WI-0.2 |
| V10 | repo root | No ESLint config — `react-hooks/exhaustive-deps` never runs, so deps-array bugs are caught only by hand | 13 | WI-0.2 |
| V11 | `IdeasScreen.jsx` (`SCENARIOS`, `LIFE_EVENTS`) | Hardcoded preset tables have no value-lock tests; silent edits go unnoticed | 14 | WI-0.2 |

Compliant by design (no action): `GhostArc` (`ArcGraph.jsx:461–502`) — hardcoded decorative anchor data, but isolated in a `Ghost*`-named component that never touches real user data; this is the pattern principle 7 codifies.
