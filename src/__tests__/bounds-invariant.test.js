import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

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

const BUNDLES = ["profile", "spending", "accounts", "spouseAccounts", "ss", "pension", "conversion", "health", "assumptions"];
function fieldsOf(p) {
  const out = [];
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (v && typeof v === "object" && typeof v.set === "function" && "value" in v) out.push({ path: `${path}.${k}`, field: v });
      else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${path}.${k}`);
    }
  };
  for (const b of BUNDLES) walk(p[b], b);
  return out;
}

// Returns a list of violations (empty = all fields in range).
function violations(app) {
  const bad = [];
  for (const { path, field } of fieldsOf(app.L())) {
    const v = field.value;
    if (typeof v !== "number") continue;
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
  "plateau 50, then currentAge 40 then retirementAge 48": (a) => { set(a, "profile.incomeGrowthEndAge", 50); set(a, "assumptions.currentAge", 40); set(a, "assumptions.retirementAge", 48); },
  "onboarding commitPlan(currentAge 72, retire 75)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 72, currentIncome: 100_000, retirementAge: 75, monthlySpend: 5_000 })),
  "onboarding commitPlan(currentAge 60, retire 62)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 60, currentIncome: 100_000, retirementAge: 62, monthlySpend: 5_000 })),
  "onboarding commitPlan(currentAge 72, retire 75, totalSaved 900k)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 72, currentIncome: 100_000, retirementAge: 75, monthlySpend: 5_000, totalSaved: 900_000 })),
  "onboarding commitPlan(currentAge 45, retire 55, totalSaved 0)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 45, currentIncome: 80_000, retirementAge: 55, monthlySpend: 4_000, totalSaved: 0 })),
  "onboarding commitPlan(age 50, retire 52, totalSaved 2.5M)": (a) => a.fire(() => a.L().commitPlan({ currentAge: 50, currentIncome: 250_000, retirementAge: 52, monthlySpend: 9_000, totalSaved: 2_500_000 })),
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
  "work state -> CA then retirement state -> NY then work state -> TX": (a) => { set(a, "profile.selectedState", "CA"); set(a, "assumptions.retirementState", "NY"); set(a, "profile.selectedState", "TX"); },
  "retirement state -> CA": (a) => set(a, "assumptions.retirementState", "CA"),
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
