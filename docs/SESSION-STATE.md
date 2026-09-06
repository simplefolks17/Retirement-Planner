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

### DONE and committed
- Folded in `a3490de` (the unmerged BUG-102 annotation from `claude/design-review-plan-page-j3by51`).
- **T-X.4** — fourth golden master, on the auto/`null` `spouseRetirementAge` path. Locks
  base-plan AND scenario outputs. Revert-and-confirm verified: reverting BUG-127 fails it
  (110 vs 111), reverting BUG-134 fails it (spillover 649,746 vs 793,729). Both restored.
- **BUG-102 closed as obsolete** with the fixture that finally reaches the precondition
  (gate `null` -> `70`). Three regression tests pin the closure; verified load-bearing.
- **BUG-135 / BUG-136 filed** with live repros (see docs/BUGS.md).
- Suite 1355 -> 1362, 64 files. Lint clean, build OK. All four golden masters unmoved.

### Audit reports — PERSISTED to `docs/audit-2026-09-05/`
Four Opus agents ran (twice; both rounds killed by rate limits, but incremental-save meant
nothing was lost). Their reports are committed in that directory. **They are agent
self-reports and are NOT trusted until re-verified here** — status below.

| Finding | Source | Status |
|---|---|---|
| SS never re-derived for a scenario's working years | mine | VERIFIED by me -> **BUG-135** |
| Conversion window inherited from base plan | mine + agent | VERIFIED by me -> **BUG-136** |
| `contribEnd*` frozen at base retirement age; work-longer previews drop the extra contributions | agent | **VERIFY NEXT** — claims $175k / +3yr on the DEFAULT household |
| `spouseSimData` frozen: scenario models the spouse working but not contributing | agent | UNVERIFIED |
| `hasActiveSpouseGap` hold-out gate not applied in scenarios (BUG-93 alive in previews) | agent | **VERIFY NEXT** — contradicts BUG-102's 2026-09-02 "cleared" note |
| `calcWhatIfDelta` never got the per-account engine; disagrees with `calcWhatIfScenario` | agent | UNVERIFIED |

### NEXT STEPS (in order)
1. Verify the `contribEnd*` freeze myself (highest impact; hits the default household).
2. Verify the scenario hold-out gate myself; if real, file it and AMEND BUG-102's closure
   (the original claim stays refuted — this is the same gate asymmetry with the opposite
   sign, so it is a NEW bug, not a re-open).
3. Skim/verify the other three audit reports; file what survives.
4. Implement BUG-135 + BUG-136.
5. Then BUG-125 (per-person SS timing gating) — owner-approved shape.
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
