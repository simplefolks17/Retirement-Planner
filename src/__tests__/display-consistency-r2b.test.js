import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { TaxTimeline } from "../components/TaxTimeline.jsx";
import { ConversionEventsPanel } from "../components/ConversionEventsPanel.jsx";
import { CONVERSION_EVENT_NOT_MODELLED_LABEL } from "../model/conversion-events.js";

// R2-B (Opus review R-2, R-8, R-9, R-13): display/consistency fixes, driven through the real App.
// Classic is rendered for real; Horizon is a capture stub (same idiom as classic-horizon-parity).

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("recharts", async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, ResponsiveContainer: () => null };
});
const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";
import { fmt } from "../formatters.js";
import { anchorWhatIfToHeadline } from "../model/what-if.js";
import { WhatIfPanel } from "../components/WhatIfPanel.jsx";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { innerWidth: 1200, addEventListener: () => {}, removeEventListener: () => {} };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => { delete globalThis.window; delete globalThis.ResizeObserver; });

function mount() {
  captured.length = 0;
  let r;
  act(() => { r = create(React.createElement(App)); });
  return r;
}
const L = () => captured[captured.length - 1];
const fire = (fn) => act(() => fn());
const set = (path, v) => fire(() => path.split(".").reduce((o, k) => o[k], L()).set(v));
const textOf = (n) => (n.children ?? []).map(c => typeof c === "string" ? c : textOf(c)).join("");

describe("BUG-174 (R-8): TaxTimeline renders each segment at its own precision", () => {
  it("the Ret. segment shows the 1-dp effective RMD rate, the Working segment the 0-dp bracket", () => {
    const r = mount();
    const rate = L().rmdView?.effectiveRMDTaxRateLabel;
    fire(() => L().onShowClassic());
    const tl = r.root.findAllByType(TaxTimeline)[0];
    const txt = textOf(tl);
    expect(rate).toBe("12.8%");
    expect(txt).toContain(`Ret.: ${rate}`);
    expect(txt).toMatch(/Working: \d+%/);
    act(() => r.unmount());
  });
});

// T-X.3 household (src/__tests__/spouse-household.test.js buildTX3Household), reproduced here.
function buildTX3() {
  const r = mount();
  const f = (fn) => act(() => fn());
  f(() => L().assumptions.currentAge.set(50));
  f(() => L().assumptions.retirementAge.set(62));
  f(() => L().ss.isMarried.set(true));
  f(() => L().ss.spouseCurrentAge.set(45));
  f(() => L().spouseAccounts.spouseRetirementAge.set(65));
  f(() => L().profile.filingStatus.set("mfj"));
  f(() => L().profile.spouseIncome.set(80_000));
  f(() => L().spouseAccounts.trad401k.bal.set(400_000));
  f(() => L().spouseAccounts.trad401k.contrib.set(12_000));
  f(() => L().accounts.trad401k.bal.set(1_400_000));
  f(() => L().accounts.roth.bal.set(80_000));
  f(() => L().accounts.taxable.bal.set(150_000));
  f(() => L().spending.annualExpenses.set(140_000));
  f(() => L().ss.ssClaimingAge.set(67));
  return r;
}

describe("BUG-173 (R-2): work-longer 'Social Security / yr' is the household figure and honours a pinned override", () => {
  it("override 38,000 pinned: every row shows 38,000 (not the PIA-derived 23k-29k), delta 0, flagged pinned", () => {
    const r = buildTX3();
    set("ss.ssOverride", 38_000);
    const wl = L().workLongerView;
    const hh = L().householdSS;
    const rows = wl.rows.map(x => ({ y: x.years, ss: x.ssAnnual, d: x.ssDelta, pin: x.ssPinnedFlat }));
    act(() => r.unmount());
    expect(hh).toBe(38_000);
    expect(wl.baseSSAnnual).toBe(38_000);
    expect(rows).toEqual([
      { y: 1, ss: 38_000, d: 0, pin: true },
      { y: 3, ss: 38_000, d: 0, pin: true },
      { y: 5, ss: 38_000, d: 0, pin: true },
    ]);
  });

  it("no override, with a spouse benefit: the base figure equals the plan's householdSS and rows include the spouse's half", () => {
    const r = buildTX3();
    set("ss.spouseSsEstimate", 20_000);
    const wl = L().workLongerView;
    const hh = L().householdSS;
    const rows = wl.rows.map(x => ({ ss: x.ssAnnual, pin: x.ssPinnedFlat }));
    act(() => r.unmount());
    expect(wl.baseSSAnnual).toBe(hh);
    // Each row is household SS (primary PIA-derived + spouse 20,000), never primary-only.
    for (const row of rows) { expect(row.ss).toBeGreaterThan(20_000 + 20_000); expect(row.pin).toBe(false); }
  });
});

// ── BUG-175 (R-13 defect half) ───────────────────────────────────────────────────────────────
// Review repro: $500k pre-tax, in-service conversions on, event $100,000 at the default age 48;
// then retirement moves 65 -> 40. The model drops the event (simData.convEvent sum 100,000 -> 0);
// the row used to keep reading "401k → Roth, taxed as income". It must now say it isn't modelled.

describe("BUG-175 (R-13): a working-year conversion event the model drops is flagged, not shown as live", () => {
  function build() {
    const r = mount();
    set("accounts.trad401k.bal", 500_000);
    set("conversionView.events.inServiceField", true);
    return r;
  }
  it("Horizon row + Classic panel flag the event after retirement moves before its age; model really drops it", () => {
    const r = build();
    set("conversionView.events.inServiceField", true);
    fire(() => L().conversionView.events.add());
    const id = L().conversionView.events.rows[0].id;
    fire(() => L().conversionView.events.rows[0].amountField.set(100_000));
    const before = L().conversionView.events.rows[0];
    const beforeSum = L().simData.reduce((s, d) => s + (d.convEvent ?? 0), 0);
    set("assumptions.retirementAge", 40);
    const row = L().conversionView.events.rows[0];
    const afterSum = L().simData.reduce((s, d) => s + (d.convEvent ?? 0), 0);
    const snap = { ageVal: row.ageField.value, ageMax: row.ageField.max, nm: row.notModelled, label: row.estTaxLabel, id: row.id };
    fire(() => L().onShowClassic());
    const panel = r.root.findAllByType(ConversionEventsPanel)[0];
    const classicTxt = panel ? textOf(panel) : null;
    act(() => r.unmount());

    expect(before.notModelled).toBe(false);
    expect(beforeSum).toBe(100_000);
    expect(afterSum).toBe(0);                       // the model really drops it
    expect(snap.id).toBe(id);
    expect(snap.nm).toBe(true);
    expect(snap.label).toBe(CONVERSION_EVENT_NOT_MODELLED_LABEL);
    expect(snap.ageVal).toBeGreaterThan(snap.ageMax); // the stale value is out of its own range
    // Whatever Classic renders at this state (it may show "no working years"), it must never
    // present the dropped event as live:
    expect(classicTxt === null || !classicTxt.includes("401k → Roth, taxed as income")).toBe(true);
  });

  it("Classic row (working years still exist, event beyond them) shows the not-modelled label", () => {
    const r = build();
    fire(() => L().conversionView.events.add());
    fire(() => L().conversionView.events.rows[0].amountField.set(100_000));
    // Move the event late, then pull retirement in front of it but keep working years > 0.
    const a = L().assumptions.currentAge.value;
    set("assumptions.retirementAge", a + 4);
    fire(() => L().conversionView.events.rows[0].ageField.set(a + 3));
    set("assumptions.retirementAge", a + 2); // event at a+3 is now past retirement-1
    const nm = L().conversionView.events.rows[0].notModelled;
    fire(() => L().onShowClassic());
    const panel = r.root.findAllByType(ConversionEventsPanel)[0];
    const txt = textOf(panel);
    act(() => r.unmount());
    expect(nm).toBe(true);
    expect(txt).toContain(CONVERSION_EVENT_NOT_MODELLED_LABEL);
    expect(txt).not.toContain("401k → Roth, taxed as income");
  });
});

// ── BUG-176 (R-9) ────────────────────────────────────────────────────────────────────────────
// Review repro (Finding B's household): primary 48 retiring 57, spouse 37 earning $120k with a
// $20k 401k, $120k spend, conversions zeroed, "auto" spouse retirement. Headline: money lasts to 70.
function buildYoungerSpouse() {
  const r = mount();
  const f = (fn) => act(() => fn());
  f(() => L().assumptions.currentAge.set(48));
  f(() => L().assumptions.retirementAge.set(57));
  f(() => L().profile.filingStatus.set("mfj"));
  f(() => L().ss.isMarried.set(true));
  f(() => L().ss.spouseCurrentAge.set(37));
  f(() => L().profile.spouseIncome.set(120_000));
  f(() => L().spouseAccounts.trad401k.contrib.set(20_000));
  f(() => L().spending.annualExpenses.set(120_000));
  f(() => L().conversion.conversionMode.set("custom"));
  f(() => L().conversion.annualConversionAmt.set(0));
  f(() => L().spending.livingExpenses.set(60_000));
  return r;
}
const metric = (preview, id) => preview.metrics.find(m => m.id === id);

describe("BUG-176 (R-9): calcWhatIfDelta previews never print a 'before' that contradicts the headline", () => {
  it("Horizon surplus Apply preview: 'Portfolio lasts' before == the headline depletion age, after never reads worse", () => {
    const r = buildYoungerSpouse();
    const p = L();
    const headlineAge = p.retirementWalk.depletionAge;
    const headlineYears = p.yearsSustained;
    const site = p.surplusView.applyAllocation;
    const lon = site.available ? metric(site.preview, "longevity") : null;
    const tot = site.available ? metric(site.preview, "totalAtRet") : null;
    const headlineTotal = p.totalAtRet;
    act(() => r.unmount());
    expect(site.available).toBe(true);
    expect(headlineAge).not.toBeNull();
    expect(lon.before).toBe(`to age ${headlineAge}`);
    // after is headline + the lever's own delta: never an earlier age than the plan it improves
    const afterAge = Number(lon.after.replace(/\D+/g, ""));
    expect(afterAge).toBeGreaterThanOrEqual(headlineAge);
    expect(headlineYears).toBeGreaterThan(0);
    expect(tot.before).toBe(fmt(headlineTotal));        // "before" nest egg is the headline's too
  });

  it("Classic WhatIfPanel 'Work 2 more years': before == headline age; after is the lever's own delta from it", () => {
    const r = buildYoungerSpouse();
    const headlineAge = L().retirementWalk.depletionAge;
    const headlineYears = L().yearsSustained;
    fire(() => L().onShowClassic());
    const panel = r.root.findAllByType(WhatIfPanel)[0];
    const header = panel.findAll(n => n.type === "div" && typeof n.props.onClick === "function"
      && textOf(n).includes("What-If Calculator"))[0];
    fire(() => header.props.onClick());
    const preset = panel.findAll(n => n.type === "button" && textOf(n) === "Work 2 more years")[0];
    fire(() => preset.props.onClick());
    const txt = textOf(panel);
    act(() => r.unmount());
    expect(headlineAge).toBe(70);
    expect(headlineYears).toBeGreaterThan(12);
    // "vs Portfolio lasts to age <before>": the before is the headline's.
    const m = txt.match(/to age (\d+)vs[\s\u00a0]*Portfolio lasts to age (\d+)/);
    expect(m, txt).toBeTruthy();
    const [after, before] = [Number(m[1]), Number(m[2])];
    expect(before).toBe(headlineAge);
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe("anchorWhatIfToHeadline (BUG-176) — edge states", () => {
  const head = { years: 13, depletionAge: 70, totalAtRet: 1_000_000 };
  const mk = (sy, ny, st = 1_100_000, nt = 1_000_000) => anchorWhatIfToHeadline({
    scenario: { scenarioYears: sy, scenarioTotalAtRet: st, scenarioDepletionAge: null },
    noChange: { scenarioYears: ny, scenarioTotalAtRet: nt }, headline: head, scenarioRetAge: 57,
  });
  it("no change at all -> exactly the headline, delta 0", () => {
    const a = mk(5.4, 5.4, 1_000_000);
    expect(a.scenarioYears).toBe(13); expect(a.deltaYears).toBe(0);
    expect(a.scenarioDepletionAge).toBe(70); expect(a.scenarioTotalAtRet).toBe(1_000_000);
  });
  it("finite delta rides on the headline (engine bias cancels); nest egg likewise", () => {
    const a = mk(7.4, 5.4);
    expect(a.scenarioYears).toBe(15); expect(a.deltaYears).toBeCloseTo(2, 9);
    // BUG-189: 57 + floor(15) + 1 = 73 (the engine's convention). This line previously locked the
    // Math.round(57 + 15) = 72 off-by-one that BUG-189 corrected.
    expect(a.scenarioDepletionAge).toBe(73); expect(a.scenarioTotalAtRet).toBe(1_100_000);
  });
  it("scenario never depletes while the no-change walk did -> Infinity, no depletion age", () => {
    const a = mk(Infinity, 5.4);
    expect(a.scenarioYears).toBe(Infinity); expect(a.scenarioDepletionAge).toBeNull();
  });
  it("both sustainable -> delta 0 and years stay Infinity only when the headline is", () => {
    expect(mk(Infinity, Infinity).deltaYears).toBe(0);
    expect(mk(Infinity, Infinity).scenarioYears).toBe(13);
  });
});

// ── BUG-180 (Opus review 2, S-2): a hurting lever on a sustainable headline ───────────────────────
describe("anchorWhatIfToHeadline (BUG-180) — sustainable headline, lever hurts", () => {
  const head = { years: Infinity, depletionAge: null, totalAtRet: 1_000_000 };
  const mk = (sy, ny) => anchorWhatIfToHeadline({
    scenario: { scenarioYears: sy, scenarioTotalAtRet: 900_000, scenarioDepletionAge: 81 },
    noChange: { scenarioYears: ny, scenarioTotalAtRet: 1_000_000 }, headline: head, scenarioRetAge: 55,
  });
  it("a finite negative delta returns the not-comparable state, never the blended absolute", () => {
    const a = mk(25.5, 35.2);
    expect(a.comparable).toBe(false);
    expect(a.scenarioYears).toBeNull();
    expect(a.scenarioDepletionAge).toBeNull();
    expect(a.deltaYears).toBeCloseTo(-9.7, 9);
    expect(a.baseYears).toBe(Infinity);
  });
  it("-Infinity delta (blended no-change sustainable, scenario not) is not comparable either", () => {
    const a = mk(40, Infinity);
    expect(a.comparable).toBe(false); expect(a.scenarioYears).toBeNull(); expect(a.deltaYears).toBeNull();
  });
  it("a helping or neutral lever on a sustainable headline stays Infinity and comparable", () => {
    expect(mk(36, 35.2)).toMatchObject({ comparable: true, scenarioYears: Infinity, scenarioDepletionAge: null });
    expect(mk(35.2, 35.2)).toMatchObject({ comparable: true, scenarioYears: Infinity });
  });
});

describe("BUG-180: the Classic panel never prints an absolute age beside 'Sustainable indefinitely'", () => {
  it("sustainable younger-spouse household + 'Retire 2 years early': no 'lasts to age N' for the scenario", () => {
    const r = buildYoungerSpouse();
    fire(() => L().spending.annualExpenses.set(30_000));
    expect(L().yearsSustained).toBe(Infinity);   // fixture precondition (the review's $30k spend)
    fire(() => L().onShowClassic());
    const panel = r.root.findAllByType(WhatIfPanel)[0];
    const header = panel.findAll(n => n.type === "div" && typeof n.props.onClick === "function"
      && textOf(n).includes("What-If Calculator"))[0];
    fire(() => header.props.onClick());
    const preset = panel.findAll(n => n.type === "button" && /Retire 2 years early/.test(textOf(n)))[0];
    expect(preset, "preset button").toBeTruthy();
    fire(() => preset.props.onClick());
    const txt = textOf(panel);
    act(() => r.unmount());
    expect(txt).toContain("Sustainable indefinitely");
    expect(txt).not.toMatch(/lasts to age \d+/);
    expect(txt).toContain("Weaker than your plan");
  });
});
