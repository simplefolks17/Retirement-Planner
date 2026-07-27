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
