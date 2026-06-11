// frames-rec.jsx — ★ The recommended flow (the consolidation)
// Folds the agreed keepers into ONE product, not parallel options:
//   • C+ is the calm, honest, warm resting state (the default reading)
//   • D's delight is opt-in: what-if chips that reshape the plan live, the
//     someday moment, golden-hour warmth, numbers that count up
//   • E's depth is opt-in: every glance number carries a ƒ that unfolds its
//     own math, with one quiet "The numbers" door to the full statement
// Reuses the shared C+/D/E pieces on window — nothing is forked.
// Tagline rotation is intentionally slowed to 5s here (calmer with imagery).

const { useState: useStateR } = React;
const REC_ROT = 5000; // tagline rotation — 5s in the recommended build

// ── a glance stat that merges E's ƒ thread-pull with D's count-up ──
// `to` (number) animates on change; `staticVal` is for figures that don't move.
// `hasF` adds the quiet ƒ affordance; when `open`, `children` unfolds the math.
function RecStat({ label, to, fmt, staticVal, accent = W.text, warm = false, sub, hasF = false, open = false, onToggle, children }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: open ? W.panel2 : (warm ? `${CP_GOLD}08` : W.panel), border: `1px solid ${open ? `${CP_GOLD}44` : (warm ? `${CP_GOLD}33` : W.line)}`, borderRadius: 12, padding: 18, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Label s={11} c={W.mut} mb={0}>{label}</Label>
        {hasF && (
          <button onClick={onToggle} title="Show the math" style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${open ? CP_GOLD : W.line2}`, background: open ? `${CP_GOLD}14` : "transparent", color: open ? CP_GOLD : W.faint, font: `italic 600 11px/1 ${MONO}`, cursor: "pointer", flexShrink: 0 }}>ƒ</button>
        )}
      </div>
      <div style={{ marginTop: 9, whiteSpace: "nowrap" }}>
        <span style={{ font: `500 23px/1 ${MONO}`, color: accent, letterSpacing: "-0.01em" }}>
          {to != null ? <DCount to={to} fmt={fmt} /> : staticVal}
        </span>
      </div>
      <div style={{ marginTop: 5 }}><Label s={10.5} c={W.faint} mb={0}>{sub}</Label></div>
      {open && children && (
        <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${W.line}`, animation: "dFade .3s ease" }}>{children}</div>
      )}
    </div>
  );
}

// the unfolded derivations (static base figures — illustrative)
function RecTakeHomeMath() {
  return (
    <React.Fragment>
      <Eyebrow c={CP_GOLD}>How we got $78,091</Eyebrow>
      <div style={{ marginTop: 8 }}>
        <ERowMini k="Gross income" v="$100,000" />
        <ERowMini k="Pre-tax 401(k) + HSA" v="−$14,300" />
        <ERowMini k="Federal income tax" v="−$10,303" sub="eff. 12.0% · 22% marginal" />
        <ERowMini k="State (5.0%)" v="−$4,285" />
        <ERowMini k="FICA (7.65%)" v="−$7,321" />
      </div>
      <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: CP_GOLD }}>→</span>
        <Label s={11.5} c={W.text} w={600} mb={0}>The full breakdown lives in <span style={{ color: CP_GOLD }}>The numbers</span></Label>
      </div>
    </React.Fragment>
  );
}
function RecIncomeMath() {
  return (
    <React.Fragment>
      <Eyebrow c={CP_GOLD}>Why $8,200/mo holds for life</Eyebrow>
      <div style={{ marginTop: 8 }}>
        <ERowMini k="Net portfolio need / yr" v="$38,400" sub="expenses less Social Security" />
        <ERowMini k="Withdrawal rate" v="3.5%" sub="growth ≥ need → never depletes" />
        <ERowMini k="Left at 90" v="$1.4M" />
      </div>
      <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: CP_GOLD }}>→</span>
        <Label s={11.5} c={W.text} w={600} mb={0}>See drawdown & longevity in <span style={{ color: CP_GOLD }}>The numbers</span></Label>
      </div>
    </React.Fragment>
  );
}

// ── concept / rationale card ──
function RecRow({ k, kc = W.good, children }) {
  return <div><Eyebrow c={kc}>{k}</Eyebrow><div style={{ marginTop: 5 }}><Label s={13.5} c={W.text} w={500}>{children}</Label></div></div>;
}
function RecSpec() {
  return (
    <div style={{ width: 470, height: 900, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${CP_GOLD}22`, border: `1px solid ${CP_GOLD}66`, color: CP_GOLD, font: `700 18px/38px ${FONT}`, textAlign: "center" }}>★</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>The recommended flow</div>
          <Label s={12} c={CP_GOLD} style={{ marginTop: 3 }}>C+ baseline · D delight · E depth — one product</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={20}>The keepers, consolidated into a single build instead of three options. C+ is what you see; D and E are <span style={{ color: W.text }}>opt-in</span>, surfacing only when reached for.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <RecRow k="The resting state · C+" kc={W.good}>Calm, honest, warm. Two-answer onboarding into a real plan, the open-ended life timeline, Shape it / Read it per phase, on-track read carried by goal % + momentum.</RecRow>
        <RecRow k="Delight, opt-in · D" kc={CP_GOLD}>What-if chips reshape the numbers live; an "Adjust the details" drawer is the honest exit to full control; the someday moment; golden-hour warmth; numbers count up. Never the default noise.</RecRow>
        <RecRow k="Depth, opt-in · E" kc={CP_GOLD}>Every glance number carries a faint <span style={{ fontStyle: "italic", color: CP_GOLD }}>ƒ</span> that unfolds its own math inline; one quiet "The numbers" door to the full statement; the page reassures that nothing there needs action.</RecRow>
        <RecRow k="What we tuned" kc={W.mut}>Tagline rotation slowed to <span style={{ color: W.text }}>5s</span> (calmer alongside imagery). Chips and the deep drawer share one projection engine. Behind-pace users auto-fall-back to the adaptive lever.</RecRow>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>What each artboard shows</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {["Onboarding", "Home", "Edit a phase", "Someday", "The numbers", "On phone"].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
    </div>
  );
}

// ── the consolidated home ──
function RecHome() {
  const [sel, setSel] = useStateR("base");
  const [edit, setEdit] = useStateR(false);
  const [openF, setOpenF] = useStateR("take"); // which ƒ is unfolded; take-home open to demo the thread-pull
  const s = D_SCEN[sel];
  const tog = (id) => setOpenF((x) => (x === id ? null : id));
  return (
    <Browser url="horizon.app" w={1340} h={1000}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ETopBar />
        <div style={{ flex: 1, padding: "24px 36px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* hero — the calm C+ read */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, maxWidth: 620 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, alignSelf: "flex-start", padding: "6px 12px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}>
                <Dot c={W.good} /><span style={{ font: `600 12px/1 ${FONT}`, color: W.good, letterSpacing: "0.02em" }}>On track</span>
              </div>
              <div style={{ font: `600 28px/1.14 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>On track for retirement by {s.retire}.</div>
              <CpActivityLine size={25} interval={REC_ROT} />
              <div style={{ font: `400 13.5px/1.5 ${FONT}`, color: W.mut, maxWidth: 560 }}>Your choices so far are doing the work — and it stays covered well past 90. Play with the levers, or just read the road.</div>
            </div>
            <div style={{ width: 320, flexShrink: 0, paddingTop: 4 }}><ProgGoal /></div>
          </div>

          {/* opt-in delight — what-if chips + the honest exit to full control */}
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Label s={11.5} c={W.faint} w={600} ls="0.04em">PLAY WITH IT</Label>
            {D_ORDER.map((id) => <DScenChip key={id} id={id} active={sel === id} onClick={() => setSel(id)} />)}
            <span style={{ width: 1, height: 20, background: W.line2, margin: "0 2px" }} />
            <DEditChip onClick={() => setEdit(true)} />
          </div>

          <div style={{ height: 20 }} />
          <DHorizon retire={s.retire} />
          <div style={{ height: 26 }} />

          {/* AT A GLANCE — C+'s stat row, now carrying E's ƒ and D's count-up */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Label s={10.5} c={W.faint} w={700} ls="0.14em">AT A GLANCE — TAP <span style={{ fontStyle: "italic", color: CP_GOLD }}>ƒ</span> FOR THE MATH</Label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 999, border: `1px solid ${CP_GOLD}44`, background: `${CP_GOLD}10` }}>
              <span style={{ color: CP_GOLD, font: `600 11px/1 ${FONT}` }}>✦</span>
              <Label s={11} c={CP_GOLD} w={600} mb={0}>Customize what you see</Label>
              <span style={{ width: 1, height: 11, background: `${CP_GOLD}40` }} />
              <Label s={9.5} c={W.faint} w={700} ls="0.1em" mb={0}>PREMIUM</Label>
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <RecStat label="Take-home this year" staticVal="$78,091" accent={W.good} sub="after every tax" hasF open={openF === "take"} onToggle={() => tog("take")}>
              <RecTakeHomeMath />
            </RecStat>
            <RecStat label="You keep each month" to={s.keep} fmt={fmtMoney} accent={W.good} sub="of your take-home" />
            <RecStat label="Retire at" to={s.retire} fmt={fmtAge} accent={W.text} sub="on your terms" />
            <RecStat label="Income for life" to={s.life} fmt={fmtMoney} accent={CP_GOLD} warm sub="per month, never runs out" hasF open={openF === "life"} onToggle={() => tog("life")}>
              <RecIncomeMath />
            </RecStat>
          </div>

          {/* dynamic, warm explanation of the chosen scenario */}
          <div key={sel} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderRadius: 11, background: `${s.accent}0e`, border: `1px solid ${s.accent}33`, animation: "dFade .4s ease" }}>
            <span style={{ color: s.accent, font: `600 15px/1 ${FONT}` }}>↗</span>
            <Label s={12.5} c={W.mut} mb={0}>{s.note}</Label>
          </div>

          <div style={{ flex: 1 }} />
          <Label s={11.5} c={W.faint} mb={0}>Calm by default · what-ifs and the <span style={{ fontStyle: "italic", color: CP_GOLD }}>ƒ</span> math are opt-in · open <span style={{ color: CP_GOLD }}>The numbers</span> for the full statement · Illustrative only, not financial advice</Label>
        </div>
        {edit && <DEditor onClose={() => setEdit(false)} />}
      </div>
    </Browser>
  );
}

// ── onboarding (C+, the agreed two-answer start) at 5s rotation ──
function RecOnboard() {
  return <CpOnboard interval={REC_ROT} />;
}

// ── edit a phase · Shape it / Read it (C+), with the consolidated nav (The numbers door) ──
function RecPhase() {
  return <CpPhase topBar={<ETopBar />} />;
}

// ── the someday moment (D, unchanged) at 5s rotation ──
function RecMoment() {
  return <DMoment interval={REC_ROT} />;
}

// ── the numbers / full statement (E, unchanged) ──
function RecNumbers() {
  return <ELedger />;
}

// ── consolidated home, on phone ──
function RecPhone() {
  const [sel, setSel] = useStateR("base");
  const s = D_SCEN[sel];
  const phoneChips = ["base", "earlier", "more"];
  return (
    <Phone>
      <div style={{ position: "absolute", inset: 0, padding: "4px 20px 20px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 16, height: 16, borderRadius: 5, background: `${W.good}22`, border: `1px solid ${W.good}66`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: W.good }} /></span><Label s={12} c={W.text} w={700} mb={0}>Horizon</Label></div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: `1px solid ${W.good}55`, background: `${W.good}14` }}><Dot c={W.good} s={6} /><Label s={10.5} c={W.good} w={600} mb={0}>On track</Label></div>
        </div>
        <div style={{ font: `600 21px/1.2 ${FONT}`, color: W.text, letterSpacing: "-0.02em", textWrap: "balance" }}>Retirement by {s.retire} — covered for life.</div>
        <div style={{ marginTop: 7 }}><CpActivityLine size={14} interval={REC_ROT} /></div>
        <div style={{ height: 12 }} />
        <div style={{ height: 7, borderRadius: 5, background: W.line, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "78%", borderRadius: 5, background: `linear-gradient(90deg, ${W.good}, ${CP_GOLD})` }} />
        </div>
        <Label s={11} c={W.faint} style={{ marginTop: 8 }} mb={0}>78% of the way — and gaining ground.</Label>

        {/* what-if chips — horizontal */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, overflow: "hidden" }}>
          {phoneChips.map((id) => <DScenChip key={id} id={id} active={sel === id} onClick={() => setSel(id)} />)}
        </div>

        {/* glance stats — 2×2 with the ƒ affordance */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          {[
            ["You keep / mo", s.keep, fmtMoney, W.good, false, "of take-home"],
            ["Retire at", s.retire, fmtAge, W.text, false, "on your terms"],
            ["Take-home", null, null, W.good, true, "after every tax"],
            ["Income for life", s.life, fmtMoney, CP_GOLD, true, "never runs out"],
          ].map(([label, to, fmt, accent, hasF, sub], i) => (
            <div key={i} style={{ background: accent === CP_GOLD ? `${CP_GOLD}08` : W.panel, border: `1px solid ${accent === CP_GOLD ? `${CP_GOLD}33` : W.line}`, borderRadius: 11, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <Label s={10} c={W.mut} mb={0}>{label}</Label>
                {hasF && <span style={{ width: 16, height: 16, borderRadius: 5, border: `1px solid ${W.line2}`, color: W.faint, font: `italic 600 9px/14px ${MONO}`, textAlign: "center", flexShrink: 0 }}>ƒ</span>}
              </div>
              <div style={{ marginTop: 7, whiteSpace: "nowrap" }}>
                <span style={{ font: `500 18px/1 ${MONO}`, color: accent }}>{to != null ? <DCount to={to} fmt={fmt} /> : "$78,091"}</span>
              </div>
              <Label s={9.5} c={W.faint} style={{ marginTop: 4 }} mb={0}>{sub}</Label>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderRadius: 11, border: `1px solid ${W.line}`, background: W.panel }}>
          <Label s={11.5} c={W.mut} mb={0}>Tap <span style={{ fontStyle: "italic", color: CP_GOLD }}>ƒ</span> for the math</Label>
          <Label s={11.5} c={CP_GOLD} w={600} mb={0}>The numbers →</Label>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { RecSpec, RecHome, RecMoment, RecNumbers, RecPhone, RecStat, RecOnboard, RecPhase });
