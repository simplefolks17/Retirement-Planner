// wire-numbers-alt.jsx — PREMIUM directions for "The numbers" page (low-fi).
// Four ways to feel worth-paying-for, each on a different axis of premium:
//   P1 · Money Flow   — VISUAL premium (a sankey of every dollar)
//   P2 · Optimizer    — INTELLIGENCE premium ("what we actively do for you")
//   P3 · Year-by-year — DEPTH premium (the whole projection, beautifully)
//   P4 · Statement    — EDITORIAL premium (a private-wealth statement)
// Uses wire-kit.jsx primitives + tokens (load first).

const WSERIF = "Georgia, 'Times New Roman', serif";

// ── sankey ribbon helper ────────────────────────────────────────────────────
function wRibbon(x1, ya1, yb1, x2, ya2, yb2, fill, op = 0.5) {
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${ya1} C ${mx} ${ya1} ${mx} ${ya2} ${x2} ${ya2} L ${x2} ${yb2} C ${mx} ${yb2} ${mx} ${yb1} ${x1} ${yb1} Z`;
  return <path d={d} fill={fill} opacity={op} />;
}
function wNode(x, ya, yb, c) {
  return <rect x={x} y={ya} width="10" height={yb - ya} rx="3" fill={c} />;
}
function wTxt(x, y, s, opts = {}) {
  return <text x={x} y={y} fontFamily={WUI} fontSize={opts.size || 14} fontWeight={opts.w || 400}
    fill={opts.c || WK.ink} textAnchor={opts.anchor || "start"}>{s}</text>;
}

function SankeyFlow() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 1000 440" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
      {/* ribbons (drawn under nodes) */}
      {/* income → tax / take-home */}
      {wRibbon(70, 20, 110, 330, 20, 110, WK.line2, 0.5)}
      {wRibbon(70, 110, 420, 330, 120, 420, WK.good, 0.3)}
      {/* tax → gov (fades out) */}
      {wRibbon(340, 20, 110, 600, 20, 110, WK.line2, 0.32)}
      {/* take-home → save / living */}
      {wRibbon(340, 120, 230, 600, 120, 230, WK.good, 0.42)}
      {wRibbon(340, 230, 420, 600, 230, 420, WK.fill2, 0.7)}
      {/* save → accounts */}
      {wRibbon(610, 120, 168, 870, 120, 168, WK.good, 0.5)}
      {wRibbon(610, 168, 194, 870, 168, 194, WK.accent, 0.5)}
      {wRibbon(610, 194, 206, 870, 194, 206, WK.warm, 0.6)}
      {wRibbon(610, 206, 230, 870, 206, 230, WK.line2, 0.6)}

      {/* nodes */}
      {wNode(60, 20, 420, WK.ink)}
      {wNode(330, 20, 110, WK.line2)}
      {wNode(330, 120, 420, WK.good)}
      {wNode(600, 20, 110, WK.line2)}
      {wNode(600, 120, 230, WK.good)}
      {wNode(600, 230, 420, WK.fill2)}
      {[[120, 168, WK.good], [168, 194, WK.accent], [194, 206, WK.warm], [206, 230, WK.line2]].map(([a, b, c], i) => (
        <rect key={i} x="870" y={a} width="10" height={b - a} rx="3" fill={c} />
      ))}

      {/* labels */}
      {wTxt(46, 16, "Income $100k", { w: 700, anchor: "end", size: 15 })}
      {wTxt(322, 16, "Tax $25k", { anchor: "end", c: WK.mut })}
      {wTxt(322, 118, "Take-home $75k", { w: 700, anchor: "end", c: WK.good })}
      {wTxt(592, 16, "→ gov", { anchor: "end", c: WK.faint })}
      {wTxt(592, 118, "Save $11k/yr", { w: 700, anchor: "end", c: WK.good })}
      {wTxt(592, 330, "Living $64k", { anchor: "end", c: WK.mut })}
      {wTxt(888, 146, "401(k)", { w: 700, c: WK.good })}
      {wTxt(888, 184, "Roth", { w: 700, c: WK.accent })}
      {wTxt(888, 203, "HSA", { w: 700, c: WK.warm, size: 12 })}
      {wTxt(888, 223, "Brokerage", { c: WK.mut, size: 12 })}
      {/* end bracket */}
      {wTxt(940, 168, "▸", { c: WK.ink, size: 16 })}
      {wTxt(958, 162, "grows to", { c: WK.mut, size: 12 })}
      {wTxt(958, 180, "$3.1M", { w: 700, c: WK.ink, size: 17 })}
    </svg>
  );
}

function NumPremFlow() {
  return (
    <WScreen title="The numbers · P1 — Money Flow" w={1340} h={880}>
      <WNav active="The numbers" />
      <WHead eyebrow="Premium direction · visual" title="Follow every dollar."
        sub="From your paycheck to future-you, as one continuous flow. Pull any ribbon to see the rule behind it — taxes, the savings split, where each account's money goes." />
      <WCard style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}><SankeyFlow /></div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <WChip active accent={WK.good}>71% take-home</WChip>
          <WChip accent={WK.line2}>18% tax</WChip>
          <WChip active accent={WK.warm}>11% invested</WChip>
          <span style={{ flex: 1 }} />
          <WThread>see the tax math</WThread>
        </div>
      </WCard>
      <WAnno dir="left" style={{ marginTop: 12 }}>The most visually striking option — feels like a product, not a spreadsheet. Each ribbon is a live, pullable explanation. A signature screen people screenshot.</WAnno>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  P2 · OPTIMIZER — "what we actively do for you" (intelligence premium)
// ════════════════════════════════════════════════════════════════════════════
function NumPremOptimizer() {
  const moves = [
    ["Roth conversion ladder", "Convert $30k/yr in the low-bracket years 65–72.", "+$84k", "Active", WK.good],
    ["HSA triple advantage", "Max it, invest it, never spend it now.", "+$140k", "Active", WK.good],
    ["Fill the 12% bracket", "Realize gains before the bracket closes at 65.", "+$22k", "Active", WK.good],
    ["Tax-loss harvesting", "Offset gains automatically each year.", "+$6k/yr", "Available", WK.warm],
    ["Claim Social Security at 70", "Bridge with portfolio, then lock the max.", "+$640/mo", "Suggested", WK.accent],
    ["Asset location", "Bonds in 401(k), growth in Roth.", "+$31k", "Active", WK.good],
  ];
  return (
    <WScreen title="The numbers · P2 — Optimizer" w={1340} h={880}>
      <WNav active="The numbers" />
      <WHead eyebrow="Premium direction · intelligence" title="We're working for you."
        sub="What the plan actively does that a savings account never would — each move, in plain English, and exactly what it's worth." />
      {/* headline value banner */}
      <WCard style={{ padding: 18, marginBottom: 16, background: WK.fill2, display: "flex", alignItems: "center", gap: 26 }}>
        <div>
          <div style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Saved in tax this year</div>
          <div style={{ font: `700 38px ${WMONO}`, color: WK.good, lineHeight: 1 }}>$14,200</div>
        </div>
        <span style={{ width: 2, height: 44, background: WK.line2 }} />
        <div>
          <div style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Over your lifetime</div>
          <div style={{ font: `700 38px ${WMONO}`, color: WK.ink, lineHeight: 1 }}>$310k</div>
        </div>
        <span style={{ flex: 1 }} />
        <WAnno style={{ maxWidth: 230 }}>Leads with the dollar value of the engine — the clearest answer to "why pay for this?"</WAnno>
      </WCard>
      {/* moves grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13, minHeight: 0 }}>
        {moves.map(([t, d, impact, status, c]) => (
          <WCard key={t} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 15 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: c }} />
              <WChip active={status === "Active"} accent={c} dot={false}>{status}</WChip>
            </div>
            <div style={{ font: `700 18px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>{t}</div>
            <div style={{ font: `400 13.5px ${WUI}`, color: WK.mut, lineHeight: 1.3, textWrap: "pretty", flex: 1 }}>{d}</div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: `1.5px solid ${WK.line}`, paddingTop: 8 }}>
              <span style={{ font: `700 22px ${WMONO}`, color: c }}>{impact}</span>
              <WThread>how</WThread>
            </div>
          </WCard>
        ))}
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  P3 · YEAR-BY-YEAR — the full projection (depth premium)
// ════════════════════════════════════════════════════════════════════════════
function NumPremYearly() {
  // [age, income, tax, saved, balance(0-1 for bar), balLabel, draw, tag, tagColor]
  const rows = [
    ["34", "$100k", "$25k", "$11k", 0.05, "$165k", "—", "Today", WK.good],
    ["40", "$119k", "$31k", "$13k", 0.18, "$575k", "—", "", null],
    ["50", "$160k", "$44k", "$18k", 0.41, "$1.28M", "—", "First $1M at 46", WK.accent],
    ["60", "$215k", "$61k", "$24k", 0.76, "$2.38M", "—", "", null],
    ["65", "$240k", "$68k", "$26k", 0.98, "$3.05M", "begins", "Retire", WK.accent],
    ["70", "—", "$9k", "—", 1.0, "$3.21M", "$5.4k/mo", "Peak", WK.warm],
    ["73", "—", "$11k", "—", 0.94, "$3.0M", "$5.4k/mo", "RMDs start", WK.warm],
    ["80", "—", "$8k", "—", 0.72, "$2.64M", "$5.4k/mo", "", null],
    ["90", "—", "$4k", "—", 0.40, "$1.4M", "$5.4k/mo", "For life", WK.warm],
  ];
  const cols = ["Age", "Income", "Tax", "Saved", "Balance", "Draw"];
  return (
    <WScreen title="The numbers · P3 — Year by year" w={1340} h={880}>
      <WNav active="The numbers" />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <WHead eyebrow="Premium direction · depth" title="Every year, in full."
          sub="Your plan projected age by age — income, tax, savings and balance for all 56 years. The depth a paid tool is expected to have." />
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, border: `2px solid ${WK.ink}`, marginBottom: 14 }}>
          <span style={{ font: `400 14px ${WUI}`, color: WK.mut, padding: "5px 12px" }}>Summary</span>
          <span style={{ font: `700 14px ${WUI}`, color: "#fff", background: WK.accent, borderRadius: 7, padding: "5px 12px" }}>Year by year</span>
        </div>
      </div>
      <WCard style={{ flex: 1, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr 2.2fr 1.2fr", gap: 0,
          padding: "12px 18px", borderBottom: `2px solid ${WK.ink}`, background: WK.fill2 }}>
          {cols.map((c) => <span key={c} style={{ font: `700 13px ${WUI}`, color: WK.ink, letterSpacing: "0.03em" }}>{c}</span>)}
        </div>
        {/* rows */}
        <div style={{ flex: 1 }}>
          {rows.map(([age, inc, tax, sav, bal, balL, draw, tag, tc], i) => (
            <div key={age} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr 2.2fr 1.2fr", gap: 0,
              alignItems: "center", padding: "11px 18px",
              borderBottom: `1.5px solid ${WK.line}`, background: tag === "Retire" ? `${WK.accent}12` : "transparent" }}>
              <span style={{ font: `700 16px ${WMONO}`, color: tc || WK.ink }}>{age}</span>
              <span style={{ font: `400 14px ${WMONO}`, color: WK.mut }}>{inc}</span>
              <span style={{ font: `400 14px ${WMONO}`, color: WK.mut }}>{tax}</span>
              <span style={{ font: `400 14px ${WMONO}`, color: WK.mut }}>{sav}</span>
              {/* balance bar + label */}
              <span style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 18 }}>
                <span style={{ flex: 1, height: 14, borderRadius: 4, background: WK.fill, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${bal * 100}%`,
                    background: Number(age) >= 65 ? WK.warm : WK.good, opacity: 0.8 }} />
                </span>
                <span style={{ font: `700 13px ${WMONO}`, color: WK.ink, width: 56, textAlign: "right" }}>{balL}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ font: `400 13px ${WMONO}`, color: draw === "—" ? WK.faint : WK.warm }}>{draw}</span>
                {tag && <WChip active accent={tc} dot={false}>{tag}</WChip>}
              </span>
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 18px", borderTop: `2px solid ${WK.ink}`, background: WK.fill2, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ font: `400 13px ${WUI}`, color: WK.faint }}>showing 9 of 56 years · key rows</span>
          <span style={{ flex: 1 }} />
          <WThread>change assumptions</WThread>
        </div>
      </WCard>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  P4 · STATEMENT — a private-wealth statement (editorial premium)
// ════════════════════════════════════════════════════════════════════════════
function NumPremStatement() {
  const Foot = ({ n }) => <sup style={{ font: `700 11px ${WSERIF}`, color: WK.accent }}>{n}</sup>;
  const col = (title, items) => (
    <div style={{ flex: 1, paddingTop: 4 }}>
      <div style={{ font: `700 12px ${WUI}`, color: WK.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, borderBottom: `1.5px solid ${WK.line2}`, paddingBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {items.map(([l, v, foot, strong], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ font: `${strong ? 700 : 400} 15px ${WSERIF}`, color: strong ? WK.ink : WK.mut, whiteSpace: "nowrap" }}>{l}{foot && <Foot n={foot} />}</span>
            <span style={{ font: `${strong ? 700 : 400} 15px ${WMONO}`, color: WK.ink, whiteSpace: "nowrap" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <WScreen title="The numbers · P4 — Statement" w={1340} h={880}>
      <WNav active="The numbers" />
      {/* masthead */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        borderBottom: `2.5px solid ${WK.ink}`, paddingBottom: 12, marginBottom: 4 }}>
        <span style={{ font: `700 30px ${WSERIF}`, color: WK.ink, letterSpacing: "0.04em" }}>HORIZON</span>
        <span style={{ font: `400 14px ${WSERIF}`, color: WK.mut, textAlign: "right" }}>
          Statement of your plan<br />Prepared June 10, 2026 · figures in today's dollars
        </span>
      </div>
      <div style={{ height: 3, background: WK.ink, marginBottom: 22 }} />

      {/* bottom line */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 30, marginBottom: 26 }}>
        <div>
          <div style={{ font: `400 13px ${WUI}`, color: WK.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>The bottom line</div>
          <div style={{ font: `700 44px ${WSERIF}`, color: WK.ink, lineHeight: 1 }}>$8,200 <span style={{ font: `400 22px ${WSERIF}`, color: WK.mut }}>/ month, for life</span></div>
          <div style={{ font: `400 16px ${WSERIF}`, color: WK.mut, marginTop: 8 }}>with <span style={{ color: WK.warm, fontWeight: 700 }}>$1.4M</span> remaining at age 90.</div>
        </div>
        <span style={{ flex: 1 }} />
        <WAnno style={{ maxWidth: 220 }}>Authority through typography & restraint — reads like private wealth management, not an app.</WAnno>
      </div>

      {/* three columns */}
      <div style={{ flex: 1, display: "flex", gap: 36, minHeight: 0 }}>
        {col("Income & tax", [
          ["Gross income", "$100,000"],
          ["Federal tax", "−$13,400", "1"],
          ["FICA + state", "−$11,850"],
          ["Pre-tax savings", "−$13,000"],
          ["Take-home", "$61,750", null, true],
        ])}
        <span style={{ width: 1.5, background: WK.line2 }} />
        {col("What you're building", [
          ["401(k)", "$1.40M"],
          ["Roth IRA", "$740k", "2"],
          ["Brokerage", "$560k"],
          ["HSA", "$370k"],
          ["Nest egg by 65", "$3.10M", null, true],
        ])}
        <span style={{ width: 1.5, background: WK.line2 }} />
        {col("Income for life", [
          ["Social Security", "$2,800/mo", "3"],
          ["Portfolio draw", "$5,400/mo"],
          ["Safe rate", "3.8%"],
          ["Runs dry at", "never"],
          ["Total monthly", "$8,200/mo", null, true],
        ])}
      </div>

      {/* footnotes */}
      <div style={{ borderTop: `1.5px solid ${WK.line2}`, marginTop: 16, paddingTop: 10, display: "flex", gap: 26, alignItems: "center" }}>
        <span style={{ font: `400 12px ${WSERIF}`, color: WK.faint }}><sup style={{ color: WK.accent, fontWeight: 700 }}>1</sup> Effective federal rate 13.4% across brackets.</span>
        <span style={{ font: `400 12px ${WSERIF}`, color: WK.faint }}><sup style={{ color: WK.accent, fontWeight: 700 }}>2</sup> Assumes 5% real return, contributions to 65.</span>
        <span style={{ font: `400 12px ${WSERIF}`, color: WK.faint }}><sup style={{ color: WK.accent, fontWeight: 700 }}>3</sup> Claimed at full retirement age 67.</span>
        <span style={{ flex: 1 }} />
        <WThread>expand any line</WThread>
      </div>
    </WScreen>
  );
}

Object.assign(window, { NumPremFlow, NumPremOptimizer, NumPremYearly, NumPremStatement });
