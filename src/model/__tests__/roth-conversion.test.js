import { describe, it, expect } from "vitest";
import { calcConversionSim, findOptimalConversion, findOptimalConversionPlan } from "../roth-conversion.js";
import { marginalRate } from "../taxes.js";

const base = {
  conversionWindowYrs: 5,
  annualConversion: 30_000,
  returnRate: 5,
  retIncomeFloor: 25_000,
  filingStatus: "single",
  conversionTaxSource: "converted",
  tradGrossAtRetirement: 500_000,
  rothBalAtRet: 200_000,
  taxableBalAtRet: 100_000,
};

describe("calcConversionSim — zero window", () => {
  it("returns starting balances unchanged when conversionWindowYrs = 0", () => {
    const result = calcConversionSim({ ...base, conversionWindowYrs: 0 });
    expect(result.tradBal73).toBe(500_000);
    expect(result.rothBalEnd).toBe(200_000);
    expect(result.totalTax).toBe(0);
    expect(result.years).toHaveLength(0);
  });
});

describe("calcConversionSim — with conversion window", () => {
  it("returns correct number of year rows", () => {
    const result = calcConversionSim(base);
    expect(result.years).toHaveLength(5);
  });

  it("trad balance decreases after conversions", () => {
    const result = calcConversionSim(base);
    expect(result.tradBal73).toBeLessThan(500_000 * Math.pow(1.05, 6)); // less than no-conversion growth
  });

  it("Roth balance grows after conversions", () => {
    const result = calcConversionSim(base);
    expect(result.rothBalEnd).toBeGreaterThan(200_000);
  });

  it("totalTax > 0 when conversions happen", () => {
    const result = calcConversionSim(base);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("Scenario B (tax from taxable) gives higher Roth than Scenario A (tax from converted)", () => {
    const result = calcConversionSim(base);
    expect(result.rothBalEnd_tax).toBeGreaterThan(result.rothBalEnd_conv);
  });

  it("rothAdvantage = rothBalEnd_tax - rothBalEnd_conv", () => {
    const result = calcConversionSim(base);
    expect(result.rothAdvantage).toBe(result.rothBalEnd_tax - result.rothBalEnd_conv);
  });

  it("taxableBalEnd_tax < taxableBalEnd_conv (tax came from taxable in B)", () => {
    const result = calcConversionSim(base);
    expect(result.taxableBalEnd_tax).toBeLessThan(result.taxableBalEnd_conv);
  });

  it("conversionTaxSource switches which scenario drives primary fields", () => {
    const resultA = calcConversionSim({ ...base, conversionTaxSource: "converted" });
    const resultB = calcConversionSim({ ...base, conversionTaxSource: "taxable" });
    expect(resultA.rothBalEnd).toBe(resultA.rothBalEnd_conv);
    expect(resultB.rothBalEnd).toBe(resultB.rothBalEnd_tax);
  });
});

describe("calcConversionSim — per-year conversion targets (annualConversions)", () => {
  it("each year's conversion follows the per-year target array", () => {
    // Larger targets in early (low-income) years, smaller later — tests that the
    // model honors the array rather than the single annualConversion scalar.
    const annualConversions = [60_000, 60_000, 40_000, 20_000, 20_000];
    const result = calcConversionSim({ ...base, annualConversions });
    expect(result.years[0].conversion).toBe(60_000);
    expect(result.years[2].conversion).toBe(40_000);
    expect(result.years[4].conversion).toBe(20_000);
  });

  it("per-year target is still capped by the available trad balance", () => {
    // Target far exceeds the trad balance → conversion is clamped to trad, not target.
    const annualConversions = [10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000];
    const result = calcConversionSim({ ...base, annualConversions });
    expect(result.years[0].conversion).toBeLessThanOrEqual(500_000 * 1.05);
  });

  it("falls back to annualConversion scalar for years past the array length", () => {
    const annualConversions = [50_000]; // only one entry for a 5-year window
    const result = calcConversionSim({ ...base, annualConversions });
    expect(result.years[0].conversion).toBe(50_000);
    expect(result.years[1].conversion).toBe(base.annualConversion); // 30_000 fallback
  });

  it("omitting annualConversions reproduces the scalar behavior exactly", () => {
    const withArr  = calcConversionSim({ ...base, annualConversions: null });
    const scalar   = calcConversionSim(base);
    expect(withArr.totalTax).toBe(scalar.totalTax);
    expect(withArr.rothBalEnd).toBe(scalar.rothBalEnd);
  });
});

describe("calcConversionSim — per-year income floors (retIncomeFloors)", () => {
  it("higher floor in year 1 produces more tax than year 0 (SS income starts)", () => {
    // Guard for the App.jsx buildIncomeFloors off-by-one fix: when SS starts in conversion
    // year 1, retIncomeFloors[1] must include SS income (higher floor → higher marginal
    // rate on the same conversion amount → more tax). Floor must exceed the standard
    // deduction boundary to cross bracket: 40k floor + 30k conversion = 70k,
    // taxable = 70k − 16.1k = 53.9k → 22% bracket; year 0 floor=0 stays in 12%.
    const floors = [0, 40_000, 40_000, 40_000, 40_000]; // year 0: no SS, years 1-4: SS active
    const result = calcConversionSim({ ...base, retIncomeFloors: floors });
    // Year 0 (floor=0, 12% bracket) → tax < year 1 (floor=40k, 22% bracket)
    expect(result.years[0].tax).toBeLessThan(result.years[1].tax);
  });

  it("floor=0 in all years matches retIncomeFloor scalar behavior", () => {
    const scalarResult = calcConversionSim({ ...base, retIncomeFloor: 0 });
    const arrayResult  = calcConversionSim({ ...base, retIncomeFloors: [0, 0, 0, 0, 0] });
    expect(arrayResult.totalTax).toBe(scalarResult.totalTax);
  });
});

describe("calcConversionSim — bracket-accurate tax (BUG-29)", () => {
  // Single filer 2026: standard deduction 16,100; brackets: 10% 0-12,400 / 12% 12,400-50,400 /
  // 22% 50,400-105,700 / 24% 105,700-201,775 (taxable income = AGI - deduction).

  it("single-bracket conversion: new tax is within ±1 of the flat marginal proxy", () => {
    // floor=20,000 + conversion=5,000 → taxable = 9,000 → stays in 10% bracket.
    // Both methods should agree within ±1 (exact here: both 500).
    const result = calcConversionSim({
      ...base,
      conversionWindowYrs: 1,
      annualConversion: 5_000,
      retIncomeFloor: 20_000,
    });
    const year0 = result.years[0];
    const flatProxy = Math.round(year0.conversion * marginalRate(20_000 + year0.conversion, "single"));
    expect(Math.abs(year0.tax - flatProxy)).toBeLessThanOrEqual(1);
  });

  it("multi-bracket conversion: bracket-accurate totalTax is strictly less than flat-marginal proxy", () => {
    // floor=0, conversion=120,000 → taxable = 103,900 → spans 10/12/22% brackets.
    // Flat proxy (22% on the full amount) overstates the true bracket-stacked cost.
    const result = calcConversionSim({
      ...base,
      conversionWindowYrs: 3,
      annualConversion: 120_000,
      retIncomeFloor: 0,
      tradGrossAtRetirement: 800_000,
    });
    const flatProxySum = result.years.reduce(
      (sum, y) => sum + Math.round(y.conversion * marginalRate(0 + y.conversion, "single")),
      0,
    );
    expect(result.totalTax).toBeLessThan(flatProxySum);
  });

  it("state component: totalTax difference between retStateRate=0.05 and 0 equals round(Σ conversion × 0.05)", () => {
    const sharedArgs = {
      ...base,
      conversionWindowYrs: 3,
      annualConversion: 30_000,
      retIncomeFloor: 0,
    };
    const noState   = calcConversionSim({ ...sharedArgs, retStateRate: 0 });
    const withState = calcConversionSim({ ...sharedArgs, retStateRate: 0.05 });
    const convSum = noState.years.reduce((s, y) => s + y.conversion, 0);
    expect(withState.totalTax - noState.totalTax).toBe(Math.round(convSum * 0.05));
  });
});

describe("findOptimalConversion", () => {
  it("returns 0 when no benefit from converting", () => {
    const { optimalConversion } = findOptimalConversion({
      getNetBenefit: () => ({ rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 }),
    });
    expect(optimalConversion).toBe(0);
  });

  it("finds amount that maximizes net benefit after IRMAA", () => {
    // $50k: saves 20k, pays 5k tax → net 15k
    // $100k: saves 25k, pays 10k tax, 8k IRMAA → net 7k
    const { optimalConversion, optimalBenefit } = findOptimalConversion({
      step: 50_000,
      getNetBenefit: (amount) => {
        if (amount === 0)        return { rmdTaxSaved: 0,      totalTax: 0,      irmaaCost: 0     };
        if (amount === 50_000)   return { rmdTaxSaved: 20_000, totalTax: 5_000,  irmaaCost: 0     };
        if (amount === 100_000)  return { rmdTaxSaved: 25_000, totalTax: 10_000, irmaaCost: 8_000 };
        if (amount === 150_000)  return { rmdTaxSaved: 26_000, totalTax: 15_000, irmaaCost: 8_000 };
        return { rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 };
      },
    });
    expect(optimalConversion).toBe(50_000);
    expect(optimalBenefit).toBe(15_000);
  });

  it("subtracts acaLoss from objective — ACA cliff cost reduces the optimal amount", () => {
    // Without ACA: $100k is optimal (net 15k). With $20k ACA penalty at $100k, $50k wins (net 14k > 5k).
    // This guards against the bug where getNetBenefit returned acaLoss but optimizer ignored it.
    const { optimalConversion } = findOptimalConversion({
      step: 50_000,
      getNetBenefit: (amount) => {
        if (amount === 0)       return { rmdTaxSaved: 0,      totalTax: 0,      irmaaCost: 0, acaLoss: 0      };
        if (amount === 50_000)  return { rmdTaxSaved: 20_000, totalTax: 6_000,  irmaaCost: 0, acaLoss: 0      };
        if (amount === 100_000) return { rmdTaxSaved: 28_000, totalTax: 8_000,  irmaaCost: 0, acaLoss: 20_000 };
        return { rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0, acaLoss: 0 };
      },
    });
    // $100k gross net = 28k-8k-20k = 0; $50k = 20k-6k = 14k → $50k wins
    expect(optimalConversion).toBe(50_000);
  });

  it("acaLoss defaults to 0 when absent — backward compatible with old getNetBenefit shape", () => {
    // Old callers that don't return acaLoss should still work correctly.
    const { optimalConversion } = findOptimalConversion({
      step: 50_000,
      getNetBenefit: (amount) => {
        if (amount === 50_000) return { rmdTaxSaved: 10_000, totalTax: 2_000, irmaaCost: 0 };
        return { rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 };
      },
    });
    expect(optimalConversion).toBe(50_000);
  });
});

describe("findOptimalConversionPlan (timing + amount)", () => {
  it("picks the (startAge, amount) pair that maximizes net benefit", () => {
    // Best cell is (startAge 66, amount 50k): net 30k. A later start is worse here.
    const { optimalStartAge, optimalConversion, optimalBenefit } = findOptimalConversionPlan({
      startAgeRange: [66, 68], step: 50_000, maxSearch: 100_000, ageStep: 1,
      getNetBenefit: (startAge, amount) => {
        if (amount === 0) return { rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 };
        if (startAge === 66 && amount === 50_000)  return { rmdTaxSaved: 40_000, totalTax: 10_000, irmaaCost: 0 };
        if (startAge === 66 && amount === 100_000) return { rmdTaxSaved: 45_000, totalTax: 25_000, irmaaCost: 0 };
        if (startAge === 67 && amount === 50_000)  return { rmdTaxSaved: 35_000, totalTax: 10_000, irmaaCost: 0 };
        return { rmdTaxSaved: 10_000, totalTax: 9_000, irmaaCost: 0 };
      },
    });
    expect(optimalStartAge).toBe(66);
    expect(optimalConversion).toBe(50_000);
    expect(optimalBenefit).toBe(30_000);
  });

  it("prefers a later start when it nets more (timing actually matters)", () => {
    const { optimalStartAge, optimalConversion } = findOptimalConversionPlan({
      startAgeRange: [65, 68], step: 50_000, maxSearch: 50_000, ageStep: 1,
      getNetBenefit: (startAge, amount) => {
        if (amount === 0) return { rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 };
        // Each later start year is strictly better (e.g. avoids an IRMAA/ACA cliff early).
        return { rmdTaxSaved: 30_000, totalTax: 5_000, irmaaCost: Math.max(0, (68 - startAge) * 3_000) };
      },
    });
    expect(optimalStartAge).toBe(68);
    expect(optimalConversion).toBe(50_000);
  });

  it("returns the zero-conversion baseline when nothing beats not converting", () => {
    const { optimalStartAge, optimalConversion, optimalBenefit } = findOptimalConversionPlan({
      startAgeRange: [66, 70], step: 25_000, maxSearch: 75_000,
      getNetBenefit: (_s, amount) => amount === 0
        ? { rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 }      // not converting nets exactly 0
        : { rmdTaxSaved: 0, totalTax: 5_000, irmaaCost: 0 }, // any conversion is a net loss
    });
    expect(optimalConversion).toBe(0);
    expect(optimalStartAge).toBe(66); // earliest start, amount 0
    expect(optimalBenefit).toBe(0);
  });

  it("guards a non-positive step/ageStep (no infinite loop) → no-conversion fallback", () => {
    const r1 = findOptimalConversionPlan({
      startAgeRange: [66, 70], step: 0,
      getNetBenefit: () => ({ rmdTaxSaved: 1, totalTax: 0, irmaaCost: 0 }),
    });
    expect(r1.optimalConversion).toBe(0);
    const r2 = findOptimalConversionPlan({
      startAgeRange: [66, 70], ageStep: 0,
      getNetBenefit: () => ({ rmdTaxSaved: 1, totalTax: 0, irmaaCost: 0 }),
    });
    expect(r2.optimalConversion).toBe(0);
  });

  it("a missing / non-array startAgeRange falls back instead of throwing", () => {
    const gnb = () => ({ rmdTaxSaved: 0, totalTax: 0, irmaaCost: 0 });
    expect(() => findOptimalConversionPlan({ getNetBenefit: gnb })).not.toThrow();
    const r = findOptimalConversionPlan({ startAgeRange: null, getNetBenefit: gnb });
    expect(r.optimalConversion).toBe(0);
    expect(r.optimalStartAge).toBe(0);
  });
});
