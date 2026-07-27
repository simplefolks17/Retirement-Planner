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
});
