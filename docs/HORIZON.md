# Horizon UI Shell

The Horizon shell is a second interface for the retirement planner — a warm, aspirational UI layered **on top of** the existing Classic view without replacing it. The two views share the same financial model and all calculated values. The Classic view (dark dashboard) is always accessible; Horizon is the default first impression.

---

## Philosophy

The Classic view is for tinkering — sliders, tabs, and raw numbers. Horizon is for motivation — it answers "am I on track, and what does my retirement actually feel like?" The tagline is **"Work optional by 65."** The emotional core is the phrase *"Work optional, [activity] mandatory"*, which threads through the Plan screen, onboarding completion, and the Someday screen at escalating intensity.

---

## Files

| File | Purpose |
|---|---|
| `src/horizon/ThemeContext.jsx` | Design token system, palette context, `useTheme()` hook |
| `src/components/ArcGraph.jsx` | SVG portfolio arc with 4 views and optional scenario overlay |
| `src/components/HorizonShell.jsx` | All 5 screens + onboarding wizard + nav shell |
| `src/App.jsx` | `showHorizon` state, `horizonProps` bundle, Classic↔Horizon toggle |

---

## Design Token System

**Source of truth:** `src/horizon/ThemeContext.jsx`

### Palettes

6 palettes × light/dark modes. Default: **Apricot light**.

| Key | Name | Accent swatch |
|---|---|---|
| `apricot` | Apricot | `#cd6f4f` |
| `honey` | Honey | `#d9a32b` |
| `blush` | Blush | `#cf6f88` |
| `sage` | Sage | `#5f8a64` |
| `periwinkle` | Periwinkle | `#6f7bd6` |
| `slate` | Slate | `#5a738f` |

Auto mode resolves to light/dark via `window.matchMedia("(prefers-color-scheme: dark)")`.

### Token meanings

| Token | Role |
|---|---|
| `bg` | Page/screen background |
| `surf` | Card/panel surface |
| `surf2` | Secondary surface (nav bar, banners) |
| `line` | Primary border/divider |
| `line2` | Lighter secondary border |
| `ink` | Primary text (headings, key numbers) |
| `mut` | Muted text (labels, secondary copy) |
| `faint` | Very subtle text (hints, captions, axis ticks) |
| `accent` | Palette signature color (CTAs, active state, highlights) |
| `warm` | Golden amber — retirement payoff, income numbers, retirement phase |
| `good` | Green/teal — on-track, savings, accumulation phase |

**Rule:** Never use a raw hex value in any Horizon component. Derive tints with opacity suffix: `${t.accent}22` = 13% accent tint.

### Font stack

| Constant | Font | Usage |
|---|---|---|
| `HF` | DM Sans | All UI text, labels, buttons |
| `HM` | IBM Plex Mono | All numbers and financial values |
| `HD` | Newsreader | Someday screen display headline only |

All three loaded from Google Fonts via a `<style>` `@import` in `HorizonShell.jsx`.

### Arc style

`arcStyle` in context: `"soft"` (default) / `"vivid"` / `"glow"`. Persisted to `localStorage` as `hz-arc-style`. Currently: `"glow"` adds `feDropShadow` to the arc line; `"soft"` and `"vivid"` behave identically (see open items — #73).

### Context API

```js
const { t, palKey, setPalKey, modePref, setModePref, resolvedMode, arcStyle, setArcStyle } = useTheme();
```

`t` is the active `ThemeTokens` object for the current palette/mode.

---

## ArcGraph Component

**File:** `src/components/ArcGraph.jsx`

The signature visual — a full-life portfolio balance curve from today to `lifeExpect` (typically 90).

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `t` | ThemeTokens | required | From `useTheme()` |
| `chartData` | `[{age, total}]` | `[]` | `totalChartData` from App.jsx |
| `currentAge` | number | 30 | |
| `retirementAge` | number | 65 | |
| `lifeExpect` | number | 90 | |
| `contribSeries` | `[{age, contrib}]` | null | For Sources view — cumulative contributions |
| `height` | number | 300 | SVG height in px |
| `glow` | boolean | true | Adds bloom filter to arc line |
| `activeView` | `"arc"\|"stacked"\|"columns"\|"band"` | `"arc"` | |
| `onViewChange` | `(key) => void` | — | |
| `showToggle` | boolean | true | Show the 4-view toggle bar |
| `scenarioData` | `[{age, total}]` | null | Dotted overlay path (arc view only) |

### Views

| Key | Label | What it shows |
|---|---|---|
| `arc` | Arc | Cubic bezier spline with milestone pills (Today · First Million · Retire · For life) |
| `stacked` | Sources | Total arc + contributions band (market growth vs contributions split) |
| `columns` | Decades | 5-year bar chart, green → amber at retirement |
| `band` | Scenarios | Uncertainty cone (±28% spread growing with time) |

### SVG coordinate system

- ViewBox: `0 0 1200 {height}`, `preserveAspectRatio="none"`
- Padding: `{ l: 62, r: 92, t: 38, b: 46 }`
- x-axis spans age 30–90 (fixed, regardless of `currentAge`)
- y-axis scales to 105% of peak balance, rounded to nearest $500k
- Milestone pills are HTML `<foreignObject>` overlays, not SVG text

### Scenario overlay

Pass `scenarioData` (same shape as `chartData`) to render a dotted accent-colored path over the arc view. Used by the Ideas screen for what-if visualization. **Note:** this is a visual approximation — the scenario data passed from the Ideas screen is a scaled copy of the real data (e.g. `total × 0.92`), not an actual model run. See open item #70.

### Exports

- `default ArcGraph` — main component
- `GhostArc` — static arc for onboarding (uses hardcoded anchor data, not real data)

---

## HorizonShell Screens

**File:** `src/components/HorizonShell.jsx`

### Nav

5-tab nav bar: **Plan · Ideas · The numbers · Someday · Settings**

Right side of nav: "On track" / "Needs attention" status pill + "Classic view" button (calls `onShowClassic` prop).

### Plan screen

- Headline: `"On track to retire at {retirementAge}."` or fallback
- Sub-headline: `"Work optional, {activity} mandatory."` — `activity` comes from shell state (user picks in Someday screen)
- Progress bar toward sustainable retirement
- ArcGraph (height 280, with 4-view toggle, glow from `arcStyle`)
- Stats row: You keep / mo · Retire at · Income for life · Left at 90

### Ideas screen

Scenario exploration — the arc is always the hero.

**4 mode panels** (one active at a time):
- **Drop life onto timeline** — 5 life-event chips (buy a home, kid's college, etc.) that activate an indicative scenario
- **Dial your future** — steppers for Retire at / Extra savings / Monthly spend (currently display-only; see open item #69)
- **Horizon suggestions** — 4 clickable scenario cards that activate a dotted arc overlay
- **What if…** — question prompt that activates the "retire 2 years earlier" scenario

**Scenario system:**
- 4 presets: `retire63`, `retire60`, `saveMore`, `bigTrip`
- Each has a `scale` factor applied to `chartData` totals to produce `scenarioData`
- Stats row shows base values with strikethrough + scenario values when a scenario is active
- "Make this my plan" button appears when scenario is active (currently a no-op placeholder; see open item #75)

### The Numbers screen

**3 tabs:**

- **Statement** — editorial 3-column layout (Income & tax / What you're building / Income for life), each column with a proportion bar. Footnotes with real effective federal rate.
- **Year by year** — 6 milestone rows derived from real `chartData`: Today · First $1M · Retire · Peak · RMDs start (73) · For life. Balance bars green (accumulation) → amber (retirement).
- **Money flow** — Sankey diagram placeholder (see open item #72).

**Pinned banner:** Tax engine summary showing `yr1TaxSavings` and `netConversionBenefit` from the optimizer.

### Someday screen

Full-bleed aspirational screen. Activity selector (Golf course / First class / The mountains / The kitchen / The garden / The grandkids). The selected activity drives the display text and is persisted in shell state as `activity` prop (passed back to Plan screen sub-headline). Photo placeholder — real photos are a future feature (see open item #77).

### Settings screen

- **Palette** — 6 circular swatches, updates ThemeContext live
- **Theme** — Light / Dark / Auto toggle
- **Arc style** — Soft / Vivid / Glow toggle (all three persisted to localStorage)
- **Live preview** — mini `GhostArc` in the right panel reflecting the selected palette/mode instantly
- **About** — app description

### Onboarding wizard

5-step wizard: Age → Income → Saved so far → Retire at → Monthly spend. Ghost arc materializes progressively as steps are completed. Completion state shows 3 summary stats + "See my plan →" CTA.

**Currently display-only** — inputs show the real computed values from App.jsx but the stepper buttons don't modify anything. The wizard is a motivational demo, not a real first-run setup path. See open item #79.

---

## App.jsx Integration

### State added

```js
const [showHorizon, setShowHorizon] = useState(true);  // default to Horizon view
const [activity, setActivity] = useState("golf course"); // "Work optional, X mandatory"
```

### Computed values added

```js
// Balance at life expectancy (from retirementWalk)
const balAt90 = useMemo(() => { ... }, [retirementWalk, safeLifeExp]);

// Cumulative contribution series for Sources view
const contribSeries = useMemo(() => { ... }, [simData, bal401k, balRoth, ...]);
```

### horizonProps bundle

Everything passed to `HorizonShell` as a single spread:

```js
const horizonProps = {
  chartData: totalChartData,        // [{age, total}] — full lifecycle
  currentAge, retirementAge, lifeExpect,
  totalAtRet, yearsSustained, isSustainable,
  takeHome, effectiveExpenses, withdrawalRate,
  balAt90, contribSeries,
  householdSS, activity, setActivity,
  currentIncome,
  fedTax, ficaTotal: fica, stateTaxAmt: stateTax,
  currentContribTotal,
  retVals, simData,
  netConversionBenefit, yr1TaxSavings,
};
```

### Render pattern

```jsx
if (showHorizon) {
  return (
    <HorizonThemeProvider>
      <HorizonShell {...horizonProps} onShowClassic={() => setShowHorizon(false)} />
    </HorizonThemeProvider>
  );
}
// else: existing Classic view renders below, with a "✦ Horizon view" button in its header
```

---

## Open Items

These are deferred features with enough implementation detail to pick up in a future PR. All are tracked in `feature-tracker.html` (section "Horizon UI") with their IDs.

### #69 — Functional "Dial your future" steppers
**What:** The stepper inputs in Ideas → "Dial your future" currently show your actual values (retire age, monthly spend, savings) but the +/− buttons are inert.
**What's needed:** Wire button clicks to update a local `dialValues` state object in `IdeasScreen`, then re-compute `scenarioData` from those dial values rather than the fixed scale presets. The dials shouldn't change the main App.jsx state — they're a sandbox inside Ideas.
**Files:** `HorizonShell.jsx` → `IdeasScreen`

### #70 — Real model runs for Ideas scenario overlay
**What:** The dotted arc on the Ideas screen is computed by scaling `chartData.total` by a constant (e.g. `× 0.92` for retiring 2 years earlier). It's directionally correct but not an actual model run.
**What's needed:** Connect the scenario to `calcWhatIfDelta` from `src/model/what-if.js` (already implemented). That function already accepts a retirement-age shift and returns a real alternate chart series. Pass the result as `scenarioData` instead of the scaled approximation.
**Files:** `HorizonShell.jsx` → `IdeasScreen`, `App.jsx` (may need to expose `whatIfSimInputs` to the shell)

### #71 — Connect Ideas "Drop life onto timeline" to MoneyEventsPanel
**What:** Life event chips ("Buy a home," "Big trip," etc.) currently activate hardcoded scale scenarios. They should instead add events to the real `moneyEvents` array (already in App.jsx state) so the arc updates with real model output.
**What's needed:** Expose `moneyEvents` and `setMoneyEvents` in `horizonProps`. Life event chips call `setMoneyEvents` to add/remove entries. The arc then reflects real model impact automatically since `chartData` already flows through `moneyEvents`.
**Files:** `App.jsx` (add to `horizonProps`), `HorizonShell.jsx` → `IdeasScreen`

### #72 — Money flow Sankey diagram
**What:** The "Money flow" tab in The Numbers screen is a placeholder.
**What's needed:** A Sankey/flow diagram showing paycheck → tax / take-home / savings → four account buckets. All the numbers exist (`fedTax`, `ficaTotal`, `stateTaxAmt`, `currentContribTotal`, `takeHome`, `retVals`). The implementation work is purely the SVG Sankey layout.
**Files:** `HorizonShell.jsx` → `NumbersScreen`

### #73 — "Vivid" arc style distinct from Soft
**What:** The Settings "Arc style" toggle has Soft / Vivid / Glow. Glow adds a bloom filter. Soft and Vivid currently behave identically.
**What's needed:** Decide the visual distinction. Options: Vivid increases fill opacity and stroke width; or Soft is the gradient fill + smooth line (current), Vivid is a filled area with a stronger single-color line. Apply via a `vivid` boolean prop to `ArcGraph` alongside `glow`.
**Files:** `ArcGraph.jsx`, `HorizonShell.jsx`

### #74 — Mobile/responsive Horizon layout
**What:** The Horizon shell is designed for a ≥900px viewport. On mobile, the nav tabs overflow, stat cards squeeze, and the arc graph becomes unreadable.
**What's needed:** A breakpoint at ~640px: stack the nav tabs into a bottom tab bar (or hamburger), collapse stat cards to 2-up, reduce arc height to ~180px, and simplify the Settings layout to single-column.
**Files:** `HorizonShell.jsx` (add responsive styles), `ArcGraph.jsx` (test at small heights)

### #75 — "Make this my plan" applies scenario to the real model
**What:** The "Make this my plan" button in the Ideas stats row is a visible placeholder — clicking it does nothing.
**What's needed:** Map each scenario's `retireAdj` to an actual state change in App.jsx (e.g. move the `retirementAge` slider). This requires either exposing App.jsx setters in `horizonProps` or showing a modal with "Your retirement age has been updated to X — see the full plan in Classic view."
**Files:** `App.jsx` (expose setters or add modal), `HorizonShell.jsx`

### #76 — Activity preference in Settings
**What:** The user's activity ("golf course," "first class," etc.) can only be changed on the Someday screen. Settings is the natural home for persistent preferences.
**What's needed:** Add an "Activity" section to `SettingsScreen` with the same 6-chip selector. Since `activity` is shell state (not ThemeContext), pass `activity` + `setActivity` as additional props to `SettingsScreen`, or move `activity` into ThemeContext alongside `arcStyle`.
**Files:** `HorizonShell.jsx` → `SettingsScreen`

### #77 — Someday screen real photography
**What:** The Someday screen uses a CSS gradient placeholder where a photo should appear.
**What's needed:** A set of 6 curated photos (one per activity: golf, travel, hiking, cooking, garden, grandkids) bundled with the app or fetched from a CDN. Each should be warm-toned, lifestyle-oriented, and work under the dark gradient overlay. The `background-image` CSS property replaces the gradient placeholder.
**Files:** `HorizonShell.jsx` → `SomedayScreen`, `public/` (photo assets)

### #78 — Horizon onboarding first-run detection
**What:** The onboarding wizard exists but is never shown by default (the `showOnboarding` state in `HorizonShell` defaults to `false`). There's no first-run detection.
**What's needed:** On first load (check `localStorage` for a `hz-onboarded` flag), set `showOnboarding = true`. After wizard completion, set the flag so returning users land directly on Plan.
**Files:** `HorizonShell.jsx` (add `isBrowser` guard, localStorage check)

### #79 — Onboarding wizard writes back to App.jsx state
**What:** The onboarding wizard shows real values from the app but the +/− steppers don't change them. A true first-run flow would initialize App.jsx's sliders from the wizard answers.
**What's needed:** Expose App.jsx setters (`setCurrentAge`, `setRetirementAge`, `setCurrentIncome`, etc.) in `horizonProps`. Wizard completion calls these setters with the collected answers. Requires care around the golden-master test suite — only App.jsx UI state changes, not model logic.
**Files:** `App.jsx` (expose setters), `HorizonShell.jsx` → `OnboardingScreen`

### #80 — Year by year: full age-by-age table option
**What:** The "Year by year" tab currently shows 6 key milestone rows. The Classic view has a full table. Power users want every year.
**What's needed:** Add a "Show all years" toggle below the milestone table. When on, render all rows from `chartData` (covering both accumulation via `simData` and retirement via the walk). Income column uses `simData[row].income` for working years; "—" for retirement.
**Files:** `HorizonShell.jsx` → `NumbersScreen`

---

## Extension Guide

### Adding a new palette
1. Add an entry to `PALETTES` in `src/horizon/ThemeContext.jsx` with both `light` and `dark` token sets.
2. Add it to the `PaletteKey` union type (TypeScript annotation in `design-tokens.ts` reference file).
3. The Settings screen swatch grid renders automatically from `Object.entries(PALETTES)`.

### Adding a new screen
1. Create a function component `FooScreen({ t, props })` in `HorizonShell.jsx`.
2. Add `{ id: "foo", label: "Foo" }` to the `SCREENS` array.
3. Add `{screen === "foo" && <FooScreen t={t} props={props} />}` to the screen body.

### Adding a prop to horizonProps
1. Add the computed value to `App.jsx`'s `horizonProps` object.
2. Destructure it in the relevant screen component inside `HorizonShell.jsx`.
3. If the value requires a new `useMemo` computation, add it near the existing `balAt90` and `contribSeries` memos in `App.jsx`. **Do not add model logic to `App.jsx` — add it to `src/model/` first.**

### Modifying the ArcGraph
The SVG coordinate space is fixed: VW=1200, PAD `{l:62, r:92, t:38, b:46}`. Age 30–90 maps to x; balance 0–vmax maps to y. The `makeScales` function in `ArcGraph.jsx` produces the transform functions. If you need access to these from outside the component (e.g. to pre-compute overlay paths), export `makeScales` or accept pre-computed `[x, y]` points as a prop.

---

*Last updated: 2026-06-11. PR: Horizon shell initial implementation.*
