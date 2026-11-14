# Opus deep review — branch `claude/oversight-root-cause-audit` (2026-11-14)

Independent adversarial review of BUG-151..BUG-166 (BUG-154 held on `ce5c4c0`).
Findings are appended the moment they are verified. CONFIRMED = executed repro with printed
numbers; PLAUSIBLE = code-read only.

## Findings

### R-1 — MEDIUM — CONFIRMED — Classic "Retirement Age" slider bypasses BUG-155's plateau coupling; the two UIs now build different plans from the same moves
- **Where:** `src/App.jsx:3504-3511` (Classic slider's inline `onChange`) vs `setRetirementAgeCoupled` (`src/App.jsx:1381-1393`).
- **Repro** (probe `zz-rev-a.test.js` A3, real App; Classic driven by calling the rendered `<Slider label="Retirement Age">`'s `onChange`): plateau (`incomeGrowthEndAge`) 55, then retirement 65 -> 50 -> 65.
  - Horizon setters: mid-state plateau `null`, 0 bound violations; end plateau `null`, `totalAtRet` 4,178,538, `yearsSustained` 22.642.
  - Classic slider: mid-state plateau **55 > max 50** (bounds violation); end plateau **55**, `totalAtRet` **4,116,477**, `yearsSustained` **22.272**.
  - Same household, same moves, $62,061 apart at retirement.
- **Why it matters:** BUG-155 says "`setRetirementAgeCoupled` keeps the plateau in range"; that is true only for Horizon and onboarding. The Classic handler is an inline copy of the coupling (contribEnd only), the exact "fix the instance, miss the class" pattern. `bounds-invariant.test.js` drives only the Horizon bundles, so it can't see it.
- **Second half (design, Horizon):** the coupling it *does* apply is lossy. The Horizon desktop slider calls `set` on every tick (`fields.jsx:201`), so dragging retirement down through the plateau age and back silently deletes the user's plateau (55 -> `null`), and the plan moves +$62k. Before BUG-155 the out-of-range plateau was inert (the audit called it "harmless"). The sibling `coupleContribEndAges` deliberately PRESERVES a value the user set away from retirement; the plateau rule destroys it.
- **Smallest fix:** route the Classic slider through `setRetirementAgeCoupled` (one handler, both UIs, as the Current Age slider already does). For the lossy half, stop nulling a plateau at/after retirement: it is already inert in `incomeGrowthSteps`, so keep the stored value and clamp only the bundle's displayed `value`/`max` (or widen `max` to `lifeExpect - 1`).

### R-2 — MEDIUM — CONFIRMED — Work-longer flow's "Social Security / yr" ignores a pinned `ssOverride` (a BUG-154 sibling that BUG-154 does not fix; pre-existing, not on this branch)
- **Where:** `src/model/what-if.js:1669-1674` (`calcWorkLongerBreakEven` → `ssAnnualAt` = `calcBenefit(calcPIA(calcAIME(...)))`, no override, no spouse); App passes `ssInputs: { currentIncome, incomeGrowth, incomeGrowthEndAge, ssClaimingAge }` only (`src/App.jsx:1659-1663`); rendered by `WorkLongerFlow.jsx:37-38`.
- **Repro** (probe `zz-rev-154.test.js`, real App, T-X.3 household: `ssOverride` 38,000 at claim 67): the plan's `householdSS` = **38,000**, but `workLongerView.rows` show SS **23,232 / 25,956 / 28,848** with deltas **+1,308 / +4,032 / +6,924 per year** for +1/+3/+5 years. Identical on HEAD+`ce5c4c0`, so BUG-154 does not reach it.
- **Why it matters:** a user who typed in their SSA-statement figure is shown a Social Security number about $15k/yr LOWER than the one they entered, and told that working longer raises it. Meanwhile the scenario that row describes keeps the pinned 38,000 (`scenarioSocialSecurity` → `calcRetirementIncome`, `effectiveSS = ssOverride`; BUG-150). It is also primary-only, while the plan's SS is household. This is BUG-154's exact class (a second SS derivation that doesn't honour the override): an instance was fixed, not the class.
- **Smallest fix:** derive `ssAnnual` per row from the scenario's own `calcRetirementIncome` (the same `scenarioSocialSecurity` the scenario uses), passing `ssOverride` / spouse inputs, and report `householdSS`. With an override pinned, the delta is honestly 0, or the row says the figure is pinned.

### R-3 — MEDIUM — CONFIRMED — `commitPlan` (onboarding) never bounds the retirement age it is given; BUG-153's "every field in range" holds only for the one input its test uses
- **Where:** `src/App.jsx:1403-1425` (`commitPlan`: `st = { ...st, ...coupleContribEndAges(...), retirementAge: ra }`, with no clamp of `ra` to `[currentAge, lifeExpect-1]`); the wizard clamps each answer independently (`HorizonShell.jsx:211-217` `OB_CLAMPS`: currentAge 18-80, retirementAge 40-90).
- **Repro** (probe `zz-rev-b.test.js` / `zz-rev-a.test.js` A1/A2, real App, `commitPlan` exactly as `handleSave` calls it):
  - `{currentAge: 70, retirementAge: 60}` → `retirementAge=60 < min 70` (bounds violation). Plan shows `planView.depletionAge` **63** ("money runs out at 63") for a **70-year-old**, `withdrawalRate` 36.4%, `retirementDuration` 30. The same household through the normal controls lifts retirement to 70 (`yearsSustained` 3.03 vs 2.75 via onboarding).
  - `{currentAge: 34, retirementAge: 90}` → `retirementAge=90 > max 89` and `lifeExpect=90 < min 91` (two violations); `retirementDuration` 1.
- **Why it matters:** onboarding is every new Horizon user's first screen, and "I'm 70 and retired at 60" is a realistic answer. BUG-153 was filed as "onboarding bypasses the coupling the normal controls apply"; this is the same class one field over. The new test (`onboarding-coupling-wiring.test.js`) and the `bounds-invariant.test.js` SEQS only use `retirementAge > currentAge`, so they can't see it.
- **Smallest fix:** in `commitPlan`, resolve `ra` against the coupled state before coupling (`ra = clamp(ra, ca ?? currentAge, st.lifeExpect - 1)`, or lift `lifeExpect` to `ra + 1`, as `coupleCurrentAge` does for age). Add `commitPlan(70, 60)` and `commitPlan(34, 90)` to `bounds-invariant.test.js` SEQS. Optionally make the wizard's retirement-age lower bound follow its age answer.

### R-4 — HIGH — CONFIRMED — The onboarding wizard pre-fills "monthly spend (today's dollars)" with a RETIREMENT-YEAR figure; clicking through untouched multiplies spending by 3.95x (pre-existing, not on this branch, missed by the BUG-152 onboarding audit)
- **Where:** `src/components/HorizonShell.jsx:654` (`monthlySpend: props.statementView.monthlyTotal`). Since BUG-91, `monthlyTotal` is `retSpendBasis / 12`, i.e. retirement-year dollars (`src/model/budget.js:223`). The question is captioned "today's dollars" (`HorizonShell.jsx:200`), and `commitPlan` writes `monthlySpend x 12` into `annualExpenses`, which is a today's-dollar input.
- **Repro** (probe `zz-rev-d.test.js`, driving the REAL wizard end to end like `onboarding-wizard-save.test.js`, with no answer changed):
  - Q5 shows **"$18,868"** under "today's dollars". The default household's real spend is $57,377/yr (= $4,781/mo; `statementView.monthlyTodaysExp` already exists for exactly this).
  - Summary shows "Monthly income $18,868/mo".
  - After "Yes, save my plan": `effectiveExpenses` 57,377 → **226,416**, `yearsSustained` 22.64 → **4.19**, depletion age 88 → **70**, `withdrawalRate` 5.42% → **21.38%**.
  - Same on `main` (21.65 → 4.02).
- **Second defect, same line:** even a user who *does* fix the number has their "auto" `annualExpenses` (null, follows income) frozen into a fixed value. After onboarding, raising income to $150k leaves spending at 226,416; without onboarding, auto spending follows to 92,265. That is the Lens-1 "seeded once" class.
- **Why it matters:** every new Horizon user goes through this wizard first. The default answer silently turns a plan that lasts to 88 into one that runs out at 70, and the screen labels the inflated number "today's dollars". Rule 11 names this exact class: a site reading a converted figure where the raw one is needed. It survived BUG-91, BUG-114, BUG-143/144 (which ADDED `monthlyTodaysExp` but didn't re-point this seed), and this audit's onboarding pass, which asked "does every answer land" but not "is every pre-filled answer on the right basis".
- **Smallest fix:** seed from the today's-dollar figure (`props.statementView.monthlyTodaysExp`, or a named onboarding-seed field from the model). Send `monthlySpend` from `handleSave` only when the user changed it, so `annualExpenses` stays `null` (auto) otherwise. Add a wizard test: completing it untouched leaves `effectiveExpenses` / `yearsSustained` unchanged (it fails today: 22.64 → 4.19).

### R-5 — LOW — CONFIRMED — Edge defects BUG-152 made consequential: `allocateSavedTotal` can return a negative balance, and the wizard's parser turns "250k" into $250
- **Where:** `src/model/accumulation.js:30-45` (residual added to `biggest`); `src/components/HorizonShell.jsx:244` (`parseInt(draft.replace(/[^0-9]/g, ""))`).
- **Repro** (probe `zz-rev-c.test.js` C2 + a node one-liner of the wizard's parse rule):
  - `allocateSavedTotal({1000,1000,1000,1000}, 0, 2)` → `{ bal401k: -1, balRoth: 1, balTaxable: 1, balHSA: 1 }`. Each share rounds `0.5 → 1`, the sum overshoots by 2, and the residual is charged to a $1 "biggest" (ties keep the first key). That stores a balance below the field's `min: 0`.
  - The wizard parse rule gives `"250k" → 250`, `"1.5M" → 15`, `"900000.75" → 90000075` (then clamped to $10M).
  - Before BUG-152 the savings answer was discarded, so the parse rule was harmless. It now sets every balance.
- **Why it matters:** both need unusual input (an answer of a few dollars; shorthand or cents). But a negative account balance breaks the bounds contract, and "250k" → $250 rewrites the whole plan. The confirm screen does echo "$250", which limits the damage.
- **Smallest fix:** in `allocateSavedTotal`, add the residual only if it keeps that entry ≥ 0 (or use largest-remainder rounding). In `ObInput`, reject or parse `k`/`M`/decimals instead of stripping them (e.g. `parseFloat` on the digits-and-dot part, with a suffix multiplier).

### R-6 — MEDIUM — CONFIRMED (mutation) — Central parts of three fixes, plus one allow-list "proof", can be deleted with 0 of 1,609 tests failing
Method: I broke one line, ran the full suite (`npx vitest run`, zz-* excluded), and restored the file from a copy. `git status` was clean after every run.

| Mutation (one line) | Fix it undoes | Tests failing | Measured effect |
|---|---|---|---|
| `spouse-sim.js:65` `otherEarnerGrowthEndAge: plateauAgeInFrame(...)` → `incomeGrowthEndAge` (no frame conversion) | **BUG-156**, the bug's literal title ("passed in the primary's age frame") | **0** | Probe `zz-rev-e`: MFJ, both $90k at 6%, 2.5% inflation, primary 40 with plateau 45, spouse 30 retiring 60 with $7k Roth. Spouse Roth at 60 is **531,135 → 353,778** (-$177k). |
| `spouse-sim.js:64` spouse's own salary gets the primary's plateau, frame-converted | BUG-156 (the other wrong variant) | **0** | The App test's fixture (spouse 55, plateau → spouse-frame 65 = spouse retirement) makes this variant inert. Only the *unconverted* variant is caught. |
| `what-if.js:467` `...spDelta.primaryInputs` → `...coupleContribEndAges(...)` | **BUG-157** at the `calcWhatIfDelta` site (the entry claims both sites) | **0** | Probe `zz-rev-f`, Finding A's own older-spouse fixture: `calcWhatIfDelta` totalAtRet at retire 63 is **1,343,614** mutated vs **1,334,822** fixed (= commit); at 65, 1,568,498 vs 1,554,539. |
| `App.jsx:2082` spouse HSA bundle `max: primaryHsaLimit` → `HSA_FAMILY_LIMIT_2026` | BUG-161 (the spouse half of the bound) | **0** | Under self-only coverage the spouse field again accepts 8,750 while the sim caps at 4,400. |
| `App.jsx:3590` Classic `<select value={effectiveRetirementState}>` → `{retirementState}`; or its `onChange` → `setRetirementStateRaw` | BUG-151 ("the Classic `<select>` must behave the same way", plan L1-A) | **0** / **0** | The first shows `null` (no selection) at the default; the second stores an explicit TX that stops following the work state. |
| `MyDetailsScreen.jsx:228` `isAuto` hint removed | BUG-151's "Same as home state" label | **0** | — |
| `App.jsx:667` `calcMilestones({... retirementTarget })` → `retirementTarget: 3_000_000` | the input-propagation ALLOW proof for `spending.retirementTarget` | **0** | The "proof" calls `calcMilestones` directly with two targets, so it proves the MODEL reads the argument, not that the App passes the user's input. The file's header promise ("for every 'it only feeds X' reason the test asserts that X itself moves") is false for this entry, and the Classic Portfolio-target control could go dead silently. |
| *(no mutation needed)* `input-propagation.test.js` ALLOW `conversion.conversionTaxSource`, whose proof asserts `conversionView.tables.simYears[].rothBal` moves | the allow-list's "it only feeds X" guarantee | n/a | Probe `zz-rev-k`: toggling the source moves ONLY `simYears[].rothBal`, and neither UI renders that column. Horizon's table shows `{age, conversion, tradBal, tax}` (`ConversionPlannerFlow.jsx:239`); Classic's shows the same (`App.jsx:4804`). The comparison tiles show both options regardless of the choice. So "Pay conversion tax from" changes no number on any screen: BUG-165's class, explained away by the same allow-list mechanism BUG-165 was filed against. (BUG-37 is owner-deferred; the point is that the proof certifies a consumer that doesn't exist on screen.) |
| `spouse-sim.js:78` spouse sim `spouseIncomeEndAge` → `null`; `spouse-sim.js:74` `hsaLimit` → `HSA_LIMIT_2026` | the new "one shared builder"'s MAGI cutoff (BUG-87) and family-HSA split | **0** / **0** | Pre-existing gaps, but in the module now documented as THE derivation for both App and scenarios. |

- **Why it matters:** every batch log reports revert-and-confirm, but each reverted the WHOLE fix at once, so whichever sub-claim the fixture happened to exercise carried the result. BUG-156's frame conversion is the clearest case: the L1-C log's M5 reverted both terms together, the "household total identical" fixture is sensitive only to the spouse's-own-salary half, and the frame conversion that names the bug has no test at all.
- **Smallest fix:** one targeted test per row. For example: a spouse-Roth household like `zz-rev-e` asserting the spouse's `cRoth` series (BUG-156); `calcWhatIfDelta` totalAtRet = commit on the older-spouse fixture (BUG-157); `spouseAccounts.hsa.contrib.max === 4400` under self coverage; a Classic-render test of the retirement `<select>` value and snap. Make the retirementTarget proof mount the App and read the Classic milestone cards (or expose the milestones from App), not call `calcMilestones` itself.

### R-7 — LOW — CONFIRMED — BUG-161's invariant ("the field equals the modelled value") still fails for the spouse under FAMILY coverage
- **Where:** `src/App.jsx:2082` (spouse HSA bundle `max: primaryHsaLimit`, which is 8,750 under family) vs the model's real spouse ceiling `spouseHsaLimitFor` = `8,750 − primary's contribution` (`src/model/spouse-sim.js:23-27`). `setHsaCoverageCoupled` (`App.jsx:1536-1541`) clamps only on a switch to self.
- **Repro** (probe `zz-rev-g.test.js`, real App): married MFJ, family coverage, primary HSA 3,850 (default), spouse HSA set to 8,000. The spouse field shows **8,000** (max 8,750, so in bounds and `bounds-invariant` is green), but the spouse sim contributes **4,900** per year.
- **Why it matters:** this is exactly the state BUG-161 was filed for (the field shows a number the model isn't using), one coverage mode over. The plan's own acceptance test for BUG-161 ("field value equals the modelled value") was only written for family→self. Totals are right because the sim caps (rule 4), so this is LOW.
- **Smallest fix:** give the spouse field `max: spouseHsaLimit` (the shared remainder App already computes at `App.jsx:320`). Re-clamp the stored spouse value when the primary's HSA contribution or the coverage changes (one coupled setter), or show `min(stored, limit)`.

### R-8 — LOW — CONFIRMED — Sweep 4 (BUG-166) breaks its own "one value renders one way" rule on the Classic tax panel
- **Where:** `src/components/TaxTimeline.jsx:20` renders BOTH segments with `fmtRate(rate, 0)`, but the "Ret." segment is `effectiveRMDTaxRate` (`App.jsx:3536-3539`). `docs/DESIGN.md` → "Percent formatting" lists `effectiveRMDTaxRate` as a 1-dp computed rate: "The same value must render identically everywhere (e.g. 24.0%, never 24% in one place)".
- **Repro** (probe `zz-rev-h.test.js`, default state): `effectiveRMDTaxRate` = 0.12833. TaxTimeline renders **"Ret.: 13%"**; the same Classic panel ~35 lines below (`App.jsx:3571`), `rmdView.effectiveRMDTaxRateLabel`, the action cards and Horizon all render **"12.8%"**. The L1-H log classed TaxTimeline as "0dp (bracket)", which is right for its Working segment (`fedMarginal`) and wrong for the Ret. segment.
- **Smallest fix:** pass a `dp` per `Seg` (0 for `fedMarginal`, 1 for `effectiveRMDTaxRate`).

### R-9 — MEDIUM — CONFIRMED — BUG-36 ("Low (accepted), deltas only") badly understates a live contradiction in spouse-gap households; BUG-157/158's `calcWhatIfDelta` changes can't reach it (pre-existing)
- **Where:** `calcWhatIfDelta` (`src/model/what-if.js:367+`) still walks retirement with the blended `buildRetirementDrawdown`, which has no spouse gap-year income. Consumers: the Horizon surplus "Apply" preview (`App.jsx:2297-2330`, `surplusApplySite`) and Classic `WhatIfPanel` ("Work 2 more years", `WhatIfPanel.jsx:129`).
- **Repro** (probe `zz-rev-f.test.js`, real App, Finding B's younger-spouse "auto" household: primary 48 retiring 57, spouse 37 earning $120k, $120k spend, conversions zeroed):
  - The headline says money lasts to **70** (`yearsSustained` 12.97).
  - The Apply preview (living expenses $60k, so a surplus exists) shows Longevity **"to age 63" → "to age 67"**. The BEFORE contradicts the plan by 7 years, and the AFTER (more saving) reads as *worse* than the plan's own 70.
  - `calcWhatIfDelta` with no change at all gives `scenarioYears` **5.41** vs headline **12.97**.
  - Classic "work 2 more years" (retire 60) gives **6.80** years vs **14.71** when the same change is committed.
  - At the no-spouse default the gap is the documented one in the other direction (25.51 vs 22.64).
- **Why it matters:** the index row says "Low (accepted) — deltas only", but the preview prints ABSOLUTE before/after values next to a headline they contradict. This is the audit's Lens 8 ("an 'accepted' verdict stops anyone looking"). It also means BUG-157/158's `calcWhatIfDelta` plumbing is mostly inert: the spouse seed it rebuilds never reaches the blended walk's years (mutation M37 changes no output, R-6).
- **Smallest fix:** in the near term, show deltas only (not absolute before/after ages) on the two `calcWhatIfDelta` previews, or derive "before" from the headline. The real fix is BUG-36's planned port of `calcWhatIfDelta` onto `buildRetirementPhase`; raise BUG-36's index severity and add this repro.

### R-10 — MEDIUM — CONFIRMED — REGRESSION from BUG-153: onboarding users aged 65+ now stop contributing the year after their current age, whatever retirement age they enter; the new equality test locks the defect in
- **Where:** `src/App.jsx:1410-1415` (`commitPlan`: `coupleCurrentAge` FIRST, then `coupleContribEndAges(st, st.retirementAge, ra)`) and `src/model/simulation.js:60-69` (`coupleCurrentAge`). Lifting the retirement age to the new current age sets each `contribEnd*` to `newAge + 1`, not to the lifted retirement age. That breaks the "`contribEnd === retirementAge` means tracking" convention `coupleContribEndAges` relies on, so the retirement move that follows leaves contributions behind.
- **Repro** (probe `zz-rev-i.test.js`, real App; the same probe on `main`):

  | Path | contribEnd* | 401k contrib at 74 / 75 | totalAtRet |
  |---|---|---|---|
  | `main`: onboarding `commitPlan({currentAge: 72, retirementAge: 75})` | 75 | 13,390 / 13,792 | **282,679** |
  | **HEAD: same onboarding call** | **73** | **0 / 0** | **221,179** (-$61,500, -22%) |
  | Controls: age 72, then retire 75 | 73 | 0 / 0 | 221,179 |
  | Controls: retire 75, then age 72 | 75 | 13,390 / 13,792 | 282,679 |

  Same final inputs, two answers depending on the order the user moved the controls. BUG-153 made onboarding reproduce the WORSE order. `onboarding-coupling-wiring.test.js` "matches the same values entered through the normal coupled setters" asserts `ends` equal to that order (`[73,73,73,73]`), so the defect is now locked by a test. It hits every onboarding answer with `currentAge >= 65` (65 already lifts `contribEnd` to 66) and `retirementAge > currentAge + 1`. Before this branch, onboarding got contributions right (and SS wrong).
- **Why it matters:** an older user still working ("I'm 70, retiring at 75") gets a plan that silently stops saving at 71. BUG-153 fixed one coupling (SS claim age) and regressed another, and its equality test can't see it because it compares against an order-dependent baseline instead of an order-independent truth.
- **Smallest fix:** in `commitPlan`, apply the retirement-age coupling against the ORIGINAL tracking state, before `coupleCurrentAge`. Equivalently: couple the retirement age first, then the current age, which gives ends 75 and still clamps SS to 70. Fix the controls-order dependence the same way (in `coupleContribEndAges`, also treat `contribEnd === baseRetAge + 1` as tracking when `baseRetAge === currentAge`). Change the BUG-153 test to assert order independence (both control orders and onboarding agree) and contributions through the retirement year.

### R-11 — MEDIUM — CONFIRMED (mutation) — L1-F closed the audit's mutation table one site at a time; the sibling sites for two of its rows are still deletable with 0 failures
A short mutation sweep over App.jsx glue lines no batch touched (full suite each time; file restored from a copy):
- **`App.jsx:1360` `whatIfSimInputs` … `stateRate` → `stateRate: 0`: 0 failures.** This is the audit's own row "work state not passed to working-year conversion events", at its second site. L1-F's test (`input-wiring.test.js` #5) pins only the primary sim (`App.jsx:331`). Probe `zz-rev-j` J1 (CA, $500k pre-tax, a $100k working-year conversion event, preview retire 67): preview **7,379,705** = commit 7,379,705. With the mutation the preview reads **7,400,213** (+$20,508 phantom), and nothing fails.
- **`App.jsx:576` `calcRetirementIncome({ … incomeGrowthEndAge … })` → `incomeGrowthEndAge: null`: 0 failures.** That is the income plateau no longer reaching Social Security, the SUBJECT of BUG-155 (Finding E's repro is an SS figure). Probe J2: the plateau really does move SS (`ssEstimateAnnual` 48,120 with none → 44,076 at plateau 40 → 47,880 at 50), but the BUG-155 App test only asserts SS is "never discounted backward", which a plateau-blind SS also satisfies. `input-propagation` can't help either, because the plateau moves `totalAtRet` anyway.
- **Why it matters:** "re-run each mutation and confirm it now FAILS a test" was satisfied literally, line by line. But each audited calculation has two wiring sites (committed plan + what-if bundle), and the "class not instance" lesson wasn't applied to the guard tests themselves.
- **Smallest fix:** extend `input-wiring.test.js` #5 to assert preview == commit for the CA conversion-event household (this catches site 2). Add an App test that the SS estimate at plateau 40 is below the no-plateau estimate (44,076 < 48,120).
- For contrast, also checked and **caught**: `spouseNetRate → 1` (7 failures), `rReal` ignoring inflation (10), no spend-basis conversion (34), `takeHomeIsHousehold → false` (1). All seven rows of the audit's original mutation table now fail at least one test (A1 3, A2 2, A3 1, A4 2, A5 2, A6 2, A7 1; `retStateRate = 0` 4).

### R-12 — LOW — CONFIRMED — Docs and small rule items that don't match the code
1. **`docs/FINANCIAL-MODEL.md:410` splits the Known Simplifications table.** The new `#### Income plateau convention` heading and paragraph were inserted mid-table, so the next **7 rows** (lines 413-419, from "Spouse Roth/Taxable/HSA gap-year…" onward) have no header and run straight on from a paragraph. They render as raw `| … |` text, not table rows.
2. **BUGS.md claims broader than the code (all re-checked by execution above):**
   - BUG-153: "every bundle `value` within its own min/max". False for `ra < ca` and `ra >= lifeExpect` (R-3). It also enshrines an order-dependent result (R-10).
   - BUG-155 and the FINANCIAL-MODEL paragraph: "the stored plateau is kept in `[currentAge+1, retirementAge)` by the coupled age setters and `commitPlan`". The Classic Retirement Age slider doesn't (R-1).
   - BUG-161: "the spouse HSA field's max now follows the coverage ceiling". Under family it is the full 8,750, not the spouse's real share (R-7).
   - BUG-156: the revert evidence covers only the own-salary variant; the frame conversion named in the title is untested (R-6).
   - BUG-159: "every other value … T-X.2/3/4 unmoved". True for locked values. My main-vs-HEAD signature diff shows that unlocked, user-visible T-X.3 text moved (`workLongerView.sub` "+$869k" → "+$878k portfolio", the +3-yr scenario crossing the MFJ band), and default `ssView.wr70` 4.13 → 3.99. Both are correct consequences of the same mechanism, but they weren't recorded.
3. **`docs/audit-2026-09-05/audit-auto-resolution.md`**: Findings A, B, E and F got "FIXED by BUG-15x" status lines; **Finding C (BUG-151) did not**. Finding D (BUG-154, held) has no "held" note either.
4. **CLAUDE.md test count** still reads 1408 in both places (rule 7 and Commands); the suite is **1609**. The plan assigns this to the orchestrator's close-out; flagging it so it isn't missed.
5. **Rule 6:** `mintEventId` (`src/model/money-events.js:275-279`) puts module-level mutable state plus `Date.now()` / `Math.random()` in `src/model/`, the "pure functions" layer. It is UI plumbing (no model function calls it). It belongs in a UI util (e.g. `src/components/` or `src/utils/`).
6. **Dead code left by Sweep 4:** `actualMarginalPct` (`App.jsx:1256`) has no reader since its one use moved to `fmtRate(fedMarginal, 0)`. `TaxPhaseCard.jsx` is imported nowhere in `src/`, yet BUG-166 migrated it and lists it under Files. `docs/ARCHITECTURE.md:111` still lists Tax Phases state (`rate1, rate2, rate3, showPhase2, phase2Start`) that doesn't exist in App.jsx (pre-existing).

### R-13 — MEDIUM — CONFIRMED — Both new structural guards skip five user-editable fields; one of them is a live coupling gap of exactly the kind `bounds-invariant` exists to catch
- **Where:** `input-propagation.test.js` and `bounds-invariant.test.js` both enumerate only the nine named bundles (`BUNDLES = ["profile", …, "assumptions"]`). Probe `zz-rev-l` (walking all of `horizonProps`) finds five `{value, set}` fields outside them: `conversionView.window.startAgeField`, `conversionView.window.endAgeField`, `conversionView.events.inServiceField`, `conversionView.events.rows[i].ageField`, `conversionView.events.rows[i].amountField`. The guards' "every user input" claim and their "a field added tomorrow is picked up" design don't cover them.
- **Live defect hidden there (probe L2, real App):** $500k pre-tax, in-service conversions on, add an event, set it to $100,000 (default age 48). Then move retirement 65 → 40.
  - The Horizon row still reads **age 48, $100,000, "401k → Roth, taxed as income"**, with `ageField` max 39, so its value is out of its own range.
  - The model silently drops the event: the sum of `simData.convEvent` goes 100,000 → **0**.
  - Nothing on screen says the conversion is ignored. Same class as BUG-161 (a field showing an input the model isn't using) and BUG-160 (an input that doesn't reach the model).
- **Smallest fix:** make both guards walk every `{value, set}` object in `horizonProps`, not a hard-coded bundle list (the probe's walker is ten lines). For the row: either clamp/flag stale events when retirement moves (a coupled setter, as for `contribEnd`), or have the row expose an "outside your working years, not modelled" state from the model.

## Checked and CLEAN

_(in progress)_

## BUG-154 verdict — fix CORRECT, proposed re-lock CORRECT; approve, with one follow-up

**Executed:** I applied `ce5c4c0`'s `src/` diff to a HEAD snapshot (`git apply` is clean) and ran the full suite: **1 failed | 1613 passed**. The single failure is the T-X.3 lock, received **0.9726563582272075**, which is byte-identical to the value the L2 agent measured against `main`. No other golden master or test moved. That includes this branch's `input-propagation` / `bounds-invariant` / BUG-159 locks and the optimizer (which also reads `ss70Annual`).

**Mechanism re-derived by hand** (T-X.3: `ssOverride` 38,000 at claim 67, `totalAtRet` 4,429,144):
- Pre-fix, the age-70 leg ignored the override. It used `round(PIA × 1.24) × 12` = **27,192** (PIA from a 12-year earnings record), below the 38,000 the same household's `withdrawalRate` uses.
- Post-fix: 38,000 × 1.24 / 1.00 = **47,120**.
- Δ household70SS = 19,928, and 19,928 / 4,429,144 = 0.4499 pts, which is exactly the observed `wr70` drop (1.42259 → 0.97266). Direction DOWN is right: more SS at 70 means a smaller draw.
- Also moved but unlocked on T-X.3 (record them in the re-lock comment): `ss70DrawReduction` 0 → 9,120, `delayApplicable` false → true, `delayGainYrs` 0 → 1.

**The fix is in the right place.** `calcRetirementIncome` is the one shared source, so `wr70`, `ssDelayGainYrs` (`drawdown.js`), the action cards, and `calcOptimizedScenario`'s delay leg (`optimization.js:70`) all move onto the override basis together. The `includeSS = false` zeroing is also right: pre-fix, `household70SS` stayed nonzero with SS excluded.

**Practical:** `git cherry-pick ce5c4c0` CONFLICTS (add/add on `docs/audit-2026-11-14/impl-log-L2.md`, which the branch already carries). Apply the `src/` part only (`git show ce5c4c0 -- src | git apply`), then re-lock and add the BUGS entry from `impl-log-L2.md`.

**Follow-up to file, not a blocker (CONFIRMED on HEAD+`ce5c4c0`, probe `zz-rev-154b`):** the fix inherits a pre-existing semantic. A pinned override is "the benefit at whatever claim age is currently selected", and it doesn't rescale when the claim slider moves. BUG-154 now rescales only the age-70 leg from it. With 38,000 pinned, moving the claim slider 70 → 67 → 65 → 62 leaves the claim leg at **38,000** every time, while the age-70 leg goes **38,000 → 47,120 → 54,348 → 67,314**. So the delay card, newly visible for override users, shows a +77% "delay gain" just because the user explored an earlier claim age. The coherent model anchors the override to the claim age it was entered at (or treats it as an at-FRA figure, as `spouseSsEstimate` already is) and rescales BOTH legs by `claimFactor` ratios. That's an owner/product call. R-2 (the work-longer SS tile) is a separate BUG-154 sibling this commit does not reach.
