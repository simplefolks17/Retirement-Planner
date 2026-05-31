import { describe, it, expect } from "vitest";
import { calcEmployerMatch } from "../employer-match.js";

const flat = { matchMode: "flat", employerMatchPct: 3, matchFormulaCap: 6, matchFormulaRate: 50 };
const formula = { matchMode: "formula", employerMatchPct: 3, matchFormulaCap: 6, matchFormulaRate: 50 };

describe("calcEmployerMatch — flat mode", () => {
  it("returns 3% of salary regardless of employee contribution", () => {
    expect(calcEmployerMatch(100_000, 0, flat)).toBe(3_000);
    expect(calcEmployerMatch(100_000, 5_000, flat)).toBe(3_000);
    expect(calcEmployerMatch(100_000, 24_500, flat)).toBe(3_000);
  });

  it("scales with salary", () => {
    expect(calcEmployerMatch(50_000, 10_000, flat)).toBe(1_500);
  });
});

describe("calcEmployerMatch — formula mode", () => {
  it("50% of first 6% of $100K salary = $3,000 when employee contributes at least $6K", () => {
    expect(calcEmployerMatch(100_000, 10_000, formula)).toBe(3_000);
  });

  it("caps matched contribution at salary × cap%", () => {
    // employee contributes $20K but cap is 6% of $100K = $6K
    expect(calcEmployerMatch(100_000, 20_000, formula)).toBe(3_000);
  });

  it("reduces match when employee contributes less than the cap", () => {
    // employee contributes $3K (only 3% of $100K), formula gives 50% of $3K = $1,500
    expect(calcEmployerMatch(100_000, 3_000, formula)).toBe(1_500);
  });

  it("returns 0 when employee contributes nothing", () => {
    expect(calcEmployerMatch(100_000, 0, formula)).toBe(0);
  });
});
