import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import {
  incomeGrowthSteps, plateauAgeInFrame, clampIncomePlateauAge,
} from "../model/income-growth.js";
import { calcAIME } from "../model/social-security.js";
import { projectedIncomeAtAge, runSimulation, coupleCurrentAge } from "../model/simulation.js";
import { FICA_WAGE_BASE } from "../config/irs-2026.js";

// L1-C (BUG-155, BUG-156): ONE frame-aware income-plateau resolver.

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

describe("incomeGrowthSteps — the one resolver (BUG-155)", () => {
  it("null plateau = uncapped; always floored at 0", () => {
    expect(incomeGrowthSteps(7, null, 40)).toBe(7);
    expect(incomeGrowthSteps(0, null, 40)).toBe(0);
    expect(incomeGrowthSteps(-3, null, 40)).toBe(0);
  });
  it("boundary: the cap is (plateau - currentAge) raise steps, inclusive", () => {
    // plateau 45, current 40 -> 5 steps max
    expect(incomeGrowthSteps(4, 45, 40)).toBe(4);
    expect(incomeGrowthSteps(5, 45, 40)).toBe(5);
    expect(incomeGrowthSteps(6, 45, 40)).toBe(5);
    expect(incomeGrowthSteps(30, 45, 40)).toBe(5);
  });
  it("a stale plateau at/below the current age never goes negative (no backward discount)", () => {
    expect(incomeGrowthSteps(3, 45, 50)).toBe(0);   // plateau 5 years in the past
    expect(incomeGrowthSteps(3, 50, 50)).toBe(0);
  });
});

describe("plateauAgeInFrame / clampIncomePlateauAge", () => {
  it("keeps the same calendar year across two people's age frames", () => {
    expect(plateauAgeInFrame(50, 40, 55)).toBe(65);  // 10 years out for both
    expect(plateauAgeInFrame(null, 40, 55)).toBeNull();
    expect(plateauAgeInFrame(50, 40, 40)).toBe(50);
  });
  it("clamps into [currentAge+1, retirementAge) or snaps to null", () => {
    expect(clampIncomePlateauAge(null, 40, 65)).toBeNull();
    expect(clampIncomePlateauAge(45, 40, 65)).toBe(45);
    expect(clampIncomePlateauAge(45, 50, 65)).toBe(51);   // lifted to its own min
    expect(clampIncomePlateauAge(65, 40, 65)).toBeNull(); // at retirement == no plateau
    expect(clampIncomePlateauAge(70, 40, 65)).toBeNull();
    expect(clampIncomePlateauAge(45, 64, 65)).toBeNull(); // no room left for a plateau
  });
  it("coupleCurrentAge re-clamps a stored plateau when the state carries one", () => {
    const st = { lifeExpect: 90, ssClaimingAge: 67, retirementAge: 65, incomeGrowthEndAge: 45,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65 };
    expect(coupleCurrentAge(st, 50).incomeGrowthEndAge).toBe(51);
    expect(coupleCurrentAge(st, 70).incomeGrowthEndAge).toBeNull(); // retirement dragged to 70
    const { incomeGrowthEndAge, ...noKey } = st;
    expect("incomeGrowthEndAge" in coupleCurrentAge(noKey, 50)).toBe(false);
  });
});

describe("BUG-155: the SS earnings record and the salary table share one convention", () => {
  const base = { currentIncome: 80_000, incomeGrowth: 5, currentAge: 40 };
  it("calcAIME year y prices the same salary projectedIncomeAtAge gives at age currentAge+y+1", () => {
    for (const plateau of [null, 43, 45, 60]) {
      // 3 working years, no FICA cap in play -> AIME*35*12 = sum of those salaries
      const sum = [0, 1, 2].reduce((t, y) =>
        t + projectedIncomeAtAge({ ...base, incomeGrowthEndAge: plateau }, base.currentAge + y + 1), 0);
      const aime = calcAIME(base.currentIncome, base.incomeGrowth, 3, plateau, base.currentAge);
      expect(aime * 35 * 12).toBeCloseTo(sum, 4);
    }
  });
  it("boundary on the salary table: last raise lands the year the person turns plateau+1", () => {
    const p = { ...base, incomeGrowthEndAge: 45 };
    const s = (age) => projectedIncomeAtAge(p, age);
    expect(s(45)).toBeCloseTo(80_000 * 1.05 ** 4, 6);
    expect(s(46)).toBeCloseTo(80_000 * 1.05 ** 5, 6);
    expect(s(47)).toBeCloseTo(80_000 * 1.05 ** 5, 6);
    expect(s(60)).toBeCloseTo(80_000 * 1.05 ** 5, 6);
  });
  it("calcAIME with a STALE plateau (before currentAge) equals the flat-salary AIME, not a discounted one", () => {
    const flat = (15 * 150_000) / 35 / 12;
    const aime = calcAIME(150_000, 0, 15, 45, 50);  // 0% growth: any growth is a bug either way
    expect(aime).toBeCloseTo(flat, 6);
    // with growth: income must never be priced BELOW the base salary
    const grown = calcAIME(150_000, 3, 15, 45, 50);
    expect(grown).toBeGreaterThanOrEqual(flat - 1e-9);
    expect(grown).toBeCloseTo(flat, 6); // plateau already passed => flat salary exactly
    expect(150_000 < FICA_WAGE_BASE).toBe(true);
  });
});

describe("BUG-156: runSimulation — the plateau applies to the OTHER earner only in the spouse's frame", () => {
  const common = {
    totalYears: 25, filingStatus: "mfj", returnRate: 6,
    bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
    contrib401k: 10_000, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
    contribEnd401k: 99, contribEndRoth: 99, contribEndTaxable: 99, contribEndHSA: 99,
    calcEmployerMatchFn: () => 0,
  };
  const spouseRun = (extra) => runSimulation({
    ...common, currentAge: 55, currentIncome: 100_000, incomeGrowth: 3,
    spouseIncome: 100_000, spouseIncomeGrowth: 3, ...extra,
  });

  it("an omitted otherEarnerGrowthEndAge defaults to incomeGrowthEndAge (existing callers unchanged)", () => {
    const a = spouseRun({ incomeGrowthEndAge: 60 });
    const b = spouseRun({ incomeGrowthEndAge: 60, otherEarnerGrowthEndAge: 60 });
    expect(a).toEqual(b);
  });

  it("the subject's own salary is not plateaued when only the other earner has a plateau", () => {
    const noPlateau = spouseRun({ incomeGrowthEndAge: null });
    // the PRIMARY's plateau (age 50, primary is 40) re-expressed in the spouse's frame = 65
    const fixed = spouseRun({
      incomeGrowthEndAge: null,
      otherEarnerGrowthEndAge: plateauAgeInFrame(50, 40, 55),
    });
    expect(fixed.map(r => r.tradGross)).toEqual(noPlateau.map(r => r.tradGross));
    // the buggy wiring (primary-frame age handed to the spouse run) freezes the spouse's own salary
    const buggy = spouseRun({ incomeGrowthEndAge: 50 });
    expect(buggy[buggy.length - 1].tradGross).toBeLessThan(noPlateau[noPlateau.length - 1].tradGross);
  });
});

describe("BUG-155: the other-earner term is guarded against a stale (past) plateau", () => {
  it("a plateau before the subject's age does not shrink the other earner's income into the Roth phase-out gap", () => {
    // MFJ, subject 100k, other earner 200k with a stale plateau (age 40) at subject age 50.
    // Honest MAGI = 300k (above the 252k phase-out end) => no Roth room. Unguarded, the other
    // earner is priced at 200k * 1.03^-10 = 148.8k => MAGI 248.8k => a partial contribution.
    const rows = runSimulation({
      totalYears: 3, currentAge: 50, currentIncome: 100_000, incomeGrowth: 0,
      incomeGrowthEndAge: null, otherEarnerGrowthEndAge: 40, filingStatus: "mfj",
      spouseIncome: 200_000, spouseIncomeGrowth: 3, returnRate: 5,
      bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 0, contribRoth: 7_500, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 99, contribEndRoth: 99, contribEndTaxable: 99, contribEndHSA: 99,
      calcEmployerMatchFn: () => 0,
    });
    expect(rows[0].cRoth).toBe(0);
  });
  it("the subject's own salary is flat (never discounted) under a stale plateau", () => {
    const rows = runSimulation({
      totalYears: 3, currentAge: 50, currentIncome: 100_000, incomeGrowth: 5,
      incomeGrowthEndAge: 45, filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0,
      returnRate: 5, bal401k: 0, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 99, contribEndRoth: 99, contribEndTaxable: 99, contribEndHSA: 99,
      calcEmployerMatchFn: () => 0,
    });
    expect(rows.map(r => r.salary)).toEqual([100_000, 100_000, 100_000]);
  });
});

describe("BUG-155 (App): the stored plateau follows current/retirement age", () => {
  const setup = (a) => {
    a.fire(() => a.latest().assumptions.currentAge.set(40));
    a.fire(() => a.latest().assumptions.retirementAge.set(65));
    a.fire(() => a.latest().profile.currentIncome.set(150_000));
    a.fire(() => a.latest().profile.incomeGrowthEndAge.set(45));
  };
  it("raising currentAge past a stored plateau re-clamps it and never discounts SS backward", () => {
    const a = mount(); setup(a);
    expect(a.latest().profile.incomeGrowthEndAge.value).toBe(45);
    a.fire(() => a.latest().assumptions.currentAge.set(50));
    const f = a.latest().profile.incomeGrowthEndAge;
    expect(f.value === null || (f.value >= f.min && f.value <= f.max)).toBe(true);
    expect(f.value).toBe(51);
    // honest flat-salary AIME for 15 working years at 150k is 5,357; the stale-plateau bug priced 4,621
    expect(a.latest().ssView.ssAIME).toBeGreaterThanOrEqual(5_357);
    a.unmount();
  });
  it("lowering the retirement age to the plateau snaps it to null (no plateau)", () => {
    const a = mount(); setup(a);
    a.fire(() => a.latest().assumptions.retirementAge.set(45));
    expect(a.latest().profile.incomeGrowthEndAge.value).toBeNull();
    a.unmount();
  });
  it("commitPlan applies the same re-clamp (onboarding path)", () => {
    const a = mount(); setup(a);
    a.fire(() => a.latest().commitPlan({ currentAge: 50 }));
    expect(a.latest().profile.incomeGrowthEndAge.value).toBe(51);
    a.fire(() => a.latest().commitPlan({ retirementAge: 51 }));
    expect(a.latest().profile.incomeGrowthEndAge.value).toBeNull();
    a.unmount();
  });
});

describe("BUG-155 (App): the income plateau reaches Social Security (R-11)", () => {
  // Mutating App's calcRetirementIncome({... incomeGrowthEndAge ...}) to null failed 0 tests:
  // the sibling test above only asserts SS is "never discounted backward", which a plateau-blind
  // SS also satisfies. A plateau at 40 means earnings stop growing at 40, so the 35-year earnings
  // record (and PIA) is LOWER than the no-plateau record (review probe J2: 44,076 < 48,120).
  const ssFor = (plateau) => {
    const a = mount();
    a.fire(() => a.latest().assumptions.currentAge.set(34));
    a.fire(() => a.latest().assumptions.retirementAge.set(65));
    a.fire(() => a.latest().profile.currentIncome.set(100_000));
    a.fire(() => a.latest().profile.incomeGrowthEndAge.set(plateau));
    const out = { annual: a.latest().ssView.ssEstimateAnnual, aime: a.latest().ssView.ssAIME, plateau: a.latest().profile.incomeGrowthEndAge.value };
    a.unmount();
    return out;
  };
  it("the SS estimate at plateau 40 is below the no-plateau estimate", () => {
    const none = ssFor(null);
    const at40 = ssFor(40);
    expect(at40.plateau).toBe(40);
    expect(none.plateau).toBeNull();
    expect(at40.annual).toBeLessThan(none.annual);
    expect(at40.aime).toBeLessThan(none.aime);
  });
});

describe("BUG-156 (App): the primary's plateau does not touch the spouse's own savings", () => {
  // Spouse-only savings household: primary has no balances/contributions/match, so the
  // household total at retirement is the spouse's sim alone. The primary's plateau (age 50,
  // 10 calendar years out) must not change it (the buggy wiring froze the spouse's salary).
  const setup = (plateau) => {
    const a = mount();
    a.fire(() => a.latest().profile.filingStatus.set("mfj"));
    a.fire(() => a.latest().ss.isMarried.set(true));
    a.fire(() => a.latest().assumptions.currentAge.set(40));
    a.fire(() => a.latest().ss.spouseCurrentAge.set(55));
    a.fire(() => a.latest().assumptions.retirementAge.set(65));
    a.fire(() => a.latest().profile.currentIncome.set(100_000));
    a.fire(() => a.latest().profile.spouseIncome.set(100_000));
    for (const k of ["trad401k", "roth", "taxable", "hsa"]) {
      a.fire(() => a.latest().accounts[k].bal.set(0));
      a.fire(() => a.latest().accounts[k].contrib.set(0));
    }
    a.fire(() => a.latest().accounts.employerMatchPct.set(0));
    a.fire(() => a.latest().spouseAccounts.employerMatchPct.set(0));
    a.fire(() => a.latest().spouseAccounts.trad401k.contrib.set(10_000));
    a.fire(() => a.latest().profile.incomeGrowthEndAge.set(plateau));
    return a;
  };
  it("household total at retirement is identical with and without the primary's plateau", () => {
    // Sequential, not simultaneous: mount() shares one `captured` array, so two live apps
    // would both read the later one's props.
    const none = setup(null); const totalNone = none.latest().totalAtRet; none.unmount();
    const withP = setup(50);
    expect(withP.latest().profile.incomeGrowthEndAge.value).toBe(50);
    expect(withP.latest().totalAtRet).toBe(totalNone);   // 311,036 (buggy wiring: 274,560)
    expect(totalNone).toBeGreaterThan(0);
    withP.unmount();
  });
});
