// wire-ideas.jsx — the "Ideas" tab, all-in-one framework (low-fi).
// Holds: (1) app-surfaced suggestions, (2) a stackable scenario gallery,
// (3) a live comparison board (base vs stacked result).

function IdeasTab() {
  const suggestions = [
    ["Retire 2 years earlier", "Bump savings $250/mo and 63 is in reach.", WK.good],
    ["Your HSA is underused", "Maxing it adds ~$140k tax-free by 65.", WK.accent],
    ["Delay Social Security to 70", "+$640/mo for life, if you can bridge it.", WK.warm],
  ];
  // [label, sub, active, accent]
  const scenarios = [
    ["Today's plan", "on track, nothing changed", true, WK.good],
    ["Retire at 60", "5 yrs sooner", true, WK.warm],
    ["Save $300 more / mo", "retire a year early", true, WK.good],
    ["Big trip at 70", "one-off $40k year", false, WK.warm],
    ["Downsize the house at 68", "+$280k in", false, WK.accent],
    ["Help kids with college", "−$120k at 58", false, WK.accent],
  ];
  return (
    <WScreen title="Ideas — play with your future" w={1340} h={880}>
      <WNav active="Ideas" />
      <WHead title="What if…?" sub="Stack changes and watch the plan respond. Start from something we noticed, or invent your own." />

      {/* (1) app-surfaced suggestions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ font: `700 15px ${WUI}`, color: WK.accent }}>✦ Horizon noticed</span>
        <span style={{ flex: 1, height: 2, background: WK.line, borderRadius: 2 }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {suggestions.map(([t, s, c]) => (
          <WCard key={t} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: c }} />
            <div style={{ font: `700 17px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>{t}</div>
            <div style={{ font: `400 13.5px ${WUI}`, color: WK.mut, lineHeight: 1.3, textWrap: "pretty" }}>{s}</div>
            <span style={{ marginTop: 2 }}><WChip dashed dot={false}>try it →</WChip></span>
          </WCard>
        ))}
      </div>

      {/* split: gallery (left) | comparison board (right) */}
      <div style={{ flex: 1, display: "flex", gap: 22, minHeight: 0 }}>
        {/* (2) stackable scenario gallery */}
        <div style={{ flex: 1.25, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ font: `700 18px ${WSKETCH}`, color: WK.ink }}>Your what-ifs</span>
            <span style={{ font: `400 13px ${WUI}`, color: WK.mut }}>tap to stack · 3 active</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {scenarios.map(([t, s, on, c]) => (
              <WCard key={t} active={on} dashed={!on} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: 13 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                  border: `2px solid ${on ? c : WK.line2}`, background: on ? c : "transparent",
                  color: "#fff", font: `700 12px ${WUI}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ font: `700 16px ${WUI}`, color: WK.ink }}>{t}</div>
                  <div style={{ font: `400 13px ${WUI}`, color: WK.mut, marginTop: 2 }}>{s}</div>
                </span>
              </WCard>
            ))}
            <WCard dashed style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, gridColumn: "1 / -1" }}>
              <span style={{ font: `700 16px ${WUI}`, color: WK.accent }}>+ Create your own scenario</span>
            </WCard>
          </div>
          <WAnno dir="down" style={{ marginTop: 12 }}>Each card is a toggle. Active ones combine — the board on the right always shows the stacked result vs today.</WAnno>
        </div>

        {/* (3) comparison board */}
        <div style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <WCard style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, background: WK.fill2 }}>
            <div style={{ font: `700 19px ${WSKETCH}`, color: WK.ink, marginBottom: 3 }}>Stacked result</div>
            <div style={{ font: `400 13px ${WUI}`, color: WK.mut, marginBottom: 12 }}>
              <span style={{ borderBottom: `2px dashed ${WK.mut}` }}>today</span> vs <span style={{ color: WK.accent, fontWeight: 700, borderBottom: `2px solid ${WK.accent}` }}>your 3 changes</span>
            </div>
            <WCard style={{ padding: 10, marginBottom: 14 }}><WCompareSketch h={130} /></WCard>
            {[["Retire at", "65", "62", WK.warm, "−3 yrs"],
              ["Income for life", "$8,200", "$9,400", WK.good, "+$1,200"],
              ["Nest egg", "$3.1M", "$3.4M", WK.good, "+$300k"],
              ["Left at 90", "$1.4M", "$1.1M", WK.mut, "−$300k"]].map(([l, a, b, c, d]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1.5px solid ${WK.line}` }}>
                <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>{l}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: `400 14px ${WMONO}`, color: WK.faint, textDecoration: "line-through" }}>{a}</span>
                  <span style={{ font: `700 15px ${WMONO}`, color: WK.ink }}>{b}</span>
                  <span style={{ font: `700 12px ${WUI}`, color: c, minWidth: 56, textAlign: "right" }}>{d}</span>
                </span>
              </div>
            ))}
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <WBtn primary w="60%">Make this my plan</WBtn>
              <WBtn w="40%">Save</WBtn>
            </div>
          </WCard>
        </div>
      </div>
    </WScreen>
  );
}

Object.assign(window, { IdeasTab });
