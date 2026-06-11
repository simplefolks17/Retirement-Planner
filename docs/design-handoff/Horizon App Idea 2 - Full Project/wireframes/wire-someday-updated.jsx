// wire-someday-updated.jsx — Someday moment, updated (low-fi).
// Layout: full-bleed photo background, "Work optional. [Activity] mandatory."
// text as foreground hero copy. The activity is selectable.
// Also exports WorkOptionalTheme: a small showcase of the copy pattern
// appearing across the home + onboarding completion + someday screens.
// Load after wire-kit.jsx.

const ACTIVITIES = [
  { k:"golf",      l:"Golf course",  sub:"18 holes whenever you want." },
  { k:"travel",    l:"First class",  sub:"The trip you've been putting off." },
  { k:"hiking",    l:"The mountains",sub:"The trail has been waiting." },
  { k:"cooking",   l:"The kitchen",  sub:"Three-hour dinners, every night." },
  { k:"garden",    l:"The garden",   sub:"Time is finally on your side." },
  { k:"grandkids", l:"The grandkids",sub:"Fully present, zero distraction." },
];

// ── Someday moment: photo bg + text foreground ─────────────────────────────
function SomedayUpdated(){
  const [actIdx, setActIdx] = React.useState(0);
  const act = ACTIVITIES[actIdx];
  return (
    <WScreen title="Someday moment · updated (photo bg + foreground text)" w={1060} h={680} pad={false}>
      {/* full-bleed photo placeholder */}
      <div style={{ position:"absolute", inset:0, zIndex:0 }}>
        <WPlaceholder w="100%" h="100%" label={`thematic photo — ${act.l.toLowerCase()}, lifestyle, aspirational`}
          style={{ borderRadius:0, border:"none" }}/>
        {/* dark-to-transparent gradient overlay for text legibility */}
        <div style={{ position:"absolute", inset:0,
          background:"linear-gradient(135deg, rgba(30,22,16,.72) 0%, rgba(30,22,16,.28) 55%, rgba(30,22,16,.52) 100%)" }}/>
      </div>

      {/* foreground text — absolute over photo */}
      <div style={{ position:"absolute", inset:0, zIndex:1, display:"flex", flexDirection:"column",
        justifyContent:"space-between", padding:"32px 44px" }}>

        {/* top: logo + milestone pill */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ font:`700 18px ${WSKETCH}`, color:"rgba(255,255,255,.85)" }}>Horizon</span>
          <span style={{ font:`600 13px ${WUI}`, color:"rgba(255,255,255,.65)",
            border:"1.5px solid rgba(255,255,255,.30)", borderRadius:999, padding:"4px 14px" }}>
            Age 67 · funded
          </span>
        </div>

        {/* center: the big copy moment */}
        <div style={{ maxWidth:580 }}>
          <div style={{ font:`400 15px ${WUI}`, color:"rgba(255,255,255,.55)",
            letterSpacing:"0.10em", textTransform:"uppercase", marginBottom:12 }}>
            work optional.
          </div>
          <div style={{ font:`700 64px ${WSKETCH}`, color:"#ffffff", lineHeight:1.0,
            textShadow:"0 2px 18px rgba(0,0,0,.35)", marginBottom:4 }}>
            {act.l}
          </div>
          <div style={{ font:`700 64px ${WSKETCH}`, color:"rgba(255,255,255,.82)", lineHeight:1.0,
            textShadow:"0 2px 18px rgba(0,0,0,.35)", marginBottom:24 }}>
            mandatory.
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ font:`700 38px ${WMONO}`, color:"rgba(255,255,255,.95)",
              textShadow:"0 1px 10px rgba(0,0,0,.4)" }}>$8,200</span>
            <span style={{ font:`400 17px ${WUI}`, color:"rgba(255,255,255,.60)" }}>a month, for life.</span>
          </div>
          <div style={{ font:`400 15px ${WUI}`, color:"rgba(255,255,255,.46)", marginTop:8 }}>
            {act.sub}
          </div>
        </div>

        {/* bottom: activity selector + settings note */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ font:`400 13px ${WUI}`, color:"rgba(255,255,255,.45)" }}>your thing:</span>
          {ACTIVITIES.map((a,i) => (
            <button key={a.k} onClick={() => setActIdx(i)} style={{
              padding:"5px 13px", borderRadius:999, cursor:"pointer",
              border:`1.5px solid ${i===actIdx?"rgba(255,255,255,.75)":"rgba(255,255,255,.25)"}`,
              background:i===actIdx?"rgba(255,255,255,.18)":"transparent",
              font:`${i===actIdx?700:400} 13px ${WUI}`,
              color:i===actIdx?"rgba(255,255,255,.95)":"rgba(255,255,255,.50)"
            }}>{a.l}</button>
          ))}
          <span style={{ flex:1 }}/>
          <span style={{ font:`400 12px ${WUI}`, color:"rgba(255,255,255,.30)",
            border:"1px dashed rgba(255,255,255,.20)", borderRadius:999, padding:"4px 12px" }}>
            ← yours lives in Settings
          </span>
        </div>
      </div>
    </WScreen>
  );
}

// ── Work optional theme showcase ───────────────────────────────────────────
// Shows the copy pattern at three key moments so the theme feels consistent.
function WorkOptionalTheme(){
  return (
    <WScreen title="'Work optional, X mandatory' — theme across screens" w={1280} h={680}>
      <WHead eyebrow="design theme · runs through all three moments"
        title="One line. Three moments."
        sub="The 'work optional, X mandatory' copy appears at the plan screen, the onboarding completion, and the Someday moment — escalating in emotion each time."/>
      <div style={{ flex:1, display:"flex", gap:18, minHeight:0, alignItems:"stretch" }}>

        {/* 1 · Home screen */}
        <WCard style={{ flex:1, padding:18, display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ font:`700 12px ${WUI}`, color:WK.accent, letterSpacing:"0.08em", textTransform:"uppercase" }}>① plan screen · subdued</div>
          <div style={{ flex:1 }}><WArcSketch h={110} stops={false} label=""/></div>
          <div style={{ font:`700 22px ${WSKETCH}`, color:WK.ink }}>On track to retire at 65.</div>
          <div style={{ font:`400 15px ${WUI}`, color:WK.mut }}>
            Work optional, <span style={{ color:WK.accent, fontWeight:700 }}>golf course</span> mandatory.
          </div>
          <WAnno dir="down" style={{ maxWidth:220 }}>One line under the headline — calm, consistent, present every visit.</WAnno>
        </WCard>

        {/* 2 · Onboarding completion */}
        <WCard style={{ flex:1, padding:18, display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ font:`700 12px ${WUI}`, color:WK.accent, letterSpacing:"0.08em", textTransform:"uppercase" }}>② onboarding · reveal moment</div>
          <div style={{ font:`700 30px ${WSKETCH}`, color:WK.ink, lineHeight:1.1 }}>Your plan is ready.</div>
          <div style={{ font:`700 20px ${WSKETCH}`, color:WK.accent, marginTop:4 }}>
            Work optional.<br/>Golf course mandatory.
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:6 }}>
            <span style={{ font:`700 28px ${WMONO}`, color:WK.warm }}>$8,200</span>
            <span style={{ font:`400 15px ${WUI}`, color:WK.mut }}>/ month, for life</span>
          </div>
          <WBtn primary w="100%">See my arc →</WBtn>
          <WAnno dir="down" style={{ maxWidth:220 }}>Escalated: two separate lines, the accent carries the emotional weight. First time they see the payoff.</WAnno>
        </WCard>

        {/* 3 · Someday */}
        <WCard style={{ flex:1, padding:0, overflow:"hidden", position:"relative" }}>
          <div style={{ font:`700 12px ${WUI}`, color:WK.accent, letterSpacing:"0.08em", textTransform:"uppercase", padding:"14px 16px 0" }}>③ someday · full hero</div>
          <WPlaceholder h={180} label="thematic photo bg" style={{ borderRadius:0, border:"none", margin:"10px 0 0" }}/>
          <div style={{ padding:"14px 16px" }}>
            <div style={{ font:`400 13px ${WUI}`, color:WK.mut, letterSpacing:"0.07em", textTransform:"uppercase" }}>work optional.</div>
            <div style={{ font:`700 32px ${WSKETCH}`, color:WK.ink, lineHeight:1.0 }}>Golf course</div>
            <div style={{ font:`700 32px ${WSKETCH}`, color:WK.mut, lineHeight:1.0, marginBottom:10 }}>mandatory.</div>
            <div style={{ font:`700 24px ${WMONO}`, color:WK.warm }}>$8,200 <span style={{ font:`400 14px ${WUI}`, color:WK.mut }}>/mo, for life</span></div>
          </div>
          <WAnno dir="left" style={{ position:"absolute", right:14, bottom:14, maxWidth:150 }}>Full cinematic. The payoff is the whole screen.</WAnno>
        </WCard>
      </div>
    </WScreen>
  );
}

Object.assign(window, { SomedayUpdated, WorkOptionalTheme });
