import { describe, it, expect } from "vitest";
import { buildConversionPreview, buildSurplusPreview, buildCommitPlanPreview } from "../apply-preview.js";

// ── Apply-site registry contract (WI-3.9 / #106) ─────────────────────────────
// docs/ARCHITECTURE.md's "Apply-with-preview contract" documents a registry of
// every Apply site (a table today; row 1 is conversionView.optimizer.applySuggestion).
// This test is the machine-checked half of that registry: it iterates a list of
// { site, buildSample } entries and asserts the SHARED payload shape every
// ApplyPreviewModal consumer must produce, so a future site (WI-3.7's
// surplusView.applyAllocation, WI-3.8's commitPlan sites) gets coverage by
// adding one line here — not a whole new test file.
//
// This is deliberately generic: it checks well-formedness (non-empty strings,
// enum membership, shape), never a specific dollar figure — value-locks for a
// given site's numbers live in that site's own builder test
// (apply-preview.test.js's buildConversionPreview describe block).
//
// The non-preview wrapped write surfaces (`applyPlanLevers`, `saveEvent`/
// `removeEvent`, `commitPlan`) are documented in docs/ARCHITECTURE.md's
// "Other wrapped write surfaces" list, right after this table — they don't
// build an ApplyPreviewModal payload (no preview needed for an explicit
// add/edit/delete), so they aren't REGISTRY rows here, but they satisfy the
// SAME "no bundle exposes a raw setter" convention this file's title refers to.

const REGISTRY = [
  {
    site: "conversionView.optimizer.applySuggestion",
    buildSample: () => buildConversionPreview({
      current: {
        adjustedNetConversionBenefit: -9_854, yearsSustained: 21.3, depletionAge: 87,
        balAtRef: 1_200_000, rmdTaxBite: 207_557, annualConversion: 82_765, startAge: 61,
      },
      candidate: {
        netBenefit: 12_400, yearsSustained: Infinity, depletionAge: null,
        balAtRef: 1_500_000, rmdTaxBite: 150_000,
      },
      suggestion: { optimalStartAge: 61, optimalConversion: 90_000 },
      refAge: 90,
    }),
  },
  {
    site: "surplusView.applyAllocation",
    buildSample: () => buildSurplusPreview({
      current: {
        contribTotal: 24_850, savingsRatePct: 18.2,
        totalAtRet: 3_950_603, yearsSustained: Infinity, depletionAge: null,
      },
      candidate: {
        contribTotal: 39_500, savingsRatePct: 27.9,
        totalAtRet: 4_620_000, yearsSustained: Infinity, depletionAge: null,
      },
      deployment: { totalExtra: 14_650, pct: 100, availableSurplus: 14_650 },
    }),
  },
  {
    site: "commitPlan.planScreen.saveAsMyPlan",
    buildSample: () => buildCommitPlanPreview({
      action: "Save your current plan (retire at 65, $57,377/yr spending) as your baseline.",
      current: { totalAtRet: null, yearsSustained: null, depletionAge: null },
      candidate: { totalAtRet: 3_950_603, yearsSustained: Infinity, depletionAge: null },
      note: "This becomes your new comparison baseline everywhere.",
    }),
  },
];

const DELTA_DIRS = ["up", "down", "none"];
const TONES = ["good", "warm", "neutral"];
const VERDICT_TONES = ["good", "warm", "neutral"];

describe("Apply-site registry contract (generic payload well-formedness)", () => {
  for (const { site, buildSample } of REGISTRY) {
    describe(site, () => {
      const preview = buildSample();

      it("has non-empty title/action/confirmLabel strings", () => {
        expect(typeof preview.title).toBe("string");
        expect(preview.title.length).toBeGreaterThan(0);
        expect(typeof preview.action).toBe("string");
        expect(preview.action.length).toBeGreaterThan(0);
        expect(typeof preview.confirmLabel).toBe("string");
        expect(preview.confirmLabel.length).toBeGreaterThan(0);
      });

      it("has a non-empty metrics array, each with string id/label/before/after", () => {
        expect(Array.isArray(preview.metrics)).toBe(true);
        expect(preview.metrics.length).toBeGreaterThan(0);
        for (const metric of preview.metrics) {
          expect(typeof metric.id).toBe("string");
          expect(metric.id.length).toBeGreaterThan(0);
          expect(typeof metric.label).toBe("string");
          expect(metric.label.length).toBeGreaterThan(0);
          expect(typeof metric.before).toBe("string");
          expect(typeof metric.after).toBe("string");
        }
      });

      it("every metric's delta has dir/label/tone in the shared enums", () => {
        for (const metric of preview.metrics) {
          expect(metric.delta).toBeTruthy();
          expect(DELTA_DIRS).toContain(metric.delta.dir);
          expect(typeof metric.delta.label).toBe("string");
          expect(TONES).toContain(metric.delta.tone);
        }
      });

      it("verdict is null or a well-formed { label, tone }", () => {
        if (preview.verdict !== null) {
          expect(typeof preview.verdict.label).toBe("string");
          expect(preview.verdict.label.length).toBeGreaterThan(0);
          expect(VERDICT_TONES).toContain(preview.verdict.tone);
        } else {
          expect(preview.verdict).toBeNull();
        }
      });

      it("note is optional but a string when present", () => {
        if (preview.note !== undefined) {
          expect(typeof preview.note).toBe("string");
        }
      });
    });
  }

  it("the registry is non-empty (at least the conversion optimizer site)", () => {
    expect(REGISTRY.length).toBeGreaterThan(0);
  });
});
