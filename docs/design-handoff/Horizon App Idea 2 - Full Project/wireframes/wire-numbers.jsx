// wire-numbers.jsx — "The numbers" tab (trimmed + ƒ thread-pull) and the
// Someday-moment frameworks (with & without backdrop). Low-fi.

// ════════════════════════════════════════════════════════════════════════════
//  THE NUMBERS — three headline sections, one expanded via ƒ thread-pull
// ════════════════════════════════════════════════════════════════════════════
function NumbersTab() {
  return (
    <WScreen title="The numbers — the honest math" w={1340} h={880}>
      <WNav active="The numbers" />
      <WHead title="The honest math behind your plan"
        sub="Three things to know. Each is a plain-English headline — pull the ƒ thread on any of them to see exactly how it's derived." />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minHeight: 0, overflow: "hidden" }}>

        {/* SECTION 1 — expanded to demo the thread-pull */}
        <WCard style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: `700 15px ${WUI}`, color: WK.accent, marginBottom: 3 }}>1 · WHERE YOUR MONEY GOES</div>
              <div style={{ font: `700 24px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>You keep <span style={{ color: WK.good }}>$2,140</span> of every $3,000 you earn.</div>
            </div>
            <span style={{ marginTop: 4 }}><WThread open>see the breakdown</WThread></span>
          </div>
          <div style={{ marginTop: 14, marginBottom: 14 }}>
            <WSplitBar segs={[
              { f: 71, c: WK.good, l: "Take-home 71%" },
              { f: 18, c: WK.fill2, l: "Tax 18%" },
              { f: 11, c: WK.warm, l: "Saved 11%" },
            ]} />
          </div>
          {/* the pulled thread — derivation rows */}
          <div style={{ borderLeft: `3px solid ${WK.note}`, paddingLeft: 16, marginTop: 6, display: "flex", flexDirection: "column", gap: 7, animation: "wkFade .3s ease" }}>
            <div style={{ font: `400 13px ${WUI}`, color: WK.note, marginBottom: 2 }}>ƒ how we got 71%</div>
            {[["Gross income", "$100,000"],
              ["− Federal tax (eff. 13.4%)", "−$13,400"],
              ["− FICA (7.65%)", "−$7,650"],
              ["− State tax", "−$4,200"],
              ["− 401(k) + HSA", "−$13,000"],
              ["= Take-home", "$61,750", true]].map(([l, v, strong]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", borderTop: strong ? `1.5px solid ${WK.line2}` : "none", paddingTop: strong ? 6 : 0 }}>
                <span style={{ font: `400 14px ${WUI}`, color: strong ? WK.ink : WK.mut }}>{l}</span>
                <span style={{ font: `${strong ? 700 : 400} 14px ${WMONO}`, color: strong ? WK.good : WK.ink }}>{v}</span>
              </div>
            ))}
            <span style={{ font: `400 12.5px ${WUI}`, color: WK.faint, marginTop: 2 }}>Each line is itself pullable — e.g. ƒ how federal tax stacks across brackets.</span>
          </div>
        </WCard>

        {/* SECTION 2 — collapsed */}
        <WCard style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: `700 15px ${WUI}`, color: WK.accent, marginBottom: 3 }}>2 · WHAT YOU'RE BUILDING</div>
              <div style={{ font: `700 24px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>By 65 you'll have <span style={{ color: WK.ink }}>$3.1M</span> across four buckets.</div>
            </div>
            <WThread>see the buckets</WThread>
          </div>
          <div style={{ marginTop: 14 }}>
            <WSplitBar segs={[
              { f: 46, c: WK.good, l: "401(k) $1.4M" },
              { f: 24, c: WK.accent, l: "Roth $740k" },
              { f: 18, c: WK.warm, l: "Brokerage" },
              { f: 12, c: WK.fill2, l: "HSA" },
            ]} />
          </div>
        </WCard>

        {/* SECTION 3 — collapsed */}
        <WCard style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: `700 15px ${WUI}`, color: WK.accent, marginBottom: 3 }}>3 · INCOME FOR LIFE</div>
              <div style={{ font: `700 24px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>
                <span style={{ color: WK.warm }}>$8,200/mo</span> that never runs out — and $1.4M to spare at 90.</div>
            </div>
            <WThread>see the drawdown</WThread>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 22 }}>
            <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Social Security <span style={{ color: WK.ink, fontWeight: 700, fontFamily: WMONO }}>$2,800</span></span>
            <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Portfolio draw <span style={{ color: WK.ink, fontWeight: 700, fontFamily: WMONO }}>$5,400</span></span>
            <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Safe rate <span style={{ color: WK.ink, fontWeight: 700, fontFamily: WMONO }}>3.8%</span></span>
          </div>
        </WCard>

        <WAnno dir="left">Default view = the three bold headlines only. The math is always one pull away, and pulls nest — so it's calm by default, bottomless on demand.</WAnno>
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SOMEDAY MOMENT — with backdrop (left) and without (right)
// ════════════════════════════════════════════════════════════════════════════
function SomedayWith() {
  return (
    <WScreen title="Someday moment · WITH backdrop" w={760} h={560}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <WPlaceholder h="100%" label="auto / curated / your photo (Premium)" />
          <span style={{ position: "absolute", left: 14, bottom: 14, font: `700 16px ${WUI}`, color: WK.ink, background: WK.card, border: `2px solid ${WK.ink}`, borderRadius: 8, padding: "4px 10px" }}>✦ Fairway · auto</span>
        </div>
        <div>
          <div style={{ font: `700 26px ${WSKETCH}`, color: WK.ink }}>Your someday is already paid for.</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <span style={{ font: `700 26px ${WMONO}`, color: WK.warm }}>$8,200</span>
            <span style={{ font: `400 15px ${WUI}`, color: WK.mut }}>a month, for life.</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <WToggle on label="Backdrop on" />
          <span style={{ font: `400 13px ${WUI}`, color: WK.faint }}>· Auto · Pick one · Yours (Premium) · Off</span>
        </div>
      </div>
    </WScreen>
  );
}
function SomedayWithout() {
  return (
    <WScreen title="Someday moment · WITHOUT backdrop" w={760} h={560}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <div style={{ font: `700 15px ${WUI}`, color: WK.accent }}>AGE 67 · FUNDED</div>
        <div style={{ font: `700 32px ${WSKETCH}`, color: WK.ink, lineHeight: 1.1, maxWidth: 480 }}>Your someday is already paid for.</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ font: `700 38px ${WMONO}`, color: WK.warm }}>$8,200</span>
          <span style={{ font: `400 16px ${WUI}`, color: WK.mut }}>a month, for life — past 90.</span>
        </div>
        <div style={{ marginTop: 6, maxWidth: 460 }}><WLines n={2} w={["100%", "62%"]} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <WToggle on={false} label="Backdrop off — numbers only" />
        </div>
        <WAnno style={{ marginTop: 8, maxWidth: 420 }}>Same beat, type-led. Calmer, faster, zero image cost — better for the 50+ "just the facts" crowd.</WAnno>
      </div>
    </WScreen>
  );
}

Object.assign(window, { NumbersTab, SomedayWith, SomedayWithout });
