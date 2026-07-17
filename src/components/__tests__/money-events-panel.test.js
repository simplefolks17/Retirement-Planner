// ── MoneyEventsPanel — Classic-view money events list ─────────────────────────
//
// Regression coverage for a live display bug: once a duration event (no
// `amount` field) existed alongside a one-time event, the panel's "Net impact
// on portfolio" reduce (`e.isInflow ? e.amount : -e.amount`) hit `undefined`
// for the duration event, producing NaN — and `fmt(NaN)` silently renders
// "$0", masking the bug instead of surfacing it. Fixed by delegating to
// `totalEventImpact` (money-events.js), the ONE source for this sum.
//
// Also covers: a duration event's amount cell renders as a read-only summary
// ("$X/mo × N mo") instead of the editable `<input>` a one-time event gets,
// so Classic can never write a bogus `amount` onto a duration event.

import { describe, it, expect } from "vitest";
import React from "react";
import { create } from "react-test-renderer";
import { MoneyEventsPanel } from "../MoneyEventsPanel.jsx";
import { totalEventImpact } from "../../model/money-events.js";
import { fmt } from "../../formatters.js";

const oneTime = {
  id: "one-1", label: "Car", amount: 40_000, age: 50, isInflow: false, isTaxable: false,
};
const duration = {
  id: "dur-1", label: "Travel", monthlyAmount: 6_000, durationMonths: 6, age: 60,
  isInflow: false, incomeAnnual: 0,
};

function renderPanel(events) {
  let root;
  root = create(
    React.createElement(MoneyEventsPanel, { events, onChange: () => {}, currentAge: 40 })
  );
  return root;
}

describe("MoneyEventsPanel — duration + one-time mix", () => {
  it("net-impact text equals fmt(totalEventImpact), not the NaN-masking $0", () => {
    const root = renderPanel([oneTime, duration]);
    const text = root.toJSON();
    const flat = JSON.stringify(text);
    const expected = fmt(totalEventImpact([oneTime, duration]));
    expect(expected).not.toBe("$0"); // sanity: the real total isn't coincidentally zero
    expect(flat).toContain(expected);
  });

  it("a duration-only list does not render the NaN-masking $0", () => {
    const root = renderPanel([duration]);
    const flat = JSON.stringify(root.toJSON());
    const expected = fmt(totalEventImpact([duration]));
    expect(flat).toContain(expected);
    // The bug produced "$0" specifically because fmt(NaN) === "$0" — confirm the
    // real total for this single outflow event is NOT zero, so a stray "$0"
    // elsewhere in the tree can't accidentally satisfy a weaker assertion.
    expect(expected).not.toBe("$0");
  });

  it("duration row shows the ×-months summary and no editable amount input", () => {
    const root = renderPanel([duration]);
    const flat = JSON.stringify(root.toJSON());
    // JSX splits the interpolated summary into separate text-node children
    // ("$6k", "/mo × ", "6", " mo") rather than one concatenated string —
    // check the pieces are all present rather than one exact substring.
    expect(flat).toContain("$6k"); // fmt(6000) === "$6k"
    expect(flat).toContain("/mo × ");
    expect(flat).toContain(" mo");

    const numberInputs = root.root.findAll(
      node => node.type === "input" && node.props.type === "number" && node.props.placeholder === "Amount"
    );
    expect(numberInputs).toHaveLength(0);
  });

  it("a one-time row still shows the editable amount input", () => {
    const root = renderPanel([oneTime]);
    const numberInputs = root.root.findAll(
      node => node.type === "input" && node.props.type === "number" && node.props.placeholder === "Amount"
    );
    expect(numberInputs).toHaveLength(1);
  });

  it("a duration row with a positive incomeAnnual appends the income annotation", () => {
    const partTime = { ...duration, id: "dur-2", incomeAnnual: 24_000 };
    const flat = JSON.stringify(renderPanel([partTime]).toJSON());
    expect(flat).toContain("income $24k/yr");
  });

  it("a duration row with incomeAnnual 0 (or absent) shows no income annotation", () => {
    const flat = JSON.stringify(renderPanel([duration]).toJSON()); // incomeAnnual: 0
    expect(flat).not.toContain("income $");
  });

  it("footer label reads 'Net cash flow of events' (cash-flow basis, not a portfolio-delta claim)", () => {
    const flat = JSON.stringify(renderPanel([oneTime]).toJSON());
    expect(flat).toContain("Net cash flow of events");
  });
});
