// frames-sketch.jsx — quick aesthetic sketches for the Horizon home.
// Design-forward only: copy & numbers are placeholder. Each artboard explores
// ONE axis (mood / hero-object / composition / ambience / interaction) so the
// routes can be compared, plus two combos.
//   A     dark  + horizon-as-hero        (changes the hero object)
//   B     paper + dashboard              (changes the mood — warm skin)
//   C     dark  + editorial              (changes the composition)
//   D     dusk  + ambient glass          (changes the emotional presence)
//   E     dark  + conversational         (changes the interaction model)
//   A+B   paper + horizon-as-hero        (my recommended combo)
//   A+B+C paper + horizon + editorial    (the fullest expression)

const FONT  = "'DM Sans', system-ui, sans-serif";
const MONO  = "'IBM Plex Mono', ui-monospace, monospace";
const SERIF = "'Newsreader', Georgia, serif";

const PAL = {
  dark:  { bg:"#0e1116", surf:"#171c24", surf2:"#1e242e", line:"#283039", line2:"#39424f",
           ink:"#dde3ea", mut:"#8a93a0", faint:"#5a6470", good:"#5fa777", gold:"#c8a86a", chrome:"#0a0d11" },
  paper: { bg:"#f1e9db", surf:"#fbf6ec", surf2:"#f6efe1", line:"#e3d8c4", line2:"#d3c4a9",
           ink:"#2f2920", mut:"#8a7c66", faint:"#b1a48d", gold:"#c08a4e", good:"#6f8f6a", chrome:"#e9e0cf" },
};

// ── one-time keyframes ──
if (typeof document !== "undefined" && !document.getElementById("sk-kf")) {
  const s = document.createElement("style");
  s.id = "sk-kf";
  s.textContent =
    "@keyframes skSun{0%,100%{opacity:.85}50%{opacity:1}}" +
    "@keyframes skRise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}";
  document.head.appendChild(s);
}

// ── smooth area/line path from sample points (Catmull-Rom → bezier) ──
function smooth(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const XS = [0, 150, 300, 450, 600, 750, 900, 1050, 1200];
const FRONT = [400, 388, 366, 352, 318, 280, 232, 196, 168];
const MID   = [330, 326, 316, 318, 306, 300, 288, 284, 280];
const FAR   = [276, 272, 266, 270, 262, 258, 250, 247, 244];
const zip = (ys) => XS.map((x, i) => [x, ys[i]]);

const HZ = {
  dark:  { sky:[["0%","#0e1116"],["62%","#131a22"],["100%","#1b2630"]], far:"#1b2a37", mid:"#21384a",
           fillA:"#5fa777", fillB:"#c8a86a", lineA:"#5fa777", lineB:"#c8a86a", sun:"#c8a86a", core:"#ecd49a", lbl:"#5a6470", silhouette:false },
  paper: { sky:[["0%","#f4eee3"],["60%","#f8e8d2"],["100%","#f1d9bc"]], far:"#ddd0ba", mid:"#cdbd9b",
           fillA:"#6f8f6a", fillB:"#c08a4e", lineA:"#6f8f6a", lineB:"#c08a4e", sun:"#e7b572", core:"#f6d8a2", lbl:"#9b8d77", silhouette:false },
  dusk:  { sky:[["0%","#221826"],["40%","#55323f"],["68%","#a85f3c"],["100%","#e7a85e"]], far:"#2c1f27", mid:"#3c2a2c",
           fillA:"#00000000", fillB:"#00000000", lineA:"#f6cd84", lineB:"#f6cd84", sun:"#f8cf86", core:"#fde9bd", lbl:"#ecd2b5", silhouette:true },
};

// ── the Horizon: a landscape whose rising front ridge IS the balance ──
function Horizon({ mode = "dark", h = 440, gid = "hz", phases = true, sunX = 1015, sunY = 150 }) {
  const c = HZ[mode];
  if (mode === "dusk") { sunX = 985; sunY = h - 118; }
  const front = zip(FRONT), mid = zip(MID), far = zip(FAR);
  const areaFront = smooth(front) + ` L 1200 ${h} L 0 ${h} Z`;
  const areaMid   = smooth(mid)   + ` L 1200 ${h} L 0 ${h} Z`;
  const areaFar   = smooth(far)   + ` L 1200 ${h} L 0 ${h} Z`;
  const ph = [["Today", 60], ["Building", 330], ["Retirement", 720], ["Good years", 1010]];
  return (
    <svg width="100%" height={h} viewBox={`0 0 1200 ${h}`} preserveAspectRatio="xMidYMax slice" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
          {c.sky.map(([o, col], i) => <stop key={i} offset={o} stopColor={col} />)}
        </linearGradient>
        <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c.lineA} /><stop offset="100%" stopColor={c.lineB} />
        </linearGradient>
        <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c.fillA} stopOpacity="0.20" /><stop offset="100%" stopColor={c.fillB} stopOpacity="0.34" />
        </linearGradient>
        <radialGradient id={`${gid}-sun`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={c.core} stopOpacity="0.95" />
          <stop offset="35%" stopColor={c.sun} stopOpacity="0.55" />
          <stop offset="100%" stopColor={c.sun} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height={h} fill={`url(#${gid}-sky)`} />
      {/* sun / warm light on the far horizon — the payoff */}
      <circle cx={sunX} cy={sunY} r={mode === "dusk" ? 230 : 180} fill={`url(#${gid}-sun)`} style={{ animation: "skSun 7s ease-in-out infinite" }} />
      <circle cx={sunX} cy={sunY} r={mode === "dusk" ? 58 : 30} fill={c.core} opacity={mode === "dusk" ? 0.9 : 0.5} />
      {/* distant ridges */}
      <path d={areaFar} fill={c.far} opacity={c.silhouette ? 0.92 : 0.85} />
      <path d={areaMid} fill={c.mid} opacity={c.silhouette ? 0.95 : 0.9} />
      {/* the balance ridge */}
      {!c.silhouette && <path d={areaFront} fill={`url(#${gid}-fill)`} />}
      {c.silhouette && <path d={areaFront} fill="#160f14" opacity="0.96" />}
      <path d={smooth(front)} fill="none" stroke={`url(#${gid}-line)`} strokeWidth="2.5" strokeLinecap="round" />
      {/* phase ticks */}
      {phases && ph.map(([t, x], i) => (
        <g key={i}>
          <line x1={x} x2={x} y1={h - 26} y2={h - 16} stroke={c.lbl} strokeWidth="1" opacity="0.5" />
          <text x={x} y={h - 6} fill={c.lbl} style={{ font: `500 12px ${FONT}` }}>{t}</text>
        </g>
      ))}
      {/* "for life" at the bright end */}
      <text x={1120} y={mode === "dusk" ? sunY - 34 : 110} textAnchor="end" fill={c.core} style={{ font: `600 13px ${FONT}` }}>for life →</text>
    </svg>
  );
}

// ── tiny shared chrome ──
function SketchFrame({ p, url = "horizon.app", w = 1180, h = 760, children }) {
  return (
    <div style={{ width: w, height: h, background: p.bg, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", height: 36, background: p.chrome, borderBottom: `1px solid ${p.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 7 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 6, background: p.line2 }} />)}</div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}><span style={{ font: `400 11px/1 ${MONO}`, color: p.faint }}>{url}</span></div>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
    </div>
  );
}
function Logo({ p }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 18, height: 18, borderRadius: 6, background: `${p.good}22`, border: `1px solid ${p.good}66`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: p.good }} />
      </span>
      <span style={{ font: `700 14px/1 ${FONT}`, color: p.ink, letterSpacing: "0.01em" }}>Horizon</span>
    </div>
  );
}
function OnTrack({ p }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, border: `1px solid ${p.good}55`, background: `${p.good}14` }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: p.good }} />
      <span style={{ font: `600 12px/1 ${FONT}`, color: p.good }}>On track</span>
    </span>
  );
}
function NavBar({ p, items = ["Plan", "Ideas", "The numbers", "Settings"] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 30px", borderBottom: `1px solid ${p.line}` }}>
      <Logo p={p} />
      <div style={{ display: "flex", gap: 4 }}>
        {items.map((t, i) => (
          <div key={t} style={{ padding: "6px 13px", borderRadius: 8, background: i === 0 ? p.surf2 : "transparent", border: i === 0 ? `1px solid ${p.line2}` : "1px solid transparent" }}>
            <span style={{ font: `${i === 0 ? 600 : 500} 12.5px/1 ${FONT}`, color: i === 0 ? p.ink : p.faint }}>{t}</span>
          </div>
        ))}
      </div>
      <OnTrack p={p} />
    </div>
  );
}
// ghost stat (no card) — for the horizon layouts
function Ghost({ p, label, val, accent, serif }) {
  return (
    <div>
      <div style={{ font: `${serif ? 500 : 500} 26px/1 ${serif ? SERIF : MONO}`, color: accent || p.ink, letterSpacing: "-0.01em" }}>{val}</div>
      <div style={{ font: `500 11px/1.3 ${FONT}`, color: p.mut, marginTop: 6 }}>{label}</div>
    </div>
  );
}
// chip
function SkChip({ p, children, active, dashed }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999,
      border: `1px ${dashed ? "dashed" : "solid"} ${active ? p.gold : p.line2}`, background: active ? `${p.gold}1c` : "transparent",
      font: `600 12px/1 ${FONT}`, color: active ? p.ink : p.mut, whiteSpace: "nowrap" }}>
      {!dashed && <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? p.gold : p.line2 }} />}{children}
    </span>
  );
}

// ════════════════════════════════════════ A · dark + horizon-as-hero
function SkA() {
  const p = PAL.dark;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}><Horizon mode="dark" gid="a" h={470} /></div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "22px 34px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Logo p={p} />
            <div style={{ font: `600 34px/1.1 ${FONT}`, color: p.ink, letterSpacing: "-0.025em", marginTop: 22, whiteSpace: "nowrap" }}>On track to retire at 65.</div>
            <div style={{ font: `500 16px/1.3 ${FONT}`, color: p.mut, marginTop: 10 }}>Work optional, <span style={{ color: "#5fa777", fontWeight: 700 }}>golf course</span> mandatory.</div>
          </div>
          <OnTrack p={p} />
        </div>
        {/* satellite stats float over the sky, upper-right */}
        <div style={{ position: "absolute", top: 150, right: 40, display: "flex", gap: 40 }}>
          <Ghost p={p} label="income for life" val="$8,200/mo" accent={p.gold} />
          <Ghost p={p} label="nest egg by 65" val="$3.1M" accent={p.ink} />
        </div>
      </div>
    </SketchFrame>
  );
}

// ════════════════════════════════════════ B · paper + dashboard (warm skin)
function PaperCard({ p, children, warm }) {
  return <div style={{ flex: 1, background: warm ? "#f7ecd8" : p.surf, border: `1px solid ${warm ? "#e6cda0" : p.line}`, borderRadius: 14, padding: 18, boxShadow: "0 1px 2px rgba(80,60,30,.05)" }}>{children}</div>;
}
function SkB() {
  const p = PAL.paper;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <NavBar p={p} />
        <div style={{ flex: 1, padding: "26px 34px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
            <div>
              <div style={{ font: `600 33px/1.12 ${SERIF}`, color: p.ink, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>On track for retirement by 65.</div>
              <div style={{ font: `500 16px/1.3 ${FONT}`, color: p.mut, marginTop: 10 }}>Work optional, <span style={{ color: p.good, fontWeight: 700 }}>golf course</span> mandatory.</div>
            </div>
            <div style={{ width: 280, flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ font: `600 12.5px/1 ${FONT}`, color: p.ink }}>78% of the way</span>
                <span style={{ font: `600 12px/1 ${FONT}`, color: p.good }}>↗ gaining</span>
              </div>
              <div style={{ height: 9, borderRadius: 6, background: p.line, overflow: "hidden" }}><div style={{ height: "100%", width: "78%", background: `linear-gradient(90deg,${p.good},${p.gold})` }} /></div>
            </div>
          </div>
          {/* warm phase strip */}
          <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            {[["Today", "$165k", false], ["Building", "+$24.8k/yr", false], ["Retirement", "$3.1M", true], ["Good years", "$8,200/mo", true]].map(([t, v, warm], i) => (
              <div key={i} style={{ flex: i === 1 ? 2 : 1, background: warm ? `${p.gold}14` : p.surf, border: `1px solid ${warm ? `${p.gold}44` : p.line}`, borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ font: `500 11px/1 ${FONT}`, color: warm ? p.gold : p.faint, marginBottom: 7 }}>{t}</div>
                <div style={{ font: `500 17px/1 ${SERIF}`, color: warm ? p.gold : p.ink }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ font: `600 11px/1 ${FONT}`, color: p.faint, letterSpacing: "0.14em", margin: "28px 0 13px" }}>AT A GLANCE</div>
          <div style={{ display: "flex", gap: 12 }}>
            {[["You keep / mo", "$2,140", p.good], ["Retire at", "65", p.ink], ["Income for life", "$8,200", p.gold], ["Left at 90", "$1.4M", p.ink]].map(([l, v, a], i) => (
              <PaperCard key={i} p={p} warm={i === 2}>
                <div style={{ font: `500 11px/1 ${FONT}`, color: p.mut, marginBottom: 9 }}>{l}</div>
                <div style={{ font: `500 24px/1 ${SERIF}`, color: a }}>{v}</div>
              </PaperCard>
            ))}
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 22, alignItems: "center" }}>
            <span style={{ font: `600 11px/1 ${FONT}`, color: p.faint, letterSpacing: "0.04em", marginRight: 4 }}>PLAY WITH IT</span>
            <SkChip p={p} active>Today's plan</SkChip><SkChip p={p}>Retire at 60</SkChip><SkChip p={p}>Save $300 more</SkChip><SkChip p={p} dashed>+ Adjust the details →</SkChip>
          </div>
        </div>
      </div>
    </SketchFrame>
  );
}

// ════════════════════════════════════════ C · dark + editorial
function SkC() {
  const p = PAL.dark;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Logo p={p} /><OnTrack p={p} /></div>
        <div style={{ flex: 1, position: "relative", padding: "10px 40px 0" }}>
          {/* giant ghost number, bottom-right */}
          <div style={{ position: "absolute", right: 24, bottom: -30, font: `600 280px/1 ${FONT}`, color: p.surf2, letterSpacing: "-0.04em", userSelect: "none" }}>65</div>
          <div style={{ position: "relative", maxWidth: 760 }}>
            <div style={{ font: `600 12px/1 ${MONO}`, color: p.gold, letterSpacing: "0.18em" }}>YOUR PLAN, IN ONE LINE</div>
            <div style={{ font: `600 76px/1.02 ${FONT}`, color: p.ink, letterSpacing: "-0.035em", marginTop: 22 }}>You can stop<br />working at<br /><span style={{ color: p.good }}>sixty-five.</span></div>
            <div style={{ font: `400 17px/1.5 ${FONT}`, color: p.mut, marginTop: 24, maxWidth: 440 }}>And stay covered for life — past ninety, with room to spare. Everything else is here when you want it.</div>
          </div>
          {/* masthead sidebar */}
          <div style={{ position: "absolute", top: 14, right: 40, width: 210, display: "flex", flexDirection: "column", gap: 18, textAlign: "right" }}>
            {[["INCOME FOR LIFE", "$8,200/mo", p.gold], ["NEST EGG", "$3.1M", p.ink], ["YOU KEEP", "41%", p.good]].map(([l, v, a], i) => (
              <div key={i} style={{ borderTop: `1px solid ${p.line}`, paddingTop: 12 }}>
                <div style={{ font: `600 10px/1 ${MONO}`, color: p.faint, letterSpacing: "0.12em" }}>{l}</div>
                <div style={{ font: `500 26px/1 ${MONO}`, color: a, marginTop: 8 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {/* thin timeline footer rule */}
        <div style={{ padding: "0 40px 26px" }}>
          <div style={{ position: "relative", height: 2, background: p.line }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: 2, width: "30%", background: p.good }} />
            {[["Today", "2%"], ["Building", "30%"], ["Retirement", "66%"], ["for life", "96%"]].map(([t, x], i) => (
              <div key={i} style={{ position: "absolute", left: x, top: 10, transform: "translateX(-50%)", font: `500 11px/1 ${FONT}`, color: i >= 2 ? p.gold : p.faint, whiteSpace: "nowrap" }}>{t}</div>
            ))}
          </div>
        </div>
      </div>
    </SketchFrame>
  );
}

// ════════════════════════════════════════ D · dusk + ambient glass
function SkD() {
  const p = PAL.dark;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", inset: 0 }}><Horizon mode="dusk" gid="d" h={760} phases={false} /></div>
        {/* top chrome over the scene */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "22px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo p={{ ...p, ink: "#fff" }} />
          <span style={{ font: `500 12px/1 ${MONO}`, color: "rgba(255,255,255,.7)" }}>6:42 pm · late summer</span>
        </div>
        {/* frosted glass data card */}
        <div style={{ position: "absolute", left: 40, bottom: 40, width: 520, padding: "28px 30px", borderRadius: 20, background: "rgba(18,14,16,.42)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.08)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: p.good }} /><span style={{ font: `600 12px/1 ${FONT}`, color: "#fff" }}>On track</span>
          </span>
          <div style={{ font: `600 34px/1.12 ${FONT}`, color: "#fff", letterSpacing: "-0.02em", marginTop: 18 }}>Your someday is<br />already paid for.</div>
          <div style={{ font: `500 15px/1.4 ${FONT}`, color: "rgba(255,255,255,.8)", marginTop: 12 }}>Work optional, <span style={{ color: "#ffd9a0", fontWeight: 700 }}>open road</span> calling.</div>
          <div style={{ display: "flex", gap: 30, marginTop: 24 }}>
            <Ghost p={{ ...p, ink: "#fff", mut: "rgba(255,255,255,.7)" }} label="a month, for life" val="$8,200" accent="#ffd9a0" />
            <Ghost p={{ ...p, ink: "#fff", mut: "rgba(255,255,255,.7)" }} label="retire at" val="65" accent="#fff" />
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 24 }}>
            <span style={{ padding: "8px 14px", borderRadius: 999, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.2)", font: `600 12px/1 ${FONT}`, color: "#fff" }}>Play with it</span>
            <span style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", font: `600 12px/1 ${FONT}`, color: "rgba(255,255,255,.85)" }}>The numbers →</span>
          </div>
        </div>
      </div>
    </SketchFrame>
  );
}

// ════════════════════════════════════════ E · dark + conversational
function SkE() {
  const p = PAL.dark;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Logo p={p} /><OnTrack p={p} /></div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
          {/* future-self orb */}
          <div style={{ width: 64, height: 64, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, ${p.gold}, #7a5a2e)`, boxShadow: `0 0 0 8px ${p.gold}14, 0 0 40px ${p.gold}33`, marginBottom: 26 }} />
          <div style={{ font: `600 38px/1.22 ${FONT}`, color: p.ink, letterSpacing: "-0.02em", maxWidth: 720, textWrap: "balance" }}>You're on track to retire at 65 — and stay <span style={{ color: p.good }}>covered for life.</span></div>
          <div style={{ font: `400 17px/1.5 ${FONT}`, color: p.mut, marginTop: 18, maxWidth: 520 }}>People your age often wonder if sixty is possible. Want to see what that would take?</div>
          {/* chip "replies" */}
          <div style={{ display: "flex", gap: 11, marginTop: 30, flexWrap: "wrap", justifyContent: "center" }}>
            <SkChip p={p} active>Show me retiring at 60</SkChip>
            <SkChip p={p}>What if I save $300 more?</SkChip>
            <SkChip p={p}>A big trip at 70</SkChip>
            <SkChip p={p} dashed>Adjust the details →</SkChip>
          </div>
        </div>
        {/* a single quiet answer line */}
        <div style={{ borderTop: `1px solid ${p.line}`, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ font: `400 13px/1 ${FONT}`, color: p.faint }}>Today that's</span>
          <span style={{ font: `500 16px/1 ${MONO}`, color: p.gold }}>$8,200/mo</span>
          <span style={{ font: `400 13px/1 ${FONT}`, color: p.faint }}>— ask me anything about it.</span>
        </div>
      </div>
    </SketchFrame>
  );
}

// ════════════════════════════════════════ A+B · paper + horizon-as-hero
function SkAB() {
  const p = PAL.paper;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}><Horizon mode="paper" gid="ab" h={480} /></div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "22px 34px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Logo p={p} />
            <div style={{ font: `600 36px/1.08 ${SERIF}`, color: p.ink, letterSpacing: "-0.01em", marginTop: 22, whiteSpace: "nowrap" }}>On track to retire at 65.</div>
            <div style={{ font: `500 16px/1.3 ${FONT}`, color: p.mut, marginTop: 10 }}>Work optional, <span style={{ color: p.good, fontWeight: 700 }}>golf course</span> mandatory.</div>
          </div>
          <OnTrack p={p} />
        </div>
        <div style={{ position: "absolute", top: 150, right: 40, display: "flex", gap: 40 }}>
          <Ghost p={p} serif label="income for life" val="$8,200/mo" accent={p.gold} />
          <Ghost p={p} serif label="nest egg by 65" val="$3.1M" accent={p.ink} />
        </div>
      </div>
    </SketchFrame>
  );
}

// ════════════════════════════════════════ A+B+C · paper + horizon + editorial
function SkABC() {
  const p = PAL.paper;
  return (
    <SketchFrame p={p}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Logo p={p} /><OnTrack p={p} /></div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* horizon band bleeding off the right/bottom */}
          <div style={{ position: "absolute", right: -40, bottom: 0, width: 760, height: 360, opacity: 0.96 }}><Horizon mode="paper" gid="abc" h={360} phases={false} /></div>
          <div style={{ position: "relative", padding: "16px 40px", maxWidth: 720 }}>
            <div style={{ font: `600 12px/1 ${MONO}`, color: p.gold, letterSpacing: "0.18em" }}>YOUR PLAN, IN ONE LINE</div>
            <div style={{ font: `600 72px/1.0 ${SERIF}`, color: p.ink, letterSpacing: "-0.015em", marginTop: 20 }}>You can stop<br />working at<br /><span style={{ color: p.good, fontStyle: "italic" }}>sixty-five.</span></div>
            <div style={{ font: `400 17px/1.5 ${FONT}`, color: p.mut, marginTop: 22, maxWidth: 400 }}>And stay covered for life — past ninety, with room to spare.</div>
          </div>
          {/* pull-quote number + masthead, lower-left */}
          <div style={{ position: "absolute", left: 40, bottom: 30, display: "flex", alignItems: "flex-end", gap: 34 }}>
            <div>
              <div style={{ font: `500 64px/0.9 ${SERIF}`, color: p.gold }}>$8,200</div>
              <div style={{ font: `500 12px/1 ${FONT}`, color: p.mut, marginTop: 8 }}>a month, for life</div>
            </div>
            <div style={{ borderLeft: `1px solid ${p.line2}`, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              {[["nest egg", "$3.1M"], ["you keep", "41%"]].map(([l, v], i) => (
                <div key={i}><div style={{ font: `600 10px/1 ${MONO}`, color: p.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{l}</div><div style={{ font: `500 22px/1 ${SERIF}`, color: p.ink, marginTop: 5 }}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SketchFrame>
  );
}

Object.assign(window, { SkA, SkB, SkC, SkD, SkE, SkAB, SkABC, Horizon });
