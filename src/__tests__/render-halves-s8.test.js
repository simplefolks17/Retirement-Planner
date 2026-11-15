import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import SSTimingFlow from "../horizon/screens/strategies/SSTimingFlow.jsx";
import WorkLongerFlow from "../horizon/screens/strategies/WorkLongerFlow.jsx";

// ── Review 2 S-8: the RENDERED halves of BUG-176 / BUG-177 / BUG-173 were deletable with 0 failing
// tests, because the suite only pinned the model fields those screens read. Each test below reads
// text the user actually sees, so deleting the on-screen element (or recomputing it from the raw
// figure) fails here. Each was revert-and-confirmed (see docs/audit-2026-11-14/impl-log-R3-B.md).

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("recharts", async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, ResponsiveContainer: () => null };
});
const captured = [];
vi.mock("../components/HorizonShell.jsx", () => ({
  default: (props) => { captured.push(props); return null; },
}));
import App from "../App.jsx";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { innerWidth: 1200, addEventListener: () => {}, removeEventListener: () => {} };
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
afterAll(() => { delete globalThis.window; delete globalThis.ResizeObserver; });

// Flatten a react-test-renderer toJSON tree into its visible text.
const flat = (n) => typeof n === "string" ? n : (n?.children ?? []).map(flat).join("");
const L = () => captured[captured.length - 1];
const fire = (fn) => act(() => fn());
const proxyTheme = new Proxy({}, { get: () => "#334155" });

function mount() {
  captured.length = 0;
  let r;
  act(() => { r = create(React.createElement(App)); });
  return r;
}
function openDetailedClassic(r) {
  fire(() => L().onShowClassic());
  const tab = r.root.findAll(n => n.type === "button" && n.props.className === "tab-btn"
    && flat(n) === "Detailed Planner")[0];
  fire(() => tab.props.onClick());
}

// BUG-177 / BUG-154 fixture: 38,000 pinned at claim age 70, then the claim slider moved to 62.
function pinnedAt62() {
  fire(() => L().ss.ssClaimingAge.set(70));
  fire(() => L().ss.ssOverride.set(38_000));
  fire(() => L().ss.ssClaimingAge.set(62));
}

// BUG-176 fixture: the younger-spouse household (display-consistency-r2b.test.js buildYoungerSpouse).
function youngerSpouse(retAge) {
  const r = mount();
  const f = (fn) => fire(fn);
  f(() => L().assumptions.currentAge.set(48));
  f(() => L().assumptions.retirementAge.set(retAge));
  f(() => L().profile.filingStatus.set("mfj"));
  f(() => L().ss.isMarried.set(true));
  f(() => L().ss.spouseCurrentAge.set(37));
  f(() => L().profile.spouseIncome.set(120_000));
  f(() => L().spouseAccounts.trad401k.contrib.set(20_000));
  f(() => L().spending.annualExpenses.set(120_000));
  f(() => L().conversion.conversionMode.set("custom"));
  f(() => L().conversion.annualConversionAmt.set(0));
  f(() => L().spending.livingExpenses.set(60_000));
  return r;
}

describe("S-8 (BUG-176): the Classic 'Work 2 more years' panel prints the SCENARIO's own age", () => {
  it("'after' is the committed plan at the scenario's retirement age (within a year), not base age + delta", () => {
    const r = youngerSpouse(57);
    const headline = L().retirementWalk.depletionAge;
    fire(() => L().onShowClassic());
    const header = r.root.findAll(n => n.type === "div" && typeof n.props.onClick === "function"
      && flat(n).includes("What-If Calculator"))[0];
    fire(() => header.props.onClick());
    const preset = r.root.findAll(n => n.type === "button" && flat(n) === "Work 2 more years")[0];
    fire(() => preset.props.onClick());
    const txt = flat(r.toJSON());
    act(() => r.unmount());
    const m = txt.match(/to age\s*(\d+)\s*vs\s*Portfolio lasts to age\s*(\d+)/);
    expect(m, txt).toBeTruthy();
    const [after, before] = [Number(m[1]), Number(m[2])];
    expect(before).toBe(headline);

    // Ground truth: commit the scenario's own retirement age (57 + 2) on a fresh plan.
    const c = youngerSpouse(59);
    const committed = L().retirementWalk.depletionAge;
    act(() => c.unmount());
    expect(Math.abs(after - committed), `preview ${after} vs committed-at-59 ${committed}`).toBeLessThanOrEqual(1);
  });
});

describe("S-8 (BUG-177): the Classic Social Security panel shows the RESCALED figure and says so", () => {
  it("the 'Monthly Benefit' tile reads the rescaled monthly figure at the claim age", () => {
    const r = mount();
    pinnedAt62();
    openDetailedClassic(r);
    const txt = flat(r.toJSON());
    act(() => r.unmount());
    // 38,000 entered at 70 rescales to ~21,452/yr at 62, i.e. ~1,788/mo. The raw override/12 is 3,167.
    const monthly = Math.round(Math.round(38_000 * 0.7 / 1.24) / 12);
    expect(txt).toContain(`Monthly Benefit$${monthly.toLocaleString()}at age 62`);
    expect(txt).not.toContain(`Monthly Benefit$${Math.round(38_000 / 12).toLocaleString()}at age 62`);
  });

  it("the Classic override note says the pinned figure was entered at 70 and rescaled", () => {
    const r = mount();
    pinnedAt62();
    openDetailedClassic(r);
    const txt = flat(r.toJSON());
    act(() => r.unmount());
    expect(txt).toContain("entered at age 70, rescaled to");
  });

  it("the Horizon SS timing screen carries the rescale note", () => {
    const r = mount();
    pinnedAt62();
    const note = L().ssView.overrideRescaleNote;
    expect(note).toContain("You entered");
    let flow;
    act(() => { flow = create(React.createElement(SSTimingFlow, { t: proxyTheme, props: L() })); });
    const txt = flat(flow.toJSON());
    act(() => flow.unmount());
    act(() => r.unmount());
    expect(txt).toContain(note);
  });
});

describe("S-8 (BUG-173): the Horizon work-longer screen labels a pinned figure as the user's own", () => {
  it("pinned override: rows read 'your entered figure' instead of a computed +$N/yr delta", () => {
    const r = mount();
    fire(() => L().ss.ssClaimingAge.set(67));
    fire(() => L().ss.ssOverride.set(38_000));
    expect(L().workLongerView.rows.length).toBeGreaterThan(0);
    expect(L().workLongerView.rows.every(row => row.ssPinnedFlat === true)).toBe(true);
    let flow;
    act(() => { flow = create(React.createElement(WorkLongerFlow, { t: proxyTheme, props: L() })); });
    const txt = flat(flow.toJSON());
    act(() => flow.unmount());
    act(() => r.unmount());
    expect(txt).toContain("your entered figure");
  });
});
