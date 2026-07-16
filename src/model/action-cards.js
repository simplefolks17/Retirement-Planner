// action-cards.js — generates phase action cards and waterfall step data.
// Imports C from theme.js (plain JS, no React) — safe to import anywhere.
// This keeps impactColor values consistent with the rest of the UI without
// requiring a COLOR_MAP translation layer.

import { fmt, fmtFull } from "../formatters.js";
import { TAX_DATA_2026, ROTH_IRA_LIMIT_2026, HSA_LIMIT_2026, SS_MAX_CLAIM_AGE, SS_FRA, RMD_START_AGE } from "../config/irs-2026.js";
import { C } from "../theme.js";

// Returns { phase1Actions, phase2Actions, phase3Actions }.
// Each action: { mode, title, body, impact?, impactColor?, impactLabel?, vsA?, vsB? }
export function generatePhaseActions({
  // Portfolio & drawdown
  totalAtRet, netPortfolioNeed, withdrawalRate, yearsSustained,
  isSustainable, safeRetAge, safeLifeExp, currentAge, effectivePension,
  // Budget
  availableSurplus, savingsSurplusPct, effectiveLiving,
  grossAfterTax, currentContribTotal, contrib401k, contribHSA,
  // Employer match
  matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct,
  employerMatchAmt, currentIncome,
  // Roth / phase-out
  rothPhaseoutWarning, rothFullyPhased, rothMAGI, filingStatus,
  // Mega backdoor
  megaCapacity,
  // Conversion
  netConversionBenefit, conversionSim, annualConversion,
  convPeakTarget, convSteadyTarget, convTargetVaries,
  conversionWindowYrs, rmdTaxSaved,
  // RMD
  totalRMDs, rmdTaxBite, firstRMD, effectiveRMDTaxRate,
  // SS
  includeSS, ssClaimingAge, effectiveSS, ss70Annual,
  ss70DrawReduction, ssDelayGainYrs, wr70,
  // Pension
  pensionMonthly,
  // Tax
  yr1TaxSavings,
  // Computed objects
  optimizedAllocation, optimized,
  // Flattened from flowData
  depletionAge, hasConvWindow,
  // Taxable at retirement
  retTaxable,
}) {
  // ── Phase 1 Actions ──────────────────────────────────────────────────────
  const phase1Actions = [];

  if (optimizedAllocation.totalExtra > 0) {
    const oa = optimizedAllocation;
    const breakdown = [
      oa.extraMatch > 0 && `${fmt(oa.extraMatch)} to capture match`,
      oa.extraHSA > 0 && `${fmt(oa.extraHSA)} to HSA`,
      oa.extraRoth > 0 && `${fmt(oa.extraRoth)} to Roth IRA`,
      (oa.extra401k - (oa.extraMatch || 0)) > 0 && `${fmt(oa.extra401k - (oa.extraMatch || 0))} to 401k`,
      oa.extraTaxable > 0 && `${fmt(oa.extraTaxable)} to taxable`,
    ].filter(Boolean).join(", ");
    phase1Actions.push({
      mode: "prescriptive",
      title: `Deploy Your ${fmt(oa.totalExtra)}/yr Surplus`,
      body: `You have ${fmt(availableSurplus)}/yr of savings surplus after living expenses. At ${savingsSurplusPct}% deployment, that's ${fmt(oa.totalExtra)}/yr allocated in tax-optimal priority: ${breakdown}. Adjust the surplus slider in the Budget section to see how different commitment levels affect your retirement.`,
      impact: fmt(optimized.extraPortfolio),
      impactColor: C.green,
      impactLabel: `added to portfolio by age ${safeRetAge}`,
    });
  }

  const fullMatchContrib = matchMode === "formula"
    ? Math.round(currentIncome * matchFormulaCap / 100)
    : Math.round(currentIncome * employerMatchPct / 100);
  const hasMatch = matchMode === "formula" ? matchFormulaRate > 0 : employerMatchPct > 0;
  if (matchMode === "formula" && hasMatch && contrib401k < fullMatchContrib && optimizedAllocation.extraMatch === 0) {
    const matchDesc = matchMode === "formula"
      ? `Your employer matches ${matchFormulaRate}% of the first ${matchFormulaCap}% of your salary. Contribute at least ${fmt(fullMatchContrib)}/yr to your 401k to capture the full ${fmt(employerMatchAmt)}/yr match.`
      : `Your employer matches ${employerMatchPct}% of your salary. Contribute at least ${fmt(fullMatchContrib)}/yr to your 401k to capture the full match — this is an immediate 100% return on that money before it even gets invested.`;
    phase1Actions.push({
      mode: "prescriptive",
      title: "Capture Your Full Employer Match",
      body: matchDesc,
      impact: fmt(employerMatchAmt) + "/yr",
      impactColor: C.green,
      impactLabel: "free money",
    });
  }

  if (availableSurplus <= 0) {
    phase1Actions.push({
      mode: "educational",
      title: "Your Budget Has No Surplus",
      body: `Your living expenses (${fmt(effectiveLiving)}) and current contributions (${fmt(currentContribTotal)}) consume your entire after-tax income (${fmt(grossAfterTax)}). To create room for optimized savings, consider reducing living expenses, increasing income, or reviewing whether current contribution levels are sustainable. Even a small surplus of $200–500/mo, allocated correctly, compounds significantly over ${safeRetAge - currentAge} years.`,
    });
  }

  if (rothPhaseoutWarning) {
    phase1Actions.push({
      mode: "comparative",
      title: rothFullyPhased ? "Roth IRA: Over the Limit" : "Roth IRA: Phase-Out Zone",
      body: rothFullyPhased
        ? `Your ${filingStatus === "mfj" ? "combined household " : ""}MAGI (${fmtFull(rothMAGI)}) exceeds the ${TAX_DATA_2026[filingStatus].label} Roth IRA contribution limit. Direct contributions aren't allowed, but a Backdoor Roth IRA conversion is still available — contribute to a Traditional IRA, then immediately convert to Roth.`
        : `Your ${filingStatus === "mfj" ? "combined " : ""}MAGI (${fmtFull(rothMAGI)}) is in the Roth phase-out zone. Your maximum Roth contribution is reduced. Consider a Backdoor Roth to get the full amount in.`,
      vsA: { label: "Direct Roth", value: rothFullyPhased ? "$0" : "Reduced", color: C.orange },
      vsB: { label: "Backdoor Roth", value: fmt(ROTH_IRA_LIMIT_2026), color: C.green, sub: "full amount" },
    });
  }

  const hsaRoom = Math.max(0, HSA_LIMIT_2026 - contribHSA);
  if (hsaRoom > 0 && contribHSA > 0) {
    phase1Actions.push({
      mode: "educational",
      title: "HSA: The Stealth Retirement Account",
      body: `You have ${fmt(hsaRoom)} of unused HSA space. The HSA is the only account with a triple tax advantage: tax-deductible contributions, tax-free growth, and tax-free withdrawals for medical expenses. After 65, you can withdraw for any reason (taxed like a 401k). Maxing it adds ${fmt(HSA_LIMIT_2026)}/yr of tax-sheltered growth.`,
    });
  } else if (contribHSA === 0) {
    phase1Actions.push({
      mode: "educational",
      title: "Consider an HSA",
      body: `If you have a high-deductible health plan, you can contribute up to ${fmt(HSA_LIMIT_2026)}/yr to an HSA. It's the only triple-tax-advantaged account: deductible going in, tax-free growth, tax-free out for medical expenses. After 65 it works like a traditional IRA for any withdrawal. Over ${safeRetAge - currentAge} years, even small HSA contributions compound significantly.`,
    });
  }

  if (megaCapacity > 20_000) {
    phase1Actions.push({
      mode: "educational",
      title: "Mega Backdoor Roth Opportunity",
      body: `Your 415(c) after-tax space is ${fmt(megaCapacity)}/yr. If your 401k plan allows after-tax contributions + in-plan Roth conversion, this lets you funnel significantly more into Roth than the normal ${fmt(ROTH_IRA_LIMIT_2026)} limit. Check your plan's Summary Plan Description (SPD) for eligibility.`,
      impact: fmt(megaCapacity) + "/yr",
      impactColor: C.purple,
      impactLabel: "Roth capacity",
    });
  }

  // ── Phase 2 Actions ──────────────────────────────────────────────────────
  const phase2Actions = [];

  if (hasConvWindow) {
    if (netConversionBenefit > 0) {
      phase2Actions.push({
        mode: "prescriptive",
        title: "Execute the Roth Conversion Ladder",
        body: `Convert ${convTargetVaries ? `up to ${fmt(convPeakTarget)}/yr in the earliest years (tapering to ${fmt(convSteadyTarget)}/yr once SS/pension begin)` : `${fmt(annualConversion)}/yr`} during your ${conversionWindowYrs}-year low-income window (ages ${safeRetAge + 1}–${RMD_START_AGE - 1}). You'll pay ${fmt(conversionSim.totalTax)} in conversion tax now, but save ${fmt(rmdTaxSaved)} in RMD taxes later. Every dollar converted escapes future mandatory withdrawals and grows tax-free forever.`,
        impact: netConversionBenefit,
        impactColor: C.green,
        impactLabel: "net lifetime savings",
      });
    } else if (conversionWindowYrs > 0) {
      phase2Actions.push({
        mode: "educational",
        title: "The Roth Conversion Window",
        body: `Between retirement and age ${RMD_START_AGE}, your income drops (no W-2, no RMDs yet). This is the optimal window to move money from your 401k to Roth — paying tax at a lower rate now to avoid forced withdrawals at a higher rate later. Use the Detailed Planner to set your conversion strategy.`,
      });
    }

    if (conversionSim.rothAdvantage > 0 && retTaxable > 0) {
      phase2Actions.push({
        mode: "comparative",
        title: "Pay Conversion Tax from Taxable Account",
        body: "When you convert 401k → Roth, the tax bill can come from the converted amount (shrinking what lands in Roth) or from your taxable brokerage (preserving the full conversion). Paying from taxable is more efficient.",
        vsA: {
          label: "Tax from converted",
          value: conversionSim.rothBalEnd_conv,
          color: C.muted,
          sub: "in Roth",
        },
        vsB: {
          label: "Tax from taxable",
          value: conversionSim.rothBalEnd_tax,
          color: C.green,
          sub: `+${fmt(conversionSim.rothAdvantage)} more in Roth`,
        },
      });
    }

    if (includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE && ss70DrawReduction > 0) {
      phase2Actions.push({
        mode: "comparative",
        title: `Social Security: Claim at ${ssClaimingAge} vs ${SS_MAX_CLAIM_AGE}`,
        body: ssClaimingAge < SS_FRA
          ? `Claiming early at ${ssClaimingAge} permanently reduces your benefit. Waiting to ${SS_MAX_CLAIM_AGE} earns delayed credits (+8%/yr past FRA). The tradeoff: you need to cover ${SS_MAX_CLAIM_AGE - safeRetAge} years of expenses from your portfolio before SS kicks in.`
          : `You're claiming at ${ssClaimingAge}. Waiting to ${SS_MAX_CLAIM_AGE} earns ${SS_MAX_CLAIM_AGE - ssClaimingAge} more years of delayed credits (+8%/yr). Each year of delay adds ~${fmt(Math.round(ss70DrawReduction / (SS_MAX_CLAIM_AGE - ssClaimingAge)))}/yr to your benefit permanently.`,
        vsA: {
          label: `Claim at ${ssClaimingAge}`,
          value: effectiveSS,
          color: C.muted,
          sub: `${withdrawalRate.toFixed(1)}% withdrawal`,
        },
        vsB: {
          label: `Claim at ${SS_MAX_CLAIM_AGE}`,
          value: ss70Annual,
          color: C.green,
          sub: ssDelayGainYrs ? `+${ssDelayGainYrs} yrs portfolio life` : `${wr70.toFixed(1)}% withdrawal`,
        },
      });
    }

    if (pensionMonthly === 0) {
      phase2Actions.push({
        mode: "educational",
        title: "Do You Have a Pension?",
        body: "Government, education, military, and union workers often have defined-benefit pensions. If you do, add it in the Detailed Planner — even a small pension significantly reduces how much your portfolio needs to cover, improving sustainability.",
      });
    }
  }

  // ── Phase 3 Actions ──────────────────────────────────────────────────────
  const phase3Actions = [];

  if (yr1TaxSavings > 0) {
    phase3Actions.push({
      mode: "prescriptive",
      title: "Withdraw in Tax-Optimal Order",
      body: "Draw from taxable brokerage first (LTCG rates), then traditional 401k (ordinary income), then Roth (tax-free), with HSA reserved for medical. This sequence minimizes your annual tax bill compared to drawing 401k first.",
      impact: yr1TaxSavings,
      impactColor: C.green,
      impactLabel: "saved in Year 1 tax",
    });
  }

  if (withdrawalRate > 4 && withdrawalRate <= 6) {
    phase3Actions.push({
      mode: "educational",
      title: "Moderate Withdrawal Rate",
      body: `Your ${withdrawalRate.toFixed(1)}% withdrawal rate is above the traditional 4% "safe" rate. This doesn't mean you'll run out — it depends on market returns and how long you need coverage. But it does mean sequence-of-returns risk matters more: a bad market early in retirement has an outsized impact. Consider whether you can reduce first-year expenses or delay retirement 1–2 years.`,
    });
  } else if (withdrawalRate > 6) {
    phase3Actions.push({
      mode: "prescriptive",
      title: "High Withdrawal Rate — Adjust Plan",
      body: `At ${withdrawalRate.toFixed(1)}%, you're drawing aggressively. Your portfolio depletes at age ${depletionAge ?? "?"}. The most impactful levers: reduce annual expenses, delay retirement to grow the portfolio, or increase contributions now. Even small changes compound over ${safeRetAge - currentAge} years.`,
      impact: `${withdrawalRate.toFixed(1)}%`,
      impactColor: C.orange,
      impactLabel: "needs to be ≤ 4% for safety",
    });
  }

  if (totalRMDs > 0 && rmdTaxBite > 50_000) {
    phase3Actions.push({
      mode: "educational",
      title: "RMDs Will Be a Major Tax Event",
      body: `Starting at ${RMD_START_AGE}, the IRS forces ${fmt(firstRMD?.rmd ?? 0)}/yr out of your 401k (growing each year). Over your lifetime, you'll pay an estimated ${fmt(rmdTaxBite)} in tax on these mandatory withdrawals (~${(effectiveRMDTaxRate * 100).toFixed(1)}% effective, bracket-accurate). This is exactly why Roth conversions before age ${RMD_START_AGE} are so valuable — every dollar converted is one fewer dollar the IRS can force out.`,
      impact: rmdTaxBite,
      impactColor: C.orange,
      impactLabel: "lifetime RMD tax",
    });
  }

  if (!hasConvWindow && includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE && ss70DrawReduction > 0) {
    phase3Actions.push({
      mode: "comparative",
      title: `Consider Delaying SS to ${SS_MAX_CLAIM_AGE}`,
      body: `Waiting earns +8%/yr in delayed credits. Your benefit increases from ${fmt(effectiveSS)} to ${fmt(ss70Annual)}/yr, reducing your portfolio draw from ${withdrawalRate.toFixed(1)}% to ${wr70.toFixed(1)}%.`,
      vsA: {
        label: `Claim at ${ssClaimingAge}`,
        value: effectiveSS,
        color: C.muted,
        sub: `${withdrawalRate.toFixed(1)}% withdrawal`,
      },
      vsB: {
        label: `Claim at ${SS_MAX_CLAIM_AGE}`,
        value: ss70Annual,
        color: C.green,
        sub: ssDelayGainYrs ? `+${ssDelayGainYrs} yrs portfolio life` : `${wr70.toFixed(1)}% withdrawal`,
      },
    });
  }

  if (!isSustainable && yearsSustained !== Infinity) {
    const shortfall = Math.max(0, (safeLifeExp - safeRetAge) - Math.floor(yearsSustained));
    phase3Actions.push({
      mode: "prescriptive",
      title: `Close the ${shortfall}-Year Gap`,
      body: `Your portfolio runs out ${shortfall} years before life expectancy. The highest-impact fixes: (1) reduce retirement expenses by ${fmt(Math.round(netPortfolioNeed * 0.1))}/yr (10% cut), (2) delay retirement by 2–3 years to add contributions + growth, or (3) increase current savings rate. Each year of delayed retirement improves both sides — more time to save and fewer years to fund.`,
      impact: `${shortfall} yrs`,
      impactColor: C.orange,
      impactLabel: "coverage shortfall",
    });
  }

  return { phase1Actions, phase2Actions, phase3Actions };
}

// Returns { phase1Steps, phase2Steps, phase3Steps } — WaterfallStep data arrays.
// flowData: the full flowData object from App's useMemo.
export function generatePhaseSteps(flowData, {
  returnRate, rReal, netPortfolioNeed, effectivePension,
  effectiveRMDTaxRate, safeRetAge, currentAge, safeLifeExp,
}) {
  const phase1Steps = [
    { label: "Starting Portfolio", amount: flowData.startPortfolio, type: "start" },
    { label: "Contributions",      amount: flowData.totalContrib,   type: "add",
      sub: `${safeRetAge - currentAge} yrs · all accounts` },
    { label: "Investment Growth",  amount: flowData.totalGrowth,    type: "add",
      sub: `${returnRate}% return net of tax drag` },
    { label: "At Retirement",      amount: flowData.totalAtRet,     type: "total" },
  ];

  const phase2Steps = flowData.hasConvWindow ? [
    { label: "Portfolio In", amount: flowData.totalAtRet, type: "start" },
    { label: flowData.convWindowGrowth >= 0 ? "Portfolio Growth" : "Net Investment Loss",
      amount: Math.abs(flowData.convWindowGrowth),
      type:   flowData.convWindowGrowth >= 0 ? "add" : "loss",
      sub: `${flowData.conversionWindowYrs} yrs at ${returnRate}% (real)` },
    { label: "Living Expenses", amount: flowData.convWindowDraws, type: "subtract",
      sub: `${fmt(netPortfolioNeed)}/yr net of SS${effectivePension > 0 ? " + pension" : ""}` },
    ...(flowData.convWindowTax > 0
      ? [{ label: "Roth Conversion Tax", amount: flowData.convWindowTax, type: "subtract",
           sub: `on ${fmt(flowData.totalConverted)} converted` }]
      : []),
    { label: "Portfolio entering RMDs", amount: flowData.portPreRMD, type: "total" },
  ] : [];

  const phase3Steps = [
    { label: "Portfolio In", amount: flowData.distStartVal, type: "start" },
    { label: flowData.distGrowth >= 0 ? "Portfolio Growth" : "Net Investment Loss",
      amount: Math.abs(flowData.distGrowth),
      type:   flowData.distGrowth >= 0 ? "add" : "loss",
      sub: `${returnRate}% return (real ${(rReal * 100).toFixed(1)}%)` },
    { label: "Living Expenses", amount: flowData.distDraws, type: "subtract",
      sub: `${fmt(netPortfolioNeed)}/yr × ${flowData.actualSustainedYrs} yrs` },
    ...(flowData.distRMDTax > 0
      ? [{ label: "RMD Tax Bite", amount: flowData.distRMDTax, type: "subtract",
           sub: `~${(effectiveRMDTaxRate * 100).toFixed(1)}% effective (bracket-accurate)` }]
      : []),
    { label: `Remaining at ${flowData.depletionAge ?? safeLifeExp}`, amount: flowData.distEndVal, type: "total" },
  ];

  return { phase1Steps, phase2Steps, phase3Steps };
}
