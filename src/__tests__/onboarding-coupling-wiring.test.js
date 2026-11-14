import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { HSA_LIMIT_2026, HSA_FAMILY_LIMIT_2026 } from "../config/irs-2026.js";
import { spouseHsaLimitFor } from "../model/spouse-sim.js";

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

  // BUG-168 (Opus review R-10): the ORIGINAL BUG-153 version of this test asserted onboarding
  // equals "set age, then set retirement" and so locked in [73,73,73,73]: contributions stopped
  // the year after currentAge for a 72-year-old retiring at 75. That order-dependent result was a
  // regression from `main` (which gave 75). The right assertion is ORDER INDEPENDENCE: onboarding,
  // "age then retire" and "retire then age" must all agree, with contributions running through
  // the retirement year (contribEnd === retirementAge === 75) and the SS claim age clamped to 70.
  it("onboarding, age-then-retire and retire-then-age all agree (order independent)", () => {
    // `captured` is shared across mounts, so snapshot each run's values before the next.
    const snap = (p) => ({
      ss: p.ss.ssClaimingAge.value,
      ends: ["trad401k", "roth", "taxable", "hsa"].map(k => p.accounts[k].contribEnd.value),
      retAge: p.assumptions.retirementAge.value,
      totalAtRet: p.totalAtRet,
      yearsSustained: p.yearsSustained,
    });
    const run = (drive) => {
      const app = mount();
      drive(app);
      const out = snap(app.latest());
      app.unmount();
      return out;
    };
    const viaPlan = run(app => app.fire(() => app.latest().commitPlan(plan)));
    const ageThenRetire = run(app => {
      app.fire(() => app.latest().assumptions.currentAge.set(72));
      app.fire(() => app.latest().assumptions.retirementAge.set(75));
      app.fire(() => app.latest().profile.currentIncome.set(100_000));
      app.fire(() => app.latest().spending.annualExpenses.set(60_000));
    });
    const retireThenAge = run(app => {
      app.fire(() => app.latest().assumptions.retirementAge.set(75));
      app.fire(() => app.latest().assumptions.currentAge.set(72));
      app.fire(() => app.latest().profile.currentIncome.set(100_000));
      app.fire(() => app.latest().spending.annualExpenses.set(60_000));
    });
    expect(viaPlan.ends).toEqual([75, 75, 75, 75]);
    expect(ageThenRetire.ends).toEqual([75, 75, 75, 75]);
    expect(retireThenAge.ends).toEqual([75, 75, 75, 75]);
    expect(viaPlan.ss).toBe(70);
    expect(ageThenRetire.ss).toBe(70);
    expect(retireThenAge.ss).toBe(70);
    expect(viaPlan).toEqual(ageThenRetire);
    expect(viaPlan).toEqual(retireThenAge);
  });
});

describe("BUG-169: commitPlan bounds the retirement age against the coupled ages", () => {
  const snap = (p) => ({ ret: p.assumptions.retirementAge.value, life: p.assumptions.lifeExpect.value,
    cur: p.assumptions.currentAge.value, depletionAge: p.planView.depletionAge });
  it("70 years old retiring 'at 60' retires at 70 (the controls' own minimum)", () => {
    const app = mount();
    app.fire(() => app.latest().commitPlan({ currentAge: 70, retirementAge: 60, currentIncome: 100_000, monthlySpend: 5_000 }));
    const s = snap(app.latest());
    expect(s.ret).toBe(70);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
  });
  it("34 years old retiring at 90 retires at lifeExpect - 1 and the horizon stays 90", () => {
    const app = mount();
    app.fire(() => app.latest().commitPlan({ currentAge: 34, retirementAge: 90, currentIncome: 100_000, monthlySpend: 5_000 }));
    const s = snap(app.latest());
    expect(s.ret).toBe(89);
    expect(s.life).toBe(90);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
  });
});

describe("BUG-169 (lower bound, retirement age alone)", () => {
  it("a retirement age below the current age is lifted to it when no age is committed", () => {
    // With a currentAge in the same commit, coupleCurrentAge lifts it anyway; this is the path
    // where ONLY the retirement-age bound can do the job.
    const app = mount();
    const cur = app.latest().assumptions.currentAge.value;
    app.fire(() => app.latest().commitPlan({ retirementAge: cur - 10 }));
    expect(app.latest().assumptions.retirementAge.value).toBe(cur);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
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

// BUG-172 (Opus review R-7): BUG-161's invariant "the field equals the modelled value" was only
// written for family -> self. Under FAMILY coverage the spouse's real ceiling is the household
// 8,750 minus the PRIMARY's contribution, but the field's max was the whole 8,750.
describe("BUG-172: the spouse HSA field equals the modelled value under family coverage", () => {
  const setup = (app) => {
    app.fire(() => app.latest().spouseAccounts.hsaCoverageType.set("family"));
    app.fire(() => app.latest().spouseAccounts.hsa.contrib.set(8_000));
  };
  it("primary at the 3,850 default: field max AND value are the spouse's 4,900 share, not 8,000/8,750", () => {
    const app = mount(); setup(app);
    const f = app.latest().spouseAccounts.hsa.contrib;
    expect(spouseHsaLimitFor("family", app.latest().accounts.hsa.contrib.value)).toBe(4_900);
    expect(f.max).toBe(4_900);
    expect(f.value).toBe(4_900);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
  });
  it("follows the primary's HSA contribution both ways (the user's own 8,000 comes back)", () => {
    const app = mount(); setup(app);
    app.fire(() => app.latest().accounts.hsa.contrib.set(6_000));
    expect(app.latest().spouseAccounts.hsa.contrib.max).toBe(2_750);
    expect(app.latest().spouseAccounts.hsa.contrib.value).toBe(2_750);
    app.fire(() => app.latest().accounts.hsa.contrib.set(500));
    expect(app.latest().spouseAccounts.hsa.contrib.value).toBe(8_000);
    expect(app.latest().spouseAccounts.hsa.contrib.max).toBe(8_250);
    expect(outOfRange(app.latest())).toEqual([]);
    app.unmount();
  });
  it("self-only coverage is unchanged (each person keeps the self-only cap)", () => {
    const app = mount();
    app.fire(() => app.latest().spouseAccounts.hsa.contrib.set(3_000));
    expect(app.latest().spouseAccounts.hsa.contrib.max).toBe(HSA_LIMIT_2026);
    expect(app.latest().spouseAccounts.hsa.contrib.value).toBe(3_000);
    app.unmount();
  });
});
