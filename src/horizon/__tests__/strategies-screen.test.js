import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import StrategiesScreen from "../screens/StrategiesScreen.jsx";

// ── WI-3.3 (#100) + WI-3.4/3.5 flows ─────────────────────────────────────────
// The screen is pure layout over horizonProps. Card faces read the bundle that
// owns each number: conversion → taxView.conversionDetail, withdrawal →
// yr1TaxSavings, surplus → budget, ss → ssView, rmd → rmdView. SS + RMD cards
// open live interactive flows (WI-3.4/3.5) that read those same view bundles and
// write through the WI-3.1 ss/pension/accounts setter bundles. Synthetic props
// mirror the golden-master default so the headline value-locks (incl. the
// NEGATIVE Roth benefit) catch a wiring regression.

const t = new Proxy({}, { get: () => "#334155" });

const num = (value, min, max, step, extra = {}) => ({ value, set: vi.fn(), min, max, step, ...extra });
const bool = (value) => ({ value, set: vi.fn() });
const choice = (value, options) => ({ value, set: vi.fn(), options });

function makeProps(overrides = {}) {
  return {
    // ── already-wired headlines (read directly) ──
    taxView: {
      conversionDetail: {
        adjustedNetConversionBenefit: -9_854, isPositive: false, benefitAbs: 9_854,
        conversionCost: 18_000, rmdTaxSaved: 8_100, irmaaCost: 3_100, acaLoss: 5_200,
      },
    },
    netConversionBenefit: -9_854,
    conversionWindowYrs: 7,
    yr1TaxSavings: 12_400,
    budget: { availableSurplus: 18_000 },
    // ── WI-3.7 withdrawalView / megaView flow bundles ──
    withdrawalView: {
      netNeed: 60_000,
      steps: [
        { key: "taxable", label: "Taxable brokerage", amount: 30_000, note: "already-taxed principal" },
        { key: "trad", label: "Traditional 401k", amount: 30_000, note: "taxed at ~22%" },
      ],
      yr1TaxOptimal: 6_600, yr1TaxWorstCase: 19_000, yr1TaxSavings: 12_400,
      hasSavings: true,
    },
    megaView: {
      capacity: 30_000, limit415c: 72_000, employeeDeferral: 24_500, employerMatchAmt: 5_000,
      capacityRows: [
        { label: "415(c) annual limit", val: 72_000 },
        { label: "Your 401k deferral", val: 24_500 },
        { label: "Employer match", val: 5_000 },
        { label: "After-tax space", val: 30_000, isTotal: true },
      ],
      growth: [{ yrs: 5, val: 170_000 }],
      usesCatchupLimit: false,
    },
    // ── WI-3.7 surplusView flow bundle (WI-3.9 Apply-with-preview) ──
    surplusView: {
      availableSurplus: 18_000, savingsSurplusPct: 50, totalExtra: 9_000,
      deployLabel: "50% of $18,000 surplus",
      extraRows: [
        { key: "match", label: "① Employer Match", amount: 3_000, sub: "free money" },
        { key: "hsa", label: "② HSA", amount: 2_000, sub: "triple tax-free" },
        { key: "401k", label: "④ 401k", amount: 4_000, sub: "pre-tax deduction" },
      ],
      optRows: [
        { key: "401k", label: "401k", amount: 27_500 },
        { key: "hsa", label: "HSA", amount: 6_400 },
      ],
      applyAllocation: {
        available: true,
        preview: {
          title: "Apply optimized allocation",
          action: "Deploy 50% of your surplus into the targets below.",
          confirmLabel: "Apply",
          metrics: [{
            id: "totalAtRet", label: "Portfolio at retirement",
            before: "$3,950,603", after: "$4,050,603",
            delta: { dir: "up", label: "+$100,000", tone: "good" },
          }],
          note: "Preview uses the same per-account engine as your headline numbers.",
          verdict: null,
        },
        apply: vi.fn(), revert: vi.fn(), applied: false,
      },
    },
    // ── scalars the flows read directly from horizonProps ──
    isMarried: false,
    includeSS: true,
    withdrawalRate: 3.2,
    householdSS: 48_120,
    effectivePension: 0,
    effectiveExpenses: 60_000,
    // ── strategiesView: applicability flags only (headlines come from sibling ──
    // view bundles — withdrawalView / megaView / budget / ssView / rmdView).
    strategiesView: {
      conversion: { applicable: true },
      rmd:        { applicable: true },
      ss:         { applicable: true },
      withdrawal: { applicable: true },
      surplus:    { applicable: true },
      mega:       { applicable: true },
    },
    // ── WI-3.6 conversionView flow bundle ──
    conversionView: {
      window: {
        hasConvWindow: true, startAge: 66, endAge: 72, windowYrs: 7,
        windowLabel: "7-year window · age 66 → 72",
        startAgeField: num(66, 66, 72, 1), endAgeField: num(72, 66, 72, 1),
        isDefaultWindow: true,
      },
      targets: {
        convSteadyTarget: 82_765, convPeakTarget: 121_800, targetsVary: false,
        bracketFillLabel: "$82,765", assumesPension: false,
      },
      outcome: {
        annualConversionLabel: "$82,765", netIsPositive: false,
        rothBalEndConv: 500_000, rothBalEndTax: 520_000, rothAdvantage: 20_000,
        showTaxSourceComparison: true,
      },
      healthcare: {
        cliffAges: [67, 68], cliffCount: 2, cliffThreshold: 84_600, acaAnnualLoss: 5_200,
        showAcaWarning: true, hasAcaLoss: true, showNoCliffNote: false,
        irmaaCost: 3_100, irmaaRows: [{ age: 73, cost: 1_550 }, { age: 74, cost: 1_550 }],
        showIrmaa: true, showAdjustedStrip: true,
      },
      tables: {
        simYears: [{ age: 66, conversion: 82_765, tradBal: 900_000, tax: 18_000 }],
        rmdCompare: [
          { age: 73, noConv: 62_508, withConv: 40_000, improved: true },
          { age: 74, noConv: 64_000, withConv: null, improved: false },
        ],
      },
      events: {
        rows: [], add: vi.fn(), atMax: false,
        inServiceField: bool(false), hasWorkingYears: true, totalPlannedLabel: "$0",
      },
      optimizer: {
        suggestedAmount: 85_000, suggestedStartAge: 61, suggestedBenefit: 12_400,
        currentAmountLabel: "$82,765", currentStartAge: 61,
        applySuggestion: {
          available: true,
          preview: {
            title: "Apply optimizer suggestion",
            action: "Convert $85,000/yr starting at age 61 (now: $82,765/yr from age 61)",
            confirmLabel: "Apply",
            metrics: [{
              id: "netBenefit", label: "Net benefit after healthcare",
              before: "−$9,854", after: "$12,400",
              delta: { dir: "up", label: "+$22,254", tone: "good" },
            }],
            note: "Preview uses the same per-account engine as your headline numbers.",
            verdict: null,
          },
          apply: vi.fn(),
        },
      },
    },
    // ── WI-3.1 conversion / health setter bundles ──
    conversion: {
      conversionMode: choice("bracket", [{ value: "bracket", label: "Fill to bracket" }, { value: "custom", label: "Custom amount" }]),
      conversionBracketTarget: choice(12, [{ value: 12, label: "12%" }, { value: 22, label: "22%" }, { value: 24, label: "24%" }]),
      annualConversionAmt: num(82_765, 0, 500_000, 5_000),
      conversionTaxSource: choice("converted", [{ value: "converted", label: "From the conversion" }, { value: "taxable", label: "From taxable" }]),
    },
    health: {
      hasMarketplaceInsurance: bool(true),
      householdSize: num(2, 1, 6, 1),
      marketplaceMonthlyPremium: { value: null, set: vi.fn(), min: 0, step: 50 },
      hasMedicare: bool(true),
      personOnMedicare: choice(1, [{ value: 1, label: "Person 1" }, { value: 2, label: "Person 2" }]),
    },
    // ── WI-3.4 ssView flow bundle ──
    ssView: {
      ssMonthly: 4_010, ssAnnual: 48_120, ssEstimateAnnual: 48_120, ssAIME: 9_500,
      claimAge: 67, claimAgeLabel: "age 67 (FRA)", breakEven: null, breakEvenContext: "claiming at FRA",
      ssCoveragePct: 80,
      delayApplicable: false, delayGapYrs: 3, ss70DrawReduction: 0, wr70: 0, delayGainYrs: null,
      spouseSsBenefit: 0, spouseAlt: 0, spouseAltHigher: false,
      householdSSMonthly: 4_010, householdCoveragePct: 80, showEffectivePension: false,
    },
    // ── WI-3.5 rmdView flow bundle ──
    rmdView: {
      firstRMDAmount: 62_508, firstRMDAge: 73, totalRMDs: 1_150_000, rmdTaxBite: 207_000,
      effectiveRMDTaxRate: 0.21,
      rows: [{ age: 73, rmd: 62_508, bal: 1_500_000, divisor: 27.4, tax: 13_000 }],
      rowCount: 1, retAtOrAfterRMD: false,
      activeTableLabel: "Table III (Uniform Lifetime)", qualifiesTable2: false, spouseAgeGap: 0,
    },
    // ── setter bundles the flows write through (WI-3.1) ──
    ss: {
      includeSS: bool(true),
      ssClaimingAge: num(67, 62, 70, 1),
      ssOverride: { value: null, set: vi.fn(), min: 0, max: 60_000, step: 500, estimated: 48_120 },
      spouseBenefitBasis: choice("own", [{ value: "own", label: "Own record" }, { value: "spousal", label: "Spousal (50%)" }]),
      spouseSsEstimate: num(0, 0, 60_000, 500),
      spouseClaimingAge: num(67, 62, 70, 1),
      isMarried: bool(false),
      spouseIsSoleBenef: bool(false),
      spouseCurrentAge: num(33, 18, 33, 1),
    },
    pension: { pensionMonthly: num(0, 0, 10_000, 100), pensionStartAge: num(65, 50, 75, 1) },
    accounts: {
      addlPreTaxBal: num(0, 0, undefined, 10_000),
      matchMode: choice("flat", [{ value: "flat", label: "Flat %" }, { value: "formula", label: "Formula" }]),
      employerMatchPct: num(3, 0, 10, 0.5),
      matchFormulaRate: num(50, 0, 200, 5),
      matchFormulaCap: num(6, 1, 15, 0.5),
    },
    // ── WI-3.7 assumptions.savingsSurplusPct field (surplus flow stepper) ──
    assumptions: {
      savingsSurplusPct: num(50, 0, 100, 5),
    },
    ...overrides,
  };
}

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function mount(props, extra = {}) {
  let r;
  act(() => { r = create(React.createElement(StrategiesScreen, { t, props, isMobile: false, ...extra })); });
  const click = (pred) => {
    const target = r.root.findAll(n => typeof n.props?.onClick === "function" && pred(n))[0];
    expect(target).toBeTruthy();
    act(() => target.props.onClick());
  };
  return { r, click, text: () => textOf(r.toJSON()) };
}

describe("StrategiesScreen", () => {
  it("renders the marker, the three editorial sections, and all six cards", () => {
    const app = mount(makeProps());
    const txt = app.text();
    expect(txt).toContain("Ways to keep more of what you've built");   // smoke marker (card-grid root)
    for (const s of ["Taxes", "Income timing", "Accounts"]) {
      expect(txt, `missing section: ${s}`).toContain(s);
    }
    for (const c of ["Roth conversion", "Withdrawal order", "Social Security timing",
                     "RMD outlook", "Surplus deployment", "Mega backdoor"]) {
      expect(txt, `missing card: ${c}`).toContain(c);
    }
    act(() => app.r.unmount());
  });

  it("shows correct headline dollars, including the NEGATIVE Roth benefit", () => {
    const app = mount(makeProps());
    const txt = app.text();
    // Card headlines are CALM (abbreviated) money — src/formatters.js `fmt` —
    // a headline stat, not an editable-input readout (2026-07-16 "calm money"
    // consolidation).
    expect(txt).toContain("−$10k");            // sign-aware Roth headline (value-lock)
    expect(txt).toContain("not worth it");     // negative framing
    expect(txt).toContain("$12k");             // withdrawal yr1 savings
    expect(txt).toContain("$4k/mo");           // SS monthly (ssView)
    expect(txt).toContain("$63k");             // first RMD (rmdView)
    expect(txt).toContain("$18k/yr");          // surplus
    expect(txt).toContain("$30k/yr");          // mega capacity
    act(() => app.r.unmount());
  });

  it("shows the 'Not set up' state for an inapplicable card", () => {
    const props = makeProps();
    props.strategiesView.mega = { applicable: false };
    const app = mount(props);
    expect(app.text()).toContain("Not set up");
    act(() => app.r.unmount());
  });

  it("opens the SS timing flow and returns via back", () => {
    const app = mount(makeProps());
    app.click(n => textOf(n).startsWith("Social Security timing"));   // open the SS card
    const txt = app.text();
    expect(txt).toContain("All strategies");          // back affordance present
    expect(txt).toContain("Annual benefit");          // SSTimingFlow stat tile
    expect(txt).toContain("$48k");                    // ssView.ssAnnual value-lock (calm)
    expect(txt).toContain("Include Social Security");  // live control from the ss bundle
    app.click(n => textOf(n) === "‹ All strategies");
    expect(app.text()).toContain("Ways to keep more of what you've built");  // back at the grid
    act(() => app.r.unmount());
  });

  it("renders the SS flow's delay-to-70 box without crashing (delayApplicable)", () => {
    // Regression: the delay box uses the HM monospace token; a missing import
    // crashed the flow at the golden-master default (claiming < 70 → delayApplicable).
    const props = makeProps();
    props.ssView = { ...props.ssView, delayApplicable: true, ss70DrawReduction: 9_200, wr70: 2.4, delayGainYrs: 3, delayGapYrs: 3 };
    props.withdrawalRate = 3.2;
    const app = mount(props, { initialStrategy: "ss" });
    const txt = app.text();
    expect(txt).toContain("Delay to 70");
    expect(txt).toContain("+$9k/yr");
    expect(txt).toContain("3.2% → 2.4%");
    act(() => app.r.unmount());
  });

  it("a flow control writes through its setter bundle", () => {
    const props = makeProps();
    const app = mount(props);
    app.click(n => textOf(n).startsWith("Social Security timing"));
    // Toggle "Include Social Security" off via the No button.
    app.click(n => textOf(n) === "No");
    expect(props.ss.includeSS.set).toHaveBeenCalledWith(false);
    act(() => app.r.unmount());
  });

  it("deep-links straight into the RMD flow via initialStrategy", () => {
    const app = mount(makeProps(), { initialStrategy: "rmd" });
    const txt = app.text();
    expect(txt).toContain("RMD outlook");                     // detail title
    expect(txt).toContain("First RMD at 73");                 // RMD_START_AGE-driven stat label
    expect(txt).toContain("$63k");                            // firstRMDAmount value-lock (calm)
    expect(txt).toContain("Table III (Uniform Lifetime)");   // active table label
    act(() => app.r.unmount());
  });

  it("returns to the grid when the deep-link target is cleared (re-selecting the tab)", () => {
    let r;
    act(() => { r = create(React.createElement(StrategiesScreen, { t, props: makeProps(), isMobile: false, initialStrategy: "ss" })); });
    expect(textOf(r.toJSON())).toContain("All strategies");                  // detail open via deep-link
    act(() => { r.update(React.createElement(StrategiesScreen, { t, props: makeProps(), isMobile: false, initialStrategy: null })); });
    expect(textOf(r.toJSON())).toContain("Ways to keep more of what you've built");  // back at the grid
    act(() => r.unmount());
  });

  // ── WI-3.6 (#103): Roth conversion planner flow ───────────────────────────
  describe("ConversionPlannerFlow (WI-3.6)", () => {
    it("opens the conversion planner from the card and returns via back", () => {
      const app = mount(makeProps());
      app.click(n => textOf(n).startsWith("Roth conversion"));   // open the card
      const txt = app.text();
      expect(txt).toContain("All strategies");                    // back affordance present
      expect(txt).toContain("7-year window · age 66 → 72");       // conversionView.window.windowLabel
      app.click(n => textOf(n) === "‹ All strategies");
      expect(app.text()).toContain("Ways to keep more of what you've built");
      act(() => app.r.unmount());
    });

    it("value-locks: the sign-aware adjusted verdict and the synthetic window label", () => {
      const app = mount(makeProps(), { initialStrategy: "conversion" });
      const txt = app.text();
      expect(txt).toContain("−$10k");                  // adjusted net benefit (taxView.conversionDetail), calm
      expect(txt).toContain("Adjusted net benefit");
      expect(txt).toContain("7-year window · age 66 → 72");
      act(() => app.r.unmount());
    });

    it("no-window edge state: hasConvWindow false hides window/strategy sections but keeps working-year conversions", () => {
      const props = makeProps();
      props.conversionView.window = {
        hasConvWindow: false, startAge: 74, endAge: 73, windowYrs: 0,
        windowLabel: "0-year window · age 74 → 73",
        startAgeField: num(74, 74, 73, 1), endAgeField: num(73, 74, 73, 1),
        isDefaultWindow: true,
      };
      const app = mount(props, { initialStrategy: "conversion" });
      const txt = app.text();
      expect(txt).toContain("No conversion window is available");   // the designed edge message
      expect(txt).not.toContain("7-year window");                   // hasConvWindow-gated window label absent
      expect(txt).not.toContain("Suggested annual conversion");     // strategy section (bracket mode) absent
      expect(txt).toContain("Working-year conversions");            // section 9 still renders
      act(() => app.r.unmount());
    });

    it("ACA cliff crossed with premium unset: no '$0 lost' claim and no adjusted-net strip (Classic parity)", () => {
      // showAcaWarning true (cliff crossed) but acaAnnualLoss 0 / hasAcaLoss false
      // (premium "Not set") and no IRMAA → the loss clause and the whole adjusted
      // strip must be suppressed, exactly as Classic gates them (LOW-1 fix).
      const props = makeProps();
      props.conversionView.healthcare = {
        ...props.conversionView.healthcare,
        acaAnnualLoss: 0, hasAcaLoss: false,
        irmaaCost: 0, irmaaRows: [], showIrmaa: false,
        showAdjustedStrip: false,
      };
      const app = mount(props, { initialStrategy: "conversion" });
      const txt = app.text();
      expect(txt).toContain("exceed the ACA");         // the cliff warning still shows
      expect(txt).not.toContain("in lost subsidy");    // but not a fabricated "$0 lost"
      expect(txt).not.toContain("Adjusted net benefit"); // and no gross==adjusted strip
      expect(txt).not.toContain("−$0");
      act(() => app.r.unmount());
    });

    it("window write-through: firing the start-age stepper calls the synthetic startAgeField.set", () => {
      const props = makeProps();
      const app = mount(props, { initialStrategy: "conversion", isMobile: true });
      app.click(n => n.props["aria-label"] === "increase Start converting at age");
      expect(props.conversionView.window.startAgeField.set).toHaveBeenCalled();
      act(() => app.r.unmount());
    });

    it("events: a row renders with its estTaxLabel, atMax hides the add button, and a field writes through", () => {
      const props = makeProps();
      props.conversionView.events = {
        rows: [{
          id: 1,
          ageField: num(45, 31, 59, 1),
          amountField: num(20_000, 0, undefined, 5_000),
          estTaxLabel: "est. tax $3,200 this year",
          remove: vi.fn(),
        }],
        add: vi.fn(), atMax: true,
        inServiceField: bool(true), hasWorkingYears: true, totalPlannedLabel: "$20,000",
      };
      const app = mount(props, { initialStrategy: "conversion", isMobile: true });
      const txt = app.text();
      expect(txt).toContain("est. tax $3,200 this year");
      expect(txt).not.toContain("+ Add conversion year");   // atMax hides the add affordance
      app.click(n => n.props["aria-label"] === "increase Amount");
      expect(props.conversionView.events.rows[0].amountField.set).toHaveBeenCalled();
      act(() => app.r.unmount());
    });

    it("events: in-service off shows the plan-dependent disclaimer, not the event rows", () => {
      const props = makeProps();
      props.conversionView.events.inServiceField = bool(false);
      const app = mount(props, { initialStrategy: "conversion" });
      expect(app.text()).toContain("plan-dependent");
      act(() => app.r.unmount());
    });

    it("optimizer suggestion → Apply opens the preview modal; cancel doesn't apply, confirm does", () => {
      const props = makeProps();
      const app = mount(props, { initialStrategy: "conversion" });

      app.click(n => textOf(n) === "Apply suggestion");
      let txt = app.text();
      expect(txt).toContain("Apply optimizer suggestion");                          // preview.title
      expect(txt).toContain("Convert $85,000/yr starting at age 61");               // preview.action

      // Cancel: no write happens, and the modal closes.
      app.click(n => textOf(n) === "Cancel");
      expect(props.conversionView.optimizer.applySuggestion.apply).not.toHaveBeenCalled();
      expect(app.text()).not.toContain("Apply optimizer suggestion");

      // Reopen and confirm: apply fires exactly once.
      app.click(n => textOf(n) === "Apply suggestion");
      app.click(n => textOf(n) === "Apply");
      expect(props.conversionView.optimizer.applySuggestion.apply).toHaveBeenCalledTimes(1);
      act(() => app.r.unmount());
    });
  });

  // ── WI-3.7 (#104/#105): withdrawal order / surplus deployment / mega backdoor ──
  describe("WithdrawalOrderFlow (WI-3.7)", () => {
    it("opens from the card (not the ReadOnlyStub) and renders the step labels", () => {
      const app = mount(makeProps(), { initialStrategy: "withdrawal" });
      const txt = app.text();
      expect(txt).toContain("All strategies");
      expect(txt).toContain("Year-1 draw order");          // flow-specific marker, not the stub
      expect(txt).toContain("Taxable brokerage");
      expect(txt).toContain("Traditional 401k");
      expect(txt).toContain("already-taxed principal");
      act(() => app.r.unmount());
    });

    it("shows the savings callout when hasSavings is true", () => {
      const app = mount(makeProps(), { initialStrategy: "withdrawal" });
      const txt = app.text();
      expect(txt).toContain("$12k saved in year-1 tax");
      act(() => app.r.unmount());
    });

    it("does not fabricate a savings callout when hasSavings is false", () => {
      const props = makeProps();
      props.withdrawalView = { ...props.withdrawalView, hasSavings: false };
      const app = mount(props, { initialStrategy: "withdrawal" });
      expect(app.text()).not.toContain("saved in year-1 tax");
      act(() => app.r.unmount());
    });
  });

  describe("SurplusDeploymentFlow (WI-3.7 + WI-3.9 Apply-with-preview)", () => {
    it("opens from the card (not the ReadOnlyStub) and renders the allocation rows", () => {
      const app = mount(makeProps(), { initialStrategy: "surplus" });
      const txt = app.text();
      expect(txt).toContain("All strategies");
      expect(txt).toContain("How it's deployed");          // flow-specific marker, not the stub
      expect(txt).toContain("① Employer Match");
      expect(txt).toContain("New contribution targets if applied");
      act(() => app.r.unmount());
    });

    it("the savingsSurplusPct stepper writes through the assumptions bundle", () => {
      const props = makeProps();
      const app = mount(props, { initialStrategy: "surplus", isMobile: true });
      app.click(n => n.props["aria-label"] === "increase Deploy this % of surplus");
      expect(props.assumptions.savingsSurplusPct.set).toHaveBeenCalled();
      act(() => app.r.unmount());
    });

    it("Apply: opening the modal does not call apply; Cancel leaves it uncalled; Confirm calls it once", () => {
      const props = makeProps();
      const app = mount(props, { initialStrategy: "surplus" });

      app.click(n => textOf(n) === "Apply optimized allocation");
      let txt = app.text();
      expect(txt).toContain("Apply optimized allocation");     // modal title, still on screen
      expect(props.surplusView.applyAllocation.apply).not.toHaveBeenCalled();

      // Cancel: no write happens, and the modal closes.
      app.click(n => textOf(n) === "Cancel");
      expect(props.surplusView.applyAllocation.apply).not.toHaveBeenCalled();

      // Reopen and confirm: apply fires exactly once.
      app.click(n => textOf(n) === "Apply optimized allocation");
      app.click(n => textOf(n) === "Apply");
      expect(props.surplusView.applyAllocation.apply).toHaveBeenCalledTimes(1);
      act(() => app.r.unmount());
    });

    it("no Revert affordance when nothing is applied", () => {
      const app = mount(makeProps(), { initialStrategy: "surplus" });
      expect(app.text()).not.toContain("Revert");
      act(() => app.r.unmount());
    });

    it("Revert is visible and calls site.revert when applied is true", () => {
      const props = makeProps();
      props.surplusView.applyAllocation = {
        available: false, preview: null, apply: vi.fn(), revert: vi.fn(), applied: true,
      };
      const app = mount(props, { initialStrategy: "surplus" });
      expect(app.text()).toContain("Applied");
      app.click(n => textOf(n) === "Revert");
      expect(props.surplusView.applyAllocation.revert).toHaveBeenCalledTimes(1);
      act(() => app.r.unmount());
    });
  });

  describe("MegaBackdoorFlow (WI-3.7)", () => {
    it("opens from the card (not the ReadOnlyStub) and renders the capacity rows", () => {
      const app = mount(makeProps(), { initialStrategy: "mega" });
      const txt = app.text();
      expect(txt).toContain("All strategies");
      expect(txt).toContain("415(c) capacity");             // flow-specific marker, not the stub
      expect(txt).toContain("415(c) annual limit");
      expect(txt).toContain("After-tax space");
      expect(txt).toContain("In 5 years");
      act(() => app.r.unmount());
    });

    it("shows the flat-% match field, not the formula fields, when matchMode is flat", () => {
      const app = mount(makeProps(), { initialStrategy: "mega" });
      const txt = app.text();
      expect(txt).toContain("Employer match (% of salary)");
      expect(txt).not.toContain("Match rate");
      expect(txt).not.toContain("Of the first N% of salary");
      act(() => app.r.unmount());
    });

    it("shows the formula fields, not the flat-% field, when matchMode is formula", () => {
      const props = makeProps();
      props.accounts.matchMode = choice("formula", props.accounts.matchMode.options);
      const app = mount(props, { initialStrategy: "mega" });
      const txt = app.text();
      expect(txt).toContain("Match rate");
      expect(txt).toContain("Of the first N% of salary");
      expect(txt).not.toContain("Employer match (% of salary)");
      act(() => app.r.unmount());
    });
  });
});
