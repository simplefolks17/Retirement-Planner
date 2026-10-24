# Consolidation redo plan — PR #58's five items, re-derived against current `main`

**Status:** ready to start. Written 2026-10-24 when PR #58 was closed unmerged.
**Precedent:** this is the same "single start-here doc" pattern as
`docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md` and
`docs/SESSION-B-MONTE-CARLO-ENGINE-PORT-PLAN.md` — both written at the close of one PR,
worked end-to-end by the next session, then marked DONE and retained as history.
**Baseline:** `main` at `def91f8` + the roadmap reconciliation (`5990b17`). 1,408 tests
green, lint clean, build OK.

---

## Why this doc exists

PR #58 ("Consolidate percent/rate, verdict→tone, inputs, clamp, ids", opened 2026-07-24
against `b1f07e3`) was never merged. By 2026-10-24, `main` was **29 commits ahead** through
PRs #59, #62, #64, #66, #67 and #68, and across the 32 files that PR touches `main` had
moved **+7,139 / −2,046 lines** — against the PR's own +415 / −169.

The owner's call was to close it and redo the work rather than rebase it, for a specific
reason worth keeping in front of whoever picks this up: **three of those intervening PRs
were bug-fix arcs** (the spouse engine, the dollar-basis fix, the Horizon design review)
whose fixes live in the same files — often the same functions — that PR #58 rewrites. A
rebase of a mechanical sweep across that much drift does not fail loudly; it silently
reverts fixes. That is the failure mode being avoided.

**The PR's inventory was good and is preserved below.** Only its diff is unusable. Every
claim in the table was re-verified against `main` on 2026-10-24, with current file and line
references. Do not re-derive it; do verify a line reference before editing it, since these
drift (see BUG-84's lesson in `docs/BUGS.md`).

---

## Already landed independently — do NOT redo

| Item | Status |
|---|---|
| `MAX_MONEY_EVENTS` write-surface guard | **Done, and sited better than PR #58 proposed.** The limit lives in `src/config/irs-2026.js` (CLAUDE.md rule 1's correct home), consumed by `src/model/money-events.js`, `src/components/MoneyEventsPanel.jsx`, `src/horizon/GoalsPanel.jsx`, with a test in `src/horizon/__tests__/goals-panel.test.js`. |
| Shared `kbActivate` key handler | **Done** in PR #66's accessibility pass (BUG-49). `src/horizon/shared.jsx`, used by `SomedayScreen`/`SettingsScreen`/`PlanScreen` + 1 more, covered by `keyboard-access.test.js`, `touch-targets.test.js`, `someday-screen.test.js`. |

---

## The work — four mechanical sweeps, then one design item

Sequenced **smallest blast radius first**, each independently shippable, each its own
commit with its own test. The point of the ordering is attribution: if something regresses,
it belongs to one sweep, not to a five-part mega-diff. Do not batch them.

### Sweep 1 — one `mintEventId()` (smallest; start here)

**Live, and worse than PR #58 found it: 4 minting sites, not 2.**

| Site | Mints |
|---|---|
| `src/components/MoneyEventsPanel.jsx:16` | `Date.now() + Math.random()` — **number** |
| `src/components/ConversionEventsPanel.jsx:14` | `Date.now() + Math.random()` — **number** |
| `src/App.jsx:2633` | `Date.now() + Math.random()` — **number** |
| `src/horizon/LifeEventSheet.jsx:195` | `String(Date.now())` — **string, and no randomness at all** |

Two defects, not one: mixed types land in the same arrays (so an `===` id lookup can miss),
and the string site has no entropy, so **two events created in the same millisecond
collide**. Fix: one exported `mintEventId()` returning a unique string, in
`src/model/money-events.js`, called by all four sites.

Test: unique across a tight loop, and stable type. File it as a bug first (next free id is
**BUG-151** — the highest in `docs/BUGS.md` is BUG-150). **Do not reuse "BUG-77"**, which is
what PR #58's own `docs/BUGS.md` diff called this: that number now belongs to the spouse
balance re-seed fixed in PR #59, and merging as-is would have put two bugs under one id in
the permanent record.

### Sweep 2 — draft-then-commit on the two event panels

**Live, verbatim.** `src/components/MoneyEventsPanel.jsx:90` writes
`Number(e.target.value)` for an age **straight into committed state, unclamped** — typing
"65" runs every model memo on `age = 6` for a frame, i.e. a full model run on garbage per
keystroke. `src/components/ConversionEventsPanel.jsx:73` has a `Number.isFinite` guard but
still no clamp to its own `min`/`max`.

This is the only item with a real behavioural claim, and the cleanest standalone fix: both
panels onto the existing shared `src/components/DeferredInput.jsx` (draft locally, clamp and
commit on blur/Enter). Its current signature is
`{ value, min = -Infinity, max = Infinity, onChange, style }` — it needs optional
`placeholder` and `aria-label` passthrough, which is the whole extension required.

Test the invariant, not the keystroke: an intermediate value must not reach committed state.

### Sweep 3 — shared `clamp(v, min, max)`

Absent from `src/model/finance-math.js`; the only `clamp` in the tree is a local one in
`src/components/ArcGraph.jsx`. Add it to `finance-math.js`, normalising `min > max → min`
(the `ssClaimingAge` / BUG-63 corner where the two inline operand orders disagree), and
migrate the two-sided inline `Math.min(Math.max(...))` clamps onto it.

**Leave the deep model-engine compound expressions alone** — PR #58 drew that line
deliberately for golden-master risk, and that judgement still holds.

### Sweep 4 — percent/rate formatting (largest; do it last)

**Live, and worse than PR #58 found it.** `fmtRate` still does not exist;
`src/formatters.js` exports `fmt`, `fmtFull`, `fmtSigned`, `fmtMonthly`, `fmtMo`, `fmtPct`
only. **39 hand-rolled percent sites** remain, across `src/model/action-cards.js`,
`src/model/apply-preview.js`, `src/components/TaxPhaseCard.jsx`, `src/App.jsx` and
`src/horizon/screens/strategies/SSTimingFlow.jsx`. The private `fmtPercent` duplicate that
PR #58 deleted is **now in two places** — `src/model/apply-preview.js` *and* `src/App.jsx`.

The underlying fault is a **unit** one: some scalars are fractions (0.237), some are already
whole percents (23.7), and the call sites disagree about which. That is CLAUDE.md rule 11's
discipline one axis down, so treat it the same way:

- `fmtRate(fraction, dp = 1)` beside the existing `fmtPct(wholePct, dp)`; delete both
  `fmtPercent` copies.
- **Write the canonical precision down, per scalar, in a doc** (`docs/DESIGN.md` or
  `docs/HORIZON.md`) — not only in code. PR #58 chose: computed/blended rates 1-dp
  (`effectiveRMDTaxRate`, `fedEffective`, `combinedEffRate`, `stateRate`, `yr1TradRate`,
  real return); statutory brackets whole (`fedMarginal`, `projectedRetBracket`);
  already-whole percents via `fmtPct` (`withdrawalRate`, `wr70`). Re-confirm each against
  current code, then record it. Undocumented, it will drift again — that is how it got here.
- Add the **guard test** PR #58 wrote: fail on any `.toFixed(<digit>)}%` outside
  `formatters.js`.

**This sweep changes rendered output** (PR #58's example: Numbers→Taxes `effectiveRMDTaxRate`
`24%` → `24.0%`, to match the RMD flow, which is the point — the same value rendered two
ways was the bug). Two consequences:

1. The four golden masters lock **model** values, so three of them should not move — but
   `src/__tests__/golden-master-app-wiring.test.js` **mounts the real App and asserts
   rendered headline numbers**, so a formatting change genuinely can move it. Check it, and
   if it moves, re-lock deliberately with the reason recorded, per rule 7.
2. Do this sweep **last**, with sweeps 1–3 already green, so a rendered-value movement is
   unambiguously attributable to formatting.

### Item 5 — verdict→tone maps: back to design, NOT implementation

`VERDICT_TINT` is still in `src/horizon/fields.jsx` and `toneToken` does not exist, so the
duplication PR #58 identified is real and still live. **But its conclusion must be
re-derived, not re-applied.** PR #66 rebuilt the tone system underneath it — BUG-112's
12-palette/mode contrast fix, computed rather than eyeballed — and `src/horizon/shared.jsx`
has moved **+231 lines** since. "unaffordable → accent" was a correct call against the old
palette; whether it is still correct against the current one is a question to answer with
the contrast numbers, not an edit to port.

Treat it as a small design pass with an owner check-in, and only then an implementation.

---

## Working agreement (carried forward, unchanged)

- **Opus for diagnosis, planning and adversarial review; Sonnet for mechanical
  implementation.** These four sweeps are the mechanical kind.
- **Never accept an agent's self-report.** Re-run `npm test`, `npm run lint`, `npm run build`
  and all four golden masters yourself.
- **Every behavioural fix carries revert-and-confirm evidence** — revert the fix, confirm the
  new test fails, restore — and the orchestrator re-runs that evidence directly rather than
  trusting the report.
- **Save Points** (CLAUDE.md): update and commit `docs/SESSION-STATE.md` at every checkpoint;
  any agent brief must require incremental writes to a named file as its first action.
- **`git stash` is unsafe here.** PR #58's own process note: a subagent's `git stash drop`
  transiently wiped the shared primitives mid-run. Non-isolated worktrees make stash
  dangerous with parallel agents.
- **Review reality:** no bot auto-reviews this repo any more (the Qodo trial ended;
  CodeRabbit stopped auto-reviewing — it needs 10+ stars and the plan moved Pro Plus → Team).
  Every review needs an explicit `@coderabbitai review` comment, and **a triggered review's
  findings are not closed by the push that happens to follow them** (that is how BUG-150 sat
  unaddressed for four weeks).
- **Log every fix in `docs/BUGS.md`** before merging, with root cause, files and fix.

---

## Explicitly NOT in scope for this session

Listed so they are not forgotten and not wandered into. All are sequenced in
`docs/SESSION-STATE.md`.

- **BUG-136** (Med-High) — the last known preview/commit parity gap. A retire-earlier preview
  converts $420k where committing the same change converts $1,020,000. Its bracket-fill half
  needs `calcBracketFillTargets` re-run against floors rebuilt at the scenario's age.
- **BUG-125** (Med) — per-person SS claiming-age gating. Owner already approved the model fix;
  deliberately sequenced behind BUG-136 (same function family, one shared fixture).
- **The three unmined audit reports** in `docs/audit-2026-09-05/` — `audit-auto-resolution.md`
  has 6 verified findings nobody has touched, two HIGH (`retirementState` seeded once and never
  re-derived; `spouseIncomeEndAge` frozen in scenarios), and its finding D sits next to BUG-150
  and may share a root. Plus parity findings 2/5/6/7 and `audit-test-coverage.md`, which flagged
  a CLAUDE.md rule-1 violation (hard-coded IRS constants in test assertions).
- **BUG-99** (Med) — money events still nominal against the corrected retirement-year walk.
- **Owner decisions pending:** BUG-142 (does "Your contributions" include the employer match?)
  and BUG-149 (where to convert healthcare costs — this one flips a Roth-conversion
  recommendation from "clearly worth it" to "a wash").

---

## Paste-able kickoff prompt

Kept here so it survives the chat it was written in.

> Read `CLAUDE.md` in full — the Critical Rules, the Save Points section, and the Session
> Close-Out procedure — then read `docs/CONSOLIDATION-REDO-PLAN.md`, which is the brief for
> this session.
>
> The task is the four mechanical sweeps in that doc, in its order, smallest first: one
> `mintEventId()`, then draft-then-commit on the two event panels, then a shared `clamp` in
> `finance-math.js`, then the percent/rate formatting consolidation. Each as its own commit
> with its own test. Do not batch them, and do not start sweep 4 until 1–3 are green — it is
> the only one that changes rendered output, and that needs to be attributable.
>
> Item 5 (verdict→tone) is a design question, not an implementation: PR #66 rebuilt the tone
> system underneath PR #58's conclusion. Come back to me with the contrast numbers before
> touching it.
>
> Before you start, verify the doc's line references against current code rather than
> trusting them — they are from 2026-10-24 and these drift. Tell me if any of the five items
> has since been fixed or has moved.
>
> Working agreement: Opus for diagnosis and review, Sonnet for the mechanical sweeps; never
> accept an agent's self-report — re-run `npm test`, `npm run lint`, `npm run build` and all
> four golden masters yourself; every behavioural fix needs revert-and-confirm evidence that
> you re-run directly. `git stash` is unsafe with parallel agents in this repo. Commit
> `docs/SESSION-STATE.md` at every checkpoint. Log every fix in `docs/BUGS.md` — the next free
> id is BUG-151.
>
> Everything under "Explicitly NOT in scope" in that doc stays out of scope unless I say
> otherwise. The goal is not to tackle everything at once; it is to close these five cleanly
> without disturbing what the last four PRs fixed.
