import React, { useState, useRef, useEffect } from "react";
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

// ── Income Waterfall ──────────────────────────────────────────────────────────
// Where your paycheck goes, shown as a running-balance waterfall:
// Gross income, then each deduction (Tax, Savings) drops the balance until
// what's left is your take-home. Drawn in measured pixel space so the SVG text
// labels stay crisp at any width.
//
// PIXEL/LAYOUT GEOMETRY ONLY (V3/principle 6): every money level comes from the
// model's statementView bundle — `flowKeep` is the model-computed RESIDUAL
// (gross − tax − savings) so the waterfall reconciles to 100% of gross (the
// residual semantics are documented at calcStatementView in src/model/budget.js).
// Per-bar percentages come from the statementView flow* set; this component only
// converts values to pixels.
function IncomeWaterfall({ t, view }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(520);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setW(el.offsetWidth || 520);
    const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 300, PADT = 30, PADB = 48;
  const plotH = H - PADT - PADB;
  const axisMax = Math.max(view.gross, 1);              // pixel scale only
  const y = v => PADT + plotH * (1 - v / axisMax);      // value → pixel (axis = gross)

  const COLS = 4;
  const slot = w / COLS;
  const barW = Math.min(slot * 0.62, 130);
  const cx = i => slot * i + slot / 2;             // column centre
  const bx = i => cx(i) - barW / 2;                // column left edge

  // Money levels straight from the model (no arithmetic here)
  const { gross, taxTotal: tax, saveTotal: save, afterTaxLevel: afterTax, flowKeep: keep } = view;
  const pctLabel = p => p == null ? "—" : `${p}%`;

  const bars = [
    { i: 0, label: "Gross income", val: gross, top: gross,    bot: 0,        color: t.accent,  full: true,  pct: pctLabel(view.gross > 0 ? 100 : null) },
    { i: 1, label: "Tax",          val: tax,   top: gross,    bot: afterTax, color: "#b09070",              pct: pctLabel(view.flowTaxPct) },
    { i: 2, label: "Savings",      val: save,  top: afterTax, bot: keep,     color: t.warm,                 pct: pctLabel(view.flowSavePct) },
    { i: 3, label: "Take-home",    val: keep,  top: keep,     bot: 0,        color: t.good,    full: true,  pct: pctLabel(view.flowKeepPct) },
  ];

  // dashed connectors link each running-balance level across the gap
  const connectors = [
    { yv: gross,    from: 0 },
    { yv: afterTax, from: 1 },
    { yv: keep,     from: 2 },
  ];

  const fmtK = n => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H}>
        {/* baseline */}
        <line x1={0} y1={y(0)} x2={w} y2={y(0)} stroke={t.line2} strokeWidth={1} />

        {/* running-balance connectors */}
        {connectors.map(c => (
          <line key={c.from} x1={bx(c.from) + barW} y1={y(c.yv)}
            x2={bx(c.from + 1)} y2={y(c.yv)}
            stroke={t.faint} strokeWidth={1} strokeDasharray="3 3" />
        ))}

        {bars.map(b => {
          const yt = y(b.top), yb = y(b.bot);
          return (
            <g key={b.label}>
              <rect x={bx(b.i)} y={yt} width={barW} height={Math.max(yb - yt, 3)} rx={5}
                fill={b.color} fillOpacity={b.full ? 0.9 : 0.72} />
              {/* dollar value above the bar */}
              <text x={cx(b.i)} y={yt - 9} textAnchor="middle"
                style={{ font: `600 13px ${HM}` }} fill={t.ink}>
                {(b.full ? "" : "−") + fmtK(b.val)}
              </text>
              {/* category + percent below the axis */}
              <text x={cx(b.i)} y={H - 26} textAnchor="middle"
                style={{ font: `600 12px ${HF}` }} fill={t.mut}>{b.label}</text>
              <text x={cx(b.i)} y={H - 10} textAnchor="middle"
                style={{ font: `400 11px ${HM}` }} fill={t.faint}>{b.pct}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// initialTab (optional, WI-1.1): tab id to land on when another screen
// deep-links here via navigate("numbers", tabId) — e.g. the Plan stat cards
// and signals strip. The user's own tab clicks still control the state after
// arrival; plain navigation passes null and leaves the default.
export default function NumbersScreen({ t, props, isMobile = false, initialTab = null }) {
  const {
    currentIncome, fedTax, takeHome,
    totalAtRet, retVals, effectiveExpenses, balAt90,
    householdSS, isSustainable, withdrawalRate,
    retirementAge,
    netConversionBenefit, yr1TaxSavings,
    retirementWalk,
    // WI-0.1 display bundles — all derived numbers come from the model
    // (percentages/residuals: calcStatementView; milestones: calcChartMilestones;
    // calendar years: buildYearlyRows). The screen only formats.
    statementView, chartMilestones, yearlyRows,
  } = props;

  const [tab, setTab] = useState(initialTab ?? "statement");
  const [showAllYears, setShowAllYears] = useState(false);

  // Adopt a new deep-link target if one arrives while already mounted
  // (re-navigation to the same screen with a different subView).
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  // statementView percentages are null when there is no income — render "—",
  // never a synthesized 0 (principle 10).
  const sv = statementView;
  const pctLabel = p => p == null ? "—" : `${p}%`;

  // retVals always carries all four account keys (App.jsx builds it over the
  // static ACCOUNTS dataKeys) — no ?? 0 fallbacks (principle 10).
  const trad401  = retVals["Trad 401k"];
  const roth     = retVals["Roth IRA"];
  const taxable  = retVals["Taxable"];
  const hsa      = retVals["HSA"];

  // Depletion age comes straight from the shared retirement walk (V4) —
  // never re-derived as retirementAge + yearsSustained in the screen.
  const runsOutLabel = isSustainable
    ? "never"
    : retirementWalk.depletionAge != null ? `age ${retirementWalk.depletionAge}` : "—";

  // Lifetime milestones (V2/V5): rows + peakTotal from calcChartMilestones.
  const milestoneRows = chartMilestones.rows;
  const peakTotal     = chartMilestones.peakTotal;

  // Full age-by-age retirement rows for #80 yearly table (model-provided,
  // each row already carries its calendar year)
  const allRetirementRows = yearlyRows;
  const YEAR_CAP = 50;
  const displayedRows = showAllYears ? allRetirementRows : allRetirementRows.slice(0, YEAR_CAP);

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
                ["Federal tax",     `−$${Math.round(fedTax).toLocaleString()}`,  "1",  false],
                ["FICA + state",    `−$${Math.round(sv.ficaPlusState).toLocaleString()}`, null, false],
                ["Pre-tax savings", `−$${Math.round(sv.saveTotal).toLocaleString()}`, null, false],
                ["Take-home",       `$${Math.round(takeHome).toLocaleString()}`,       null, true],
              ]} bar={sv.keepPct == null ? null : {
                segs: [
                  { f: sv.keepPct, c: t.good, l: `Keep ${sv.keepPct}%` },
                  { f: sv.taxPct,  c: t.line2, l: `Tax ${sv.taxPct}%` },
                  { f: sv.savePct, c: t.warm,  l: `Save ${sv.savePct}%` },
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
                ["Portfolio draw",    `$${sv.monthlyPortDraw.toLocaleString()}/mo`, null, false],
                ["Safe rate",         `${(Math.round(withdrawalRate * 10) / 10).toFixed(1)}%`, null, false],
                ["Runs dry at",       runsOutLabel,  null, false],
                ["Total monthly",     `$${sv.monthlyTotal.toLocaleString()}/mo`, null, true],
              ]} bar={{
                segs: [
                  { f: sv.monthlyHHSS,     c: t.warm, l: "Soc Sec" },
                  { f: sv.monthlyPortDraw, c: t.good,  l: "Portfolio" },
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
                `1 Eff. federal rate ${sv.effFedRatePct == null ? "—" : `${sv.effFedRatePct}%`}.`,
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
            {/* lifetime milestones strip (from calcChartMilestones — V2/V5);
                bar widths are pure layout proportion against peakTotal */}
            {milestoneRows.length > 0 && (
              <div style={{
                display: "flex", gap: 10, flexWrap: "wrap",
                padding: "2px 2px 12px", flexShrink: 0,
              }}>
                {milestoneRows.map(r => (
                  <div key={`${r.tag}-${r.age}`} style={{
                    flex: "1 1 110px", minWidth: 104,
                    border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 10px",
                    background: t.surf2,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ font: `600 11px ${HF}`, color: t[r.tc] }}>{r.tag}</span>
                      <span style={{ font: `400 11px ${HM}`, color: t.faint }}>{r.age}</span>
                    </div>
                    <div style={{ font: `600 14px ${HM}`, color: t.ink, margin: "4px 0 5px" }}>{fmt(r.total)}</div>
                    <div style={{ height: 4, borderRadius: 4, background: t.line, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${(r.total / peakTotal) * 100}%`,
                        background: t[r.tc], opacity: 0.75,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  <span style={{ font: `400 12px ${HM}`, color: t.faint }}>{row.year}</span>
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
            <div style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
              <IncomeWaterfall t={t} view={sv} />
            </div>
            <div style={{ font: `400 12.5px ${SERIF}`, color: t.faint, fontStyle: "italic", textAlign: "center" }}>
              {sv.flowKeepPct == null
                ? "Add your income to see where each dollar goes."
                : `Of every dollar you earn, ${sv.flowKeepPct}% comes home, ${sv.flowSavePct}% builds your future, ${sv.flowTaxPct}% goes to tax.`}
            </div>
            {/* legend chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, justifyContent: "center" }}>
              {[
                ["Tax",       "#b09070", pctLabel(sv.flowTaxPct)],
                ["Savings",   t.warm,   pctLabel(sv.flowSavePct)],
                ["Take-home", t.good,   pctLabel(sv.flowKeepPct)],
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
