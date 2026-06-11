// frames-b.jsx — Direction B · Plan & Workspace
// Two-pane tool: topic rail + living results canvas + contextual input drawer.
// Moderate disclosure; inputs collapse to summary chips once set.

const B_NAV = [
  ["Overview", "home"], ["You & timeline", "you"], ["Income & budget", "income"],
  ["Accounts", "accounts"], ["Future income", "future"], ["Strategy", "strategy"],
];

function BRail({ active }) {
  return (
    <div style={{ width: 212, flexShrink: 0, background: "#0a0d11", borderRight: `1px solid ${W.line}`, display: "flex", flexDirection: "column", padding: "18px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 10px 20px" }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: W.good }} />
        <Label s={13} c={W.text} w={700} ls="0.02em">Northpath</Label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {B_NAV.map(([t, k]) => {
          const on = k === active;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 8, background: on ? W.panel2 : "transparent", border: `1px solid ${on ? W.line2 : "transparent"}` }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: on ? W.good : W.faint }} />
              <Label s={12.5} c={on ? W.text : W.mut} w={on ? 600 : 500}>{t}</Label>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: "12px 11px", borderTop: `1px solid ${W.line}` }}>
        <Label s={11} c={W.faint}>Last saved 2m ago</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12 }}>
          <span style={{ width: 26, height: 26, borderRadius: 999, background: W.panel2, border: `1px solid ${W.line2}` }} />
          <Label s={12} c={W.mut}>Settings</Label>
        </div>
      </div>
    </div>
  );
}

function BTile({ label, val, accent = W.text, sub }) {
  return (
    <div style={{ flex: 1, background: W.panel, border: `1px solid ${W.line}`, borderRadius: 11, padding: "15px 16px" }}>
      <Label s={11} c={W.mut} mb={9}>{label}</Label>
      <Num s={23} c={accent}>{val}</Num>
      {sub && <div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>{sub}</Label></div>}
    </div>
  );
}

// collapsed-to-chips right column (inputs summary)
function BGlance({ heading = "Your plan at a glance", editable = true }) {
  const groups = [
    ["You", [["Age", "30"], ["Retire", "65"], ["Live to", "90"]]],
    ["Money", [["Income", "$100k"], ["Saving", "41%"], ["Return", "5%"]]],
    ["Accounts", [["401(k)", "$50k"], ["Roth", "$25k"], ["HSA", "$10k"], ["Taxable", "$80k"]]],
  ];
  return (
    <div style={{ width: 286, flexShrink: 0, borderLeft: `1px solid ${W.line}`, background: "#0c0f14", padding: 22, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <Label s={13} c={W.text} w={600}>{heading}</Label>
        {editable && <Chip accent={W.line2}>Adjust</Chip>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map(([g, items]) => (
          <div key={g}>
            <Eyebrow c={W.faint}>{g}</Eyebrow>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
              {items.map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: W.panel, border: `1px solid ${W.line}` }}>
                  <Label s={10.5} c={W.faint}>{k}</Label><span style={{ font: `500 11.5px/1 ${MONO}`, color: W.text }}>{v}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: "13px 14px", borderRadius: 10, background: `${W.cool}10`, border: `1px solid ${W.cool}30` }}>
        <Label s={11.5} c={W.mut}>Everything here is editable. Pick a topic on the left, or hit <span style={{ color: W.text }}>Adjust</span>.</Label>
      </div>
    </div>
  );
}

function BShell({ active, children, right }) {
  return (
    <Browser url="app.northpath.com" w={1340} h={860}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        <BRail active={active} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
        {right}
      </div>
    </Browser>
  );
}

function BSpec() {
  return (
    <div style={{ width: 470, height: 860, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${W.cool}22`, border: `1px solid ${W.cool}66`, color: W.cool, font: `700 18px/38px ${MONO}`, textAlign: "center" }}>B</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>Plan & Workspace</div>
          <Label s={12} c={W.cool} style={{ marginTop: 3 }}>Two-pane tool · moderate disclosure</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={22}>A calm command center. A topic rail replaces the three tabs, results live in the middle, and inputs sit in a contextual panel — collapsing to chips once set, so the canvas stays clean.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
        <ASpecRow k="Navigation">A left rail of life topics — Overview, You, Income, Accounts, Future, Strategy — not Simple/Detailed/Flow.</ASpecRow>
        <ASpecRow k="First run">Dashboard-first. We pre-fill smart defaults so you see a real plan immediately, then nudge 3 edits.</ASpecRow>
        <ASpecRow k="Input ↔ output">Spatial split: results fill the center, inputs live in the right panel. Set inputs collapse to chips.</ASpecRow>
        <ASpecRow k="Best for">The hands-on planner who wants to compare scenarios and keep everything within reach.</ASpecRow>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>Directly solves</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {["#2 Mixed I/O", "#4 Buried drivers", "#5 Lost context", "#6 Tab confusion"].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
    </div>
  );
}

function BHeader({ title, verdict = true }) {
  return (
    <div style={{ padding: "20px 26px", borderBottom: `1px solid ${W.line}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Label s={15} c={W.text} w={600}>{title}</Label>
        <Label s={11} c={W.faint}>as of today</Label>
      </div>
    </div>
  );
}

function BHome() {
  return (
    <BShell active="home" right={<BGlance />}>
      <BHeader title="Overview" />
      <div style={{ flex: 1, padding: 26, overflow: "hidden" }}>
        <Verdict status="good" headline="On track to retire at 65." sub="Projected to reach $3.1M — about $8,200 a month, lasting comfortably past 90." />
        <div style={{ height: 22 }} />
        <div style={{ display: "flex", gap: 12 }}>
          <BTile label="Projected at 65" val="$3.1M" accent={W.good} sub="after-tax, today’s dollars" />
          <BTile label="Monthly income" val="$8,200" sub="for life" />
          <BTile label="Money lasts to" val="94" sub="past your plan to 90" />
          <BTile label="Savings rate" val="41%" accent={W.cool} sub="of take-home" />
        </div>
        <div style={{ height: 18 }} />
        <Panel p={20}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Label s={13} c={W.text} w={600}>Your portfolio over a lifetime</Label>
            <div style={{ display: "flex", gap: 14 }}>
              {[["401(k)", ACCT.k401], ["Roth", ACCT.roth], ["HSA", ACCT.hsa], ["Taxable", ACCT.tax]].map(([t, c]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c, opacity: 0.7 }} /><Label s={10.5} c={W.faint}>{t}</Label></div>
              ))}
            </div>
          </div>
          <AreaChart w={760} h={188} ref65={0.5} label="retire 65" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            {["30", "45", "55", "65", "75", "90"].map((y) => <Label key={y} s={10} c={W.faint}>{y}</Label>)}
          </div>
        </Panel>
      </div>
    </BShell>
  );
}

// editing a topic — drawer expands over the chips
function BEdit() {
  const drawer = (
    <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${W.line2}`, background: W.panel, padding: 24, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "-20px 0 60px rgba(0,0,0,.4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Label s={15} c={W.text} w={600}>Income & budget</Label>
        <span style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${W.line2}`, color: W.mut, font: `400 16px/24px ${FONT}`, textAlign: "center" }}>×</span>
      </div>
      <Label s={11.5} c={W.faint} mb={20}>Results update live as you drag.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 19 }}>
        <Slider label="Gross income" val="$100,000" pct={36} accent={W.good} />
        <Slider label="Income growth / yr" val="3%" pct={20} accent={W.cool} />
        <Slider label="Annual living expenses" val="$48,500" pct={45} accent={W.warn} />
        <Slider label="Deploy this % of surplus" val="50%" pct={50} accent={W.good} />
      </div>
      <div style={{ borderTop: `1px solid ${W.line}`, marginTop: 18, paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Label s={12.5} c={W.mut}>Show advanced</Label>
          <Toggle on={false} />
        </div>
        <Label s={11} c={W.faint} style={{ marginTop: 8 }}>Spouse income, pre-tax deductions, FSA …</Label>
      </div>
      <div style={{ flex: 1 }} />
      <Btn kind="solid" accent={W.good} full>Done</Btn>
    </div>
  );
  return (
    <BShell active="income" right={drawer}>
      <BHeader title="Income & budget" />
      <div style={{ flex: 1, padding: 26, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Dot c={W.good} /><Label s={13} c={W.mut}>Live result — updates as you edit on the right</Label>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <BTile label="Take-home / mo" val="$6,180" />
          <BTile label="You keep / mo" val="$2,140" accent={W.good} sub="after living costs" />
          <BTile label="Saving rate" val="41%" accent={W.cool} />
        </div>
        <Panel p={20}>
          <Label s={13} c={W.text} w={600} mb={16}>Where each paycheck goes</Label>
          {[["Taxes", 24, W.warn], ["Living costs", 35, W.mut], ["Into your future", 41, W.good]].map(([t, p, c], i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}><Label s={12} c={W.mut}>{t}</Label><span style={{ font: `500 12px/1 ${MONO}`, color: c }}>{p}%</span></div>
              <div style={{ height: 8, borderRadius: 4, background: W.line }}><div style={{ height: 8, width: `${p}%`, borderRadius: 4, background: c, opacity: 0.7 }} /></div>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${W.line}` }}><Label s={12.5} c={W.faint}>Saving 41% beats the 15% benchmark — the engine behind your “on track” status.</Label></div>
        </Panel>
      </div>
    </BShell>
  );
}

// accounts topic — moderate disclosure (advanced collapsed)
function BAccounts() {
  const accts = [
    ["401(k)", "$50,000", "$10,000/yr", ACCT.k401, "before taxes"],
    ["Roth IRA", "$25,000", "$7,000/yr", ACCT.roth, "tax-free later"],
    ["HSA", "$10,000", "$3,850/yr", ACCT.hsa, "triple tax-free"],
    ["Brokerage", "$80,000", "$4,000/yr", ACCT.tax, "flexible"],
  ];
  return (
    <BShell active="accounts" right={<BGlance heading="Plan at a glance" />}>
      <BHeader title="Accounts" />
      <div style={{ flex: 1, padding: 26, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <Label s={13.5} c={W.mut}>Four accounts — today’s balance and what you add each year.</Label>
          <div><Label s={11} c={W.faint}>Portfolio today</Label> <Num s={16} c={W.text}>$165,000</Num></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {accts.map(([n, bal, con, c, tag]) => (
            <Panel key={n} p={18}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                <Label s={14} c={W.text} w={600}>{n}</Label>
                <span style={{ marginLeft: "auto" }}><Chip>{tag}</Chip></span>
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <div><Label s={10.5} c={W.faint} mb={5}>Balance</Label><Num s={18} c={W.text}>{bal}</Num></div>
                <div><Label s={10.5} c={W.faint} mb={5}>Adding</Label><Num s={18} c={c}>{con}</Num></div>
              </div>
              <div style={{ marginTop: 14 }}><Slider label="" pct={parseInt(con.replace(/\D/g, "")) / 200} accent={c} /></div>
            </Panel>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: `1px dashed ${W.line2}`, borderRadius: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: W.cool, font: `400 18px/1 ${FONT}` }}>+</span>
            <Label s={13} c={W.mut}>Advanced — employer match, HSA payroll, mega backdoor</Label>
          </div>
          <Label s={11.5} c={W.faint}>Show</Label>
        </div>
      </div>
    </BShell>
  );
}

// first run — dashboard-first with defaults + nudge banner
function BFirstRun() {
  return (
    <BShell active="home" right={<BGlance heading="Smart defaults" />}>
      <div style={{ padding: "13px 26px", background: `${W.cool}12`, borderBottom: `1px solid ${W.cool}30`, display: "flex", alignItems: "center", gap: 12 }}>
        <Dot c={W.cool} />
        <Label s={12.5} c={W.text} w={500}>This is a sample plan built from typical numbers. Adjust 3 things to make it yours.</Label>
        <span style={{ marginLeft: "auto" }}><Btn kind="solid" accent={W.cool} s={12}>Start with income →</Btn></span>
      </div>
      <div style={{ flex: 1, padding: 26, overflow: "hidden" }}>
        <Eyebrow c={W.faint}>Example, not your numbers yet</Eyebrow>
        <div style={{ height: 14 }} />
        <Verdict status="good" headline="Someone like you would be on track." sub="With typical income and saving, you’d reach about $3.1M by 65. Make it real in three quick steps." />
        <div style={{ height: 22 }} />
        <div style={{ display: "flex", gap: 12 }}>
          {[["1 · Your income", "We assumed $100k", W.good], ["2 · Your spending", "We assumed $48.5k", W.warn], ["3 · Your accounts", "We assumed $165k", W.cool]].map(([t, d, c], i) => (
            <div key={i} style={{ flex: 1, border: `1px solid ${W.line}`, borderRadius: 12, padding: 18, background: W.panel }}>
              <Label s={13} c={W.text} w={600} mb={7}>{t}</Label>
              <Label s={11.5} c={W.faint} mb={16}>{d}</Label>
              <Btn kind="outline" s={12}>Make it mine</Btn>
            </div>
          ))}
        </div>
        <div style={{ height: 18 }} />
        <Panel p={20} style={{ opacity: 0.55 }}>
          <Label s={12} c={W.faint} mb={14}>Sample projection — fills in as you go</Label>
          <AreaChart w={760} h={150} ref65={0.5} stroke={W.line2} />
        </Panel>
      </div>
    </BShell>
  );
}

// deep — strategy comparison in workspace
function BDeep() {
  return (
    <BShell active="strategy" right={<BGlance heading="Plan at a glance" />}>
      <BHeader title="Strategy · Roth conversion" />
      <div style={{ flex: 1, padding: 26, overflow: "hidden" }}>
        <Label s={13.5} c={W.mut} mb={18}>Compare doing nothing against converting 401(k) → Roth in your low-tax window.</Label>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, border: `1px solid ${W.line}`, borderRadius: 12, padding: 20, background: W.panel }}>
            <Eyebrow c={W.faint}>Plan A · do nothing</Eyebrow>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><Label s={12.5} c={W.mut}>Lifetime taxes</Label><Num s={16} c={W.mut}>$612k</Num></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><Label s={12.5} c={W.mut}>Left at 90</Label><Num s={16} c={W.text}>$1.42M</Num></div>
            </div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${W.good}55`, borderRadius: 12, padding: 20, background: `${W.good}0c` }}>
            <Eyebrow c={W.good}>Plan B · convert $20k/yr</Eyebrow>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><Label s={12.5} c={W.mut}>Lifetime taxes</Label><Num s={16} c={W.good}>$581k</Num></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><Label s={12.5} c={W.mut}>Left at 90</Label><Num s={16} c={W.good}>$1.49M</Num></div>
            </div>
          </div>
        </div>
        <Panel p={20}>
          <Label s={13} c={W.text} w={600} mb={6}>After-tax money left, by year</Label>
          <Label s={11.5} c={W.faint} mb={16}>Plan B pulls ahead after the conversion window closes.</Label>
          <AreaChart w={760} h={170} data={[40, 50, 62, 70, 78, 70, 60, 50, 38, 24]} stroke={W.good} ref65={0.45} label="convert" />
        </Panel>
        <div style={{ height: 14 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Chip active accent={W.cool}>Fill bracket to 22%</Chip><Chip>24%</Chip><Chip>Custom amount</Chip>
          <span style={{ marginLeft: "auto" }}><Btn kind="solid" accent={W.good} s={12}>Apply Plan B to my plan</Btn></span>
        </div>
      </div>
    </BShell>
  );
}

Object.assign(window, { BSpec, BFirstRun, BHome, BEdit, BAccounts, BDeep });
