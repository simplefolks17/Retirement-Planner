// frames-shared.jsx — wireframe primitives + device shells for the redesign canvas.
// Dark, structural ("greyscale-ish") language honoring the terminal theme.
// Real words for key labels; skeleton bars for secondary data noise.
// Exactly ONE functional state accent (on-track / attention), used sparingly.

const W = {
  ink:   "#0e1116",  // app background
  panel: "#171c24",  // surface
  panel2:"#1e242e",  // raised surface
  line:  "#283039",  // border
  line2: "#39424f",  // stronger border / focus
  skel:  "#222932",  // skeleton bar
  skelL: "#2c3540",  // lighter skeleton
  text:  "#cdd5df",  // primary text
  mut:   "#7d8794",  // muted
  faint: "#525c69",  // faint
  good:  "#5fa777",  // on-track (desaturated green)
  warn:  "#c7a24a",  // attention (desaturated amber)
  cool:  "#5e7c99",  // informational wireframe accent
  noteBg:"#221d14",  // annotation pill bg
  noteFg:"#c8a86a",  // warm annotation ink
};

const FONT = "'DM Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// ── skeleton bar (stands in for body text / data noise) ──
function Bar({ w = "100%", h = 8, c = W.skel, r = 4, mb = 0, style = {} }) {
  return <div style={{ width: w, height: h, background: c, borderRadius: r, marginBottom: mb, ...style }} />;
}
function Lines({ n = 3, w = ["100%", "92%", "70%"], h = 7, gap = 7, c = W.skel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: n }).map((_, i) => <Bar key={i} w={w[i] ?? "80%"} h={h} c={c} />)}
    </div>
  );
}

// ── label kit ──
function Eyebrow({ children, c = W.faint }) {
  return <div style={{ font: `700 10px/1 ${FONT}`, letterSpacing: "0.14em", textTransform: "uppercase", color: c }}>{children}</div>;
}
function Label({ children, s = 12, c = W.mut, w = 500, mb = 0, ls = 0 }) {
  return <div style={{ font: `${w} ${s}px/1.35 ${FONT}`, color: c, marginBottom: mb, letterSpacing: ls }}>{children}</div>;
}
function Num({ children, s = 22, c = W.text, w = 500 }) {
  return <span style={{ font: `${w} ${s}px/1 ${MONO}`, color: c, letterSpacing: "-0.01em" }}>{children}</span>;
}

// ── containers ──
function Panel({ children, p = 18, style = {}, raised = false, ...rest }) {
  return (
    <div {...rest} style={{ background: raised ? W.panel2 : W.panel, border: `1px solid ${W.line}`, borderRadius: 12, padding: p, ...style }}>
      {children}
    </div>
  );
}

// ── controls (wireframe) ──
function Slider({ label, val = "", pct = 50, accent = W.faint, mut = false }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <Label s={11.5} c={mut ? W.faint : W.mut}>{label}</Label>
        {val !== "" && <span style={{ font: `500 12px/1 ${MONO}`, color: accent === W.faint ? W.text : accent }}>{val}</span>}
      </div>
      <div style={{ position: "relative", height: 4, background: W.line, borderRadius: 3 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: 4, width: `${pct}%`, background: accent === W.faint ? W.line2 : accent, borderRadius: 3, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: `calc(${pct}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: 6, background: W.panel2, border: `2px solid ${accent === W.faint ? W.line2 : accent}` }} />
      </div>
    </div>
  );
}
function Field({ label, val, hint, accent = W.text }) {
  return (
    <div>
      <Label s={11.5} c={W.mut} mb={6}>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: W.ink, border: `1px solid ${W.line}`, borderRadius: 8, padding: "9px 12px" }}>
        <span style={{ font: `500 14px/1 ${MONO}`, color: accent }}>{val}</span>
        {hint && <span style={{ font: `400 10px/1 ${FONT}`, color: W.faint }}>{hint}</span>}
      </div>
    </div>
  );
}
function Chip({ children, active = false, accent = W.line2 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999,
      border: `1px solid ${active ? accent : W.line}`, background: active ? `${accent}1f` : "transparent",
      font: `500 11.5px/1 ${FONT}`, color: active ? W.text : W.mut, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}
function Btn({ children, kind = "ghost", accent = W.good, s = 13, full = false }) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 18px", borderRadius: 9, font: `600 ${s}px/1 ${FONT}`, whiteSpace: "nowrap", width: full ? "100%" : "auto" };
  if (kind === "solid") return <div style={{ ...base, background: accent, color: "#0e1116" }}>{children}</div>;
  if (kind === "outline") return <div style={{ ...base, border: `1px solid ${W.line2}`, color: W.text }}>{children}</div>;
  return <div style={{ ...base, color: W.mut }}>{children}</div>;
}
function Toggle({ on = true, accent = W.good }) {
  return (
    <div style={{ width: 34, height: 20, borderRadius: 999, background: on ? accent : W.line, position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: "#0e1116" }} />
    </div>
  );
}

// ── status dot + tiny verdict pill ──
function Dot({ c = W.good, s = 8 }) { return <span style={{ width: s, height: s, borderRadius: s, background: c, display: "inline-block", flexShrink: 0 }} />; }

// ── account color key (kept monochrome-ish but distinct lightness) ──
const ACCT = { k401: W.warn, roth: W.cool, hsa: "#8f7faa", tax: W.mut };

// ── simple area chart placeholder (single path = acceptable wireframe stand-in) ──
function AreaChart({ w = 520, h = 150, data = [8, 14, 20, 30, 44, 60, 78, 92, 84, 70, 52, 30], stroke = W.line2, fill = true, ref65, label }) {
  const max = Math.max(...data), min = 0;
  const pts = data.map((d, i) => [ (i / (data.length - 1)) * w, h - ((d - min) / (max - min)) * (h - 10) - 4 ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const rx = ref65 != null ? ref65 * w : null;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke={W.line} strokeWidth="1" />)}
      {fill && <path d={area} fill={stroke} opacity="0.10" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      {rx != null && <line x1={rx} x2={rx} y1="0" y2={h} stroke={W.good} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />}
      {rx != null && label && <text x={rx + 6} y="14" fill={W.good} style={{ font: `500 10px ${MONO}` }}>{label}</text>}
    </svg>
  );
}

// stacked mini bars (account composition)
function StackBars({ w = 520, h = 120, groups = 10 }) {
  const segs = [ACCT.k401, ACCT.roth, ACCT.hsa, ACCT.tax];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {Array.from({ length: groups }).map((_, i) => {
        const bw = (w / groups) * 0.6, x = (i / groups) * w + (w / groups) * 0.2;
        const grow = 0.3 + (i / groups) * 0.7;
        let y = h;
        return segs.map((c, j) => {
          const sh = (h * grow) / segs.length * (1 - j * 0.12);
          y -= sh;
          return <rect key={j} x={x} y={y} width={bw} height={sh - 1.5} fill={c} opacity="0.55" rx="1" />;
        });
      })}
    </svg>
  );
}

// ── the hero verdict block (the "Am I on track?" answer) ──
function Verdict({ status = "good", headline, sub, big = false }) {
  const c = status === "good" ? W.good : W.warn;
  const word = status === "good" ? "On track" : "Needs attention";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: big ? 16 : 12 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 9, alignSelf: "flex-start", padding: "6px 12px", borderRadius: 999, border: `1px solid ${c}55`, background: `${c}14` }}>
        <Dot c={c} />
        <span style={{ font: `600 ${big ? 13 : 12}px/1 ${FONT}`, color: c, letterSpacing: "0.02em" }}>{word}</span>
      </div>
      <div style={{ font: `600 ${big ? 38 : 27}px/1.12 ${FONT}`, color: W.text, letterSpacing: "-0.02em", textWrap: "balance", maxWidth: big ? 720 : 520 }}>{headline}</div>
      {sub && <div style={{ font: `400 ${big ? 16 : 13.5}px/1.5 ${FONT}`, color: W.mut, maxWidth: 560 }}>{sub}</div>}
    </div>
  );
}

// ── device shells ──
function Browser({ children, w = 1280, h = 840, url = "myplan.app", radius = 14 }) {
  return (
    <div style={{ width: w, height: h, background: W.ink, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", height: 38, background: "#0a0d11", borderBottom: `1px solid ${W.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 6, background: W.line2 }} />)}
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: W.ink, border: `1px solid ${W.line}`, borderRadius: 7, padding: "5px 16px", minWidth: 260, justifyContent: "center" }}>
            <span style={{ font: `400 11px/1 ${MONO}`, color: W.faint }}>{url}</span>
          </div>
        </div>
        <div style={{ width: 54 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
    </div>
  );
}
function Phone({ children, w = 390, h = 820 }) {
  return (
    <div style={{ width: w, height: h, background: W.ink, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 26px 6px", flexShrink: 0 }}>
        <span style={{ font: `600 13px/1 ${MONO}`, color: W.mut }}>9:41</span>
        <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 16, height: 9, borderRadius: 2, background: W.line2 }} />)}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
    </div>
  );
}

// caption strip used inside a frame footer to explain the screen
function Caption({ children, n }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: `1px solid ${W.line}`, background: "#0a0d11" }}>
      {n != null && <span style={{ width: 18, height: 18, borderRadius: 999, border: `1px solid ${W.noteFg}66`, color: W.noteFg, font: `600 10px/18px ${MONO}`, textAlign: "center", flexShrink: 0 }}>{n}</span>}
      <span style={{ font: `400 11.5px/1.45 ${FONT}`, color: W.faint }}>{children}</span>
    </div>
  );
}

// numbered annotation pin (absolute) + floating note
function Pin({ n, top, left, right, bottom, c = W.noteFg }) {
  return <div style={{ position: "absolute", top, left, right, bottom, width: 20, height: 20, borderRadius: 999, background: c, color: "#1a1206", font: `700 11px/20px ${MONO}`, textAlign: "center", zIndex: 6, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}>{n}</div>;
}

Object.assign(window, {
  W, FONT, MONO, ACCT,
  Bar, Lines, Eyebrow, Label, Num, Panel, Slider, Field, Chip, Btn, Toggle, Dot,
  AreaChart, StackBars, Verdict, Browser, Phone, Caption, Pin,
});
