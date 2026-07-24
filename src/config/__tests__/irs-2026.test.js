import { describe, it, expect } from "vitest";
import {
  TAX_DATA_2026,
  FED_BRACKETS_2026,
  LTCG_BRACKETS_2026,
  ROTH_PHASEOUT_2026,
  TRAD_401K_LIMIT_2026,
  CATCHUP_401K_2026,
  ROTH_IRA_LIMIT_2026,
  CATCHUP_ROTH_2026,
  HSA_LIMIT_2026,
  HSA_FAMILY_LIMIT_2026,
  LIMIT_415C_2026,
  LIMIT_415C_CATCHUP_2026,
  CATCHUP_AGE,
  FICA_RATE,
  FICA_WAGE_BASE,
  SS_TAX_RATE,
  MEDICARE_RATE,
  ADDL_MEDICARE_RATE,
  ADDL_MEDICARE_THRESHOLD,
  RMD_START_AGE,
  SS_FRA,
  SS_MIN_CLAIM_AGE,
  SS_MAX_CLAIM_AGE,
  SS_AIME_YEARS,
  SS_FACTORS,
  SS_BEND1,
  SS_BEND2,
  RMD_TABLE3,
  STATE_TAX,
  RETIREMENT_STATE_TAX,
  ACA_FPL_2026,
  ACA_CLIFF_PCT,
  IRMAA_BRACKETS_2026,
  MEDICARE_AGE,
  ASSUMPTIONS,
} from "../irs-2026.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants-integrity guard. This file does NOT re-verify every dollar amount
// against the IRS (that is the annual web-sourced audit — see docs/FINANCIAL-MODEL.md
// "IRS Annual Update Procedure"). Instead it enforces STRUCTURE + INTERNAL
// CONSISTENCY so a malformed or out-of-order edit during a yearly refresh fails
// loudly: ascending brackets, contiguous ranges, monotonic tables, rates in band,
// derived relationships (e.g. FICA combined = SS + Medicare). It value-locks ONLY
// figures that are independently verified or statutorily stable, so it can't
// silently entrench a stale dollar value the audit hasn't confirmed.
//
// Motivation: FICA_WAGE_BASE once shipped carrying the 2024 value labeled "2026".
// ─────────────────────────────────────────────────────────────────────────────

const FILING_STATUSES = ["single", "mfj", "mfs", "hoh"];

describe("irs-2026 — verified / statutorily-stable value locks", () => {
  it("FICA wage base is the 2026 SSA figure (regression: was the stale 2024 168,600)", () => {
    expect(FICA_WAGE_BASE).toBe(184_500);
  });

  it("RMD start age is 73 (SECURE 2.0)", () => {
    expect(RMD_START_AGE).toBe(73);
  });

  it("SS full retirement age is 67 (born ≥ 1960)", () => {
    expect(SS_FRA).toBe(67);
    expect(SS_MIN_CLAIM_AGE).toBe(62);
    expect(SS_MAX_CLAIM_AGE).toBe(70);
  });

  it("anchors a few well-known Uniform Lifetime (Table III) divisors", () => {
    // Statutory IRS table, stable since the 2022 update.
    expect(RMD_TABLE3[73]).toBe(26.5);
    expect(RMD_TABLE3[80]).toBe(20.2);
    expect(RMD_TABLE3[90]).toBe(12.2);
  });

  it("statutory ages/percentages", () => {
    expect(CATCHUP_AGE).toBe(50);
    expect(MEDICARE_AGE).toBe(65);
    expect(ACA_CLIFF_PCT).toBe(400);
    expect(SS_AIME_YEARS).toBe(35);
    expect(ASSUMPTIONS.SS_TAXABLE_PCT).toBe(0.85);
  });
});

describe("irs-2026 — verified 2026 published values (audit 2026-06-17)", () => {
  // Web-verified against IRS / SSA primary sources during the 2026-06-17 audit.
  // Locked so a stale carry-over (the FICA_WAGE_BASE failure mode) fails loudly next refresh.
  it("contribution limits (IRS N-25-67 / Rev. Proc. 2025-19)", () => {
    expect(TRAD_401K_LIMIT_2026).toBe(24_500);
    expect(CATCHUP_401K_2026).toBe(8_000);
    expect(LIMIT_415C_2026).toBe(72_000);
    expect(LIMIT_415C_CATCHUP_2026).toBe(80_000); // 72,000 + 8,000 age-50 catch-up
    expect(HSA_LIMIT_2026).toBe(4_400);
    expect(HSA_FAMILY_LIMIT_2026).toBe(8_750); // family-HDHP ceiling; tracker's 8,550 was the stale 2025 figure
    expect(ROTH_IRA_LIMIT_2026).toBe(7_500);
  });

  it("standard deductions (IRS Rev. Proc. 2025-32, OBBB)", () => {
    expect(TAX_DATA_2026.single.deduction).toBe(16_100);
    expect(TAX_DATA_2026.mfj.deduction).toBe(32_200);
    expect(TAX_DATA_2026.hoh.deduction).toBe(24_150);
  });

  it("SS PIA bend points (2026 eligibility year)", () => {
    expect(SS_BEND1).toBe(1_286);
    expect(SS_BEND2).toBe(7_749);
  });

  it("LTCG 0% bracket tops (IRS Rev. Proc. 2025-32)", () => {
    expect(LTCG_BRACKETS_2026.single[0].max).toBe(49_450);
    expect(LTCG_BRACKETS_2026.mfj[0].max).toBe(98_900);
    expect(LTCG_BRACKETS_2026.hoh[0].max).toBe(66_200);
  });

  it("Roth phase-out starts (IRS N-25-67)", () => {
    expect(ROTH_PHASEOUT_2026.single.start).toBe(153_000);
    expect(ROTH_PHASEOUT_2026.mfj.start).toBe(242_000);
  });

  it("ACA FPL holds the 2025-published set (governs 2026 coverage — prior-year rule)", () => {
    expect(ACA_FPL_2026[1]).toBe(15_650);
    expect(ACA_FPL_2026[4]).toBe(32_150);
  });

  it("IRMAA 2026 thresholds + combined Part B+D surcharges", () => {
    expect(IRMAA_BRACKETS_2026.single[1].magi).toBe(109_000);
    expect(IRMAA_BRACKETS_2026.mfj[1].magi).toBe(218_000);
    expect(IRMAA_BRACKETS_2026.single[1].annualSurcharge).toBe(1_148);
    expect(IRMAA_BRACKETS_2026.single[5].annualSurcharge).toBe(6_936);
  });
});

describe("irs-2026 — FICA rate consistency", () => {
  it("combined legacy rate equals SS + Medicare employee shares", () => {
    expect(FICA_RATE).toBeCloseTo(SS_TAX_RATE + MEDICARE_RATE, 10); // 0.062 + 0.0145 = 0.0765
  });

  it("every FICA rate is a fraction in (0, 1)", () => {
    for (const r of [FICA_RATE, SS_TAX_RATE, MEDICARE_RATE, ADDL_MEDICARE_RATE]) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    }
  });

  it("additional-Medicare thresholds are positive and mfj ≥ single", () => {
    for (const s of FILING_STATUSES) expect(ADDL_MEDICARE_THRESHOLD[s]).toBeGreaterThan(0);
    expect(ADDL_MEDICARE_THRESHOLD.mfj).toBeGreaterThanOrEqual(ADDL_MEDICARE_THRESHOLD.single);
  });
});

describe("irs-2026 — federal tax brackets", () => {
  it("each filing status has contiguous, strictly ascending brackets ending at Infinity", () => {
    for (const s of FILING_STATUSES) {
      const b = TAX_DATA_2026[s].brackets;
      expect(b[0].min).toBe(0);
      expect(b[b.length - 1].max).toBe(Infinity);
      for (let i = 0; i < b.length; i++) {
        expect(b[i].max).toBeGreaterThan(b[i].min);     // each band has width
        if (i > 0) {
          expect(b[i].min).toBe(b[i - 1].max);          // contiguous (no gap/overlap)
          expect(b[i].rate).toBeGreaterThan(b[i - 1].rate); // strictly progressive
        }
      }
    }
  });

  it("bracket rates are exactly the published FED_BRACKETS_2026 set", () => {
    const asFractions = FED_BRACKETS_2026.map((p) => p / 100);
    for (const s of FILING_STATUSES) {
      expect(TAX_DATA_2026[s].brackets.map((x) => x.rate)).toEqual(asFractions);
    }
  });

  it("standard deductions are positive and mfj = 2× single", () => {
    for (const s of FILING_STATUSES) expect(TAX_DATA_2026[s].deduction).toBeGreaterThan(0);
    expect(TAX_DATA_2026.mfj.deduction).toBe(TAX_DATA_2026.single.deduction * 2);
    expect(TAX_DATA_2026.mfs.deduction).toBe(TAX_DATA_2026.single.deduction);
  });
});

describe("irs-2026 — long-term capital gains brackets", () => {
  it("ascend in threshold, end at Infinity, and use the 0/15/20 rates", () => {
    for (const s of FILING_STATUSES) {
      const b = LTCG_BRACKETS_2026[s];
      expect(b.map((x) => x.rate)).toEqual([0.0, 0.15, 0.2]);
      expect(b[b.length - 1].max).toBe(Infinity);
      for (let i = 1; i < b.length; i++) expect(b[i].max).toBeGreaterThan(b[i - 1].max);
    }
  });
});

describe("irs-2026 — Roth phase-out ranges", () => {
  it("start ≤ end for every filing status", () => {
    for (const s of FILING_STATUSES) {
      const { start, end } = ROTH_PHASEOUT_2026[s];
      expect(end).toBeGreaterThanOrEqual(start);
    }
  });
});

describe("irs-2026 — contribution limits", () => {
  it("are positive and internally ordered", () => {
    for (const v of [TRAD_401K_LIMIT_2026, CATCHUP_401K_2026, ROTH_IRA_LIMIT_2026,
                     CATCHUP_ROTH_2026, HSA_LIMIT_2026, LIMIT_415C_2026, LIMIT_415C_CATCHUP_2026]) {
      expect(v).toBeGreaterThan(0);
    }
    // 415(c) overall cap must accommodate the elective deferral, and the
    // catch-up variant must exceed the base.
    expect(LIMIT_415C_2026).toBeGreaterThanOrEqual(TRAD_401K_LIMIT_2026);
    expect(LIMIT_415C_CATCHUP_2026).toBeGreaterThan(LIMIT_415C_2026);
    // Family HDHP ceiling must exceed the self-only limit.
    expect(HSA_FAMILY_LIMIT_2026).toBeGreaterThan(HSA_LIMIT_2026);
  });
});

describe("irs-2026 — Social Security factors & PIA", () => {
  it("claiming factors are monotonic, = 1.0 at FRA, < 1 early and > 1 delayed", () => {
    for (let age = SS_MIN_CLAIM_AGE; age < SS_MAX_CLAIM_AGE; age++) {
      expect(SS_FACTORS[age + 1]).toBeGreaterThan(SS_FACTORS[age]); // strictly increasing
    }
    expect(SS_FACTORS[SS_FRA]).toBe(1.0);
    expect(SS_FACTORS[SS_MIN_CLAIM_AGE]).toBeLessThan(1);
    expect(SS_FACTORS[SS_MAX_CLAIM_AGE]).toBeGreaterThan(1);
  });

  it("PIA bend points ascend and PIA factors descend", () => {
    expect(SS_BEND2).toBeGreaterThan(SS_BEND1);
    expect(ASSUMPTIONS.PIA_FACTOR_1).toBeGreaterThan(ASSUMPTIONS.PIA_FACTOR_2);
    expect(ASSUMPTIONS.PIA_FACTOR_2).toBeGreaterThan(ASSUMPTIONS.PIA_FACTOR_3);
  });
});

describe("irs-2026 — RMD Uniform Lifetime table", () => {
  it("divisors are positive and strictly decrease as age increases", () => {
    const ages = Object.keys(RMD_TABLE3).map(Number).sort((a, b) => a - b);
    expect(ages[0]).toBe(RMD_START_AGE);
    for (let i = 0; i < ages.length; i++) {
      expect(RMD_TABLE3[ages[i]]).toBeGreaterThan(0);
      if (i > 0) expect(RMD_TABLE3[ages[i]]).toBeLessThan(RMD_TABLE3[ages[i - 1]]);
    }
  });
});

describe("irs-2026 — IRMAA brackets", () => {
  it("first tier is 0/0 and both MAGI and surcharge ascend", () => {
    for (const s of ["single", "mfj"]) {
      const b = IRMAA_BRACKETS_2026[s];
      expect(b[0].magi).toBe(0);
      expect(b[0].annualSurcharge).toBe(0);
      for (let i = 1; i < b.length; i++) {
        expect(b[i].magi).toBeGreaterThan(b[i - 1].magi);
        expect(b[i].annualSurcharge).toBeGreaterThan(b[i - 1].annualSurcharge);
      }
    }
    // mfj thresholds are roughly double single's (per IRMAA rules)
    expect(IRMAA_BRACKETS_2026.mfj[1].magi).toBeGreaterThan(IRMAA_BRACKETS_2026.single[1].magi);
  });
});

describe("irs-2026 — ACA federal poverty levels", () => {
  it("increase with household size by a constant per-person increment", () => {
    const sizes = Object.keys(ACA_FPL_2026).map(Number).sort((a, b) => a - b);
    const increments = [];
    for (let i = 1; i < sizes.length; i++) {
      const inc = ACA_FPL_2026[sizes[i]] - ACA_FPL_2026[sizes[i - 1]];
      expect(inc).toBeGreaterThan(0);
      increments.push(inc);
    }
    // every step adds the same per-person amount
    expect(new Set(increments).size).toBe(1);
  });
});

describe("irs-2026 — state tax tables", () => {
  it("working + retirement tables cover the same 51 jurisdictions", () => {
    const a = Object.keys(STATE_TAX).sort();
    const b = Object.keys(RETIREMENT_STATE_TAX).sort();
    expect(a).toEqual(b);
    expect(a.length).toBe(51); // 50 states + DC
  });

  it("every rate is a plausible fraction in [0, 0.15]", () => {
    for (const table of [STATE_TAX, RETIREMENT_STATE_TAX]) {
      for (const { rate } of Object.values(table)) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it("no-income-tax states are 0 in BOTH tables", () => {
    for (const s of ["AK", "FL", "NV", "SD", "TX", "WY", "TN"]) {
      expect(STATE_TAX[s].rate).toBe(0);
      expect(RETIREMENT_STATE_TAX[s].rate).toBe(0);
    }
  });
});

describe("irs-2026 — model assumptions sanity", () => {
  it("fractional assumptions are in (0, 1) and MONTHS_PER_YEAR is 12", () => {
    for (const k of ["LTCG_DRAG_PROXY", "SS_TAXABLE_PCT", "SPOUSAL_BENEFIT_PCT",
                     "DEFAULT_RETIREMENT_EXPENSE_RATE", "MAX_COMBINED_MARGINAL_RATE",
                     "PIA_FACTOR_1", "PIA_FACTOR_2", "PIA_FACTOR_3"]) {
      expect(ASSUMPTIONS[k]).toBeGreaterThan(0);
      expect(ASSUMPTIONS[k]).toBeLessThan(1);
    }
    expect(ASSUMPTIONS.MONTHS_PER_YEAR).toBe(12);
  });
});
