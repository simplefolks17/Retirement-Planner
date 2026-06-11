// frames-hifi-screens.jsx — hi-fi promoted screens using PALS tokens.
// All use GFONT/GMONO, GPALS, GArcStations, and other exports from
// frames-pastel.jsx + frames-graph.jsx. Load those first.
// Exports: HiFiOnboarding, HiFiIdeas, HiFiNumbers, HiFiSomeday, HiFiPlayground

// ── re-use exports from frames-graph.jsx ──────────────────────────────────
// balAt, rangeAges, smoothPath, makeScales, pct, money,
// GFONT, GMONO, GPALS, GArcStations, GLogo, GOnTrack, GStat, GBox

const HVW = 1200; // must match VW in frames-graph.jsx

// ── shared hi-fi stepper ──────────────────────────────────────────────────
function HiStepper({ t, label, value, hint, accent }) {
  const c = accent || t.accent;
  return (
    <div>
      {label && <div style={{ font: `500 12px ${GFONT}`, color: t.mut, marginBottom: 6 }}>{label}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9,
          border: `1.5px solid ${t.line2}`, background: t.surf,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          font: `600 18px ${GFONT}`, color: c }}>−</span>
        <div style={{ flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${t.line2}`,
          background: t.surf, display: "flex", alignItems: "center", justifyContent: "center",
          font: `600 18px ${GMONO}`, color: t.ink }}>{value}</div>
        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9,
          border: `1.5px solid ${t.line2}`, background: t.surf,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          font: `600 18px ${GFONT}`, color: c }}>+</span>
      </div>
      {hint && <div style={{ font: `400 11.5px ${GFONT}`, color: t.faint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ── ghost arc (onboarding — no labels, opacity + blur controlled) ─────────
function HiGhostArc({ t, opacity = 0.15, blur = 0, H = 200 }) {
  const pad = { l: 62, r: 92, t: 38, b: 46 };
  const s = makeScales(H, pad);
  const pts = rangeAges(1).map(a => [s.xOf(a), +s.yOf(balAt(a)).toFixed(1)]);
  const line = smoothPath(pts);
  const area = line + ` L ${HVW - pad.r} ${s.bot} L ${pad.l} ${s.bot} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${HVW} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", opacity, filter: blur > 0 ? `blur(${blur}px)` : "none",
        transition: "opacity .6s ease, filter .6s ease" }}>
      <defs>
        <linearGradient id="hg-f" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good} stopOpacity="0.28"/>
          <stop offset="55%" stopColor={t.accent} stopOpacity="0.36"/>
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.24"/>
        </linearGradient>
        <linearGradient id="hg-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good}/>
          <stop offset="55%" stopColor={t.accent}/>
          <stop offset="100%" stopColor={t.warm}/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hg-f)"/>
      <path d={line} fill="none" stroke="url(#hg-l)" strokeWidth="2.8" strokeLinecap="round"/>
      <line x1={s.xOf(65)} x2={s.xOf(65)} y1={pad.t} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.45"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  ONBOARDING — A+B combined, interactive
// ══════════════════════════════════════════════════════════════════════════
const HO_STEPS = [
  { q: "How old are you?",                   val: "34",       hint: "we'll map from today to 90" },
  { q: "What do you earn a year?",            val: "$100,000", hint: "before tax — rough is fine" },
  { q: "How much have you saved so far?",     val: "$165,000", hint: "all accounts combined, ballpark is fine" },
  { q: "When would you like to retire?",      val: "65",       hint: "age, not year — easy to change" },
  { q: "How much to spend each month\nin retirement?", val: "$6,000", hint: "today's dollars" },
];
function HiFiOnboarding({ t }) {
  const [step, setStep] = React.useState(0);
  const done = step >= HO_STEPS.length;
  const arcOp = [0.08, 0.20, 0.36, 0.54, 0.72, 0.90][Math.min(step, 5)];
  const arcBlur = [8, 5, 3, 1, 0, 0][Math.min(step, 5)];
  const showHeadline = step >= 3;
  const showTagline = step >= 4;
  const cur = HO_STEPS[Math.min(step, HO_STEPS.length - 1)];
  return (
    <div style={{ width: "100%", height: "100%", background: t.bg, fontFamily: GFONT,
      display: "flex", position: "relative", overflow: "hidden" }}>
      {/* ghost arc fills left area */}
      <div style={{ position: "absolute", inset: "24px 360px 60px 32px", pointerEvents: "none" }}>
        <HiGhostArc t={t} opacity={arcOp} blur={arcBlur} H={560} />
      </div>
      {/* emerging copy over the arc */}
      <div style={{ position: "absolute", left: 44, bottom: 80,
        opacity: showHeadline ? 1 : 0, transition: "opacity .5s", pointerEvents: "none" }}>
        {showHeadline && <div style={{ font: `600 28px ${GFONT}`, color: t.ink, letterSpacing: "-0.02em" }}>
          On track to retire at <span style={{ color: t.accent }}>65</span>.</div>}
        {showTagline && <div style={{ font: `400 16px ${GFONT}`, color: t.mut, marginTop: 6 }}>
          Work optional, <span style={{ color: t.accent, fontWeight: 600 }}>golf course</span> mandatory.</div>}
      </div>
      {/* right panel */}
      <div style={{ width: 360, marginLeft: "auto", flexShrink: 0, height: "100%",
        background: t.surf, borderLeft: `1px solid ${t.line}`,
        display: "flex", flexDirection: "column", padding: "36px 28px", gap: 20, zIndex: 2 }}>
        {/* logo */}
        <GLogo t={t} />
        {/* progress bar */}
        <div style={{ display: "flex", gap: 5 }}>
          {HO_STEPS.map((_, i) => (
            <span key={i} style={{ flex: 1, height: 4, borderRadius: 999,
              background: i < step ? t.accent : i === step ? `${t.accent}44` : t.line,
              transition: "background .3s" }} />
          ))}
        </div>
        <div style={{ font: `400 12px ${GFONT}`, color: t.faint }}>
          {done ? "all done" : `question ${step + 1} of ${HO_STEPS.length}`}</div>
        {done ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ font: `600 26px ${GFONT}`, color: t.ink, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Your plan is ready.</div>
            <div style={{ font: `600 17px ${GFONT}`, color: t.accent, lineHeight: 1.2 }}>Work optional.<br/>Golf course mandatory.</div>
            {[["Income for life", "$8,200/mo", t.warm], ["Retire at", "65", t.ink], ["Left at 90", "$1.4M", t.ink]].map(([l, v, c]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                padding: "12px 0", borderBottom: `1px solid ${t.line}` }}>
                <span style={{ font: `400 13px ${GFONT}`, color: t.mut }}>{l}</span>
                <span style={{ font: `600 18px ${GMONO}`, color: c }}>{v}</span>
              </div>
            ))}
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 20px", borderRadius: 12, background: t.accent, cursor: "pointer" }}>
              <span style={{ font: `600 15px ${GFONT}`, color: "#fff" }}>See my plan →</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ font: `600 26px ${GFONT}`, color: t.ink, letterSpacing: "-0.02em",
              lineHeight: 1.15, whiteSpace: "pre-line" }}>{cur.q}</div>
            <div style={{ font: `400 13px ${GFONT}`, color: t.mut }}>{cur.hint}</div>
            <HiStepper t={t} value={cur.val} />
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {step > 0 && <div onClick={() => setStep(s => s - 1)} style={{ padding: "12px 18px",
                borderRadius: 11, border: `1px solid ${t.line2}`, background: t.surf,
                font: `500 14px ${GFONT}`, color: t.mut, cursor: "pointer" }}>← Back</div>}
              <div onClick={() => setStep(s => s + 1)} style={{ flex: 1, display: "flex",
                alignItems: "center", justifyContent: "center", padding: "13px",
                borderRadius: 11, background: t.accent, cursor: "pointer" }}>
                <span style={{ font: `600 15px ${GFONT}`, color: "#fff" }}>
                  {step === HO_STEPS.length - 1 ? "Build my plan →" : "Next →"}</span>
              </div>
            </div>
            {step > 0 && <div style={{ font: `400 12px ${GFONT}`, color: t.faint, textAlign: "center",
              cursor: "pointer", textDecoration: "underline" }}>skip</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  IDEAS — I4+ unified, interactive (Arc hero + 4 mode panels)
// ══════════════════════════════════════════════════════════════════════════
const HI_ARC_H = 268;
// Scenario dotted paths in GArcStations coordinate space (VW=1200, H=268, pad l=62 r=92 t=38 b=46)
const HI_SCENARIO_PATHS = {
  retire60: "M 62 218 C 180 211 240 180 380 158 C 452 144 506 126 564 118 C 604 112 636 110 668 114 C 725 120 758 124 790 128 C 862 140 960 168 1108 206",
  saveMore: "M 62 218 C 180 208 242 168 380 134 C 452 112 506 84 570 64 C 610 46 640 34 668 36 C 720 26 746 24 762 28 C 840 36 946 70 1108 126",
  bigTrip:  "M 62 218 C 180 211 240 178 380 146 C 452 124 506 96 570 78 C 610 60 640 48 668 50 C 720 40 746 38 762 42 C 810 50 838 62 858 56 C 898 54 952 82 1108 162",
  retire63: "M 62 218 C 180 210 240 176 380 148 C 452 130 506 102 568 84 C 608 68 638 56 668 56 C 720 48 746 46 762 50 C 840 60 946 88 1108 148",
};
const HI_SCENARIOS = {
  retire60: { path:"retire60", label:"Retire at 60", stats:{retire:"60",income:"$7,100",nest:"$2.6M",left:"$420k"} },
  saveMore: { path:"saveMore", label:"Save $300 more/mo", stats:{retire:"64",income:"$9,100",nest:"$3.4M",left:"$1.8M"} },
  bigTrip:  { path:"bigTrip",  label:"Big trip at 70", stats:{retire:"65",income:"$7,800",nest:"$3.1M",left:"$960k"} },
  retire63: { path:"retire63", label:"Retire at 63", stats:{retire:"63",income:"$7,900",nest:"$2.9M",left:"$720k"} },
};
const HI_BASE = { retire:"65", income:"$8,200", nest:"$3.1M", left:"$1.4M" };

function HiIdeasArc({ t, scenario }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <GArcStations t={t} gid="hi-ideas" H={HI_ARC_H} glow={false} />
      {scenario && (
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          width="100%" height={HI_ARC_H} viewBox={`0 0 ${HVW} ${HI_ARC_H}`} preserveAspectRatio="none">
          <path d={HI_SCENARIO_PATHS[scenario.path]} fill="none"
            stroke={t.accent} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="8 5" opacity="0.9"/>
        </svg>
      )}
      {scenario && (
        <div style={{ position: "absolute", right: 100, top: 10, display: "flex",
          alignItems: "center", gap: 7, font: `600 12px ${GFONT}`, color: t.accent }}>
          <svg width="24" height="8">
            <line x1="0" y1="4" x2="24" y2="4" stroke={t.accent} strokeWidth="2.4" strokeDasharray="8 5"/>
          </svg>
          {scenario.label}
        </div>
      )}
    </div>
  );
}
function HiIdeasStats({ t, scenario }) {
  const s = scenario?.stats;
  const stat = (label, bval, sval, warm) => (
    <div key={label} style={{ flex: 1, background: t.surf, border: `1px solid ${t.line}`,
      borderRadius: 12, padding: "11px 13px" }}>
      <div style={{ font: `400 11px ${GFONT}`, color: t.mut, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "nowrap" }}>
        {s && sval !== bval ? (
          <>
            <span style={{ font: `400 15px ${GMONO}`, color: t.faint, textDecoration: "line-through" }}>{bval}</span>
            <span style={{ font: `600 18px ${GMONO}`, color: warm ? t.warm : t.accent }}>{sval}</span>
          </>
        ) : (
          <span style={{ font: `600 18px ${GMONO}`, color: warm ? t.warm : t.ink }}>{bval}</span>
        )}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 9, marginTop: 8, flexShrink: 0 }}>
      {stat("Retire at", HI_BASE.retire, s?.retire)}
      {stat("Income / mo", HI_BASE.income, s?.income, true)}
      {stat("Nest egg", HI_BASE.nest, s?.nest)}
      {stat("Left at 90", HI_BASE.left, s?.left)}
      {s && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px", flexShrink: 0 }}>
          <div style={{ padding: "11px 16px", borderRadius: 11, background: t.accent, cursor: "pointer" }}>
            <span style={{ font: `600 13px ${GFONT}`, color: "#fff" }}>Make this my plan</span>
          </div>
        </div>
      )}
    </div>
  );
}
function HiFiIdeas({ t }) {
  const [mode, setMode] = React.useState(null);
  const [scenario, setScenario] = React.useState(null);
  const [lifeEvents, setLifeEvents] = React.useState([]);
  const modes = [
    { k: "life", l: "Drop life onto timeline" },
    { k: "dials", l: "Dial your future" },
    { k: "suggest", l: "Horizon suggestions" },
    { k: "askit", l: "What if…" },
  ];
  const lifeEvtBtns = [
    { l: "Buy a home", age: 40, scen: "bigTrip" }, { l: "Kid's college", age: 52, scen: "retire63" },
    { l: "Big trip · $40k", age: 70, scen: "bigTrip" }, { l: "Downsize", age: 72, scen: "saveMore" },
    { l: "Part-time at 60", age: 60, scen: "retire60" },
  ];
  const suggestions = [
    { l: "Retire 2 yrs earlier", sub: "Save $250/mo more.", scen: "retire63", c: t.good },
    { l: "Retire at 60", sub: "5 yrs sooner.", scen: "retire60", c: t.warm },
    { l: "Save $300 more/mo", sub: "Retire at 64.", scen: "saveMore", c: t.good },
    { l: "Big trip at 70", sub: "Still funded.", scen: "bigTrip", c: t.accent },
  ];
  return (
    <div style={{ width: "100%", height: "100%", background: t.bg, fontFamily: GFONT,
      display: "flex", flexDirection: "column", padding: "16px 26px 14px", overflow: "hidden" }}>
      {/* nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <GLogo t={t} />
        <div style={{ font: `600 22px ${GFONT}`, color: t.ink, letterSpacing: "-0.02em" }}>Your future, explored.</div>
        <GOnTrack t={t} />
      </div>
      {/* arc hero + scenario overlay */}
      <HiIdeasArc t={t} scenario={scenario} />
      {/* mode buttons */}
      <div style={{ display: "flex", gap: 7, margin: "10px 0 0", flexShrink: 0 }}>
        {modes.map(({ k, l }) => {
          const on = mode === k;
          return <div key={k} onClick={() => { setMode(on ? null : k); if (!on) setScenario(null); setLifeEvents([]); }}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer", textAlign: "center",
              border: `1px solid ${on ? t.accent : t.line2}`, background: on ? `${t.accent}14` : t.surf,
              font: `${on ? 600 : 400} 13px ${GFONT}`, color: on ? t.ink : t.mut, transition: "all .12s" }}>{l}</div>;
        })}
      </div>
      {/* mode panel */}
      {mode && (
        <div style={{ marginTop: 10, flexShrink: 0 }}>
          {mode === "life" && (
            <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 13, padding: 14 }}>
              <div style={{ font: `500 12px ${GFONT}`, color: t.mut, marginBottom: 9 }}>Click to place on your arc:</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {lifeEvtBtns.map(({ l, age, scen }) => {
                  const placed = lifeEvents.some(e => e.label === l);
                  return <div key={l} onClick={() => {
                    if (placed) { setLifeEvents(ev => ev.filter(e => e.label !== l)); }
                    else { setLifeEvents(ev => [...ev, { label: l, age }]); setScenario(HI_SCENARIOS[scen]); }
                  }} style={{ padding: "6px 13px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${placed ? t.warm : t.line2}`, background: placed ? `${t.warm}14` : "transparent",
                    font: `${placed ? 600 : 400} 13px ${GFONT}`, color: placed ? t.ink : t.mut }}>
                    {placed ? "✓  " : ""}{l}
                  </div>;
                })}
              </div>
            </div>
          )}
          {mode === "dials" && (
            <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 13,
              padding: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <HiStepper t={t} label="Retire at" value="65" />
              <HiStepper t={t} label="Extra savings / mo" value="+$0" />
              <HiStepper t={t} label="Monthly spend" value="$6,000" />
              <div onClick={() => setScenario(HI_SCENARIOS.retire63)}
                style={{ padding: "11px 18px", borderRadius: 11, background: t.accent, cursor: "pointer", flexShrink: 0 }}>
                <span style={{ font: `600 14px ${GFONT}`, color: "#fff" }}>Show on arc →</span>
              </div>
            </div>
          )}
          {mode === "suggest" && (
            <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 13, padding: 14, display: "flex", gap: 9 }}>
              {suggestions.map(({ l, sub, scen, c }) => {
                const on = scenario?.path === scen;
                return <div key={l} onClick={() => setScenario(on ? null : HI_SCENARIOS[scen])}
                  style={{ flex: 1, padding: "12px 12px", borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${on ? c : t.line2}`, background: on ? `${c}12` : "transparent" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c, display: "block", marginBottom: 6 }} />
                  <div style={{ font: `600 14px ${GFONT}`, color: t.ink, lineHeight: 1.05 }}>{l}</div>
                  <div style={{ font: `400 12px ${GFONT}`, color: t.mut, marginTop: 3 }}>{sub}</div>
                </div>;
              })}
            </div>
          )}
          {mode === "askit" && (
            <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 13, padding: 14, display: "flex", gap: 9, alignItems: "center" }}>
              <span style={{ font: `600 16px ${GFONT}`, color: t.accent, flexShrink: 0 }}>What if…</span>
              <div style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${t.line2}`,
                background: t.bg, display: "flex", alignItems: "center", paddingLeft: 12 }}>
                <span style={{ font: `400 14px ${GFONT}`, color: t.mut }}>I retire at 60 instead of 65?</span>
              </div>
              <div onClick={() => setScenario(HI_SCENARIOS.retire60)}
                style={{ padding: "11px 18px", borderRadius: 11, background: t.accent, cursor: "pointer", flexShrink: 0 }}>
                <span style={{ font: `600 14px ${GFONT}`, color: "#fff" }}>Show on arc →</span>
              </div>
            </div>
          )}
        </div>
      )}
      {/* stats */}
      <HiIdeasStats t={t} scenario={scenario} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  NUMBERS — combined blend (Optimizer banner + Statement/Yearly/Flow tabs)
// ══════════════════════════════════════════════════════════════════════════
const SERIF = "Georgia, 'Times New Roman', serif";
function HiStmtCol({ t, title, items, bar }) {
  const Foot = ({ n }) => <sup style={{ font: `700 10px ${GFONT}`, color: t.accent }}>{n}</sup>;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ font: `600 11px ${GFONT}`, color: t.accent, letterSpacing: "0.08em",
        textTransform: "uppercase", marginBottom: 12, borderBottom: `1.5px solid ${t.line2}`, paddingBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {items.map(([l, v, foot, strong]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ font: `${strong ? 600 : 400} 14px ${SERIF}`, color: strong ? t.ink : t.mut, whiteSpace: "nowrap" }}>
              {l}{foot && <Foot n={foot} />}</span>
            <span style={{ font: `${strong ? 600 : 400} 14px ${GMONO}`, color: t.ink, whiteSpace: "nowrap" }}>{v}</span>
          </div>
        ))}
      </div>
      {bar && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", height: 22, borderRadius: 7, overflow: "hidden", border: `1px solid ${t.line2}` }}>
            {bar.segs.map((seg, i) => (
              <div key={i} style={{ flex: seg.f, background: seg.c, opacity: 0.7,
                borderRight: i < bar.segs.length - 1 ? `1px solid ${t.surf}` : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                font: `600 10px ${GFONT}`, color: t.surf, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                {seg.l}
              </div>
            ))}
          </div>
          <div style={{ font: `400 11px ${SERIF}`, color: t.faint, marginTop: 4, fontStyle: "italic" }}>{bar.cap}</div>
        </div>
      )}
    </div>
  );
}
function HiFiNumbers({ t }) {
  const [tab, setTab] = React.useState("statement");
  const tabs = [["statement", "Statement"], ["yearly", "Year by year"], ["flow", "Money flow"]];
  const yearRows = [
    ["34","$100k","$25k","$11k",0.05,"$165k","Today",t.good],["46","$140k","$38k","$16k",0.28,"$890k","First $1M",t.accent],
    ["65","$240k","$68k","$26k",0.97,"$3.05M","Retire",t.accent],["70","—","$9k","—",1.0,"$3.21M","Peak",t.warm],
    ["73","—","$11k","—",0.94,"$3.0M","RMDs",t.warm],["90","—","$4k","—",0.40,"$1.4M","For life",t.warm],
  ];
  return (
    <div style={{ width: "100%", height: "100%", background: t.bg, fontFamily: GFONT,
      display: "flex", flexDirection: "column", padding: "16px 26px 14px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <GLogo t={t} />
        <div style={{ font: `600 18px ${GFONT}`, color: t.ink, letterSpacing: "-0.02em" }}>The numbers</div>
        <GOnTrack t={t} />
      </div>
      {/* value banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 16px",
        borderRadius: 13, background: t.surf2, border: `1px solid ${t.line2}`, marginBottom: 12, flexShrink: 0 }}>
        <span style={{ font: `600 13px ${GFONT}`, color: t.accent }}>✦ The engine is working</span>
        <span style={{ width: 1.5, height: 26, background: t.line2 }} />
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ font: `600 20px ${GMONO}`, color: t.good }}>$14,200</span>
          <span style={{ font: `400 12px ${GFONT}`, color: t.mut }}>saved in tax this year</span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ font: `600 20px ${GMONO}`, color: t.ink }}>$310k</span>
          <span style={{ font: `400 12px ${GFONT}`, color: t.mut }}>over your lifetime</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ font: `400 12px ${GFONT}`, color: t.accent, borderBottom: `1px dotted ${t.accent}` }}>6 active moves →</span>
      </div>
      {/* tab strip */}
      <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, background: t.line,
        alignSelf: "flex-start", marginBottom: 12, flexShrink: 0 }}>
        {tabs.map(([k, l]) => {
          const on = tab === k;
          return <div key={k} onClick={() => setTab(k)} style={{ padding: "6px 16px", borderRadius: 8, cursor: "pointer",
            background: on ? t.surf2 : "transparent", font: `${on ? 600 : 400} 13px ${GFONT}`,
            color: on ? t.ink : t.mut, boxShadow: on ? "0 1px 4px rgba(0,0,0,.09)" : "none" }}>{l}</div>;
        })}
      </div>
      {/* tab body */}
      <div style={{ flex: 1, background: t.surf, border: `1px solid ${t.line}`, borderRadius: 14,
        padding: 20, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {tab === "statement" && (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              borderBottom: `2px solid ${t.ink}`, paddingBottom: 10, marginBottom: 3 }}>
              <span style={{ font: `700 22px ${SERIF}`, color: t.ink, letterSpacing: "0.04em" }}>HORIZON</span>
              <span style={{ font: `400 12px ${SERIF}`, color: t.mut, textAlign: "right" }}>
                Statement of your plan · June 2026 · today's dollars</span>
            </div>
            <div style={{ height: 2.5, background: t.ink, marginBottom: 16 }} />
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: `400 11px ${GFONT}`, color: t.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>The bottom line</div>
              <div style={{ font: `700 32px ${SERIF}`, color: t.ink, lineHeight: 1 }}>$8,200 <span style={{ font: `400 16px ${SERIF}`, color: t.mut }}>/ month, for life</span></div>
              <div style={{ font: `400 13px ${SERIF}`, color: t.mut, marginTop: 5 }}>with <span style={{ color: t.warm, fontWeight: 700 }}>$1.4M</span> remaining at age 90.</div>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 28, minHeight: 0 }}>
              <HiStmtCol t={t} title="Income & tax"
                items={[["Gross income","$100,000",null,false],["Federal tax","−$13,400","1",false],["FICA + state","−$11,850",null,false],["Pre-tax savings","−$13,000",null,false],["Take-home","$61,750",null,true]]}
                bar={{ segs:[{f:71,c:t.good,l:"Keep 71%"},{f:18,c:t.line2,l:"Tax 18%"},{f:11,c:t.warm,l:"Save 11%"}], cap:"of every dollar earned" }} />
              <span style={{ width: 1, background: t.line2 }} />
              <HiStmtCol t={t} title="What you're building"
                items={[["401(k)","$1.40M",null,false],["Roth IRA","$740k","2",false],["Brokerage","$560k",null,false],["HSA","$370k",null,false],["Nest egg by 65","$3.10M",null,true]]}
                bar={{ segs:[{f:46,c:t.good,l:"401k"},{f:24,c:t.accent,l:"Roth"},{f:18,c:t.warm,l:"Brkg"},{f:12,c:t.line2,l:"HSA"}], cap:"$3.1M across four buckets" }} />
              <span style={{ width: 1, background: t.line2 }} />
              <HiStmtCol t={t} title="Income for life"
                items={[["Social Security","$2,800/mo","3",false],["Portfolio draw","$5,400/mo",null,false],["Safe rate","3.8%",null,false],["Runs dry at","never",null,false],["Total monthly","$8,200/mo",null,true]]}
                bar={{ segs:[{f:34,c:t.warm,l:"Soc Sec"},{f:66,c:t.good,l:"Portfolio draw"}], cap:"blended monthly income" }} />
            </div>
            <div style={{ borderTop: `1px solid ${t.line2}`, marginTop: 12, paddingTop: 8,
              display: "flex", gap: 20, flexWrap: "wrap" }}>
              {["1 Eff. federal rate 13.4%.","2 5% real return, contributions to 65.","3 Claimed at FRA 67."].map((f, i) => (
                <span key={i} style={{ font: `400 11px ${SERIF}`, color: t.faint }}>{f}</span>
              ))}
            </div>
          </>
        )}
        {tab === "yearly" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr 2.4fr 1.2fr",
              padding: "10px 14px", borderBottom: `1.5px solid ${t.ink}`, background: t.surf2 }}>
              {["Age","Income","Tax","Saved","Balance",""].map((c, i) => (
                <span key={i} style={{ font: `600 12px ${GFONT}`, color: t.ink }}>{c}</span>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              {yearRows.map(([age, inc, tax, sav, bal, balL, tag, tc]) => (
                <div key={age} style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr 2.4fr 1.2fr",
                  alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${t.line}`,
                  background: tag === "Retire" ? `${t.accent}0e` : "transparent" }}>
                  <span style={{ font: `600 15px ${GMONO}`, color: tc }}>{age}</span>
                  <span style={{ font: `400 13px ${GMONO}`, color: t.mut }}>{inc}</span>
                  <span style={{ font: `400 13px ${GMONO}`, color: t.mut }}>{tax}</span>
                  <span style={{ font: `400 13px ${GMONO}`, color: t.mut }}>{sav}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 16 }}>
                    <span style={{ flex: 1, height: 12, borderRadius: 3, background: t.line, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${bal * 100}%`,
                        background: Number(age) >= 65 ? t.warm : t.good, opacity: 0.75 }} />
                    </span>
                    <span style={{ font: `600 12px ${GMONO}`, color: t.ink, width: 50, textAlign: "right" }}>{balL}</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
                    borderRadius: 999, border: `1px solid ${tc}55`, background: `${tc}14`,
                    font: `600 11px ${GFONT}`, color: tc, whiteSpace: "nowrap" }}>{tag}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "9px 14px", borderTop: `1px solid ${t.line}`, background: t.surf2,
              font: `400 12px ${GFONT}`, color: t.faint }}>key rows · 56 years total</div>
          </div>
        )}
        {tab === "flow" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
            <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: t.surf2, borderRadius: 10, border: `1px dashed ${t.line2}` }}>
              <span style={{ font: `400 14px ${GFONT}`, color: t.faint }}>Sankey diagram — Money flow · paycheck → accounts → $3.1M</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[["71% take-home",t.good],["18% tax",t.line2],["11% invested",t.warm]].map(([l,c])=>(
                <span key={l} style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",
                  borderRadius:999,border:`1px solid ${c}55`,background:`${c}14`,
                  font:`500 12px ${GFONT}`,color:t.ink }}><span style={{width:8,height:8,borderRadius:999,background:c}}/>{l}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  SOMEDAY — photo bg + "work optional X mandatory" foreground
// ══════════════════════════════════════════════════════════════════════════
const HI_ACTIVITIES = [
  { k:"golf",    l:"Golf course",  sub:"18 holes whenever you want." },
  { k:"travel",  l:"First class",  sub:"The trip you've been putting off." },
  { k:"hiking",  l:"The mountains",sub:"The trail has been waiting." },
  { k:"cooking", l:"The kitchen",  sub:"Three-hour dinners, every night." },
  { k:"garden",  l:"The garden",   sub:"Time is finally on your side." },
  { k:"family",  l:"The grandkids",sub:"Fully present, zero distraction." },
];
function HiFiSomeday({ t }) {
  const [actIdx, setActIdx] = React.useState(0);
  const act = HI_ACTIVITIES[actIdx];
  const newsrdr = "'Newsreader', Georgia, serif";
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: t.bg }}>
      {/* photo placeholder bg */}
      <div style={{ position: "absolute", inset: 0, background: t.line2, display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.3 }} preserveAspectRatio="none">
          <line x1="0" y1="0" x2="100%" y2="100%" stroke={t.line} strokeWidth="1.5"/>
          <line x1="100%" y1="0" x2="0" y2="100%" stroke={t.line} strokeWidth="1.5"/>
        </svg>
        <span style={{ font: `400 14px ${GFONT}`, color: t.faint, position: "relative", zIndex: 1 }}>
          thematic photo · {act.l.toLowerCase()}
        </span>
      </div>
      {/* dark gradient overlay */}
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(135deg, rgba(18,14,10,.80) 0%, rgba(18,14,10,.20) 55%, rgba(18,14,10,.60) 100%)" }}/>
      {/* foreground content */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "32px 44px", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ font: `700 17px ${GFONT}`, color: "rgba(255,255,255,.80)" }}>Horizon</span>
          <span style={{ font: `500 12.5px ${GFONT}`, color: "rgba(255,255,255,.55)",
            border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, padding: "4px 14px" }}>
            Age 67 · fully funded
          </span>
        </div>
        <div style={{ maxWidth: 580 }}>
          <div style={{ font: `400 13px ${GFONT}`, color: "rgba(255,255,255,.45)",
            letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>work optional.</div>
          <div style={{ font: `700 62px ${newsrdr}`, color: "#ffffff", lineHeight: 1.0,
            textShadow: "0 2px 20px rgba(0,0,0,.40)", marginBottom: 2 }}>{act.l}</div>
          <div style={{ font: `400 62px ${newsrdr}`, color: "rgba(255,255,255,.75)", lineHeight: 1.0,
            textShadow: "0 2px 20px rgba(0,0,0,.40)", marginBottom: 22 }}>mandatory.</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ font: `600 36px ${GMONO}`, color: "rgba(255,255,255,.95)" }}>$8,200</span>
            <span style={{ font: `400 16px ${GFONT}`, color: "rgba(255,255,255,.50)" }}>a month, for life.</span>
          </div>
          <div style={{ font: `400 14px ${GFONT}`, color: "rgba(255,255,255,.38)", marginTop: 6 }}>{act.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: `400 12px ${GFONT}`, color: "rgba(255,255,255,.38)" }}>your thing:</span>
          {HI_ACTIVITIES.map((a, i) => (
            <div key={a.k} onClick={() => setActIdx(i)} style={{ padding: "5px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${i === actIdx ? "rgba(255,255,255,.70)" : "rgba(255,255,255,.22)"}`,
              background: i === actIdx ? "rgba(255,255,255,.16)" : "transparent",
              font: `${i === actIdx ? 600 : 400} 12.5px ${GFONT}`,
              color: i === actIdx ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.44)" }}>{a.l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  PLAYGROUND — palette × theme × screen switcher
// ══════════════════════════════════════════════════════════════════════════
function HiFiPlayground() {
  const auto = (new Date().getHours() >= 7 && new Date().getHours() < 18) ? "light" : "dark";
  const [screen, setScreen] = React.useState("onboarding");
  const [palKey, setPalKey] = React.useState("apricot");
  const [pref, setPref] = React.useState("light");
  const mode = pref === "auto" ? auto : pref;
  const t = GPALS[palKey][mode];
  const screens = [["onboarding","Onboarding"],["ideas","Ideas"],["numbers","The numbers"],["someday","Someday"]];
  const seg = (cur, val, label, set) => {
    const on = cur === val;
    return <div key={val} onClick={() => set(val)} style={{ padding: "6px 13px", borderRadius: 8, cursor: "pointer",
      background: on ? t.surf : "transparent", boxShadow: on ? "0 1px 3px rgba(0,0,0,.14)" : "none",
      font: `${on ? 600 : 400} 12.5px ${GFONT}`, color: on ? t.ink : t.faint }}>{label}</div>;
  };
  return (
    <div style={{ width: 1340, height: 900, background: t.bg, fontFamily: GFONT,
      display: "flex", flexDirection: "column", overflow: "hidden", transition: "background .3s" }}>
      {/* control bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px",
        background: t.surf2, borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: t.bg, border: `1px solid ${t.line}` }}>
          {screens.map(([k, l]) => seg(screen, k, l, setScreen))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {Object.keys(GPALS).map(k => {
            const on = palKey === k;
            return <div key={k} onClick={() => setPalKey(k)} title={GPALS[k].name}
              style={{ width: 20, height: 20, borderRadius: 999, cursor: "pointer",
                background: GPALS[k].swatch, border: `2px solid ${on ? t.ink : "transparent"}`,
                boxShadow: `0 0 0 2px ${t.surf2}` }} />;
          })}
        </div>
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: t.bg, border: `1px solid ${t.line}` }}>
          {[["light","Light"],["dark","Dark"],["auto","Auto"]].map(([k,l]) => seg(pref,k,l,setPref))}
        </div>
      </div>
      {/* screen */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {screen === "onboarding" && <HiFiOnboarding t={t} />}
        {screen === "ideas"      && <HiFiIdeas t={t} />}
        {screen === "numbers"    && <HiFiNumbers t={t} />}
        {screen === "someday"    && <HiFiSomeday t={t} />}
      </div>
    </div>
  );
}

Object.assign(window, { HiFiOnboarding, HiFiIdeas, HiFiNumbers, HiFiSomeday, HiFiPlayground });
