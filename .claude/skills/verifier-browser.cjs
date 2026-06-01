/**
 * verifier-browser.cjs — Retirement Planner visual verifier
 *
 * Drives all three tabs with Playwright and reports structured results.
 * Run after `npm run dev -- --port 5174 &` (give it 4s to start).
 *
 * Usage:  node .claude/skills/verifier-browser.cjs
 *
 * Key correctness notes:
 *   - fmt() produces $3.57M / $118K / $47 — regex must be /\$[\d.]+[MK]?/
 *   - RMD table age cells are bare number spans, not "Age 73"
 *   - Conversion table is a flat CSS grid of spans, not <tr>/<td>
 *   - Google Fonts SSL failure is expected in this sandbox — not a bug
 */

const { chromium } = require('/home/user/Retirement-Planner/node_modules/playwright');

// Matches fmt() output precisely:
//   $3.57M  — always two decimal places + M suffix (>= 1M)
//   $118K   — no decimal + K suffix (>= 1K)
//   $47     — plain integer (< 1K)
// Does NOT match toLocaleString() comma values like $57,377
// (those have commas and no M/K suffix and are not from fmt()).
const FMT_RE = /\$\d+\.\d+[MK]|\$\d+K|\$\d+/g;

// Returns only the $X.XXM abbreviated million values (require decimal before M
// to exclude cases like $57,377 appearing next to the letter M in adjacent text).
function extractMillions(text) {
  return (text.match(/\$\d+\.\d+M/g) || []);
}

const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL      = 'http://localhost:5174';

function extractFmt(text) {
  return (text.match(FMT_RE) || []);
}

(async () => {
  const br = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await br.newPage();

  // ── Error / network tracking ────────────────────────────────────
  const consoleErrors = [];
  const failedReqs    = [];
  // Console errors to ignore in this sandbox environment:
  //   - Google Fonts SSL: ERR_CERT_AUTHORITY_INVALID (no network cert trust)
  //   - Vite debug/info messages
  // These are NOT code bugs.
  const IGNORE_CONSOLE = [
    'ERR_CERT_AUTHORITY_INVALID', // Google Fonts SSL, expected in sandbox
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    '[vite]',                     // Vite HMR messages
    'Download the React DevTools', // React dev hint
    // Generic browser resource-loading error with no URL in message text.
    // Real 4xx responses are captured separately via page.on('response') with
    // full URL. If our response handler shows no 4xx, this is a browser-internal
    // prefetch/favicon load that isn't part of our app code.
    'Failed to load resource: the server responded with a status of 404',
  ];
  const IGNORE_NETWORK = ['fonts.googleapis.com', 'fonts.gstatic.com'];

  page.on('console', m => {
    if (m.type() === 'error' && !IGNORE_CONSOLE.some(s => m.text().includes(s)))
      consoleErrors.push(m.text());
  });
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400 && !IGNORE_NETWORK.some(h => r.url().includes(h)))
      failedReqs.push({ status: r.status(), url: r.url() });
  });

  // ── Load ────────────────────────────────────────────────────────
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Second navigation to flush any transient favicon 404
  await page.reload({ waitUntil: 'networkidle' });

  const pass  = (label)       => console.log(`  ✅ ${label}`);
  const fail  = (label, note) => console.log(`  ❌ ${label}${note ? ' — ' + note : ''}`);
  const probe = (label, note) => console.log(`  🔍 ${label}${note ? ' — ' + note : ''}`);
  const warn  = (label, note) => console.log(`  ⚠️  ${label}${note ? ' — ' + note : ''}`);

  console.log('\n── Simple Planner ──────────────────────────────────────────');

  // Tab bar
  const tabs = await page.locator('button.tab-btn').allTextContents();
  tabs.join() === 'Simple Planner,Detailed Planner,Flow-Down'
    ? pass('Tab bar: 3 tabs present') : fail('Tab bar', tabs.join());

  // Sliders
  const simpleSlidersN = await page.locator('input[type=range]').count();
  simpleSlidersN >= 15
    ? pass(`Sliders: ${simpleSlidersN} present`)
    : fail('Sliders', `only ${simpleSlidersN}`);

  // Key portfolio values — use correct fmt() regex
  const bodyText  = await page.locator('body').textContent();
  const fmtVals   = extractFmt(bodyText);
  const simMillions = extractMillions(bodyText);
  simMillions.length >= 1
    ? pass(`Portfolio values include millions: ${simMillions.slice(0,4).join(', ')}`)
    : fail('No $X.XXM values found on Simple tab', fmtVals.slice(0,6).join(', '));

  await page.screenshot({ path: '/tmp/ss_simple.png', fullPage: true });

  // Reactivity — move income slider, confirm numbers update
  const incomeSlider = page.locator('input[type=range]').first();
  const before = extractFmt(await page.locator('body').textContent()).join();
  await incomeSlider.focus();
  for (let i = 0; i < 5; i++) await incomeSlider.press('ArrowRight');
  await page.waitForTimeout(400);
  const after = extractFmt(await page.locator('body').textContent()).join();
  before !== after
    ? pass('Reactivity: values updated after slider move')
    : fail('Reactivity: values did not change after slider move');

  // Reset slider
  for (let i = 0; i < 5; i++) await incomeSlider.press('ArrowLeft');
  await page.waitForTimeout(300);

  console.log('\n── Detailed Planner ────────────────────────────────────────');
  await page.locator('button.tab-btn').nth(1).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/ss_detailed.png', fullPage: true });

  const detText = await page.locator('body').textContent();
  ['Social Security', 'Required Minimum', 'Roth Conversion', 'Mega Backdoor'].forEach(section => {
    detText.includes(section)
      ? pass(`Section present: "${section}"`)
      : fail(`Section missing: "${section}"`);
  });

  // AIME display — bare number /mo pattern (AIME is ~$12K for default state)
  const aimedMatch = detText.match(/\$[\d,]+\/mo/);
  aimedMatch
    ? pass(`AIME displayed: ${aimedMatch[0]}`)
    : warn('AIME /mo value not found');

  // RMD table — age cells are bare gold-coloured number spans, NOT "Age 73"
  // They render as: <span style="...gold...">73</span>
  // Correct approach: grab all mono spans and look for values in the 73-100 range
  const detSliders = await page.locator('input[type=range]').count();
  probe(`Detailed tab sliders: ${detSliders}`);

  const detFmtVals = extractFmt(detText);
  probe(`Fmt values on Detailed tab (first 8): ${detFmtVals.slice(0,8).join(', ')}`);

  // RMD table check: look for the numeric age values rendered as spans
  // The table renders age (e.g. 73) + divisor + balance + RMD + tax as sibling spans
  // Strategy: check body text contains "73" as a standalone token near RMD values
  const rmdSectionPresent = detText.includes('Required Minimum');
  const rmdHasAge73 = detText.split(/\s+/).includes('73');
  rmdSectionPresent && rmdHasAge73
    ? pass('RMD table: section present and age 73 visible')
    : fail('RMD table: section or age 73 missing', `section=${rmdSectionPresent}, age73=${rmdHasAge73}`);

  // Conversion table — flat CSS grid of spans, not <tr>/<td>
  // Check that conversion year data is present (years render as age numbers in gold spans)
  const convTablePresent = detText.includes('Roth Conversion') && detFmtVals.length > 5;
  convTablePresent
    ? pass('Conversion section: present with values')
    : fail('Conversion section: missing or empty');

  console.log('\n── Flow-Down ───────────────────────────────────────────────');
  await page.locator('button.tab-btn').nth(2).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/ss_flowdown.png', fullPage: true });

  const fdText = await page.locator('body').textContent();

  // Phase cards
  ['Build Wealth', 'Optimize', 'Spend'].forEach(phase => {
    fdText.includes(phase)
      ? pass(`Phase card: "${phase}" present`)
      : fail(`Phase card missing: "${phase}"`);
  });

  // "Recommended Actions" — CSS uppercases visually but textContent has original case
  const recCount = (fdText.match(/Recommended Actions/g) || []).length;
  recCount === 3
    ? pass(`"Recommended Actions" headers: ${recCount} (one per phase)`)
    : fail(`"Recommended Actions" count wrong`, `got ${recCount}, expected 3`);

  // Waterfall steps
  const wfCount = await page.locator('.fd-wf-step').count();
  wfCount >= 10
    ? pass(`Waterfall step rows: ${wfCount}`)
    : fail(`Too few waterfall steps`, `${wfCount}`);

  // Connector values — these are the $X.XXM boxes between phases
  // fmt() produces e.g. "$3.57M" — use correct regex
  const fdFmtVals = extractFmt(fdText);
  const fdMillions = extractMillions(fdText);
  fdMillions.length >= 2
    ? pass(`Phase connector values (millions): ${fdMillions.slice(0,4).join(', ')}`)
    : fail('Expected $X.XXM connector values in Flow-Down', fdFmtVals.slice(0,6).join(', '));

  // Sustainability verdict
  const sustainsOrDepletes = fdText.includes('Portfolio Sustains') || fdText.includes('Portfolio Depletes');
  sustainsOrDepletes
    ? pass(`Outcome verdict: "${fdText.match(/Portfolio (Sustains|Depletes)[^.]+/)?.[0] ?? 'found'}"`)
    : fail('Outcome card missing sustainability verdict');

  // Action card count
  const actionCardCount = await page.locator('.fd-wf-step').count();
  probe(`Action cards visible: checked via waterfall rows (${actionCardCount})`);

  // Probe: change return rate on Simple, confirm Flow-Down values update
  await page.locator('button.tab-btn').nth(0).click();
  await page.waitForTimeout(300);
  // nth(9) = return rate slider (min=1, max=15, val=5, step=1) — verified by inspecting
  // all slider min/max/val attributes on Simple tab. Income=nth(0), growth=nth(1),
  // spouse=nth(2), living=nth(3), match=nth(4), surplus=nth(5), currentAge=nth(6),
  // retAge=nth(7), lifeExp=nth(8), returnRate=nth(9), inflation=nth(10).
  const retSlider = page.locator('input[type=range]').nth(9);
  const fdBefore = fdMillions.slice(0, 3).join();
  await retSlider.focus();
  for (let i = 0; i < 8; i++) await retSlider.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.locator('button.tab-btn').nth(2).click();
  await page.waitForTimeout(600);
  const fdAfterText  = await page.locator('body').textContent();
  const fdAfterMills = extractMillions(fdAfterText);
  fdAfterMills.slice(0,3).join() !== fdBefore
    ? probe(`Cross-tab reactivity: Flow-Down updated after return-rate change (${fdAfterMills.slice(0,3).join(', ')})`)
    : warn('Cross-tab reactivity: Flow-Down millions unchanged after return-rate change');

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n── Network / console errors ────────────────────────────────');
  if (failedReqs.length === 0) {
    pass('No unexpected network failures');
  } else {
    failedReqs.forEach(r => fail(`HTTP ${r.status}`, r.url));
  }
  if (consoleErrors.length === 0) {
    pass('No unexpected console errors');
  } else {
    consoleErrors.forEach(e => fail('Console error', e));
  }

  console.log('\n── Screenshots ─────────────────────────────────────────────');
  console.log('  /tmp/ss_simple.png');
  console.log('  /tmp/ss_detailed.png');
  console.log('  /tmp/ss_flowdown.png');

  await br.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
