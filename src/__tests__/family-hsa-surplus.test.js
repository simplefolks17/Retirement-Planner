import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// BUG-182 (Opus review 2, S-4): family HSA coverage must reach the surplus optimizer, the HSA
// action card, the Classic slider max, and the surplus Apply preview (incl. the spouse squeeze).
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
import { generatePhaseActions } from "../model/action-cards.js";
import { calcWhatIfDelta } from "../model/what-if.js";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { innerWidth: 1200, addEventListener: () => {}, removeEventListener: () => {} };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => { delete globalThis.window; delete globalThis.ResizeObserver; });

const L = () => captured[captured.length - 1];
const f = (fn) => act(() => fn());
const textOf = (n) => (n.children ?? []).map(c => typeof c === "string" ? c : textOf(c)).join("");
function setup(spouseHsa) {
  captured.length = 0;
  let r; act(() => { r = create(React.createElement(App)); });
  f(() => L().profile.filingStatus.set("mfj"));
  f(() => L().ss.isMarried.set(true));
  f(() => L().ss.spouseCurrentAge.set(30));
  f(() => L().profile.spouseIncome.set(80_000));
  f(() => L().spouseAccounts.hsaCoverageType.set("family"));
  f(() => L().spending.livingExpenses.set(40_000));
  f(() => L().spending.annualExpenses.set(150_000));
  f(() => L().accounts.hsa.contrib.set(3_850));
  f(() => L().spouseAccounts.hsa.contrib.set(spouseHsa));
  return r;
}

describe("BUG-182 family HSA reaches the surplus lever", () => {
  it("spouse HSA 0: the optimizer fills the household's 4,900 of room (was +550), Apply lands 8,750", () => {
    const r = setup(0);
    const site = L().surplusView.applyAllocation;
    expect(site.available).toBe(true);
    const tot = site.preview.metrics.find(m => m.id === "totalAtRet").after;
    f(() => site.apply());
    expect(L().accounts.hsa.contrib.value).toBe(8_750);
    expect(tot).toBe(fmt(L().totalAtRet));   // scenario resims must use the family cap too
    act(() => r.unmount());
  });
  it("Classic HSA slider max is the family ceiling, not the self-only cap", () => {
    const r = setup(0);
    f(() => L().onShowClassic());
    expect(textOf(r.root)).toContain("max $8,750/yr");
    act(() => r.unmount());
  });
  it("spouse already uses 4,900: no room left, the optimizer does not squeeze the spouse; preview == applied", () => {
    const r = setup(4_900);
    const site = L().surplusView.applyAllocation;
    const tot = site.preview.metrics.find(m => m.id === "totalAtRet").after;
    f(() => site.apply());
    expect(L().accounts.hsa.contrib.value).toBe(3_850);
    expect(L().spouseAccounts.hsa.contrib.value).toBe(4_900);
    expect(tot).toBe(fmt(L().totalAtRet));
    act(() => r.unmount());
  });
  it("a previewed HSA override re-caps the spouse like committing it does (the squeeze)", () => {
    const r = setup(4_900);
    const p = L();
    const preview = calcWhatIfDelta({ ...p.whatIfSimInputs, contribOverrides: { contribHSA: 6_000 } }).scenarioTotalAtRet;
    f(() => p.accounts.hsa.contrib.set(6_000));
    expect(L().spouseAccounts.hsa.contrib.value).toBe(2_750);   // fixture precondition: squeezed
    expect(preview).toBe(L().totalAtRet);
    act(() => r.unmount());
  });
  it("the HSA action card counts the family room (unit: hsaLimit reaches the card)", () => {
    const base = {
      totalAtRet: 1e6, netPortfolioNeed: 4e4, withdrawalRate: 4, yearsSustained: 30, isSustainable: true,
      safeRetAge: 65, safeLifeExp: 90, currentAge: 34, effectivePension: 0, availableSurplus: 0,
      savingsSurplusPct: 0, effectiveLiving: 4e4, grossAfterTax: 1e5, currentContribTotal: 1e4,
      contrib401k: 5_000, contribHSA: 3_850, matchMode: "flat", employerMatchAmt: 0, currentIncome: 1e5,
      rothPhaseoutWarning: false, rothFullyPhased: false, filingStatus: "mfj", megaCapacity: 0,
      optimizedAllocation: { totalExtra: 0 }, optimized: {}, conversionSim: [], depletionAge: null,
      hasConvWindow: false, includeSS: true, ssClaimingAge: 67,
    };
    const body = (hsaLimit) => generatePhaseActions({ ...base, ...(hsaLimit ? { hsaLimit } : {}) })
      .phase1Actions.find(a => /HSA/.test(a.title)).body;
    expect(body(8_750)).toContain(`You have ${fmt(4_900)} of unused HSA space`);
    expect(body()).toContain(`You have ${fmt(550)} of unused HSA space`);   // self-only default unchanged
  });
});
