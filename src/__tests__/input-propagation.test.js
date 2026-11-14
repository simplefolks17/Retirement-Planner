import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { calcMilestones } from "../model/accumulation.js";

// ── Input-propagation guard (oversight audit 2026-11-14, Part 3 fix 1) ─────────────────
//
// WHY THIS FILE EXISTS. "Retirement state never follows the work state" (BUG-151) survived
// 1,408 tests, four golden masters and many adversarial reviews because every safety net
// checked WHAT IS THERE (does this line compute right; does this control reach the engine)
// and none checked WHAT SHOULD MOVE TOGETHER. The audit's sweep probe mounted the real App,
// set each of the 63 user inputs through the same setter bundles the Horizon screens use, and
// recorded which headline numbers moved. It found a dead control shown in both UIs
// (livingExpenseGrowth, BUG-160), an onboarding answer that went nowhere (BUG-152), a Roth
// phase-out that silently cut contributions at 53 (BUG-159) and more. This file is that probe,
// made permanent and strict:
//
//   * The field list is read DYNAMICALLY from the mounted App's setter bundles, so a field
//     added tomorrow is picked up with no edit here.
//   * Every field must move at least one number in a headline signature when set through the
//     REAL App, in at least one household where it applies (single default, married MFJ, or a
//     targeted setup in TARGETED below).
//   * A field that legitimately moves no headline number goes on ALLOW with a written reason,
//     and for every "it only feeds X" reason the test asserts that X itself moves — so the
//     allow-list can never hide a dead control.
//   * A field on NEITHER list fails with a message saying what to do. A field on ALLOW that
//     DOES move something fails too (stale entry), so the list cannot rot.
//
// `livingExpenseGrowth` was removed in L1-B (BUG-160); if it (or anything like it) comes back
// without a consumer, this file fails it.

const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";

// NOTE: `captured` is shared by every mount, so two live apps would read the SAME props.
// Always snapshot what you need and unmount before mounting again.
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

// Every field object in the setter bundles: { path, field }.
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
const get = (p, path) => path.split(".").reduce((o, k) => o?.[k], p);

// Headline signature: every top-level finite number, plus the numeric members of the view
// objects the screens read.
function sig(p) {
  const s = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === "number" && Number.isFinite(v)) s[k] = v;
  for (const k of ["ssView", "rmdView", "conversionView", "taxView", "planHighlights", "rangeView"]) {
    const o = p[k];
    if (o && typeof o === "object") for (const [kk, vv] of Object.entries(o)) if (typeof vv === "number" && Number.isFinite(vv)) s[`${k}.${kk}`] = vv;
  }
  return s;
}
const movedKeys = (a, b) => Object.keys(a).filter(k => b[k] !== undefined && Math.abs(a[k] - b[k]) > 1e-9);

// Deep flatten of the NON-bundle props (functions skipped) — used only to prove the "feeds X"
// claims on the allow-list, where X lives below the top-level signature.
function deepFlat(o, p, out, d = 0) {
  if (d > 6) return;
  if (typeof o === "number") { if (Number.isFinite(o)) out[p] = o; }
  else if (typeof o === "string" || typeof o === "boolean" || o === null) out[p] = o;
  else if (Array.isArray(o)) o.slice(0, 80).forEach((x, i) => deepFlat(x, `${p}[${i}]`, out, d + 1));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (typeof v !== "function") deepFlat(v, `${p}.${k}`, out, d + 1);
}
function deepSnapshot(l) {
  const out = {};
  for (const [k, v] of Object.entries(l)) { if (BUNDLES.includes(k)) continue; deepFlat(v, k, out); }
  return out;
}
const deepMoved = (a, b) => Object.keys(a).filter(k => a[k] !== b[k] && !(typeof a[k] === "number" && typeof b[k] === "number" && Math.abs(a[k] - b[k]) < 1e-9));

// Pick a value different from the current one that the field will accept.
function altValue(f, path) {
  const v = f.value;
  if (f.options) {
    const opts = f.options.map(o => (typeof o === "object" ? o.value : o));
    if (path.endsWith("selectedState") || path.endsWith("retirementState")) return "CA";
    return opts.find(o => o !== v);
  }
  if (typeof v === "boolean") return !v;
  const min = Number.isFinite(f.min) ? f.min : 0;
  const max = Number.isFinite(f.max) ? f.max : (v ?? min) * 2 + 100_000;
  const step = f.step || 1;
  if (v === null || v === undefined) return Math.round((min + max) / 2 / step) * step;
  let n = v + 4 * step;
  if (n > max) n = v - 4 * step;
  if (n < min) n = (min + max) / 2;
  return n;
}

// ── Households ──
const MARRY = (a, spouseAge = 32, spouseIncome = 80_000) => {
  a.fire(() => a.L().ss.isMarried.set(true));
  a.fire(() => a.L().profile.filingStatus.set("mfj"));
  a.fire(() => a.L().ss.spouseCurrentAge.set(spouseAge));
  a.fire(() => a.L().profile.spouseIncome.set(spouseIncome));
};
const set = (a, path, v) => a.fire(() => get(a.L(), path).set(v));

const GENERIC = [
  { name: "single default", setup: null },
  { name: "married MFJ (spouse 32 @ $80k)", setup: MARRY },
];

// Baseline signature per generic household (the model is deterministic — the probe found no
// noisy keys — so one baseline per household is enough).
const baseCache = new Map();
function baseFor(ctx) {
  if (!baseCache.has(ctx.name)) {
    const a = mount(); ctx.setup?.(a);
    baseCache.set(ctx.name, sig(a.L()));
    a.unmount();
  }
  return baseCache.get(ctx.name);
}

// Run one A/B case: A = setup; B = setup then change. Returns the signature keys that moved.
function runCase(setup, change, base) {
  let A = base;
  if (!A) { const a = mount(); setup?.(a); A = sig(a.L()); a.unmount(); }
  const b = mount(); setup?.(b); change(b);
  const B = sig(b.L());
  b.unmount();
  return movedKeys(A, B);
}

// ── Targeted setups: where a field that is inert at the generic households SHOULD matter ──
// Each entry: [label, setup, change(app)]. `change` sets the field to a value that differs from
// the setup's state. Keys are bundle paths.
const contribEndCase = (path) => [`${path} 65 -> 55 (stops contributing ten years before retiring)`, null, (a) => set(a, path, 55)];
const TARGETED = {
  "accounts.trad401k.contribEnd": [contribEndCase("accounts.trad401k.contribEnd")],
  "accounts.roth.contribEnd": [contribEndCase("accounts.roth.contribEnd")],
  "accounts.taxable.contribEnd": [contribEndCase("accounts.taxable.contribEnd")],
  "accounts.hsa.contribEnd": [contribEndCase("accounts.hsa.contribEnd")],
  // Flat 3% and formula 50% x 6% give the SAME match at the defaults, so a bare mode flip is a
  // numerical no-op; make the formula differ first.
  "accounts.matchMode": [["match mode flat -> formula (formula rate 100%, so it differs from flat 3%)",
    (a) => set(a, "accounts.matchFormulaRate", 100), (a) => set(a, "accounts.matchMode", "formula")]],
  "accounts.matchFormulaRate": [["formula rate 50 -> 70 (formula mode on)",
    (a) => set(a, "accounts.matchMode", "formula"), (a) => set(a, "accounts.matchFormulaRate", 70)]],
  "accounts.matchFormulaCap": [["formula cap 6 -> 8 (formula mode on)",
    (a) => set(a, "accounts.matchMode", "formula"), (a) => set(a, "accounts.matchFormulaCap", 8)]],
  "spouseAccounts.matchMode": [["spouse match mode flat -> formula (rate 100%)",
    (a) => { MARRY(a); set(a, "spouseAccounts.matchFormulaRate", 100); }, (a) => set(a, "spouseAccounts.matchMode", "formula")]],
  "spouseAccounts.matchFormulaRate": [["spouse formula rate 50 -> 70 (formula mode on, spouse contributes $10k so a formula match exists)",
    (a) => { MARRY(a); set(a, "spouseAccounts.trad401k.contrib", 10_000); set(a, "spouseAccounts.matchMode", "formula"); }, (a) => set(a, "spouseAccounts.matchFormulaRate", 70)]],
  "spouseAccounts.matchFormulaCap": [["spouse formula cap 6 -> 8 (formula mode on)",
    (a) => { MARRY(a); set(a, "spouseAccounts.trad401k.contrib", 10_000); set(a, "spouseAccounts.matchMode", "formula"); }, (a) => set(a, "spouseAccounts.matchFormulaCap", 8)]],
  // Coverage family -> self must clamp an over-the-self-limit HSA contribution (BUG-161).
  "spouseAccounts.hsaCoverageType": [["HSA coverage family -> self with $8,000 contributed",
    (a) => { set(a, "spouseAccounts.hsaCoverageType", "family"); set(a, "accounts.hsa.contrib", 8_000); },
    (a) => set(a, "spouseAccounts.hsaCoverageType", "self")]],
  "ss.spouseSsEstimate": [["spouse SS estimate $0 -> $24k", MARRY, (a) => set(a, "ss.spouseSsEstimate", 24_000)]],
  "ss.spouseClaimingAge": [["spouse claiming age 67 -> 62 (spouse SS $24k)",
    (a) => { MARRY(a); set(a, "ss.spouseSsEstimate", 24_000); }, (a) => set(a, "ss.spouseClaimingAge", 62)]],
  // Joint-life RMD table: spouse sole beneficiary AND more than 10 years younger.
  "ss.spouseIsSoleBenef": [["spouse sole beneficiary, spouse 18 (12-year gap), $1.5M pre-tax",
    (a) => { MARRY(a, 18); set(a, "accounts.trad401k.bal", 1_500_000); }, (a) => set(a, "ss.spouseIsSoleBenef", true)]],
  "pension.pensionStartAge": [["pension start 65 -> 69 ($2k/mo pension)",
    (a) => set(a, "pension.pensionMonthly", 2000), (a) => set(a, "pension.pensionStartAge", 69)]],
  // annualConversionAmt only applies in "custom" mode (bracket mode derives its own amount).
  "conversion.annualConversionAmt": [["custom conversion amount 20k -> 40k (custom mode)",
    (a) => set(a, "conversion.conversionMode", "custom"), (a) => set(a, "conversion.annualConversionAmt", 40_000)]],
};

// ── Allow-list: fields that legitimately move no HEADLINE number ──
// Each entry has a written reason and, where the reason is "it only feeds X", a `proof` that
// asserts X itself moves — so an allow-listed field cannot be a dead control in disguise.
function expectDeepMoves(setup, change, prefixes, label) {
  const a = mount(); setup?.(a); const A = deepSnapshot(a.L()); a.unmount();
  const b = mount(); setup?.(b); change(b); const B = deepSnapshot(b.L()); b.unmount();
  const hit = deepMoved(A, B).filter(k => prefixes.some(p => k.startsWith(p)));
  expect(hit.length, `${label}: expected something under ${prefixes.join(" / ")} to move`).toBeGreaterThan(0);
}
const ACA_SETUP = (a) => set(a, "assumptions.retirementAge", 55);
const ACA_ON = (a) => { ACA_SETUP(a); set(a, "health.hasMarketplaceInsurance", true); };

const ALLOW = {
  "spending.retirementTarget": {
    reason: "Portfolio target feeds the milestone cards only (calcMilestones, App.jsx ~667, rendered by Classic; Horizon shows the control but no Horizon prop reads it).",
    proof: () => {
      const a = mount();
      const { simData, currentAge, retirementAge } = a.L();
      a.unmount();
      const low = calcMilestones({ simData, currentAge, safeRetAge: retirementAge, retirementTarget: 100_000 });
      const high = calcMilestones({ simData, currentAge, safeRetAge: retirementAge, retirementTarget: 20_000_000 });
      expect(JSON.stringify(low)).not.toBe(JSON.stringify(high));
    },
  },
  "conversion.conversionTaxSource": {
    reason: "BUG-37 (accepted, owner-deferred): who pays the conversion tax never reaches the headline walk. It does change the conversion table's Roth balances.",
    proof: () => expectDeepMoves(
      (a) => { set(a, "conversion.conversionMode", "custom"); set(a, "conversion.annualConversionAmt", 50_000); },
      (a) => set(a, "conversion.conversionTaxSource", "taxable"),
      ["conversionView.tables.simYears"], "conversionTaxSource"),
  },
  "assumptions.savingsSurplusPct": {
    reason: "Share of leftover income to invest feeds only the suggested 'optimized' allocation scenario (budget.optimizedAllocation / surplusView), never the committed plan.",
    proof: () => expectDeepMoves(
      (a) => set(a, "spending.livingExpenses", 50_000),
      (a) => set(a, "assumptions.savingsSurplusPct", 90),
      ["budget.optimized", "surplusView."], "savingsSurplusPct"),
  },
  "health.hasMarketplaceInsurance": {
    reason: "Health inputs drive the conversion screen's ACA-cliff / IRMAA warnings and the adjusted-benefit strip, not retirement spending (BUG-149 tracks their basis).",
    proof: () => expectDeepMoves(ACA_SETUP, (a) => set(a, "health.hasMarketplaceInsurance", true), ["conversionView.healthcare."], "hasMarketplaceInsurance"),
  },
  "health.marketplaceMonthlyPremium": {
    reason: "Conversion-screen ACA warning only (see hasMarketplaceInsurance).",
    proof: () => expectDeepMoves(ACA_ON, (a) => set(a, "health.marketplaceMonthlyPremium", 2000), ["conversionView.healthcare.", "taxView.conversionDetail."], "marketplaceMonthlyPremium"),
  },
  "health.householdSize": {
    reason: "Sets the ACA subsidy-cliff income threshold shown on the conversion screen only.",
    proof: () => expectDeepMoves(ACA_ON, (a) => set(a, "health.householdSize", 5), ["conversionView.healthcare."], "householdSize"),
  },
  "health.hasMedicare": {
    reason: "Conversion-screen IRMAA warning only.",
    proof: () => expectDeepMoves(
      (a) => { set(a, "accounts.trad401k.bal", 2_000_000); set(a, "conversion.conversionBracketTarget", 32); },
      (a) => set(a, "health.hasMedicare", true),
      ["conversionView.healthcare.", "taxView.conversionDetail."], "hasMedicare"),
  },
  "health.personOnMedicare": {
    reason: "Scales the conversion-screen IRMAA surcharge only.",
    proof: () => expectDeepMoves(
      (a) => { MARRY(a, 60); set(a, "health.hasMedicare", true); },
      (a) => set(a, "health.personOnMedicare", 2),
      ["conversionView.healthcare.", "taxView.conversionDetail."], "personOnMedicare"),
  },
};

// ── The guard ──
const FIELD_PATHS = (() => {
  const seen = new Set();
  for (const ctx of GENERIC) {
    const a = mount(); ctx.setup?.(a);
    for (const { path } of fieldsOf(a.L())) seen.add(path);
    a.unmount();
  }
  return [...seen];
})();

describe("input propagation: every bundle field reaches the model", () => {
  it("the dynamic enumeration sees the whole bundle surface (guards the guard)", () => {
    // If a refactor changed the bundle shape so enumeration silently found nothing, every
    // per-field test below would vanish and this file would pass vacuously.
    expect(FIELD_PATHS.length).toBeGreaterThan(55);
    for (const must of ["profile.selectedState", "assumptions.retirementState", "accounts.addlPreTaxBal", "ss.spouseIsSoleBenef", "pension.pensionStartAge"]) {
      expect(FIELD_PATHS).toContain(must);
    }
  });

  it("the harness really detects a dead field (a no-op change moves nothing)", () => {
    expect(runCase(null, () => {}, baseFor(GENERIC[0]))).toEqual([]);
  });

  it("every ALLOW / TARGETED entry names a field that still exists (no stale entries)", () => {
    for (const p of [...Object.keys(ALLOW), ...Object.keys(TARGETED)]) expect(FIELD_PATHS, `stale entry ${p}`).toContain(p);
  });

  describe.each(FIELD_PATHS)("%s", (path) => {
    it("moves at least one headline output (or is allow-listed with a proof)", () => {
      const tried = [];
      let movedIn = null;

      // 1) generic households
      for (const ctx of GENERIC) {
        const probe = mount(); ctx.setup?.(probe);
        const f = get(probe.L(), path);
        const alt = f ? altValue(f, path) : undefined;
        probe.unmount();
        if (!f) { tried.push(`${ctx.name}: field absent`); continue; }
        const moved = runCase(ctx.setup, (a) => set(a, path, alt), baseFor(ctx));
        tried.push(`${ctx.name}: moved ${moved.length}`);
        if (moved.length) { movedIn = ctx.name; break; }
      }
      // 2) targeted setups
      if (!movedIn) {
        for (const [label, setup, change] of TARGETED[path] ?? []) {
          const moved = runCase(setup, change, null);
          tried.push(`targeted "${label}": moved ${moved.length}`);
          if (moved.length) { movedIn = label; break; }
        }
      }

      if (movedIn) {
        expect(ALLOW[path], `${path} is on the allow-list but DOES move a headline output (${movedIn}); remove the stale ALLOW entry`).toBeUndefined();
        return;
      }
      if (ALLOW[path]) {
        expect(ALLOW[path].reason.length).toBeGreaterThan(20);
        return; // its proof runs in the allow-list block below
      }
      throw new Error(
        `Input "${path}" moved no headline output in any household tried [${tried.join(" | ")}].\n` +
        `Either it is a DEAD CONTROL (wire it to the model, or remove it as BUG-160 did for livingExpenseGrowth),\n` +
        `or it only matters in a setup this test does not know about (add a TARGETED entry),\n` +
        `or it legitimately feeds something other than the headline (add an ALLOW entry with a reason and a proof that its real consumer moves).`);
    });
  });

  describe("allow-list proofs: 'it only feeds X' means X really moves", () => {
    for (const [path, entry] of Object.entries(ALLOW)) {
      it(`${path}: ${entry.reason.slice(0, 70)}…`, () => { entry.proof(); });
    }
  });
});
