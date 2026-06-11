// frames-pastel.jsx — pastel / adaptive exploration, fleshing out A+B.
// Answers four notes: (1) Light/Dark/Auto theming, (2) soft "comfort" pastel
// palettes (Apple/Claude-ish) tuned for a late-20s/30s audience, (3) a calmer
// editorial, (4) the Horizon turned into a real, INTERACTIVE hero you can scrub.
// Copy & numbers are placeholder. Self-contained — no deps on other frames.

const PFONT = "'DM Sans', system-ui, sans-serif";
const PMONO = "'IBM Plex Mono', ui-monospace, monospace";

// ── palette tokens · 6 families × light/dark ───────────────────────────────
// Each: chrome/surfaces/ink + accent (brand), warm (the "good years" payoff),
// good (on-track green), and a horizon backdrop recipe (sky stops, ridges, sun).
// NOTE: the ridge fill + line are now derived from accent/good/warm at render
// time (see VIZ), so the graph visibly recolors with the theme.
const PALS = {
  apricot: {
    name: "Apricot", swatch: "#cd6f4f",
    light: { bg:"#f7efe6", surf:"#fffbf5", surf2:"#f7ede1", line:"#efe3d4", line2:"#e4d3be",
      ink:"#3a3027", mut:"#8c7d6c", faint:"#b6a690", accent:"#cd6f4f", warm:"#df9a52", good:"#7a9b74",
      hz:{ sky:[["0%","#fbf4ea"],["58%","#fbe6d1"],["100%","#f7d3b2"]], far:"#ecd6bd", mid:"#e7c49a", sun:"#f2b56e", core:"#fde3bb", lbl:"#a8957c" } },
    dark: { bg:"#231c18", surf:"#2e2620", surf2:"#372d26", line:"#43382f", line2:"#574a3f",
      ink:"#f1e7dc", mut:"#b4a698", faint:"#83786b", accent:"#e8896b", warm:"#ecab68", good:"#93b58c",
      hz:{ sky:[["0%","#231c18"],["52%","#3a2a22"],["100%","#5b3b2b"]], far:"#3a2c22", mid:"#4a3528", sun:"#f0bd7a", core:"#fce3bd", lbl:"#8a7a68" } },
  },
  honey: {
    name: "Honey", swatch: "#d9a32b",
    light: { bg:"#f8f2df", surf:"#fffdf4", surf2:"#f7efd9", line:"#efe6cb", line2:"#e6d6ad",
      ink:"#39331f", mut:"#897f60", faint:"#b8ac85", accent:"#cf9a22", warm:"#e6b84e", good:"#8aa15f",
      hz:{ sky:[["0%","#fdf8e8"],["56%","#fdeec2"],["100%","#fbe09a"]], far:"#ecdcae", mid:"#e8cd84", sun:"#f4c75c", core:"#fdedb6", lbl:"#aa9c70" } },
    dark: { bg:"#211d10", surf:"#2c2715", surf2:"#34301b", line:"#403a22", line2:"#544c2e",
      ink:"#f3ecd6", mut:"#b6ab8a", faint:"#857c5e", accent:"#e8be4e", warm:"#ecc764", good:"#a8bd72",
      hz:{ sky:[["0%","#211d10"],["52%","#39321a"],["100%","#5c4f22"]], far:"#393318", mid:"#4a4120", sun:"#f0cb5e", core:"#fcecb2", lbl:"#897f5e" } },
  },
  blush: {
    name: "Blush", swatch: "#cf6f88",
    light: { bg:"#f9edee", surf:"#fffaf9", surf2:"#f8e6e8", line:"#f0dadc", line2:"#e7c4c9",
      ink:"#3a2c2e", mut:"#8c7479", faint:"#bb9ea2", accent:"#cf6f88", warm:"#e6a081", good:"#6fae93",
      hz:{ sky:[["0%","#fdf1f2"],["55%","#f9e2e6"],["100%","#f6d2da"]], far:"#ecd6da", mid:"#e7c2cb", sun:"#ef9fb6", core:"#fbdbe4", lbl:"#b39aa0" } },
    dark: { bg:"#241a1c", surf:"#2f2326", surf2:"#37292d", line:"#433036", line2:"#573e46",
      ink:"#f3e3e6", mut:"#b8a0a6", faint:"#86727a", accent:"#e88aa0", warm:"#e8a585", good:"#73bb9d",
      hz:{ sky:[["0%","#241a1c"],["52%","#3a2530"],["100%","#56304a"]], far:"#3a2730", mid:"#4a2f3d", sun:"#ec9ab6", core:"#f9d9e6", lbl:"#897680" } },
  },
  sage: {
    name: "Sage", swatch: "#5f8a64",
    light: { bg:"#edf1ea", surf:"#fafdf7", surf2:"#eef3e9", line:"#e2e8dd", line2:"#cdd8c6",
      ink:"#2d332b", mut:"#7a856f", faint:"#a8b29d", accent:"#5f8a64", warm:"#e3a06a", good:"#6f9b6a",
      hz:{ sky:[["0%","#eef4e8"],["55%","#e7efdf"],["100%","#f4e6cf"]], far:"#dde6d2", mid:"#cdd8bf", sun:"#efc07a", core:"#fbe7bd", lbl:"#94a088" } },
    dark: { bg:"#181e19", surf:"#222a23", surf2:"#2a332b", line:"#354036", line2:"#475448",
      ink:"#e8efe5", mut:"#a3b09d", faint:"#74806f", accent:"#84ad7c", warm:"#e3a672", good:"#84ad7c",
      hz:{ sky:[["0%","#181e19"],["50%","#283226"],["100%","#45402a"]], far:"#273127", mid:"#313d30", sun:"#eebd78", core:"#fbe5bc", lbl:"#74806f" } },
  },
  periwinkle: {
    name: "Periwinkle", swatch: "#6f7bd6",
    light: { bg:"#ecedf7", surf:"#fafbff", surf2:"#f0f1fb", line:"#e0e2f1", line2:"#ccd0e8",
      ink:"#2f3142", mut:"#7a7f96", faint:"#a6abc2", accent:"#6f7bd6", warm:"#e69bb0", good:"#5fb89a",
      hz:{ sky:[["0%","#eef0fb"],["54%","#e7e3f6"],["100%","#f4dce1"]], far:"#dcdcef", mid:"#cfcbe6", sun:"#e6a9d2", core:"#fbdcef", lbl:"#9499b4" } },
    dark: { bg:"#1b1d2a", surf:"#252839", surf2:"#2e3145", line:"#383c54", line2:"#4a4f6d",
      ink:"#e7e9f5", mut:"#a6abc4", faint:"#767b96", accent:"#8f9bee", warm:"#e6a9c8", good:"#6fc6a6",
      hz:{ sky:[["0%","#1b1d2a"],["50%","#2b2740"],["100%","#46304a"]], far:"#2a2c44", mid:"#34304d", sun:"#e0a6e0", core:"#f7dcf2", lbl:"#787da0" } },
  },
  slate: {
    name: "Slate", swatch: "#5a738f",
    light: { bg:"#eef1f4", surf:"#fbfcfe", surf2:"#eef2f6", line:"#e1e6ec", line2:"#cdd5de",
      ink:"#2b3138", mut:"#76808b", faint:"#a4adb8", accent:"#5a738f", warm:"#d99a72", good:"#6f9b8a",
      hz:{ sky:[["0%","#f0f3f6"],["55%","#e7edf2"],["100%","#dde7ee"]], far:"#d8dfe6", mid:"#c8d3dc", sun:"#e8b98a", core:"#f6e6d2", lbl:"#97a2ad" } },
    dark: { bg:"#161a1f", surf:"#1f242b", surf2:"#262d35", line:"#323a44", line2:"#445063",
      ink:"#e6ebf1", mut:"#a0abb8", faint:"#737e8b", accent:"#7d97b6", warm:"#e0a87e", good:"#7fb0a4",
      hz:{ sky:[["0%","#161a1f"],["52%","#242c36"],["100%","#2e3a44"]], far:"#262e38", mid:"#313b46", sun:"#e6b182", core:"#f7e2cd", lbl:"#737e8b" } },
  },
};

// ── graph treatments — make the hero lively & comparable ───────────────────
// Each derives ridge fill + line from the theme tokens, so it recolors per
// palette. Value gridlines + axes now render in EVERY style (readability is a
// baseline, not an option) — the styles differ only in fill/line richness.
const VIZ = {
  soft:  { name:"Soft",  fO:[0.16,0.30], lw:2.5, glow:false, three:false },
  vivid: { name:"Vivid", fO:[0.34,0.56], lw:3,   glow:false, three:true  },
  glow:  { name:"Glow",  fO:[0.30,0.52], lw:3.4, glow:true,  three:true  },
};

// ── timeline + value model ─────────────────────────────────────────────────
// The x-axis is YOUR life from today onward: age 30 (now) → 90. Two MOMENTS
// (today, retirement) and two ERAS (building → the good years). The y-axis is a
// real value axis, so the ridge is a readable plot of projected balance, not
// just decoration — gridlines + $ labels let you read numbers straight off it.
const AGE0 = 30, AGE1 = 90, RET_AGE = 65;
const VMAX = 3.45e6;                                    // top of the value axis
const xRet = ((RET_AGE - AGE0) / (AGE1 - AGE0)) * 1200; // ≈ 700
const xForAge = (a) => ((a - AGE0) / (AGE1 - AGE0)) * 1200;
const balAtAge = (a) => 165000 + (3100000 - 165000) * Math.pow((a - AGE0) / (AGE1 - AGE0), 1.55);
function readAt(x) {
  const f = Math.max(0, Math.min(1, x / 1200));
  const age = Math.round(AGE0 + f * (AGE1 - AGE0));
  return { f, age, bal: balAtAge(age), phase: age < RET_AGE ? "Building" : "The good years" };
}
const money = (n) => n >= 1e6 ? `$${(n/1e6).toFixed(n >= 1e6 && n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n/1e3)}k`;
function smoothPath(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i-1]||pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2]||p2;
    const c1x = p1[0]+(p2[0]-p0[0])/6, c1y = p1[1]+(p2[1]-p0[1])/6;
    const c2x = p2[0]-(p3[0]-p1[0])/6, c2y = p2[1]-(p3[1]-p1[1])/6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

// ── endpoint motifs — what sits at the bright end of the road ──────────────
// Brainstormed alternatives to the literal sun. Rendered crisp in the HTML
// overlay (own viewBox, not stretched) with a soft warm glow behind so the
// "good years" still feel warm. Pick via the `endcap` prop.
const ENDCAPS = { cabin:"A place of your own", flag:"Your destination", beacon:"Covered for life", umbrella:"The good life", dawn:"Covered for life" };
function EndcapMark({ t, kind, px = 56 }) {
  const c = t.hz, A = t.accent, W = t.warm, I = t.ink;
  if (kind === "dawn") return null; // dawn is pure glow, handled by the halo
  const box = { width: px, height: px, display:"block" };
  if (kind === "beacon") return (
    <svg viewBox="-24 -24 48 48" style={box}>
      <path d="M0,-21 L5,-5 L21,0 L5,5 L0,21 L-5,5 L-21,0 L-5,-5 Z" fill={c.core} stroke={W} strokeWidth="1.4" strokeLinejoin="round"/>
      <circle r="3.4" fill={W}/>
    </svg>
  );
  if (kind === "flag") return (
    <svg viewBox="0 0 48 52" style={box}>
      <line x1="9" y1="50" x2="9" y2="5" stroke={I} strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="9" cy="5" r="2.4" fill={I}/>
      <path d="M9,7 L38,13.5 L9,22 Z" fill={A}/>
    </svg>
  );
  if (kind === "umbrella") return (
    <svg viewBox="0 0 56 54" style={box}>
      <line x1="28" y1="52" x2="28" y2="17" stroke={I} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M5,18 Q28,-6 51,18 Z" fill={A}/>
      <path d="M5,18 Q16.5,11 28,18 Q39.5,11 51,18" fill="none" stroke={c.core} strokeWidth="1.4" opacity="0.7"/>
      <circle cx="28" cy="16" r="2" fill={c.core}/>
    </svg>
  );
  // cabin — a little place on the far hill
  return (
    <svg viewBox="0 0 54 50" style={box}>
      <rect x="13" y="24" width="28" height="22" rx="1.5" fill={t.surf} stroke={t.line2} strokeWidth="1.4"/>
      <path d="M8,25 L27,8 L46,25 Z" fill={A} stroke={A} strokeWidth="1" strokeLinejoin="round"/>
      <rect x="24" y="33" width="6.5" height="13" rx="1" fill={W}/>
      <circle cx="34" cy="20" r="2.6" fill={c.core} opacity="0.9"/>
    </svg>
  );
}

// ── the interactive Horizon hero ───────────────────────────────────────────
function InteractiveHorizon({ t, H = 320, gid = "ih", start = xRet, scrub = true, readout = true, viz = "glow", endcap = "cabin" }) {
  const c = t.hz;
  const v = VIZ[viz] || VIZ.glow;
  const svgRef = React.useRef(null);
  const [mx, setMx] = React.useState(start);
  const labels = H >= 170;                              // hide axes/labels on slim strips
  const TOP = labels ? 0.16 * H : 6;
  const BOT = labels ? 0.17 * H : 6;
  const plotH = H - TOP - BOT;
  const yOf = (bal) => TOP + (1 - bal / VMAX) * plotH;
  const pct = (px, total) => `${(px / total) * 100}%`;
  // build the value-true ridge
  const AGES = []; for (let a = AGE0; a <= AGE1; a += 2) AGES.push(a);
  const pts = AGES.map((a) => [xForAge(a), +yOf(balAtAge(a)).toFixed(1)]);
  const linePath = smoothPath(pts);
  const areaPath = linePath + ` L 1200 ${H-BOT} L 0 ${H-BOT} Z`;
  const cx = Math.max(8, Math.min(1192, mx));
  const info = readAt(cx);
  const my = yOf(info.bal);
  const yRet = yOf(balAtAge(RET_AGE));
  const endX = xForAge(84), endY = yOf(balAtAge(84));
  const gridVals = [1e6, 2e6, 3e6];
  const ageTicks = [30, 40, 50, 60, 65, 70, 80, 90];
  const fillStops = v.three
    ? [["0%", t.good, v.fO[0]], ["54%", t.accent, (v.fO[0]+v.fO[1])/2 + 0.06], ["100%", t.warm, v.fO[1]]]
    : [["0%", t.good, v.fO[0]], ["100%", t.warm, v.fO[1]]];
  const lineStops = v.three ? [t.good, t.accent, t.warm] : [t.good, t.warm];
  function onMove(e) {
    if (!scrub || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    setMx(Math.max(8, Math.min(1192, (e.clientX - r.left) / r.width * 1200)));
  }
  // themed pill helpers (HTML overlay — crisp + guaranteed contrast)
  const eraPill = (text, warm) => ({ font:`700 11px ${PFONT}`, letterSpacing:"0.07em", color: warm ? t.ink : t.mut,
    background: warm ? `${t.warm}26` : t.surf, border:`1px solid ${warm ? `${t.warm}66` : t.line2}`, borderRadius:999, padding:"3px 11px", whiteSpace:"nowrap", boxShadow:"0 1px 3px rgba(0,0,0,.08)" });
  return (
    <div style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", border: `1px solid ${t.line}` }}>
      <svg ref={svgRef} width="100%" viewBox={`0 0 1200 ${H}`} preserveAspectRatio="none"
           onPointerMove={onMove} style={{ display: "block", cursor: scrub ? "ew-resize" : "default", height: H }}>
        <defs>
          <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">{c.sky.map(([o,col],i)=><stop key={i} offset={o} stopColor={col}/>)}</linearGradient>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="1" y2="0">{fillStops.map(([o,col,op],i)=><stop key={i} offset={o} stopColor={col} stopOpacity={op}/>)}</linearGradient>
          <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0">{lineStops.map((col,i)=><stop key={i} offset={`${(i/(lineStops.length-1))*100}%`} stopColor={col}/>)}</linearGradient>
          <radialGradient id={`${gid}-glow`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={c.core} stopOpacity={endcap==="dawn"?"0.85":"0.6"}/><stop offset="42%" stopColor={c.sun} stopOpacity="0.4"/><stop offset="100%" stopColor={c.sun} stopOpacity="0"/></radialGradient>
          {v.glow && <filter id={`${gid}-lglow`} x="-10%" y="-60%" width="120%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="6.5" floodColor={t.accent} floodOpacity="0.5"/></filter>}
        </defs>
        <rect width="1200" height={H} fill={`url(#${gid}-sky)`} />
        {/* good-years warm wash */}
        <rect x={xRet} y="0" width={1200-xRet} height={H} fill={c.sun} opacity="0.07" />
        {/* warm light at the bright end (replaces the hard sun disk) */}
        <ellipse cx={endX} cy={endY-6} rx={210} ry={170} fill={`url(#${gid}-glow)`} />
        {/* value gridlines — read the numbers right off the chart */}
        {labels && gridVals.map((gv,i)=>(
          <line key={i} x1="0" x2="1200" y1={yOf(gv)} y2={yOf(gv)} stroke={t.ink} strokeWidth="1" opacity="0.07" strokeDasharray="2 6" />
        ))}
        {/* the balance ridge */}
        <path d={areaPath} fill={`url(#${gid}-fill)`} />
        <path d={linePath} fill="none" stroke={`url(#${gid}-line)`} strokeWidth={v.lw} strokeLinecap="round" strokeLinejoin="round" filter={v.glow?`url(#${gid}-lglow)`:undefined} />
        {/* retirement — a moment: a divider where the eras meet */}
        <line x1={xRet} x2={xRet} y1={TOP-4} y2={H-BOT} stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.6" />
        <circle cx={xRet} cy={yRet} r="5" fill={t.accent} stroke={t.surf} strokeWidth="2" />
        {/* today — a moment at the start of the road */}
        <circle cx={xForAge(30)} cy={yOf(balAtAge(30))} r="4.5" fill={t.good} stroke={t.surf} strokeWidth="2" />
        {/* scrub marker */}
        {readout && <React.Fragment>
          <line x1={cx} x2={cx} y1={my} y2={H-BOT} stroke={t.ink} strokeWidth="1.5" opacity="0.26" />
          <circle cx={cx} cy={my} r="6" fill={t.surf} stroke={t.accent} strokeWidth="2.5" />
        </React.Fragment>}
      </svg>

      {/* ── HTML overlay: crisp, contrast-safe labels & axes ── */}
      {labels && <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        {/* value axis ($) */}
        {gridVals.map((gv,i)=>(
          <div key={i} style={{ position:"absolute", left:10, top:pct(yOf(gv),H), transform:"translateY(-50%)", font:`600 10px ${PMONO}`, color:t.faint, background:`${t.surf}cc`, padding:"1px 5px", borderRadius:5 }}>{money(gv)}</div>
        ))}
        {/* era pills (top) */}
        <div style={{ position:"absolute", left:pct(xForAge(47.5),1200), top:11, transform:"translateX(-50%)", ...eraPill("",false) }}>BUILDING</div>
        <div style={{ position:"absolute", left:pct(xForAge(77.5),1200), top:11, transform:"translateX(-50%)", ...eraPill("",true) }}>THE GOOD YEARS</div>
        {/* age axis (bottom) */}
        {ageTicks.map((a)=>{
          const moment = a===30 || a===65;
          return <div key={a} style={{ position:"absolute", left:pct(xForAge(a),1200), bottom:7, transform:"translateX(-50%)", textAlign:"center", whiteSpace:"nowrap" }}>
            {moment
              ? <span style={{ font:`700 10.5px ${PFONT}`, color:a===30?t.good:t.accent, background:a===30?`${t.good}1e`:`${t.accent}1e`, border:`1px solid ${a===30?`${t.good}55`:`${t.accent}55`}`, borderRadius:999, padding:"2px 9px" }}>{a===30?"Today":"Retire"} · {a}</span>
              : <span style={{ font:`600 10px ${PMONO}`, color:t.faint }}>{a}</span>}
          </div>;
        })}
        {/* endpoint motif + label */}
        <div style={{ position:"absolute", left:pct(endX,1200), top:pct(endY,H), transform:"translate(-50%,-104%)", display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
          <EndcapMark t={t} kind={endcap} px={Math.max(34, Math.round(0.19*H))} />
          <span style={{ font:`600 10px ${PFONT}`, color:t.ink, background:`${t.surf}d9`, border:`1px solid ${t.line2}`, borderRadius:999, padding:"2px 9px", whiteSpace:"nowrap" }}>{ENDCAPS[endcap]}</span>
        </div>
      </div>}

      {/* floating readout tied to the marker */}
      {readout && <div style={{ position:"absolute", top:pct(Math.max(TOP+8, my-58),H), left:`${(cx/1200)*100}%`, transform:"translateX(-50%)", pointerEvents:"none",
        background:t.surf, border:`1px solid ${t.line2}`, borderRadius:11, padding:"7px 12px", boxShadow:"0 6px 20px rgba(0,0,0,.16)", whiteSpace:"nowrap", minWidth:104 }}>
        <div style={{ font:`600 10px ${PFONT}`, color:t.faint, letterSpacing:"0.02em" }}>{info.phase} · age {info.age}</div>
        <div style={{ font:`600 18px ${PMONO}`, color:t.accent, marginTop:2 }}>{money(info.bal)}</div>
      </div>}
      {scrub && <div style={{ position:"absolute", top:9, left:"50%", transform:"translateX(-50%)", font:`600 10.5px ${PFONT}`, color:t.faint, pointerEvents:"none", display:"flex", alignItems:"center", gap:6, background:`${t.surf}cc`, padding:"2px 10px", borderRadius:999 }}>
        <span style={{ fontSize:13 }}>↔</span> drag across your life
      </div>}
    </div>
  );
}

// ── shared themed primitives ───────────────────────────────────────────────
function PLogo({ t }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ width:18, height:18, borderRadius:6, background:`${t.good}26`, border:`1px solid ${t.good}66`, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ width:7, height:7, borderRadius:999, background:t.good }} />
      </span>
      <span style={{ font:`700 14px ${PFONT}`, color:t.ink, letterSpacing:"0.01em" }}>Horizon</span>
    </div>
  );
}
function POnTrack({ t }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px", borderRadius:999, border:`1px solid ${t.good}55`, background:`${t.good}1c` }}>
      <span style={{ width:8, height:8, borderRadius:999, background:t.good }} />
      <span style={{ font:`600 12px ${PFONT}`, color:t.good }}>On track</span>
    </span>
  );
}
function PNav({ t, active = "Plan" }) {
  const items = ["Plan", "Ideas", "The numbers", "Settings"];
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"15px 28px", borderBottom:`1px solid ${t.line}` }}>
      <PLogo t={t} />
      <div style={{ display:"flex", gap:4 }}>
        {items.map((x)=>{
          const on = x===active;
          return <div key={x} style={{ padding:"6px 13px", borderRadius:8, background:on?t.surf2:"transparent", border:on?`1px solid ${t.line2}`:"1px solid transparent" }}>
            <span style={{ font:`${on?600:500} 12.5px ${PFONT}`, color:on?t.ink:t.faint }}>{x}</span>
          </div>;
        })}
      </div>
      <POnTrack t={t} />
    </div>
  );
}
function PStat({ t, label, val, accent, warm }) {
  return (
    <div style={{ flex:1, background: warm?`${t.warm}14`:t.surf, border:`1px solid ${warm?`${t.warm}44`:t.line}`, borderRadius:13, padding:15 }}>
      <div style={{ font:`500 11px ${PFONT}`, color:warm?t.warm:t.mut, marginBottom:9 }}>{label}</div>
      <div style={{ font:`500 23px ${PMONO}`, color:accent, letterSpacing:"-0.01em" }}>{val}</div>
    </div>
  );
}
function PChip({ t, children, active, dashed }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:999,
      border:`1px ${dashed?"dashed":"solid"} ${active?t.accent:t.line2}`, background:active?`${t.accent}1c`:"transparent",
      font:`600 12px ${PFONT}`, color:active?t.ink:t.mut, whiteSpace:"nowrap" }}>
      {!dashed && <span style={{ width:6, height:6, borderRadius:999, background:active?t.accent:t.line2 }} />}{children}
    </span>
  );
}

// ── the pastel home (reused by every static palette artboard) ──────────────
function PastelHome({ t, w = 1180, h = 720, gid = "ph", chrome = true, viz = "glow", endcap = "cabin" }) {
  return (
    <div style={{ width:w, height:h, background:t.bg, fontFamily:PFONT, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {chrome && <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 14px", height:34, background:t.surf2, borderBottom:`1px solid ${t.line}`, flexShrink:0 }}>
        <div style={{ display:"flex", gap:7 }}>{[0,1,2].map(i=><span key={i} style={{ width:10, height:10, borderRadius:6, background:t.line2 }} />)}</div>
        <div style={{ flex:1, textAlign:"center", font:`400 11px ${PMONO}`, color:t.faint }}>horizon.app</div><div style={{ width:40 }} />
      </div>}
      <PNav t={t} />
      <div style={{ flex:1, padding:"22px 28px", display:"flex", flexDirection:"column", minHeight:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ font:`600 30px ${PFONT}`, color:t.ink, letterSpacing:"-0.025em" }}>On track to retire at 65.</div>
            <div style={{ font:`500 15px ${PFONT}`, color:t.mut, marginTop:8 }}>Work optional, <span style={{ color:t.accent, fontWeight:700 }}>golf course</span> mandatory.</div>
          </div>
          <div style={{ width:240, paddingTop:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
              <span style={{ font:`600 12px ${PFONT}`, color:t.ink }}>78% there</span><span style={{ font:`600 11.5px ${PFONT}`, color:t.good }}>↗ gaining</span>
            </div>
            <div style={{ height:8, borderRadius:6, background:t.line, overflow:"hidden" }}><div style={{ height:"100%", width:"78%", background:`linear-gradient(90deg,${t.good},${t.warm})` }} /></div>
          </div>
        </div>
        <InteractiveHorizon t={t} H={300} gid={gid} viz={viz} endcap={endcap} />
        <div style={{ display:"flex", gap:11, marginTop:18 }}>
          <PStat t={t} label="You keep / mo" val="$2,140" accent={t.good} />
          <PStat t={t} label="Retire at" val="65" accent={t.ink} />
          <PStat t={t} label="Income for life" val="$8,200" accent={t.warm} warm />
          <PStat t={t} label="Left at 90" val="$1.4M" accent={t.ink} />
        </div>
        <div style={{ display:"flex", gap:9, marginTop:16, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ font:`600 10.5px ${PFONT}`, color:t.faint, letterSpacing:"0.06em", marginRight:2 }}>PLAY WITH IT</span>
          <PChip t={t} active>Today's plan</PChip><PChip t={t}>Retire at 60</PChip><PChip t={t}>Save $300 more</PChip><PChip t={t} dashed>+ Adjust the details →</PChip>
        </div>
      </div>
    </div>
  );
}

// ── the interactive playground (palette + graph style + Light/Dark/Auto) ───
function ThemedHome() {
  const autoMode = (new Date().getHours() >= 7 && new Date().getHours() < 18) ? "light" : "dark";
  const [palKey, setPalKey] = React.useState("apricot");
  const [viz, setViz] = React.useState("glow");
  const [endcap, setEndcap] = React.useState("cabin");
  const [pref, setPref] = React.useState("light");        // light | dark | auto
  const mode = pref === "auto" ? autoMode : pref;
  const t = PALS[palKey][mode];
  const seg = (group, val, label, sub, set) => {
    const on = group === val;
    return (
      <button key={val} onClick={() => set(val)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, padding:"6px 13px", borderRadius:8, border:"none",
        background:on?t.surf:"transparent", boxShadow:on?"0 1px 3px rgba(0,0,0,.16)":"none", cursor:"pointer" }}>
        <span style={{ font:`600 12px ${PFONT}`, color:on?t.ink:t.faint }}>{label}</span>
        {sub && <span style={{ font:`600 9px ${PFONT}`, color:t.faint }}>{sub}</span>}
      </button>
    );
  };
  const segWrap = (label, kids) => (
    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
      <span style={{ font:`600 10px ${PFONT}`, color:t.faint, letterSpacing:"0.08em" }}>{label}</span>
      <div style={{ display:"flex", gap:2, padding:3, borderRadius:10, background:t.bg, border:`1px solid ${t.line}` }}>{kids}</div>
    </div>
  );
  return (
    <div style={{ width:1240, height:880, background:t.bg, fontFamily:PFONT, display:"flex", flexDirection:"column", overflow:"hidden", transition:"background .35s ease" }}>
      {/* playground control bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 22px", background:t.surf2, borderBottom:`1px solid ${t.line}`, gap:14, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <span style={{ font:`600 10px ${PFONT}`, color:t.faint, letterSpacing:"0.08em" }}>ACCENT</span>
          <div style={{ display:"flex", gap:7 }}>
            {Object.keys(PALS).map((k)=>{
              const on = palKey===k;
              return <button key={k} onClick={()=>setPalKey(k)} title={PALS[k].name} style={{ width:26, height:26, borderRadius:999, padding:0, cursor:"pointer",
                background:PALS[k].swatch, border:`2px solid ${on?t.ink:"transparent"}`, boxShadow:`0 0 0 2px ${t.surf2}${on?`, 0 0 0 3px ${t.ink}22`:""}`, position:"relative" }}>
                {on && <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", font:`700 13px ${PFONT}`, textShadow:"0 1px 2px rgba(0,0,0,.4)" }}>✓</span>}
              </button>;
            })}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          {segWrap("GRAPH", Object.keys(VIZ).map((k)=>seg(viz,k,VIZ[k].name,null,setViz)))}
          {segWrap("MARKER", Object.keys(ENDCAPS).map((k)=>seg(endcap,k,k[0].toUpperCase()+k.slice(1),null,setEndcap)))}
          {segWrap("THEME", [seg(pref,"light","Light",null,setPref), seg(pref,"dark","Dark",null,setPref), seg(pref,"auto","Auto",autoMode==="light"?"☀ day":"☾ eve",setPref)])}
        </div>
      </div>
      {/* home */}
      <div style={{ flex:1, minHeight:0 }}><PastelHome t={t} w={1240} h={820} gid="themed" chrome={false} viz={viz} endcap={endcap} /></div>
    </div>
  );
}

// ── Settings · Appearance — where the theme actually lives in-product ───────
function MiniRidge({ t, viz, w = 132, h = 56 }) {
  const v = VIZ[viz];
  const N = 9, pts = [];
  for (let i=0;i<N;i++){ const a = AGE0 + (AGE1-AGE0)*i/(N-1); pts.push([ (i/(N-1))*w, +(6 + (1-balAtAge(a)/VMAX)*(h-12)).toFixed(1) ]); }
  const d = smoothPath(pts);
  const area = d + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:"block", borderRadius:8 }}>
      <defs>
        <linearGradient id={`mr-${viz}-f`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={t.good} stopOpacity={v.fO[0]+0.05}/><stop offset="54%" stopColor={t.accent} stopOpacity={(v.fO[0]+v.fO[1])/2+0.08}/><stop offset="100%" stopColor={t.warm} stopOpacity={v.fO[1]}/></linearGradient>
        <linearGradient id={`mr-${viz}-l`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={t.good}/><stop offset="54%" stopColor={t.accent}/><stop offset="100%" stopColor={t.warm}/></linearGradient>
        {v.glow && <filter id={`mr-${viz}-g`}><feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={t.accent} floodOpacity="0.6"/></filter>}
      </defs>
      <rect width={w} height={h} fill={t.surf} />
      <path d={area} fill={`url(#mr-${viz}-f)`} />
      <path d={d} fill="none" stroke={`url(#mr-${viz}-l)`} strokeWidth={v.lw-0.5} strokeLinecap="round" filter={v.glow?`url(#mr-${viz}-g)`:undefined} />
    </svg>
  );
}
function SettingsScreen() {
  const autoMode = (new Date().getHours() >= 7 && new Date().getHours() < 18) ? "light" : "dark";
  const [palKey, setPalKey] = React.useState("apricot");
  const [viz, setViz] = React.useState("glow");
  const [endcap, setEndcap] = React.useState("cabin");
  const [pref, setPref] = React.useState("light");
  const mode = pref === "auto" ? autoMode : pref;
  const t = PALS[palKey][mode];
  const Row = ({ label, hint, children }) => (
    <div style={{ padding:"15px 0", borderBottom:`1px solid ${t.line}` }}>
      <div style={{ font:`600 14px ${PFONT}`, color:t.ink }}>{label}</div>
      {hint && <div style={{ font:`400 12.5px ${PFONT}`, color:t.mut, marginTop:3, marginBottom:13, maxWidth:380 }}>{hint}</div>}
      {children}
    </div>
  );
  return (
    <div style={{ width:1240, height:948, background:t.bg, fontFamily:PFONT, display:"flex", flexDirection:"column", overflow:"hidden", transition:"background .3s ease" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 14px", height:34, background:t.surf2, borderBottom:`1px solid ${t.line}`, flexShrink:0 }}>
        <div style={{ display:"flex", gap:7 }}>{[0,1,2].map(i=><span key={i} style={{ width:10, height:10, borderRadius:6, background:t.line2 }} />)}</div>
        <div style={{ flex:1, textAlign:"center", font:`400 11px ${PMONO}`, color:t.faint }}>horizon.app/settings</div><div style={{ width:40 }} />
      </div>
      <PNav t={t} active="Settings" />
      <div style={{ flex:1, display:"flex", minHeight:0 }}>
        {/* controls */}
        <div style={{ flex:1, padding:"26px 40px", overflow:"hidden" }}>
          <div style={{ font:`600 24px ${PFONT}`, color:t.ink, letterSpacing:"-0.02em" }}>Appearance</div>
          <div style={{ font:`400 13.5px ${PFONT}`, color:t.mut, marginTop:5 }}>Make Horizon feel like yours. Changes apply instantly.</div>

          <Row label="Accent color" hint="Sets the brand color across the app — and tints your horizon.">
            <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
              {Object.keys(PALS).map((k)=>{
                const on = palKey===k;
                return <button key={k} onClick={()=>setPalKey(k)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:0, border:"none", background:"transparent", cursor:"pointer" }}>
                  <span style={{ width:46, height:46, borderRadius:999, background:PALS[k].swatch, border:`3px solid ${on?t.ink:t.line2}`, boxShadow:`0 0 0 3px ${t.bg}, 0 2px 6px rgba(0,0,0,.12)`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", font:`700 17px ${PFONT}`, textShadow:"0 1px 2px rgba(0,0,0,.4)" }}>{on?"✓":""}</span>
                  <span style={{ font:`${on?700:500} 12px ${PFONT}`, color:on?t.ink:t.mut }}>{PALS[k].name}</span>
                </button>;
              })}
            </div>
          </Row>

          <Row label="Theme" hint="Light, dark, or let it follow the time of day.">
            <div style={{ display:"flex", gap:12 }}>
              {[["light","Light","☀"],["dark","Dark","☾"],["auto","Auto","◑"]].map(([val,label,ic])=>{
                const on = pref===val;
                const preview = val==="auto" ? autoMode : val;
                const pc = PALS[palKey][preview];
                return <button key={val} onClick={()=>setPref(val)} style={{ width:152, padding:0, borderRadius:13, overflow:"hidden", cursor:"pointer",
                  border:`2px solid ${on?t.accent:t.line2}`, background:t.surf, textAlign:"left" }}>
                  <div style={{ height:58, background:pc.bg, borderBottom:`1px solid ${pc.line}`, padding:10, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                    <div style={{ width:40, height:6, borderRadius:3, background:pc.line2 }} />
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      <span style={{ width:14, height:14, borderRadius:999, background:pc.accent }} />
                      <span style={{ width:54, height:6, borderRadius:3, background:pc.line2 }} />
                    </div>
                  </div>
                  <div style={{ padding:"9px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ font:`600 13px ${PFONT}`, color:on?t.ink:t.mut }}>{label}</span>
                    <span style={{ font:`400 13px ${PFONT}`, color:on?t.accent:t.faint }}>{ic}{val==="auto"?<span style={{ fontSize:9, marginLeft:4, color:t.faint }}>{autoMode==="light"?"day":"eve"}</span>:""}</span>
                  </div>
                </button>;
              })}
            </div>
          </Row>

          <Row label="Horizon style" hint="How lively the main graph looks. Soft is calm; Glow makes the climb shine. All styles stay fully readable.">
            <div style={{ display:"flex", gap:12 }}>
              {Object.keys(VIZ).map((k)=>{
                const on = viz===k;
                return <button key={k} onClick={()=>setViz(k)} style={{ padding:6, borderRadius:12, cursor:"pointer", background:t.surf,
                  border:`2px solid ${on?t.accent:t.line2}` }}>
                  <MiniRidge t={t} viz={k} />
                  <div style={{ font:`${on?700:500} 12px ${PFONT}`, color:on?t.ink:t.mut, marginTop:7, textAlign:"center" }}>{VIZ[k].name}</div>
                </button>;
              })}
            </div>
          </Row>

          <Row label="Horizon marker" hint="What sits at the bright end of your road — the payoff you’re climbing toward.">
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {Object.keys(ENDCAPS).map((k)=>{
                const on = endcap===k;
                return <button key={k} onClick={()=>setEndcap(k)} title={ENDCAPS[k]} style={{ width:78, padding:"10px 6px 8px", borderRadius:12, cursor:"pointer", background:t.surf,
                  border:`2px solid ${on?t.accent:t.line2}`, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                  <div style={{ height:38, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
                    {k==="dawn"
                      ? <span style={{ width:34, height:34, borderRadius:999, background:`radial-gradient(circle, ${t.hz.core}, ${t.hz.sun}00 70%)` }} />
                      : <EndcapMark t={t} kind={k} px={k==="beacon"?34:38} />}
                  </div>
                  <span style={{ font:`${on?700:500} 11px ${PFONT}`, color:on?t.ink:t.mut }}>{k[0].toUpperCase()+k.slice(1)}</span>
                </button>;
              })}
            </div>
          </Row>
        </div>
        {/* live preview */}
        <div style={{ width:520, flexShrink:0, background:t.surf2, borderLeft:`1px solid ${t.line}`, padding:"26px 28px", display:"flex", flexDirection:"column" }}>
          <div style={{ font:`600 10.5px ${PFONT}`, color:t.faint, letterSpacing:"0.1em", marginBottom:14 }}>LIVE PREVIEW</div>
          <div style={{ borderRadius:16, overflow:"hidden", border:`1px solid ${t.line}`, background:t.bg, boxShadow:"0 12px 34px rgba(0,0,0,.14)" }}>
            <div style={{ padding:"14px 16px 8px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <PLogo t={t} /><POnTrack t={t} />
              </div>
              <div style={{ font:`600 19px ${PFONT}`, color:t.ink, letterSpacing:"-0.02em", marginTop:13 }}>On track to retire at 65.</div>
              <div style={{ font:`500 12.5px ${PFONT}`, color:t.mut, marginTop:5 }}>Work optional, <span style={{ color:t.accent, fontWeight:700 }}>golf course</span> mandatory.</div>
            </div>
            <div style={{ padding:"6px 16px 16px" }}>
              <InteractiveHorizon t={t} H={188} gid="setprev" viz={viz} endcap={endcap} scrub={false} readout={false} />
              <div style={{ display:"flex", gap:9, marginTop:13 }}>
                <PStat t={t} label="You keep / mo" val="$2,140" accent={t.good} />
                <PStat t={t} label="For life" val="$8,200" accent={t.warm} warm />
              </div>
            </div>
          </div>
          <div style={{ flex:1 }} />
          <div style={{ font:`400 11.5px ${PFONT}`, color:t.faint, textAlign:"center" }}>Preview updates as you choose · {PALS[palKey].name} · {pref==="auto"?`Auto (${autoMode})`:pref[0].toUpperCase()+pref.slice(1)} · {VIZ[viz].name} · {endcap}</div>
        </div>
      </div>
    </div>
  );
}

// ── editorial, refined: smaller, calmer, more negative space ───────────────
function EditorialV2({ palKey = "apricot", mode = "light" }) {
  const t = PALS[palKey][mode];
  return (
    <div style={{ width:1180, height:720, background:t.bg, fontFamily:PFONT, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 14px", height:34, background:t.surf2, borderBottom:`1px solid ${t.line}` }}>
        <div style={{ display:"flex", gap:7 }}>{[0,1,2].map(i=><span key={i} style={{ width:10, height:10, borderRadius:6, background:t.line2 }} />)}</div>
        <div style={{ flex:1, textAlign:"center", font:`400 11px ${PMONO}`, color:t.faint }}>horizon.app</div><div style={{ width:40 }} />
      </div>
      <div style={{ padding:"18px 56px", display:"flex", justifyContent:"space-between", alignItems:"center" }}><PLogo t={t} /><POnTrack t={t} /></div>
      {/* generous centered column — lots of breathing room */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 56px", maxWidth:680, margin:"0 auto", width:"100%" }}>
        <div style={{ font:`600 11px ${PMONO}`, color:t.accent, letterSpacing:"0.16em" }}>YOUR PLAN, IN ONE LINE</div>
        <div style={{ font:`600 46px ${PFONT}`, color:t.ink, letterSpacing:"-0.03em", lineHeight:1.08, marginTop:18 }}>You can stop working at <span style={{ color:t.accent }}>sixty-five</span> — and stay covered for life.</div>
        <div style={{ font:`400 16px ${PFONT}`, color:t.mut, marginTop:18, maxWidth:520, lineHeight:1.5 }}>Past ninety, with room to spare. Everything else is here whenever you want a closer look.</div>
        {/* tidy number row, secondary */}
        <div style={{ display:"flex", gap:40, marginTop:40, paddingTop:26, borderTop:`1px solid ${t.line}` }}>
          {[["Income for life","$8,200/mo",t.warm],["Nest egg","$3.1M",t.ink],["You keep","41%",t.good]].map(([l,v,a],i)=>(
            <div key={i}>
              <div style={{ font:`600 10.5px ${PMONO}`, color:t.faint, letterSpacing:"0.1em" }}>{l.toUpperCase()}</div>
              <div style={{ font:`500 28px ${PMONO}`, color:a, marginTop:8 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {/* slim horizon strip as a quiet footer, not a backdrop */}
      <div style={{ padding:"0 56px 26px" }}><InteractiveHorizon t={t} H={84} gid="edv2" scrub={false} readout={false} viz="soft" start={xRet} /></div>
    </div>
  );
}

// ── a focused card showing just the hero graph (for the motif comparison) ──
function HorizonCard({ palKey = "apricot", mode = "light", endcap = "cabin", viz = "glow", note }) {
  const t = PALS[palKey][mode];
  return (
    <div style={{ width:760, height:420, background:t.bg, fontFamily:PFONT, padding:24, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ font:`700 15px ${PFONT}`, color:t.ink }}>{ENDCAPS[endcap]}</span>
        <span style={{ font:`500 12px ${PFONT}`, color:t.mut }}>{note}</span>
      </div>
      <div style={{ flex:1, minHeight:0 }}><InteractiveHorizon t={t} H={332} gid={`hc-${endcap}`} viz={viz} endcap={endcap} scrub={false} readout={false} /></div>
    </div>
  );
}

Object.assign(window, { PALS, VIZ, ENDCAPS, balAtAge, InteractiveHorizon, EndcapMark, HorizonCard, PastelHome, ThemedHome, SettingsScreen, MiniRidge, EditorialV2 });
