import React, { useState, useRef, useEffect } from "react";
import { HF, HM } from "../ThemeContext.jsx";
import { fmt, fmtMo } from "../shared.jsx";
import { ASSUMPTIONS } from "../../config/irs-2026.js";

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
export default function NumbersScreen({ t, props, isMobile = false, initialTab = null, navigate = null }) {
  const {
    currentIncome, fedTax, takeHome,
    totalAtRet, spendableAtRet, retVals, effectiveExpenses, balAt90,
    householdSS, effectivePension, isSustainable, withdrawalRate,
    retirementAge, currentAge,
    netConversionBenefit, yr1TaxSavings,
    retirementWalk, currentTotalSaved,
    // WI-0.1 display bundles — all derived numbers come from the model
    // (percentages/residuals: calcStatementView; milestones: calcChartMilestones;
    // calendar years: buildYearlyRows). The screen only formats.
    statementView, chartMilestones, planView, yearlyRows,
    // WI-2.2 / WI-2.3 / WI-2.4 — Numbers tabs bundles.
    // All derived numbers come from the model via these bundles; screens only format.
    budget, taxView,
    rmdStartAge,
    returnRate,   // raw assumption for the Statement footnote
    // Session-3 additions:
    flowDown,           // calcFlowDown — totalContrib / totalGrowth / distDraws
    conversionWindowYrs,
    ssClaimingAge,
    markerByAge,        // lifecycle annotation map for Year by year dividers
    tablePhases,        // phase-summary box data for Year by year header strip
    // Session-4 additions:
    retirementRowByAge, // { [age]: engineRow } — per-account breakdown for expandable rows
    milestoneByAge,     // { [age]: tag } — inline milestone badge in portfolio cell
  } = props;

  const [tab, setTab] = useState(initialTab ?? "statement");
  const [showAllYears, setShowAllYears] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);  // age of expanded ret row
  const tableScrollRef = useRef(null);                    // outer scroll container
  const rowRefs = useRef({});                             // { [age]: DOM element }

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
            <button key={k} type="button" aria-pressed={on} onClick={() => setTab(k)} style={{
              padding: "6px 16px", borderRadius: 8, cursor: "pointer",
              border: "none",
              background: on ? t.surf2 : "transparent",
              font: `${on ? 600 : 400} 13px ${HF}`,
              color: on ? t.ink : t.mut,
              boxShadow: on ? "0 1px 4px rgba(0,0,0,.09)" : "none"
            }}>{l}</button>
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

            {/* Plan-health verdict badge */}
            {planView?.drivers && (() => {
              const allOk = planView.drivers.every(d => d.ok);
              const badIssues = planView.drivers.filter(d => !d.ok).map(d => d.id);
              const color = allOk ? t.good : t.warm;
              return (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "5px 14px", borderRadius: 999, marginBottom: 14,
                  border: `1px solid ${color}66`,
                  background: `${color}14`,
                }}>
                  <span style={{ font: `600 12px ${HF}`, color }}>
                    {allOk ? "✓ On track" : `${badIssues.length} area${badIssues.length > 1 ? "s" : ""} to review`}
                  </span>
                  <span style={{ font: `400 11px ${HF}`, color: t.mut }}>
                    {allOk
                      ? "withdrawal rate · longevity · savings rate"
                      : badIssues.join(" · ")}
                  </span>
                </div>
              );
            })()}

            {/* Contributions vs Growth — the fundamental compounding story */}
            {sv.lifetimeContribROI != null && flowDown != null && (
              <div style={{
                background: `${t.accent}10`, border: `1px solid ${t.accent}33`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 16,
              }}>
                <div style={{ font: `400 13px ${SERIF}`, color: t.mut }}>
                  You'll contribute{" "}
                  <span style={{ font: `600 13px ${HM}`, color: t.ink }}>{fmt(flowDown.totalContrib)}</span>
                  {" "}over your career — compounding grows that to{" "}
                  <span style={{ font: `700 14px ${HM}`, color: t.accent }}>{fmt(totalAtRet)}</span>.
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span style={{ font: `700 26px ${HM}`, color: t.accent }}>{sv.lifetimeContribROI}×</span>
                  <span style={{ font: `400 13px ${SERIF}`, color: t.mut }}>compounding multiplier</span>
                </div>
              </div>
            )}

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

            {/* Income replacement ratio — replaces X% of working income (Session 4) */}
            {sv.incomeReplacementPct != null && (() => {
              const pct = sv.incomeReplacementPct;
              const color = pct >= ASSUMPTIONS.INCOME_REPLACEMENT_GOOD_PCT ? t.good
                : pct >= ASSUMPTIONS.INCOME_REPLACEMENT_WARN_PCT ? t.warm : "#c0392b";
              return (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ font: `400 13px ${SERIF}`, color: t.mut }}>
                    Retirement income replaces{" "}
                    <span style={{ font: `700 15px ${HM}`, color }}>{pct}%</span>
                    {" "}of your working take-home.
                  </div>
                  {navigate && (
                    <button
                      onClick={() => navigate("numbers", "yearly")}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        font: `400 12px ${SERIF}`, color: t.accent,
                        padding: "4px 0", textDecoration: "underline",
                      }}
                    >
                      → Explore all years
                    </button>
                  )}
                </div>
              );
            })()}

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
                {/* Retirement income companion strip — shows how SS/pension/portfolio
                    combine to fund retirement (mirrors the working-year waterfall).
                    Bar widths are layout proportion only (val/monthlyTotal * 100%) —
                    the same precedent as Accounts tab horizontal bars (rule 10). */}
                {sv.monthlyTotal > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{
                      font: `500 11px ${SERIF}`, color: t.mut,
                      letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8,
                    }}>
                      Where retirement income comes from · per month
                    </div>
                    {[
                      { label: "Social Security", val: sv.monthlyHHSS, color: t.warm },
                      ...(sv.monthlyPension > 0 ? [{ label: "Pension", val: sv.monthlyPension, color: t.accent }] : []),
                      { label: "Portfolio draw", val: sv.monthlyPortDraw, color: t.good },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ font: `400 12px ${SERIF}`, color: t.mut, width: 110 }}>{label}</div>
                        <div style={{ flex: 1, background: `${color}22`, borderRadius: 3, height: 6, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.round((val / sv.monthlyTotal) * 100)}%`,
                            background: color, height: "100%",
                          }} />
                        </div>
                        <div style={{ font: `500 12px ${HM}`, color: t.ink, width: 56, textAlign: "right" }}>
                          {fmt(val)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
            {budget == null ? (
              <div style={{ font: `400 13px ${HF}`, color: t.faint }}>
                Add your income to see your budget breakdown.
              </div>
            ) : (() => {
              const oa = budget.optimizedAllocation;
              const savingsDriver = planView?.drivers?.find(d => d.id === "savings");
              const savingsRatePct = savingsDriver?.savingsRatePct ?? null;
              const savingsRateOk  = savingsDriver?.ok ?? null;
              const savingsGuide   = savingsDriver?.guidelinePct ?? null;

              return (
                <>
                  {/* ── Savings waterfall ── */}
                  <div style={{
                    font: `600 11px ${HF}`, color: t.accent,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    marginBottom: 14, borderBottom: `1.5px solid ${t.accent}44`,
                    paddingBottom: 6,
                  }}>
                    Where your income goes
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 12 }}>
                    {[
                      ["Gross income",           taxView?.householdIncome,       t.ink,  false, 0],
                      ["→ After taxes",           budget.grossAfterTax,           t.ink,  false, 1],
                      ["→ After living expenses", budget.savingsCapacity,
                        budget.savingsCapacity >= 0 ? t.good : t.warm,           false,  2],
                      ["→ After contributions",   budget.availableSurplus,
                        budget.availableSurplus >= 0 ? t.good : t.warm,          true,   3],
                    ].map(([label, val, color, strong, indent]) => (
                      <div key={label} style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", gap: 12,
                        padding: "10px 0",
                        borderBottom: `1px solid ${t.line}`,
                        paddingLeft: indent * 10,
                      }}>
                        <span style={{ font: `${strong ? 600 : 400} 14px ${SERIF}`, color: strong ? color : t.mut }}>
                          {label}
                        </span>
                        <span style={{ font: `${strong ? 700 : 500} 15px ${HM}`, color: color }}>
                          {fmt(val)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Deficit warning */}
                  {budget.availableSurplus < 0 && (
                    <div style={{
                      background: `${t.warm}18`, border: `1px solid ${t.warm}55`,
                      borderRadius: 10, padding: "10px 16px", marginBottom: 14,
                      font: `500 13px ${HF}`, color: t.warm,
                    }}>
                      Spending exceeds take-home by {fmt(Math.abs(budget.availableSurplus))} — consider reducing expenses or contributions.
                    </div>
                  )}

                  {/* Surplus → retirement bridge callout */}
                  {budget.availableSurplus > 0 && budget.surplusFutureValue > 0 && (
                    <div style={{
                      background: `${t.good}12`, border: `1px solid ${t.good}44`,
                      borderRadius: 10, padding: "10px 16px", marginBottom: 14,
                      font: `400 13px ${SERIF}`, color: t.mut,
                    }}>
                      Investing this surplus could add{" "}
                      <span style={{ font: `600 13px ${HM}`, color: t.good }}>
                        {fmt(budget.surplusFutureValue)}
                      </span>{" "}
                      to your retirement portfolio.
                    </div>
                  )}

                  {/* Savings rate benchmark */}
                  {savingsRatePct != null && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "6px 14px", borderRadius: 999, marginBottom: 20,
                      border: `1px solid ${savingsRateOk ? t.good : t.warm}55`,
                      background: `${savingsRateOk ? t.good : t.warm}12`,
                    }}>
                      <span style={{
                        font: `600 12px ${HM}`,
                        color: savingsRateOk ? t.good : t.warm,
                      }}>
                        {savingsRatePct}%
                      </span>
                      <span style={{ font: `400 12px ${HF}`, color: t.mut }}>
                        savings rate{savingsGuide != null ? ` · guideline ≥${savingsGuide}%` : ""}
                      </span>
                    </div>
                  )}

                  {/* ── Saving gap headline ── */}
                  {oa != null && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{
                        font: `600 11px ${HF}`, color: t.accent,
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        marginBottom: 12, borderBottom: `1.5px solid ${t.accent}44`,
                        paddingBottom: 6,
                      }}>
                        Your saving opportunity
                      </div>
                      {oa.totalExtra > 0 ? (
                        <div style={{
                          background: `${t.accent}10`, border: `1px solid ${t.accent}44`,
                          borderRadius: 10, padding: "12px 16px",
                        }}>
                          <div style={{ font: `400 13px ${SERIF}`, color: t.mut, marginBottom: 6 }}>
                            You could save{" "}
                            <span style={{ font: `700 15px ${HM}`, color: t.accent }}>
                              {fmt(oa.totalExtra)}/yr
                            </span>{" "}
                            more without changing your spending.
                          </div>
                          {oa.extraMatch > 0 && (
                            <div style={{ font: `500 12px ${HF}`, color: t.good }}>
                              ✦ {fmt(oa.extraMatch)}/yr of that is free employer match — highest priority.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{
                          background: `${t.good}10`, border: `1px solid ${t.good}44`,
                          borderRadius: 10, padding: "12px 16px",
                          font: `400 13px ${SERIF}`, color: t.mut,
                        }}>
                          You're already saving the maximum available. Well done.
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Optimized allocation ── */}
                  <div>
                    <div style={{
                      font: `600 11px ${HF}`, color: t.accent,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      marginBottom: 12, borderBottom: `1.5px solid ${t.accent}44`,
                      paddingBottom: 6,
                    }}>
                      Optimized allocation
                    </div>
                    {oa == null ? (
                      <div style={{ font: `400 13px ${HF}`, color: t.faint }}>—</div>
                    ) : (
                      <>
                        {/* Employer match callout */}
                        {oa.extraMatch > 0 && (
                          <div style={{
                            background: `${t.good}12`, border: `1px solid ${t.good}44`,
                            borderRadius: 8, padding: "8px 12px", marginBottom: 12,
                            font: `500 12px ${HF}`, color: t.good,
                          }}>
                            ✦ Claim your employer match first — it's free money ({fmt(oa.extraMatch)}/yr).
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            ["Employer match",   oa.extraMatch,   t.good],
                            ["Roth IRA",         oa.optRoth,      t.accent],
                            ["HSA",              oa.optHSA,       t.warm],
                            ["Traditional 401k", oa.opt401k,      t.ink],
                            ["Taxable",          oa.optTaxable,   t.mut],
                          ]
                            .filter(([, amt]) => amt > 0)
                            .map(([label, amt, color]) => (
                              <div key={label} style={{
                                display: "flex", justifyContent: "space-between",
                                alignItems: "center", gap: 12,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
                                  <span style={{ font: `400 13px ${SERIF}`, color: t.mut }}>{label}</span>
                                </div>
                                <span style={{ font: `500 13px ${HM}`, color: t.ink, whiteSpace: "nowrap" }}>
                                  {fmt(amt)}/yr
                                </span>
                              </div>
                            ))}
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
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── Accounts (WI-2.3) ── */}
        {tab === "accounts" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>

            {/* ── Now → Retirement banner ── */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              background: t.surf2, border: `1px solid ${t.line2}`,
              borderRadius: 12, padding: "14px 18px", marginBottom: 20,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: `600 11px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Today</div>
                <div style={{ font: `700 20px ${HM}`, color: t.ink }}>{fmt(currentTotalSaved)}</div>
              </div>
              <div style={{ font: `600 20px ${HF}`, color: t.line2, padding: "0 14px" }}>→</div>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={{ font: `600 11px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>
                  At retirement · age {retirementAge}
                </div>
                <div style={{ font: `700 20px ${HM}`, color: t.ink }}>{fmt(totalAtRet)}</div>
                {spendableAtRet != null && (
                  <div style={{ font: `400 12px ${SERIF}`, color: t.mut, marginTop: 2 }}>
                    ≈ {fmt(spendableAtRet)} after retirement taxes
                  </div>
                )}
              </div>
            </div>

            {/* Milestone pills */}
            {chartMilestones.rows.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, flexShrink: 0 }}>
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

            {/* ── Tax-character buckets ── */}
            {[
              {
                key: "deferred",
                label: "Tax-deferred",
                note: "Taxed as ordinary income when withdrawn",
                accounts: [["Traditional 401k", retVals["Trad 401k"], t.good]],
                extra: retVals["Trad 401k"] > 0 && (
                  <div style={{ font: `400 12px ${SERIF}`, color: t.mut, marginTop: 8 }}>
                    Required distributions start at age {rmdStartAge} —{" "}
                    {taxView?.rmdTaxBite > 0
                      ? <span>estimated <span style={{ font: `500 12px ${HM}`, color: t.warm }}>{fmt(taxView.rmdTaxBite)}</span> in lifetime taxes</span>
                      : "amount depends on conversions and spending"}.
                    {netConversionBenefit > 0 && (
                      <span style={{ color: t.accent }}> Roth conversions reduce this burden.</span>
                    )}
                  </div>
                ),
              },
              {
                key: "free",
                label: "Tax-free",
                note: "No tax on qualified withdrawals · no required distributions",
                accounts: [
                  ["Roth IRA", retVals["Roth IRA"], t.accent],
                  ["HSA",      retVals["HSA"],       t.warm],
                ],
              },
              {
                key: "taxable",
                label: "Taxable",
                note: "Capital-gains tax on growth only · most flexible",
                accounts: [["Taxable", retVals["Taxable"], t.mut]],
              },
            ].map(bucket => {
              const bucketTotal = bucket.accounts.reduce((s, [, v]) => s + (v ?? 0), 0);
              if (bucketTotal === 0) return null;
              return (
                <div key={bucket.key} style={{ marginBottom: 20 }}>
                  {/* Bucket header */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ font: `600 12px ${HF}`, color: t.ink, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {bucket.label}
                    </span>
                    <span style={{ font: `400 12px ${SERIF}`, color: t.faint }}>{bucket.note}</span>
                  </div>
                  {/* Account bars within bucket */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {bucket.accounts.map(([label, val, color]) => {
                      if (!val) return null;
                      // Bar width = layout proportion only (CSS %, no financial meaning)
                      const pct = totalAtRet > 0 ? Math.max(2, (val / totalAtRet) * 100) : 0;
                      return (
                        <div key={label}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
                            <span style={{ font: `400 14px ${SERIF}`, color: t.mut }}>{label}</span>
                            <span style={{ font: `600 14px ${HM}`, color: t.ink, whiteSpace: "nowrap" }}>{fmt(val)}</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 8, background: t.line, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${pct}%`,
                              background: color, opacity: 0.8,
                              borderRadius: 8, transition: "width 0.3s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {bucket.extra}
                </div>
              );
            })}

            {/* Total row */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 12,
              borderTop: `1.5px solid ${t.ink}`, paddingTop: 12, marginTop: 4,
            }}>
              <span style={{ font: `600 15px ${SERIF}`, color: t.ink }}>
                Total at retirement (gross)
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
                    {(() => {
                      const fmtExact = v => v != null ? `$${Math.round(v).toLocaleString()}` : "—";
                      const fmtDeduc = v => v != null ? `−$${Math.round(v).toLocaleString()}` : "—";
                      return [
                        ["Gross income",            fmtExact(taxView.householdIncome), false, false],
                        ["Pre-tax deductions",       fmtDeduc(taxView.safeDeduc),       false, false],
                        ["Adjusted Gross Income",    fmtExact(taxView.agi),             false, true ],
                        ["Federal tax",              fmtDeduc(fedTax),                  false, false],
                        ["State tax",                fmtDeduc(taxView.stateTax),        false, false],
                        ["FICA",                     fmtDeduc(taxView.fica),            false, false],
                        ["Take-home",                fmtExact(takeHome),                false, true ],
                      ];
                    })().map(([label, val, , strong]) => (
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

                  {/* Lifetime tax anchor */}
                  {taxView.composition.total > 0 && (
                    <div style={{
                      background: `${t.warm}10`, border: `1px solid ${t.warm}33`,
                      borderRadius: 9, padding: "9px 14px", marginBottom: 14,
                      font: `400 13px ${SERIF}`, color: t.ink,
                    }}>
                      Total income tax across your lifetime:{" "}
                      <span style={{ font: `700 14px ${HM}`, color: t.warm }}>
                        {fmt(taxView.composition.total)}
                      </span>
                      <span style={{ font: `400 12px ${SERIF}`, color: t.faint }}>{" "}(working + RMD + conversion)</span>
                    </div>
                  )}

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

                  {/* Roth conversion verdict — always shown when a conversion window exists,
                      regardless of sign (the most decision-relevant signal is the one
                      the user is missing when it's negative). */}
                  {conversionWindowYrs > 0 && taxView.conversionDetail != null && (
                    <div style={{
                      background: netConversionBenefit >= 0 ? `${t.good}12` : `${t.warm}12`,
                      border: `1px solid ${netConversionBenefit >= 0 ? t.good : t.warm}44`,
                      borderRadius: 9, padding: "12px 16px", marginBottom: 14,
                    }}>
                      <div style={{
                        font: `600 12px ${HF}`,
                        color: netConversionBenefit >= 0 ? t.good : t.warm,
                        marginBottom: 6,
                      }}>
                        {netConversionBenefit >= 0
                          ? "Conversions work in your favor"
                          : "Conversions are net-negative at current settings"}
                      </div>
                      <div style={{ font: `400 13px ${SERIF}`, color: t.ink, marginBottom: 10 }}>
                        {netConversionBenefit >= 0 ? (
                          <>Converting now saves{" "}
                            <strong style={{ font: `700 13px ${HM}`, color: t.good }}>{fmt(netConversionBenefit)}</strong>
                            {" "}in lifetime taxes (RMD reduction minus conversion cost).
                          </>
                        ) : (
                          <>At current settings, converting costs{" "}
                            <strong style={{ font: `700 13px ${HM}`, color: t.warm }}>{fmt(Math.abs(netConversionBenefit))}</strong>
                            {" "}more than it saves. Reduce the conversion amount or skip conversions entirely.
                          </>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                        {[
                          ["RMD tax saved",   taxView.conversionDetail.rmdTaxSaved,   t.good],
                          ["Conversion cost", taxView.conversionDetail.conversionCost, t.mut],
                          ...(taxView.conversionDetail.irmaaCost > 0
                            ? [["IRMAA", taxView.conversionDetail.irmaaCost, t.warm]] : []),
                          ...(taxView.conversionDetail.acaLoss > 0
                            ? [["ACA loss", taxView.conversionDetail.acaLoss, t.warm]] : []),
                        ].map(([label, val, color]) => (
                          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ font: `400 11px ${HF}`, color: t.faint }}>{label}</span>
                            <span style={{ font: `600 13px ${HM}`, color }}>{fmt(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
            {/* Phase-summary header strip — accumulation / conversion / retirement */}
            {tablePhases && (
              <div style={{
                display: "flex", gap: 6, marginBottom: 10, flexShrink: 0, flexWrap: "wrap",
              }}>
                {[
                  { label: "Accumulation",      years: tablePhases.accumYears,      color: t.good },
                  ...(tablePhases.conversionYears > 0
                    ? [{ label: "Conversion window", years: tablePhases.conversionYears, color: t.accent }]
                    : []),
                  { label: "Retirement",        years: tablePhases.retirementYears, color: t.warm },
                ].map(({ label, years, color }) => (
                  <div key={label} style={{
                    padding: "5px 12px", borderRadius: 8,
                    background: `${color}14`, border: `1px solid ${color}44`,
                  }}>
                    <span style={{ font: `600 12px ${HF}`, color }}>{label}</span>
                    <span style={{ font: `400 12px ${HF}`, color: t.mut }}>{" · "}{years} yr{years !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            )}

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
            <div ref={tableScrollRef} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <div style={{ minWidth: GRID_MIN_W }}>
                {/* Jump bar — scroll-to-lifecycle shortcuts (Session 4) */}
                {(() => {
                  const mountedAges = new Set(displayedRows.map(r => r.age));
                  const visibleMarkers = Object.entries(markerByAge ?? {})
                    .filter(([age]) => mountedAges.has(Number(age)));
                  return visibleMarkers.length > 0 && (
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 6,
                      padding: "8px 12px", borderBottom: `1px solid ${t.line}`,
                      background: t.surf2,
                    }}>
                      <span style={{ font: `400 11px ${SERIF}`, color: t.mut, alignSelf: "center" }}>
                        Jump to:
                      </span>
                      {visibleMarkers.map(([age, label]) => (
                        <button
                          key={age}
                          onClick={() => rowRefs.current[Number(age)]?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                          style={{
                            background: `${t.accent}14`, border: `1px solid ${t.accent}44`,
                            borderRadius: 6, cursor: "pointer",
                            font: `500 11px ${SERIF}`, color: t.accent,
                            padding: "3px 10px",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  );
                })()}

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
                  const marker = markerByAge?.[row.age];
                  const isRet = row.phase === "ret";
                  const wr = isRet ? row.withdrawalRatePct : null;
                  const wrHigh = wr != null && wr > ASSUMPTIONS.SAFE_WITHDRAWAL_GUIDELINE_PCT;
                  const wrColor = wr == null ? t.faint
                    : wr <= ASSUMPTIONS.SAFE_WITHDRAWAL_GUIDELINE_PCT ? t.good
                    : wr <= ASSUMPTIONS.WITHDRAWAL_RATE_DANGER_PCT ? t.warm : "#c0392b";
                  const milestone = milestoneByAge?.[row.age];
                  const isExpanded = expandedRow === row.age;
                  const engRow = isExpanded && isRet ? retirementRowByAge?.[row.age] : null;
                  return (
                    <React.Fragment key={row.age}>
                      {marker && (
                        <div style={{
                          display: "grid", gridTemplateColumns: GRID_COLS,
                          gap: 4, padding: "4px 14px",
                          background: `${t.accent}0c`,
                          borderTop: `1.5px dashed ${t.accent}55`,
                          borderBottom: `1px solid ${t.line}`,
                        }}>
                          <span style={{
                            gridColumn: "1 / -1",
                            font: `600 10px ${HF}`, color: t.accent,
                            letterSpacing: "0.07em", textTransform: "uppercase",
                          }}>
                            ↑ {marker}
                          </span>
                        </div>
                      )}
                      <div
                        ref={el => { if (el) rowRefs.current[row.age] = el; }}
                        role={isRet ? "button" : undefined}
                        tabIndex={isRet ? 0 : undefined}
                        aria-expanded={isRet ? isExpanded : undefined}
                        onClick={() => isRet ? setExpandedRow(e => e === row.age ? null : row.age) : undefined}
                        onKeyDown={isRet ? e => { if (e.key === "Enter") setExpandedRow(prev => prev === row.age ? null : row.age); } : undefined}
                        style={{
                          display: "grid", gridTemplateColumns: GRID_COLS,
                          gap: 4, alignItems: "center",
                          padding: "7px 14px",
                          borderBottom: `1px solid ${t.line}`,
                          borderTop: isRetStart ? `1.5px solid ${t.warm}88` : "none",
                          background: wrHigh
                            ? `${t.warm}08`
                            : i % 2 === 1 ? `${t.line}08` : "transparent",
                          cursor: isRet ? "pointer" : "default",
                        }}
                      >
                        <span style={{ font: `600 13px ${HM}`, color: isRet ? t.warm : t.good }}>{row.age}</span>
                        <span style={{ font: `400 12px ${HM}`, color: t.faint }}>{row.year}</span>
                        {/* Portfolio cell — with optional milestone badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <span style={{ font: `500 12px ${HM}`, color: t.ink }}>{fmt(row.total)}</span>
                          {milestone && (
                            <span style={{
                              font: `500 10px ${SERIF}`, background: `${t.accent}18`,
                              color: t.accent, borderRadius: 4, padding: "1px 5px",
                            }}>
                              {milestone}
                            </span>
                          )}
                        </div>
                        <span style={{ font: `400 12px ${HM}`, color: row.contrib != null && row.contrib > 0 ? t.accent : t.faint }}>
                          {row.contrib != null && row.contrib > 0 ? `+${fmt(row.contrib)}` : "—"}
                        </span>
                        <span style={{ font: `400 12px ${HM}`, color: row.growth > 0 ? t.good : t.faint }}>
                          {row.growth > 0 ? `+${fmt(row.growth)}` : "—"}
                        </span>
                        {/* Draw cell — with WR% sub-label for retirement rows */}
                        <div>
                          <div style={{ font: `400 12px ${HM}`, color: row.draw > 0 ? t.mut : t.faint }}>
                            {row.draw > 0 ? `−${fmt(row.draw)}` : "—"}
                          </div>
                          {isRet && wr != null && (
                            <div style={{ font: `400 10px ${HM}`, color: wrColor, marginTop: 1 }}>
                              WR {wr}%
                            </div>
                          )}
                        </div>
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
                      {/* Expandable per-account detail panel (Session 4) */}
                      {isExpanded && engRow && (
                        <div style={{
                          gridColumn: "1 / -1",
                          background: `${t.accent}0a`,
                          borderTop: `1px solid ${t.accent}22`,
                          padding: "8px 14px",
                          display: "flex", gap: 16, flexWrap: "wrap",
                          borderBottom: `1px solid ${t.line}`,
                        }}>
                          {[
                            { label: "Trad 401k", val: engRow.trad },
                            { label: "Roth",      val: engRow.roth },
                            { label: "Taxable",   val: engRow.taxable },
                            { label: "HSA",       val: engRow.hsa },
                          ].filter(a => a.val > 0).map(({ label, val }) => (
                            <div key={label} style={{ font: `400 12px ${SERIF}`, color: t.mut }}>
                              {label}{" "}
                              <span style={{ font: `600 12px ${HM}`, color: t.ink }}>{fmt(val)}</span>
                            </div>
                          ))}
                          {((engRow.rmdTax ?? 0) > 0 || (engRow.drawTax ?? 0) > 0 || (engRow.convTax ?? 0) > 0) && (
                            <div style={{ font: `400 11px ${SERIF}`, color: t.mut, width: "100%", marginTop: 4 }}>
                              Tax: RMD {fmt(engRow.rmdTax)}{" · "}Draw {fmt(engRow.drawTax)}{" · "}Conv. {fmt(engRow.convTax)}
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* footer: column totals + show-all toggle + reconciliation note */}
            <div style={{
              padding: "9px 14px", borderTop: `1.5px solid ${t.line2}`,
              background: t.surf2, flexShrink: 0,
              display: "flex", flexDirection: "column", gap: 5,
            }}>
              {/* Lifetime column totals — ties the table to the bigger story */}
              {flowDown && (
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {[
                    ["Contributions", flowDown.totalContrib, "+", t.accent],
                    ["Growth",        flowDown.totalGrowth,  "+", t.good],
                    ["Draws",         flowDown.distDraws,    "−", t.mut],
                    ...(taxView?.composition?.total > 0
                      ? [["Tax", taxView.composition.total, "−", t.warm]] : []),
                  ].map(([label, val, sign, color]) => val > 0 ? (
                    <span key={label} style={{ font: `400 11px ${HF}`, color: t.mut }}>
                      {label}:{" "}
                      <span style={{ font: `600 11px ${HM}`, color }}>{sign}{fmt(val)}</span>
                    </span>
                  ) : null)}
                </div>
              )}
              {/* Bottom row: note + show-all toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ font: `400 11px ${HF}`, color: t.faint }}>
                  whole life · {allRetirementRows.length} years · balances and growth shown gross; taxes appear in the Tax and Draw columns
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
          </div>
        )}

      </div>
    </div>
  );
}
