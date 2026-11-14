import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { HSA_LIMIT_2026, HSA_FAMILY_LIMIT_2026 } from "../config/irs-2026.js";

// L1-B (BUG-152, 153, 160, 161): onboarding's commitPlan and the coupled setters,
// driven through the REAL App (App.jsx glue is what model-only tests cannot see).

const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";

function mount() {
  captured.length = 0;
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  return {
    latest: () => captured[captured.length - 1],
    fire: (fn) => act(() => fn()),
    unmount: () => act(() => renderer.unmount()),
  };
}

// Every {value,min,max} leaf in every bundle must sit inside its own range.
function outOfRange(props) {
  const bad = [];
  const walk = (node, path) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (typeof node.value === "number" && typeof node.set === "function") {
      if (typeof node.min === "number" && node.value < node.min) bad.push(`${path}=${node.value} < min ${node.min}`);
      if (typeof node.max === "number" && node.value > node.max) bad.push(`${path}=${node.value} > max ${node.max}`);
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  for (const key of ["profile", "spending", "accounts", "spouseAccounts", "ss", "pension",
                     "conversion", "health", "assumptions"]) walk(props[key], key);
  return bad;
}

describe("BUG-152: onboarding's total-saved answer reaches the model", () => {
  it("scales the primary's balances proportionally to the answered household total", () => {
    const app = mount();
    expect(app.latest().currentTotalSaved).toBe(165_000);
    const a = app.latest().accounts;
    const mix = [a.trad401k.bal.value, a.roth.bal.value, a.taxable.bal.value, a.hsa.bal.value];
    app.fire(() => app.latest().commitPlan({ totalSaved: 900_000 }));
    expect(app.latest().currentTotalSaved).toBe(900_000);
    const b = app.latest().accounts;
    const after = [b.trad401k.bal.value, b.roth.bal.value, b.taxable.bal.value, b.hsa.bal.value];
    after.forEach((v, i) => expect(Math.abs(v - mix[i] * 900_000 / 165_000)).toBeLessThanOrEqual(1));
    app.unmount();
  });

  it("an unchanged answer touches nothing (no rounding drift)", () => {
    const app = mount();
    const before = JSON.stringify(app.latest().accounts.trad401k.bal.value);
    app.fire(() => app.latest().commitPlan({ totalSaved: app.latest().currentTotalSaved }));
    expect(JSON.stringify(app.latest().accounts.trad401k.bal.value)).toBe(before);
    expect(app.latest().currentTotalSaved).toBe(165_000);
    app.unmount();
  });

  it("keeps the spouse's balances and scales only the primary's share", () => {
    const app = mount();
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(100_000));
    const spouseBefore = app.latest().spouseAccounts.trad401k.bal.value;
    const total = app.latest().currentTotalSaved;
    expect(total).toBe(265_000);
    app.fire(() => app.latest().commitPlan({ totalSaved: 700_000 }));
    expect(app.latest().currentTotalSaved).toBe(700_000);
    expect(app.latest().spouseAccounts.trad401k.bal.value).toBe(spouseBefore);
    app.unmount();
  });

  it("clamps at 0 when the answer is below the spouse's balances", () => {
    const app = mount();
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(100_000));
    app.fire(() => app.latest().commitPlan({ totalSaved: 40_000 }));
    const a = app.latest().accounts;
    for (const k of ["trad401k", "roth", "taxable", "hsa"]) expect(a[k].bal.value).toBe(0);
    expect(app.latest().spouseAccounts.trad401k.bal.value).toBe(100_000);
    app.unmount();
  });

  it("puts the whole amount in taxable when the primary holds nothing", () => {
    const app = mount();
    for (const k of ["trad401k", "roth", "taxable", "hsa"]) app.fire(() => app.latest().accounts[k].bal.set(0));
    app.fire(() => app.latest().commitPlan({ totalSaved: 250_000 }));
    expect(app.latest().accounts.taxable.bal.value).toBe(250_000);
    expect(app.latest().currentTotalSaved).toBe(250_000);
    app.unmount();
  });
});

describe("BUG-153: commitPlan uses the coupled age rules", () => {
  const plan = { currentAge: 72, retirementAge: 75, monthlySpend: 5000, currentIncome: 100_000 };

  it("leaves every bundle field within its own min/max", () => {
    const app = mount();
    app.fire(() => app.latest().commitPlan(plan));
    expect(app.latest().ss.ssClaimingAge.min).toBe(70);
    expect(app.latest().ss.ssClaimingAge.value).toBeGreaterThanOrEqual(70);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
  });

  it("matches the same values entered through the normal coupled setters", () => {
    // `captured` is shared across mounts, so snapshot each run's values before the next.
    const snap = (p) => ({
      ss: p.ss.ssClaimingAge.value,
      ends: ["trad401k", "roth", "taxable", "hsa"].map(k => p.accounts[k].contribEnd.value),
      retAge: p.assumptions.retirementAge.value,
      yearsSustained: p.yearsSustained,
    });
    const viaPlan = mount();
    viaPlan.fire(() => viaPlan.latest().commitPlan(plan));
    const a = snap(viaPlan.latest());
    viaPlan.unmount();
    const viaSetters = mount();
    viaSetters.fire(() => viaSetters.latest().assumptions.currentAge.set(72));
    viaSetters.fire(() => viaSetters.latest().assumptions.retirementAge.set(75));
    viaSetters.fire(() => viaSetters.latest().profile.currentIncome.set(100_000));
    viaSetters.fire(() => viaSetters.latest().spending.annualExpenses.set(60_000));
    const b = snap(viaSetters.latest());
    viaSetters.unmount();
    expect(a).toEqual(b);
    expect(a.ss).toBe(70);
  });
});

describe("BUG-160: no dead 'living expense growth' control", () => {
  it("the spending bundle no longer carries it", () => {
    const app = mount();
    expect(app.latest().spending.livingExpenseGrowth).toBeUndefined();
    app.unmount();
  });
});

describe("BUG-161: switching HSA coverage to self-only clamps stored contributions", () => {
  it("family 8000 -> self leaves the primary field at the self-only limit", () => {
    const app = mount();
    app.fire(() => app.latest().spouseAccounts.hsaCoverageType.set("family"));
    app.fire(() => app.latest().accounts.hsa.contrib.set(8000));
    expect(app.latest().accounts.hsa.contrib.value).toBe(8000);
    app.fire(() => app.latest().spouseAccounts.hsaCoverageType.set("self"));
    expect(app.latest().accounts.hsa.contrib.max).toBe(HSA_LIMIT_2026);
    expect(app.latest().accounts.hsa.contrib.value).toBe(HSA_LIMIT_2026);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
  });

  it("clamps the spouse's stored HSA contribution too, and never raises on a switch to family", () => {
    const app = mount();
    app.fire(() => app.latest().spouseAccounts.hsaCoverageType.set("family"));
    app.fire(() => app.latest().spouseAccounts.hsa.contrib.set(HSA_FAMILY_LIMIT_2026));
    app.fire(() => app.latest().spouseAccounts.hsaCoverageType.set("self"));
    expect(app.latest().spouseAccounts.hsa.contrib.value).toBe(HSA_LIMIT_2026);
    app.fire(() => app.latest().spouseAccounts.hsaCoverageType.set("family"));
    expect(app.latest().spouseAccounts.hsa.contrib.value).toBe(HSA_LIMIT_2026);
    app.unmount();
  });
});
