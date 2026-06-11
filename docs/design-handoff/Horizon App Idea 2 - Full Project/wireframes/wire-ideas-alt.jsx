// wire-ideas-alt.jsx — ALTERNATIVE paradigms for the "Ideas" page (low-fi).
// Deliberately NOT variations of the all-in-one stack-and-compare board.
// Four different core interaction models:
//   I1 · Ask Horizon   — conversational copilot (type a what-if, get an answer)
//   I2 · The Dial Lab  — direct-manipulation sandbox (drag knobs, watch one future)
//   I3 · Head-to-head  — pick TWO scenarios, full side-by-side duel
//   I4 · Life Timeline — drag life events onto your timeline, see cumulative effect
// Uses wire-kit.jsx primitives (load first).

// ════════════════════════════════════════════════════════════════════════════
//  I1 · ASK HORIZON — conversational. The what-if as a question you ask.
// ════════════════════════════════════════════════════════════════════════════
function IdeasAsk() {
  const prompts = ["Retire at 60?", "Buy a $600k cabin at 55?", "Help both kids with college?", "Work part-time from 62?"];
  return (
    <WScreen title="Ideas · I1 — Ask Horizon" w={1340} h={880}>
      <WNav active="Ideas" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <WHead title="Ask anything about your future." sub="Type a what-if in plain English. Horizon answers with the impact, the why, and a chance to keep it." />

        {/* the ask bar */}
        <WCard active style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", marginBottom: 10 }}>
          <span style={{ font: `700 20px ${WSKETCH}`, color: WK.accent }}>✦</span>
          <span style={{ flex: 1, font: `400 18px ${WUI}`, color: WK.ink }}>What if I retire at 60 instead of 65?</span>
          <span style={{ width: 2, height: 22, background: WK.accent, opacity: 0.6 }} />
          <WBtn primary>Ask</WBtn>
        </WCard>
        {/* suggested prompts */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ font: `400 14px ${WUI}`, color: WK.faint, alignSelf: "center" }}>try:</span>
          {prompts.map((p) => <WChip key={p} dashed dot={false}>{p}</WChip>)}
        </div>

        {/* answer thread */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
          {/* user bubble */}
          <div style={{ alignSelf: "flex-end", maxWidth: "60%", background: WK.fill2, border: `2px solid ${WK.line2}`, borderRadius: "12px 12px 4px 12px", padding: "10px 14px" }}>
            <span style={{ font: `400 16px ${WUI}`, color: WK.ink }}>What if I retire at 60 instead of 65?</span>
          </div>
          {/* answer card */}
          <WCard style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 12, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: `700 16px ${WSKETCH}`, color: WK.accent }}>✦ Horizon</span>
              <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>— here's what changes:</span>
            </div>
            <div style={{ font: `700 24px ${WSKETCH}`, color: WK.ink, lineHeight: 1.15 }}>
              You <span style={{ color: WK.good }}>can</span> — but you'd draw <span style={{ color: WK.warm }}>$1,100/mo less</span> for life.</div>
            {/* inline mini deltas */}
            <div style={{ display: "flex", gap: 22 }}>
              {[["Retire", "65", "60", WK.accent], ["Income/mo", "$8,200", "$7,100", WK.warm], ["Left at 90", "$1.4M", "$420k", WK.mut]].map(([l, a, b, c]) => (
                <span key={l} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ font: `400 12px ${WUI}`, color: WK.faint }}>{l}</span>
                  <span style={{ font: `400 14px ${WMONO}`, color: WK.faint }}><span style={{ textDecoration: "line-through" }}>{a}</span> → <span style={{ fontWeight: 700, color: c }}>{b}</span></span>
                </span>
              ))}
            </div>
            <WCard style={{ padding: 8 }}><WCompareSketch h={96} /></WCard>
            <div style={{ font: `400 14px ${WUI}`, color: WK.mut, lineHeight: 1.4, textWrap: "pretty" }}>
              The gap is mostly five fewer years of saving and five more of drawing. Bumping savings to <b style={{ color: WK.ink }}>$1,500/mo</b> now would close most of it.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <WBtn primary>Make this my plan</WBtn>
              <WBtn>Save scenario</WBtn>
              <WChip dashed dot={false}>↳ what if I also save more?</WChip>
            </div>
          </WCard>
        </div>
        <WAnno dir="left" style={{ marginTop: 10 }}>Lowest floor, highest ceiling. Feels like a financial advisor on call — discovery by conversation, follow-ups chain naturally. Most "premium / intelligent" energy.</WAnno>
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  I2 · THE DIAL LAB — direct manipulation. One future you sculpt with knobs.
// ════════════════════════════════════════════════════════════════════════════
function WDial({ label, value, sub, pos }) {
  // pos 0..1 along an arc — draw a knob
  const a = Math.PI * (1 - pos) * 0.8 + Math.PI * 0.1; // sweep
  const cx = 50, cy = 52, r = 38;
  const kx = cx + Math.cos(Math.PI - a + Math.PI * 0.0) * 0; // placeholder
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="110" height="78" viewBox="0 0 100 70">
        <path d="M 14 58 A 36 36 0 0 1 86 58" fill="none" stroke={WK.line} strokeWidth="6" strokeLinecap="round" />
        <path d="M 14 58 A 36 36 0 0 1 86 58" fill="none" stroke={WK.accent} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${pos * 113} 200`} />
        <circle cx={14 + pos * 72} cy={58 - Math.sin(pos * Math.PI) * 36} r="7" fill={WK.card} stroke={WK.accent} strokeWidth="3" />
      </svg>
      <div style={{ font: `700 18px ${WMONO}`, color: WK.ink, marginTop: -4 }}>{value}</div>
      <div style={{ font: `400 13px ${WUI}`, color: WK.mut }}>{label}</div>
      {sub && <div style={{ font: `400 11px ${WUI}`, color: WK.faint }}>{sub}</div>}
    </div>
  );
}
function IdeasDial() {
  return (
    <WScreen title="Ideas · I2 — The Dial Lab" w={1340} h={880}>
      <WNav active="Ideas" />
      <WHead title="Sculpt your future." sub="Mission control: turn the dials and watch a single future respond instantly. No saving, no stacking — just play." />
      <div style={{ flex: 1, display: "flex", gap: 22, minHeight: 0 }}>
        {/* big live outcome */}
        <WCard style={{ flex: 1.4, display: "flex", flexDirection: "column", padding: 20, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ font: `400 14px ${WUI}`, color: WK.mut }}>With these settings, you retire at</div>
              <div style={{ font: `700 52px ${WMONO}`, color: WK.accent, lineHeight: 1 }}>62</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Income for life</div>
              <div style={{ font: `700 34px ${WMONO}`, color: WK.warm, lineHeight: 1.1 }}>$7,900<span style={{ font: `400 16px ${WUI}` }}>/mo</span></div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, marginTop: 12 }}><WArcSketch h="100%" /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <WChip active accent={WK.good}>still on track</WChip>
            <span style={{ flex: 1 }} />
            <WBtn>Reset</WBtn><WBtn primary>Keep this future</WBtn>
          </div>
        </WCard>
        {/* the dials */}
        <div style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <WCard style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: 18 }}>
            <WDial label="Retire at" value="62" pos={0.55} />
            <WDial label="Save / mo" value="$1,500" pos={0.7} sub="+$300 vs now" />
            <WDial label="Spend / mo" value="$6,000" pos={0.5} />
            <WDial label="Risk" value="Balanced" pos={0.6} />
          </WCard>
          <WCard style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ font: `700 15px ${WSKETCH}`, color: WK.ink }}>Live reactions</span>
            {[["Nest egg at retirement", "$2.6M", WK.ink], ["Years covered", "to 94", WK.good], ["Tax this year", "−$1,200 saved", WK.good]].map(([l, v, c]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1.5px solid ${WK.line}`, paddingBottom: 6 }}>
                <span style={{ font: `400 14px ${WUI}`, color: WK.mut, whiteSpace: "nowrap" }}>{l}</span>
                <span style={{ font: `700 14px ${WMONO}`, color: c }}>{v}</span>
              </div>
            ))}
            <WAnno dir="down">Every dial recomputes the whole arc in real time. Tactile & addictive — but holds one scenario at a time.</WAnno>
          </WCard>
        </div>
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  I3 · HEAD-TO-HEAD — pick two scenarios, full-height duel.
// ════════════════════════════════════════════════════════════════════════════
function IdeasDuel() {
  const side = (name, tag, tagColor, rows, winner) => (
    <WCard active={winner} style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "14px 18px", borderBottom: `2px solid ${winner ? WK.accent : WK.ink}`, background: winner ? `${WK.accent}14` : WK.fill2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ font: `700 20px ${WSKETCH}`, color: WK.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        <WChip active accent={tagColor} dot={false}>{tag}</WChip>
      </div>
      <div style={{ padding: 16 }}><WArcSketch h={120} stops={false} label="" /></div>
      <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column" }}>
        {rows.map(([l, v, hi]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1.5px solid ${WK.line}` }}>
            <span style={{ font: `400 14px ${WUI}`, color: WK.mut, whiteSpace: "nowrap" }}>{l}</span>
            <span style={{ font: `700 18px ${WMONO}`, color: hi ? WK.good : WK.ink }}>{v}</span>
          </div>
        ))}
      </div>
    </WCard>
  );
  return (
    <WScreen title="Ideas · I3 — Head to head" w={1340} h={880}>
      <WNav active="Ideas" />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <WHead title="Put two futures in the ring." sub="Pick any two scenarios and compare them line for line. The stronger number on each row lights up." />
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <WChip accent={WK.line2} dot={false}>⇄ swap A</WChip>
          <WChip accent={WK.line2} dot={false}>⇄ swap B</WChip>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", gap: 16, minHeight: 0, alignItems: "stretch" }}>
        {side("Retire at 65", "today's plan", WK.good, [["Retire at", "65", false], ["Income / mo", "$8,200", true], ["Nest egg", "$3.1M", true], ["Left at 90", "$1.4M", true]], false)}
        {/* VS divider */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ width: 44, height: 44, borderRadius: 999, border: `2.5px solid ${WK.ink}`, background: WK.card, display: "inline-flex", alignItems: "center", justifyContent: "center", font: `700 18px ${WSKETCH}`, color: WK.accent }}>vs</span>
        </div>
        {side("Retire at 60 + save more", "what-if", WK.warm, [["Retire at", "60", true], ["Income / mo", "$7,900", false], ["Nest egg", "$2.6M", false], ["Left at 90", "$680k", false]], true)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <WAnno>Clearest way to make a single decision — A or B. Less for open-ended discovery, more for "help me choose."</WAnno>
        <span style={{ flex: 1 }} />
        <WBtn primary>Go with B →</WBtn>
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  I4 · LIFE TIMELINE — drag life events onto your years, see cumulative impact.
// ════════════════════════════════════════════════════════════════════════════
function IdeasTimeline() {
  const tray = [["🏡 Buy a home", WK.accent], ["🎓 Kid's college", WK.accent], ["✈️ Big trip", WK.warm], ["📉 Downsize", WK.good], ["💼 Part-time", WK.warm], ["🎁 Gift to kids", WK.accent]];
  // placed events: [label, leftPct, color]
  const placed = [["Buy a home", 22, WK.accent], ["Kid's college", 44, WK.accent], ["Retire", 64, WK.warm], ["Big trip", 76, WK.warm]];
  return (
    <WScreen title="Ideas · I4 — Life Timeline" w={1340} h={880}>
      <WNav active="Ideas" />
      <WHead title="Drop life onto the timeline." sub="Drag the moments you're planning for onto your years. Horizon folds each into the plan and shows whether you still make it." />

      {/* event tray */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ font: `400 14px ${WUI}`, color: WK.faint }}>drag in:</span>
        {tray.map(([l, c]) => <WChip key={l} accent={c} dot={false}>{l}</WChip>)}
      </div>

      {/* the timeline canvas */}
      <WCard style={{ flex: 1, padding: "26px 24px", display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        {/* arc behind */}
        <div style={{ position: "absolute", inset: "60px 24px 70px", opacity: 0.5, pointerEvents: "none" }}>
          <WArcSketch h="100%" stops={false} label="" />
        </div>
        {/* placed event pins */}
        <div style={{ position: "relative", flex: 1 }}>
          {placed.map(([l, left, c], i) => (
            <div key={l} style={{ position: "absolute", left: `${left}%`, top: `${12 + (i % 2) * 30}%`, transform: "translateX(-50%)", textAlign: "center" }}>
              <div style={{ font: `700 13px ${WUI}`, color: WK.ink, background: WK.card, border: `2px solid ${c}`, borderRadius: 8, padding: "4px 10px", boxShadow: "1.5px 1.5px 0 rgba(58,53,45,0.10)", whiteSpace: "nowrap" }}>{l}</div>
              <div style={{ width: 2, height: 26, background: c, margin: "0 auto" }} />
              <div style={{ width: 11, height: 11, borderRadius: 999, background: c, margin: "0 auto" }} />
            </div>
          ))}
        </div>
        {/* age axis */}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${WK.ink}`, paddingTop: 8 }}>
          {[34, 45, 55, 65, 75, 90].map((a) => <span key={a} style={{ font: `700 14px ${WMONO}`, color: WK.mut }}>{a}</span>)}
        </div>
      </WCard>

      {/* cumulative verdict */}
      <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
        <WCard style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 18px", flex: 1 }}>
          <span style={{ font: `700 16px ${WSKETCH}`, color: WK.ink }}>With all 4 events:</span>
          <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Retire <b style={{ color: WK.ink }}>still 65</b></span>
          <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Income <b style={{ color: WK.warm }}>$7,600/mo</b></span>
          <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>Left at 90 <b style={{ color: WK.good }}>$610k</b></span>
          <span style={{ flex: 1 }} />
          <WChip active accent={WK.good}>✓ still funded</WChip>
        </WCard>
        <WBtn primary>Save this life</WBtn>
      </div>
      <WAnno dir="left" style={{ marginTop: 8 }}>The most narrative & emotional — plans around a real life, not abstract levers. Great for couples/families; needs the most custom build.</WAnno>
    </WScreen>
  );
}

Object.assign(window, { IdeasAsk, IdeasDial, IdeasDuel, IdeasTimeline });
