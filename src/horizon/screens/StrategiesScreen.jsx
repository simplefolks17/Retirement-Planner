// StrategiesScreen — WI-3.3 (#100): the Strategies catalogue scaffold.
//
// LAYOUT/FORMATTING ONLY (rule 10). Every number comes from the model: cards
// whose headline already has a horizonProps home read it directly
// (props.netConversionBenefit, props.yr1TaxSavings, props.budget.*); everything
// else comes from props.strategiesView, where the App memo pre-computes each
// card's `applicable` flag (no comparisons on financial values in JSX) and the
// not-yet-wired card scalars. This screen only picks a label and formats.
//
// STRUCTURE (host + flow container):
//   • A small STRATEGIES registry (mirrors HorizonShell's SCREENS) drives layout,
//     grouped into SP-1's editorial sections (Taxes / Income timing / Accounts).
//     Each entry reserves a `Flow` slot — null at L3 — so WI-3.4–3.7 attach an
//     interactive flow component to an id WITHOUT reshaping the registry.
//   • Selecting a card opens a back-button detail container whose body is a single
//     swappable slot: `entry.Flow ?? <ReadOnlyStub/>`. WI-3.4–3.7 replace ONE
//     component (and mount the WI-3.9 ApplyPreviewModal there); the container and
//     read-only data path survive.
//
// Two card states only: `active` (applicable → live dollars) and `notset`
// (inapplicable → a free-but-unconfigured "see what this could be worth"
// affordance). Premium LOCKING is deliberately NOT here — it arrives in WI-5.2
// as the shared `entitlements` bundle + LockedCard (a third, additive branch),
// so we don't create a second source of truth for it now (principle 11).

import React, { useState, useEffect } from "react";
import { HF, HM } from "../ThemeContext.jsx";
// IRS ages come from config even in display copy (rule 1 / principle 9) — never
// hardcode "73"/"67" in strings (the BUG-25 / WI-0.1 anti-pattern).
import { RMD_START_AGE } from "../../config/irs-2026.js";
import { fmt } from "../../formatters.js";   // calm money — card headlines are derived summaries, not editable readouts
import { signalToneKey, signalValueText } from "../../model/signals.js"; // one tone/value source, shared with Plan's SignalsStrip
import SSTimingFlow from "./strategies/SSTimingFlow.jsx";
import RMDOutlookFlow from "./strategies/RMDOutlookFlow.jsx";
import ConversionPlannerFlow from "./strategies/ConversionPlannerFlow.jsx";
import WithdrawalOrderFlow from "./strategies/WithdrawalOrderFlow.jsx";
import SurplusDeploymentFlow from "./strategies/SurplusDeploymentFlow.jsx";
import MegaBackdoorFlow from "./strategies/MegaBackdoorFlow.jsx";
import WorkLongerFlow from "./strategies/WorkLongerFlow.jsx";
import LockedCard from "../LockedCard.jsx";

// ── strategy catalogue ───────────────────────────────────────────────────────
const SECTIONS = [
  { id: "taxes",    label: "Taxes" },
  { id: "income",   label: "Income timing" },
  { id: "accounts", label: "Accounts" },
  { id: "assets",   label: "Assets" },
];

// Flow: the interactive flow component, or null for a read-only stub (slot filled
// by WI-3.4+). All six strategies are now live: SS timing (3.4), RMD outlook
// (3.5), Roth conversion (3.6), and withdrawal order / surplus deployment /
// mega backdoor (3.7).
const STRATEGIES = [
  { id: "conversion", section: "taxes",    title: "Roth conversion",        wi: "3.6", Flow: ConversionPlannerFlow },
  { id: "withdrawal", section: "taxes",    title: "Withdrawal order",       wi: "3.7", Flow: WithdrawalOrderFlow },
  { id: "ss",         section: "income",   title: "Social Security timing", wi: "3.4", Flow: SSTimingFlow },
  { id: "worklonger", section: "income",   title: "Working longer",         wi: "5.5", Flow: WorkLongerFlow },
  { id: "rmd",        section: "accounts", title: "RMD outlook",            wi: "3.5", Flow: RMDOutlookFlow },
  { id: "surplus",    section: "accounts", title: "Surplus deployment",     wi: "3.7", Flow: SurplusDeploymentFlow },
  { id: "mega",       section: "accounts", title: "Mega backdoor",          wi: "3.7", Flow: MegaBackdoorFlow },
];

// One-line "what it is" copy — static, no model values (rule 10 safe).
const BLURB = {
  conversion: "Move pre-tax savings to Roth in low-income years to cut lifetime tax.",
  withdrawal: "Draw accounts in the tax-smart order to keep more each year.",
  ss:         "When you claim sets your monthly benefit for life.",
  worklonger: "Each extra working year adds savings, lifts Social Security, and shortens the conversion window.",
  rmd:        `Required withdrawals from your 401k start at age ${RMD_START_AGE}.`,
  surplus:    "Put money you're not yet investing to work, in IRS-priority order.",
  mega:       "Extra after-tax 401k space, converted to Roth.",
};

// Premium lock predicate (#116 / SP-1): a registry entry may declare `premium: true`
// (NONE do today). A premium card locks only when the user is NOT premium. Exported
// so the flag-flip mechanism is unit-testable without a real premium card in the
// registry. Default entitlements.isPremium is true → nothing locks.
export function isCardLocked(entry, entitlements) {
  return !!entry?.premium && entitlements?.isPremium === false;
}

// Per-card face: { applicable, headline, sub, tone }. Reads model fields only;
// the only branch is a display sign label (allowed — it's formatting, not math).
function faceFor(id, props) {
  const sv = props.strategiesView;
  switch (id) {
    case "conversion": {
      // Healthcare-adjusted verdict (after IRMAA/ACA) with a model-precomputed
      // sign — the SAME field Numbers→Taxes uses (one source, principle 11). No
      // arithmetic or `?? 0` sign-guess in the screen (rule 10): isPositive is
      // pre-gated, nb is the signed adjusted dollar.
      const cd = props.taxView?.conversionDetail;
      const nb = cd?.adjustedNetConversionBenefit;
      return {
        applicable: sv.conversion.applicable,
        headline: fmt(nb),
        sub: nb == null
          ? "estimate unavailable"
          : cd.isPositive ? "est. lifetime benefit, after healthcare" : "not worth it at this spend",
        tone: nb == null ? "accent" : cd.isPositive ? "good" : "warm",
      };
    }
    case "withdrawal":
      return {
        applicable: sv.withdrawal.applicable,
        headline: fmt(props.withdrawalView?.yr1TaxSavings),
        sub: "saved in year-1 tax",
        tone: "good",
      };
    case "ss": {
      // applicable from strategiesView; headline from the ssView flow bundle
      // (one source — same data the SS flow renders).
      const v = props.ssView;
      return {
        applicable: sv.ss.applicable,
        headline: `${fmt(v.ssMonthly)}/mo`,
        sub: `claiming at age ${v.claimAge}`,
        tone: "accent",
      };
    }
    case "worklonger": {
      const v = props.workLongerView;
      return {
        applicable: sv.worklonger.applicable,
        headline: v ? v.headline : "—",
        sub: v ? v.sub : "",
        tone: "good",
      };
    }
    case "rmd": {
      const v = props.rmdView;
      return {
        applicable: sv.rmd.applicable,
        headline: fmt(v.firstRMDAmount),
        sub: v.firstRMDAge != null ? `first RMD at age ${v.firstRMDAge}` : "first RMD",
        tone: "accent",
      };
    }
    case "surplus":
      return {
        applicable: sv.surplus.applicable,
        headline: `${fmt(props.budget?.availableSurplus)}/yr`,
        sub: "unallocated savings",
        tone: "good",
      };
    case "mega":
      return {
        applicable: sv.mega.applicable,
        headline: `${fmt(props.megaView?.capacity)}/yr`,
        sub: "after-tax space",
        tone: "accent",
      };
    default:
      return { applicable: false, headline: "—", sub: "", tone: "accent" };
  }
}

// Detail rows for the read-only stub — [label, value] pairs, model values only.
// As of WI-3.7 all six strategies have a live Flow (see STRATEGIES above), so
// this is currently unreachable — kept as the general ReadOnlyStub fallback
// for any future strategy added without a Flow yet (mirrors the withdrawal /
// surplus / mega cases that shipped their own Flow this round).
function detailRows(id, props) {
  switch (id) {
    case "withdrawal":
      return [["Year-1 tax saved", fmt(props.withdrawalView?.yr1TaxSavings)]];
    case "surplus":
      return [["Available surplus", `${fmt(props.budget?.availableSurplus)}/yr`]];
    case "mega": {
      const mv = props.megaView;
      const rows = [["After-tax space", `${fmt(mv?.capacity)}/yr`]];
      (mv?.growth ?? []).forEach(g => rows.push([`Grows to, in ${g.yrs} yrs`, fmt(g.val)]));
      return rows;
    }
    default:
      return [];
  }
}

// For-you strip (SP-1): the SAME calcSignals ranking Plan uses, capped at 3
// (props.strategiesForYou = calcSignals(sameInputs, 3)). One brain, two surfaces.
// Deep-links via navigate() exactly like Plan's SignalsStrip. Renders nothing when
// empty or when no navigate is available (no empty chrome).
function ForYouStrip({ t, forYou, navigate, isMobile }) {
  const items = forYou ?? [];
  if (items.length === 0 || !navigate) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>For you</div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
        {items.map(sig => (
          <button key={sig.id} type="button"
            onClick={() => navigate(sig.target.screen, sig.target.subView)}
            style={{ flex: 1, textAlign: "left", minHeight: 44, cursor: "pointer",
              background: t.surf2, border: `1px solid ${t.line2}`, borderRadius: 13,
              padding: "10px 14px", font: "inherit", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ font: `600 16px ${HM}`, flexShrink: 0,
              color: t[signalToneKey(sig)] }}>
              {signalValueText(sig, fmt)}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", font: `600 13px ${HF}`, color: t.ink }}>{sig.title}</span>
              <span style={{ display: "block", font: `400 12px ${HF}`, color: t.mut, marginTop: 1 }}>
                {sig.body} <span style={{ color: t.accent }}>→</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── card ─────────────────────────────────────────────────────────────────────
function StrategyCard({ t, entry, face, onOpen }) {
  const toneColor = face.tone === "good" ? t.good : face.tone === "warm" ? t.warm : t.accent;
  return (
    <button type="button" onClick={onOpen}
      style={{
        textAlign: "left", background: t.surf, border: `1px solid ${t.line}`,
        borderRadius: 14, padding: "16px 18px", cursor: "pointer", minHeight: 44,
        display: "flex", flexDirection: "column", gap: 8, width: "100%", font: "inherit",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ font: `600 15px ${HF}`, color: t.ink }}>{entry.title}</span>
        <span style={{ font: `400 15px ${HF}`, color: t.faint }}>›</span>
      </div>
      {face.applicable ? (
        <div>
          <div style={{ font: `500 22px ${HM}`, color: toneColor, letterSpacing: "-0.01em" }}>{face.headline}</div>
          <div style={{ font: `400 12px ${HF}`, color: t.mut, marginTop: 2 }}>{face.sub}</div>
        </div>
      ) : (
        // notset: a free-but-unconfigured strategy (NOT premium — that's WI-5.2).
        <div>
          <div style={{ font: `500 13px ${HF}`, color: t.faint }}>Not set up</div>
          <div style={{ font: `400 12px ${HF}`, color: t.mut, marginTop: 2 }}>See what this could be worth</div>
        </div>
      )}
    </button>
  );
}

// ── read-only stub (the swappable flow body at L3) ────────────────────────────
function ReadOnlyStub({ t, entry, props }) {
  const face = faceFor(entry.id, props);
  const rows = face.applicable ? detailRows(entry.id, props) : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        font: `400 13px/1.5 ${HF}`, color: t.mut, background: t.bg,
        border: `1px solid ${t.line}`, borderRadius: 10, padding: "11px 13px",
      }}>{BLURB[entry.id]}</div>

      {face.applicable ? (
        <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden" }}>
          {rows.map(([label, value], i) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18,
              padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${t.line}`,
            }}>
              <span style={{ font: `500 13px ${HF}`, color: t.ink }}>{label}</span>
              <span style={{ font: `600 15px ${HM}`, color: t.ink }}>{value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ font: `400 13px/1.5 ${HF}`, color: t.mut }}>
          This strategy isn't active in your plan yet. Adjust your details and it'll light up here.
        </div>
      )}

      <div style={{ font: `400 12px ${HF}`, color: t.faint }}>
        Interactive controls for this strategy arrive in a later update.
      </div>
    </div>
  );
}

// ── detail flow container ─────────────────────────────────────────────────────
function StrategyDetail({ t, entry, props, isMobile, onBack }) {
  const Flow = entry.Flow;
  return (
    <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px 16px 40px" : "24px 36px 48px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button type="button" onClick={onBack}
          style={{
            font: `500 13px ${HF}`, color: t.accent, background: "transparent",
            border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 12, minHeight: 44,
          }}>‹ All strategies</button>
        <div style={{ font: `700 22px ${HF}`, color: t.ink, letterSpacing: "-0.02em", marginBottom: 16 }}>{entry.title}</div>
        {/* Single swappable body slot — WI-3.4–3.7 supply entry.Flow. */}
        {Flow
          ? <Flow t={t} props={props} isMobile={isMobile} />
          : <ReadOnlyStub t={t} entry={entry} props={props} />}
      </div>
    </div>
  );
}

// ── screen ────────────────────────────────────────────────────────────────────
// initialStrategy (optional): a strategy id to open on arrival when another
// screen deep-links here via navigate("strategies", id). Mirrors the
// initialTab / initialMode pattern used by Numbers / Ideas.
export default function StrategiesScreen({ t, props, isMobile = false, initialStrategy = null, navigate = null }) {
  const [selected, setSelected] = useState(initialStrategy ?? null);
  // "Browse all strategies" reveal: non-applicable free cards are hidden by
  // default (SP-1: typical visible 5–8) until the user opts to see everything.
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setSelected(initialStrategy ?? null); }, [initialStrategy]);

  const entry = selected ? STRATEGIES.find(s => s.id === selected) : null;
  if (entry) {
    return <StrategyDetail t={t} entry={entry} props={props} isMobile={isMobile} onBack={() => setSelected(null)} />;
  }

  // A card shows by default when it's applicable (active) OR premium-locked (the
  // quiet upsell stays visible); non-applicable FREE cards hide until "Browse all".
  const shownByDefault = (e) => isCardLocked(e, props.entitlements) || faceFor(e.id, props).applicable;
  const hiddenCount = STRATEGIES.filter(e => !shownByDefault(e)).length;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "20px 16px 40px" : "28px 36px 48px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ font: `700 24px ${HF}`, color: t.ink, letterSpacing: "-0.02em" }}>Strategies</div>
        <div style={{ font: `400 14px ${HF}`, color: t.mut, marginTop: 4, marginBottom: 22 }}>
          Ways to keep more of what you've built. Tap any to see what it's worth.
        </div>

        <ForYouStrip t={t} forYou={props.strategiesForYou} navigate={navigate} isMobile={isMobile} />

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {SECTIONS.map(section => {
            const all = STRATEGIES.filter(s => s.section === section.id);
            const items = showAll ? all : all.filter(shownByDefault);
            if (items.length === 0) return null;   // empty / all-hidden sections don't render (SP-1)
            return (
              <div key={section.id}>
                <div style={{
                  font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.05em",
                  textTransform: "uppercase", marginBottom: 10,
                }}>{section.label}</div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 12,
                }}>
                  {items.map(e => isCardLocked(e, props.entitlements)
                    ? <LockedCard key={e.id} t={t} title={e.title} teaser={BLURB[e.id]} onClick={() => {}} />
                    : <StrategyCard key={e.id} t={t} entry={e}
                        face={faceFor(e.id, props)} onOpen={() => setSelected(e.id)} />)}
                </div>
              </div>
            );
          })}
        </div>

        {hiddenCount > 0 && (
          <button type="button" onClick={() => setShowAll(v => !v)}
            style={{
              marginTop: 20, font: `500 13px ${HF}`, color: t.accent, background: "transparent",
              border: "none", cursor: "pointer", padding: "8px 0", minHeight: 44,
            }}>
            {showAll ? "Show fewer" : `Browse all strategies (${hiddenCount} more)`}
          </button>
        )}
      </div>
    </div>
  );
}
