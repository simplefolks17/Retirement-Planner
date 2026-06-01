# verifier-browser — Retirement Planner visual verifier

Launches the Vite dev server, drives all three tabs with Playwright, and
captures screenshots + structured output. Run this any time you need to
confirm the app renders correctly after a code change.

## How to run

```bash
npm run dev -- --port 5174 &
sleep 4
node .claude/skills/verifier-browser.cjs
```

The script prints a structured report and saves screenshots to `/tmp/`.

## Known environment notes

- Chromium binary: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
- Playwright package: `/home/user/Retirement-Planner/node_modules/playwright`
- Google Fonts will fail with `ERR_CERT_AUTHORITY_INVALID` in this sandbox
  — expected, not a bug. Font falls back to system monospace.
- `fmt()` outputs abbreviated currency: `$3.57M`, `$118K`, `$47` — never
  `$3,570,000`. Regexes must match `\$[\d.]+[MK]?` not `\$[\d,]+`.
- RMD table cells render age as a bare number span (`73`), not "Age 73".
  Query by the gold-coloured age spans, not by text content.
- Conversion table rows are rendered as flat span arrays inside a CSS grid,
  not `<tr>/<td>`. Query `.conv-row` or by the age span + sibling values.

## False alarms to avoid

| Symptom | Root cause | Correct approach |
|---|---|---|
| Flow-Down shows `$3`, `$12` | regex `\$[\d,]+` splits `$3.57M` at the dot | Use `\$[\d.]+[MK]?` |
| "Numbers changed" returns false | Same bad regex misses M/K suffix | Compare with correct pattern |
| `text=/Age 73/` finds nothing | RMD table renders `73` as a bare span, not "Age 73" | Use `page.locator('[style*="gold"]').filter({ hasText: '73' })` or check `allTextContents()` on the grid |
| Conversion table text match fails | Rows are flat spans in a CSS grid, no row wrapper | Use `page.locator('text=/^\\d+$/')` for age cells, or grab the full grid text |
| 404 on first load (transient) | Browser races for favicon.ico on cold start | Only flag 404s that reproduce on second navigation; ignore transient first-load ones |
