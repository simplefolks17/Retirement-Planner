// ArcGraph — 4-view portfolio chart wired to real totalChartData.
// Views: Arc (milestone stops) · Sources (contrib vs growth) · Decades (5-yr bars) · Scenarios (band)
// Props:
//   t            — Horizon theme tokens
//   chartData    — [{age, total}]  (totalChartData from App)
//   currentAge   — number
//   retirementAge— number
//   lifeExpect   — number
//   contribSeries— [{age, contrib}]  (optional, for Sources view)
//   height       — number (default 300)
//   glow         — boolean (default true)
//   activeView   — "arc"|"stacked"|"columns"|"band" (default "arc")
//   onViewChange — (key) => void

import React, { useMemo } from "react";
import { HF, HM } from "../horizon/ThemeContext.jsx";

const VW = 1200;
const AGE_SPAN_FIXED_START = 30; // coordinate system always starts at 30 for consistent scale

// ── SVG path helpers ─────────────────────────────────────────────────────────
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function pct(n, total) { return `${(n / total) * 100}%`; }
function fmtMoney(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

// Find the age at which chartData first crosses a target value (going up)
function crossAgeFromData(chartData, target) {
  for (let i = 0; i < chartData.length - 1; i++) {
    if (chartData[i].total < target && chartData[i + 1].total >= target) {
      const a0 = chartData[i];
      const a1 = chartData[i + 1];
      const frac = (target - a0.total) / (a1.total - a0.total);
      return Math.round(a0.age + frac * (a1.age - a0.age));
    }
  }
  return null;
}

// Interpolate total at a given age from chartData
function totalAtAge(chartData, age) {
  if (!chartData.length) return 0;
  const exact = chartData.find(d => d.age === age);
  if (exact) return exact.total;
  for (let i = 0; i < chartData.length - 1; i++) {
    const a0 = chartData[i], a1 = chartData[i + 1];
    if (age >= a0.age && age <= a1.age) {
      return a0.total + (a1.total - a0.total) * (age - a0.age) / (a1.age - a0.age);
    }
  }
  if (age < chartData[0].age) return chartData[0].total;
  return chartData[chartData.length - 1].total;
}

// ── Shared scales ─────────────────────────────────────────────────────────────
function makeScales(H, pad, ageMin, ageMax, vmax) {
  const top = pad.t;
  const bot = H - pad.b;
  const xOf = (a) => pad.l + (a - ageMin) / (ageMax - ageMin) * (VW - pad.l - pad.r);
  const yOf = (v) => top + (1 - v / vmax) * (bot - top);
  return { xOf, yOf, top, bot, H, pad };
}

// ── Shared SVG sub-components ─────────────────────────────────────────────────
function GridLines({ t, s, vals }) {
  return (
    <g>
      {vals.map((gv, i) => (
        <line key={i} x1={s.pad.l} x2={VW - s.pad.r}
          y1={s.yOf(gv)} y2={s.yOf(gv)}
          stroke={t.ink} strokeWidth="1" opacity="0.07" strokeDasharray="2 7" />
      ))}
    </g>
  );
}

// ── Arc + Milestone Stops view ───────────────────────────────────────────────
function ArcView({ t, gid, H, glow, strokeWidth = 3, chartData, currentAge, retirementAge, lifeExpect, vmax, s }) {
  const pts = useMemo(() =>
    chartData.map(d => [s.xOf(d.age), +s.yOf(d.total).toFixed(1)]),
    [chartData, s]);

  if (pts.length < 2) return null;

  const line = smoothPath(pts);
  const lastPt = pts[pts.length - 1];
  const area = line + ` L ${lastPt[0]} ${s.bot} L ${s.xOf(currentAge)} ${s.bot} Z`;

  const m1age = crossAgeFromData(chartData, 1e6);
  const m2age = crossAgeFromData(chartData, 2e6);

  const stops = [
    { age: currentAge, label: "Today",          ck: "good",   above: true,  targetVal: totalAtAge(chartData, currentAge) },
    m1age ? { age: m1age, label: "First Million",  ck: "accent", above: true,  targetVal: 1e6 } : null,
    m2age ? { age: m2age, label: "Second Million", ck: "accent", above: false, targetVal: 2e6 } : null,
    { age: retirementAge, label: "Retire",       ck: "accent", above: false, targetVal: totalAtAge(chartData, retirementAge) },
  ].filter(Boolean);

  const endAge = lifeExpect;
  const endTotal = totalAtAge(chartData, endAge);

  const xEnd = s.xOf(endAge);
  const yEnd = s.yOf(endTotal);

  return (
    <>
      <defs>
        <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={t.good}   stopOpacity="0.20" />
          <stop offset="55%"  stopColor={t.accent}  stopOpacity="0.32" />
          <stop offset="100%" stopColor={t.warm}    stopOpacity="0.24" />
        </linearGradient>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={t.good} />
          <stop offset="55%"  stopColor={t.accent} />
          <stop offset="100%" stopColor={t.warm} />
        </linearGradient>
        {glow && (
          <filter id={`${gid}-gf`} x="-5%" y="-60%" width="110%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={t.accent} floodOpacity="0.30" />
          </filter>
        )}
      </defs>
      {/* warm wash over retirement years */}
      <rect x={s.xOf(retirementAge)} y={s.top}
        width={Math.max(0, VW - s.pad.r - s.xOf(retirementAge))}
        height={s.bot - s.top}
        fill={t.warm} opacity="0.055" />
      <GridLines t={t} s={s} vals={[1e6, 2e6, 3e6].filter(v => v <= vmax * 0.95)} />
      <path d={area} fill={`url(#${gid}-f)`} />
      <path d={line} fill="none" stroke={`url(#${gid}-l)`}
        strokeWidth={strokeWidth} strokeLinecap="round"
        filter={glow ? `url(#${gid}-gf)` : undefined} />
      {/* retirement dashed line */}
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)}
        y1={s.top - 2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.40" />
      {/* connector stubs */}
      {stops.map(({ age, ck, above }) => {
        const cx = s.xOf(age);
        const cy = s.yOf(totalAtAge(chartData, age));
        const len = 20;
        return (
          <line key={`ln-${age}`} x1={cx} x2={cx}
            y1={above ? cy - 5.5 : cy + 5.5}
            y2={above ? cy - len : cy + len}
            stroke={t[ck]} strokeWidth="1" opacity="0.38" />
        );
      })}
      {/* milestone dots */}
      {stops.map(({ age, ck }) => (
        <circle key={age} cx={s.xOf(age)} cy={s.yOf(totalAtAge(chartData, age))}
          r={age === retirementAge ? 5.5 : 4.5}
          fill={t.surf} stroke={t[ck]} strokeWidth="2.5" />
      ))}
      {/* end dot */}
      <circle cx={xEnd} cy={yEnd} r="4.5" fill={t.surf} stroke={t.warm} strokeWidth="2.5" />

      {/* overlays — milestone pills */}
      <foreignObject x="0" y="0" width={VW} height={H} style={{ overflow: "visible" }}>
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {/* y-axis labels */}
          {[1e6, 2e6, 3e6].filter(v => v <= vmax * 0.95).map(gv => (
            <div key={gv} style={{
              position: "absolute",
              left: pct(s.pad.l - 8, VW), top: pct(s.yOf(gv), H),
              transform: "translate(-100%,-50%)",
              font: `600 10px ${HM}`, color: t.faint, whiteSpace: "nowrap"
            }}>{fmtMoney(gv)}</div>
          ))}
          {/* age ticks — skip first few so Today pill doesn't overlap */}
          {[40, 50, 55, 60, 70, 80].filter(a => a > currentAge && a <= lifeExpect).map(a => (
            <div key={a} style={{
              position: "absolute",
              left: pct(s.xOf(a), VW),
              bottom: pct(s.pad.b - 28, H),
              transform: "translateX(-50%)",
              font: `600 10px ${HM}`, color: t.faint
            }}>{a}</div>
          ))}
          {/* milestone pills */}
          {stops.map(({ age, label, above, ck, targetVal }) => {
            const c = t[ck];
            const cx = s.xOf(age);
            const cy = s.yOf(totalAtAge(chartData, age));
            const xShift = age === currentAge ? "0%" : "-50%";
            const yTop = above ? cy - 28 : cy + 28;
            const yShift = above ? "-100%" : "0%";
            return (
              <div key={age} style={{
                position: "absolute",
                left: pct(cx, VW), top: pct(yTop, H),
                transform: `translate(${xShift},${yShift})`,
                whiteSpace: "nowrap"
              }}>
                <div style={{
                  display: "inline-block",
                  background: t.surf, border: `1.5px solid ${c}50`,
                  borderRadius: 9, padding: "4px 10px",
                  boxShadow: "0 2px 10px rgba(0,0,0,.09)"
                }}>
                  <div style={{ font: `500 9.5px ${HF}`, color: t.mut, letterSpacing: "0.03em", marginBottom: 1 }}>
                    {label}
                  </div>
                  <div style={{ font: `600 12px ${HM}`, color: c }}>
                    {fmtMoney(targetVal)}
                  </div>
                </div>
              </div>
            );
          })}
          {/* End tag */}
          <div style={{
            position: "absolute",
            left: pct(xEnd, VW), top: pct(yEnd, H),
            transform: "translate(-100%,-50%)", marginLeft: -14,
            background: t.surf, border: `1px solid ${t.line2}`,
            borderRadius: 11, padding: "7px 12px",
            boxShadow: "0 4px 16px rgba(0,0,0,.11)", whiteSpace: "nowrap", zIndex: 2
          }}>
            <div style={{ font: `700 13px ${HM}`, color: t.warm }}>{fmtMoney(endTotal)} at {endAge}</div>
            <div style={{ font: `500 10.5px ${HF}`, color: t.mut, marginTop: 1 }}>still covered, for life</div>
          </div>
        </div>
      </foreignObject>
    </>
  );
}

// ── Sources view (contributions vs market growth) ─────────────────────────────
function SourcesView({ t, gid, H, chartData, contribSeries, currentAge, retirementAge, s, vmax }) {
  const tPts = useMemo(() =>
    chartData.map(d => [s.xOf(d.age), +s.yOf(d.total).toFixed(1)]),
    [chartData, s]);

  const cPts = useMemo(() => {
    if (contribSeries?.length) {
      return contribSeries.map(d => [s.xOf(d.age), +s.yOf(d.contrib).toFixed(1)]);
    }
    // Fallback: no sources data available
    return [];
  }, [contribSeries, s]);

  if (tPts.length < 2) return null;

  const tLine = smoothPath(tPts);
  const lastTot = tPts[tPts.length - 1];
  const lastContrib = cPts.length ? cPts[cPts.length - 1] : tPts[tPts.length - 1];

  const hasSplit = cPts.length >= 2;
  const cLine = hasSplit ? smoothPath(cPts) : null;

  // growth band: total path down to contrib path
  const gArea = hasSplit
    ? tLine + ` L ${lastTot[0]} ${lastContrib[1]} ` +
      cPts.slice().reverse().map(p => `L ${p[0]} ${p[1]}`).join(" ") + " Z"
    : null;

  const cArea = hasSplit
    ? cLine + ` L ${lastContrib[0]} ${s.bot} L ${s.xOf(currentAge)} ${s.bot} Z`
    : null;

  return (
    <>
      <defs>
        <linearGradient id={`${gid}-wf`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={t.warm} stopOpacity="0.52" />
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <GridLines t={t} s={s} vals={[1e6, 2e6, 3e6].filter(v => v <= vmax * 0.95)} />
      {hasSplit && <path d={gArea} fill={`url(#${gid}-wf)`} />}
      {hasSplit && <path d={cArea} fill={t.good} fillOpacity="0.20" />}
      {hasSplit && <path d={cLine} fill="none" stroke={t.good} strokeWidth="1.8" opacity="0.60" />}
      <path d={tLine} fill="none" stroke={t.accent} strokeWidth="2.6" strokeLinecap="round" />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)}
        y1={s.top - 2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.40" />
      <circle cx={s.xOf(retirementAge)} cy={s.yOf(totalAtAge(chartData, retirementAge))}
        r="5" fill={t.accent} stroke={t.surf} strokeWidth="2" />
      <circle cx={s.xOf(currentAge)} cy={s.yOf(totalAtAge(chartData, currentAge))}
        r="4" fill={t.good} stroke={t.surf} strokeWidth="2" />

      {/* legend */}
      {hasSplit && (
        <foreignObject x="0" y="0" width={VW} height={H} style={{ overflow: "visible" }}>
          <div xmlns="http://www.w3.org/1999/xhtml"
            style={{ position: "absolute", left: pct(s.pad.l + 10, VW), top: 13,
              display: "flex", gap: 14, pointerEvents: "none" }}>
            {[["Market growth", t.warm], ["Your contributions", t.good]].map(([l, c]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 6,
                font: `600 10.5px ${HF}`, color: t.mut }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c, opacity: 0.80 }} />
                {l}
              </span>
            ))}
          </div>
        </foreignObject>
      )}
    </>
  );
}

// ── Decades view (5-yr bars) ──────────────────────────────────────────────────
function DecadesView({ t, gid, H, chartData, currentAge, retirementAge, s, vmax }) {
  const ageStep = 5;
  const ages = [];
  let a = Math.ceil(currentAge / ageStep) * ageStep;
  while (a <= s.pad.b ? 90 : 90) {
    ages.push(a);
    a += ageStep;
    if (a > 90) break;
  }

  const bw = Math.min(50, (VW - s.pad.l - s.pad.r) / ages.length * 0.58);

  return (
    <>
      <defs>
        <linearGradient id={`${gid}-acc`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={t.good} stopOpacity="0.72" />
          <stop offset="100%" stopColor={t.good} stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={`${gid}-ret`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={t.warm} stopOpacity="0.78" />
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <GridLines t={t} s={s} vals={[1e6, 2e6, 3e6].filter(v => v <= vmax * 0.95)} />
      {ages.map(age => {
        const bal = totalAtAge(chartData, age);
        const x = s.xOf(age);
        const y = s.yOf(bal);
        const isPost = age >= retirementAge;
        const fillId = isPost ? `url(#${gid}-ret)` : `url(#${gid}-acc)`;
        const capCol = isPost ? t.warm : t.good;
        return (
          <g key={age}>
            <rect x={x - bw / 2} y={y} width={bw} height={s.bot - y} rx="5" fill={fillId}
              stroke={age === retirementAge ? t.warm : "none"}
              strokeWidth={age === retirementAge ? 1.5 : 0} />
            <rect x={x - bw / 2} y={y} width={bw}
              height={age === retirementAge ? 6 : 4} rx="2.5"
              fill={capCol} opacity={age === retirementAge ? 1 : 0.88} />
          </g>
        );
      })}
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)}
        y1={s.top - 4} y2={s.bot}
        stroke={t.warm} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.35" />

      {/* age + value labels */}
      <foreignObject x="0" y="0" width={VW} height={H} style={{ overflow: "visible" }}>
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {ages.map(age => (
            <div key={age} style={{
              position: "absolute",
              left: pct(s.xOf(age), VW),
              bottom: pct(s.pad.b - 28, H),
              transform: "translateX(-50%)",
              font: `600 10px ${HM}`, color: t.faint
            }}>{age}</div>
          ))}
          {[currentAge, retirementAge].map(age => {
            const bal = totalAtAge(chartData, age);
            return (
              <div key={age} style={{
                position: "absolute",
                left: pct(s.xOf(age), VW),
                top: pct(s.yOf(bal), H),
                transform: "translate(-50%,-155%)",
                font: `700 11px ${HM}`,
                color: age >= retirementAge ? t.warm : t.good,
                whiteSpace: "nowrap"
              }}>{fmtMoney(bal)}</div>
            );
          })}
          {/* legend */}
          <div style={{ position: "absolute", left: pct(s.pad.l + 10, VW), top: 13,
            display: "flex", gap: 14 }}>
            {[["Accumulation", t.good], ["Retirement", t.warm]].map(([l, c]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 6,
                font: `600 10.5px ${HF}`, color: t.mut }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c, opacity: 0.85 }} />
                {l}
              </span>
            ))}
          </div>
        </div>
      </foreignObject>
    </>
  );
}

// ── Scenarios / Band view ─────────────────────────────────────────────────────
function BandView({ t, gid, H, chartData, currentAge, retirementAge, s, vmax }) {
  const midPts = useMemo(() =>
    chartData.map(d => [s.xOf(d.age), +s.yOf(d.total).toFixed(1)]),
    [chartData, s]);

  if (midPts.length < 2) return null;

  // Uncertainty spread grows with time (more uncertain further out)
  const spread = (age) => Math.min(0.28, (age - currentAge) / 60 * 0.30);
  const upPts = chartData.map(d => [s.xOf(d.age), +s.yOf(Math.min(d.total * (1 + spread(d.age)), vmax * 0.97)).toFixed(1)]);
  const loPts = chartData.map(d => [s.xOf(d.age), +s.yOf(Math.max(d.total * (1 - spread(d.age) * 0.92), 0)).toFixed(1)]);

  const coneArea = smoothPath(upPts) + " L " +
    loPts.slice().reverse().map(p => p.join(" ")).join(" L ") + " Z";

  return (
    <>
      <GridLines t={t} s={s} vals={[1e6, 2e6, 3e6].filter(v => v <= vmax * 0.95)} />
      <path d={coneArea} fill={t.accent} fillOpacity="0.11" />
      <path d={smoothPath(upPts)} fill="none" stroke={t.accent}
        strokeWidth="1.2" strokeDasharray="4 5" opacity="0.38" />
      <path d={smoothPath(loPts)} fill="none" stroke={t.accent}
        strokeWidth="1.2" strokeDasharray="4 5" opacity="0.38" />
      <path d={smoothPath(midPts)} fill="none" stroke={t.accent}
        strokeWidth="3" strokeLinecap="round" />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)}
        y1={s.top - 2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.40" />
      <circle cx={s.xOf(retirementAge)} cy={s.yOf(totalAtAge(chartData, retirementAge))}
        r="5" fill={t.accent} stroke={t.surf} strokeWidth="2" />
      <circle cx={s.xOf(currentAge)} cy={s.yOf(totalAtAge(chartData, currentAge))}
        r="4.5" fill={t.good} stroke={t.surf} strokeWidth="2" />

      {/* band labels */}
      <foreignObject x="0" y="0" width={VW} height={H} style={{ overflow: "visible" }}>
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {(() => {
            const labelAge = Math.min(Math.round((currentAge + 90) * 0.72), 85);
            const labelData = chartData.find(d => d.age === labelAge) ?? chartData[chartData.length - 1];
            if (!labelData) return null;
            const sp = spread(labelAge);
            return (
              <>
                <div style={{
                  position: "absolute",
                  left: pct(s.xOf(labelAge), VW),
                  top: pct(s.yOf(labelData.total * (1 + sp)), H),
                  transform: "translate(-50%,-125%)",
                  font: `600 9.5px ${HF}`, color: t.mut
                }}>strong market</div>
                <div style={{
                  position: "absolute",
                  left: pct(s.xOf(labelAge), VW),
                  top: pct(s.yOf(labelData.total * (1 - sp * 0.92)), H),
                  transform: "translate(-50%,44%)",
                  font: `600 9.5px ${HF}`, color: t.mut
                }}>lean market</div>
              </>
            );
          })()}
          {/* end tag */}
          {(() => {
            const last = chartData[chartData.length - 1];
            if (!last) return null;
            return (
              <div style={{
                position: "absolute",
                left: pct(s.xOf(last.age), VW),
                top: pct(s.yOf(last.total), H),
                transform: "translate(-100%,-50%)", marginLeft: -14,
                background: t.surf, border: `1px solid ${t.line2}`,
                borderRadius: 11, padding: "7px 12px",
                boxShadow: "0 4px 16px rgba(0,0,0,.11)", whiteSpace: "nowrap", zIndex: 2
              }}>
                <div style={{ font: `700 13px ${HM}`, color: t.warm }}>Even lean: covered</div>
                <div style={{ font: `500 10.5px ${HF}`, color: t.mut, marginTop: 1 }}>across 9 in 10 markets</div>
              </div>
            );
          })()}
        </div>
      </foreignObject>
    </>
  );
}

// ── Ghost Arc (for Ideas screen dotted overlay) ───────────────────────────────
export function GhostArc({ t, opacity = 0.15, blur = 0, H = 200, currentAge = 30, retirementAge = 65 }) {
  const pad = { l: 62, r: 92, t: 38, b: 46 };
  const ageMax = 90;
  const s = makeScales(H, pad, AGE_SPAN_FIXED_START, ageMax, 3.5e6);

  // A simple static arc shape for the ghost (used in onboarding)
  const ANCH = [
    [30,165000],[35,340000],[40,575000],[45,890000],[50,1280000],[55,1775000],
    [60,2380000],[65,3050000],[70,3210000],[75,3050000],[80,2640000],[85,2080000],[90,1400000],
  ];
  function ghostBalAt(age) {
    for (let i = 0; i < ANCH.length - 1; i++) {
      const [a0,v0] = ANCH[i], [a1,v1] = ANCH[i+1];
      if (age >= a0 && age <= a1) return v0 + (v1-v0)*(age-a0)/(a1-a0);
    }
    return age < ANCH[0][0] ? ANCH[0][1] : ANCH[ANCH.length-1][1];
  }

  const ages = [];
  for (let a = 30; a <= 90; a++) ages.push(a);
  const pts = ages.map(a => [s.xOf(a), +s.yOf(ghostBalAt(a)).toFixed(1)]);
  const line = smoothPath(pts);
  const area = line + ` L ${VW - pad.r} ${s.bot} L ${pad.l} ${s.bot} Z`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${VW} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", opacity, filter: blur > 0 ? `blur(${blur}px)` : "none",
        transition: "opacity .6s ease, filter .6s ease" }}>
      <defs>
        <linearGradient id="hg-f" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={t.good}   stopOpacity="0.28" />
          <stop offset="55%"  stopColor={t.accent}  stopOpacity="0.36" />
          <stop offset="100%" stopColor={t.warm}    stopOpacity="0.24" />
        </linearGradient>
        <linearGradient id="hg-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good} />
          <stop offset="55%" stopColor={t.accent} />
          <stop offset="100%" stopColor={t.warm} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hg-f)" />
      <path d={line} fill="none" stroke="url(#hg-l)" strokeWidth="2.8" strokeLinecap="round" />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)}
        y1={pad.t} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.45" />
    </svg>
  );
}

// ── Main ArcGraph component ───────────────────────────────────────────────────
const VIEWS = [
  { key: "arc",     label: "Arc" },
  { key: "stacked", label: "Sources" },
  { key: "columns", label: "Decades" },
  { key: "band",    label: "Scenarios" },
];

export default function ArcGraph({
  t,
  chartData = [],
  currentAge = 30,
  retirementAge = 65,
  lifeExpect = 90,
  contribSeries = null,
  height = 300,
  glow = true,
  strokeWidth = 3,
  activeView = "arc",
  onViewChange,
  showToggle = true,
  scenarioData = null, // optional [{age,total}] — renders a dotted overlay on the arc view
}) {
  const pad = { l: 62, r: 92, t: 38, b: 46 };

  const validData = useMemo(() =>
    chartData.filter(d => d.age >= currentAge && d.age <= Math.max(lifeExpect, 90)),
    [chartData, currentAge, lifeExpect]);

  const ageMin = AGE_SPAN_FIXED_START;
  const ageMax = Math.max(lifeExpect, 90);

  const vmax = useMemo(() => {
    if (!validData.length) return 3.5e6;
    const raw = Math.max(...validData.map(d => d.total));
    return Math.max(1e6, Math.ceil(raw / 500_000) * 500_000 * 1.05);
  }, [validData]);

  const s = useMemo(() => makeScales(height, pad, ageMin, ageMax, vmax),
    [height, ageMin, ageMax, vmax]);

  const gid = `arc-${activeView}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {showToggle && (
        <div style={{ display: "flex", gap: 1, padding: 3, borderRadius: 10,
          background: t.line, alignSelf: "flex-start" }}>
          {VIEWS.map(({ key, label }) => {
            const on = activeView === key;
            return (
              <button key={key} onClick={() => onViewChange?.(key)}
                style={{
                  padding: "4px 13px", borderRadius: 7, border: "none", cursor: "pointer",
                  background: on ? t.surf2 : "transparent",
                  font: `${on ? 600 : 500} 12px ${HF}`,
                  color: on ? t.ink : t.mut,
                  boxShadow: on ? "0 1px 4px rgba(0,0,0,.10)" : "none",
                  transition: "all .12s"
                }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{
        position: "relative", width: "100%", height,
        borderRadius: 16, overflow: "hidden",
        border: `1px solid ${t.line}`, background: t.surf
      }}>
        <svg width="100%" viewBox={`0 0 ${VW} ${height}`}
          preserveAspectRatio="none"
          style={{ display: "block", height }}>

          {activeView === "arc" && (
            <ArcView t={t} gid={gid} H={height} glow={glow} strokeWidth={strokeWidth}
              chartData={validData} currentAge={currentAge}
              retirementAge={retirementAge} lifeExpect={lifeExpect}
              vmax={vmax} s={s} />
          )}

          {activeView === "stacked" && (
            <SourcesView t={t} gid={gid} H={height}
              chartData={validData} contribSeries={contribSeries}
              currentAge={currentAge} retirementAge={retirementAge}
              s={s} vmax={vmax} />
          )}

          {activeView === "columns" && (
            <DecadesView t={t} gid={gid} H={height}
              chartData={validData} currentAge={currentAge}
              retirementAge={retirementAge} s={s} vmax={vmax} />
          )}

          {activeView === "band" && (
            <BandView t={t} gid={gid} H={height}
              chartData={validData} currentAge={currentAge}
              retirementAge={retirementAge} s={s} vmax={vmax} />
          )}

          {/* scenario dotted overlay — shown in arc view only */}
          {activeView === "arc" && scenarioData?.length >= 2 && (() => {
            const sPts = scenarioData
              .filter(d => d.age >= ageMin && d.age <= ageMax)
              .map(d => [s.xOf(d.age), +s.yOf(Math.max(0, Math.min(d.total, vmax * 1.02))).toFixed(1)]);
            return sPts.length >= 2 ? (
              <path d={smoothPath(sPts)} fill="none"
                stroke={t.accent} strokeWidth="2.4" strokeDasharray="8 5" opacity="0.85" />
            ) : null;
          })()}
        </svg>
      </div>
    </div>
  );
}
