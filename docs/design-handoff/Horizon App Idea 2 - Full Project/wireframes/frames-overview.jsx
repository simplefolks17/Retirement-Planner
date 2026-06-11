// frames-overview.jsx — leading section: audit, shared principles, directions matrix.
// These are "document" cards (readable), in the same dark wireframe language.

function OvCard({ children, w = 540, h = 800, p = 32 }) {
  return <div style={{ width: w, height: h, background: W.ink, padding: p, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>;
}
function OvH({ children }) {
  return <div style={{ font: `600 25px/1.15 ${FONT}`, color: W.text, letterSpacing: "-0.02em", marginBottom: 6 }}>{children}</div>;
}

// ── 1 · The audit ──
function OverviewAudit() {
  const problems = [
    ["Endless vertical scroll", "Each tab is 850+ lines of full-width panels stacked top to bottom. Nothing collapses or prioritizes."],
    ["Inputs fused with outputs", "Every panel mixes sliders you control with numbers the model computes. No way to tell them apart."],
    ["No starting point", "The app boots straight into a 48-field form. No onboarding, no empty state, no “start here.”"],
    ["Drivers are buried", "Age, retirement age, return & inflation — which move everything — sit 3 panels down, mid-page."],
    ["Context lives elsewhere", "Fields read “set in Accounts below”; Flow-Down says “convert in the Detailed Planner.” Everything points away."],
    ["Three tabs, unclear relationship", "Detailed is additive to Simple, but they read as equals. New users can’t tell which to use."],
  ];
  return (
    <OvCard>
      <Eyebrow c={W.warn}>Audit · current build</Eyebrow>
      <div style={{ height: 10 }} />
      <OvH>Six problems, confirmed in the code</OvH>
      <Label s={13} c={W.mut} mb={4}>App.jsx — ~2,700 lines, 48 <span style={{ fontFamily: MONO }}>useState</span> inputs, 3 tabs.</Label>
      <div style={{ height: 18 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {problems.map(([t, d], i) => (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, border: `1px solid ${W.line2}`, color: W.warn, font: `600 11px/22px ${MONO}`, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
            <div>
              <Label s={14.5} c={W.text} w={600} mb={3}>{t}</Label>
              <Label s={12.5} c={W.mut}>{d}</Label>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14, marginTop: 14 }}>
        <Label s={12.5} c={W.faint}>Root cause: the app is organized around <span style={{ color: W.text }}>the tax code’s structure</span>, not around <span style={{ color: W.text }}>a person’s questions</span>. All three directions invert that.</Label>
      </div>
    </OvCard>
  );
}

// ── 2 · Shared principles ──
function OverviewPrinciples() {
  const items = [
    ["Answer first, math on demand", "Open with one human verdict — “You’re on track.” Every number below it is optional depth, never the entrance."],
    ["Separate what you control from what you get", "Inputs and results never share a box again. You either edit your plan, or you read your plan."],
    ["Five drivers, surfaced", "Age, retirement age, return, inflation, income lead — because they move everything else."],
    ["Decades, made tangible", "The payoff is 30+ years away. Always tie today’s choices to their future consequence."],
    ["Quiet by default", "Calm like Apple & Claude. No flashing data. A 2-minute check-in, then back to life."],
  ];
  return (
    <OvCard>
      <Eyebrow c={W.good}>Shared foundation</Eyebrow>
      <div style={{ height: 10 }} />
      <OvH>Principles all three directions hold</OvH>
      <Label s={13} c={W.mut}>The directions differ in <span style={{ color: W.text }}>navigation</span> — not in values. These stay constant.</Label>
      <div style={{ height: 22 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map(([t, d], i) => (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <Dot c={W.good} s={7} />
              <Label s={15} c={W.text} w={600}>{t}</Label>
            </div>
            <Label s={12.8} c={W.mut} >{d}</Label>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Label s={11.5} c={W.faint}>Target user · 22–36, first serious full-time income. Financially literate, not an expert. Wants advisor-level insight for $45/yr.</Label>
      </div>
    </OvCard>
  );
}

// ── 3 · Directions compared ──
function OvNavGlyph({ kind }) {
  // tiny structural diagram of each nav model
  const box = (x, y, w, h, fill, op = 1) => <rect x={x} y={y} width={w} height={h} rx="2" fill={fill} opacity={op} />;
  return (
    <svg width="100%" viewBox="0 0 150 84" style={{ display: "block" }}>
      {kind === "a" && <>
        {box(8, 8, 134, 26, W.good, 0.22)} 
        {box(8, 8, 50, 26, W.good, 0.5)}
        {box(8, 42, 134, 14, W.skel)}
        {box(8, 60, 134, 14, W.skel)}
      </>}
      {kind === "b" && <>
        {box(8, 8, 26, 66, W.line2)}
        {box(40, 8, 70, 66, W.skel)}
        {box(116, 8, 26, 66, W.cool, 0.5)}
      </>}
      {kind === "c" && <>
        <line x1="8" y1="42" x2="142" y2="42" stroke={W.line2} strokeWidth="2" />
        {[18, 50, 82, 114].map((x, i) => <circle key={i} cx={x} cy={42} r={i === 1 ? 7 : 5} fill={i === 1 ? W.good : W.line2} />)}
        {box(118, 30, 24, 24, W.good, 0.4)}
      </>}
    </svg>
  );
}
function OverviewMatrix() {
  const cols = [
    ["A", "The Check-In", "No chrome. One answer, then a story you can open. Conversational first-run.", "Very aggressive", "Result is the page; edit in a sheet", "a", W.good],
    ["B", "Plan & Workspace", "Two-pane tool: topic rail, living results canvas, contextual input drawer.", "Moderate", "Inputs in a drawer · results on canvas", "b", W.cool],
    ["C", "The Journey", "The whole plan as one life timeline. Now → accumulate → convert → retire.", "By life phase", "Edit-mode vs read-mode per phase", "c", W.warn],
  ];
  return (
    <OvCard w={860} h={800} p={36}>
      <Eyebrow>Three directions</Eyebrow>
      <div style={{ height: 10 }} />
      <OvH>One question, three navigations</OvH>
      <Label s={13} c={W.mut}>All answer “Am I on track?” first. They differ in how you move through the plan.</Label>
      <div style={{ height: 26 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, flex: 1 }}>
        {cols.map(([k, name, desc, disc, io, glyph, c]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", border: `1px solid ${W.line}`, borderRadius: 12, padding: 18, background: W.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: `${c}22`, border: `1px solid ${c}66`, color: c, font: `700 13px/26px ${MONO}`, textAlign: "center" }}>{k}</span>
              <Label s={16} c={W.text} w={600}>{name}</Label>
            </div>
            <div style={{ background: W.ink, border: `1px solid ${W.line}`, borderRadius: 8, padding: "12px 10px", marginBottom: 14 }}><OvNavGlyph kind={glyph} /></div>
            <Label s={12.5} c={W.mut} mb={16}>{desc}</Label>
            <div style={{ flex: 1 }} />
            <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div><Eyebrow>Disclosure</Eyebrow><Label s={12.5} c={W.text} w={500} style={{ marginTop: 3 }}>{disc}</Label></div>
              <div><Eyebrow>Input ↔ output</Eyebrow><Label s={12.5} c={W.text} w={500} style={{ marginTop: 3 }}>{io}</Label></div>
            </div>
          </div>
        ))}
      </div>
    </OvCard>
  );
}

Object.assign(window, { OverviewAudit, OverviewPrinciples, OverviewMatrix });
