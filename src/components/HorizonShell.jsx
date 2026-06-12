// HorizonShell — Horizon UI shell (5-screen navigation).
// Additive: does not replace App.jsx — receives all computed values as props.
// Screens: Plan · Ideas · The numbers · Settings · Someday
// LAYOUT/STYLING ONLY — no calculation logic lives here.

import React, { useState, useEffect, useRef } from "react";
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

// Compact money: $3.5M / $185k / $900 — never the runaway "$3484k".
function obMoney(val) {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(val % 1e6 === 0 ? 0 : 1)}M`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}k`;
  return `$${Math.round(val)}`;
}

function fmtField(field, val) {
  switch (field) {
    case "currentAge":
    case "retirementAge": return String(val);
    case "currentIncome": return obMoney(val);
    case "totalSaved":    return obMoney(val);
    case "monthlySpend":  return `$${val.toLocaleString()}`;
    default: return String(val);
  }
}

function ObInput({ t, field, vals, setVals }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [lo, hi] = OB_CLAMPS[field];
  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? draft : fmtField(field, vals[field])}
      onFocus={() => { setFocused(true); setDraft(String(vals[field])); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(n)) setVals(v => ({ ...v, [field]: Math.max(lo, Math.min(hi, n)) }));
        setFocused(false);
      }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{
        flex: 1, height: 50, borderRadius: 12,
        border: `1.5px solid ${t.line2}`, background: t.bg,
        font: `600 22px ${HM}`, color: t.ink,
        textAlign: "center", outline: "none",
        padding: "0 12px", minWidth: 0, cursor: "text",
      }}
    />
  );
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
    ["Savings today",   obMoney(vals.totalSaved),                          t.ink],
  ];

  const stepBtnStyle = {
    width: 36, height: 36, flexShrink: 0, borderRadius: 9,
    border: `1.5px solid ${t.line2}`, background: t.surf,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    font: `600 18px ${HF}`, color: t.accent, cursor: "pointer", userSelect: "none",
  };

  const navBtnPrimary = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "13px", borderRadius: 12, background: t.accent, cursor: "pointer",
  };

  return (
    <div style={{
      width: "100%", flex: 1, minHeight: "100vh", background: t.bg, fontFamily: HF,
      position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "72px 20px 0",
    }}>
      {/* ── background arc figurehead — a horizon that rises as answers come in ── */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "44%",
        display: "flex", alignItems: "flex-end", pointerEvents: "none",
      }}>
        <GhostArc t={t} opacity={arcOp} blur={arcBlur} H={420} />
      </div>
      {/* fade the arc's base softly into the background */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "18%",
        background: `linear-gradient(to bottom, transparent, ${t.bg})`, pointerEvents: "none",
      }} />

      {/* top-centered logo */}
      <div style={{ position: "absolute", top: 26, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Logo t={t} />
      </div>

      {/* ── centered card ── */}
      <div style={{
        position: "relative", zIndex: 2, width: "100%", maxWidth: 440,
        marginBottom: "6%",
        background: t.surf, border: `1px solid ${t.line}`, borderRadius: 22,
        boxShadow: "0 18px 50px rgba(0,0,0,.10)",
        padding: "30px 32px 26px",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16,
      }}>
        {/* progress pips */}
        <div style={{ display: "flex", gap: 5, width: "100%", maxWidth: 240 }}>
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
          <>
            <div style={{ font: `600 27px/1.1 ${HF}`, color: t.ink, letterSpacing: "-0.02em" }}>
              Your plan is ready.
            </div>
            <div style={{ font: `600 16px/1.3 ${HF}`, color: t.accent }}>
              Work optional. Your thing mandatory.
            </div>
            <div style={{ width: "100%", marginTop: 4 }}>
              {summaryStats.map(([l, v, c]) => (
                <div key={l} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  padding: "11px 0", borderBottom: `1px solid ${t.line}`
                }}>
                  <span style={{ font: `400 13px ${HF}`, color: t.mut }}>{l}</span>
                  <span style={{ font: `600 18px ${HM}`, color: c }}>{v}</span>
                </div>
              ))}
            </div>
            <div onClick={() => setShowConfirm(true)} style={{ ...navBtnPrimary, width: "100%", marginTop: 6 }}>
              <span style={{ font: `600 15px ${HF}`, color: "#fff" }}>Save as my plan →</span>
            </div>
            <div onClick={onComplete} style={{
              font: `400 13px ${HF}`, color: t.faint, cursor: "pointer", textDecoration: "underline"
            }}>
              Skip for now
            </div>
          </>
        ) : (
          /* ── Per-step question + stepper ── */
          <>
            <div style={{
              font: `600 27px ${HF}`, color: t.ink, letterSpacing: "-0.02em",
              lineHeight: 1.18, whiteSpace: "pre-line", marginTop: 2
            }}>{cur.q}</div>
            <div style={{ font: `400 13.5px ${HF}`, color: t.mut, marginTop: -4 }}>{cur.hint}</div>

            {/* stepper with live numeric state */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", maxWidth: 320, marginTop: 4 }}>
              <span style={stepBtnStyle} onClick={() => adjust(cur.field, -1)}>−</span>
              <ObInput key={cur.field} t={t} field={cur.field} vals={vals} setVals={setVals} />
              <span style={stepBtnStyle} onClick={() => adjust(cur.field, +1)}>+</span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", maxWidth: 320, marginTop: 4 }}>
              {step > 0 && (
                <div onClick={() => setStep(s => s - 1)} style={{
                  padding: "13px 18px", borderRadius: 12,
                  border: `1px solid ${t.line2}`, background: t.surf,
                  font: `500 14px ${HF}`, color: t.mut, cursor: "pointer"
                }}>←</div>
              )}
              <div onClick={() => setStep(s => s + 1)} style={navBtnPrimary}>
                <span style={{ font: `600 15px ${HF}`, color: "#fff" }}>
                  {step === OB_STEPS.length - 1 ? "Build my plan →" : "Next →"}
                </span>
              </div>
            </div>

            <div onClick={onComplete} style={{
              font: `400 12px ${HF}`, color: t.faint, cursor: "pointer", textDecoration: "underline", marginTop: 2
            }}>
              skip
            </div>
          </>
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
  { id: "plan",    label: "Plan",     short: "Plan",    icon: "◎" },
  { id: "ideas",   label: "Ideas",    short: "Ideas",   icon: "✦" },
  { id: "numbers", label: "The numbers", short: "Numbers", icon: "▦" },
  { id: "someday", label: "Someday",  short: "Someday", icon: "☀" },
  { id: "settings",label: "Settings", short: "Settings",icon: "⚙" },
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
              totalSaved:    props.currentTotalSaved,
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
            {screen === "ideas"    && <IdeasScreen   t={t} props={props} glow={glow} strokeWidth={strokeWidth} isMobile={isMobile} />}
            {screen === "numbers"  && <NumbersScreen t={t} props={props} isMobile={isMobile} />}
            {screen === "someday"  && <SomedayScreen t={t} props={props} />}
            {screen === "settings" && <SettingsScreen t={t} activity={props.activity} setActivity={props.setActivity}
              onResetOnboarding={() => { safeSet("hz-onboarded", ""); setShowOnboarding(true); }} />}
          </div>

          {/* bottom tab bar — mobile only */}
          {isMobile && (
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
              background: t.bg, borderTop: `1px solid ${t.line}`,
              display: "flex",
            }}>
              {SCREENS.map(({ id, short, icon }) => {
                const on = screen === id;
                return (
                  <div key={id} onClick={() => setScreen(id)} style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 3,
                    padding: "7px 0 9px", cursor: "pointer",
                    borderTop: `2px solid ${on ? t.accent : "transparent"}`,
                  }}>
                    <span style={{ font: `400 16px/1 ${HF}`, color: on ? t.accent : t.mut }}>{icon}</span>
                    <span style={{
                      font: `${on ? 600 : 400} 10.5px/1 ${HF}`,
                      color: on ? t.accent : t.mut,
                      textAlign: "center",
                    }}>{short}</span>
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
