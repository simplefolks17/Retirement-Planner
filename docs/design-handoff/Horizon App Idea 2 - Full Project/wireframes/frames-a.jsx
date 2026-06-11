// frames-a.jsx — Direction A · The Check-In
// Answer-first, no chrome. Conversational first-run. Very aggressive disclosure.

// ── reusable spec card (A-prefixed to avoid global collisions) ──
function ASpecRow({ k, children }) {
  return (
    <div>
      <Eyebrow>{k}</Eyebrow>
      <div style={{ marginTop: 5 }}><Label s={13.5} c={W.text} w={500}>{children}</Label></div>
    </div>
  );
}
function ASpec() {
  return (
    <div style={{ width: 470, height: 840, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${W.good}22`, border: `1px solid ${W.good}66`, color: W.good, font: `700 18px/38px ${MONO}`, textAlign: "center" }}>A</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>The Check-In</div>
          <Label s={12} c={W.good} style={{ marginTop: 3 }}>Answer-first · very aggressive disclosure</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={22}>No tabs, no chrome. The app opens as a single human verdict, with the whole plan folded into a short story you open only when curious. Built for a 2-minute check-in.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
        <ASpecRow k="Navigation">None. One scrolling narrative — verdict, then 3 collapsible story cards. Depth opens in place.</ASpecRow>
        <ASpecRow k="First run">A conversation. One friendly question per screen, smart defaults, an “I’m not sure” on every step.</ASpecRow>
        <ASpecRow k="Input ↔ output">The page is pure result. Editing happens in a slide-over sheet — you never see inputs and outputs at once.</ASpecRow>
        <ASpecRow k="Best for">The returning user who just wants to know “am I still OK?” and get back to life.</ASpecRow>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>Directly solves</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {["#1 Scroll", "#2 Mixed I/O", "#3 No start", "#5 Lost context"].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
    </div>
  );
}

// ── conversational onboarding (phone) ──
function AOnboardQ({ step, total, eyebrow, question, body, children, cta }) {
  return (
    <Phone>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "8px 26px 26px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 30 }}>
          {Array.from({ length: total }).map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i < step ? W.good : W.line }} />)}
        </div>
        <Eyebrow c={W.faint}>{eyebrow}</Eyebrow>
        <div style={{ height: 14 }} />
        <div style={{ font: `600 27px/1.25 ${FONT}`, color: W.text, letterSpacing: "-0.02em", textWrap: "balance" }}>{question}</div>
        {body && <div style={{ marginTop: 12 }}><Label s={14} c={W.mut}>{body}</Label></div>}
        <div style={{ height: 28 }} />
        {children}
        <div style={{ flex: 1 }} />
        <Btn kind="solid" accent={W.good} full>{cta}</Btn>
        <div style={{ textAlign: "center", marginTop: 14 }}><Label s={12.5} c={W.faint}>I’m not sure — use a smart default</Label></div>
      </div>
    </Phone>
  );
}
function AOnboard1() {
  return (
    <AOnboardQ step={2} total={6} eyebrow="Step 2 of 6 · about you" question="What do you earn before taxes?" body="Roughly is fine. We’ll handle the tax math for you." cta="Continue">
      <div style={{ background: W.panel, border: `1px solid ${W.line2}`, borderRadius: 12, padding: "18px 18px" }}>
        <Label s={11.5} c={W.mut} mb={8}>Annual income</Label>
        <div style={{ font: `500 30px/1 ${MONO}`, color: W.text }}>$100,000</div>
        <div style={{ marginTop: 18 }}><Slider label="" val="" pct={36} accent={W.good} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <Label s={10} c={W.faint}>$20k</Label><Label s={10} c={W.faint}>$500k</Label>
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", background: `${W.cool}12`, border: `1px solid ${W.cool}33`, borderRadius: 10 }}>
        <Dot c={W.cool} s={7} />
        <Label s={11.5} c={W.mut}>We’ll quietly figure out your take-home, deductions & bracket.</Label>
      </div>
    </AOnboardQ>
  );
}
function AOnboard2() {
  return (
    <AOnboardQ step={4} total={6} eyebrow="Step 4 of 6 · your habits" question="Does your 401(k) come out before taxes?" body="Check a recent paycheck if you’re not sure — or just skip it." cta="Continue">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[["Yes — before taxes", "Traditional. Lowers today’s tax bill.", true], ["No — after taxes", "Roth. Grows tax-free for later.", false], ["I’m not sure", "We’ll assume the most common setup.", false]].map(([t, d, on], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 16px", borderRadius: 12, border: `1px solid ${on ? W.good : W.line}`, background: on ? `${W.good}10` : W.panel }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${on ? W.good : W.line2}`, flexShrink: 0, position: "relative" }}>{on && <div style={{ position: "absolute", inset: 3, borderRadius: 999, background: W.good }} />}</div>
            <div>
              <Label s={14.5} c={W.text} w={600}>{t}</Label>
              <Label s={12} c={W.mut} style={{ marginTop: 2 }}>{d}</Label>
            </div>
          </div>
        ))}
      </div>
    </AOnboardQ>
  );
}

// ── story card (collapsible result row) ──
function AStory({ title, summary, accent = W.line2, open = false, children }) {
  return (
    <div style={{ background: W.panel, border: `1px solid ${open ? W.line2 : W.line}`, borderRadius: 14, padding: open ? "22px 24px" : "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: accent, opacity: 0.55, minHeight: 38 }} />
        <div style={{ flex: 1 }}>
          <Label s={16} c={W.text} w={600} mb={5}>{title}</Label>
          <Label s={13.5} c={W.mut}>{summary}</Label>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={W.faint} strokeWidth="1.8" style={{ transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}><path d="M4 6l4 4 4-4" /></svg>
      </div>
      {open && children && <div style={{ marginTop: 20, paddingLeft: 22 }}>{children}</div>}
    </div>
  );
}

function ATopBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: W.good }} />
        <Label s={13} c={W.mut} w={600} ls="0.02em">Your plan</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Btn>Edit plan</Btn>
        <span style={{ width: 30, height: 30, borderRadius: 999, background: W.panel2, border: `1px solid ${W.line2}` }} />
      </div>
    </div>
  );
}

function AHome() {
  return (
    <Browser url="myplan.app">
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 720, maxWidth: "100%", padding: "0 24px" }}>
          <ATopBar />
          <div style={{ height: 26 }} />
          <Eyebrow c={W.faint}>Tuesday check-in</Eyebrow>
          <div style={{ height: 18 }} />
          <Verdict status="good" big headline="You’re on track to retire at 65." sub="If today holds, you’ll have about $3.1M — roughly $8,200 a month for life, comfortably past 90." />
          <div style={{ height: 18 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, maxWidth: 560 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: W.line, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: 6, width: "78%", borderRadius: 3, background: W.good, opacity: 0.8 }} />
            </div>
            <Label s={12} c={W.mut}>78% to your goal</Label>
          </div>
          <div style={{ height: 34 }} />
          <Label s={11.5} c={W.faint} mb={14} ls="0.04em" w={600}>WHEN YOU’RE READY, THE DETAILS</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <AStory title="Money in & out" accent={W.good} summary="You keep about $2,140 every month after taxes and living costs — and you’re saving 41% of your take-home." />
            <AStory title="What your money’s doing" accent={W.cool} summary="Spread across your 401(k), Roth, HSA and brokerage — projected to reach $3.1M by age 65." />
            <AStory title="The decades ahead" accent={ACCT.hsa} summary="Covers ~$8,200/mo through age 90, including health costs in the years before Medicare." />
          </div>
          <div style={{ height: 24 }} />
          <Label s={11} c={W.faint}>Updated from your March numbers · Illustrative only, not financial advice</Label>
        </div>
      </div>
    </Browser>
  );
}

function AHomePhone() {
  return (
    <Phone>
      <div style={{ position: "absolute", inset: 0, padding: "4px 22px 22px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: W.good }} /><Label s={12} c={W.mut} w={600}>Your plan</Label></div>
          <span style={{ width: 28, height: 28, borderRadius: 999, background: W.panel2, border: `1px solid ${W.line2}` }} />
        </div>
        <Eyebrow c={W.faint}>Tuesday check-in</Eyebrow>
        <div style={{ height: 14 }} />
        <Verdict status="good" headline="You’re on track to retire at 65." sub="~$3.1M by 65 — about $8,200/mo, past 90." />
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: W.line, position: "relative" }}><div style={{ position: "absolute", left: 0, top: 0, height: 6, width: "78%", borderRadius: 3, background: W.good, opacity: 0.8 }} /></div>
          <Label s={11} c={W.mut}>78%</Label>
        </div>
        <div style={{ height: 26 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {[["Money in & out", "$2,140 left each month · saving 41%", W.good], ["What your money’s doing", "4 accounts → $3.1M by 65", W.cool], ["The decades ahead", "$8,200/mo through 90", ACCT.hsa]].map(([t, s, a], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, background: W.panel, border: `1px solid ${W.line}`, borderRadius: 13, padding: "16px 16px" }}>
              <div style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: a, opacity: 0.55 }} />
              <div style={{ flex: 1 }}><Label s={14} c={W.text} w={600} mb={3}>{t}</Label><Label s={12} c={W.mut}>{s}</Label></div>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke={W.faint} strokeWidth="1.8"><path d="M6 4l4 4-4 4" /></svg>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "center" }}><Btn kind="outline">Edit my plan</Btn></div>
      </div>
    </Phone>
  );
}

// ── expanded story + edit sheet (I/O separation) ──
function AExpanded() {
  return (
    <Browser url="myplan.app">
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 720, maxWidth: "100%", padding: "0 24px", filter: "saturate(0.9)" }}>
          <ATopBar />
          <div style={{ height: 20 }} />
          <Verdict status="good" headline="You’re on track to retire at 65." />
          <div style={{ height: 26 }} />
          <Label s={11.5} c={W.faint} mb={14} ls="0.04em" w={600}>WHEN YOU’RE READY, THE DETAILS</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <AStory title="Money in & out" accent={W.good} open summary="You keep about $2,140 every month after taxes and living costs.">
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {[["Take-home pay", "$6,180 / mo", W.text], ["Living costs", "− $4,040 / mo", W.mut], ["Into your future", "$2,140 / mo", W.good]].map(([a, b, c], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 11, borderBottom: i < 2 ? `1px solid ${W.line}` : "none" }}>
                    <Label s={13.5} c={W.mut}>{a}</Label><span style={{ font: `500 15px/1 ${MONO}`, color: c }}>{b}</span>
                  </div>
                ))}
                <div style={{ marginTop: 4 }}><Label s={12.5} c={W.faint}>That’s 41% of your take-home heading toward retirement — well above the 15% rule of thumb.</Label></div>
              </div>
            </AStory>
            <AStory title="What your money’s doing" accent={W.cool} summary="Projected to reach $3.1M by age 65." />
            <AStory title="The decades ahead" accent={ACCT.hsa} summary="Covers ~$8,200/mo through age 90." />
          </div>
        </div>
      </div>
      {/* dim + slide-over edit sheet */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(6,8,11,0.55)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 380, background: W.panel, borderLeft: `1px solid ${W.line2}`, boxShadow: "-20px 0 60px rgba(0,0,0,.5)", padding: 26, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Label s={16} c={W.text} w={600}>Edit · Money in & out</Label>
          <span style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${W.line2}`, color: W.mut, font: `400 16px/24px ${FONT}`, textAlign: "center" }}>×</span>
        </div>
        <Label s={12} c={W.faint} mb={22}>Change these — the page updates when you’re done.</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Slider label="Income before taxes" val="$100,000" pct={36} accent={W.good} />
          <Slider label="Monthly living costs" val="$4,040" pct={48} accent={W.warn} />
          <Slider label="Save this share of surplus" val="50%" pct={50} accent={W.good} />
          <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 18 }}>
            <Label s={11.5} c={W.mut} mb={10}>Filing status</Label>
            <div style={{ display: "flex", gap: 8 }}><Chip active accent={W.good}>Single</Chip><Chip>Married</Chip><Chip>Head of HH</Chip></div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 10 }}><Btn kind="solid" accent={W.good} full>Update plan</Btn></div>
      </div>
      <Pin n={1} top={70} left={300} />
      <Pin n={2} top={70} right={356} />
    </Browser>
  );
}

// ── deep screen: plain-language Roth conversion "what if" ──
function ADeep() {
  return (
    <Browser url="myplan.app/ideas">
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 720, maxWidth: "100%", padding: "0 24px" }}>
          <ATopBar />
          <div style={{ height: 18 }} />
          <Eyebrow c={W.faint}>An idea for you · 1 of 3</Eyebrow>
          <div style={{ height: 14 }} />
          <div style={{ font: `600 30px/1.2 ${FONT}`, color: W.text, letterSpacing: "-0.02em", maxWidth: 600, textWrap: "balance" }}>There’s a quiet window to lower your lifetime taxes.</div>
          <div style={{ height: 22 }} />
          <Panel p={24} style={{ borderColor: `${W.good}44`, background: `${W.good}0c` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}><Dot c={W.good} /><Label s={12} c={W.good} w={600}>What we’d suggest</Label></div>
            <Label s={19} c={W.text} w={600} mb={12}>Move about $20,000 a year from your 401(k) into your Roth, for the 6 years after you retire.</Label>
            <Label s={14} c={W.mut}>You’d pay roughly <span style={{ color: W.text, fontFamily: MONO }}>$4,400</span> in tax now — to avoid about <span style={{ color: W.good, fontFamily: MONO }}>$31,000</span> later, when withdrawals would be taxed higher.</Label>
          </Panel>
          <div style={{ height: 16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Panel p={20}><Eyebrow c={W.faint}>Doing nothing</Eyebrow><div style={{ marginTop: 10 }}><Num s={26} c={W.mut}>$612k</Num></div><Label s={12} c={W.faint} style={{ marginTop: 4 }}>lifetime taxes</Label></Panel>
            <Panel p={20} style={{ borderColor: `${W.good}44` }}><Eyebrow c={W.good}>With the conversion</Eyebrow><div style={{ marginTop: 10 }}><Num s={26} c={W.good}>$581k</Num></div><Label s={12} c={W.faint} style={{ marginTop: 4 }}>lifetime taxes · save $31k</Label></Panel>
          </div>
          <div style={{ height: 16 }} />
          {/* conversion window strip */}
          <Panel p={20}>
            <Label s={12} c={W.mut} mb={14}>The window — between retiring and required withdrawals</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {["65", "66", "67", "68", "69", "70", "71"].map((y, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 30, borderRadius: 5, background: i < 6 ? `${W.good}33` : W.line, border: `1px solid ${i < 6 ? W.good + "66" : W.line2}` }} />
                  <Label s={10} c={W.faint} style={{ marginTop: 5 }}>{y}</Label>
                </div>
              ))}
            </div>
          </Panel>
          <div style={{ height: 16 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", border: `1px solid ${W.line}`, borderRadius: 11 }}>
            <Label s={13} c={W.mut}>Show me the math</Label>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={W.faint} strokeWidth="1.8"><path d="M4 6l4 4 4-4" /></svg>
          </div>
        </div>
      </div>
    </Browser>
  );
}

Object.assign(window, { ASpec, AOnboard1, AOnboard2, AHome, AHomePhone, AExpanded, ADeep });
