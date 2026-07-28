import { describe, it, expect, vi } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";

// ── Golden-master ↔ App wiring cross-check (forward-compat audit finding, PR #62) ──
//
// `src/model/__tests__/golden-master.test.js` locks the app's headline numbers,
// but it HAND-BUILDS its inputs by calling model functions directly (calcTax,
// runSimulation, buildRetirementPhase, …) — it never mounts App. It even
// hand-mirrors App.jsx's BUG-91 unit conversion (`toRetirementYearDollars`)
// with its own copy of the derivation, by necessity, since it has no App
// instance to read the real conversion from. That means a bug in App.jsx's
// OWN wiring — passing the wrong variable into a call site, the exact shape
// of bug Qodo caught in this same PR (`calcRMDIncomeFloor`/
// `projectRetirementBracket` receiving `retPensionBasis` instead of the
// correct basis) — would NOT be caught by golden-master.test.js, because that
// file never exercises App's actual call sites at all. It only proves the
// underlying MODEL FUNCTIONS are correct in isolation, not that App.jsx wires
// them correctly.
//
// This file closes that gap WITHOUT replacing golden-master.test.js (a full
// rewrite was assessed as higher-risk than additive value — see the
// forward-compat audit's recommendation and the PR #62 review-battery
// writeup in docs/BUGS.md): it mounts the REAL App at the SAME documented
// default state and asserts the SAME headline numbers golden-master.test.js
// locks, read from REAL horizonProps fields instead of hand-built
// intermediates. If a future App.jsx wiring bug ever causes these two files'
// numbers to diverge, THIS file is what catches it — golden-master.test.js
// would stay green (it never mounts App, so it can't see the wiring), but
// this file mounts App and asserts against the same locked constants.
//
// IMPORTANT: these constants are a SUBSET of golden-master.test.js's own `E`
// object (the ones with a direct, unambiguous horizonProps field) — kept as a
// literal copy here, not imported, so a change to one file's locked values
// is forced to be a conscious, visible edit in BOTH files, not a silent
// single-file edit that leaves the other stale. If you deliberately re-lock a
// value in golden-master.test.js, re-lock the SAME value here too, in the
// same commit — that pairing IS the point of this file.

const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));

import App from "../App.jsx";

function mount() {
  captured.length = 0;
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  return captured[captured.length - 1];
}

// Mirrors golden-master.test.js's `E` object exactly, at the same default
// state (see that file's header comment for the full default-state list).
const E = {
  totalAtRet:           4_035_855,
  spendableAtRet:       3_763_788,
  effectiveExpenses:    57_377,
  withdrawalRate:       5.610081338920716,
  yearsSustained:       21.648529319276392,
  firstRMD:             32_213,
  totalRMDs:            79_341,     // household total — byte-identical to primary-only at the no-spouse default
  rmdTaxBite:           10_182,
  conversionWindowYrs:  7,
  netConversionBenefit: -70_844,
  // Session B (Monte Carlo engine port): the no-spouse default's Range-lens
  // success rate was locked by NOTHING at app level before this — a gap the
  // port's own plan-audit process found. Locked PRE-port at 37 first
  // (confirmed green against the still-blended-walk `runMonteCarlo`, per the
  // repo's revert-and-confirm discipline — a lock never observed to fail
  // isn't a lock), then observed to fail post-port as expected, and re-locked
  // here at 24. Direction: DOWN, and this fixture is the "control" case — no
  // spouse, so the port's ONLY live mechanism is that the engine charges real
  // tax on 401k dollars drawn to fund spending (drawTax, on top of RMD/
  // conversion tax), which the older blended walk never charged.
  rangeSuccessPct: 24,
};

describe("golden master ↔ App wiring cross-check (default state)", () => {
  it("App's real horizonProps match golden-master.test.js's locked values exactly", () => {
    const props = mount();

    expect(props.totalAtRet).toBe(E.totalAtRet);
    expect(props.spendableAtRet).toBe(E.spendableAtRet);
    expect(props.effectiveExpenses).toBe(E.effectiveExpenses);
    expect(props.withdrawalRate).toBeCloseTo(E.withdrawalRate, 6);
    expect(props.yearsSustained).toBeCloseTo(E.yearsSustained, 6);
    expect(props.isSustainable).toBe(false); // yearsSustained is finite (< the plan horizon) at this default post-BUG-91

    expect(props.rmdView.firstRMDAmount).toBe(E.firstRMD);
    expect(props.rmdView.householdTotalRMDs).toBe(E.totalRMDs);
    expect(props.rmdView.rmdTaxBite).toBe(E.rmdTaxBite);

    expect(props.conversionWindowYrs).toBe(E.conversionWindowYrs);
    expect(props.netConversionBenefit).toBe(E.netConversionBenefit);
    expect(props.rangeView.successPct).toBe(E.rangeSuccessPct);
  });
});
