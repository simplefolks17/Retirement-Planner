import React, { useState, useRef } from "react";
import { HF, HM, HD } from "../ThemeContext.jsx";
import { fmtMo, kbActivate } from "../shared.jsx";

export const ACTIVITIES = [
  { k: "golf",    l: "Golf course",    sub: "18 holes whenever you want." },
  { k: "travel",  l: "First class",    sub: "The trip you've been putting off." },
  { k: "hiking",  l: "The mountains",  sub: "The trail has been waiting." },
  { k: "cooking", l: "The kitchen",    sub: "Three-hour dinners, every night." },
  { k: "garden",  l: "The garden",     sub: "Time is finally on your side." },
  { k: "family",  l: "The grandkids",  sub: "Fully present, zero distraction." },
];

// isMobile: this screen was one of two HorizonShell never passed it to, so its
// 62px display headline and 44px side padding rendered unchanged on a 390px
// phone — "First class" alone is wider than the viewport at that size.
export default function SomedayScreen({ t, props, isMobile = false }) {
  const { effectiveExpenses, retirementAge, isSustainable, activity, setActivity } = props;
  const activeAct = ACTIVITIES.find(a => a.l.toLowerCase() === (activity ?? "golf course").toLowerCase())
    ?? ACTIVITIES[0];

  const [customPhoto, setCustomPhoto] = useState(null);
  const [photoHover, setPhotoHover] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;   // images only
    if (file.size > 5 * 1024 * 1024) return;        // cap at 5 MB — avoid bloating session state
    const reader = new FileReader();
    reader.onload = (ev) => setCustomPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  const statusLabel = isSustainable ? `Age ${retirementAge} · fully funded` : `Age ${retirementAge} · keep building`;

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#1a1410" }}>
      {/* photo area — click to upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {/* BUG-49: the photo well had no keyboard path. It genuinely cannot be a
          <button> — it is a full-bleed layer wrapping an <img>, an <svg> and
          absolutely-positioned children — so this is the case kbActivate exists
          for (role + tabIndex + Enter/Space), not a Btn call site. */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={kbActivate(() => fileInputRef.current?.click())}
        role="button"
        tabIndex={0}
        aria-label={customPhoto ? "Change your photo" : "Add a photo"}
        onMouseEnter={() => setPhotoHover(true)}
        onMouseLeave={() => setPhotoHover(false)}
        style={{
          position: "absolute", inset: 0, cursor: "pointer",
          // Inert here (inset:0 already fills the screen) but declared anyway —
          // the touch-target guard checks the CONTRACT, not the current layout.
          minHeight: 44,
          background: customPhoto ? "transparent" : "linear-gradient(135deg, #2a2018 0%, #3d3020 40%, #2a2820 100%)",
        }}
      >
        {customPhoto ? (
          <img
            src={customPhoto}
            alt="your photo"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.08 }}
              preserveAspectRatio="none">
              <line x1="0" y1="0" x2="100%" y2="100%" stroke="#fff" strokeWidth="1" />
              <line x1="100%" y1="0" x2="0" y2="100%" stroke="#fff" strokeWidth="1" />
            </svg>
            {/* Dead-centred, it lands exactly on the headline block (which the
                foreground's space-between puts in the middle of the screen) —
                harmless on a tall desktop window, a collision on an 844px
                phone. Moved up under the header row on mobile rather than
                hidden: it is the only affordance saying the photo is tappable. */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", justifyContent: "center",
              alignItems: isMobile ? "flex-start" : "center",
              paddingTop: isMobile ? 84 : 0,
            }}>
              <span style={{
                font: `400 13px ${HF}`,
                color: photoHover ? "rgba(255,255,255,.40)" : "rgba(255,255,255,.18)",
                transition: "color .2s",
              }}>
                {photoHover ? "tap to add a photo" : `thematic photo · ${activeAct.l.toLowerCase()}`}
              </span>
            </div>
          </>
        )}
        {/* change photo hint when photo is loaded */}
        {customPhoto && photoHover && (
          <div style={{
            position: "absolute", top: 16, right: 16, zIndex: 10,
            background: "rgba(0,0,0,.55)", borderRadius: 8, padding: "6px 12px",
            font: `500 12px ${HF}`, color: "rgba(255,255,255,.85)",
          }}>
            change photo
          </div>
        )}
      </div>
      {/* dark gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, rgba(18,14,10,.80) 0%, rgba(18,14,10,.20) 55%, rgba(18,14,10,.60) 100%)"
      }} />
      {/* foreground */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: isMobile ? "22px 20px 24px" : "32px 44px", zIndex: 2
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ font: `700 17px ${HF}`, color: "rgba(255,255,255,.80)" }}>Horizon</span>
          <span style={{
            font: `500 12.5px ${HF}`, color: "rgba(255,255,255,.55)",
            border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, padding: "4px 14px"
          }}>{statusLabel}</span>
        </div>
        <div style={{ maxWidth: 580 }}>
          <div style={{
            font: `400 13px ${HF}`, color: "rgba(255,255,255,.45)",
            letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10
          }}>work optional.</div>
          <div style={{
            font: `700 ${isMobile ? 40 : 62}px/1 ${HD}`, color: "#ffffff",
            textShadow: "0 2px 20px rgba(0,0,0,.40)", marginBottom: 2
          }}>{activeAct.l}</div>
          <div style={{
            font: `400 ${isMobile ? 40 : 62}px/1 ${HD}`, color: "rgba(255,255,255,.75)",
            textShadow: "0 2px 20px rgba(0,0,0,.40)", marginBottom: isMobile ? 16 : 22
          }}>mandatory.</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ font: `600 ${isMobile ? 28 : 36}px ${HM}`, color: "rgba(255,255,255,.95)" }}>
              {fmtMo(effectiveExpenses)}
            </span>
            {/* Was "a month, for life." — an ungated guarantee over a spending
                target (the gated "for life" claims elsewhere condition on a
                model sustainability boolean; this one didn't). */}
            <span style={{ font: `400 ${isMobile ? 14 : 16}px ${HF}`, color: "rgba(255,255,255,.50)" }}>a month in retirement.</span>
          </div>
          <div style={{ font: `400 14px ${HF}`, color: "rgba(255,255,255,.38)", marginTop: 6 }}>
            {activeAct.sub}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: `400 12px ${HF}`, color: "rgba(255,255,255,.38)" }}>your thing:</span>
          {/* BUG-49 + touch target: were `<div onClick>` chips ~25px tall. Real
              buttons now, at the Pill tier (40px). NOT the shared Pill: these sit
              on a user photo and use the screen's white-on-image scale rather
              than theme tokens (a pre-existing, deliberate exception noted in the
              design review — the raw rgba values are unchanged here). The 1px
              border is present in BOTH states, only its colour changes. */}
          {ACTIVITIES.map((a) => {
            const on = a.k === activeAct.k;
            return (
              <button key={a.k} type="button" aria-pressed={on}
                onClick={() => setActivity(a.l.toLowerCase())}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minHeight: 40, boxSizing: "border-box", flexShrink: 0, whiteSpace: "nowrap",
                  padding: "5px 14px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${on ? "rgba(255,255,255,.70)" : "rgba(255,255,255,.22)"}`,
                  background: on ? "rgba(255,255,255,.16)" : "transparent",
                  font: `${on ? 600 : 400} 12.5px ${HF}`,
                  color: on ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.44)"
                }}>{a.l}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
