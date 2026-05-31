# Retirement Financial Planner

A browser-based retirement planning tool that models tax-optimized savings, Social Security, Roth conversions, RMDs, and portfolio drawdown through life expectancy.

## What It Does

- **Simple Planner** — Income, tax breakdown, account balances, contribution projections, milestone cards, drawdown analysis, portfolio lifecycle chart
- **Detailed Planner** — Social Security estimation with claiming strategy, spousal benefits, RMD projections with IRS life expectancy tables, Roth conversion ladder with dual tax-source scenarios, Mega Backdoor Roth calculator, tax-efficient withdrawal ordering
- **Flow-Down** — Visual waterfall showing money flowing through life phases (accumulate → convert → distribute), with context-aware action cards and a budget-constrained current-vs-optimized comparison

## Key Features

- 2026 federal tax brackets for all four filing statuses
- State income tax for all 50 states + DC (working and retirement rates)
- Employer match in both flat % and formula mode ("50% of first 6%")
- Roth IRA MAGI phase-out applied per year in projections
- SS wage base cap in AIME calculation
- Budget system: living expenses → savings capacity → IRS-priority allocation → apply to projections
- All IRS limits centralized in one config file

## Running Locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173` (or next available port).

## Running Tests

```bash
npm test
```

## Project Structure

```
retirement-planner/
  CLAUDE.md                  Project rules read every Claude Code session
  README.md                  This file
  feature-tracker.html       Feature backlog (28 items)
  financial-scenarios.jsx    Current monolith (to be decomposed)
  docs/
    ARCHITECTURE.md          Module map, data flow, testing strategy
    FINANCIAL-MODEL.md       Formulas, assumptions, IRS update procedure
    DESIGN.md                Color tokens, typography, component inventory
    INTEGRATIONS.md          External services and hybrid client/server split
```

See `docs/ARCHITECTURE.md` for the module map and data flow.

## Disclaimer

For illustrative purposes only. Not financial or tax advice. Consult a qualified advisor.
