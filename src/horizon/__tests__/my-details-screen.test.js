import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import MyDetailsScreen from "../screens/MyDetailsScreen.jsx";

// ── WI-3.2 (#99) MyDetailsScreen ─────────────────────────────────────────────
// The screen is pure layout over the WI-3.1 setter bundles: it must render every
// topic card, compose summaries by formatting raw bundle values, and write edits
// straight through a field's `.set`. These tests use synthetic bundles (the model
// round-trip itself is covered by setter-bundles.test.js) so a wiring regression
// — a control pointed at the wrong field, or a summary reading the wrong value —
// fails here.

// Any t.<token> resolves to a color string so styles render in the node env.
const t = new Proxy({}, { get: () => "#334155" });

const num = (value, min, max, step, extra = {}) => ({ value, set: vi.fn(), min, max, step, ...extra });
const choice = (value, options) => ({ value, set: vi.fn(), options });
const bool = (value) => ({ value, set: vi.fn() });

function makeProps() {
  const acct = () => ({
    bal: num(100_000, 0, 5_000_000, 10_000),
    contrib: num(10_000, 0, 23_500, 500),
    contribEnd: num(65, 19, 90, 1),
  });
  return {
    isMarried: true,
    effectiveExpenses: 60_000,
    budget: { effectiveLiving: 57_000 },
    profile: {
      currentIncome: num(100_000, 20_000, 500_000, 5_000),
      incomeGrowth: num(3, 0, 15, 0.5),
      incomeGrowthEndAge: { value: null, set: vi.fn(), min: 35, max: 65, step: 1 },
      spouseIncome: num(0, 0, 500_000, 5_000),
      spouseIncomeGrowth: num(3, 0, 15, 0.5),
      filingStatus: choice("single", [
        { value: "single", label: "Single" }, { value: "mfj", label: "Married Filing Jointly" },
        { value: "mfs", label: "MFS" }, { value: "hoh", label: "HoH" },
      ]),
      selectedState: choice("TX", [{ value: "TX", label: "Texas (TX)" }, { value: "CA", label: "California (CA)" }]),
      stateRateOverride: { value: null, pct: 0, defaultPct: 0, set: vi.fn(), min: 0, max: 13, step: 0.1 },
      otherPreTaxDeduc: num(0, 0, 20_000, 250),
    },
    spending: {
      livingExpenses: { value: null, set: vi.fn(), min: 10_000, max: 200_000, step: 1_000 },
      livingExpenseGrowth: num(3, 0, 10, 0.5),
      annualExpenses: { value: null, set: vi.fn(), min: 10_000, max: 300_000, step: 1_000 },
      retirementTarget: num(3_000_000, 100_000, 20_000_000, undefined),
    },
    accounts: {
      trad401k: acct(), roth: acct(), taxable: acct(), hsa: acct(),
      addlPreTaxBal: num(0, 0, undefined, 10_000),
      matchMode: choice("flat", [{ value: "flat", label: "Flat %" }, { value: "formula", label: "Formula" }]),
      employerMatchPct: num(3, 0, 10, 0.5),
      matchFormulaRate: num(50, 0, 200, 5),
      matchFormulaCap: num(6, 1, 15, 0.5),
    },
    health: {
      hasMarketplaceInsurance: bool(false),
      householdSize: num(1, 1, 6, 1),
      marketplaceMonthlyPremium: { value: null, set: vi.fn(), min: 0 },
      hasMedicare: bool(false),
      personOnMedicare: choice(1, [{ value: 1, label: "Person 1" }, { value: 2, label: "Person 2" }]),
    },
    assumptions: {
      currentAge: num(34, 18, 80, 1),
      retirementAge: num(65, 34, 89, 1),
      lifeExpect: num(90, 66, 115, 1),
      returnRate: num(5, 1, 15, 1),
      inflationRate: num(4, 1, 8, 0.5),
      retirementState: choice("TX", [{ value: "TX", label: "Texas (TX) — 0%" }, { value: "CA", label: "California (CA) — 9.3%" }]),
      savingsSurplusPct: num(50, 0, 100, 5),
    },
  };
}

function textOf(node) {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(textOf).join("");
}

function mount(props, isMobile = true) {
  let r;
  act(() => { r = create(React.createElement(MyDetailsScreen, { t, props, isMobile })); });
  const click = (pred) => {
    const target = r.root.findAll(n => typeof n.props?.onClick === "function" && pred(n))[0];
    expect(target).toBeTruthy();
    act(() => target.props.onClick());
  };
  const clickText = (txt) => click(n => textOf(n) === txt);
  return { r, click, clickText, text: () => textOf(r.toJSON()) };
}

describe("MyDetailsScreen", () => {
  it("renders the subtitle marker and all five topic cards", () => {
    const app = mount(makeProps());
    const txt = app.text();
    expect(txt).toContain("The facts behind your plan");
    for (const card of ["Income & job", "Spending", "Accounts & match", "Health & Medicare", "Assumptions"]) {
      expect(txt, `missing card: ${card}`).toContain(card);
    }
    act(() => app.r.unmount());
  });

  it("composes closed-card summaries from raw bundle values", () => {
    const app = mount(makeProps());
    const txt = app.text();
    expect(txt).toContain("$100,000 · grows 3%/yr");          // income summary
    expect(txt).toContain("401k $100,000 · match 3%");        // accounts summary
    expect(txt).toContain("5% return · 4% inflation · to age 90"); // assumptions summary
    act(() => app.r.unmount());
  });

  it("writes a numeric edit through the bundle setter", () => {
    const props = makeProps();
    const app = mount(props);
    app.click(n => textOf(n).startsWith("Income & job"));     // open the card header
    // First "+" in the open card belongs to the first field (Annual income).
    app.clickText("+");
    expect(props.profile.currentIncome.set).toHaveBeenCalledWith(105_000); // 100k + 5k step
    act(() => app.r.unmount());
  });

  it("writes a toggle and a choice through the bundle setters", () => {
    const props = makeProps();
    const app = mount(props);
    app.click(n => textOf(n).startsWith("Health & Medicare"));
    app.clickText("No");                                       // marketplace toggle → false
    expect(props.health.hasMarketplaceInsurance.set).toHaveBeenCalledWith(false);

    app.click(n => textOf(n).startsWith("Accounts & match"));
    app.clickText("Formula");                                  // match mode → formula
    expect(props.accounts.matchMode.set).toHaveBeenCalledWith("formula");
    act(() => app.r.unmount());
  });

  it("seeds a nullable field's editor and shows its Auto label", () => {
    const props = makeProps();
    const app = mount(props);
    app.click(n => textOf(n).startsWith("Spending"));
    expect(app.text()).toContain("Auto · $57,000");           // living expenses null → effectiveLiving seed
    app.clickText("+");                                        // first field = living expenses
    expect(props.spending.livingExpenses.set).toHaveBeenCalledWith(58_000); // seed 57k + 1k step
    act(() => app.r.unmount());
  });
});
