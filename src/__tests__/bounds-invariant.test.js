import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { allFields } from "./helpers/horizon-fields.js";

// ── Bounds-invariant guard (oversight audit 2026-11-14, Part 3 fix 2) ───────────────────
//
// After a scripted USER move, every numeric field in every setter bundle must sit inside its
// own declared [min, max], and min <= max. The audit's probe ran 13 such sequences and found 6
// leaving a stored value out of range: a plateau age below the (moved) current age, a plateau
// above the retirement age, onboarding's un-coupled age setter leaving SS claiming at 67 for a
// 72-year-old (BUG-153), an HSA contribution above the limit after a coverage switch (BUG-161).
// Each was a coupling gap — a dependent value not re-clamped when its parent moved — of exactly
// the kind that no value-locking test can see. Those were fixed in L1-B/L1-C; this file keeps
// them fixed and covers the whole class.
//
// ONE deliberate, owner-accepted exemption (see EXEMPT below): `livingExpenses` above its
// dynamic max after an income drop. It is the user's own number, so the app leaves it alone.

const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";

// `captured` is shared by every mount: read what you need, then unmount before mounting again.
function mount() {
  captured.length = 0;
  let r;
  act(() => { r = create(React.createElement(App)); });
  return {
    L: () => captured[captured.length - 1],
    fire: (fn) => act(() => fn()),
    unmount: () => act(() => r.unmount()),
  };
}

// Every `{ value, set }` field anywhere in the props (not a hard-coded bundle list, R-13).
const fieldsOf = (p) => allFields(p);
const getAt = (p, path) => path.split(".").reduce((o, k) => o?.[k], p);

// Returns a list of violations (empty = all fields in range).
function violations(app) {
  const bad = [];
  const props = app.L();
  for (const { path, field } of fieldsOf(props)) {
    const v = field.value;
    if (typeof v !== "number") continue;
    // BUG-175: a working-year conversion event whose age fell outside the user's working years is
    // NOT a silent coupling gap any more: the model drops it and the row says so
    // (`notModelled: true`, "outside your working years, not modelled"). Its ageField is
    // legitimately out of range then. Exempt ONLY when the row itself carries the flag; the
    // dedicated test below asserts the flag, so an unflagged out-of-range row still fails here.
    const row = /^conversionView\.events\.rows\.\d+\.ageField$/.test(path)
      ? getAt(props, path.replace(/\.ageField$/, "")) : null;
    if (row?.notModelled === true) continue;
    // The conversion WINDOW has a designed empty state: with retirement at/after RMD_START_AGE-1
    // there is no gap year to convert in, so the model reports `hasConvWindow: false`, hands the
    // fields an empty range (min > max, value outside it) and the Strategies screen HIDES the
    // window controls (strategies-screen.test.js "no-window edge state"). Exempt only while that
    // flag is false; the dedicated test below pins that the flag really is what raises it.
    if (/^conversionView\.window\.(start|end)AgeField$/.test(path) && props.conversionView?.window?.hasConvWindow === false) continue;
    if (Number.isFinite(field.min) && v < field.min - 1e-9) bad.push({ path, msg: `${path}=${v} < min ${field.min}` });
    if (Number.isFinite(field.max) && v > field.max + 1e-9) bad.push({ path, msg: `${path}=${v} > max ${field.max}` });
    if (Number.isFinite(field.min) && Number.isFinite(field.max) && field.min > field.max) bad.push({ path, msg: `${path}: min ${field.min} > max ${field.max}` });
  }
  return bad;
}

const MARRY = (a, spouseAge = 32) => {
  a.fire(() => a.L().ss.isMarried.set(true));
  a.fire(() => a.L().profile.filingStatus.set("mfj"));
  a.fire(() => a.L().ss.spouseCurrentAge.set(spouseAge));
  a.fire(() => a.L().profile.spouseIncome.set(80_000));
};
// A $100k working-year conversion event (in-service conversions on), the review's L2 household.
const EVENT = (a) => {
  a.fire(() => a.L().accounts.trad401k.bal.set(500_000));
  a.fire(() => a.L().conversionView.events.inServiceField.set(true));
  a.fire(() => a.L().conversionView.events.add());
  a.fire(() => a.L().conversionView.events.rows[0].amountField.set(100_000));
};
const set = (a, path, v) => a.fire(() => path.split(".").reduce((o, k) => o[k], a.L()).set(v));

// The scripted user moves. Every entry drives ONLY the public setter bundles / commitPlan,
// exactly as the Horizon screens do.
const SEQS = {
  "currentAge 30 -> 72": (a) => set(a, "assumptions.currentAge", 72),
  "currentAge 30 -> 72 -> 25 (up then down)": (a) => { set(a, "assumptions.currentAge", 72); set(a, "assumptions.currentAge", 25); },
  "lifeExpect -> 70": (a) => set(a, "assumptions.lifeExpect", 70),
  "retirementAge -> 40": (a) => set(a, "assumptions.retirementAge", 40),
  "retirementAge -> 75 -> 45 (up then down)": (a) => { set(a, "assumptions.retirementAge", 75); set(a, "assumptions.retirementAge", 45); },
  "plateau 45, then currentAge 50": (a) => { set(a, "profile.incomeGrowthEndAge", 45); set(a, "assumptions.currentAge", 50); },
  "plateau 60, then retirementAge 50": (a) => { set(a, "profile.incomeGrowthEndAge", 60); set(a, "assumptions.retirementAge", 50); },
  // BUG-170: the stored plateau/spouse age is kept (not overwritten) and clamped on READ, so the
  // bundle values stay in range mid-state and the user's own value comes back afterwards.
  "plateau 55, retirementAge 65 -> 50 -> 65": (a) => { set(a, "profile.incomeGrowthEndAge", 55); set(a, "assumptions.retirementAge", 50); set(a, "assumptions.retirementAge", 65); },
  "married; spouse retire 85; lifeExpect 90 -> 80 -> 95": (a) => { MARRY(a); set(a, "spouseAccounts.spouseRetirementAge", 85); set(a, "assumptions.lifeExpect", 80); set(a, "assumptions.lifeExpect", 95); },
  "plateau 50, then currentAge 40 then retirementAge 48": (a) => { set(a, "profile.incomeGrowthEndAge", 50); set(a, "assumptions.currentAge", 40); set(a, "assumptions.retirementAge", 48); },
  "onboarding commitPlan(currentAge 72, retire 75)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 72, currentIncome: 100_000, retirementAge: 75, monthlySpend: 5_000 })),
  "onboarding commitPlan(currentAge 60, retire 62)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 60, currentIncome: 100_000, retirementAge: 62, monthlySpend: 5_000 })),
  "onboarding commitPlan(currentAge 72, retire 75, totalSaved 900k)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 72, currentIncome: 100_000, retirementAge: 75, monthlySpend: 5_000, totalSaved: 900_000 })),
  "onboarding commitPlan(currentAge 45, retire 55, totalSaved 0)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 45, currentIncome: 80_000, retirementAge: 55, monthlySpend: 4_000, totalSaved: 0 })),
  "onboarding commitPlan(age 50, retire 52, totalSaved 2.5M)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 50, currentIncome: 250_000, retirementAge: 52, monthlySpend: 9_000, totalSaved: 2_500_000 })),
  // BUG-169 (review R-3): the wizard clamps each answer independently, so these reach commitPlan.
  "onboarding commitPlan(currentAge 70, retire 60)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 70, currentIncome: 100_000, retirementAge: 60, monthlySpend: 5_000 })),
  "onboarding commitPlan(currentAge 34, retire 90)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 34, currentIncome: 100_000, retirementAge: 90, monthlySpend: 5_000 })),
  "married; spouse retire 70 explicit; primary retire 45": (a) => { MARRY(a); set(a, "spouseAccounts.spouseRetirementAge", 70); set(a, "assumptions.retirementAge", 45); },
  "married; spouse 60; spouse retire 66; spouse age -> 75": (a) => { MARRY(a); set(a, "ss.spouseCurrentAge", 60); set(a, "spouseAccounts.spouseRetirementAge", 66); set(a, "ss.spouseCurrentAge", 75); },
  "married; spouse retire 66; spouse age -> 30 -> 80": (a) => { MARRY(a, 50); set(a, "spouseAccounts.spouseRetirementAge", 66); set(a, "ss.spouseCurrentAge", 30); set(a, "ss.spouseCurrentAge", 80); },
  "married; primary currentAge 72 (spouse retirement follows)": (a) => { MARRY(a, 60); set(a, "assumptions.currentAge", 72); },
  "pension start 55, then currentAge 70": (a) => { set(a, "pension.pensionMonthly", 2000); set(a, "pension.pensionStartAge", 55); set(a, "assumptions.currentAge", 70); },
  "pension start 70, then retirementAge 50": (a) => { set(a, "pension.pensionMonthly", 2000); set(a, "pension.pensionStartAge", 70); set(a, "assumptions.retirementAge", 50); },
  "ssOverride high, then ssClaimingAge 70": (a) => { set(a, "ss.ssOverride", 50_000); set(a, "ss.ssClaimingAge", 70); },
  "ssClaimingAge 62 then currentAge 66": (a) => { set(a, "ss.ssClaimingAge", 62); set(a, "assumptions.currentAge", 66); },
  "HSA family 8000, then self-only (single)": (a) => { set(a, "spouseAccounts.hsaCoverageType", "family"); set(a, "accounts.hsa.contrib", 8_000); set(a, "spouseAccounts.hsaCoverageType", "self"); },
  "HSA family 8000, then self-only (married)": (a) => { MARRY(a); set(a, "spouseAccounts.hsaCoverageType", "family"); set(a, "accounts.hsa.contrib", 8_000); set(a, "spouseAccounts.hsaCoverageType", "self"); },
  "HSA family: spouse 8000 then primary 6000 (spouse share shrinks)": (a) => { MARRY(a); set(a, "spouseAccounts.hsaCoverageType", "family"); set(a, "spouseAccounts.hsa.contrib", 8_000); set(a, "accounts.hsa.contrib", 6_000); },
  "work state -> CA then retirement state -> NY then work state -> TX": (a) => { set(a, "profile.selectedState", "CA"); set(a, "assumptions.retirementState", "NY"); set(a, "profile.selectedState", "TX"); },
  "retirement state -> CA": (a) => set(a, "assumptions.retirementState", "CA"),
  // R-13 / BUG-175: the working-year conversion events + window fields (conversionView.*) are
  // enumerated now. An event past the (moved) retirement age is flagged, not silently stale.
  "in-service conversion event $100k, retirementAge 65 -> 40": (a) => { EVENT(a); set(a, "assumptions.retirementAge", 40); },
  "in-service conversion event $100k, currentAge -> 60, retirementAge -> 62": (a) => { EVENT(a); set(a, "assumptions.currentAge", 60); set(a, "assumptions.retirementAge", 62); },
  // BUG-185 (review 2 S-9): a $0 event added and then stranded past retirement must also be flagged.
  "in-service conversion event $0 (amount never set), retirementAge 65 -> 40": (a) => { a.fire(() => a.L().conversionView.events.inServiceField.set(true)); a.fire(() => a.L().conversionView.events.add()); set(a, "assumptions.retirementAge", 40); },
  "conversion window start 70 then retirementAge 50": (a) => { set(a, "conversion.conversionMode", "custom"); a.fire(() => a.L().conversionView.window.startAgeField.set(70)); set(a, "assumptions.retirementAge", 50); },
  "income 400k, livingExpenses 300k, then income 40k": (a) => { set(a, "profile.currentIncome", 400_000); set(a, "spending.livingExpenses", 300_000); set(a, "profile.currentIncome", 40_000); },
};

// The ONLY exemption: the audit found `livingExpenses` above its dynamic max after an income
// drop, and the owner ACCEPTED that (it is the user's own number; nothing re-clamps it).
// Matched on BOTH the sequence and the field, so nothing broader slips through.
const EXEMPT = {
  "income 400k, livingExpenses 300k, then income 40k": {
    path: "spending.livingExpenses",
    reason: "owner-accepted 2026-11-14: the user's own living-expense figure is left alone when income later drops",
  },
};

describe("bounds invariant: after user moves every numeric field is within [min, max]", () => {
  it("the dynamic enumeration sees the bundle surface (guards the guard)", () => {
    const a = mount();
    const numeric = fieldsOf(a.L()).filter(x => typeof x.field.value === "number");
    a.unmount();
    expect(numeric.length).toBeGreaterThan(30);
  });

  it("the walk reaches fields OUTSIDE the nine named bundles (R-13)", () => {
    const a = mount(); EVENT(a);
    const paths = fieldsOf(a.L()).map(x => x.path);
    a.unmount();
    for (const must of [
      "conversionView.window.startAgeField", "conversionView.window.endAgeField",
      "conversionView.events.inServiceField",
      "conversionView.events.rows.0.ageField", "conversionView.events.rows.0.amountField",
    ]) expect(paths, `walker missed ${must}`).toContain(must);
  });

  it("BUG-175: an event the model drops after retirement moves is FLAGGED, which is what exempts its out-of-range age field", () => {
    const a = mount(); EVENT(a);
    const before = a.L().conversionView.events.rows[0];
    expect(before.notModelled).toBeFalsy();
    set(a, "assumptions.retirementAge", 40);
    const row = a.L().conversionView.events.rows[0];
    const ageField = row.ageField;
    a.unmount();
    expect(ageField.value, "fixture precondition: the stale age is out of its own range").toBeGreaterThan(ageField.max);
    expect(row.notModelled).toBe(true);
    expect(row.estTaxLabel).toBeTruthy();
  });

  it("BUG-185: a $0 event past retirement is flagged too (the flag is age-only, not amount-gated)", () => {
    const a = mount();
    a.fire(() => a.L().conversionView.events.inServiceField.set(true));
    a.fire(() => a.L().conversionView.events.add());
    expect(a.L().conversionView.events.rows[0].amountField.value).toBe(0);
    set(a, "assumptions.retirementAge", 40);
    const row = a.L().conversionView.events.rows[0];
    a.unmount();
    expect(row.ageField.value).toBeGreaterThan(row.ageField.max);
    expect(row.notModelled, "pre-fix: false (the amount > 0 gate)").toBe(true);
    expect(row.estTaxLabel).toBeTruthy();
  });

  it("the conversion-window fields are only exempt while the model says there is NO window (hasConvWindow false)", () => {
    const a = mount();
    expect(a.L().conversionView.window.hasConvWindow).toBe(true);     // default: window exists, fields in range
    set(a, "assumptions.retirementAge", 75);                          // past RMD_START_AGE-1: designed empty state
    const w = a.L().conversionView.window;
    a.unmount();
    expect(w.hasConvWindow).toBe(false);
    expect(w.startAgeField.min).toBeGreaterThan(w.startAgeField.max);  // the out-of-range state the exemption covers
  });

  it("min <= max holds for every field at the default, single and married", () => {
    for (const setup of [null, MARRY]) {
      const a = mount(); setup?.(a);
      expect(violations(a).map(v => v.msg)).toEqual([]);
      a.unmount();
    }
  });

  describe.each(Object.keys(SEQS))("%s", (label) => {
    it("leaves no field out of range", () => {
      const a = mount();
      SEQS[label](a);
      const ex = EXEMPT[label];
      const bad = violations(a).filter(v => !(ex && v.path === ex.path));
      a.unmount();
      expect(bad.map(v => v.msg)).toEqual([]);
    });
  });

  it("the livingExpenses exemption is still needed (remove it once the app re-clamps that field)", () => {
    const label = "income 400k, livingExpenses 300k, then income 40k";
    const a = mount();
    SEQS[label](a);
    const hits = violations(a).filter(v => v.path === EXEMPT[label].path);
    a.unmount();
    expect(hits.length, "no longer out of range: delete the EXEMPT entry").toBe(1);
  });
});
