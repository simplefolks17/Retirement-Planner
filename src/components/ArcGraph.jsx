// ArcGraph — 4-view portfolio chart wired to real totalChartData.
// Views: Arc (milestone stops) · Sources (contrib vs growth) · Decades (5-yr bars) · Scenarios (band)
//
// Rendering model (rewritten for crisp, undistorted output at any width):
//   - The chart container is measured with a ResizeObserver.
//   - The SVG viewBox height is derived from the container's real aspect ratio
//     (vbH = VW * h / w) so preserveAspectRatio="none" scales x and y equally —
//     circles stay round and the curve is never vertically compressed.
//   - All TEXT lives in a sibling HTML overlay (not inside <foreignObject>), so
//     labels render at true DOM sizes and stay sharp on narrow/mobile screens.
//
// Props:
//   t, chartData [{age,total}], currentAge, retirementAge, lifeExpect,
//   contribSeries [{age,contrib}] (optional), height (number, default 300),
//   fillHeight (bool — grow to fill parent instead of fixed height),
//   glow (bool), strokeWidth (number), activeView, onViewChange, showToggle,
//   compact (bool — fewer pills/ticks for small viewports),
//   scenarioData [{age,total}] (optional dotted overlay on the arc view),
//   events [{age,label,isInflow,icon?}] (optional, WI-1.3/#90 upgraded) —
//     committed moneyEvents shown as icon badges with a stem down to the curve;
//     inflow = good token, outflow = warm. events=[] renders pixel-identical to
//     no prop (no extra chrome).
//   onEventTap (fn(ev), optional) — badge tap handler; Plan/Ideas open the
//     life-event edit sheet. Badge taps stopPropagation so they never scrub.

import React, { useMemo, useRef, useState, useEffect, useLayoutEffect, useId } from "react";
import { HF, HM } from "../horizon/ThemeContext.jsx";

const VW = 1200;
const AGE_SPAN_FIXED_START = 30; // coordinate system always starts at 30 for consistent scale

// ── element-size hook (ResizeObserver) ────────────────────────────────────────
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 1180, h: 280 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        setSize(prev => (Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5)
          ? prev : { w: r.width, h: r.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

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

// ── Scenario overlay trimming (Plan "Try a change", 2026-07-11) ────────────────
// A scenario series (from calcWhatIfScenario) is a FULL lifetime walk that
// coincides with the solid chartData line right up until the change actually
// bites (e.g. a retire-later override doesn't move the balance until the new
// retirement age). Retracing the dashed line from the very start would just
// draw a second line on top of the first one — so this drops LEADING points
// whose total matches chartData's total at the same age within $1, keeping the
// LAST matching point so the dashed line starts exactly ON the solid line at
// the divergence age. Pure layout trimming (no model math): if every point
// matches, the caller's own `sPts.length >= 2` guard renders nothing.
function trimScenarioOverlay(scenarioData, mainData) {
  if (!scenarioData?.length) return scenarioData ?? [];
  let cut = 0;
  for (let i = 0; i < scenarioData.length; i++) {
    const d = scenarioData[i];
    if (Math.abs(d.total - totalAtAge(mainData, d.age)) <= 1) {
      cut = i;
    } else {
      break;
    }
  }
  return scenarioData.slice(cut);
}

// ── Scrub lookup (WI-2.7) ─────────────────────────────────────────────────────
// Given a raw (possibly fractional) age from a pointer position, snap to the
// nearest charted year and return that year's numbers for the floating chip.
// Pure (no pixel math) so it can be unit-tested against the Year-by-year table:
//   { age, total, walk }  where walk = { draw, growth, tax } when a retirement
//   walk row exists for that age, else null (accumulation years have no draw/tax).
// total comes from the same chartData series the arc draws, so the chip can never
// disagree with the curve. Returns null when there is no data.
export function scrubPointForAge(chartData, walkRows, rawAge) {
  if (!chartData?.length) return null;
  // Snap to the nearest charted age (the series is yearly).
  let nearest = chartData[0];
  for (const d of chartData) {
    if (Math.abs(d.age - rawAge) < Math.abs(nearest.age - rawAge)) nearest = d;
  }
  const wr = (walkRows ?? []).find(r => r.age === nearest.age);
  return {
    age: nearest.age,
    total: nearest.total,
    walk: wr ? { draw: Math.round(wr.draw), growth: Math.round(wr.growth), tax: Math.round(wr.tax) } : null,
  };
}

// ── Shared scales ─────────────────────────────────────────────────────────────
function makeScales(H, pad, ageMin, ageMax, vmax) {
  const top = pad.t;
  const bot = H - pad.b;
  const xOf = (a) => pad.l + (a - ageMin) / (ageMax - ageMin) * (VW - pad.l - pad.r);
  const yOf = (v) => top + (1 - v / vmax) * (bot - top);
  return { xOf, yOf, top, bot, H, pad };
}

// Overlay positioning helpers — percentages of the viewBox, which fills the
// container exactly, so they map 1:1 onto the HTML overlay layer.
const px = (x) => `${(x / VW) * 100}%`;
const py = (y, H) => `${(y / H) * 100}%`;

function GridLines({ t, s, vals }) {
  return (
    <g>
      {vals.map((gv, i) => (
        <line key={i} x1={s.pad.l} x2={VW - s.pad.r}
          y1={s.yOf(gv)} y2={s.yOf(gv)}
          stroke={t.ink} strokeWidth="1" opacity="0.07" strokeDasharray="2 7"
          vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

const gridVals = (vmax) => [1e6, 2e6, 3e6, 4e6, 5e6].filter(v => v <= vmax * 0.95);

// ════════════════════════════════════════════════════════════════════════════
//  ARC VIEW
// ════════════════════════════════════════════════════════════════════════════
function arcModel({ chartData, currentAge, retirementAge, lifeExpect, compact, s }) {
  const pts = chartData.map(d => [s.xOf(d.age), +s.yOf(d.total).toFixed(1)]);
  const m1age = crossAgeFromData(chartData, 1e6);
  const m2age = crossAgeFromData(chartData, 2e6);
  const stops = [
    { age: currentAge, label: "Today", ck: "good", above: true, targetVal: totalAtAge(chartData, currentAge) },
    m1age ? { age: m1age, label: "First Million", ck: "accent", above: true, targetVal: 1e6 } : null,
    (!compact && m2age) ? { age: m2age, label: "Second Million", ck: "accent", above: false, targetVal: 2e6 } : null,
    { age: retirementAge, label: "Retire", ck: "accent", above: false, targetVal: totalAtAge(chartData, retirementAge) },
  ].filter(Boolean);
  return { pts, stops };
}

function ArcSvg({ t, gid, glow, strokeWidth, chartData, currentAge, retirementAge, lifeExpect, vmax, compact, s }) {
  const { pts, stops } = useMemo(
    () => arcModel({ chartData, currentAge, retirementAge, lifeExpect, compact, s }),
    [chartData, currentAge, retirementAge, lifeExpect, compact, s]);
  if (pts.length < 2) return null;

  const line = smoothPath(pts);
  const lastPt = pts[pts.length - 1];
  const area = line + ` L ${lastPt[0]} ${s.bot} L ${s.xOf(currentAge)} ${s.bot} Z`;
  const endAge = lifeExpect;
  const endTotal = totalAtAge(chartData, endAge);
  const xEnd = s.xOf(endAge), yEnd = s.yOf(endTotal);

  return (
    <>
      <defs>
        <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good} stopOpacity="0.20" />
          <stop offset="55%" stopColor={t.accent} stopOpacity="0.34" />
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.24" />
        </linearGradient>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good} />
          <stop offset="55%" stopColor={t.accent} />
          <stop offset="100%" stopColor={t.warm} />
        </linearGradient>
        {glow && (
          <filter id={`${gid}-gf`} x="-5%" y="-60%" width="110%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={t.accent} floodOpacity="0.30" />
          </filter>
        )}
      </defs>
      <rect x={s.xOf(retirementAge)} y={s.top}
        width={Math.max(0, VW - s.pad.r - s.xOf(retirementAge))}
        height={s.bot - s.top} fill={t.warm} opacity="0.055" />
      <GridLines t={t} s={s} vals={gridVals(vmax)} />
      <path d={area} fill={`url(#${gid}-f)`} />
      <path d={line} fill="none" stroke={`url(#${gid}-l)`}
        strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke"
        filter={glow ? `url(#${gid}-gf)` : undefined} />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)} y1={s.top - 2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.42"
        vectorEffect="non-scaling-stroke" />
      {stops.map(({ age, ck, above }) => {
        const cx = s.xOf(age), cy = s.yOf(totalAtAge(chartData, age)), len = 18;
        return (
          <line key={`ln-${age}`} x1={cx} x2={cx}
            y1={above ? cy - 5.5 : cy + 5.5} y2={above ? cy - len : cy + len}
            stroke={t[ck]} strokeWidth="1" opacity="0.38" vectorEffect="non-scaling-stroke" />
        );
      })}
      {stops.map(({ age, ck }) => (
        <circle key={age} cx={s.xOf(age)} cy={s.yOf(totalAtAge(chartData, age))}
          r={age === retirementAge ? 6 : 5} fill={t.surf} stroke={t[ck]} strokeWidth="2.5"
          vectorEffect="non-scaling-stroke" />
      ))}
      <circle cx={xEnd} cy={yEnd} r="5" fill={t.surf} stroke={t.warm} strokeWidth="2.5"
        vectorEffect="non-scaling-stroke" />
    </>
  );
}

function ArcLabels({ t, H, chartData, currentAge, retirementAge, lifeExpect, vmax, compact, s }) {
  // Pixel positions are computed inside the memo together with stop metadata so that
  // they're always recomputed atomically when chartData or the scale changes.
  const { stops, endPos } = useMemo(() => {
    const model = arcModel({ chartData, currentAge, retirementAge, lifeExpect, compact, s });
    const stopsWithPos = model.stops.map(({ age, label, above, ck, targetVal }) => {
      const cx = s.xOf(age);
      const cy = s.yOf(totalAtAge(chartData, age));
      const yTop = above ? cy - 26 : cy + 26;
      return { age, label, above, ck, targetVal, cx, cy, yTop };
    });
    const endAge = lifeExpect;
    const endTotal = totalAtAge(chartData, endAge);
    return {
      stops: stopsWithPos,
      endPos: { xEnd: s.xOf(endAge), yEnd: s.yOf(endTotal), endTotal, endAge },
    };
  }, [chartData, currentAge, retirementAge, lifeExpect, compact, s]);

  const ticks = (compact ? [40, 55, 70, 85] : [40, 50, 60, 70, 80])
    .filter(a => a > currentAge + 2 && a <= lifeExpect);

  return (
    <>
      {gridVals(vmax).map(gv => (
        <div key={gv} style={{
          position: "absolute", left: px(s.pad.l - 8), top: py(s.yOf(gv), H),
          transform: "translate(-100%,-50%)", font: `600 10px ${HM}`, color: t.faint, whiteSpace: "nowrap"
        }}>{fmtMoney(gv)}</div>
      ))}
      {/* currentAge label at arc start — no centering transform so it hugs the left edge */}
      <div style={{
        position: "absolute", left: px(s.xOf(currentAge)), top: py(s.bot + 16, H),
        font: `700 10px ${HM}`, color: t.good
      }}>{currentAge}</div>
      {ticks.map(a => (
        <div key={a} style={{
          position: "absolute", left: px(s.xOf(a)), top: py(s.bot + 16, H),
          transform: "translateX(-50%)", font: `600 10px ${HM}`, color: t.faint
        }}>{a}</div>
      ))}
      {stops.map(({ age, label, above, ck, targetVal, cx, yTop }) => {
        const c = t[ck];
        const xShift = age === currentAge ? "0%" : "-50%";
        const yShift = above ? "-100%" : "0%";
        return (
          <div key={age} style={{
            position: "absolute", left: px(cx), top: py(yTop, H),
            transform: `translate(${xShift},${yShift})`, whiteSpace: "nowrap"
          }}>
            <div style={{
              display: "inline-block", background: t.surf, border: `1.5px solid ${c}50`,
              borderRadius: 9, padding: "4px 10px", boxShadow: "0 2px 10px rgba(0,0,0,.09)"
            }}>
              <div style={{ font: `500 9.5px ${HF}`, color: t.mut, letterSpacing: "0.03em", marginBottom: 1 }}>{label}</div>
              <div style={{ font: `600 12px ${HM}`, color: c }}>{fmtMoney(targetVal)}</div>
            </div>
          </div>
        );
      })}
      <div style={{
        position: "absolute", left: px(endPos.xEnd), top: py(endPos.yEnd, H),
        transform: "translate(-100%,-50%)", marginLeft: -14,
        background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 11, padding: "7px 12px",
        boxShadow: "0 4px 16px rgba(0,0,0,.11)", whiteSpace: "nowrap", zIndex: 2
      }}>
        <div style={{ font: `700 13px ${HM}`, color: t.warm }}>{fmtMoney(endPos.endTotal)} at {endPos.endAge}</div>
        {/* Review fix: this used to claim "still covered, for life" unconditionally,
            including when endTotal is $0 — a depleted plan showing a fabricated
            reassurance beside its own $0 figure. Only claim coverage when the
            balance shown is actually positive; otherwise the $0 figure speaks
            for itself (no invented warning copy, per rule 10 — don't fabricate). */}
        {endPos.endTotal > 0 && (
          <div style={{ font: `500 10.5px ${HF}`, color: t.mut, marginTop: 1 }}>still covered, for life</div>
        )}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCES VIEW
// ════════════════════════════════════════════════════════════════════════════
function sourcesModel({ chartData, contribSeries, s }) {
  const tPts = chartData.map(d => [s.xOf(d.age), +s.yOf(d.total).toFixed(1)]);
  const cPts = contribSeries?.length
    ? contribSeries.map(d => [s.xOf(d.age), +s.yOf(d.contrib).toFixed(1)]) : [];
  const hasSplit = cPts.length >= 2;
  // Clip the total arc to working years only so the growth band closes correctly at
  // retirement (cPts covers currentAge→retirementAge; tPts covers currentAge→lifeExpect).
  const workingTLine = hasSplit ? smoothPath(tPts.slice(0, cPts.length)) : null;
  return { tPts, cPts, hasSplit, workingTLine };
}

function SourcesSvg({ t, gid, chartData, contribSeries, currentAge, retirementAge, s, vmax }) {
  const { tPts, cPts, hasSplit, workingTLine } = useMemo(
    () => sourcesModel({ chartData, contribSeries, s }), [chartData, contribSeries, s]);
  if (tPts.length < 2) return null;

  const tLine = smoothPath(tPts);
  const lastContrib = cPts.length ? cPts[cPts.length - 1] : null;
  const cLine = hasSplit ? smoothPath(cPts) : null;
  // Growth area: between the working-year total arc and the contribution line.
  // workingTLine ends at retirementAge; reversed cPts walks back from retirementAge to start.
  const gArea = hasSplit
    ? workingTLine + " " + cPts.slice().reverse().map(p => `L ${p[0]} ${p[1]}`).join(" ") + " Z"
    : null;
  const cArea = hasSplit
    ? cLine + ` L ${lastContrib[0]} ${s.bot} L ${s.xOf(currentAge)} ${s.bot} Z` : null;

  return (
    <>
      <defs>
        <linearGradient id={`${gid}-wf`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.warm} stopOpacity="0.52" />
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <GridLines t={t} s={s} vals={gridVals(vmax)} />
      {hasSplit && <path d={gArea} fill={`url(#${gid}-wf)`} />}
      {hasSplit && <path d={cArea} fill={t.good} fillOpacity="0.20" />}
      {hasSplit && <path d={cLine} fill="none" stroke={t.good} strokeWidth="1.8" opacity="0.60" vectorEffect="non-scaling-stroke" />}
      <path d={tLine} fill="none" stroke={t.accent} strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)} y1={s.top - 2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.42" vectorEffect="non-scaling-stroke" />
      <circle cx={s.xOf(retirementAge)} cy={s.yOf(totalAtAge(chartData, retirementAge))}
        r="5.5" fill={t.accent} stroke={t.surf} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={s.xOf(currentAge)} cy={s.yOf(totalAtAge(chartData, currentAge))}
        r="4.5" fill={t.good} stroke={t.surf} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </>
  );
}

function LegendOverlay({ t, s, items }) {
  return (
    <div style={{
      position: "absolute", left: px(s.pad.l + 6), top: 12,
      display: "flex", gap: 14, pointerEvents: "none"
    }}>
      {items.map(([l, c]) => (
        <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, font: `600 10.5px ${HF}`, color: t.mut }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: c, opacity: 0.82 }} />
          {l}
        </span>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  DECADES VIEW
// ════════════════════════════════════════════════════════════════════════════
function decadeAges(currentAge) {
  const ages = [];
  let a = Math.ceil(currentAge / 5) * 5;
  while (a <= 90) { ages.push(a); a += 5; }
  return ages;
}

function DecadesSvg({ t, gid, chartData, currentAge, retirementAge, s, vmax }) {
  const ages = decadeAges(currentAge);
  const bw = Math.min(54, (VW - s.pad.l - s.pad.r) / Math.max(ages.length, 1) * 0.6);
  return (
    <>
      <defs>
        <linearGradient id={`${gid}-acc`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.good} stopOpacity="0.72" />
          <stop offset="100%" stopColor={t.good} stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={`${gid}-ret`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.warm} stopOpacity="0.78" />
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <GridLines t={t} s={s} vals={gridVals(vmax)} />
      {ages.map(age => {
        const bal = totalAtAge(chartData, age);
        const x = s.xOf(age), y = s.yOf(bal);
        const isPost = age >= retirementAge;
        const fillId = isPost ? `url(#${gid}-ret)` : `url(#${gid}-acc)`;
        const capCol = isPost ? t.warm : t.good;
        return (
          <g key={age}>
            <rect x={x - bw / 2} y={y} width={bw} height={Math.max(0, s.bot - y)} rx="5" fill={fillId}
              stroke={age === retirementAge ? t.warm : "none"} strokeWidth={age === retirementAge ? 1.5 : 0} />
            <rect x={x - bw / 2} y={y} width={bw} height={age === retirementAge ? 6 : 4} rx="2.5"
              fill={capCol} opacity={age === retirementAge ? 1 : 0.88} />
          </g>
        );
      })}
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)} y1={s.top - 4} y2={s.bot}
        stroke={t.warm} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.35" vectorEffect="non-scaling-stroke" />
    </>
  );
}

function DecadesLabels({ t, H, chartData, currentAge, retirementAge, s }) {
  const ages = decadeAges(currentAge);
  return (
    <>
      {ages.map(age => (
        <div key={age} style={{
          position: "absolute", left: px(s.xOf(age)), top: py(s.bot + 16, H),
          transform: "translateX(-50%)", font: `600 10px ${HM}`, color: t.faint
        }}>{age}</div>
      ))}
      {[currentAge, retirementAge].map(age => {
        const bal = totalAtAge(chartData, age);
        return (
          <div key={age} style={{
            position: "absolute", left: px(s.xOf(age)), top: py(s.yOf(bal), H),
            transform: "translate(-50%,-150%)", font: `700 11px ${HM}`,
            color: age >= retirementAge ? t.warm : t.good, whiteSpace: "nowrap"
          }}>{fmtMoney(bal)}</div>
        );
      })}
      <LegendOverlay t={t} s={s} items={[["Accumulation", t.good], ["Retirement", t.warm]]} />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SCENARIOS / BAND VIEW
// ════════════════════════════════════════════════════════════════════════════
// ILLUSTRATIVE shading only — the uncertainty cone is decorative, not a model
// output (no Monte Carlo behind it yet; see roadmap WI-5.3). The lower band is
// drawn slightly narrower than the upper band purely for visual balance.
const CONE_LOWER_ASYMMETRY = 0.92;

function bandModel({ chartData, currentAge, vmax, s }) {
  const spread = (age) => Math.min(0.28, (age - currentAge) / 60 * 0.30);
  const midPts = chartData.map(d => [s.xOf(d.age), +s.yOf(d.total).toFixed(1)]);
  const upPts = chartData.map(d => [s.xOf(d.age), +s.yOf(Math.min(d.total * (1 + spread(d.age)), vmax * 0.97)).toFixed(1)]);
  const loPts = chartData.map(d => [s.xOf(d.age), +s.yOf(Math.max(d.total * (1 - spread(d.age) * CONE_LOWER_ASYMMETRY), 0)).toFixed(1)]);
  const last = chartData[chartData.length - 1];
  const leanFinalTotal = last ? Math.max(last.total * (1 - spread(last.age) * CONE_LOWER_ASYMMETRY), 0) : 0;
  return { spread, midPts, upPts, loPts, leanFinalTotal };
}

function BandSvg({ t, chartData, currentAge, retirementAge, s, vmax }) {
  const { midPts, upPts, loPts } = useMemo(() => bandModel({ chartData, currentAge, vmax, s }), [chartData, currentAge, vmax, s]);
  if (midPts.length < 2) return null;
  const coneArea = smoothPath(upPts) + " L " + loPts.slice().reverse().map(p => p.join(" ")).join(" L ") + " Z";
  return (
    <>
      <GridLines t={t} s={s} vals={gridVals(vmax)} />
      <path d={coneArea} fill={t.accent} fillOpacity="0.11" />
      <path d={smoothPath(upPts)} fill="none" stroke={t.accent} strokeWidth="1.2" strokeDasharray="4 5" opacity="0.38" vectorEffect="non-scaling-stroke" />
      <path d={smoothPath(loPts)} fill="none" stroke={t.accent} strokeWidth="1.2" strokeDasharray="4 5" opacity="0.38" vectorEffect="non-scaling-stroke" />
      <path d={smoothPath(midPts)} fill="none" stroke={t.accent} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)} y1={s.top - 2} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.42" vectorEffect="non-scaling-stroke" />
      <circle cx={s.xOf(retirementAge)} cy={s.yOf(totalAtAge(chartData, retirementAge))} r="5.5" fill={t.accent} stroke={t.surf} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={s.xOf(currentAge)} cy={s.yOf(totalAtAge(chartData, currentAge))} r="4.5" fill={t.good} stroke={t.surf} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </>
  );
}

function BandLabels({ t, H, chartData, currentAge, s, vmax }) {
  const { spread, leanFinalTotal } = useMemo(() => bandModel({ chartData, currentAge, vmax, s }), [chartData, currentAge, vmax, s]);
  const labelAge = Math.min(Math.round((currentAge + 90) * 0.72), 85);
  const labelData = chartData.find(d => d.age === labelAge) ?? chartData[chartData.length - 1];
  const last = chartData[chartData.length - 1];
  if (!labelData || !last) return null;
  const sp = spread(labelAge);
  // Review fix: "Even lean: covered" used to render unconditionally, regardless of
  // whether the band's own lean-market line (the same formula bandModel's loPts
  // uses for the lower cone boundary) actually stays positive — a fabricated
  // reassurance next to a band that could show the lower line hitting $0.
  // leanFinalTotal comes from bandModel itself (one formula, not a duplicated copy).
  const leanCovered = leanFinalTotal > 0;
  return (
    <>
      <div style={{
        position: "absolute", left: px(s.xOf(labelAge)), top: py(s.yOf(labelData.total * (1 + sp)), H),
        transform: "translate(-50%,-125%)", font: `600 9.5px ${HF}`, color: t.mut
      }}>strong market</div>
      <div style={{
        position: "absolute", left: px(s.xOf(labelAge)), top: py(s.yOf(labelData.total * (1 - sp * CONE_LOWER_ASYMMETRY)), H),
        transform: "translate(-50%,44%)", font: `600 9.5px ${HF}`, color: t.mut
      }}>lean market</div>
      <div style={{
        position: "absolute", left: px(s.xOf(last.age)), top: py(s.yOf(last.total), H),
        transform: "translate(-100%,-50%)", marginLeft: -14,
        background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 11, padding: "7px 12px",
        boxShadow: "0 4px 16px rgba(0,0,0,.11)", whiteSpace: "nowrap", zIndex: 2
      }}>
        <div style={{ font: `700 13px ${HM}`, color: leanCovered ? t.warm : t.mut }}>
          {leanCovered ? "Even lean: covered" : `${fmtMoney(leanFinalTotal)} in a lean market`}
        </div>
        {leanCovered && (
          <div style={{ font: `500 10.5px ${HF}`, color: t.mut, marginTop: 1 }}>even in a lean market</div>
        )}
      </div>
    </>
  );
}

// ── Ghost Arc (background figurehead — onboarding / settings preview) ──────────
export function GhostArc({ t, opacity = 0.15, blur = 0, H = 200, currentAge = 30, retirementAge = 65 }) {
  const pad = { l: 62, r: 92, t: 38, b: 46 };
  const s = makeScales(H, pad, AGE_SPAN_FIXED_START, 90, 3.5e6);
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
    <svg width="100%" height={H} viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none"
      style={{ display: "block", opacity, filter: blur > 0 ? `blur(${blur}px)` : "none",
        transition: "opacity .6s ease, filter .6s ease" }}>
      <defs>
        <linearGradient id="hg-f" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good} stopOpacity="0.28" />
          <stop offset="55%" stopColor={t.accent} stopOpacity="0.36" />
          <stop offset="100%" stopColor={t.warm} stopOpacity="0.24" />
        </linearGradient>
        <linearGradient id="hg-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={t.good} />
          <stop offset="55%" stopColor={t.accent} />
          <stop offset="100%" stopColor={t.warm} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hg-f)" />
      <path d={line} fill="none" stroke="url(#hg-l)" strokeWidth="2.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={s.xOf(retirementAge)} x2={s.xOf(retirementAge)} y1={pad.t} y2={s.bot}
        stroke={t.accent} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.45" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Main ArcGraph component ───────────────────────────────────────────────────
const VIEWS = [
  { key: "arc", label: "Arc" },
  { key: "stacked", label: "Sources" },
  { key: "columns", label: "Decades" },
  { key: "band", label: "Scenarios" },
];

export default function ArcGraph({
  t,
  chartData = [],
  currentAge = 30,
  retirementAge = 65,
  lifeExpect = 90,
  events = [],
  contribSeries = null,
  walkRows = [],
  height = 300,
  fillHeight = false,
  glow = true,
  strokeWidth = 3,
  activeView = "arc",
  onViewChange,
  showToggle = true,
  compact = false,
  scenarioData = null,
  onEventTap = null,
}) {
  // Per-instance id so multiple ArcGraphs on one page don't share SVG gradient/
  // filter ids (which would cross-wire their fills). Combined with activeView below.
  const uid = useId();
  // Memoized so the scales memo below can list `pad` honestly in its deps
  // (a fresh object each render would defeat the memo — principle 13).
  const pad = useMemo(() => compact
    ? { l: 46, r: 60, t: 30, b: 40 }
    : { l: 62, r: 92, t: 38, b: 46 }, [compact]);

  const [boxRef, { w, h }] = useSize();

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

  // viewBox height derived from the container's true aspect ratio, so
  // preserveAspectRatio="none" scales x and y equally (no distortion).
  const vbH = useMemo(() => {
    const ratio = w > 0 ? h / w : 0.25;
    return Math.max(160, VW * ratio);
  }, [w, h]);

  const s = useMemo(() => makeScales(vbH, pad, ageMin, ageMax, vmax),
    [vbH, pad, ageMin, ageMax, vmax]);

  const gid = `arc-${uid}-${activeView}`;

  // ── Tap-to-scrub (WI-2.7) ───────────────────────────────────────────────────
  // Touch/drag (mobile) or hover (desktop) over the chart → a floating chip with
  // that year's age + total, plus draw/growth/tax when a retirement walk row
  // exists. Inverse-scaling x→age is pure layout math; the displayed numbers come
  // straight from chartData / walkRows via scrubPointForAge (no new model math).
  const [scrub, setScrub] = useState(null);
  useEffect(() => { setScrub(null); }, [activeView]);
  const onScrubMove = (clientX) => {
    const el = boxRef.current;
    if (!el || !validData.length) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const xVB = ((clientX - rect.left) / rect.width) * VW;          // px → viewBox x
    const plot = VW - pad.l - pad.r;
    const rawAge = ageMin + ((xVB - pad.l) / plot) * (ageMax - ageMin);  // inverse xOf
    const pt = scrubPointForAge(validData, walkRows, rawAge);
    if (pt) setScrub(pt);
  };
  const scrubHandlers = {
    onPointerMove: (e) => onScrubMove(e.clientX),
    onPointerDown: (e) => onScrubMove(e.clientX),
    onPointerLeave: () => setScrub(null),
    onTouchMove: (e) => { if (e.touches[0]) onScrubMove(e.touches[0].clientX); },
    onTouchEnd: () => setScrub(null),
  };

  const overlayLayer = (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {activeView === "arc" && validData.length >= 2 && (
        <ArcLabels t={t} H={vbH} chartData={validData} currentAge={currentAge}
          retirementAge={retirementAge} lifeExpect={lifeExpect} vmax={vmax} compact={compact} s={s} />
      )}
      {activeView === "stacked" && contribSeries?.length >= 2 && (
        <LegendOverlay t={t} s={s} items={[["Market growth", t.warm], ["Your contributions", t.good]]} />
      )}
      {activeView === "columns" && validData.length >= 2 && (
        <DecadesLabels t={t} H={vbH} chartData={validData} currentAge={currentAge}
          retirementAge={retirementAge} s={s} />
      )}
      {activeView === "band" && validData.length >= 2 && (
        <BandLabels t={t} H={vbH} chartData={validData} currentAge={currentAge} s={s} vmax={vmax} />
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: fillHeight ? 1 : "none", minHeight: 0 }}>
      {showToggle && (
        <div style={{ display: "flex", gap: 1, padding: 3, borderRadius: 10, background: t.line, alignSelf: "flex-start" }}>
          {VIEWS.map(({ key, label }) => {
            const on = activeView === key;
            return (
              <button key={key} onClick={() => onViewChange?.(key)} style={{
                padding: "4px 13px", borderRadius: 7, border: "none", cursor: "pointer",
                background: on ? t.surf2 : "transparent", font: `${on ? 600 : 500} 12px ${HF}`,
                color: on ? t.ink : t.mut, boxShadow: on ? "0 1px 4px rgba(0,0,0,.10)" : "none", transition: "all .12s"
              }}>{label}</button>
            );
          })}
        </div>
      )}

      <div ref={boxRef} {...scrubHandlers} style={{
        position: "relative", width: "100%",
        height: fillHeight ? "auto" : height, flex: fillHeight ? 1 : "none", minHeight: fillHeight ? 200 : height,
        borderRadius: 16, overflow: "hidden", border: `1px solid ${t.line}`, background: t.surf,
        touchAction: "pan-y", cursor: validData.length ? "crosshair" : "default",
      }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${vbH}`} preserveAspectRatio="none"
          style={{ display: "block", position: "absolute", inset: 0 }}>
          {activeView === "arc" && (
            <ArcSvg t={t} gid={gid} glow={glow} strokeWidth={strokeWidth}
              chartData={validData} currentAge={currentAge} retirementAge={retirementAge}
              lifeExpect={lifeExpect} vmax={vmax} compact={compact} s={s} />
          )}
          {activeView === "stacked" && (
            <SourcesSvg t={t} gid={gid} chartData={validData} contribSeries={contribSeries}
              currentAge={currentAge} retirementAge={retirementAge} s={s} vmax={vmax} />
          )}
          {activeView === "columns" && (
            <DecadesSvg t={t} gid={gid} chartData={validData} currentAge={currentAge}
              retirementAge={retirementAge} s={s} vmax={vmax} />
          )}
          {activeView === "band" && (
            <BandSvg t={t} chartData={validData} currentAge={currentAge} retirementAge={retirementAge} s={s} vmax={vmax} />
          )}
          {activeView === "arc" && scenarioData?.length >= 2 && (() => {
            const sPts = trimScenarioOverlay(scenarioData, chartData)
              .filter(d => d.age >= ageMin && d.age <= ageMax)
              .map(d => [s.xOf(d.age), +s.yOf(Math.max(0, Math.min(d.total, vmax * 1.02))).toFixed(1)]);
            return sPts.length >= 2 ? (
              <path d={smoothPath(sPts)} fill="none" stroke={t.accent} strokeWidth="2.4"
                strokeDasharray="8 5" opacity="0.85" vectorEffect="non-scaling-stroke" />
            ) : null;
          })()}
          {/* WI-1.3 (#90), upgraded (life-event placement): committed moneyEvents
              render as icon badges pinned to the curve with a stem — the video-
              inspired treatment. Inflow = good token, outflow = warm. Tapping a
              badge fires onEventTap(ev) (Plan/Ideas open the edit sheet); the
              pointerDown stops propagation so a badge tap never scrubs.
              events=[] → nothing rendered (pixel-identical to no prop). */}
          {activeView === "arc" && events.map((ev, evIdx) => {
            const cx = s.xOf(ev.age);
            const cy = s.yOf(totalAtAge(validData, ev.age));
            if (cx < s.pad.l || cx > VW - s.pad.r) return null;
            const color = ev.isInflow ? t.good : t.warm;
            // Badge floats above the curve; clamped so it never leaves the plot.
            const by = Math.max(s.top + 16, cy - 36);
            return (
              <g key={`ev-${evIdx}-${ev.age}-${ev.label}`}
                onClick={() => onEventTap?.(ev)}
                onPointerDown={(e) => { if (onEventTap) e.stopPropagation(); }}
                tabIndex={onEventTap ? 0 : undefined}
                role={onEventTap ? "button" : undefined}
                aria-label={onEventTap ? `${ev.label}, age ${ev.age} — edit` : undefined}
                onKeyDown={onEventTap ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (e.key === " ") e.preventDefault();
                    onEventTap(ev);
                  }
                } : undefined}
                style={{ cursor: onEventTap ? "pointer" : "default" }}>
                <line x1={cx} x2={cx} y1={cy - 4} y2={by + 13}
                  stroke={color} strokeWidth="1.2" opacity="0.55"
                  vectorEffect="non-scaling-stroke" />
                <circle cx={cx} cy={cy} r="3.5" fill={color} stroke={t.surf}
                  strokeWidth="1.5" opacity="0.9" vectorEffect="non-scaling-stroke" />
                <circle cx={cx} cy={by} r="13" fill={t.surf} stroke={color}
                  strokeWidth="2" vectorEffect="non-scaling-stroke">
                  <title>{ev.label} · age {ev.age}</title>
                </circle>
                <text x={cx} y={by} textAnchor="middle" dominantBaseline="central"
                  fontSize="13" style={{ userSelect: "none", pointerEvents: "none" }}>
                  {ev.icon ?? (ev.isInflow ? "＋" : "－")}
                </text>
              </g>
            );
          })}
          {/* WI-2.7: scrub indicator — vertical line + dot at the touched year */}
          {scrub && (
            <g pointerEvents="none">
              <line x1={s.xOf(scrub.age)} x2={s.xOf(scrub.age)} y1={s.top} y2={s.bot}
                stroke={t.ink} strokeWidth="1" opacity="0.28" strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke" />
              <circle cx={s.xOf(scrub.age)} cy={s.yOf(scrub.total)} r="5.5"
                fill={t.accent} stroke={t.surf} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
        {overlayLayer}
        {/* WI-2.7: floating chip — age + total, plus draw/growth/tax in retirement.
            Clamped horizontally so it stays on-screen near either edge. */}
        {scrub && (
          <div style={{
            position: "absolute",
            left: px(Math.min(Math.max(s.xOf(scrub.age), s.pad.l + 60), VW - s.pad.r - 60)),
            top: py(s.yOf(scrub.total), vbH),
            transform: "translate(-50%,-130%)", pointerEvents: "none", zIndex: 3,
            background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 10,
            padding: "6px 11px", boxShadow: "0 4px 16px rgba(0,0,0,.13)", whiteSpace: "nowrap",
          }}>
            <div style={{ font: `500 9.5px ${HF}`, color: t.mut }}>Age {scrub.age}</div>
            <div style={{ font: `700 13px ${HM}`, color: t.ink }}>{fmtMoney(scrub.total)}</div>
            {scrub.walk && (
              <div style={{ font: `500 9.5px ${HM}`, color: t.faint, marginTop: 2 }}>
                {scrub.walk.draw > 0 ? `−${fmtMoney(scrub.walk.draw)} draw` : "no draw"}
                {scrub.walk.growth > 0 ? ` · +${fmtMoney(scrub.walk.growth)} growth` : ""}
                {scrub.walk.tax > 0 ? ` · −${fmtMoney(scrub.walk.tax)} tax` : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
