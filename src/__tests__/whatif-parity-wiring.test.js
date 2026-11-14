import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { calcWhatIfScenario } from "../model/what-if.js";
import { coupleContribEndAges } from "../model/simulation.js";

// ── Preview/commit parity ────────────────────────────────────────────────────
//
// THE BUG CLASS THIS FILE EXISTS FOR. `calcWhatIfScenario` is a parallel
// re-implementation of the pipeline App.jsx builds via memos, so anything App derives
// from the retirement age must be RE-DERIVED for the scenario's own age rather than
// inherited. Six separate bugs have been exactly this: BUG-61, BUG-79, BUG-97,
// BUG-102, BUG-134, and (2026-09-06) BUG-137 + BUG-138.
//
// Every one of them was found by adversarial review rather than by the suite, because
// the assertions lived scattered across files organised by FEATURE. This file is
// organised by the INVARIANT instead: previewing change X, then committing change X,
// must agree. New parity findings belong here.
//
// Known remaining gaps, deliberately asserted as CURRENT behaviour below so that
// fixing them fails this file loudly rather than silently: BUG-135 (Social Security is
// not re-derived for the scenario's own working years) and BUG-136 (the Roth-conversion
// schedule is inherited from the base plan).

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

// Preview a retirement age, then commit the SAME age in a fresh mount, and return both.
function previewVsCommit(target, setup = () => {}) {
  const a1 = mount();
  setup(a1);
  const base = a1.latest();
  const baseRetAge = base.assumptions.retirementAge.value;
  const preview = calcWhatIfScenario(base.whatIfSimInputs, { retirementAge: target });
  a1.unmount();

  const a2 = mount();
  setup(a2);
  a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
  const committed = a2.latest();
  const out = {
    baseRetAge,
    preview,
    committedTotalAtRet: committed.totalAtRet,
    // retirementWalk.depletionAge is the far-horizon walk — the apples-to-apples
    // partner for scenarioDepletionAge. planView.depletionAge is lifeExpect-bounded
    // and reads null past it, which is NOT the comparable field.
    committedDepletionAge: committed.retirementWalk.depletionAge,
    committedSpillover: committed.retirementWalk.totalSpouseSpillover,
  };
  a2.unmount();
  return out;
}

describe("coupleContribEndAges (the shared rule, BUG-138)", () => {
  const ends = { contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 60, contribEndHSA: 65 };

  it("moves only the ages that TRACK the retirement age", () => {
    const next = coupleContribEndAges(ends, 65, 70);
    expect(next.contribEnd401k).toBe(70);
    expect(next.contribEndRoth).toBe(70);
    expect(next.contribEndHSA).toBe(70);
    // Deliberately set away from the retirement age by the user — must be left alone,
    // so "stop contributing at 60 but retire at 65" survives a scenario.
    expect(next.contribEndTaxable).toBe(60);
  });

  it("is symmetric (retiring earlier moves them down too)", () => {
    expect(coupleContribEndAges(ends, 65, 58).contribEnd401k).toBe(58);
  });

  it("is identity when the age is unchanged or either age is not finite", () => {
    expect(coupleContribEndAges(ends, 65, 65)).toBe(ends);
    expect(coupleContribEndAges(ends, 65, NaN)).toBe(ends);
    expect(coupleContribEndAges(ends, undefined, 70)).toBe(ends);
  });
});

describe("BUG-138 — a work-longer preview models the same contributions as committing it", () => {
  // The default household: no setters at all, so this is the golden-master state and
  // needs no spouse or other special shape to reproduce.
  for (const k of [1, 3, 5]) {
    it(`+${k} years: scenarioTotalAtRet matches the committed plan exactly`, () => {
      const a = mount();
      const baseRetAge = a.latest().assumptions.retirementAge.value;
      a.unmount();
      const r = previewVsCommit(baseRetAge + k);
      expect(r.preview.scenarioTotalAtRet).toBe(r.committedTotalAtRet);
    });
  }

  it("retiring EARLIER was never affected — the coupling only changes contribution years already past", () => {
    const a = mount();
    const baseRetAge = a.latest().assumptions.retirementAge.value;
    a.unmount();
    const r = previewVsCommit(baseRetAge - 3);
    expect(r.preview.scenarioTotalAtRet).toBe(r.committedTotalAtRet);
  });
});

describe("preview/commit parity — known remaining gaps (asserted as CURRENT behaviour)", () => {
  // These two assertions are inverted on purpose: they pin the BUG as it stands, so
  // that fixing BUG-135/BUG-136 fails HERE with a clear pointer rather than silently
  // changing behaviour somewhere else. Replace each with an equality assertion, and
  // delete its bug reference, as part of that fix.
  // (BUG-135 was fixed 2026-09-06 — its parity assertion now lives in the
  // "full parity" block below, as an equality rather than an inverted pin.)

  it("BUG-136: the Roth-conversion window is inherited from the base plan", () => {
    const a1 = mount();
    a1.fire(() => a1.latest().conversion.conversionMode.set("custom"));
    a1.fire(() => a1.latest().conversion.annualConversionAmt.set(60_000));
    const baseAges = Object.keys(a1.latest().whatIfSimInputs.conversionByAge);
    const baseRetAge = a1.latest().assumptions.retirementAge.value;
    a1.unmount();

    const a2 = mount();
    a2.fire(() => a2.latest().conversion.conversionMode.set("custom"));
    a2.fire(() => a2.latest().conversion.annualConversionAmt.set(60_000));
    a2.fire(() => a2.latest().assumptions.retirementAge.set(baseRetAge - 10));
    const committedAges = Object.keys(a2.latest().whatIfSimInputs.conversionByAge);
    a2.unmount();

    // Committing a 10-years-earlier retirement opens a much longer conversion runway;
    // the preview reuses the short base-plan window.
    expect(committedAges.length).toBeGreaterThan(baseAges.length + 5);
  });
});

describe("FULL PARITY — preview equals commit exactly when no known gap is in play", () => {
  // The strongest form of this file's invariant, and the one that would have caught
  // BUG-135 and BUG-138 on their own. No spouse (so BUG-137's gate is not involved)
  // and conversions off (so BUG-136's inherited window is not involved): with those
  // removed, previewing a retirement age and committing it must produce byte-identical
  // numbers, in BOTH directions.
  //
  // When BUG-136 is fixed, delete the two conversion setters from `setup` — this block
  // should then hold with conversions ON as well, which is the real end state.
  const setup = (a) => {
    a.fire(() => a.latest().assumptions.currentAge.set(50));
    a.fire(() => a.latest().assumptions.retirementAge.set(60));
    a.fire(() => a.latest().accounts.trad401k.bal.set(600_000));
    a.fire(() => a.latest().spending.annualExpenses.set(75_000));
    a.fire(() => a.latest().conversion.conversionMode.set("custom"));
    a.fire(() => a.latest().conversion.annualConversionAmt.set(0));   // remove BUG-136's input
  };

  for (const target of [52, 55, 58, 63, 66, 70]) {
    it(`retire at ${target}: scenarioTotalAtRet and scenarioYears match the committed plan exactly`, () => {
      const a1 = mount(); setup(a1);
      const preview = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: target });
      a1.unmount();

      const a2 = mount(); setup(a2);
      a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
      const committed = a2.latest();

      expect(preview.scenarioTotalAtRet).toBe(committed.totalAtRet);
      expect(preview.scenarioYears).toBe(committed.yearsSustained);
      // The whole chart, not just the summary scalars (CodeRabbit, PR #67): a
      // divergence in any accumulation or retirement row would otherwise pass a test
      // whose name promises exact agreement.
      expect(preview.chart).toEqual(committed.chartData);
      a2.unmount();
    });
  }

  it("Social Security itself moves with the scenario's own working years (BUG-135)", () => {
    // Direct statement of the mechanism: the benefit is derived from ssWorkYears via
    // calcAIME/calcPIA, so a scenario 10 years earlier must model a materially smaller
    // benefit. Pre-fix the scenario carried the base plan's figure unchanged (measured
    // 25,956 where the truth was 13,656 — a 90% overstatement).
    const a1 = mount(); setup(a1);
    // 53, not 50: retiring AT currentAge leaves no accumulation row to read, and
    // calcWhatIfScenario correctly returns null there.
    const early = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: 53 });
    const late  = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: 70 });
    a1.unmount();

    const commit = (t) => {
      const a = mount(); setup(a);
      a.fire(() => a.latest().assumptions.retirementAge.set(t));
      const v = { years: a.latest().yearsSustained, atRet: a.latest().totalAtRet };
      a.unmount();
      return v;
    };
    expect(early.scenarioYears).toBe(commit(53).years);
    expect(late.scenarioYears).toBe(commit(70).years);
  });
});

describe("BUG-150 — a pinned ssOverride must not freeze the spouse's spousal floor", () => {
  // Found by CodeRabbit on PR #67, against this file's own BUG-135 fix.
  //
  // scenarioSocialSecurity used to return early whenever the user had pinned an
  // ssOverride, on the reasoning that a pinned figure is not working-years-derived.
  // True of the PRIMARY's half — but `householdSS` also carries the spouse's, and on
  // the "spousal" basis that half is calcSpousal(ssPIA, spouseClaimingAge), derived
  // from the PRIMARY's PIA, which does move with the scenario's working years.
  //
  // Measured (MFJ, spousal basis, override 30,000, currentAge 50): committed
  // householdSS is 39,716 retiring at 60, 46,759 at 70, 33,974 at 53. The frozen base
  // value was therefore off by −7,043 and +5,742 — and the retire-earlier direction is
  // the optimistic one. The "own" basis is genuinely invariant (50,000 at every age),
  // so re-deriving is a no-op there; both cases are asserted below so a future
  // "optimisation" cannot reintroduce the early return for either.
  const setup = (basis) => (a) => {
    a.fire(() => a.latest().profile.filingStatus.set("mfj"));
    a.fire(() => a.latest().ss.isMarried.set(true));
    a.fire(() => a.latest().assumptions.currentAge.set(50));
    a.fire(() => a.latest().assumptions.inflationRate.set(0));
    a.fire(() => a.latest().assumptions.retirementAge.set(60));
    a.fire(() => a.latest().ss.spouseCurrentAge.set(50));
    a.fire(() => a.latest().ss.spouseBenefitBasis.set(basis));
    a.fire(() => a.latest().ss.spouseSsEstimate.set(20_000));
    a.fire(() => a.latest().ss.ssOverride.set(30_000));
    a.fire(() => a.latest().accounts.trad401k.bal.set(600_000));
    a.fire(() => a.latest().spending.annualExpenses.set(75_000));
    a.fire(() => a.latest().conversion.conversionMode.set("custom"));
    a.fire(() => a.latest().conversion.annualConversionAmt.set(0));
  };

  it("the spousal floor really does move with the retirement age (fixture precondition)", () => {
    const a = mount(); setup("spousal")(a);
    const at60 = a.latest().householdSS;
    a.fire(() => a.latest().assumptions.retirementAge.set(70));
    const at70 = a.latest().householdSS;
    expect(at70).toBeGreaterThan(at60);          // 46,759 vs 39,716
    // ...and the primary's pinned override is still honoured, not recomputed.
    expect(a.latest().ss.ssOverride.value).toBe(30_000);
    a.unmount();
  });

  it("the 'own' basis is genuinely invariant — re-deriving must be a no-op there", () => {
    const a = mount(); setup("own")(a);
    const at60 = a.latest().householdSS;
    a.fire(() => a.latest().assumptions.retirementAge.set(70));
    expect(a.latest().householdSS).toBe(at60);   // 50,000 at both
    a.unmount();
  });

  for (const basis of ["spousal", "own"]) {
    for (const target of [53, 70]) {
      it(`basis=${basis}, retire ${target}: preview matches commit with an override set`, () => {
        const a1 = mount(); setup(basis)(a1);
        const preview = calcWhatIfScenario(a1.latest().whatIfSimInputs, { retirementAge: target });
        a1.unmount();

        const a2 = mount(); setup(basis)(a2);
        a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
        const committed = a2.latest();

        expect(preview.scenarioYears).toBe(committed.yearsSustained);
        expect(preview.scenarioTotalAtRet).toBe(committed.totalAtRet);
        expect(preview.chart).toEqual(committed.chartData);
        a2.unmount();
      });
    }
  }
});

// ── BUG-157 + BUG-158 — scenarios under an "auto" spouse retirement age ──────────────
//
// This block is parity Finding 7's gap ("no spouse household under auto is covered") and
// closes Findings A/B of audit-auto-resolution (2026-09-05). Under spouseRetirementAge ===
// null the spouse retires the same calendar year as the primary, so EVERYTHING the spouse
// side derives from the primary's retirement age must be re-derived for a scenario's own
// age, never inherited from the base plan:
//   BUG-157 — whatIfSimInputs.spouseIncomeEndAge (the age after which the spouse's wages
//             stop counting in the PRIMARY's MAGI) — needs an OLDER spouse so the cutoff
//             lands inside accumulation, where it drives the primary's Roth phase-out.
//   BUG-158 — the spouse's own accumulation sim (contribution end = the spouse's resolved
//             retirement age) — needs a YOUNGER spouse with a real 401k contribution so
//             there are gap years in which saving visibly stops or continues.
// Conversions are zeroed (as in the FULL PARITY block) so BUG-136's inherited window is
// not involved: with it removed preview and commit must agree EXACTLY.
import {
  buildSpouseSimInput, runSpouseSim, resolveSpouseIncomeEndAge,
} from "../model/spouse-sim.js";

const noConv = (a) => {
  a.fire(() => a.latest().conversion.conversionMode.set("custom"));
  a.fire(() => a.latest().conversion.annualConversionAmt.set(0));
};

// Finding A's printed repro: MFJ, primary 45 retiring at 60, OLDER spouse 55, both
// earning $150k, Roth $7k/yr, spouseRetirementAge left at null.
const setupOlderSpouse = (a) => {
  a.fire(() => a.latest().assumptions.currentAge.set(45));
  a.fire(() => a.latest().assumptions.retirementAge.set(60));
  a.fire(() => a.latest().profile.filingStatus.set("mfj"));
  a.fire(() => a.latest().ss.isMarried.set(true));
  a.fire(() => a.latest().ss.spouseCurrentAge.set(55));
  a.fire(() => a.latest().profile.currentIncome.set(150_000));
  a.fire(() => a.latest().profile.spouseIncome.set(150_000));
  a.fire(() => a.latest().accounts.roth.contrib.set(7_000));
  a.fire(() => a.latest().spouseAccounts.roth.contrib.set(7_000));
  noConv(a);
};

// Finding B's printed repro: MFJ, primary 48 retiring at 57, YOUNGER spouse 37 (an 11-year
// auto gap) earning $120k with a $20k 401k contribution, $120k spend.
const setupYoungerSpouse = (a) => {
  a.fire(() => a.latest().assumptions.currentAge.set(48));
  a.fire(() => a.latest().assumptions.retirementAge.set(57));
  a.fire(() => a.latest().profile.filingStatus.set("mfj"));
  a.fire(() => a.latest().ss.isMarried.set(true));
  a.fire(() => a.latest().ss.spouseCurrentAge.set(37));
  a.fire(() => a.latest().profile.spouseIncome.set(120_000));
  a.fire(() => a.latest().spouseAccounts.trad401k.contrib.set(20_000));
  a.fire(() => a.latest().spending.annualExpenses.set(120_000));
  noConv(a);
};

// Snapshot-then-unmount: two live apps share the module-level `captured` array, so
// anything read after the second mount would be the second app's props.
function snapshotPreviewAndCommit(setup, target) {
  const a1 = mount(); setup(a1);
  const base = a1.latest();
  const baseEnd = base.whatIfSimInputs.simInputs.spouseIncomeEndAge;
  const baseRows = base.whatIfSimInputs.spouseSeedInputs.spouseSimData;
  const baseTotal = base.totalAtRet;
  const preview = calcWhatIfScenario(base.whatIfSimInputs, { retirementAge: target });
  a1.unmount();

  const a2 = mount(); setup(a2);
  a2.fire(() => a2.latest().assumptions.retirementAge.set(target));
  const c = a2.latest();
  const out = {
    baseEnd, baseRows, baseTotal, preview,
    committedEnd: c.whatIfSimInputs.simInputs.spouseIncomeEndAge,
    committedRows: c.whatIfSimInputs.spouseSeedInputs.spouseSimData,
    committed: {
      totalAtRet: c.totalAtRet, years: c.yearsSustained, chart: c.chartData,
      depletion: c.retirementWalk.depletionAge, spillover: c.retirementWalk.totalSpouseSpillover,
    },
  };
  a2.unmount();
  return out;
}

describe("BUG-157 — the spouse's MAGI cutoff moves with the scenario's retirement age (auto)", () => {
  it("fixture precondition: under auto the cutoff really is tied to the primary's age and lands in accumulation", () => {
    const r = snapshotPreviewAndCommit(setupOlderSpouse, 65);
    expect(r.baseEnd).toBe(50);        // spouse retires at 55 <=> primary is 50 (age 60 base)
    expect(r.committedEnd).toBe(55);   // committing a 65 retirement moves it to 55
  });

  for (const target of [63, 65, 68]) {
    it(`retire ${target}: scenarioTotalAtRet / years / chart match the committed plan exactly`, () => {
      const r = snapshotPreviewAndCommit(setupOlderSpouse, target);
      expect(r.preview.scenarioTotalAtRet).toBe(r.committed.totalAtRet);
      expect(r.preview.scenarioYears).toBe(r.committed.years);
      expect(r.preview.chart).toEqual(r.committed.chart);
    });
  }

  it("resolveSpouseIncomeEndAge is the one derivation (auto follows the primary, explicit does not)", () => {
    const args = { hasSpouse: true, currentAge: 45, spouseCurrentAge: 55, lifeExp: 95 };
    expect(resolveSpouseIncomeEndAge({ ...args, spouseRetirementAge: null, primaryRetAge: 60 })).toBe(50);
    expect(resolveSpouseIncomeEndAge({ ...args, spouseRetirementAge: null, primaryRetAge: 65 })).toBe(55);
    expect(resolveSpouseIncomeEndAge({ ...args, spouseRetirementAge: 62, primaryRetAge: 60 })).toBe(52);
    expect(resolveSpouseIncomeEndAge({ ...args, spouseRetirementAge: 62, primaryRetAge: 65 })).toBe(52);
    expect(resolveSpouseIncomeEndAge({ ...args, hasSpouse: false, spouseRetirementAge: null, primaryRetAge: 60 })).toBeNull();
  });
});

describe("BUG-158 — the spouse's own accumulation sim is re-run at the scenario's age (auto)", () => {
  for (const target of [60, 63, 65]) {
    it(`retire ${target}: scenarioYears / chart / depletion match the committed plan exactly`, () => {
      const r = snapshotPreviewAndCommit(setupYoungerSpouse, target);
      expect(r.preview.scenarioYears).toBe(r.committed.years);
      expect(r.preview.scenarioTotalAtRet).toBe(r.committed.totalAtRet);
      expect(r.preview.chart).toEqual(r.committed.chart);
      expect(r.preview.scenarioDepletionAge).toBe(r.committed.depletion);
      expect(r.preview.totalSpouseSpillover).toBe(r.committed.spillover);
    });
  }

  it("fixture precondition: the commit really does move the spouse's contributions (frozen rows would differ)", () => {
    const r = snapshotPreviewAndCommit(setupYoungerSpouse, 63);
    const sum = (rows) => rows.reduce((s, d) => s + (d.c401k ?? 0), 0);
    expect(sum(r.committedRows)).toBeGreaterThan(sum(r.baseRows));
  });

  it("an EXPLICIT spouseRetirementAge keeps the spouse's contributions untouched by a primary-age scenario", () => {
    const explicit = (a) => { setupYoungerSpouse(a); a.fire(() => a.latest().spouseAccounts.spouseRetirementAge.set(62)); };
    const r = snapshotPreviewAndCommit(explicit, 63);
    // spouseContribEnd is the spouse's OWN 62, whatever the primary does.
    const c401k = (rows) => rows.map(d => d.c401k ?? 0);
    expect(c401k(r.committedRows)).toEqual(c401k(r.baseRows));
    expect(r.preview.scenarioYears).toBe(r.committed.years);
    expect(r.preview.scenarioTotalAtRet).toBe(r.committed.totalAtRet);
  });

  it("the scenario's rebuilt spouse rows are byte-identical to App's own at the base retirement age", () => {
    const a = mount(); setupYoungerSpouse(a);
    const bundle = a.latest().whatIfSimInputs;
    const b = bundle.simInputs;
    const raw = bundle.spouseSeedInputs.spouseSimRaw;
    const rebuilt = runSpouseSim(buildSpouseSimInput({
      totalYears: b.totalYears, currentAge: b.currentAge,
      currentIncome: b.currentIncome, incomeGrowth: b.incomeGrowth,
      incomeGrowthEndAge: b.incomeGrowthEndAge, filingStatus: b.filingStatus,
      returnRate: b.returnRate, primaryContribHSA: b.contribHSA,
      hsaCoverageType: raw.hsaCoverageType,
      primaryRetAge: a.latest().assumptions.retirementAge.value,
      spouseRetirementAge: bundle.spouseSeedInputs.spouseRetirementAge, lifeExp: bundle.spouseSeedInputs.lifeExp,
      spouseCurrentAge: bundle.spouseSeedInputs.spouseCurrentAge,
      spouseIncome: b.spouseIncome, spouseIncomeGrowth: b.spouseIncomeGrowth,
      ...raw,
    }));
    expect(rebuilt.length).toBeGreaterThan(0);
    expect(rebuilt).toEqual(bundle.spouseSeedInputs.spouseSimData);
    a.unmount();
  });
});
