// frames-cplus.jsx — Direction C+ · The reframed Journey
// C's life-timeline spine, warmed with A's tone and B's "real plan from defaults",
// with the mortality read engineered out: today-anchored, open-ended horizon,
// later years rendered warm (the payoff), and the endpoint reframed as "covered for life".

// warm "payoff" tones (positive, not the amber alarm read)
const CP_GOLD = "#c8a86a";  // warm sand — the freedom window
const CP_SAND = "#bfa777";  // richer warm — the good years

const CP_PHASES = [
  { name: "Today",          age: "Age 30",  c: W.good,  stat: "$165k",      sub: "built so far",     flex: 0.9  },
  { name: "Building",       age: "30 – 65", c: W.good,  stat: "+$24.8k/yr", sub: "growing steadily", flex: 2.0  },
  { name: "Retirement",      age: "65 – 72", c: CP_GOLD, stat: "$3.1M",       sub: "the fun part",     flex: 0.95 },
  { name: "Your good years",age: "72 +",    c: CP_SAND, stat: "$8,200/mo",  sub: "income for life",  flex: 1.35 },
];

// rotating, tongue-in-cheek "go enjoy it" line — one colored flourish per activity.
if (typeof document !== "undefined" && !document.getElementById("cp-kf")) {
  const s = document.createElement("style");
  s.id = "cp-kf";
  s.textContent = "@keyframes cpRise{from{opacity:0;transform:translateY(.5em)}to{opacity:1;transform:none}}";
  document.head.appendChild(s);
}
const CP_ACTIVITIES = [
  { a: "time on the ", b: "golf course",  z: " mandatory.",            c: "#5fa777", bg: "linear-gradient(160deg,#24482f,#4f8f66 62%,#bfe3b0)" },
  { a: "a ",          b: "beach chair",   z: " with your name on it.", c: "#5e8fc9", bg: "linear-gradient(165deg,#1f3f57,#4f82bf 60%,#cfe7f6)" },
  { a: "the ",        b: "open road",     z: " calling.",              c: "#cf9a4a", bg: "linear-gradient(160deg,#4a3320,#c08a4e 62%,#f0d39a)" },
  { a: "the ",        b: "garden",        z: " finally winning.",       c: "#8a9a5b", bg: "linear-gradient(160deg,#313a1e,#7d8f4f 64%,#d6dca6)" },
  { a: "",            b: "grandkids",     z: " on speed dial.",         c: "#c77f9a", bg: "linear-gradient(160deg,#512839,#bd7390 64%,#f0cdd9)" },
  { a: "fresh ",      b: "powder days",   z: " ahead.",                c: "#7fb0d6", bg: "linear-gradient(165deg,#34465a,#7aa9cf 58%,#eaf4fb)" },
];
function CpActivityLine({ size = 26, lead = "Work optional,", index = null, interval = 2600 }) {
  const controlled = index != null;
  const [iState, setI] = React.useState(0);
  React.useEffect(() => {
    if (controlled) return;
    const t = setInterval(() => setI((x) => (x + 1) % CP_ACTIVITIES.length), interval);
    return () => clearInterval(t);
  }, [controlled, interval]);
  const i = controlled ? index % CP_ACTIVITIES.length : iState;
  const it = CP_ACTIVITIES[i];
  return (
    <div style={{ font: `500 ${size}px/1.18 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>
      <span style={{ fontWeight: 600 }}>{lead} </span>
      <span key={i} style={{ display: "inline-block", animation: "cpRise .5s cubic-bezier(.2,.7,.2,1)" }}>
        {it.a}<span style={{ color: it.c, fontWeight: 700 }}>{it.b}</span>{it.z}
      </span>
    </div>
  );
}

// ── quiet, Apple-like top bar — secondary nav recedes until hover ──
function CpTopBar({ active = "plan" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 28px", borderBottom: `1px solid ${W.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 18, height: 18, borderRadius: 6, background: `${W.good}22`, border: `1px solid ${W.good}66`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: W.good }} />
        </span>
        <Label s={13.5} c={W.text} w={700} ls="0.01em">Horizon</Label>
      </div>
      {/* secondary items sit quiet (faint) — annotated as hover-reveal */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ padding: "6px 13px", borderRadius: 8, background: W.panel2, border: `1px solid ${W.line2}` }}><Label s={12.5} c={W.text} w={600}>Plan</Label></div>
        <div style={{ padding: "6px 13px" }}><Label s={12.5} c={W.faint} w={500}>Ideas</Label></div>
        <div style={{ padding: "6px 13px" }}><Label s={12.5} c={W.faint} w={500}>Settings</Label></div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}>
        <Dot c={W.good} /><Label s={11.5} c={W.good} w={600}>On track</Label>
      </div>
    </div>
  );
}

// ── the life line — open-ended (no finish flag), warm toward the payoff ──
// `lit` = fraction of the line shown as "built" (green behind you); grows with age.
function CpTimeline({ activeIdx = -1, compact = false, lit = 0.12 }) {
  const top = compact ? 24 : 34;
  return (
    <div style={{ position: "relative", paddingTop: top }}>
      {/* baseline fades to nothing on the right — the road keeps going, no wall */}
      <div style={{ position: "absolute", left: 0, right: 0, top, height: 2, background: `linear-gradient(90deg, ${W.line} 0%, ${W.line} 78%, ${W.line}00 100%)` }} />
      {/* "built so far" — the achievement behind you, framed as a positive */}
      <div style={{ position: "absolute", left: 0, top, height: 2, width: `${lit * 100}%`, background: W.good, opacity: 0.75 }} />
      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        {CP_PHASES.map((p, i) => {
          const on = i === activeIdx;
          const warm = i >= 2;
          return (
            <div key={i} style={{ flex: p.flex, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: compact ? 14 : 20 }}>
                <div style={{ width: i === 0 ? 15 : 12, height: i === 0 ? 15 : 12, borderRadius: 999, background: i === 0 ? W.good : (on ? p.c : W.ink), border: `2px solid ${on || i === 0 ? p.c : W.line2}`, marginTop: i === 0 ? -6.5 : -5, position: "relative" }}>
                  {i === 0 && <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}><span style={{ font: `600 9.5px/1 ${MONO}`, color: W.good, letterSpacing: "0.08em" }}>TODAY</span></div>}
                </div>
              </div>
              <div style={{ border: `1px solid ${on ? p.c : (warm ? `${p.c}40` : W.line)}`, background: on ? `${p.c}12` : (warm ? `${p.c}0a` : W.panel), borderRadius: 12, padding: compact ? "11px 13px" : "15px 17px", overflow: "hidden" }}>
                <Label s={10.5} c={warm ? CP_GOLD : W.faint} mb={6}>{p.age}</Label>
                <Label s={compact ? 12.5 : 15} c={W.text} w={600} mb={compact ? 5 : 9}>{p.name}</Label>
                {!compact && <div style={{ marginBottom: 4, whiteSpace: "nowrap" }}><Num s={17} c={on ? p.c : (warm ? CP_GOLD : W.text)}>{p.stat}</Num></div>}
                <Label s={compact ? 10 : 11.5} c={W.faint}>{compact ? p.stat : p.sub}</Label>
              </div>
            </div>
          );
        })}
        {/* open-ended terminus — replaces the "finish flag": a soft, hopeful continuation */}
        {!compact && (
          <div style={{ flex: 0.75, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: W.good, boxShadow: `0 0 0 4px ${W.good}22` }} />
              <Label s={11} c={W.good} w={600}>for life</Label>
            </div>
            <Label s={10.5} c={W.faint}>Past 90 with<br />$1.4M to spare</Label>
          </div>
        )}
      </div>
    </div>
  );
}

// ── progress treatments (the open question) — each a self-contained header block ──
function ProgGoal() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <Label s={12.5} c={W.text} w={600}>78% of the way to retirement</Label>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: W.good, font: `600 12px/1 ${FONT}` }}>↗ gaining ground</span></span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: W.line, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "78%", borderRadius: 5, background: `linear-gradient(90deg, ${W.good}, ${CP_GOLD})` }} />
      </div>
      <Label s={11} c={W.faint} style={{ marginTop: 8 }}>A clear scoreboard — best when you're on or ahead of pace.</Label>
    </div>
  );
}
function ProgNone() {
  const marks = [["Started", true], ["Halfway saved", true], ["Retire · 65", false], ["Income for life", false]];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {marks.map(([t, done], i) => (
          <div key={i} style={{ flex: i === marks.length - 1 ? "0 0 auto" : 1, display: "flex", alignItems: "center", minWidth: 0 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: done ? W.good : W.ink, border: `2px solid ${done ? W.good : W.line2}`, flexShrink: 0 }} />
            {i < marks.length - 1 && <span style={{ flex: 1, height: 2, background: done && marks[i + 1][1] ? W.good : W.line, opacity: done ? 0.7 : 1 }} />}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, gap: 8 }}>
        {marks.map(([t, done], i) => <Label key={i} s={10.5} c={done ? W.text : W.faint} w={done ? 600 : 500}>{t}</Label>)}
      </div>
      <Label s={11} c={W.faint} style={{ marginTop: 10 }}>No number to be judged by — just real milestones lighting up. Calmest for anyone anxious about being "behind".</Label>
    </div>
  );
}
function ProgMomentum() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 92, flexShrink: 0 }}><AreaChart w={92} h={36} data={[10, 14, 20, 30, 46, 64, 84]} stroke={W.good} /></div>
        <div style={{ flex: 1 }}>
          <Label s={13} c={W.text} w={600} mb={4}><span style={{ color: W.good }}>↗ Gaining ground</span> — saving 41% of take-home</Label>
          <Label s={11.5} c={W.mut}>Well above the 15% rule of thumb. At this pace you retire at 65, on your terms.</Label>
        </div>
      </div>
      <Label s={11} c={W.faint} style={{ marginTop: 10 }}>Rewards your <span style={{ color: W.text }}>rate</span>, not your balance — so a fast saver feels the win even if they started late.</Label>
    </div>
  );
}
function ProgAdaptive() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <Label s={12.5} c={W.text} w={600}>Covered through age 83 today</Label>
        <Chip active accent={CP_GOLD}>One change reaches 90+ →</Chip>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: W.line, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "70%", borderRadius: 5, background: W.cool, opacity: 0.85 }} />
        {/* the gap is drawn as the lever, not a red deficit */}
        <div style={{ position: "absolute", left: "70%", right: 0, top: 0, bottom: 0, borderRadius: 5, background: `repeating-linear-gradient(90deg, ${CP_GOLD}40 0 6px, transparent 6px 12px)` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
        <Label s={10} c={W.faint}>today</Label>
        <Label s={10} c={CP_GOLD}>the part we'll close together</Label>
        <Label s={10} c={W.faint}>90+</Label>
      </div>
      <Label s={11} c={W.faint} style={{ marginTop: 10 }}>How we treat someone <span style={{ color: W.text }}>behind</span>: the shortfall becomes a lever with a next step — never a red verdict that says "hopeless".</Label>
    </div>
  );
}

// ── concept card ──
function CpRow({ k, children }) {
  return <div><Eyebrow>{k}</Eyebrow><div style={{ marginTop: 5 }}><Label s={13.5} c={W.text} w={500}>{children}</Label></div></div>;
}
function CpSpec() {
  return (
    <div style={{ width: 470, height: 900, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${W.good}22`, border: `1px solid ${W.good}66`, color: W.good, font: `700 15px/38px ${MONO}`, textAlign: "center" }}>C+</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>The reframed Journey</div>
          <Label s={12} c={W.good} style={{ marginTop: 3 }}>C's spine · A's warmth · B's instant plan</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={20}>Keeps the life-timeline you liked, but engineers out the "end is near" read — and folds in the best of A and B.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <CpRow k="The doom, removed">Today-anchored, not birth-to-death. No finish flag — the line fades into "covered for life". Later years render warm: the payoff, not the decline.</CpRow>
        <CpRow k="Onboarding (from A + B)">Two answers — age + income — return a complete, real plan. You nudge sliders on a plan that already exists, never face a blank interrogation.</CpRow>
        <CpRow k="Shape it / Read it (from C)">The interaction you loved becomes the rhythm of every phase: read the outputs, or quietly play with the inputs.</CpRow>
        <CpRow k="De-busied (vs B)">One hero graphic per view; inputs hidden behind "Shape it". Nav recedes Apple-style until you reach for it.</CpRow>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>Answers your note on</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {["Mortality read", "Question fatigue", "Too-busy data", "Tab clutter"].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
    </div>
  );
}

// ── onboarding: two answers → instant plan ──
function CpOnboard({ interval = 2600 }) {
  return (
    <Browser url="horizon.app/start" w={1280} h={860}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        {/* the ask — only two things */}
        <div style={{ width: 440, flexShrink: 0, borderRight: `1px solid ${W.line}`, background: "#0a0d11", padding: "40px 38px", display: "flex", flexDirection: "column" }}>
          <Eyebrow c={W.faint}>Step 1 — the only required step</Eyebrow>
          <div style={{ height: 14 }} />
          <div style={{ font: `600 27px/1.2 ${FONT}`, color: W.text, letterSpacing: "-0.02em", textWrap: "balance" }}>Two things, and you'll see a real plan.</div>
          <Label s={13.5} c={W.mut} style={{ marginTop: 12 }}>Most people know these off the top of their head. Everything else we assume — and you fine-tune later.</Label>
          <div style={{ height: 30 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <Label s={11.5} c={W.mut} mb={8}>How old are you?</Label>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: W.panel, border: `1px solid ${W.line2}`, borderRadius: 11, padding: "16px 18px" }}>
                <span style={{ font: `500 26px/1 ${MONO}`, color: W.text }}>30</span>
                <Label s={11} c={W.faint}>years</Label>
              </div>
            </div>
            <div>
              <Label s={11.5} c={W.mut} mb={8}>What do you earn, before taxes?</Label>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: W.panel, border: `1px solid ${W.line2}`, borderRadius: 11, padding: "16px 18px" }}>
                <span style={{ font: `500 26px/1 ${MONO}`, color: W.text }}>$100,000</span>
                <Label s={11} c={W.faint}>/ year</Label>
              </div>
              <div style={{ marginTop: 12 }}><Slider label="" val="" pct={36} accent={W.good} /></div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Btn kind="solid" accent={W.good} full>See my plan →</Btn>
          <div style={{ textAlign: "center", marginTop: 13 }}><Label s={12} c={W.faint}>Takes 10 seconds · refine anything later</Label></div>
        </div>
        {/* the instant plan — already alive */}
        <div style={{ flex: 1, minWidth: 0, padding: "34px 36px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", padding: "5px 11px", borderRadius: 999, border: `1px solid ${W.good}44`, background: `${W.good}10`, marginBottom: 16 }}>
            <Dot c={W.good} s={6} /><Label s={11} c={W.good} w={600}>Built from your two answers</Label>
          </div>
          <div style={{ font: `600 26px/1.18 ${FONT}`, color: W.text, letterSpacing: "-0.02em", textWrap: "balance", maxWidth: 520 }}>Someone 30 earning $100k is on track to retire at 65.</div>
          <div style={{ marginTop: 11 }}><CpActivityLine size={18} interval={interval} /></div>
          <Label s={13.5} c={W.mut} style={{ marginTop: 12, maxWidth: 520 }}>~$3.1M by 65 — about $8,200 a month, covered for life. Here's the road, ready to shape.</Label>
          <div style={{ height: 24 }} />
          <CpTimeline activeIdx={1} lit={0.1} />
          <div style={{ height: 26 }} />
          <Label s={11} c={W.faint} mb={11} ls="0.04em" w={600}>WHAT WE ASSUMED FOR YOU — TAP ANY TO CHANGE</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[["Saving rate", "15% → we'll refine"], ["401(k)", "not yet maxed"], ["Retire at", "65"], ["Return", "5%/yr"], ["Lives to", "90+"]].map(([k, v]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 9, background: W.panel, border: `1px solid ${W.line}` }}>
                <Label s={11} c={W.faint}>{k}</Label><Label s={11.5} c={W.text} w={600}>{v}</Label>
              </span>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 11, background: `${CP_GOLD}0e`, border: `1px solid ${CP_GOLD}33` }}>
            <span style={{ color: CP_GOLD, font: `600 15px/1 ${FONT}` }}>↑</span>
            <Label s={12} c={W.mut}>Earn $300k? We'd assume you're already maxing your 401(k) — income alone reshapes the whole plan.</Label>
          </div>
        </div>
      </div>
    </Browser>
  );
}

// ── reframed timeline home ──
function CpHome() {
  return (
    <Browser url="horizon.app" w={1340} h={880}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CpTopBar />
        <div style={{ flex: 1, padding: "28px 36px", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 13, maxWidth: 600 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, alignSelf: "flex-start", padding: "6px 12px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}>
                <Dot c={W.good} /><span style={{ font: `600 12px/1 ${FONT}`, color: W.good, letterSpacing: "0.02em" }}>On track</span>
              </div>
              <div style={{ font: `600 28px/1.14 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>On track for retirement by 65.</div>
              <CpActivityLine size={26} />
              <div style={{ font: `400 13.5px/1.5 ${FONT}`, color: W.mut, maxWidth: 540 }}>Your choices so far are doing the work — here's the road ahead, and it stays covered well past 90.</div>
            </div>
            <div style={{ width: 320, flexShrink: 0, paddingTop: 6 }}><ProgGoal /></div>
          </div>
          <div style={{ height: 28 }} />
          <CpTimeline activeIdx={1} lit={0.12} />
          <div style={{ height: 44 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
            <Label s={10.5} c={W.faint} w={700} ls="0.14em">AT A GLANCE</Label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 999, border: `1px solid ${CP_GOLD}44`, background: `${CP_GOLD}10` }}>
              <span style={{ color: CP_GOLD, font: `600 11px/1 ${FONT}` }}>✦</span>
              <Label s={11} c={CP_GOLD} w={600}>Customize what you see</Label>
              <span style={{ width: 1, height: 11, background: `${CP_GOLD}40` }} />
              <Label s={9.5} c={W.faint} w={700} ls="0.1em">PREMIUM</Label>
            </span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Panel p={18} style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", top: 14, right: 13, color: W.faint, font: `700 10px/1 ${FONT}`, letterSpacing: "1.5px" }}>⋮⋮</span>
              <Label s={11} c={W.mut} mb={9}>You keep each month</Label><Num s={22} c={W.good}>$2,140</Num><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>41% of take-home — and growing</Label></div>
            </Panel>
            <Panel p={18} style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", top: 14, right: 13, color: W.faint, font: `700 10px/1 ${FONT}`, letterSpacing: "1.5px" }}>⋮⋮</span>
              <Label s={11} c={W.mut} mb={9}>Retire at</Label><Num s={22} c={W.text}>65</Num><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>~$3.1M, today's dollars</Label></div>
            </Panel>
            <Panel p={18} style={{ flex: 1, position: "relative", borderColor: `${CP_GOLD}33`, background: `${CP_GOLD}08` }}>
              <span style={{ position: "absolute", top: 14, right: 13, color: `${CP_GOLD}99`, font: `700 10px/1 ${FONT}`, letterSpacing: "1.5px" }}>⋮⋮</span>
              <Label s={11} c={W.mut} mb={9}>Income for life</Label><Num s={22} c={CP_GOLD}>$8,200</Num><div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint}>per month, never runs out</Label></div>
            </Panel>
            <Panel p={18} style={{ flex: 1.1, position: "relative" }}>
              <span style={{ position: "absolute", top: 14, right: 13, color: W.faint, font: `700 10px/1 ${FONT}`, letterSpacing: "1.5px" }}>⋮⋮</span>
              <Label s={11} c={W.mut} mb={9}>One way to get further ahead</Label><Label s={13.5} c={W.text} w={600}>Your retirement years</Label><div style={{ marginTop: 5 }}><Label s={10.5} c={CP_GOLD}>could add ~$31k to spare →</Label></div>
            </Panel>
          </div>
          <div style={{ height: 16 }} />
          <Label s={11.5} c={W.faint}>Tap any phase to shape it · Nav stays out of the way until you reach for it · Illustrative only, not financial advice</Label>
        </div>
      </div>
    </Browser>
  );
}

// ── progress treatments compared ──
function CpProgress() {
  const items = [
    ["1 · Goal progress", <ProgGoal />, W.good],
    ["2 · No number — milestones", <ProgNone />, W.good],
    ["3 · Momentum, not position", <ProgMomentum />, W.good],
    ["4 · Adaptive — for someone behind", <ProgAdaptive />, CP_GOLD],
  ];
  return (
    <div style={{ width: 940, minHeight: 880, background: W.ink, padding: 36, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <Eyebrow c={W.good}>The open question</Eyebrow>
      <div style={{ height: 10 }} />
      <div style={{ font: `600 25px/1.15 ${FONT}`, color: W.text, letterSpacing: "-0.02em", marginBottom: 6 }}>How the line shows progress without doom</div>
      <Label s={13} c={W.mut} mb={24}>Same plan, four ways to read "where am I". The honest answer can stay encouraging — it's the framing of what's <span style={{ color: W.text }}>left</span> that decides whether a behind-pace user feels hope or dread.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map(([label, node, c], i) => (
          <div key={i} style={{ border: `1px solid ${W.line}`, borderRadius: 14, padding: "20px 22px", background: W.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />
              <Label s={12.5} c={W.text} w={700} ls="0.02em">{label}</Label>
            </div>
            {node}
          </div>
        ))}
      </div>
      <div style={{ height: 20 }} />
      <div style={{ padding: "15px 18px", borderRadius: 12, background: `${W.good}0c`, border: `1px solid ${W.good}33` }}>
        <Label s={12.5} c={W.text} w={600} mb={5}>My recommendation</Label>
        <Label s={12.5} c={W.mut}>Lead with <span style={{ color: W.text }}>1 + 3</span> for on-track users — a goal % carried by a momentum line — and let the app <span style={{ color: W.text }}>fall back to 4 automatically</span> the moment someone's behind. Number 2 is the fallback if you'd rather never show a percentage at all.</Label>
      </div>
    </div>
  );
}

// small result tile
function CpTile({ label, val, accent = W.text }) {
  return <div style={{ flex: 1, background: W.ink, border: `1px solid ${W.line}`, borderRadius: 10, padding: "13px 14px" }}><Label s={10.5} c={W.mut} mb={8}>{label}</Label><Num s={19} c={accent}>{val}</Num></div>;
}

// ── phase opened — Shape it / Read it (the interaction you loved), warmed ──
function CpPhase({ topBar = null }) {
  return (
    <Browser url="horizon.app/phase/building" w={1340} h={880}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {topBar || <CpTopBar />}
        <div style={{ padding: "18px 36px 4px" }}><CpTimeline activeIdx={1} compact lit={0.12} /></div>
        <div style={{ flex: 1, padding: "18px 36px 26px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <Label s={11} c={W.faint} mb={5}>Phase 2 · ages 30–65 · the years that build it all</Label>
              <div style={{ font: `600 23px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>Building</div>
            </div>
            <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 10, background: W.panel, border: `1px solid ${W.line}` }}>
              <div style={{ padding: "7px 16px", borderRadius: 7, background: W.panel2, border: `1px solid ${W.line2}` }}><Label s={12} c={W.text} w={600}>Shape it</Label></div>
              <div style={{ padding: "7px 16px", borderRadius: 7 }}><Label s={12} c={W.mut} w={500}>Read it</Label></div>
            </div>
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,0.82fr) minmax(0,1.18fr)", gap: 18, minHeight: 0 }}>
            <Panel p={22} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}><span style={{ width: 5, height: 16, borderRadius: 3, background: W.good }} /><Label s={13} c={W.text} w={600}>What you do in these years</Label></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                <Slider label="Already saved (401k, IRA, etc.)" val="$165,000" pct={28} accent={W.good} />
                <Slider label="Income (grows 3%/yr)" val="$100,000" pct={36} accent={W.good} />
                <Slider label="Into 401(k) / yr" val="$10,000" pct={43} accent={ACCT.k401} />
                <Slider label="Into Roth / yr" val="$7,000" pct={70} accent={ACCT.roth} />
                <Slider label="Keep contributing until" val="age 65" pct={80} accent={W.mut} />
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: `1px dashed ${W.line2}`, borderRadius: 10 }}>
                <Label s={12} c={W.mut}>+ Starting balances, employer match, HSA, growth rate</Label><Label s={11} c={W.faint}>Show</Label>
              </div>
            </Panel>
            <Panel p={22} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}><Dot c={W.good} /><Label s={13} c={W.text} w={600}>What these years build</Label></div>
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <CpTile label="By age 65" val="$3.1M" accent={W.good} />
                <CpTile label="You'll have added" val="$868k" />
                <CpTile label="Growth did the rest" val="+$2.1M" accent={ACCT.roth} />
              </div>
              <Label s={11.5} c={W.faint} mb={12}>How the balance climbs toward your retirement year</Label>
              <div style={{ flex: 1, minHeight: 0 }}><StackBars w={620} h={170} groups={12} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>{["30", "40", "50", "65"].map((y) => <Label key={y} s={10} c={W.faint}>{y}</Label>)}</div>
            </Panel>
          </div>
        </div>
      </div>
    </Browser>
  );
}

// ── phone — vertical journey, open-ended & warm ──
function CpPhone() {
  return (
    <Phone>
      <div style={{ position: "absolute", inset: 0, padding: "4px 22px 22px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 16, height: 16, borderRadius: 5, background: `${W.good}22`, border: `1px solid ${W.good}66`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: W.good }} /></span><Label s={12} c={W.text} w={700}>Horizon</Label></div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}><Dot c={W.good} s={6} /><Label s={10.5} c={W.good} w={600}>On track</Label></div>
        </div>
        <div style={{ font: `600 21px/1.2 ${FONT}`, color: W.text, letterSpacing: "-0.02em", textWrap: "balance" }}>Retirement by 65 — covered for life.</div>
        <div style={{ marginTop: 7 }}><CpActivityLine size={14} /></div>
        <Label s={12.5} c={W.mut} style={{ marginTop: 8 }}>78% of the way — and gaining ground.</Label>
        <div style={{ height: 12 }} />
        <div style={{ height: 7, borderRadius: 5, background: W.line, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "78%", borderRadius: 5, background: `linear-gradient(90deg, ${W.good}, ${CP_GOLD})` }} />
        </div>
        <div style={{ height: 18 }} />
        <div style={{ position: "relative", flex: 1, paddingLeft: 22 }}>
          <div style={{ position: "absolute", left: 5, top: 6, bottom: 30, width: 2, background: `linear-gradient(180deg, ${W.line} 0%, ${W.line} 70%, ${W.line}00 100%)` }} />
          <div style={{ position: "absolute", left: 5, top: 6, height: 30, width: 2, background: W.good, opacity: 0.75 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {CP_PHASES.map((p, i) => {
              const warm = i >= 2;
              return (
                <div key={i} style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: -22, top: 15, width: i === 0 ? 13 : 11, height: i === 0 ? 13 : 11, marginLeft: i === 0 ? 0 : 1, borderRadius: 999, background: i === 0 ? W.good : W.ink, border: `2px solid ${p.c}` }} />
                  <div style={{ border: `1px solid ${i === 1 ? p.c : (warm ? `${p.c}40` : W.line)}`, background: i === 1 ? `${p.c}12` : (warm ? `${p.c}0a` : W.panel), borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <Label s={13.5} c={W.text} w={600}>{p.name}</Label><Label s={10.5} c={warm ? CP_GOLD : W.faint}>{p.age}</Label>
                    </div>
                    <div style={{ marginTop: 5 }}><Num s={15} c={i === 1 ? p.c : (warm ? CP_GOLD : W.text)}>{p.stat}</Num> <span style={{ font: `400 11px ${FONT}`, color: W.faint }}>{p.sub}</span></div>
                  </div>
                </div>
              );
            })}
            {/* open-ended terminus */}
            <div style={{ position: "relative", paddingTop: 2 }}>
              <div style={{ position: "absolute", left: -23, top: 4, width: 11, height: 11, borderRadius: 999, background: W.good, boxShadow: `0 0 0 4px ${W.good}22` }} />
              <Label s={12.5} c={W.good} w={600}>for life</Label>
              <Label s={11} c={W.faint} style={{ marginTop: 3 }}>Past 90 with $1.4M to spare — and counting.</Label>
            </div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { CpSpec, CpOnboard, CpHome, CpProgress, CpPhase, CpPhone,
  CpTopBar, CpTimeline, CpActivityLine, CpTile, ProgGoal, CP_PHASES, CP_GOLD, CP_SAND, CP_ACTIVITIES });
