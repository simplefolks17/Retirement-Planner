# Directions — Retirement Planner Redesign

One-page brief so a fresh chat (or teammate) can pick up without reading the full thread.

**File:** `wireframes/Retirement Planner Redesign.html` — a design canvas (pan/zoom) holding every direction as artboards. Frames live in `wireframes/frames-*.jsx`. Shared primitives in `frames-shared.jsx` (the `W` palette, `Label`, `Num`, `Panel`, `Browser`, `Phone`, charts). Numbers trace to `docs/FINANCIAL-MODEL.md`.

---

## The product
**Horizon** — a retirement planner. Audience skews wide, including 50+. Core tension we designed around: be **encouraging and honest** without the original app's "running out of road / end is near" feeling.

## The journey so far
We started from earlier options A/B/C and landed on a reframed spine, then pushed it three ways. **Each direction builds on the one before — they are not independent.**

### C+ · The reframed Journey  (`frames-cplus.jsx`) — the calm baseline
The agreed core. C's life-timeline spine, warmed with A's tone and B's "start from a real plan."
- **Anti-doom mechanics:** today-anchored (not birth→death), open-ended terminus ("for life · past 90 with $1.4M to spare" instead of a finish flag), later years rendered **warm** (the payoff), phases named Today → Building → **Retirement** → Your good years.
- **Onboarding:** two answers (age + income) → a complete, real plan you nudge, never a blank interrogation.
- **Shape it / Read it** toggle is the rhythm of every phase (inputs hidden until asked). Full configurability is intact, just deferred behind "Shape it" (starting balances, contributions, match, HSA, growth, end-age).
- **Rotating activity line:** "Work optional, **golf course** mandatory." — bold colored flourish, cycles ~2.6s. The ONLY place the playful voice appears (keeps it from feeling try-hard).
- Home has an **"AT A GLANCE"** stat row with a gold **"Customize what you see · Premium"** affordance (drag-handles on cards).
- Progress bar: explored 4 treatments (`cp-prog`). Recommendation = goal % + momentum for on-track users, auto-fall back to the adaptive "behind" treatment.

### D · The living Horizon  (`frames-d.jsx`) — alive & personal
C+ plus delight:
- **What-if chips** ("Retire at 60", "Save $300 more", "Big trip at 70") that live-reshape the numbers. Math is the SAME projection engine re-run with one input changed — chips and the deep editor call the same function. Each chip states its assumptions inline.
- **"+ Adjust the details →" chip** opens a Shape-it drawer with the real, full controls (the honest exit from presets).
- Numbers **count up** on load and re-animate on change. **Golden-hour** glow warms the timeline's later years.
- **"Your someday" moment** — backdrop has 4 sources, storage-conscious: **Auto** (generated scene that *follows the rotating tagline* — powder/fairway/shore; stores nothing; the default), **Pick one** (curated library, stores a 1-byte choice), **Yours** (personal photo upload — **Premium**, the only path that hosts a file), **Off** (escape hatch). In production the gradients become real curated photos; sync logic is identical.

### E · The full picture  (`frames-e.jsx`) — depth for number-hawks
C+ plus the original app's deep numbers, reached only on purpose:
- **Pull-the-thread:** every glance stat carries a faint **ƒ**; tap it and that number's derivation unfolds inline (e.g. Take-home → federal/state/FICA).
- **One quiet door:** a "The numbers" entry in the recede-until-hover nav. Casual users glide past.
- **Permission to ignore:** the deep page opens by stating nothing there needs action — so a casual user who wanders in doesn't think they've missed a chore.
- **The statement** (`e-ledger`): typeset like a financial statement — Taxes (bracket waterfall, FICA, HSA payroll-vs-direct), Accounts, Social Security (AIME/PIA + 62/67/70 claiming curve), Roth conversion window, Drawdown (net portfolio need, 3.5% withdrawal rate, "for life"), Assumptions.

---

## The keepers (what we agreed is good)
- **C+ is the resting state.** Calm, honest, warm.
- From **D:** the **what-if chips + Adjust-the-details drawer**, the **someday moment** (auto-scene-follows-tagline default, curated picks, Premium upload, off-switch), golden-hour warmth, count-up numbers.
- From **E:** the **ƒ thread-pull** as the hero path to depth (nav "Numbers" door as backstop), the **permission-to-ignore** reassurance, and the **statement-style** deep page.
- Storage/cost note from the user: personal-photo upload = Premium (per-user file hosting); auto + curated cost only scalar storage.

## Next step → CONSOLIDATION
Fold the keepers into **one recommended flow**, not parallel options:
> **C+ as the calm baseline + D's delight (what-if chips, someday moment) + E's depth (ƒ thread-pull, "The numbers" page), the latter two as opt-in.**

Open tuning questions still on the table: activity-rotation pace (2.6s — maybe slow to 4s when full imagery), the what-if levers offered, whether a preset chip should pre-load the drawer's matching slider, ledger density (could collapse later sections).

## Working notes
- Frames are React+Babel, `Cp`/`D`/`E`-prefixed components; shared C+ pieces are exported on `window` (CpTimeline, CpActivityLine, ProgGoal, CP_PHASES, CP_GOLD, CP_ACTIVITIES). Reuse them — don't fork.
- **Never name a style object `styles`** — collisions break Babel. Use prefixed names / inline styles.
- Verify changes with the canvas open; artboard heights must match each frame's `Browser h` (the ledger needed 1900 to fit).
