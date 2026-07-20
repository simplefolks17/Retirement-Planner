// HorizonShell — Horizon UI shell (8-screen navigation).
// Additive: does not replace App.jsx — receives all computed values as props.
// Screens: Plan · Journey · Ideas · The numbers · Strategies · Someday · My details · Settings
// LAYOUT/STYLING ONLY — no calculation logic lives here.

import React, { useState, useEffect, useRef, useCallback } from "react";
import { GhostArc } from "./ArcGraph.jsx";
import { PALETTES, HF, HM, HD, useTheme, safeGet, safeSet } from "../horizon/ThemeContext.jsx";
import { fmt, fmtFull } from "../formatters.js";
import ConfirmModal from "../horizon/ConfirmModal.jsx";
import PlanScreen    from "../horizon/screens/PlanScreen.jsx";
import JourneyScreen from "../horizon/screens/JourneyScreen.jsx";
import NumbersScreen from "../horizon/screens/NumbersScreen.jsx";
import StrategiesScreen from "../horizon/screens/StrategiesScreen.jsx";
import SomedayScreen from "../horizon/screens/SomedayScreen.jsx";
import MyDetailsScreen from "../horizon/screens/MyDetailsScreen.jsx";
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

// WI-1.1 (#88): tapping the pill opens a popover explaining the verdict via the
// 3 drivers from calcPlanDrivers (passed in as `drivers` — planView.drivers).
// COPY + FORMATTING ONLY here: every number, comparison, and ok flag comes from
// the model rows (rule 10); null edge states (sustainedYears, savingsRatePct,
// ok) are rendered as designed text, never synthesized numbers.
function OnTrackPill({ t, isSustainable, drivers, isMobile = false }) {
  const [open, setOpen] = useState(false);
  const color = isSustainable ? t.good : t.warm;
  const label = isSustainable ? "On track" : "Needs attention";

  const rows = (drivers ?? []).map(d => {
    if (d.id === "withdrawal") return {
      ...d,
      name: "Withdrawal rate",
      value: `${d.withdrawalRatePct}%`,
      note: `you draw ${d.withdrawalRatePct}% of savings a year · guideline ${d.guidelinePct}%`,
    };
    if (d.id === "longevity") return {
      ...d,
      name: "Money lasts",
      value: d.sustainedYears == null ? "beyond your plan" : `${d.sustainedYears} yrs`,
      note: `your retirement needs ${d.horizonYears} yrs of income`,
    };
    if (d.id === "confidence") return {
      ...d,
      name: "Market confidence",
      value: d.successPct == null ? "—" : `${d.successPct}%`,
      note: d.successPct == null
        ? "runs many market paths on your current plan"
        : `of market paths fund your plan · guideline ${d.guidelinePct}%`,
    };
    return {
      ...d,
      name: "Savings rate",
      value: d.savingsRatePct == null ? "—" : `${d.savingsRatePct}%`,
      note: d.savingsRatePct == null
        ? "add your income to see this"
        : `of paycheck deposit saved · guideline ${d.guidelinePct}%`,
    };
  });

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {/* clickable hit area — minHeight keeps the touch target ≥ 44px on mobile
          while the visual pill inside stays compact */}
      <span
        onClick={() => setOpen(o => !o)}
        role="button"
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", cursor: "pointer",
          minHeight: isMobile ? 44 : undefined,
        }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 12px", borderRadius: 999,
          border: `1px solid ${color}55`, background: `${color}18`
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
          <span style={{ font: `600 12px ${HF}`, color }}>{label}</span>
        </span>
      </span>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 8, zIndex: 140,
          width: 300, background: t.surf, border: `1px solid ${t.line2}`,
          borderRadius: 14, boxShadow: "0 14px 40px rgba(0,0,0,.16)",
          padding: "12px 15px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4,
          }}>
            <span style={{ font: `600 12.5px ${HF}`, color: t.ink }}>What drives this</span>
            <span onClick={() => setOpen(false)} role="button" aria-label="close"
              style={{ cursor: "pointer", color: t.faint, font: `400 13px ${HF}`, padding: "2px 4px" }}>✕</span>
          </div>
          {rows.map(r => (
            <div key={r.id} style={{ padding: "9px 0", borderTop: `1px solid ${t.line}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                  background: r.ok == null ? t.faint : r.ok ? t.good : t.warm,
                  alignSelf: "center",
                }} />
                <span style={{ flex: 1, font: `500 12.5px ${HF}`, color: t.ink }}>{r.name}</span>
                <span style={{
                  font: `600 13px ${HM}`,
                  color: r.ok == null ? t.faint : r.ok ? t.good : t.warm,
                }}>{r.value}</span>
              </div>
              <div style={{ font: `400 11.5px ${HF}`, color: t.mut, marginTop: 3, paddingLeft: 15 }}>
                {r.note}
              </div>
            </div>
          ))}
        </div>
      )}
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
    case "currentIncome": return fmt(val);
    case "totalSaved":    return fmt(val);
    // monthlySpend is a live editable-input readout (onboarding stepper) —
    // full precision, not abbreviated (rule 10 tier: editable stays full).
    case "monthlySpend":  return fmtFull(val);
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

  // Write the key retirement parameters back to App.jsx state.
  // monthlySpend is passed as entered — the month→year conversion lives in
  // commitPlan (App.jsx), not here (principle 6).
  const handleSave = () => {
    commitPlan({
      currentAge:    vals.currentAge,
      currentIncome: vals.currentIncome,
      retirementAge: vals.retirementAge,
      monthlySpend:  vals.monthlySpend,
    });
    onComplete();
  };

  const summaryStats = [
    ["Retire at",       String(vals.retirementAge),                        t.ink],
    ["Monthly income",  `${fmtFull(vals.monthlySpend)}/mo`,                t.warm],
    ["Savings today",   fmt(vals.totalSaved),                              t.ink],
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
          body={`Age ${vals.currentAge} · Retire at ${vals.retirementAge} · ${fmtFull(vals.monthlySpend)}/mo`}
          confirmLabel="Yes, save my plan"
          onConfirm={handleSave}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

// ── MAIN SHELL ────────────────────────────────────────────────────────────────
// WI-2.1 (#91): Journey added at position 2 (after Plan, before Ideas).
// With 6 screens the mobile bar shows the first 4 (Plan/Journey/Ideas/Numbers)
// plus a More tab; tapping More opens a MoreSheet for the remaining screens.
// Desktop tab bar shows all 6 — the TabBar wraps naturally.
// Exported so the render-smoke test can drive navigation from the single source
// of truth — adding a screen here automatically pulls it into that test's
// coverage loop (and trips the "every screen has a marker" guard if untested).
export const SCREENS = [
  { id: "plan",       label: "Plan",        short: "Plan",     emoji: "◎",  icon: "◎" },
  { id: "journey",    label: "Journey",     short: "Journey",  emoji: "🗺", icon: "🗺" },
  // Ideas retired (2026-07-16): its levers ("Try a change") + life-event
  // placement (Goals) moved onto the Plan screen's Explore tray.
  { id: "numbers",    label: "The numbers", short: "Numbers",  emoji: "▦",  icon: "▦" },
  // WI-3.3 (#100): Strategies — the decide-here destination (desktop position 5).
  { id: "strategies", label: "Strategies",  short: "Strategy", emoji: "♟",  icon: "♟" },
  { id: "someday",    label: "Someday",     short: "Someday",  emoji: "☀",  icon: "☀" },
  // WI-3.2 (#99): My details — plan-fact destination (a content screen, not Settings).
  { id: "details",    label: "My details",  short: "Details",  emoji: "▤",  icon: "▤" },
  { id: "settings",   label: "Settings",    short: "Settings", emoji: "⚙",  icon: "⚙" },
];

// Mobile bottom bar holds the four habitual intents — glance / explore / verify /
// decide (owner decision 1, ROADMAP "End state"): Strategies swaps in at Level 3,
// Journey moves to the More sheet. These are EXPLICIT id lists, not slices, because
// the bar is no longer the first N screens (Strategies is desktop position 5).
const MOBILE_BAR_IDS = ["plan", "journey", "numbers", "strategies"];
const byId = id => SCREENS.find(s => s.id === id);
// filter(Boolean) guards against a typo'd id in MOBILE_BAR_IDS (byId → undefined
// → crash on the bar's destructuring map); the two sets stay exhaustive + disjoint.
const MOBILE_BAR_SCREENS = MOBILE_BAR_IDS.map(byId).filter(Boolean);
const MORE_SCREENS        = SCREENS.filter(s => !MOBILE_BAR_IDS.includes(s.id));

// ── MoreSheet — mobile bottom sheet for overflow screens ──────────────────────
// Shown when the user taps the "More" tab in the mobile bottom bar.
// Renders a slide-up overlay listing MORE_SCREENS; tap any to navigate.
function MoreSheet({ t, active, onNavigate, onClose }) {
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 110,
          background: "rgba(0,0,0,.32)",
        }}
      />
      {/* sheet */}
      <div style={{
        position: "fixed", bottom: 60, left: 0, right: 0, zIndex: 120,
        background: t.surf, borderTop: `1px solid ${t.line2}`,
        borderRadius: "16px 16px 0 0",
        padding: "12px 0 8px",
        boxShadow: "0 -8px 32px rgba(0,0,0,.18)",
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 999, background: t.line2,
          margin: "0 auto 12px",
        }} />
        {MORE_SCREENS.map(({ id, label, emoji }) => {
          const on = active === id;
          return (
            <div
              key={id}
              onClick={() => { onNavigate(id); onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 24px",
                background: on ? `${t.accent}10` : "transparent",
                cursor: "pointer",
              }}
            >
              <span style={{ font: `400 20px/1 ${HF}`, color: on ? t.accent : t.mut }}>{emoji}</span>
              <span style={{
                font: `${on ? 600 : 400} 15px ${HF}`,
                color: on ? t.accent : t.ink,
              }}>{label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function HorizonShell({ onShowClassic, ...props }) {
  const { t, arcStyle } = useTheme();
  const [screen, setScreen] = useState("plan");
  // WI-1.1: optional sub-destination within a screen (a Numbers tab id, or an
  // Ideas mode id). Set by navigate(screenId, subView); cleared by plain
  // navigation so manual tab choices aren't overridden on the next visit.
  const [subView, setSubView] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => safeGet("hz-onboarded") !== "1"
  );
  // WI-2.1: MoreSheet state — controls the mobile overflow sheet (Someday / Settings)
  const [showMore, setShowMore] = useState(false);

  // Single navigation entry point, passed to every screen alongside t/props.
  // Stat cards, the signals strip, and future deep-links all route through it.
  const navigate = useCallback((screenId, sub) => {
    // Unknown/retired screen ids (e.g. a stale "ideas" deep-link) degrade to
    // Plan rather than rendering a blank body.
    const validId = SCREENS.some(s => s.id === screenId) ? screenId : "plan";
    setScreen(validId);
    setSubView(validId === screenId ? (sub ?? null) : null);
  }, []);

  const { isSustainable, retirementAge, planView } = props;
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
              // model-provided monthly figure (calcStatementView) — no /12 here
              monthlySpend:  props.statementView.monthlyTotal,
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
            {!isMobile && <TabBar t={t} tabs={SCREENS} active={screen} onChange={navigate} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <OnTrackPill t={t} isSustainable={isSustainable}
                drivers={planView.drivers} isMobile={isMobile} />
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
            {screen === "plan"     && <PlanScreen    t={t} props={props} glow={glow} strokeWidth={strokeWidth} isMobile={isMobile} navigate={navigate} />}
            {screen === "journey"  && <JourneyScreen t={t} props={props} isMobile={isMobile} navigate={navigate} />}
            {screen === "numbers"  && <NumbersScreen t={t} props={props} isMobile={isMobile} navigate={navigate} initialTab={subView} />}
            {screen === "strategies" && <StrategiesScreen t={t} props={props} isMobile={isMobile} navigate={navigate} initialStrategy={subView} />}
            {screen === "someday"  && <SomedayScreen t={t} props={props} navigate={navigate} />}
            {screen === "details"  && <MyDetailsScreen t={t} props={props} isMobile={isMobile} navigate={navigate} />}
            {screen === "settings" && <SettingsScreen t={t} activity={props.activity} setActivity={props.setActivity} navigate={navigate}
              onResetOnboarding={() => { safeSet("hz-onboarded", ""); setShowOnboarding(true); }} />}
          </div>

          {/* bottom tab bar — mobile only; first 4 screens + More tab */}
          {isMobile && (
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
              background: t.bg, borderTop: `1px solid ${t.line}`,
              display: "flex",
            }}>
              {MOBILE_BAR_SCREENS.map(({ id, short, icon }) => {
                const on = screen === id;
                return (
                  <div key={id} onClick={() => navigate(id)} style={{
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
              {/* More tab — opens the MoreSheet for overflow screens */}
              <div
                onClick={() => setShowMore(true)}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 3,
                  padding: "7px 0 9px", cursor: "pointer",
                  borderTop: `2px solid ${MORE_SCREENS.some(s => s.id === screen) ? t.accent : "transparent"}`,
                }}
              >
                <span style={{ font: `400 16px/1 ${HF}`, color: MORE_SCREENS.some(s => s.id === screen) ? t.accent : t.mut }}>⋯</span>
                <span style={{
                  font: `${MORE_SCREENS.some(s => s.id === screen) ? 600 : 400} 10.5px/1 ${HF}`,
                  color: MORE_SCREENS.some(s => s.id === screen) ? t.accent : t.mut,
                  textAlign: "center",
                }}>More</span>
              </div>
            </div>
          )}
          {/* MoreSheet — slide-up overlay for mobile overflow screens */}
          {isMobile && showMore && (
            <MoreSheet
              t={t}
              active={screen}
              onNavigate={navigate}
              onClose={() => setShowMore(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
