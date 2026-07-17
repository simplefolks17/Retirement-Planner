import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fmt, fmtFull, fmtSigned, fmtMonthly, fmtMo, fmtPct } from "../formatters.js";

describe("fmt — calm currency abbreviation", () => {
  it("formats values below $1,000 as plain integers", () => {
    expect(fmt(0)).toBe("$0");
    expect(fmt(1)).toBe("$1");
    expect(fmt(47)).toBe("$47");
    expect(fmt(999)).toBe("$999");
  });

  it("formats values >= $1K with a lowercase k suffix, rounded to the nearest k", () => {
    expect(fmt(1_000)).toBe("$1k");
    expect(fmt(1_500)).toBe("$2k");
    expect(fmt(118_198)).toBe("$118k");
    expect(fmt(999_499)).toBe("$999k");
  });

  it("promotes a k-value that rounds up to 1000k into the M branch", () => {
    // 999,600 / 1000 = 999.6, rounds to 1000 -> must show "$1M", never "$1000k".
    expect(fmt(999_600)).toBe("$1M");
  });

  it("formats values >= $1M with one decimal, trimmed when the decimal is 0", () => {
    expect(fmt(1_000_000)).toBe("$1M");
    expect(fmt(1_500_000)).toBe("$1.5M");
    expect(fmt(3_568_998)).toBe("$3.6M");
    expect(fmt(4_000_000)).toBe("$4M");
    expect(fmt(10_000_000)).toBe("$10M");
  });

  it("never produces commas in output", () => {
    [999, 1_000, 57_377, 999_999, 1_000_000, 3_568_998].forEach(n => {
      expect(fmt(n)).not.toContain(",");
    });
  });

  it("never produces a bare M/k that could be confused with adjacent text", () => {
    // The M suffix always follows digits, with an optional one decimal: $X(.X)M
    expect(fmt(3_568_998)).toMatch(/^\$\d+(\.\d)?M$/);
    // The k suffix always follows digits with no decimal: $XXXk
    expect(fmt(118_198)).toMatch(/^\$\d+k$/);
  });

  it("preserves the sign for negative values with U+2212 (not ASCII hyphen), then abbreviates the magnitude", () => {
    expect(fmt(-500)).toBe("−$500");
    expect(fmt(-1_500)).toBe("−$2k");
    expect(fmt(-3_568_998)).toBe("−$3.6M");
    expect(fmt(-500)[0]).toBe("−");
    expect(fmt(-500)[0]).not.toBe("-"); // ASCII hyphen must never appear
  });

  // CodeRabbit (PR #56): rounding the SIGNED value made halves asymmetric
  // (Math.round rounds halfway cases toward +∞), and a small negative could
  // render "−$0". Magnitudes are rounded as absolutes; the sign only applies
  // to a nonzero rounded result.
  it("rounds negative halves symmetrically and never renders −$0", () => {
    expect(fmt(-1.5)).toBe("−$2");       // symmetric with fmt(1.5) === "$2"
    expect(fmt(1.5)).toBe("$2");
    expect(fmt(-0.4)).toBe("$0");        // rounds to zero → unsigned
    expect(fmtFull(-150.5)).toBe("−$151");
    expect(fmtFull(150.5)).toBe("$151");
    expect(fmtFull(-0.4)).toBe("$0");
    expect(fmtMonthly(-150)).toBe("−$200"); // symmetric with fmtMonthly(150)
    expect(fmtMonthly(150)).toBe("$200");
    expect(fmtMonthly(-49)).toBe("$0");
  });

  it("maps non-finite inputs to an em dash — missing data is never a fabricated $0", () => {
    expect(fmt(NaN)).toBe("—");
    expect(fmt(Infinity)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt(null)).toBe("—");
  });
});

describe("fmtFull — full-precision sign-aware money", () => {
  it("formats whole dollars with commas", () => {
    expect(fmtFull(12_400)).toBe("$12,400");
    expect(fmtFull(1_240_000)).toBe("$1,240,000");
    expect(fmtFull(0)).toBe("$0");
  });

  it("rounds fractional dollars", () => {
    expect(fmtFull(12_400.6)).toBe("$12,401");
  });

  it("uses U+2212 (not ASCII hyphen) for negatives", () => {
    expect(fmtFull(-9_854)).toBe("−$9,854");
    expect(fmtFull(-9_854)[0]).toBe("−");
    expect(fmtFull(-9_854)[0]).not.toBe("-");
  });

  it("renders an em dash for null/undefined/non-finite input — never a fabricated $0", () => {
    expect(fmtFull(null)).toBe("—");
    expect(fmtFull(undefined)).toBe("—");
    expect(fmtFull(NaN)).toBe("—");
    expect(fmtFull(Infinity)).toBe("—");
  });
});

describe("fmtSigned — calm signed delta", () => {
  it("prefixes a positive delta with +", () => {
    expect(fmtSigned(22_254)).toBe("+$22k");
    expect(fmtSigned(500)).toBe("+$500");
  });

  it("prefixes a negative delta with U+2212", () => {
    expect(fmtSigned(-20_000)).toBe("−$20k");
    expect(fmtSigned(-20_000)[0]).toBe("−");
  });

  it("renders an em dash for non-finite input", () => {
    expect(fmtSigned(NaN)).toBe("—");
    expect(fmtSigned(undefined)).toBe("—");
  });
});

describe("fmtMonthly — already-monthly value, rounded to the nearest $100", () => {
  it("rounds to the nearest $100 with full commas", () => {
    expect(fmtMonthly(5_183)).toBe("$5,200");
    expect(fmtMonthly(5_200)).toBe("$5,200");
    expect(fmtMonthly(0)).toBe("$0");
  });

  it("renders an em dash for non-finite input", () => {
    expect(fmtMonthly(null)).toBe("—");
    expect(fmtMonthly(NaN)).toBe("—");
  });
});

describe("fmtMo — annual value converted to monthly, then fmtMonthly'd", () => {
  it("divides by 12 and rounds to the nearest $100", () => {
    expect(fmtMo(60_000)).toBe("$5,000");
    expect(fmtMo(62_200)).toBe(fmtMonthly(62_200 / 12));
  });

  it("renders an em dash for non-finite input", () => {
    expect(fmtMo(null)).toBe("—");
    expect(fmtMo(Infinity)).toBe("—");
  });
});

describe("fmtPct — percentage formatting", () => {
  it("renders an em dash for non-finite inputs", () => {
    expect(fmtPct(NaN)).toBe("—");
    expect(fmtPct(Infinity)).toBe("—");
  });

  it("formats to one decimal place with % suffix by default", () => {
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(5)).toBe("5.0%");
    expect(fmtPct(1.7132539721)).toBe("1.7%");
    expect(fmtPct(100)).toBe("100.0%");
  });

  it("honors a custom decimal-place count", () => {
    expect(fmtPct(1.7132539721, 2)).toBe("1.71%");
    expect(fmtPct(5, 0)).toBe("5%");
  });
});

// ── One-formatter guard (2026-07-16 "calm money" consolidation) ─────────────
// Locks the convention this whole migration exists to establish: no file
// outside src/formatters.js builds a `$${...}` template-literal dollar string
// by hand. Every screen/component must delegate to fmt/fmtFull/fmtSigned/
// fmtMonthly/fmtMo instead. A new `$${` anywhere else is a regression back to
// the seven-implementations problem this pass fixed.
describe("one-formatter guard — no `$${` template literal outside formatters.js", () => {
  // Files that are allowed to build a `$${...}` string by hand, with the
  // reason recorded inline:
  const ALLOWLIST = new Set([
    "src/formatters.js", // the canonical module itself
    // DeferredInput.jsx is raw input-editing machinery (comma-stripping /
    // draft-state text field), not a dollar-string renderer — it never
    // actually prepends a "$" itself, so it's allowlisted per the task spec
    // rather than because it currently contains a match.
    "src/components/DeferredInput.jsx",
  ]);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", ".."); // src/__tests__ -> repo root

  function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
      } else if (/\.(js|jsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  }

  it("no source file (outside the allowlist) contains a `$${` template literal", () => {
    const files = [];
    walk(path.join(repoRoot, "src"), files);

    const offenders = [];
    for (const file of files) {
      const rel = path.relative(repoRoot, file).split(path.sep).join("/");
      if (ALLOWLIST.has(rel)) continue;
      const contents = fs.readFileSync(file, "utf8");
      if (contents.includes("$${")) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});
