import React, { useState, useRef } from "react";
import { HF, HM, HD } from "../ThemeContext.jsx";
import { fmtMo } from "../shared.jsx";

export const ACTIVITIES = [
  { k: "golf",    l: "Golf course",    sub: "18 holes whenever you want." },
  { k: "travel",  l: "First class",    sub: "The trip you've been putting off." },
  { k: "hiking",  l: "The mountains",  sub: "The trail has been waiting." },
  { k: "cooking", l: "The kitchen",    sub: "Three-hour dinners, every night." },
  { k: "garden",  l: "The garden",     sub: "Time is finally on your side." },
  { k: "family",  l: "The grandkids",  sub: "Fully present, zero distraction." },
];

export default function SomedayScreen({ t, props }) {
  const { effectiveExpenses, retirementAge, isSustainable, activity, setActivity } = props;
  const activeAct = ACTIVITIES.find(a => a.l.toLowerCase() === (activity ?? "golf course").toLowerCase())
    ?? ACTIVITIES[0];

  const [customPhoto, setCustomPhoto] = useState(null);
  const [photoHover, setPhotoHover] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      <div
        onClick={() => fileInputRef.current?.click()}
        onMouseEnter={() => setPhotoHover(true)}
        onMouseLeave={() => setPhotoHover(false)}
        style={{
          position: "absolute", inset: 0, cursor: "pointer",
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
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center"
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
        padding: "32px 44px", zIndex: 2
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
            font: `700 62px ${HD}`, color: "#ffffff", lineHeight: 1.0,
            textShadow: "0 2px 20px rgba(0,0,0,.40)", marginBottom: 2
          }}>{activeAct.l}</div>
          <div style={{
            font: `400 62px ${HD}`, color: "rgba(255,255,255,.75)", lineHeight: 1.0,
            textShadow: "0 2px 20px rgba(0,0,0,.40)", marginBottom: 22
          }}>mandatory.</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ font: `600 36px ${HM}`, color: "rgba(255,255,255,.95)" }}>
              {fmtMo(effectiveExpenses)}
            </span>
            <span style={{ font: `400 16px ${HF}`, color: "rgba(255,255,255,.50)" }}>a month, for life.</span>
          </div>
          <div style={{ font: `400 14px ${HF}`, color: "rgba(255,255,255,.38)", marginTop: 6 }}>
            {activeAct.sub}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: `400 12px ${HF}`, color: "rgba(255,255,255,.38)" }}>your thing:</span>
          {ACTIVITIES.map((a) => {
            const on = a.k === activeAct.k;
            return (
              <div key={a.k} onClick={() => setActivity(a.l.toLowerCase())}
                style={{
                  padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${on ? "rgba(255,255,255,.70)" : "rgba(255,255,255,.22)"}`,
                  background: on ? "rgba(255,255,255,.16)" : "transparent",
                  font: `${on ? 600 : 400} 12.5px ${HF}`,
                  color: on ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.44)"
                }}>{a.l}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
