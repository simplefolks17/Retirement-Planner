// frames-d.jsx — Direction D · The living Horizon
// C+ pushed further: a static-but-warm dashboard becomes alive and personal.
//  1. "What-if" scenario chips that live-reshape the plan
//  2. Numbers that count up on load and re-animate on change
//  3. Golden-hour timeline — later years lit warm, not dusk
//  4. A "future self" moment with the user's own photo
// Reuses C+'s shared pieces (CpTimeline, CpActivityLine, ProgGoal, CP_PHASES, CP_GOLD).

const { useState, useEffect, useRef } = React;

if (typeof document !== "undefined" && !document.getElementById("d-kf")) {
  const s = document.createElement("style");
  s.id = "d-kf";
  s.textContent =
    "@keyframes dPulse{0%,100%{box-shadow:0 0 0 0 rgba(95,167,119,.0)}50%{box-shadow:0 0 0 7px rgba(95,167,119,.18)}}" +
    "@keyframes dGlow{0%,100%{opacity:.55}50%{opacity:.9}}" +
    "@keyframes dFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    "@keyframes dSoft{from{opacity:.25}to{opacity:1}}";
  document.head.appendChild(s);
}

// ── count-up number: animates from previous value to `to` whenever `to` changes ──
function DCount({ to, fmt = (x) => String(Math.round(x)), dur = 850 }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    let raf, start = null;
    const tick = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <React.Fragment>{fmt(v)}</React.Fragment>;
}
const fmtMoney = (x) => "$" + Math.round(x).toLocaleString();
const fmtMill = (x) => "$" + x.toFixed(2).replace(/0$/, "") + "M";
const fmtAge = (x) => String(Math.round(x));

// ── the four illustrative "what-if" scenarios ──
const D_SCEN = {
  base:    { chip: "Today's plan",    retire: 65, keep: 2140, life: 8200, egg: 3.1, accent: W.good,
             note: "Your plan as it stands — on track, nothing to change." },
  earlier: { chip: "Retire at 60",    retire: 60, keep: 2980, life: 7100, egg: 2.6, accent: CP_GOLD,
             note: "Five years sooner — assumes the same spending and Social Security still at 67. Push savings to $2,980/mo and you still clear $7,100 for life." },
  more:    { chip: "Save $300 more",  retire: 64, keep: 2440, life: 8900, egg: 3.4, accent: W.good,
             note: "An extra $300/mo at today's 5% return retires you a year early — and adds $700/mo for life." },
  trip:    { chip: "Big trip at 70",  retire: 65, keep: 2140, life: 7950, egg: 3.1, accent: CP_GOLD,
             note: "A one-off $40k travel year at 70, spending held flat otherwise. It barely moves the needle — go." },
};
const D_ORDER = ["base", "earlier", "more", "trip"];

function DScenChip({ id, active, onClick }) {
  const s = D_SCEN[id];
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 15px", borderRadius: 999,
        border: `1px solid ${active ? s.accent : W.line2}`, background: active ? `${s.accent}1c` : "transparent",
        font: `600 12.5px/1 ${FONT}`, color: active ? W.text : W.mut, cursor: "pointer", whiteSpace: "nowrap",
        transition: "all .18s ease",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: active ? s.accent : W.line2 }} />
      {s.chip}
    </button>
  );
}

// stat card with a count-up value
function DStat({ label, children, sub, accent = W.text, warm = false }) {
  return (
    <div style={{ flex: 1, background: warm ? `${CP_GOLD}08` : W.panel, border: `1px solid ${warm ? `${CP_GOLD}33` : W.line}`, borderRadius: 12, padding: 18 }}>
      <Label s={11} c={W.mut} mb={9}>{label}</Label>
      <span style={{ font: `500 23px/1 ${MONO}`, color: accent, letterSpacing: "-0.01em" }}>{children}</span>
      <div style={{ marginTop: 6 }}><Label s={10.5} c={W.faint}>{sub}</Label></div>
    </div>
  );
}

// golden-hour wrapper around the shared timeline
function DHorizon({ retire }) {
  return (
    <div style={{ position: "relative" }}>
      {/* warm horizon light pooling on the right — "golden hour, not dusk" */}
      <div style={{ position: "absolute", inset: "-18px -10px -10px 30%", borderRadius: 24, background: `radial-gradient(115% 90% at 100% 35%, ${CP_GOLD}22, transparent 62%)`, animation: "dGlow 6s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}><CpTimeline activeIdx={1} lit={0.12} /></div>
      {/* a moveable "retire at" flag floating over the line */}
      <div style={{ position: "absolute", top: 6, left: "58%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: CP_GOLD, color: "#0e1116" }}>
          <span style={{ font: `700 11px/1 ${FONT}` }}>Retire at <DCount to={retire} fmt={fmtAge} /></span>
        </div>
        <span style={{ width: 1, height: 14, background: `${CP_GOLD}99` }} />
      </div>
    </div>
  );
}

// ── concept card ──
function DRow({ k, children }) {
  return <div><Eyebrow c={CP_GOLD}>{k}</Eyebrow><div style={{ marginTop: 5 }}><Label s={13.5} c={W.text} w={500}>{children}</Label></div></div>;
}
function DSpec() {
  return (
    <div style={{ width: 470, height: 900, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${CP_GOLD}22`, border: `1px solid ${CP_GOLD}66`, color: CP_GOLD, font: `700 17px/38px ${MONO}`, textAlign: "center" }}>D</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>The living Horizon</div>
          <Label s={12} c={CP_GOLD} style={{ marginTop: 3 }}>C+, made alive and personal</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={20}>Same calm, honest bones as C+ — but the plan now <span style={{ color: W.text }}>responds, animates, and feels like yours</span>. Four additions, nothing removed.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <DRow k="1 · Play with it">"What-if" chips — retire at 60, save $300 more, a big trip — live-reshape the numbers. Staring becomes playing; a softer door into the deep settings.</DRow>
        <DRow k="2 · Numbers that move">Stats count up on arrival and re-animate when a scenario changes, so you feel the plan respond.</DRow>
        <DRow k="3 · Golden hour, not dusk">The journey line warms into golden light toward the later years — the anti-doom idea made literal, in color.</DRow>
        <DRow k="4 · Your someday">One emotional beat: drop in your own photo of the life you're funding, beside "$8,200/mo, for life."</DRow>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>The trade-off to weigh</Eyebrow>
        <Label s={12.5} c={W.mut} style={{ marginTop: 9 }}>More delight, more motion. Some 50+ users prefer dead-calm and static — so every animation respects reduced-motion, and the what-ifs are opt-in, never the default view.</Label>
      </div>
    </div>
  );
}

// ── the living home ──
function DHome() {
  const [sel, setSel] = useState("base");
  const [edit, setEdit] = useState(false);
  const s = D_SCEN[sel];
  return (
    <Browser url="horizon.app" w={1340} h={880}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <CpTopBar />
        <div style={{ flex: 1, padding: "26px 36px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 620 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, alignSelf: "flex-start", padding: "6px 12px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}>
                <Dot c={W.good} /><span style={{ font: `600 12px/1 ${FONT}`, color: W.good, letterSpacing: "0.02em" }}>On track</span>
              </div>
              <div style={{ font: `600 28px/1.14 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>On track for retirement by {s.retire}.</div>
              <CpActivityLine size={25} />
            </div>
            <div style={{ width: 320, flexShrink: 0, paddingTop: 6 }}><ProgGoal /></div>
          </div>

          {/* the playground — what-if chips */}
          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Label s={11.5} c={W.faint} w={600} ls="0.04em">PLAY WITH IT</Label>
            {D_ORDER.map((id) => <DScenChip key={id} id={id} active={sel === id} onClick={() => setSel(id)} />)}
            <span style={{ width: 1, height: 20, background: W.line2, margin: "0 2px" }} />
            <DEditChip onClick={() => setEdit(true)} />
          </div>

          <div style={{ height: 22 }} />
          <DHorizon retire={s.retire} />
          <div style={{ height: 26 }} />

          <div style={{ display: "flex", gap: 12 }}>
            <DStat label="You keep each month" accent={W.good} sub="of your take-home"><DCount to={s.keep} fmt={fmtMoney} /></DStat>
            <DStat label="Retire at" accent={W.text} sub="on your terms"><DCount to={s.retire} fmt={fmtAge} /></DStat>
            <DStat label="Nest egg by then" accent={W.text} sub="today's dollars"><DCount to={s.egg} fmt={fmtMill} /></DStat>
            <DStat label="Income for life" accent={CP_GOLD} warm sub="per month, never runs out"><DCount to={s.life} fmt={fmtMoney} /></DStat>
          </div>

          {/* the dynamic, warm explanation of the chosen scenario */}
          <div key={sel} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 11, background: `${s.accent}0e`, border: `1px solid ${s.accent}33`, animation: "dFade .4s ease" }}>
            <span style={{ color: s.accent, font: `600 15px/1 ${FONT}` }}>↗</span>
            <Label s={12.5} c={W.mut}>{s.note}</Label>
          </div>
        </div>
        {edit && <DEditor onClose={() => setEdit(false)} />}
      </div>
    </Browser>
  );
}

// the "open it up" chip — same engine, full control. The honest exit from presets.
function DEditChip({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 15px", borderRadius: 999,
        border: `1px dashed ${W.line2}`, background: "transparent",
        font: `600 12.5px/1 ${FONT}`, color: W.text, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <span style={{ font: `600 14px/1 ${FONT}`, color: W.mut, marginTop: -1 }}>+</span>
      Adjust the details
      <span style={{ color: W.mut }}>→</span>
    </button>
  );
}

// the Shape-it drawer the edit chip opens — the real, deep controls
function DEditor({ onClose }) {
  const rows = [
    ["Already saved (401k, IRA…)", "$165,000", 28, W.good],
    ["Income (grows 3%/yr)", "$100,000", 36, W.good],
    ["Into 401(k) / yr", "$10,000", 43, ACCT.k401],
    ["Into Roth / yr", "$7,000", 70, ACCT.roth],
    ["Retire at", "age 65", 80, CP_GOLD],
    ["Monthly spend in retirement", "$6,000", 50, W.mut],
    ["Assumed return", "5% / yr", 50, W.mut],
  ];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(8,10,13,.55)", animation: "dFade .25s ease" }} />
      <div style={{ position: "relative", width: 420, background: "#0c1015", borderLeft: `1px solid ${W.line2}`, padding: "26px 26px 22px", display: "flex", flexDirection: "column", animation: "dFade .3s ease", boxShadow: "-30px 0 60px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <Eyebrow c={W.faint}>The same math, your hands on it</Eyebrow>
            <div style={{ font: `600 19px/1.2 ${FONT}`, color: W.text, letterSpacing: "-0.02em", marginTop: 7 }}>Adjust the details</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${W.line2}`, background: "transparent", color: W.mut, cursor: "pointer", font: `400 15px/1 ${FONT}` }}>✕</button>
        </div>
        <Label s={12} c={W.mut} mb={20}>Every preset chip is just a shortcut to these. Move anything — the plan re-runs live.</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 15, overflow: "hidden" }}>
          {rows.map(([l, v, p, c]) => <Slider key={l} label={l} val={v} pct={p} accent={c} />)}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: `${W.good}0e`, border: `1px solid ${W.good}33`, marginTop: 18 }}>
          <Dot c={W.good} /><Label s={12} c={W.mut}>Live: retire at <span style={{ color: W.text, fontWeight: 600 }}>65</span> · <span style={{ color: CP_GOLD, fontWeight: 600 }}>$8,200/mo</span> for life</Label>
        </div>
      </div>
    </div>
  );
}

// ── the "future self" moment ──
// Backdrop has four sources, cheapest storage → richest:
//  auto    — generated, themed to the user's activity (default; keeps free users engaged; stores nothing)
//  curated — pick from a small library (stores a one-byte choice)
//  personal— upload your own photo (Premium; the only path that hosts a file)
//  off      — plain, for anyone who'd rather not
const D_CURATED = [
  { id: "fairway", label: "Fairway",   g: `linear-gradient(160deg,#2f5c3a,#5fa777 70%,#bfe3b0)` },
  { id: "shore",   label: "Shoreline", g: `linear-gradient(160deg,#284a63,#5e8fc9 65%,#bcdcf2)` },
  { id: "road",    label: "Open road", g: `linear-gradient(160deg,#5a3f25,#cf9a4a 70%,#f0d39a)` },
  { id: "garden",  label: "Garden",    g: `linear-gradient(160deg,#3a4423,#8a9a5b 70%,#d6dca6)` },
  { id: "summit",  label: "Summit",    g: `linear-gradient(160deg,#3a4a5e,#7fb0d6 65%,#e6f1fa)` },
];
// auto-generated default: a warm golden-hour wash (themed to the "golf course" activity)
const D_AUTO_BG = `radial-gradient(120% 90% at 30% 18%, #d8b878 0%, #c08a4e 34%, #6e4a35 66%, #2a2018 100%)`;

function DSourceBtn({ active, children, onClick, premium }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8,
      border: `1px solid ${active ? W.line2 : "transparent"}`, background: active ? W.panel2 : "transparent",
      font: `600 11.5px/1 ${FONT}`, color: active ? W.text : W.mut, cursor: "pointer", whiteSpace: "nowrap",
    }}>
      {children}
      {premium && <span style={{ font: `700 8.5px/1 ${FONT}`, letterSpacing: "0.1em", color: CP_GOLD, border: `1px solid ${CP_GOLD}55`, borderRadius: 4, padding: "2px 4px" }}>PREMIUM</span>}
    </button>
  );
}

function DMoment({ interval = 2600 }) {
  const [src, setSrc] = useState("auto");          // auto | curated | personal | off
  const [pick, setPick] = useState("fairway");
  const [autoI, setAutoI] = useState(0);           // drives BOTH the tagline and the auto backdrop
  useEffect(() => {
    const t = setInterval(() => setAutoI((x) => (x + 1) % CP_ACTIVITIES.length), interval);
    return () => clearInterval(t);
  }, [interval]);
  const act = CP_ACTIVITIES[autoI];
  const cur = D_CURATED.find((c) => c.id === pick);

  let bg, overlayBadge;
  if (src === "auto") { bg = act.bg; overlayBadge = act.b; }
  else if (src === "curated") { bg = cur.g; overlayBadge = `${cur.label} · from the library`; }
  else if (src === "off") { bg = `linear-gradient(160deg,#0e1217,#141a21)`; overlayBadge = null; }

  return (
    <div style={{ width: 1100, height: 620, background: W.ink, fontFamily: FONT, overflow: "hidden", position: "relative", display: "flex" }}>
      {/* backdrop panel */}
      <div style={{ position: "relative", width: 480, flexShrink: 0, padding: 22, display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", flex: 1, borderRadius: 16, overflow: "hidden", border: `1px solid ${W.line2}` }}>
          {src === "personal" ? (
            <image-slot id="d-someday" shape="rect" placeholder="Upload a photo of your someday — a place, a person, a view" style={{ width: "100%", height: "100%", display: "block" }}></image-slot>
          ) : (
            <div key={src === "auto" ? autoI : src} style={{ position: "absolute", inset: 0, background: bg, animation: src === "auto" ? "dSoft .7s ease" : "none" }} />
          )}
          {/* legibility scrim for the activity caption */}
          {src !== "personal" && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 50%, rgba(8,10,13,.55))" }} />}

          {src === "off" ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ font: `500 22px/1 ${MONO}`, color: CP_GOLD }}>$8,200<span style={{ font: `400 13px ${FONT}`, color: W.faint }}> /mo</span></span>
              <Label s={11.5} c={W.faint}>Imagery off — numbers only</Label>
            </div>
          ) : overlayBadge ? (
            <div style={{ position: "absolute", left: 16, bottom: 14, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "rgba(8,10,13,.62)", backdropFilter: "blur(6px)", border: `1px solid rgba(255,255,255,.14)` }}>
              <span style={{ color: CP_GOLD, font: `600 11px/1 ${FONT}` }}>{src === "auto" ? "✦" : ""}</span>
              <Label s={11} c="#fff" w={600}>{overlayBadge}</Label>
            </div>
          ) : null}
        </div>

        {/* curated picker — only when "Pick one" is active */}
        {src === "curated" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, animation: "dFade .3s ease" }}>
            {D_CURATED.map((c) => (
              <button key={c.id} onClick={() => setPick(c.id)} title={c.label} style={{ flex: 1, height: 40, borderRadius: 9, background: c.g, border: `2px solid ${pick === c.id ? "#fff" : "transparent"}`, boxShadow: pick === c.id ? `0 0 0 1px ${W.line2}` : "none", cursor: "pointer" }} />
            ))}
          </div>
        )}

        {/* source switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 12, padding: 4, borderRadius: 11, background: W.panel, border: `1px solid ${W.line}` }}>
          <DSourceBtn active={src === "auto"} onClick={() => setSrc("auto")}>✦ Auto</DSourceBtn>
          <DSourceBtn active={src === "curated"} onClick={() => setSrc("curated")}>Pick one</DSourceBtn>
          <DSourceBtn active={src === "personal"} onClick={() => setSrc("personal")} premium>Yours</DSourceBtn>
          <div style={{ flex: 1 }} />
          <DSourceBtn active={src === "off"} onClick={() => setSrc("off")}>Off</DSourceBtn>
        </div>
      </div>

      {/* the warm copy */}
      <div style={{ flex: 1, minWidth: 0, padding: "54px 50px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: "0 0 0 480px", background: `radial-gradient(90% 70% at 80% 30%, ${CP_GOLD}14, transparent 60%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <Eyebrow c={CP_GOLD}>Age 67 · funded</Eyebrow>
          <div style={{ height: 16 }} />
          <div style={{ font: `600 34px/1.16 ${FONT}`, color: W.text, letterSpacing: "-0.025em", textWrap: "balance" }}>Your someday is already paid for.</div>
          <div style={{ height: 16 }} />
          <CpActivityLine size={22} index={autoI} interval={interval} />
          <div style={{ height: 22 }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ font: `500 30px/1 ${MONO}`, color: CP_GOLD }}>$8,200</span>
            <Label s={14} c={W.mut}>a month, for life — covered well past 90.</Label>
          </div>
          <div style={{ height: 24 }} />
          <Label s={11.5} c={W.faint} style={{ maxWidth: 380, lineHeight: 1.5 }}>
            {src === "auto" && "The scene follows your tagline — powder, fairway, shoreline — generated on the fly, nothing stored. Make it yours anytime."}
            {src === "curated" && "Choose a scene you love — we remember the choice, not a file."}
            {src === "personal" && "Premium: upload a photo of your own someday. It's yours, and it travels with your plan."}
            {src === "off" && "Imagery off. We'll keep it to the numbers — switch it back on whenever you like."}
          </Label>
          <div style={{ height: 26 }} />
          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, alignSelf: "flex-start", padding: "10px 16px", borderRadius: 10, border: `1px solid ${W.line2}` }}>
            <Label s={13} c={W.text} w={600}>See the plan behind it</Label>
            <span style={{ color: W.mut }}>→</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DSpec, DHome, DMoment,
  DCount, fmtMoney, fmtMill, fmtAge, D_SCEN, D_ORDER, DScenChip, DStat, DHorizon, DEditChip, DEditor });
