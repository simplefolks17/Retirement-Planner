// ── PlanScreen — Command Center + "Try a change" panel ────────────────────────
//
// Tests the Plan screen's preview-first lever panel (2026-07-11 redesign):
//   1. Command-Center survivors: PortfolioHero (value + multiplier, no delta
//      badge), IncomeMeter, stat cards + subtitles.
//   2. TryAChangePanel renders both sliders with aria-labels + a tick rail.
//   3. Dragging a slider shows a live delta chip + Apply/Discard, and the
//      dashed scenario overlay reaches ArcGraph.
//   4. Discard clears the preview back to idle.
//   5. Apply opens ApplyPreviewModal; confirming fires applyPlanLevers with
//      the dragged value(s) and returns the panel to idle.
//   6. The idle footer's "More in Ideas →" button navigates.
//
// whatIfSimInputs is a REAL what-if bundle (mirrors the life-event-sheet.test.js
// fixture) so buildLeverPreview/buildLeverRail run the actual model — the panel
// is never tested against a mocked preview result.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import PlanScreen from "../screens/PlanScreen.jsx";
import { runSimulation } from "../../model/simulation.js";
import { buildRetirementDrawdown } from "../../model/retirement-drawdown.js";
import { buildRetirementPhase } from "../../model/retirement-phase.js";
import { buildAccumChart } from "../../model/accumulation.js";
import { calcEmployerMatch } from "../../model/employer-match.js";
import { buildVerdictLegend } from "../../model/what-if.js";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {
      innerWidth: 1200,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => {
  delete globalThis.window;
  delete globalThis.ResizeObserver;
});

// ── Minimal theme ─────────────────────────────────────────────────────────────
const t = {
  bg: "#fff", surf: "#f9f7f4", surf2: "#ede9e2",
  line: "#e8e3d9", line2: "#d4cfc3", ink: "#1a1815", mut: "#6b6560",
  faint: "#b0a99e", accent: "#7c4a2e", good: "#2d7a4f", warm: "#c05f1e",
};

// ── Real what-if bundle (mirrors life-event-sheet.test.js) ────────────────────
const em = (s, c) => calcEmployerMatch(s, c, {
  matchMode: "flat", matchFormulaCap: 6, matchFormulaRate: 50, employerMatchPct: 3,
});
const safeRetAge = 65, safeLifeExp = 90, currentAge = 30;
const rReal = (1 + 5 / 100) / (1 + 4 / 100) - 1;
const simInputs = {
  totalYears: safeLifeExp - currentAge, currentAge,
  currentIncome: 100_000, incomeGrowth: 3,
  filingStatus: "single", spouseIncome: 0, spouseIncomeGrowth: 3, returnRate: 5,
  bal401k: 50_000, balRoth: 25_000, balTaxable: 80_000, balHSA: 10_000,
  contrib401k: 10_000, contribRoth: 7_000, contribTaxable: 4_000, contribHSA: 3_850,
  contribEnd401k: 65, contribEndRoth: 65, contribEndTaxable: 65, contribEndHSA: 65,
  calcEmployerMatchFn: em, moneyEvents: [],
};
const _at = runSimulation(simInputs)[safeRetAge - currentAge - 1];
const baseTotalAtRet = (_at.tradGross ?? 0) + _at["Roth IRA"] + _at["Taxable"] + _at["HSA"];
const retDrawShared = {
  rReal, effectiveExpenses: 75_000,
  ssAmount: 30_000, ssClaimAge: 67,
  pensionAmount: 0, pensionStartAge: Infinity,
  rmdTaxByAge: {}, conversionTaxByAge: {}, moneyEvents: [],
};
const { yearsSustained: baseYearsSustained } = buildRetirementDrawdown({
  ...retDrawShared, startBal: baseTotalAtRet, startAge: safeRetAge, endAge: safeRetAge + 130,
});
const retPhaseBase = {
  tradGross: 0, roth: 0, taxable: baseTotalAtRet, hsa: 0,
  startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
  rReal, effectiveExpenses: retDrawShared.effectiveExpenses,
  ssGross: retDrawShared.ssAmount, ssTaxable: retDrawShared.ssAmount,
  ssClaimAge: retDrawShared.ssClaimAge,
  pension: retDrawShared.pensionAmount, pensionStartAge: retDrawShared.pensionStartAge,
  filingStatus: "single", retStateRate: 0,
  rmdStartAge: Infinity, useTable2: false, spouseCurrentAge: null, currentAge,
  moneyEvents: retDrawShared.moneyEvents ?? [],
};
const _simWithTrad = runSimulation(simInputs)
  .map(d => ({ ...d, "Trad 401k": Math.round(d.tradGross ?? 0) }));
const _accumChart = buildAccumChart({
  simData: _simWithTrad, safeRetAge, currentAge,
  bal401k: simInputs.bal401k, balRoth: simInputs.balRoth,
  balTaxable: simInputs.balTaxable, balHSA: simInputs.balHSA,
});
const _retPhase = buildRetirementPhase({ ...retPhaseBase, conversionByAge: {} });
const baseChart = [
  ..._accumChart,
  ..._retPhase.rows.map(r => ({ age: r.age, total: r.total })),
];
const whatIfBundle = {
  simInputs, fedMarginal: 0.22, retDrawShared,
  safeRetAge, safeLifeExp, baseTotalAtRet, baseYearsSustained,
  retPhaseBase, conversionByAge: {}, baseChart, addlPreTaxBal: 0,
};

// ── Mock props (real model bundle + plain display scalars) ────────────────────
const makeMockProps = (overrides = {}) => ({
  chartData:         baseChart,
  currentAge,
  retirementAge:     safeRetAge,
  lifeExpect:        safeLifeExp,
  totalAtRet:        baseTotalAtRet,
  isSustainable:     true,
  takeHome:          6_000,
  effectiveExpenses: retDrawShared.effectiveExpenses,
  balAt90:           1_000_000,
  contribSeries:     [],
  activity:          "golf course",
  planView: {
    progressPct: 100,
    // calcPlanProgress's "money lasts to" fields (Plan card 4 + the verdict
    // sentence). This fixture is a sustainable plan, so the null pair is the
    // real shape, not a placeholder.
    outlastsPlan: true, depletionAge: null, yearsShortOfPlan: null,
    drivers: [{ id: "withdrawal", ok: true }],
  },
  signals:           [],
  moneyEvents:       [],
  retirementWalk:    { rows: _retPhase.rows },
  taxView:           { composition: { total: 553_782, segments: [] } },
  workLongerView:    { applicable: true, rows: [], minYearsToSustain: null },
  planHighlights: {
    wealthMultiplier: 14.2,
    incomeReplacementPct: 82,
    // Both dollar bases (the Plan screen's toggle picks one). The retirement
    // basis is the today one inflated — the fixture keeps them visibly
    // different so a test can prove the toggle actually switches.
    incomeFlowByBasis: {
      today: {
        expenses: 69_864, ss: 25_200, pension: 0, spouseIncome: 0, portfolioDraw: 44_664,
        hasSS: true, hasPension: false, hasSpouseIncome: false,
        ssPct: 36, pensionPct: 0, spouseIncomePct: 0, portfolioPct: 64,
      },
      retirement: {
        expenses: 120_000, ss: 43_200, pension: 0, spouseIncome: 0, portfolioDraw: 76_800,
        hasSS: true, hasPension: false, hasSpouseIncome: false,
        ssPct: 36, pensionPct: 0, spouseIncomePct: 0, portfolioPct: 64,
      },
    },
    guaranteed: {
      pct: 36, hasSS: true, hasPension: false, hasSpouseIncome: false,
      everHasSS: true, everHasPension: false, fullyCovered: false,
      startsAtAge: null, startsLabel: null, savingsCoverUntilStart: null,
      pendingSources: [],
    },
    dollarBasisApplicable: true,
    dollarBasisOptions: [
      { id: "today", label: "Today's money", caption: "Retirement income and spending shown in today's buying power.", cardSub: "in today's money", showsReplacementPct: true },
      { id: "retirement", label: "At 65", caption: "Retirement income and spending shown in age-65 dollars — the same lifestyle after 35 years of inflation.", cardSub: "in age-65 dollars", showsReplacementPct: false },
    ],
    yearsToRetirement: 14,
    retirementDuration: 25,
    takeHomeIsHousehold: false,
  },
  statementView:     { keepPct: 52 },
  whatIfSimInputs:   whatIfBundle,
  monthlySpend:      Math.round(retDrawShared.effectiveExpenses / 12),
  sliderBounds: {
    retireMin: 60, retireMax: 75,
    spendMin: 2_000, spendMax: 10_000,
  },
  applyPlanLevers:   vi.fn(),
  saveEvent:         vi.fn(),
  removeEvent:       vi.fn(),
  lifeEventBounds:   { minAge: currentAge + 1, maxAge: safeLifeExp, retirementAge: safeRetAge },
  verdictLegend:     buildVerdictLegend(safeLifeExp),
  ...overrides,
});

// ── Tree helpers ────────────────────────────────────────────────────────────
function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}
const allText = (root) => textOf({ children: [root] });
const rangeInputs = (root) => root.findAll(n => n.type === "input" && n.props?.type === "range");
const buttonsByText = (root, label) =>
  root.findAll(n => n.type === "button" && textOf({ children: n.children }) === label);
const buttonContaining = (root, substr) =>
  root.findAll(n => n.type === "button" && textOf({ children: n.children }).includes(substr));
// The Explore tray is collapsed by default — open a facet before asserting on
// its body (levers or goals).
const openFacet = (renderer, label) =>
  act(() => { buttonContaining(renderer.root, label)[0].props.onClick(); });
const dashedPaths = (root) =>
  root.findAll(n => n.type === "path" && n.props?.strokeDasharray === "8 5");
const tickDivs = (root) =>
  root.findAll(n => n.type === "div" && n.props?.style?.borderRadius === 2);
// A StatCard: the sanctioned role="button" + tabIndex div. Its text begins with
// its own label, so a prefix match identifies the card without matching the
// slider inside the tray that shares the "Retire at" string.
const statCard = (root, label) =>
  root.findAll(n => n.props?.role === "button" && typeof n.props?.onClick === "function"
    && textOf({ children: n.children }).startsWith(label))[0];

function mount(overrides = {}, isMobile = false) {
  const props = makeMockProps(overrides);
  const navigate = vi.fn();
  let renderer;
  act(() => {
    renderer = create(
      React.createElement(PlanScreen, { t, props, navigate, isMobile }),
    );
  });
  return { renderer, props, navigate };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PlanScreen — command center survivors", () => {
  it("renders portfolio hero with totalAtRet and wealth multiplier, no delta badge", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("Portfolio at retirement");
    expect(text).toContain("grows 14.2× from today");
    expect(text).not.toContain("vs saved plan");
    act(() => renderer.unmount());
  });

  it("renders income replacement meter", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("Retirement income");
    expect(text).toContain("replaces 82% of today's take-home pay");
    expect(text).toContain("Soc. Security");
    act(() => renderer.unmount());
  });

  it("renders the today-anchor paycheck card, primary-voiced by default", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("Your paycheck");
    expect(text).toContain("52% of income · today");
    expect(text).not.toContain("Household paycheck");
    expect(text).not.toContain("You keep");
    act(() => renderer.unmount());
  });

  // The scope half of the same fix: takeHome is a HOUSEHOLD figure for MFJ
  // filers (rule 9), and the old "You keep" label was unconditionally
  // primary-voiced. The switch reads a model boolean, never spouseIncome.
  it("labels the paycheck card 'Household paycheck' when the model says the figure is household-scoped", () => {
    const { renderer } = mount({
      planHighlights: { ...makeMockProps().planHighlights, takeHomeIsHousehold: true },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Household paycheck");
    expect(text).not.toContain("Your paycheck");
    act(() => renderer.unmount());
  });

  it("renders the five retirement stat cards with their subtitles", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("Retire at");
    expect(text).toContain("in 14 yrs");
    expect(text).toContain("Spending each month");
    expect(text).toContain("in today's money");
    expect(text).toContain("Guaranteed for life");
    expect(text).toContain("36%");
    expect(text).toContain("Social Security — the rest comes from your savings");
    expect(text).toContain("Money lasts to");
    expect(text).toContain("Tax in retirement");
    // Item 8 (BUG-122 batch): "total, across all" overclaimed completeness
    // (BUG-38's incremental-tax-only accounting) — softened, and now carries
    // its own basis note instead of no basis at all.
    expect(text).toContain("across your retirement years, in retirement-year dollars");
    expect(text).not.toContain("total, across all your retirement years");
    // Retired copy — the labels these replaced.
    expect(text).not.toContain("Income for life");
    expect(text).not.toContain("Retirement taxes");
    expect(text).not.toContain("Left at");
    act(() => renderer.unmount());
  });

  // Item 11 (BUG-122 batch): 5 cards in a 2-column mobile grid leaves the
  // last one ("Tax in retirement") alone on its own row, half-width — an
  // orphan. It should span the full row on mobile only.
  it("the 5th stat card spans the full row on mobile, and is untouched on desktop", () => {
    const mobile = mount({}, true);
    const mobileCard = statCard(mobile.renderer.root, "Tax in retirement");
    expect(mobileCard.props.style.gridColumn).toBe("1 / -1");
    act(() => mobile.renderer.unmount());

    const desktop = mount({}, false);
    const desktopCard = statCard(desktop.renderer.root, "Tax in retirement");
    expect(desktopCard.props.style.gridColumn).toBeUndefined();
    act(() => desktop.renderer.unmount());
  });

  // The card's number must match the number its own destination (Numbers →
  // Taxes) shows. It used to read planHighlights.lifetimeTaxBurden
  // (RMD + conversion tax only) while the destination showed a bigger total
  // that also includes the 401k-draw tax; the duplicate field is gone.
  it("the tax card reads taxView.composition.total, the same total its destination shows", () => {
    const { renderer } = mount({
      taxView: { composition: { total: 400_000, segments: [] } },
    });
    expect(allText(renderer.root)).toContain("$400k");
    act(() => renderer.unmount());
  });

  it("a sustainable plan shows 'Money lasts to past 90' and keeps the earned tagline", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).toContain("past 90");
    expect(text).toContain("your savings outlast your plan");
    expect(text).toContain("mandatory.");
    expect(text).not.toContain("Your savings run out");
    act(() => renderer.unmount());
  });

  // The honest verdict replaces the tagline (strictly either/or) when the plan
  // does NOT cover its horizon — every number from a named model field.
  it("an unsustainable plan replaces the tagline with the depletion age + its smallest fix", () => {
    const { renderer } = mount({
      isSustainable: false,
      planView: {
        progressPct: 87, outlastsPlan: false, depletionAge: 87, yearsShortOfPlan: 3,
        drivers: [{ id: "withdrawal", ok: false }],
      },
      workLongerView: { applicable: true, rows: [], minYearsToSustain: 3 },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Your savings run out at");
    expect(text).toContain("age 87");
    expect(text).toContain("3 years before your plan ends at 90");
    expect(text).toContain("Working 3 more years would make them last.");
    expect(text).not.toContain("mandatory.");
    // Card 4 must agree with the sentence — one model field, two surfaces.
    expect(text).toContain("3 years short of your plan");
    act(() => renderer.unmount());
  });

  // No tested offset fixes the plan → a designed sentence, never a made-up
  // number of years.
  it("renders the designed 'later retirement alone won't fix it' state when minYearsToSustain is null", () => {
    const { renderer } = mount({
      isSustainable: false,
      planView: {
        progressPct: 40, outlastsPlan: false, depletionAge: 80, yearsShortOfPlan: 10,
        drivers: [{ id: "withdrawal", ok: false }],
      },
      workLongerView: { applicable: true, rows: [], minYearsToSustain: null, maxOffsetTested: 5 },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Working up to 5 more years isn't enough on its own");
    expect(text).not.toContain("Retiring later alone won't close the gap");
    expect(text).not.toContain("more years would make them last");
    act(() => renderer.unmount());
  });

  // #30 / BUG-82: the Income Meter's 4th "Spouse income" bar + scope note.
  it("does not render the spouse-income bar or note by default (hasSpouseIncome false, note null)", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    expect(text).not.toContain("Spouse income");
    act(() => renderer.unmount());
  });

  it("renders the spouse-income bar + scope note only when hasSpouseIncome and the note are truthy", () => {
    const base = makeMockProps().planHighlights;
    const spouseFlow = {
      expenses: 69_864, ss: 25_200, pension: 0, spouseIncome: 12_000, portfolioDraw: 32_664,
      hasSS: true, hasPension: false, hasSpouseIncome: true,
      ssPct: 36, pensionPct: 0, spouseIncomePct: 17, portfolioPct: 47,
    };
    const { renderer } = mount({
      planHighlights: {
        ...base,
        incomeFlowByBasis: { today: spouseFlow, retirement: spouseFlow },
        guaranteed: { ...base.guaranteed, hasSpouseIncome: true },
        spouseIncomeScopeNote: "Includes your spouse's income through age 63; the portfolio draw rises after that.",
      },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Spouse income");
    expect(text).toContain("Includes your spouse's income through age 63");
    // The "Guaranteed for life" card must NOT let a spouse's temporary paycheck
    // read as part of "the rest comes from your savings" — it names it.
    expect(text).toContain("the rest comes from your savings and your spouse's pay");
    act(() => renderer.unmount());
  });

  // BUG-122 (item 2): "savings cover you until then" used to render whenever
  // startsAtAge was set, with no check that savings actually last that long —
  // it could contradict "Money lasts to" directly. g.savingsCoverUntilStart is
  // the pre-computed truth condition (App.jsx, from calcPlanProgress).
  it("shows 'savings cover you until then' when savingsCoverUntilStart is true", () => {
    const base = makeMockProps().planHighlights;
    const { renderer } = mount({
      planHighlights: {
        ...base,
        guaranteed: {
          pct: 0, hasSS: false, hasPension: false, hasSpouseIncome: false,
          everHasSS: true, everHasPension: false, fullyCovered: false,
          startsAtAge: 67, startsLabel: "Social Security", savingsCoverUntilStart: true,
          pendingSources: [{ age: 67, label: "Social Security", savingsCoverUntilStart: true }],
        },
      },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Social Security starts at 67 — savings cover you until then");
    act(() => renderer.unmount());
  });

  it("does NOT claim savings cover you until then when savingsCoverUntilStart is false — the false-reassurance repro (BUG-122): retire 60, spend $300k/yr, SS starts at 67, savings run out at 61", () => {
    const base = makeMockProps().planHighlights;
    const { renderer } = mount({
      planHighlights: {
        ...base,
        guaranteed: {
          pct: 0, hasSS: false, hasPension: false, hasSpouseIncome: false,
          everHasSS: true, everHasPension: false, fullyCovered: false,
          startsAtAge: 67, startsLabel: "Social Security", savingsCoverUntilStart: false,
          pendingSources: [{ age: 67, label: "Social Security", savingsCoverUntilStart: false }],
        },
      },
    });
    const text = allText(renderer.root);
    expect(text).not.toContain("savings cover you until then");
    expect(text).toContain("Social Security starts at 67");
    // Still tells the honest story — points at "Money lasts to" instead.
    expect(text.toLowerCase()).toContain("may not stretch");
    act(() => renderer.unmount());
  });

  // BUG-131 (Item 2): source naming must read the UNGATED everHasSS/
  // everHasPension (matching what pct itself is built from), never the gated
  // hasSS/hasPension — and every pending source must be named, not just the
  // earliest. Fixture values below are the REAL planHighlights.guaranteed App
  // computes for this exact repro (retirementAge 60, pensionMonthly 4000,
  // pensionStartAge 70) — verified against a live App mount.
  it("repro A (BUG-131): names BOTH pending sources instead of silently dropping the pension supplying ~76 of a 100% card", () => {
    const base = makeMockProps().planHighlights;
    const { renderer } = mount({
      planHighlights: {
        ...base,
        guaranteed: {
          pct: 100, hasSS: false, hasPension: false, hasSpouseIncome: false,
          everHasSS: true, everHasPension: true, fullyCovered: true,
          startsAtAge: 67, startsLabel: "Social Security", savingsCoverUntilStart: true,
          pendingSources: [
            { age: 67, label: "Social Security", savingsCoverUntilStart: true },
            { age: 70, label: "Your pension", savingsCoverUntilStart: true },
          ],
        },
      },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Social Security + pension — full coverage once Social Security at 67, Your pension at 70");
    // The old bug: only the earliest ([0]) source was ever named.
    expect(text).not.toContain("Social Security starts at 67 — savings cover you until then");
    act(() => renderer.unmount());
  });

  // BUG-131 (Item 2): once the model's own pct says nothing is left over
  // (fullyCovered), the copy must not also claim "the rest comes from your
  // savings" — the two directly contradict each other. Fixture is the REAL
  // planHighlights.guaranteed App computes for pensionMonthly 4000,
  // pensionStartAge 60, retirementAge 65 (default) — verified against a live
  // App mount.
  it("repro B (BUG-131): does not claim 'the rest comes from your savings' when the card already reads 100%", () => {
    const base = makeMockProps().planHighlights;
    const { renderer } = mount({
      planHighlights: {
        ...base,
        guaranteed: {
          pct: 100, hasSS: false, hasPension: true, hasSpouseIncome: false,
          everHasSS: true, everHasPension: true, fullyCovered: true,
          startsAtAge: 67, startsLabel: "Social Security", savingsCoverUntilStart: true,
          pendingSources: [{ age: 67, label: "Social Security", savingsCoverUntilStart: true }],
        },
      },
    });
    const text = allText(renderer.root);
    expect(text).toContain("Social Security + pension — full coverage starts at 67");
    expect(text).not.toContain("the rest comes from your savings");
    // The old bug's misleading "more from 67" implied MORE guaranteed income
    // stacking on top of an already-100% card.
    expect(text).not.toContain("more from 67");
    act(() => renderer.unmount());
  });
});

// ── Dollar-basis toggle (owner decision: today's money by default) ───────────
describe("PlanScreen — dollar-basis toggle", () => {
  it("defaults to today's dollars in BOTH the meter headline and the spending card", () => {
    const { renderer } = mount();
    const text = allText(renderer.root);
    // 69_864/yr → $5,822/mo → "$5,800" (fmtMonthly rounds to the nearest $100).
    expect(text).toContain("$5,800/mo");
    expect(text).toContain("in today's money");
    expect(text).toContain("today's buying power");
    // The retirement-basis figure must not be on screen at the same time —
    // the pre-fix bug was the meter and the card showing BOTH, ~20px apart.
    expect(text).not.toContain("$10,000/mo");
    act(() => renderer.unmount());
  });

  it("switching to the retirement basis moves the meter and the card together", () => {
    const { renderer } = mount();
    const toggle = buttonsByText(renderer.root, "At 65");
    expect(toggle.length).toBe(1);
    act(() => { toggle[0].props.onClick(); });

    const text = allText(renderer.root);
    // 120_000/yr → $10,000/mo.
    expect(text).toContain("$10,000/mo");
    expect(text).toContain("in age-65 dollars");
    expect(text).not.toContain("$5,800/mo");
    act(() => renderer.unmount());
  });

  it("leaves basis-invariant values alone — the guaranteed %, the ages, the tax total", () => {
    const { renderer } = mount();
    const before = allText(renderer.root);
    act(() => { buttonsByText(renderer.root, "At 65")[0].props.onClick(); });
    const after = allText(renderer.root);
    for (const invariant of ["36%", "past 90", "$554k"]) {
      expect(before).toContain(invariant);
      expect(after).toContain(invariant);
    }
    act(() => renderer.unmount());
  });

  // BUG-132 (Item 3): incomeReplacementPct is basis-invariant BY DESIGN
  // (BUG-114 — it always compares against today's take-home pay), but it used
  // to render unconditionally next to whichever dollar figure the toggle
  // picked — reading, at "At 65", "$18,900/mo replaces 84%" beside a
  // $5,700/mo paycheck (actually 332%, not 84%). It must show only while the
  // basis it was built to sit beside ("today") is active.
  it("shows the replacement-% clause only in today's-dollars mode — the toggle must not leave a stale ratio beside a different dollar figure", () => {
    const { renderer } = mount();
    const before = allText(renderer.root);
    expect(before).toContain("replaces 82% of today's take-home pay");

    act(() => { buttonsByText(renderer.root, "At 65")[0].props.onClick(); });
    const after = allText(renderer.root);
    expect(after).not.toContain("replaces 82% of today's take-home pay");
    expect(after).not.toContain("replaces");
    // The dollar figure it used to sit beside is still visibly a different
    // basis — proving this isn't just a text change but a real reconciling gap.
    expect(after).toContain("$10,000/mo");
    act(() => renderer.unmount());
  });

  it("hides the toggle entirely when the model says the two bases coincide", () => {
    const { renderer } = mount({
      planHighlights: { ...makeMockProps().planHighlights, dollarBasisApplicable: false },
    });
    const text = allText(renderer.root);
    expect(buttonsByText(renderer.root, "At 65").length).toBe(0);
    expect(text).toContain("$5,800/mo");       // pinned to today's dollars
    expect(text).not.toContain("today's buying power"); // no caption either
    act(() => renderer.unmount());
  });
});

describe("PlanScreen — Explore tray: Try a change facet", () => {
  it("levers live behind the collapsed tray; opening 'Try a change' reveals both sliders + a tick rail, idle", () => {
    const { renderer } = mount();
    // Collapsed by default — no sliders rendered yet.
    expect(rangeInputs(renderer.root).length).toBe(0);

    openFacet(renderer, "Try a change");
    const labels = rangeInputs(renderer.root).map(n => n.props["aria-label"]);
    expect(labels).toContain("Retire at");
    expect(labels).toContain("Monthly spend");
    expect(tickDivs(renderer.root).length).toBeGreaterThan(0);
    // Idle: no dashed overlay, no Apply/Discard, calm hint (no "More in Ideas").
    expect(dashedPaths(renderer.root).length).toBe(0);
    expect(allText(renderer.root)).not.toContain("More in Ideas");
    expect(allText(renderer.root)).toContain("nothing changes until you Apply");
    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);
    act(() => renderer.unmount());
  });

  // BUG-73: the labeled comfortable/tight/unaffordable ranges must be visible
  // (owner requirement), but shown ONCE per panel.
  it("shows the verdict legend once under the rail group, not once per rail", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const text = allText(renderer.root);
    expect(text).toContain("5+ yrs of runway");
    expect(text).toContain("runs out before 90");
    const occurrences = text.split("5+ yrs of runway").length - 1;
    expect(occurrences).toBe(1);
    act(() => renderer.unmount());
  });

  it("dragging the retire slider shows a delta chip + Apply/Discard, and a dashed overlay reaches ArcGraph", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    const text = allText(renderer.root);
    expect(text).toContain("Portfolio lasts"); // a buildPreviewMetric row label
    expect(buttonsByText(renderer.root, "Apply changes").length).toBeGreaterThan(0);
    expect(buttonsByText(renderer.root, "Discard").length).toBe(1);
    expect(dashedPaths(renderer.root).length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  // Gemini review (PR #56): with a change staged, the auto-open fallback used
  // to re-open the tray on every render, so the collapse click silently did
  // nothing. The explicit "closed" sentinel must let the user collapse a dirty
  // tray — and reopening must still offer Apply (the offsets survive).
  it("the tray can be collapsed while a change is staged, and reopening restores Apply", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });
    expect(buttonsByText(renderer.root, "Apply changes").length).toBeGreaterThan(0);

    // Collapse: the facet body (sliders + Apply) must actually disappear.
    openFacet(renderer, "Try a change");
    expect(rangeInputs(renderer.root).length).toBe(0);
    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);

    // Reopen: the staged change survived — Apply/Discard are back.
    openFacet(renderer, "Try a change");
    expect(buttonsByText(renderer.root, "Apply changes").length).toBeGreaterThan(0);
    expect(buttonsByText(renderer.root, "Discard").length).toBe(1);
    act(() => renderer.unmount());
  });

  // The cards used to point AWAY from the levers they describe ("Retire at"
  // navigated to the static My-Details facts screen). The tray's open state is
  // now controlled by PlanScreen so a card can open the facet in place.
  it("the 'Retire at' card opens the Try-a-change facet in place instead of navigating away", () => {
    const { renderer, navigate } = mount();
    expect(rangeInputs(renderer.root).length).toBe(0);

    act(() => { statCard(renderer.root, "Retire at").props.onClick(); });

    const labels = rangeInputs(renderer.root).map(n => n.props["aria-label"]);
    expect(labels).toContain("Retire at");
    expect(navigate).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("the 'Spending each month' card opens the same facet, where the spend slider lives", () => {
    const { renderer, navigate } = mount();
    act(() => { statCard(renderer.root, "Spending each month").props.onClick(); });

    const labels = rangeInputs(renderer.root).map(n => n.props["aria-label"]);
    expect(labels).toContain("Monthly spend");
    expect(navigate).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("the verdict sentence's 'Try a change' link opens the same facet", () => {
    const { renderer } = mount({
      isSustainable: false,
      planView: {
        progressPct: 87, outlastsPlan: false, depletionAge: 87, yearsShortOfPlan: 3,
        drivers: [{ id: "withdrawal", ok: false }],
      },
      workLongerView: { applicable: true, rows: [], minYearsToSustain: 3 },
    });
    expect(rangeInputs(renderer.root).length).toBe(0);
    act(() => { buttonContaining(renderer.root, "Try a change →")[0].props.onClick(); });
    expect(rangeInputs(renderer.root).length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it("Discard clears the preview back to idle", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });
    expect(buttonsByText(renderer.root, "Discard").length).toBe(1);

    act(() => { buttonsByText(renderer.root, "Discard")[0].props.onClick(); });

    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);
    expect(dashedPaths(renderer.root).length).toBe(0);
    expect(allText(renderer.root)).toContain("nothing changes until you Apply");
    act(() => renderer.unmount());
  });

  it("Apply opens ApplyPreviewModal; confirming fires applyPlanLevers and returns to idle", () => {
    const { renderer, props } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    // First "Apply changes" click opens the modal (the panel's own inline button).
    act(() => { buttonsByText(renderer.root, "Apply changes")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Apply these changes?");

    // Confirm inside the modal (the LAST "Apply changes"-labeled button once open).
    const applyBtns = buttonsByText(renderer.root, "Apply changes");
    expect(applyBtns.length).toBeGreaterThan(1);
    act(() => { applyBtns[applyBtns.length - 1].props.onClick(); });

    expect(props.applyPlanLevers).toHaveBeenCalledTimes(1);
    expect(props.applyPlanLevers).toHaveBeenCalledWith({ retirementAge: safeRetAge - 2 });

    // Back to idle: offsets cleared, modal closed.
    expect(allText(renderer.root)).not.toContain("Apply these changes?");
    expect(buttonsByText(renderer.root, "Apply changes").length).toBe(0);
    act(() => renderer.unmount());
  });

  it("#85: Apply modal shows a real verdict badge from the lever preview", () => {
    const { renderer } = mount();
    openFacet(renderer, "Try a change");
    const retireInput = rangeInputs(renderer.root).find(n => n.props["aria-label"] === "Retire at");
    act(() => { retireInput.props.onChange({ target: { value: String(safeRetAge - 2) } }); });

    act(() => { buttonsByText(renderer.root, "Apply changes")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Apply these changes?");

    const text = allText(renderer.root);
    expect(["Comfortable", "Tight", "Doesn't fit"].some(v => text.includes(v))).toBe(true);

    act(() => renderer.unmount());
  });
});

describe("PlanScreen — Explore tray: Goals facet", () => {
  it("opening 'Goals' reveals preset quick-adds; a preset seeds a NEW goal sheet (no eventId)", () => {
    const { renderer } = mount();
    openFacet(renderer, "Goals");
    const text = allText(renderer.root);
    expect(text).toContain("Add a goal");
    // First 3 presets visible by default (DEFAULT_VISIBLE_GOALS).
    expect(buttonContaining(renderer.root, "Buy a home").length).toBe(1);
    // A preset opens the LifeEventSheet in NEW mode (its own header input appears).
    act(() => { buttonContaining(renderer.root, "Buy a home")[0].props.onClick(); });
    expect(allText(renderer.root)).toContain("Buy a home");
    act(() => renderer.unmount());
  });

  it("lists committed goals as numbered rows, tappable to edit", () => {
    const goal = { id: "g1", label: "Big trip", icon: "🧳", age: 70, amount: 40_000, isInflow: false };
    const { renderer, props } = mount({ moneyEvents: [goal] });
    // Collapsed tray shows a "Goals · 1" affordance.
    expect(allText(renderer.root)).toContain("Goals · 1");
    openFacet(renderer, "Goals");
    const text = allText(renderer.root);
    expect(text).toContain("Goal 1");
    expect(text).toContain("Big trip");
    // Remove wired to removeEvent by id.
    const rm = buttonContaining(renderer.root, "✕").find(n => n.props["aria-label"]?.startsWith("Remove goal 1"));
    act(() => { rm.props.onClick(); });
    expect(props.removeEvent).toHaveBeenCalledWith("g1");
    act(() => renderer.unmount());
  });
});
