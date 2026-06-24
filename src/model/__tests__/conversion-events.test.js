import { describe, it, expect } from "vitest";
import { applyConversionEvents, totalConversionRequested } from "../conversion-events.js";
import { runSimulation } from "../simulation.js";
import { calcEmployerMatch } from "../employer-match.js";
import { stackedIncomeTax } from "../taxes.js";
import { EARLY_WITHDRAWAL_AGE, EARLY_WITHDRAWAL_PENALTY } from "../../config/irs-2026.js";

const em = (s, c) => calcEmployerMatch(s, c,
  { matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3 });

// Base accumulation state with a sizeable trad balance and a taxable cushion so the
// default tax-funding path (from taxable) is exercised. No ongoing contributions →
// growth-only, so the conversion conservation math is easy to isolate.
const base = () => ({
  totalYears: 40, currentAge: 40, currentIncome: 120_000, incomeGrowth: 3,
  filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 5,
  bal401k: 300_000, balRoth: 50_000, balTaxable: 200_000, balHSA: 0,
  contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
  contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
  calcEmployerMatchFn: em,
});

// ── applyConversionEvents (pure helper) ───────────────────────────────────────
describe("applyConversionEvents", () => {
  it("sums only the amounts at the matching age", () => {
    const evs = [{ age: 50, amount: 20_000 }, { age: 50, amount: 5_000 }, { age: 55, amount: 9_000 }];
    expect(applyConversionEvents(evs, 50).convAmount).toBe(25_000);
    expect(applyConversionEvents(evs, 55).convAmount).toBe(9_000);
    expect(applyConversionEvents(evs, 60).convAmount).toBe(0);
  });
  it("empty / negative-guarded", () => {
    expect(applyConversionEvents([], 50).convAmount).toBe(0);
    expect(applyConversionEvents([{ age: 50, amount: -100 }], 50).convAmount).toBe(0);
    expect(totalConversionRequested([{ age: 1, amount: 10 }, { age: 2, amount: 20 }])).toBe(30);
  });

  it("ignores non-finite / missing amounts instead of propagating NaN", () => {
    expect(applyConversionEvents([{ age: 50, amount: undefined }], 50).convAmount).toBe(0);
    expect(applyConversionEvents([{ age: 50, amount: NaN }, { age: 50, amount: 20_000 }], 50).convAmount).toBe(20_000);
    expect(totalConversionRequested([{ age: 50, amount: NaN }, { age: 51, amount: 5_000 }])).toBe(5_000);
    expect(Number.isFinite(totalConversionRequested([{ age: 50 }]))).toBe(true);
  });
});

// ── runSimulation working-year conversions ────────────────────────────────────
describe("runSimulation with conversionEvents", () => {
  it("empty conversionEvents produces identical output to no-param call (golden-master safe)", () => {
    const withEmpty = runSimulation({ ...base(), conversionEvents: [], stateRate: 0.05 });
    const noParam   = runSimulation(base());
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(noParam));
  });

  it("conserves principal (rule 2b): Δtrad = -C, Roth rises by C minus the tax leak", () => {
    const C = 40_000;
    const rows = runSimulation({ ...base(), conversionEvents: [{ age: 50, amount: C }] });
    const noConv = runSimulation(base());
    const at = (rs) => rs.find(r => r.age === 50);
    const w = at(rows), n = at(noConv);

    // Trad drops by exactly the converted principal (vs the no-conversion run).
    expect(n.tradGross - w.tradGross).toBe(C);
    // Tax funded from taxable (cushion is ample) → full principal lands in Roth.
    expect(w["Roth IRA"] - n["Roth IRA"]).toBe(C);
    // Taxable drops by the tax; no penalty (tax fully covered by taxable).
    expect(n["Taxable"] - w["Taxable"]).toBe(w.convEventTax);
    expect(w.convEventPenalty).toBe(0);
  });

  it("charges tax = stackedIncomeTax(C, wage floor) on the year's ordinary income", () => {
    const C = 40_000;
    const b = base();
    const rows = runSimulation({ ...b, conversionEvents: [{ age: 50, amount: C }], stateRate: 0 });
    const row = rows.find(r => r.age === 50);
    // Reconstruct the year-50 wage floor (no deductions in this base → grown income).
    const growthYears = 50 - b.currentAge;
    const floor = b.currentIncome * Math.pow(1 + b.incomeGrowth / 100, growthYears);
    const expectTax = Math.round(stackedIncomeTax(C, floor, "single", 0));
    expect(row.convEventTax).toBe(expectTax);
    expect(row.convEvent).toBe(C);
  });

  it("under-59½ with no taxable cushion charges the 10% early-withdrawal penalty", () => {
    const C = 30_000;
    const noCushion = { ...base(), balTaxable: 0 };
    const rows = runSimulation({ ...noCushion, conversionEvents: [{ age: 50, amount: C }] });
    const n = runSimulation(noCushion);
    const w = rows.find(r => r.age === 50);
    const nb = n.find(r => r.age === 50);
    expect(50).toBeLessThan(EARLY_WITHDRAWAL_AGE);
    // Tax came entirely from the converted amount (taxable=0) → penalty applies.
    expect(w.convEventPenalty).toBeGreaterThan(0);
    // Penalty is 10% of the ordinary tax (= tax-from-converted, since taxable=0).
    const impliedOrdinaryTax = w.convEventTax - w.convEventPenalty;
    expect(w.convEventPenalty).toBeCloseTo(EARLY_WITHDRAWAL_PENALTY * impliedOrdinaryTax, 0);
    // Roth deposit is reduced by tax + penalty (no dollar conjured).
    expect(w["Roth IRA"] - nb["Roth IRA"]).toBe(C - w.convEventTax);
  });

  it("over-59½ never charges the penalty even when funded from the converted amount", () => {
    const C = 30_000;
    const noCushion = { ...base(), balTaxable: 0 };
    const rows = runSimulation({ ...noCushion, conversionEvents: [{ age: 62, amount: C }] });
    const w = rows.find(r => r.age === 62);
    expect(62).toBeGreaterThanOrEqual(EARLY_WITHDRAWAL_AGE);
    expect(w.convEventPenalty).toBe(0);
  });

  it("caps the conversion at the live Traditional balance", () => {
    const huge = 10_000_000;
    const b = base();
    const rows = runSimulation({ ...b, conversionEvents: [{ age: 50, amount: huge }] });
    const noConv = runSimulation(b);
    const w = rows.find(r => r.age === 50);
    const n = noConv.find(r => r.age === 50);
    // Converted no more than was in the account; trad floors at ~0, never negative.
    expect(w.convEvent).toBeLessThanOrEqual(n.tradGross);
    expect(w.tradGross).toBeGreaterThanOrEqual(0);
  });

  it("does not perturb the year's growth figure (conversion is a transfer, not earnings)", () => {
    const C = 40_000;
    const rows = runSimulation({ ...base(), conversionEvents: [{ age: 50, amount: C }] });
    const noConv = runSimulation(base());
    expect(rows.find(r => r.age === 50).growth).toBe(noConv.find(r => r.age === 50).growth);
    expect(rows.find(r => r.age === 50).tradGrowth).toBe(noConv.find(r => r.age === 50).tradGrowth);
  });

  it("carries forward: all three seed balances reflect the event at retirement", () => {
    const C = 50_000;
    const rows = runSimulation({ ...base(), conversionEvents: [{ age: 50, amount: C }] });
    const noConv = runSimulation(base());
    const ret = (rs) => rs.find(r => r.age === 65);
    const w = ret(rows), n = ret(noConv);
    // Lower trad (converted out, compounded), higher Roth, lower taxable (paid the tax).
    expect(w.tradGross).toBeLessThan(n.tradGross);
    expect(w["Roth IRA"]).toBeGreaterThan(n["Roth IRA"]);
    expect(w["Taxable"]).toBeLessThan(n["Taxable"]);
  });

  it("a conversion that crosses the LTCG bracket raises that year's cap-gains drag", () => {
    // Low income ($30k single) → 0% LTCG without a conversion. A big conversion pushes
    // taxable income to $230k → 15% LTCG for the year, so the taxable account's growth
    // is dragged. currentAge 49 → age 50 is year 1, so taxableBase == balTaxable exactly.
    const ltcgBase = {
      totalYears: 1, currentAge: 49, currentIncome: 30_000, incomeGrowth: 0,
      filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 0, returnRate: 5,
      bal401k: 300_000, balRoth: 0, balTaxable: 2_000_000, balHSA: 0,
      contrib401k: 0, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
      calcEmployerMatchFn: em,
    };
    // Roth/HSA growth is 0 here (no balances/contribs), so taxable growth = growth − tradGrowth.
    const taxableGrowthOf = (rows) => { const r = rows.find(x => x.age === 50); return r.growth - r.tradGrowth; };
    const small = runSimulation({ ...ltcgBase, conversionEvents: [{ age: 50, amount: 5_000 }] });   // stays 0%
    const large = runSimulation({ ...ltcgBase, conversionEvents: [{ age: 50, amount: 200_000 }] });  // crosses to 15%
    expect(taxableGrowthOf(small)).toBe(2_000_000 * 0.05);          // 0% LTCG → full growth
    expect(taxableGrowthOf(large)).toBe(2_000_000 * 0.05 * 0.85);   // 15% LTCG drag applied
    expect(taxableGrowthOf(large)).toBeLessThan(taxableGrowthOf(small));
  });

  it("MFJ floor uses combined household income (higher floor → higher conversion tax)", () => {
    const C = 40_000;
    // Modest primary income, large spouse income: for MFJ the conversion stacks on top
    // of the combined floor and lands in a much higher bracket than the single case.
    const lowPrimary = { ...base(), currentIncome: 40_000 };
    const single = runSimulation({ ...lowPrimary, filingStatus: "single",
      conversionEvents: [{ age: 50, amount: C }] });
    const mfj = runSimulation({ ...lowPrimary, filingStatus: "mfj", spouseIncome: 250_000,
      conversionEvents: [{ age: 50, amount: C }] });
    expect(mfj.find(r => r.age === 50).convEventTax)
      .toBeGreaterThan(single.find(r => r.age === 50).convEventTax);
  });
});
