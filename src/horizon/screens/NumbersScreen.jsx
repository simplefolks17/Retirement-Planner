import React, { useState, useRef, useEffect } from "react";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";

const SERIF = "Georgia, 'Times New Roman', serif";

// Year-by-year ledger grid (WI-2.5): 9 columns. GRID_MIN_W keeps each column
// readable; the table scrolls horizontally below that width (pure layout).
const GRID_COLS = "44px 52px 1.1fr 1fr 1fr 1fr 0.9fr 1fr 1fr";
const GRID_MIN_W = 720;

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
    householdSS, effectivePension, isSustainable, withdrawalRate,
    retirementAge,
    netConversionBenefit, yr1TaxSavings,
    retirementWalk,
    // WI-0.1 display bundles — all derived numbers come from the model
    // (percentages/residuals: calcStatementView; milestones: calcChartMilestones;
    // calendar years: buildYearlyRows). The screen only formats.
    statementView, chartMilestones, yearlyRows,
    // WI-2.2 / WI-2.3 / WI-2.4 — Numbers tabs bundles.
    // All derived numbers come from the model via these bundles; screens only format.
    budget, taxView,
    returnRate,   // raw assumption for the Statement footnote
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

      {/* tab strip — 5 tabs: Statement | Budget | Accounts | Taxes | Year by year */}
      <div style={{
        display: "flex", gap: 3, padding: 3, borderRadius: 11,
        background: t.line, alignSelf: "flex-start", marginBottom: 12, flexShrink: 0,
        flexWrap: "wrap",
      }}>
        {[
          ["statement", "Statement"],
          ["budget",    "Budget"],
          ["accounts",  "Accounts"],
          ["taxes",     "Taxes"],
          ["yearly",    "Year by year"],
        ].map(([k, l]) => {
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
                ["Pre-tax savings", `−$${Math.round(sv.preTaxDeductions).toLocaleString()}`, null, false],
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
                ...(sv.monthlyPension > 0 ? [["Pension", `$${sv.monthlyPension.toLocaleString()}/mo`, null, false]] : []),
                ["Portfolio draw",    `$${sv.monthlyPortDraw.toLocaleString()}/mo`, null, false],
                ["Safe rate",         `${(Math.round(withdrawalRate * 10) / 10).toFixed(1)}%`, null, false],
                ["Runs dry at",       runsOutLabel,  null, false],
                ["Total monthly",     `$${sv.monthlyTotal.toLocaleString()}/mo`, null, true],
              ]} bar={{
                segs: [
                  { f: sv.monthlyHHSS,     c: t.warm,   l: "Soc Sec" },
                  ...(sv.monthlyPension > 0 ? [{ f: sv.monthlyPension, c: t.accent, l: "Pension" }] : []),
                  { f: sv.monthlyPortDraw, c: t.good,   l: "Portfolio" },
                ],
                cap: "blended monthly income"
              }} />
            </div>

            {/* Income waterfall — where each paycheck dollar goes (gross → tax → savings → take-home) */}
            {sv.gross > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{
                  font: `600 11px ${HF}`, color: t.accent,
                  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
                }}>
                  Where your paycheck goes
                </div>
                <div style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
                  <IncomeWaterfall t={t} view={sv} />
                </div>
                <div style={{ font: `400 12.5px ${SERIF}`, color: t.faint, fontStyle: "italic", textAlign: "center", marginTop: 4 }}>
                  {sv.flowKeepPct == null
                    ? "Add your income to see where each dollar goes."
                    : `Of every dollar you earn, ${sv.flowKeepPct}% comes home, ${sv.flowSavePct}% builds your future, ${sv.flowTaxPct}% goes to tax.`}
                </div>
              </div>
            )}

            {/* footnotes */}
            <div style={{
              borderTop: `1px solid ${t.line2}`, marginTop: 12, paddingTop: 8,
              display: "flex", gap: 20, flexWrap: "wrap"
            }}>
              {[
                `1 Eff. federal rate ${sv.effFedRatePct == null ? "—" : `${sv.effFedRatePct}%`}.`,
                `2 ${returnRate}% annual return, contributions to retirement.`,
                "3 Claimed at Social Security age."
              ].map((f, i) => (
                <span key={i} style={{ font: `400 11px ${SERIF}`, color: t.faint }}>{f}</span>
              ))}
            </div>
          </>
        )}

        {/* ── Budget (WI-2.2) ── */}
        {tab === "budget" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Section label */}
            <div style={{
              font: `600 11px ${HF}`, color: t.accent,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 18,
            }}>
              Savings waterfall — where your income goes
            </div>

            {/* Waterfall rows — all dollar values from the budget bundle (model-only) */}
            {budget == null ? (
              <div style={{ font: `400 13px ${HF}`, color: t.faint }}>
                Add your income to see your savings waterfall.
              </div>
            ) : (
              <>
                {/* Deficit callout (shown above waterfall when spending exceeds take-home) */}
                {budget.availableSurplus < 0 && (
                  <div style={{
                    background: `${t.warm}18`,
                    border: `1px solid ${t.warm}55`,
                    borderRadius: 10, padding: "10px 16px",
                    marginBottom: 16,
                    font: `500 13px ${HF}`, color: t.warm,
                  }}>
                    Spending exceeds take-home by {fmt(Math.abs(budget.availableSurplus))} — consider reducing expenses or contributions.
                  </div>
                )}

                {/* Waterfall rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    ["Gross income",                budget.grossAfterTax,       t.ink,   false],
                    ["→ After-tax income",          budget.grossAfterTax,       t.ink,   false],
                    ["→ After living expenses",     budget.savingsCapacity,     budget.savingsCapacity >= 0 ? t.good : t.warm, false],
                    ["→ After contributions",       budget.availableSurplus,    budget.availableSurplus >= 0 ? t.good : t.warm, true],
                  ].map(([label, val, color, strong], i) => (
                    <div key={label} style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "baseline", gap: 12,
                      padding: "11px 0",
                      borderBottom: `1px solid ${t.line}`,
                      paddingLeft: i === 0 ? 0 : i * 10,
                    }}>
                      <span style={{
                        font: `${strong ? 600 : 400} 14px ${SERIF}`,
                        color: strong ? color : t.mut,
                      }}>
                        {label}
                      </span>
                      <span style={{
                        font: `${strong ? 700 : 500} 15px ${HM}`,
                        color: color,
                      }}>
                        {fmt(val)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Allocation stack — current contribution amounts across accounts */}
                <div style={{ marginTop: 24 }}>
                  <div style={{
                    font: `600 11px ${HF}`, color: t.accent,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    marginBottom: 12,
                  }}>
                    How contributions are allocated
                  </div>
                  {budget.optimizedAllocation == null ? (
                    <div style={{ font: `400 13px ${HF}`, color: t.faint }}>—</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        ["Employer match",   budget.optimizedAllocation.extraMatch,   t.good],
                        ["Roth IRA",         budget.optimizedAllocation.optRoth,      t.accent],
                        ["HSA",              budget.optimizedAllocation.optHSA,       t.warm],
                        ["Traditional 401k", budget.optimizedAllocation.opt401k,      t.ink],
                        ["Taxable",          budget.optimizedAllocation.optTaxable,   t.mut],
                      ]
                        .filter(([, amt]) => amt > 0)
                        .map(([label, amt, color]) => (
                          <div key={label} style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", gap: 12,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: 999,
                                background: color, flexShrink: 0,
                              }} />
                              <span style={{ font: `400 13px ${SERIF}`, color: t.mut }}>{label}</span>
                            </div>
                            <span style={{ font: `500 13px ${HM}`, color: t.ink, whiteSpace: "nowrap" }}>
                              {fmt(amt)}/yr
                            </span>
                          </div>
                        ))}
                      {/* current total */}
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", gap: 12,
                        borderTop: `1.5px solid ${t.ink}`, paddingTop: 8, marginTop: 4,
                      }}>
                        <span style={{ font: `600 14px ${SERIF}`, color: t.ink }}>Total contributions</span>
                        <span style={{ font: `700 15px ${HM}`, color: t.ink }}>
                          {fmt(budget.currentContribTotal)}/yr
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Accounts (WI-2.3) ── */}
        {tab === "accounts" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{
              font: `600 11px ${HF}`, color: t.accent,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 18,
            }}>
              Projected account balances at retirement
            </div>

            {/* Milestone pills (reused from chartMilestones — already in horizonProps) */}
            {chartMilestones.rows.length > 0 && (
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                marginBottom: 20, flexShrink: 0,
              }}>
                {chartMilestones.rows.map(r => (
                  <span key={`${r.tag}-${r.age}`} style={{
                    padding: "4px 12px", borderRadius: 999,
                    border: `1px solid ${t[r.tc]}55`,
                    background: `${t[r.tc]}14`,
                    font: `500 12px ${HF}`, color: t[r.tc],
                  }}>
                    {r.tag} · age {r.age} · {fmt(r.total)}
                  </span>
                ))}
              </div>
            )}

            {/* Per-account bars — bar widths are pure layout math (style props only) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                ["Traditional 401k", retVals["Trad 401k"], t.good],
                ["Roth IRA",         retVals["Roth IRA"],  t.accent],
                ["Taxable",          retVals["Taxable"],   t.warm],
                ["HSA",              retVals["HSA"],        t.mut],
              ].map(([label, val, color]) => {
                // Bar width is pure layout proportion — dividing a display value by
                // totalAtRet to get a CSS width% is pixel/layout math (rule 1 clarification).
                const pct = totalAtRet > 0 ? Math.max(2, (val / totalAtRet) * 100) : 0;
                return (
                  <div key={label}>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "baseline", gap: 12, marginBottom: 5,
                    }}>
                      <span style={{ font: `400 14px ${SERIF}`, color: t.mut }}>{label}</span>
                      <span style={{ font: `600 14px ${HM}`, color: t.ink, whiteSpace: "nowrap" }}>
                        {fmt(val)}
                      </span>
                    </div>
                    <div style={{
                      height: 8, borderRadius: 8,
                      background: t.line, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: color, opacity: 0.8,
                        borderRadius: 8,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total row */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 12,
              borderTop: `1.5px solid ${t.ink}`, paddingTop: 12, marginTop: 16,
            }}>
              <span style={{ font: `600 15px ${SERIF}`, color: t.ink }}>
                Total at retirement (age {retirementAge})
              </span>
              <span style={{ font: `700 18px ${HM}`, color: t.ink }}>{fmt(totalAtRet)}</span>
            </div>
          </div>
        )}

        {/* ── Taxes (WI-2.4) ── */}
        {tab === "taxes" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
            {taxView == null ? (
              <div style={{ font: `400 13px ${HF}`, color: t.faint }}>
                Add your income to see your tax picture.
              </div>
            ) : (
              <>
                {/* ── Section 1: Working Year Tax ── */}
                <div>
                  <div style={{
                    font: `600 11px ${HF}`, color: t.accent,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    marginBottom: 14, borderBottom: `1.5px solid ${t.accent}44`,
                    paddingBottom: 6,
                  }}>
                    Working Year Tax
                  </div>

                  {/* AGI derivation table */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 16 }}>
                    {[
                      ["Gross income",            `$${Math.round(taxView.householdIncome ?? 0).toLocaleString()}`, false, false],
                      ["Pre-tax deductions",       `−$${Math.round(taxView.safeDeduc ?? 0).toLocaleString()}`,     false, false],
                      ["Adjusted Gross Income",    `$${Math.round(taxView.agi ?? 0).toLocaleString()}`,            false, true ],
                      ["Federal tax",              `−$${Math.round(fedTax ?? 0).toLocaleString()}`,                false, false],
                      ["State tax",                `−$${Math.round(taxView.stateTax ?? 0).toLocaleString()}`,      false, false],
                      ["FICA",                     `−$${Math.round(taxView.fica ?? 0).toLocaleString()}`,          false, false],
                      ["Take-home",                `$${Math.round(takeHome ?? 0).toLocaleString()}`,               false, true ],
                    ].map(([label, val, , strong]) => (
                      <div key={label} style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", gap: 12,
                        padding: "9px 0",
                        borderBottom: `1px solid ${t.line}`,
                      }}>
                        <span style={{ font: `${strong ? 600 : 400} 14px ${SERIF}`, color: strong ? t.ink : t.mut }}>
                          {label}
                        </span>
                        <span style={{ font: `${strong ? 700 : 500} 14px ${HM}`, color: strong ? t.ink : t.mut }}>
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 3-stat rate card */}
                  <div style={{
                    display: "flex", gap: 0, borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${t.line2}`, marginBottom: 14,
                  }}>
                    {[
                      ["Fed effective",  taxView.fedEffective,   t.accent],
                      ["Fed marginal",   taxView.fedMarginal,    t.ink],
                      ["Combined",       taxView.combinedEffRate, t.mut],
                    ].map(([label, rate, color], i, arr) => (
                      <div key={label} style={{
                        flex: 1, padding: "10px 0",
                        background: i === 0 ? `${t.accent}18` : "transparent",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        borderRight: i < arr.length - 1 ? `1px solid ${t.line2}` : "none",
                      }}>
                        <span style={{ font: `700 18px ${HM}`, color }}>
                          {rate != null ? `${Math.round(rate * 100)}%` : "—"}
                        </span>
                        <span style={{ font: `400 11px ${HF}`, color: t.mut }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Pre-tax savings callout */}
                  {taxView.taxSaveFromPreTax > 0 && (
                    <div style={{
                      background: `${t.good}14`, border: `1px solid ${t.good}44`,
                      borderRadius: 9, padding: "9px 14px",
                      font: `400 13px ${SERIF}`, color: t.ink,
                    }}>
                      Your 401k and HSA contributions save approximately{" "}
                      <strong>${taxView.taxSaveFromPreTax.toLocaleString()}</strong> in federal tax
                      this year at your {Math.round(taxView.fedMarginal * 100)}% marginal rate.
                    </div>
                  )}
                </div>

                {/* ── Section 2: Retirement Tax ── */}
                <div>
                  <div style={{
                    font: `600 11px ${HF}`, color: t.accent,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    marginBottom: 14, borderBottom: `1.5px solid ${t.accent}44`,
                    paddingBottom: 6,
                  }}>
                    Retirement Tax
                  </div>

                  {/* Working → Retirement rate transition */}
                  <div style={{
                    display: "flex", gap: 0, borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${t.line2}`, height: 58, marginBottom: 16,
                  }}>
                    <div style={{
                      flex: 1, background: `${t.accent}22`,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      borderRight: `1px solid ${t.line2}`,
                    }}>
                      <span style={{ font: `700 20px ${HM}`, color: t.accent }}>
                        {taxView.fedMarginal != null ? `${Math.round(taxView.fedMarginal * 100)}%` : "—"}
                      </span>
                      <span style={{ font: `400 11px ${HF}`, color: t.mut }}>working marginal</span>
                    </div>
                    <div style={{
                      flex: 1, background: `${t.good}18`,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ font: `700 20px ${HM}`, color: t.good }}>
                        {taxView.projectedRetBracket != null
                          ? `${Math.round(taxView.projectedRetBracket * 100)}%`
                          : "—"}
                      </span>
                      <span style={{ font: `400 11px ${HF}`, color: t.mut }}>projected ret. bracket</span>
                    </div>
                  </div>

                  {/* Retirement rate detail rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
                    {[
                      ["Projected retirement bracket", taxView.projectedRetBracket != null ? `${Math.round(taxView.projectedRetBracket * 100)}%` : "—"],
                      ["Effective RMD tax rate",       taxView.effectiveRMDTaxRate != null ? `${Math.round(taxView.effectiveRMDTaxRate * 100)}%` : "—"],
                      ["Total lifetime RMD tax burden", taxView.rmdTaxBite != null ? `$${Math.round(taxView.rmdTaxBite).toLocaleString()}` : "—"],
                    ].map(([label, val]) => (
                      <div key={label} style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", gap: 12,
                        borderBottom: `1px solid ${t.line}`, paddingBottom: 8,
                      }}>
                        <span style={{ font: `400 14px ${SERIF}`, color: t.mut }}>{label}</span>
                        <span style={{ font: `600 14px ${HM}`, color: t.ink }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Lifetime tax composition bar */}
                  <div>
                    <div style={{
                      font: `600 11px ${HF}`, color: t.accent,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      marginBottom: 10,
                    }}>
                      Lifetime tax composition
                    </div>
                    {/* Segment widths (flex: val/total) are pure layout proportion —
                        pixel/layout math (rule 1). Dollar vals + pcts are pre-computed
                        by the model (taxView.composition) — no financial math here. */}
                    {(() => {
                      const { segments, total } = taxView.composition;
                      if (total <= 0 || segments.length === 0) {
                        return (
                          <div style={{ font: `400 13px ${HF}`, color: t.faint }}>
                            Tax data will appear once accounts are set up.
                          </div>
                        );
                      }
                      const segColor = { working: t.warm, rmd: t.accent, conv: t.good };
                      return (
                        <>
                          <div style={{
                            display: "flex", height: 26, borderRadius: 8,
                            overflow: "hidden", border: `1px solid ${t.line2}`,
                            marginBottom: 10,
                          }}>
                            {segments.map((seg, i) => (
                              <div key={seg.key} style={{
                                flex: seg.val / total,
                                background: segColor[seg.key], opacity: 0.72,
                                borderRight: i < segments.length - 1
                                  ? `1px solid ${t.surf}` : "none",
                                display: "flex", alignItems: "center",
                                justifyContent: "center",
                                font: `600 10px ${HF}`, color: t.surf,
                                minWidth: 0, overflow: "hidden",
                                whiteSpace: "nowrap",
                              }}>
                                {seg.pct >= 12 ? `${seg.pct}%` : ""}
                              </div>
                            ))}
                          </div>
                          {/* Legend */}
                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                            {segments.map(seg => (
                              <span key={seg.key} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                font: `400 12px ${HF}`, color: t.mut,
                              }}>
                                <span style={{
                                  width: 8, height: 8, borderRadius: 999,
                                  background: segColor[seg.key], flexShrink: 0,
                                }} />
                                {seg.label} · {fmt(seg.val)}
                              </span>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
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
            {/* whole-life ledger (WI-2.5): accumulation + retirement rows.
                9 columns → the table scrolls horizontally so each stays readable
                on desktop and mobile (rule 15 — renders + usable on small screens).
                signed and null cells are formatted only; all values come from yearlyRows. */}
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <div style={{ minWidth: GRID_MIN_W }}>
                {/* column headers */}
                <div style={{
                  display: "grid", gridTemplateColumns: GRID_COLS,
                  gap: 4, padding: "8px 14px",
                  borderBottom: `1.5px solid ${t.ink}`,
                  background: t.surf2, position: "sticky", top: 0, zIndex: 1,
                }}>
                  {["Age", "Year", "Portfolio", "Contrib.", "Growth", "Draw", "Tax", "RMD", "Conversion"].map(c => (
                    <span key={c} style={{ font: `600 11px ${HF}`, color: t.ink }}>{c}</span>
                  ))}
                </div>

                {displayedRows.length === 0 && (
                  <div style={{ padding: "32px 14px", font: `400 13px ${HF}`, color: t.faint }}>
                    Your year-by-year projection will appear here once your plan is set up.
                  </div>
                )}
                {displayedRows.map((row, i) => {
                  const isRetStart = row.phase === "ret" && displayedRows[i - 1]?.phase === "accum";
                  return (
                    <div key={row.age} style={{
                      display: "grid", gridTemplateColumns: GRID_COLS,
                      gap: 4, alignItems: "center",
                      padding: "7px 14px",
                      borderBottom: `1px solid ${t.line}`,
                      borderTop: isRetStart ? `1.5px solid ${t.warm}88` : "none",
                      background: i % 2 === 0 ? "transparent" : `${t.ink}05`,
                    }}>
                      <span style={{ font: `600 13px ${HM}`, color: row.phase === "ret" ? t.warm : t.good }}>{row.age}</span>
                      <span style={{ font: `400 12px ${HM}`, color: t.faint }}>{row.year}</span>
                      <span style={{ font: `500 12px ${HM}`, color: t.ink }}>{fmt(row.total)}</span>
                      <span style={{ font: `400 12px ${HM}`, color: row.contrib > 0 ? t.accent : t.faint }}>
                        {row.contrib != null && row.contrib > 0 ? `+${fmt(row.contrib)}` : "—"}
                      </span>
                      <span style={{ font: `400 12px ${HM}`, color: row.growth > 0 ? t.good : t.faint }}>
                        {row.growth > 0 ? `+${fmt(row.growth)}` : "—"}
                      </span>
                      <span style={{ font: `400 12px ${HM}`, color: row.draw > 0 ? t.mut : t.faint }}>
                        {row.draw > 0 ? `−${fmt(row.draw)}` : "—"}
                      </span>
                      <span style={{ font: `400 12px ${HM}`, color: row.tax > 0 ? t.mut : t.faint }}>
                        {row.tax > 0 ? `−${fmt(row.tax)}` : "—"}
                      </span>
                      <span style={{ font: `400 12px ${HM}`, color: row.rmd > 0 ? t.mut : t.faint }}>
                        {row.rmd != null && row.rmd > 0 ? fmt(row.rmd) : "—"}
                      </span>
                      <span style={{ font: `400 12px ${HM}`, color: row.conversion > 0 ? t.mut : t.faint }}>
                        {row.conversion != null && row.conversion > 0 ? fmt(row.conversion) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* footer / show-all toggle + reconciliation note */}
            <div style={{
              padding: "9px 14px", borderTop: `1px solid ${t.line}`,
              background: t.surf2, flexShrink: 0,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}>
              <span style={{ font: `400 11px ${HF}`, color: t.faint }}>
                whole life · {allRetirementRows.length} years · growth shown after the tax you'll owe on pre-tax accounts
              </span>
              {allRetirementRows.length > YEAR_CAP && (
                <button onClick={() => setShowAllYears(v => !v)} style={{
                  font: `500 12px ${HF}`, color: t.accent,
                  background: "transparent", border: `1px solid ${t.accent}55`,
                  borderRadius: 7, padding: "4px 12px", cursor: "pointer", flexShrink: 0,
                }}>
                  {showAllYears ? "Show first 50" : `Show all ${allRetirementRows.length} years`}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
