import { describe, it, expect } from "vitest";
import { fmt, fmtPct } from "../formatters.js";

describe("fmt — currency abbreviation", () => {
  it("formats values below $1K as plain integers", () => {
    expect(fmt(0)).toBe("$0");
    expect(fmt(1)).toBe("$1");
    expect(fmt(47)).toBe("$47");
    expect(fmt(999)).toBe("$999");
  });

  it("formats values >= $1K with K suffix and no decimal", () => {
    expect(fmt(1_000)).toBe("$1K");
    expect(fmt(1_500)).toBe("$2K");
    expect(fmt(118_198)).toBe("$118K");
    expect(fmt(999_499)).toBe("$999K");
  });

  it("formats values >= $1M with M suffix and exactly two decimals", () => {
    expect(fmt(1_000_000)).toBe("$1.00M");
    expect(fmt(1_500_000)).toBe("$1.50M");
    expect(fmt(3_568_998)).toBe("$3.57M");
    expect(fmt(10_000_000)).toBe("$10.00M");
  });

  it("never produces commas in output", () => {
    [999, 1_000, 57_377, 999_999, 1_000_000, 3_568_998].forEach(n => {
      expect(fmt(n)).not.toContain(",");
    });
  });

  it("never produces bare M/K that could be confused with adjacent text", () => {
    // The M suffix always follows digits and a decimal: $X.XXM
    expect(fmt(3_568_998)).toMatch(/^\$\d+\.\d{2}M$/);
    // The K suffix always follows digits with no decimal: $XXXK
    expect(fmt(118_198)).toMatch(/^\$\d+K$/);
  });
});

describe("fmtPct — percentage formatting", () => {
  it("formats to one decimal place with % suffix", () => {
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(5)).toBe("5.0%");
    expect(fmtPct(1.7132539721)).toBe("1.7%");
    expect(fmtPct(100)).toBe("100.0%");
  });
});
