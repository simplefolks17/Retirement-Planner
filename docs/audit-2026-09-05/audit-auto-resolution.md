# Audit: DEFAULT / "AUTO" RESOLUTION axis
Started 2026-09-05. Repo: /home/user/Retirement-Planner

STATUS: IN PROGRESS (appending incrementally)

## Section 1 — Sentinel inventory table
(to be filled)

## Section 2 — Ranked findings
(to be filled)

## Section 3 — Checked and CLEAN
(to be filled)

## Scratch log

### [log] Candidate sentinels found from App.jsx useState + model signatures (pass 1)
- spouseRetirementAge = null -> auto = primary retirement age (resolveSpouseRetAge, retirement-phase.js:31)
- ssOverride = null -> auto = computed ssAnnualBenefit (retirement-income.js:33)
- incomeGrowthEndAge = null -> "grows until retirement" (social-security.js:20, simulation.js:26/108/117)
- conversionStartAge/EndAge = null -> auto window floor/ceil (App.jsx:681/684)
- stateRateOverride = null -> auto = state table rate (tax-basis.js:43)
- annualExpenses = null -> auto = effectiveLiving (App.jsx:556)
- livingExpenses = null -> auto = grossAfterTax - contribTotal (budget.js:43)
- marketplaceMonthlyPremium = null -> falsy => no ACA loss (healthcare.js:69)
- retirementState = useState(selectedState)  <-- ONE-TIME CAPTURE, never re-synced
- spouseIncomeEndAge = null -> other earner's income never stops (simulation.js:161)
- rRealByYear = null -> use scalar rReal (retirement-engine.js)
- (to check) ssClaimAge/pensionStartAge/rmdStartAge = Infinity sentinels

---
## VERIFIED FINDING A (HIGH) — `simInputs.spouseIncomeEndAge` is frozen at the BASE plan's auto resolution inside every what-if scenario
**Third instance of the BUG-127/BUG-134 class.** `src/App.jsx:1297` builds
`whatIfSimInputs.spouseIncomeEndAge = hasSpouse ? primaryAgeAt(currentAge, spouseCurrentAge, effectiveSpouseRetAge) : null`
using the BASE plan's already-resolved `effectiveSpouseRetAge`. Both scenario re-sims
(`what-if.js:371` `runSimulation({ ...simInputs, ... })` in `calcWhatIfDelta`, and
`what-if.js:605` in `calcWhatIfScenario`) spread `simInputs` unchanged, so the cutoff stays on the
base plan's age while `resolveSpouseRetAge` (what-if.js:391 / 678) correctly moves the spouse's
retirement age to the scenario's. Under an explicit `spouseRetirementAge` the two agree; under
`null` ("auto") they diverge by exactly the retirement-age shift.

**Printed repro** (probe `zz-auto-probe1.test.js`): MFJ, primary 45 retiring at 60, spouse 55
(OLDER, so the cutoff lands inside the accumulation phase), both incomes $150k, Roth $7k/yr,
`spouseRetirementAge` left at null:
```
simInputs.spouseIncomeEndAge: 50   (frozen)
scenario retAge=63 -> should be 53 : scenarioTotalAtRet 2,105,537 (as-is) vs 2,067,794 (fixed)  = +37,743 phantom
scenario retAge=65 -> should be 55 : scenarioTotalAtRet 2,316,864       vs 2,250,710           = +66,154 phantom
scenario retAge=68 -> should be 58 : scenarioTotalAtRet 2,674,405       vs 2,560,080           = +114,325 phantom
scenarioYears  4.4936/4.6857/4.8289 (as-is) vs 4.3892/4.5166/4.5692 (fixed)
```
Direction: the frozen cutoff stops the spouse's wages counting in household MAGI too early ⇒
under-stated MAGI ⇒ the primary's Roth-IRA phase-out doesn't bite ⇒ phantom contributions.
The error GROWS with each extra year worked (optimistic bias, monotonic).
Files: `src/App.jsx:1297`; `src/model/what-if.js:371`, `:605`.

---
## VERIFIED FINDING B (MEDIUM-HIGH) — `spouseSimData` is NOT scenario-invariant under "auto"; what-if.js's comment asserting it is, is false
`src/model/what-if.js:657-660` states: *"No spouse RE-SIM is needed: spouseContribEnd is the
spouse's OWN retirement age, so spouseSimData is invariant to a primary-retirement-age scenario."*
That is true only when `spouseRetirementAge` is an explicit number. Under `null` (auto)
`spouseContribEnd = effectiveSpouseRetAge = ` the PRIMARY's retirement age (App.jsx:358), so
`spouseSimData`'s contributions stop at the BASE plan's age — yet `buildSpouseRetirementSeed`
(called with the SCENARIO's `spouseRetAge`) keeps iterating rows past that point.
**Exactly the "a comment asserting an invariant is not a test enforcing one" failure BUG-134
was written up for.**

**Printed repro** (`zz-auto-probe2.test.js`): MFJ, primary 48 retiring at 57, spouse 37
(11-yr auto gap), spouse income $120k, spouse 401k contrib $20k, `spouseRetirementAge` null:
```
spouse sim rows: age 57 -> c401k 38,813 ; age 58,59,60 -> c401k 0   (contribEnd frozen at 57)

scenRet=57  spouseContribByAge {58..68} all non-zero              SUM contrib = 300,804
scenRet=60  spouseContribByAge {"69":0,"70":0,"71":0} trailing     SUM contrib = 246,791
scenRet=63  spouseContribByAge {"69":0 ... "74":0} (6 zeros)       SUM contrib = 169,471
   ...while spouseIncomeFloorByAge for those SAME years carries FULL wages
   (69:121,457  70:120,289  71:119,132) — the scenario models a spouse who earns a
   full salary and saves nothing.
```
Working 3 years longer DELETES $54,013 of modelled spouse 401k contributions; 6 years longer
deletes $131,333 — monotonically worse the longer you work (BUG-127's exact user-facing shape).

**End-to-end magnitude** (`zz-auto-probe3.test.js`, same household + $120k spend; the corrected
run rebuilds the spouse sim at the scenario's own resolved contribEnd — verified byte-identical
to App's own rows at the base age):
```
scenRet=57  years 16.851 / 16.851   (delta 0 — base case, correct)
scenRet=60  years 17.727 / 17.751   (+0.024)
scenRet=63  years 18.742 / 18.852   (+0.110)
scenRet=65  years 19.263 / 19.510   (+0.247)
```
`scenarioTotalAtRet` is unaffected (the seed row predates the frozen contribEnd); the loss shows
only in longevity, so it is understated but real and monotone.
Files: `src/App.jsx:358` (`spouseContribEnd`), `:1479` (`spouseSeedInputs.spouseSimData`);
`src/model/what-if.js:657-690`.

---
## VERIFIED FINDING C (HIGH) — `retirementState` is seeded ONCE from `selectedState` and never re-derives
`src/App.jsx:116`: `const [retirementState, setRetirementState] = useState(selectedState);`
A `useState` initializer runs only on the first render, so "same state as where you work" is
resolved exactly once, at mount, against the hardcoded default `selectedState = "TX"` (0% tax).
Every user who sets their working state and never independently discovers the second
"Retirement state" control keeps **Texas's 0% retirement tax rate** for the whole retirement walk.
There is no re-sync anywhere: `setSelectedState` has no coupled handler (unlike
`setCurrentAgeCoupled`/`setLifeExpectCoupled`/`setRetirementAgeCoupled`, which all exist precisely
to keep derived ages in sync).

**Printed repro** (`zz-auto-probe5.test.js`, PROBE 4 + PROBE 7): default household, only
`profile.selectedState` set to "CA":
```
selectedState   : CA
retirementState : TX     <- did not follow

retirementState left at captured TX default : yearsSustained 27.336  totalDrawTax 379,992  totalRMDs 182,133  netConversionBenefit -43,141
retirementState explicitly set to CA        : yearsSustained 25.379  totalDrawTax 557,344  totalRMDs 117,251  netConversionBenefit -77,691
```
≈ **2 years of phantom longevity and a $177,352 understatement of retirement-phase tax**, purely
from an un-refreshed default. `retStateRate` (App.jsx:232) feeds `retPhaseBase.retStateRate`, so
this reaches the engine, the RMD schedule, the conversion benefit and the Monte Carlo lens.
No test anywhere sets `selectedState` and then reads `retirementState`.

---
## VERIFIED FINDING D (MEDIUM-HIGH) — `ssOverride` is honoured on the claim-age leg but NOT on the delay-to-70 leg, so pinning your own SS estimate silently kills the "delay SS" strategy
`ssOverride !== null` is resolved in `retirement-income.js:33` (`effectiveSS`), which flows into
`householdSS`/`ssAtRet`/`ssTaxableRet`. But the age-70 companion `ss70Annual`
(`retirement-income.js:53`) is re-derived from `ssPIA` and never consults `ssOverride`, so
`ss70DrawReduction = Math.max(0, household70SS − householdSS)` clamps to 0 as soon as the override
exceeds the computed age-70 benefit.

**Printed repro** (`zz-auto-probe5.test.js`, PROBE 8): default household, `ssClaimingAge = 62`:
```
                       no override      ssOverride = 90,000
ss70DrawReduction        25,980      ->        0
delayGainYrs                  2      ->        0
delayApplicable            true      ->    false
withdrawalRate            4.775%     ->    3.380%   (honours the override)
wr70                      4.132%     ->    4.132%   (does NOT honour it)
```
Two consequences: (1) the whole "delay SS to 70" card disappears for anyone who pins their own SS
figure; (2) `withdrawalRate` and `wr70` end up on **different SS bases**, so the UI shows a
withdrawal rate that is HIGHER at 70 than today — i.e. delaying reads as strictly worse, which is
the opposite of the truth. Same class as CLAUDE.md rule 11's "a display site describing another
already-converted value must read the SAME figure".
Files: `src/model/retirement-income.js:33` vs `:53-55`; consumers `src/App.jsx` `ssView`
(`ss70DrawReduction`, `wr70`, `delayApplicable`, `delayGainYrs`).

---
## VERIFIED FINDING E (MEDIUM-HIGH) — `incomeGrowthEndAge` has FOUR independent resolution sites; two lack the `Math.max(0, …)` guard the other two have, so a stale value discounts income BACKWARD
The sentinel is `null` = "grows until retirement". Every consumer re-implements the resolution:

| # | site | formula | negative guard |
|---|------|---------|----------------|
| 1 | `social-security.js:20` (`calcAIME`) | `Math.min(y, end - currentAge)` | **NO** |
| 2 | `simulation.js:26` (`projectedIncomeAtAge`) | `Math.min(age - currentAge - 1, end - currentAge)` | yes (`Math.max(0,…)` line 33) |
| 3 | `simulation.js:108` (`growthYears`, the OTHER earner's income) | `Math.min(y - 1, end - currentAge)` | **NO** |
| 4 | `simulation.js:117` (`clockYears`, the subject's own salary) | `Math.min(growthClock, end - currentAge)` | yes (line 120) |

Sites 1 and 2 also differ by one year of growth for the same plateau age (`min(y, …)` vs
`min(age-currentAge-1, …)`), so the SS earnings record and the projected-salary table disagree
about what "income stops growing at age N" means.

**Reachability — App never re-clamps the stored value.** `profileBundle.incomeGrowthEndAge`
(App.jsx:1830) declares `min: currentAge + 1`, but `setCurrentAgeCoupled` (App.jsx:1391) clamps
`lifeExpect`, `ssClaimingAge`, `retirementAge` and all four `contribEnd*` — and **not** this field
(contrast App.jsx:1424/1439, where exactly this clamp WAS added for `spouseRetirementAge`).

**Printed repro** (`zz-auto-probe7.test.js`): currentAge 40, income $150k, set the plateau to 45,
then raise currentAge to 50 (a single slider drag):
```
stored incomeGrowthEndAge : 45   (its own bounds are now min 51, max 65 — OUT OF RANGE)
sim salaries (guarded)    : 150000,150000,150000,...        <- flat, correct
ssAIME                    : 4,621.12   ssMonthly 2,225 / ssAnnual 26,700
control (plateau=null)    : ssAIME 6,250.83  ssMonthly 2,746 / ssAnnual 32,952
```
The honest flat-salary AIME is 5,357 (15 yrs x 150,000 / 35 / 12); `calcAIME` reports **4,621**
because its unguarded exponent is `1.03^-5`. The SAME household's sim rows say the salary is
$150,000 while `calcAIME` prices the same year at $129,383 — two resolution sites of one sentinel
disagreeing inside one render. Cost: **-$521/month of Social Security for life**.

---
## VERIFIED FINDING F (MEDIUM) — `incomeGrowthEndAge` is a PRIMARY-frame age but is passed unchanged into the SPOUSE's `runSimulation`, whose age frame is the spouse's
`src/App.jsx:364` passes the primary's `incomeGrowthEndAge` into the spouse's sim, where
`currentAge` is `spouseCurrentAge`. Both site 3 and site 4 above then evaluate
`incomeGrowthEndAge - spouseCurrentAge`, which is a different number of calendar years — and goes
negative for any spouse older than the plateau age.

**Printed repro** (`zz-auto-probe6.test.js`): primary 40 (plateau set to 50 = 10 calendar years
out), spouse 55, both $100k, spouse 401k $10k/yr:
```
primary sim : plateau at primary age 50   -> salaries 100000..130477 then flat  (correct)
spouse sim  : cap = 50 - 55 = -5
   spouse's OWN salary  : frozen at 100,000 from year 1 (clockYears clamps to 0)
   other-earner term    : 100,000 x 1.03^-5 = 86,261 and SHRINKING (unguarded, site 3)
   spouse tradGross at the end of the walk: 1,208,683  vs  1,369,266 with no plateau
                                          = a $160,583 (11.7%) understatement
```
The plateau should land at spouse age 65 (the same calendar year as primary age 50), not
immediately. Correct fix is a shared, frame-aware resolver — the same "one implementation, not two"
treatment `resolveSpouseRetAge` got.
