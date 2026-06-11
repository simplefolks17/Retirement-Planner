// wire-onboarding.jsx — three onboarding entry frameworks (low-fi).
// A · Two answers   B · Guided steps   C · Single-scroll live plan
// Uses wire-kit.jsx primitives (load first).

// ════════════════════════════════════════════════════════════════════════════
//  A · TWO ANSWERS — the brief's ideal. Ask the least, show a plan instantly.
// ════════════════════════════════════════════════════════════════════════════
function OnbTwoAnswers() {
  return (
    <WScreen title="Onboarding · A — Two answers" w={1180} h={760}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {/* faint plan preview behind, to promise the payoff */}
        <div style={{ position: "absolute", inset: "auto 40px 30px 40px", opacity: 0.28, pointerEvents: "none" }}>
          <WArcSketch h={150} stops={false} label="" />
        </div>
        <div style={{ position: "relative", width: 520, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <div>
            <div style={{ font: `700 40px ${WSKETCH}`, color: WK.ink, lineHeight: 1.05 }}>Two answers. One plan.</div>
            <div style={{ font: `400 17px ${WUI}`, color: WK.mut, marginTop: 8, textWrap: "pretty" }}>
              Tell us where you stand today — we'll build the whole picture, then you nudge it.</div>
          </div>
          <WCard style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
            <WStepper label="How old are you?" value="34" hint="we'll map from today to 90" />
            <WStepper label="What do you earn a year?" value="$100,000" accent={WK.good} hint="before tax — rough is fine" />
            <WBtn primary w="100%">Show my plan  →</WBtn>
          </WCard>
          <div style={{ font: `400 14px ${WUI}`, color: WK.faint }}>Everything else is smart-defaulted. Fine-tune it all later.</div>
        </div>
        <WAnno dir="right" style={{ position: "absolute", right: 26, top: 60, maxWidth: 200 }}>
          Lowest-friction door. Defers all ~40 inputs to the Shape-it drawer on the Plan.
        </WAnno>
        <WAnno dir="down" style={{ position: "absolute", left: 40, bottom: 92, maxWidth: 220 }}>
          A ghost of the Arc previews the payoff while they type.
        </WAnno>
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  B · GUIDED STEPS — a short 5-step wizard, one question at a time.
// ════════════════════════════════════════════════════════════════════════════
function OnbGuided() {
  const steps = ["Age", "Income", "Saved", "Retire at", "Goal"];
  const cur = 2; // showing step 3 "Saved"
  return (
    <WScreen title="Onboarding · B — Guided steps" w={1180} h={760}>
      <div style={{ flex: 1, display: "flex", gap: 0 }}>
        {/* left rail — progress */}
        <div style={{ width: 230, borderRight: `2px solid ${WK.line}`, paddingRight: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ font: `700 20px ${WSKETCH}`, color: WK.ink }}>Let's set the stage</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {steps.map((s, i) => {
              const done = i < cur, on = i === cur;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                    border: `2px solid ${on || done ? WK.accent : WK.line2}`,
                    background: done ? WK.accent : on ? `${WK.accent}22` : "transparent",
                    color: done ? "#fff" : WK.accent, font: `700 12px ${WUI}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : i + 1}</span>
                  <span style={{ font: `${on ? 700 : 400} 16px ${WUI}`, color: on ? WK.ink : done ? WK.mut : WK.faint }}>{s}</span>
                </div>
              );
            })}
          </div>
          <span style={{ flex: 1 }} />
          <WAnno style={{ maxWidth: 190 }}>Progress always visible — never feels open-ended. Each step is skippable → defaults.</WAnno>
        </div>
        {/* right — the single question */}
        <div style={{ flex: 1, paddingLeft: 34, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 560 }}>
          <div style={{ font: `700 15px ${WUI}`, color: WK.accent, marginBottom: 4 }}>STEP 3 OF 5</div>
          <div style={{ font: `700 34px ${WSKETCH}`, color: WK.ink, lineHeight: 1.08 }}>How much have you saved so far?</div>
          <div style={{ font: `400 15px ${WUI}`, color: WK.mut, marginTop: 6, marginBottom: 26, textWrap: "pretty" }}>
            401(k), IRAs, brokerage — a ballpark total is plenty. You can split it by account later.</div>
          <WStepper value="$165,000" accent={WK.good} w={340} />
          <div style={{ display: "flex", gap: 12, marginTop: 34, alignItems: "center" }}>
            <WBtn>←  Back</WBtn>
            <WBtn primary>Next  →</WBtn>
            <span style={{ font: `400 14px ${WUI}`, color: WK.faint, marginLeft: 4 }}>or  <u>skip</u></span>
          </div>
        </div>
      </div>
    </WScreen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  C · SINGLE-SCROLL LIVE — all inputs left, plan assembles live on the right.
// ════════════════════════════════════════════════════════════════════════════
function OnbLive() {
  const inputs = [
    ["Your age", "34", WK.ink],
    ["Annual income", "$100,000", WK.good],
    ["Saved so far", "$165,000", WK.good],
    ["Retire at", "65", WK.accent],
    ["Spend / mo in retirement", "$6,000", WK.ink],
  ];
  return (
    <WScreen title="Onboarding · C — Single scroll, live plan" w={1280} h={780}>
      <div style={{ flex: 1, display: "flex", gap: 26, minHeight: 0 }}>
        {/* left — stacked inputs */}
        <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
          <div>
            <div style={{ font: `700 28px ${WSKETCH}`, color: WK.ink }}>Build it as you go</div>
            <div style={{ font: `400 15px ${WUI}`, color: WK.mut, marginTop: 4 }}>Everything on one page. The plan updates as you answer.</div>
          </div>
          {inputs.map(([l, v, c]) => <WStepper key={l} label={l} value={v} accent={c} />)}
          <WChip dashed dot={false}>+ add a spouse, pension, Social Security…</WChip>
        </div>
        {/* right — live plan */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <WCard style={{ flex: 1, display: "flex", flexDirection: "column", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ font: `700 20px ${WSKETCH}`, color: WK.ink }}>On track to retire at 65</span>
              <WChip active accent={WK.good}>updating live</WChip>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}><WArcSketch h="100%" /></div>
          </WCard>
          <div style={{ display: "flex", gap: 12 }}>
            {[["Income for life", "$8,200/mo", WK.warm], ["Nest egg", "$3.1M", WK.ink], ["Left at 90", "$1.4M", WK.ink]].map(([l, v, c]) => (
              <WCard key={l} style={{ flex: 1, padding: 13 }}>
                <div style={{ font: `400 13px ${WUI}`, color: WK.mut, marginBottom: 6 }}>{l}</div>
                <div style={{ font: `700 19px ${WMONO}`, color: c }}>{v}</div>
              </WCard>
            ))}
          </div>
          <WAnno dir="left">Instant gratification — they see the Arc react to every keystroke. Highest engagement, most on-screen at once.</WAnno>
        </div>
      </div>
    </WScreen>
  );
}

Object.assign(window, { OnbTwoAnswers, OnbGuided, OnbLive });
