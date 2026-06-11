// HorizonShell — Horizon UI shell (5-screen navigation).
// Additive: does not replace App.jsx — receives all computed values as props.
// Screens: Plan · Ideas · The numbers · Settings · Someday
// LAYOUT/STYLING ONLY — no calculation logic lives here.

import React, { useState, useCallback } from "react";
import ArcGraph, { GhostArc } from "./ArcGraph.jsx";
import { PALETTES, HF, HM, HD, useTheme } from "../horizon/ThemeContext.jsx";

// ── Small shared primitives ───────────────────────────────────────────────────

function Logo({ t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: 18, height: 18, borderRadius: 6,
        background: `${t.good}22`, border: `1px solid ${t.good}55`,
        display: "inline-flex", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: t.good }} />
      </span>
      <span style={{ font: `700 14px ${HF}`, color: t.ink }}>Horizon</span>
    </div>
  );
}

function OnTrackPill({ t, isSustainable }) {
  const color = isSustainable ? t.good : t.warm;
  const label = isSustainable ? "On track" : "Needs attention";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 999,
      border: `1px solid ${color}55`, background: `${color}18`
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span style={{ font: `600 12px ${HF}`, color }}>{label}</span>
    </span>
  );
}

function StatCard({ t, label, value, accent, warm, large }) {
  return (
    <div style={{
      flex: 1,
      background: warm ? `${t.warm}12` : t.surf,
      border: `1px solid ${warm ? `${t.warm}40` : t.line}`,
      borderRadius: 13, padding: 15
    }}>
      <div style={{ font: `500 11px ${HF}`, color: warm ? t.warm : t.mut, marginBottom: 9 }}>
        {label}
      </div>
      <div style={{
        font: `500 ${large ? 26 : 23}px ${HM}`,
        color: accent, letterSpacing: "-0.01em"
      }}>
        {value}
      </div>
    </div>
  );
}

function TabBar({ t, tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {tabs.map(({ id, label }, i) => (
        <div key={id} onClick={() => onChange(id)}
          style={{
            padding: "6px 13px", borderRadius: 8, cursor: "pointer",
            background: active === id ? t.surf2 : "transparent",
            border: active === id ? `1px solid ${t.line2}` : "1px solid transparent"
          }}>
          <span style={{
            font: `${active === id ? 600 : 500} 12.5px ${HF}`,
            color: active === id ? t.ink : t.faint
          }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(Math.abs(n) % 1e6 === 0 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtMo(annual) {
  if (annual == null || isNaN(annual)) return "—";
  return `$${Math.round(annual / 12).toLocaleString()}`;
}
function fmtProg(pct) { return `${Math.round(pct)}%`; }

// ── PLAN SCREEN ───────────────────────────────────────────────────────────────
function PlanScreen({ t, props }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, yearsSustained, isSustainable,
    takeHome, effectiveExpenses, balAt90,
    withdrawalRate, contribSeries, activity,
  } = props;

  const [arcView, setArcView] = useState("arc");

  const progressPct = isSustainable ? 100
    : Math.min(99, Math.round((yearsSustained / Math.max(1, lifeExpect - retirementAge)) * 100));

  const progressLabel = isSustainable
    ? "self-sustaining ↗"
    : `${Math.round(progressPct)}% there`;

  const progressColor = isSustainable ? t.good : progressPct >= 75 ? t.good : t.warm;

  const monthlyKeep = Math.round(takeHome / 12);
  const monthlyIncome = Math.round(effectiveExpenses / 12);

  return (
    <div style={{
      flex: 1, padding: "20px 28px 18px",
      display: "flex", flexDirection: "column", minHeight: 0
    }}>
      {/* headline row */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 14
      }}>
        <div>
          <div style={{
            font: `600 28px ${HF}`, color: t.ink,
            letterSpacing: "-0.025em", lineHeight: 1.1
          }}>
            {isSustainable
              ? `On track to retire at ${retirementAge}.`
              : `Retire at ${retirementAge} — keep building.`}
          </div>
          <div style={{ font: `500 14px ${HF}`, color: t.mut, marginTop: 7 }}>
            Work optional,{" "}
            <span style={{ color: t.accent, fontWeight: 700 }}>{activity}</span>{" "}
            mandatory.
          </div>
        </div>
        {/* progress bar */}
        <div style={{ width: 210, paddingTop: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ font: `600 12px ${HF}`, color: t.ink }}>{progressLabel}</span>
            <span style={{ font: `600 11.5px ${HF}`, color: progressColor }}>
              {isSustainable ? "↗ gaining" : withdrawalRate <= 0.04 ? "↗ on target" : "↗ adjust"}
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 6, background: t.line, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${t.good}, ${t.warm})`
            }} />
          </div>
        </div>
      </div>

      {/* arc graph */}
      <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <ArcGraph
          t={t}
          chartData={chartData}
          currentAge={currentAge}
          retirementAge={retirementAge}
          lifeExpect={lifeExpect}
          contribSeries={contribSeries}
          height={280}
          glow
          activeView={arcView}
          onViewChange={setArcView}
          showToggle
        />
      </div>

      {/* stats row */}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <StatCard t={t} label="You keep / mo"   value={fmtMo(takeHome)}         accent={t.good} />
        <StatCard t={t} label="Retire at"        value={String(retirementAge)}   accent={t.ink} />
        <StatCard t={t} label="Income for life"  value={fmtMo(effectiveExpenses)} accent={t.warm} warm />
        <StatCard t={t} label="Left at 90"       value={fmt(balAt90)}            accent={t.ink} />
      </div>
    </div>
  );
}

// ── IDEAS SCREEN ──────────────────────────────────────────────────────────────
function IdeasScreen({ t, props }) {
  const {
    chartData, currentAge, retirementAge, lifeExpect,
    totalAtRet, effectiveExpenses, balAt90, isSustainable,
    contribSeries,
  } = props;

  const [mode, setMode] = useState(null);

  const modeButtons = [
    { k: "life",    l: "Drop life onto timeline" },
    { k: "dials",   l: "Dial your future" },
    { k: "suggest", l: "Horizon suggestions" },
    { k: "askit",   l: "What if…" },
  ];

  return (
    <div style={{
      flex: 1, padding: "16px 26px 14px",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      {/* arc hero */}
      <ArcGraph
        t={t}
        chartData={chartData}
        currentAge={currentAge}
        retirementAge={retirementAge}
        lifeExpect={lifeExpect}
        contribSeries={contribSeries}
        height={260}
        glow={false}
        activeView="arc"
        showToggle={false}
      />

      {/* mode buttons */}
      <div style={{ display: "flex", gap: 7, margin: "10px 0 0", flexShrink: 0 }}>
        {modeButtons.map(({ k, l }) => {
          const on = mode === k;
          return (
            <div key={k}
              onClick={() => setMode(on ? null : k)}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 10,
                cursor: "pointer", textAlign: "center",
                border: `1px solid ${on ? t.accent : t.line2}`,
                background: on ? `${t.accent}14` : t.surf,
                font: `${on ? 600 : 400} 13px ${HF}`,
                color: on ? t.ink : t.mut,
                transition: "all .12s"
              }}>
              {l}
            </div>
          );
        })}
      </div>

      {/* mode panel */}
      {mode && (
        <div style={{ marginTop: 10, flexShrink: 0 }}>
          <div style={{
            background: t.surf, border: `1px solid ${t.line}`,
            borderRadius: 13, padding: 14
          }}>
            {mode === "life" && (
              <div style={{ font: `400 13px ${HF}`, color: t.mut }}>
                Life event pins — connect your{" "}
                <span style={{ color: t.accent, fontWeight: 600 }}>Money Events panel</span>{" "}
                below to place purchases, inheritances, and big trips directly on the Arc.
              </div>
            )}
            {mode === "dials" && (
              <div style={{ font: `400 13px ${HF}`, color: t.mut }}>
                Use the <span style={{ color: t.accent, fontWeight: 600 }}>Simple Planner</span> sliders
                (retirement age, life expectancy, return rate) to dial your future — the Arc updates in real time.
              </div>
            )}
            {mode === "suggest" && (
              <div style={{ font: `400 13px ${HF}`, color: t.mut }}>
                Horizon's optimizer found suggestions in the{" "}
                <span style={{ color: t.accent, fontWeight: 600 }}>What-If panel</span>{" "}
                below — try "Work longer" or "Retire early" to see the Arc shift.
              </div>
            )}
            {mode === "askit" && (
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span style={{ font: `600 16px ${HF}`, color: t.accent, flexShrink: 0 }}>What if…</span>
                <div style={{
                  flex: 1, height: 40, borderRadius: 10,
                  border: `1px solid ${t.line2}`, background: t.bg,
                  display: "flex", alignItems: "center", paddingLeft: 12
                }}>
                  <span style={{ font: `400 14px ${HF}`, color: t.mut }}>
                    I retire at {retirementAge - 2} instead of {retirementAge}?
                  </span>
                </div>
                <div style={{
                  padding: "11px 18px", borderRadius: 11, background: t.accent,
                  cursor: "pointer", flexShrink: 0
                }}>
                  <span style={{ font: `600 14px ${HF}`, color: "#fff" }}>Use What-If panel →</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* stats row */}
      <div style={{ display: "flex", gap: 9, marginTop: 8, flexShrink: 0 }}>
        {[
          { label: "Retire at",    value: String(retirementAge),      warm: false },
          { label: "Income / mo",  value: fmtMo(effectiveExpenses),   warm: true  },
          { label: "Nest egg",     value: fmt(totalAtRet),            warm: false },
          { label: "Left at 90",   value: fmt(balAt90),               warm: false },
        ].map(({ label, value, warm }) => (
          <div key={label} style={{
            flex: 1, background: t.surf, border: `1px solid ${t.line}`,
            borderRadius: 12, padding: "11px 13px"
          }}>
            <div style={{ font: `400 11px ${HF}`, color: t.mut, marginBottom: 5 }}>{label}</div>
            <div style={{ font: `600 18px ${HM}`, color: warm ? t.warm : t.ink }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── THE NUMBERS SCREEN ────────────────────────────────────────────────────────
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
        {items.map(([label, val, strong]) => (
          <div key={label} style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", gap: 12
          }}>
            <span style={{ font: `${strong ? 600 : 400} 14px ${SERIF}`, color: strong ? t.ink : t.mut, whiteSpace: "nowrap" }}>
              {label}
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

function NumbersScreen({ t, props }) {
  const {
    currentIncome, fedTax, ficaTotal, stateTaxAmt, takeHome, currentContribTotal,
    totalAtRet, retVals, effectiveExpenses, balAt90,
    householdSS, yearsSustained, isSustainable, withdrawalRate,
    retirementAge, currentAge, simData,
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

  // Year-by-year snapshot rows from simData (key ages only)
  const keyAges = [currentAge, ...Array.from({ length: 6 }, (_, i) => Math.round(currentAge + (retirementAge - currentAge) * (i + 1) / 6))
    .filter(a => a > currentAge && a < retirementAge), retirementAge];
  const uniqueKeyAges = [...new Set(keyAges)].sort((a, b) => a - b);

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
                ["Gross income",   `$${Math.round(currentIncome).toLocaleString()}`, false],
                ["Federal tax",    `−$${Math.round(fedTax ?? 0).toLocaleString()}`,  false],
                ["FICA + state",   `−$${Math.round(ficaTotal ?? 0).toLocaleString()}`, false],
                ["Pre-tax savings",`−$${Math.round(currentContribTotal).toLocaleString()}`, false],
                ["Take-home",      `$${Math.round(takeHome).toLocaleString()}`,       true],
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
                ["Trad 401k",     fmt(trad401),   false],
                ["Roth IRA",      fmt(roth),      false],
                ["Taxable",       fmt(taxable),   false],
                ["HSA",           fmt(hsa),       false],
                ["Nest egg by " + retirementAge, fmt(totalAtRet), true],
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
                ["Social Security",  `${fmtMo(householdSS)}/mo`, false],
                ["Portfolio draw",   `$${monthlyPortDraw.toLocaleString()}/mo`, false],
                ["Safe rate",        `${Math.round(withdrawalRate * 100 * 10) / 10}%`, false],
                ["Runs dry at",      runsOutLabel, false],
                ["Total monthly",    `$${monthlyTotal.toLocaleString()}/mo`, true],
              ]} bar={{
                segs: [
                  { f: monthlyHHSS,     c: t.warm, l: "Soc Sec" },
                  { f: monthlyPortDraw, c: t.good,  l: "Portfolio draw" },
                ],
                cap: "blended monthly income"
              }} />
            </div>
          </>
        )}

        {tab === "yearly" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "56px 1fr 1fr 2fr 1fr",
              padding: "10px 14px", borderBottom: `1.5px solid ${t.ink}`,
              background: t.surf2, flexShrink: 0
            }}>
              {["Age", "Income", "Tax", "Portfolio", ""].map((c, i) => (
                <span key={i} style={{ font: `600 12px ${HF}`, color: t.ink }}>{c}</span>
              ))}
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {uniqueKeyAges.map(age => {
                const row = simData?.find(d => d.age === age);
                if (!row) return null;
                const total = (row.trad ?? 0) + (row.roth ?? 0) + (row.taxable ?? 0) + (row.hsa ?? 0);
                const maxBal = totalAtRet > 0 ? totalAtRet : 1;
                const isRetire = age === retirementAge;
                const tagLabel = age === currentAge ? "Today" : isRetire ? "Retire" : null;
                const tc = isRetire ? t.accent : t.good;
                return (
                  <div key={age} style={{
                    display: "grid", gridTemplateColumns: "56px 1fr 1fr 2fr 1fr",
                    alignItems: "center", padding: "11px 14px",
                    borderBottom: `1px solid ${t.line}`,
                    background: isRetire ? `${t.accent}0e` : "transparent"
                  }}>
                    <span style={{ font: `600 15px ${HM}`, color: tc }}>{age}</span>
                    <span style={{ font: `400 13px ${HM}`, color: t.mut }}>
                      {row.income ? `$${Math.round(row.income / 1000)}k` : "—"}
                    </span>
                    <span style={{ font: `400 13px ${HM}`, color: t.mut }}>—</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 16 }}>
                      <span style={{ flex: 1, height: 12, borderRadius: 3, background: t.line, overflow: "hidden" }}>
                        <span style={{
                          display: "block", height: "100%",
                          width: `${Math.min(100, (total / maxBal) * 100)}%`,
                          background: age >= retirementAge ? t.warm : t.good, opacity: 0.75
                        }} />
                      </span>
                      <span style={{ font: `600 12px ${HM}`, color: t.ink, width: 52, textAlign: "right" }}>
                        {fmt(total)}
                      </span>
                    </span>
                    {tagLabel ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "3px 10px", borderRadius: 999,
                        border: `1px solid ${tc}55`, background: `${tc}14`,
                        font: `600 11px ${HF}`, color: tc, whiteSpace: "nowrap"
                      }}>{tagLabel}</span>
                    ) : <span />}
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

        {tab === "flow" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
            <div style={{
              flex: 1, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center",
              background: t.surf2, borderRadius: 10, border: `1px dashed ${t.line2}`
            }}>
              <span style={{ font: `400 14px ${HF}`, color: t.faint }}>
                Sankey diagram — Money flow · paycheck → accounts → {fmt(totalAtRet)}
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

// ── SETTINGS SCREEN ───────────────────────────────────────────────────────────
function SettingsScreen({ t }) {
  const { palKey, setPalKey, modePref, setModePref } = useTheme();

  return (
    <div style={{
      flex: 1, padding: "28px 36px",
      display: "flex", flexDirection: "column", gap: 28, overflow: "auto"
    }}>
      <div>
        <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 16 }}>
          Palette
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {Object.entries(PALETTES).map(([key, pal]) => {
            const on = palKey === key;
            return (
              <div key={key} onClick={() => setPalKey(key)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 999, background: pal.swatch,
                  border: `3px solid ${on ? t.ink : "transparent"}`,
                  boxShadow: `0 0 0 2px ${t.bg}`
                }} />
                <span style={{ font: `${on ? 600 : 400} 12px ${HF}`, color: on ? t.ink : t.mut }}>
                  {pal.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 16 }}>
          Theme
        </div>
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 11, background: t.line, alignSelf: "flex-start", width: "fit-content" }}>
          {[["light","Light"],["dark","Dark"],["auto","Auto"]].map(([k, l]) => {
            const on = modePref === k;
            return (
              <div key={k} onClick={() => setModePref(k)} style={{
                padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                background: on ? t.surf2 : "transparent",
                font: `${on ? 600 : 500} 13px ${HF}`,
                color: on ? t.ink : t.mut,
                boxShadow: on ? "0 1px 4px rgba(0,0,0,.10)" : "none"
              }}>{l}</div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ font: `600 13px ${HF}`, color: t.mut, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
          About
        </div>
        <p style={{ font: `400 13px ${HF}`, color: t.mut, lineHeight: 1.6, maxWidth: 520 }}>
          Horizon is a retirement planning tool that shows you the complete picture of your financial life —
          from today through retirement and beyond. All calculations use 2026 IRS limits.
        </p>
      </div>
    </div>
  );
}

// ── SOMEDAY SCREEN ────────────────────────────────────────────────────────────
const ACTIVITIES = [
  { k: "golf",    l: "Golf course",    sub: "18 holes whenever you want." },
  { k: "travel",  l: "First class",    sub: "The trip you've been putting off." },
  { k: "hiking",  l: "The mountains",  sub: "The trail has been waiting." },
  { k: "cooking", l: "The kitchen",    sub: "Three-hour dinners, every night." },
  { k: "garden",  l: "The garden",     sub: "Time is finally on your side." },
  { k: "family",  l: "The grandkids",  sub: "Fully present, zero distraction." },
];

function SomedayScreen({ t, props }) {
  const { effectiveExpenses, retirementAge, isSustainable, activity, setActivity } = props;
  const activeAct = ACTIVITIES.find(a => a.l.toLowerCase() === (activity ?? "golf course").toLowerCase())
    ?? ACTIVITIES[0];

  const statusLabel = isSustainable ? `Age ${retirementAge} · fully funded` : `Age ${retirementAge} · keep building`;

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#1a1410" }}>
      {/* photo placeholder */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, #2a2018 0%, #3d3020 40%, #2a2820 100%)"
      }}>
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.08 }}
          preserveAspectRatio="none">
          <line x1="0" y1="0" x2="100%" y2="100%" stroke="#fff" strokeWidth="1" />
          <line x1="100%" y1="0" x2="0" y2="100%" stroke="#fff" strokeWidth="1" />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <span style={{ font: `400 13px ${HF}`, color: "rgba(255,255,255,.15)", position: "relative", zIndex: 1 }}>
            thematic photo · {activeAct.l.toLowerCase()}
          </span>
        </div>
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

// ── ONBOARDING (first-run wizard) ─────────────────────────────────────────────
const OB_STEPS = [
  { q: "How old are you?",                          hint: "we'll map from today to 90",           field: "currentAge" },
  { q: "What do you earn a year?",                  hint: "before tax — rough is fine",           field: "currentIncome" },
  { q: "How much have you saved so far?",           hint: "all accounts combined, ballpark",      field: "totalSaved" },
  { q: "When would you like to retire?",            hint: "age, not year — easy to change",       field: "retirementAge" },
  { q: "How much to spend each month\nin retirement?", hint: "today's dollars",                  field: "monthlySpend" },
];

function OnboardingScreen({ t, initialValues, onComplete }) {
  const [step, setStep] = useState(0);
  const done = step >= OB_STEPS.length;
  const arcOp  = [0.08, 0.20, 0.36, 0.54, 0.72, 0.90][Math.min(step, 5)];
  const arcBlur = [8,    5,    3,    1,    0,    0  ][Math.min(step, 5)];
  const showHeadline = step >= 3;
  const showTagline  = step >= 4;
  const cur = OB_STEPS[Math.min(step, OB_STEPS.length - 1)];
  const displayVals = {
    currentAge:    initialValues?.currentAge ?? 34,
    currentIncome: `$${((initialValues?.currentIncome ?? 100_000) / 1000).toFixed(0)}k`,
    totalSaved:    `$${((initialValues?.totalSaved ?? 165_000) / 1000).toFixed(0)}k`,
    retirementAge: initialValues?.retirementAge ?? 65,
    monthlySpend:  `$${((initialValues?.monthlySpend ?? 6_000)).toLocaleString()}`,
  };

  return (
    <div style={{
      width: "100%", height: "100%", background: t.bg, fontFamily: HF,
      display: "flex", position: "relative", overflow: "hidden"
    }}>
      {/* ghost arc */}
      <div style={{ position: "absolute", inset: "24px 360px 60px 32px", pointerEvents: "none" }}>
        <GhostArc t={t} opacity={arcOp} blur={arcBlur} H={560} />
      </div>
      {/* emerging copy */}
      <div style={{
        position: "absolute", left: 44, bottom: 80,
        opacity: showHeadline ? 1 : 0, transition: "opacity .5s", pointerEvents: "none"
      }}>
        {showHeadline && (
          <div style={{ font: `600 28px ${HF}`, color: t.ink, letterSpacing: "-0.02em" }}>
            On track to retire at{" "}
            <span style={{ color: t.accent }}>{displayVals.retirementAge}</span>.
          </div>
        )}
        {showTagline && (
          <div style={{ font: `400 16px ${HF}`, color: t.mut, marginTop: 6 }}>
            Work optional,{" "}
            <span style={{ color: t.accent, fontWeight: 600 }}>golf course</span> mandatory.
          </div>
        )}
      </div>
      {/* right panel */}
      <div style={{
        width: 360, marginLeft: "auto", flexShrink: 0, height: "100%",
        background: t.surf, borderLeft: `1px solid ${t.line}`,
        display: "flex", flexDirection: "column", padding: "36px 28px", gap: 20, zIndex: 2
      }}>
        <Logo t={t} />
        {/* progress pips */}
        <div style={{ display: "flex", gap: 5 }}>
          {OB_STEPS.map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 4, borderRadius: 999,
              background: i < step ? t.accent : i === step ? `${t.accent}44` : t.line,
              transition: "background .3s"
            }} />
          ))}
        </div>
        <div style={{ font: `400 12px ${HF}`, color: t.faint }}>
          {done ? "all done" : `question ${step + 1} of ${OB_STEPS.length}`}
        </div>

        {done ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ font: `600 26px ${HF}`, color: t.ink, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Your plan is ready.
            </div>
            <div style={{ font: `600 17px ${HF}`, color: t.accent, lineHeight: 1.2 }}>
              Work optional.<br />Golf course mandatory.
            </div>
            <span style={{ flex: 1 }} />
            <div onClick={onComplete} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 20px", borderRadius: 12, background: t.accent, cursor: "pointer"
            }}>
              <span style={{ font: `600 15px ${HF}`, color: "#fff" }}>See my plan →</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{
              font: `600 26px ${HF}`, color: t.ink, letterSpacing: "-0.02em",
              lineHeight: 1.15, whiteSpace: "pre-line"
            }}>{cur.q}</div>
            <div style={{ font: `400 13px ${HF}`, color: t.mut }}>{cur.hint}</div>
            {/* stepper */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{
                width: 36, height: 36, flexShrink: 0, borderRadius: 9,
                border: `1.5px solid ${t.line2}`, background: t.surf,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                font: `600 18px ${HF}`, color: t.accent, cursor: "pointer"
              }}>−</span>
              <div style={{
                flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${t.line2}`,
                background: t.surf, display: "flex", alignItems: "center", justifyContent: "center",
                font: `600 18px ${HM}`, color: t.ink
              }}>{displayVals[cur.field]}</div>
              <span style={{
                width: 36, height: 36, flexShrink: 0, borderRadius: 9,
                border: `1.5px solid ${t.line2}`, background: t.surf,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                font: `600 18px ${HF}`, color: t.accent, cursor: "pointer"
              }}>+</span>
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {step > 0 && (
                <div onClick={() => setStep(s => s - 1)} style={{
                  padding: "12px 18px", borderRadius: 11,
                  border: `1px solid ${t.line2}`, background: t.surf,
                  font: `500 14px ${HF}`, color: t.mut, cursor: "pointer"
                }}>← Back</div>
              )}
              <div onClick={() => setStep(s => s + 1)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                padding: "13px", borderRadius: 11, background: t.accent, cursor: "pointer"
              }}>
                <span style={{ font: `600 15px ${HF}`, color: "#fff" }}>
                  {step === OB_STEPS.length - 1 ? "Build my plan →" : "Next →"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN SHELL ────────────────────────────────────────────────────────────────
const SCREENS = [
  { id: "plan",    label: "Plan" },
  { id: "ideas",   label: "Ideas" },
  { id: "numbers", label: "The numbers" },
  { id: "settings",label: "Settings" },
];

export default function HorizonShell({ onShowClassic, ...props }) {
  const { t } = useTheme();
  const [screen, setScreen] = useState("plan");
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { isSustainable, retirementAge } = props;

  return (
    <div style={{
      width: "100%", minHeight: "100vh",
      background: t.bg, fontFamily: HF,
      display: "flex", flexDirection: "column",
    }}>
      {/* Google Fonts for Horizon typography */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&display=swap');
      `}</style>

      {showOnboarding ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <OnboardingScreen
            t={t}
            initialValues={{
              currentAge:    props.currentAge,
              currentIncome: props.currentIncome,
              totalSaved:    props.totalAtRet,
              retirementAge: retirementAge,
              monthlySpend:  Math.round((props.effectiveExpenses ?? 0) / 12),
            }}
            onComplete={() => setShowOnboarding(false)}
          />
        </div>
      ) : (
        <>
          {/* nav bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 28px", borderBottom: `1px solid ${t.line}`,
            background: t.bg, flexShrink: 0
          }}>
            <Logo t={t} />
            <TabBar t={t} tabs={SCREENS} active={screen} onChange={setScreen} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <OnTrackPill t={t} isSustainable={isSustainable} />
              {/* classic view escape hatch */}
              <button onClick={onShowClassic} style={{
                font: `400 11px ${HF}`, color: t.faint,
                background: "transparent", border: `1px solid ${t.line}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer"
              }}>Classic view</button>
            </div>
          </div>

          {/* screen body */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {screen === "plan"     && <PlanScreen    t={t} props={props} />}
            {screen === "ideas"    && <IdeasScreen   t={t} props={props} />}
            {screen === "numbers"  && <NumbersScreen t={t} props={props} />}
            {screen === "settings" && <SettingsScreen t={t} />}
            {screen === "someday"  && <SomedayScreen t={t} props={props} />}
          </div>
        </>
      )}
    </div>
  );
}
