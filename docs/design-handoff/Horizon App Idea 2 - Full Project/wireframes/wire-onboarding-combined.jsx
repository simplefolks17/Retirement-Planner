// wire-onboarding-combined.jsx — A+B hybrid (low-fi, interactive).
// Design A's ghost Arc builds behind the screen as each question is answered.
// Design B's 5 guided questions + progress pill gives structure.
// The ghost arc gains opacity, labels, and finally milestone pins as you progress.
// Load after wire-kit.jsx.

const OC_STEPS = [
  { q: "How old are you?",                   val: "34",       hint: "we'll map from today to 90",               tag: null },
  { q: "What do you earn a year?",            val: "$100,000", hint: "before tax — rough is fine",               tag: null },
  { q: "How much have you saved so far?",     val: "$165,000", hint: "all accounts combined, ballpark is fine",  tag: null },
  { q: "When would you like to retire?",      val: "65",       hint: "age, not year — you can change this later",tag: "on track" },
  { q: "How much to spend each month\nin retirement?", val: "$6,000", hint: "today's dollars — we adjust for inflation", tag: "plan complete" },
];

// arc opacity + feature unlocks per step
function arcStyleForStep(step) {
  // step 0-1: faint outline only
  // step 2: fill appears, still ghostly
  // step 3: more solid, milestone dots + "on track" headline
  // step 4: nearly full, "work optional" appears
  // 5 (done): full fidelity
  const ops = [0.10, 0.22, 0.38, 0.56, 0.74, 0.92];
  return ops[Math.min(step, 5)];
}

function OnbCombined() {
  const [step, setStep] = React.useState(0);
  const done = step >= OC_STEPS.length;
  const arcOp = arcStyleForStep(step);
  const showHeadline = step >= 3;
  const showTagline  = step >= 4;
  const showPins     = step >= 4;
  const cur = OC_STEPS[step] || OC_STEPS[OC_STEPS.length - 1];

  return (
    <WScreen title="Onboarding · Combined A + B" w={1280} h={780} pad={false}>
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>

        {/* ── ghost arc: builds behind the whole screen ── */}
        <div style={{ position: "absolute", inset: "20px 340px 60px 30px", opacity: arcOp,
          transition: "opacity .5s ease", pointerEvents: "none" }}>
          <WArcSketch h="100%" stops={showPins} label="" />
        </div>

        {/* ── emerging text overlaid on the arc area ── */}
        <div style={{ position: "absolute", left: 44, bottom: 110, transition: "opacity .4s", opacity: showHeadline ? 1 : 0, pointerEvents: "none" }}>
          {showHeadline && (
            <div style={{ font: `700 26px ${WSKETCH}`, color: WK.ink, lineHeight: 1.1 }}>
              On track to retire at <span style={{ color: WK.accent }}>65</span>.
            </div>
          )}
          {showTagline && (
            <div style={{ font: `400 16px ${WUI}`, color: WK.mut, marginTop: 6 }}>
              Work optional, <span style={{ color: WK.accent, fontWeight: 700 }}>golf course</span> mandatory.
            </div>
          )}
        </div>

        {/* ── right column: progress + question ── */}
        <div style={{ width: 380, marginLeft: "auto", flexShrink: 0, background: WK.card,
          borderLeft: `2px solid ${WK.line}`, display: "flex", flexDirection: "column", padding: "30px 28px", gap: 18, zIndex: 2 }}>

          {/* progress pills */}
          <div style={{ display: "flex", gap: 6 }}>
            {OC_STEPS.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 5, borderRadius: 999,
                background: i < step ? WK.accent : i === step ? `${WK.accent}55` : WK.line2 }} />
            ))}
          </div>
          <div style={{ font: `400 13px ${WUI}`, color: WK.faint }}>
            {done ? "all done" : `question ${step + 1} of ${OC_STEPS.length}`}
          </div>

          {done ? (
            /* ── completion state ── */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
              <div style={{ font: `700 28px ${WSKETCH}`, color: WK.ink, lineHeight: 1.1 }}>Your plan is ready.</div>
              <div style={{ font: `400 15px ${WUI}`, color: WK.mut, lineHeight: 1.5, textWrap: "pretty" }}>
                We've built your full arc. Tap anything to shape it — every number is adjustable.</div>
              {[["Income for life", "$8,200/mo", WK.warm], ["Retire at", "65", WK.ink], ["Left at 90", "$1.4M", WK.ink]].map(([l, v, c]) => (
                <WCard key={l} style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ font: `400 14px ${WUI}`, color: WK.mut }}>{l}</span>
                  <span style={{ font: `700 18px ${WMONO}`, color: c }}>{v}</span>
                </WCard>
              ))}
              <WBtn primary w="100%">See my plan →</WBtn>
            </div>
          ) : (
            /* ── active question ── */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ font: `700 28px ${WSKETCH}`, color: WK.ink, lineHeight: 1.15, whiteSpace: "pre-line", textWrap: "pretty" }}>
                {cur.q}
              </div>
              {cur.hint && <div style={{ font: `400 14px ${WUI}`, color: WK.mut }}>{cur.hint}</div>}
              <WStepper value={cur.val} accent={WK.accent} />
              {cur.tag && (
                <WChip active accent={WK.good}>{cur.tag === "on track" ? "✓ On track to retire at 65" : "✓ Plan complete"}</WChip>
              )}
              <span style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {step > 0 && <WBtn>← Back</WBtn>}
                <WBtn primary w={step > 0 ? "auto" : "100%"} onClick={() => setStep(s => s + 1)}>
                  {step === OC_STEPS.length - 1 ? "Build my plan →" : "Next →"}
                </WBtn>
                {step > 0 && <span style={{ font: `400 13px ${WUI}`, color: WK.faint }}><u>skip</u></span>}
              </div>
            </div>
          )}

          <div style={{ borderTop: `1.5px solid ${WK.line}`, paddingTop: 14 }}>
            <WAnno style={{ maxWidth: 320 }}>
              {step < 2 ? "Arc takes shape behind you as you type." :
               step < 4 ? "Plan comes alive — headline appears once retire age is known." :
               done ? "Complete: step right onto the Plan screen." :
               "Full arc visible. 'Work optional' tagline appears."}
            </WAnno>
          </div>
        </div>
      </div>
    </WScreen>
  );
}

Object.assign(window, { OnbCombined });
