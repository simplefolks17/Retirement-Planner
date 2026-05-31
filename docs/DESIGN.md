# Design System

## Visual Identity

Dark-theme financial dashboard. Professional but approachable — not intimidating to non-finance users. Numbers should feel precise (monospace), labels should feel warm (sans-serif).

## Color Tokens

All colors are defined in `src/theme.js` as the `C` object. Every component references these tokens — never use raw hex values in components.

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#0d1117` | Page background |
| `surface` | `#161b22` | Panel/card background |
| `card` | `#0d1117` | Stat card background (darker than surface for depth) |
| `border` | `#21262d` | Borders, dividers |
| `text` | `#e6edf3` | Primary text |
| `muted` | `#8b949e` | Secondary text, labels |
| `gold` | `#d4a843` | Traditional 401k, primary accents, totals |
| `blue` | `#58a6ff` | Roth IRA, pension, informational |
| `green` | `#3fb950` | Positive outcomes, HSA-adjacent, sustainability |
| `purple` | `#bc8cff` | HSA, employer match, educational |
| `orange` | `#f78166` | Warnings, RMDs, tax costs, negative outcomes |

### Color Meaning Convention
Colors carry financial meaning — they're not decorative. Each account type has a dedicated color that persists across every chart, card, and mention. Users learn to associate gold with their 401k and blue with Roth without reading labels.

### Semantic Usage
- **Green** = good for you (tax-free, sustainable, gains)
- **Orange** = costs you money (tax, depletion, warnings)
- **Gold** = important neutral (totals, milestones, primary metrics)
- **Purple** = educational / opportunity (insights, hidden benefits)
- **Blue** = informational / alternative (comparisons, options)

## Typography

| Role | Font | Weight | Notes |
|---|---|---|---|
| Body text | DM Sans | 400, 600, 700 | Loaded from Google Fonts |
| Numbers / money | IBM Plex Mono | 400, 500, 600 | All financial values use this |

Applied via the `mono` shared style object: `{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }`.

### Scale
- Section titles: 13px, uppercase, 700, letter-spacing 0.08em, muted color
- Body text: 11–12px
- Stat card values: 16–22px, mono
- Stat card labels: 10px, muted
- Fine print / sub-labels: 9px, muted

## Shared Style Objects

Defined in `src/theme.js`, used with spread syntax (`{ ...panel }`):

```js
panel       // surface bg, border, rounded corners, padding
sectionTitle // uppercase muted label style
mono        // IBM Plex Mono font
selectStyle // styled dropdown (custom arrow, dark theme)
```

## Component Inventory

### Primitives (reusable everywhere)
| Component | Purpose | Props |
|---|---|---|
| `Slider` | Labeled range input with live value display | label, value, min, max, step, format, onChange, valueColor |
| `DeferredInput` | Number input that commits on blur/Enter | value, min, max, onChange, style |

### Domain-Specific (financial planner context)
| Component | Purpose | Key Props |
|---|---|---|
| `TaxPhaseCard` | Bracket picker for a tax phase | phaseNum, label, color, rate, setRate, combinedRate |
| `TaxTimeline` | Proportional colored bar across phases | phase1End, phase2End, totalYears, rates |
| `ChartTooltip` | Dark recharts tooltip | active, payload, label, valueFormatter |
| `ActionCard` | Prescriptive/comparative/educational card | mode, title, body, impact, vsA, vsB |
| `PhaseCard` | Waterfall phase container | num, title, ageRange, years, color, steps, actions |
| `WaterfallStep` | Single bar in waterfall | label, amount, type, sub, maxVal |
| `FlowConn` | Visual connector between phases | value, color, label |

## UX Language Principles

This tool is built for people who are not financially savvy. The language, questions, and explanations must meet users where they are — not where a tax professional is. Every input, label, tooltip, and alert should pass this test: **could someone who has never filed their own taxes understand this without Googling it?**

### Core principle: users know their life, not the tax code

Users know what shows up on their paycheck. They know if their family is on the same health plan. They know roughly what they earn. They do not know what AGI means, what a Section 125 plan is, or the difference between a marginal and effective tax rate — and they shouldn't have to.

Our job is to translate their lived experience into the correct financial model behind the scenes, invisibly.

### Rules for writing input labels and questions

**1. Ask about the experience, not the tax concept**

| Instead of this | Write this |
|---|---|
| "Section 125 cafeteria plan HSA?" | "Does your HSA come out of your paycheck automatically?" |
| "Traditional vs Roth 401(k) election?" | "Does your 401(k) reduce your paycheck before taxes or after?" |
| "MAGI for Roth phase-out calculation" | "Your income (we'll handle the rest)" |
| "Qualified HDHP enrollment status" | "Are you on a high-deductible health plan?" + tooltip: *"Usually the plan with a lower monthly premium and higher deductible. Check your insurance card if unsure."* |

**2. Always provide a sensible default**

When users don't know the answer, default to the statistically most common scenario — and when uncertain, lean toward giving the user the better outcome. Never leave a required field blank or force a choice users can't confidently make.

- HSA funding method unknown → default to payroll deduction (most common, gives better tax result)
- Filing status unknown → default to Single (most conservative, avoids overstating benefits)
- State unknown → default to user's detected or entered state

**3. Explain why only when the answer changes something meaningful**

Don't explain every field. Only add a tooltip or helper text when:
- The answer significantly changes the output (e.g. payroll vs direct HSA = $329–$654/year difference)
- The term used might be unfamiliar (e.g. "Roth IRA")
- The user selected "I'm not sure"

Keep explanations to 1–2 sentences. Never expand inline when a tooltip will do.

**4. Always offer "I'm not sure" as a real option**

Any question a financially unsophisticated user might genuinely not know should have an escape hatch. Never force a guess between two options the user doesn't understand.

- Offer: "Yes" / "No" / "I'm not sure"
- On "I'm not sure": apply the default silently, then show one plain-English line explaining what was assumed and why

**5. Translate outputs, not just inputs**

Results should be explained in plain terms too. Don't just show "$1,275 saved" — add context: *"That's like getting a 30% discount on every dollar you put into your HSA."* Contextualizing results builds trust and helps users act.

**6. Never use these terms without defining them first**

| Tax jargon | Plain English alternative |
|---|---|
| AGI / MAGI | "Your income (adjusted)" — handle the adjustment silently |
| Marginal rate | "The tax rate on your next dollar earned" |
| Pre-tax / post-tax | "Before taxes" / "After taxes" |
| FICA / payroll tax | "Social Security and Medicare taxes" |
| Phase-out | "Starts to reduce once your income passes..." |
| RMD | "Required minimum withdrawal" |
| HCE | "High earner — IRS rules may limit your contributions" |

### The dinner table test

> Before shipping any label, question, or result — ask: *"Would I say it this way if I were explaining this to a friend at dinner?"* If not, rewrite it. The planner should feel like a knowledgeable friend walking you through your taxes — not a government form.

---

## Layout Patterns

### Panel
Every major section is a `panel` (surface bg, border, rounded corners). Panels stack vertically with 20px margin-bottom.

### Grid Layouts
- `income-grid`: 2-column on desktop, 1-column on mobile
- `det-2col`: 2-column for detailed planner sections
- `det-stat-3` / `det-stat-4`: 3 or 4 stat cards in a row (2-col on mobile)
- `fd-compare-grid`: 3-column comparison table (shrinks on mobile)

### Responsive Breakpoint
Single breakpoint at `600px`. All responsive rules in one `@media` block. Mobile classes use `fd-` prefix for Flow-Down tab.

## Charts

Using `recharts` (LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer).

- Dark theme: grid stroke = border color, axis = muted, labels = muted
- Reference lines for retirement age (green dashed) and RMD start (orange dashed)
- Custom tooltip component (`ChartTooltip`) matching panel style

## Website Transition Notes

When building a standalone website from this project:

### What Transfers Directly
- Color tokens and typography are framework-agnostic
- Component structure maps to any React-based framework (Next.js, Remix, Gatsby)
- Financial model is pure JS — works unchanged in any environment

### What Needs Rethinking
- **Inline styles → CSS solution.** Current approach is all inline React styles. For a website, consider CSS Modules, Tailwind, or styled-components. The token system (`C` object) maps naturally to CSS custom properties (`--color-gold: #d4a843`)
- **Single-page → routing.** Three tabs could become three routes (`/plan`, `/detailed`, `/flow-down`)
- **State management.** 48 useState calls work in an artifact but a website likely needs URL-synced state (shareable links), localStorage persistence, or a state library
- **Responsive design.** Current breakpoint is basic. A website needs tablet breakpoints, touch-friendly controls, proper mobile navigation
- **Accessibility.** Current build has no ARIA labels, focus management, or keyboard navigation. A public website should meet WCAG 2.1 AA
- **Print / export.** Users will want to save or share their plan. Consider PDF export or a sharable URL with encoded state

### Design Assets to Create
- Logo / wordmark
- Favicon
- Open Graph image (for social sharing)
- Loading state / skeleton screens
- Error states
- Empty states (no data entered yet)
- Onboarding flow (first-time user guidance)
