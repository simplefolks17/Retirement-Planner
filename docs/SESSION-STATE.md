# Session state — live handoff

**Purpose.** A session can be cut off mid-task at any moment (API rate limits, container
reclamation). This file is the durable answer to "where was I?" — it is committed, so it
survives the container; the scratchpad and any agent transcript do not.

**Convention (CLAUDE.md "Save points"):** update and COMMIT this file at every natural
checkpoint — after each verified finding, before starting a long-running agent, and before
any multi-step edit. Never let verified work exist only in the conversation or in `/tmp`.

---

## Session: 2026-09-05/06 — bug audit + preview/commit parity
**Branch:** `claude/retirement-planner-bug-audit-incp1z` · **PR:** #67

### Owner decisions taken this session
1. **PR review** — no bot auto-reviews any more. Manual `@coderabbitai review` trigger on
   every push + an in-house Opus adversarial battery as the real gate + a timeboxed survey
   for another free reviewer. **CI was explicitly NOT wanted** (there is no `.github/` at
   all; `npm test`/lint/build have never run on a PR).
2. **BUG-125** — fix the model properly (per-person SS timing gating), not a UI-only
   disclosure. Deferred behind BUG-135/136 by a later decision.
3. **Sequencing** — fix BUG-135 + BUG-136 before BUG-125: same function family, one shared
   fixture, and they are the recurring pattern ("the resim path doesn't re-derive what the
   main path does", now 6+ occurrences).

### DONE and committed (PR #67)
- Folded in `a3490de` (the unmerged BUG-102 annotation).
- **T-X.4** — fourth golden master, on the auto/`null` `spouseRetirementAge` path. Locks
  base-plan AND scenario outputs. Revert-and-confirm verified against BUG-127 and BUG-134,
  and RE-verified after each of the two subsequent re-locks.
- **BUG-102 closed as obsolete** with the fixture that reaches the precondition; closure
  **amended** the same day when BUG-137 proved the gate asymmetry real with the opposite sign.
- **BUG-137 FIXED** (HIGH) — scenarios applied no spouse hold-out gate; forcing a resim with no
  change invented 712,623 of phantom spillover. Shared `seedHasActiveSpouseGap` predicate.
- **BUG-138 FIXED** (HIGH) — `contribEnd*` frozen at the base retirement age; work-longer
  previews dropped up to $314,701 on the DEFAULT household. Shared `coupleContribEndAges` rule.
- **BUG-135 FIXED** (HIGH) — SS never re-derived for a scenario's own working years (+90%/−36%).
  Shared `calcRetirementIncome`; re-derivation REPLACES the inflation re-base (householdSS is
  inflation-independent — measured identical at 0/2.5/4/6%).
- **BUG-136 filed, not fixed** — the last known parity gap.
- **`npm test` now excludes `zz-*` probes**, in the npm script (NOT `vite.config.js` — a
  config-level exclude also blocks running a probe by name; verified both ways).
- **New `src/__tests__/whatif-parity-wiring.test.js`** — organised by the INVARIANT
  (preview X then commit X must agree) rather than by feature. This bug class has now hit
  7 times and was missed every time because assertions were scattered across feature files.
- **CodeRabbit round 1 fix**: the "byte-identically" tests compared only 4 scalars while
  `calcWhatIfScenario` also returns `chart`. Charts verified to match (24 rows, 0 diffs),
  and both assertions now compare the whole chart.
- Suite 1355 -> **1381**, 65 files. Lint clean, build OK.

### Review infrastructure — ANSWERED
- **Manual `@coderabbitai review` WORKS.** Round 1 produced a substantive review with one
  real Medium finding (now fixed). Auto-review does not fire; the trigger must be posted
  on every push. Round 2 triggered after the three behavioural fixes landed.
- **Qodo is billing-blocked** ("trial has ended") — confirmed live on PR #67.
- Repo is PUBLIC with 0 stars, consistent with the owner's "needs 10+ stars" report.
- Worth re-checking (not done): **Greptile** is reported free for public repos now; it was
  ruled out earlier as paid-only, which may have been about private repos or an older policy.
  Also unexplored: Pullfrog (open-source, GitHub Actions + BYO key), Cursor Bugbot.

### Audit reports — PERSISTED to `docs/audit-2026-09-05/`
**NONE of the four agents completed.** Round 1 (four agents) was killed by rate limits and lost
100% of its work. Round 2 (four agents) was also killed — but the briefs required INCREMENTAL
writes to a named file, so all four reports survived and are committed. That instruction is the
only reason anything exists here.

Completeness at time of death:

| Report | Lines | Findings | State |
|---|---|---|---|
| `audit-preview-parity.md` | 344 | **7 verified** + a CLEAN/negative-space section | died mid-Finding 7 |
| `audit-basis-scope.md` | 228 | **8 (F1–F8)** | died mid-F8; no summary table |
| `audit-auto-resolution.md` | 199 | **6 (A–F)** | Sections 1–3 still say "to be filled" — the sentinel inventory TABLE, its headline deliverable, was never written |
| `audit-test-coverage.md` | 555 | coverage matrix + ranked cells + weak-assertion sweep | most complete; died at the end of §3 |

**MINED SO FAR: `audit-preview-parity` Findings 1/3/4; `audit-basis-scope` F1, F2, F3+F3b, F6** (-> BUG-138, BUG-137,
BUG-136). (-> BUG-139/140/141/143/144/145 fixed, BUG-142 filed). Roughly **16 findings remain unmined** —
committed and safe, but not yet verified or filed. Mining is IN PROGRESS.
**Next up: basis-scope F4, F5, F7, F8**, then `audit-auto-resolution` (6 findings A-F, none touched)
and `audit-test-coverage` (matrix + a flagged CLAUDE.md rule-1 violation: stale hard-coded IRS
constants in test names AND assertions), then parity Findings 2/5/6/7.
Every finding verified so far has CONFIRMED — 6 for 6 — so the remaining ones are worth working.

Two spot-checks done cold, both CONFIRMED, which is the evidence that mining beats re-running:
- **basis-scope F3 (HIGH, shipped default)** — `contribSeries` (App.jsx:1003) reads `row.trad`/
  `.roth`/`.taxable`/`.hsa`, but `runSimulation` rows are keyed `"Trad 401k"`/`"Roth IRA"`/
  `"Taxable"`/`"HSA"`/`tradGross`. All four are `undefined` -> `?? 0` -> `rowTotal === 0` ->
  `Math.min(..., 0)` clamps the series to zero permanently. Measured: **1 nonzero point of 60**
  (165,000 at 31, then 0). The Plan "Sources" chart therefore credits 100% of the portfolio to
  "Market growth". Asserted by no test. (Also noticed while verifying: `contribSeries[10]` is
  age 41 while `chartData[10]` is age 40 — an indexing offset to handle in the same fix.)
  F3b: even once fixed, `contribSeries` is PRIMARY-only while `chartData` is HOUSEHOLD.
- **parity Finding 7** — a correct critique of T-X.4 as first committed: it is a REGRESSION lock
  (preview vs its own past self), not a PARITY lock (preview vs commit). Its "committed truth"
  numbers match what I later measured independently. Partly addressed by the FULL PARITY block
  in `whatif-parity-wiring.test.js`, but that block is a NO-SPOUSE household — there is still no
  parity assertion for a spouse household, and T-X.4's spillover locks remain preview-only values
  known to be wrong by BUG-136.

**Recommendation: mine the three unmined reports BEFORE spending any more agent budget.** Their
findings are on disk; re-running would mostly re-derive them and re-incur the rate limit that
killed both rounds. The only genuinely missing deliverable is auto-resolution's sentinel table.

### NEXT STEPS (in order)
1. ~~Verify the `contribEnd*` freeze~~ DONE -> BUG-138 filed.
2. ~~Verify the scenario hold-out gate~~ DONE -> BUG-137 filed, BUG-102's closure amended.
3. ~~BUG-137 (scenario hold-out gate)~~ FIXED + pushed.
   ~~BUG-138 (contribEnd coupling)~~ FIXED. ~~BUG-135 (SS re-derivation)~~ FIXED.
   Remaining: **BUG-136** (conversion window). It is pinned as CURRENT behaviour in
   `src/__tests__/whatif-parity-wiring.test.js`; fixing it will fail that file loudly
   by design. NOTE: BUG-136's bracket-fill mode is downstream of BUG-135 — the
   per-year amounts come from income floors that include SS — so it was correctly
   sequenced second. Custom (flat-amount) mode is the easy half; bracket mode needs
   `calcBracketFillTargets` re-run against floors rebuilt at the scenario's age.
   With conversions OFF, preview and commit are now byte-identical in both
   directions, so BUG-136 is the last known gap for a no-spouse household.
4. Verify the two remaining unverified agent findings (`spouseSimData` freeze;
   `calcWhatIfDelta` never got the engine) and file what survives.
5. Skim the other three audit reports (auto-resolution, basis/scope, test-coverage); file
   what survives.
6. Then BUG-125 (per-person SS timing gating) — owner-approved shape.
6. Housekeeping: `vite.config.js` has no `exclude`, so gitignored `zz-*.test.js` probes are
   still collected by `npm test` (inflates the count, can turn the suite red — documented
   as having happened twice). Add `configDefaults.exclude` + zz patterns, but first confirm
   an explicitly-named excluded file can still be run directly.

### Gotchas worth not rediscovering
- Under "auto", the spouse gap window's WIDTH is invariant to the primary's retirement age
  (both ends move together). To make a scenario create or destroy a gap you need an
  EXPLICIT `spouseRetirementAge` and an OLDER spouse. Two earlier close-out attempts failed
  precisely because they missed this.
- A plan that depletes before `ssClaimingAge` masks every SS-related bug — the first
  isolation run showed SS-on and SS-off as byte-identical for exactly this reason.
- `npm test` includes agent probe files. Use
  `npx vitest run --exclude '**/zz-*.test.js'` for a true count until step 6 lands.
