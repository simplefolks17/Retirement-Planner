# verifier-browser — Retirement Planner visual verifier

Drives the **real browser** (what the jsdom render-smoke can't): runtime
console / page errors, real failed network requests, actual paint, and
screenshots. Walks every Horizon screen, the six Numbers sub-tabs, and a
Classic-view round-trip — asserting a screen-specific marker and a non-blank
content area for each. Run it after any UI or model change that could affect
what the screens display.

## How to run

```bash
npm run dev -- --port 5174 &
sleep 4
node .claude/skills/verifier-browser.cjs
```

Prints a structured report, saves screenshots to `/tmp/ss_<screen>.png`, and
**exits non-zero** if any screen fails to render, a marker is missing, a real
4xx fires, or an unexpected console/page error is seen — so it can gate a change.

## What it checks

- **Horizon screens:** Plan · Journey · Ideas · The numbers · Someday · Settings
  (driven by the same labels + markers as `src/__tests__/horizon-screens-smoke.test.js`).
- **Numbers sub-tabs:** Statement · Budget · Accounts · Taxes · Year by year · Money flow.
- **Classic view:** toggles to the original dashboard (3 tabs) and back to Horizon.
- **Runtime health:** console errors, page errors (uncaught exceptions), and 4xx
  responses across the whole walk.

This is the **visual companion** to the jsdom smoke. The jsdom test enforces the
screen↔marker pairing at the logic level (its coverage guard fails if a screen is
added without a marker); this verifies the same screens actually paint in a real
browser. **If you add a Horizon screen, add it to the `SCREENS` array in BOTH files.**

## Known environment notes

- **Chromium is auto-resolved.** The script scans `PLAYWRIGHT_BROWSERS_PATH`
  (`/opt/pw-browsers`) for the newest full `chromium-<build>` on disk and launches
  it via `executablePath`, which bypasses Playwright's bundled-version check. This
  is deliberate: the sandbox's pre-provisioned build drifts from whatever the
  installed `playwright` package wants, and `cdn.playwright.dev` is **blocked by the
  network egress policy** (`Host not in allowlist`), so `playwright install` can't
  fetch the matching build. Auto-resolving the on-disk binary means a `playwright`
  package bump no longer silently disables this verifier. (History: the old script
  hardcoded `chromium-1194`; a bump to playwright 1.60 made it demand build 1223,
  which couldn't be downloaded — the verifier looked "unavailable" but was a path/
  version mismatch, not a real Playwright failure.)
- **First-run onboarding is pre-seeded.** The shell shows a multi-step onboarding
  stepper unless `localStorage["hz-onboarded"] === "1"` (and its Skip button only
  appears on the last step). The script sets that flag via `addInitScript` before
  load, so it lands straight on Plan.
- **Google Fonts fail with `ERR_CERT_AUTHORITY_INVALID`** in this sandbox — expected,
  not a bug. Fonts fall back to system fonts. Font SSL errors + transient favicon
  404s are filtered from the error report.

## If it ever stops launching

1. Check what builds exist: `ls /opt/pw-browsers/` — you want a `chromium-<n>` dir
   containing `chrome-linux/chrome`. The script picks the highest `<n>` automatically.
2. If only `chromium_headless_shell-<n>` exists (no full `chromium-<n>`), the headed
   binary is missing — that's the one needed; flag the sandbox image.
3. `cdn.playwright.dev` is **not** in the egress allowlist, so `npx playwright install`
   will 403. Don't rely on it; rely on the pre-provisioned binary.
