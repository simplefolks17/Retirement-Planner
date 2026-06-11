# Horizon App Idea 2 — Design System & Decisions

*A retirement planner redesigned around calm confidence, not financial anxiety.*
*This document captures every design decision made, the component inventory, and the handoff brief for Claude Code.*

---

## 1 · The Brief

The original app had a dark dashboard aesthetic. This redesign (Idea 2) explores a warmer, calmer direction:
- **Audience:** late-20s to 40s; tech-comfortable, not finance-expert
- **Tone:** "work optional by 65" — confident, warm, slightly aspirational, never scary
- **Philosophy:** two answers (age + income) → a complete plan you nudge

---

## 2 · Design Principles

1. **Calm confidence, not alarm.** The app should feel like a warm friend who's sorted, not a financial advisor warning about risk.
2. **The Arc is the hero.** The full-life balance arc (build → peak → sustain) is the central visual. Everything else orbits it.
3. **No floating objects.** The old "cabin/sun/flag at the end of the road" was cut. The destination lives in the data — a milestone pill, an end label, a station.
4. **Inset always.** The plot is inset from page edges so start/end ages and their labels never clip.
5. **Work optional, [X] mandatory.** This one-liner runs through the plan screen, onboarding completion, and Someday moment as a thread of emotional payoff.

---

## 3 · The Palette System

Six palettes × light/dark/auto. All tokens derive from PALS in `wireframes/frames-pastel.jsx`.

| Name | Swatch | Character |
|---|---|---|
| **Apricot** | `#cd6f4f` | Warm clay + cream — the flagship warm palette |
| **Honey** | `#d9a32b` | Golden yellow — vibrant, energetic |
| **Blush** | `#cf6f88` | Soft rose — gentle, personal |
| **Sage** | `#5f8a64` | Fresh green + peach — outdoorsy, calm |
| **Periwinkle** | `#6f7bd6` | Soft lavender + mint — premium, cool |
| **Slate** | `#5a738f` | Cool neutral — most understated, most "serious" |

**Token contract** (every component must only use these):
`t.bg` `t.surf` `t.surf2` `t.line` `t.line2` `t.ink` `t.mut` `t.faint` `t.accent` `t.warm` `t.good`

---

## 4 · The Graph System

Four interchangeable chart views, toggled from the Plan tab. Arc is the default.

| Tab | What it shows | Why |
|---|---|---|
| **Arc** *(default)* | Full-life balance curve, peak to sustain. Milestone pills: Today → $1M → $2M → Retire → For life. | The honest full shape of a retirement. Emotionally engaging milestones. |
| **Sources** | Balance split into contributions vs market growth (stacked bands). | Answers "where does it come from?" — makes compound growth the hero. |
| **Decades** | Five-year bars. Green = accumulation, amber = retirement. | Dashboard-clean. Always high-contrast across all palettes. |
| **Scenarios** | Expected arc inside a lean↔strong confidence band. | "Even lean: covered" — addresses market uncertainty anxiety. |

**Key technical note:** All four views use the same inset coordinate system (pad.l=62, pad.r=92) so age labels and pills never clip. The retirement divider line (age 65) appears in all four.

---

## 5 · Screen Inventory

### Onboarding — A+B Combined
- **Structure:** 5 guided questions (right panel) with a ghost Arc building behind the screen (left)
- **Input control:** Stepper (− value +) for all inputs
- **Ghost Arc behavior:** starts at 8% opacity/blurred → by step 4 it's 74% opacity with "On track to retire at 65" overlaid → by step 5 the "Work optional, golf course mandatory" tagline appears
- **Completion state:** Arc fully revealed, key stats shown, "See my plan →" CTA
- **Deep inputs:** everything beyond these 5 deferred to Shape-it drawer on the Plan screen

### Ideas — I4+ Unified
- **Structure:** Arc as full-width hero → 4 mode buttons → collapsible panel → stats row
- **Arc:** solid line = today's plan; dotted overlay = the active what-if scenario
- **Stats row:** today's values with strike-through when a scenario is active, new values alongside
- **Four modes:**
  - **Drop life onto timeline** — click events (Buy a home, college, big trip…) to place pins on the Arc
  - **Dial your future** — steppers for retire age, extra savings, monthly spend
  - **Horizon suggestions** — app-surfaced suggestion cards; clicking activates the dotted overlay
  - **What if… type your own** — prompt bar; in live: AI interprets plain English
- **Design principle:** all four modes project impact onto THE SAME Arc — the Arc never leaves the screen

### The Numbers — Combined Blend
- **Pinned banner:** "The engine is working — $14,200 saved in tax this year · $310k lifetime · 6 active moves →"
- **Default tab: Statement** — three-column editorial layout with proportion bars at the foot of each column
- **Tab: Year by year** — full age-by-age projection table with inline balance bars
- **Tab: Money flow** — Sankey diagram: paycheck → tax/take-home → living/saving → four accounts
- **f thread-pull:** every line expands to show its derivation; pulls nest

### Someday — Photo BG + Foreground Text
- **Layout:** full-bleed aspirational photo with dark gradient overlay
- **Hero copy:** "Work optional." (small caps) → "[Activity]" (64px headline) → "mandatory." (64px, slightly faded)
- **Activity selector:** chips — Golf course / First class / Hiking / Cooking / Garden / Grandkids
- **Settings note:** the photo theme and activity are set in Settings/onboarding; the Someday screen shows the chosen combination

---

## 6 · The "Work Optional, X Mandatory" Theme

This one-liner threads through three moments at escalating emotional pitch:

| Moment | Pitch | Treatment |
|---|---|---|
| **Plan screen** (every visit) | Subdued, ambient | Small body text under the headline |
| **Onboarding completion** | Reveal moment | Two lines, larger, accent color |
| **Someday screen** | Full cinematic | 64px display type over a thematic photo |

The "X" (golf course, first class, hiking, etc.) is set by the user in Settings or during onboarding and persists throughout.

---

## 7 · File Index

| File | Purpose |
|---|---|
| `wireframes/frames-pastel.jsx` | PALS token system (6 palettes x light/dark), VIZ styles, SettingsScreen, ThemedHome |
| `wireframes/frames-graph.jsx` | All 4 hero graph concepts, GraphHome with toggle, GraphPlayground |
| `wireframes/frames-hifi-screens.jsx` | Hi-fi Onboarding, Ideas, Numbers, Someday using PALS tokens |
| `wireframes/Graph Directions.html` | Design canvas: graph concepts + playground |
| `wireframes/Home Directions.html` | Design canvas: palettes, settings, original exploration |
| `wireframes/Screen Frameworks.html` | Design canvas: all screen wireframes + all explorations |
| `wireframes/Hi-fi Screens.html` | Design canvas: four hi-fi promoted screens + playground |
| `wireframes/wire-kit.jsx` | Low-fi wireframe primitive components |
| `wireframes/wire-onboarding-combined.jsx` | Onboarding A+B wireframe (interactive) |
| `wireframes/wire-ideas-combined.jsx` | Ideas I4+ unified wireframe (interactive, dotted arc) |
| `wireframes/wire-numbers-combined.jsx` | Numbers combined blend wireframe (live tabs) |
| `wireframes/wire-someday-updated.jsx` | Someday + work-optional-theme wireframe |
| `wireframes/wire-numbers-alt.jsx` | Four premium numbers directions |
| `wireframes/wire-ideas-alt.jsx` | Four alt Ideas paradigms |
| `docs/FINANCIAL-MODEL.md` | All financial calculations (tax, SS, drawdown, Roth) |

---

## 8 · Component Inventory (hi-fi)

| Component | Props | Where |
|---|---|---|
| `GraphHome` | `t, which, w, h` | Plan screen with 4-view toggle |
| `GraphPlayground` | none | Full playground with palette/theme switcher |
| `GArcStations` | `t, gid, H, glow` | Arc + milestone stops chart |
| `GStacked` | `t, gid, H` | Contributions vs growth chart |
| `GColumns` | `t, gid, H` | Decade columns chart |
| `GBand` | `t, gid, H` | Confidence band chart |
| `HiFiOnboarding` | `t` | Onboarding screen |
| `HiFiIdeas` | `t` | Ideas screen |
| `HiFiNumbers` | `t` | Numbers screen |
| `HiFiSomeday` | `t` | Someday screen |
| `SettingsScreen` | in frames-pastel.jsx | Settings / Appearance |
| `GLogo` | `t` | Horizon wordmark + dot |
| `GOnTrack` | `t` | "On track" pill |
| `GStat` | `t, label, val, accent, warm` | Single stat card |

---

## 9 · Next Steps for Claude Code

**Priority order:**

1. Install DM Sans + IBM Plex Mono, React 18
2. Implement PALS token system as CSS custom properties
3. Build the Arc graph (GArcStations) — the signature screen
4. Build GraphHome with 4-tab toggle, nav, stats row
5. Build Settings / Appearance (palette, Light/Dark/Auto, Glow/Vivid/Soft)
6. Build Onboarding — 5 steps + ghost Arc materialising
7. Build Ideas — Arc hero + 4 mode panels + dotted scenario overlay
8. Build The Numbers — Optimizer banner + Statement/Yearly/Flow tabs
9. Build Someday — photo bg + editorial "work optional" type

The financial model (docs/FINANCIAL-MODEL.md) covers all calculation logic. Its outputs (nest egg, income for life, left at 90, tax saved) feed every number shown in the designs.

---

*Last updated: June 2026 · Design: Horizon App Idea 2*
