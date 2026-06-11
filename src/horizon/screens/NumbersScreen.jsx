import React, { useState, useMemo } from "react";
import { HF, HM, HD } from "../ThemeContext.jsx";
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

export default function NumbersScreen({ t, props }) {
  const {
    currentIncome, fedTax, ficaTotal, stateTaxAmt, takeHome, currentContribTotal,
    totalAtRet, retVals, effectiveExpenses, balAt90,
    householdSS, yearsSustained, isSustainable, withdrawalRate,
    retirementAge, currentAge, lifeExpect, simData, chartData,
    netConversionBenefit, yr1TaxSavings,
  } = props;

  const [tab, setTab] = useState("statement");

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

  return (
    <div style={{
      flex: 1, padding: "16px 26px 14px",
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
              <div style={{ font: `700 32px ${SERIF}`, color: t.ink, lineHeight: 1 }}>
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
                ["Safe rate",         `${Math.round(withdrawalRate * 100 * 10) / 10}%`, null, false],
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
            <div style={{
              display: "grid", gridTemplateColumns: "56px 2.8fr 1.2fr",
              padding: "10px 14px", borderBottom: `1.5px solid ${t.ink}`,
              background: t.surf2, flexShrink: 0
            }}>
              {["Age", "Balance", ""].map((c, i) => (
                <span key={i} style={{ font: `600 12px ${HF}`, color: t.ink }}>{c}</span>
              ))}
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {milestoneRows.map(({ age, total, tag, tc }) => {
                const isRetire = age === retirementAge;
                return (
                  <div key={`${age}-${tag}`} style={{
                    display: "grid", gridTemplateColumns: "56px 2.8fr 1.2fr",
                    alignItems: "center", padding: "11px 14px",
                    borderBottom: `1px solid ${t.line}`,
                    background: isRetire ? `${t.accent}0e` : "transparent"
                  }}>
                    <span style={{ font: `600 15px ${HM}`, color: t[tc] }}>{age}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 16 }}>
                      <span style={{ flex: 1, height: 12, borderRadius: 3, background: t.line, overflow: "hidden" }}>
                        <span style={{
                          display: "block", height: "100%",
                          width: `${Math.min(100, (total / peakTotal) * 100)}%`,
                          background: age >= retirementAge ? t.warm : t.good, opacity: 0.75
                        }} />
                      </span>
                      <span style={{ font: `600 13px ${HM}`, color: t.ink, width: 56, textAlign: "right" }}>
                        {fmt(total)}
                      </span>
                    </span>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "3px 10px", borderRadius: 999,
                      border: `1px solid ${t[tc]}55`, background: `${t[tc]}14`,
                      font: `600 11px ${HF}`, color: t[tc], whiteSpace: "nowrap"
                    }}>{tag}</span>
                  </div>
                );
              })}
            </div>
            <div style={{
              padding: "9px 14px", borderTop: `1px solid ${t.line}`,
              background: t.surf2, font: `400 12px ${HF}`, color: t.faint, flexShrink: 0
            }}>
              key milestones · full detail in Detailed Planner
            </div>
          </div>
        )}

        {/* ── Money flow ── */}
        {tab === "flow" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
            <div style={{
              flex: 1, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center",
              background: t.surf2, borderRadius: 10, border: `1px dashed ${t.line2}`
            }}>
              <span style={{ font: `400 14px ${HF}`, color: t.faint }}>
                Sankey diagram — paycheck → accounts → {fmt(totalAtRet)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                [`${keepPct}% take-home`, t.good],
                [`${taxPct}% tax`, t.line2],
                [`${savePct}% invested`, t.warm],
              ].map(([l, c]) => (
                <span key={l} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 999,
                  border: `1px solid ${c}55`, background: `${c}14`,
                  font: `500 12px ${HF}`, color: t.ink
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
