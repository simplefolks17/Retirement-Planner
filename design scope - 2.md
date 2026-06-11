# Retirement Planner — Design Brief

## What This App Is

A **personal retirement financial planner** — a single-page web tool that lets individuals project whether their savings will last through retirement and how to optimize their strategy. The user enters their income, savings accounts, expected retirement age, Social Security details, and a few lifestyle assumptions. The app runs a year-by-year simulation and tells them: when they can retire, how long their money will last, and what specific actions will improve their outcome.

**It is not** a budgeting app, expense tracker, investment broker, or tax filing tool. There are no transactions, no linked accounts, no spending categories. The scope is one question: *"Will I be okay in retirement, and what should I do now to make sure?"*

---

## Core Purpose & Goals

1. **Projection** — Given what the user has and what they're saving, show their expected portfolio balance at retirement and how many years it will sustain them.
2. **Tax optimization** — Help users decide how much to convert from traditional (pre-tax) to Roth (tax-free) accounts before Required Minimum Distributions kick in, using bracket-accurate math.
3. **Social Security strategy** — Show the break-even tradeoff of claiming early vs. delaying to age 70.
4. **Plain-English guidance** — Surface the 2–3 most impactful actions the user can take right now (e.g., "increase your 401k contribution by $X," "delay SS by 3 years").

---

## Who Uses It

Non-finance people. People who know roughly what they earn and what they save, but have never heard of MAGI, RMDs, or the ACA subsidy cliff. The design principle is: **users know their life, not the tax code.** Every label, question, and result must pass the "dinner table test" — would you say it this way to a friend?

---

## The Three Views (Tabs)

### 1. Simple Planner
The quick-answer view. Enter income, savings, retirement age, and expenses. See: projected portfolio at retirement, years money will last, withdrawal rate, and the top recommended actions. Designed to be useful in under 5 minutes.

### 2. Detailed Planner
The full view. Adds: filing status, spouse income, Social Security estimate and claiming age, employer 401k match, pension income, HSA, Roth conversion strategy, IRMAA/ACA cost warnings, and an accumulation chart through retirement. This is where the financial depth lives — but it still speaks plain English.

### 3. Flow-Down Waterfall
A phase-by-phase breakdown of the user's financial life: income → taxes → savings → retirement drawdown → RMDs → estate. Each phase is a waterfall bar showing where money flows in and out. This builds intuition for the big picture without overwhelming with detail.

---

## Visual Identity & Tone

- **Dark theme** — deep navy/charcoal backgrounds (#0d1117 base, #161b22 panels), designed to feel like a professional dashboard without being intimidating.
- **Warm but precise** — DM Sans for labels and copy (approachable), IBM Plex Mono for all numbers (precise, trustworthy).
- **Color carries meaning** — colors aren't decorative, they teach. Users learn to associate gold with their 401k, blue with Roth, green with good outcomes, and orange with costs/warnings. This mapping is consistent across every chart, card, and mention throughout the app.

| Color | Meaning |
|-------|---------|
| Gold `#d4a843` | Traditional 401k, totals, primary metrics |
| Blue `#58a6ff` | Roth IRA, pension, informational |
| Green `#3fb950` | Good outcomes, sustainability, tax-free |
| Orange `#f78166` | Costs, taxes, warnings, depletion |
| Purple `#bc8cff` | HSA, employer match, hidden opportunities |

---

## What's In Scope (Planned Features)

- Accumulation projections: 401k, Roth IRA, HSA, taxable brokerage, pension
- Employer match (flat and formula-based)
- Social Security — single and spousal benefit, claiming age optimization
- Roth conversion strategy — bracket-fill targeting, IRMAA and ACA cliff costs
- Tax engine — federal + state brackets, FICA, filing status (single, MFJ, HoH)
- RMD projections and tax impact
- Withdrawal order optimization (taxable → traditional → Roth)
- Premium tier (planned): spouse account modeling, Monte Carlo simulation, shareable plan links, PDF export

---

## What Is Explicitly Out of Scope

- **Expense tracking** — no transaction history, no spending categories, no budget management. The user enters a single monthly living expense estimate; the app does not track where money goes.
- **Investment selection** — the app assumes a user-defined average return rate. It does not recommend specific funds, ETFs, or asset allocations.
- **Debt management** — mortgages, student loans, credit cards are not modeled.
- **Insurance** — life, disability, long-term care are not in scope.
- **Tax filing** — this is a planning tool, not a tax preparation tool. It estimates taxes to model retirement impact; it does not produce a tax return.
- **Banking / brokerage integration** — no linked accounts, no data imports.

---

## Design Priorities (In Order)

1. **Clarity of the core question** — "Will I be okay?" should be answerable immediately on the Simple tab without reading anything.
2. **Progressive disclosure** — Simple → Detailed → Flow-Down. Each level adds depth without obscuring the headline answer.
3. **Plain language at every touchpoint** — no unexplained jargon. If a concept requires jargon (e.g., RMD), it's labeled "Required minimum withdrawal" on first use.
4. **Color consistency** — gold is always 401k, orange is always a cost. Never break the semantic color mapping.
5. **Mobile-friendly** — single breakpoint at 600px. All panels, grids, and charts reflow cleanly.
6. **Accessibility (future)** — current build is desktop-first; WCAG 2.1 AA compliance is a pre-launch target, not yet implemented.

---

This should give any design tool enough context to work within the right scope — a focused, dark-themed retirement projection tool for everyday people, not a comprehensive personal finance suite.
