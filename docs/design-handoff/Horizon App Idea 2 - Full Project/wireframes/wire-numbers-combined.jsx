// wire-numbers-combined.jsx — the blended "The numbers" page (low-fi).
// Two deliverables:
//   • NumCombined      — Optimizer value-banner (pinned) + tabbed body
//                        [Statement · Year by year · Money flow], Statement default.
//                        Interactive tab switch so the user can feel the flow.
//   • NumStatementBars — Statement variant with the original #3 proportion bars
//                        woven into each column (visual rhythm + authority).
// Reuses NumPremYearly/NumPremFlow bodies via lightweight inline re-renders.
// Load AFTER wire-kit.jsx and wire-numbers-alt.jsx.

const WSERIF2 = "Georgia, 'Times New Roman', serif";

// ── shared: the pinned engine-value banner ──────────────────────────────────
function NumValueBanner() {
  return (
    <WCard style={{ padding: "13px 18px", display: "flex", alignItems: "center", gap: 22, background: WK.fill2, flexShrink: 0 }}>
      <span style={{ font: `700 15px ${WUI}`, color: WK.accent }}>✦ The engine is working</span>
      <span style={{ width: 2, height: 30, background: WK.line2 }} />
      <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ font: `700 22px ${WMONO}`, color: WK.good }}>$14,200</span>
        <span style={{ font: `400 13px ${WUI}`, color: WK.mut }}>saved in tax this year</span>
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ font: `700 22px ${WMONO}`, color: WK.ink }}>$310k</span>
        <span style={{ font: `400 13px ${WUI}`, color: WK.mut }}>over your lifetime</span>
      </span>
      <span style={{ flex: 1 }} />
      <WChip dashed dot={false}>6 active moves →</WChip>
    </WCard>
  );
}

// ── shared: serif statement column (with optional proportion bar) ───────────
function StmtCol({ title, items, bar }) {
  const Foot = ({ n }) => <sup style={{ font: `700 11px ${WSERIF2}`, color: WK.accent }}>{n}</sup>;
  return (
    <div style={{ flex: 1, paddingTop: 4, display: "flex", flexDirection: "column" }}>
      <div style={{ font: `700 12px ${WUI}`, color: WK.accent, letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 12, borderBottom: `1.5px solid ${WK.line2}`, paddingBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {items.map(([l, v, foot, strong], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ font: `${strong ? 700 : 400} 15px ${WSERIF2}`, color: strong ? WK.ink : WK.mut, whiteSpace: "nowrap" }}>{l}{foot && <Foot n={foot} />}</span>
            <span style={{ font: `${strong ? 700 : 400} 15px ${WMONO}`, color: WK.ink, whiteSpace: "nowrap" }}>{v}</span>
          </div>
        ))}
      </div>
      {/* the original #3 split bar, folded in */}
      {bar && (
        <div style={{ marginTop: 14 }}>
          <WSplitBar segs={bar.segs} />
          <div style={{ font: `400 12px ${WSERIF2}`, color: WK.faint, marginTop: 6, fontStyle: "italic" }}>{bar.cap}</div>
        </div>
      )}
    </div>
  );
}

// ── shared: the full statement body (used by both combined + bars variant) ──
function StatementBody({ withBars }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* masthead */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        borderBottom: `2.5px solid ${WK.ink}`, paddingBottom: 10, marginBottom: 3 }}>
        <span style={{ font: `700 26px ${WSERIF2}`, color: WK.ink, letterSpacing: "0.04em" }}>HORIZON</span>
        <span style={{ font: `400 13px ${WSERIF2}`, color: WK.mut, textAlign: "right" }}>
          Statement of your plan · June 10, 2026 · today's dollars</span>
      </div>
      <div style={{ height: 3, background: WK.ink, marginBottom: 18 }} />

      {/* bottom line */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 30, marginBottom: 20 }}>
        <div>
          <div style={{ font: `400 12px ${WUI}`, color: WK.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>The bottom line</div>
          <div style={{ font: `700 38px ${WSERIF2}`, color: WK.ink, lineHeight: 1 }}>$8,200 <span style={{ font: `400 19px ${WSERIF2}`, color: WK.mut }}>/ month, for life</span></div>
          <div style={{ font: `400 15px ${WSERIF2}`, color: WK.mut, marginTop: 6 }}>with <span style={{ color: WK.warm, fontWeight: 700 }}>$1.4M</span> remaining at age 90.</div>
        </div>
      </div>

      {/* three columns */}
      <div style={{ flex: 1, display: "flex", gap: 32, minHeight: 0 }}>
        <StmtCol title="Income & tax"
          items={[["Gross income", "$100,000"], ["Federal tax", "−$13,400", "1"], ["FICA + state", "−$11,850"], ["Pre-tax savings", "−$13,000"], ["Take-home", "$61,750", null, true]]}
          bar={withBars ? { segs: [{ f: 71, c: WK.good, l: "Keep 71%" }, { f: 18, c: WK.fill2, l: "Tax 18%" }, { f: 11, c: WK.warm, l: "Save 11%" }], cap: "of every dollar earned" } : null} />
        <span style={{ width: 1.5, background: WK.line2 }} />
        <StmtCol title="What you're building"
          items={[["401(k)", "$1.40M"], ["Roth IRA", "$740k", "2"], ["Brokerage", "$560k"], ["HSA", "$370k"], ["Nest egg by 65", "$3.10M", null, true]]}
          bar={withBars ? { segs: [{ f: 46, c: WK.good, l: "401k" }, { f: 24, c: WK.accent, l: "Roth" }, { f: 18, c: WK.warm, l: "Brkg" }, { f: 12, c: WK.fill2, l: "HSA" }], cap: "$3.1M across four buckets" } : null} />
        <span style={{ width: 1.5, background: WK.line2 }} />
        <StmtCol title="Income for life"
          items={[["Social Security", "$2,800/mo", "3"], ["Portfolio draw", "$5,400/mo"], ["Safe rate", "3.8%"], ["Runs dry at", "never"], ["Total monthly", "$8,200/mo", null, true]]}
          bar={withBars ? { segs: [{ f: 34, c: WK.warm, l: "Soc Sec" }, { f: 66, c: WK.good, l: "Portfolio draw" }], cap: "blended monthly income" } : null} />
      </div>

      {/* footnotes */}
      <div style={{ borderTop: `1.5px solid ${WK.line2}`, marginTop: 14, paddingTop: 9, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ font: `400 12px ${WSERIF2}`, color: WK.faint }}><sup style={{ color: WK.accent, fontWeight: 700 }}>1</sup> Eff. federal rate 13.4%.</span>
        <span style={{ font: `400 12px ${WSERIF2}`, color: WK.faint }}><sup style={{ color: WK.accent, fontWeight: 700 }}>2</sup> 5% real return, contributions to 65.</span>
        <span style={{ font: `400 12px ${WSERIF2}`, color: WK.faint }}><sup style={{ color: WK.accent, fontWeight: 700 }}>3</sup> Claimed at FRA 67.</span>
        <span style={{ flex: 1 }} />
        <WThread>expand any line</WThread>
      </div>
    </div>
  );
}

// ── compact tab bodies for Year-by-year & Money-flow inside the tabbed shell ─
function YearlyBodyCompact() {
  const rows = [
    ["34", "$100k", "$25k", "$11k", 0.05, "$165k", "Today", WK.good],
    ["46", "$140k", "$38k", "$16k", 0.30, "$890k", "First $1M", WK.accent],
    ["65", "$240k", "$68k", "$26k", 0.98, "$3.05M", "Retire", WK.accent],
    ["70", "—", "$9k", "—", 1.0, "$3.21M", "Peak", WK.warm],
    ["73", "—", "$11k", "—", 0.94, "$3.0M", "RMDs", WK.warm],
    ["90", "—", "$4k", "—", 0.40, "$1.4M", "For life", WK.warm],
  ];
  const cols = ["Age", "Income", "Tax", "Saved", "Balance", ""];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 2.4fr 1.1fr", padding: "10px 14px", borderBottom: `2px solid ${WK.ink}`, background: WK.fill2 }}>
        {cols.map((c, i) => <span key={i} style={{ font: `700 13px ${WUI}`, color: WK.ink }}>{c}</span>)}
      </div>
      <div style={{ flex: 1 }}>
        {rows.map(([age, inc, tax, sav, bal, balL, tag, tc]) => (
          <div key={age} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 2.4fr 1.1fr", alignItems: "center",
            padding: "12px 14px", borderBottom: `1.5px solid ${WK.line}`, background: tag === "Retire" ? `${WK.accent}12` : "transparent" }}>
            <span style={{ font: `700 16px ${WMONO}`, color: tc }}>{age}</span>
            <span style={{ font: `400 14px ${WMONO}`, color: WK.mut }}>{inc}</span>
            <span style={{ font: `400 14px ${WMONO}`, color: WK.mut }}>{tax}</span>
            <span style={{ font: `400 14px ${WMONO}`, color: WK.mut }}>{sav}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 16 }}>
              <span style={{ flex: 1, height: 14, borderRadius: 4, background: WK.fill, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${bal * 100}%`, background: Number(age) >= 65 ? WK.warm : WK.good, opacity: 0.8 }} />
              </span>
              <span style={{ font: `700 13px ${WMONO}`, color: WK.ink, width: 52, textAlign: "right" }}>{balL}</span>
            </span>
            <WChip active accent={tc} dot={false}>{tag}</WChip>
          </div>
        ))}
      </div>
      <div style={{ padding: "9px 14px", borderTop: `2px solid ${WK.ink}`, background: WK.fill2, display: "flex", alignItems: "center" }}>
        <span style={{ font: `400 13px ${WUI}`, color: WK.faint }}>key rows · 56 years total</span>
        <span style={{ flex: 1 }} /><WThread>change assumptions</WThread>
      </div>
    </div>
  );
}

// ── NumCombined: pinned banner + tabbed body ────────────────────────────────
function NumCombined() {
  const [tab, setTab] = React.useState("statement");
  const tabs = [["statement", "Statement"], ["yearly", "Year by year"], ["flow", "Money flow"]];
  return (
    <WScreen title="The numbers · COMBINED — banner + tabs" w={1340} h={900}>
      <WNav active="The numbers" />
      <NumValueBanner />
      {/* tab strip */}
      <div style={{ display: "flex", gap: 3, margin: "16px 0 14px", padding: 4, borderRadius: 11, background: WK.fill, alignSelf: "flex-start" }}>
        {tabs.map(([k, l]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              background: on ? WK.card : "transparent", boxShadow: on ? "1.5px 1.5px 0 rgba(58,53,45,0.10)" : "none",
              font: `${on ? 700 : 400} 16px ${WUI}`, color: on ? WK.ink : WK.mut }}>{l}</button>
          );
        })}
      </div>
      {/* body */}
      <WCard style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {tab === "statement" && <StatementBody withBars />}
        {tab === "yearly" && <YearlyBodyCompact />}
        {tab === "flow" && <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0 }}><SankeyFlow /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <WChip active accent={WK.good}>71% take-home</WChip>
            <WChip accent={WK.line2}>18% tax</WChip>
            <WChip active accent={WK.warm}>11% invested</WChip>
            <span style={{ flex: 1 }} /><WThread>see the tax math</WThread>
          </div>
        </div>}
      </WCard>
      <WAnno dir="left" style={{ marginTop: 12 }}>One page, three depths. Calm Statement greets everyone (now with the proportion bars woven in); the engine's value is always pinned on top; Year-by-year and Money-flow are a tab away for those who want them. ← try the tabs</WAnno>
    </WScreen>
  );
}

// ── NumStatementBars: the statement variant with bars (standalone, for #3 slot) ──
function NumStatementBars() {
  return (
    <WScreen title="The numbers · P4+ — Statement with bars" w={1340} h={880}>
      <WNav active="The numbers" />
      <WHead eyebrow="Premium direction · editorial + visual" title="Your plan, on the record."
        sub="The private-wealth statement — now with the proportion bars from the simple version woven into each column, so every total also reads at a glance." />
      <WCard style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <StatementBody withBars />
      </WCard>
    </WScreen>
  );
}

Object.assign(window, { NumCombined, NumStatementBars, NumValueBanner, StatementBody });
