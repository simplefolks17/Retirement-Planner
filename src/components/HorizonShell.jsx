// HorizonShell — Horizon UI shell (5-screen navigation).
// Additive: does not replace App.jsx — receives all computed values as props.
// Screens: Plan · Ideas · The numbers · Settings · Someday
// LAYOUT/STYLING ONLY — no calculation logic lives here.

import React, { useState, useEffect } from "react";
import { GhostArc } from "./ArcGraph.jsx";
import { PALETTES, HF, HM, HD, useTheme, safeGet, safeSet } from "../horizon/ThemeContext.jsx";
import ConfirmModal from "../horizon/ConfirmModal.jsx";
import PlanScreen    from "../horizon/screens/PlanScreen.jsx";
import IdeasScreen   from "../horizon/screens/IdeasScreen.jsx";
import NumbersScreen from "../horizon/screens/NumbersScreen.jsx";
import SomedayScreen from "../horizon/screens/SomedayScreen.jsx";
import SettingsScreen from "../horizon/screens/SettingsScreen.jsx";

// ── Small shared primitives (nav-only) ────────────────────────────────────────

function Logo({ t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: 18, height: 18, borderRadius: 6,
        background: `${t.good}22`, border: `1px solid ${t.good}55`,
        display: "inline-flex", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: t.good }} />
      </span>
      <span style={{ font: `700 14px ${HF}`, color: t.ink }}>Horizon</span>
    </div>
  );
}

function OnTrackPill({ t, isSustainable }) {
  const color = isSustainable ? t.good : t.warm;
  const label = isSustainable ? "On track" : "Needs attention";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 999,
      border: `1px solid ${color}55`, background: `${color}18`
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span style={{ font: `600 12px ${HF}`, color }}>{label}</span>
    </span>
  );
}

function TabBar({ t, tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {tabs.map(({ id, label }) => (
        <div key={id} onClick={() => onChange(id)}
          style={{
            padding: "6px 13px", borderRadius: 8, cursor: "pointer",
            background: active === id ? t.surf2 : "transparent",
            border: active === id ? `1px solid ${t.line2}` : "1px solid transparent"
          }}>
          <span style={{
            font: `${active === id ? 600 : 500} 12.5px ${HF}`,
            color: active === id ? t.ink : t.faint
          }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── ONBOARDING (first-run wizard) ─────────────────────────────────────────────

const OB_STEPS = [
  { q: "How old are you?",                             hint: "we'll map from today to 90",        field: "currentAge" },
  { q: "What do you earn a year?",                     hint: "before tax — rough is fine",        field: "currentIncome" },
  { q: "How much have you saved so far?",              hint: "all accounts combined, ballpark",   field: "totalSaved" },
  { q: "When would you like to retire?",               hint: "age, not year — easy to change",    field: "retirementAge" },
  { q: "How much to spend each month\nin retirement?", hint: "today's dollars",                   field: "monthlySpend" },
];

// Per-field increment size and [min, max] clamp
const OB_STEP_SIZES = {
  currentAge:    1,
  currentIncome: 5_000,
  totalSaved:    10_000,
  retirementAge: 1,
  monthlySpend:  100,
};
const OB_CLAMPS = {
  currentAge:    [18, 80],
  currentIncome: [10_000, 2_000_000],
  totalSaved:    [0, 10_000_000],
  retirementAge: [40, 90],
  monthlySpend:  [500, 50_000],
};

function fmtField(field, val) {
  switch (field) {
    case "currentAge":
    case "retirementAge": return String(val);
    case "currentIncome": return `$${(val / 1_000).toFixed(0)}k`;
    case "totalSaved":    return `$${(val / 1_000).toFixed(0)}k`;
    case "monthlySpend":  return `$${val.toLocaleString()}`;
    default: return String(val);
  }
}

function OnboardingScreen({ t, initialValues, onComplete, commitPlan }) {
  const [step, setStep]           = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  // Local numeric state for each question — updated by ± buttons
  const [vals, setVals] = useState({
    currentAge:    initialValues?.currentAge    ?? 34,
    currentIncome: initialValues?.currentIncome ?? 100_000,
    totalSaved:    initialValues?.totalSaved    ?? 165_000,
    retirementAge: initialValues?.retirementAge ?? 65,
    monthlySpend:  initialValues?.monthlySpend  ?? 6_000,
  });

  const done     = step >= OB_STEPS.length;
  const arcOp    = [0.08, 0.20, 0.36, 0.54, 0.72, 0.90][Math.min(step, 5)];
  const arcBlur  = [8,    5,    3,    1,    0,    0  ][Math.min(step, 5)];
  const cur      = OB_STEPS[Math.min(step, OB_STEPS.length - 1)];

  const adjust = (field, dir) => {
    const inc = OB_STEP_SIZES[field];
    const [lo, hi] = OB_CLAMPS[field];
    setVals(v => ({ ...v, [field]: Math.max(lo, Math.min(hi, v[field] + dir * inc)) }));
  };

  // Write the key retirement parameters back to App.jsx state
  const handleSave = () => {
    commitPlan({
      currentAge:    vals.currentAge,
      currentIncome: vals.currentIncome,
      retirementAge: vals.retirementAge,
      annualExpenses: vals.monthlySpend * 12,
    });
    onComplete();
  };

  const summaryStats = [
    ["Retire at",       String(vals.retirementAge),                        t.ink],
    ["Monthly income",  `$${vals.monthlySpend.toLocaleString()}/mo`,       t.warm],
    ["Savings today",   `$${(vals.totalSaved / 1_000).toFixed(0)}k`,       t.ink],
  ];

  const stepBtnStyle = {
    width: 36, height: 36, flexShrink: 0, borderRadius: 9,
    border: `1.5px solid ${t.line2}`, background: t.surf,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    font: `600 18px ${HF}`, color: t.accent, cursor: "pointer", userSelect: "none",
  };

  return (
    <div style={{
      width: "100%", height: "100%", background: t.bg, fontFamily: HF,
      display: "flex", position: "relative", overflow: "hidden"
    }}>
      {/* ghost arc that reveals as user progresses */}
      <div style={{ position: "absolute", inset: "24px 360px 60px 32px", pointerEvents: "none" }}>
        <GhostArc t={t} opacity={arcOp} blur={arcBlur} H={560} />
      </div>

      {/* emerging headline copies the App's real retirement age as they fill it in */}
      <div style={{
        position: "absolute", left: 44, bottom: 80,
        opacity: step >= 3 ? 1 : 0, transition: "opacity .5s", pointerEvents: "none"
      }}>
        <div style={{ font: `600 28px ${HF}`, color: t.ink, letterSpacing: "-0.02em" }}>
          On track to retire at{" "}
          <span style={{ color: t.accent }}>{vals.retirementAge}</span>.
        </div>
        {step >= 4 && (
          <div style={{ font: `400 16px ${HF}`, color: t.mut, marginTop: 6 }}>
            Work optional,{" "}
            <span style={{ color: t.accent, fontWeight: 600 }}>your thing</span> mandatory.
          </div>
        )}
      </div>

      {/* right panel */}
      <div style={{
        width: 360, marginLeft: "auto", flexShrink: 0, height: "100%",
        background: t.surf, borderLeft: `1px solid ${t.line}`,
        display: "flex", flexDirection: "column", padding: "36px 28px", gap: 20, zIndex: 2
      }}>
        <Logo t={t} />

        {/* progress pips */}
        <div style={{ display: "flex", gap: 5 }}>
          {OB_STEPS.map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 4, borderRadius: 999,
              background: i < step ? t.accent : i === step ? `${t.accent}44` : t.line,
              transition: "background .3s"
            }} />
          ))}
        </div>
        <div style={{ font: `400 12px ${HF}`, color: t.faint }}>
          {done ? "all done" : `question ${step + 1} of ${OB_STEPS.length}`}
        </div>

        {done ? (
          /* ── Summary + action buttons ── */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ font: `600 26px ${HF}`, color: t.ink, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Your plan is ready.
            </div>
            <div style={{ font: `600 17px ${HF}`, color: t.accent, lineHeight: 1.2 }}>
              Work optional.<br />Your thing mandatory.
            </div>
            {summaryStats.map(([l, v, c]) => (
              <div key={l} style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                padding: "12px 0", borderBottom: `1px solid ${t.line}`
              }}>
                <span style={{ font: `400 13px ${HF}`, color: t.mut }}>{l}</span>
                <span style={{ font: `600 18px ${HM}`, color: c }}>{v}</span>
              </div>
            ))}
            <span style={{ flex: 1 }} />
            {/* primary CTA: save answers to the model */}
            <div onClick={() => setShowConfirm(true)} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 20px", borderRadius: 12, background: t.accent, cursor: "pointer"
            }}>
              <span style={{ font: `600 15px ${HF}`, color: "#fff" }}>Save as my plan →</span>
            </div>
            {/* secondary: just enter the app without changing anything */}
            <div onClick={onComplete} style={{
              textAlign: "center", font: `400 13px ${HF}`, color: t.faint,
              cursor: "pointer", textDecoration: "underline"
            }}>
              Skip for now
            </div>
          </div>
        ) : (
          /* ── Per-step question + stepper ── */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{
              font: `600 26px ${HF}`, color: t.ink, letterSpacing: "-0.02em",
              lineHeight: 1.15, whiteSpace: "pre-line"
            }}>{cur.q}</div>
            <div style={{ font: `400 13px ${HF}`, color: t.mut }}>{cur.hint}</div>

            {/* stepper with live numeric state */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={stepBtnStyle} onClick={() => adjust(cur.field, -1)}>−</span>
              <div style={{
                flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${t.line2}`,
                background: t.bg, display: "flex", alignItems: "center", justifyContent: "center",
                font: `600 18px ${HM}`, color: t.ink
              }}>
                {fmtField(cur.field, vals[cur.field])}
              </div>
              <span style={stepBtnStyle} onClick={() => adjust(cur.field, +1)}>+</span>
            </div>

            <span style={{ flex: 1 }} />

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {step > 0 && (
                <div onClick={() => setStep(s => s - 1)} style={{
                  padding: "12px 18px", borderRadius: 11,
                  border: `1px solid ${t.line2}`, background: t.surf,
                  font: `500 14px ${HF}`, color: t.mut, cursor: "pointer"
                }}>← Back</div>
              )}
              <div onClick={() => setStep(s => s + 1)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                padding: "13px", borderRadius: 11, background: t.accent, cursor: "pointer"
              }}>
                <span style={{ font: `600 15px ${HF}`, color: "#fff" }}>
                  {step === OB_STEPS.length - 1 ? "Build my plan →" : "Next →"}
                </span>
              </div>
            </div>

            {/* skip at any point — just enters app with existing defaults */}
            <div onClick={onComplete} style={{
              font: `400 12px ${HF}`, color: t.faint, textAlign: "center",
              cursor: "pointer", textDecoration: "underline"
            }}>
              skip
            </div>
          </div>
        )}
      </div>

      {/* Confirm before writing back to App.jsx state */}
      {showConfirm && (
        <ConfirmModal
          t={t}
          title="Save your answers as your starting plan?"
          body={`Age ${vals.currentAge} · Retire at ${vals.retirementAge} · $${vals.monthlySpend.toLocaleString()}/mo`}
          confirmLabel="Yes, save my plan"
          onConfirm={handleSave}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

// ── MAIN SHELL ────────────────────────────────────────────────────────────────
const SCREENS = [
  { id: "plan",    label: "Plan" },
  { id: "ideas",   label: "Ideas" },
  { id: "numbers", label: "The numbers" },
  { id: "someday", label: "Someday" },
  { id: "settings",label: "Settings" },
];

export default function HorizonShell({ onShowClassic, ...props }) {
  const { t, arcStyle } = useTheme();
  const [screen, setScreen] = useState("plan");
  const [showOnboarding, setShowOnboarding] = useState(
    () => safeGet("hz-onboarded") !== "1"
  );

  const { isSustainable, retirementAge } = props;
  const glow = arcStyle === "glow";
  const strokeWidth = arcStyle === "vivid" ? 5 : 3;

  const [windowWidth, setWindowWidth] = useState(
    () => typeof window !== "undefined" ? window.innerWidth : 1200
  );
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = windowWidth < 640;

  const handleOnboardingComplete = () => {
    safeSet("hz-onboarded", "1");
    setShowOnboarding(false);
  };

  return (
    <div style={{
      width: "100%", minHeight: "100vh",
      background: t.bg, fontFamily: HF,
      display: "flex", flexDirection: "column",
    }}>
      {/* Google Fonts for Horizon typography */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&display=swap');
      `}</style>

      {showOnboarding ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <OnboardingScreen
            t={t}
            initialValues={{
              currentAge:    props.currentAge,
              currentIncome: props.currentIncome,
              totalSaved:    props.totalAtRet,
              retirementAge: retirementAge,
              monthlySpend:  Math.round((props.effectiveExpenses ?? 0) / 12),
            }}
            onComplete={handleOnboardingComplete}
            commitPlan={props.commitPlan}
          />
        </div>
      ) : (
        <>
          {/* top nav — full on desktop, slim on mobile */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: isMobile ? "10px 16px" : "12px 28px",
            borderBottom: `1px solid ${t.line}`,
            background: t.bg, flexShrink: 0,
          }}>
            <Logo t={t} />
            {!isMobile && <TabBar t={t} tabs={SCREENS} active={screen} onChange={setScreen} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {!isMobile && <OnTrackPill t={t} isSustainable={isSustainable} />}
              <button onClick={onShowClassic} style={{
                font: `400 11px ${HF}`, color: t.faint,
                background: "transparent", border: `1px solid ${t.line}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              }}>Classic view</button>
            </div>
          </div>

          {/* screen body — bottom-padded on mobile to clear tab bar */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
            paddingBottom: isMobile ? 60 : 0,
          }}>
            {screen === "plan"     && <PlanScreen    t={t} props={props} glow={glow} strokeWidth={strokeWidth} isMobile={isMobile} />}
            {screen === "ideas"    && <IdeasScreen   t={t} props={props} glow={glow} strokeWidth={strokeWidth} />}
            {screen === "numbers"  && <NumbersScreen t={t} props={props} />}
            {screen === "someday"  && <SomedayScreen t={t} props={props} />}
            {screen === "settings" && <SettingsScreen t={t} activity={props.activity} setActivity={props.setActivity} />}
          </div>

          {/* bottom tab bar — mobile only */}
          {isMobile && (
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
              background: t.bg, borderTop: `1px solid ${t.line}`,
              display: "flex",
            }}>
              {SCREENS.map(({ id, label }) => {
                const on = screen === id;
                return (
                  <div key={id} onClick={() => setScreen(id)} style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: "8px 0 10px", cursor: "pointer",
                    borderTop: `2px solid ${on ? t.accent : "transparent"}`,
                  }}>
                    <span style={{
                      font: `${on ? 600 : 400} 11px ${HF}`,
                      color: on ? t.accent : t.mut,
                      textAlign: "center", lineHeight: 1.2,
                    }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
