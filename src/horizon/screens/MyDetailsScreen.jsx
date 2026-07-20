// MyDetailsScreen — WI-3.2 (#99): the plan-fact destination.
// LAYOUT/FORMATTING ONLY (rule 10). Every value and every constraint (min/max/
// step, option labels) comes from the WI-3.1 setter bundles on horizonProps
// (props.profile / spending / accounts / health / assumptions) — the screen reads
// a field's `.value` and writes through its `.set`, and never computes a bound or
// derives a number. Social Security + pension are intentionally NOT here: they
// live in their Strategies flows (WI-3.4 / WI-3.5).
//
// Calm by default: topic cards are collapsed, each showing a one-line summary
// composed purely by formatting raw bundle values. Open a card to edit; desktop
// uses sliders, mobile uses ± steppers (the onboarding pattern).

import React, { useState } from "react";
import { HF } from "../ThemeContext.jsx";
// Editable-field primitives + formatters are shared with the Strategies flows.
import { DetailField, money, ageFmt, pctYr, pct } from "../fields.jsx";
import LockedCard from "../LockedCard.jsx";

function Card({ t, title, summary, note, open, onToggle, children }) {
  return (
    <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", background: "transparent", border: "none", font: "inherit",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 14, padding: "16px 18px", cursor: "pointer", minHeight: 44,
        }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", font: `600 15px ${HF}`, color: t.ink }}>{title}</span>
          {!open && <span style={{ display: "block", font: `400 12.5px ${HF}`, color: t.mut, marginTop: 3 }}>{summary}</span>}
        </span>
        <span style={{ font: `400 15px ${HF}`, color: t.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 16px" }}>
          {note && (
            <div style={{
              font: `400 12px/1.5 ${HF}`, color: t.mut, background: t.bg,
              border: `1px solid ${t.line}`, borderRadius: 9, padding: "9px 11px", marginBottom: 4,
            }}>{note}</div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export default function MyDetailsScreen({ t, props, isMobile }) {
  const { profile, spending, accounts, health, assumptions, spouseAccounts } = props;
  const isMarried = props.isMarried;
  // #30: the spouse & household card. Applicability is model-provided (principle 8);
  // premium gating comes from the entitlements bundle (LockedCard when locked).
  const spouseApplicable = props.spouseAccountsApplicable;
  const isPremium = props.entitlements?.isPremium !== false;
  const effLiving = props.budget?.effectiveLiving;
  const effExp    = props.effectiveExpenses;

  const [openId, setOpenId] = useState(null);
  const toggle = id => setOpenId(cur => (cur === id ? null : id));

  // State tax rate is stored as a fraction; the bundle exposes `.pct` (percent) for
  // display and its `.set` takes a percent — so the screen does no fraction math
  // (rule 10). value stays null when no override is set, so the field shows the
  // "Default" edge state (seeded from defaultPct) like every other nullable field.
  const sro = profile.stateRateOverride;
  const stateRateField = {
    value: sro.value === null ? null : sro.pct,
    set: sro.set, min: sro.min, max: sro.max, step: sro.step,
  };

  const F = (p) => <DetailField t={t} isMobile={isMobile} {...p} />;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "20px 16px 40px" : "28px 36px 48px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ font: `700 24px ${HF}`, color: t.ink, letterSpacing: "-0.02em" }}>My details</div>
        <div style={{ font: `400 14px ${HF}`, color: t.mut, marginTop: 4, marginBottom: 22 }}>
          The facts behind your plan. Change anything here and every screen updates.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* ── Income & job ── */}
          <Card t={t} title="Income & job" open={openId === "income"} onToggle={() => toggle("income")}
            summary={`${money(profile.currentIncome.value)} · grows ${profile.incomeGrowth.value}%/yr`}
            note="Your earnings drive contributions, taxes, and your Social Security estimate.">
            {F({ label: "Annual income", field: profile.currentIncome, format: money })}
            {F({ label: "Income growth", field: profile.incomeGrowth, format: pctYr })}
            {/* Plateau is only meaningful while income is still growing. */}
            {profile.incomeGrowth.value > 0 && F({ label: "Income plateau age", hint: "income stops growing after this age",
                 field: profile.incomeGrowthEndAge, format: ageFmt,
                 seed: profile.incomeGrowthEndAge.min, nullLabel: "No plateau" })}
            {F({ label: "Filing status", field: profile.filingStatus })}
            {F({ label: "Home state", field: profile.selectedState })}
            {/* Override only applies to states that tax income (defaultPct > 0). */}
            {profile.stateRateOverride.defaultPct > 0 && F({ label: "State tax rate", field: stateRateField, format: pct,
                 seed: profile.stateRateOverride.defaultPct,
                 nullLabel: `Default · ${pct(profile.stateRateOverride.defaultPct)}` })}
            {F({ label: "Other pre-tax deductions", hint: "FSA, dependent care, transit",
                 field: profile.otherPreTaxDeduc, format: money })}
            {isMarried && F({ label: "Spouse income", field: profile.spouseIncome, format: money })}
            {isMarried && profile.spouseIncome.value > 0 && F({ label: "Spouse income growth", field: profile.spouseIncomeGrowth, format: pctYr })}
          </Card>

          {/* ── Spending ── */}
          <Card t={t} title="Spending" open={openId === "spending"} onToggle={() => toggle("spending")}
            summary={spending.livingExpenses.value != null
              ? `${money(spending.livingExpenses.value)}/yr today`
              : "auto from income"}
            note="What you live on today and what you expect to spend in retirement.">
            {F({ label: "Living expenses (today)", field: spending.livingExpenses, format: money,
                 seed: effLiving, nullLabel: `Auto · ${money(effLiving)}` })}
            {F({ label: "Living expense growth", field: spending.livingExpenseGrowth, format: pctYr })}
            {F({ label: "Retirement spending", field: spending.annualExpenses, format: money,
                 seed: effExp, nullLabel: `Auto · ${money(effExp)}` })}
            {F({ label: "Portfolio target", hint: "milestone goal at retirement",
                 field: spending.retirementTarget, format: money })}
          </Card>

          {/* ── Accounts & match ── */}
          <Card t={t} title="Accounts & match" open={openId === "accounts"} onToggle={() => toggle("accounts")}
            summary={`401k ${money(accounts.trad401k.bal.value)} · match ${accounts.employerMatchPct.value}%`}
            note="Balances grow with your contributions and returns. Contributions are capped at 2026 IRS limits.">
            {[
              ["Traditional 401k", accounts.trad401k],
              ["Roth IRA",         accounts.roth],
              ["Taxable",          accounts.taxable],
              ["HSA",              accounts.hsa],
            ].map(([name, a]) => (
              <div key={name} style={{ marginTop: 10 }}>
                <div style={{ font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>{name}</div>
                {F({ label: "Balance", field: a.bal, format: money })}
                {F({ label: "Annual contribution", field: a.contrib, format: money })}
                {F({ label: "Contribute until", field: a.contribEnd, format: ageFmt })}
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <div style={{ font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>Other & employer match</div>
              {F({ label: "Additional pre-tax balance", hint: "other IRAs / pensions for RMDs",
                   field: accounts.addlPreTaxBal, format: money })}
              {F({ label: "Match type", field: accounts.matchMode })}
              {accounts.matchMode.value === "flat" && F({ label: "Employer match", field: accounts.employerMatchPct, format: pct })}
              {accounts.matchMode.value === "formula" && F({ label: "Match rate", field: accounts.matchFormulaRate, format: pct })}
              {accounts.matchMode.value === "formula" && F({ label: "On the first … of salary", field: accounts.matchFormulaCap, format: pct })}
            </div>
          </Card>

          {/* ── Spouse & household (#30, premium) ── shown only when a spouse is modeled ── */}
          {spouseApplicable && !isPremium && (
            <LockedCard t={t}
              title="Spouse & household"
              teaser="Model your spouse's 401k, Roth, taxable, and HSA accounts for a true combined retirement picture, with per-spouse RMDs." />
          )}
          {spouseApplicable && isPremium && spouseAccounts && (
            <Card t={t} title="Spouse & household" open={openId === "spouse"} onToggle={() => toggle("spouse")}
              summary={`Spouse 401k ${money(spouseAccounts.trad401k.bal.value)} · match ${spouseAccounts.employerMatchPct.value}%`}
              note="Your spouse's accounts are simulated on their own income, age, and IRS limits, then combined with yours for the household portfolio and drawdown. Spouse income lives in the Income card.">
              {[
                ["Traditional 401k", spouseAccounts.trad401k],
                ["Roth IRA",         spouseAccounts.roth],
                ["Taxable",          spouseAccounts.taxable],
                ["HSA",              spouseAccounts.hsa],
              ].map(([name, a]) => (
                <div key={name} style={{ marginTop: 10 }}>
                  <div style={{ font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>{name}</div>
                  {F({ label: "Balance", field: a.bal, format: money })}
                  {F({ label: "Annual contribution", field: a.contrib, format: money })}
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <div style={{ font: `600 12px ${HF}`, color: t.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>HSA coverage & employer match</div>
                {F({ label: "HSA coverage", hint: "family HDHP is a shared household limit", field: spouseAccounts.hsaCoverageType })}
                {F({ label: "Match type", field: spouseAccounts.matchMode })}
                {spouseAccounts.matchMode.value === "flat" && F({ label: "Employer match", field: spouseAccounts.employerMatchPct, format: pct })}
                {spouseAccounts.matchMode.value === "formula" && F({ label: "Match rate", field: spouseAccounts.matchFormulaRate, format: pct })}
                {spouseAccounts.matchMode.value === "formula" && F({ label: "On the first … of salary", field: spouseAccounts.matchFormulaCap, format: pct })}
              </div>
            </Card>
          )}

          {/* ── Health & Medicare ── */}
          <Card t={t} title="Health & Medicare" open={openId === "health"} onToggle={() => toggle("health")}
            summary={`${health.hasMarketplaceInsurance.value ? "Marketplace" : "No marketplace"}${health.hasMedicare.value ? " · Medicare" : ""}`}
            note="Used for ACA subsidy and IRMAA estimates around Roth conversions.">
            {F({ label: "Marketplace insurance", field: health.hasMarketplaceInsurance })}
            {/* Household size + premium only matter with marketplace coverage. */}
            {health.hasMarketplaceInsurance.value && F({ label: "Household size", field: health.householdSize })}
            {health.hasMarketplaceInsurance.value && F({ label: "Marketplace premium (monthly)", field: health.marketplaceMonthlyPremium, format: money,
                 nullLabel: "Not set" })}
            {F({ label: "On Medicare", field: health.hasMedicare })}
            {/* Which person is on Medicare only applies to a two-person household. */}
            {health.hasMedicare.value && isMarried && F({ label: "People on Medicare", field: health.personOnMedicare })}
          </Card>

          {/* ── Assumptions ── */}
          <Card t={t} title="Assumptions" open={openId === "assumptions"} onToggle={() => toggle("assumptions")}
            summary={`${assumptions.returnRate.value}% return · ${assumptions.inflationRate.value}% inflation · to age ${assumptions.lifeExpect.value}`}
            note="The dials behind every projection. Conservative returns and realistic inflation keep the plan honest.">
            {F({ label: "Current age", field: assumptions.currentAge, format: ageFmt })}
            {F({ label: "Retirement age", field: assumptions.retirementAge, format: ageFmt })}
            {F({ label: "Plan to age", field: assumptions.lifeExpect, format: ageFmt })}
            {F({ label: "Annual return", field: assumptions.returnRate, format: pctYr })}
            {F({ label: "Inflation", field: assumptions.inflationRate, format: pctYr })}
            {F({ label: "Retirement state", field: assumptions.retirementState })}
            {F({ label: "Deploy surplus", hint: "share of leftover income to invest",
                 field: assumptions.savingsSurplusPct, format: pct })}
          </Card>

        </div>
      </div>
    </div>
  );
}
