# Horizon UI Shell

The Horizon shell is a second interface for the retirement planner — a warm, aspirational UI layered **on top of** the existing Classic view without replacing it. The two views share the same financial model and all calculated values. The Classic view (dark dashboard) is always accessible; Horizon is the default first impression.

---

## Philosophy

The Classic view is for tinkering — sliders, tabs, and raw numbers. Horizon is for motivation — it answers "am I on track, and what does my retirement actually feel like?" The tagline is **"Work optional by 65."** The emotional core is the phrase *"Work optional, [activity] mandatory"*, which threads through the Plan screen, onboarding completion, and the Someday screen at escalating intensity.

---

## Files

| File | Purpose |
|---|---|
| `src/horizon/ThemeContext.jsx` | Design token system, palette context, `useTheme()` hook; exports `safeGet`/`safeSet` |
| `src/horizon/ConfirmModal.jsx` | Shared confirm dialog + toast pattern (used by PlanScreen and IdeasScreen) |
| `src/components/ArcGraph.jsx` | SVG portfolio arc with 4 views and optional scenario overlay |
| `src/components/HorizonShell.jsx` | Nav shell + onboarding wizard; imports per-screen files |
| `src/horizon/screens/PlanScreen.jsx` | Plan screen (arc graph, stats, "Make this my plan") |
| `src/horizon/screens/IdeasScreen.jsx` | Ideas screen (dials, scenario cards, life events) |
| `src/horizon/screens/NumbersScreen.jsx` | The Numbers screen (Statement, Year by year, Money flow) |
| `src/horizon/screens/SomedayScreen.jsx` | Someday screen (activity selector, photo placeholder) |
| `src/horizon/screens/SettingsScreen.jsx` | Settings screen (palette, theme, arc style) |
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

`arcStyle` in context: `"soft"` (default) / `"vivid"` / `"glow"`. Persisted to `localStorage` as `hz-arc-style`. `"glow"` adds an `feDropShadow` bloom filter to the arc line. `"vivid"` renders a heavier 5px stroke (vs 3px for soft/glow). `HorizonShell` derives `strokeWidth = arcStyle === "vivid" ? 5 : 3` and passes it to `PlanScreen`, `IdeasScreen`, and ultimately `ArcGraph`. The two effects are independent and could be combined.

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
| `strokeWidth` | number | 3 | Arc stroke width in px; 5 for vivid, 3 for soft/glow |
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

Pass `scenarioData` (same shape as `chartData`) to render a dotted accent-colored path over the arc view. Used by the Ideas screen for what-if visualization. The scenario data is produced by `calcWhatIfChart` from `src/model/what-if.js` — a real model run through `buildRetirementDrawdown`, not a scaled approximation.

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
- Sub-headline: `"Work optional, {activity} mandatory."` — `activity` comes from shell state (user picks in Someday or Settings)
- Progress bar toward sustainable retirement
- ArcGraph (height 280 desktop / 200 mobile, with 4-view toggle, glow from `arcStyle`, strokeWidth from `arcStyle`)
- Stats row: You keep / mo · Retire at · Income for life · Left at 90 (4-wide desktop → 2×2 grid mobile)
- **"Make this my plan"** button → ConfirmModal → calls `commitPlan({ retirementAge, annualExpenses })` → 2-second "✓ Plan saved" toast

### Ideas screen

Scenario exploration — the arc is always the hero.

**4 mode panels** (one active at a time):
- **Drop life onto timeline** — 5 life-event chips (buy a home, kid's college, etc.) that add an event to `moneyEvents` via `setMoneyEvents` after a ConfirmModal
- **Dial your future** — steppers for Retire at / Extra savings / Monthly spend; +/− buttons update local offset state and re-run `calcWhatIfChart` for a live dotted arc overlay
- **Horizon suggestions** — 4 clickable scenario cards that run `calcWhatIfChart` and pass the result as `scenarioData` to ArcGraph
- **What if…** — question prompt that activates the "retire 2 years earlier" scenario

**Scenario system:**
- 4 presets: `retire63`, `retire60`, `saveMore`, `bigTrip`
- Each runs `calcWhatIfChart(whatIfBundle, { retireAdj, scenarioEvents })` — a real model run, not a scaled approximation
- Stats row shows base values with strikethrough + scenario values when a scenario is active
- **"Make this my plan"** → ConfirmModal → `commitPlan({ retirementAge: scenRetire })` → 2-second toast

**Life event write-back:**
- Chip "Add to plan" → ConfirmModal → `setMoneyEvents(prev => [...prev, { id: String(Date.now()), label, amount, age, isInflow, isTaxable: false }])`
- Events immediately flow through `simData` + `retDrawShared` so the arc updates with real model output

### The Numbers screen

**3 tabs:**

- **Statement** — editorial 3-column layout (Income & tax / What you're building / Income for life), each column with a proportion bar. Footnotes with real effective federal rate.
- **Year by year** — full scrollable table sourced from `retirementWalk.rows` (retirement phase). Columns: Age | Year | Portfolio | Draw | Growth | Tax. Year computed as `currentYear + (row.age − currentAge)`. First 50 rows shown; "Show all N years" toggle renders the rest. Zebra rows with `t.surf`/`t.line` alternating, `HM` monospace for all numbers.
- **Money flow** — inline SVG `IncomeSankey` component. Left column: Gross income node. Bezier-filled bands fan out to three right-column nodes: Tax (`t.line2`), Savings (`t.warm`), Take-home (`t.good`). Heights proportional to dollar amounts. HTML labels with formatted values beside the SVG. Legend chips below. No external charting library.

**Pinned banner:** Tax engine summary showing `yr1TaxSavings` and `netConversionBenefit` from the optimizer.

### Someday screen

Full-bleed aspirational screen. Activity selector (Golf course / First class / The mountains / The kitchen / The garden / The grandkids). The selected activity drives the display text and is persisted in shell state as `activity` prop (passed back to Plan screen sub-headline and Settings screen).

**Photo upload (#77):** The photo area is a clickable `<div>` that triggers a hidden `<input type="file" accept="image/*">`. `FileReader.readAsDataURL` stores the result as a `data:` URL in `useState` (session-only, no persistence). When a photo is loaded, it renders as `<img objectFit="cover">` filling the area. Hovering shows a "change photo" pill in the top-right corner. Without a photo, a cross-hatch SVG placeholder + activity-aware hint text is shown; hover changes the hint to "tap to add a photo".

### Settings screen

- **Palette** — 6 circular swatches, updates ThemeContext live
- **Theme** — Light / Dark / Auto toggle
- **Arc style** — Soft / Vivid / Glow toggle (all three persisted to localStorage)
- **Your activity** — same 6-chip selector as Someday screen (#76); changes the `activity` value that drives the "Work optional, X mandatory" tagline on Plan. `ACTIVITIES` is exported from `SomedayScreen.jsx` and imported here.
- **Live preview** — mini `GhostArc` in the right panel reflecting the selected palette/mode instantly
- **About** — app description

### Mobile layout (#74)

At viewport width < 640px (`isMobile` derived from a `window.resize` listener in `HorizonShell`):
- Top nav bar and "On track" pill are hidden
- Fixed 60px bottom tab bar renders at the bottom of the screen using the `SCREENS` array (emoji icon + label per tab); screen body gets `paddingBottom: 60` to avoid overlap
- `PlanScreen` receives `isMobile={true}`: headline font 20px (vs 28px), progress bar full-width, stats 2×2 grid, ArcGraph height 200px, padding tightened

### Onboarding wizard

5-step wizard: Age → Income → Saved so far → Retire at → Monthly spend. Ghost arc materializes progressively as steps are completed. Completion state shows 3 summary stats + two CTAs.

**First-run detection (#78):** On first load, `showOnboarding` is initialized from `safeGet("hz-onboarded") !== "1"`. After the wizard completes or is skipped, `safeSet("hz-onboarded", "1")` is called so returning users land directly on Plan.

**Write-back (#79):** The +/− stepper buttons update local `vals` state (with per-field step sizes and clamps) inside the wizard — they never touch App.jsx state until the final step. The Done screen offers:
- **"Save as my plan →"** → ConfirmModal → `commitPlan({ currentAge, currentIncome, retirementAge, annualExpenses })` → wizard dismisses
- **"Skip for now"** → wizard dismisses, no App.jsx state changes

The `totalSaved` field is displayed for context in the stepper but is not written back (it maps to 4 separate account balances — deferred to feature #30).

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
  // Added in Batch A:
  moneyEvents,                      // current one-time event array
  setMoneyEvents,                   // direct setter (for life-event write-back in Ideas)
  whatIfSimInputs,                  // { simInputs, fedMarginal, retDrawShared, safeRetAge, safeLifeExp, baseTotalAtRet }
  commitPlan,                       // useCallback wrapper — single entry point for Horizon→App.jsx mutations
  retirementWalk,                   // full retirement walk object
};
```

**`commitPlan` signature:**
```js
commitPlan({ retirementAge?, annualExpenses?, currentAge?, currentIncome? })
```
All keys optional; only the provided keys are applied. Never called without a prior user confirmation step in the UI layer.

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

### ✓ #69 — Functional "Dial your future" steppers *(shipped Batch B, PR #16)*
Steppers in Ideas → "Dial your future" now maintain local `dialRetireOffset` / `dialSpendOffset` state. Each +/− press re-runs `calcWhatIfChart` and passes the result as `scenarioData` to ArcGraph.

### ✓ #70 — Real model runs for Ideas scenario overlay *(shipped Batch B, PR #16)*
Scenario cards now call `calcWhatIfChart(whatIfBundle, { retireAdj, scenarioEvents })` — a real `buildRetirementDrawdown` run — replacing the old `chartData.total × scale` approximation.

### ✓ #71 — Connect Ideas "Drop life onto timeline" to moneyEvents *(shipped Batch B, PR #16)*
Life event chips trigger a ConfirmModal; on confirm, `setMoneyEvents` appends the event. The arc updates automatically since `chartData` flows through `moneyEvents`.

### ✓ #75 — "Make this my plan" confirm modal *(shipped Batch B, PR #16)*
Both PlanScreen and IdeasScreen now have a ConfirmModal → `commitPlan` → 2-second toast flow. Shared `ConfirmModal` component in `src/horizon/ConfirmModal.jsx`.

### ✓ #72 — Money flow Sankey diagram *(shipped Batch D, PR #18)*
Inline `IncomeSankey` SVG component in `NumbersScreen.jsx`. Bezier-filled bands: Gross income → Tax (`t.line2`) / Savings (`t.warm`) / Take-home (`t.good`). Heights proportional to dollar amounts. No external library.

### ✓ #73 — "Vivid" arc style distinct from Soft *(shipped Batch D, PR #18)*
`strokeWidth` prop added to `ArcGraph` (default 3). `HorizonShell` derives `strokeWidth = arcStyle === "vivid" ? 5 : 3` and passes it through `PlanScreen` and `IdeasScreen`. Vivid now renders a 5px arc versus 3px for Soft/Glow.

### ✓ #74 — Mobile/responsive Horizon layout *(shipped Batch E, PR #19)*
Breakpoint at 640px. Window resize listener in `HorizonShell` sets `isMobile`. Top nav hidden; fixed 60px bottom tab bar shown instead. `PlanScreen` adapts: 2×2 stat grid, 200px arc height, smaller headline, tighter padding.

### #75 — *(shipped, see above)*

### ✓ #76 — Activity preference in Settings *(shipped Batch E, PR #19)*
`ACTIVITIES` exported from `SomedayScreen.jsx`. `SettingsScreen` imports it and renders the same 6-chip selector. `activity` + `setActivity` passed as props from `HorizonShell` to `SettingsScreen`.

### ✓ #77 — Someday screen photo upload *(shipped Batch E, PR #19)*
User-upload approach: hidden file input + `FileReader.readAsDataURL` → `useState`. Click the photo area to pick a local image; it fills the screen with `objectFit: cover`. Hover shows "change photo" pill. No bundled assets needed.

### ✓ #78 — Horizon onboarding first-run detection *(shipped Batch C, PR #17)*
`showOnboarding` now initializes to `safeGet("hz-onboarded") !== "1"`. Completing or skipping the wizard calls `safeSet("hz-onboarded", "1")` so returning users skip it.

### ✓ #79 — Onboarding wizard writes back to App.jsx state *(shipped Batch C, PR #17)*
The +/− stepper buttons update local `vals` state during the wizard. The Done screen's "Save as my plan" button shows a ConfirmModal; on confirm, `commitPlan({ currentAge, currentIncome, retirementAge, annualExpenses })` is called. "Skip for now" dismisses without touching App.jsx state.

### ✓ #80 — Year by year: full age-by-age table option *(shipped Batch D, PR #18)*
Year by year tab replaced with a full grid table from `retirementWalk.rows`. Columns: Age | Year | Portfolio | Draw | Growth | Tax. First 50 rows shown by default; "Show all N years" toggle renders the rest. Zebra rows + `HM` monospace numbers.

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

*Last updated: 2026-06-11. PRs: #15 Horizon shell, #16 Batch B (Ideas + Plan confirm), #17 Batch C (onboarding), #18 Batch D (Sankey, vivid arc, yearly table), #19 Batch E (mobile layout, activity in Settings, photo upload). All 12 Horizon open items shipped (#69–#80).*
