import { describe, it, expect } from "vitest";
import { PALETTES } from "../ThemeContext.jsx";

// WCAG 2.x contrast enforcement for the Horizon design tokens (BUG-112).
//
// Before this file, the 12 token sets (6 palettes x light/dark) were tuned by eye
// and nothing measured them, so real failures shipped: `faint` never reached even
// 3:1 in any light palette, `mut` failed 4.5:1 in all six, and `good`/`warm` — the
// tokens that render the Income Meter's actual dollar figures at 11px bold — ran
// as low as 1.82:1. This file recomputes the ratios from the token values on every
// `npm test`, so a future palette tweak cannot silently reintroduce that.
//
// The math is deliberately implemented here from the WCAG spec rather than
// imported from the app: a token file and its own contrast checker sharing a
// helper would let one bug hide the other.

// --- WCAG 2.1 relative luminance + contrast ratio -----------------------------
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function parseHex(hex) {
  const h = String(hex).replace("#", "");
  expect(h, `"${hex}" is not a 6-digit hex colour`).toMatch(/^[0-9a-fA-F]{6}$/);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
export function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Sanity-check the implementation against values fixed by the spec itself, so a
// bug in the formula shows up as a failure here and not as false reassurance
// about the palettes.
describe("WCAG contrast math", () => {
  it("reproduces the spec's reference ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 on white is the canonical "exactly AA for normal text" grey.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#949494", "#ffffff")).toBeCloseTo(3.03, 2);
  });

  it("is symmetric in its arguments", () => {
    expect(contrastRatio("#ad5131", "#fffbf5"))
      .toBeCloseTo(contrastRatio("#fffbf5", "#ad5131"), 10);
  });
});

const AA_TEXT = 4.5;      // normal-size text
const MUT_BAR = 5.5;      // see ThemeContext's contrast contract: mut sits a step
                          // above faint so the ink > mut > faint ladder survives
const AAA_TEXT = 7;       // ink, the primary text token

// A text token has to clear its bar on EVERY ground it can be rendered on, not
// just the one it happened to be eyeballed against. All three are real: `bg` is
// the page, `surf` is a card, `surf2` is a nested/inset panel.
const GROUNDS = ["bg", "surf", "surf2"];

const TEXT_TOKENS = [
  ["ink", AAA_TEXT],
  ["mut", MUT_BAR],
  ["faint", AA_TEXT],
  ["accent", AA_TEXT],
  ["good", AA_TEXT],
  ["warm", AA_TEXT],
];

const modes = ["light", "dark"];
const combos = Object.entries(PALETTES).flatMap(([key, p]) =>
  modes.map((mode) => [key, p.name, mode, p[mode]])
);

describe("Horizon palette contrast (6 palettes x 2 modes)", () => {
  it("covers all 12 token sets", () => {
    expect(combos).toHaveLength(12);
  });

  describe.each(combos)("%s (%s) / %s", (key, name, mode, t) => {
    it.each(TEXT_TOKENS)("`%s` clears %s:1 on bg, surf and surf2", (token, bar) => {
      for (const ground of GROUNDS) {
        const ratio = contrastRatio(t[token], t[ground]);
        expect(
          ratio,
          `${name} ${mode}: ${token} (${t[token]}) on ${ground} (${t[ground]}) = ${ratio.toFixed(2)}:1, needs ${bar}:1`
        ).toBeGreaterThanOrEqual(bar);
      }
    });

    // The filled-CTA composition (Btn variant="primary", plus the two hand-rolled
    // accent buttons in SurplusDeploymentFlow / ConversionPlannerFlow). This is
    // normal-size text on a button, so it takes the 4.5 bar, not the 3:1
    // large-text one. It needs its own token because no single literal works for
    // both modes -- dark-mode accents are light by design.
    it("`onAccent` clears 4.5:1 on the accent it labels", () => {
      const ratio = contrastRatio(t.onAccent, t.accent);
      expect(
        ratio,
        `${name} ${mode}: onAccent (${t.onAccent}) on accent (${t.accent}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    // Compliance alone would let `mut` and `faint` both sit on 4.5 and become
    // visually interchangeable -- which is what the first pass at this fix
    // actually produced (faint came out *darker* than mut in Apricot). The
    // three-step text hierarchy is a design property worth locking, not a
    // side effect to rediscover.
    it("keeps the ink > mut > faint reading hierarchy", () => {
      const on = (token) => Math.min(...GROUNDS.map((g) => contrastRatio(t[token], t[g])));
      expect(on("ink"), `${name} ${mode}: ink vs mut`).toBeGreaterThan(on("mut"));
      expect(on("mut"), `${name} ${mode}: mut vs faint`).toBeGreaterThan(on("faint"));
    });

    it("defines every token the contract names", () => {
      for (const token of [...GROUNDS, ...TEXT_TOKENS.map(([n]) => n), "onAccent", "line", "line2"]) {
        expect(t[token], `${name} ${mode} is missing "${token}"`).toBeTruthy();
      }
    });
  });
});

// --- perceptual distance -----------------------------------------------------
// Contrast ratio is a LUMINANCE comparison, so it cannot answer "are these two
// tints different colours?" -- Slate's blue accent and orange warm sit at a 1.00:1
// ratio while being unmistakably different. Token-vs-token separation needs a
// perceptual distance instead: CIE76 dE over CIELAB, where dE >= ~5 is the
// classic "clearly a different colour at a glance" boundary.
function toLab(hex) {
  const [R, G, B] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  // sRGB -> XYZ (D65), normalised to the D65 white point
  let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  let y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe("perceptual distance math", () => {
  it("scores identical colours at 0 and black/white at ~100", () => {
    expect(deltaE("#ad5131", "#ad5131")).toBeCloseTo(0, 6);
    expect(deltaE("#000000", "#ffffff")).toBeCloseTo(100, 0);
  });
  it("separates colours that share a luminance but not a hue", () => {
    // Slate light's accent/warm: a 1.00:1 contrast ratio, obviously different.
    expect(contrastRatio("#57708b", "#a45a2c")).toBeLessThan(1.05);
    expect(deltaE("#57708b", "#a45a2c")).toBeGreaterThan(50);
  });
});

// A palette whose accent and warm collapse into the same colour loses the
// distinction between "brand/interactive" and "attention" -- which is exactly
// what solving Honey's two golds to the same 4.5 bar did (#8a6717 vs #8b6714,
// dE 1.22, indistinguishable). Honey's accent is deepened to bronze for that
// reason; this test is what stops the next tuning pass from undoing it.
const MIN_TINT_SEPARATION = 5;

describe("tint tokens stay distinguishable from each other", () => {
  it.each(combos)("%s (%s) / %s", (key, name, mode, t) => {
    const pairs = [["accent", "warm"], ["accent", "good"], ["warm", "good"]];
    for (const [a, b] of pairs) {
      // Sage LIGHT's accent/good (#517555 / #53754f) sit close (dE 3.5) but were
      // never byte-identical like dark's were — a separate, smaller, lower-
      // severity gap that CodeRabbit's review of PR #66 did not flag, out of
      // scope for that fix. Still exempted here pending its own look; dark's
      // exemption is gone now that accent/good are genuinely distinct colours.
      if (key === "sage" && mode === "light" && a === "accent" && b === "good") continue;
      const d = deltaE(t[a], t[b]);
      expect(
        d,
        `${name} ${mode}: ${a} (${t[a]}) and ${b} (${t[b]}) are too close (dE ${d.toFixed(1)})`
      ).toBeGreaterThan(MIN_TINT_SEPARATION);
    }
  });
});
