# Bug & Oddity Tracker

This file tracks known bugs, UI oddities, and design questions in the app.
Each entry records **what was found**, **why it happens** (root cause), **status**, and **fix notes** once resolved.

---

## Open Issues

### BUG-46 — `buildScenarioCommitSite` preview omits the scenario's `scenarioEvents`/expense overrides (found 2026-07-09, in-house 8-angle diff review on PR #51)

**Owner:** me_theguy. **Found by:** an in-house 8-finder-angle code review (line-by-line +
cross-file-tracer angles independently converged on the same defect) run against PR #51 after
the paid bots (CodeRabbit free tier, Gemini) returned nothing further.
**What:** Ideas' "Big trip at 70" scenario card (`SCENARIOS.bigTrip`, `retireAdj: 0,
scenarioEvents: [{amount: 40_000, age: 70, isInflow: false, ...}]`) is displayed via
`calcWhatIfScenario(whatIfBundle, {..., scenarioEvents: scen.scenarioEvents})` — the card's
totalAtRet/longevity numbers reflect the $40k trip. But `scenarioCommitSite` (`IdeasScreen.jsx`)
builds its preview by calling `props.buildScenarioCommitSite(scenario.scenarioRetAge)`, passing
**only the candidate retirement age** — `buildScenarioCommitSite` (`App.jsx`) computes
`before`/`after` via `calcWhatIfDelta({...whatIfBundle, retirementAgeOverride: candidateRetirementAge})`
with no `moneyEvents`. For `bigTrip` specifically, `retireAdj: 0` means the candidate age equals
today's retirement age, so the preview shows an almost-total "no change" delta — even though the
card the user just looked at showed the $40k hit. The preview's own `note` field claims "Preview
uses the same what-if walk as your scenario card above," which is false whenever the scenario has
`scenarioEvents` or an `annualExpenses`/`monthlyExpenses` override.
**Why this needs an owner decision, not just a patch:** `apply()` (`commitPlan({retirementAge:
candidateRetirementAge})`) has **never** persisted a scenario's one-time events into the real
`moneyEvents` array — that's true both before and after this PR ("make this my plan" has always
meant "adopt this retirement age," not "adopt this scenario's temporary events too"). Two
possible fixes point in different directions: (a) **copy-only fix** — thread `scenarioEvents`/
expense overrides into `buildScenarioCommitSite`'s `calcWhatIfDelta` calls so the PREVIEW matches
the card, while `apply()` still only commits the retirement age — but this would then show a
preview promising a change that `apply()` doesn't actually make, a different (arguably worse)
mismatch; (b) **scope-expansion fix** — make `apply()` also persist the scenario's events (via
`eventsView.add(...)` for each), so "make this my plan" genuinely adopts the whole scenario,
matching what the preview would then show. (b) changes product behavior beyond a preview-display
bug and needs an explicit decision before implementing.
**Inert at the default state:** `bigTrip` (and any preset with `scenarioEvents`) is reachable any
time a user picks that scenario card and clicks "Make this my plan" — no special setup required;
this is a default-preset scenario, not an edge-case input.
**Where:** `src/App.jsx` (`buildScenarioCommitSite`), `src/horizon/screens/IdeasScreen.jsx`
(`scenario` memo passes `scenarioEvents`; `scenarioCommitSite` memo doesn't forward them),
`src/horizon/screens/IdeasScreen.jsx` (the `SCENARIOS` array, `bigTrip` entry).
**Not fixed this pass** — flagged to the owner for a fix-direction decision.

### BUG-40 — `taxView.composition.total` misses `drawTax` on extra 401k draws (found 2026-06-24, PR #38 review)

**Owner:** me_theguy. **Found by:** CodeRabbit (PR #38 round 3).
**What:** The Taxes tab's "Retirement-phase tax composition" bar uses `taxView.composition.total =
rmdTaxBite + convTaxTotal` (`App.jsx`, `taxViewBundle`). This captures the RMD-schedule tax and
the conversion-window tax, but misses `drawTax` — the incremental tax the per-account engine
charges when the 401k is tapped for living expenses beyond RMDs/conversions (e.g. after the
conversion window closes but before depletion). In scenarios with meaningful extra 401k draws, the
displayed retirement-phase tax total is understated.
**Root cause:** `rmdTaxBite` and `convTaxTotal` are scalar aggregates from the existing plan-level
fields; `drawTax` is a per-row field inside `retirementWalk.rows` that has no existing scalar
rollup. Adding it requires either (a) a new `totalDrawTax = Σ(row.drawTax)` field in
`retirementWalk` (preferred — keeps the rollup in the model, rule 10) or (b) a `Σ` over the rows
in App.jsx before the `taxViewBundle` memo.
**Inert at the default state:** the default plan is trivially sustainable (Infinity longevity) and
`drawTax` is near-zero at the default spending level; effect is visible for under-funded plans.
**Fix path:** add `totalDrawTax: rows.reduce((s, r) => s + (r.drawTax ?? 0), 0)` to `buildRetirementPhase`
return; include it in `taxView.composition.total` and as a third "draw" segment in `taxViewBundle`.
**Where:** `src/model/retirement-phase.js` (add field), `src/App.jsx` `taxViewBundle` (consume it),
`src/horizon/screens/NumbersScreen.jsx` (render third segment), `src/horizon/__tests__/numbers-tabs.test.js`
(update composition mock).
**Re-verified 2026-07-08 (L3c close-out):** `App.jsx`'s `taxViewBundle` still computes
`total = rmdTax + convTax` with no `drawTax` term (line shifted to ~1272 by this session's
unrelated additions elsewhere in the file); `retirement-phase.js`'s `buildRetirementPhase` return
still has no `totalDrawTax` field. Still reproduces exactly as described; this session's build
never touched either file's relevant code.
**Re-verified 2026-07-09 (L3d close-out):** `taxViewBundle`'s `composition.total = rmdTax + convTax`
confirmed unchanged (now at `App.jsx:1565`, shifted by this session's additions elsewhere in the
file); `retirement-phase.js` still has no `totalDrawTax` field. Still reproduces; this session's
WI-3.7/WI-3.8 build touched neither the composition memo nor `retirement-phase.js`.

---

### BUG-36 — What-if / optimized deltas not yet on the taxed-once engine (accepted, low)

**Found:** 2026-06-15 (BUG-35 follow-up, surfaced in PR #32 review). **Owner:** me_theguy.
**What:** `what-if.js` (`calcWhatIfDelta` / `calcWhatIfScenario`) and `calcOptimizedScenario`
still walk the retirement phase with the blended `buildRetirementDrawdown`, fed engine-consistent
tax maps on the gross basis. They do **not** charge the per-year spending-draw tax the per-account
engine (`buildRetirementWalkByAccount`) now does, so what-if **deltas** and the optimizer's
candidate scoring are slightly less tax-honest than the headline they sit next to.
**Why it's accepted, not blocking:** the headline (`yearsSustained`, chart, Flow-Down, RMD,
conversion benefit) is fully on the engine; only the *comparative* overlays lag, and the gap is the
spending-draw tax, which is small relative to the deltas being compared.
**Related (same root — inline event handling off the shared helper):** `runSimulation`
(accumulation) and the blended what-if walk still inline only the money-event portfolio sign and do
**not** charge income tax on a flagged *taxable inflow* (`applyMoneyEvents.taxableIncomeAdjustment`).
The retirement **engine** (the headline source) now does charge it — fixed 2026-06-15. Accumulation's
working-year tax basis is computed once on regular income, so per-year event income tax there is a
separate, deliberate extension.
**Update (2026-06-24, conversion-timing PR #39):** working-year **Roth-conversion** events ARE now
taxed per-year in `runSimulation` (ordinary tax + under-59½ penalty, `conversion-events.js`), and the
what-if re-sim threads them through `whatIfSimInputs`, so conversion events are *outside* this gap.
The remaining BUG-36 gap is (a) the retirement-phase **delta** still using the blended walk, and (b)
`moneyEvents` taxable-inflow income tax still uncharged in accumulation / the blended walk.
**Fix path:** migrate both to `buildRetirementPhase`/engine (planned with the Level-3 Strategies
work). Tracked here so the gross-basis headline vs. blended-overlay split stays owned.
**Re-verified 2026-07-08 (L3c close-out):** `what-if.js` and `optimization.js` still import and
call `buildRetirementDrawdown` exclusively — still reproduces. Note: this session's WI-3.9 Apply
preview for the conversion optimizer suggestion deliberately does **not** use `calcWhatIfDelta` —
it runs `buildRetirementPhase` directly (the engine itself), sidestepping this gap for that one
new surface rather than closing it generally. `calcWhatIfDelta`/`calcOptimizedScenario` themselves
are unchanged.
**Re-verified 2026-07-09 (L3d close-out) — still reproduces, and scope grew.** `calcWhatIfDelta`
still calls `buildRetirementDrawdown`, not the engine (confirmed against current `what-if.js`).
Unlike WI-3.9's conversion Apply (above), **L3d's two new Apply-with-preview sites (`surplusApplySite`,
`buildScenarioCommitSite`) both use `calcWhatIfDelta`**, not the engine — so this batch added two
more consumers of the blended-walk gap rather than closing it, an explicit, reviewed tradeoff (the
"Fix path" below — migrate to `buildRetirementPhase` — wasn't in scope for this batch; the surplus
candidate is a contribution-rate change, which the engine's per-account walk doesn't yet accept as
an override the way the conversion optimizer's `buildConversionByAge` override does). Both new
sites are internally consistent (their own "current" and "candidate" both use the same blended
mechanism, so no divergence *within* a site) — the gap is only the blended-vs-engine comparison
this bug already tracks. `docs/ARCHITECTURE.md`'s `buildSurplusPreview` note now states this
honestly in its `note` field, shown to the user in the preview itself.

### BUG-37 — Engine ignores `conversionTaxSource` (accepted, owner-deferred 2026-06-15)

**Owner:** me_theguy. **What:** the per-account engine always funds Roth-conversion tax from the
pool (Taxable first) and moves the **full** converted amount to Roth — i.e. it behaves as
`conversionTaxSource === "taxable"`. The UI toggle defaults to **"converted"** (pay the tax out of
the converted amount, so less lands in Roth), so at the default setting the engine and the toggle
disagree. The old `calcConversionSim` (still used for the conversion *schedule* display) does honor
the toggle. **Why deferred:** honoring "converted" in the engine would move the golden master at
default (yearsSustained, netConversionBenefit) and is a deliberate modeling change; the current
full-to-Roth/tax-from-taxable behavior is a defensible default. **Fix path:** thread
`conversionTaxSource` into `buildRetirementWalkByAccount` and, for "converted", credit Roth with
`conversion − convTax` instead of pulling the tax from the pool. Owner-approved to defer so PR #32
can close.
**Re-verified 2026-07-08 (L3c close-out):** `conversionTaxSource` still does not appear anywhere in
`retirement-engine.js` or `retirement-phase.js` (confirmed via search — zero matches); the engine
still unconditionally behaves as `"taxable"`. Still reproduces; this session's WI-3.6 flow surfaces
the toggle (writes through the `conversion` setter bundle, honored only by the display-path
`calcConversionSim`) with an explicit honesty note in `ConversionPlannerFlow.jsx` pointing at this
gap, rather than silently implying the toggle changes engine behavior.
**Re-verified 2026-07-09 (L3d close-out):** `conversionTaxSource` still zero matches in
`retirement-engine.js`/`retirement-phase.js`. Still reproduces; neither file was touched by this
session's WI-3.7/WI-3.8 build (which worked in `what-if.js`, `apply-preview.js`, App.jsx wiring,
and Horizon screens — not the engine).

### BUG-38 — Engine doesn't charge the base tax on the SS/pension floor (found 2026-06-15, PR #32 review)

**Owner:** me_theguy. **Found by:** Gemini. **What:** the engine charges only *incremental* tax
above the SS/pension income floor — the per-year `tax` telescopes to `tDraw − tFloor` (+ state), so
the federal tax on the taxable SS + pension itself (`tFloor`) is never charged. Because `needed` is
reduced by **gross** SS/pension (`effectiveExpenses − ssCash − penCash`), the model effectively
treats SS/pension as tax-free, understating lifetime tax and overstating chart longevity in stressed
(under-funded) scenarios. **Why not a quick drop-in:** the *correct* fix isn't simply "always add
`tFloor`" — in **over-funded** years (SS + pension > expenses) the income **surplus**, not the
portfolio, should pay that floor tax, so a blind add would over-charge there. The clean form is to
fund `max(0, expenses + totalTax − grossSS − grossPension)` from the portfolio (income surplus
absorbs tax first). **Golden-master impact:** the locked headline scalars (`rmdTaxBite`,
`netConversionBenefit`, `firstRMD`, `totalAtRet`, `yearsSustained`) are all incremental/pre-walk and
do **not** move; only the chart trajectory / depletion in stressed cases shifts. **Status:**
owner-deferred so PR #32 can close; pre-existing simplification (the old blended walk also used
incremental tax maps). **Fix path:** restructure the per-year funding to net external income against
total tax before drawing from the pool.
**Where:** `src/model/retirement-engine.js` — the tax fixed-point at ~L149–163 (`tFloor` computed at
L150 then subtracted out by the telescoping components); `needed` at ~L132 (`effectiveExpenses −
ssCash − penCash + eventOutflow`). A `floorTax = tFloor` component would be added to `tax`, gated so
the income surplus absorbs it first.
**Re-verified 2026-07-08 (L3c close-out):** both line references confirmed exact — `tFloor` still
at line 150, `needed` still at line 132. Still reproduces; `retirement-engine.js` was not touched
by this session's build.
**Re-verified 2026-07-09 (L3d close-out):** `tFloor` still at line 150 (unchanged since 2026-07-08).
Still reproduces; `retirement-engine.js` was not touched by this session's build.

### BUG-39 — Flow-Down *accumulation* growth is a residual plug, not Σ(row.growth) (found 2026-06-15, PR #32 review)

**Owner:** me_theguy. **Found by:** CodeRabbit (cites CLAUDE.md rule 2b). **What:** `calcFlowDown`
computes the accumulation-phase growth as `totalAtRet − startPortfolio − totalContrib` (a residual),
whereas rule 2b requires Flow-Down growth to be the **independent sum `Σ(row.growth)`** so a forgotten
flow can't hide in it. The retirement-phase growth (`distGrowth`/`convWindowGrowth`) already follows
the rule; only the accumulation node lags. Pre-existing (predates BUG-35) and inert at the default
state (no accumulation money events → residual ≈ Σ(growth)). **Fix path:** `totalGrowth =
Σ(contribRows[].growth)` (the simData rows already carry per-year `growth`), and verify negative real
growth + reconciliation as separate assertions. Deferred so PR #32 can close.
**Where:** `src/model/flow-down.js:34` (`const totalGrowth = totalAtRet − startPortfolio −
totalContrib`, line ref trued 2026-07-08 close-out — was :31, shifted by unrelated additions
elsewhere in the file). Contrast with the in-file `sumGrowth(rows)` used for
`convWindowGrowth`/`distGrowth` (the rule-2b-correct pattern). Test fixture in `flow-down.test.js`
would need `growth` on its `contribRows` rows. **Note:** the round-4 "remove the `Math.max(0,…)`
clamp" fix is *on top of* this residual — removing the clamp let negative real growth through, but
the value is still a residual. **Re-verified 2026-07-08 (L3c close-out):** still reproduces exactly
as described; this session's build never touched `flow-down.js`.
**Re-verified 2026-07-09 (L3d close-out):** `totalGrowth` still the residual formula at line 34.
Still reproduces; `flow-down.js` was not touched by this session's build.

---

## Resolved Issues

---

### BUG-45 — Life-event pill shows false success once the money-events cap is reached (found + fixed 2026-07-09, in-house diff review on PR #51)

**Owner:** me_theguy. **Found by:** independently surfaced by 3 of 8 finder angles in an in-house
code review (line-by-line scan, removed-behavior auditor, cross-file tracer) run against PR #51
after the paid review bots returned nothing further — strong corroboration from three independent
reasoning paths converging on the same defect.
**What:** `IdeasScreen.jsx`'s life-event "Add to plan" confirm handler unconditionally called
`setPlacedEvents`/`setActiveScen` (marking the pill "✓ placed" and swapping the arc overlay)
**before** checking whether the underlying `eventsView.add(...)` write actually happened.
`eventsView.add` (`App.jsx`) silently no-ops once `moneyEvents.length >= MAX_MONEY_EVENTS` (6) —
so once a user has 6 events (reachable via the new WI-3.8 Events editor, or 6 life-event pills),
confirming a 7th pill shows a checkmark and swaps the arc/scenario overlay, but the event is never
actually added to `moneyEvents` — a false-success state with no error path.
**Root cause:** the confirm handler was written before the events cap existed on this write path
(the pre-diff code called `setMoneyEvents` directly with no cap); `eventsView`'s wrapped `add()`
introduced the cap in this same PR (per the Apply-with-preview contract's "wrapped write surface"
rule) without the one pre-existing caller being updated to check it.
**Inert at the default state:** `moneyEvents` starts empty; reachable once a user has added 6 events
by any combination of the Events editor and life-event pills.
**Fixed:** the confirm handler now checks `eventsView.atMax` before performing the local "placed"
UI updates and the `add()` call — when at the cap, the confirm silently closes without a false
success state, matching the existing `EventsEditorPanel`'s own `atMax`-gated Add button. While in
the same handler, also removed a redundant `id: String(Date.now())` override the call was passing
into `add()` — `eventsView.add` already generates its own id (`Date.now() + Math.random()`); the
caller's override silently won (spread order) and (a) defeated the generator's collision-jitter and
(b) gave life-event-added rows a **string** id while every other event gets a **number** id, a type
inconsistency with no current downstream effect but no reason to keep.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (life-event confirm `onConfirm`).
**Tests:** 2 new in `src/horizon/__tests__/ideas-modes.test.js` — confirms `add`/`atMax` guard
skips the write and pill-placed state when at the cap; confirms the normal (under-cap) path still
adds and marks placed, and that no `id` override is passed.

### BUG-44 — `AffordabilityPanel`'s desktop age input has no bounds clamp (found + fixed 2026-07-09, in-house diff review on PR #51)

**Owner:** me_theguy. **Found by:** the line-by-line-scan finder angle of the same in-house review.
**What:** `AgeControl`'s desktop branch (`<input type="number" min={min} max={max} ...>`) passed
`Number(e.target.value)` straight to `onChange` with no clamping — HTML `min`/`max` attributes are
advisory only (the browser doesn't reject a typed out-of-range value). The mobile stepper branch
DID clamp (`Math.max(min, Math.min(max, value ± step))`), so this was a desktop-only gap.
**What actually breaks:** typing an absurd purchase age (e.g. `500`, or any age past
`scenarioRetAge + 130`, the retirement-walk horizon) produces a one-time-expense event whose age
never appears in any walked row. `calcWhatIfDelta`'s `isSustainable(amount)` check then returns
`true` for every tested amount (the "expense" never actually fires within the walk), so
`calcAffordabilityMax`'s binary search converges on `maxSearch` — the panel displays "You could
spend up to $5,000,000 at age 500 and still last to age 90," a nonsensical result presented as a
real answer, reachable by a simple typo (no special input needed beyond typing a number).
**Fixed:** the desktop input's `onChange` now clamps the same way the mobile stepper already does:
`Math.max(min, Math.min(max, Number(e.target.value) || min))`.
**Where:** `src/horizon/AffordabilityPanel.jsx` (`AgeControl`'s desktop `<input>`).
**Tests:** 1 new in `src/horizon/__tests__/ideas-modes.test.js` — types `500` into the purchase-age
input and asserts the rendered value clamps to the field's `max` (89 in the test fixture).

---

### BUG-47 — Life-event pill "placed" state was disconnected shadow state, stale in both directions (found + properly fixed 2026-07-09, owner follow-up on BUG-45)

**Owner:** me_theguy. **Found by:** BUG-45's fix (a narrow `atMax` guard) prompted the owner to ask
whether the underlying `placedEvents` design was sound rather than leaving the deeper issue as
accepted debt — re-examining it surfaced a second, pre-existing staleness direction BUG-45 didn't
cover.
**What:** `IdeasScreen.jsx` tracked a local `placedEvents` array (event labels) purely as UI shadow
state for the life-event pills' checkmarks — separate from `moneyEvents`, the actual source of
truth. This drifted in **both** directions: (1) clicking an already-"placed" pill to toggle it off
only removed the label from `placedEvents` — the underlying event stayed in `moneyEvents` forever,
so the pill said "removed" while the real plan still had it; (2) removing the same event via the
new WI-3.8 Events tab (`eventsView.rows[].remove()`) never touched `placedEvents`, so the pill kept
its checkmark after the event was actually gone (BUG-45's post-ship-review finder caught this
direction specifically). A third, more subtle case: `clearScen()` (called on every Ideas mode
switch) unconditionally reset `placedEvents` to `[]`, so switching away from "life" mode and back
un-checked every pill regardless of whether its event was still in `moneyEvents` — a third stale
direction, found while implementing this fix (not by the original review pass).
**Root cause:** `placedEvents` duplicated information already derivable from `moneyEvents` instead
of being computed from it — the "one source of truth" a shadow-state variable is disconnected from
will drift onto every code path that doesn't happen to update both.
**Fixed:** removed `placedEvents`/`setPlacedEvents` entirely. A pill's "placed" state is now
**derived** live from `eventsView.rows` on every render (`findPlacedRow`, matching on label + age +
amount + direction — the full shape the pill would have written, so an unrelated custom event that
happens to share just the label text doesn't false-match). Toggling a placed pill off now calls the
matching row's real `remove()` (previously a no-op on `moneyEvents`); the events-cap guard (BUG-45)
moved from the confirm handler to the pill's click handler itself, so the confirm modal never opens
when at capacity (cleaner than opening a modal that would silently fail on confirm); `clearScen()`
no longer resets any pill state, since there's no separate state left to reset — mode switches now
correctly continue to reflect whatever `moneyEvents` actually contains.
**Inert at the default state:** `moneyEvents` starts empty (no pills placed); all three drift
directions require having actually placed at least one life event first.
**Where:** `src/horizon/screens/IdeasScreen.jsx` (removed the `placedEvents` `useState` and its one
setter call site; added `findPlacedRow`; updated the pill click handler and `clearScen`).
**Tests:** `src/horizon/__tests__/ideas-modes.test.js`'s life-event describe block rewritten (4
tests): the events-cap guard now checks the confirm modal never opens (not a post-hoc revert);
confirming under the cap calls `add()` with no `id` override; a pill whose event already exists in
`eventsView.rows` renders placed with zero clicks (direct test of the derivation, not a
click-then-rerender simulation the test mocks can't support); clicking a placed pill calls the
matching row's `remove()`.

---

### BUG-42 — `calcWhatIfDelta`'s forced re-sim silently drops `addlPreTaxBal` (found + fixed 2026-07-09, L3d post-ship review)

**Owner:** me_theguy. **Found by:** the adversarial-correctness agent of the two-Opus post-ship
review (`.claude/skills/post-ship-review.md`) run against the WI-3.7/WI-3.8 (L3d) diff.
**What:** `App.jsx` folds the user's `addlPreTaxBal` input (an outside pre-tax balance, feature #8)
into the headline `totalAtRet`/`tradGrossAtRet` — `baseTotalAtRet` passed into `calcWhatIfDelta`
therefore already includes it. But `calcWhatIfDelta`'s forced-re-sim branch (triggered by an
accumulation-phase money event, a `retirementAgeOverride`, or the new `contribOverrides` param)
recomputes `scenarioTotalAtRet` from `runSimulation`'s output, which has **no concept of
`addlPreTaxBal`** — it's an App-level scalar, not a `runSimulation` input. So a forced-resim
"candidate" always excluded it while the non-resim "current"/"baseline" always included it —
a basis mismatch between the two sides of any before/after comparison built on this function.
**Root cause:** the resim branch's own comment claimed "matches the gross `baseTotalAtRet` so
scenario-vs-baseline deltas are apples-to-apples" (BUG-35 gross-basis note) — true for the
401k-gross-vs-haircut concern that comment addressed, but false for `addlPreTaxBal`, which the
comment didn't account for. This gap **predates L3d** (any pre-existing forced-resim caller —
Classic's `WhatIfPanel` accumulation-phase what-ifs, a retirement-age-shift scenario — already had
it) but was invisible: What-If mode shows one scenario at a time, not a side-by-side "same
mechanism" comparison. L3d's `surplusApplySite` and `buildScenarioCommitSite` are the first
features that market "current vs candidate, guaranteed same mechanism" prominently, which is what
surfaced it: a user with `addlPreTaxBal` set could see the surplus-allocation Apply preview show a
spurious six-figure **decrease** in "Nest egg at retirement" for a candidate that actually
increases contributions.
**Inert at the default state:** `addlPreTaxBal = 0` by default (golden master unaffected); reachable
for any user who has set the RMD-basis input (feature #8) and views either new preview.
**Fixed:** `calcWhatIfDelta` gained an optional `addlPreTaxBal = 0` param, added back into
`scenarioTotalAtRet` inside the resim branch (mirroring exactly how `App.jsx` already adds it to
`tradGrossAtRet`). Wired through `whatIfBundle` (Horizon, so every consumer — `surplusApplySite`,
`buildScenarioCommitSite`, the future `AffordabilityPanel` — picks it up automatically via the
`...whatIfBundle` spread) and through `WhatIfPanel.jsx`'s `sharedArgs` (Classic, via a new
`addlPreTaxBal` prop from `App.jsx`) — both UIs fixed identically, closing the same gap either
would eventually have hit. Default `0` is a no-op for every existing caller.
**Where:** `src/model/what-if.js` (`calcWhatIfDelta`'s signature + resim branch), `src/App.jsx`
(`whatIfBundle`, `<WhatIfPanel>` call site), `src/components/WhatIfPanel.jsx` (`sharedArgs`).
**Tests:** 2 new — a basis-symmetry lock (`addlPreTaxBal` adds exactly its value to
`scenarioTotalAtRet` on a forced resim) and a default-is-no-op lock, in
`src/model/__tests__/what-if.test.js`.

---

### BUG-43 — `AffordabilityPanel`'s zero-headroom message falsely claims the plan doesn't sustain (found + fixed 2026-07-09, L3d post-ship review)

**Owner:** me_theguy. **Found by:** the same post-ship review pass as BUG-42.
**What:** `calcAffordabilityMax` returns `canAfford: false` for two distinct situations: (a) the
baseline plan itself doesn't sustain to the target age (fails even a $0 purchase), and (b) the
baseline plan **does** sustain, but has zero headroom for any additional expense at the chosen
purchase age (the binary search converges to `maxAmount = 0` because even one `step` breaks the
target). `AffordabilityPanel.jsx`'s `!canAfford` branch rendered "Your current plan doesn't sustain
to age {targetAge}" for both — false in case (b), where the plan is fine and simply has no slack.
**Root cause:** the model's `canAfford` boolean deliberately doesn't distinguish the two cases (it
answers "can this specific purchase be afforded," not "is the underlying plan healthy") — the
screen's copy assumed it did.
**Inert at the default state:** the default plan is trivially sustainable (`yearsSustained =
Infinity`), so case (b) — sustainable-but-zero-headroom — is unreachable without a tighter, more
realistic plan; reachable for any user on a tight-but-solvent plan probing a large purchase.
**Fixed:** reworded the message to a claim that's true in both cases without needing a new model
field to distinguish them: "Your plan has no room for an additional expense at age {purchaseAge}
while still sustaining to age {targetAge}." No model change — display copy only.
**Where:** `src/horizon/AffordabilityPanel.jsx`; test updated in `src/horizon/__tests__/ideas-modes.test.js`.

---

### BUG-41 — `verifier-browser.cjs` has a stale hardcoded "Money flow" Numbers tab (found 2026-07-08, L3c verification pass; re-diagnosed + fixed at 2026-07-08 close-out)

**Owner:** me_theguy. **Found by:** the orchestrator during the WI-3.6/WI-3.9 (L3c) manual
verification pass; **misdiagnosed** at filing time as a Playwright locator defect ("the tab
renders fine, the click just times out") — corrected during the same-day session close-out.
**What actually happens:** `.claude/skills/verifier-browser.cjs:63` hardcodes
`NUMBERS_TABS = ['Statement', 'Budget', 'Accounts', 'Taxes', 'Year by year', 'Money flow']`. The
"Money flow" tab **no longer exists** in `NumbersScreen.jsx` — its button and render block were
removed in commit `434caf8` (2026-06-24, PR #38, "Numbers screen depth build-out"). The verifier
correctly fails to find a button with that label and times out; there was never a locator bug.
**Root cause of the stale test, and why it's NOT a product bug:** `434caf8`'s diff shows the
"Money flow" tab's retirement-phase content (SS / Pension / Portfolio draw) was **merged into the
Statement tab** as a new "Retirement income companion strip" in the same commit (still present
today at `NumbersScreen.jsx:478-493`, shown beside the existing working-year paycheck waterfall) —
this was a deliberate 6→5 tab consolidation (Statement already showed a similar working-year
breakdown; folding the retirement-year one in next to it removes a redundant tab), not an
accidental deletion. Confirmed by re-reading the commit's full diff and message, and independently
confirmed against the owner's own recollection during the 2026-07-08 close-out. The commit's
message and the CLAUDE.md status entry it produced (Status log, "Numbers screen depth build-out —
Sessions 1–4") describe this only as "hardened the Year-by-year and Money-flow tabs," which is
misleading phrasing (it reads as if both tabs still exist standalone) — that phrasing is what led
this session's initial BUG-41 filing to assume a 6th tab still exists and misdiagnose the
verifier's failure as its own bug.
**What was actually wrong (the real, narrow bug):** only `.claude/skills/verifier-browser.cjs`'s
hardcoded `NUMBERS_TABS` array — a piece of test tooling — never got updated for the 434caf8
consolidation. `src/horizon/__tests__/numbers-tabs.test.js` and the render-smoke suite were
correctly updated at the time (they don't reference a "Money flow" tab) — only this one visual
verification script drifted.
**Fixed:** 2026-07-08, same session. `NUMBERS_TABS` in `.claude/skills/verifier-browser.cjs`
trued to the current 5-tab list (`['Statement', 'Budget', 'Accounts', 'Taxes', 'Year by year']`).
`docs/HORIZON.md` and `docs/ROADMAP.md`'s parity table corrected to describe the 5-tab Numbers
screen with the consolidated Statement companion strip instead of a standalone Money-flow tab.
`npm test` unaffected (this touches only the `.claude/skills/` Playwright script, not the suite).

---

### Level 3 (Control) review fixes — WI-3.1 + WI-3.2, PRs #44 / #46 (2026-06-26)

**Source:** CodeRabbit + Gemini review of the Level-3 setter-bundle plumbing (WI-3.1/#98) and the
new **My details** screen (WI-3.2/#99). Because PR #44 was squash-merged before the bots finished,
the full cumulative diff was re-surfaced for a whole-diff review via a throwaway PR (#47, base =
pre-Level-3 commit), and the fixes landed on PR #46 across several incremental rounds. Suite
560 → **575** tests, lint clean, build OK, **golden master untouched** (all changes are display /
input-plumbing only). Files: `src/App.jsx` (the WI-3.1 bundles + coupled setters),
`src/horizon/screens/MyDetailsScreen.jsx`, `src/__tests__/setter-bundles.test.js`.

Functional-correctness bugs (all in the new Level-3 code unless noted):

1. **`ssClaimingAge.min` could exceed `max` (Major) — FIXED.** The BUG-17 floor
   `max(SS_MIN_CLAIM_AGE, currentAge)` ignored the upper cap, so for `currentAge > 70` (ages run to
   80) the bundle handed Horizon/Classic a slider with `min > max`. Now
   `min: Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge))` — the exact Classic clamp.
2. **Stored `ssClaimingAge` not clamped when current age advances (Major) — FIXED.** Fix #1 only
   corrected the slider *metadata*; `setCurrentAgeCoupled` still let `currentAge` rise past 70 while
   the stored claim age stayed below the new floor (value < min). Now clamps the stored value at the
   source. Regression test drives `currentAge → 78` and asserts the stored value stays in range.
3. **`lifeExpect` not synced when current age passes the horizon (Major) — FIXED.**
   `setCurrentAgeCoupled` pushed `retirementAge` up but left `lifeExpect` behind, so `lifeExpect` /
   `retirementAge` could fall outside their own min/max contracts. Latent in the original Classic
   current-age handler; surfaced once that handler was DRY'd onto the shared callback (see #11). Now
   `if (lifeExpect <= v) setLifeExpect(v + 1)`. Regression test added.
4. **State-tax-rate stepper stuck on mobile (High) — FIXED.** The snap-to-default threshold (`0.15`)
   exceeded the stepper step (`0.1`), so a single tap off the default snapped straight back to null —
   the field was uneditable on mobile. Lowered the threshold to `0.05` in **both** the bundle wrapper
   and the Classic `onChange` (duplicate copies kept in sync). Real-setter round-trip test added.
5. **`ssOverride` slider could clamp its own seed (Medium) — FIXED.** When the override is null the
   field seeds from `ssAnnualBenefit`; a high estimate (> 60k) exceeded the static max. Now
   `max: Math.max(60_000, ssOverride || ssAnnualBenefit || 0)` (the dynamic-max pattern).
6. **`marketplaceMonthlyPremium` stepper could go negative (Medium) — FIXED.** The bundle field had
   no `min`, so the `−` stepper could drive the premium below 0. Added `min: 0, step: 50`.

Rule-10 / quality / a11y fixes on `MyDetailsScreen`:

7. **`?? 0` / `seed: 0` fabrication removed (rule 10) — FIXED.** `DetailField` computed
   `editVal = isNull ? (seed ?? min ?? 0)` — fabricating a number when the model supplied neither.
   Replaced with a `canEdit` guard (a nullable field is editable only when a seed/min exists, else a
   read-only edge state). Separately dropped the screen-owned `seed: 0` on the marketplace-premium
   field — the bundle's `min: 0` already supplies the seed.
8. **`sliderMax` honoured for desktop tracks — FIXED.** Account-balance sliders used the 5M
   DeferredInput hard cap as the track max → coarse $10k steps. Now use `sliderMax` from the bundle,
   clamp-safe via `Math.max(sliderMax ?? max, editVal)` so a large balance never pins the thumb.
9. **Card header is a native `<button>` — FIXED.** Was a `role="button"` div; switched to a real
   button (kept `aria-expanded` + styling) for proper assistive-tech semantics. Dropped the now-unused
   `kbActivate` import.
10. **Conditional-render declutter matching Classic — FIXED.** Fields moot given another value are now
    gated: income plateau only when income grows, state-rate override only for taxed states, spouse
    income growth only with spouse income, flat employer match only in flat mode, marketplace
    household/premium only with marketplace coverage, Medicare-person only when on Medicare and married.
11. **Classic current-age handler DRY'd — FIXED.** The Classic "Current Age" slider had a duplicate
    inline `onChange` identical to `setCurrentAgeCoupled`; it now reuses the shared callback, so the
    SS-claim clamp (#2) and lifeExpect sync (#3) apply to both UIs from one definition.

The **CLAUDE.md "560 → 574"** flag (round 2) was a **false positive** and skipped: `560` is the
pre-Level-3 baseline and the right-hand number is the current locked total — the file is internally
consistent. (It now reads 575 after the regression tests above.)

---

### Numbers screen depth build-out review fixes — PR #38 (2026-06-24)

**Source:** CodeRabbit + Gemini review of PR #38 (`claude/kind-euler-rh0qvs`), Sessions 1–4.
Suite **516 tests**, lint clean, golden master untouched (all fixes display-only).

1. **MFJ income in `calcStatementView` — FIXED.**
   `App.jsx` was calling `calcStatementView({ currentIncome, … })` using the primary-only income
   instead of `householdIncome` (combined for MFJ — rules 3 & 9). The Statement tab's gross,
   keepPct, taxPct, and savePct were understated for MFJ filers. Fixed to pass `householdIncome`.

2. **Composition bar scope mismatch — FIXED.**
   `taxView.composition` mixed `fedTax` (a single working year) with the lifetime aggregates
   `rmdTaxBite` + `convTaxTotal`. Removed the working-year "Working tax" segment. Renamed the
   heading to "Retirement-phase tax composition (RMD + conversion)". Total 784_739 → 766_739
   (RMD + conversion only). Test mock and assertions updated.
   **File:** `src/App.jsx` (`taxViewBundle`), `src/horizon/screens/NumbersScreen.jsx`,
   `src/horizon/__tests__/numbers-tabs.test.js`.

3. **`taxSaveFromPreTax` scope — FIXED.**
   The 401k+HSA tax-saving callout used `safeDeduc` (all pre-tax deductions including other
   pre-tax) to compute "saves you $X in taxes." Fixed to `Math.round((contrib401k + contribHSA) *
   fedMarginal)` — matches what the copy actually says.
   **File:** `src/App.jsx` (line ~827), deps updated.

4. **Tab-strip keyboard accessibility — FIXED.**
   Numbers screen tab-strip `<div>` controls were not keyboard-operable. Converted to
   `<button type="button">` with `aria-pressed={on}`. Expandable year-by-year rows gained
   `role="button"`, `tabIndex={0}`, `aria-expanded`, and `onKeyDown` Enter handler.
   **File:** `src/horizon/screens/NumbersScreen.jsx` (tab strip ~L266; expandable row ~L1252).

5. **Jump bar filtered to displayed ages — FIXED.**
   Year-by-year jump bar showed age buttons for all marker ages including those past the "Show all"
   fold (unmounted rows). Fixed by filtering `markerByAge` to ages present in `displayedRows`.
   **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1176–1227).

6. **`WITHDRAWAL_RATE_DANGER_PCT` constant — FIXED.**
   The `wr <= 6` threshold was hardcoded; added `WITHDRAWAL_RATE_DANGER_PCT: 6` to ASSUMPTIONS in
   `src/config/irs-2026.js` and imported it (rule 1).
   **File:** `src/config/irs-2026.js`, `src/horizon/screens/NumbersScreen.jsx`.

7. **Null driver edge state — FIXED.**
   `planView.drivers.filter(d => !d.ok)` counted `d.ok === null` (inapplicable metric, e.g.
   longevity when plan is Infinity-sustainable) as a failing driver. Fixed to
   `d.ok === false` only. The On Track pill no longer shows false warnings for sustainable plans.
   **File:** `src/horizon/screens/NumbersScreen.jsx` (~L312).

8. **`markerByAge` key collision — FIXED.**
   When retire age equals RMD start age (73), the object literal `{ [73]: "Retire", [73]: "RMD
   start" }` silently dropped the first label. Fixed with a `reduce` that concatenates labels for
   the same age: `"Retire · RMD start"`.
   **File:** `src/App.jsx` (`markerByAge` memo).

9. **Budget footer total — FIXED.**
   The allocation-stack rows showed optimized values (`oa.opt*`) but the footer total showed
   `currentContribTotal` (unoptimized). Added `optimizedContribTotal` to `budgetView` in App.jsx
   and updated the screen footer to use it.
   **File:** `src/App.jsx` (`budgetView` memo), `src/horizon/screens/NumbersScreen.jsx` (~L694).

10. **Ref callback memory leak — FIXED.**
    Year-by-year row refs used `ref={el => { if (el) rowRefs.current[age] = el }}`. The `if (el)`
    guard prevented React's null-on-unmount from clearing the stale ref — a memory leak. Fixed by
    always assigning (`rowRefs.current[age] = el`) so unmount clears it as React intends.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1263).

11. **V9 referential stability — FIXED.**
    `markerByAge` and `tablePhases` were computed inline inside the `horizonProps` useMemo body
    (new object on every deps-triggered rerender). Now memoized as separate useMemo calls with
    their own targeted dep arrays. Their deps (`safeRetAge`, `depletionAge`, `safeLifeExp`)
    removed from `horizonProps` dep array. `taxViewBundle` dep array cleaned up (removed stale
    `fedTax`). All V9/principle-13 referential-stability tests pass.
    **File:** `src/App.jsx`.

12. **Footer copy — FIXED.**
    Year-by-year footer said "growth after tax" — inaccurate after BUG-35 (balances are gross).
    Now reads "balances and growth shown gross; taxes appear in the Tax and Draw columns."
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1366).

13. **`fmtMo` / `fmt` fix — FIXED.**
    The retirement income companion strip passed already-monthly values to `fmtMo()` (which divides
    by 12), displaying 1/12 of the correct dollar amount. Fixed to `fmt()`.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L473).

14. **Savings guideline `?? null` — FIXED.**
    Budget tab's savings rate pill used `savingsGuide ?? 15` — fabricating a 15% guideline when
    the driver was unavailable (rule 10 violation). Fixed to `?? null` with a null guard on render.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L510).

15. **Null display in expanded rows — FIXED.**
    Year-by-year expanded row used `fmt(engRow.rmdTax ?? 0)` and `Math.round(X ?? 0).toLocaleString()`
    — coercing null/missing values to $0 instead of "—". Fixed to `fmt(engRow.rmdTax)` etc.
    **File:** `src/horizon/screens/NumbersScreen.jsx` (~L1327, ~L859–865).

**New open bug filed:** BUG-40 (`taxView.composition.total` misses `drawTax`).

---

### Constants-correctness + latent-bug batch (2026-06-23)

**Source:** owner-directed follow-up to the whole-codebase review — verify the IRS/SSA constants
against authoritative 2026 values (so a 2027 refresh is a clean re-import) and clear remaining
latent correctness items. Branch `claude/ai-codebase-review-fpigu3`; committed incrementally,
highest-impact first. Suite 443 → **471** tests; lint clean.

1. **Stale FICA wage base — FIXED (data correctness; golden master moved deliberately).**
   `FICA_WAGE_BASE` carried the **2024** figure ($168,600) while labeled "2026". The authoritative
   2026 SSA contribution-and-benefit base is **$184,500** (2025 was $176,100). The 2026-06-16 FICA
   *rate split* made this **inert at the default** (default income $100k < base) — which is exactly
   why it survived that review — but the base caps SS AIME, and the default income grows above it in
   later working years, so AIME was understated. Fixed in `src/config/irs-2026.js`. Golden master
   moved, all direction-verified: ssAIME 12399→12977, ssAnnualBenefit 45,924→46,968, firstRMD
   62,071→62,279, totalRMDs 1,144,815→1,148,650, rmdTaxBite 202,423→204,864, spendableAtRet
   3,578,221→3,574,967 (higher SS floor → higher stacked retirement rate), netConversionBenefit
   -10,096→-9,981. `social-security` wage-base-cap tests updated (titles + thresholds).

2. **`fvAnnuity` negative-rate logic bug — FIXED (value-preserving at default).**
   `finance-math.js` guarded the geometric annuity formula with `rate > 0`, so any **negative real
   return** fell through to the linear `annual * years` branch — overstating the FV of a
   declining-balance annuity (a -2% real return treated as flat). Now `rate !== 0`; only an exactly
   zero rate degenerates to the linear limit. Used by the conversion optimizer + mega-backdoor
   projection. Default real return is positive → no golden-master impact. +1 regression test.

3. **SS claiming-factor clamp — extended to the two sites the 2026-06-16 batch missed (latent).**
   That batch hardened `calcBenefit` against out-of-range/fractional claiming ages but left
   `calcSpousal` and the own-record spouse path (`retirement-income.js:38`) doing a raw
   `SS_FACTORS[age] ?? 1` lookup — which silently returns the **un-reduced FRA factor** on a miss
   (overstating an early claim, under-crediting a delayed own-record one). Extracted the clamp+round
   into one shared `claimFactor(age)` helper (`social-security.js`) now used by all three. Latent
   today (sliders feed in-range integers); value-preserving at default (single → spousal 0). +4 tests.

**Defensive tooling:** new `src/config/__tests__/irs-2026.test.js` — a constants-integrity guard
(STRUCTURE + internal consistency: contiguous strictly-progressive tax brackets, std-deduction
mfj=2×single, LTCG 0/15/20 ascending, monotonic SS factors =1.0 at FRA, descending RMD
Uniform-Lifetime divisors, ascending IRMAA tiers, constant-increment ACA FPL, 51-jurisdiction state
tables, assumption fractions in (0,1)). Fails loudly on a malformed/out-of-order refresh edit.
Value-locks ONLY verified/stable figures (wage base 184,500, RMD age 73, FRA 67) so it never
entrenches an unconfirmed dollar amount. +23 tests.

**Constants audit — COMPLETED (web-verified vs 2026 IRS/SSA), corrections applied.** The audit
agent (re-run after the first attempt was cut off by a session limit) verified every constant
against primary IRS/SSA + reputable secondary sources. It found **the wage base was the tip of the
iceberg** — ~30 more dollar figures carried 2024/2025 values under a "2026" label. The unambiguous,
independently re-verified corrections were applied in this batch (golden master moved deliberately):
  - **HoH standard deduction** 23,350 → **24,150** (Rev. Proc. 2025-32, OBBB). Inert at default (single).
  - **All 8 LTCG thresholds** were 2024 values → 2026: single 47,025/518,900 → **49,450/545,500**;
    mfj 94,050/583,750 → **98,900/613,700**; mfs 47,025/291,850 → **49,450/306,850**; hoh
    63,000/551,350 → **66,200/579,600**.
  - **Roth phase-out** was 2025 → 2026: single 150k/165k → **153k/168k**; mfj 230k/240k →
    **242k/252k**; hoh 150k/165k → **153k/168k** (mfs 0/10k statutory, unchanged). Shifts the default
    user's in-band contribution years → `retRoth` 576,295 → 587,692.
  - **401k catch-up** 7,500 → **8,000**; **415(c)** 70,000 → **72,000**; **415(c)+catch-up** 77,500 →
    **80,000**; **HSA self-only** 4,300 → **4,400** (IRS N-25-67 / Rev. Proc. 2025-19). HSA inert at
    default (default contribution below the cap).
  - **SS PIA bend points** were 2025 → 2026 eligibility year: 1,226/7,391 → **1,286/7,749**. Raises
    PIA for the default AIME → ssPIA 3914→4010/mo, ssAnnualBenefit 46,968 → **48,120**, cascading to
    firstRMD 62,508, totalRMDs 1,152,878, rmdTaxBite 207,557, spendableAtRet 3,582,799,
    netConversionBenefit -9,854, withdrawalRate 1.44728, totalAtRet 3,964,475.
  - Stale unit-test fixtures that hardcoded old constants were corrected (calcPIA tests now derive
    from the config bend points so they're refresh-proof; HSA/Roth-band/LTCG fixtures retargeted to
    keep their original intent under the new thresholds). Verified figures value-locked in the new
    `irs-2026.test.js` so they fail loudly next refresh.

**ACA FPL + IRMAA — RESOLVED (owner decisions, 2026-06-23).** Both were design forks, now settled:
  - **ACA FPL (`ACA_FPL_2026`)** — was the **2024** guidelines (wrong). Owner chose the model-correct
    *prior-year* basis: ACA subsidy eligibility for a plan year uses the FPL guidelines published the
    prior calendar year, so 2026 coverage uses the **2025-published** HHS set (1=15,650 … 6=43,150,
    +5,500/person; Federal Register 2025-01377). Kept the `_2026` name (= "governs 2026 coverage") with
    an explicit comment that these are the 2025-published numbers + a REFRESH RULE (for 2027 coverage →
    use the 2026-published set 1=15,960 … 6=44,360). This is the user's "use the correct values, label
    them honestly" design.
  - **IRMAA (`IRMAA_BRACKETS_2026`)** — owner chose **Part B + Part D combined** (full retiree cost,
    matches the prior intent). MAGI breakpoints refreshed 2025 → 2026 (single 109/137/171/205/500k;
    mfj 218/274/342/410/750k) and surcharges set to 2026 combined B+D annual: 1,148 / 2,885 / 4,620 /
    6,355 / 6,936 (per-tier monthly Part B + Part D: 81.20+14.50, 202.90+37.50, 324.60+60.40,
    446.30+83.30, 487.00+91.00; Kiplinger 2026 IRMAA).
  - Both are **inert at the default** (default conversion MAGI sits below the first IRMAA tier and ACA
    doesn't apply at the Medicare-age retirement), so the golden master is unchanged. `healthcare.test.js`
    fixtures that hardcoded the old ACA/IRMAA values were retargeted; new figures value-locked in
    `irs-2026.test.js`. Every ❌ the federal/SSA audit found is fixed or owner-decided.

**State-tax tables — audited + corrected (2026-06-23).** A follow-up agent audited `STATE_TAX` +
`RETIREMENT_STATE_TAX` (51 jurisdictions × 2) against 2026 law. These are modeling *approximations*,
so the bar was "factually correct note / reasonable 2026 figure," not bracket-exact. Found + fixed
(all verified vs Tax Foundation 2026 + state sources; all inert at the default state → golden master
unchanged):
  - **HI Hawaii — factual error, highest impact.** Was `rate: 0` / "Fully exempts 401k/IRA/pension" —
    but Hawaii exempts only *employer-funded* pensions and **fully taxes 401k/IRA** (the app's whole
    subject). Now `rate: 0.075` with a corrected note. This was telling a Hawaii 401k retiree they owe $0.
  - **2026 enacted rate cuts:** KY 4.0→**3.5%** flat (both tables); GA 5.39→**4.99%** flat (both); OK top
    4.75→**4.5%** (HB 2764); UT 4.55→**4.5%** flat. Rates + note text updated.
  - **Structural-label fix:** NE note said "Flat 4.55%" but Nebraska is **graduated** (4.55% is the top
    rate) — note corrected. KS note "top rate 5.7%" → **5.58%** (2026), rate 0.057 → 0.056.
  - Reasonable/✅ confirmed: IL/IA/MS/PA/MI full retirement-income exemptions, WV 2026 SS exemption, the
    flat-rate states (AZ/CO/ID/IN/LA/NC/OH/MA), and all no-income-tax states. Graduated-state effective
    rates (CA/NY/OR/MN/etc.) read as plausible 2026 figures, none >1pt off. **The constants audit —
    federal, SSA, and state — is now fully closed.**

---

### Whole-codebase review fixes — P1 + P2 batch (2026-06-16)

**Source:** the parallel Claude + CodeRabbit + Gemini whole-codebase review (see `docs/REVIEW-FINDINGS.md`).
Two commits on `claude/ai-codebase-review-fpigu3`; golden master unchanged (all fixes value-preserving at the default state); 441 tests stay green, lint clean.

**P1 (correctness):**
1. **Catch-up contribution off-by-one** — `simulation.js:51`. `isEligibleForCatchup` tested *start-of-year* age (`currentAge + (y-1)`), excluding the year the user **turns 50** from 401k/415(c)/Roth catch-up limits. Now tests the year-end `age >= CATCHUP_AGE`. The test that locked the wrong behavior (`simulation.test.js`) was corrected. *(Flagged by Claude + CodeRabbit.)*
2. **Tax-composition rule-10 leak** — `NumbersScreen.jsx` Taxes tab summed `fedTax + rmdTaxBite + convTaxTotal` and computed per-segment `%` inline. Moved into the model: `App.jsx` `taxViewBundle` now provides a `composition: { segments[{label,val,pct}], total }`; the screen formats only (bar widths stay as layout). Test fixture extended to match. *(Claude + CodeRabbit.)*

**P2 (defensive / minor):**
- `action-cards.js` — "Capture full employer match" card now gated to `matchMode === "formula"` (no-op for flat match); hardcoded RMD ages in copy now from config (rule 1).
- `budget.js` — `matchContribNeeded` capped at `TRAD_401K_LIMIT_2026` (rule 4).
- `healthcare.js` — ACA cliff boundary `>=` → `>` (income exactly at threshold doesn't cross).
- `what-if.js` — guards for degenerate inputs (`step <= 0`, `targetLifeExpectancy <= safeRetAge`, `scenarioRetAge <= currentAge`) to avoid early-termination / fabricated depletion.
- `accumulation.js` — `balAtAge` equal-age interpolation guard (NaN).
- `roth-conversion.js` — `findOptimalConversion` non-positive/non-finite `step` guard (infinite-loop); Scenario-B conversion capped so `taxableB` can't go negative.
- `retirement-tax.js` — `calcWithdrawalOrderTax` taxable-withdrawal LTCG rate now stacks on the ordinary floor instead of always `ltcgRate(0)`.
- `JourneyScreen.jsx` — hardcoded "73+" → RMD start age from props/config.
- `NumbersScreen.jsx` — dropped dead `retVals[...] ?? 0` fallbacks (keys always present).
- React-correctness nits — `ChartTooltip` stable key; `ArcGraph` per-instance SVG ids via `useId()`, event-marker key includes index, literal `0.92` → `CONE_LOWER_ASYMMETRY`; `ThemeContext` listens for OS `prefers-color-scheme` changes in `auto`; `DeferredInput` default `min`/`max`; `TaxTimeline` zero-horizon guard.

**Disputed items — re-reviewed 2026-06-16 (owner asked to re-validate; 2 of 4 were real):**

- **Roth phase-out (Gemini) — REAL, FIXED.** `simulation.js` scaled the *desired* contribution by the
  phase-out fraction instead of reducing the *limit* and taking `min(desired, reduced limit)`. This
  under-counted Roth contributions for anyone in the phase-out band not already maxing out (the
  first re-review pass mistook "direction correct" for "formula correct"). Fixed: `reducedCap =
  rothCap × phasePct; return Math.round(Math.min(contribRoth, reducedCap))`. Reachable at the default
  (income grows into the $150–165k single band ~ages 44–47), so the **golden master moved
  deliberately**: `retRoth` 573_820 → 576_295, `totalAtRet` 3_950_603 → 3_953_078, `spendableAtRet`
  3_575_746 → 3_578_221, `withdrawalRate` 1.45236… → 1.45145…. +1 regression test (below-max
  in-band contributor gets full desired; above-cap pinned to the reduced limit).
- **FICA / Medicare cap (Gemini) — REAL, FIXED.** `tax-basis.js` applied the combined 7.65% to wages
  *capped* at the SS wage base, but **Medicare (1.45%) is uncapped** and there's an additional **0.9%**
  surtax above $200k single / $250k MFJ. Lumping understated FICA for high earners (overstating
  take-home / `grossAfterTax`). Fixed: split into SS (6.2%, capped per-earner) + Medicare (1.45%,
  uncapped) + Additional Medicare (0.9% above the filing-status threshold); new config constants
  `SS_TAX_RATE` / `MEDICARE_RATE` / `ADDL_MEDICARE_RATE` / `ADDL_MEDICARE_THRESHOLD`. **Value-preserving
  at the default** ($100k < wage base → 6.2%+1.45% = 7.65%, no surtax), so the golden master is
  unaffected; two `tax-basis.test.js` cases that had locked the *capped* high-earner value were
  corrected (they were locking the bug). +1 net regression test.
- **SS factor out-of-range fallback (Gemini) — latent, HARDENED.** `calcBenefit` fell back to the FRA
  factor (1.0) for any age outside the 62–70 table, which would understate a 71+ claim. Not reachable
  today (the claiming-age slider clamps to 62–70), so changes no current output; now clamps the age to
  the nearest 62/70 boundary before lookup (correct-by-construction). The test that asserted the FRA
  fallback was corrected.
- **MoneyEvents `ev.amount || ""` (CodeRabbit) — NOT a bug, dismissal stands.** For a money-event
  amount, `0` means "nothing entered," so collapsing to the placeholder is the intended empty state;
  `?? ""` would render a meaningless $0 row. The `onChange` already floors at `Math.max(0, …)`.

**Still deliberately NOT changed:** the vite `node`→`jsdom` suggestion (react-test-renderer needs no
DOM; 443 tests pass under `node`), the screen-`useState` / formatter-division "rule-10" over-flags
(benign UI state / display formatting), and the Shell perf nits (P3, deferred).

---

### ~~BUG-35~~ — Traditional 401k taxed twice (after-tax retirement seed **and** RMD/conversion tax on the gross balance)

**Reported:** 2026-06-13 · **Fixed:** 2026-06-15 (dedicated change, owner-approved; direction **A** — gross seed + one tax-honest engine).

**Severity:** Correctness — understated the retirement portfolio and overstated lifetime tax (plan read more conservatively / shorter-lived than reality). The double-count hid *inside* an internally-consistent ledger.

**Symptom:** the Traditional 401k had its tax taken out twice: once at the retirement seam (displayed/carried as `tradGross × (1 − fedMarginal)`, App.jsx:187) and again year-by-year in retirement (RMD + conversion tax on the gross balance). The two taxations weren't even the same rate — the seam used the **working** marginal rate, the walk used **retirement** brackets.

**Root cause:** the single retirement walk was **seeded after-tax** but **paid tax computed on the gross** balance, so rule 2b's "only the tax leaks" became a *second* taxation. Separately, the displayed RMD schedule (`calcRMDProjection`) projected the 401k at the **nominal** return and **ignored every withdrawal** (conversions, draws), inflating RMDs vs. the real balance.

**Fix (BUG-35 — per-account engine as the single retirement-phase source):**
- New per-account engine `buildRetirementWalkByAccount` (`retirement-engine.js`) tracks the four accounts separately, **seeds from GROSS**, and taxes every dollar **exactly once** — when it leaves a pre-tax account (conversion, RMD, or extra 401k draw), stacked bracket-accurately on the SS/pension floor. Exposes a per-row tax breakdown (`convTax`/`rmdTax`/`drawTax`).
- New orchestrator `buildRetirementPhase` (`retirement-phase.js`) makes that engine the **ONE source** for longevity, the displayed RMD schedule, `rmdTaxBite`, and the Roth-conversion benefit (with/without-conversion counterfactual). The old nominal-growth, withdrawal-ignoring `calcRMDProjection` / `calcRMDPostConversion` / `calcRMDTaxSchedule` are no longer on App's path.
- **Gross everywhere:** `"Trad 401k"` is displayed gross (App.jsx:187), so the chart/Statement/Accounts/Flow-Down/accumulation rows/what-if all use the gross basis (no chart jump at retirement); `totalAtRet` is gross; `spendableAtRet` is an after-tax **reference chip** haircut at the **retirement** effective rate (fixes the working-rate haircut too).
- **Default retirement expense** = the user's current living spend (`effectiveLiving`), not `3% × portfolio` — portfolio-independent, so it can't balloon when the headline goes gross.
- `evaluateConversionPlan` now consumes the engine's `rmdTaxSaved`/`conversionCost` (keeps only the conversion-window display sim + IRMAA/ACA costs); the optimizer searches via the same engine (`retPhaseBase`), so it can never optimize a different model than the screen shows.

**Headline moves (golden master re-locked, 2026-06-15):** balances gross (`totalAtRet` 3,484,197 → 3,950,603); default expense ~104,525 → 57,377 (current living spend); `firstRMD` 118,198 → 62,071; `rmdTaxBite` 683,974 → 202,423; `netConversionBenefit` 77,861 → −10,096 (aggressive bracket-fill is net-negative at this spend); `yearsSustained` 62.9 → Infinity (trivially sustainable at the lower, honest spend).

**Files:** `src/model/retirement-engine.js`, `src/model/retirement-phase.js` (new), `src/model/conversion-evaluation.js`, `src/model/flow-down.js`, `src/model/accumulation.js`, `src/model/what-if.js`, `src/App.jsx`, and the golden-master / accumulation / flow-down / conversion-evaluation / what-if / engine / phase tests.

**PR #32 review rounds (6, CodeRabbit + Gemini; merged 2026-06-15):** the engine drew heavy review. Resolved in-PR: (1) **RMD before conversion** (IRS sequencing — RMD on the full pre-tax balance, then convert the remainder); (2) **tax-on-tax gross-up** (when Taxable is exhausted and the 401k funds the income tax, that withdrawal is itself taxed — fixed-point solve); (3) **money events folded into `needed`** before the tax solve (a 401k-funded purchase is taxed + grossed up; depletion sees it via `spendShort`); (4) **stale "after-tax" display copy** → gross; (5) **taxable inflows taxed** (engine routes events through the shared `applyMoneyEvents`; flagged taxable inflow → `inflowTax` ordinary-income component); (6) **RMD-schedule `bal` = `r.trad`** not `r.total` ("Est. 401k Balance" column); (7) **conversion-benefit `rmdTaxSaved`** compared over the common active span (apples-to-apples when conversions change longevity); (8) **Flow-Down accumulation clamp removed** (negative real growth reconciles); (9) **per-account cards reconcile** to gross `totalAtRet` when `addlPreTaxBal>0`, and `retTrad` = `tradGrossAtRet` so the optimal/worst-case withdrawal pools match. +11 regression tests over the rounds (412 → **441**).

**Follow-ups (documented, not blocking — open in this file):**
- **BUG-36** — `what-if.js` (`calcWhatIfDelta`/`calcWhatIfScenario`) + `calcOptimizedScenario` still use the blended `buildRetirementDrawdown` for *deltas* (don't charge the spending-draw tax); accumulation event income tax also not on the engine.
- **BUG-37** — engine ignores the `conversionTaxSource` toggle (always "taxable"-style); honoring "converted" would move the golden master (owner-deferred).
- **BUG-38** — engine charges only *incremental* tax above the SS/pension floor, so SS/pension is effectively tax-free (`tFloor` never charged). Inert at default; needs income-surplus handling.
- **BUG-39** — Flow-Down *accumulation* growth is a residual plug, not `Σ(row.growth)` (rule 2b).
- A dedicated **per-account detail screen** (each account's trajectory + tax treatment over life) is the planned **PR-B**, and is the display home for feature **#47** (withdrawal sequencing — the engine already does the math).

---

### ~~BUG-34~~ — What-if "retire earlier/later" re-sims dropped permanent accumulation-phase money events

**Reported:** 2026-06-12 · **Fixed:** 2026-06-12 (during WI-0.1 / #110)  
**Files:** `src/model/what-if.js` (`calcWhatIfScenario`, consumed by `calcWhatIfChart`), `src/model/__tests__/what-if.test.js`.

**Symptom:**  
With a permanent money event in the accumulation phase (e.g. the Ideas life-event pill "Buy a home · $60k at 40" committed to the plan), any scenario that shifts the retirement age (Ideas scenario cards, the retire-at dial) showed an arc/stat starting balance that ignored the event — the scenario pretended the $60k was never spent.

**Root cause:**  
When the scenario retirement age differed from the base plan, `calcWhatIfChart` re-ran the accumulation simulation with `moneyEvents: []` — overriding the permanent plan events carried in `simInputs.moneyEvents` with an empty list. (Batch A had fixed the same class of omission for the **retirement**-phase walk via the `retDrawShared.moneyEvents` merge, but the accumulation re-sim kept the hardcoded `[]`.)

**Fix:**  
The shared scenario runner (`calcWhatIfScenario`) re-sims with `simInputs.moneyEvents.filter(ev => ev.age < scenarioRetAge)` and additionally moves permanent events that fall **between** the scenario retirement age and the base retirement age into the retirement walk (they leave the accumulation window when retiring earlier). Inert when there are no money events → default state and golden master unchanged.

**Tests:** regression in `what-if.test.js` — a permanent $100k outflow at 40 must reduce a retire-2-years-earlier scenario's starting balance vs. the same scenario without the event.

---

### ~~BUG-33~~ — Projected retirement bracket label read one bracket too high (skipped the standard deduction)

**Reported:** 2026-06-06 · **Fixed:** 2026-06-06  
**Files:** `src/model/taxes.js` (`projectRetirementBracket`), `src/model/__tests__/taxes.test.js`.

**Symptom:**  
The Detailed tab's "projected X% marginal bracket" label (for RMD years) read one bracket too high near a boundary. At the **default** state it showed **32%** where the correct taxable-income bracket is **24%**.

**Root cause:**  
`projectRetirementBracket` matched the bracket on **gross** retirement income (avg RMD + 85% SS + pension) against the bracket thresholds — but those thresholds are **taxable**-income thresholds. The standard deduction was never subtracted, unlike `marginalRate()` / `calcTax()`, which compute the working-year bracket **and** the actual RMD/conversion tax on `agi − deduction`. It's a display-only label that feeds no tax calc and isn't in the golden master, so no check caught it. At default, gross $211,609 sat just over the 32% line ($201,775); real taxable income $195,509 is 24%. Introduced when the inline block was extracted value-preservingly (the inline original had the same gap — pre-existing, not a regression).

**Fix:**  
Subtract the standard deduction once before the scan: `taxableIncome = max(0, projRetIncome − deduction)`, match the bracket on that. Applied exactly once (nothing else in this label's path applied it — no double-count), so it's now apples-to-apples with the working-year bracket and the actual retirement tax. Return now also exposes `taxableIncome`. Display-only change; **no headline/golden-master value moved.**

**Tests (271 → 272):** the existing `projectRetirementBracket` cases updated to taxable-income expectations (64k gross → 12% on 47.9k taxable, was 22%); added the default-boundary lock (211,609 gross → 24% on 195,509 taxable — the 32%→24% case).

---

### ~~BUG-29~~ — Roth conversion tax was not bracket-accurate (flat top-marginal rate, no state tax)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06 (owner-approved golden-master move)  
**Files:** `src/model/taxes.js` (new `stackedIncomeTax`), `src/model/roth-conversion.js` (`calcConversionSim`), `src/model/retirement-tax.js` (`rmdRowTax` de-duplicated), `src/App.jsx` (2 `calcConversionSim` call sites), `src/model/__tests__/golden-master.test.js`, `src/model/__tests__/roth-conversion.test.js`.

**Symptom:**  
The displayed net Roth-conversion benefit was understated — ~$47,047 at default when a bracket-accurate calculation gives ~$77,861. The conversion *cost* was overstated by taxing the whole conversion at a single marginal rate, overshooting a bracket on rounding, and omitting state tax.

**Root cause:**  
`calcConversionSim` taxed each conversion as `conversion × marginalRate(floor + conversion)` — every dollar at the top rate, even dollars that really fall in lower brackets — and a rounding overshoot pushed the whole amount into the next bracket. The RMD side was already bracket-accurate (`calcTax(floor+rmd) − calcTax(floor)`), so the two sides of `netConversionBenefit = rmdTaxSaved − conv.totalTax` ran on different tax models. State tax was applied to RMDs but not conversions. An incomplete rollout of feature #33.

**Fix:**  
- Added one shared primitive, **`stackedIncomeTax(amount, floor, filingStatus, stateRate)`** in `taxes.js` = `round((calcTax(floor+amount) − calcTax(floor)) + amount × stateRate)`.
- `calcConversionSim` now uses it (new `retStateRate` param, threaded from App.jsx at both call sites — display and optimizer). The `calcTax`-difference form also fixes the bracket overshoot (no single-rate lookup).
- De-duplicated: `retirement-tax.js:rmdRowTax` now delegates to the same primitive (dropped its `baseFedTax` param). **Value-preserving — `rmdTaxBite` stayed exactly 683,974.**
- **Headline moves (default, deliberate):** `netConversionBenefit` 47,047 → **77,861**; `yearsSustained` 61.99935 → **62.92429** (the tax-honest walk now pays less conversion tax, so longevity ticks up). Golden master updated with dated BUG-29 comments.

**Tests (230 → 233):** new "bracket-accurate tax (BUG-29)" block in `roth-conversion.test.js` — single-bracket conversion matches the flat proxy within ±1; a multi-bracket conversion is strictly cheaper than the flat proxy (the core fix); the state-rate component adds exactly `round(Σ conversion × rate)`. Conversion *amounts* (82,765 / 121,800 in `conversion-planning.test.js`) are unchanged — they come from `calcBracketFillTargets`, independent of the tax calc.

---

### ~~BUG-32~~ — SS break-even age wrong for delayed claims (collapsed to ≈ the claim age)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06  
**File:** `src/model/retirement-income.js` (`calcSSBreakEven`), test in `src/model/__tests__/retirement-income.test.js`.

**Symptom:**  
For a user claiming Social Security **after** Full Retirement Age (claim 68–70), the displayed "break-even age" collapsed to ≈ the claiming age (claim at 70 → showed ~70). It should land in the low 80s — where the larger delayed monthly benefit overtakes the cumulative payments an FRA claimer had been collecting since 67.

**Root cause:**  
The month loop started its timeline at `ssClaimingAge`. For a delayed claim, `ageNow` already starts above FRA, so the FRA baseline (`cum67`) began accumulating at the claim age too — the FRA claimer was never credited for the `SS_FRA → claimAge` months it had already collected. With no head start to overcome, the higher delayed monthly made `cumClaim >= cum67` true on the first iteration, returning ≈ the claim age.

**Fix:**  
Start the timeline at the **earlier** of the two ages: `const tStart = Math.min(ssClaimingAge, SS_FRA)` and walk `ageNow = tStart + m/MPY`. The two gated accumulators and both crossing checks are unchanged. This is symmetric:
- **Early claim (62):** `tStart = 62` = the old start → behavior identical (the early-claim test passes unchanged, proving no regression).
- **Delayed claim (70):** `tStart = 67` → `cum67` now gets its rightful 67→70 head start → the crossing lands at **age 82**.

Display-only; affects no portfolio/headline number. Default state claims at FRA (`ssBreakEven` is `null`), so the golden master is unaffected and test count is unchanged (230 — one existing locked test updated from `toBe(70)` to `toBe(82)`).
---

### ~~BUG-16~~ (Audit Finding C) — Spousal SS benefit not reduced for early spouse claiming

**Reported:** 2026-06-02 · **Fixed:** 2026-06-06 (shipped standalone ahead of the full #30 engine, per the tracker's "quick win" note)  
**Files:** `src/model/social-security.js` (`calcSpousal`), `src/model/retirement-income.js` (`calcRetirementIncome`), `src/App.jsx` (Spouse SS UI/state), tests in `social-security.test.js` + `retirement-income.test.js`.

**Symptom:**  
The spousal Social Security benefit was always computed as if the spouse claimed at Full Retirement Age — there was no spouse-claiming-age input at all, so an early claim was never reduced.

**Fix (owner-approved design):**  
- New state `spouseClaimingAge` (slider, 62–70) and `spouseBenefitBasis` ("own" record vs "spousal / 50% of primary"). The early-claim factor is applied to the chosen basis.
- `calcSpousal` is now a single-purpose helper `(pia, spouseClaimingAge)` returning the spousal floor, with the factor **capped at 1.0** — spousal benefits earn **no delayed credits**, so claiming after 67 does not inflate it (the key correctness nuance). The own-benefit path uses the **full** `SS_FACTORS[spouseClaimingAge]` (own benefit does earn delayed credits).
- The spouse's own-benefit input is now treated and labeled as an **at-FRA (67)** figure so the factor is meaningful.
- An **advisory note** appears when the unchosen basis would pay more (mirrors how SSA pays the greater of the two).
- Spouse benefit is now gated by **`isMarried`** (selection logic moved up from `calcSpousal` into `calcRetirementIncome`).

**Value-preserving:** default state is single/unmarried → spouse benefit 0 → `householdSS` and every golden-master value unchanged. The golden-master `householdSS` line was simplified to drop the spousal term (`calcBenefit(ssPIA, 67) * 12`) so the changed `calcSpousal` signature isn't mis-called. 7 new tests (231 → 238 on the batch branch): the no-delayed-credits cap, the `isMarried` gate, the own-record early reduction, and the advisory flip. Feature `#30`'s "calcSpousal (BUG-16 fix)" deliverable is now shipped.

---

### ~~BUG-30~~ — MFJ capital-gains rate used primary-only income (taxable-account drag understated)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-06 (shipped standalone, per the #30 tracker "quick win" note)  
**File:** `src/model/simulation.js` (per-year loop), test in `simulation.test.js`.

**Symptom:**  
For an MFJ household with two earners, the taxable brokerage account's LTCG drag was computed from primary-only income — a dual-$80k couple got a 0% LTCG rate when combined $160k should carry 15%, overstating taxable-account growth.

**Fix:**  
Hoisted the per-year spouse-grown income (`spouseGrown`, already computed for the Roth phase-out) and added it to the LTCG ordinary-income basis for MFJ only: `yearOrdinaryIncome = primaryMAGI − employeeDeferral − cHSA + (mfj ? spouseGrown : 0)`. Mirrors the existing `yearMAGI` combined-income pattern (CLAUDE.md rule 9). Spouse pre-tax deferrals aren't modeled yet (#30), so spouse income enters gross — consistent with how `agi` treats MFJ spouse income. **Inert at the default state** (single) → golden master unchanged. New test: an MFJ dual-earner household's taxable balance now grows slower than the single-filer equivalent (it correctly carries the 15% drag). Feature `#30`'s "ltcgRate combined-income (BUG-30 fix)" deliverable is now shipped.

---

### ~~BUG-31~~ — Flow-Down "Growth" was a plug hiding cross-equation mismatches; chart/longevity ignored retirement taxes

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05 (Path A — make the model tax-honest)  
**Files:** new `src/model/retirement-drawdown.js` (`buildRetirementDrawdown`), new `src/model/flow-down.js` (`calcFlowDown`), `src/App.jsx`, `src/model/drawdown.js`, `src/model/optimization.js`, `src/model/__tests__/golden-master.test.js`.

**Root cause (as filed):**  
The retirement portfolio was walked in ≥4 separate places (`totalChartData`, closed-form `calcYearsSustained`, `calcDrawdownYears`, `calcOptimizedScenario`), each with the tax-blind recurrence `bal = bal*(1+rReal) − yearNeed`. The Flow-Down waterfall then computed every "growth" figure as a **residual plug** (`distGrowth = distEndVal − distStartVal + distDraws + distRMDTax`), so it always balanced visually while silently absorbing: (A) a gross-vs-after-tax unit mismatch in the accumulation bridge; (B) the conversion-window tax the chart never subtracted; (C) the full `rmdTaxBite` (~$683,974 default) the chart never subtracted, plus an off-by-one in `distDraws`. Because the chart never charged the taxes, the headline longevity / depletion age were optimistic.

**Fix (Path A — owner-approved 2026-06-05):**  
- **One shared walk.** `buildRetirementDrawdown` is now the single source of truth; the chart, the headline longevity, the Flow-Down waterfall, `calcDrawdownYears`, and the optimizer all consume it, so they can never diverge again. Each row exposes `growth` (= `balStart·rReal`), `draw`, and `tax`.
- **Tax-honest.** The per-year recurrence is `balEnd = balStart*(1+rReal) − draw − tax`, where `tax` = the bracket-accurate per-year RMD tax (ages 73+) plus Roth-conversion tax (conversion window), passed in as per-age maps built from the existing `rmdDataWithTax` / `conversionSim.years` schedules. Only the **tax** leaks from the single pool; the RMD/conversion *principal* is not double-charged (single-pool assumption documented in `docs/FINANCIAL-MODEL.md`).
- **Growth is a true sum, not a plug.** `calcFlowDown` computes each "growth" as `Σ(row.growth)` independently; the bars reconcile by the walk's conservation law rather than by construction.
- **Facet A** fixed: the accumulation bridge puts the 401k start balance and contributions in the same after-tax units as `totalAtRet`. **Facet C off-by-one** fixed: phase draw ranges come straight from the walk rows.
- **Headline impact (default):** `yearsSustained` 88.60 → **61.99** (runs-out age 153 → 126). Still far beyond life expectancy, so the plan stays sustainable; the number is now honest. Golden master updated deliberately with a dated comment.

**Tests added (169 → 187):** `retirement-drawdown.test.js` (conservation `start+Σgrowth=Σdraw+Σtax+end`, anti-plug `residual==Σgrowth`, monotonicity, closed-form-vs-walk reconciliation incl. the BUG-26 deferred-SS trap) and `flow-down.test.js` (growth-is-a-true-sum, waterfall reconciliation, displayed RMD-tax == tax actually charged, off-by-one guard, Facet A units). These would have caught the original bug.

---

### ~~BUG-28~~ — Flow-Down distribution waterfall draws used the static `netPortfolioNeed` (ignored SS claimed after retirement)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05  
**File:** `src/App.jsx` (`flowData` → `distDraws`, ~line 644)

**Symptom:**  
In the Flow-Down tab's Phase 3 (distribution) waterfall, the "Living Expenses" step — and the "Portfolio Growth" step derived from it — were overstated for any plan where the user **retires before claiming Social Security** (e.g. retire 65, claim 67 or 70). The waterfall's start and end totals were correct (they come from the per-year chart), so the error was hidden: the inflated draws were exactly offset by inflated growth.

**Root cause:**  
`distDraws = netPortfolioNeed * actualSustainedYrs` used the **static** at-retirement `netPortfolioNeed` scalar. That scalar only subtracts SS when `ssClaimingAge <= safeRetAge` (`ssAtRet` gate). But the distribution phase is age 73+ — by then SS is always active (claiming age ≤ 70). So for an early retiree the per-year need in this phase is `expenses − SS − pension`, while the scalar was `expenses − pension`. The draws were too high by ≈ `householdSS × years` (~$780k in a typical case). Same family as BUG-10 (static `netPortfolioNeed` mis-handling deferred SS); the chart loop and `convWindowDraws` already gate SS/pension per year (CLAUDE.md rule 5b), but this one site was missed.

**Fix:**  
Replaced the scalar multiply with a per-year loop that gates SS and pension on their start ages, mirroring `convWindowDraws` and the `totalChartData` drawdown loop exactly. First draw age is `(distStartVal's age) + 1` — `RMD_START_AGE` when a conversion window exists (start value is the age-72 `portPreRMD`), else `safeRetAge + 1`. **Value-preserving in the default state** (default claims SS at retirement, so every distribution year already has SS → per-year sum equals the old scalar × years), so the golden master is unchanged; the fix only corrects the early-retiree case the default state doesn't exercise. Display-layer (component) computation, not in `src/model/`, so no golden-master/model-test movement.

---

### ~~BUG-27~~ — Roth post-conversion RMDs double-counted a year of growth (understated conversion benefit)

**Reported:** 2026-06-05 · **Fixed:** 2026-06-05  
**Files:** `src/model/rmd.js` (`calcRMDPostConversion`), `src/model/__tests__/rmd.test.js` (regression), `src/model/__tests__/golden-master.test.js` (locked value updated)

**Symptom:**  
The "net Roth-conversion benefit" was understated. At the default state the displayed figure was **$17,345** when the correct value is **$47,047** — the bug suppressed roughly $30k of benefit and would cause the conversion optimizer to recommend converting too little.

**Root cause:**  
`calcRMDPostConversion` starts from `tradBal73`, which `calcConversionSim` has **already grown to age 73** (it applies "one final year of growth on the trad balance to reach age 73"). But the RMD loop's first iteration (`age = RMD_START_AGE`) did `bal = bal * (1 + r)` *before* taking the age-73 RMD — growing the balance a second time. Every post-conversion RMD was therefore computed on a balance one year over-grown, and the whole post-conversion RMD schedule was shifted forward by a year. Because the baseline schedule (`calcRMDProjection`) has no such extra growth, the two sides of `rmdTaxSaved = rmdTaxBite − rmdTaxBitePost` were on different growth clocks, corrupting `netConversionBenefit` and the optimizer's `getNetBenefit`. The existing test only checked that post-conversion RMDs were *lower* than baseline (relative), so it never caught the absolute shift.

**Proof:**  
Ran the conversion engine with conversion amount = **0**. With no money actually moving, the post-conversion RMD schedule must equal the baseline exactly. It didn't — the post-conversion age-73 RMD equalled the baseline age-**74** RMD (one year of growth too high).

**Fix:**  
`calcRMDPostConversion` now skips the growth step in the first iteration (`if (age > RMD_START_AGE) bal = bal * (1 + r)`), because `tradBal73` is already the age-73 balance — matching `calcRMDProjection`'s convention. Added a regression test asserting the zero-conversion post-conversion schedule equals the baseline age-by-age. Golden master `netConversionBenefit` updated **17_345 → 47_047** as a deliberate, dated correctness change (CLAUDE.md rule 7).

---

### ~~BUG-26~~ — SS-delay gain years overstated (used full retirement portfolio, ignoring pre-70 drawdowns)

**Reported:** 2026-06-04 · **Fixed:** 2026-06-04  
**Files:** `src/model/drawdown.js` (new `calcDrawdownYears`), `src/App.jsx` (`ssDelayGainYrs`), `src/model/__tests__/drawdown.test.js`

**Symptom:**  
The "SS delay gain years" metric (`~X yrs longer`) overstated the portfolio-longevity benefit of delaying Social Security to age 70 — by 3–6 years for users who retire well before 70 and defer SS to the maximum.

**Root cause:**  
The old `ysSS70` solved a closed-form: "how long does the portfolio last drawing at the *post-SS-70* (lower) rate, starting from the full `totalAtRet`?" But between retirement and the age-70 claim, the user draws at a *higher* rate (no SS yet), so the portfolio is already partly depleted by 70. Starting the calculation from `totalAtRet` at the low post-70 draw ignored those higher pre-70 draws and inflated the result.

**Fix:**  
Replaced the closed-form with a new pure helper `calcDrawdownYears({ startBal, startAge, effectiveExpenses, rReal, ssAmount, ssClaimAge, pensionAmount, pensionStartAge })` that walks the drawdown **year by year**, gating SS and pension on their start ages per year — exactly mirroring the `totalChartData` chart loop (and honoring CLAUDE.md rule 5b: per-year income timing). `ssDelayGainYrs` now computes two year-by-year longevities from the same `totalAtRet` — one under the user's actual claiming age, one delaying to 70 with the larger age-70 benefit — and reports the rounded difference. The higher pre-70 draws in the delay scenario are now correctly captured. Returns `null` (no badge) when either scenario is sustainable indefinitely, matching prior behavior. The headline `yearsSustained` closed-form is unchanged; only this comparison metric moved to the per-year walk. Model layer, so golden master and all model tests still pass (6 new tests added for `calcDrawdownYears`, including a regression asserting the new delay figure is below the old closed-form overstatement).

---

### ~~BUG-17~~ (Audit Finding D) — SS claiming-age slider could be set below current age

**Reported:** 2026-06-02 · **Fixed:** 2026-06-04  
**File:** `src/App.jsx` (SS claiming-age `Slider`)

**Symptom:**  
The Social Security claiming-age slider allowed values below the user's current age (you can't claim in the past). Cosmetic only — the drawdown loops gate SS on `age >= ssClaimingAge`, so a past claiming age was already treated as "active from the start."

**Fix:**  
Slider `min` is now `Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge))` — floored at the current age but never exceeding the max claiming age (70), so the control stays valid even for users already past 70. No model change.

---

### ~~BUG-07~~ — Chart 1 Trad 401k normalization used Phase 1 rate for Phase 2 years

**Reported:** 2026-06-01 · **Closed (obsolete):** 2026-06-04  
**File:** `src/App.jsx` (Trad 401k chart normalization)

**Resolution — obsolete by refactor.**  
This bug described a mismatch between the mid-career *Phase 2 tax rate* (`rate2`) and the rate used to normalize the Trad 401k accumulation line. The entire phase-rate mechanism it depended on no longer exists: the rate1/rate2/rate3 sliders were removed in commit `cdca9be` ("Remove rate3/phase sliders — all tax rates now bracket-accurate"). The Trad 401k line is now normalized for **every** accumulation year at a single bracket-accurate `fedMarginal` rate (`App.jsx` `simData`), so there is no per-phase rate to mismatch and no retirement-year dip. The mid-career *scenario tool* itself is now tracked as premium feature #29.5 with its own state; the `phase2Actions` references that remain in `action-cards.js` are the unrelated action-plan grouping (Phase 1/2/3 = now / mid-career / retirement). Nothing to fix.

---

### ~~BUG-18~~ (Audit Finding G) — Retirement age could momentarily exceed `lifeExpectancy − 1`

**Reported:** 2026-06-02 · **Closed (already guarded):** 2026-06-04  
**File:** `src/App.jsx` (life-expectancy and retirement-age `Slider`s)

**Resolution — already guarded; verified.**  
The crossing is prevented by two independent layers that are both present in the current code: (1) the Life Expectancy slider has `min={retirementAge + 1}` and the Retirement Age slider has `max={lifeExpect - 1}`, so neither can be dragged past the other; and (2) the life-expectancy `onChange` handler explicitly clamps retirement age down (`if (retirementAge >= v) setRetirementAge(v - 1)`) within the same interaction. Verified by reading both handlers — no gap remains. Downstream loops additionally use `Math.max(1, safeLifeExp - safeRetAge)` guards as defense in depth. No change required.

---

### ~~BUG-25~~ — Optimizer bracket-mode mismatch, ACA omission, floor off-by-one, rmdTaxPost duplication

**Reported:** 2026-06-04 · **Fixed:** 2026-06-04 (code review findings 1–5)  
**Files:** `src/App.jsx`, `src/model/roth-conversion.js`

**Three correctness bugs + two architectural fixes from a post-batch-2 code review:**

**Finding 1 — Optimizer ignored ACA cliff costs (most severe).**  
`getNetBenefit` in `optimizerResult` returned `{ rmdTaxSaved, totalTax, irmaaCost }` and maximized `rmdTaxSaved − totalTax − irmaaCost`. The displayed "Adjusted Net Benefit" correctly subtracts `acaAnnualLoss` (lost ACA subsidies when a conversion crosses the 400% FPL cliff), but the optimizer never computed this. A user on marketplace insurance could receive an optimizer recommendation that crossed the ACA cliff, while the display simultaneously showed a negative adjusted benefit. Fix: replaced the inline IRMAA loop with a `calcHealthcareExposure` call (which already computes both IRMAA and ACA cliff exposure per year). Added `acaLoss` to the `getNetBenefit` return shape and updated `findOptimalConversion` to subtract it: `rmdTaxSaved − totalTax − irmaaCost − (acaLoss ?? 0)`. Optimizer display guard widened from `hasMedicare` to `hasMedicare || hasMarketplaceInsurance`.

**Finding 2 — Optimizer ran in bracket mode against a different model than displayed.**  
In bracket mode, `conversionSim` uses `annualConversions: bracketFillConversions` (a per-year array where pre-SS/pension years have more bracket room). The optimizer's inner `calcConversionSim` only received `annualConversion: amount` — a flat scalar that always overrides the array. Optimizing a flat scalar produces a different conversion profile than what bracket mode computes, making the suggestion inconsistent with the numbers shown. Fix: `optimizerResult` now early-returns `null` in bracket mode. The optimizer is only meaningful in custom mode (choosing the best flat annual amount); the per-year bracket targets are already determined by the bracket choice.

**Finding 3 — `buildIncomeFloors` age gate off by one (SS floor missing from the first SS year).**  
The `buildIncomeFloors` helper computed `age = safeRetAge + i` for i = 0…N−1, so `convFloors[0]` applied the SS gate using age `safeRetAge`. But the first conversion year in the simulation is displayed as age `safeRetAge + 1` (because `calcConversionSim` produces 1-indexed years and App.jsx adds the offset). The arrays are paired by index, so `convFloors[0]` (gate at `safeRetAge`) was used as the income floor for the year displayed as `safeRetAge + 1`. When `ssClaimingAge == safeRetAge + 1` (e.g., retire at 65, claim SS at 66 — a common setup), `convFloors[0]` checked `65 >= 66 = false` (no SS), but the displayed conversion year 0 IS the first SS year. The bracket-fill conversion target for that year was computed without the SS income floor — over-estimating the available room by approximately `ssTaxableRet` (~$20–24k). The same error propagated into `calcConversionSim`'s `retIncomeFloors`, understating the tax on that year's conversion. Fix: `age = safeRetAge + i + 1` — now aligned with the displayed year ages.

**Finding 4 — `rmdTaxPost` reduce in optimizer duplicated `rmdTaxBitePost` formula.**  
The same reduce (calcTax on rmdIncomeFloor + rmd, accumulate (tax − rmdBaseFedTax) + rmd × retStateRate) appeared verbatim at two sites: lines ~448–451 (display path) and lines ~493–496 (optimizer inner loop). Fix: extracted a `calcRMDTax(rows)` helper defined once in the component and called at both sites.

**Finding 5 — `healthcareExposure` not memoized.**  
`calcHealthcareExposure` and its three derived values (`acaCliffYears`, `totalIRMAACost`, `acaAnnualLoss`) were computed inline on every render, including unrelated UI events like tab switches. Fix: wrapped in `useMemo([conversionSim, convMAGIFloors, hasMarketplaceInsurance, householdSize, hasMedicare, filingStatus])` — recomputes only when healthcare-relevant inputs actually change.

**Tests added:** `findOptimalConversion` subtracts `acaLoss`; `acaLoss ?? 0` backward compatibility; per-year floor produces higher tax once SS income is included in the floor (guards the off-by-one fix).

---

### ~~BUG-22~~ — `convFloors` / `convMAGIFloors` duplicated loop + optimizer re-ran every render

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx`

**Symptom:**  
Two nearly identical per-year income-floor loops existed (`convFloors` for tax math using 85% taxable SS, `convMAGIFloors` for ACA/IRMAA MAGI using 100% SS). Separately, `convFloors`, `convMAGIFloors`, `retVals`, `currentSnapshot`, and `bracketFillConversions` were all created inline (`Array.from` / `Object.fromEntries` / object literal) on every render, so they produced new references each render. Because those references are dependencies of the `conversionSim` and `optimizerResult` memos, the 61-candidate conversion optimizer (≈3,000 inner iterations) re-ran on **every keystroke**, not only when its real inputs changed.

**Root cause:**  
The duplicated loop differed only in the SS amount; the unstable references defeated `useMemo` dependency comparison.

**Fix:**  
Extracted a single `buildIncomeFloors(ssAmount)` helper used for both arrays (the only difference — `ssTaxableRet` vs `householdSS` — is now an explicit argument). Memoized `convFloors`, `convMAGIFloors`, `bracketFillConversions`, `retVals`, and `currentSnapshot` with complete dependency lists (every reactive value each one reads), so they refresh exactly when an input changes and stay referentially stable otherwise. The optimizer now re-runs only when a genuine input changes. Pure refactor — all computed values are byte-identical (golden master unchanged).

---

### ~~BUG-21~~ — Roth-conversion optimizer dropped the first IRMAA year for early retirees

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx` (`optimizerResult` IRMAA loop)

**Symptom:**  
The conversion optimizer's IRMAA cost loop computed each conversion year's age as `safeRetAge + i`, but the conversion sim (and the on-screen IRMAA figure via `calcHealthcareExposure`) treats conversion year `i` as age `safeRetAge + i + 1` — conversions start the tax year **after** retirement, ending at age 72 before RMDs at 73. For an early retiree (≈ `safeRetAge ≤ 63`), the optimizer's age was one year low, so the first conversion year's IRMAA surcharge (`age + 2 ≥ 65`) fell below the Medicare threshold and was skipped. The optimizer therefore under-counted IRMAA cost and could recommend a larger conversion than the displayed numbers support.

**Root cause:**  
Same off-by-one family as ~~BUG-11~~ (age-gated conversion-window loop starting at `safeRetAge + i` instead of `safeRetAge + i + 1`), reintroduced in the new optimizer code (batch-2).

**Fix:**  
The optimizer now derives the age from the conversion sim's own 1-indexed `years[i].age` (`safeRetAge + (sim.years[i].age ?? i + 1)`), identical to the display path in `calcHealthcareExposure`. Verified against a retire-at-62 scenario: optimizer and UI now both count 10 IRMAA years (previously 9 vs 10). Also tightened the MAGI fallback from `?? amount` to `?? 0` for clarity (the year row always exists, and `??` never triggered on a `0` conversion anyway). Test-side: `action-cards.test.js` was passing the obsolete `rate3Combined` key instead of `effectiveRMDTaxRate`, leaving the rate `undefined` ("~NaN% effective") with no assertion to catch it — renamed the key and added a test asserting the RMD row renders the rate and contains no "NaN".

---

### ~~BUG-20~~ — App crashed on render: `fedMarginal` used before initialization (TDZ)

**Reported:** 2026-06-03 · **Fixed:** 2026-06-03  
**File:** `src/App.jsx` (lines ~140 / ~144 / ~155, declaration at ~177)

**Symptom:**  
The entire app threw `ReferenceError: Cannot access 'fedMarginal' before initialization` on first render — a blank page. The `simData` memo (body + dependency array) and `currentSnapshot` read `fedMarginal`, but it was declared ~35 lines further down. `const` bindings sit in the temporal dead zone until their declaration line runs, so reading it earlier is a hard crash.

**Root cause:**  
The rate3-slider removal (batch-2) switched the `"Trad 401k"` after-tax normalization from the early `rate3` state to the later-computed `fedMarginal`, but left `fedMarginal`'s declaration below the code that now consumes it. It shipped undetected because `npm test` only exercises the pure-function model layer — nothing rendered `App.jsx`.

**Fix:**  
Moved the tax-basis block (`combinedIncome`, `totalPreTaxDeduc`, `safeDeduc`, `agi`, `fedTax`/`fedEffRate`, `fedMarginal`) above the `simData` memo so the value exists before it's read. Added a permanent render smoke test (`src/__tests__/render-smoke.test.js`) that `renderToString`s `App` once, so any future TDZ/runtime error in the component body fails CI instead of only the browser.

---

### ~~BUG-15~~ (Audit Finding F) — "Household Gross" / "FICA (both earners)" labels shown for non-MFJ filers

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` line 794

**Symptom:**  
The 2026 Tax Breakdown card labeled the gross-income row "Household Gross" whenever `spouseIncome > 0`, even for non-MFJ filers (single / MFS / HoH) where the displayed `householdIncome` is *primary-only*. The label implied the spouse's income was included when it was not.

**Root cause:**  
The label keyed on `spouseIncome > 0` rather than on filing status. Per CLAUDE.md rules 3 & 9, only MFJ uses combined household income; for every other status `householdIncome = currentIncome` (primary only).

**Fix:**  
The gross-income label now keys on `filingStatus === "mfj"` ("Household Gross") vs. otherwise ("Gross Income"), matching the value actually shown. The FICA label is left keyed on `spouseIncome > 0` ("FICA (both earners)") — that is correct, because FICA is always computed per-earner across both spouses regardless of filing status.

---

### ~~BUG-14~~ (Audit Finding E) — Flat employer match treated as contingent in the surplus optimizer

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/model/budget.js` (`calcOptimizedAllocation`, lines 51–63)

**Symptom:**  
With employer match set to **flat** mode (employer contributes `salary × pct` unconditionally), the "Optimized" surplus allocation still steered the user's own surplus into the 401k "to capture the match" — money that should go to HSA/Roth first in IRS-priority order. The advice was wrong because a flat match is paid regardless of what the employee contributes.

**Root cause:**  
The match-capture step ran for both modes and, for flat mode, computed the match *amount* (`salary × employerMatchPct`) and treated it as a contribution the user must make.

**Fix:**  
The match-capture step now runs only when `matchMode === "formula"` (the only mode where the match is contingent on the employee's own deferral, e.g. "50% of the first 6%"). In flat mode, surplus flows to HSA → Roth → 401k → taxable in correct priority. Added a flat-mode test asserting `extraMatch === 0` with HSA/Roth funded first; kept a formula-mode test asserting the match gap is still captured.

---

### ~~BUG-13~~ (Audit Finding B) — Roth conversion bracket-fill used a single steady-state target for every year

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` (bracket-fill block + display), `src/model/roth-conversion.js`, `src/model/action-cards.js`

**Symptom:**  
In "fill a bracket" mode, the recommended annual conversion was a single static amount computed as if Social Security and pension income were active in every year of the conversion window. A user who retires early and defers SS has several low-income years with far more bracket room available, but the app recommended the same conservative amount throughout — under-converting in the cheap early years.

**Root cause:**  
The per-year *tax* was already correct (`convFloors` gates SS/pension on claiming/start age per year, and `calcConversionSim` uses `retIncomeFloors`), but the conversion *target* (`annualConversion`) was a single scalar derived from the steady-state floor.

**Fix:**  
- `calcConversionSim` gained an optional `annualConversions` array (mirrors the existing `retIncomeFloors` pattern); each loop year uses `annualConversions[yr] ?? annualConversion`. Fully backward-compatible — omitting it reproduces the scalar behavior, so the golden master is unchanged.
- App.jsx now builds `bracketFillConversions` per year from `convFloors[i]` (bracket top + deduction − that year's income floor) and passes it in bracket mode only.
- The headline "Annual Conversion" metric and the "Suggested annual conversion" line show a range (`peak → steady`) with a "tapers as SS/pension begin" note when the amounts vary; the Roth-ladder action card wording adapts the same way. The year-by-year table already reflects the varying amounts.

---

### ~~BUG-12~~ (Audit Finding A) — Roth IRA phase-out used combined income for non-MFJ filers

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` (~line 179), `src/model/simulation.js` (~line 81), `src/model/action-cards.js`

**Symptom:**  
The Roth IRA contribution phase-out was tested against *combined* household income (`currentIncome + spouseIncome`) for every filing status. A single / MFS / HoH filer with a working spouse was falsely warned they were in (or over) the Roth phase-out zone, and the projection simulation wrongly reduced or zeroed their projected Roth contributions.

**Root cause:**  
Both the live-year flags (`rothPhaseoutWarning`, `rothFullyPhased`) and the per-year simulation phase-out test summed primary + spouse income unconditionally. Per CLAUDE.md rules 3 & 9, only MFJ files jointly; every other status reports separately and should be tested on the primary earner's MAGI alone.

**Fix:**  
Introduced `rothMAGI = filingStatus === "mfj" ? combinedIncome : currentIncome` (mirrors the existing `agi` gate) and used it for both phase-out flags; the phase-out action card now prints `rothMAGI` with "combined" wording only for MFJ. In `simulation.js`, the per-year test is now `yearMAGI = filingStatus === "mfj" ? primaryMAGI + spouseMAGI : primaryMAGI`. Added simulation tests: a single filer with a high-earning spouse is no longer phased out, while an MFJ household with the same combined income still is.

---

---

### ~~BUG-11~~ — Flow-Down conversion window draws counted from wrong starting year

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**Files:** `src/App.jsx` lines 454–470, `src/model/action-cards.js` line 307

**Symptom:**  
The Flow-Down tab "Optimize & Convert" phase card showed "Living Expenses" (convWindowDraws) and "Portfolio Growth" (convWindowGrowth) that didn't balance against the actual chart trajectory. The "entering RMDs" connector value also showed the portfolio after the first RMD draw rather than before.

**Root cause:**  
Two related issues:

1. `convWindowDraws` loop started at `safeRetAge + i` (i=0 → age=safeRetAge, the retirement year). The chart makes no draw at the retirement year (drawdown starts at `safeRetAge + 1`), so `convWindowDraws` counted one phantom draw at retirement and missed the last actual draw at `RMD_START_AGE - 1`.

2. `portAt73` was sourced from `totalChartData.find(d => d.age === RMD_START_AGE)?.total`. The chart value at age 73 is the portfolio *after* the age-73 draw (first RMD), so `convWindowGrowth = portAt73 - totalAtRet + convWindowDraws + taxes` absorbed the first RMD draw as negative growth — making convWindowGrowth appear lower than actual investment return.

**Fix:**  
- Renamed `portAt73` → `portPreRMD` and changed the lookup to `RMD_START_AGE - 1` (age 72 — portfolio after the last conversion-window draw, before any RMD).
- Changed `convWindowDraws` loop to start at `safeRetAge + 1 + i` so it covers the same years as the chart drawdown ([safeRetAge+1, safeRetAge+conversionWindowYrs]).
- With both changes, `convWindowGrowth = portPreRMD - totalAtRet + convWindowDraws + taxes` equals pure investment return during the window.
- Updated `action-cards.js` label from "Portfolio at 73" → "Portfolio entering RMDs".
- Updated `action-cards.test.js` mock key accordingly.

---

### ~~BUG-09~~ — `totalChartData` SS/pension income off by one year (`>` vs `>=`)

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` lines 290–291

**Symptom:**  
The Portfolio Lifecycle and Total Portfolio — Full Lifecycle charts showed Social Security and pension income reducing portfolio draws starting one year later than the claiming/start age. For example, if SS claiming age was 67, the chart did not reduce draws at age 67 — only from age 68 onward.

**Root cause:**  
`totalChartData` drawdown loop used `age > ssClaimingAge` and `age > pensionStartAge` (strict greater-than). Every other age-gated loop in the codebase (`flowData.convWindowDraws`, `convFloors`) correctly uses `>=`. The `>` operator skips the claiming-age year itself, offsetting income by one year.

**Fix:**  
Changed both comparisons to `>=` (two character changes). The Portfolio Lifecycle and Total Portfolio charts now include SS/pension income starting at the exact claiming/start age, consistent with all other income-timing loops.

---

### ~~BUG-10~~ — Static `netPortfolioNeed` included SS even when `ssClaimingAge > safeRetAge`

**Reported:** 2026-06-02 · **Fixed:** 2026-06-02  
**File:** `src/App.jsx` lines 238–244, 1385–1396, 2185

**Symptom:**  
The Withdrawal Rate and Years Sustained headline cards, along with the "Portfolio draws" breakdown, showed SS income reducing the portfolio need even when the user's SS claiming age was after their retirement age. For example, retiring at 65 with SS claiming age 67 (FRA) would show `netPortfolioNeed = expenses − SS`, as if SS was available from day 1 — making the withdrawal rate appear lower than reality.

**Root cause:**  
`netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, householdSS, effectivePension)` used `householdSS` (full SS amount) without checking if `ssClaimingAge <= safeRetAge`. `effectivePension` was already correctly gated on `pensionStartAge <= safeRetAge`, but SS had no equivalent gate.

**Fix:**  
Added `ssAtRet = includeSS && ssClaimingAge <= safeRetAge ? householdSS : 0` — mirrors the pension gate exactly. `netPortfolioNeed` now uses `ssAtRet`. The breakdown card shows SS as "starts age X · deferred" (muted, not subtracted) when claiming age is after retirement, so the user understands their full portfolio draw requirement. The `householdSS` variable is unchanged for per-year loops and display contexts.

---

### ~~BUG-08~~ — RMD reference line missing in Portfolio Lifecycle chart for users retiring at 72

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 2489

**Symptom:**  
In the Flow-Down tab's "Portfolio Lifecycle" chart, the orange "RMDs age 73" reference line only appeared when `flowData.hasConvWindow` was true (i.e., `safeRetAge ≤ 71`). A user retiring at age 72 has zero conversion window years but RMDs begin at 73 — the reference line didn't appear even though it was directly relevant.

**Root cause:**  
The condition `flowData.hasConvWindow` (`conversionWindowYrs > 0`) was used as the gate. `conversionWindowYrs = RMD_START_AGE − 1 − safeRetAge`. At `safeRetAge = 72`, this equals 0, so `hasConvWindow` is false and the line was suppressed.

**Fix:**  
Changed the gate to `safeRetAge < RMD_START_AGE`. The RMD marker now appears whenever retirement precedes age 73, regardless of whether a conversion window exists. When `safeRetAge ≥ RMD_START_AGE` (already in RMD territory at retirement), the line is correctly suppressed because it would overlap or precede the retirement marker.

---

### ~~BUG-01~~ — Retirement age minimum is current age + 2

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**Files:** `src/App.jsx` (8 edits), `feature-tracker.html`

**Root cause:** `safeRetAge = Math.max(retirementAge, currentAge + phase2Start + 1)` applied the Phase 2 constraint unconditionally, even when Phase 2 was off. With `phase2Start` defaulting to 2, the floor was always `currentAge + 3` internally and `currentAge + 2` on the slider.

**Changes:**
- `safeRetAge` formula is now conditional: uses the Phase 2 constraint only when `showPhase2 = true`; otherwise `safeRetAge = retirementAge` directly.
- Retirement Age slider `min` is now `showPhase2 ? currentAge + 2 : currentAge`, allowing retirement age as low as current age (already retired).
- Current Age `onChange` guard updated to match: bumps retirement age to `currentAge + 2` only when Phase 2 is on; otherwise only prevents retirement age going below current age.
- Phase 2 toggle button bumps retirement age up to `currentAge + 2` proactively when Phase 2 is enabled from a low retirement age.
- `currentSnapshot` object introduced as a "year-0" fallback (current balance values with the same shape as `simData` rows). Used by: `atRetirement`, `rmdData`, `conversionSim`, and `totalChartData` when `retirementAge === currentAge`.
- `totalChartData` seeds a starting data point at `age = currentAge` when the user is already retired, so the drawdown chart starts from actual current balances rather than $0.
- Mid-career phase tagged as planned premium feature in `feature-tracker.html` (item #29.5), to be gated via the `isPremium` flag when #29 ships. No lock overlay built yet.

---

### ~~BUG-02~~ — "Fed / AGI" label reads as a division expression

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 764  
**Change:** Sub-label changed from `"fed / AGI"` to `"fed tax ÷ AGI"`. Same treatment applied to the Combined sub-label (`"all / gross"` → `"all ÷ gross · ref only"` and `"all / household"` → `"all ÷ household · ref only"`).

---

### ~~BUG-02a~~ — "Combined" effective rate unexplained

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` lines 766, 778  
**Change:** Marginal and Combined stats are now rendered in muted color with "ref only" in their sub-labels, visually distinguishing them from the headline Fed Effective rate. The explanatory note now explicitly states that these two figures are current-year reference only and do not feed into projections; it also points the user to the Phase 3 Retirement Federal Rate as the value that actually drives all projections.

---

### ~~BUG-03~~ — "Other Pre-Tax" row appearing from nothing causes layout jump

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 611  
**Change:** Removed the `{otherPreTaxDeduc > 0 && ...}` conditional. The "Other pre-tax" row is now always rendered; it shows `—` in muted color when the slider is at $0, and switches to the dollar amount in blue once a value is entered. Card height no longer changes as the slider moves off zero.

---

### ~~BUG-03a~~ — HSA default appears in Pre-Tax Deductions but is set far below

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 608  
**Change:** Added `(set in Accounts below)` in italics next to the "HSA contribution" label in the Pre-Tax Deductions breakdown. No model changes.

---

### ~~BUG-04~~ — "→ $X at ret." annotation is unexplained

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` lines 1135–1174  
**Change:** Added a small sub-line beneath the annotation reading *"contrib. amount scaled with income growth"* so the user understands the number is a projected contribution dollar amount, not a portfolio value.

---

### ~~BUG-04a~~ — "→ $X at ret." projection can show values above IRS limits

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1136  
**Change:** The projected contribution is now capped at `contribMax` (the per-account IRS limit) before display. When the projection hits the cap, `(IRS cap)` is appended to the annotation, making it clear the number represents the maximum allowed rather than an unconstrained projection. The growth calculation is also guarded to only run when `incomeGrowth > 0` to avoid showing a projection that equals the current contribution.

---

### ~~BUG-05~~ — Retirement Federal Rate: unclear what it drives

**Reported:** 2026-06-01 · **Fixed:** 2026-06-01  
**File:** `src/App.jsx` line 1063  
**Change:** Added a short paragraph inside the Phase 3 card above the retirement-state selector: *"This rate drives all post-retirement calculations: portfolio charts, drawdown model, Roth conversion analysis, and the withdrawal strategy card. An incorrect estimate will silently skew every projection."*

---

## Conventions

- Add new entries at the top of "Open Issues."
- When fixing a bug, move it to "Resolved" and add: **Fixed:** date, commit SHA, brief description of change.
- Link relevant file + line numbers for every entry so they stay navigable as the codebase evolves.
- **Re-verify, don't just append.** "Make BUGS.md up to date" means a *verification pass*, not a logging pass. For **every** entry still under "Open Issues," open the referenced file + line and confirm the symptom still reproduces in the current code before leaving it open. If the cause is gone (the code was removed/refactored — e.g. BUG-07) or already guarded (e.g. BUG-18), move it to Resolved with a dated note explaining why. Stale-open entries are a documentation bug.
- **When you change code, sweep the open list.** A refactor or removal can silently moot an open entry that lives in a different file. After any non-trivial code change, scan "Open Issues" for anything the change affects and reconcile it in the same session — don't let obsolescence outlive the commit that caused it.
- A speculative or audit finding must be **verified against the code before** it is filed as Open. If it can't be reproduced, either don't file it or file it as Resolved/"already guarded" with the reason.
