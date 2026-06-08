import { describe, it, expect } from "vitest";
import { sumAccountRow } from "../accumulation.js";

describe("sumAccountRow", () => {
  it("sums the four account keys on a full row", () => {
    const row = { age: 65, "Trad 401k": 100_000, "Roth IRA": 50_000, "Taxable": 30_000, "HSA": 20_000 };
    expect(sumAccountRow(row)).toBe(200_000);
  });

  it("coalesces missing keys to 0 (partial rows total correctly)", () => {
    expect(sumAccountRow({ "Roth IRA": 25_000, "HSA": 10_000 })).toBe(35_000);
    expect(sumAccountRow({})).toBe(0);
  });

  it("ignores non-account keys", () => {
    const row = { age: 70, tradGross: 999_999, "Trad 401k": 10_000, "Taxable": 5_000 };
    expect(sumAccountRow(row)).toBe(15_000);
  });
});
