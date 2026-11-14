import { describe, it, expect, vi } from "vitest";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { act, create } from "react-test-renderer";
import { allFields } from "./helpers/horizon-fields.js";

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
//   * The field list is read DYNAMICALLY by walking EVERY `{ value, set }` object reachable in the
//     mounted App's horizonProps (helpers/horizon-fields.js, R-13), not a list of bundles, so a
//     field added tomorrow ANYWHERE (incl. conversionView.window / .events.rows) is picked up.
//   * Every field must move at least one number in a headline signature when set through the
//     REAL App, in at least one household where it applies (single default, married MFJ, or a
//     targeted setup in TARGETED below).
//   * A field that legitimately moves no headline number goes on ALLOW with a written reason,
//     and for every "it only feeds X" reason the test asserts that X itself moves — so the
//     allow-list can never hide a dead control. (One entry, conversionTaxSource, is a KNOWN dead
//     control, BUG-37: its proof asserts that nothing RENDERED moves, so it cannot claim a visible consumer.)
//   * A field on NEITHER list fails with a message saying what to do. A field on ALLOW that
//     DOES move something fails too (stale entry), so the list cannot rot.
//
// `livingExpenseGrowth` was removed in L1-B (BUG-160); if it (or anything like it) comes back
// without a consumer, this file fails it.

const captured = [];
// Classic is mounted by the retirementTarget proof below; its charts need real DOM measurement.
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("recharts", async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, ResponsiveContainer: () => null };
});
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

// The bundles whose fields get a dedicated deep-snapshot exclusion below (the proofs read the
// NON-input props). Enumeration itself no longer uses this list: it walks EVERY `{ value, set }`
// field reachable in horizonProps (R-13), so `conversionView.window.*Field` and
// `conversionView.events.*` are covered like any bundle field.
const BUNDLES = ["profile", "spending", "accounts", "spouseAccounts", "ss", "pension", "conversion", "health", "assumptions"];

// Every field object reachable in the props: { path, field }.
const fieldsOf = (p) => allFields(p);
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
// A household with one working-year conversion event: only then do the per-event row fields
// (conversionView.events.rows.N.*) exist, so enumeration must also look here.
const WITH_EVENT = (a) => {
  set(a, "accounts.trad401k.bal", 500_000);
  a.fire(() => a.L().conversionView.events.inServiceField.set(true));
  a.fire(() => a.L().conversionView.events.add());
  a.fire(() => a.L().conversionView.events.rows[0].amountField.set(100_000));
};
const ENUMERATION_CONTEXTS = [...GENERIC, { name: "one working-year conversion event", setup: WITH_EVENT }];

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
  // Working-year conversion events (R-13: these live under conversionView, not a setter bundle).
  // Each needs an event to exist first (WITH_EVENT: in-service on, one $100k event at the default age).
  "conversionView.events.inServiceField": [["in-service conversions on -> off with a $100k event present (the event stops being modelled)",
    WITH_EVENT, (a) => a.fire(() => a.L().conversionView.events.inServiceField.set(false))]],
  "conversionView.events.rows.0.ageField": [["event age 48 -> 55",
    WITH_EVENT, (a) => a.fire(() => a.L().conversionView.events.rows[0].ageField.set(55))]],
  "conversionView.events.rows.0.amountField": [["event amount $100k -> $200k",
    WITH_EVENT, (a) => a.fire(() => a.L().conversionView.events.rows[0].amountField.set(200_000))]],
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
    classicOnly: true,
    reason: "Classic-only; not rendered in Horizon. Portfolio target feeds the milestone cards only (calcMilestones, App.jsx ~667, rendered by Classic). Horizon's milestones (calcChartMilestones) take no target (BUG-165).",
    // R-6: this proof used to call calcMilestones itself, which proves the MODEL reads the
    // argument, not that App passes the user's input (mutating App's call site to a constant
    // failed 0 tests). It now mounts the real App, sets the target through the real bundle, flips
    // to Classic and reads the milestone cards App actually renders.
    proof: () => {
      const classicMilestoneAges = (target) => {
        const hadWindow = typeof globalThis.window !== "undefined";
        const hadRO = typeof globalThis.ResizeObserver !== "undefined";
        if (!hadWindow) globalThis.window = { innerWidth: 1200, addEventListener: () => {}, removeEventListener: () => {} };
        if (!hadRO) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        captured.length = 0;
        let r;
        act(() => { r = create(React.createElement(App)); });
        try {
          const L = () => captured[captured.length - 1];
          act(() => L().spending.retirementTarget.set(target));
          act(() => L().onShowClassic());
          const text = (n) => (typeof n === "string" ? n : (n.children ?? []).map(text).join(""));
          return r.root.findAll(n => n.type === "p" && /^Age \d+( ★)?$/.test(text(n)))
            .map(n => text(n));
        } finally {
          act(() => r.unmount());
          if (!hadWindow) delete globalThis.window;
          if (!hadRO) delete globalThis.ResizeObserver;
        }
      };
      const low = classicMilestoneAges(100_000);
      const high = classicMilestoneAges(20_000_000);
      expect(low.length, "Classic milestone cards not found").toBeGreaterThan(0);
      // A tiny target is crossed at the first card (list truncated there); a huge one is never
      // crossed, so every 5-year card plus the retirement card is rendered.
      expect(low.length).toBeLessThan(high.length);
    },
  },
  "conversion.conversionTaxSource": {
    // R-6 (zz-rev-k): the old proof certified `simYears[].rothBal`, a column NO screen renders
    // (Horizon's table is {age, conversion, tradBal, tax}; Classic's the same; the comparison
    // tiles show both options regardless). So this control changes no number a user can see.
    // That is a KNOWN dead control, accepted and owner-deferred as BUG-37, not a verified
    // consumer. The proof below states exactly that: the ONLY thing that moves is the
    // non-rendered rothBal column. Wiring BUG-37 (a rendered consumer) makes this fail, which
    // is the cue to delete the entry.
    knownDead: "BUG-37",
    reason: "BUG-37 (accepted, owner-deferred): who pays the conversion tax changes NO rendered number on either screen. It only alters conversionView.tables.simYears[].rothBal, which no UI renders. Known dead control, not a verified consumer.",
    proof: () => {
      const setup = (a) => { set(a, "conversion.conversionMode", "custom"); set(a, "conversion.annualConversionAmt", 50_000); };
      const a = mount(); setup(a); const A = deepSnapshot(a.L()); a.unmount();
      const b = mount(); setup(b); set(b, "conversion.conversionTaxSource", "taxable"); const B = deepSnapshot(b.L()); b.unmount();
      const moved = deepMoved(A, B);
      expect(moved.length, "conversionTaxSource should still alter the internal simYears rothBal").toBeGreaterThan(0);
      const rendered = moved.filter(k => !/^conversionView\.tables\.simYears\[\d+\]\.rothBal$/.test(k));
      expect(rendered, "conversionTaxSource now moves something besides the unrendered rothBal column: BUG-37 may be wired, remove the knownDead ALLOW entry (" + rendered.slice(0, 5).join(", ") + ")").toEqual([]);
    },
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
  for (const ctx of ENUMERATION_CONTEXTS) {
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

  it("R-13: the walk reaches fields OUTSIDE the nine named bundles (conversionView.window / .events)", () => {
    for (const must of [
      "conversionView.window.startAgeField", "conversionView.window.endAgeField",
      "conversionView.events.inServiceField",
      "conversionView.events.rows.0.ageField", "conversionView.events.rows.0.amountField",
    ]) expect(FIELD_PATHS, `walker missed ${must}`).toContain(must);
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

  describe("BUG-165 guard: Horizon never renders a Classic-only field", () => {
    it("no src/horizon/**/*.jsx source references a field the allow-list marks classicOnly", () => {
      const classicOnly = Object.entries(ALLOW).filter(([, e]) => e.classicOnly).map(([p]) => p);
      expect(classicOnly.length).toBeGreaterThan(0);
      const root = path.resolve(__dirname, "../horizon");
      const files = [];
      const walkDir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") walkDir(full); }
        else if (/\.jsx?$/.test(e.name)) files.push(full);
      } };
      walkDir(root);
      expect(files.length).toBeGreaterThan(5);
      const offenders = [];
      for (const f of files) {
        // strip comments so prose mentioning a field does not trip the guard
        const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        for (const p of classicOnly) {
          // match the leaf name as a whole word: catches `spending.x`, `spending?.x`,
          // destructuring `{ x } = spending`, and `["x"]` lookups alike.
          const leaf = p.split(".").pop();
          if (new RegExp(`\\b${leaf}\\b`).test(src)) offenders.push(`${path.relative(root, f)} -> ${p}`);
        }
      }
      expect(offenders, "Horizon renders a Classic-only bundle field (a dead control there, BUG-165): " + offenders.join("; ")).toEqual([]);
    });
  });

  describe("allow-list proofs: 'it only feeds X' means X really moves", () => {
    for (const [path, entry] of Object.entries(ALLOW)) {
      it(`${path}: ${entry.reason.slice(0, 70)}…`, () => { entry.proof(); });
    }
  });
});
