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
