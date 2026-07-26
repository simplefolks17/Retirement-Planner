import { describe, it, expect } from "vitest";
import { buildRetirementWalkByAccount } from "../retirement-engine.js";

// Stage 1 (BUG-35): the per-account engine in isolation. These lock the
// invariants that make it a correct, taxed-exactly-once, gross-seeded walk —
// before it is wired into App (Stage 2) where the golden master moves.

const base = (over = {}) => buildRetirementWalkByAccount({
  startAge: 65, endAge: 95, rReal: 0.03,
  tradGross: 500_000, roth: 200_000, taxable: 300_000, hsa: 50_000,
  effectiveExpenses: 60_000, filingStatus: "single", rmdStartAge: 73,
  ...over,
});

describe("buildRetirementWalkByAccount — aggregate recurrence (BUG-31 shape preserved)", () => {
  it("each row: balEnd == balStart*(1+rReal) − draw − tax (no events, funded years)", () => {
    const { rows, depletionAge } = base();
    // The recurrence is exact for every fully-funded year; the depletion year
    // funds only part of its draw+tax, so it is excluded.
    for (const r of rows) {
      if (r.age === depletionAge) continue;
      const expected = r.balStart * 1.03 - r.draw - r.tax;
      expect(Math.abs(r.balEnd - expected)).toBeLessThan(1e-6);
    }
  });

  it("balances chain: each year's balStart equals the prior year's balEnd", () => {
    const { rows } = base();
    for (let i = 1; i < rows.length; i++) {
      expect(Math.abs(rows[i].balStart - rows[i - 1].balEnd)).toBeLessThan(1e-6);
    }
  });

  it("per-account balances sum to the row total each year", () => {
    const { rows } = base();
    for (const r of rows) {
      expect(Math.abs((r.trad + r.roth + r.taxable + r.hsa) - r.balEnd)).toBeLessThan(1e-6);
    }
  });
});

describe("buildRetirementWalkByAccount — taxed exactly once", () => {
  it("a pure-Roth portfolio never pays tax (Roth is never re-taxed)", () => {
    const { rows } = base({ tradGross: 0, taxable: 0, hsa: 0, roth: 2_000_000 });
    for (const r of rows) expect(r.tax).toBe(0);
  });

  it("a pure-Taxable portfolio never pays ordinary tax on withdrawals", () => {
    const { rows } = base({ tradGross: 0, roth: 0, hsa: 0, taxable: 2_000_000 });
    for (const r of rows) expect(r.tax).toBe(0);
  });

  it("a 401k-funded draw is taxed (ordinary income) before RMD age", () => {
    // Only a 401k: the spending draw must come from it and be taxed every year.
    const { rows } = base({ roth: 0, taxable: 0, hsa: 0, tradGross: 2_000_000 });
    const early = rows.find(r => r.age === 68);
    expect(early.tradDraw).toBeGreaterThan(0);
    expect(early.tax).toBeGreaterThan(0);
  });

  it("gross seed: a $1M 401k is NOT pre-shrunk — year-1 total reflects the full balance growing", () => {
    // With no spending and no RMD yet, the 401k simply grows at the real rate —
    // proving it was seeded gross (≈1.03M), not after-tax (≈0.76M).
    const { rows } = base({
      tradGross: 1_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 0, endAge: 66,
    });
    expect(rows[0].total).toBeGreaterThan(1_020_000);
  });
});

describe("buildRetirementWalkByAccount — RMDs and conversions", () => {
  it("forces an RMD (and its tax) at the RMD start age", () => {
    const { rows } = base({ roth: 0, taxable: 0, hsa: 0, tradGross: 2_000_000, effectiveExpenses: 0 });
    const at73 = rows.find(r => r.age === 73);
    expect(at73.rmd).toBeGreaterThan(0);
    expect(at73.tax).toBeGreaterThan(0);
    const at72 = rows.find(r => r.age === 72);
    expect(at72.rmd).toBe(0); // no RMD before start age
  });

  it("a Roth conversion moves 401k → Roth and is taxed that year", () => {
    const noConv = base({ effectiveExpenses: 0, endAge: 66 });
    const withConv = base({ effectiveExpenses: 0, endAge: 66, conversionByAge: { 66: 50_000 } });
    // Roth ends higher, 401k lower, and tax is charged on the conversion.
    expect(withConv.rows[0].roth).toBeGreaterThan(noConv.rows[0].roth);
    expect(withConv.rows[0].trad).toBeLessThan(noConv.rows[0].trad);
    expect(withConv.rows[0].tax).toBeGreaterThan(0);
    expect(noConv.rows[0].tax).toBe(0);
  });
});

describe("buildRetirementWalkByAccount — tax breakdown (one walk, attributable)", () => {
  it("inflowTax + convTax + rmdTax + drawTax rounds to the row's total tax every year", () => {
    // Mixed portfolio with a conversion window and RMDs so all components fire.
    const { rows } = base({
      tradGross: 2_000_000, roth: 0, taxable: 100_000, hsa: 0,
      effectiveExpenses: 80_000, conversionByAge: { 66: 40_000, 67: 40_000 },
      retStateRate: 0.04,
    });
    for (const r of rows) {
      expect(Math.round(r.inflowTax + r.convTax + r.rmdTax + r.drawTax)).toBe(r.tax);
    }
  });

  it("attributes tax to the right source: conversion tax in the window, RMD tax at 73+", () => {
    const { rows } = base({
      tradGross: 2_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 0, conversionByAge: { 66: 50_000 },
    });
    const at66 = rows.find(r => r.age === 66);
    expect(at66.convTax).toBeGreaterThan(0);   // conversion taxed in its year
    expect(at66.rmdTax).toBe(0);               // no RMD before 73
    const at74 = rows.find(r => r.age === 74);
    expect(at74.rmdTax).toBeGreaterThan(0);    // RMD taxed once started
    expect(at74.convTax).toBe(0);              // no conversion outside the window
  });
});

describe("buildRetirementWalkByAccount — review fixes (PR #32)", () => {
  it("grosses up tax when the 401k funds BOTH spending and the tax (no Taxable buffer)", () => {
    // Taxable/Roth/HSA empty, so the 401k must fund the net spending AND the income
    // tax on it — the tax is on a base that includes itself (tax-on-tax gross-up).
    const { rows } = base({
      tradGross: 3_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 120_000,
    });
    const r = rows.find(x => x.age === 67);
    expect(r.tradDraw).toBeGreaterThan(r.draw);                       // funds more than net spending
    expect(Math.abs(r.tradDraw - (r.draw + r.tax))).toBeLessThan(2);  // = spending + tax (grossed up)
  });

  it("a large one-time purchase that drains the pool triggers depletion", () => {
    // The event outflow is folded into `needed`, so a purchase that exhausts the pool
    // surfaces as spendShort and triggers depletion (was previously discarded).
    const { depletionAge, yearsSustained } = base({
      tradGross: 0, roth: 300_000, taxable: 0, hsa: 0, effectiveExpenses: 0,
      moneyEvents: [{ age: 70, amount: 1_000_000, isInflow: false }],
    });
    expect(depletionAge).toBe(70);
    expect(Number.isFinite(yearsSustained)).toBe(true);
  });

  it("taxes a one-time purchase funded from the 401k (event is ordinary income)", () => {
    // A purchase paid from a pre-tax account is a taxable distribution. With no Taxable
    // buffer, the 401k funds the event, so its dollars are taxed + grossed up like any
    // other draw — the year's tax must jump in the event year vs. an event-free run.
    const common = { tradGross: 3_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 0 };
    const noEvent   = base({ ...common });
    const withEvent = base({ ...common, moneyEvents: [{ age: 68, amount: 100_000, isInflow: false }] });
    const a = noEvent.rows.find(r => r.age === 68);
    const b = withEvent.rows.find(r => r.age === 68);
    expect(b.draw).toBeCloseTo(a.draw + 100_000, 5);   // event folded into the draw
    expect(b.tax).toBeGreaterThan(a.tax);              // and taxed (was 0 before the fix)
    expect(b.tradDraw).toBeGreaterThan(b.draw);        // 401k funds spending + the tax on it
  });

  it("taxes a flagged taxable inflow as ordinary income (and leaves a non-taxable one untaxed)", () => {
    // A taxable windfall (e.g. inherited pre-tax IRA) is ordinary income the year it
    // lands; a non-taxable one (Roth inheritance, gift) is not. Both add to the pool.
    const common = { tradGross: 0, roth: 0, taxable: 200_000, hsa: 0, effectiveExpenses: 0 };
    const taxableIn    = base({ ...common, moneyEvents: [{ age: 68, amount: 100_000, isInflow: true, isTaxable: true  }] });
    const nonTaxableIn = base({ ...common, moneyEvents: [{ age: 68, amount: 100_000, isInflow: true, isTaxable: false }] });
    const t = taxableIn.rows.find(r => r.age === 68);
    const n = nonTaxableIn.rows.find(r => r.age === 68);
    expect(t.inflowTax).toBeGreaterThan(0);                 // taxable inflow is taxed
    expect(n.inflowTax).toBe(0);                            // non-taxable inflow is not
    expect(t.tax).toBeGreaterThan(n.tax);                   // and it shows up in the year's tax
    expect(t.balEnd).toBeLessThan(n.balEnd);                // net pool is lower by the tax paid
  });

  it("computes the RMD BEFORE any same-year conversion (IRS sequencing)", () => {
    // A conversion in the same year as an RMD must NOT shrink the RMD base.
    const noConv   = base({ tradGross: 2_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 0 });
    const withConv = base({ tradGross: 2_000_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 0,
      conversionByAge: { 73: 100_000 } });
    const a = noConv.rows.find(r => r.age === 73);
    const b = withConv.rows.find(r => r.age === 73);
    expect(b.rmd).toBeCloseTo(a.rmd, 5);   // RMD identical — computed on the full pre-conversion balance
    expect(b.conversion).toBe(100_000);    // the conversion still happens, on the post-RMD balance
  });
});

describe("buildRetirementWalkByAccount — income timing (rule 5b)", () => {
  it("SS reduces the draw only from its claim age", () => {
    const { rows } = base({ ssGross: 30_000, ssTaxable: 25_500, ssClaimAge: 70 });
    expect(rows.find(r => r.age === 68).draw).toBe(60_000);       // before claim: full expenses
    expect(rows.find(r => r.age === 72).draw).toBe(30_000);       // after claim: expenses − SS
  });

  it("pension reduces the draw only from its start age", () => {
    const { rows } = base({ pension: 20_000, pensionStartAge: 67 });
    expect(rows.find(r => r.age === 66).draw).toBe(60_000);
    expect(rows.find(r => r.age === 68).draw).toBe(40_000);
  });
});

describe("buildRetirementWalkByAccount — spouse traditional bucket (#30)", () => {
  it("tradGrossSpouse: 0 explicitly produces rows byte-identical to omitting it (no-spouse path)", () => {
    const withZero = base({ tradGrossSpouse: 0 });
    const omitted  = base({});
    expect(withZero.rows).toEqual(omitted.rows);
    expect(withZero.depletionAge).toBe(omitted.depletionAge);
    expect(withZero.yearsSustained).toBe(omitted.yearsSustained);
    expect(withZero.endVal).toBe(omitted.endVal);
  });

  it("spouse RMD stays 0 until the SPOUSE's own age reaches spouseRmdStartAge (5yrs younger than primary)", () => {
    // currentAge 40 / spouseCurrentAge 35 ⇒ spouseAge = age - 5 for the loop's
    // primary `age`. Roth is large enough that spending never touches the trad
    // buckets, isolating the RMD-timing gate from the draw order.
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 100, rReal: 0.03,
      currentAge: 40, spouseCurrentAge: 35,
      tradGross: 0, tradGrossSpouse: 1_000_000, roth: 2_000_000, taxable: 0, hsa: 0,
      effectiveExpenses: 60_000, filingStatus: "single",
      rmdStartAge: 73, spouseRmdStartAge: 73,
    });
    // Primary is 73 here (spouse is 68) — spouse RMD must NOT have started yet.
    const at73 = rows.find(r => r.age === 73);
    expect(at73.rmdSpouse).toBe(0);
    // Every row before the spouse turns 73 (primary age < 78) must be 0.
    for (const r of rows.filter(r => r.age < 78)) {
      expect(r.rmdSpouse).toBe(0);
    }
    // Primary 78 ⇒ spouse turns 73 — the spouse RMD switches on.
    const at78 = rows.find(r => r.age === 78);
    expect(at78.rmdSpouse).toBeGreaterThan(0);
    const at80 = rows.find(r => r.age === 80);
    expect(at80.rmdSpouse).toBeGreaterThan(0);
  });

  it("combined household RMD (primary + spouse) is stacked and taxed exactly once", () => {
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 90, rReal: 0.03,
      currentAge: 60, spouseCurrentAge: 60,
      tradGross: 1_000_000, tradGrossSpouse: 1_000_000, roth: 500_000, taxable: 500_000, hsa: 0,
      effectiveExpenses: 60_000, filingStatus: "mfj",
      rmdStartAge: 73, spouseRmdStartAge: 73,
    });
    const at73 = rows.find(r => r.age === 73);
    expect(at73.rmd).toBeGreaterThan(0);
    expect(at73.rmdSpouse).toBeGreaterThan(0);
    expect(Number.isFinite(at73.tax)).toBe(true);
    expect(at73.tax).toBeGreaterThan(0);
    // The taxed-once invariant (component taxes sum to the row's total tax)
    // still holds with a spouse RMD bucket contributing to the stack.
    for (const r of rows) {
      expect(Math.round(r.inflowTax + r.convTax + r.rmdTax + r.drawTax)).toBe(r.tax);
    }
    // Per-account balances (now including tradSpouse) still sum to the row total.
    for (const r of rows) {
      expect(Math.abs((r.trad + r.tradSpouse + r.roth + r.taxable + r.hsa) - r.balEnd)).toBeLessThan(1e-6);
    }
  });
});

describe("buildRetirementWalkByAccount — spouse gap-year working/contributing (#30 / BUG-82)", () => {
  it("T2.1 — inert defaults are byte-identical (omitted vs explicit-default params)", () => {
    const over = { tradGrossSpouse: 1_000_000, spouseCurrentAge: 60, currentAge: 65, spouseRmdStartAge: 73 };
    const omitted = base({ ...over });
    const explicitDefaults = base({
      ...over,
      spouseRetirementAge: null,
      spouseContribByAge: {},
      spouseTaxableIncomeByAge: {},
      spouseIncomeFloorByAge: {},
    });
    expect(JSON.stringify(explicitDefaults.rows)).toBe(JSON.stringify(omitted.rows));
    expect(explicitDefaults.depletionAge).toBe(omitted.depletionAge);
    expect(explicitDefaults.yearsSustained).toBe(omitted.yearsSustained);
    expect(explicitDefaults.endVal).toBe(omitted.endVal);
  });

  it("T2.2 — gap contributions grow the spouse bucket", () => {
    const contribByAge = {};
    for (let age = 66; age <= 75; age++) contribByAge[age] = 20_000;
    const common = {
      tradGrossSpouse: 100_000, spouseCurrentAge: 55, currentAge: 65,
      roth: 5_000_000, taxable: 5_000_000, tradGross: 0, hsa: 0,
      effectiveExpenses: 60_000, endAge: 75,
    };
    const withContrib = base({ ...common, spouseContribByAge: contribByAge });
    const noContrib   = base({ ...common, spouseContribByAge: {} });
    const rowWith    = withContrib.rows.find(r => r.age === 75);
    const rowWithout = noContrib.rows.find(r => r.age === 75);
    expect(rowWith.tradSpouse).toBeGreaterThan(rowWithout.tradSpouse);
    const totalInjected = Object.values(contribByAge).reduce((s, v) => s + v, 0);
    // Loose lower bound: growth only ADDS on top of the raw injected dollars.
    expect(rowWith.tradSpouse - rowWithout.tradSpouse).toBeGreaterThanOrEqual(totalInjected - 1);
  });

  it("T2.3 — a 15-year gap materially grows the bucket, not frozen", () => {
    // Small "frozen pre-fix" seed + 15 years of ~$23,500 contributions, held out
    // through the whole gap (spouseRetirementAge is the spouse's own age, reached
    // the year AFTER the last gap-year contribution).
    const contribByAge = {};
    for (let age = 66; age <= 80; age++) contribByAge[age] = 23_500; // 15 years
    const seed = 5_000;
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 85, rReal: 0.03,
      currentAge: 65, spouseCurrentAge: 50,
      tradGross: 0, tradGrossSpouse: seed, roth: 5_000_000, taxable: 5_000_000, hsa: 0,
      effectiveExpenses: 60_000, filingStatus: "single", rmdStartAge: 73,
      spouseRetirementAge: 66, // spouse's own age; reached at primary age 65+(66-50)=81
      spouseContribByAge: contribByAge,
    });
    const atSpouseRetirement = rows.find(r => r.age === 81);
    expect(atSpouseRetirement.tradSpouse).toBeGreaterThan(seed * 2);
  });

  it("T2.4 — spouseRetirementAge equal to the spouse's age at walk start reproduces pooled/frozen (pre-fix) behavior", () => {
    const common = {
      startAge: 65, endAge: 95, rReal: 0.03,
      currentAge: 65, spouseCurrentAge: 60,
      tradGross: 300_000, tradGrossSpouse: 400_000, roth: 200_000, taxable: 300_000, hsa: 50_000,
      effectiveExpenses: 70_000, filingStatus: "single", rmdStartAge: 73, spouseRmdStartAge: 73,
    };
    const spouseAgeAtFirstRow = 60 + (66 - 65); // 61 — the spouse's age in the walk's very first row
    const withOptionA    = buildRetirementWalkByAccount({ ...common, spouseRetirementAge: spouseAgeAtFirstRow });
    const optionAOff     = buildRetirementWalkByAccount({ ...common, spouseRetirementAge: null });
    expect(JSON.stringify(withOptionA.rows)).toBe(JSON.stringify(optionAOff.rows));
    expect(withOptionA.depletionAge).toBe(optionAOff.depletionAge);
    expect(withOptionA.yearsSustained).toBe(optionAOff.yearsSustained);
  });

  it("T2.5 — spouse already retired at walk start ⇒ bucket pooled from year 1, no contributions", () => {
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 80, rReal: 0.03,
      currentAge: 65, spouseCurrentAge: 68, // spouse older, already retired before the walk starts
      tradGross: 0, tradGrossSpouse: 500_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 60_000, filingStatus: "single", rmdStartAge: 73, spouseRmdStartAge: 73,
      spouseRetirementAge: 60, // spouse's age at walk start (69) is already past this
      spouseContribByAge: {},  // not working — no contributions
    });
    const first = rows[0]; // age 66
    expect(first.tradDraw).toBeGreaterThan(0);       // only tradSpouse can fund spending — must be drawable
    expect(first.tradSpouse).toBeLessThan(500_000 * 1.03); // drawn down below pure growth
    for (const r of rows) expect(r.spouseContrib).toBe(0);
  });

  it("T2.6 — income floor lowers the gap-year draw, converges once the spouse retires", () => {
    const floorByAge = {};
    for (let age = 66; age <= 70; age++) floorByAge[age] = 20_000;
    const common = {
      startAge: 65, endAge: 80, rReal: 0.03,
      tradGross: 3_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 60_000, filingStatus: "single", rmdStartAge: 73,
    };
    const withFloor = buildRetirementWalkByAccount({ ...common, spouseIncomeFloorByAge: floorByAge });
    const noFloor   = buildRetirementWalkByAccount({ ...common, spouseIncomeFloorByAge: {} });
    for (let age = 66; age <= 70; age++) {
      const a = withFloor.rows.find(r => r.age === age).draw;
      const b = noFloor.rows.find(r => r.age === age).draw;
      expect(a).toBeLessThan(b);
      expect(a).toBeCloseTo(b - 20_000, 5);
    }
    for (let age = 71; age <= 80; age++) {
      const a = withFloor.rows.find(r => r.age === age)?.draw;
      const b = noFloor.rows.find(r => r.age === age)?.draw;
      if (a != null && b != null) expect(a).toBeCloseTo(b, 5);
    }
  });

  it("T2.7 — Option A holds the bucket out of the pool during gap years, then makes it available", () => {
    const spouseCurrentAge = 60, currentAge = 65;
    const spouseRetirementAge = 65; // spouse's own age; reached at primary age 70
    const floorByAge = {};
    // Fully offsets the (otherwise-crushing) spending need during the held-out
    // years so the small primary pool never has to depend on the held-out bucket.
    for (let age = 66; age <= 69; age++) floorByAge[age] = 80_000;
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 75, rReal: 0.03,
      currentAge, spouseCurrentAge,
      tradGross: 0, tradGrossSpouse: 1_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 80_000, filingStatus: "single",
      spouseRetirementAge, spouseIncomeFloorByAge: floorByAge,
    });
    let prevTradSp = 1_000_000;
    for (let age = 66; age <= 69; age++) {
      const r = rows.find(x => x.age === age);
      expect(r.draw).toBe(0);                                  // fully offset by the spouse floor
      expect(r.tradSpouse).toBeCloseTo(prevTradSp * 1.03, 2);   // pure growth — never touched by a draw
      prevTradSp = r.tradSpouse;
    }
    // Spouse retires at primary age 70 (spouseAge=65) — the income floor lapses,
    // real spending resumes, and since primary/roth/taxable/hsa are all 0, the
    // draw MUST come from the now-available tradSpouse.
    const r70 = rows.find(x => x.age === 70);
    expect(r70.draw).toBeGreaterThan(0);
    expect(r70.tradDraw).toBeGreaterThan(0);
    expect(r70.tradSpouse).toBeLessThan(prevTradSp * 1.03); // drawn down below pure growth
  });

  it("T2.7a — Option A fails CLOSED (held out), not open, when spouseAge can't be computed (CodeRabbit review fix)", () => {
    // spouseRetirementAge is set (spouseOptionA true) but spouseCurrentAge is
    // omitted, so spouseAgeFor(age) returns null every year. The pre-fix
    // condition (`spouseAge != null && spouseAge < spouseRetirementAge`)
    // evaluated to false on a null age and fell through to `: tradSp` —
    // silently exposing the WHOLE held-out balance as immediately drawable,
    // funding the spending need that should have caused a shortfall instead.
    // No income floor here (deliberately, unlike T2.7/T2.7b's fixtures) —
    // the ONLY funding source is the held-out spouse bucket, so whether it's
    // actually held out is the only thing that can determine the outcome.
    const { rows, depletionAge } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 70, rReal: 0.03,
      currentAge: 65, // spouseCurrentAge deliberately omitted
      tradGross: 0, tradGrossSpouse: 1_000_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 80_000, filingStatus: "single",
      spouseRetirementAge: 70,
    });
    // Held out correctly ⇒ nothing was available to fund the $80k need ⇒
    // immediate shortfall/depletion, NOT a successful draw from the spouse
    // bucket (which is what the pre-fix fail-open bug would have produced).
    expect(depletionAge).toBe(66);
    const r66 = rows.find(r => r.age === 66);
    expect(r66.tradDraw).toBe(0);
    expect(r66.tradSpouse).toBeCloseTo(1_000_000 * 1.03, 2); // pure growth, untouched by any draw
  });

  it("T2.7b — the spouse's final retirement-year contribution and first drawable year are the SAME year", () => {
    // Locks the intentional one-year overlap (contributed during the year,
    // retired at year end): the map convention is >= at the retirement age, not >.
    const spouseCurrentAge = 60, currentAge = 65;
    const spouseRetirementAge = 62; // spouse's own age; reached at primary age 67 — a true mid-walk transition
    const contribByAge = { 66: 20_000, 67: 20_000 }; // includes the retirement-year age itself
    const floorByAge = { 66: 80_000 }; // fully offsets the held-out year so it can't force a shortfall
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 70, rReal: 0.03,
      currentAge, spouseCurrentAge,
      tradGross: 0, tradGrossSpouse: 500_000, roth: 0, taxable: 0, hsa: 0,
      effectiveExpenses: 80_000, filingStatus: "single",
      spouseRetirementAge, spouseContribByAge: contribByAge, spouseIncomeFloorByAge: floorByAge,
    });
    const r67 = rows.find(r => r.age === 67);
    expect(r67.spouseContrib).toBe(20_000);   // contribution applied THIS retirement-year row
    expect(r67.tradDraw).toBeGreaterThan(0);  // AND the bucket was already drawable this same row
  });

  it("T2.8 — a spouse with a ZERO seed still gets an RMD once gap contributions have built a balance", () => {
    const contribByAge = {};
    for (let age = 66; age <= 79; age++) contribByAge[age] = 23_500;
    const { rows } = buildRetirementWalkByAccount({
      startAge: 65, endAge: 85, rReal: 0.03,
      currentAge: 50, spouseCurrentAge: 50, // aligned ages ⇒ spouseAge === primary age exactly
      tradGross: 0, tradGrossSpouse: 0, roth: 5_000_000, taxable: 5_000_000, hsa: 0,
      effectiveExpenses: 60_000, filingStatus: "single",
      spouseRetirementAge: 80, // spouse still working (held out) well past their own RMD start age
      spouseContribByAge: contribByAge, spouseRmdStartAge: 73,
    });
    // Spouse turns 73 while still in the gap (73 < spouseRetirementAge 80) — the OLD guard
    // (tradGrossSpouse > 0) would see a 0 seed and never fire; the LIVE-balance guard must.
    const at73 = rows.find(r => r.age === 73);
    expect(at73.rmdSpouse).toBeGreaterThan(0);
  });

  it("T2.9 — spouseContrib is reported per row and conservation holds", () => {
    const contribByAge = { 66: 15_000, 68: 25_000 };
    const { rows } = base({
      tradGrossSpouse: 200_000, spouseCurrentAge: 60, currentAge: 65,
      spouseContribByAge: contribByAge, endAge: 70,
    });
    for (const r of rows) {
      const expectedContrib = contribByAge[r.age] ?? 0;
      expect(r.spouseContrib).toBe(expectedContrib);
      const expected = r.balStart * 1.03 - r.draw - r.tax + r.spouseContrib;
      expect(Math.abs(r.balEnd - expected)).toBeLessThan(1e-6);
    }
    // The no-spouse base case still satisfies the ORIGINAL identity (spouseContrib
    // is always 0, so no "+ spouseContrib" term is actually needed there).
    const { rows: noSpouseRows } = base();
    for (const r of noSpouseRows) {
      expect(r.spouseContrib).toBe(0);
    }
  });

  it("T2.10 — the spouse's wages raise the bracket conversions stack on (and are never themselves double-taxed)", () => {
    const common = {
      tradGross: 500_000, roth: 0, taxable: 300_000, hsa: 0,
      effectiveExpenses: 0, filingStatus: "single", endAge: 66,
      conversionByAge: { 66: 50_000 },
    };
    const noWages   = base({ ...common, spouseTaxableIncomeByAge: {} });
    const withWages = base({ ...common, spouseTaxableIncomeByAge: { 66: 150_000 } });
    const a = noWages.rows.find(r => r.age === 66);
    const b = withWages.rows.find(r => r.age === 66);
    expect(b.convTax).toBeGreaterThan(a.convTax);   // conversion stacks on the higher wage-inclusive floor
    // The wages are never themselves withdrawn — confirm nothing double-taxes them:
    // inflowTax/rmdTax/drawTax stay 0 (no money events, no RMD, tax fully covered by
    // Taxable so no 401k gross-up draw), so the ENTIRE tax is the conversion's
    // incremental (stacked-bracket) tax, not a separate charge on the wages.
    expect(b.inflowTax).toBe(0);
    expect(b.rmdTax).toBe(0);
    expect(b.drawTax).toBe(0);
    expect(Math.round(b.tax - a.tax)).toBe(Math.round(b.convTax - a.convTax));
  });

  it("T2.11 — a working spouse's income SURPLUS is banked, not discarded (the critical correction)", () => {
    // Spouse net income ($95k) exceeds this gap year's expenses ($57k). The naive
    // `Math.max(0, effectiveExpenses - ssCash - penCash - spouseIncomeFloor)` pattern
    // this spec explicitly forbids ALSO floors `needed` at 0 here — so `needed` alone
    // can't distinguish banked from discarded. The unambiguous signature is the
    // taxable pool: nothing else touches it this row (no RMD/conversion/events,
    // tradGross=0), so its growth is exactly predictable — the ONLY way it can end
    // the year above pure growth of the starting balance is the banked surplus.
    const surplus = 95_000 - 57_000;
    const withSurplus = base({
      tradGross: 0, roth: 0, taxable: 100_000, hsa: 0,
      effectiveExpenses: 57_000, endAge: 66,
      spouseIncomeFloorByAge: { 66: 95_000 },
    });
    const noFloor = base({
      tradGross: 0, roth: 0, taxable: 100_000, hsa: 0,
      effectiveExpenses: 57_000, endAge: 66,
      spouseIncomeFloorByAge: {},
    });
    const a = withSurplus.rows.find(r => r.age === 66);
    const b = noFloor.rows.find(r => r.age === 66);

    expect(a.draw).toBe(0);        // floors at 0, never negative
    expect(b.draw).toBe(57_000);   // baseline sanity: unaffected without the floor

    const pureGrowth = 100_000 * 1.03;
    // The bug-locking assertion: a silent-discard bug leaves a.taxable === pureGrowth
    // exactly (the surplus vanishes). The fix banks it, so a.taxable is higher by
    // precisely the surplus.
    expect(a.taxable).toBeCloseTo(pureGrowth + surplus, 5);
    expect(a.taxable).toBeGreaterThan(pureGrowth);
    // And, for completeness: the with-surplus walk ends the year with strictly more
    // in the pool than the no-floor walk (which had to draw $57k out to live on) —
    // note this delta is NOT "the surplus" (it's confounded by b's own $57k draw,
    // roughly $95k total), which is exactly why the pureGrowth comparison above,
    // not this one, is the assertion that actually isolates the banking behavior.
    expect(a.taxable).toBeGreaterThan(b.taxable);
  });

  it("T2.12 — spouseContrib reports the 401k contribution AND a same-year banked surplus combined, and conservation still holds", () => {
    // Found during the Flow-Down/ledger reconciliation work: the banked surplus
    // (T2.11) is a real inflow to rTax that spouseContrib originally did NOT
    // report — meaning it was an unlabeled inflow, exactly the class of bug this
    // whole reconciliation effort exists to prevent. A working spouse commonly BOTH
    // contributes to their 401k AND has net cash left over in the same gap year, so
    // this locks the combined-in-one-row case, not just each piece in isolation.
    const contribByAge = { 66: 23_500 };
    const floorByAge   = { 66: 95_000 }; // exceeds the $57k spend need ⇒ $38k surplus
    const { rows } = base({
      tradGrossSpouse: 200_000, spouseCurrentAge: 60, currentAge: 65,
      spouseContribByAge: contribByAge, spouseIncomeFloorByAge: floorByAge,
      effectiveExpenses: 57_000, endAge: 66,
    });
    const r = rows.find(x => x.age === 66);
    const expectedSurplus = 95_000 - 57_000;
    // spouseContrib is now the SUM — the 401k deposit plus the banked cash surplus —
    // not just the 401k piece alone.
    expect(r.spouseContrib).toBe(23_500 + expectedSurplus);
    // The full conservation identity holds even with BOTH terms active in the same
    // row: balEnd == balStart*(1+rReal) − draw − tax + spouseContrib (draw is 0 here,
    // the surplus more than covers the year's spending need).
    expect(r.draw).toBe(0);
    const expectedBalEnd = r.balStart * 1.03 - r.draw - r.tax + r.spouseContrib;
    expect(Math.abs(r.balEnd - expectedBalEnd)).toBeLessThan(1e-6);
  });
});

describe("buildRetirementWalkByAccount — depletion", () => {
  it("reports a depletion age when spending outruns the portfolio", () => {
    const { depletionAge, yearsSustained } = base({
      tradGross: 50_000, roth: 0, taxable: 0, hsa: 0, effectiveExpenses: 60_000,
    });
    expect(depletionAge).not.toBeNull();
    expect(yearsSustained).toBeLessThan(5);
  });

  it("never depletes a portfolio that out-earns its draw (yearsSustained = Infinity)", () => {
    const { depletionAge, yearsSustained } = base({
      tradGross: 0, roth: 5_000_000, taxable: 0, hsa: 0, effectiveExpenses: 40_000,
    });
    expect(depletionAge).toBeNull();
    expect(yearsSustained).toBe(Infinity);
  });
});
