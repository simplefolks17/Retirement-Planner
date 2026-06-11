// wire-kit.jsx — low-fi wireframe primitives.
// Sketchy-but-readable: paper background, ink strokes, dashed placeholders,
// one muted accent + a "redline" annotation color. Inputs use the stepper
// style (− value +) the user picked. All inline styles; names prefixed W*.

const WK = {
  paper:  "#f6f3ec",
  card:   "#fffdf8",
  ink:    "#3a352d",
  mut:    "#8c8475",
  faint:  "#aaa295",
  line:   "#d9d2c4",
  line2:  "#c5bcab",
  fill:   "#ece7dc",   // placeholder gray
  fill2:  "#e2dcce",
  accent: "#c2693f",   // muted terracotta — nods to pastel direction
  good:   "#6f9266",
  warm:   "#cf9a52",
  note:   "#5b7fb0",   // redline annotation blue
};
const WSKETCH = "'Caveat', cursive";
const WUI     = "'Architects Daughter', cursive";
const WMONO   = "'IBM Plex Mono', ui-monospace, monospace";

// inject sketch styles once
if (typeof document !== "undefined" && !document.getElementById("wk-style")) {
  const s = document.createElement("style");
  s.id = "wk-style";
  s.textContent = `
    @keyframes wkFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
    .wk-rough{ box-shadow: 1.5px 1.5px 0 rgba(58,53,45,0.06); }
  `;
  document.head.appendChild(s);
}

// ── screen frame (app window, low-fi) ───────────────────────────────────────
function WScreen({ title, w = 1280, h = 860, children, pad = true }) {
  return (
    <div style={{ width: w, height: h, background: WK.paper, fontFamily: WUI,
      display: "flex", flexDirection: "column", overflow: "hidden",
      border: `2px solid ${WK.ink}`, borderRadius: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
        borderBottom: `2px solid ${WK.ink}`, background: WK.card, flexShrink: 0 }}>
        <span style={{ display: "flex", gap: 6 }}>
          {[WK.line2, WK.line2, WK.line2].map((c, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: 999, border: `1.5px solid ${WK.line2}` }} />
          ))}
        </span>
        <span style={{ marginLeft: 8, font: `700 19px ${WSKETCH}`, color: WK.ink }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ font: `400 15px ${WUI}`, color: WK.faint }}>wireframe</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: pad ? "22px 26px" : 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// top app nav (low-fi) with active tab
function WNav({ active = "Plan" }) {
  const tabs = ["Plan", "Ideas", "The numbers", "Settings"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18, flexShrink: 0 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${WK.ink}`, display: "inline-block" }} />
        <span style={{ font: `700 20px ${WSKETCH}`, color: WK.ink }}>Horizon</span>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ display: "flex", gap: 16 }}>
        {tabs.map((t) => {
          const on = t === active;
          return <span key={t} style={{ font: `${on ? 700 : 400} 16px ${WUI}`, color: on ? WK.ink : WK.faint,
            borderBottom: on ? `2.5px solid ${WK.accent}` : "2.5px solid transparent", paddingBottom: 2 }}>{t}</span>;
        })}
      </span>
    </div>
  );
}

// ── annotation (redline note with a little arrow) ───────────────────────────
function WAnno({ children, dir = "left", style = {} }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 5, font: `400 16px ${WUI}`,
      color: WK.note, lineHeight: 1.25, ...style }}>
      <span style={{ fontFamily: WSKETCH, fontSize: 19, lineHeight: 1, transform: "translateY(-1px)" }}>
        {dir === "left" ? "↖" : dir === "right" ? "↗" : dir === "down" ? "↓" : "←"}
      </span>
      <span style={{ textWrap: "pretty" }}>{children}</span>
    </span>
  );
}

// section eyebrow + title
function WHead({ eyebrow, title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {eyebrow && <div style={{ font: `700 14px ${WUI}`, color: WK.accent, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{eyebrow}</div>}
      <div style={{ font: `700 30px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>{title}</div>
      {sub && <div style={{ font: `400 15px ${WUI}`, color: WK.mut, marginTop: 5, textWrap: "pretty" }}>{sub}</div>}
    </div>
  );
}

// ── building blocks ─────────────────────────────────────────────────────────
function WCard({ children, style = {}, dashed = false, active = false, pad = 16 }) {
  return (
    <div className="wk-rough" style={{ background: WK.card, border: dashed ? `2px dashed ${WK.line2}` : `2px solid ${active ? WK.accent : WK.ink}`,
      borderRadius: 12, padding: pad, ...style }}>{children}</div>
  );
}

// gray placeholder text lines
function WLines({ n = 2, w = ["100%", "70%"], h = 9, gap = 7 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ height: h, borderRadius: 999, background: WK.fill, width: Array.isArray(w) ? (w[i] || w[w.length - 1]) : w }} />
      ))}
    </div>
  );
}

// image / illustration placeholder (diagonal cross)
function WPlaceholder({ w = "100%", h = 120, label, style = {} }) {
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 10, background: WK.fill,
      border: `2px dashed ${WK.line2}`, overflow: "hidden", ...style }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.5 }} preserveAspectRatio="none">
        <line x1="0" y1="0" x2="100%" y2="100%" stroke={WK.line2} strokeWidth="1.5" />
        <line x1="100%" y1="0" x2="0" y2="100%" stroke={WK.line2} strokeWidth="1.5" />
      </svg>
      {label && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        font: `400 15px ${WUI}`, color: WK.mut }}>{label}</span>}
    </div>
  );
}

// ── the chosen input control: stepper  − value +  ───────────────────────────
function WStepper({ label, value, hint, accent = WK.ink, w }) {
  const btn = (sym) => (
    <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 7, border: `2px solid ${WK.line2}`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      font: `700 18px ${WUI}`, color: WK.accent, background: WK.card }}>{sym}</span>
  );
  return (
    <div style={{ width: w }}>
      {label && <div style={{ font: `400 14px ${WUI}`, color: WK.mut, marginBottom: 6 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {btn("−")}
        <div style={{ flex: 1, height: 38, borderRadius: 8, border: `2px solid ${WK.ink}`, background: WK.card,
          display: "flex", alignItems: "center", justifyContent: "center", font: `700 18px ${WMONO}`, color: accent }}>{value}</div>
        {btn("+")}
      </div>
      {hint && <div style={{ font: `400 13px ${WUI}`, color: WK.faint, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

// pill / chip
function WChip({ children, active = false, dashed = false, accent = WK.accent, dot = true }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999,
      border: dashed ? `2px dashed ${WK.line2}` : `2px solid ${active ? accent : WK.line2}`,
      background: active ? `${accent}1e` : "transparent", font: `${active ? 700 : 400} 14px ${WUI}`,
      color: active ? WK.ink : WK.mut, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? accent : WK.line2 }} />}
      {children}
    </span>
  );
}

// primary / ghost button
function WBtn({ children, primary = false, w }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: w,
      padding: "11px 20px", borderRadius: 10, font: `700 16px ${WUI}`,
      border: `2px solid ${WK.ink}`, background: primary ? WK.accent : WK.card,
      color: primary ? "#fff" : WK.ink, whiteSpace: "nowrap" }}>{children}</span>
  );
}

// toggle (on/off) — for the "with/without" demos
function WToggle({ on = true, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 38, height: 22, borderRadius: 999, border: `2px solid ${WK.ink}`,
        background: on ? WK.good : WK.fill, position: "relative", display: "inline-block" }}>
        <span style={{ position: "absolute", top: 1, left: on ? 17 : 1, width: 18, height: 18, borderRadius: 999, background: "#fff", border: `1.5px solid ${WK.ink}` }} />
      </span>
      {label && <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>{label}</span>}
    </span>
  );
}

// ── sketch charts ───────────────────────────────────────────────────────────
// the Arc graph, gestured at in low-fi (real one exists in hi-fi)
function WArcSketch({ w = "100%", h = 200, stops = true, label = "Arc graph" }) {
  const W = 600, H = 200;
  // arc path: rise to peak ~ x420 then sustain/decline
  const d = "M 40 165 C 140 150 200 95 300 70 C 360 56 400 52 440 58 C 500 66 540 80 560 92";
  const pts = [[40,165,"good"],[180,118,"accent"],[300,70,"accent"],[440,58,"accent"],[560,92,"warm"]];
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* baseline + gridlines */}
        {[60, 105, 150].map((y) => <line key={y} x1="40" x2="560" y1={y} y2={y} stroke={WK.line2} strokeWidth="1" strokeDasharray="2 7" opacity="0.7" />)}
        <line x1="40" x2="40" y1="20" y2="178" stroke={WK.line2} strokeWidth="1.5" />
        <line x1="40" x2="560" y1="178" y2="178" stroke={WK.line2} strokeWidth="1.5" />
        {/* area + line */}
        <path d={`${d} L 560 178 L 40 178 Z`} fill={WK.fill} opacity="0.7" />
        <path d={d} fill="none" stroke={WK.ink} strokeWidth="2.5" strokeLinecap="round" />
        {/* retire marker */}
        <line x1="440" x2="440" y1="30" y2="178" stroke={WK.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.6" />
        {stops && pts.map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={WK.card} stroke={WK[c]} strokeWidth="2.5" />
        ))}
      </svg>
      {stops && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {[["Today","13%","82%"],["$1M","30%","59%"],["Retire","73%","20%"],["For life","93%","46%"]].map(([t,l,tp],i) => (
            <span key={i} style={{ position: "absolute", left: l, top: tp, transform: "translate(-50%,-130%)",
              font: `400 12px ${WUI}`, color: WK.mut, background: WK.card, border: `1.5px solid ${WK.line2}`, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" }}>{t}</span>
          ))}
        </div>
      )}
      <span style={{ position: "absolute", right: 8, bottom: 6, font: `400 13px ${WUI}`, color: WK.faint }}>{label}</span>
    </div>
  );
}

// two-line comparison sketch (base vs scenario)
function WCompareSketch({ w = "100%", h = 150 }) {
  const W = 420, H = 150;
  const base = "M 30 120 C 100 108 150 80 220 64 C 280 50 330 46 390 50";
  const scen = "M 30 120 C 100 100 150 64 210 44 C 270 26 320 22 390 24";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1="30" x2="390" y1="130" y2="130" stroke={WK.line2} strokeWidth="1.5" />
      <path d={`${base} L 390 130 L 30 130 Z`} fill={WK.fill} opacity="0.6" />
      <path d={base} fill="none" stroke={WK.mut} strokeWidth="2" strokeDasharray="5 4" />
      <path d={scen} fill="none" stroke={WK.accent} strokeWidth="2.5" />
    </svg>
  );
}

// horizontal split bar (e.g. take-home vs taxes vs savings)
function WSplitBar({ segs }) {
  return (
    <div style={{ display: "flex", height: 30, borderRadius: 8, overflow: "hidden", border: `2px solid ${WK.ink}` }}>
      {segs.map((s, i) => (
        <div key={i} style={{ flex: s.f, background: s.c, borderRight: i < segs.length - 1 ? `2px solid ${WK.ink}` : "none",
          display: "flex", alignItems: "center", justifyContent: "center", font: `700 12px ${WUI}`, color: WK.ink, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>{s.l}</div>
      ))}
    </div>
  );
}

// ƒ thread-pull affordance — the "pull to see the math" tab
function WThread({ open = false, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: `400 14px ${WUI}`, color: WK.note,
      borderBottom: `1.5px dotted ${WK.note}`, paddingBottom: 1, whiteSpace: "nowrap" }}>
      <span style={{ fontStyle: "italic", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15 }}>ƒ</span>
      {children}
      <span style={{ fontFamily: WSKETCH, fontSize: 17, lineHeight: 1 }}>{open ? "↑ hide" : "↓ pull"}</span>
    </span>
  );
}

Object.assign(window, {
  WK, WSKETCH, WUI, WMONO,
  WScreen, WNav, WAnno, WHead, WCard, WLines, WPlaceholder,
  WStepper, WChip, WBtn, WToggle, WArcSketch, WCompareSketch, WSplitBar, WThread,
});
