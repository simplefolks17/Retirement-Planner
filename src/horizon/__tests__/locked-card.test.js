import { describe, it, expect } from "vitest";
import React from "react";
import { act, create } from "react-test-renderer";
import LockedCard from "../LockedCard.jsx";

// ── WI-5.2 (#113) Slice 3: LockedCard ────────────────────────────────────────
// Pure renderer test — title/teaser/chip always show; the dollar teaser line
// is a designed no-number edge state when teaserValue is omitted (rule 10:
// missing data is never fabricated as $0).

// Any t.<token> resolves to a color string so styles render in the node env.
const t = new Proxy({}, { get: () => "#334155" });

function mount(props) {
  let r;
  act(() => { r = create(React.createElement(LockedCard, { t, ...props })); });
  return { r, tree: () => JSON.stringify(r.toJSON()) };
}

describe("LockedCard", () => {
  it("renders the title, teaser, and Premium chip", () => {
    const app = mount({ title: "Monte Carlo range", teaser: "See the full range of outcomes" });
    const tree = app.tree();
    expect(tree).toContain("Monte Carlo range");
    expect(tree).toContain("See the full range of outcomes");
    expect(tree).toContain("Premium");
    act(() => app.r.unmount());
  });

  it("shows the calm dollar teaser when teaserValue is given", () => {
    const app = mount({ title: "Advisor share", teaser: "Unlock this", teaserValue: 5000 });
    expect(app.tree()).toContain("$5k");
    act(() => app.r.unmount());
  });

  it("shows no dollar sign anywhere when teaserValue is omitted", () => {
    const app = mount({ title: "Advisor share", teaser: "Unlock this" });
    expect(app.tree()).not.toContain("$");
    act(() => app.r.unmount());
  });
});
