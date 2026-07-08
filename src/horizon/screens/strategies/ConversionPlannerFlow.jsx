// ConversionPlannerFlow — WI-3.6 (#103): the Roth-conversion planner, interactive.
// Mounts in the StrategiesScreen detail slot. LAYOUT/FORMATTING ONLY (rule 10):
// every number comes from props.conversionView (cv — the sibling flow bundle),
// props.taxView.conversionDetail (the verdict + its components — the SAME source
// the Taxes tab and the Strategies card face read, so this flow can never show a
// different number), or top-level horizonProps scalars already wired
// (netConversionBenefit / householdSS / effectivePension). Every control writes
// through the WI-3.1 `conversion` / `health` setter bundles — this flow performs
// zero arithmetic and zero comparisons on model values (array .length/.slice and
// reading pre-computed booleans are the only "logic" here). IRS ages in copy come
// from config (principle 9), never a literal.
//
// The optimizer suggestion (section 10) is the first WI-3.9 Apply-with-preview
// consumer: clicking "Apply suggestion" opens ApplyPreviewModal with the payload
// App.jsx already built (buildConversionPreview) — this component never builds or
// edits that payload, only renders it and wires confirm/cancel.

import React, { useState } from "react";
import { HF, HM } from "../../ThemeContext.jsx";
import { DetailField, money } from "../../fields.jsx";
import { SectionLabel, NoteBox, StatTile, STAT_ROW } from "./flow-ui.jsx";
import ApplyPreviewModal from "../../ApplyPreviewModal.jsx";
import { RMD_START_AGE, EARLY_WITHDRAWAL_AGE } from "../../../config/irs-2026.js";

// "59.5" → "59½" — a display-only formatter over a fixed config constant (mirrors
// SSTimingFlow's claimAgeFmt precedent: formatting logic on an IRS age, not a
// comparison on a user-adjustable model value).
const halfAgeFmt = age => (Number.isInteger(age) ? `${age}` : `${Math.floor(age)}½`);

export default function ConversionPlannerFlow({ t, props, isMobile = false }) {
  const cv = props.conversionView;
  const conv = props.conversion;   // WI-3.1 setter bundle: mode/bracketTarget/amount/taxSource
  const health = props.health;     // WI-3.1 setter bundle: marketplace/Medicare toggles + detail
  const cd = props.taxView.conversionDetail;

  const [previewOpen, setPreviewOpen] = useState(false);
  const F = (p) => <DetailField t={t} isMobile={isMobile} {...p} />;
  const applySite = cv.optimizer.applySuggestion;

  const addBtn = {
    alignSelf: "flex-start", minHeight: 44, font: `600 12.5px ${HF}`, color: t.accent,
    background: "transparent", border: `1px solid ${t.line2}`, borderRadius: 8,
    padding: "8px 14px", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 1. Explainer ── */}
      <NoteBox t={t}>
        A Roth conversion moves money from your pre-tax 401k into your Roth IRA. You pay
        ordinary income tax on the amount now, but it then grows tax-free and is never
        subject to RMDs. Converting systematically across the low-income years between
        retirement and age {RMD_START_AGE} — before RMDs force the issue — is called a
        Roth conversion ladder: pre-paying tax at a lower rate now instead of a higher one
        later.
        <div style={{ marginTop: 8 }}>
          <span style={{ color: t.warm }}>5-year rule:</span> each year's conversion starts
          its own 5-year clock. Retiring at {halfAgeFmt(EARLY_WITHDRAWAL_AGE)} or later means
          the 10% early-withdrawal penalty doesn't apply to the conversion itself, but the
          converted earnings still need the Roth account to be 5 years old (and you {halfAgeFmt(EARLY_WITHDRAWAL_AGE)}+)
          to come out tax-free.
        </div>
      </NoteBox>

      {/* ── 2. No-window edge state ── */}
      {!cv.window.hasConvWindow && (
        <NoteBox t={t}>
          {/* In the empty-window branch the model pins endAge to the retirement age
              itself (retirement-phase window resolution) — displayed as such here so
              the screen does no age arithmetic (rule 10). */}
          No conversion window is available — your retirement age (age {cv.window.endAge})
          leaves no low-income gap years before RMDs start at {RMD_START_AGE}. Working-year
          conversions (below) may still help if your plan allows them.
        </NoteBox>
      )}

      {cv.window.hasConvWindow && (
        <>
          {/* ── 3. Window ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionLabel t={t}>Conversion window</SectionLabel>
            <div style={{ font: `400 11px ${HF}`, color: t.faint, marginBottom: 4 }}>{cv.window.windowLabel}</div>
            {F({ label: "Start converting at age", field: cv.window.startAgeField, format: v => `age ${v}` })}
            {F({ label: "Stop converting at age", field: cv.window.endAgeField, format: v => `age ${v}` })}
            {cv.window.isDefaultWindow && (
              <div style={{ font: `400 11px ${HF}`, color: t.faint }}>Auto — fills the whole window</div>
            )}
            <div style={{ font: `400 10.5px/1.5 ${HF}`, color: t.faint }}>
              The low-income "gap years" between retirement and age {RMD_START_AGE} (when RMDs
              begin) are usually the best time to convert. Default fills the whole window.
            </div>
          </div>

          {/* ── 4. Strategy ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionLabel t={t}>Strategy</SectionLabel>
            {F({ label: "Approach", field: conv.conversionMode })}
            {conv.conversionMode.value === "bracket" && (
              <>
                {F({ label: "Fill to bracket", field: conv.conversionBracketTarget })}
                <div style={{ font: `400 11px ${HF}`, color: t.faint }}>
                  Suggested annual conversion:{" "}
                  <span style={{ font: `600 11px ${HM}`, color: t.accent }}>{cv.targets.bracketFillLabel}</span>
                  {cv.targets.targetsVary ? (
                    <> · larger in early years before Social Security/pension start, tapering once they begin</>
                  ) : (
                    <>
                      {" "}· assumes Social Security ({money(props.householdSS)}/yr, 85% taxable)
                      {cv.targets.assumesPension && <> + pension ({money(props.effectivePension)}/yr)</>} as
                      other ordinary income
                    </>
                  )}
                </div>
              </>
            )}
            {conv.conversionMode.value === "custom" && (
              F({ label: "Annual conversion amount", field: conv.annualConversionAmt, format: money })
            )}
          </div>

          {/* ── 5. Tax source ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionLabel t={t}>Where does the conversion tax come from?</SectionLabel>
            {F({ label: "Pay conversion tax from", field: conv.conversionTaxSource })}
            <div style={{ font: `400 11px/1.6 ${HF}`, color: t.faint }}>
              When you convert 401k → Roth, you owe tax on the amount converted. That tax can
              come from the converted amount itself (less lands in Roth) or from your taxable
              brokerage account (the full conversion stays in Roth). Paying from taxable is
              more efficient.
            </div>
            {cv.outcome.showTaxSourceComparison && (
              <>
                <div style={STAT_ROW}>
                  <StatTile t={t} label="Roth (tax from converted)" value={money(cv.outcome.rothBalEndConv)} dim />
                  <StatTile t={t} label="Roth (tax from taxable)" value={money(cv.outcome.rothBalEndTax)} tone="good" />
                </div>
                <div style={{ font: `400 11px ${HF}`, color: t.good }}>
                  Paying from taxable puts {money(cv.outcome.rothAdvantage)} more into Roth.
                </div>
              </>
            )}
            <NoteBox t={t}>
              The longevity and RMD numbers above already reflect your engine settings; this
              comparison shows how the window's own outcome changes with a different
              tax-funding source, not a change to the plan above.
            </NoteBox>
          </div>

          {/* ── 6. Outcome stat row (GROSS net — Classic parity; the healthcare-adjusted
                figure appears only in section 7's strip) ── */}
          <div style={STAT_ROW}>
            <StatTile t={t} label="Annual conversion" value={cv.outcome.annualConversionLabel} />
            <StatTile t={t} label="Conversion tax cost" value={money(cd.conversionCost)} tone="warm" />
            <StatTile t={t} label="RMD tax saved" value={money(cd.rmdTaxSaved)} tone="good" />
            <StatTile t={t} label={cv.outcome.netIsPositive ? "Net savings" : "Net cost"}
              value={money(props.netConversionBenefit)} sub="before healthcare costs"
              tone={cv.outcome.netIsPositive ? "good" : "warm"} />
          </div>

          {/* ── 7. Healthcare impact ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel t={t}>Healthcare impact</SectionLabel>
            {F({ label: "Marketplace insurance", field: health.hasMarketplaceInsurance })}
            {F({ label: "On Medicare", field: health.hasMedicare })}

            {health.hasMarketplaceInsurance.value && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {F({ label: "Household size", field: health.householdSize })}
                {F({ label: "Marketplace premium (monthly)", field: health.marketplaceMonthlyPremium,
                  format: money, nullLabel: "Not set" })}
                {cv.healthcare.showAcaWarning ? (
                  <NoteBox t={t} tone="warm">
                    {cv.healthcare.cliffCount} year{cv.healthcare.cliffCount === 1 ? "" : "s"} exceed the ACA
                    subsidy cliff — at this household size, the threshold is {money(cv.healthcare.cliffThreshold)}
                    {" "}MAGI. Conversions push you over at age{cv.healthcare.cliffCount === 1 ? "" : "s"}{" "}
                    {cv.healthcare.cliffAges.join(", ")}
                    {" "}— an estimated {money(cv.healthcare.acaAnnualLoss)} in lost subsidy.
                  </NoteBox>
                ) : cv.healthcare.showNoCliffNote ? (
                  <NoteBox t={t} tone="good">
                    No ACA cliff crossings — conversions stay under {money(cv.healthcare.cliffThreshold)} each year.
                  </NoteBox>
                ) : null}
              </div>
            )}

            {health.hasMedicare.value && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {F({ label: "People on Medicare", field: health.personOnMedicare })}
                {cv.healthcare.showIrmaa ? (
                  <NoteBox t={t} tone="warm">
                    IRMAA surcharge — {money(cv.healthcare.irmaaCost)} total. Conversion income at these
                    ages triggers Medicare premium surcharges (2-year lookback):{" "}
                    {cv.healthcare.irmaaRows.map(r => `${r.age}: ${money(r.cost)}`).join(" · ")}
                  </NoteBox>
                ) : (
                  <NoteBox t={t} tone="good">No IRMAA surcharges — conversions stay below Medicare thresholds.</NoteBox>
                )}
              </div>
            )}

            {!health.hasMarketplaceInsurance.value && !health.hasMedicare.value && (
              <div style={{ font: `400 11px/1.5 ${HF}`, color: t.faint }}>
                Turn on the toggles above to see how conversion income affects marketplace
                subsidies (ACA cliff) or Medicare premiums (IRMAA).
              </div>
            )}

            {(cv.healthcare.showIrmaa || cv.healthcare.showAcaWarning) && (
              <div style={STAT_ROW}>
                <StatTile t={t} label="Gross benefit" value={money(props.netConversionBenefit)}
                  tone={cv.outcome.netIsPositive ? "good" : "warm"} />
                {cv.healthcare.showIrmaa && <StatTile t={t} label="IRMAA" value={`−${money(cv.healthcare.irmaaCost)}`} tone="warm" />}
                {cv.healthcare.showAcaWarning && <StatTile t={t} label="ACA loss" value={`−${money(cv.healthcare.acaAnnualLoss)}`} tone="warm" />}
                <StatTile t={t} label="Adjusted net benefit" value={money(cd.adjustedNetConversionBenefit)}
                  tone={cd.isPositive ? "good" : "warm"} />
              </div>
            )}
          </div>

          {/* ── 8. Tables ── */}
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel t={t}>Conversion window — year by year</SectionLabel>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 14px", minWidth: 280 }}>
                  {["Age", "Converted", "401k left", "Tax paid"].map(h => (
                    <span key={h} style={{ font: `500 10px ${HF}`, color: t.mut, textTransform: "uppercase",
                      letterSpacing: "0.05em", borderBottom: `1px solid ${t.line}`, paddingBottom: 4 }}>{h}</span>
                  ))}
                  {cv.tables.simYears.slice(0, 12).map(({ age, conversion, tradBal, tax }) => (
                    <React.Fragment key={age}>
                      <span style={{ font: `600 12px ${HM}`, color: t.accent }}>{age}</span>
                      <span style={{ font: `400 12px ${HM}`, color: t.ink }}>{money(conversion)}</span>
                      <span style={{ font: `400 12px ${HM}`, color: t.mut }}>{money(tradBal)}</span>
                      <span style={{ font: `400 12px ${HM}`, color: t.faint }}>{money(tax)}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel t={t}>RMD impact — first 8 years</SectionLabel>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "4px 14px", minWidth: 220 }}>
                  {["Age", "No conversion", "With conversions"].map(h => (
                    <span key={h} style={{ font: `500 10px ${HF}`, color: t.mut, textTransform: "uppercase",
                      letterSpacing: "0.05em", borderBottom: `1px solid ${t.line}`, paddingBottom: 4 }}>{h}</span>
                  ))}
                  {cv.tables.rmdCompare.slice(0, 8).map(({ age, noConv, withConv, improved }) => (
                    <React.Fragment key={age}>
                      <span style={{ font: `600 12px ${HM}`, color: t.accent }}>{age}</span>
                      <span style={{ font: `400 12px ${HM}`, color: t.warm }}>{money(noConv)}</span>
                      <span style={{ font: `400 12px ${HM}`, color: improved ? t.good : t.ink }}>
                        {withConv == null ? "—" : money(withConv)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 9. Working-year conversions (#118) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionLabel t={t}>Working-year conversions</SectionLabel>
        <div style={{ font: `400 11px/1.6 ${HF}`, color: t.faint }}>
          Most conversions are best done in the gap years after retirement (above). But if you
          hit a low-income year before retiring — a job change, a sabbatical — converting some
          401k → Roth then can lock in a low tax rate and shrink future RMDs.
        </div>
        {F({ label: "My 401k plan allows in-service conversions", field: cv.events.inServiceField })}

        {cv.events.inServiceField.value ? (
          cv.events.hasWorkingYears ? (
            <>
              {cv.events.rows.length === 0 && (
                <div style={{ font: `400 11.5px/1.6 ${HF}`, color: t.mut, fontStyle: "italic" }}>
                  No working-year conversions yet. If you have a low-income year before retiring,
                  converting some 401k → Roth then can lock in a low tax rate.
                </div>
              )}
              {cv.events.rows.map(row => (
                <div key={row.id} style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 10,
                  padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" aria-label={`Remove conversion year at age ${row.ageField.value}`}
                      onClick={row.remove}
                      style={{ background: "transparent", border: "none", color: t.faint, cursor: "pointer",
                        font: `600 16px ${HF}`, padding: "0 4px", minHeight: 44 }}>×</button>
                  </div>
                  {F({ label: "Age", field: row.ageField, format: v => `age ${v}` })}
                  {F({ label: "Amount", field: row.amountField, format: money })}
                  <div style={{ font: `400 10.5px ${HF}`, color: t.faint }}>{row.estTaxLabel}</div>
                </div>
              ))}
              {!cv.events.atMax && (
                <button type="button" onClick={cv.events.add} style={addBtn}>+ Add conversion year</button>
              )}
              {cv.events.rows.length > 0 && (
                <div style={{ font: `400 11px/1.5 ${HF}`, color: t.faint }}>
                  Total planned before retirement:{" "}
                  <span style={{ font: `600 11px ${HM}`, color: t.ink }}>{cv.events.totalPlannedLabel}</span>
                  {" "}— lowers future RMDs (shows up as longer longevity and lower lifetime RMD tax, not
                  in the window benefit figure above).
                </div>
              )}
            </>
          ) : (
            <div style={{ font: `400 11.5px/1.6 ${HF}`, color: t.mut, fontStyle: "italic" }}>
              No working years remain before retirement to model conversions.
            </div>
          )
        ) : (
          <div style={{ font: `400 11px/1.6 ${HF}`, color: t.faint }}>
            Converting an active employer 401k while still working is plan-dependent — many
            plans only allow it after age {halfAgeFmt(EARLY_WITHDRAWAL_AGE)}, or not at all. Check the box
            once you've confirmed your plan allows it (it's always available from a rollover
            IRA after you leave a job).
          </div>
        )}
      </div>

      {/* ── 10. Optimizer suggestion (WI-3.9 Apply-with-preview) ── */}
      {applySite.available && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NoteBox t={t} tone="good">
            Converting {money(cv.optimizer.suggestedAmount)}/yr starting at age{" "}
            {cv.optimizer.suggestedStartAge} maximizes net benefit after healthcare costs
            (est. {money(cv.optimizer.suggestedBenefit)} net). Your current setting:{" "}
            {cv.optimizer.currentAmountLabel}/yr from age {cv.optimizer.currentStartAge}.
          </NoteBox>
          <button type="button" onClick={() => setPreviewOpen(true)}
            style={{ alignSelf: "flex-start", minHeight: 44, font: `600 13px ${HF}`, color: "#fff",
              background: t.accent, border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}>
            Apply suggestion
          </button>
        </div>
      )}

      {previewOpen && applySite.preview && (
        <ApplyPreviewModal t={t} preview={applySite.preview}
          onConfirm={() => { applySite.apply(); setPreviewOpen(false); }}
          onCancel={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}
