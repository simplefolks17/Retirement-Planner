import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// ── Pension-after-retirement double-gating (PR #62 review fix, Qodo finding) ──
// App.jsx passes several retirement-year pension bases downstream. Two of
// them — the RMD income floor and the projected retirement bracket — must
// receive the UNGATED (or RMD-age-gated) figure, not the retirement-gated
// `retPensionBasis`, because both represent income at/after RMD age (73), a
// LATER horizon than retirement. A pension that starts after retirement but
// by/before 73 was being silently zeroed by a double-gate. This mounts App
// with exactly that shape and asserts the downstream figure includes it —
// with the 401k balance zeroed so avgAnnualRMD stays 0, isolating the
// pension term from the (unrelated, already-correct) RMD-schedule movement
// pension timing also causes via the engine.

const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));

import App from "../App.jsx";

function mount() {
  captured.length = 0;
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  return {
    latest: () => captured[captured.length - 1],
    fire: (fn) => act(() => fn()),
    unmount: () => act(() => renderer.unmount()),
  };
}

describe("pension timing — RMD floor and projected bracket (PR #62 review fix)", () => {
  it("a pension starting after retirement but by RMD age (73) is NOT dropped from the projected bracket", () => {
    const app = mount();
    // Zero both the current balance AND future contributions — avgAnnualRMD must
    // stay 0 in every step below (a $0 401k trajectory has no RMDs), isolating
    // the pension term. Balance alone isn't enough: contributions between now
    // and retirement would still accumulate a nonzero tradGrossAtRet.
    app.fire(() => app.latest().accounts.trad401k.bal.set(0));
    app.fire(() => app.latest().accounts.trad401k.contrib.set(0));
    const retAge = app.latest().assumptions.retirementAge.value;
    expect(retAge).toBeLessThan(73); // precondition: there's a real gap to test

    const noPensionBracket = app.latest().taxView.projectedRetBracket;

    app.fire(() => app.latest().pension.pensionMonthly.set(2_000));
    app.fire(() => app.latest().pension.pensionStartAge.set(Math.min(75, retAge + 3)));
    expect(app.latest().pension.pensionStartAge.value).toBeGreaterThan(retAge); // starts AFTER retirement…
    expect(app.latest().pension.pensionStartAge.value).toBeLessThanOrEqual(73);  // …but by RMD age

    const withDelayedPensionBracket = app.latest().taxView.projectedRetBracket;
    // Before the fix, retPensionBasis zeroed a post-retirement pension here too,
    // so this would have stayed identical to the no-pension case.
    expect(withDelayedPensionBracket).toBeGreaterThan(noPensionBracket);
    app.unmount();
  });

  it("a pension starting after retirement but by RMD age (73) is NOT dropped from the RMD income floor (calcRMDIncomeFloor wiring)", () => {
    // Distinct from the bracket test above: this exercises calcRMDIncomeFloor's
    // OWN internal timing gate (pensionStartAge <= rmdStartAge), fed by the
    // fully-UNGATED retPensionAnnualBasis — a regression that reintroduced the
    // double-gate on ONLY this call site (leaving projectedRetBracket correct)
    // would pass every other test in this file (test-coverage review finding,
    // PR #62 review-fix round). rmdIncomeFloor's only consumer is
    // calcWithdrawalOrderTax (withdrawalView) — probed via the Traditional
    // step's marginal-rate note, the one place that floor surfaces.
    const app = mount();
    // Zero the taxable balance so the withdrawal order (Taxable → Trad → Roth)
    // spills into the Traditional 401k in year 1 — otherwise, at the default
    // large taxable balance, netPortfolioNeed is fully covered by Taxable
    // alone and there's no "trad" step to probe. Lower annualExpenses so the
    // pre-pension floor+trad sits well below the top bracket — otherwise both
    // readings can land in the same (already-high) bracket and the assertion
    // would be vacuously insensitive to the fix.
    app.fire(() => app.latest().accounts.taxable.bal.set(0));
    app.fire(() => app.latest().accounts.taxable.contrib.set(0));
    app.fire(() => app.latest().spending.annualExpenses.set(40_000));
    const retAge = app.latest().assumptions.retirementAge.value;
    expect(retAge).toBeLessThan(73);

    const rateOf = (wv) => {
      const step = wv.steps.find(s => s.key === "trad");
      expect(step).toBeTruthy(); // precondition: there IS a traditional draw to tax
      return Number(step.note.match(/~(\d+)%/)[1]);
    };
    const noPensionRate = rateOf(app.latest().withdrawalView);

    app.fire(() => app.latest().pension.pensionMonthly.set(6_000)); // large enough to force a bracket crossing
    app.fire(() => app.latest().pension.pensionStartAge.set(Math.min(75, retAge + 3)));
    expect(app.latest().pension.pensionStartAge.value).toBeGreaterThan(retAge);
    expect(app.latest().pension.pensionStartAge.value).toBeLessThanOrEqual(73);

    const withDelayedPensionRate = rateOf(app.latest().withdrawalView);
    // Before the fix, calcRMDIncomeFloor received the retirement-gated
    // retPensionBasis (0 for a post-retirement pension), so this would have
    // stayed identical to the no-pension case.
    expect(withDelayedPensionRate).toBeGreaterThan(noPensionRate);
    app.unmount();
  });
});

describe("household RMD average denominator — spouse-only RMDs (CodeRabbit review-fix, PR #62)", () => {
  // avgAnnualRMDHousehold (feeding projectRetirementBracket) originally divided
  // household totalRMDs by rmdData.length — the PRIMARY's own row count. A
  // household where only the SPOUSE has RMDs (primary's own Traditional 401k
  // is empty, so rmdData = []) divided a real, positive totalRMDs by 0 → the
  // ternary's `: 0` branch fired, silently dropping the spouse's entire RMD
  // income from the projected bracket. Fixed to count retPhase.rows where
  // EITHER r.rmd (primary) or r.rmdSpouse (spouse) is nonzero — the union of
  // both schedules' years, not just the primary's.
  function buildSpouseOnlyRmdHousehold(spouseTrad) {
    const app = mount();
    app.fire(() => app.latest().assumptions.currentAge.set(60));
    app.fire(() => app.latest().assumptions.retirementAge.set(65));
    app.fire(() => app.latest().ss.isMarried.set(true));
    app.fire(() => app.latest().ss.spouseCurrentAge.set(63)); // 68 at primary's retirement, 73 five years later — within the default 90 horizon
    app.fire(() => app.latest().spouseAccounts.spouseRetirementAge.set(65)); // no gap window — isolates the RMD effect from the Option-A hold-out
    app.fire(() => app.latest().spouseAccounts.trad401k.bal.set(spouseTrad));
    app.fire(() => app.latest().spouseAccounts.trad401k.contrib.set(0));
    // Primary has NO Traditional 401k at all — rmdData (the primary-only RMD
    // schedule) must stay empty for every value of spouseTrad below.
    app.fire(() => app.latest().accounts.trad401k.bal.set(0));
    app.fire(() => app.latest().accounts.trad401k.contrib.set(0));
    app.fire(() => app.latest().accounts.taxable.bal.set(500_000)); // funds the primary's own spending, independent of the spouse bucket
    app.fire(() => app.latest().spending.annualExpenses.set(40_000)); // leaves bracket room for the crossing to be visible
    return app;
  }

  it("a real household with spouse-only RMDs projects a HIGHER bracket than an otherwise-identical household with none", () => {
    const noSpouseRmd = buildSpouseOnlyRmdHousehold(0);
    expect(noSpouseRmd.latest().rmdView.rows).toEqual([]); // precondition: primary's own schedule really is empty
    const baselineBracket = noSpouseRmd.latest().taxView.projectedRetBracket;
    noSpouseRmd.unmount();

    const withSpouseRmd = buildSpouseOnlyRmdHousehold(1_500_000);
    expect(withSpouseRmd.latest().rmdView.rows).toEqual([]); // still empty — this IS the exact edge case (rmdData=[], totalRMDs>0)
    expect(withSpouseRmd.latest().retirementWalk.totalRMDs).toBeGreaterThan(0); // the household DOES have real RMDs (the spouse's)
    const withRmdBracket = withSpouseRmd.latest().taxView.projectedRetBracket;
    withSpouseRmd.unmount();

    // Before the fix, dividing by rmdData.length (0) took the `: 0` branch —
    // avgAnnualRMDHousehold was silently 0 regardless of spouseTrad, so this
    // assertion would have failed (both brackets identical).
    expect(withRmdBracket).toBeGreaterThan(baselineBracket);
  });
});
