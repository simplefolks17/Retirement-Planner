# post-ship-review — adversarial correctness + forward-compat retrospective

Two-Opus-agent review to run after merging a feature/PR on this repo. Catches what
the unit suite and the CodeRabbit/Gemini free-tier passes miss: basis-integrity bugs
in new derived/comparison values, and gaps between what a plan promised and what
actually shipped. Ask for this by name ("run the post-ship review") — no arguments
needed, scope auto-detects from git state.

## When to use

After merging a PR, or after a multi-commit build lands, before moving to the next
work item. Not a substitute for `npm test` / lint / the `verifier-browser` visual
check — those must already be green first.

## Scope auto-detection (do this before spawning agents — don't ask the user)

1. **Diff range** — if the user names a PR #, commit range, or "review PR #N", use
   that (GitHub MCP `pull_request_read` method `get_diff`, or `git diff <base>..<head>`).
   Otherwise: if the current branch isn't `main`, use `git merge-base main HEAD` as
   the base against `HEAD` (i.e. `main...HEAD`). If already on `main` (post-merge),
   use the most recent merge commit: `git log --merges -1 --format=%H` → diff
   `<sha>^..<sha>`.
2. **Plan file** — check `/root/.claude/plans/` for a plan discussed earlier in the
   conversation, or one whose filename matches the current/just-merged branch name.
   If none exists, tell Agent 2 to skip the plan-comparison and audit only against
   `docs/ROADMAP.md`'s "Done when" clauses for the relevant WI.
3. **Touched files** — `git diff --name-only <range>`.

Fixed for this repo (don't ask, these never change): rules/conventions file =
`CLAUDE.md`; roadmap/backlog = `docs/ROADMAP.md`; bug tracker = `docs/BUGS.md`;
architecture/contracts registry = `docs/ARCHITECTURE.md`; feature tracker =
`feature-tracker.html`.

## Launch (single message, two Agent tool calls, in parallel)

`subagent_type: general-purpose`, `model: opus`, `run_in_background: true` for both.
Give each agent only: the diff range, the touched-file list, the plan file path (if
found), and the four fixed doc paths above. **Do not let them explore the whole
repo** — direct them to the diff and its direct call sites only; this is the main
lever for keeping their token spend down. Both agents are strictly **read-only**: no
edits, no commits, no writes anywhere.

### Agent 1 — Adversarial correctness review

Use this prompt body (substitute the auto-detected diff range and file list):

> You are an adversarial senior reviewer for this retirement-planner repo. READ-ONLY:
> change nothing, commit nothing. Assume the code in `<DIFF_RANGE>` is WRONG until
> you prove it right — this codebase's prior review passes repeatedly found real
> bugs in exactly this kind of freshly-shipped wiring (double taxation, off-by-one
> age gates, stale closures, wrong-basis comparisons), so hunt with that prior.
>
> Scope: only the files in `<TOUCHED_FILES>` plus their direct call sites (do not
> explore the wider repo). Rules that bind the code: `CLAUDE.md` Critical Rules
> (esp. rule 2b one-walk/taxed-once, rule 5b age gating, rule 10
> screens-render-never-compute), `docs/ROADMAP.md` design principles 6–15,
> `docs/ARCHITECTURE.md`'s bundle-shape / contract registry.
>
> For each changed file, trace: (a) **basis integrity** — do compared/combined
> values share the same inputs, horizon, and rounding; (b) **boundary/gating
> conditions** — do they match any pre-existing equivalent logic
> character-for-character, including null/zero/empty/Infinity edge cases; (c)
> **stale-closure/memo-dependency risk** in new hooks/callbacks (complete,
> correct `useMemo`/`useCallback` deps — this repo's V9 stability rule); (d) any
> **UI/display divergence** from the Classic pattern being replaced or extended,
> or from a sibling Horizon screen's established convention; (e) **edge cases**
> in new pure `src/model/` functions.
>
> Output: findings ranked by severity, each with file:line and a concrete failure
> scenario (inputs/state → wrong output the user sees). Mark each **CONFIRMED**
> (you traced the actual code path) or **PLAUSIBLE** (needs a runtime check you
> couldn't do). List the attack surfaces you checked that came back CLEAN, one
> line each, so coverage is visible. Cap at 8 findings. Skip style nits and
> anything this repo's rules already explicitly accept (e.g. raw-input-toggle
> gates, `.length` layout comparisons — see CLAUDE.md's review-fix history for
> the accepted-pattern list). Keep the report under 500 words plus the findings.

### Agent 2 — Forward-compatibility / completion retrospective

Use this prompt body (substitute the diff range, plan file path, and touched files):

> You are a senior staff engineer doing a session retrospective for this
> retirement-planner repo. READ-ONLY: change nothing, commit nothing.
>
> Audit `<DIFF_RANGE>` (files: `<TOUCHED_FILES>`) against `<PLAN_FILE>` (if given)
> and against `docs/ROADMAP.md`'s "Done when" clauses for the work item(s) this
> diff implements. For each promise: confirm it landed, or flag **MISSED** (with
> the concrete file/action needed) or **DELIVERED-DIFFERENTLY** (fine, but name
> where it should be recorded — usually the relevant ROADMAP shipped-note or
> `docs/ARCHITECTURE.md`).
>
> Then check forward-readiness for the **next** planned work item(s) in
> `docs/ROADMAP.md`'s sequencing: does anything in this diff leave a contract,
> convention, or write-surface (a bundle shape, an Apply-site pattern, a setter)
> that the next feature can't build on without reshaping it? Pay particular
> attention to anything the repo's `docs/ARCHITECTURE.md` gating-composition /
> write-surface conventions are supposed to cover — a bare callback or raw
> array setter that slipped past those conventions is the recurring failure
> mode here.
>
> Also flag any doc (`CLAUDE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
> `docs/HORIZON.md`, `feature-tracker.html`) that's now stale because of this
> diff, including anything the diff's own commit messages describe
> imprecisely (check the actual code, not just the commit message, before
> trusting either).
>
> Output three short lists: **MISSED**, **DELIVERED-DIFFERENTLY**, **CONFIRMED
> COMPLETE** (one line each for the last one — don't pad items that are simply
> fine). Keep it under 400 words total plus the lists.

## After both report

Triage yourself before acting — don't apply agent output blindly:
- Fix small, high-confidence findings directly (commit as a normal review-fix,
  per `CLAUDE.md`'s bug-fix workflow: `docs/BUGS.md` entry if it's a real bug,
  no PR required for a contained fix).
- Anything ambiguous, architecturally significant, or that changes shipped
  product behavior → ask the user (`AskUserQuestion`) before acting, per this
  project's operating norms.
- Reconcile MISSED / DELIVERED-DIFFERENTLY items into the relevant docs in the
  same pass, following `CLAUDE.md`'s Session Close-Out conventions if the
  finding touches `docs/BUGS.md`'s Open Issues (re-verify against current code
  before trusting an agent's claim that something is broken or missing — see
  the BUG-41 precedent: a first-pass finding was itself wrong until traced to
  the actual commit history).
