// frames-c.jsx — Direction C · The Journey
// The whole plan as one life timeline: Today -> Accumulate -> Convert -> Drawdown.
// Progressive disclosure by life phase; edit-mode vs read-mode per phase.

const C_PHASES = [
  { name: "Today", age: "Age 30", c: W.mut, stat: "$165k", sub: "saved so far", flex: 0.6 },
  { name: "Building it", age: "30 – 65", c: ACCT.k401, stat: "+$24.8k/yr", sub: "growing to $3.1M", flex: 2.2 },
  { name: "Low-tax window", age: "65 – 72", c: ACCT.roth, stat: "convert $20k/yr", sub: "trim future taxes", flex: 0.9 },
  { name: "Living off it", age: "72 – 90", c: ACCT.hsa, stat: "$8,200/mo", sub: "lasts past 90", flex: 1.4 },
];

function CTopBar({ active = "plan" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${W.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: W.good }} />
        <Label s={13} c={W.text} w={700} ls="0.02em">Horizon</Label>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {[["Timeline", "plan"], ["Ideas", "ideas"], ["Settings", "set"]].map(([t, k]) => (
          <div key={k} style={{ padding: "7px 14px", borderRadius: 8, background: k === active ? W.panel2 : "transparent", border: `1px solid ${k === active ? W.line2 : "transparent"}` }}>
            <Label s={12.5} c={k === active ? W.text : W.mut} w={k === active ? 600 : 500}>{t}</Label>
          </div>
        ))}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}>
        <Dot c={W.good} /><Label s={11.5} c={W.good} w={600}>On track</Label>
      </div>
    </div>
  );
}

// the big horizontal life timeline
function CTimeline({ activeIdx = -1, compact = false }) {
  const H = compact ? 80 : 120;
  return (
    <div style={{ position: "relative", paddingTop: compact ? 26 : 34 }}>
      {/* baseline */}
      <div style={{ position: "absolute", left: 0, right: 0, top: compact ? 26 : 34, height: 2, background: W.line }} />
      <div style={{ position: "absolute", left: 0, top: compact ? 26 : 34, height: 2, width: "12%", background: W.good, opacity: 0.7 }} />
      <div style={{ display: "flex", gap: 12 }}>
        {C_PHASES.map((p, i) => {
          const on = i === activeIdx;
          return (
            <div key={i} style={{ flex: p.flex, minWidth: 0 }}>
              {/* node */}
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: compact ? 14 : 20 }}>
                <div style={{ width: i === 0 ? 16 : 12, height: i === 0 ? 16 : 12, borderRadius: 999, background: i === 0 ? W.good : (on ? p.c : W.panel), border: `2px solid ${i === 0 ? W.good : (on ? p.c : W.line2)}`, marginTop: i === 0 ? -7 : -5, position: "relative" }}>
                  {i === 0 && <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}><span style={{ font: `600 9.5px/1 ${MONO}`, color: W.good, letterSpacing: "0.06em" }}>YOU ARE HERE</span></div>}
                </div>
              </div>
              <div style={{ border: `1px solid ${on ? p.c : W.line}`, background: on ? `${p.c}0e` : W.panel, borderRadius: 12, padding: compact ? "12px 14px" : "16px 18px" }}>
                <Label s={10.5} c={W.faint} mb={6}>{p.age}</Label>
                <Label s={compact ? 13 : 15} c={W.text} w={600} mb={compact ? 6 : 10}>{p.name}</Label>
                {!compact && <div style={{ marginBottom: 4 }}><Num s={18} c={on ? p.c : W.text}>{p.stat}</Num></div>}
                <Label s={compact ? 10.5 : 11.5} c={W.faint}>{compact ? p.stat : p.sub}</Label>
              </div>
            </div>
          );
        })}
        {/* finish flag */}
        {!compact && (
          <div style={{ flex: 0.7, minWidth: 0 }}>
            <div style={{ marginBottom: 20, display: "flex" }}><div style={{ width: 12, height: 12, marginTop: -5, borderRadius: 3, background: W.good }} /></div>
            <div style={{ border: `1px solid ${W.good}55`, background: `${W.good}10`, borderRadius: 12, padding: "16px 18px" }}>
              <Label s={10.5} c={W.good} mb={6}>Age 90</Label>
              <Label s={15} c={W.text} w={600} mb={10}>The finish</Label>
              <Num s={18} c={W.good}>$1.4M</Num>
              <div style={{ marginTop: 4 }}><Label s={11.5} c={W.faint}>still to spare</Label></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CSpec() {
  return (
    <div style={{ width: 470, height: 860, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${W.warn}22`, border: `1px solid ${W.warn}66`, color: W.warn, font: `700 18px/38px ${MONO}`, textAlign: "center" }}>C</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>The Journey</div>
          <Label s={12} c={W.warn} style={{ marginTop: 3 }}>Life timeline · disclosure by phase</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={22}>Reframes the whole app as a single life on one line — today on the left, the finish on the right. The Flow-Down idea becomes the primary spine. You open one phase at a time.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
        <ASpecRow k="Navigation">The timeline is the nav. Click a phase to dive in; the verdict lives at the far end, age 90.</ASpecRow>
        <ASpecRow k="First run">Set three basics (age, income, retire age) and the line lights up phase by phase as it learns more.</ASpecRow>
        <ASpecRow k="Input ↔ output">Each phase has an Edit side and a Result side — toggle between shaping it and reading it.</ASpecRow>
        <ASpecRow k="Best for">The big-picture thinker who wants to feel how today’s choices ripple across decades.</ASpecRow>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>Directly solves</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {["#1 Scroll", "#4 Buried drivers", "#5 Lost context", "#6 Tab confusion"].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
    </div>
  );
}

function CHome() {
  return (
    <Browser url="horizon.app" w={1340} h={860}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CTopBar />
        <div style={{ flex: 1, padding: "30px 36px", overflow: "hidden" }}>
          <Verdict status="good" headline="At 90, you’re projected to have $1.4M left over." sub="Today’s choices carry you all the way — here’s your money’s journey, one line from now to then." />
          <div style={{ height: 30 }} />
          <CTimeline activeIdx={1} />
          <div style={{ height: 30 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <Panel p={18} style={{ flex: 1 }}>
              <Label s={11} c={W.mut} mb={9}>You keep each month</Label><Num s={22} c={W.good}>$2,140</Num><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>41% of take-home, today</Label></div>
            </Panel>
            <Panel p={18} style={{ flex: 1 }}>
              <Label s={11} c={W.mut} mb={9}>Peak savings at 65</Label><Num s={22} c={W.text}>$3.1M</Num><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>after-tax, today’s dollars</Label></div>
            </Panel>
            <Panel p={18} style={{ flex: 1 }}>
              <Label s={11} c={W.mut} mb={9}>Income in retirement</Label><Num s={22} c={W.text}>$8,200</Num><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>per month, for life</Label></div>
            </Panel>
            <Panel p={18} style={{ flex: 1, borderColor: `${W.warn}40` }}>
              <Label s={11} c={W.mut} mb={9}>One thing to look at</Label><Label s={14} c={W.warn} w={600}>The conversion window</Label><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>could save ~$31k in tax</Label></div>
            </Panel>
          </div>
          <div style={{ height: 16 }} />
          <Label s={11.5} c={W.faint}>Tap any phase above to shape it · Illustrative only, not financial advice</Label>
        </div>
      </div>
    </Browser>
  );
}

// phase opened — "Building it now": edit side + result side
function CPhaseNow() {
  return (
    <Browser url="horizon.app/phase/building" w={1340} h={860}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CTopBar />
        <div style={{ padding: "20px 36px 6px" }}><CTimeline activeIdx={1} compact /></div>
        <div style={{ flex: 1, padding: "20px 36px 28px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <Label s={11} c={W.faint} mb={5}>Phase 2 · ages 30–65</Label>
              <div style={{ font: `600 24px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>Building it</div>
            </div>
            <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 10, background: W.panel, border: `1px solid ${W.line}` }}>
              <div style={{ padding: "7px 16px", borderRadius: 7, background: W.panel2, border: `1px solid ${W.line2}` }}><Label s={12} c={W.text} w={600}>Shape it</Label></div>
              <div style={{ padding: "7px 16px", borderRadius: 7 }}><Label s={12} c={W.mut} w={500}>Read it</Label></div>
            </div>
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,0.85fr) minmax(0,1.15fr)", gap: 18, minHeight: 0 }}>
            {/* edit side */}
            <Panel p={22} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}><span style={{ width: 5, height: 16, borderRadius: 3, background: ACCT.k401 }} /><Label s={13} c={W.text} w={600}>What you do in these years</Label></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Slider label="Income (grows 3%/yr)" val="$100,000" pct={36} accent={W.good} />
                <Slider label="Into 401(k) / yr" val="$10,000" pct={43} accent={ACCT.k401} />
                <Slider label="Into Roth / yr" val="$7,000" pct={70} accent={ACCT.roth} />
                <Slider label="Keep contributing until" val="age 65" pct={80} accent={W.mut} />
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: `1px dashed ${W.line2}`, borderRadius: 10 }}>
                <Label s={12} c={W.mut}>+ Employer match, HSA, growth rate</Label><Label s={11} c={W.faint}>Show</Label>
              </div>
            </Panel>
            {/* result side */}
            <Panel p={22} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}><Dot c={W.good} /><Label s={13} c={W.text} w={600}>What this phase produces</Label></div>
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <BTileC label="By age 65" val="$3.1M" accent={W.good} />
                <BTileC label="You’ll have added" val="$868k" />
                <BTileC label="Growth did" val="+$2.1M" accent={ACCT.roth} />
              </div>
              <Label s={11.5} c={W.faint} mb={12}>How the balance climbs to retirement</Label>
              <div style={{ flex: 1, minHeight: 0 }}><StackBars w={620} h={170} groups={12} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>{["30", "40", "50", "65"].map((y) => <Label key={y} s={10} c={W.faint}>{y}</Label>)}</div>
            </Panel>
          </div>
        </div>
      </div>
    </Browser>
  );
}
// small tile (C-local)
function BTileC({ label, val, accent = W.text }) {
  return <div style={{ flex: 1, background: W.ink, border: `1px solid ${W.line}`, borderRadius: 10, padding: "13px 14px" }}><Label s={10.5} c={W.mut} mb={8}>{label}</Label><Num s={19} c={accent}>{val}</Num></div>;
}

// deep — the conversion window phase
function CPhaseConvert() {
  return (
    <Browser url="horizon.app/phase/window" w={1340} h={860}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CTopBar />
        <div style={{ padding: "20px 36px 6px" }}><CTimeline activeIdx={2} compact /></div>
        <div style={{ flex: 1, padding: "20px 36px 28px", overflow: "hidden" }}>
          <Label s={11} c={W.faint} mb={5}>Phase 3 · ages 65–72 · the quiet years before required withdrawals</Label>
          <div style={{ font: `600 24px/1.15 ${FONT}`, color: W.text, letterSpacing: "-0.02em", maxWidth: 640, marginBottom: 18 }}>A 7-year window to move money into your Roth, cheaply.</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }}>
            <Panel p={22} style={{ borderColor: `${W.good}44`, background: `${W.good}0a` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}><Dot c={W.good} /><Label s={12} c={W.good} w={600}>The move</Label></div>
              <Label s={17} c={W.text} w={600} mb={10}>Convert $20,000/yr from your 401(k) to Roth for 6 of these 7 years.</Label>
              <Label s={13} c={W.mut}>Pay ~<span style={{ color: W.text, fontFamily: MONO }}>$4,400</span> tax now → avoid ~<span style={{ color: W.good, fontFamily: MONO }}>$31,000</span> later.</Label>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}><Chip active accent={W.good}>Fill to 22% bracket</Chip><Chip>24%</Chip><Chip>Custom</Chip></div>
            </Panel>
            <Panel p={22}>
              <Label s={13} c={W.text} w={600} mb={16}>The window, year by year</Label>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
                {[["65", 1], ["66", 1], ["67", 1], ["68", 1], ["69", 1], ["70", 1], ["71", 0]].map(([y, act], i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: act ? 70 : 30, borderRadius: 5, background: act ? `${W.good}33` : W.line, border: `1px solid ${act ? W.good + "66" : W.line2}` }} />
                    <Label s={10} c={W.faint} style={{ marginTop: 6 }}>{y}</Label>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${W.line}` }}><Label s={11.5} c={W.faint}>After 72, required withdrawals begin — the window closes.</Label></div>
            </Panel>
          </div>
          <div style={{ height: 16 }} />
          <Panel p={20}>
            <Label s={13} c={W.text} w={600} mb={6}>What it does to your lifetime taxes</Label>
            <Label s={11.5} c={W.faint} mb={14}>Lower bars are better — the conversion shifts tax out of your highest-rate years.</Label>
            <AreaChart w={1180} h={120} data={[20, 28, 30, 26, 18, 22, 30, 34, 30, 24]} stroke={W.good} ref65={0.18} label="window" />
          </Panel>
        </div>
      </div>
    </Browser>
  );
}

// phone — vertical timeline
function CPhone() {
  return (
    <Phone>
      <div style={{ position: "absolute", inset: 0, padding: "4px 22px 22px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: W.good }} /><Label s={12} c={W.text} w={700}>Horizon</Label></div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}><Dot c={W.good} s={6} /><Label s={10.5} c={W.good} w={600}>On track</Label></div>
        </div>
        <Verdict status="good" headline="$1.4M to spare at 90." sub="Your money’s journey, top to bottom." />
        <div style={{ height: 20 }} />
        {/* vertical timeline */}
        <div style={{ position: "relative", flex: 1, paddingLeft: 22 }}>
          <div style={{ position: "absolute", left: 5, top: 6, bottom: 10, width: 2, background: W.line }} />
          <div style={{ position: "absolute", left: 5, top: 6, height: 40, width: 2, background: W.good, opacity: 0.7 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {C_PHASES.map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: -22, top: 16, width: i === 0 ? 13 : 10, height: i === 0 ? 13 : 10, marginLeft: i === 0 ? 0 : 1.5, borderRadius: 999, background: i === 0 ? W.good : W.panel, border: `2px solid ${i === 0 ? W.good : p.c}` }} />
                <div style={{ border: `1px solid ${i === 1 ? p.c : W.line}`, background: i === 1 ? `${p.c}0e` : W.panel, borderRadius: 12, padding: "13px 15px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Label s={13.5} c={W.text} w={600}>{p.name}</Label><Label s={10.5} c={W.faint}>{p.age}</Label>
                  </div>
                  <div style={{ marginTop: 6 }}><Num s={15} c={i === 1 ? p.c : W.text}>{p.stat}</Num> <span style={{ font: `400 11px ${FONT}`, color: W.faint }}>{p.sub}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { CSpec, CHome, CPhaseNow, CPhaseConvert, CPhone });
