// frames-e.jsx — Direction E · The full picture (deep-dive for the number-hawks)
// Keeps C+/D's calm front, but adds a real "study the numbers" surface — the depth
// the original app had — reached two calm ways:
//   1. pull-the-thread: every glance number quietly unfolds its own derivation inline
//   2. one quiet destination: a "Numbers" entry in the recede-until-hover nav
// Anti-confusion guard: the deep page states up front that nothing here needs action.
// All figures trace to docs/FINANCIAL-MODEL.md (single filer, $100k, 401k $10k, HSA payroll).

const E_GREEN = W.good, E_GOLD = "#c8a86a";

// ── shared row of a financial statement ──
function ERow({ k, v, sub, accent = W.text, strong = false, indent = 0, top = false }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "9px 0", borderTop: top ? `1px solid ${W.line2}` : `1px solid ${W.line}` }}>
      <div style={{ paddingLeft: indent, display: "flex", flexDirection: "column", gap: 3 }}>
        <Label s={strong ? 13 : 12.5} c={strong ? W.text : W.mut} w={strong ? 700 : 500}>{k}</Label>
        {sub && <Label s={10.5} c={W.faint}>{sub}</Label>}
      </div>
      <span style={{ font: `${strong ? 600 : 500} ${strong ? 15.5 : 13.5}px/1 ${MONO}`, color: accent, whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

// ── section shell with anchor + numeral ──
function ESection({ n, title, desc, children, right }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 13 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${W.line2}`, color: W.mut, font: `600 11px/24px ${MONO}`, textAlign: "center", flexShrink: 0 }}>{n}</span>
          <div>
            <div style={{ font: `600 17px/1.2 ${FONT}`, color: W.text, letterSpacing: "-0.01em" }}>{title}</div>
            {desc && <Label s={11.5} c={W.faint} mb={0}>{desc}</Label>}
          </div>
        </div>
        {right}
      </div>
      <div style={{ paddingLeft: 37 }}>{children}</div>
    </section>
  );
}

// ── federal bracket waterfall ──
function EBracketBar() {
  const bands = [
    { r: "10%", tax: "$1,193", w: 11925, c: W.cool },
    { r: "12%", tax: "$4,386", w: 36550, c: E_GREEN },
    { r: "22%", tax: "$4,725", w: 21475, c: W.warn, marginal: true },
  ];
  const tot = bands.reduce((a, b) => a + b.w, 0);
  return (
    <div>
      <div style={{ display: "flex", height: 38, borderRadius: 8, overflow: "hidden", border: `1px solid ${W.line}` }}>
        {bands.map((b, i) => (
          <div key={i} style={{ width: `${(b.w / tot) * 100}%`, background: `${b.c}2e`, borderRight: i < bands.length - 1 ? `1px solid ${W.ink}` : "none", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ font: `600 11px/1 ${MONO}`, color: b.c }}>{b.r}</span>
            {b.marginal && <span style={{ position: "absolute", top: -1, right: 4, font: `600 7.5px/1 ${FONT}`, color: W.warn, letterSpacing: "0.06em" }}>MARGINAL</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 6 }}>
        {bands.map((b, i) => (
          <div key={i} style={{ width: `${(b.w / tot) * 100}%`, textAlign: "center" }}>
            <Label s={10} c={W.faint}>{b.tax}</Label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Social Security claiming curve (62→70) ──
function EClaimCurve() {
  const w = 300, h = 116, pad = 22;
  const pts = [["62", 0.70, "$1,960"], ["67", 1.00, "$2,800"], ["70", 1.24, "$3,472"]];
  const xs = (i) => pad + (i / 2) * (w - pad * 2);
  const ys = (v) => h - pad - ((v - 0.6) / 0.7) * (h - pad * 2);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(0)} ${ys(p[1]).toFixed(0)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <line x1={pad} x2={w - pad} y1={ys(1.0)} y2={ys(1.0)} stroke={W.line} strokeDasharray="3 3" />
      <path d={line} fill="none" stroke={E_GOLD} strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={xs(i)} cy={ys(p[1])} r={i === 1 ? 5 : 4} fill={i === 1 ? E_GOLD : W.ink} stroke={E_GOLD} strokeWidth="2" />
          <text x={xs(i)} y={h - 5} fill={W.faint} textAnchor="middle" style={{ font: `500 9.5px ${MONO}` }}>age {p[0]}</text>
          <text x={xs(i)} y={ys(p[1]) - 10} fill={i === 1 ? W.text : W.mut} textAnchor="middle" style={{ font: `500 9.5px ${MONO}` }}>{p[2]}</text>
        </g>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── concept card
function ERow2({ k, children }) {
  return <div><Eyebrow c={E_GOLD}>{k}</Eyebrow><div style={{ marginTop: 5 }}><Label s={13.5} c={W.text} w={500}>{children}</Label></div></div>;
}
function ESpec() {
  return (
    <div style={{ width: 470, height: 900, background: W.ink, padding: 34, fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${E_GOLD}22`, border: `1px solid ${E_GOLD}66`, color: E_GOLD, font: `700 17px/38px ${MONO}`, textAlign: "center" }}>E</span>
        <div>
          <div style={{ font: `600 22px/1 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>The full picture</div>
          <Label s={12} c={E_GOLD} style={{ marginTop: 3 }}>Depth for the number-hawks — calmly hidden</Label>
        </div>
      </div>
      <Label s={14} c={W.mut} mb={20}>Brings back every number the old app had — taxes, Social Security, Roth conversions, drawdown — but reached only on purpose, so casual users never trip over it.</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <ERow2 k="1 · Pull the thread">Every glance number quietly unfolds its own derivation. Tap "Take-home" and the federal / state / FICA math opens inline — depth from a number you're already curious about.</ERow2>
        <ERow2 k="2 · One quiet door">A "Numbers" entry sits in the recede-until-hover nav. Hawks go straight there; casual users glide right past it.</ERow2>
        <ERow2 k="3 · Permission to ignore">The deep page opens by saying nothing here needs action — so anyone who wanders in isn't left wondering if they've missed a chore.</ERow2>
        <ERow2 k="4 · Statement, not dashboard">Presented like a beautifully typeset financial statement — grouped, monospaced, footnoted — so studying it feels rewarding, not noisy.</ERow2>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: `1px solid ${W.line}`, paddingTop: 14 }}>
        <Eyebrow c={W.faint}>Faithful to the model</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
          {["Bracket waterfall", "FICA & HSA method", "AIME / PIA", "Conversion window", "Withdrawal rate"].map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── the doorway (home → depth)
function ETopBar({ numbersHot = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 28px", borderBottom: `1px solid ${W.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 18, height: 18, borderRadius: 6, background: `${E_GREEN}22`, border: `1px solid ${E_GREEN}66`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: E_GREEN }} />
        </span>
        <Label s={13.5} c={W.text} w={700} ls="0.01em">Horizon</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ padding: "6px 13px", borderRadius: 8, background: W.panel2, border: `1px solid ${W.line2}` }}><Label s={12.5} c={W.text} w={600}>Plan</Label></div>
        <div style={{ padding: "6px 13px" }}><Label s={12.5} c={W.faint} w={500}>Ideas</Label></div>
        {/* the quiet door — faint normally, lit on hover (shown lit here) */}
        <div style={{ padding: "6px 13px", borderRadius: 8, border: numbersHot ? `1px solid ${E_GOLD}55` : "1px solid transparent", background: numbersHot ? `${E_GOLD}12` : "transparent" }}>
          <Label s={12.5} c={numbersHot ? E_GOLD : W.faint} w={numbersHot ? 600 : 500}>The numbers</Label>
        </div>
        <div style={{ padding: "6px 13px" }}><Label s={12.5} c={W.faint} w={500}>Settings</Label></div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, border: `1px solid ${E_GREEN}55`, background: `${E_GREEN}14` }}>
        <Dot c={E_GREEN} /><Label s={11.5} c={E_GREEN} w={600}>On track</Label>
      </div>
    </div>
  );
}

// a glance stat that quietly carries a ƒ "show the math" affordance + inline unfold
function EThreadStat({ label, value, accent = W.text, sub, open = false }) {
  return (
    <div style={{ flex: 1, background: open ? W.panel2 : W.panel, border: `1px solid ${open ? `${E_GOLD}44` : W.line}`, borderRadius: 12, padding: 18, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Label s={11} c={W.mut} mb={0}>{label}</Label>
        <span style={{ width: 19, height: 19, borderRadius: 6, border: `1px solid ${open ? E_GOLD : W.line2}`, color: open ? E_GOLD : W.faint, font: `italic 600 11px/17px ${MONO}`, textAlign: "center" }}>ƒ</span>
      </div>
      <div style={{ marginTop: 9 }}><Num s={22} c={accent}>{value}</Num></div>
      <Label s={10.5} c={W.faint} mb={0} style={undefined}>{sub}</Label>
      {open && (
        <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${W.line}`, animation: "dFade .3s ease" }}>
          <Eyebrow c={E_GOLD}>How we got $78,091</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <ERowMini k="Gross income" v="$100,000" />
            <ERowMini k="Pre-tax 401(k) + HSA" v="−$14,300" />
            <ERowMini k="Federal income tax" v="−$10,303" sub="eff. 12.0% · 22% marginal" />
            <ERowMini k="State (5.0%)" v="−$4,285" />
            <ERowMini k="FICA (7.65%)" v="−$7,321" />
          </div>
          <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: E_GOLD }}>→</span>
            <Label s={11.5} c={W.text} w={600}>Open the full breakdown in <span style={{ color: E_GOLD }}>The numbers</span></Label>
          </div>
        </div>
      )}
    </div>
  );
}
function ERowMini({ k, v, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <div>
        <Label s={11.5} c={W.mut} mb={0}>{k}</Label>
        {sub && <Label s={9.5} c={W.faint} mb={0}>{sub}</Label>}
      </div>
      <span style={{ font: `500 12px/1 ${MONO}`, color: W.text }}>{v}</span>
    </div>
  );
}

function EDoorway() {
  return (
    <Browser url="horizon.app" w={1340} h={880}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ETopBar numbersHot />
        <div style={{ flex: 1, padding: "28px 36px", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 580 }}>
              <div style={{ font: `600 26px/1.16 ${FONT}`, color: W.text, letterSpacing: "-0.02em" }}>On track for retirement by 65.</div>
              <Label s={13.5} c={W.mut}>Calm by default. Curious about a number? Tap its <span style={{ color: E_GOLD, fontStyle: "italic" }}>ƒ</span> to see the math — or open <span style={{ color: E_GOLD }}>The numbers</span> for the whole statement.</Label>
            </div>
            <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", paddingTop: 4 }}>
              <Label s={11} c={W.faint} mb={0}>Power-user hint</Label>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 13px", borderRadius: 9, border: `1px dashed ${W.line2}` }}>
                <span style={{ fontStyle: "italic", color: E_GOLD, font: `600 13px/1 ${MONO}` }}>ƒ</span>
                <Label s={11.5} c={W.mut} mb={0}>= show the math behind any number</Label>
              </div>
            </div>
          </div>
          <div style={{ height: 26 }} />
          <CpTimeline activeIdx={1} lit={0.12} />
          <div style={{ height: 30 }} />
          <Label s={10.5} c={W.faint} mb={13} ls="0.14em">AT A GLANCE — TAP <span style={{ fontStyle: "italic", color: E_GOLD }}>ƒ</span> TO GO DEEPER</Label>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <EThreadStat label="Take-home this year" value="$78,091" accent={E_GREEN} sub="after every tax" open />
            <EThreadStat label="Retire at" value="65" sub="~$3.1M, today's dollars" />
            <EThreadStat label="Income for life" value="$8,200" accent={E_GOLD} sub="per month, never runs out" />
            <EThreadStat label="Withdrawal rate" value="3.5%" sub="portfolio funds 3.5% of itself" />
          </div>
        </div>
      </div>
    </Browser>
  );
}

// ─────────────────────────────────────────────────────────── the deep page
function ELedgerNav() {
  const items = [["01", "Taxes this year", true], ["02", "Accounts & contributions"], ["03", "Social Security"], ["04", "Roth conversion window"], ["05", "Drawdown & longevity"], ["06", "Assumptions"]];
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${W.line}`, padding: "30px 20px", display: "flex", flexDirection: "column", gap: 3 }}>
      <Eyebrow c={W.faint}>On this page</Eyebrow>
      <div style={{ height: 12 }} />
      {items.map(([n, t, on]) => (
        <div key={n} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: on ? W.panel : "transparent", border: `1px solid ${on ? W.line : "transparent"}` }}>
          <span style={{ font: `500 10px/1 ${MONO}`, color: on ? E_GOLD : W.faint }}>{n}</span>
          <Label s={12} c={on ? W.text : W.mut} w={on ? 600 : 500} mb={0}>{t}</Label>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: "12px 12px", borderRadius: 10, background: W.panel, border: `1px solid ${W.line}` }}>
        <Label s={10.5} c={W.faint} mb={6}>2026 tax year</Label>
        <Label s={11} c={W.mut} mb={0}>All figures use current IRS limits, frozen across projection years.</Label>
      </div>
    </div>
  );
}

function ELedger() {
  return (
    <Browser url="horizon.app/numbers" w={1340} h={1900}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ETopBar numbersHot />
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <ELedgerNav />
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: "30px 40px" }}>
            {/* page header + the permission-to-ignore guard */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 10 }}>
              <div>
                <div style={{ font: `600 28px/1.1 ${FONT}`, color: W.text, letterSpacing: "-0.025em" }}>The numbers</div>
                <Label s={13.5} c={W.mut} mb={0} style={undefined}>The full statement behind your plan.</Label>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: 10, background: `${E_GREEN}0e`, border: `1px solid ${E_GREEN}33`, maxWidth: 360 }}>
                <Dot c={E_GREEN} />
                <Label s={11.5} c={W.mut} mb={0}>Nothing here needs your attention — it's here for the curious, not a to-do list.</Label>
              </div>
            </div>
            <div style={{ height: 22 }} />

            {/* 01 Taxes */}
            <ESection n="01" title="Taxes this year" desc="How $100,000 of gross becomes $78,091 of take-home.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                <div>
                  <ERow k="Gross income" v="$100,000" />
                  <ERow k="Pre-tax 401(k)" v="−$10,000" indent={0} accent={ACCT.k401} />
                  <ERow k="Pre-tax HSA (payroll)" v="−$4,300" accent={ACCT.hsa} sub="payroll method — also cuts FICA" />
                  <ERow k="AGI" v="$85,700" strong />
                  <ERow k="Standard deduction" v="−$15,750" />
                  <ERow k="Taxable income" v="$69,950" strong />
                </div>
                <div>
                  <ERow k="Federal income tax" v="$10,303" accent={W.text} sub="effective 12.0% of AGI" />
                  <ERow k="State income tax" v="$4,285" sub="flat 5.0% effective (override available)" />
                  <ERow k="FICA — Social Security + Medicare" v="$7,321" sub="7.65% of gross less payroll HSA" />
                  <ERow k="Total tax" v="$21,909" strong top />
                  <ERow k="Take-home" v="$78,091" strong accent={E_GREEN} />
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Label s={11} c={W.faint} mb={9}>Where your federal tax lands — bracket by bracket</Label>
                <EBracketBar />
              </div>
            </ESection>

            {/* 02 Accounts */}
            <ESection n="02" title="Accounts & contributions" desc="What goes in each bucket, and the tax treatment of each.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {[
                  ["401(k) · traditional", "$10,000", "of $24,500 limit", "Pre-tax now, taxed at withdrawal", ACCT.k401],
                  ["Roth IRA", "$7,000", "of $7,000 limit · maxed", "After-tax now, tax-free forever", ACCT.roth],
                  ["HSA · family, payroll", "$4,300", "triple tax-advantaged", "Saves $329–$654 vs direct deposit", ACCT.hsa],
                ].map(([t, v, lim, note, c]) => (
                  <Panel key={t} p={16}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: c }} /><Label s={11.5} c={W.text} w={600} mb={0}>{t}</Label></div>
                    <Num s={20} c={c}>{v}</Num>
                    <Label s={10.5} c={W.faint} mb={0} style={undefined}>{lim}</Label>
                    <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${W.line}` }}><Label s={10.5} c={W.mut} mb={0}>{note}</Label></div>
                  </Panel>
                ))}
              </div>
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, border: `1px solid ${W.line}` }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCT.tax }} />
                <Label s={11.5} c={W.mut} mb={0}>Taxable brokerage growth carries a <span style={{ color: W.text }}>15% LTCG drag</span> each year — the model realizes gains annually rather than buy-and-hold.</Label>
              </div>
            </ESection>

            {/* 03 Social Security */}
            <ESection n="03" title="Social Security" desc="Earnings history → benefit, and what claiming age does to it.">
              <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 30 }}>
                <div>
                  <ERow k="AIME — avg indexed monthly earnings" v="$7,200" sub="35 highest years, capped at wage base" />
                  <ERow k="PIA — benefit at full retirement age" v="$2,800/mo" strong sub="90% / 32% / 15% across bend points" />
                  <ERow k="Spousal benefit" v="$1,400/mo" sub="50% of higher earner's PIA" />
                  <ERow k="Taxable share of benefit" v="up to 85%" sub="counts as ordinary income in bracket-fill" />
                </div>
                <div>
                  <Label s={11} c={W.faint} mb={4}>Claiming age changes the monthly check</Label>
                  <EClaimCurve />
                  <Label s={10.5} c={W.faint} mb={0}>Age 62 → 70% · FRA 67 → 100% · age 70 → 124%</Label>
                </div>
              </div>
            </ESection>

            {/* 04 Roth conversions */}
            <ESection n="04" title="Roth conversion window" desc="The low-income years between retiring and RMDs — a planning opportunity.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                <div>
                  <ERow k="Conversion window" v="age 65 → 72" strong sub="7 years before RMDs begin at 73" />
                  <ERow k="Bracket-fill target" v="top of 12%" sub="convert up to the bracket ceiling each year" />
                  <ERow k="Suggested conversion" v="~$30,400/yr" accent={ACCT.roth} />
                </div>
                <div>
                  <ERow k="Tax paid from taxable account" v="recommended" sub="Roth receives the full conversion" accent={E_GREEN} />
                  <ERow k="Tax paid from the conversion" v="alternative" sub="less efficient — Roth nets conversion − tax" />
                  <ERow k="Lifetime tax saved (est.)" v="$41,200" strong accent={E_GREEN} />
                </div>
              </div>
            </ESection>

            {/* 05 Drawdown */}
            <ESection n="05" title="Drawdown & longevity" desc="What the portfolio actually has to fund once income sources switch on.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                <div>
                  <ERow k="Effective annual expenses" v="$72,000" />
                  <ERow k="Less Social Security" v="−$33,600" accent={E_GOLD} />
                  <ERow k="Less pension" v="−$0" />
                  <ERow k="Net portfolio need" v="$38,400" strong sub="the only figure the portfolio funds" />
                </div>
                <div>
                  <ERow k="Withdrawal rate" v="3.5%" strong sub="net need ÷ balance at retirement" accent={E_GREEN} />
                  <ERow k="Real return" v="2.44%" sub="(1.05 ÷ 1.025) − 1, inflation-adjusted" />
                  <ERow k="Years sustained" v="for life" accent={E_GREEN} sub="growth ≥ need → never depletes" />
                  <ERow k="Left at 90" v="$1.4M" strong accent={E_GOLD} />
                </div>
              </div>
            </ESection>

            {/* 06 Assumptions */}
            <ESection n="06" title="Assumptions & simplifications" desc="The honest fine print — intentional modeling choices, not bugs.">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  "2026 brackets frozen across all years",
                  "Annual realization on taxable brokerage",
                  "Flat state effective rate in accumulation",
                  "SS assumes continuous work to retirement",
                  "Single fixed return — no sequence risk",
                  "Spouse accounts not yet modeled",
                ].map((t) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: W.panel, border: `1px solid ${W.line}` }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: W.faint }} />
                    <Label s={11} c={W.mut} mb={0}>{t}</Label>
                  </span>
                ))}
              </div>
              <Label s={11} c={W.faint} mb={0} style={undefined}>{""}</Label>
              <div style={{ marginTop: 14 }}><Label s={11.5} c={W.faint} mb={0}>Illustrative model, not financial advice. Every figure traces to a single 2026 IRS config — one source of truth.</Label></div>
            </ESection>
          </div>
        </div>
      </div>
    </Browser>
  );
}

Object.assign(window, { ESpec, EDoorway, ELedger,
  ETopBar, EThreadStat, ERowMini, E_GOLD, E_GREEN });
