# Session B — Port the Monte Carlo Range Lens onto the Per-Account Engine

**Status: DONE — retired 2026-07-28.** Shipped on branch `claude/monte-carlo-engine-port-17l6gu`
in five gated batches per §2's process below: Batch 1 (`rRealByYear` engine change, zero
golden-master movement), Batch 2 (the port itself, merged with the caveat retirement per the
Step 2 audit's finding that splitting them would ship a false user-facing caveat), Batch 4
(threshold calibration — measured, decision: unchanged at 80/70, written up in
`docs/FINANCIAL-MODEL.md`), Batch 5 (this doc reconciliation pass). All five items in §3's
Definition of Done are met — see `CLAUDE.md` → Status for the full session entry and
`docs/BUGS.md` → BUG-93/BUG-94 for the caveat's superseded-by note. This document's job —
diagnosing the gap and sequencing the work — is done; it is kept only as a historical record of
the diagnosis and the two-agent (plan → independent audit) process that preceded implementation.
Do not add new work here; file it in `docs/BUGS.md` instead.

---

**Written:** 2026-07-27, at the close of PR #62 (spousal-engine stabilization + review battery,
merged to `main` as `6c5d32c`). **Purpose:** the single "start here" document for the next session.
"Session B" is a name this repo's docs have used since BUG-82 (see `docs/HISTORY.md`) for this exact
piece of deliberately-deferred work — deferred specifically so it wouldn't have to be recalibrated
twice once BUG-91 changed the spend basis. BUG-91 has now landed. This is next.

**How to use this doc:** read it once, then follow §2's process. Don't re-derive the diagnosis in §1 —
it's already verified against current code (file/line citations below).

---

## 0. Why this, why now

The bug backlog (`docs/BUGS.md` → "Open Issues — Index") has nothing urgent: 12 entries, all
Low/Medium except BUG-84 (owner already decided: stay deferred). This is a deliberate pivot from
bug-fixing back to roadmap work, per an explicit owner decision at PR #62's close.

Two roadmap items were both unblocked by BUG-91 landing; this one was picked because it pays down
**existing, user-visible technical debt** (a caveat currently shown to spouse households) rather than
adding new surface area — cleaner to build feature #126 (survivor scenario) on top of afterward than
the other way around.

## 1. The diagnosis (verified against current code, 2026-07-27)

**What exists today:** `src/model/monte-carlo.js`'s `runMonteCarlo` walks every iteration through
`buildRetirementDrawdown` (`retirement-drawdown.js`) — the OLDER, blended-pool walk — using its
`rRealByYear` per-year return override to vary market returns per iteration. This is a DIFFERENT walk
than `buildRetirementWalkByAccount`/`buildRetirementPhase` (`retirement-engine.js`/
`retirement-phase.js`), the per-account engine that produces every OTHER headline number (chart,
`yearsSustained`, RMD schedule, Flow-Down, conversion benefit — CLAUDE.md rule 2b). Consequences,
confirmed:

- **No spouse bucket at all.** The blended walk has no `tradGrossSpouse`/Option-A hold-out/spillover
  escape hatch. A spouse household's Range lens can disagree with the solid arc line in both
  directions (BUG-93/94's finding: it can UNDERSTATE by omitting gap-year income, or OVERSTATE by
  pooling the held-out bucket for free with no hold-out and no penalty).
- **The interim caveat** (`src/App.jsx:957`, `spouseGapCaveat: hasActiveSpouseGap ? "..." : null`,
  reworded this session per BUG-93/94's fix) is a stopgap, not a fix. It's a documented, deliberate
  placeholder — see `docs/BUGS.md` → BUG-82 (Resolved), the "Interim Monte Carlo caveat" numbered
  point, and → BUG-93+94 (Resolved). **Retiring it is part of this session's job**, not a follow-up.
- **The core technical gap:** `buildRetirementWalkByAccount` (`retirement-engine.js:54`) takes a
  single flat `rReal` scalar — no per-year override exists. `buildRetirementDrawdown` already has
  this (`rRealByYear`, an optional per-year map). Porting Monte Carlo onto the per-account engine
  means **adding that capability to the per-account engine first** — a real, scoped engine change,
  not a call-site swap. This is the "L-sized" part of the work.
- **Basis is now correct to build on.** BUG-91 already fixed the spend/pension basis
  (`retSpendBasis`/`toRetirementYearDollars`, CLAUDE.md rule 11) that `runMonteCarlo` reads
  (`src/App.jsx` passes `effectiveExpenses: retSpendBasis` to it already) — this is *why* Session B
  was ordered after BUG-91: recalibrating `MONTE_CARLO_SUCCESS_GUIDELINE_PCT` (80) /
  `MONTE_CARLO_LOW_ODDS_PCT` (70) — both in `src/config/irs-2026.js` — against the OLD spend basis and
  then again after BUG-91 would have been wasted work. Do it once, now, against the current basis.
- **Golden-master impact, expected and deliberate.** `rangeSuccessPct` is already locked in the
  spouse-household golden masters (`T-X.2`: 83, `T-X.3`: 61 — `src/__tests__/spouse-household.test.js`)
  and used inside `taxViewBundle`/`planView` thresholds. Porting the walk WILL move these numbers (a
  spouse-aware walk is a different, more accurate walk) — re-lock deliberately, the same discipline
  BUG-91 used, with a before/after table in the PR description explaining direction and why.

## 2. Process (per explicit owner directive — follow this order)

**Efficiency norms for this whole session** (a specific ask, learned the hard way last session):
- Minimize narration between tool calls; state results, don't think out loud in user-visible text.
- **Do not poll with short-interval `ScheduleWakeup` pings while background agents run.** Rely on
  task-notifications as the primary wake signal — they fire automatically when an agent finishes.
  If a fallback wakeup is genuinely needed, use 1200s+ (20+ min), not 180s repeated — the previous
  session burned real turns re-scheduling 180s wakeups that never had new information to act on.
- Batch independent tool calls in one message where possible (multiple parallel Agent launches,
  multiple file reads) rather than serially.

**Step 1 — Plan (Opus, reasoning, not code).** A dedicated Opus agent reads this doc + the file/line
citations above + `monte-carlo.js`/`retirement-engine.js`/`retirement-phase.js`/`what-if.js` (the
last one as precedent — it already solved "port a blended-walk consumer onto the per-account engine
under a scenario override," for `calcWhatIfScenario`'s engine migration) and writes an implementation
plan. The plan must cover, concretely: (a) the `rRealByYear`-equivalent engine change and exactly
where it hooks into the per-iteration growth line (`retirement-engine.js:155-156`); (b) whether
Monte Carlo needs its own lightweight iteration path or can reuse `buildRetirementPhase` per
iteration directly (600 iterations × a full per-account walk — a real perf question, not just a
correctness one: profile or reason about it explicitly, don't assume); (c) the spouse-gap-caveat
retirement (delete the mechanism, not just stop calling it — check every consumer); (d) the
`MONTE_CARLO_SUCCESS_GUIDELINE_PCT`/`LOW_ODDS_PCT` recalibration approach (what should the new
thresholds be, and how is that decided — not just "whatever the new number happens to be"); (e) which
golden-master values move and the expected direction; (f) a batch sequence (implement → review →
gate → commit, matching this repo's established convention).

**Step 2 — Audit the plan (a SECOND, independent Opus agent).** Not a code review — a robustness
review of the PLAN from Step 1, before any implementation starts. This mirrors the precedent already
used twice in this arc (BUG-82's plan got an independent Opus audit; BUG-88/89/90's fix got a
planning-and-audit pass that caught a broken first-draft fix before it shipped). Look specifically
for: a missed call site (does anything besides `runMonteCarlo` assume the blended walk's shape?),
a wrong assumption about what "port" means (should the OLD blended-walk Monte Carlo path be deleted
entirely, or kept as a fallback for some case?), and whether the perf question in (b) above was
actually answered or hand-waved. Revise the plan based on this audit BEFORE writing code.

**Step 3 — Implement (efficient agents, gated batches).** Once the plan is audited and stable, do the
actual implementation — this is mechanical/execution work, not reasoning, so it doesn't need Opus.
Follow the batch sequence from the plan: implement → review the diff → run the full gate
(`npx vitest run`, `npm run lint`, `npm run build`) → commit → next batch. Don't skip the gate between
batches even under time pressure.

**Step 4 — Open a PR.** Push the branch, open a PR with a description that calls out (per this
session's established convention): what changed, which golden-master numbers moved and why, and the
direction/magnitude of each — the same rigor BUG-91's PR description used.

**Step 5 — Bot review.** Let Qodo + CodeRabbit auto-review on push (they trigger automatically — no
manual invocation needed). Fix real findings; verify each fix against the pre-fix condition (revert,
confirm a new test fails, restore) before trusting it, per this repo's established discipline.

**Step 6 — Combine with an in-house adversarial audit.** Once bot review is quiet, run the SAME
review battery this session used to close out PR #62: parallel Sonnet finder agents (correctness on
the engine change, correctness on the caveat retirement + threshold recalibration, reuse/duplication
+ CLAUDE.md-convention compliance, test-coverage/golden-master integrity) + Opus reasoning audits
(cross-feature interoperability — does the Range lens now agree with Classic/Horizon/the conversion
planner/what-if scenarios for the same household; forward-compatibility — is this a good base for
feature #126, which is explicitly gated on the spouse engine being solid). Triage every finding:
fix what's real and contained in-PR (this session's own standard — "the context is highest here");
file what's genuinely a separate, larger decision, with the same rigor BUG-84's deferral got (a
written owner-decision entry, not a silent drop).

## 3. Definition of done

- The per-account engine (`buildRetirementWalkByAccount`) supports per-year variable returns.
- `runMonteCarlo` walks through it (spouse bucket, Option-A hold-out, spillover hatch all visible to
  the Range lens for the first time).
- `rangeView.spouseGapCaveat` (and its wiring) is retired, not just silenced.
- `MONTE_CARLO_SUCCESS_GUIDELINE_PCT`/`MONTE_CARLO_LOW_ODDS_PCT` deliberately recalibrated, with the
  reasoning written down (in `docs/BUGS.md` or `docs/FINANCIAL-MODEL.md`, not just a commit message).
- Golden masters re-locked deliberately, PR description states direction/magnitude of every number
  that moved.
- `docs/BUGS.md` updated (this doc's own job is done once Session B ships — retire it the same way
  `docs/SPOUSAL-ENGINE-STABILIZATION-PLAN.md` was retired: mark DONE, keep as historical record, don't
  delete).
- Full review battery (bots + in-house adversarial audit) run and triaged before calling it done.
