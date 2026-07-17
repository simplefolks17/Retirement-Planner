/**
 * verifier-browser.cjs — Retirement Planner visual verifier (Horizon UI)
 *
 * Drives the REAL browser (what jsdom render-smoke can't): runtime console /
 * page errors, real failed network requests, actual paint, and screenshots.
 * Walks every Horizon screen + the five Numbers sub-tabs + a Classic-view
 * round-trip, asserting a screen-specific marker and a non-blank content area
 * for each.
 *
 * Run after starting the dev server:
 *     npm run dev -- --port 5174 &
 *     sleep 4
 *     node .claude/skills/verifier-browser.cjs
 *
 * Exit code is non-zero if any screen fails to render, a marker is missing, a
 * real 4xx fires, or an unexpected console/page error is seen — so it can gate
 * a change. Screenshots land in /tmp/ss_<screen>.png.
 *
 * SOURCE OF TRUTH: the screen list + markers below MIRROR
 * src/__tests__/horizon-screens-smoke.test.js (SCREENS / SCREEN_MARKERS). If a
 * screen is added there, add it here too — the jsdom test's coverage guard is
 * what enforces the pairing at the logic level; this is its visual companion.
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('/home/user/Retirement-Planner/node_modules/playwright');

const URL = 'http://localhost:5174';

// ── Robust Chromium resolution ────────────────────────────────────────────────
// The sandbox pre-provisions a Chromium build under PLAYWRIGHT_BROWSERS_PATH,
// but its build number drifts from whatever the installed `playwright` package
// wants, and the download CDN is blocked by the egress policy. So instead of
// hardcoding one build (the old script pinned chromium-1194, which broke when
// the package was bumped to 1.60 → wanted 1223), discover the newest full
// "chromium-<build>" on disk and launch THAT via executablePath. Launching with
// an explicit executablePath bypasses Playwright's bundled-version check, so a
// package bump can no longer silently disable this verifier.
function resolveChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const builds = fs.readdirSync(root)
      .filter(d => /^chromium-\d+$/.test(d))   // full headed build, NOT chromium_headless_shell-*
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of builds) {
      const p = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch { /* fall through to default lookup */ }
  return null;
}

// ── Screen list + proof-of-render markers (mirror the jsdom smoke) ─────────────
const SCREENS = [
  { id: 'plan',     label: 'Plan',        marker: 'Income for life'        },
  { id: 'journey',  label: 'Journey',     marker: 'Building years'         },
  // Ideas retired 2026-07-16 — levers + goals moved onto Plan's Explore tray.
  { id: 'numbers',  label: 'The numbers', marker: 'Year by year'           },
  { id: 'someday',  label: 'Someday',     marker: 'work optional.'         },
  { id: 'settings', label: 'Settings',    marker: 'Theme'                  },
];
// Trued 2026-07-08 (BUG-41 close-out fix): "Money flow" was consolidated into
// Statement (commit 434caf8, PR #38) — its retirement-phase content lives on as
// Statement's "Retirement income companion strip". 5 tabs, not 6.
const NUMBERS_TABS = ['Statement', 'Budget', 'Accounts', 'Taxes', 'Year by year'];

// Console / network noise that is NOT a code bug in this sandbox.
const IGNORE_CONSOLE = [
  'ERR_CERT_AUTHORITY_INVALID',  // Google Fonts SSL — no cert trust in sandbox
  'fonts.googleapis.com', 'fonts.gstatic.com',
  '[vite]', 'Download the React DevTools',
  'Failed to load resource: the server responded with a status of 404', // transient favicon
];
const IGNORE_NETWORK = ['fonts.googleapis.com', 'fonts.gstatic.com', '/favicon.ico'];

let failures = 0;
const pass = (l)    => console.log(`  ✅ ${l}`);
const fail = (l, n) => { failures++; console.log(`  ❌ ${l}${n ? ' — ' + n : ''}`); };
const info = (l)    => console.log(`  🔍 ${l}`);

(async () => {
  const exe = resolveChromium();
  console.log(`\nChromium: ${exe || '(Playwright default lookup)'}`);
  const br = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await br.newPage({ viewport: { width: 1280, height: 900 } });

  // ── Error / network tracking (active for the whole walk) ──────────────────
  const consoleErrors = [];
  const failedReqs    = [];
  page.on('console', m => {
    if (m.type() === 'error' && !IGNORE_CONSOLE.some(s => m.text().includes(s)))
      consoleErrors.push(m.text());
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', r => {
    if (r.status() >= 400 && !IGNORE_NETWORK.some(h => r.url().includes(h)))
      failedReqs.push({ status: r.status(), url: r.url() });
  });

  // ── Pre-seed the onboarding flag, then load ───────────────────────────────
  // First run shows a multi-step onboarding stepper (gated on
  // localStorage["hz-onboarded"] !== "1"); "Skip" only appears on its last step.
  // Seed the flag before any app script runs so we land straight on Plan.
  await page.addInitScript(() => { try { localStorage.setItem('hz-onboarded', '1'); } catch {} });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (e) {
    fail('Could not reach dev server at ' + URL, 'start it: npm run dev -- --port 5174 &');
    await br.close();
    process.exit(1);
  }
  // Belt-and-suspenders: if onboarding still shows, click through to its Skip.
  const skip = page.getByText(/skip for now/i).first();
  if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(200); }

  // Marker visible? (partial match — markers include punctuation/case as displayed)
  const markerVisible = async (m) => (await page.getByText(m, { exact: false }).count()) > 0;
  const bodyLen       = async ()  => (await page.locator('body').innerText()).trim().length;
  const navTo         = async (label) => {
    await page.getByText(label, { exact: true }).first().click();
    await page.waitForTimeout(350);
  };

  // ── Horizon screens ───────────────────────────────────────────────────────
  console.log('\n── Horizon screens ─────────────────────────────────────────');
  for (const s of SCREENS) {
    try {
      if (s.id !== 'plan') await navTo(s.label);          // Plan is the default screen
      const okMarker = await markerVisible(s.marker);
      const len      = await bodyLen();
      await page.screenshot({ path: `/tmp/ss_${s.id}.png`, fullPage: true });
      if (okMarker && len > 200) pass(`${s.label}: rendered (marker "${s.marker}", ${len} chars)`);
      else fail(`${s.label}: did not render properly`, `marker=${okMarker}, textLen=${len}`);
    } catch (e) {
      fail(`${s.label}: navigation/render threw`, e.message.split('\n')[0]);
    }
  }

  // ── Numbers sub-tabs (deep path the per-screen marker can't reach) ─────────
  console.log('\n── Numbers sub-tabs ────────────────────────────────────────');
  await navTo('The numbers');
  for (const tab of NUMBERS_TABS) {
    try {
      await navTo(tab);
      const len = await bodyLen();
      len > 200 ? pass(`Numbers / ${tab}: ${len} chars`)
                : fail(`Numbers / ${tab}: content looks empty`, `textLen=${len}`);
    } catch (e) {
      fail(`Numbers / ${tab}: threw`, e.message.split('\n')[0]);
    }
  }

  // ── Classic view round-trip (the original dashboard is still reachable) ────
  console.log('\n── Classic view ────────────────────────────────────────────');
  try {
    await navTo('Settings');                              // a known screen with the Classic toggle in chrome
    await page.getByText('Classic view', { exact: true }).first().click();
    await page.waitForTimeout(500);
    const tabN = await page.locator('button.tab-btn').count();
    await page.screenshot({ path: '/tmp/ss_classic.png', fullPage: true });
    tabN >= 3 ? pass(`Classic dashboard: ${tabN} tabs (Simple / Detailed / Flow-Down)`)
              : fail('Classic dashboard: tab bar missing', `tab-btn count ${tabN}`);
    await page.getByText(/Horizon view/).first().click();  // return to Horizon
    await page.waitForTimeout(400);
    (await markerVisible('Income for life'))
      ? pass('Returned to Horizon')
      : fail('Did not return to Horizon after Classic round-trip');
  } catch (e) {
    fail('Classic view round-trip threw', e.message.split('\n')[0]);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Runtime errors ──────────────────────────────────────────');
  failedReqs.length === 0 ? pass('No unexpected network failures')
                          : failedReqs.forEach(r => fail(`HTTP ${r.status}`, r.url));
  consoleErrors.length === 0 ? pass('No unexpected console/page errors')
                             : consoleErrors.forEach(e => fail('Console error', e));

  console.log('\n── Screenshots ─────────────────────────────────────────────');
  for (const s of SCREENS) console.log(`  /tmp/ss_${s.id}.png`);
  console.log('  /tmp/ss_classic.png');

  console.log(`\n${failures === 0 ? '✅ PASS' : `❌ FAIL (${failures})`} — verifier complete\n`);
  await br.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
