# Horizon App Idea 2 — Claude Code Implementation Brief

> Read this in full before writing a single line of code.
> Every decision in this doc was made deliberately and is documented in `docs/Horizon App Idea 2 - Design Summary.md`.

---

## What you're building

A retirement planning app that makes people feel calm, confident, and excited about their financial future — not anxious. The tagline is **"Work optional by 65"** and the emotional core is the "work optional, [activity] mandatory" phrase that threads through three key moments.

The app has five screens: **Plan · Ideas · The numbers · Settings · Someday**. The onboarding (5-step wizard) lands the user directly on the Plan screen.

---

## The most important rules

1. **Never invent a color.** Every color in the UI must come from `handoff/design-tokens.ts`. Use tokens: `t.bg`, `t.surf`, `t.ink`, `t.accent`, `t.warm`, `t.good`, etc. Derive tints via hex opacity suffix: `${t.accent}22` = 13% accent tint.

2. **The Arc is the signature feature.** Implement it early. Get it right. It is the app's emotional hero — a full-life balance curve that shows you building to a peak at ~70, then sustaining into old age. It must render with: milestone pills (Today · $1M · $2M · Retire · For life), inset axes (age labels never clip), and a retirement divider at age 65.

3. **Font stack is fixed:** `'DM Sans'` for all UI text, `'IBM Plex Mono'` for all numbers/monospace, `'Newsreader'` for the Someday display headline only. Load all three from Google Fonts. Never use Arial, Inter, Roboto, or system sans-serif as primary fonts.

4. **Minimum text size is 12px.** No label, tick, or caption below 12px.

5. **The palette is user-selectable.** The app ships with 6 palettes (Apricot, Honey, Blush, Sage, Periwinkle, Slate) × Light/Dark/Auto. Every component must accept the theme tokens as a prop — never hardcode a hex value. The default palette is **Apricot light**.

---

## Implementation order (strict)

Do not skip ahead. Each step depends on the previous.

### 1 · Design token system
- Implement `PALETTES` from `handoff/design-tokens.ts` as React context (or Zustand store)
- Expose `useTheme()` hook returning the active `ThemeTokens` object
- Wire Light/Dark/Auto to `prefers-color-scheme` media query for Auto
- Persist the user's palette + mode choice in localStorage

### 2 · The Arc graph
- Implement `ArcGraph` component. Key props: `t` (tokens), `height`, `activeView` (arc|stacked|columns|band), `glow` (boolean)
- The SVG uses internal coordinate space: VW=1200, viewBox `0 0 1200 {H}`, `preserveAspectRatio="none"`
- x(age) = `PAD.l + (age - 30) / 60 * (VW - PAD.l - PAD.r)` where PAD = `{l:62, r:92, t:38, b:46}`
- y(value) = `PAD.t + (1 - value / 3_500_000) * (H - PAD.t - PAD.b)`
- The curve is a cubic bezier spline through the balance data points (smooth path, not piecewise-linear)
- Milestone pills (Today, $1M, $2M, Retire, For life) are absolutely-positioned HTML overlays, not SVG text
- The glow mode adds a `feDropShadow` filter on the curve line
- Accumulation → retirement transition: a dashed vertical line at age 65, tinted `t.accent`
- The arc peaks around age 68-70, then gently declines to the end (age 90)
- Reference: `wireframes/frames-graph.jsx` → `GArcStations` component

### 3 · Plan screen (home)
- Nav: Horizon logo + tab bar (Plan / Ideas / The numbers / Settings) + "On track" pill
- Headline: `"On track to retire at 65."` (600 weight, 28-30px, -0.025em tracking)
- Sub: `"Work optional, [activity] mandatory."` — `activity` is the user's chosen activity from Settings
- 78% progress bar (green → warm gradient)
- The Arc graph below (full width, 280-320px tall)
- Chart tab toggle above the Arc: Arc / Sources / Decades / Scenarios
- Stats row below: You keep / Retire at / Income for life / Left at 90
- Reference: `wireframes/frames-graph.jsx` → `GraphHome`

### 4 · Settings / Appearance
- Palette swatch grid (6 options, circular)
- Light · Dark · Auto radio group
- Horizon style: Soft · Vivid · Glow (affects Arc graph fill/line richness)
- Live preview panel on the right showing a mini Arc in the selected theme
- Reference: `wireframes/frames-pastel.jsx` → `SettingsScreen`

### 5 · Onboarding
- 5 questions: Age → Income → Saved so far → Retire at → Monthly spend
- Stepper input (− value +) for all five — no text fields, no sliders
- Right panel: progress pills + question + stepper + Back/Next
- Left/behind: a ghost Arc that materializes as steps progress
  - Step 0: 8% opacity, 8px blur
  - Step 2: 36% opacity, 3px blur
  - Step 4: 72% opacity, 0px blur — "On track to retire at 65" overlay appears
  - Step 5 completion: 90% opacity — "Work optional, golf course mandatory" appears
- Completion state: show the three key stats + "See my plan →" CTA
- Reference: `wireframes/frames-hifi-screens.jsx` → `HiFiOnboarding`

### 6 · Ideas screen
- The Arc graph is always the full-width hero (never scrolls away)
- A dotted alternative arc overlays the solid arc when a scenario is active (solid = today, dotted = what-if)
- Four mode buttons below the arc: **Drop life onto timeline · Dial your future · Horizon suggestions · What if…**
- Each mode opens a collapsible panel below the buttons
- Stats row at the very bottom: retire age / income / nest egg / left at 90 — with strike-through + new value when a scenario is active
- "Make this my plan" button appears in stats row only when a scenario is active
- Reference: `wireframes/frames-hifi-screens.jsx` → `HiFiIdeas`

### 7 · The numbers
- **Pinned optimizer banner** (always visible): "✦ The engine is working · $14,200 saved in tax this year · $310k lifetime · 6 active moves →"
- **Tab: Statement** (default) — three-column editorial layout in Georgia/serif
  - Three columns: Income & tax / What you're building / Income for life
  - Each column ends with a proportion bar (split bar showing the breakdown visually)
  - Footnotes at the bottom
- **Tab: Year by year** — full age-by-age projection table
  - Columns: Age / Income / Tax / Saved / Balance (with inline bar) / Tag
  - Balance bars: green for accumulation years, amber for retirement years
  - Key rows tagged: Today · First $1M · Retire · Peak · RMDs · For life
- **Tab: Money flow** — a Sankey diagram (paycheck → tax/take-home → living/saving → four accounts)
- Reference: `wireframes/frames-hifi-screens.jsx` → `HiFiNumbers`

### 8 · Someday screen
- Full-bleed aspirational photo (user-selected theme, or auto-selected by Horizon)
- Dark gradient overlay: `linear-gradient(135deg, rgba(18,14,10,.80) 0%, rgba(18,14,10,.20) 55%, rgba(18,14,10,.60) 100%)`
- Foreground (z-index above overlay):
  - Small caps: `"WORK OPTIONAL."` (DM Sans, 400, 13px, 0.12em tracking, rgba(255,255,255,.45))
  - Display: `"[Activity]"` (Newsreader, 700, 62px, white)
  - Display: `"mandatory."` (Newsreader, 400, 62px, rgba(255,255,255,.75))
  - Number: `"$8,200"` (IBM Plex Mono, 600, 36px) + `"a month, for life."` (DM Sans, 400, 16px, rgba(255,255,255,.50))
- Activity chips at the bottom (pill buttons over dark overlay)
- The chosen activity is persisted from Settings/onboarding
- Reference: `wireframes/frames-hifi-screens.jsx` → `HiFiSomeday`

---

## The "Work optional, X mandatory" theme

This one phrase runs through three moments at escalating emotional intensity:

| Moment | Rendering |
|---|---|
| Plan screen sub-headline | `"Work optional, golf course mandatory."` — 400 weight, `t.mut` color, `t.accent` on the activity word |
| Onboarding completion | Two lines, 600 weight, `t.accent` color, slightly larger |
| Someday screen | Full cinematic — 62px Newsreader over a full-bleed photo |

The `activity` field is a user preference ("golf course", "first class", "the mountains", etc.). Default: "golf course".

---

## File reference

| File | What Claude Code should read |
|---|---|
| `handoff/design-tokens.ts` | All color tokens, font stack, type scale, Arc coordinate system |
| `docs/Horizon App Idea 2 - Design Summary.md` | Full brief, screen specs, component inventory |
| `docs/FINANCIAL-MODEL.md` | All financial math (tax, SS, drawdown, Roth ladder) |
| `wireframes/frames-graph.jsx` | Arc graph component (GArcStations) — reference implementation |
| `wireframes/frames-hifi-screens.jsx` | Hi-fi screen components — reference implementation |
| `wireframes/Hi-fi Screens.html` | Open in browser — live, interactive hi-fi reference |

---

## What NOT to do

- Do not use `Inter`, `Roboto`, `Arial`, `Fraunces`, or `system-ui` as the primary font
- Do not use gradients as page backgrounds (they read as AI-slop)
- Do not add placeholder sections, dummy stats, or filler content
- Do not hardcode hex colors — always use the token system
- Do not use the "floating object at the end of the road" metaphor — it was deliberately removed
- Do not build the financial model from scratch — reference `docs/FINANCIAL-MODEL.md`

---

*Horizon App Idea 2 · Design: June 2026*
