# Why did "retirement state never follows work state" survive? — root causes + sweep

**Started 2026-11-14.** Owner question: how could an error this obvious (audit-auto-resolution
Finding C — changing your work state leaves the retirement state on Texas, 0% tax) go uncaught
across 1,408 tests, four golden masters and many adversarial review rounds? This file records
(1) the candidate causes, (2) each cause turned into a search "lens", (3) what each lens found
when applied to the rest of the codebase. Written INCREMENTALLY (CLAUDE.md Save Points) — every
finding is appended the moment it is verified, with its evidence.

Status of each finding: **VERIFIED** (reproduced against current code with a printed number or
an exact code reference) or **SUSPECTED** (not yet reproduced). Nothing here is fixed yet.

---

## Part 1 — How Finding C got through

Finding C, re-confirmed against current code 2026-11-14: `src/App.jsx:116`
`const [retirementState, setRetirementState] = useState(selectedState);`. React runs a
`useState` initializer once, at first render, when `selectedState` is still its hardcoded
default `"TX"`. Neither the Classic `<select>` (`App.jsx:3148`) nor the Horizon setter
(`App.jsx:1930`) for the work state touches `retirementState`. Nothing ever re-syncs it.

Eight causes, each checked against the repo, not assumed. Each one became a search lens in Part 2.

1. **The code reads correctly and behaves differently.** `useState(selectedState)` reads to
   any reviewer as "defaults to your work state". What it actually means is "defaults to
   Texas". Reading the code is the wrong tool for this bug class. Only running it
   (change one input, read the other) shows the gap. → **Lens 1**
2. **The default is a no-op, so every default-based test is blind.** TX is 0% in BOTH tax
   tables (`STATE_TAX` and `RETIREMENT_STATE_TAX`). At the default, work state = retirement
   state = TX, and the bug changes no number. All four golden masters and the shipped default
   household are TX. → **Lens 3**
3. **The one non-TX fixture tested the opposite scenario, and went around the user's path.**
   T-X.3 (`spouse-household.test.js:763`) sets `retirementState = "CA"` directly while leaving
   the work state at TX: someone who works in Texas and retires to California. That is the
   inverse of the bug, and it never exercises "user picks a work state". Its comment
   (`:730-731`) says it "exercises calcStateTax's table path". **That is false:
   `calcStateTax` has no production caller at all** (see cause 4).
4. **The tested function is not the function production uses.** `calcStateTax`
   (`src/model/taxes.js:76`) has 7 assertions in `taxes.test.js` covering both tables, but
   its only callers are tests. Production computes working state tax in
   `tax-basis.js:42-44` and retirement state tax as `RETIREMENT_STATE_TAX[...]` at
   `App.jsx:232`. The suite's state-tax coverage therefore certifies dead code. → **Lens 4**
5. **No test follows a user's journey through an input.** Every test either hand-builds
   model inputs (`golden-master.test.js`) or sets each field directly. No test is shaped as
   "the user changes X; assert everything that should follow X did." → **Lens 6**
6. **Reviews are diff-scoped and axis-scoped.** The line predates this repo's git history:
   it is already present in `56803cd` (2026-06-16), where App.jsx arrives whole, and it has
   not been in a diff since. Every adversarial review since reviewed a DIFF, and every audit
   was scoped to a named axis: spouse scope, dollar basis, preview/commit parity. The first
   audit ever pointed at "defaults and auto-resolution" (2026-09-05) found it at once.
7. **It was explicitly checked once and declared "fully wired."** `docs/HISTORY.md:179`
   (2026-06-10): feature #51 was removed from the tracker because "retirementState [is]
   already fully wired". The same claim is repeated in `feature-tracker.html`'s #52 entry.
   "Wired" was checked forward (control → engine), never as "does its default track what it
   claims to track". A "done" verdict then stopped anyone looking again. → **Lens 8**
8. **The UI never shows the two values side by side.** Horizon puts "Home state" in the
   *Income & job* card and "Retirement state" in the collapsed *Assumptions* card. That
   card's summary line shows return, inflation and plan-to age, but not the state.
   Classic puts them ~370 lines apart in different panels (the retirement one under
   "Tax Rate Phases"). A user has no on-screen cue that the plan assumes they retire to
   Texas. → **Lens 7**

**The common thread:** every safety net checked *what is there* (does this line compute
correctly; does this control reach the engine) and none checked *what should move together*
(when X changes, does Y follow). The tests lock values at one fixed default, and that default
happens to be the one input value where this bug cannot show.

## Part 2 — Lenses applied to the rest of the code

Method: two throwaway probes (`src/__tests__/zz-oversight-sweep.test.js`,
`zz-oversight-retest.test.js`, gitignored) mount the REAL App and drive it only through the
same setter bundles the Horizon screens use. One records which of ~69 headline numbers move
when each of the 63 inputs changes (single and married households). The other pushes the age
controls around and checks every input against its own declared min/max. Every "nothing
moved" result was then re-tested under conditions where that input SHOULD matter, so
by-design no-ops (spouse fields for a single filer, formula-match fields in flat mode) are
separated from real ones.

### Lens 1 — values seeded once from another input (Finding C's mechanism)

`grep useState(` for non-literal initializers, 30 hits, each read.
- **App.jsx:116 `retirementState`**: Finding C. **VERIFIED** by mount: work TX→CA leaves
  retirement TX; `yearsSustained` 21.65 → **27.34** (phantom). Setting retirement CA as well
  gives 25.38.
- **`WhatIfPanel.jsx:69,75,76`** (Classic only): `eventAge`/`affAge` = `currentAge + 5` and
  `targetAge` = `safeLifeExp`, all seeded at mount. The panel is always mounted, so after a
  user changes their age or plan-to age, the affordability check still targets the OLD
  plan-to age ("doesn't sustain to age 95" for a plan to 90). The HTML `min` on the inputs
  does not clamp stored state. **VERIFIED by code** (no re-sync anywhere); low impact
  (Classic, secondary panel).
- Clean: `DeferredInput` (re-syncs via a ref), `LifeEventSheet` (remounts per open),
  onboarding `vals` (one-shot by design), theme/window/tab state.

### Lens 2 — coupling gaps: a dependent value left outside its own bounds

Bounds check after user moves; **6 of 13 sequences left a stored value out of range**:

| Sequence | Result | Status |
|---|---|---|
| Plateau 45, then current age 50 | `incomeGrowthEndAge` 45 < min 51 | Known: audit Finding E |
| Plateau 60, then retirement age 50 | `incomeGrowthEndAge` 60 > max 50 | New direction of E; harmless (growth stops at retirement anyway) |
| **Onboarding `commitPlan(currentAge 72, retire 75)`** | `ssClaimingAge` 67 < min 70 | **NEW, VERIFIED** — see below |
| Income 400k → living 300k → income 40k | `livingExpenses` 300,000 > max 35,935; flows into `effectiveExpenses` = 300,000 | New, low — it is the user's own number, but nothing re-checks it after income drops |
| HSA family → contrib 8,000 → self-only | `hsa.contrib` shows 8,000 > max 4,400 | New, low — the sim caps it (rule 4), so totals are right but the field shows a number the model isn't using |
| The other 8 (age trio, spouse ages, pension, SS) | ok | — |

**NEW — onboarding uses the un-coupled age setter.** `commitPlan` (`App.jsx:1392`) calls bare
`setCurrentAge(ca)`, not `setCurrentAgeCoupled`. It's the exact twin of a bug already fixed
in the same function for retirement age (`docs/BUGS.md` → the PR #52 CodeRabbit entry: "No new
test"). Only the instance was fixed, not the class. Measured: the same household
(age 72, retire 75, $5k/mo) gives `yearsSustained` **4.73** via onboarding vs **3.82** via
the normal controls, because onboarding leaves SS claiming at 67 when the user is 72.

### Lens 6 — inputs that don't reach what they should (empirical propagation sweep)

**NEW, HIGH — the first-run wizard asks "How much have you saved so far?" and discards the
answer.** `OnboardingScreen` (`HorizonShell.jsx:197`) asks it, shows it back on the confirm
screen as "Savings today" (`:302`), then `handleSave` (`:289-296`) sends only
age/income/retire-age/monthly-spend, and `commitPlan` has no parameter for it. **VERIFIED**:
committing with an answer of $900,000 leaves `currentTotalSaved` at the default **165,000**.
Every new Horizon user (shown whenever `hz-onboarded` is unset, `HorizonShell.jsx:581`) gets
a plan built on $165k of savings regardless of what they told it. It was missed because
onboarding was audited for keyboard access (BUG-49) and retirement-age coupling (PR #52), and
never for "does every answer land".

Inputs that moved nothing, each re-tested under conditions where it should matter:

| Input | Re-test result | Verdict |
|---|---|---|
| **Living expense growth** (shown in BOTH UIs) | 3% → 8%: nothing moves | **Real dead control.** BUG-91 (Resolved) noted it and called it "not a live bug … nothing currently silently ignores a user's input". That is backwards: a visible control that ignores the user IS silently ignoring input. No Open entry tracks it. |
| **Conversion tax source** | converted → taxable: nothing moves | Known (BUG-37, accepted). The control is still offered in the UI though. |
| **Roth contribution end age** at default | 65 → 55: nothing moves | **NEW, MEDIUM, VERIFIED** — explained below |
| Savings-surplus % | nothing moves in the plan | By design: feeds the suggested "optimized" scenario only. Horizon labels it under *Assumptions* as "share of leftover income to invest", which reads as a plan input — wording, not a bug. |
| Health (marketplace, Medicare, premium, household size) | nothing moves in headline numbers | By design: they drive the conversion screen's ACA-cliff / IRMAA warnings and the optimizer, not retirement spending (BUG-149 already tracks their basis). |
| Portfolio target | nothing moves | By design: milestone marker only. |
| Spouse fields (single), match-formula fields (flat mode), contribution end ≥ retirement | nothing moves | By design: gated. All move when un-gated (re-tested). |

**NEW, MEDIUM — the Roth IRA income phase-out is frozen at 2026 limits while salary grows,
so the DEFAULT user stops contributing at age 53.** Measured from `simData` at the shipped
default: `cRoth` = 7,000 every year to 50, then 5,270 (51), 2,507 (52), **0 from 53 to 65**.
The salary grows 3%/yr nominal while `ROTH_PHASEOUT_2026` (`irs-2026.js:70`) is never
indexed, but the IRS indexes it to inflation every year. With the default 4% inflation the
user's REAL income is falling, so in reality they would never be phased out. This is the
same simplification as BUG-100 (tax brackets not inflated) in a site BUG-100 doesn't list
(`simulation.js:206`). It was invisible because a sweep of "Roth end age" shows no effect,
and nobody asked why.

### Lens 3 — paths switched off at the default, and inputs no test drives through the real App

The App glue layer (`App.jsx`: 5,225 lines, ~275 top-level hooks) sits between the model
(tested with hand-built inputs) and the screens (tested with fake bundles). Only 17 of the
65 test files mount the real App. **Of the 63 user inputs, 23 are never set through the
real App by any test**, including the work state itself (`profile.selectedState`): it is
covered only by `tax-basis.test.js` (model, hand-built, TX only) and
`my-details-screen.test.js` (a fake bundle). That is exactly where Finding C lived. The others:
spouse income growth, other pre-tax deductions, living expenses, living-expense growth,
portfolio target, all four HSA fields, extra pre-tax balance, all eight match fields
(both people), spouse taxable account, spouse-sole-beneficiary, conversion bracket target,
conversion tax source, marketplace premium, person on Medicare, deploy-surplus %.

None of the four locked fixtures has a money event or a working-year conversion event; only
T-X.3 has a pension or a non-TX state; none has a non-TX **work** state.

### Lens 4 + mutation testing — tests that pass no matter what the code does

Exported model code with no production caller (tests only): **`calcStateTax`** (see Part 1,
cause 4), `findOptimalConversion` (superseded by `findOptimalConversionPlan`),
`buildCommitPlanPreview` (orphaned since #121/#122), `totalConversionRequested`
("test sanity only"), `FICA_RATE`. Tests on dead code count toward 1,408 but protect nothing.

**Mutation testing.** I broke one line at a time, ran the full suite, and restored the file.
That is the decisive check, and it is the one that would have caught Finding C directly:

| Deliberately broken | Tests failing (of 1,408) |
|---|---|
| **Work-state income tax lookup → 0% for every state** (`tax-basis.js:42`) | **0** |
| Other pre-tax deductions ignored (`tax-basis.js:35`) | **0** |
| Spouse income growth replaced by a constant in the primary's sim | **0** |
| Extra pre-tax balance (`addlPreTaxBal`) dropped from the retirement balance | **0** |
| RMD joint-life table (spouse sole beneficiary) disabled | **0** |
| Work state not passed to working-year conversion events | **0** |
| Retirement-state rate → 0 (`App.jsx:232`) | 1 (T-X.3 only) |
| Primary HSA family limit disabled | 1 |

Six real, user-visible calculations can be deleted outright without a single test noticing.
"1,408 tests green" says the code still does what it did, *where tests look*. It says nothing
about these paths.

### Lens 5 — test comments that claim coverage

T-X.3's "exercises calcStateTax's real table" is verifiably false (Part 1, cause 3).
45 test comments make "exercises / locks / covers" claims. The mutation table above is the
mechanical way to check such a claim, and the repo already does exactly that for bug fixes
("revert-and-confirm"). It has never been applied to fixture claims or to existing coverage.

### Lens 7 — the two UIs and the onboarding path

- Married vs filing status is the same shape as Finding C (two inputs, one fact), and it IS
  handled: a mismatch notice (`spouseFilingMismatch`, BUG-81). Work state vs retirement
  state has no such notice. The precedent for guarding this class existed and wasn't
  generalised.
- Onboarding: see Lens 6 (savings answer discarded) and Lens 2 (un-coupled age setter).
  Onboarding also never asks for a state, so a Horizon user who never opens My details is
  modelled as a Texan (0% state tax) through work AND retirement.

### Lens 8 — "done" verdicts that stopped anyone looking again

Two checked, **both wrong**: #51 "retirementState already fully wired" (Finding C), and
BUG-91's "nothing currently silently ignores a user's input" about `livingExpenseGrowth`
(Lens 6). Each closed a question by explaining it away, and nothing re-checked it.

---

## Part 3 — Structural fixes (what would have caught all of this)

1. **An input-propagation test** (the sweep above, made permanent): every user input, set
   through the REAL App in a household where it applies, must move at least one output.
   Otherwise it sits on an explicit allow-list with a written reason. This catches dead
   controls and broken wiring the day they appear.
2. **A bounds-invariant test**: after scripted user moves (ages up and down, coverage
   switches, onboarding commit), every stored value must sit inside its own declared
   min/max. This catches coupling gaps like Finding E and the onboarding age bug.
3. **App-level wiring tests for every input in the mutation table**, each verified by
   re-running that mutation and watching it fail.
4. **One implementation per calculation**: delete test-only copies like `calcStateTax`, or
   route production through them, so tests can't certify code nobody runs.
5. **"Auto" defaults as an explicit sentinel** (`null` = follow X, resolved in one place),
   the pattern `spouseRetirementAge` / `incomeGrowthEndAge` / `stateRateOverride` already
   use, never `useState(otherValue)`.
6. **Any audit that declares something "wired" or "not a bug" must name the test that
   proves it.**
