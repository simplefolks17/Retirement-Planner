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
  // If you're re-locking this value from a NEW household fixture (not just
  // reproducing the default), also check docs/FINANCIAL-MODEL.md's "Monte
  // Carlo Threshold Calibration" section's revisit trigger — a second
  // same-direction contradiction between this number and the withdrawal/
  // longevity drivers should prompt a re-look at MONTE_CARLO_SUCCESS_
  // GUIDELINE_PCT/LOW_ODDS_PCT (irs-2026.js), not just a silent re-lock.
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

// ── planHighlights wiring cross-check (item 5, BUG-122 batch review) ─────────
//
// The Horizon design-review PR (#66, Slice 4) added 7 new fields to
// planHighlights/planView for the Plan screen's rebuilt stat row + dollar-
// basis toggle. Before this block, they had ZERO coverage through the real
// App — only hand-built-fixture unit tests existed. Proven: deliberately
// breaking the real wiring in App.jsx (dropping a basis conversion on ss/
// spouseIncome fed into calcRetIncomeFlow) left the full 1319-test suite
// still 100% green — nothing caught it. This block closes that gap the same
// way the block above does: mount the REAL App, lock the REAL computed
// values (read from a live run, never guessed), additive to the file above.
const PH = {
  todayExpenses:      57_377,
  retExpenses:         226_414.74822089862,
  guaranteedPct:       21,
  guaranteedStartsAge: 67,
  guaranteedStartsLabel: "Social Security",
  savingsCoverUntilStart: true,
  yearsToRetirement:   35,
  retirementDuration:  25,
  outlastsPlan:        false,
  depletionAge:        87,
  yearsShortOfPlan:    3,
};

describe("planHighlights ↔ App wiring cross-check (default state, item 5)", () => {
  it("incomeFlowByBasis carries both bases, correctly related by the SAME inflation factor App.jsx computes once", () => {
    const props = mount();
    const { today, retirement } = props.planHighlights.incomeFlowByBasis;

    expect(today.expenses).toBe(PH.todayExpenses);
    expect(today.ss).toBe(0);          // SS hasn't started by this default's retirement age
    expect(today.hasSS).toBe(false);
    expect(today.portfolioDraw).toBe(today.expenses); // nothing guaranteed yet → 100% portfolio

    expect(retirement.expenses).toBeCloseTo(PH.retExpenses, 6);
    // Both bases are the SAME concept scaled by the SAME factor — today's and
    // retirement's ratio must match exactly (a real wiring bug — e.g. scaling
    // only one of the two — would break this identity, not just move a number).
    const factor = retirement.expenses / today.expenses;
    expect(retirement.portfolioDraw / today.portfolioDraw).toBeCloseTo(factor, 6);
  });

  it("guaranteed (the 'Guaranteed for life' card) reads BUG-122's fixed ungated pct, and gates its 'savings cover you until then' claim on a real computed boolean", () => {
    const props = mount();
    const g = props.planHighlights.guaranteed;

    expect(g.pct).toBe(PH.guaranteedPct);
    // hasSS false: the RETIREMENT-YEAR-GATED snapshot (SS hasn't started by
    // retirement at this default) — a DIFFERENT question from pct above,
    // which reads the ungated eventual streams (BUG-122's whole point: a new
    // user's SS-not-started-yet must not zero out a LIFETIME percentage).
    expect(g.hasSS).toBe(false);
    expect(g.startsAtAge).toBe(PH.guaranteedStartsAge);
    expect(g.startsLabel).toBe(PH.guaranteedStartsLabel);
    // BUG-122 item 2: this must be a real boolean (from calcPlanProgress), not
    // undefined/always-true — the false-reassurance bug was exactly a missing
    // gate here.
    expect(typeof g.savingsCoverUntilStart).toBe("boolean");
    expect(g.savingsCoverUntilStart).toBe(PH.savingsCoverUntilStart);
  });

  it("dollarBasisApplicable/dollarBasisOptions are wired — the toggle has something real to render", () => {
    const props = mount();
    expect(props.planHighlights.dollarBasisApplicable).toBe(true);
    const ids = props.planHighlights.dollarBasisOptions.map(o => o.id);
    expect(ids).toEqual(["today", "retirement"]);
    expect(props.planHighlights.yearsToRetirement).toBe(PH.yearsToRetirement);
    expect(props.planHighlights.retirementDuration).toBe(PH.retirementDuration);
  });

  it("takeHomeIsHousehold is false at the no-spouse default (rule 9's MFJ-only household scope)", () => {
    const props = mount();
    expect(props.planHighlights.takeHomeIsHousehold).toBe(false);
  });

  it("planView (the 'Money lasts to' card) — outlastsPlan/depletionAge/yearsShortOfPlan match golden-master's own yearsSustained/withdrawalRate story", () => {
    const props = mount();
    expect(props.planView.outlastsPlan).toBe(PH.outlastsPlan);
    expect(props.planView.depletionAge).toBe(PH.depletionAge);
    expect(props.planView.yearsShortOfPlan).toBe(PH.yearsShortOfPlan);
  });
});
