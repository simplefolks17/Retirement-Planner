import React, { useState, useMemo, useRef, useEffect } from "react";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";

const SERIF = "Georgia, 'Times New Roman', serif";

function StmtCol({ t, title, items, bar }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        font: `600 11px ${HF}`, color: t.accent, letterSpacing: "0.08em",
        textTransform: "uppercase", marginBottom: 12,
        borderBottom: `1.5px solid ${t.line2}`, paddingBottom: 8
      }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {items.map(([label, val, foot, strong]) => (
          <div key={label} style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", gap: 12
          }}>
            <span style={{ font: `${strong ? 600 : 400} 14px ${SERIF}`, color: strong ? t.ink : t.mut, whiteSpace: "nowrap" }}>
              {label}{foot && <sup style={{ font: `700 10px ${HF}`, color: t.accent }}>{foot}</sup>}
            </span>
            <span style={{ font: `${strong ? 600 : 400} 14px ${HM}`, color: t.ink, whiteSpace: "nowrap" }}>
              {val}
            </span>
          </div>
        ))}
      </div>
      {bar && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", height: 22, borderRadius: 7, overflow: "hidden", border: `1px solid ${t.line2}` }}>
            {bar.segs.map((seg, i) => (
              <div key={i} style={{
                flex: seg.f, background: seg.c, opacity: 0.7,
                borderRight: i < bar.segs.length - 1 ? `1px solid ${t.surf}` : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                font: `600 10px ${HF}`, color: t.surf,
                minWidth: 0, overflow: "hidden", whiteSpace: "nowrap"
              }}>{seg.l}</div>
            ))}
          </div>
          <div style={{ font: `400 11px ${SERIF}`, color: t.faint, marginTop: 4, fontStyle: "italic" }}>{bar.cap}</div>
        </div>
      )}
    </div>
  );
}

// ── Income Sankey ─────────────────────────────────────────────────────────────
// Responsive flow diagram drawn in actual pixel space (no viewBox scaling).
// ResizeObserver keeps `w` in sync with the SVG wrapper so bezier control
// points are always computed in the rendered coordinate system — this is
// what makes the S-curves smooth rather than blocky.
function IncomeSankey({ t, income, tax, save, keep }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(420);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setW(el.offsetWidth || 420);
    const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 310, PADV = 14, GAP = 65, NW = 16;
  const usable = H - PADV * 2;
  const rUsable = usable - GAP * 2;
  const total = Math.max(tax + save + keep, 1);

  const lH = {
    tax:  (tax  / total) * usable,
    save: (save / total) * usable,
    keep: usable - (tax / total) * usable - (save / total) * usable,
  };
  const lY = { tax: PADV, save: PADV + lH.tax, keep: PADV + lH.tax + lH.save };

  const rH = {
    tax:  (tax  / total) * rUsable,
    save: (save / total) * rUsable,
    keep: rUsable - (tax / total) * rUsable - (save / total) * rUsable,
  };
  const rY = { tax: PADV, save: PADV + rH.tax + GAP, keep: PADV + rH.tax + GAP + rH.save + GAP };

  // Pixel-space ribbon path. Control points at 45% and 55% of horizontal span
  // (not both at the midpoint) produce a natural S-curve at any container width.
  const LX = NW, RX = w - NW, dx = RX - LX;
  const C1 = LX + dx * 0.45, C2 = LX + dx * 0.55;
  const ribbon = k => {
    const lt = lY[k], lb = lY[k] + lH[k];
    const rt = rY[k], rb = rY[k] + rH[k];
    return `M${LX} ${lt} C${C1} ${lt} ${C2} ${rt} ${RX} ${rt}` +
           ` L${RX} ${rb} C${C2} ${rb} ${C1} ${lb} ${LX} ${lb}Z`;
  };

  const grossBasis = Math.max(income, 1);
  const fmtK = n => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;
  const pctOf = n => `${Math.round((n / grossBasis) * 100)}%`;

  const segs = [
    { key: "tax",  label: "Tax",       color: "#b09070", amount: tax  },
    { key: "save", label: "Savings",   color: t.warm,    amount: save },
    { key: "keep", label: "Take-home", color: t.good,    amount: keep },
  ];

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: H, width: "100%", flexShrink: 0 }}>
      {/* left label */}
      <div style={{
        width: 96, flexShrink: 0, display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "flex-start",
      }}>
        <span style={{ font: `500 11px ${HF}`, color: t.mut }}>Gross income</span>
        <span style={{ font: `700 19px ${HM}`, color: t.accent, marginTop: 2 }}>{fmtK(income)}</span>
      </div>

      {/* SVG drawn in actual pixel coordinates so bezier curves are never squished */}
      <div ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
        <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H}>
          <rect x={0} y={PADV} width={NW} height={usable} rx={6} fill={t.accent} fillOpacity={0.9} />
          {segs.map(s => (
            <path key={s.key} d={ribbon(s.key)} fill={s.color} fillOpacity={0.5} />
          ))}
          {segs.map(s => (
            <rect key={s.key + "r"} x={RX} y={rY[s.key]} width={NW}
              height={Math.max(rH[s.key], 4)} rx={4} fill={s.color} fillOpacity={0.9} />
          ))}
        </svg>
      </div>

      {/* right labels pinned to each node's vertical centre */}
      <div style={{ width: 122, flexShrink: 0, position: "relative" }}>
        {segs.map(s => {
          const cy = ((rY[s.key] + rH[s.key] / 2) / H) * 100;
          return (
            <div key={s.key} style={{
              position: "absolute", left: 10, right: 0,
              top: `${cy}%`, transform: "translateY(-50%)",
              display: "flex", flexDirection: "column", gap: 1,
            }}>
              <span style={{ font: `600 12px ${HF}`, color: t.ink }}>{s.label}</span>
              <span style={{ font: `400 11px ${HM}`, color: t.mut }}>
                {fmtK(s.amount)} · {pctOf(s.amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NumbersScreen({ t, props, isMobile = false }) {
  const {
    currentIncome, fedTax, ficaTotal, stateTaxAmt, takeHome, currentContribTotal,
    totalAtRet, retVals, effectiveExpenses, balAt90,
    householdSS, yearsSustained, isSustainable, withdrawalRate,
    retirementAge, currentAge, lifeExpect, simData, chartData,
    netConversionBenefit, yr1TaxSavings,
    retirementWalk,
  } = props;

  const [tab, setTab] = useState("statement");
  const [showAllYears, setShowAllYears] = useState(false);

  // Keep / year totals
  const taxTotal = (fedTax ?? 0) + (ficaTotal ?? 0) + (stateTaxAmt ?? 0);
  const keepPct  = currentIncome > 0 ? Math.round((takeHome / currentIncome) * 100) : 0;
  const taxPct   = currentIncome > 0 ? Math.round((taxTotal / currentIncome) * 100) : 0;
  const savePct  = currentIncome > 0 ? Math.round((currentContribTotal / currentIncome) * 100) : 0;

  const monthlyHHSS     = Math.round((householdSS ?? 0) / 12);
  const monthlyPortDraw = Math.round(Math.max(0, effectiveExpenses - (householdSS ?? 0)) / 12);
  const monthlyTotal    = Math.round(effectiveExpenses / 12);

  const trad401  = retVals?.["Trad 401k"] ?? 0;
  const roth     = retVals?.["Roth IRA"]  ?? 0;
  const taxable  = retVals?.["Taxable"]   ?? 0;
  const hsa      = retVals?.["HSA"]       ?? 0;

  const runsOutLabel = isSustainable ? "never" : `age ${Math.round(retirementAge + yearsSustained)}`;

  // Compute milestone rows for Yearly tab
  const milestoneRows = useMemo(() => {
    if (!chartData?.length) return [];
    const rows = [];

    const balAtAge = (age) => {
      const exact = chartData.find(d => d.age === age);
      if (exact) return exact.total;
      for (let i = 0; i < chartData.length - 1; i++) {
        const a0 = chartData[i], a1 = chartData[i + 1];
        if (age >= a0.age && age <= a1.age)
          return a0.total + (a1.total - a0.total) * (age - a0.age) / (a1.age - a0.age);
      }
      return 0;
    };

    // Find First $1M crossing
    let firstMilAge = null;
    for (let i = 0; i < chartData.length - 1; i++) {
      if (chartData[i].total < 1e6 && chartData[i + 1].total >= 1e6) {
        firstMilAge = Math.round(chartData[i].age +
          (1e6 - chartData[i].total) / (chartData[i + 1].total - chartData[i].total));
        break;
      }
    }

    // Peak balance age
    const peakRow = chartData.reduce((best, d) => d.total > (best?.total ?? 0) ? d : best, null);

    // Today
    rows.push({ age: currentAge, total: balAtAge(currentAge), tag: "Today", tc: "good" });

    // First $1M
    if (firstMilAge && firstMilAge > currentAge && firstMilAge < retirementAge) {
      rows.push({ age: firstMilAge, total: 1e6, tag: "First $1M", tc: "accent" });
    }

    // Retire
    rows.push({ age: retirementAge, total: balAtAge(retirementAge), tag: "Retire", tc: "accent" });

    // Peak (if after retirement and not same as retire)
    if (peakRow && peakRow.age > retirementAge) {
      rows.push({ age: peakRow.age, total: peakRow.total, tag: "Peak", tc: "warm" });
    }

    // RMDs start at 73
    const rmdAge = 73;
    if (rmdAge > retirementAge && rmdAge < (lifeExpect ?? 90)) {
      rows.push({ age: rmdAge, total: balAtAge(rmdAge), tag: "RMDs start", tc: "warm" });
    }

    // For life
    const safeEnd = lifeExpect ?? 90;
    rows.push({ age: safeEnd, total: balAtAge(safeEnd), tag: "For life", tc: "warm" });

    return rows.sort((a, b) => a.age - b.age).filter(r => r.total != null);
  }, [chartData, currentAge, retirementAge, lifeExpect]);

  const peakTotal = milestoneRows.reduce((m, r) => Math.max(m, r.total), 1);

  // Full age-by-age retirement rows for #80 yearly table
  const allRetirementRows = retirementWalk?.rows ?? [];
  const YEAR_CAP = 50;
  const displayedRows = showAllYears ? allRetirementRows : allRetirementRows.slice(0, YEAR_CAP);
  const currentYear = new Date().getFullYear();

  return (
    <div style={{
      flex: 1, padding: isMobile ? "12px 14px 10px" : "16px 26px 14px",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      {/* optimizer banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "10px 16px", borderRadius: 13,
        background: t.surf2, border: `1px solid ${t.line2}`,
        marginBottom: 12, flexShrink: 0, flexWrap: "wrap"
      }}>
        <span style={{ font: `600 13px ${HF}`, color: t.accent }}>✦ The engine is working</span>
        <span style={{ width: 1.5, height: 26, background: t.line2, flexShrink: 0 }} />
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ font: `600 18px ${HM}`, color: t.good }}>
            {yr1TaxSavings > 0 ? `$${Math.round(yr1TaxSavings).toLocaleString()}` : "—"}
          </span>
          <span style={{ font: `400 12px ${HF}`, color: t.mut }}>saved in tax this year</span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ font: `600 18px ${HM}`, color: t.ink }}>
            {netConversionBenefit > 0 ? fmt(netConversionBenefit) : "—"}
          </span>
          <span style={{ font: `400 12px ${HF}`, color: t.mut }}>conversion benefit</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ font: `400 12px ${HF}`, color: t.accent, borderBottom: `1px dotted ${t.accent}`, cursor: "pointer" }}>
          see Detailed Planner →
        </span>
      </div>

      {/* tab strip */}
      <div style={{
        display: "flex", gap: 3, padding: 3, borderRadius: 11,
        background: t.line, alignSelf: "flex-start", marginBottom: 12, flexShrink: 0
      }}>
        {[["statement","Statement"],["yearly","Year by year"],["flow","Money flow"]].map(([k, l]) => {
          const on = tab === k;
          return (
            <div key={k} onClick={() => setTab(k)} style={{
              padding: "6px 16px", borderRadius: 8, cursor: "pointer",
              background: on ? t.surf2 : "transparent",
              font: `${on ? 600 : 400} 13px ${HF}`,
              color: on ? t.ink : t.mut,
              boxShadow: on ? "0 1px 4px rgba(0,0,0,.09)" : "none"
            }}>{l}</div>
          );
        })}
      </div>

      {/* tab body */}
      <div style={{
        flex: 1, background: t.surf, border: `1px solid ${t.line}`,
        borderRadius: 14, padding: 20, display: "flex", flexDirection: "column",
        minHeight: 0, overflow: "auto"
      }}>

        {/* ── Statement ── */}
        {tab === "statement" && (
          <>
            <div style={{
              display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              borderBottom: `2px solid ${t.ink}`, paddingBottom: 10, marginBottom: 3
            }}>
              <span style={{ font: `700 22px ${SERIF}`, color: t.ink, letterSpacing: "0.04em" }}>HORIZON</span>
              <span style={{ font: `400 12px ${SERIF}`, color: t.mut, textAlign: "right" }}>
                Statement of your plan · today's dollars
              </span>
            </div>
            <div style={{ height: 2.5, background: t.ink, marginBottom: 16 }} />
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: `400 11px ${HF}`, color: t.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                The bottom line
              </div>
              <div style={{ font: `700 32px/1 ${SERIF}`, color: t.ink }}>
                {fmtMo(effectiveExpenses)}{" "}
                <span style={{ font: `400 16px ${SERIF}`, color: t.mut }}>/ month, for life</span>
              </div>
              <div style={{ font: `400 13px ${SERIF}`, color: t.mut, marginTop: 5 }}>
                with <span style={{ color: t.warm, fontWeight: 700 }}>{fmt(balAt90)}</span> remaining at age 90.
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 28, minHeight: 0, flexWrap: "wrap" }}>
              <StmtCol t={t} title="Income & tax" items={[
                ["Gross income",    `$${Math.round(currentIncome).toLocaleString()}`, null, false],
                ["Federal tax",     `−$${Math.round(fedTax ?? 0).toLocaleString()}`,  "1",  false],
                ["FICA + state",    `−$${Math.round((ficaTotal ?? 0) + (stateTaxAmt ?? 0)).toLocaleString()}`, null, false],
                ["Pre-tax savings", `−$${Math.round(currentContribTotal).toLocaleString()}`, null, false],
                ["Take-home",       `$${Math.round(takeHome).toLocaleString()}`,       null, true],
              ]} bar={{
                segs: [
                  { f: keepPct, c: t.good, l: `Keep ${keepPct}%` },
                  { f: taxPct,  c: t.line2, l: `Tax ${taxPct}%` },
                  { f: savePct, c: t.warm,  l: `Save ${savePct}%` },
                ],
                cap: "of every dollar earned"
              }} />
              <span style={{ width: 1, background: t.line2, alignSelf: "stretch" }} />
              <StmtCol t={t} title="What you're building" items={[
                ["Trad 401k",         fmt(trad401), null, false],
                ["Roth IRA",          fmt(roth),    "2",  false],
                ["Taxable",           fmt(taxable), null, false],
                ["HSA",               fmt(hsa),     null, false],
                [`Nest egg by ${retirementAge}`, fmt(totalAtRet), null, true],
              ]} bar={{
                segs: [
                  { f: trad401, c: t.good,   l: "401k" },
                  { f: roth,    c: t.accent,  l: "Roth" },
                  { f: taxable, c: t.warm,    l: "Taxable" },
                  { f: hsa,     c: t.line2,   l: "HSA" },
                ],
                cap: `${fmt(totalAtRet)} across four buckets`
              }} />
              <span style={{ width: 1, background: t.line2, alignSelf: "stretch" }} />
              <StmtCol t={t} title="Income for life" items={[
                ["Social Security",   `${fmtMo(householdSS)}/mo`, "3",  false],
                ["Portfolio draw",    `$${monthlyPortDraw.toLocaleString()}/mo`, null, false],
                ["Safe rate",         `${(Math.round(withdrawalRate * 10) / 10).toFixed(1)}%`, null, false],
                ["Runs dry at",       runsOutLabel,  null, false],
                ["Total monthly",     `$${monthlyTotal.toLocaleString()}/mo`, null, true],
              ]} bar={{
                segs: [
                  { f: monthlyHHSS,     c: t.warm, l: "Soc Sec" },
                  { f: monthlyPortDraw, c: t.good,  l: "Portfolio" },
                ],
                cap: "blended monthly income"
              }} />
            </div>
            {/* footnotes */}
            <div style={{
              borderTop: `1px solid ${t.line2}`, marginTop: 12, paddingTop: 8,
              display: "flex", gap: 20, flexWrap: "wrap"
            }}>
              {[
                `1 Eff. federal rate ${currentIncome > 0 ? Math.round((fedTax ?? 0) / currentIncome * 1000) / 10 : 0}%.`,
                "2 5% real return, contributions to retirement.",
                "3 Claimed at Social Security age."
              ].map((f, i) => (
                <span key={i} style={{ font: `400 11px ${SERIF}`, color: t.faint }}>{f}</span>
              ))}
            </div>
          </>
        )}

        {/* ── Year by year ── */}
        {tab === "yearly" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "44px 52px 1fr 1fr 1fr 1fr",
              gap: 4, padding: "8px 14px",
              borderBottom: `1.5px solid ${t.ink}`,
              background: t.surf2, flexShrink: 0,
            }}>
              {["Age", "Year", "Portfolio", "Draw", "Growth", "Tax"].map(c => (
                <span key={c} style={{ font: `600 11px ${HF}`, color: t.ink }}>{c}</span>
              ))}
            </div>

            {/* scrollable rows */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {displayedRows.length === 0 && (
                <div style={{ padding: "32px 14px", font: `400 13px ${HF}`, color: t.faint }}>
                  Retirement data will appear here once you set a retirement age.
                </div>
              )}
              {displayedRows.map((row, i) => (
                <div key={row.age} style={{
                  display: "grid",
                  gridTemplateColumns: "44px 52px 1fr 1fr 1fr 1fr",
                  gap: 4, alignItems: "center",
                  padding: "7px 14px",
                  borderBottom: `1px solid ${t.line}`,
                  background: i % 2 === 0 ? "transparent" : `${t.ink}05`,
                }}>
                  <span style={{ font: `600 13px ${HM}`, color: t.warm }}>{row.age}</span>
                  <span style={{ font: `400 12px ${HM}`, color: t.faint }}>{currentYear + (row.age - currentAge)}</span>
                  <span style={{ font: `500 12px ${HM}`, color: t.ink }}>{fmt(row.total)}</span>
                  <span style={{ font: `400 12px ${HM}`, color: row.draw > 0 ? t.mut : t.faint }}>
                    {row.draw > 0 ? `−${fmt(row.draw)}` : "—"}
                  </span>
                  <span style={{ font: `400 12px ${HM}`, color: t.good }}>
                    {row.growth > 0 ? `+${fmt(row.growth)}` : "—"}
                  </span>
                  <span style={{ font: `400 12px ${HM}`, color: row.tax > 0 ? t.mut : t.faint }}>
                    {row.tax > 0 ? `−${fmt(row.tax)}` : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* footer / show-all toggle */}
            <div style={{
              padding: "9px 14px", borderTop: `1px solid ${t.line}`,
              background: t.surf2, flexShrink: 0,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ font: `400 11px ${HF}`, color: t.faint }}>
                retirement phase · {allRetirementRows.length} years total
              </span>
              {allRetirementRows.length > YEAR_CAP && (
                <button onClick={() => setShowAllYears(v => !v)} style={{
                  font: `500 12px ${HF}`, color: t.accent,
                  background: "transparent", border: `1px solid ${t.accent}55`,
                  borderRadius: 7, padding: "4px 12px", cursor: "pointer",
                }}>
                  {showAllYears ? "Show first 50" : `Show all ${allRetirementRows.length} years`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Money flow ── */}
        {tab === "flow" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
            <div style={{ font: `600 11px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Where your paycheck goes
            </div>
            {/* constrain to ~580 px so the aspect ratio keeps S-curves visible */}
            <div style={{ maxWidth: 580, width: "100%", alignSelf: "center" }}>
              <IncomeSankey
                t={t}
                income={currentIncome ?? 0}
                tax={(fedTax ?? 0) + (ficaTotal ?? 0) + (stateTaxAmt ?? 0)}
                save={currentContribTotal ?? 0}
                keep={takeHome ?? 0}
              />
            </div>
            <div style={{ font: `400 12.5px ${SERIF}`, color: t.faint, fontStyle: "italic", textAlign: "center" }}>
              Of every dollar you earn, {keepPct}% comes home, {savePct}% builds your future, {taxPct}% goes to tax.
            </div>
            {/* legend chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, justifyContent: "center" }}>
              {[
                ["Tax",       "#b09070", `${taxPct}%`],
                ["Savings",   t.warm,   `${savePct}%`],
                ["Take-home", t.good,   `${keepPct}%`],
              ].map(([label, c, pct]) => (
                <span key={label} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 999,
                  border: `1px solid ${c}55`, background: `${c}14`,
                  font: `500 12px ${HF}`, color: t.ink,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />
                  {label} · {pct}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
