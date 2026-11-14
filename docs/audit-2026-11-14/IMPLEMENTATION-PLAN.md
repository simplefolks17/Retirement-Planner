# Implementation plan — oversight audit fixes + carried-over backlog (2026-11-14)

**Owner request (2026-11-14):** implement the changes found in
`docs/audit-2026-11-14/oversight-root-causes.md` plus those discussed earlier in the session
(audit-auto-resolution Findings A–F; `docs/CONSOLIDATION-REDO-PLAN.md` sweeps 1–4), using
Sonnet agents for implementation, then a deep Opus review of the whole result.

**Branch:** `claude/oversight-root-cause-audit`. **Baseline:** 1,408 tests green, lint clean,
build OK, at commit `HEAD` when this file was written.

**Owner decisions taken:**
- **Retirement state follows the work state unless the user sets it separately.** Proposed
  in-session; the owner's instruction to implement it counts as approval.
- Everything else here is a defect fix, a test, or the already-approved consolidation sweeps.

**Explicitly OUT of scope** (each still needs an owner call or is its own session):
BUG-125, BUG-136, BUG-142, BUG-149, BUG-37 (conversion tax source — owner-deferred), BUG-84/85,
BUG-99/100/101 (except the Roth phase-out piece below), CONSOLIDATION-REDO-PLAN item 5
(verdict→tone, needs a design check-in), and `livingExpenses` above take-home after an income
drop (it is the user's own number — accepted).

---

## Rules for EVERY implementing agent (non-negotiable)

1. **First action:** create `docs/audit-2026-11-14/impl-log-<BATCH>.md`. Append each step
   the moment it's verified: what changed, tests added, and the revert-and-confirm output.
   The session can be killed at any moment (CLAUDE.md → Save Points).
2. Read `CLAUDE.md` → Critical Rules before editing. In particular:
   - rule 1: IRS constants only in `src/config/irs-2026.js`;
   - rule 6: `src/model/` is pure functions;
   - rule 10: no arithmetic in `src/horizon/` screens;
   - rule 11: declare the dollar basis of every figure.
3. **Every behavioural fix ships with a test that fails without it.** Prove it:
   1. revert only the fix;
   2. run the new test and see it FAIL;
   3. restore the fix and see it PASS;
   4. paste both outputs into your log.
   Prefer App-level tests (mount the real App like `src/__tests__/contrib-series-wiring.test.js`)
   driven through the real setter bundles. A model-only test cannot see App.jsx glue, and that
   blind spot is how these bugs survived.
4. Before each commit run `npm test`, `npm run lint`, `npm run build`. All must be clean.
5. **Golden masters** (`src/model/__tests__/golden-master.test.js`,
   `src/__tests__/golden-master-app-wiring.test.js`, `src/__tests__/spouse-household.test.js`
   T-X.2/3/4):
   - They must NOT move unless your batch says they may.
   - If one moves unexpectedly, STOP, log it, and report back. Do not re-lock.
   - If a move is expected, re-lock only after recording each value's old → new, its
     direction, and the mechanism, in the test comment and in your log.
6. Commit small, self-contained units on the CURRENT branch (or your worktree branch). End
   each commit message with the attribution lines the orchestrator gives you.
   - **Do not push.**
   - **Never use `git stash`** (unsafe with parallel agents in this repo).
   - Do not edit `CLAUDE.md` test counts; the orchestrator reconciles them.
7. `docs/BUGS.md`: lane-1 batches add one **Resolved** entry per bug (root cause, files, fix,
   test, revert-and-confirm evidence) at the TOP of the Resolved section, using the pre-assigned
   ids below. Lane-2 batches do NOT edit `docs/BUGS.md`. Put the entry text in your impl log
   and the orchestrator will insert it.
8. Throwaway probes go in `src/__tests__/zz-*.test.js` (gitignored, excluded from `npm test`).
9. **Final report:**
   - commits (hash + subject);
   - tests added;
   - each revert-and-confirm result;
   - any golden-master movement with its mechanism;
   - anything not done, and why.
   Don't claim anything you did not run.

Pre-assigned bug ids (next free was BUG-151):

| id | what |
|---|---|
| BUG-151 | Retirement state never follows the work state (audit Finding C) |
| BUG-152 | Onboarding discards the "How much have you saved?" answer |
| BUG-153 | `commitPlan` uses the un-coupled `setCurrentAge` (onboarding) |
| BUG-154 | `ss70Annual` ignores `ssOverride` (audit Finding D) |
| BUG-155 | `incomeGrowthEndAge` has four resolution sites, two unguarded, never re-clamped (Finding E) |
| BUG-156 | `incomeGrowthEndAge` passed in the primary's age frame into the spouse's sim (Finding F) |
| BUG-157 | `whatIfSimInputs.spouseIncomeEndAge` frozen at the base plan inside scenarios (Finding A) |
| BUG-158 | `spouseSimData` frozen under "auto" spouse retirement in scenarios (Finding B / parity Finding 2) |
| BUG-159 | Roth IRA phase-out thresholds never indexed: default user stops Roth contributions at 53 |
| BUG-160 | "Living expense growth" control shown in both UIs, consumed by nothing |
| BUG-161 | HSA contribution left above the limit after switching coverage family → self |
| BUG-162 | Classic What-If panel seeds ages once and never re-syncs |
| BUG-163 | Event ids minted 4 different ways; one has no entropy (sweep 1) |
| BUG-164 | Event-panel age inputs commit unclamped values on every keystroke (sweep 2) |
| BUG-165 | Horizon "Portfolio target" control has no Horizon consumer (found verifying L1-F) |

---

## Batches

Lane 1 runs sequentially on the branch. Lane 2 runs in parallel in an isolated worktree on
files lane 1 doesn't touch, and is merged by the orchestrator.

### L1-A — BUG-151 + state-tax test integrity
- Make `retirementState` an explicit "auto" sentinel: `null` = same as the work state.
  - Resolve it ONCE in App.jsx (`effectiveRetirementState = retirementState ?? selectedState`)
    and feed that to `retStateRate` and every other consumer.
  - The bundle's `value` is the effective state; its `set` snaps to `null` when the picked
    state equals the work state. This mirrors `spouseRetirementAge` / `stateRateOverride`.
  - Expose a model-provided flag (e.g. `retirementStateIsAuto`) so screens can label it
    "Same as home state" without comparing values in JSX (rule 10).
  - The Classic `<select>` (App.jsx ~3517) must behave the same way.
- Remove the test-only `calcStateTax` (`src/model/taxes.js:76`) and move its meaningful
  assertions onto the PRODUCTION paths:
  - `calcTaxBasis` with real non-TX states;
  - an App-level test that the retirement state follows the work state, and stops following
    once set separately;
  - an App-level test that changing the work state to CA changes take-home.
- Fix T-X.3's false comment (`spouse-household.test.js:730-731, 763`): it sets a non-TX
  RETIREMENT state only. Its values must not move: it sets retirement=CA with work=TX, which
  stays an explicit, non-auto choice.
- Revert-and-confirm both mutations from the audit: work-state lookup → 0, and
  `retStateRate` → 0. Each must now fail at least one test you added.
- Golden masters: none may move (default is TX/TX).

### L1-B — onboarding + small coupling fixes (BUG-152, 153, 160, 161, 162)
- **BUG-152:** onboarding's "How much have you saved so far?" answer
  (`src/components/HorizonShell.jsx` `handleSave`) must reach the model.
  - Add a `totalSaved` option to `commitPlan` (App.jsx).
  - When it differs from the current household total, scale the PRIMARY's four balances
    proportionally so the household total equals the answer, keeping spouse balances as
    they are; clamp at ≥ 0.
  - If the primary's balances are all 0, put the amount in the taxable account.
  - If the answer is unchanged, touch nothing (no rounding drift).
  - Document the rule in a comment and in `docs/ARCHITECTURE.md`'s `commitPlan` row.
- **BUG-153:** `commitPlan` must use `setCurrentAgeCoupled`, not bare `setCurrentAge`.
  Beware stale closures when it then calls `setRetirementAgeCoupled`. Prove, via the real
  App, that after `commitPlan({ currentAge: 72, retirementAge: 75, ... })` every bundle
  field is within its own min/max, and that the result equals the same values entered
  through the normal coupled setters (the audit measured yearsSustained 4.73 vs 3.82).
- **BUG-160:** "Living expense growth" is consumed by nothing.
  - Remove the control from both UIs (Classic slider at App.jsx ~3263; Horizon
    `MyDetailsScreen.jsx:117`), along with its state and bundle field.
  - Note in BUGS.md that wiring it would be a feature, not a fix.
  - Remove it from any screen-test fake bundles.
- **BUG-161:** switching `hsaCoverageType` family → self must clamp the primary's (and the
  spouse's) stored HSA contribution to the new limit, through a coupled setter. The sim
  already caps it (rule 4), so this is a display/state-consistency fix. Test that the field
  value equals the modelled value.
- **BUG-162:** `src/components/WhatIfPanel.jsx` seeds `eventAge`/`affAge`/`targetAge` once.
  Clamp them to the current bounds at use (or re-sync when the bounds change) so a changed
  age or plan-to age is honoured.
- Golden masters: none may move.

### L1-C — BUG-155 + BUG-156 (one frame-aware plateau resolver)
- One shared, pure resolver for the income-plateau rule, used by all four sites
  (`social-security.js` `calcAIME`, and `simulation.js` `projectedIncomeAtAge`, `growthYears`,
  `clockYears`).
  - It must take an explicit age frame and always guard negatives.
  - Pick ONE convention for the off-by-one disagreement between sites 1 and 2 and document
    it.
- In the spouse's `runSimulation` call (App.jsx ~364), the PRIMARY's plateau must apply only
  to the primary's income (the "other earner" term), converted to the spouse's age frame
  (same calendar year). The spouse's own salary has no plateau input, so it must not get
  the primary's.
- `setCurrentAgeCoupled` / `setRetirementAgeCoupled` must keep `incomeGrowthEndAge` within
  `[currentAge+1, retirementAge]`, or snap it to `null`, the way the bundle's own `set`
  treats `>= retirement`.
- Golden masters must not move (default plateau is null). Use the audit's printed repros
  (`docs/audit-2026-09-05/audit-auto-resolution.md` Findings E and F) as fixtures.

### L1-D — BUG-157 + BUG-158 (scenario re-derivation under "auto")
- **BUG-157:** in `src/model/what-if.js`, both scenario re-sims (`calcWhatIfDelta`,
  `calcWhatIfScenario`) must recompute `spouseIncomeEndAge` from the SCENARIO's resolved
  spouse retirement age (via `resolveSpouseRetAge`), not inherit
  `whatIfSimInputs.spouseIncomeEndAge`.
- **BUG-158:** under auto (`spouseRetirementAge === null`), the spouse's contribution end
  follows the primary's retirement age, so a scenario that changes the primary's retirement
  age must re-run the spouse's sim at the scenario's spouse contribution end.
  - Remove or correct the false invariant comment at what-if.js ~718.
  - The fix must be a no-op when `spouseRetirementAge` is explicit.
- Tests go in `src/__tests__/whatif-parity-wiring.test.js` (organised by invariant: preview
  X then commit X must agree) for a **spouse household under auto**. That is the gap parity
  Finding 7 named.
- T-X.4 (auto path) scenario locks may move. Allowed only TOWARD the committed truth:
  - prove the direction by comparing preview against commit;
  - record each old → new value;
  - re-confirm T-X.4 still fails on the BUG-127/134/138 reverts.

### L1-E — BUG-159 Roth phase-out indexing (golden masters WILL move)
- Index `ROTH_PHASEOUT_2026` thresholds (`src/config/irs-2026.js:70`) by the user's
  inflation assumption for each year after 2026 inside `runSimulation`
  (`src/model/simulation.js` ~206).
  - Add an `inflationRate` param, defaulting to 0, so hand-built callers keep today's
    behaviour.
  - Pass it from both App sims (primary + spouse) and from every scenario re-sim in
    what-if.js.
  - The IRS indexes these; the 2026 figures are nominal.
- Scope: the Roth phase-out ONLY. Brackets are BUG-100 and stay out of scope. Record that
  boundary in the BUG-159 entry and as an addendum on BUG-100.
- Expected: at the default, `cRoth` no longer drops to 0 at 53, and `totalAtRet` and the
  downstream numbers move UP.
  - Re-lock every golden master that moves, with old → new and the mechanism.
  - Verify each move by direct measurement, not assumption.
- Update `docs/FINANCIAL-MODEL.md` where it describes the Roth phase-out.

### L1-F — structural guard tests (the audit's Part 3), after A–E
- `src/__tests__/input-propagation.test.js`:
  - For every field in the App's setter bundles, set through the REAL App in a household
    where it applies, at least one headline output must move.
  - Fields that legitimately move nothing go on an explicit allow-list, each with a one-line
    reason (e.g. formula-match fields in flat mode, `conversionTaxSource` → BUG-37,
    `retirementTarget` → milestone display only).
  - A NEW bundle field not on either list must fail the test. Starting point:
    `src/__tests__/zz-oversight-sweep.test.js` + `zz-oversight-retest.test.js` (the
    orchestrator's probes; read them).
- `src/__tests__/bounds-invariant.test.js`: after the scripted user moves in the sweep probe
  (ages up and down, plateau, coverage switch, onboarding `commitPlan`, spouse ages), every
  numeric bundle field must sit within its declared `[min, max]`.
- App-level wiring tests for the inputs the mutation table showed unprotected: other
  pre-tax deductions, spouse income growth, extra pre-tax balance, the RMD joint-life table
  (spouse sole beneficiary, >10-yr gap), work state on working-year conversion events.
  Re-run each mutation from the audit's mutation table and confirm it now FAILS a test.
  Paste the outputs.

### L1-G — BUG-165, then sweep 3 (shared `clamp`) — `docs/CONSOLIDATION-REDO-PLAN.md` § Sweep 3, verbatim scope
- **BUG-165 first:** remove the "Portfolio target" field from Horizon `MyDetailsScreen` (Classic keeps it, where its milestone cards do use it). Update `input-propagation.test.js`'s allow-list reason to say "Classic-only; not rendered in Horizon". Add a guard that fails if a Horizon screen renders a bundle field that is on the allow-list as "Classic only".
### L1-H — sweep 4 (percent/rate formatting) — same doc § Sweep 4, verbatim scope; LAST

### Lane 2 (parallel, isolated worktree) — L2: BUG-154, then sweeps 1 + 2
- **BUG-154:** `src/model/retirement-income.js:53` must honour `ssOverride`. Treat the
  override as the annual benefit AT the chosen claim age, so the age-70 figure is
  `override × SS_FACTORS[70] / SS_FACTORS[claimAge]`. This keeps `withdrawalRate` and `wr70`
  on the same SS basis. Repro: audit-auto-resolution Finding D (default household,
  `ssClaimingAge` 62, `ssOverride` 90,000).
- **BUG-163 / BUG-164:** `docs/CONSOLIDATION-REDO-PLAN.md` Sweeps 1 and 2, verbatim scope.
- Do NOT edit `docs/BUGS.md` or `CLAUDE.md`. Put the BUGS entry text in your impl log.

---

## After all batches — Opus deep review
A fresh Opus agent reviews the full branch diff against `main`:
- correctness;
- gaps of the same classes this audit found (seeded-once defaults, coupling gaps, dead
  controls, tested-but-unused code, tests that can't fail);
- rule compliance (CLAUDE.md 1–11);
- golden-master movement honesty;
- anything else.

It must verify by EXECUTING (mount the App, run mutations), not only by reading.

---

## Round 2 — fixing the Opus deep review's findings (`opus-review.md`, R-1..R-13)

The owner asked for Sonnet implementation followed by Opus review. The review found 13 CONFIRMED
issues, and fixing them completes that request. The same rules apply to every agent (the "Rules
for EVERY implementing agent" section above). Pre-assigned ids continue from BUG-166:

| id | review | what |
|---|---|---|
| BUG-167 | R-4 (HIGH) | Wizard pre-fills "monthly spend (today's dollars)" with a retirement-year figure (3.95x); also freezes auto `annualExpenses` |
| BUG-168 | R-10 | REGRESSION from BUG-153: onboarding users 65+ stop contributing at currentAge+1; control-order dependence in `coupleContribEndAges` |
| BUG-169 | R-3 | `commitPlan` never bounds the retirement age it is given (70/60, 34/90) |
| BUG-170 | R-1 | Classic Retirement Age and Life Expectancy sliders are inline copies that bypass the coupled setters; the plateau coupling destroys a user's value |
| BUG-171 | R-5 | `allocateSavedTotal` can return a negative balance; the wizard parses "250k" as $250 |
| BUG-172 | R-7 | Spouse HSA field max under FAMILY coverage isn't the spouse's real share |
| BUG-173 | R-2 | Work-longer "Social Security / yr" ignores a pinned override and is primary-only |
| BUG-174 | R-8 | TaxTimeline renders `effectiveRMDTaxRate` at 0 dp (breaks BUG-166's rule) |
| BUG-175 | R-13 | Working-year conversion-event rows keep showing an event the model silently drops once retirement moves before its age |
| BUG-176 | R-9 | `calcWhatIfDelta` previews print ABSOLUTE before/after ages that contradict the headline in spouse-gap households (BUG-36 amendment + near-term display fix) |

### R2-A — onboarding + coupling (BUG-167, 168, 169, 170, 171, 172)
### R2-B — display/consistency (BUG-173, 174, 175, 176)
### R2-C — tests that can't fail + guards + docs (R-6, R-11, R-13's guard walker, R-12)

---

## Round 3 — fixing the second Opus review (`opus-review-2.md`, S-1..S-10)

Owner asked for token efficiency: `[judgement]` items go to Sonnet (R3-A) and `[mechanical]` items to
Haiku (R3-B). They run sequentially, because both touch App.jsx and BUGS.md. The same agent rules apply.

| id | review | tag | batch |
|---|---|---|---|
| BUG-178 | S-5 (HIGH, regression from BUG-167): the wizard's untouched spend answer is stale against a changed income answer, and the summary labels spending "Monthly income" | judgement | R3-A |
| BUG-179 | S-1 (regression from BUG-170): scenarios clamp the stored plateau to the BASE retirement age, so preview != commit | judgement | R3-A |
| BUG-180 | S-2: the BUG-176 anchor falls back to the blended walk's own figure for a sustainable plan made worse ("lasts to 81" next to "sustainable") | judgement | R3-A |
| BUG-181 | S-6: "not modelled" conversion events are excluded from what-if previews that would bring them back into range, so preview != commit | judgement | R3-A |
| BUG-182 | S-4: family HSA coverage doesn't reach the surplus optimizer, the HSA action card or the Classic slider; the surplus preview ignores the spouse HSA squeeze | judgement | R3-A |
| BUG-183 | S-3 (from BUG-177): editing a pinned SS figure re-anchors it to the current claim age | mechanical | R3-B |
| BUG-184 | S-7: `setSpouseCurrentAgeCoupled` overwrites an explicit spouse retirement age | mechanical | R3-B |
| BUG-185 | S-9: a $0 conversion event past retirement isn't flagged "not modelled" | mechanical | R3-B |
| (tests) | S-8: five on-screen halves deletable with 0 failures | mechanical | R3-B |
| (docs) | S-10: doc and comment corrections | mechanical | R3-B |
