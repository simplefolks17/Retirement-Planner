import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import { Slider } from "../components/Slider.jsx";

// ── BUG-170 (Opus review R-1): the two UIs must build the SAME plan from the same moves ─────────
// Classic's "Retirement Age" and "Life Expectancy" sliders were inline copies of the coupling
// (contribEnd only / minus the spouse clamp) instead of the shared coupled setters Horizon uses,
// so the same moves gave different plans ($62,061 apart at retirement in the review's repro).
// Classic is driven the way a user does: by calling the rendered <Slider>'s onChange; Horizon via
// the real setter bundles. State survives the Classic <-> Horizon switch (it lives in App).

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
// Classic's charts need real DOM measurements react-test-renderer can't provide; the plan
// numbers under test don't depend on them.
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

function mount() {
  captured.length = 0;
  let r;
  act(() => { r = create(React.createElement(App)); });
  return r;
}
const L = () => captured[captured.length - 1];
const fire = (fn) => act(() => fn());
const set = (path, v) => fire(() => path.split(".").reduce((o, k) => o[k], L()).set(v));

// Run `moves` in Classic: flip to Classic, call the named slider's onChange, flip back.
function viaClassic(r, label, values) {
  fire(() => L().onShowClassic());
  for (const v of values) {
    const sl = r.root.findAll(n => n.type === Slider && n.props.label === label)[0];
    expect(sl, `Classic slider "${label}" not found`).toBeTruthy();
    fire(() => sl.props.onChange(v));
  }
  backToHorizon(r);
}
function backToHorizon(r) {
  const back = r.root.findAll(n => n.type === "button" && typeof n.props.onClick === "function"
    && (n.children ?? []).join("").includes("Horizon view"))[0];
  expect(back, "Horizon-view button not found").toBeTruthy();
  fire(() => back.props.onClick());
}
const snap = () => ({
  plateau: L().profile.incomeGrowthEndAge.value,
  ret: L().assumptions.retirementAge.value,
  life: L().assumptions.lifeExpect.value,
  spouseRet: L().spouseAccounts?.spouseRetirementAge?.value,
  totalAtRet: L().totalAtRet,
  yearsSustained: L().yearsSustained,
});

describe("Classic and Horizon build the same plan from the same moves (BUG-170)", () => {
  it("plateau 55, retirement 65 -> 50 -> 65: identical, and the plateau survives", () => {
    const h = mount();
    set("profile.incomeGrowthEndAge", 55);
    set("assumptions.retirementAge", 50);
    set("assumptions.retirementAge", 65);
    const horizon = snap();
    act(() => h.unmount());

    const c = mount();
    set("profile.incomeGrowthEndAge", 55);
    viaClassic(c, "Retirement Age", [50, 65]);
    const classic = snap();
    act(() => c.unmount());

    expect(horizon.plateau).toBe(55);          // non-destructive: not nulled on the way down
    expect(classic).toEqual(horizon);
  });

  it("plateau mid-state (retirement 50): the bundle never shows a plateau past retirement", () => {
    const h = mount();
    set("profile.incomeGrowthEndAge", 55);
    set("assumptions.retirementAge", 50);
    const f = L().profile.incomeGrowthEndAge;
    expect(f.value == null || f.value <= f.max).toBe(true);
    act(() => h.unmount());
    const c = mount();
    set("profile.incomeGrowthEndAge", 55);
    viaClassic(c, "Retirement Age", [50]);
    const g = L().profile.incomeGrowthEndAge;
    expect(g.value == null || g.value <= g.max).toBe(true);
    expect(snap().totalAtRet).toBeGreaterThan(0);
    act(() => c.unmount());
  });

  it("explicit spouse retirement 85, plan-to age 90 -> 80 -> 95: identical, and 85 is restored", () => {
    const marry = () => {
      set("ss.isMarried", true);
      set("profile.filingStatus", "mfj");
      set("ss.spouseCurrentAge", 32);
      set("profile.spouseIncome", 80_000);
      set("spouseAccounts.spouseRetirementAge", 85);
    };
    const h = mount(); marry();
    set("assumptions.lifeExpect", 80);
    set("assumptions.lifeExpect", 95);
    const horizon = snap();
    act(() => h.unmount());

    const c = mount(); marry();
    viaClassic(c, "Life Expectancy", [80, 95]);
    const classic = snap();
    act(() => c.unmount());

    expect(horizon.spouseRet).toBe(85);
    expect(classic).toEqual(horizon);
  });

  it("after a current-age move, Classic's retirement slider keeps contributions through retirement (BUG-168 rule)", () => {
    const h = mount();
    set("assumptions.currentAge", 72);
    set("assumptions.retirementAge", 75);
    const horizon = { ends: [L().accounts.trad401k.contribEnd.value, L().accounts.roth.contribEnd.value], totalAtRet: L().totalAtRet };
    act(() => h.unmount());
    const c = mount();
    set("assumptions.currentAge", 72);
    viaClassic(c, "Retirement Age", [75]);
    const classic = { ends: [L().accounts.trad401k.contribEnd.value, L().accounts.roth.contribEnd.value], totalAtRet: L().totalAtRet };
    act(() => c.unmount());
    expect(horizon.ends).toEqual([75, 75]);
    expect(classic).toEqual(horizon);
  });

  it("Classic's Retirement Age / Life Expectancy sliders ARE the Horizon setters (one handler, both UIs)", () => {
    const c = mount();
    const horizonSet = { ret: L().assumptions.retirementAge.set, life: L().assumptions.lifeExpect.set };
    fire(() => L().onShowClassic());
    const handler = (label) => c.root.findAll(n => n.type === Slider && n.props.label === label)[0].props.onChange;
    // Structural, not behavioural: after BUG-170 made the stored plateau/spouse age non-destructive
    // the two paths' OUTPUTS coincide for most moves, so the sharing itself is what is pinned.
    expect(handler("Retirement Age")).toBe(horizonSet.ret);
    expect(handler("Life Expectancy")).toBe(horizonSet.life);
    act(() => c.unmount());
  });
});

// ── BUG-151 (R-6): Classic's "Retirement state" <select> behaves like Horizon's field ──────────
// Mutations that used to fail 0 tests: `value={effectiveRetirementState}` -> `{retirementState}`
// (renders no selection at the default) and `onChange={setRetirementState}` -> the RAW setter
// (stores an explicit pick that never snaps back to "following your home state").
function classicRetSelect(r) {
  const all = r.root.findAll(n => n.type === "select");
  const hit = all.filter(n => {
    const p = n.parent;
    return p && p.findAll(m => m.type === "p").some(m => (m.children ?? []).join("").includes("Retirement state"));
  });
  expect(hit.length, "Classic retirement-state <select> not found").toBe(1);
  return hit[0];
}

describe("Classic retirement-state <select> (BUG-151)", () => {
  it("shows the EFFECTIVE state (follows the work state) at the default and after the work state changes", () => {
    const c = mount();
    fire(() => L().onShowClassic());
    expect(classicRetSelect(c).props.value).toBe("TX");
    fire(() => L().profile.selectedState.set("CA"));
    expect(classicRetSelect(c).props.value).toBe("CA");    // still auto: it follows, never null
    act(() => c.unmount());
  });

  it("onChange goes through the snapping setter: an explicit pick sticks, re-picking the work state returns to auto", () => {
    const c = mount();
    fire(() => L().profile.selectedState.set("CA"));
    fire(() => L().onShowClassic());
    // (Horizon's captured props are only fresh while Horizon is mounted, so flip back to read.)
    fire(() => classicRetSelect(c).props.onChange({ target: { value: "TX" } }));
    backToHorizon(c);
    expect(L().assumptions.retirementState.value).toBe("TX");
    expect(L().assumptions.retirementState.isAuto).toBe(false);
    fire(() => L().onShowClassic());
    fire(() => classicRetSelect(c).props.onChange({ target: { value: "CA" } }));
    backToHorizon(c);
    expect(L().assumptions.retirementState.value).toBe("CA");
    expect(L().assumptions.retirementState.isAuto).toBe(true);   // raw setter would store explicit CA
    act(() => c.unmount());
  });
});

