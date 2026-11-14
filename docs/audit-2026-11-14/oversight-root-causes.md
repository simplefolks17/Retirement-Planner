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
_(in progress)_
