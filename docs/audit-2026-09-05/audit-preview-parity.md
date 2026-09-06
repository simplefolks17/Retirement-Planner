# Audit: PREVIEW/COMMIT DIVERGENCE in `src/model/what-if.js`

STATUS: IN PROGRESS

Method: mount the real App (`react-test-renderer`), read `horizonProps.whatIfSimInputs`
(= `whatIfBundle`), call `calcWhatIfScenario(bundle, {retirementAge: X})` for the PREVIEW,
then `assumptions.retirementAge.set(X)` for the COMMITTED truth, and print both.

## Already known (given, not re-derived)
- **Social Security is never re-derived for a scenario's own working years.**
  what-if.js:339, :748, :864, :875 — only inflation re-bases `retDrawShared.ssAmount *
  scenarioRetYearFactor`. Measured: base 60 -> householdSS 25,956; committed 50 -> 13,656
  (preview +90.1% too high); committed 65 -> 33,516 (preview -22.6% too low).

---

## VERIFIED FINDING 1 — "work longer" previews freeze `contribEnd*` at the base retirement age

**Severity: HIGH.** Directly wrong on the user-facing "Working longer" card (#55) and every
+N-year lever preview.

`whatIfSimInputs` (App.jsx:1283-1304) carries `contribEnd401k/Roth/Taxable/HSA` verbatim.
The preview's re-sim (`what-if.js:604`, `runSimulation({...simInputs, moneyEvents})`) therefore
stops contributions at the BASE plan's retirement age. Committing the same age runs
`setRetirementAgeCoupled` (App.jsx:1307-1315), which bumps every `contribEnd*` that tracks
the retirement age forward — so the committed plan gets N extra years of contributions the
preview never modelled.

Printed repro, no-spouse golden-master default (currentAge 30, base retirementAge 65,
contribEnd* all 65):

```
-- retire at 68 --
   totalAtRet          preview=   4651405.000  committed=   4826584.000  (-3.63%)
   yearsSustained      preview=        22.501  committed=        22.726  (-0.99%)
```
$175,179 of contributions silently dropped from the preview at +3 years.
(At X <= 65 the two agree exactly on `totalAtRet` — the coupling only fires when
`contribEnd === retirementAge`, so only work-LONGER scenarios are affected.)

Direction: the preview is PESSIMISTIC about working longer — it under-reports the benefit
of the exact action the "Working longer" card exists to recommend.

Would the spouse fixtures catch it? NO. `spouse-household.test.js`'s T-X.2/T-X.3/T-X.4
never set `contribEnd*`, and only T-X.4 locks scenario outputs at all.

---

## VERIFIED FINDING 1 (expanded) — contribEnd freeze, spouse households

Decomposition probe (swap base-inherited fields for the committed plan's own, one at a
time; `p3_contribEnd` = swap `simInputs.contribEnd*`):

```
### MFJ + spouse gap, spouseRetirementAge=65 — retire at 65 (base 58)
   committed:      total=2529344  years=16.605  depl=82  spill=202772
   p0_raw          total=2262338  years=14.926  depl=80  spill=557244
   p1_conv         total=2262338  years=14.926  depl=80
   p2_ss           total=2262338  years=15.173  depl=81
   p3_contribEnd   total=2529344  years=16.605  depl=82  spill=202772   <-- closes exactly
```
$267,006 of portfolio (10.6%) and **1.68 years of runway** dropped by the preview;
depletion age reported 80 when committing gives 82. Preview also invents $354,472 of extra
penalized spouse-401k spillover.

```
### MFJ auto-spouse (spouseRetirementAge=null) — retire at 62 (base 58)
   committed:      total=2032943  years=15.109  depl=78
   p0_raw          total=1883898  years=13.914  depl=76      (-7.33% / -1.20 yrs / -2 yrs depl)
```

## VERIFIED FINDING 2 — `spouseSimData` is frozen at the base retirement age, so a "work longer" scenario models the spouse working but NOT contributing

**Severity: MEDIUM-HIGH.** Only bites when `spouseRetirementAge` is null ("auto" — the DEFAULT).

`spouseSeedInputs.spouseSimData` (App.jsx:1479-1482) is built by the `spouseSimData` memo
(App.jsx:360-382), whose `contribEnd401k/Roth/Taxable/HSA` = `spouseContribEnd =
effectiveSpouseRetAge` — resolved against the BASE `retirementAge` (App.jsx:299-301).
The whatIfBundle comment at App.jsx:1470-1473 claims "spouseSimData itself never changes for
a primary-retirement-age scenario". Measured: **FALSE.**

BUG-127 taught `calcWhatIfScenario` to re-resolve `scenarioSpouseRetAge` at the scenario's
own age, and `buildSpouseRetirementSeed` then iterates `spouseSimData` rows out to that later
age — but those rows carry `c401k = 0` past the base-resolved age, because the SIM stopped
contributing there. So the scenario models the spouse still earning wages (offsetting draws,
stacking in the bracket floor) while contributing nothing.

Printed repro (MFJ, primary 50→58, spouse 40, $90k income, $15k/yr spouse 401k,
spouseRetirementAge = null):
```
### MFJ auto-spouse — retire at 65 (base 58)
   [spouseSimData identical? false]
   base c401k tail = [[56,27577],[57,28404],[58,29256]]      <- preview: contributions stop at spouse age 58
   com  c401k tail = [[63,33915],[64,34933],[65,35981]]      <- committed: continue to 65
   p3_contribEnd   years=16.509  spill= 67368
   p4_spouseSim    years=16.605  spill=202772  (== committed)
```
~7 spouse-years x ~$33k = ~$230k of spouse 401k contributions silently dropped from the
preview. (Small in `yearsSustained` here because the spouse bucket is held out anyway, but
it moves `totalSpouseSpillover` by 3x.)

Secondary, same object: `spouseSimData`'s own `spouseIncomeEndAge`
(`spouseAgeAt(currentAge, spouseCurrentAge, safeRetAge)`, App.jsx:377) and
`whatIfSimInputs.spouseIncomeEndAge` (`primaryAgeAt(..., effectiveSpouseRetAge)`,
App.jsx:1297) are also frozen at the BASE retirement age — measured moving 68 -> 75 between
base and committed in the same fixture.

## VERIFIED FINDING 3 — the `hasActiveSpouseGap` hold-out gate is NOT applied in scenarios (BUG-93 alive in every preview)

**Severity: HIGH** for the affected household shape (spouse with a rollover balance and no
income — the exact household BUG-93 was filed for).

App.jsx:777 gates the engine's Option-A hold-out:
`spouseRetirementAge: hasActiveSpouseGap ? effectiveSpouseRetAge : null`.
what-if.js:771 does NOT:
`spouseRetirementAge: spouseSeed ? scenarioSpouseRetAge : retPhaseBase.spouseRetirementAge`
— `scenarioSpouseRetAge` is computed whenever `spouseSeedInputs` exists (i.e. `hasSpouse`),
with no gap check at all. So any scenario that forces a resim turns the hold-out ON for a
household whose committed plan has it OFF.

Printed repro (MFJ, primary 55→60, spouse 45, spouseRetirementAge 62, spouse 401k $600k,
spouse income $0 → `hasActiveSpouseGap === false`, base `retPhaseBase.spouseRetirementAge = null`):
```
### no-income spouse — retire at 58 (base 60)
   committed:      years=15.322  depl=74  spill=       0
   p0_raw          years=14.904  depl=73  spill= 646,267    <-- phantom penalized early withdrawal
### no-income spouse — retire at 62 (base 60)
   committed:      years=19.941  depl=82  spill=       0
   p0_raw          years=18.280  depl=81  spill= 281,804
```
Note the decomposition's `p5_gate` step (overwriting `retPhaseBase.spouseRetirementAge` in
the bundle) is a **no-op** — proof the value cannot be corrected from the bundle; the
`spouseSeed ? scenarioSpouseRetAge` branch overrides it unconditionally.

User-visible consequence: `totalSpouseSpillover > 0` caps the verdict at "tight"
(`verdictForScenarioResult`, BUG-92) and the preview reports 1.0-1.7 fewer years of runway
than committing the same plan actually delivers.

## VERIFIED FINDING 4 — the Roth-conversion window stays at the BASE plan's absolute ages

**Severity: MEDIUM.** Documented in-code as "an approximation" (what-if.js:750-754), but
measured it is the second-largest term in the gap and it moves the headline.

`conversionByAge` is built from `convWindowFloor = safeRetAge + 1` (App.jsx:668) and passed
through the bundle unchanged. Committing a different retirement age rebuilds the whole
schedule — different YEARS *and* different bracket-fill AMOUNTS.

```
no-spouse default, retire at 55 (base 65):
  base convByAge  {66:121800, 67..72:80898}                 (7 conversion years)
  com  convByAge  {56..66:121800, 67..72:87620}             (17 conversion years)
  p0_raw years=14.608  ->  p1_conv years=14.253   (delta -0.355 yrs)
no-spouse default, retire at 62 (base 65):
  p0_raw years=19.046  ->  p1_conv years=19.359   (delta +0.313 yrs)
```
Direction is not even consistent (early retirement: preview optimistic; late: pessimistic),
so it cannot be characterised as a safe/conservative approximation.

---

## USER-FACING REPROS (printed)

### The "Working longer" card (#55, `calcWorkLongerBreakEven` -> Strategies screen)
Every row is `calcWhatIfScenario(bundle, { retirementAge: safeRetAge + k })`, so it carries
findings 1-4 at once. `portfolioAtRet`/`portfolioDelta` and `depletionAge` are the card's
two headline numbers.

```
=== no-spouse default (base retAge 65) ===   headline: "+4 yrs of runway · +$616k portfolio"
  +1 (66): card portfolio=4,231,373  committed=4,285,559   diff=  -54,186   depl 89 vs 89
  +3 (68): card portfolio=4,651,405  committed=4,826,584   diff= -175,179   depl 91 vs 91
  +5 (70): card portfolio=5,113,300  committed=5,428,001   diff= -314,701   depl 93 vs 94

=== MFJ auto-spouse (base retAge 58) ===
  +1 (59): card portfolio=1,562,835  committed=1,596,800   diff=  -33,965   depl 73 vs 73
  +3 (61): card portfolio=1,770,937  committed=1,879,978   diff= -109,041   depl 75 vs 76
  +5 (63): card portfolio=2,003,223  committed=2,188,993   diff= -185,770   depl 78 vs 79

=== no-income spouse (base retAge 60) ===
  +1 (61): card portfolio=1,199,972  committed=1,232,023   diff=  -32,051   depl 79 vs 80
  +3 (63): card portfolio=1,320,897  committed=1,423,733   diff= -102,836   depl 82 vs 85   (-3 yrs)
  +5 (65): card portfolio=1,454,037  committed=1,637,438   diff= -183,401   depl 85 vs 89   (-4 yrs)
```
The card is systematically PESSIMISTIC in every fixture and at every offset: it under-reports
the benefit of the exact action it exists to recommend, by up to $315k of portfolio and
**4 years of runway**.

Internal inconsistency inside the same card: `calcWorkLongerBreakEven` DOES re-derive SS
correctly for its display column (`ssAnnualAt(retAge)` -> `calcAIME(currentIncome,
incomeGrowth, retAge - currentAge, ...)`, what-if.js:1548-1554), but the `scenario` walk it
prints beside it uses the frozen base SS. The card shows a correct "+$X/yr Social Security"
pill next to a depletion age computed as if SS never changed.

### `calcWhatIfDelta` + `retirementAgeOverride` (Classic What-If panel, WhatIfPanel.jsx:114)
```
=== no-spouse default, base retAge 65 ===
  retire 60: delta total=2,969,343 (== committed) | years 19.799 vs 18.242 | depl 80 vs 79
  retire 62: delta total=3,361,963 (== committed) | years 21.641 vs 19.669 | depl 84 vs 82
  retire 64: delta total=3,799,109 (== committed) | years 23.527 vs 20.924 | depl 88 vs 85
  retire 66: delta total=4,231,373 vs 4,285,559   | years 25.210 vs 22.250 | depl 92 vs 89
  retire 68: delta total=4,651,405 vs 4,826,584   | years 25.923 vs 22.726 | depl 94 vs 91
  retire 70: delta total=5,113,300 vs 5,428,001   | years 26.622 vs 23.177 | depl 97 vs 94
```
Up to **3.4 years / 3 years of depletion age** optimistic, in the opposite direction from
`calcWhatIfScenario`. `calcWhatIfDelta` never got the engine (still `buildRetirementDrawdown`,
no spending-draw tax — the documented BUG-36) AND inherits the frozen `rmdTaxByAge` /
`conversionTaxByAge` / SS / `contribEnd*`. The two preview surfaces therefore disagree with
each other as well as with the commit.

### GATE ISOLATION (Finding 3, cleanest possible repro)
Same bundle, same retirement age, no actual change — only `needsResim` differs
(`excludeEventId: "no-such-event"` strips nothing but forces the resim branch):
```
no-income spouse, base retAge 60, retPhaseBase.spouseRetirementAge = null (gate OFF)
  committed         years=17.829  depl=78  spill=      0
  preview no-resim  years=17.829  depl=78  spill=      0     <- identical, correct
  preview  +resim   years=17.153  depl=78  spill=446,454     <- gate silently ON
```

## CLEAN (negative space)
- **`buildLeverRail` verdicts, no-spouse default, ages 50-75, step 1: 0/26 mismatches.**
  The verdict is a coarse 3-bucket function of the margin, so the sub-year errors above do
  not cross a bucket boundary in this fixture. (Retested on spouse fixtures below.)
- `scenarioExpenses` re-derivation is CORRECT at every age tested: preview
  `scenarioExpenses` == the committed plan's `retPhaseBase.effectiveExpenses` exactly
  (e.g. retire 55 -> both 152,957.691; retire 68 -> both 254,685.799).
- `scenarioTotalAtRet` is correct for every retirement age <= the base (no `contribEnd`
  coupling fires), across all four fixtures.
- `rReal`, `filingStatus`, `retStateRate`, `rmdStartAge`, `spouseRmdStartAge`, `useTable2`,
  `spouseCurrentAge`, `currentAge`, `ssClaimAge`, `pensionStartAge` are genuinely
  scenario-invariant (none is a function of `safeRetAge`) — INHERITED-CORRECT.
- `pension` / `pensionAmount` re-basing via `inflationRebaseFactor` is correct: the base
  value is `toRetirementYearDollars(..., safeRetAge - currentAge)` and multiplying by
  `(1+i)^(X - safeRetAge)` is exactly `toRetirementYearDollars(..., X - currentAge)`.
- `moneyEvents` boundary handling (the `gapEvents` branch for scenarios retiring earlier,
  and the sim/walk split for later) is correct — no double-count found.
- `needsResim` (what-if.js:587) covers every override `calcWhatIfScenario` accepts:
  `retirementAge`/`retireAdj` (balance changes), `scenarioEvents` with pre-retirement
  activity, `excludeEventId`. `annualExpenses`/`monthlyExpenses` genuinely cannot change the
  accumulation phase in this model (contributions are independent inputs), so skipping the
  resim there is correct. NO missing trigger found. The problem is the opposite: firing it
  changes the spouse hold-out gate (Finding 3).

---

## VERIFIED FINDING 5 — `calcWhatIfDelta` never got the per-account engine, so its "before" is wrong for any spouse household (sign-flipped deltas)

**Severity: HIGH** (spouse households) / MEDIUM (no-spouse).

`WhatIfPanel.jsx:85-91` builds `sharedArgs` as a strict SUBSET of the bundle it already has
in scope — it deliberately omits `retPhaseBase`, `conversionByAge`, `baseChart`,
`spouseChartInputs`. `calcWhatIfDelta` therefore always runs `buildRetirementDrawdown` (the
blended pool): no spouse hold-out, **no spouse gap-year income offsetting the draw**, no
per-year spending-draw tax, and RMD/conversion tax read from `rmdTaxByAge` /
`conversionTaxByAge` frozen at the BASE plan's absolute ages.

Printed repro (MFJ, primary 50→58, spouse 40 working to 65, $90k income, $500k+$15k/yr
spouse 401k):
```
NO-CHANGE call: calcWhatIfDelta({...shared}) -> scenarioYears = 8.469
                 base plan (bundle.baseYearsSustained)      = 15.303      (-44.7%)
  retire 55: delta years= 7.140 | engine-preview 12.332 | COMMITTED 12.228
  retire 62: delta years=10.162 | engine-preview 15.467 | COMMITTED 16.620
  retire 65: delta years=11.265 | engine-preview 14.926 | COMMITTED 16.605
```
`WhatIfPanel.jsx:235-240` renders `scenarioYears` next to `baseYears` (the CORRECT 15.303)
with a `DeltaChip(deltaYears)`. So dragging "retire 4 years later" prints
**"15.3 → 10.2 yrs, −5.1"** when committing that same age actually gives **16.6 (+1.3)**.
The delta chip's SIGN is wrong.

`App.jsx:2129` (`surplusApplySite`) also feeds `before.scenarioYears`/`before.scenarioDepletionAge`
into the Apply modal as the household's CURRENT longevity — 8.469 years / a depletion age
6.8 years earlier than the headline the same app shows. The comment at App.jsx:2109 argues the
shared mechanism is an "anti-divergence property"; it is, between `before` and `after`, but not
against the plan's own headline.

No-spouse default, same surface (`retirementAgeOverride`):
```
  retire 60: years 19.799 vs committed 18.242 | depl 80 vs 79
  retire 70: years 26.622 vs committed 23.177 | depl 97 vs 94
```
Note this errs OPTIMISTIC while `calcWhatIfScenario` errs PESSIMISTIC — the two preview
surfaces disagree with each other as well as with the commit.

---

## VERIFIED FINDING 6 — the Plan screen's retirement-age tick rail paints "unaffordable" over ages that are actually comfortable

**Severity: HIGH.** `PlanScreen.jsx:387` -> `buildLeverRail(whatIfSimInputs, {lever:"retirementAge"})`,
one `calcWhatIfScenario` per tick, so it carries findings 1-4 compounded.

Committed verdict reconstructed with the SAME `verdictForScenarioResult` fed the committed walk.
```
=== no-income spouse (primary 55->60, spouse 45 ret 62, spouse 401k 600k, no spouse income) ===
  age 66: preview=unaffordable  committed=tight          <<<
  age 67: preview=unaffordable  committed=tight          <<<
  age 68: preview=unaffordable  committed=tight          <<<
  age 69: preview=unaffordable  committed=comfortable    <<<
  age 70: preview=tight         committed=comfortable    <<<
  age 71: preview=tight         committed=comfortable    <<<
  age 72: preview=tight         committed=comfortable    <<<
  age 73: preview=tight         committed=comfortable    <<<
  verdict mismatches: 8/20
=== MFJ auto-spouse: 1/18 (age 72: unaffordable vs tight)
=== T-X.2-like (17-yr gap): 1/16 (age 60: tight vs comfortable)
=== no-spouse default: 0/26  (CLEAN)
```

Same household through the "Try a change" panel (`buildLeverPreview`, PlanScreen.jsx:647):
```
  -- drag retirement age to 68 --   verdict = "unaffordable"
     Portfolio at retirement : $1.1M -> $1.7M
     Portfolio lasts         : to age 78 -> "to age 89"
     COMMITTED: totalAtRet=2,004,505  depletionAge=95  yearsSustained=26.395  spillover=0
```
The panel says the money runs out at 89 (before the plan age of 90 -> "unaffordable");
committing that exact change gives depletion at 95. **6 years of runway and the verdict itself.**

---

## VERIFIED FINDING 7 — the existing scenario golden master (T-X.4) LOCKS THE DIVERGENCE IN

T-X.4 (`src/__tests__/spouse-household.test.js:832+`) was written specifically to catch
scenario-path bugs (BUG-127/BUG-134) and locks `calcWhatIfScenario` output at three retirement
ages. Measured against the committed truth for the same fixture:
```
   contribEnd401k in bundle = 57 (base retAge 57)
  -- retire 58 --  LOCKED/live preview: total=3,796,555 depl=111 spill=793,729
                   COMMITTED          : total=3,831,682 depl=112 spill=742,667  (contribEnd 58)
  -- retire 60 --  LOCKED/live preview: total=4,338,937 depl=129 spill=606,529
                   COMMITTED          : total=4,453,337 depl=135 spill=474,771  (contribEnd 60)
  -- retire 62 --  LOCKED/live preview: total=4,956,038 depl=164 spill=425,758
                   COMMITTED          : total=5,163,187 depl=NEVER DEPLETES (yrs=Infinity) spill=187,641
```
At retire 62 the preview reports a finite depletion at 164 while committing the same plan
never depletes at all. T-X.4 is a REGRESSION lock (preview vs. its own past self), not a
PARITY lock (preview vs. commit) — so it cannot catch any finding in this report, and its
`S{}` constants are the buggy preview values written down as expected.

**Answer to "would the two spouse fixtures catch it": NO — for every finding.** T-X.2/T-X.3
lock base-plan numbers only (structurally blind to the scenario path). T-X.4 locks scenario
numbers but against themselves. What is missing is a test that asserts
`calcWhatIfScenario(bundle, {retirementAge: X})` == the App's own values after
`assumptions.retirementAge.set(X)`.
