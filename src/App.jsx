import { useState, useMemo, useCallback } from "react";
import { Analytics } from "@vercel/analytics/react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { C, panel, sectionTitle, mono, selectStyle } from "./theme.js";
import { fmt, fmtPct, fmtFull } from "./formatters.js";
import { calcTaxBasis } from "./model/tax-basis.js";
import { runSimulation, buildProjectedIncomeByAge, projectedIncomeAtAge } from "./model/simulation.js";
import { calcEmployerMatch } from "./model/employer-match.js";
import { calcSavingsCapacity, calcOptimizedAllocation, calcMegaBackdoorGrowth, calcStatementView } from "./model/budget.js";
import { projectRetirementBracket } from "./model/taxes.js";
import { calcNetPortfolioNeed, calcWithdrawalRate, calcSSDelayGain, calcRetIncomeFlow } from "./model/drawdown.js";
import { calcPlanProgress, calcPlanDrivers, buildYearlyRows } from "./model/retirement-drawdown.js";
import { buildRetirementPhase, buildConversionByAge, walkBalanceAt, buildRmdComparison } from "./model/retirement-phase.js";
import { calcSignals } from "./model/signals.js";
import { calcFlowDown } from "./model/flow-down.js";
import { calcRetirementIncome, calcSSBreakEven } from "./model/retirement-income.js";
import { calcRMDIncomeFloor, calcWithdrawalOrderTax } from "./model/retirement-tax.js";
import { buildIncomeFloors, calcBracketFillTargets } from "./model/conversion-planning.js";
import { findOptimalConversionPlan } from "./model/roth-conversion.js";
import { acaCliffThreshold } from "./model/healthcare.js";
import { calcOptimizedScenario } from "./model/optimization.js";
import { generatePhaseActions, generatePhaseSteps } from "./model/action-cards.js";
import { calcMilestones, buildAccumChart, calcChartMilestones, buildAccumulationRows } from "./model/accumulation.js";
import { fvAnnuity } from "./model/finance-math.js";
import { evaluateConversionPlan } from "./model/conversion-evaluation.js";
import { buildConversionPreview, isSuggestionApplicable, buildSurplusPreview } from "./model/apply-preview.js";
import { MAX_CONVERSION_EVENTS } from "./model/conversion-events.js";
import { eventLastAge } from "./model/money-events.js";
import {
  TAX_DATA_2026,
  TRAD_401K_LIMIT_2026, ROTH_IRA_LIMIT_2026, HSA_LIMIT_2026,
  LIMIT_415C_2026, LIMIT_415C_CATCHUP_2026, CATCHUP_AGE, CATCHUP_401K_2026,
  RMD_START_AGE,
  SS_FRA, SS_MIN_CLAIM_AGE, SS_MAX_CLAIM_AGE,
  STATE_TAX, RETIREMENT_STATE_TAX,
  ASSUMPTIONS,
  MEDICARE_AGE,
} from "./config/irs-2026.js";
import { Slider }            from "./components/Slider.jsx";
import { DeferredInput }     from "./components/DeferredInput.jsx";
import { TaxTimeline }       from "./components/TaxTimeline.jsx";
import { ChartTooltip }      from "./components/ChartTooltip.jsx";
import { FlowConn }          from "./components/FlowConn.jsx";
import { WhatIfPanel }       from "./components/WhatIfPanel.jsx";
import { MoneyEventsPanel }  from "./components/MoneyEventsPanel.jsx";
import { ConversionEventsPanel } from "./components/ConversionEventsPanel.jsx";
import { calcWhatIfDelta, buildVerdictLegend }   from "./model/what-if.js";
import { PhaseCard }       from "./components/PhaseCard.jsx";
import { HorizonThemeProvider, safeGet } from "./horizon/ThemeContext.jsx";
import HorizonShell       from "./components/HorizonShell.jsx";

// The four account display keys (static — module level so memos that map over
// them can keep honest, complete dependency arrays).
const ACCOUNT_DATA_KEYS = ["Trad 401k", "Roth IRA", "Taxable", "HSA"];

// WI-5.2 (#113): entitlements read at init. Default renders byte-identical to today —
// isPremium true (nothing premium-gated yet → no surface locks) and readOnly false
// (every setter live). Dev/QA/test flip path: browser via localStorage (safeGet), node
// tests via a globalThis override. No user-facing toggle ships this batch.
function readEntitlements() {
  const g = (typeof globalThis !== "undefined" && globalThis.__HZ_ENTITLEMENTS__) || null;
  if (g) return { isPremium: g.isPremium !== false, readOnly: g.readOnly === true };
  return {
    isPremium: safeGet("hz-premium") !== "0",
    readOnly: safeGet("hz-readonly") === "1",
  };
}

// WI-5.2: neuter a write callback when readOnly (advisor read-only share / future
// locked states). Applied at every write-surface construction site so "all setters
// inert" is mechanical, not a per-surface hunt. Returns the original fn unchanged when
// !readOnly (identity-stable default path → V9 unaffected); a shared noop when readOnly.
const RO_NOOP = () => {};
function guardWrite(fn, readOnly) {
  return readOnly ? RO_NOOP : fn;
}

// WI-3.1 (#98) setter-bundle options. Built once at module load from the static
// config maps — referentially stable, so the bundle memos that spread them stay
// stable and never re-derive labels in a screen (rule 1 / rule 10 / principle 9).
// Labels mirror the Classic <select> rendering verbatim.
const FILING_STATUS_OPTIONS = Object.entries(TAX_DATA_2026)
  .map(([value, { label }]) => ({ value, label }));
const STATE_OPTIONS = Object.entries(STATE_TAX)
  .sort((a, b) => a[1].name.localeCompare(b[1].name))
  .map(([value, { name }]) => ({ value, label: `${name} (${value})` }));
const RETIREMENT_STATE_OPTIONS = Object.entries(RETIREMENT_STATE_TAX)
  .sort((a, b) => a[1].name.localeCompare(b[1].name))
  .map(([value, { name, rate }]) => ({
    value,
    label: `${name} (${value}) — ${rate === 0 ? "0%" : `${(rate * 100).toFixed(1)}%`}`,
  }));
const CONVERSION_BRACKET_OPTIONS = [
  { value: 12, label: "12%" }, { value: 22, label: "22%" }, { value: 24, label: "24%" },
];
// Per-account contribution-slider step, copied verbatim from the Classic accounts JSX.
const contribStep = max => (max <= 10_000 ? 100 : max <= 30_000 ? 500 : 1_000);

export default function App() {

  const [currentAge,    setCurrentAge]    = useState(30);
  const [retirementAge, setRetirementAge] = useState(65);
  const [lifeExpect,    setLifeExpect]    = useState(90);
  const [returnRate,    setReturnRate]    = useState(5);
  const [inflationRate, setInflationRate] = useState(4);

  const [currentIncome,      setCurrentIncome]      = useState(100_000);
  const [incomeGrowth,       setIncomeGrowth]       = useState(3);
  const [incomeGrowthEndAge, setIncomeGrowthEndAge] = useState(null); // null = grows until retirement
  const [selectedState, setSelectedState] = useState("TX");
  const [stateRateOverride, setStateRateOverride] = useState(null);
  const [filingStatus,  setFilingStatus]  = useState("single");
  const [otherPreTaxDeduc, setOtherPreTaxDeduc] = useState(0);

  const [retirementState, setRetirementState] = useState(selectedState);

  const [bal401k,    setBal401k]    = useState(50_000);
  const [balRoth,    setBalRoth]    = useState(25_000);
  const [balTaxable, setBalTaxable] = useState(80_000);
  const [balHSA,     setBalHSA]     = useState(10_000);

  const [contrib401k,    setContrib401k]    = useState(10_000);
  const [contribRoth,    setContribRoth]    = useState(7_000);
  const [contribTaxable, setContribTaxable] = useState(4_000);
  const [contribHSA,     setContribHSA]     = useState(3_850);

  const [contribEnd401k,    setContribEnd401k]    = useState(65);
  const [contribEndRoth,    setContribEndRoth]    = useState(65);
  const [contribEndTaxable, setContribEndTaxable] = useState(65);
  const [contribEndHSA,     setContribEndHSA]     = useState(65);

  const [retirementTarget, setRetirementTarget] = useState(3_000_000);
  const [annualExpenses,   setAnnualExpenses]   = useState(null);

  const [livingExpenses,       setLivingExpenses]       = useState(null);
  const [livingExpenseGrowth,  setLivingExpenseGrowth]  = useState(3);
  const [savingsSurplusPct,    setSavingsSurplusPct]    = useState(50);
  const [preApplySnapshot,     setPreApplySnapshot]     = useState(null);

  const [activeTab, setActiveTab] = useState("planner");

  // Horizon shell state
  const [showHorizon, setShowHorizon] = useState(true);
  const [activity,    setActivity]    = useState("golf course");

  // WI-5.2 (#113) entitlements. See readEntitlements/guardWrite above.
  const [entitlements] = useState(readEntitlements);
  const readOnly = entitlements.readOnly;

  const [ssClaimingAge,     setSsClaimingAge]     = useState(SS_FRA);
  const [isMarried,         setIsMarried]         = useState(false);
  const [spouseIsSoleBenef, setSpouseIsSoleBenef] = useState(false);
  const [spouseCurrentAge,  setSpouseCurrentAge]  = useState(18);
  const [ssOverride,        setSsOverride]        = useState(null);
  const [includeSS,         setIncludeSS]         = useState(true);

  const [pensionMonthly,   setPensionMonthly]   = useState(0);
  const [pensionStartAge,  setPensionStartAge]  = useState(65);

  const [spouseIncome,       setSpouseIncome]       = useState(0);
  const [spouseIncomeGrowth, setSpouseIncomeGrowth] = useState(3);

  const [spouseSsEstimate,    setSpouseSsEstimate]    = useState(0);
  const [spouseClaimingAge,   setSpouseClaimingAge]   = useState(SS_FRA);
  const [spouseBenefitBasis,  setSpouseBenefitBasis]  = useState("own");

  const [conversionMode,          setConversionMode]          = useState("bracket");
  const [conversionBracketTarget, setConversionBracketTarget] = useState(22);
  const [annualConversionAmt,     setAnnualConversionAmt]     = useState(20_000);
  const [conversionTaxSource,     setConversionTaxSource]     = useState("converted");
  // Conversion-window timing. null = use the default window (retirement+1 → RMD_START_AGE-1),
  // which reproduces the prior hardcoded behavior exactly (golden-master pin).
  const [conversionStartAge,      setConversionStartAge]      = useState(null);
  const [conversionEndAge,        setConversionEndAge]        = useState(null);
  // Pre-retirement one-time 401k→Roth conversions in low-income working years.
  // { id, age, amount }. Empty default → zero golden master impact.
  const [conversionEvents,        setConversionEvents]        = useState([]);
  // The user's plan must allow in-service distributions for working-year conversions
  // — gates the events panel so we don't imply it's always possible.
  const [conversionInService,     setConversionInService]     = useState(false);
  const [employerMatchPct,        setEmployerMatchPct]        = useState(3);
  const [matchMode,               setMatchMode]               = useState("flat");
  const [matchFormulaRate,        setMatchFormulaRate]        = useState(50);
  const [matchFormulaCap,         setMatchFormulaCap]         = useState(6);

  const [addlPreTaxBal, setAddlPreTaxBal] = useState(0);

  const [hasMarketplaceInsurance, setHasMarketplaceInsurance] = useState(false);
  const [householdSize, setHouseholdSize] = useState(1);
  const [marketplaceMonthlyPremium, setMarketplaceMonthlyPremium] = useState(null);
  const [hasMedicare, setHasMedicare] = useState(false);
  const [personOnMedicare, setPersonOnMedicare] = useState(1); // 1 or 2 (persons)

  // Money events: windfalls, large purchases, inheritances, travel years,
  // sabbaticals. Two shapes share this array — see src/model/money-events.js
  // for the full contract:
  //   One-time  { id, label, amount, age, isInflow, isTaxable }
  //   Duration  { id, label, monthlyAmount, durationMonths, age, isInflow, incomeAnnual }
  // Empty default → zero golden master impact.
  const [moneyEvents, setMoneyEvents] = useState([]);

  // Committed plan snapshot — null until the user explicitly clicks "Save as my plan"
  // (via commitPlan, e.g. onboarding's done screen or the Plan/Ideas "Save as my
  // plan" flows). Read by MyDetailsScreen-adjacent flows; the old QuickTunePanel
  // Reset button that also consumed this was removed with the Plan "Try a change"
  // redesign (2026-07-11).
  const [committedPlan, setCommittedPlan] = useState(null);

  const retStateRate = RETIREMENT_STATE_TAX[retirementState]?.rate ?? 0;

  const safeRetAge = retirementAge;
  const phase2End  = safeRetAge - currentAge;
  const safeLifeExp = Math.max(lifeExpect, safeRetAge + 1);
  const totalYears  = safeLifeExp - currentAge;

  // useCallback so memos that depend on it (simData, whatIfSimInputs) can list it
  // honestly in their deps without re-running every render (V9 / principle 13).
  const employerMatch = useCallback((salary, employeeContrib) =>
    calcEmployerMatch(salary, employeeContrib, {
      matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct,
    }), [matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct]);

  // Working-year tax basis (agi, fed/state/FICA, Roth phase-out, grossAfterTax),
  // extracted to src/model/tax-basis.js. Computed here as ONE call — before
  // simData / currentSnapshot, which read fedMarginal — so there is no
  // temporal-dead-zone split for a consumer to fall into (that split was the
  // BUG-20 blank-page crash). MFJ income handling lives in the model (rules 3 & 9).
  const {
    combinedIncome, totalPreTaxDeduc, safeDeduc, agi, fedTax, fedEffRate, fedMarginal,
    stateRateDefault, stateRate, stateTax, noStateTax, fica,
    householdIncome, takeHome, combinedEffRate,
    rothMAGI, rothPhaseout, rothPhaseoutWarning, rothFullyPhased, grossAfterTax,
  } = calcTaxBasis({
    currentIncome, spouseIncome, filingStatus,
    contrib401k, contribHSA, otherPreTaxDeduc,
    selectedState, stateRateOverride,
  });

  // The conversion events the MODEL actually sees: only when the in-service toggle is
  // on, and only valid working-year events (amount > 0, strictly before retirement).
  // Clamping here means lowering the retirement age can't strand an event inside the
  // retirement window where it would double-convert (review #11) — no effect/loop.
  const activeConversionEvents = useMemo(() => {
    if (!conversionInService) return [];
    const minAge = currentAge + 1, maxAge = safeRetAge - 1;
    return conversionEvents.filter(e => e.amount > 0 && e.age >= minAge && e.age <= maxAge);
  }, [conversionInService, conversionEvents, currentAge, safeRetAge]);

  const simData = useMemo(() => {
    const raw = runSimulation({
      totalYears, currentAge, currentIncome, incomeGrowth, incomeGrowthEndAge, filingStatus,
      spouseIncome, spouseIncomeGrowth, returnRate,
      bal401k, balRoth, balTaxable, balHSA,
      contrib401k, contribRoth, contribTaxable, contribHSA,
      contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
      calcEmployerMatchFn: employerMatch,
      moneyEvents,
      conversionEvents: activeConversionEvents, stateRate,
    });
    // BUG-35: "Trad 401k" is now displayed GROSS (the real pre-tax balance). The
    // engine taxes withdrawals year-by-year, so the headline + chart + account cards
    // all show what's actually in the account; the after-tax "spendable" value is a
    // single derived reference chip (spendableAtRet), not the per-account display.
    return raw.map(d => ({
      ...d,
      "Trad 401k": Math.round(d.tradGross ?? 0),
    }));
  }, [
    returnRate, totalYears, currentAge, currentIncome, incomeGrowth, incomeGrowthEndAge, filingStatus,
    spouseIncome, spouseIncomeGrowth,
    bal401k, balRoth, balTaxable, balHSA,
    contrib401k, contribRoth, contribTaxable, contribHSA,
    contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
    employerMatch,
    moneyEvents,
    activeConversionEvents, stateRate,
  ]);

  // Per-age estimated tax (incl. any early-withdrawal penalty) for the working-year
  // conversions actually set — read straight off the engine-computed simData rows so
  // the panel shows the real charged figure, not a re-derived estimate (rule 10 spirit).
  const convEventTaxByAge = useMemo(() => {
    const out = {};
    for (const d of simData) if (d.convEvent > 0) out[d.age] = d.convEventTax;
    return out;
  }, [simData]);

  // Year-0 fallback: when retirementAge === currentAge the user is already retired
  // and simData has no rows at or before safeRetAge. Use current input balances directly.
  // Memoized so downstream memos (conversionSim, optimizer) that take it as a dep get a
  // stable reference and only re-run when an actual balance / rate input changes.
  const currentSnapshot = useMemo(() => ({
    age: currentAge,
    "Trad 401k": Math.round(bal401k),   // gross (BUG-35)
    tradGross: bal401k,
    "Roth IRA": balRoth,
    "Taxable": balTaxable,
    "HSA": balHSA,
  }), [currentAge, bal401k, balRoth, balTaxable, balHSA]);
  const atRetirement = phase2End > 0
    ? (simData[phase2End - 1] ?? currentSnapshot)
    : currentSnapshot;

  const { currentContribTotal, effectiveLiving, savingsCapacity, availableSurplus, budgetDeficit } =
    calcSavingsCapacity({
      grossAfterTax, contrib401k, contribRoth, contribTaxable, contribHSA, livingExpenses,
    });

  // Memoized so budgetView (→ horizonProps.budget) stays identity-stable (V9):
  // optimizedAllocation is a fresh object from calcOptimizedAllocation, so without
  // this memo every re-render would produce a new budgetView even when inputs haven't
  // changed. Deps mirror the calcOptimizedAllocation call exactly.
  const optimizedAllocation = useMemo(() => calcOptimizedAllocation({
    availableSurplus, savingsSurplusPct,
    contrib401k, contribRoth, contribHSA, contribTaxable,
    rothFullyPhased, matchMode, matchFormulaCap, matchFormulaRate,
    employerMatchPct, currentIncome,
  }), [availableSurplus, savingsSurplusPct, contrib401k, contribRoth, contribHSA, contribTaxable,
       rothFullyPhased, matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct, currentIncome]);

  // ── Optimized-allocation Apply/Revert — ONE implementation shared by Classic's ──
  // inline buttons and Horizon's surplusApplySite (WI-3.7). Snapshots the 4 current
  // contribution values into preApplySnapshot, then writes the 4 opt* values.
  // revertAllocation is internally guarded (no-op with no snapshot) so it's safe to
  // wire directly into any Apply-site's `revert` slot without an extra caller-side check.
  const applyAllocation = useCallback(() => {
    setPreApplySnapshot({ c401k: contrib401k, cRoth: contribRoth, cTaxable: contribTaxable, cHSA: contribHSA });
    setContrib401k(optimizedAllocation.opt401k);
    setContribRoth(optimizedAllocation.optRoth);
    setContribHSA(optimizedAllocation.optHSA);
    setContribTaxable(optimizedAllocation.optTaxable);
  }, [contrib401k, contribRoth, contribTaxable, contribHSA, optimizedAllocation,
      setPreApplySnapshot, setContrib401k, setContribRoth, setContribHSA, setContribTaxable]);

  const revertAllocation = useCallback(() => {
    if (!preApplySnapshot) return;
    setContrib401k(preApplySnapshot.c401k);
    setContribRoth(preApplySnapshot.cRoth);
    setContribTaxable(preApplySnapshot.cTaxable);
    setContribHSA(preApplySnapshot.cHSA);
    setPreApplySnapshot(null);
  }, [preApplySnapshot, setContrib401k, setContribRoth, setContribTaxable, setContribHSA, setPreApplySnapshot]);

  const ACCOUNTS = [
    { key: "Traditional 401k", dataKey: "Trad 401k", color: C.gold,   note: "Pre-tax",
      growsWithIncome: true,
      val: bal401k,    setVal: setBal401k,    contribMax: TRAD_401K_LIMIT_2026,
      contrib: contrib401k,    setContrib: setContrib401k,
      endAge: contribEnd401k,  setEndAge: setContribEnd401k },
    { key: "Roth IRA",         dataKey: "Roth IRA",  color: C.blue,   note: "After-tax",
      growsWithIncome: false,
      val: balRoth,    setVal: setBalRoth,    contribMax: ROTH_IRA_LIMIT_2026,
      contrib: contribRoth,    setContrib: setContribRoth,
      endAge: contribEndRoth,  setEndAge: setContribEndRoth },
    { key: "Taxable Brokerage",dataKey: "Taxable",   color: C.green,  note: "After-tax",
      growsWithIncome: true,
      val: balTaxable, setVal: setBalTaxable, contribMax: 100_000,
      contrib: contribTaxable, setContrib: setContribTaxable,
      endAge: contribEndTaxable, setEndAge: setContribEndTaxable },
    { key: "HSA",              dataKey: "HSA",       color: C.purple, note: "Triple tax-free",
      growsWithIncome: false,
      val: balHSA,     setVal: setBalHSA,     contribMax: HSA_LIMIT_2026,
      contrib: contribHSA,     setContrib: setContribHSA,
      endAge: contribEndHSA,   setEndAge: setContribEndHSA },
  ];

  // Memoized on atRetirement (a stable reference: either a memoized simData row or
  // the memoized currentSnapshot). Built over the static ACCOUNT_DATA_KEYS (not the
  // per-render ACCOUNTS array, which carries setters) so the deps array is honest
  // and complete — keeping retVals stable lets conversionSim/optimizer skip
  // re-running unless the retirement balances actually change.
  // Display values for the per-account cards/chart. The "Trad 401k" card shows the
  // FULL pre-tax 401k INCLUDING additional pre-tax balances, so the cards reconcile to
  // the gross `totalAtRet` (which also includes addlPreTaxBal) and the card's %-width is
  // correct. [review fix] addlPreTaxBal is 0 by default → inert at the golden master.
  const retVals = useMemo(() => Object.fromEntries(
    ACCOUNT_DATA_KEYS.map(k =>
      [k, (atRetirement[k] ?? 0) + (k === "Trad 401k" ? addlPreTaxBal : 0)])
  ), [atRetirement, addlPreTaxBal]);
  const ranked = Object.entries(retVals).sort((a, b) => b[1] - a[1]);

  // Per-account retirement balances as plain scalars, extracted once so the
  // conversion-plan and optimizer memos can list them in their deps arrays
  // (exhaustive-deps forbids `retVals["…"]` expressions in deps).
  const retTaxable     = retVals["Taxable"]   ?? 0;
  const retRoth        = retVals["Roth IRA"]  ?? 0;
  const retHsa         = retVals["HSA"]        ?? 0;
  // Pre-tax GROSS 401k at retirement, INCLUDING additional pre-tax balances.
  const tradGrossAtRet = (atRetirement.tradGross ?? 0) + addlPreTaxBal;
  // retTrad is the tax-calc scalar — the GROSS 401k INCLUDING addlPreTaxBal, so the
  // optimal withdrawal strategy (calcWithdrawalOrderTax) draws from the SAME full
  // pre-tax pool the worst-case path caps at (tradGrossAtRet). [review fix — Gemini]
  const retTrad        = tradGrossAtRet;

  // BUG-35: the model now tracks GROSS balances and the engine taxes withdrawals
  // per-year, so every FORMULA (and the headline) uses the gross portfolio.
  // `totalAtRet` is gross. The after-tax "spendable" reference chip (spendableAtRet)
  // is defined further below — once the RETIREMENT effective tax rate is known, so it
  // haircuts the 401k at the retirement rate (not the working rate, the Point-2 fix).
  const totalAtRet     = tradGrossAtRet + retRoth + retTaxable + retHsa;

  // Default retirement spend = the user's CURRENT living expenses (take-home − what
  // they save now), in today's dollars — portfolio-INDEPENDENT, so it can't balloon
  // when the headline switches to gross (the old 3%-of-portfolio default was
  // self-referential). effectiveLiving comes from calcSavingsCapacity above.
  const effectiveExpenses = annualExpenses ?? effectiveLiving;
  const rReal             = (1 + returnRate / 100) / (1 + inflationRate / 100) - 1;

  // Household retirement income (SS + pension), extracted to
  // src/model/retirement-income.js. ssAtRet / effectivePension carry the
  // "active at retirement" gate (BUG-10 / rule 5b); householdSS / ssTaxableRet
  // are the full amounts that the per-year drawdown loops gate themselves.
  const {
    ssWorkYears, ssAIME, ssPIA, ssMonthlyBenefit, ssAnnualBenefit, ss67Monthly,
    effectiveSS, spouseSsBenefit, householdSS, ssAtRet, ssTaxableRet,
    ss70Annual, household70SS, ss70DrawReduction, effectivePension,
    spouseAlt, spouseAltHigher,
  } = calcRetirementIncome({
    currentIncome, incomeGrowth, incomeGrowthEndAge, safeRetAge, currentAge,
    ssClaimingAge, includeSS, ssOverride, spouseSsEstimate,
    pensionMonthly, pensionStartAge,
    isMarried, spouseClaimingAge, spouseBenefitBasis,
  });

  const netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, ssAtRet, effectivePension);
  const withdrawalRate   = calcWithdrawalRate(netPortfolioNeed, totalAtRet);
  // yearsSustained / isSustainable are defined below (after the per-year RMD &
  // conversion tax schedules), because the longevity walk now charges those
  // taxes to the portfolio (BUG-31 Path A). They run through the SAME shared
  // walk (buildRetirementDrawdown) as the chart and waterfall.

  const milestones = useMemo(
    () => calcMilestones({ simData, currentAge, safeRetAge, retirementTarget }),
    [simData, currentAge, safeRetAge, retirementTarget]);

  const ssBreakEven = calcSSBreakEven({ ssClaimingAge, ssMonthlyBenefit, ss67Monthly });

  const useTable2 = isMarried && spouseIsSoleBenef && (currentAge - spouseCurrentAge > 10);
  const activeTableLabel = useTable2 ? "Table II (Joint Life)" : "Table III (Uniform Lifetime)";

  // ── Roth-conversion plan inputs (amounts only) ────────────────────────────
  // These feed the engine's conversion schedule and the IRMAA/ACA exposure. They do
  // NOT depend on the RMD schedule — that now comes OUT of the engine — which is what
  // lets the engine be the single source (no rmdData → conversion → rmdData cycle).
  // Resolve the conversion window. null inputs fall back to the default window
  // (retirement+1 → RMD_START_AGE-1), clamped so conversions stay between the year
  // after retirement and the year before RMDs force the issue. At the default this
  // reproduces the old `RMD_START_AGE - 1 - safeRetAge` window exactly.
  const convWindowFloor = safeRetAge + 1;
  const convWindowCeil  = RMD_START_AGE - 1;
  // No window at all when retiring at/after RMD_START_AGE-1 (floor > ceil) — RMDs begin
  // immediately, leaving no gap years. Force an empty range so conversionWindowYrs === 0,
  // matching the old `max(0, RMD_START_AGE-1-safeRetAge)` (which was 0 here). Without this
  // the clamp would collapse to a phantom 1-year window at age 72.
  const hasConvWindow = convWindowFloor <= convWindowCeil;
  const resolvedStartAge = hasConvWindow
    ? Math.min(convWindowCeil, Math.max(convWindowFloor, conversionStartAge ?? convWindowFloor))
    : convWindowFloor;
  const resolvedEndAge = hasConvWindow
    ? Math.max(resolvedStartAge, Math.min(convWindowCeil, conversionEndAge ?? convWindowCeil))
    : convWindowFloor - 1; // empty: endAge < startAge → buildConversionByAge yields {}
  const conversionWindowYrs = Math.max(0, resolvedEndAge - resolvedStartAge + 1);
  const retTaxData = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  // Per-year conversion-window income floors (BUG-25 #3 per-year SS/pension gate):
  //   convFloors     → ssTaxableRet (85% taxable, marginal-rate math)
  //   convMAGIFloors → householdSS  (100% gross SS, ACA/IRMAA MAGI)
  const convFloors = useMemo(() => buildIncomeFloors({
    conversionWindowYrs, startAge: resolvedStartAge, includeSS, ssClaimingAge, ssAmount: ssTaxableRet,
    pensionMonthly, pensionStartAge, monthsPerYear: ASSUMPTIONS.MONTHS_PER_YEAR,
  }), [conversionWindowYrs, resolvedStartAge, includeSS, ssClaimingAge, ssTaxableRet, pensionMonthly, pensionStartAge]);
  const convMAGIFloors = useMemo(() => buildIncomeFloors({
    conversionWindowYrs, startAge: resolvedStartAge, includeSS, ssClaimingAge, ssAmount: householdSS,
    pensionMonthly, pensionStartAge, monthsPerYear: ASSUMPTIONS.MONTHS_PER_YEAR,
  }), [conversionWindowYrs, resolvedStartAge, includeSS, ssClaimingAge, householdSS, pensionMonthly, pensionStartAge]);
  // Steady-state floor (all sources active) — used for display and bracket fill.
  const retIncomeFloor = ssTaxableRet + (pensionMonthly > 0 ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0);

  // Bracket-fill targets. Memoized for the stable bracketFillConversions array.
  const { bracketFillConversions, bracketFillConversion, convPeakTarget, convSteadyTarget, targetsVary } =
    useMemo(() => calcBracketFillTargets({ retTaxData, conversionBracketTarget, convFloors, retIncomeFloor }),
      [retTaxData, conversionBracketTarget, convFloors, retIncomeFloor]);
  const annualConversion = conversionMode === "bracket" ? bracketFillConversion : annualConversionAmt;
  const convTargetVaries = conversionMode === "bracket" && targetsVary;

  // The income floor RMDs/withdrawals stack on (SS taxable + pension, gated to RMD
  // start). Still used by the withdrawal-order strategy card (calcWithdrawalOrderTax).
  const rmdIncomeFloor = calcRMDIncomeFloor({
    includeSS, ssClaimingAge, ssTaxableRet,
    pensionMonthly, pensionStartAge, effectivePension, rmdStartAge: RMD_START_AGE,
  });

  // The engine's conversion schedule ({ [age]: amount }). Empty when there's no
  // retirement row to convert from (mirrors the old conversionWindowYrs:0 fallback).
  const hasRetRow = !!(simData.find(d => d.age === safeRetAge)
    ?? (safeRetAge === currentAge ? currentSnapshot : null));
  const conversionByAge = useMemo(() => buildConversionByAge({
    startAge: resolvedStartAge, endAge: hasRetRow ? resolvedEndAge : resolvedStartAge - 1,
    annualConversions: conversionMode === "bracket" ? bracketFillConversions : null,
    annualConversion,
  }), [hasRetRow, resolvedStartAge, resolvedEndAge, conversionMode, bracketFillConversions, annualConversion]);

  // ── THE single retirement-phase walk (BUG-35 / BUG-31) ────────────────────
  // One per-account, GROSS-seeded, taxed-once engine run drives longevity AND the
  // displayed RMD schedule + conversion benefit, so they can never diverge. The
  // RMD/conversion taxes come from the walk's own per-row breakdown — there is no
  // second (nominal-growth, withdrawal-ignoring) projection. Memoized (V9):
  // chart, Flow-Down, optimizer, and horizonProps all read it.
  // Common engine inputs (everything EXCEPT the conversion schedule), memoized so
  // the main run AND the optimizer's per-candidate search feed the engine the same
  // model — the optimizer can never search a different plan than the screen shows.
  // Kind-aware filter (money-events.js): a duration event spanning the
  // retirement boundary reaches both the accumulation sim and the retirement
  // walk — each applies only its own years. Shared by retPhaseBase and
  // retDrawShared below so the boundary rule can't drift between the two
  // (CodeRabbit dedup finding).
  const retirementMoneyEvents = useMemo(
    () => moneyEvents.filter(ev => eventLastAge(ev) >= safeRetAge),
    [moneyEvents, safeRetAge]);

  const retPhaseBase = useMemo(() => ({
    tradGross: tradGrossAtRet, roth: retRoth, taxable: retTaxable, hsa: retHsa,
    startAge: safeRetAge, lifeExp: safeLifeExp, longevityHorizon: safeRetAge + 130,
    rReal, effectiveExpenses,
    ssGross: householdSS, ssTaxable: ssTaxableRet,
    ssClaimAge: includeSS ? ssClaimingAge : Infinity,
    pension: pensionMonthly > 0 ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0,
    pensionStartAge: pensionMonthly > 0 ? pensionStartAge : Infinity,
    filingStatus, retStateRate, rmdStartAge: RMD_START_AGE,
    useTable2, spouseCurrentAge, currentAge,
    moneyEvents: retirementMoneyEvents,
  }), [tradGrossAtRet, retRoth, retTaxable, retHsa, safeRetAge, safeLifeExp, rReal,
       effectiveExpenses, householdSS, ssTaxableRet, includeSS, ssClaimingAge,
       pensionMonthly, pensionStartAge, filingStatus, retStateRate,
       useTable2, spouseCurrentAge, currentAge, retirementMoneyEvents]);

  const retPhase = useMemo(
    () => buildRetirementPhase({ ...retPhaseBase, conversionByAge }),
    [retPhaseBase, conversionByAge]);

  // RMD display + lifetime tax, all derived from the ONE walk (no second projection).
  // rmdData rows already carry { age, rmd, bal, divisor, tax } — they ARE rmdDataWithTax.
  const rmdData         = retPhase.rmdSchedule;
  const rmdDataWithTax  = retPhase.rmdSchedule;
  const firstRMD        = rmdData[0];
  const totalRMDs       = retPhase.totalRMDs;
  const rmdTaxBite      = retPhase.rmdTaxBite;
  const effectiveRMDTaxRate = totalRMDs > 0
    ? rmdTaxBite / totalRMDs
    : Math.min(ASSUMPTIONS.MAX_COMBINED_MARGINAL_RATE, fedMarginal + retStateRate);

  // After-tax "spendable" reference (DISPLAY ONLY — never a formula input). Haircuts
  // the gross 401k at the RETIREMENT effective rate (fixes the old working-rate
  // haircut); Roth/HSA are tax-free and Taxable is already net of LTCG drag. This is
  // the "worth ~X to you / ≈ $Y/mo" anchor beside the gross headline.
  const spendableAtRet = Math.round(
    tradGrossAtRet * (1 - effectiveRMDTaxRate) + retRoth + retTaxable + retHsa);

  // Amount maps for the Year-by-year RMD / Conversion columns (WI-2.5) — the ACTUAL
  // amounts the walk applied (conversions capped at the live balance), one source.
  const rmdAmountByAge = useMemo(
    () => Object.fromEntries(retPhase.rmdSchedule.map(d => [d.age, d.rmd])),
    [retPhase]);
  const conversionAmountByAge = useMemo(
    () => Object.fromEntries(retPhase.rows.filter(r => r.conversion > 0).map(r => [r.age, Math.round(r.conversion)])),
    [retPhase]);

  // The conversion-evaluation pipeline is ONE model function, evaluateConversionPlan,
  // shared with the optimizer so the two can never diverge (BUG-31). BUG-35: the
  // RMD-tax savings + conversion cost now come from the SINGLE retirement engine
  // (retPhase) — passed in — not a separate RMD projection; this function only adds
  // the conversion-window display sim + the ACA/IRMAA costs.
  const conversionPlan = useMemo(() => evaluateConversionPlan({
    conversionWindowYrs: hasRetRow ? conversionWindowYrs : 0,
    annualConversion,
    annualConversions: conversionMode === "bracket" ? bracketFillConversions : null,
    returnRate, retIncomeFloor, retIncomeFloors: convFloors,
    filingStatus, conversionTaxSource, retStateRate,
    tradGrossAtRetirement: tradGrossAtRet,
    rothBalAtRet: retRoth,
    taxableBalAtRet: retTaxable,
    windowStartAge: resolvedStartAge,
    rmdTaxSaved: retPhase.rmdTaxSaved, conversionCost: retPhase.conversionCost,
    convMAGIFloors, hasMarketplaceInsurance, householdSize, hasMedicare,
    personOnMedicare, marketplaceMonthlyPremium, monthsPerYear: ASSUMPTIONS.MONTHS_PER_YEAR,
  }), [hasRetRow, conversionWindowYrs, annualConversion, conversionMode, bracketFillConversions,
      returnRate, retIncomeFloor, convFloors, filingStatus, conversionTaxSource, retStateRate,
      tradGrossAtRet, retRoth, retTaxable, resolvedStartAge, retPhase,
      convMAGIFloors, hasMarketplaceInsurance, householdSize, hasMedicare, personOnMedicare,
      marketplaceMonthlyPremium]);
  const {
    conversionSim, rmdTaxSaved, netConversionBenefit,
    healthcareExposure, cliffYears: acaCliffYears, irmaaCost: totalIRMAACost,
    acaLoss: acaAnnualLoss, adjustedNetConversionBenefit,
  } = conversionPlan;

  // ── Per-year tax maps for the SECONDARY blended walks (what-if delta, optimized
  // scenario) which still use buildRetirementDrawdown. Derived from the engine
  // (retPhase) so their RMD/conversion tax matches the main plan. NOTE: the blended
  // walk doesn't charge the spending-draw tax the engine does, so those deltas are
  // slightly less tax-honest than the headline — acceptable for relative comparisons;
  // full migration of what-if/optimized to the engine is a documented follow-up.
  const rmdTaxByAge = useMemo(
    () => Object.fromEntries(retPhase.rmdSchedule.map(d => [d.age, d.tax])),
    [retPhase]);
  const conversionTaxByAge = useMemo(
    () => Object.fromEntries(retPhase.rows.filter(r => r.conversion > 0).map(r => [r.age, Math.round(r.convTax)])),
    [retPhase]);

  // Shared inputs for the secondary blended walks (what-if + optimized scenario).
  // Memoized (V9): whatIfBundle + the optimized scenario read this.
  const retDrawShared = useMemo(() => ({
    rReal, effectiveExpenses,
    ssAmount: householdSS,
    ssClaimAge: includeSS ? ssClaimingAge : Infinity,
    pensionAmount:   pensionMonthly > 0 ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0,
    pensionStartAge: pensionMonthly > 0 ? pensionStartAge : Infinity,
    rmdTaxByAge, conversionTaxByAge,
    moneyEvents: retirementMoneyEvents,
  }), [rReal, effectiveExpenses, householdSS, includeSS, ssClaimingAge,
       pensionMonthly, pensionStartAge, rmdTaxByAge, conversionTaxByAge,
       retirementMoneyEvents]);

  // Headline longevity + the ONE retirement walk come straight from the engine
  // (retPhase) — no second projection (BUG-35 / BUG-31). retirementWalk exposes
  // rows (to life expectancy), depletionAge, and yearsSustained.
  const yearsSustained = retPhase.yearsSustained;
  const isSustainable = yearsSustained === Infinity || yearsSustained >= (safeLifeExp - safeRetAge);

  // Accumulation rows (current → retirement) — gross basis, so the chart joins the
  // engine's gross retirement walk with no discontinuity at retirement.
  const accumChart = useMemo(
    () => buildAccumChart({ simData, safeRetAge, currentAge, bal401k, balRoth, balTaxable, balHSA }),
    [simData, safeRetAge, currentAge, bal401k, balRoth, balTaxable, balHSA]);

  const retirementWalk = retPhase;

  // Scalar extraction for V9 stability (depletionAge used in markerByAge + horizonProps).
  const depletionAge = retirementWalk?.depletionAge ?? null;

  const totalChartData = useMemo(
    () => [...accumChart, ...retirementWalk.rows.map(r => ({ age: r.age, total: r.total }))],
    [accumChart, retirementWalk]);

  // Balance at life expectancy — used by Horizon "Left at 90" stat card. The
  // accessor (exact-age row, else last row, else 0 — never negative) is the
  // shared `walkBalanceAt` in retirement-phase.js, also used by the WI-3.9
  // Apply-preview builder below so both read the exact same rule.
  const balAt90 = useMemo(
    () => walkBalanceAt(retirementWalk.rows, safeLifeExp),
    [retirementWalk, safeLifeExp]);

  // Approximate contribution series for Horizon Sources view (cumulative contributions, no growth)
  const contribSeries = useMemo(() => {
    if (!simData.length) return null;
    const initBal = (bal401k ?? 0) + (balRoth ?? 0) + (balTaxable ?? 0) + (balHSA ?? 0);
    let cumContrib = initBal;
    const series = [];
    for (const row of simData) {
      series.push({ age: row.age, contrib: cumContrib });
      const rowTotal = (row.trad ?? 0) + (row.roth ?? 0) + (row.taxable ?? 0) + (row.hsa ?? 0);
      cumContrib = Math.min(cumContrib + (contrib401k + contribRoth + contribTaxable + contribHSA), rowTotal);
    }
    return series;
  }, [simData, bal401k, balRoth, balTaxable, balHSA, contrib401k, contribRoth, contribTaxable, contribHSA]);

  // Optimizer: find the annual conversion amount that maximizes net benefit after IRMAA + ACA.
  // Only runs in custom mode — bracket mode uses per-year targets derived from the bracket
  // choice, not a searchable flat scalar; optimizing a flat amount there produces a different
  // model than what the display shows.
  const optimizerResult = useMemo(() => {
    if (conversionMode === "bracket" || conversionWindowYrs === 0 || !hasRetRow) return null;

    // The window income floors depend only on startAge (not amount), but getNetBenefit is
    // called for every (startAge, amount) pair — so memoize the two floor arrays per startAge
    // to avoid rebuilding them on each amount step (Gemini review). The engine walk dominates
    // cost, but this removes the redundant recompute cleanly.
    const floorsByStart = new Map();
    const floorsFor = (startAge, windowLen) => {
      let f = floorsByStart.get(startAge);
      if (!f) {
        const floorArgs = {
          conversionWindowYrs: windowLen, startAge, includeSS, ssClaimingAge,
          pensionMonthly, pensionStartAge, monthsPerYear: ASSUMPTIONS.MONTHS_PER_YEAR,
        };
        f = {
          floors:     buildIncomeFloors({ ...floorArgs, ssAmount: ssTaxableRet }),
          magiFloors: buildIncomeFloors({ ...floorArgs, ssAmount: householdSS }),
        };
        floorsByStart.set(startAge, f);
      }
      return f;
    };

    // For each candidate (startAge, amount): rebuild the window floors + schedule for
    // that start, run the SAME engine (retPhaseBase) for the RMD-tax saving + conversion
    // cost, then the SAME evaluateConversionPlan for the IRMAA/ACA costs — so the
    // optimizer can never search a different model than the screen shows (BUG-31/BUG-35).
    const getNetBenefit = (startAge, amount) => {
      const windowLen = Math.max(0, resolvedEndAge - startAge + 1);
      const { floors: candidateFloors, magiFloors: candidateMAGIFloors } = floorsFor(startAge, windowLen);
      const candidateByAge = buildConversionByAge({
        startAge, endAge: resolvedEndAge, annualConversions: null, annualConversion: amount,
      });
      const rp = buildRetirementPhase({ ...retPhaseBase, conversionByAge: candidateByAge });
      const plan = evaluateConversionPlan({
        conversionWindowYrs: windowLen, annualConversion: amount, annualConversions: null,
        returnRate, retIncomeFloor, retIncomeFloors: candidateFloors,
        filingStatus, conversionTaxSource, retStateRate,
        tradGrossAtRetirement: tradGrossAtRet, rothBalAtRet: retRoth, taxableBalAtRet: retTaxable,
        windowStartAge: startAge,
        rmdTaxSaved: rp.rmdTaxSaved, conversionCost: rp.conversionCost,
        convMAGIFloors: candidateMAGIFloors, hasMarketplaceInsurance, householdSize, hasMedicare,
        personOnMedicare, marketplaceMonthlyPremium, monthsPerYear: ASSUMPTIONS.MONTHS_PER_YEAR,
      });
      return {
        rmdTaxSaved: rp.rmdTaxSaved, totalTax: rp.conversionCost,
        irmaaCost: plan.irmaaCost, acaLoss: plan.acaLoss,
      };
    };

    return findOptimalConversionPlan({ startAgeRange: [convWindowFloor, resolvedEndAge], getNetBenefit });
  }, [conversionMode, conversionWindowYrs, hasRetRow, retPhaseBase, retStateRate,
      retRoth, retTaxable, returnRate, retIncomeFloor, filingStatus, conversionTaxSource,
      tradGrossAtRet, convWindowFloor, resolvedEndAge,
      includeSS, ssClaimingAge, ssTaxableRet, householdSS, pensionMonthly, pensionStartAge,
      hasMedicare, personOnMedicare,
      hasMarketplaceInsurance, marketplaceMonthlyPremium, householdSize]);

  // ── WI-3.9 Apply-with-preview: the conversion-optimizer Apply site ─────────
  // The writes an "Apply" click performs — mirrors what the optimizer suggestion
  // line already implies (App.jsx:3300-3308 Classic copy): pin the suggested
  // start age, switch to custom mode (a flat searched amount isn't a bracket
  // target), and set the suggested amount. Making these writes is what falsifies
  // isSuggestionApplicable's gate on the next render (candidate === current) —
  // the "suggestion clears once applied" guarantee.
  const applyConversionSuggestion = useCallback(() => {
    if (!optimizerResult) return;
    setConversionStartAge(optimizerResult.optimalStartAge);
    setConversionMode("custom");
    setAnnualConversionAmt(optimizerResult.optimalConversion);
  }, [optimizerResult, setConversionStartAge, setConversionMode, setAnnualConversionAmt]);

  // The Apply-site object (docs/ARCHITECTURE.md "Apply-with-preview contract"):
  // `available` pre-gated here (never compared in the flow/modal), `preview` built
  // from ONE candidate engine run — the same buildRetirementPhase call the optimizer
  // itself uses (retPhaseBase + a candidateByAge schedule) — so the preview and the
  // search can never diverge (extends the BUG-31/BUG-35 anti-divergence guarantee).
  // Gating composition point (for WI-5.2): entitlements/readOnly flags will be
  // AND-ed into `available` here, App-side — the flow and ApplyPreviewModal never
  // import or test entitlements.
  const conversionApplySite = useMemo(() => {
    const available = isSuggestionApplicable({
      optimizerResult, annualConversion, resolvedStartAge, hasMedicare, hasMarketplaceInsurance,
    }) && !readOnly;
    if (!available) return { available: false, preview: null, apply: guardWrite(applyConversionSuggestion, readOnly) };

    const candidateByAge = buildConversionByAge({
      startAge: optimizerResult.optimalStartAge, endAge: resolvedEndAge,
      annualConversions: null, annualConversion: optimizerResult.optimalConversion,
    });
    const rp = buildRetirementPhase({ ...retPhaseBase, conversionByAge: candidateByAge });

    return {
      available: true,
      preview: buildConversionPreview({
        current: {
          adjustedNetConversionBenefit, yearsSustained, depletionAge,
          balAtRef: balAt90, rmdTaxBite, annualConversion, startAge: resolvedStartAge,
        },
        candidate: {
          netBenefit: optimizerResult.optimalBenefit,
          yearsSustained: rp.yearsSustained, depletionAge: rp.depletionAge,
          balAtRef: walkBalanceAt(rp.rows, safeLifeExp), rmdTaxBite: rp.rmdTaxBite,
        },
        suggestion: {
          optimalStartAge: optimizerResult.optimalStartAge,
          optimalConversion: optimizerResult.optimalConversion,
        },
        refAge: safeLifeExp,
      }),
      apply: guardWrite(applyConversionSuggestion, readOnly),
    };
  }, [optimizerResult, annualConversion, resolvedStartAge, hasMedicare, hasMarketplaceInsurance,
      resolvedEndAge, retPhaseBase, adjustedNetConversionBenefit, yearsSustained, depletionAge,
      balAt90, rmdTaxBite, safeLifeExp, applyConversionSuggestion, readOnly]);

  const limit415c        = currentAge >= CATCHUP_AGE ? LIMIT_415C_CATCHUP_2026 : LIMIT_415C_2026;
  const employerMatchAmt = employerMatch(currentIncome, contrib401k);
  const megaCapacity     = Math.max(0, limit415c - contrib401k - employerMatchAmt);
  // Memoized (V9): returns a new array each call, which would make strategiesView
  // (and any other consumer listing it as a dep) re-reference every render.
  const megaGrowth       = useMemo(
    () => calcMegaBackdoorGrowth({ megaCapacity, returnRate }),
    [megaCapacity, returnRate]);

  // Year-1 withdrawal-order tax (tax-optimal taxable→trad→Roth vs worst-case
  // all-pre-tax) — extracted to src/model/retirement-tax.js. Drives the
  // withdrawal-strategy card. Worst-case draw caps at the GROSS trad balance
  // (tradGrossAtRet), the BUG-26 basis fix, preserved in the model.
  // Memoized (V9): withdrawalView (→ horizonProps.withdrawalView) reads these
  // scalars; without this memo they'd still be stable primitives, but the memo
  // keeps the calc itself from re-running when unrelated state changes trigger
  // a re-render (same pattern as the other extracted model calls above).
  const {
    yr1FromTaxable, yr1FromTrad, yr1FromRoth, yr1TradRate, yr1TaxOptimal, yr1TaxWorstCase, yr1TaxSavings,
  } = useMemo(() => calcWithdrawalOrderTax({
    netPortfolioNeed, retTaxable, retTrad, retRoth, tradGrossAtRet,
    rmdIncomeFloor, filingStatus, retStateRate,
    maxCombinedMarginalRate: ASSUMPTIONS.MAX_COMBINED_MARGINAL_RATE,
  }), [netPortfolioNeed, retTaxable, retTrad, retRoth, tradGrossAtRet,
       rmdIncomeFloor, filingStatus, retStateRate]);

  // WI-3.7 (surplus/withdrawal cards): withdrawal-order strategy bundle.
  // steps[] is pre-filtered to amount > 0 rows (rule 10 — no `> 0` in the
  // screen) and pre-labeled/pre-noted so the flow only maps and renders.
  const withdrawalView = useMemo(() => ({
    netNeed: netPortfolioNeed,
    steps: [
      { key: "taxable", label: "Taxable brokerage", amount: yr1FromTaxable, note: "already-taxed principal" },
      { key: "trad",    label: "Traditional 401k",  amount: yr1FromTrad,   note: `taxed at ~${(yr1TradRate * 100).toFixed(0)}%` },
      { key: "roth",    label: "Roth IRA",          amount: yr1FromRoth,   note: "tax-free" },
    ].filter(s => s.amount > 0),
    yr1TaxOptimal, yr1TaxWorstCase, yr1TaxSavings,
    hasSavings: yr1TaxSavings > 0,
  }), [netPortfolioNeed, yr1FromTaxable, yr1FromTrad, yr1FromRoth, yr1TradRate,
       yr1TaxOptimal, yr1TaxWorstCase, yr1TaxSavings]);

  const actualMarginalPct  = Math.round(fedMarginal * 100);

  const contrib401kRoom    = Math.max(0, TRAD_401K_LIMIT_2026 - contrib401k);
  const contrib401kTaxSave = Math.round(contrib401kRoom * fedMarginal);

  const avgAnnualRMD      = rmdData.length > 0 ? Math.round(totalRMDs / rmdData.length) : 0;
  const { bracketPct: projRetBracketPct } = projectRetirementBracket({
    avgAnnualRMD, householdSS, effectivePension, filingStatus,
  });

  // SS-delay gain (BUG-26): compare portfolio longevity under the user's current
  // SS plan vs. delaying SS to 70, both walked year-by-year from the same starting
  // portfolio. The per-year walk is essential — between retirement and 70 the
  // delayed plan draws more (no SS yet), depleting the portfolio faster, so the
  // age-70 starting balance is lower than totalAtRet. The old closed-form solved
  // longevity at the post-70 (lower) draw rate from the full retirement balance,
  // which ignored those higher pre-70 draws and overstated the delay benefit
  // (3–6 yrs for users who retire well before 70).
  const ssDelayGainYrs = calcSSDelayGain({
    includeSS, ssClaimingAge, ssMaxClaimAge: SS_MAX_CLAIM_AGE, yearsSustained,
    totalAtRet, safeRetAge, effectiveExpenses, rReal,
    householdSS, household70SS, pensionMonthly, pensionStartAge,
    monthsPerYear: ASSUMPTIONS.MONTHS_PER_YEAR,
  });
  const wr70 = totalAtRet > 0
    ? Math.max(0, effectiveExpenses - household70SS - effectivePension) / totalAtRet * 100
    : 0;

  const flowData = useMemo(() => calcFlowDown({
    bal401k, balRoth, balTaxable, balHSA,
    contribRows: simData.filter(d => d.age <= safeRetAge),
    totalAtRet,
    walkRows: retirementWalk.rows,
    depletionAge: retirementWalk.depletionAge,
    accumChart,
    conversionWindowYrs,
    totalConverted: conversionWindowYrs > 0
      ? conversionSim.years.reduce((s, y) => s + y.conversion, 0) : 0,
    safeRetAge, safeLifeExp, rmdStartAge: RMD_START_AGE,
  }), [
    bal401k, balRoth, balTaxable, balHSA, simData, safeRetAge, totalAtRet,
    conversionWindowYrs, conversionSim, retirementWalk, accumChart, safeLifeExp,
  ]);

  const optimized = useMemo(() => calcOptimizedScenario({
    totalAtRet, optimizedAllocation, returnRate, incomeGrowth, safeRetAge, currentAge,
    withdrawalTaxRate: Math.round(effectiveRMDTaxRate * 100),
    contrib401k, includeSS, ssClaimingAge, ss70Annual, spouseSsBenefit,
    householdSS, effectiveExpenses, effectivePension, pensionStartAge, rReal, safeLifeExp,
    yr1TaxSavings, netConversionBenefit, isSustainable, yearsSustained,
    conversionSim, retTaxable, rmdTaxByAge, conversionTaxByAge,
  }), [
    totalAtRet, optimizedAllocation, returnRate, incomeGrowth, safeRetAge, currentAge,
    effectiveRMDTaxRate, contrib401k, includeSS, ssClaimingAge, ss70Annual, spouseSsBenefit,
    householdSS, effectiveExpenses, effectivePension, pensionStartAge, rReal, safeLifeExp,
    yr1TaxSavings, netConversionBenefit, isSustainable, yearsSustained,
    conversionSim, retTaxable, rmdTaxByAge, conversionTaxByAge,
  ]);


  // Inputs needed for what-if re-simulation. Memoized (V9) so WhatIfPanel and the
  // whatIfBundle below receive a stable reference and their useMemos only fire on
  // genuine input changes.
  const whatIfSimInputs = useMemo(() => ({
    totalYears, currentAge, currentIncome, incomeGrowth, incomeGrowthEndAge, filingStatus,
    spouseIncome, spouseIncomeGrowth, returnRate,
    bal401k, balRoth, balTaxable, balHSA,
    contrib401k, contribRoth, contribTaxable, contribHSA,
    contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
    calcEmployerMatchFn: employerMatch,
    moneyEvents,
    // Permanent working-year conversions must travel with the re-sim so the what-if
    // BASELINE matches the main plan (same class as the BUG-34 money-events fix).
    conversionEvents: activeConversionEvents, stateRate,
  }), [totalYears, currentAge, currentIncome, incomeGrowth, incomeGrowthEndAge, filingStatus,
       spouseIncome, spouseIncomeGrowth, returnRate,
       bal401k, balRoth, balTaxable, balHSA,
       contrib401k, contribRoth, contribTaxable, contribHSA,
       contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
       employerMatch, moneyEvents, activeConversionEvents, stateRate]);

  // Retirement-age coupled update: mirrors the Classic UI onChange that keeps
  // contribEnd ages in sync when they track the retirement age.
  const setRetirementAgeCoupled = useCallback(v => {
    setRetirementAge(v);
    if (contribEnd401k    === retirementAge) setContribEnd401k(v);
    if (contribEndRoth    === retirementAge) setContribEndRoth(v);
    if (contribEndTaxable === retirementAge) setContribEndTaxable(v);
    if (contribEndHSA     === retirementAge) setContribEndHSA(v);
  }, [setRetirementAge, contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
      setContribEnd401k, setContribEndRoth, setContribEndTaxable, setContribEndHSA, retirementAge]);

  // Single entry point for Horizon-initiated mutations to App state.
  // Always called after user confirms in a modal — never fired directly by screens.
  // Accepts monthlySpend as an alternative to annualExpenses so the month→year
  // conversion happens HERE, not in screen JSX (principle 6); annualExpenses wins
  // if both are passed. Uses the coupled retirement-age setter (not the bare
  // setRetirementAge) so contribEnd ages stay in sync even for callers — like
  // onboarding's handleSave — that commit a retirement age directly without
  // pre-coupling it themselves.
  const commitPlan = useCallback(({ retirementAge: ra, annualExpenses: ae, monthlySpend: ms, currentAge: ca, currentIncome: ci } = {}) => {
    if (ca !== undefined) setCurrentAge(ca);
    if (ci !== undefined) setCurrentIncome(ci);
    if (ra !== undefined) setRetirementAgeCoupled(ra);
    if (ae !== undefined) setAnnualExpenses(ae);
    else if (ms !== undefined) setAnnualExpenses(ms * ASSUMPTIONS.MONTHS_PER_YEAR);
    // Snapshot of all Quick Tune slider values at commit time — enables Reset-style
    // consumers to restore exactly this state. Uses the new values for fields being
    // updated, current state for everything else.
    const snapAe = ae !== undefined ? ae : ms !== undefined ? ms * ASSUMPTIONS.MONTHS_PER_YEAR : annualExpenses;
    setCommittedPlan({
      retirementAge: ra ?? retirementAge,
      annualExpenses: snapAe,
      lifeExpect, returnRate, inflationRate, incomeGrowth, contrib401k,
      ssClaimingAge, spouseClaimingAge, annualConversionAmt,
    });
  }, [setCurrentAge, setCurrentIncome, setRetirementAgeCoupled, setAnnualExpenses,
      retirementAge, annualExpenses, lifeExpect, returnRate, inflationRate,
      incomeGrowth, contrib401k, ssClaimingAge, spouseClaimingAge, annualConversionAmt]);

  // Monthly spend write-back: converts monthly slider units to annual so screens
  // never do month→year math (rule 10). Used internally by applyPlanLevers below.
  const setMonthlySpend = useCallback(
    v => setAnnualExpenses(v * ASSUMPTIONS.MONTHS_PER_YEAR),
    [setAnnualExpenses]
  );

  // Applies the Plan screen "Try a change" panel's previewed levers to real state.
  // Only called from the ApplyPreviewModal's onConfirm (never fired directly by a
  // slider) — the panel itself never touches real state, matching the "preview
  // first, explicit Apply" rule this redesign introduced (2026-07-11). Uses the
  // coupled retirement-age setter so contribEnd ages stay in sync (the same
  // invariant Classic's own slider preserves), then commits a plan snapshot via
  // commitPlan so committedPlan reflects the newly applied values. Fields are
  // independently optional — a lever the user never dragged is omitted, not
  // re-applied with its unchanged value.
  const applyPlanLevers = useCallback(({ retirementAge: ra, monthlySpend: ms } = {}) => {
    if (ra !== undefined) setRetirementAgeCoupled(ra);
    if (ms !== undefined) setMonthlySpend(ms);
    commitPlan({
      ...(ra !== undefined ? { retirementAge: ra } : {}),
      ...(ms !== undefined ? { monthlySpend: ms } : {}),
    });
  }, [setRetirementAgeCoupled, setMonthlySpend, commitPlan]);

  // Wrapped moneyEvents write surface (replaces the raw `setMoneyEvents` that used
  // to ride on horizonProps — every screen called `setMoneyEvents(prev => …)`
  // itself, a bare mutation the App memo never wrapped, violating the
  // "no bundle exposes a raw setter" convention in docs/ARCHITECTURE.md). Two
  // list-mutation callbacks cover every write LifeEventSheet/Ideas/Plan need:
  // upsert-by-id (new event when no id matches, replace when one does) and
  // remove-by-id. This is also where WI-5.2's entitlements/readOnly gating will
  // compose (App-side, at construction) once it exists.
  const saveEvent = useCallback((ev) => {
    setMoneyEvents(prev => (prev.some(me => me.id === ev.id)
      ? prev.map(me => (me.id === ev.id ? ev : me))
      : [...prev, ev]));
  }, [setMoneyEvents]);
  const removeEvent = useCallback((id) => {
    setMoneyEvents(prev => prev.filter(me => me.id !== id));
  }, [setMoneyEvents]);

  // Current-age coupled update: mirrors the Classic onChange (Tax Rate Phases)
  // that pushes retirement age, spouse age, and contribEnd ages forward so they
  // never fall before the new current age.
  const setCurrentAgeCoupled = useCallback(v => {
    setCurrentAge(v);
    // Keep the horizon ahead of the (raised) current/retirement age so lifeExpect
    // and retirementAge never fall outside their own min/max contracts.
    if (lifeExpect <= v) setLifeExpect(v + 1);
    // Past age 70 the SS claim floor would otherwise sit above a now-too-low
    // stored claim age (min > value). Clamp the stored value at the source so
    // neither the bundle nor the Classic slider ever holds an out-of-range age.
    const minSsClaimAge = Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, v));
    if (ssClaimingAge < minSsClaimAge) setSsClaimingAge(minSsClaimAge);
    if (retirementAge < v) setRetirementAge(v);
    if (spouseCurrentAge >= v) setSpouseCurrentAge(Math.max(18, v - 1));
    if (contribEnd401k    <= v) setContribEnd401k(v + 1);
    if (contribEndRoth    <= v) setContribEndRoth(v + 1);
    if (contribEndTaxable <= v) setContribEndTaxable(v + 1);
    if (contribEndHSA     <= v) setContribEndHSA(v + 1);
  }, [setCurrentAge, setRetirementAge, setLifeExpect, setSpouseCurrentAge, setSsClaimingAge,
      retirementAge, lifeExpect, spouseCurrentAge, ssClaimingAge,
      contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
      setContribEnd401k, setContribEndRoth, setContribEndTaxable, setContribEndHSA]);

  // Life-expectancy coupled update: mirrors the Classic onChange that clamps the
  // retirement age below the new horizon and caps any contribEnd ages above it.
  const setLifeExpectCoupled = useCallback(v => {
    setLifeExpect(v);
    if (retirementAge >= v) setRetirementAge(v - 1);
    if (contribEnd401k    > v) setContribEnd401k(v);
    if (contribEndRoth    > v) setContribEndRoth(v);
    if (contribEndTaxable > v) setContribEndTaxable(v);
    if (contribEndHSA     > v) setContribEndHSA(v);
  }, [setLifeExpect, setRetirementAge, retirementAge,
      contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
      setContribEnd401k, setContribEndRoth, setContribEndTaxable, setContribEndHSA]);

  // Extended what-if bundle: includes everything calcWhatIfChart/calcWhatIfScenario
  // need so the screens can call them directly. Memoized (V9 / principle 13) with the
  // memoized whatIfSimInputs + retDrawShared as deps. Grown by named fields only —
  // baseYearsSustained added for calcWhatIfScenario's deltaYears (never repurpose).
  // retPhaseBase/conversionByAge/baseChart/addlPreTaxBal (2026-07-11, overlay-
  // continuity fix): the SAME memoized inputs the main per-account engine
  // (retirement-phase.js) uses, so calcWhatIfScenario can walk retirement with
  // that engine instead of the older blended buildRetirementDrawdown — a
  // no-change scenario's dashed overlay then sits exactly on the solid line.
  const whatIfBundle = useMemo(() => ({
    simInputs: whatIfSimInputs,
    fedMarginal,
    retDrawShared,
    safeRetAge,
    safeLifeExp,
    baseTotalAtRet: totalAtRet,
    baseYearsSustained: yearsSustained,
    retPhaseBase,
    conversionByAge,
    baseChart: totalChartData,
    addlPreTaxBal,
    // M2 review fix: the engine's own depletion age (exact), so buildLeverPreview's
    // "before" longevity metric doesn't fall back to a round(retAge+years)
    // derivation that can land one year early.
    baseDepletionAge: depletionAge,
  }), [whatIfSimInputs, fedMarginal, retDrawShared, safeRetAge, safeLifeExp,
       totalAtRet, yearsSustained, retPhaseBase, conversionByAge, totalChartData,
       addlPreTaxBal, depletionAge]);

  // ── Horizon display bundles (WI-0.1) — derived numbers come from the model, ──
  // pre-gated and display-ready, so screens only format (principle 6).
  // Edge states are documented at the model functions; none use ?? 0 fallbacks.

  // Statement / Money-flow tab numbers (percentages, waterfall residual set,
  // monthly conversions, eff-fed-rate footnote). Percentages are null when
  // currentIncome ≤ 0 — screens render "—".
  // lifetimeContribROI: scalar extracted from flowData for a stable dep (V9 pattern).
  const flowTotalContrib = flowData.totalContrib;
  const statementView = useMemo(() => calcStatementView({
    currentIncome: householdIncome, fedTax, fica, stateTax, takeHome,
    currentContribTotal, householdSS, effectiveExpenses, safeDeduc, effectivePension,
    totalAtRet, totalContrib: flowTotalContrib,
  }), [householdIncome, fedTax, fica, stateTax, takeHome,
       currentContribTotal, householdSS, effectiveExpenses, safeDeduc, effectivePension,
       totalAtRet, flowTotalContrib]);

  // Lifetime-chart milestones (Today / First $1M / Retire / Peak / RMDs start /
  // For life) + peakTotal for proportional bars. RMD gate uses RMD_START_AGE
  // from config inside the model (V2).
  const chartMilestones = useMemo(() => calcChartMilestones({
    chartData: totalChartData, currentAge, retirementAge: safeRetAge, lifeExpect: safeLifeExp,
  }), [totalChartData, currentAge, safeRetAge, safeLifeExp]);

  // Per-account engine rows keyed by age — forwarded to the Year-by-year expanded
  // row detail panel so each click can show Trad/Roth/Taxable/HSA breakdown.
  // Derived from retPhase.rows (the display-horizon slice already filtered to lifeExp).
  const retirementRowByAge = useMemo(
    () => Object.fromEntries((retPhase?.rows ?? []).map(r => [r.age, r])),
    [retPhase]);

  // Milestone ages keyed for inline portfolio-cell badge (age → tag string).
  // Derived from chartMilestones.rows which is already sorted + filtered by the model.
  const milestoneByAge = useMemo(
    () => Object.fromEntries((chartMilestones?.rows ?? []).map(m => [m.age, m.tag])),
    [chartMilestones]);

  // Plan-screen progress (V6). progressPct: 100 when sustainable (incl. Infinity
  // yearsSustained), else 0–99. Grown by a named field (principle 11) for
  // WI-1.1: `drivers` — the on-track pill popover's 3 rows from calcPlanDrivers
  // (withdrawal rate vs guideline, longevity vs horizon, savings rate), each
  // render-ready with ok booleans so the screen never compares (rule 10).
  // Edge states documented at calcPlanDrivers (sustainedYears null = never
  // depletes; savingsRatePct/ok null = no take-home).
  const planView = useMemo(() => ({
    ...calcPlanProgress({
      yearsSustained, isSustainable, lifeExpect: safeLifeExp, retirementAge: safeRetAge,
    }),
    drivers: calcPlanDrivers({
      withdrawalRate, yearsSustained, isSustainable,
      lifeExpect: safeLifeExp, retirementAge: safeRetAge,
      currentContribTotal, takeHome,
    }),
  }), [yearsSustained, isSustainable, safeLifeExp, safeRetAge,
       withdrawalRate, currentContribTotal, takeHome]);

  // Pre-computed display scalars shared by sliderBounds and horizonProps directly.
  // monthlySpend: the QuickTune spend slider value (rule 10 — month↔year in the model).
  // trad401kMax: catch-up age determines the 401k ceiling (rule 1 — config only).
  const monthlySpend = Math.round((annualExpenses ?? effectiveExpenses) / ASSUMPTIONS.MONTHS_PER_YEAR);
  const trad401kMax  = currentAge >= CATCHUP_AGE
    ? TRAD_401K_LIMIT_2026 + CATCHUP_401K_2026
    : TRAD_401K_LIMIT_2026;

  // Plan screen "wow" highlights — portfolio hero + income replacement meter.
  // All arithmetic lives here (rule 10: screens only read named fields).
  // currentSaved is a scalar sum; rawFlow is computed inside the memo (it's a fresh
  // object on each call, so moving it outside would make it an unstable dep — V9).
  const currentSaved = bal401k + balRoth + balTaxable + balHSA;
  const planHighlights = useMemo(() => {
    const flow = calcRetIncomeFlow({ effectiveExpenses, ss: ssAtRet, pension: effectivePension });
    const base = Math.max(1, effectiveExpenses);
    return {
      wealthMultiplier: currentSaved > 0
        ? Math.round((totalAtRet / currentSaved) * 10) / 10
        : null,
      incomeReplacementPct: takeHome > 0
        ? Math.min(200, Math.round((effectiveExpenses / takeHome) * 100))
        : null,
      retIncomeFlow: {
        ...flow,
        hasSS:        flow.ss > 0,
        hasPension:   flow.pension > 0,
        ssPct:        Math.round(flow.ss           / base * 100),
        pensionPct:   Math.round(flow.pension       / base * 100),
        portfolioPct: Math.round(flow.portfolioDraw / base * 100),
      },
      lifetimeTaxBurden: (retPhase?.rmdTaxBite ?? 0) + (retPhase?.conversionCost ?? 0),
      yearsToRetirement:  Math.max(0, safeRetAge - currentAge),
      retirementDuration: Math.max(0, safeLifeExp - safeRetAge),
    };
  }, [currentSaved, totalAtRet, takeHome, effectiveExpenses,
      ssAtRet, effectivePension, retPhase, safeRetAge, safeLifeExp, currentAge]);

  // Plan screen "Try a change" slider bounds — age/financial math extracted from the screen (rule 10).
  // canTuneRothConversion: pre-gated eligibility boolean so the screen never does > 0 check.
  const sliderBounds = useMemo(() => ({
    retireMin:  Math.min(currentAge + 1, retirementAge),
    retireMax:  Math.max(80, retirementAge),
    spendMin:   Math.min(500, monthlySpend),
    spendMax:   Math.max(30_000, monthlySpend),
    horizonMin: Math.min(Math.max(retirementAge + 1, 70), lifeExpect),
    horizonMax: Math.max(115, lifeExpect),
    contribMax: Math.max(trad401kMax, contrib401k),
    rothMax:    Math.max(200_000, annualConversionAmt),
    // BUG-17: mirrors ssBundle.ssClaimingAge's floor exactly (review fix — QuickTunePanel's
    // SS slider had drifted to a flat 62-70, letting a user dial a claim age in the past).
    ssMin: Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge)),
    ssMax: SS_MAX_CLAIM_AGE,
    canTuneRothConversion: conversionWindowYrs > 0,
    // RESERVED (future #123): savingsMin/savingsMax for an annualSavings lever —
    // see the matching LEVERS-table reservation note in src/model/what-if.js.
    // Unit decision (owner): ANNUAL dollars, override key `annualContributions`
    // (not monthly, unlike the spend lever) — no bounds computed until #123
    // actually wires the lever through calcWhatIfScenario.
  }), [currentAge, retirementAge, monthlySpend, lifeExpect, trad401kMax, contrib401k, annualConversionAmt, conversionWindowYrs]);

  // ── WI-3.1 (#98) setter bundles ─────────────────────────────────────────────
  // Topic-grouped, self-describing write access to the shared App state, so every
  // Level-3 Horizon screen can both READ a value and WRITE it back through ONE
  // field — no Classic input is duplicated, both UIs stay in sync (principle 11).
  // Each numeric field is { value, set, min, max[, step] }; toggles are
  // { value, set }; choices are { value, set, options:[{value,label}] }. min/max/
  // step are copied VERBATIM from the Classic JSX (incl. the BUG-17 SS floor and
  // the dynamic per-account contribution step), so screens carry zero constants
  // or bounds math (rule 1 / rule 10). Dynamic bounds are computed here, never in
  // the screen. Bundle shapes are documented in docs/ARCHITECTURE.md. Plumbing
  // only — no screen consumes these yet; golden master untouched.

  const profileBundle = useMemo(() => ({
    currentIncome:      { value: currentIncome, set: guardWrite(setCurrentIncome, readOnly), min: 20_000, max: 500_000, step: 5_000 },
    incomeGrowth:       { value: incomeGrowth, set: guardWrite(setIncomeGrowth, readOnly), min: 0, max: 15, step: 0.5 },
    incomeGrowthEndAge: { value: incomeGrowthEndAge,
      set: guardWrite(v => setIncomeGrowthEndAge(v >= safeRetAge ? null : v), readOnly),
      min: currentAge + 1, max: safeRetAge, step: 1 },
    spouseIncome:       { value: spouseIncome, set: guardWrite(setSpouseIncome, readOnly), min: 0, max: 500_000, step: 5_000 },
    spouseIncomeGrowth: { value: spouseIncomeGrowth, set: guardWrite(setSpouseIncomeGrowth, readOnly), min: 0, max: 15, step: 0.5 },
    filingStatus:       { value: filingStatus, set: guardWrite(setFilingStatus, readOnly), options: FILING_STATUS_OPTIONS },
    selectedState:      { value: selectedState,
      set: guardWrite(v => { setSelectedState(v); setStateRateOverride(null); }, readOnly), options: STATE_OPTIONS },
    stateRateOverride:  { value: stateRateOverride, defaultPct: stateRateDefault * 100,
      // pct: the effective rate as a percent for display/editing (override when set,
      // else the state default) — so screens never multiply the fraction (rule 10).
      pct: (stateRateOverride !== null ? stateRateOverride : stateRateDefault) * 100,
      // Snap-to-default threshold (0.05) is below the 0.1 step so a single stepper
      // tap escapes the default instead of snapping back (matches the Classic copy).
      set: guardWrite(v => setStateRateOverride(Math.abs(v - stateRateDefault * 100) < 0.05 ? null : v / 100), readOnly),
      min: 0, max: 13, step: 0.1 },
    otherPreTaxDeduc:   { value: otherPreTaxDeduc, set: guardWrite(setOtherPreTaxDeduc, readOnly), min: 0, max: 20_000, step: 250 },
  }), [currentIncome, incomeGrowth, incomeGrowthEndAge, spouseIncome, spouseIncomeGrowth,
       filingStatus, selectedState, stateRateOverride, otherPreTaxDeduc, currentAge, safeRetAge,
       stateRateDefault, setCurrentIncome, setIncomeGrowth, setIncomeGrowthEndAge, setSpouseIncome,
       setSpouseIncomeGrowth, setFilingStatus, setSelectedState, setStateRateOverride, setOtherPreTaxDeduc,
       readOnly]);

  const spendingBundle = useMemo(() => ({
    livingExpenses:      { value: livingExpenses,
      set: guardWrite(v => { setLivingExpenses(v); setPreApplySnapshot(null); }, readOnly),
      min: 10_000, max: Math.max(grossAfterTax, 30_000), step: 1_000 },
    livingExpenseGrowth: { value: livingExpenseGrowth, set: guardWrite(setLivingExpenseGrowth, readOnly), min: 0, max: 10, step: 0.5 },
    annualExpenses:      { value: annualExpenses, set: guardWrite(setAnnualExpenses, readOnly), min: 10_000, max: 300_000, step: 1_000 },
    retirementTarget:    { value: retirementTarget, set: guardWrite(setRetirementTarget, readOnly), min: 100_000, max: 20_000_000 },
  }), [livingExpenses, livingExpenseGrowth, annualExpenses, retirementTarget, grossAfterTax,
       setLivingExpenses, setPreApplySnapshot, setLivingExpenseGrowth, setAnnualExpenses, setRetirementTarget,
       readOnly]);

  const accountsBundle = useMemo(() => {
    // Per-account balance slider caps at 1M (Classic range) but the DeferredInput
    // accepts up to 5M; both bounds are exposed (sliderMax vs max).
    const acct = (bal, setBal, contrib, setContrib, contribMax, endAge, setEndAge) => ({
      bal:        { value: bal, set: guardWrite(setBal, readOnly), min: 0, max: 5_000_000, sliderMax: 1_000_000, step: 10_000 },
      contrib:    { value: contrib, set: guardWrite(setContrib, readOnly), min: 0, max: contribMax, step: contribStep(contribMax) },
      contribEnd: { value: endAge, set: guardWrite(setEndAge, readOnly), min: currentAge + 1, max: safeLifeExp, step: 1 },
    });
    return {
      trad401k: acct(bal401k, setBal401k, contrib401k, setContrib401k, TRAD_401K_LIMIT_2026, contribEnd401k, setContribEnd401k),
      roth:     acct(balRoth, setBalRoth, contribRoth, setContribRoth, ROTH_IRA_LIMIT_2026, contribEndRoth, setContribEndRoth),
      taxable:  acct(balTaxable, setBalTaxable, contribTaxable, setContribTaxable, 100_000, contribEndTaxable, setContribEndTaxable),
      hsa:      acct(balHSA, setBalHSA, contribHSA, setContribHSA, HSA_LIMIT_2026, contribEndHSA, setContribEndHSA),
      // Unbounded (no Classic max) — rendered as a stepper, so it carries a UI step
      // but no max; the set wrapper clamps at ≥ 0.
      addlPreTaxBal:    { value: addlPreTaxBal, set: guardWrite(v => setAddlPreTaxBal(Math.max(0, v || 0)), readOnly), min: 0, step: 10_000 },
      matchMode:        { value: matchMode, set: guardWrite(setMatchMode, readOnly),
        options: [{ value: "flat", label: "Flat %" }, { value: "formula", label: "Formula" }] },
      employerMatchPct: { value: employerMatchPct, set: guardWrite(setEmployerMatchPct, readOnly), min: 0, max: 10, step: 0.5 },
      matchFormulaRate: { value: matchFormulaRate, set: guardWrite(setMatchFormulaRate, readOnly), min: 0, max: 200, step: 5 },
      matchFormulaCap:  { value: matchFormulaCap, set: guardWrite(setMatchFormulaCap, readOnly), min: 1, max: 15, step: 0.5 },
    };
  }, [bal401k, contrib401k, contribEnd401k, balRoth, contribRoth, contribEndRoth,
      balTaxable, contribTaxable, contribEndTaxable, balHSA, contribHSA, contribEndHSA,
      addlPreTaxBal, matchMode, employerMatchPct, matchFormulaRate, matchFormulaCap,
      currentAge, safeLifeExp,
      setBal401k, setContrib401k, setContribEnd401k, setBalRoth, setContribRoth, setContribEndRoth,
      setBalTaxable, setContribTaxable, setContribEndTaxable, setBalHSA, setContribHSA, setContribEndHSA,
      setAddlPreTaxBal, setMatchMode, setEmployerMatchPct, setMatchFormulaRate, setMatchFormulaCap,
      readOnly]);

  const ssBundle = useMemo(() => ({
    includeSS:        { value: includeSS, set: guardWrite(setIncludeSS, readOnly) },
    // BUG-17: claim age can never precede the user's current age — but also cap the
    // floor at SS_MAX_CLAIM_AGE so min never exceeds max when currentAge > 70
    // (currentAge ranges to 80). Mirrors the Classic slider's clamp exactly.
    ssClaimingAge:    { value: ssClaimingAge, set: guardWrite(setSsClaimingAge, readOnly),
      min: Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge)), max: SS_MAX_CLAIM_AGE, step: 1 },
    ssOverride:       { value: ssOverride, estimated: ssAnnualBenefit,
      // max expands to fit a current override above the default cap (mirrors the
      // sliderBounds dynamic-max pattern) so the slider never visually clamps.
      set: guardWrite(v => setSsOverride(v === ssAnnualBenefit ? null : v), readOnly),
      // When null the field seeds from ssAnnualBenefit, so the cap must clear that
      // too (high earners / delayed claims can exceed 60k) or the slider clamps.
      min: 0, max: Math.max(60_000, ssOverride || ssAnnualBenefit || 0), step: 500 },
    isMarried:        { value: isMarried, set: guardWrite(setIsMarried, readOnly) },
    spouseSsEstimate: { value: spouseSsEstimate, set: guardWrite(setSpouseSsEstimate, readOnly), min: 0, max: 60_000, step: 500 },
    spouseClaimingAge:{ value: spouseClaimingAge, set: guardWrite(setSpouseClaimingAge, readOnly),
      min: SS_MIN_CLAIM_AGE, max: SS_MAX_CLAIM_AGE, step: 1 },
    spouseBenefitBasis:{ value: spouseBenefitBasis, set: guardWrite(setSpouseBenefitBasis, readOnly),
      options: [{ value: "own", label: "Own record" }, { value: "spousal", label: "Spousal (50%)" }] },
    spouseCurrentAge: { value: spouseCurrentAge, set: guardWrite(setSpouseCurrentAge, readOnly), min: 18, max: currentAge - 1, step: 1 },
    spouseIsSoleBenef:{ value: spouseIsSoleBenef, set: guardWrite(setSpouseIsSoleBenef, readOnly) },
  }), [includeSS, ssClaimingAge, ssOverride, isMarried, spouseSsEstimate, spouseClaimingAge,
       spouseBenefitBasis, spouseCurrentAge, spouseIsSoleBenef, currentAge, ssAnnualBenefit,
       setIncludeSS, setSsClaimingAge, setSsOverride, setIsMarried, setSpouseSsEstimate,
       setSpouseClaimingAge, setSpouseBenefitBasis, setSpouseCurrentAge, setSpouseIsSoleBenef,
       readOnly]);

  const pensionBundle = useMemo(() => ({
    pensionMonthly:  { value: pensionMonthly, set: guardWrite(setPensionMonthly, readOnly), min: 0, max: 10_000, step: 100 },
    pensionStartAge: { value: pensionStartAge, set: guardWrite(setPensionStartAge, readOnly), min: 50, max: 75, step: 1 },
  }), [pensionMonthly, pensionStartAge, setPensionMonthly, setPensionStartAge, readOnly]);

  const conversionBundle = useMemo(() => ({
    conversionMode:          { value: conversionMode, set: guardWrite(setConversionMode, readOnly),
      options: [{ value: "bracket", label: "Fill to bracket" }, { value: "custom", label: "Custom amount" }] },
    conversionBracketTarget: { value: conversionBracketTarget, set: guardWrite(setConversionBracketTarget, readOnly), options: CONVERSION_BRACKET_OPTIONS },
    annualConversionAmt:     { value: annualConversionAmt, set: guardWrite(setAnnualConversionAmt, readOnly), min: 0, max: 500_000, step: 5_000 },
    conversionTaxSource:     { value: conversionTaxSource, set: guardWrite(setConversionTaxSource, readOnly),
      options: [{ value: "converted", label: "From the conversion" }, { value: "taxable", label: "From taxable" }] },
  }), [conversionMode, conversionBracketTarget, annualConversionAmt, conversionTaxSource,
       setConversionMode, setConversionBracketTarget, setAnnualConversionAmt, setConversionTaxSource,
       readOnly]);

  const healthBundle = useMemo(() => ({
    hasMarketplaceInsurance:  { value: hasMarketplaceInsurance, set: guardWrite(setHasMarketplaceInsurance, readOnly) },
    householdSize:            { value: householdSize, set: guardWrite(setHouseholdSize, readOnly), min: 1, max: 6, step: 1 },
    marketplaceMonthlyPremium:{ value: marketplaceMonthlyPremium,
      set: guardWrite(v => setMarketplaceMonthlyPremium(v === "" ? null : Number(v)), readOnly), min: 0, step: 50 },
    hasMedicare:              { value: hasMedicare, set: guardWrite(setHasMedicare, readOnly) },
    personOnMedicare:         { value: personOnMedicare, set: guardWrite(setPersonOnMedicare, readOnly),
      options: [{ value: 1, label: "Person 1" }, { value: 2, label: "Person 2" }] },
  }), [hasMarketplaceInsurance, householdSize, marketplaceMonthlyPremium, hasMedicare, personOnMedicare,
       setHasMarketplaceInsurance, setHouseholdSize, setMarketplaceMonthlyPremium, setHasMedicare, setPersonOnMedicare,
       readOnly]);

  const assumptionsBundle = useMemo(() => ({
    // Timeline trio uses the coupled setters so the cross-field invariants Classic
    // enforces (retire ≥ current, contribEnd ages in range) hold from Horizon too.
    currentAge:        { value: currentAge, set: guardWrite(setCurrentAgeCoupled, readOnly), min: 18, max: 80, step: 1 },
    retirementAge:     { value: retirementAge, set: guardWrite(setRetirementAgeCoupled, readOnly), min: currentAge, max: lifeExpect - 1, step: 1 },
    lifeExpect:        { value: lifeExpect, set: guardWrite(setLifeExpectCoupled, readOnly), min: retirementAge + 1, max: 115, step: 1 },
    returnRate:        { value: returnRate, set: guardWrite(setReturnRate, readOnly), min: 1, max: 15, step: 1 },
    inflationRate:     { value: inflationRate, set: guardWrite(setInflationRate, readOnly), min: 1, max: 8, step: 0.5 },
    retirementState:   { value: retirementState, set: guardWrite(setRetirementState, readOnly), options: RETIREMENT_STATE_OPTIONS },
    savingsSurplusPct: { value: savingsSurplusPct,
      set: guardWrite(v => { setSavingsSurplusPct(v); setPreApplySnapshot(null); }, readOnly), min: 0, max: 100, step: 5 },
  }), [currentAge, retirementAge, lifeExpect, returnRate, inflationRate, retirementState, savingsSurplusPct,
       setCurrentAgeCoupled, setRetirementAgeCoupled, setLifeExpectCoupled, setReturnRate, setInflationRate,
       setRetirementState, setSavingsSurplusPct, setPreApplySnapshot, readOnly]);

  // Plan-screen signals strip (WI-1.2): calcSignals ranks nudges from values
  // computed ABOVE (one definition per number — it never recomputes):
  // extraMatch ← calcOptimizedAllocation, adjustedNetConversionBenefit ←
  // evaluateConversionPlan, budgetDeficit ← calcSavingsCapacity. The strip's
  // hard cap of 2 lives in calcSignals' default max. extraMatch is read as a
  // scalar so the memo deps stay honest (optimizedAllocation itself is a
  // fresh object per render).
  const extraMatch = optimizedAllocation.extraMatch;
  const signals = useMemo(() => calcSignals({
    extraMatch, adjustedNetConversionBenefit, budgetDeficit,
  }), [extraMatch, adjustedNetConversionBenefit, budgetDeficit]);

  // Year-by-year table rows (WI-2.5): the WHOLE life, accumulation + retirement.
  // Accumulation rows (buildAccumulationRows) are on the GROSS basis (BUG-35) with a
  // reconciling contrib/growth split; retirement rows (buildYearlyRows) carry the
  // walk's draw/tax/growth plus the RMD + conversion driver columns. age→year and
  // all per-row math live in the model (rule 10); the screen only formats.
  const currentYear = new Date().getFullYear();
  const yearlyRows = useMemo(() => [
    ...buildAccumulationRows({
      simData, currentAge, currentYear, safeRetAge,
    }),
    ...buildYearlyRows({
      rows: retirementWalk.rows, currentAge, currentYear,
      rmdByAge: rmdAmountByAge, conversionByAge: conversionAmountByAge,
    }),
  ], [simData, currentAge, currentYear, safeRetAge,
      retirementWalk, rmdAmountByAge, conversionAmountByAge]);

  // WI-2.2 (#92): Budget tab bundle — savings waterfall + allocation stack.
  // All values already computed above; memoized so horizonProps stays identity-stable (V9).
  // surplusFutureValue: FV of availableSurplus compounded to retirement — bridges the
  // Budget "save more now" message to the Accounts "what you'll have" number.
  const budgetView = useMemo(() => ({
    grossAfterTax,
    effectiveLiving,
    savingsCapacity,
    currentContribTotal,
    availableSurplus,
    optimizedAllocation,
    // Pre-computed for rule-10 compliance — no comparisons on financial values in src/horizon/:
    savingsCapacityPositive: savingsCapacity >= 0,
    surplusPositive: availableSurplus >= 0,
    hasDeficit: availableSurplus < 0,
    deficitAmount: Math.abs(availableSurplus),
    surplusFutureValue: availableSurplus > 0
      ? Math.round(fvAnnuity(availableSurplus, returnRate / 100, Math.max(0, safeRetAge - currentAge)))
      : 0,
    // Sum of optimized employee-side allocations — matches the opt* rows displayed in
    // the allocation stack so the footer total is consistent with the visible rows.
    optimizedContribTotal: optimizedAllocation.opt401k + optimizedAllocation.optRoth
      + optimizedAllocation.optHSA + optimizedAllocation.optTaxable,
    // WI-3.7 (surplus flow): whole-number-percent savings rates (15.3 means 15.3%,
    // one decimal, matching the codebase convention — see apply-preview.js fmtPercent).
    // null (never a fabricated rate) when there's no after-tax income to divide by.
    currentSavingsRatePct: grossAfterTax > 0
      ? Math.round((currentContribTotal / grossAfterTax) * 1000) / 10
      : null,
    optimizedSavingsRatePct: grossAfterTax > 0
      ? Math.round(((optimizedAllocation.opt401k + optimizedAllocation.optRoth
          + optimizedAllocation.optHSA + optimizedAllocation.optTaxable) / grossAfterTax) * 1000) / 10
      : null,
  }), [grossAfterTax, effectiveLiving, savingsCapacity, currentContribTotal,
       availableSurplus, optimizedAllocation, returnRate, safeRetAge, currentAge]);

  // WI-3.7: Apply-with-preview site for the optimized-allocation suggestion
  // (docs/ARCHITECTURE.md "Apply-with-preview contract"). `available` is pre-gated
  // App-side (there's extra to deploy, and it hasn't already been applied) — never
  // compared in the flow/modal. Both "current" and "candidate" run through the SAME
  // calcWhatIfDelta mechanism (deliberate anti-divergence property: a no-change
  // candidate can never show a spurious delta from a current/candidate mechanism
  // mismatch) — see buildSurplusPreview's module doc for why this is the blended
  // walk, not the per-account engine. `revert` is the first consumer of the Apply-
  // site contract's optional `revert` slot: an exact restore from preApplySnapshot,
  // so it doesn't need (and the modal never renders) a preview.
  const surplusApplySite = useMemo(() => {
    const available = optimizedAllocation.totalExtra > 0 && preApplySnapshot === null && !readOnly;
    if (!available) {
      return {
        available: false, preview: null,
        apply: guardWrite(applyAllocation, readOnly), revert: guardWrite(revertAllocation, readOnly),
        applied: preApplySnapshot !== null,
      };
    }
    // BUG-75 fix: no `moneyEvents` here — calcWhatIfDelta's param is scenario
    // ADDITIONS only (this site has none). Committed events already travel inside
    // whatIfBundle (simInputs.moneyEvents for the sim, retDrawShared.moneyEvents
    // for the walk); passing them again double-counted every committed
    // retirement-phase event in both previews' walks.
    const before = calcWhatIfDelta({ ...whatIfBundle });
    const after = calcWhatIfDelta({
      ...whatIfBundle,
      contribOverrides: {
        contrib401k: optimizedAllocation.opt401k,
        contribRoth: optimizedAllocation.optRoth,
        contribHSA: optimizedAllocation.optHSA,
        contribTaxable: optimizedAllocation.optTaxable,
      },
    });
    return {
      available: true,
      preview: buildSurplusPreview({
        current: {
          contribTotal: currentContribTotal, savingsRatePct: budgetView.currentSavingsRatePct,
          totalAtRet: before.scenarioTotalAtRet, yearsSustained: before.scenarioYears,
          depletionAge: before.scenarioDepletionAge,
        },
        candidate: {
          contribTotal: optimizedAllocation.opt401k + optimizedAllocation.optRoth
            + optimizedAllocation.optHSA + optimizedAllocation.optTaxable,
          savingsRatePct: budgetView.optimizedSavingsRatePct,
          totalAtRet: after.scenarioTotalAtRet, yearsSustained: after.scenarioYears,
          depletionAge: after.scenarioDepletionAge,
        },
        deployment: {
          totalExtra: optimizedAllocation.totalExtra, pct: savingsSurplusPct, availableSurplus,
        },
      }),
      apply: guardWrite(applyAllocation, readOnly),
      revert: guardWrite(revertAllocation, readOnly),
      applied: false, // preApplySnapshot is null here (we're in the `available` branch)
    };
  }, [optimizedAllocation, preApplySnapshot, applyAllocation, revertAllocation, whatIfBundle,
      currentContribTotal, budgetView, savingsSurplusPct, availableSurplus, readOnly]);

  // WI-3.7 (#104): Surplus-deployment flow bundle. Sibling of strategiesView keyed
  // by the "surplus" strategy id — the card face reads props.budget.* directly
  // (principle 11); this bundle carries only what the interactive flow needs beyond
  // that: a pre-labeled, pre-filtered (amount > 0) ordered allocation list mirroring
  // Classic's ①–⑤ IRS-priority breakdown, and the WI-3.9 Apply site.
  const surplusView = useMemo(() => ({
    availableSurplus,
    savingsSurplusPct,
    totalExtra: optimizedAllocation.totalExtra,
    deployLabel: `${savingsSurplusPct}% of ${fmt(availableSurplus)} surplus`,
    extraRows: [
      optimizedAllocation.extraMatch > 0 && {
        key: "match", label: "① Employer Match", amount: optimizedAllocation.extraMatch, sub: "free money",
      },
      optimizedAllocation.extraHSA > 0 && {
        key: "hsa", label: "② HSA", amount: optimizedAllocation.extraHSA, sub: "triple tax-free",
      },
      optimizedAllocation.extraRoth > 0 && {
        key: "roth", label: "③ Roth IRA", amount: optimizedAllocation.extraRoth, sub: "tax-free growth",
      },
      (optimizedAllocation.extra401k - (optimizedAllocation.extraMatch || 0)) > 0 && {
        key: "401k", label: "④ 401k",
        amount: optimizedAllocation.extra401k - (optimizedAllocation.extraMatch || 0),
        sub: "pre-tax deduction",
      },
      optimizedAllocation.extraTaxable > 0 && {
        key: "taxable", label: "⑤ Taxable", amount: optimizedAllocation.extraTaxable, sub: "overflow",
      },
    ].filter(Boolean),
    optRows: [
      { key: "401k", label: "401k", amount: optimizedAllocation.opt401k },
      { key: "roth", label: "Roth IRA", amount: optimizedAllocation.optRoth },
      { key: "hsa", label: "HSA", amount: optimizedAllocation.optHSA },
      { key: "taxable", label: "Taxable", amount: optimizedAllocation.optTaxable },
    ].filter(r => r.amount > 0),
    applyAllocation: surplusApplySite,
  }), [availableSurplus, savingsSurplusPct, optimizedAllocation, surplusApplySite]);

  // WI-3.7 (#105): Mega-backdoor Roth flow bundle. Sibling of strategiesView keyed
  // by the "mega" strategy id — capacityRows is a pre-labeled breakdown of the
  // 415(c) headroom math (limit − employee deferral − employer match), mirroring
  // Classic's mega-backdoor panel exactly.
  const megaView = useMemo(() => ({
    capacity: megaCapacity,
    limit415c,
    employeeDeferral: contrib401k,
    employerMatchAmt,
    capacityRows: [
      { label: "415(c) annual limit", val: limit415c },
      { label: "Your 401k deferral", val: contrib401k },
      { label: "Employer match", val: employerMatchAmt },
      { label: "After-tax space", val: megaCapacity, isTotal: true },
    ],
    growth: megaGrowth,
    usesCatchupLimit: currentAge >= CATCHUP_AGE,
  }), [megaCapacity, limit415c, contrib401k, employerMatchAmt, megaGrowth, currentAge]);

  // WI-2.4 (#94): Taxes tab bundle — phase rates + lifetime composition.
  // fedEffRate (calcTaxBasis) = effective federal rate.
  // projRetBracketPct (projectRetirementBracket) = projected retirement bracket.
  // rmdTaxBite + effectiveRMDTaxRate + convTaxTotal all from the engine (retPhase) —
  // one source for the retirement-phase tax composition (BUG-35).
  // Memoized so horizonProps stays identity-stable (V9).
  const taxViewBundle = useMemo(() => {
    // Retirement-phase tax composition — RMD + conversion + extra-401k-draw tax
    // (all lifetime totals from the ONE engine; BUG-40 added the draw segment).
    // Working-year tax is excluded: fedTax is one year, not a lifetime figure,
    // so mixing it here would distort the bar. Computed ONCE here (rule 10).
    // Segments carry their own dollar val + integer pct; bar widths are layout math.
    const rmdTax  = rmdTaxBite ?? 0;
    const convTax = retPhase.conversionCost ?? 0;
    const drawTax = retPhase.totalDrawTax ?? 0;
    const total   = rmdTax + convTax + drawTax;
    const rawSegs = [
      { label: "RMD tax",        val: rmdTax,  key: "rmd" },
      { label: "Conversion tax", val: convTax, key: "conv" },
      { label: "401k draw tax",  val: drawTax, key: "draw" },
    ];
    const segments = total > 0
      ? rawSegs.filter(s => s.val > 0).map(s => ({
          label: s.label, val: s.val, key: s.key,
          pct: Math.round((s.val / total) * 100),
        }))
      : [];
    return {
      // Working-year fields (AGI derivation + rate card for Taxes tab section 1)
      householdIncome, agi, safeDeduc, stateTax, fica,
      combinedEffRate,
      // "Your 401k + HSA saves you ~$X in federal tax this year" callout
      taxSaveFromPreTax: Math.round((contrib401k + contribHSA) * fedMarginal),
      // Rate columns
      fedMarginal,
      fedEffective: fedEffRate,
      // Retirement-phase fields (section 2)
      effectiveRMDTaxRate,
      projectedRetBracket: projRetBracketPct / 100,   // normalized to decimal (was whole-number — BUG display fix)
      rmdTaxBite,
      convTaxTotal: retPhase.conversionCost,
      composition: { segments, total },
      // Conversion breakdown — always surfaced so the Taxes tab can show the
      // honest verdict (positive OR negative) with a cost breakdown. Fields come
      // from the same evaluateConversionPlan call that produces netConversionBenefit
      // (BUG-31 guarantee: one model, one display).
      conversionDetail: {
        rmdTaxSaved,
        conversionCost: retPhase.conversionCost,
        irmaaCost: totalIRMAACost,
        acaLoss: acaAnnualLoss,
        adjustedNetConversionBenefit,
        // Pre-computed for rule-10 compliance — no comparisons on financial values in src/horizon/:
        isPositive: (adjustedNetConversionBenefit ?? 0) >= 0,
        benefitAbs: Math.abs(adjustedNetConversionBenefit ?? 0),
      },
    };
  }, [fedMarginal, fedEffRate, effectiveRMDTaxRate, projRetBracketPct,
      rmdTaxBite, retPhase,
      householdIncome, agi, safeDeduc, stateTax, fica, combinedEffRate,
      contrib401k, contribHSA,
      rmdTaxSaved, totalIRMAACost, acaAnnualLoss, adjustedNetConversionBenefit]);

  // V9: markerByAge and tablePhases memoized separately so they don't cause
  // horizonProps to re-reference on unrelated dep changes.
  const markerByAge = useMemo(() => [
    [safeRetAge, "Retire"],
    [RMD_START_AGE, "RMD start"],
    includeSS && ssClaimingAge > safeRetAge ? [ssClaimingAge, "SS claimed"] : null,
    conversionWindowYrs > 0 ? [resolvedEndAge, "Conv. window closes"] : null,
    depletionAge != null ? [depletionAge, "Portfolio depleted"] : null,
  ].filter(Boolean).reduce((acc, [age, label]) => {
    acc[age] = acc[age] ? `${acc[age]} · ${label}` : label;
    return acc;
  }, {}), [safeRetAge, includeSS, ssClaimingAge, conversionWindowYrs, resolvedEndAge, depletionAge]);

  const tablePhases = useMemo(() => ({
    accumYears: safeRetAge - currentAge,
    conversionYears: conversionWindowYrs,
    retirementYears: Number.isFinite(yearsSustained)
      ? Math.min(Math.round(yearsSustained), safeLifeExp - safeRetAge)
      : safeLifeExp - safeRetAge,
  }), [safeRetAge, currentAge, conversionWindowYrs, yearsSustained, safeLifeExp]);

  // WI-3.3 (#100): Strategies screen — per-card applicability flags + the scalars
  // not already on horizonProps. Cards whose headline is ALREADY wired read it
  // directly in the screen (props.netConversionBenefit, props.yr1TaxSavings,
  // props.budget.{availableSurplus,optimizedAllocation}) — one number, one source
  // (principle 11). All `applicable` booleans and the comparisons behind them are
  // computed HERE, never in JSX (rule 10). firstRMDAmount/Age are pre-extracted
  // behind the same guard App uses (firstRMD may be undefined → null), so the
  // screen never dereferences firstRMD.rmd.
  // Forward contract (docs/ARCHITECTURE.md): the interactive flow bundles
  // ssView / rmdView / conversionView attach in WI-3.4–3.7 as SIBLING horizonProps
  // fields keyed by the same strategy id; strategiesView[id] stays a thin
  // card-face/applicability index and reads the same source vars the flow bundles
  // will, so the two surfaces can never diverge as the catalogue scales (SP-1).
  const strategiesView = useMemo(() => ({
    // applicable flags only; each card reads its headline from the bundle that
    // owns the number — conversion → taxView.conversionDetail, withdrawal →
    // withdrawalView, surplus → budget, ss → ssView, rmd → rmdView, mega → megaView
    // (siblings keyed by the same id). One number, one source (principle 11).
    conversion: { applicable: conversionWindowYrs > 0 },
    rmd:        { applicable: !!firstRMD },
    ss:         { applicable: includeSS },
    withdrawal: { applicable: true },
    // > 0 (has surplus to deploy), deliberately stricter than budgetView's
    // surplusPositive (>= 0 = "not a deficit"): a $0 surplus = nothing to deploy.
    surplus:    { applicable: availableSurplus > 0 },
    mega:       { applicable: megaCapacity > 0 },
  }), [conversionWindowYrs, firstRMD, includeSS, availableSurplus, megaCapacity]);

  // WI-3.4 (#101): Social Security timing flow bundle. Sibling of strategiesView
  // keyed by the "ss" strategy id (forward contract in docs/ARCHITECTURE.md). All
  // display scalars the SS card face + flow need, computed here (rule 10 — the
  // coverage %s and the override-aware monthly/annual mirror the Classic SS panel
  // exactly). householdSS / withdrawalRate / effectivePension / effectiveExpenses
  // are read directly from horizonProps by the flow (already wired — no dup).
  const ssView = useMemo(() => ({
    ssMonthly:    ssOverride !== null ? Math.round(ssOverride / ASSUMPTIONS.MONTHS_PER_YEAR) : ssMonthlyBenefit,
    ssAnnual:     effectiveSS > 0 ? effectiveSS : ssAnnualBenefit,
    ssEstimateAnnual: ssAnnualBenefit,   // the PIA estimate (override seed / "estimated was")
    ssAIME,
    claimAge:     ssClaimingAge,
    // Age labels precomputed in the model so the screen does no FRA age-comparison
    // (rule 10 / principle 8). claimAgeFmt stays in the screen ONLY as the editable
    // claim-age field's live formatter.
    claimAgeLabel: ssClaimingAge === SS_FRA ? `age ${ssClaimingAge} (FRA)`
                 : ssClaimingAge < SS_FRA ? `age ${ssClaimingAge} (early)` : `age ${ssClaimingAge} (delayed)`,
    breakEven:    ssBreakEven,           // null when no crossover within the horizon → "—"
    breakEvenContext: ssClaimingAge < SS_FRA ? "when FRA catches up"
                    : ssClaimingAge > SS_FRA ? "when delay pays off" : "claiming at FRA",
    ssCoveragePct: effectiveExpenses > 0 ? Math.round((effectiveSS / effectiveExpenses) * 100) : null,
    // Delay-to-70 impact (gated exactly as Classic: only when delaying still helps)
    delayApplicable:  ss70DrawReduction > 0 && includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE,
    delayGapYrs:  Math.max(0, SS_MAX_CLAIM_AGE - ssClaimingAge),   // years until age 70 (model-side, not JSX age math)
    ss70DrawReduction,
    wr70,
    delayGainYrs: ssDelayGainYrs,        // null when delay-to-70 is not applicable → "—"
    // Spouse (rendered only when isMarried, read from the ss bundle)
    spouseSsBenefit,
    spouseAlt, spouseAltHigher,
    householdSSMonthly: Math.round(householdSS / ASSUMPTIONS.MONTHS_PER_YEAR),  // monthly split in the model (rule 10), not householdSS/12 in JSX
    householdCoveragePct: effectiveExpenses > 0 ? Math.round((householdSS / effectiveExpenses) * 100) : null,
    // Pension applicability (a DERIVED value → the flag travels with the data, not a
    // `> 0` comparison in JSX); effectivePension itself is read directly for display.
    showEffectivePension: effectivePension > 0,
  }), [ssOverride, ssMonthlyBenefit, effectiveSS, ssAnnualBenefit, ssAIME, ssClaimingAge,
       ssBreakEven, effectiveExpenses, ss70DrawReduction, includeSS, wr70, ssDelayGainYrs,
       spouseSsBenefit, spouseAlt, spouseAltHigher, householdSS, effectivePension]);

  // WI-3.5 (#102): RMD outlook flow bundle. Sibling keyed by "rmd". firstRMD*
  // pre-extracted behind the same guard App uses (firstRMD may be undefined →
  // null) so the screen never derefs firstRMD.rmd. rows = the ONE engine schedule
  // (retPhase.rmdSchedule), already display-ready ({age,rmd,bal,divisor,tax}).
  const rmdView = useMemo(() => ({
    firstRMDAmount: firstRMD ? firstRMD.rmd : null,
    firstRMDAge:    firstRMD ? firstRMD.age : null,
    totalRMDs,
    rmdTaxBite,
    effectiveRMDTaxRate,
    // Preformatted so the screen never multiplies a model rate by 100 (rule 10).
    effectiveRMDTaxRateLabel: `${(effectiveRMDTaxRate * 100).toFixed(1)}%`,
    rows:        rmdData,                 // {age,rmd,bal,divisor,tax}[] — screen renders first 10
    rowCount:    rmdData.length,
    retAtOrAfterRMD: safeRetAge >= RMD_START_AGE,   // RMDs begin at retirement → no countdown stats
    activeTableLabel,                                // "Table II (Joint Life)" / "Table III (Uniform Lifetime)"
    qualifiesTable2: useTable2,
    spouseAgeGap:    currentAge - spouseCurrentAge, // meaningful only when isMarried (the flow gates it)
  }), [firstRMD, totalRMDs, rmdTaxBite, effectiveRMDTaxRate, rmdData, safeRetAge,
       activeTableLabel, useTable2, currentAge, spouseCurrentAge]);

  // WI-3.6 (#103): Roth-conversion planner flow bundle. Sibling of strategiesView
  // keyed by the "conversion" strategy id (same forward contract as ssView/rmdView
  // above). Carries ONLY what no existing bundle already owns (principle 11):
  //   - mode / bracketTarget / amount / taxSource stay in the `conversion` setter
  //     bundle (conversionBundle, above) — this flow reads/writes them there.
  //   - the healthcare ON/OFF toggles stay in the `health` bundle — this flow only
  //     carries the DERIVED healthcare detail (cliff ages, IRMAA rows, thresholds).
  //   - the verdict AND its components (rmdTaxSaved, conversionCost, irmaaCost,
  //     acaLoss, adjustedNetConversionBenefit, isPositive) stay in
  //     taxView.conversionDetail — the flow's healthcare strip reads them there,
  //     the SAME source the Taxes tab and the Strategies card face already read
  //     (one number, one source — ARCHITECTURE.md's strategiesView note forbids
  //     re-exposing adjustedNetConversionBenefit here even though an earlier
  //     roadmap draft listed it; we side with ARCHITECTURE).
  //   - netConversionBenefit is already a top-level horizonProps field — not
  //     duplicated here (only `outcome.netIsPositive`, a NEW sign flag, is new).
  // events.rows are APP-BUILT row objects (id/ageField/amountField/estTaxLabel/
  // remove), not a raw array + setter: a raw setConversionEvents handed to the
  // screen would be a write surface WI-5.2's readOnly wrapper can't see, and the
  // map/filter/clamp logic the Classic panel (ConversionEventsPanel.jsx) does
  // inline would become data transformation in JSX (rule 10). One wrappable
  // write path per field, built here where setConversionEvents lives.
  const conversionView = useMemo(() => ({
    window: {
      hasConvWindow,
      startAge: resolvedStartAge, endAge: resolvedEndAge, windowYrs: conversionWindowYrs,
      windowLabel: `${conversionWindowYrs}-year window · age ${resolvedStartAge} → ${resolvedEndAge}`,
      startAgeField: {
        value: resolvedStartAge,
        set: guardWrite(v => setConversionStartAge(Math.min(v, resolvedEndAge)), readOnly),
        min: convWindowFloor, max: convWindowCeil, step: 1,
      },
      endAgeField: {
        value: resolvedEndAge,
        set: guardWrite(v => setConversionEndAge(Math.max(v, resolvedStartAge)), readOnly),
        min: convWindowFloor, max: convWindowCeil, step: 1,
      },
      isDefaultWindow: conversionStartAge === null && conversionEndAge === null,
    },
    targets: {
      convSteadyTarget, convPeakTarget, targetsVary,
      // Peak → steady order, matching Classic's "Suggested annual conversion" note
      // (App.jsx ~3090) — this reflects the bracket-fill computation itself
      // (mode-independent), unlike outcome.annualConversionLabel below.
      bracketFillLabel: targetsVary
        ? `${fmt(convPeakTarget)} → ${fmt(convSteadyTarget)}`
        : fmt(bracketFillConversion),
      assumesPension: effectivePension > 0,
    },
    outcome: {
      // Mode-gated (mirrors Classic's stat-row value, App.jsx ~3147): what the
      // engine is ACTUALLY converting right now, not the bracket suggestion.
      annualConversionLabel: convTargetVaries
        ? `${fmt(convPeakTarget)} → ${fmt(convSteadyTarget)}`
        : fmt(annualConversion),
      netIsPositive: netConversionBenefit >= 0,
      rothBalEndConv: conversionSim.rothBalEnd_conv,
      rothBalEndTax: conversionSim.rothBalEnd_tax,
      rothAdvantage: conversionSim.rothAdvantage,
      showTaxSourceComparison: conversionSim.rothAdvantage > 0,
    },
    healthcare: {
      cliffAges: acaCliffYears.map(e => e.age),
      cliffCount: acaCliffYears.length,
      cliffThreshold: acaCliffThreshold(householdSize),
      acaAnnualLoss,
      showAcaWarning: hasMarketplaceInsurance && acaCliffYears.length > 0,
      // A cliff can be CROSSED (showAcaWarning) yet carry a $0 loss when the
      // marketplace premium is left unset — Classic gates the loss clause + the
      // adjusted-net strip on acaAnnualLoss > 0 so it never prints "$0 lost" /
      // "−$0" as if it were a real zero. Pre-computed here (rule 10).
      hasAcaLoss: acaAnnualLoss > 0,
      showNoCliffNote: hasMarketplaceInsurance && safeRetAge < MEDICARE_AGE && acaCliffYears.length === 0,
      irmaaCost: totalIRMAACost,
      irmaaRows: healthcareExposure
        .filter(e => (e.irmaa?.surcharge ?? 0) > 0)
        .map(e => ({ age: e.age, cost: e.irmaa.surcharge * personOnMedicare })),
      showIrmaa: hasMedicare && totalIRMAACost > 0,
      // The adjusted-net-benefit strip only means something when a real cost
      // applies — matches Classic's `totalIRMAACost > 0 || acaAnnualLoss > 0`.
      showAdjustedStrip: (hasMedicare && totalIRMAACost > 0) || acaAnnualLoss > 0,
    },
    tables: {
      simYears: conversionSim.years,               // {age,conversion,tradBal,tax}[] — flow slices first 12
      rmdCompare: buildRmdComparison(retPhase.rmdScheduleNoConv, retPhase.rmdSchedule), // flow slices first 8
    },
    events: {
      rows: conversionEvents.map(ev => ({
        id: ev.id,
        ageField: {
          value: ev.age,
          // Clamp-in-setter (simpler than Classic's free-type-then-blur-clamp —
          // a single field-object write path, per the header note above).
          set: guardWrite(v => {
            const n = Number(v);
            const clamped = Number.isFinite(n)
              ? Math.min(safeRetAge - 1, Math.max(currentAge + 1, n))
              : currentAge + 1;
            setConversionEvents(evs => evs.map(e => e.id === ev.id ? { ...e, age: clamped } : e));
          }, readOnly),
          min: currentAge + 1, max: safeRetAge - 1, step: 1,
        },
        amountField: {
          value: ev.amount,
          set: guardWrite(v => {
            const n = Number(v);
            const amt = Number.isFinite(n) ? Math.max(0, n) : 0;
            setConversionEvents(evs => evs.map(e => e.id === ev.id ? { ...e, amount: amt } : e));
          }, readOnly),
          min: 0, step: 5_000,
        },
        estTaxLabel: convEventTaxByAge[ev.age] != null && ev.amount > 0
          ? `est. tax ${fmt(convEventTaxByAge[ev.age])} this year`
          : "401k → Roth, taxed as income",
        remove: guardWrite(() => setConversionEvents(evs => evs.filter(e => e.id !== ev.id)), readOnly),
      })),
      add: guardWrite(() => {
        if (conversionEvents.length >= MAX_CONVERSION_EVENTS) return;
        // Mirrors ConversionEventsPanel's emptyEvent: default to a year mid-career,
        // clamped inside the working window.
        const mid = Math.round((currentAge + safeRetAge) / 2);
        const age = Math.min(Math.max(currentAge + 1, mid), Math.max(currentAge + 1, safeRetAge - 1));
        setConversionEvents(evs => [...evs, { id: Date.now() + Math.random(), age, amount: 0 }]);
      }, readOnly),
      atMax: conversionEvents.length >= MAX_CONVERSION_EVENTS,
      inServiceField: { value: conversionInService, set: guardWrite(setConversionInService, readOnly) },
      hasWorkingYears: currentAge + 1 <= safeRetAge - 1,
      totalPlannedLabel: fmt(conversionEvents.reduce(
        (s, e) => s + (Number.isFinite(e.amount) ? Math.max(0, e.amount) : 0), 0)),
    },
    optimizer: {
      suggestedAmount: optimizerResult?.optimalConversion ?? null,
      suggestedStartAge: optimizerResult?.optimalStartAge ?? null,
      suggestedBenefit: optimizerResult?.optimalBenefit ?? null,
      currentAmountLabel: fmt(annualConversion),
      currentStartAge: resolvedStartAge,
      applySuggestion: conversionApplySite,
    },
  }), [hasConvWindow, resolvedStartAge, resolvedEndAge, conversionWindowYrs,
       setConversionStartAge, setConversionEndAge, convWindowFloor, convWindowCeil,
       conversionStartAge, conversionEndAge,
       convSteadyTarget, convPeakTarget, targetsVary, bracketFillConversion, effectivePension,
       convTargetVaries, annualConversion, netConversionBenefit, conversionSim,
       acaCliffYears, householdSize, acaAnnualLoss, hasMarketplaceInsurance, safeRetAge,
       totalIRMAACost, healthcareExposure, personOnMedicare, hasMedicare,
       retPhase, conversionEvents, convEventTaxByAge, setConversionEvents, currentAge,
       conversionInService, setConversionInService,
       optimizerResult, conversionApplySite, readOnly]);

  // Life-event sheet bounds (rule 10: the age math lives here, not in the sheet).
  // Events can land on any year from next year through the plan (life-expectancy)
  // age. Memoized separately (V9).
  const lifeEventBounds = useMemo(() => ({
    minAge: currentAge + 1,
    maxAge: safeLifeExp,
    retirementAge: safeRetAge,
    // Projected salary by age (0 past retirement) — the LifeEventSheet's "usual
    // pay" seed/hint for a new working-year duration event (rule 10: the growth
    // projection lives here, not in the sheet).
    projectedIncomeByAge: buildProjectedIncomeByAge({
      currentIncome, incomeGrowth, incomeGrowthEndAge,
      currentAge, retirementAge: safeRetAge,
      minAge: currentAge + 1, maxAge: safeLifeExp,
    }),
  }), [currentAge, safeLifeExp, safeRetAge, currentIncome, incomeGrowth, incomeGrowthEndAge]);

  // BUG-73: the labeled comfortable/tight/unaffordable ranges (rule 10 — the
  // rail legend caption comes from here, never a hardcoded "5" or "90" in a
  // screen). Memoized separately (V9) since it's a small, independently-stable
  // slice of horizonProps.
  const verdictLegend = useMemo(() => buildVerdictLegend(safeLifeExp), [safeLifeExp]);

  // Props bundle for HorizonShell — display values only (plus the two write-back
  // hooks). Memoized (V9): every field is itself stable (state, memo, or scalar),
  // so the bundle reference only changes when an input actually changes.
  const horizonProps = useMemo(() => ({
    chartData: totalChartData,
    currentAge, retirementAge, lifeExpect,
    totalAtRet, yearsSustained, isSustainable,
    takeHome, effectiveExpenses, withdrawalRate,
    balAt90, contribSeries,
    householdSS, effectivePension, activity, setActivity: guardWrite(setActivity, readOnly),
    currentIncome,
    fedTax, ficaTotal: fica, stateTaxAmt: stateTax,
    currentContribTotal,
    retVals, simData,
    netConversionBenefit, yr1TaxSavings,
    // Sum of all current account balances — used by onboarding "savings today" field
    currentTotalSaved: bal401k + balRoth + balTaxable + balHSA,
    // After-tax spendable reference (display-only; never a formula input — BUG-35).
    // Haircuts the gross Trad 401k at the retirement effective rate; Roth/HSA/Taxable
    // are already net. Used by the Accounts tab "gross vs spendable" headline.
    spendableAtRet,
    // Batch A additions:
    moneyEvents,
    // Wrapped write surface (list-mutation callbacks) — see the definitions above
    // for why this replaced a raw setMoneyEvents (docs/ARCHITECTURE.md write-surface
    // convention: no bundle exposes a raw setter).
    saveEvent: guardWrite(saveEvent, readOnly), removeEvent: guardWrite(removeEvent, readOnly),
    whatIfSimInputs: whatIfBundle,
    commitPlan: guardWrite(commitPlan, readOnly),
    // Plan screen "Try a change" panel (2026-07-11 redesign): the ONLY write path
    // from a Horizon lever preview back to real state — always called from
    // ApplyPreviewModal's onConfirm, never directly by a slider (preview-first).
    applyPlanLevers: guardWrite(applyPlanLevers, readOnly),
    retirementWalk,
    // Life-event sheet (sheet-first placement): age bounds for the sheet's
    // sliders — memoized separately above (V9). The sheet's verdict/impact come
    // from evaluateLifeEvent (what-if.js) called with whatIfSimInputs.
    lifeEventBounds,
    // WI-0.1 display bundles (shapes documented at their model functions):
    statementView,    // calcStatementView — pcts null when no income
    chartMilestones,  // calcChartMilestones — { rows, peakTotal }
    planView,         // calcPlanProgress + drivers (calcPlanDrivers, WI-1.1)
    yearlyRows,       // buildYearlyRows — walk rows + calendar year
    // WI-1.2: ranked Plan-screen signals (calcSignals — ≤2, dollars-desc,
    // each with a {screen, subView} deep-link target). Empty array = no strip.
    signals,
    // WI-2.1 (#91): Journey screen fields.
    // flowDown: full calcFlowDown result — raw object, no picking here (rule 10).
    // conversionWindowYrs / rmdStartAge are scalars already computed above.
    // effectivePension already added above (also used in Journey ch. 3).
    flowDown: flowData,            // calcFlowDown — all ~20 waterfall fields
    conversionWindowYrs,           // scalar — > 0 when a Roth window exists
    rmdStartAge: RMD_START_AGE,    // from irs-2026.js — never hardcode in screens
    // WI-2.2 (#92): Budget tab — savings waterfall + allocation stack.
    // Memoized separately as budgetView (V9) so this object reference is stable.
    budget: budgetView,
    // WI-2.4 (#94): Taxes tab — phase rates + lifetime composition.
    // Memoized separately as taxViewBundle (V9) so this object reference is stable.
    taxView: taxViewBundle,
    // WI-3.3 (#100): Strategies screen — applicability flags + not-yet-wired card
    // scalars (memoized separately for V9). Cards whose headline is already wired
    // read it directly: netConversionBenefit / yr1TaxSavings (above) and budget.*.
    strategiesView,
    // WI-3.4 (#101) / WI-3.5 (#102) / WI-3.6 (#103) / WI-3.7 (#104/#105): interactive
    // flow bundles, siblings of strategiesView keyed by strategy id. Memoized
    // separately above (V9).
    ssView,
    rmdView,
    conversionView,
    withdrawalView,
    surplusView,
    megaView,
    // Raw return-rate assumption (a user input, not a derived number) — Numbers footnote.
    returnRate,
    // Session-3 additions: SS timing + lifecycle markers + phase boxes for Year by year.
    ssClaimingAge,
    includeSS,
    // markerByAge and tablePhases: memoized separately above (V9).
    markerByAge,
    tablePhases,
    // Session-4: per-account breakdown + milestone badges for Year-by-year deep layer.
    retirementRowByAge,   // { [age]: engineRow } — Trad/Roth/Taxable/HSA + tax breakdown
    milestoneByAge,       // { [age]: tag } — inline portfolio-cell milestone badge
    // Pre-computed display scalars and slider bounds (rule 10: math in model, not screen).
    // monthlySpend/sliderBounds seed + bound the Plan screen's "Try a change" sliders;
    // the per-lever flat setters (setAnnualExpenses, setContrib401k, etc.) that used
    // to live here were removed with the QuickTunePanel (2026-07-11) — real-state
    // writes now go through the single applyPlanLevers path above.
    monthlySpend,
    sliderBounds,
    // BUG-73: labeled comfortable/tight/unaffordable ranges for the Plan/Ideas/
    // LifeEventSheet verdict rail legends — memoized separately above (V9).
    verdictLegend,
    // Conditional slider flags.
    isMarried,
    // Committed plan snapshot — null until the user has saved a plan at least once
    // (onboarding's done screen, or Plan/Ideas "Save as my plan").
    committedPlan,
    // Plan screen "command center" additions — hero block + income meter.
    planHighlights,
    // WI-3.1 (#98): topic-grouped setter bundles (shapes in docs/ARCHITECTURE.md).
    // Each is memoized separately above (V9 stability). The plumbing for all of
    // Level 3 — no screen consumes them yet.
    profile: profileBundle,
    spending: spendingBundle,
    accounts: accountsBundle,
    ss: ssBundle,
    pension: pensionBundle,
    conversion: conversionBundle,
    health: healthBundle,
    assumptions: assumptionsBundle,
    // WI-5.2 (#113): entitlements bundle ({isPremium, readOnly}) — see
    // readEntitlements/guardWrite above. Every write surface in this object has
    // already been guarded at its construction site (bundles, apply sites,
    // conversionView) so screens never need to test entitlements themselves.
    entitlements,
  }), [totalChartData, currentAge, retirementAge, lifeExpect,
       totalAtRet, yearsSustained, isSustainable,
       takeHome, effectiveExpenses, withdrawalRate,
       balAt90, contribSeries, householdSS, effectivePension, activity, setActivity,
       currentIncome, fedTax, fica, stateTax, currentContribTotal,
       retVals, simData, netConversionBenefit, yr1TaxSavings,
       bal401k, balRoth, balTaxable, balHSA, spendableAtRet,
       moneyEvents, saveEvent, removeEvent, whatIfBundle, commitPlan, applyPlanLevers, retirementWalk,
       lifeEventBounds,
       statementView, chartMilestones, planView, yearlyRows, signals,
       flowData, conversionWindowYrs,
       // WI-2.2 / WI-2.4 bundles (memoized separately for V9 stability):
       budgetView, taxViewBundle,
       // WI-3.3 strategies bundle (memoized separately for V9 stability):
       strategiesView,
       // WI-3.4 / WI-3.5 / WI-3.6 / WI-3.7 flow bundles (memoized separately for V9 stability):
       ssView, rmdView, conversionView, withdrawalView, surplusView, megaView,
       returnRate,
       // Session-3 additions:
       ssClaimingAge, includeSS,
       markerByAge, tablePhases,
       // Session-4 additions:
       retirementRowByAge, milestoneByAge,
       isMarried, committedPlan,
       planHighlights,
       monthlySpend, sliderBounds,
       // BUG-73: verdict legend (memoized separately above):
       verdictLegend,
       // WI-3.1 setter bundles (each memoized separately above):
       profileBundle, spendingBundle, accountsBundle, ssBundle, pensionBundle,
       conversionBundle, healthBundle, assumptionsBundle,
       // WI-5.2 (#113): entitlements gate every write surface above.
       readOnly, entitlements]);

  // Stable handler (V9): keeps HorizonShell's props identity-stable across
  // no-op re-renders so the referential-stability smoke test can assert it.
  const onShowClassic = useCallback(() => setShowHorizon(false), [setShowHorizon]);

  if (showHorizon) {
    return (
      <HorizonThemeProvider>
        <HorizonShell {...horizonProps} onShowClassic={onShowClassic} />
        <Analytics />
      </HorizonThemeProvider>
    );
  }

  return (
    <div className="page-wrap" style={{ background: C.bg, minHeight: "100vh", color: C.text,
      fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { height: 4px; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #21262d; border-radius: 3px; }
        .income-grid      { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
        .page-wrap        { padding: 24px; }
        .h1-title         { font-size: 26px; }
        .breakdown-panel  { background: #0d1117; border-radius: 8px; padding: 14px 16px; }
        .breakdown-row    { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
        .breakdown-row span:first-child { font-size: 11px; }
        .breakdown-row span:last-child  { font-size: 13px; }
        .rate-stat-val    { font-size: 18px; margin: 0 0 3px; }
        .breakdown-note   { display: block; }
        .input-groups     { display: flex; flex-direction: column; gap: 18px; }
        .tab-bar          { display: flex; gap: 4px; border-bottom: 1px solid #21262d; margin-bottom: 24px; }
        .tab-btn          { padding: 8px 20px; font-size: 13px; font-weight: 600; border: none; cursor: pointer;
                            border-radius: 6px 6px 0 0; background: transparent; letter-spacing: 0.03em;
                            font-family: 'DM Sans', system-ui, sans-serif; transition: background 0.15s; }
        .tab-btn:hover    { background: #21262d; }
        .det-2col     { display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
        .det-stat-3   { display: grid; grid-template-columns: 1fr 1fr 1fr; }
        .det-stat-4   { display: grid; grid-template-columns: repeat(4, 1fr); }
        .det-rmd-ctrl { display: grid; grid-template-columns: 1fr 1fr 1fr; }
        @media (max-width: 600px) {
          .income-grid     { grid-template-columns: 1fr; gap: 16px; }
          .page-wrap       { padding: 12px; }
          .h1-title        { font-size: 19px; }
          .breakdown-panel { padding: 10px 12px; }
          .breakdown-row   { margin-bottom: 5px; }
          .breakdown-row span:first-child { font-size: 10px; }
          .breakdown-row span:last-child  { font-size: 12px; }
          .rate-stat-val   { font-size: 14px; }
          .breakdown-note  { display: none; }
          .input-groups    { gap: 12px; }
          .det-2col        { grid-template-columns: 1fr; }
          .det-stat-3      { grid-template-columns: 1fr 1fr; }
          .det-stat-4      { grid-template-columns: 1fr 1fr; }
          .det-rmd-ctrl    { grid-template-columns: 1fr; }
          .fd-compare-grid { grid-template-columns: 1fr 80px 80px !important; }
          .fd-compare-grid > *:first-child { font-size: 10px !important; }
          .fd-wf-step      { flex-direction: column !important; align-items: flex-start !important; gap: 2px !important; }
          .fd-wf-step > div:first-child { width: auto !important; text-align: left !important; }
          .fd-wf-step > div:last-child  { width: 100% !important; }
          .fd-action-vs    { grid-template-columns: 1fr !important; gap: 6px !important; }
          .fd-action-vs > span { display: none; }
          .fd-outcome-stats { gap: 10px !important; }
          .fd-outcome-stats > div { padding: 4px 8px !important; }
          .fd-header-stats  { gap: 12px !important; flex-wrap: wrap; justify-content: center !important; }
          .fd-header-top    { flex-direction: column !important; gap: 8px !important; }
        }
      `}</style>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 className="h1-title" style={{ margin: 0, fontWeight: 700, color: C.text }}>
              Retirement Account Modeler
            </h1>
            <span style={{ fontSize: 12, color: C.gold, ...mono, background: "#d4a84320", padding: "2px 8px", borderRadius: 4 }}>
              2026 Tax Year
            </span>
          </div>
          <button onClick={() => setShowHorizon(true)} style={{
            fontSize: 11, color: C.muted, background: "transparent",
            border: `1px solid #21262d`, borderRadius: 6, padding: "4px 10px", cursor: "pointer",
          }}>✦ Horizon view</button>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
          Compare after-tax outcomes across retirement vehicles. All inputs update in real time.
        </p>
      </div>

      <div className="tab-bar">
        {[
          { id: "planner",  label: "Simple Planner" },
          { id: "detailed", label: "Detailed Planner" },
          { id: "flowdown", label: "Flow-Down" },
        ].map(({ id, label }) => (
          <button key={id} className="tab-btn" onClick={() => setActiveTab(id)} style={{
            color:        activeTab === id ? C.gold   : C.muted,
            borderBottom: activeTab === id ? `2px solid ${C.gold}` : "2px solid transparent",
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {activeTab === "planner" && (
      <>
      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 16 }}>Current Income</h3>
        <div className="income-grid">
          <div className="input-groups">
            <div>
              <p style={{ margin: "0 0 10px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                Income
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Slider label="Gross Income" value={currentIncome} min={20_000} max={500_000} step={5_000}
                  format={v => fmtFull(v)} onChange={setCurrentIncome} />
                <Slider label="Income Growth / yr" value={incomeGrowth} min={0} max={15} step={0.5}
                  format={v => `${v}%`} onChange={setIncomeGrowth} valueColor={C.purple} />
                {incomeGrowth > 0 && (
                  <Slider
                    label="Income plateau age"
                    value={incomeGrowthEndAge ?? safeRetAge}
                    min={currentAge + 1}
                    max={safeRetAge}
                    step={1}
                    format={v => v >= safeRetAge ? "None" : `Age ${v}`}
                    onChange={v => setIncomeGrowthEndAge(v >= safeRetAge ? null : v)}
                    valueColor={incomeGrowthEndAge != null ? C.orange : C.muted}
                  />
                )}
                <div style={{ fontSize: 10, color: C.muted, paddingLeft: 2, marginTop: -4 }}>
                  {"Projected at retirement: "}
                  <span style={{ color: incomeGrowthEndAge != null ? C.orange : C.green, ...mono, fontWeight: 600 }}>
                    {/* Shared helper = the sim's own retirement-year salary
                        convention (growthYears = retAge − currentAge − 1). The
                        old inline Math.pow compounded one extra year, showing a
                        figure the sim never pays (CodeRabbit PR #53). */}
                    {fmt(projectedIncomeAtAge(
                      { currentIncome, incomeGrowth, incomeGrowthEndAge, currentAge },
                      safeRetAge
                    ))}{"/yr"}
                  </span>
                  {incomeGrowthEndAge != null && (
                    <span style={{ color: C.muted }}>{` (capped at age ${incomeGrowthEndAge})`}</span>
                  )}
                </div>
                <div style={{ marginTop: 4, padding: "8px 10px", background: C.card, borderRadius: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Pre-Tax Deductions (auto)
                    </span>
                    <span style={{ fontSize: 13, color: C.blue, ...mono }}>{fmt(safeDeduc)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                      <span style={{ color: C.muted }}>401k contribution</span>
                      <span style={{ color: C.gold, ...mono }}>{fmt(contrib401k)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                      <span style={{ color: C.muted }}>HSA contribution <span style={{ fontStyle: "italic" }}>(set in Accounts below)</span></span>
                      <span style={{ color: C.purple, ...mono }}>{fmt(contribHSA)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                      <span style={{ color: C.muted }}>Other pre-tax</span>
                      <span style={{ color: otherPreTaxDeduc > 0 ? C.blue : C.muted, ...mono }}>
                        {otherPreTaxDeduc > 0 ? fmt(otherPreTaxDeduc) : "—"}
                      </span>
                    </div>
                  </div>
                  <Slider label="Other Pre-Tax (FSA, dep. care, transit)" value={otherPreTaxDeduc}
                    min={0} max={20_000} step={250}
                    format={v => v === 0 ? "None" : fmtFull(v)}
                    onChange={setOtherPreTaxDeduc} valueColor={C.blue} />
                  <p style={{ margin: "-8px 0 0", fontSize: 9, color: C.muted, lineHeight: 1.4 }}>
                    401k + HSA are auto-included. Add FSA, dependent care, or other payroll deductions here.
                  </p>
                </div>
              </div>
              {(filingStatus === "mfj" || spouseIncome > 0) && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: C.card, borderRadius: 8,
                  borderLeft: `2px solid ${C.purple}` }}>
                  <p style={{ margin: "0 0 8px", fontSize: 10, color: C.purple, textTransform: "uppercase",
                    letterSpacing: "0.07em", fontWeight: 700 }}>
                    Spouse / Partner Income
                  </p>
                  <Slider label="Spouse Gross Income" value={spouseIncome} min={0} max={500_000} step={5_000}
                    format={v => v === 0 ? "None" : fmtFull(v)} onChange={setSpouseIncome} valueColor={C.purple} />
                  {spouseIncome > 0 && (
                    <>
                      <Slider label="Spouse Income Growth / yr" value={spouseIncomeGrowth} min={0} max={15} step={0.5}
                        format={v => `${v}%`} onChange={setSpouseIncomeGrowth} valueColor={C.purple} />
                      <p style={{ margin: "-6px 0 0", fontSize: 10, color: C.muted }}>
                        Combined household: <span style={{ color: C.purple, ...mono }}>${combinedIncome.toLocaleString()}</span>
                      </p>
                    </>
                  )}
                  {rothPhaseoutWarning && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: `${C.orange}15`,
                      borderRadius: 5, borderLeft: `2px solid ${C.orange}` }}>
                      <p style={{ margin: 0, fontSize: 10, color: C.orange, lineHeight: 1.5 }}>
                        {rothFullyPhased
                          ? <>Combined MAGI (${combinedIncome.toLocaleString()}) exceeds the {TAX_DATA_2026[filingStatus].label} Roth IRA limit (${rothPhaseout.end.toLocaleString()}). <span style={{ fontWeight: 700 }}>Direct Roth contributions are not allowed.</span> Consider a Backdoor Roth.</>
                          : <>Combined MAGI (${combinedIncome.toLocaleString()}) is in the Roth IRA phase-out zone (${rothPhaseout.start.toLocaleString()} – ${rothPhaseout.end.toLocaleString()}). Contribution limit is reduced.</>}
                      </p>
                    </div>
                  )}
                  {spouseIncome > 0 && filingStatus !== "mfj" && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: `${C.blue}12`,
                      borderRadius: 5, borderLeft: `2px solid ${C.blue}` }}>
                      <p style={{ margin: 0, fontSize: 10, color: C.blue, lineHeight: 1.5 }}>
                        You've entered spouse income but your filing status is <span style={{ fontWeight: 700 }}>{TAX_DATA_2026[filingStatus].label}</span>.
                        {filingStatus === "mfs"
                          ? " MFS uses separate brackets — the tax breakdown above reflects only your income. Roth phase-out thresholds are much lower for MFS."
                          : " If you're married, switching to Married Filing Jointly usually produces a lower combined tax bill and higher Roth IRA phase-out thresholds."}
                      </p>
                      {filingStatus !== "mfs" && (
                        <button onClick={() => setFilingStatus("mfj")} style={{
                          marginTop: 6, padding: "3px 10px", fontSize: 10, fontWeight: 600,
                          border: `1px solid ${C.blue}60`, borderRadius: 4, background: "transparent",
                          color: C.blue, cursor: "pointer",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                        }}>Switch to Married Filing Jointly</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <p style={{ margin: "0 0 10px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                Tax Profile
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Filing Status</span>
                  <select value={filingStatus} onChange={e => setFilingStatus(e.target.value)}
                    style={{ ...selectStyle, borderColor: `${C.gold}50`, color: C.gold }}>
                    {Object.entries(TAX_DATA_2026).map(([key, { label }]) => (
                      <option key={key} value={key} style={{ background: C.surface, color: C.text }}>{label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 10, color: C.muted, display: "block", marginTop: 4 }}>
                    Std. ded. <span style={{ color: C.gold, ...mono }}>${TAX_DATA_2026[filingStatus].deduction.toLocaleString()}</span>
                  </span>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>State</span>
                    <span style={{ fontSize: 10, color: noStateTax ? C.green : C.gold, ...mono }}>
                      {noStateTax ? "No tax" : `${(stateRate * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <select value={selectedState} onChange={e => { setSelectedState(e.target.value); setStateRateOverride(null); }} style={selectStyle}>
                    {Object.entries(STATE_TAX).sort((a, b) => a[1].name.localeCompare(b[1].name))
                      .map(([code, { name }]) => (
                        <option key={code} value={code} style={{ background: C.surface }}>{name} ({code})</option>
                      ))}
                  </select>
                  {stateRateDefault > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="range" min={0} max={13} step={0.1}
                          value={stateRate * 100}
                          onChange={e => {
                            const v = Number(e.target.value);
                            setStateRateOverride(Math.abs(v - stateRateDefault * 100) < 0.05 ? null : v / 100);
                          }}
                          style={{ flex: 1, accentColor: C.purple, height: 4 }} />
                        <span style={{ fontSize: 11, color: stateRateOverride !== null ? C.purple : C.muted,
                          ...mono, minWidth: 38, textAlign: "right" }}>
                          {(stateRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: 9, color: C.muted }}>
                        {stateRateOverride !== null
                          ? <><span style={{ color: C.purple }}>Custom rate</span> · default {(stateRateDefault * 100).toFixed(1)}% ·{" "}
                              <button onClick={() => setStateRateOverride(null)} style={{
                                fontSize: 9, color: C.blue, background: "transparent", border: "none",
                                cursor: "pointer", padding: 0, textDecoration: "underline",
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                              }}>reset</button>
                            </>
                          : "Adjust if your effective state rate differs from the table average"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="breakdown-panel">
            <p style={{ margin: "0 0 10px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              2026 Tax Breakdown
            </p>
            {[
              { label: filingStatus === "mfj" ? "Household Gross" : "Gross Income", val: fmt(householdIncome),                     color: C.text    },
              { label: "Pre-Tax Deductions",        val: safeDeduc > 0 ? `- ${fmt(safeDeduc)}` : "-",  color: safeDeduc > 0 ? C.blue : C.muted },
              { label: "AGI",                       val: fmt(agi),                                      color: C.gold    },
              { label: "Federal Tax",               val: fmt(fedTax),                                   color: C.orange  },
              { label: `State Tax (${selectedState})`, val: noStateTax ? "-" : fmt(stateTax),           color: noStateTax ? C.muted : C.purple },
              { label: spouseIncome > 0 ? "FICA (both earners)" : "FICA (7.65%)", val: fmt(fica),      color: "#6e7681" },
              { label: spouseIncome > 0 ? "Est. Household Paycheck Deposit" : "Est. Paycheck Deposit", val: fmt(takeHome), color: C.green },
            ].map(({ label, val, color }) => (
              <div key={label} className="breakdown-row">
                <span style={{ color: C.muted }}>{label}</span>
                <span style={{ color, ...mono }}>{val}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8,
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Fed Effective", val: fmtPct(fedEffRate * 100),             color: C.orange, sub: "fed tax ÷ AGI"           },
                { label: "Marginal",      val: `${(fedMarginal * 100).toFixed(0)}%`, color: C.muted,  sub: "next $1 · ref only"     },
                { label: "Combined",      val: fmtPct(combinedEffRate * 100),        color: C.muted,  sub: spouseIncome > 0 ? "all ÷ household · ref only" : "all ÷ gross · ref only" },
              ].map(({ label, val, color, sub }) => (
                <div key={label}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>{label}</p>
                  <p className="rate-stat-val" style={{ color, ...mono }}>{val}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted, lineHeight: 1.3 }}>{sub}</p>
                </div>
              ))}
            </div>
            <div className="breakdown-note" style={{ marginTop: 8, padding: "7px 10px", background: "#0a0e14", borderRadius: 6, borderLeft: `2px solid ${C.border}` }}>
              <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                <span style={{ color: C.orange }}>Fed Effective</span> uses AGI — pre-tax contributions reduce federal taxable income.{" "}
                <span style={{ color: C.muted }}>Marginal</span> and <span style={{ color: C.muted }}>Combined</span> are current-year reference figures only — they do not feed into projections.{" "}
                Retirement projections use your <span style={{ color: C.green }}>Retirement Federal Rate</span> (Phase 3 below) combined with your retirement state tax.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 6 }}>Budget &amp; Savings Capacity</h3>
        <p style={{ margin: "0 0 16px", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          How much of your paycheck deposit do you actually need to live on? The gap between your living costs and your paycheck deposit
          is your savings capacity — money you can deploy into tax-advantaged accounts.
        </p>
        <div className="income-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Slider
              label="Annual Living Expenses"
              value={effectiveLiving}
              min={10_000} max={Math.max(grossAfterTax, 30_000)} step={1_000}
              format={v => fmtFull(v)}
              onChange={v => { setLivingExpenses(v); setPreApplySnapshot(null); }}
            />
            <p style={{ margin: "-8px 0 0", fontSize: 10, color: C.muted }}>
              Monthly: <span style={{ color: C.text, ...mono }}>${Math.round(effectiveLiving / ASSUMPTIONS.MONTHS_PER_YEAR).toLocaleString()}</span>
              {livingExpenses === null && (
                <span style={{ color: C.muted, fontStyle: "italic" }}> · auto-derived from your spending budget</span>
              )}
              {livingExpenses !== null && (
                <button onClick={() => { setLivingExpenses(null); setPreApplySnapshot(null); }} style={{
                  marginLeft: 8, fontSize: 9, color: C.blue, background: "transparent",
                  border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}>reset to auto</button>
              )}
            </p>
            <Slider label="Living Expense Growth / yr" value={livingExpenseGrowth} min={0} max={10} step={0.5}
              format={v => `${v}%`} onChange={setLivingExpenseGrowth} valueColor={C.orange} />
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <Slider label="Deploy This % of Surplus" value={savingsSurplusPct} min={0} max={100} step={5}
                format={v => `${v}%`}
                onChange={v => { setSavingsSurplusPct(v); setPreApplySnapshot(null); }} valueColor={C.green} />
              <p style={{ margin: "-8px 0 0", fontSize: 10, color: C.muted }}>
                Controls the "Optimized" scenario in the Flow-Down tab.
                <span style={{ color: C.green }}> {savingsSurplusPct}%</span> of your
                <span style={{ color: C.gold }}> {fmt(availableSurplus)}</span> surplus =
                <span style={{ color: C.green, ...mono }}> {fmt(Math.round(availableSurplus * savingsSurplusPct / 100))}/yr</span> extra savings
              </p>
            </div>
          </div>
          <div>
            <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.06em", fontWeight: 700 }}>Savings Waterfall</p>
              {[
                { label: "Income After Taxes",     val: grossAfterTax,        color: C.text },
                { label: "Living Expenses",         val: -effectiveLiving,     color: C.orange },
                { label: "= Savings Capacity",      val: savingsCapacity,      color: C.gold,  bold: true },
                { label: "Current Contributions",   val: -currentContribTotal, color: C.blue },
                { label: "= Available Surplus",      val: availableSurplus,     color: C.green, bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  padding: "3px 0",
                  ...(bold ? { borderTop: `1px dashed ${C.border}`, marginTop: 4, paddingTop: 6 } : {}) }}>
                  <span style={{ fontSize: 11, color: bold ? C.text : C.muted, fontWeight: bold ? 600 : 400 }}>{label}</span>
                  <span style={{ fontSize: 13, color, fontWeight: bold ? 700 : 500, ...mono }}>
                    {val < 0 ? `− ${fmt(Math.abs(val))}` : fmt(val)}
                  </span>
                </div>
              ))}
            </div>
            {optimizedAllocation.totalExtra > 0 && (
              <div style={{ background: `${C.green}08`, borderRadius: 8, padding: "10px 14px", marginTop: 10,
                border: `1px solid ${C.green}15` }}>
                <p style={{ margin: "0 0 6px", fontSize: 10, color: C.green, textTransform: "uppercase",
                  letterSpacing: "0.06em", fontWeight: 700 }}>
                  Optimized Allocation ({savingsSurplusPct}% of surplus)
                </p>
                <p style={{ margin: "0 0 8px", fontSize: 10, color: C.muted }}>
                  Extra <span style={{ color: C.green, ...mono }}>{fmt(optimizedAllocation.totalExtra)}/yr</span> deployed in IRS-priority order:
                </p>
                {[
                  optimizedAllocation.extraMatch > 0  && { label: "① Employer Match", val: optimizedAllocation.extraMatch, color: C.gold, sub: "free money" },
                  optimizedAllocation.extraHSA > 0    && { label: "② HSA",            val: optimizedAllocation.extraHSA,   color: C.purple, sub: "triple tax-free" },
                  optimizedAllocation.extraRoth > 0   && { label: "③ Roth IRA",       val: optimizedAllocation.extraRoth,  color: C.blue, sub: "tax-free growth" },
                  (optimizedAllocation.extra401k - (optimizedAllocation.extraMatch || 0)) > 0 && {
                    label: "④ 401k",
                    val: optimizedAllocation.extra401k - (optimizedAllocation.extraMatch || 0),
                    color: C.gold, sub: "pre-tax deduction"
                  },
                  optimizedAllocation.extraTaxable > 0 && { label: "⑤ Taxable", val: optimizedAllocation.extraTaxable, color: C.green, sub: "overflow" },
                ].filter(Boolean).map(({ label, val, color, sub }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0" }}>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      {label} <span style={{ fontSize: 8, color: `${color}80` }}>{sub}</span>
                    </span>
                    <span style={{ fontSize: 11, color, ...mono }}>+{fmt(val)}/yr</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
                  <p style={{ margin: "0 0 4px", fontSize: 9, color: C.muted }}>New annual contributions if applied:</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { label: "401k", val: optimizedAllocation.opt401k, color: C.gold },
                      { label: "Roth", val: optimizedAllocation.optRoth, color: C.blue },
                      { label: "HSA",  val: optimizedAllocation.optHSA,  color: C.purple },
                      { label: "Taxable", val: optimizedAllocation.optTaxable, color: C.green },
                    ].map(({ label, val, color }) => (
                      <span key={label} style={{ fontSize: 10, color, ...mono }}>{label}: {fmt(val)}</span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  {preApplySnapshot === null ? (
                    <button
                      onClick={applyAllocation}
                      style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 700,
                        border: "none", borderRadius: 6, cursor: "pointer",
                        background: C.green, color: "#0d1117",
                        fontFamily: "'DM Sans', system-ui, sans-serif" }}
                    >Apply to Projections →</button>
                  ) : (
                    <>
                      <div style={{ flex: 1, padding: "6px 10px", background: `${C.green}15`,
                        borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: C.green }}>✓</span>
                        <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>Applied</span>
                        <span style={{ fontSize: 9, color: C.muted }}>— projections updated</span>
                      </div>
                      <button
                        onClick={revertAllocation}
                        style={{ padding: "7px 14px", fontSize: 10, fontWeight: 600,
                          border: `1px solid ${C.orange}60`, borderRadius: 6,
                          background: "transparent", color: C.orange, cursor: "pointer",
                          fontFamily: "'DM Sans', system-ui, sans-serif" }}
                      >↺ Revert</button>
                    </>
                  )}
                </div>
              </div>
            )}
            {availableSurplus <= 0 && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: `${C.orange}10`,
                borderRadius: 6, borderLeft: `2px solid ${C.orange}` }}>
                <p style={{ margin: 0, fontSize: 10, color: C.orange, lineHeight: 1.5 }}>
                  Your living expenses ({fmt(effectiveLiving)}) and contributions ({fmt(currentContribTotal)}) exceed your after-tax income ({fmt(grossAfterTax)}).
                  Reduce expenses or increase income to create surplus for optimized savings.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 8 }}>One-Time Money Events</h3>
        <p style={{ margin: "0 0 12px", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          Model windfalls, inheritances, or large purchases (car, home down payment, etc.).
          Each event adjusts the portfolio balance at that age — outflows reduce it, inflows add to it.
          Up to 6 events.
        </p>
        <MoneyEventsPanel
          events={moneyEvents}
          onChange={setMoneyEvents}
          currentAge={currentAge}
        />
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 8 }}>Working-Year Roth Conversions</h3>
        <p style={{ margin: "0 0 12px", fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          Most conversions are best done in the “gap years” after you retire (above). But if you
          hit a low-income year <em>before</em> retiring — a job change, a sabbatical — converting
          some 401k → Roth then can lock in a low tax rate and shrink future RMDs.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.text, marginBottom: 10 }}>
          <input type="checkbox" checked={conversionInService}
            onChange={e => setConversionInService(e.target.checked)} />
          My 401k plan allows in-service distributions / in-plan Roth conversions
        </label>
        {conversionInService ? (
          <ConversionEventsPanel
            events={conversionEvents}
            onChange={setConversionEvents}
            currentAge={currentAge}
            safeRetAge={safeRetAge}
            estTaxByAge={convEventTaxByAge}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5, fontStyle: "italic" }}>
            Converting an <em>active</em> employer 401k while still working is plan-dependent —
            many plans only allow it after age 59½, or not at all. Check the box above once you’ve
            confirmed your plan allows it (it’s always available from a rollover IRA after you leave a job).
          </p>
        )}
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 16 }}>Tax Rate Phases</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          {/* Shares setCurrentAgeCoupled with Horizon's My details (one handler,
              both UIs) — keeps the SS-claim clamp + contribEnd coupling in sync. */}
          <Slider label="Current Age" value={currentAge} min={18} max={80}
            onChange={setCurrentAgeCoupled} />
          <Slider label="Retirement Age" value={retirementAge} min={currentAge} max={lifeExpect - 1}
            valueColor={C.green} onChange={v => {
              setRetirementAge(v);
              if (contribEnd401k    === retirementAge) setContribEnd401k(v);
              if (contribEndRoth    === retirementAge) setContribEndRoth(v);
              if (contribEndTaxable === retirementAge) setContribEndTaxable(v);
              if (contribEndHSA     === retirementAge) setContribEndHSA(v);
            }} />
          <Slider label="Life Expectancy" value={lifeExpect} min={retirementAge + 1} max={115}
            onChange={v => {
              setLifeExpect(v);
              if (retirementAge >= v) {
                const newRet = v - 1;
                setRetirementAge(newRet);
                }
              if (contribEnd401k    > v) setContribEnd401k(v);
              if (contribEndRoth    > v) setContribEndRoth(v);
              if (contribEndTaxable > v) setContribEndTaxable(v);
              if (contribEndHSA     > v) setContribEndHSA(v);
            }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Slider label="Annual Return" value={returnRate} min={1} max={15}
              format={v => `${v}%`} onChange={setReturnRate} />
            <div>
              <Slider label="Inflation Assumption" value={inflationRate} min={1} max={8} step={0.5}
                format={v => `${v}%`} onChange={setInflationRate} valueColor={C.orange} />
              <p style={{ margin: "-10px 0 0", fontSize: 9, color: C.muted, fontStyle: "italic" }}>
                Real return: {((rReal) * 100).toFixed(1)}% · affects drawdown &amp; years sustained
              </p>
            </div>
          </div>
        </div>
        <TaxTimeline
          phase2End={phase2End} totalYears={totalYears}
          fedMarginal={fedMarginal} effectiveRMDTaxRate={effectiveRMDTaxRate}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: C.muted }}>Year 1 (Age {currentAge})</span>
          <span style={{ fontSize: 10, color: C.muted }}>Retirement Age {safeRetAge} to {safeLifeExp}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {/* Working-years panel — computed from actual bracket math, no manual slider */}
          <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${C.gold}` }}>
            <p style={{ margin: "0 0 2px", fontSize: 10, color: C.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              1 Working Years Tax Rate
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 10, color: C.muted }}>
              Years 1–{phase2End - 1} / Age {currentAge}–{safeRetAge - 1}
            </p>
            <p style={{ margin: "0 0 4px", fontSize: 26, color: C.gold, ...mono, fontWeight: 700 }}>
              {actualMarginalPct}%
            </p>
            <p style={{ margin: 0, fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
              Federal marginal rate computed from your income and deductions.
              Balances are shown GROSS (pre-tax); the engine taxes each
              withdrawal in retirement at that year's actual bracket.
            </p>
          </div>
          {/* Retirement panel — bracket-accurate effective RMD rate, with state selector */}
          <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${C.green}` }}>
            <p style={{ margin: "0 0 2px", fontSize: 10, color: C.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              3 Retirement Effective Rate
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 10, color: C.muted }}>
              Year {phase2End}+ / Age {safeRetAge}–{safeLifeExp}
            </p>
            <p style={{ margin: "0 0 2px", fontSize: 26, color: C.green, ...mono, fontWeight: 700 }}>
              {(effectiveRMDTaxRate * 100).toFixed(1)}%
              {retStateRate > 0 && (
                <span style={{ fontSize: 13, color: C.orange, marginLeft: 6 }}>
                  +{(retStateRate * 100).toFixed(1)}% state
                </span>
              )}
            </p>
            {rmdData.length > 0 && (
              <p style={{ margin: "0 0 6px", fontSize: 9, color: C.muted }}>
                Bracket-accurate across all RMD years · projected {projRetBracketPct}% marginal bracket
              </p>
            )}
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted }}>
                Retirement state
                {retStateRate > 0
                  ? <span style={{ color: C.orange }}> · +{(retStateRate * 100).toFixed(1)}% on 401k/IRA</span>
                  : <span style={{ color: C.green }}> · no tax on retirement income</span>}
              </p>
              <select value={retirementState} onChange={e => setRetirementState(e.target.value)}
                style={{ ...selectStyle, borderColor: `${C.green}50`, color: C.green, fontSize: 11 }}>
                {Object.entries(RETIREMENT_STATE_TAX).sort((a, b) => a[1].name.localeCompare(b[1].name))
                  .map(([code, { name, rate }]) => (
                    <option key={code} value={code} style={{ background: C.surface }}>
                      {name} ({code}) — {rate === 0 ? "0%" : `${(rate * 100).toFixed(1)}%`}
                    </option>
                  ))}
              </select>
              {RETIREMENT_STATE_TAX[retirementState]?.note && (
                <p style={{ margin: "4px 0 0", fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                  {RETIREMENT_STATE_TAX[retirementState].note}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Accounts &amp; Projections</h3>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 24, rowGap: 2, textAlign: "right" }}>
            <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "end" }}>Portfolio today</span>
            <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "end" }}>Annual contrib</span>
            <span style={{ fontSize: 15, color: C.gold, ...mono }}>{fmt(bal401k + balRoth + balTaxable + balHSA)}</span>
            <span style={{ fontSize: 15, color: C.blue, ...mono }}>{fmt(contrib401k + contribRoth + contribTaxable + contribHSA)}</span>
          </div>
        </div>
        <div style={{ paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            Account Balances &amp; Contributions
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8,
              padding: "0 0 6px", marginBottom: 6, borderBottom: `1px solid ${C.border}` }}>
              {["Account", "Balance", "Annual Contrib", "Until Age"].map(h => (
                <span key={h} style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {ACCOUNTS.map(({ key, color, note, val, setVal, contrib, setContrib, contribMax, endAge, setEndAge, growsWithIncome }) => {
              const step        = contribMax <= 10_000 ? 100 : contribMax <= 30_000 ? 500 : 1_000;
              const warnEndAge  = endAge > safeRetAge;
              const projContribRaw = growsWithIncome && contrib > 0 && incomeGrowth > 0
                ? Math.min(contrib * Math.pow(1 + incomeGrowth / 100, phase2End - 1), contribMax)
                : null;
              const projContrib = projContribRaw ? fmt(projContribRaw) : null;
              const projContribCapped = projContribRaw !== null && projContribRaw === contribMax;
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto",
                  gap: 8, alignItems: "start", padding: "8px 0",
                  borderBottom: `1px solid ${C.border}`, borderLeft: `2px solid ${color}`,
                  paddingLeft: 8, marginBottom: 2 }}>
                  <div>
                    <span style={{ fontSize: 12, color, fontWeight: 700 }}>{key}</span>
                    <span style={{ display: "block", fontSize: 9, color, background: `${color}18`,
                      borderRadius: 3, padding: "1px 5px", marginTop: 3, width: "fit-content" }}>{note}</span>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ color: C.muted, fontSize: 11 }}>$</span>
                      <DeferredInput value={val} min={0} max={5_000_000} onChange={setVal}
                        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 4, color, fontSize: 13, padding: "3px 6px", outline: "none", ...mono }} />
                    </div>
                    <input type="range" min={0} max={1_000_000} step={10_000} value={Math.min(val, 1_000_000)}
                      onChange={e => setVal(Number(e.target.value))}
                      style={{ width: "100%", accentColor: color, marginTop: 4 }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ color: C.muted, fontSize: 11 }}>$</span>
                      <DeferredInput value={contrib} min={0} max={contribMax} onChange={setContrib}
                        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 4, color, fontSize: 13, padding: "3px 6px", outline: "none", ...mono }} />
                    </div>
                    <input type="range" min={0} max={contribMax} step={step} value={contrib}
                      onChange={e => setContrib(Number(e.target.value))}
                      style={{ width: "100%", accentColor: color, marginTop: 4 }} />
                    <span style={{ fontSize: 9, color: C.muted }}>
                      max ${contribMax.toLocaleString()}/yr
                      {projContrib
                        ? <span style={{ color }}> · → {projContrib} at ret.{projContribCapped ? " (IRS cap)" : ""}</span>
                        : !growsWithIncome ? <span> · IRS-capped, won't scale</span> : null}
                    </span>
                    {projContrib && (
                      <span style={{ fontSize: 8, color: C.muted, display: "block", lineHeight: 1.3, marginTop: 1 }}>
                        contrib. amount scaled with income growth
                      </span>
                    )}
                    {key === "Traditional 401k" && contrib401kRoom > 0 && fedMarginal > 0 && (
                      <p style={{ margin: "3px 0 0", fontSize: 9, color: C.gold, lineHeight: 1.4 }}>
                        Max saves <span style={{ fontWeight: 700 }}>{fmt(contrib401kTaxSave)}</span> more in fed tax this yr
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <DeferredInput value={endAge} min={currentAge + 1} max={safeLifeExp} onChange={setEndAge}
                      style={{ width: 44, background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 4, color: C.blue, fontSize: 13, padding: "3px 4px",
                        outline: "none", textAlign: "center", ...mono }} />
                    {warnEndAge && (
                      <p style={{ margin: "3px 0 0", fontSize: 9, color: C.orange, whiteSpace: "nowrap" }}>past ret.</p>
                    )}
                    {endAge !== safeRetAge && (
                      <button onClick={() => setEndAge(safeRetAge)}
                        style={{ marginTop: 4, padding: "2px 5px", fontSize: 8, fontWeight: 600,
                          border: `1px solid ${C.border}`, borderRadius: 3, background: "transparent",
                          color: C.muted, cursor: "pointer", whiteSpace: "nowrap",
                          fontFamily: "'DM Sans', system-ui, sans-serif", lineHeight: 1.4,
                          display: "block", width: "100%" }}>
                        ↺ til ret.
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Total Portfolio at Age
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Retirement target:</span>
              <span style={{ color: C.muted, fontSize: 13 }}>$</span>
              <DeferredInput value={retirementTarget} min={100_000} max={20_000_000}
                onChange={setRetirementTarget}
                style={{ width: 110, background: C.surface, border: `1px solid ${C.gold}60`,
                  borderRadius: 5, color: C.gold, fontSize: 14, padding: "3px 8px",
                  outline: "none", textAlign: "right", ...mono }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(() => {
              const firstCrossIdx = milestones.findIndex(m => m.total >= retirementTarget);
              const PCT_COLORS = { c1: "#f85149", c2: "#58a6ff", c3: "#d4a843", c4: "#f78166", c5: "#3fb950", c6: "#bc8cff" };
              const pctColor = (rawPct, isFirstHit) => {
                if (isFirstHit)   return PCT_COLORS.c5;
                if (rawPct > 100) return PCT_COLORS.c6;
                if (rawPct >= 90) return PCT_COLORS.c4;
                if (rawPct >= 51) return PCT_COLORS.c3;
                if (rawPct >= 26) return PCT_COLORS.c2;
                return PCT_COLORS.c1;
              };
              return milestones.map(({ age, total, isRetirement }, idx) => {
                const rawPct     = Math.round((total / retirementTarget) * 100);
                const barPct     = Math.min(100, rawPct);
                const isFirstHit = idx === firstCrossIdx;
                const color      = pctColor(rawPct, isFirstHit);
                return (
                  <div key={age} style={{
                    flex: "1 1 80px", minWidth: 80,
                    background: isFirstHit ? `${C.green}14` : "#0d1117",
                    border: `1px solid ${isFirstHit ? C.green : isRetirement ? C.gold : C.border}`,
                    borderRadius: 8, padding: "10px 10px 8px", position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0,
                      width: `${barPct}%`, height: 3, background: color, borderRadius: "0 2px 0 0" }} />
                    <p style={{ margin: "0 0 2px", fontSize: 10, color: isFirstHit ? C.green : isRetirement ? C.gold : C.muted }}>
                      {isRetirement ? `Age ${age} ★` : `Age ${age}`}
                    </p>
                    <p style={{ margin: "0 0 3px", fontSize: 13, color: isFirstHit ? C.green : C.text, ...mono }}>{fmt(total)}</p>
                    <p style={{ margin: 0, fontSize: 10, color, ...mono }}>{rawPct}% of goal</p>
                  </div>
                );
              });
            })()}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 10, color: C.muted }}>
            ★ = retirement age &nbsp;·&nbsp; Trad 401k shown gross (pre-tax) &nbsp;·&nbsp; Taxable applies annual LTCG drag at income-based rate &nbsp;·&nbsp;
            <span style={{ color: "#f85149" }}>0–25%</span> &nbsp;
            <span style={{ color: "#58a6ff" }}>26–50%</span> &nbsp;
            <span style={{ color: "#d4a843" }}>51–89%</span> &nbsp;
            <span style={{ color: "#f78166" }}>90–99%</span> &nbsp;
            <span style={{ color: "#3fb950" }}>100%</span> &nbsp;
            <span style={{ color: "#bc8cff" }}>&gt;100%</span>
          </p>
        </div>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>
              Account Comparison at Retirement (Age {safeRetAge})
            </p>
            <p style={{ margin: 0, fontSize: 22, color: C.gold, ...mono }}>
              {fmt(totalAtRet)}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: C.muted }}>
              gross balance across all accounts (pre-tax)
              &nbsp;·&nbsp;
              <span style={{ color: C.green }}>≈ {fmt(spendableAtRet)} spendable after tax</span>
            </p>
          </div>
          <p style={{ margin: 0, fontSize: 10, color: C.muted }}>gross · age {safeRetAge}</p>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {ranked.map(([dataKey, val]) => {
            const acct     = ACCOUNTS.find(a => a.dataKey === dataKey);
            const color    = acct?.color ?? C.muted;
            const pctTotal = totalAtRet > 0 ? (val / totalAtRet) * 100 : 0;
            return (
              <div key={dataKey}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color, fontWeight: 600 }}>{acct?.key ?? dataKey}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      {acct?.contrib > 0 ? `${fmtFull(acct.contrib)}/yr` : "no contributions"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 13, color, ...mono }}>{fmt(val)}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{pctTotal.toFixed(1)}% of total</span>
                  </div>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pctTotal}%`, background: color,
                    opacity: 0.75, borderRadius: 3, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
          Gross (pre-tax) values at retirement age. Trad 401k is the full pre-tax balance; the after-tax estimate is shown separately as spendable-at-retirement. Roth &amp; HSA tax-free. Taxable applies annual LTCG drag at your income-based rate (0%, 15%, or 20%).
        </p>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 16 }}>Retirement Drawdown</h3>
        <div className="det-2col" style={{ gap: 24 }}>
          <div>
            <Slider label="Estimated Annual Expenses in Retirement"
              value={effectiveExpenses} min={10_000} max={300_000} step={1_000}
              format={v => fmtFull(v)}
              onChange={v => setAnnualExpenses(v)} />
            <p style={{ margin: "4px 0 0", fontSize: 10, color: C.muted }}>
              Monthly: <span style={{ color: C.text, ...mono }}>${Math.round(effectiveExpenses / ASSUMPTIONS.MONTHS_PER_YEAR).toLocaleString()}</span>
              &nbsp;·&nbsp; default = your current living spend ({fmt(effectiveLiving)}/yr)
              {annualExpenses !== null && (
                <button onClick={() => setAnnualExpenses(null)} style={{
                  marginLeft: 8, fontSize: 9, color: C.blue, background: "transparent",
                  border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}>reset to current spend</button>
              )}
            </p>
            {(householdSS > 0 || effectivePension > 0) && (
              <div style={{ marginTop: 10, background: C.card, borderRadius: 7,
                padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: C.muted }}>Annual expenses</span>
                  <span style={{ fontSize: 11, color: C.text, ...mono }}>{fmt(effectiveExpenses)}</span>
                </div>
                {effectiveSS > 0 && ssClaimingAge <= safeRetAge && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.green }}>− Your Social Security</span>
                    <span style={{ fontSize: 11, color: C.green, ...mono }}>− {fmt(effectiveSS)}</span>
                  </div>
                )}
                {effectiveSS > 0 && ssClaimingAge > safeRetAge && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      SS <span style={{ fontStyle: "italic" }}>(starts age {ssClaimingAge})</span>
                    </span>
                    <span style={{ fontSize: 11, color: C.muted, ...mono }}>{fmt(effectiveSS)}/yr deferred</span>
                  </div>
                )}
                {spouseSsBenefit > 0 && ssClaimingAge <= safeRetAge && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.green }}>− Spouse Social Security</span>
                    <span style={{ fontSize: 11, color: C.green, ...mono }}>− {fmt(spouseSsBenefit)}</span>
                  </div>
                )}
                {spouseSsBenefit > 0 && ssClaimingAge > safeRetAge && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      Spouse SS <span style={{ fontStyle: "italic" }}>(starts age {ssClaimingAge})</span>
                    </span>
                    <span style={{ fontSize: 11, color: C.muted, ...mono }}>{fmt(spouseSsBenefit)}/yr deferred</span>
                  </div>
                )}
                {effectivePension > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.blue }}>− Pension income</span>
                    <span style={{ fontSize: 11, color: C.blue, ...mono }}>− {fmt(effectivePension)}</span>
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 4,
                  display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Portfolio draws</span>
                  <span style={{ fontSize: 13, color: C.gold, fontWeight: 700, ...mono }}>{fmt(netPortfolioNeed)}/yr</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Withdrawal Rate</p>
              <p style={{ margin: "0 0 2px", fontSize: 20, ...mono,
                color: withdrawalRate <= 4 ? C.green : withdrawalRate <= 6 ? C.gold : C.orange }}>
                {withdrawalRate.toFixed(1)}%
              </p>
              <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                {withdrawalRate <= 4 ? "safe (≤4%)" : withdrawalRate <= 6 ? "moderate" : "aggressive"}
              </p>
            </div>
            <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Years Sustained</p>
              <p style={{ margin: "0 0 2px", fontSize: 20, ...mono, color: isSustainable ? C.green : C.orange }}>
                {yearsSustained === Infinity ? "∞" : `${Math.floor(yearsSustained)}`}
              </p>
              <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                {yearsSustained === Infinity ? "self-sustaining" : `runs out at age ${Math.floor(safeRetAge + yearsSustained)}`}
              </p>
            </div>
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
          Based on total gross portfolio at retirement ({fmt(totalAtRet)}) growing at {returnRate}% per year.
          Years sustained uses an inflation-adjusted real return ({((rReal)*100).toFixed(1)}%) at your {inflationRate}% inflation assumption.
        </p>
        {ss70DrawReduction > 0 && includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE && (
          <div style={{ marginTop: 10, background: "#0a0e14", borderLeft: `3px solid ${C.green}`,
            borderRadius: 6, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: C.text, fontWeight: 600 }}>
              Delay SS to {SS_MAX_CLAIM_AGE}
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 400, marginLeft: 8 }}>vs claiming at {ssClaimingAge}</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: C.muted }}>Additional SS income</span>
                <span style={{ color: C.green, ...mono }}>+{fmt(ss70DrawReduction)}/yr</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: C.muted }}>Portfolio draw drops</span>
                <span style={{ color: C.green, ...mono }}>{withdrawalRate.toFixed(1)}% → {wr70.toFixed(1)}%</span>
              </div>
              {ssDelayGainYrs !== null && ssDelayGainYrs > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ color: C.muted }}>Portfolio longevity</span>
                  <span style={{ color: C.green, ...mono }}>~{ssDelayGainYrs} yr{ssDelayGainYrs !== 1 ? "s" : ""} longer</span>
                </div>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 9, color: C.muted, lineHeight: 1.5, fontStyle: "italic" }}>
              Longevity estimate assumes the {SS_MAX_CLAIM_AGE - ssClaimingAge}-year gap before claiming at {SS_MAX_CLAIM_AGE}
              is covered by other income (work, pension, or separate savings) — not this portfolio.
              Break-even vs claiming now: see the SS section in the Detailed Planner.
            </p>
          </div>
        )}
      </div>

      <WhatIfPanel
        simInputs={whatIfSimInputs}
        fedMarginal={fedMarginal}
        retDrawShared={retDrawShared}
        safeRetAge={safeRetAge}
        safeLifeExp={safeLifeExp}
        baseTotalAtRet={totalAtRet}
        baseYearsSustained={yearsSustained}
        currentAge={currentAge}
        whatIfBundle={whatIfBundle}
        addlPreTaxBal={addlPreTaxBal}
      />

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Portfolio Growth Over Time</h3>
        <p style={{ margin: "0 0 16px", fontSize: 11, color: C.muted }}>
          Gross (pre-tax) values year by year. Trad 401k is the full pre-tax balance;
          its after-tax worth is lower because withdrawals are taxed as income.
          Dashed line marks retirement age.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={simData.filter(d => d.age <= safeRetAge)}
            margin={{ top: 10, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="age" stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }} />
            <YAxis stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }} tickFormatter={v => fmt(v)} width={82} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: C.muted, paddingTop: 8 }} />
            <ReferenceLine x={safeRetAge} stroke={C.green} strokeDasharray="5 4"
              label={{ value: "Retire", position: "insideTopRight", fill: C.green, fontSize: 10 }} />
            <Line type="monotone" dataKey="Trad 401k" stroke={C.gold}   strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Roth IRA"  stroke={C.blue}   strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Taxable"   stroke={C.green}  strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="HSA"       stroke={C.purple} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Total Portfolio — Full Lifecycle</h3>
        <p style={{ margin: "0 0 16px", fontSize: 11, color: C.muted }}>
          Combined gross portfolio from today to life expectancy (age {safeLifeExp}).
          Grows through retirement age {safeRetAge}, then draws down at {fmt(effectiveExpenses)}/yr.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={totalChartData} margin={{ top: 10, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="age" stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }} />
            <YAxis stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }} tickFormatter={v => fmt(v)} width={82} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const val = payload[0]?.value;
                const isDrawdown = label > safeRetAge;
                return (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 11, color: C.muted }}>Age {label}</p>
                    <p style={{ margin: 0, fontSize: 13, color: isDrawdown ? C.orange : C.gold, ...mono }}>{fmt(val ?? 0)}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: C.muted }}>{isDrawdown ? "drawdown phase" : "accumulation phase"}</p>
                  </div>
                );
              }}
            />
            <ReferenceLine x={safeRetAge} stroke={C.green} strokeDasharray="5 4"
              label={{ value: "Retire", position: "insideTopRight", fill: C.green, fontSize: 10 }} />
            <Line type="monotone" dataKey="total" stroke={C.gold} strokeWidth={2} dot={false} name="Total Portfolio" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      </>
      )}

      {activeTab === "detailed" && (
      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 20 }}>Detailed Planner</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700 }}>Social Security Estimate</p>
              <div style={{ display: "flex", gap: 6 }}>
                {["Include", "Exclude"].map(opt => (
                  <button key={opt} onClick={() => setIncludeSS(opt === "Include")}
                    style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: "none",
                      borderRadius: 4, cursor: "pointer",
                      background: (includeSS ? "Include" : "Exclude") === opt
                        ? (opt === "Include" ? C.green : C.orange) : C.border,
                      color: (includeSS ? "Include" : "Exclude") === opt ? "#0d1117" : C.muted,
                      fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {opt === "Include" ? "✓ Include SS" : "✕ Exclude SS"}
                  </button>
                ))}
              </div>
            </div>
            {!includeSS && (
              <div style={{ background: "#0a0e14", borderLeft: `3px solid ${C.orange}`, borderRadius: 6,
                padding: "8px 12px", marginBottom: 14, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                Social Security is <span style={{ color: C.orange, fontWeight: 600 }}>excluded</span> from
                all retirement calculations — drawdown expenses, withdrawal strategy, and Roth conversion
                bracket fill are computed without SS income.
              </div>
            )}
            <div className="det-2col" style={{ gap: 24 }}>
              <div>
                <Slider label="Claiming Age" value={ssClaimingAge} min={Math.min(SS_MAX_CLAIM_AGE, Math.max(SS_MIN_CLAIM_AGE, currentAge))} max={SS_MAX_CLAIM_AGE}
                  format={v => v === SS_FRA ? `${v} (FRA)` : v < SS_FRA ? `${v} (early)` : `${v} (delayed)`}
                  onChange={setSsClaimingAge} valueColor={ssClaimingAge < SS_FRA ? C.orange : ssClaimingAge > SS_FRA ? C.green : C.gold} />
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, marginTop: 4 }}>
                  <p style={{ margin: 0 }}>Full Retirement Age (FRA): <span style={{ color: C.text }}>{SS_FRA}</span> for born ≥ 1960</p>
                  <p style={{ margin: 0 }}>Estimated AIME: <span style={{ color: C.text, ...mono }}>${Math.round(ssAIME).toLocaleString()}/mo</span></p>
                  <p style={{ margin: 0 }}>Up to 85% of SS benefit may be taxable depending on combined income.</p>
                </div>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <p style={{ margin: "0 0 6px", fontSize: 10, color: C.muted }}>
                    Override estimated benefit
                    <span style={{ marginLeft: 6, color: C.muted, fontStyle: "italic" }}>— enter your own SS.gov estimate</span>
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>$</span>
                    <DeferredInput
                      value={ssOverride !== null ? ssOverride : ssAnnualBenefit}
                      min={0} max={60_000}
                      onChange={v => setSsOverride(v === ssAnnualBenefit ? null : v)}
                      style={{ width: 100, background: C.surface,
                        border: `1px solid ${ssOverride !== null ? C.blue : C.border}`,
                        borderRadius: 4, color: ssOverride !== null ? C.blue : C.text,
                        fontSize: 13, padding: "3px 8px", outline: "none", ...mono }}
                    />
                    <span style={{ fontSize: 10, color: C.muted }}>/yr</span>
                    {ssOverride !== null && (
                      <button onClick={() => setSsOverride(null)} style={{
                        fontSize: 9, color: C.muted, background: "transparent", border: "none",
                        cursor: "pointer", textDecoration: "underline",
                        fontFamily: "'DM Sans', system-ui, sans-serif", padding: 0 }}>
                        reset to estimate
                      </button>
                    )}
                  </div>
                  {ssOverride !== null && (
                    <p style={{ margin: "4px 0 0", fontSize: 9, color: C.blue }}>
                      Using your override · estimated was {fmt(ssAnnualBenefit)}/yr
                    </p>
                  )}
                </div>
              </div>
              <div className="det-stat-3" style={{ gap: 10 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Monthly Benefit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>
                    ${ssOverride !== null ? Math.round(ssOverride / ASSUMPTIONS.MONTHS_PER_YEAR).toLocaleString() : ssMonthlyBenefit.toLocaleString()}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>at age {ssClaimingAge}</p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Annual Benefit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>{fmt(effectiveSS > 0 ? effectiveSS : ssAnnualBenefit)}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {!includeSS ? "excluded from calcs" : effectiveExpenses > 0 ? `${((effectiveSS / effectiveExpenses) * 100).toFixed(0)}% of expenses` : "—"}
                  </p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Break-even vs 67</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.gold, ...mono }}>
                    {ssBreakEven ? `Age ${ssBreakEven}` : "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {ssClaimingAge < SS_FRA ? "when FRA catches up" : ssClaimingAge > SS_FRA ? "when delay pays off" : "claiming at FRA"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {isMarried && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700 }}>Spouse Social Security</p>
            </div>
            <div className="det-2col" style={{ gap: 24 }}>
              <div>
                <div style={{ background: "#0a0e14", borderLeft: `3px solid ${C.green}`, borderRadius: 6,
                  padding: "10px 14px", marginBottom: 14 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, color: C.text, fontWeight: 600 }}>Spousal Benefit Rules</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                    SSA pays whichever is larger: the spouse's <span style={{ color: C.green }}>own earned benefit</span> or{" "}
                    <span style={{ color: C.green }}>50% of the primary's PIA</span> (spousal floor).
                    Spousal benefits earn <em>no</em> delayed credits — claiming after 67 does not inflate them.
                    Own-record benefits do earn delayed credits (up to 70).
                  </p>
                </div>

                {/* Benefit basis toggle */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: "0 0 5px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Benefit Basis</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["own", "Own Record"], ["spousal", "Spousal (50% of primary)"]].map(([val, label]) => (
                      <button key={val} onClick={() => setSpouseBenefitBasis(val)}
                        style={{ flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600, border: "none",
                          borderRadius: 5, cursor: "pointer",
                          background: spouseBenefitBasis === val ? C.gold : C.border,
                          color: spouseBenefitBasis === val ? "#0d1117" : C.muted,
                          fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <Slider label="Spouse's Own SS Benefit at FRA (age 67, annual)" value={spouseSsEstimate}
                  min={0} max={60_000} step={500}
                  format={v => v === 0 ? "None" : fmtFull(v)}
                  onChange={setSpouseSsEstimate} valueColor={C.green} />
                <p style={{ margin: "-6px 0 10px", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Enter the benefit shown on the spouse's my Social Security statement (their estimated benefit <strong>at age 67</strong>).
                  The early/late claiming factor will be applied based on the claiming age below.
                </p>

                <Slider label="Spouse Claiming Age" value={spouseClaimingAge}
                  min={SS_MIN_CLAIM_AGE} max={SS_MAX_CLAIM_AGE}
                  format={v => v === SS_FRA ? `${v} (FRA)` : v < SS_FRA ? `${v} (early)` : `${v} (delayed)`}
                  onChange={setSpouseClaimingAge}
                  valueColor={spouseClaimingAge < SS_FRA ? C.orange : spouseClaimingAge > SS_FRA ? C.green : C.gold} />
                <p style={{ margin: "-6px 0 0", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  {spouseBenefitBasis === "spousal"
                    ? "Spousal benefit: early claims are reduced; delaying past 67 has no effect."
                    : "Own-record benefit: early claims are reduced; delayed claims earn credits up to age 70."}
                </p>

                {/* Advisory note when the unchosen basis would pay more */}
                {spouseAltHigher && (
                  <p style={{ margin: "10px 0 0", fontSize: 10, color: C.orange, lineHeight: 1.6,
                    background: "#1a1200", borderLeft: `3px solid ${C.orange}`, borderRadius: 4, padding: "6px 10px" }}>
                    Note: their {spouseBenefitBasis === "spousal" ? "own-record" : "spousal"} benefit would be higher
                    (~{fmt(spouseAlt)}/yr) — consider switching to that basis.
                  </p>
                )}
              </div>
              <div className="det-stat-3" style={{ gap: 10 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Spouse Benefit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>{fmt(spouseSsBenefit)}/yr</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {spouseBenefitBasis === "own" ? "own record" : "spousal (50% of primary)"}
                    {spouseClaimingAge !== SS_FRA ? `, age ${spouseClaimingAge}` : ", at FRA"}
                  </p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Combined Household SS</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>{fmt(householdSS)}/yr</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>${Math.round(householdSS / ASSUMPTIONS.MONTHS_PER_YEAR).toLocaleString()}/mo</p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>SS Coverage</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>
                    {effectiveExpenses > 0 ? `${Math.round((householdSS / effectiveExpenses) * 100)}%` : "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>of annual expenses</p>
                </div>
              </div>
            </div>
          </div>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700 }}>Pension Income</p>
            </div>
            <div style={{ background: "#0a0e14", borderLeft: `3px solid ${C.blue}`, borderRadius: 6,
              padding: "10px 14px", marginBottom: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: C.text, fontWeight: 600 }}>Do you have a pension?</p>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                Defined-benefit pensions are common for government, education, military, and union workers.
                If you'll receive a monthly pension, enter the amount here. It reduces how much you need
                to draw from your portfolio — just like Social Security — and flows into all drawdown, Roth
                conversion bracket fill, and withdrawal strategy calculations.
              </p>
            </div>
            <div className="det-2col" style={{ gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Slider label="Monthly Pension Amount" value={pensionMonthly}
                  min={0} max={10_000} step={100}
                  format={v => v === 0 ? "None" : `${fmtFull(v)}/mo`}
                  onChange={setPensionMonthly} valueColor={C.blue} />
                {pensionMonthly > 0 && (
                  <Slider label="Pension Start Age" value={pensionStartAge} min={50} max={75}
                    format={v => v <= safeRetAge ? `${v} (at/before retirement)` : `${v} (after retirement)`}
                    onChange={setPensionStartAge} valueColor={C.blue} />
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Annual Pension</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.blue, ...mono }}>
                    {pensionMonthly > 0 ? fmt(pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR) : "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {pensionMonthly > 0 ? `starting age ${pensionStartAge}` : "no pension entered"}
                  </p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Effective at Retirement</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: effectivePension > 0 ? C.green : C.muted, ...mono }}>
                    {effectivePension > 0 ? fmt(effectivePension) : "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {pensionMonthly > 0 && pensionStartAge > safeRetAge
                      ? `starts ${pensionStartAge - safeRetAge} yrs after retirement`
                      : effectivePension > 0 ? "included in drawdown calcs" : "not applicable"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.07em", fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
              Required Minimum Distributions (RMDs)
            </p>
            <div style={{ background: "#0a0e14", borderLeft: `3px solid ${C.blue}`, borderRadius: 6,
              padding: "10px 14px", marginBottom: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: C.text, fontWeight: 600 }}>What is an RMD?</p>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                The IRS requires you to withdraw a minimum amount from your Traditional 401k every year starting at age 73 — whether you need the money or not.
                These withdrawals are called Required Minimum Distributions (RMDs). You cannot skip them or reinvest them back into the 401k.
              </p>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                The amount is calculated by dividing your account balance by an IRS life expectancy factor (shown as a divisor in the table below).
                As you age, the divisor shrinks, forcing larger and larger withdrawals each year.
              </p>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                <span style={{ color: C.orange }}>Why it matters:</span> RMDs are taxed as ordinary income — just like a paycheck.
                A large RMD can push you into a higher bracket, trigger Medicare premium surcharges (IRMAA), and make more of your Social Security taxable.
                The best way to reduce future RMDs is to <span style={{ color: C.blue }}>convert portions of your 401k to a Roth IRA</span> during
                the years between retirement and age 73, when your income is typically lower.
              </p>
            </div>
            <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: C.text, fontWeight: 600 }}>
                Which IRS life expectancy table applies to you?
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                The IRS has 3 tables. For account owners during their lifetime, two are relevant:
                <span style={{ color: C.gold }}> Table III</span> applies to most people.
                <span style={{ color: C.blue }}> Table II</span> (Joint Life) gives larger divisors — meaning <em>smaller</em> required withdrawals —
                but only when your spouse is both your sole 401k beneficiary AND more than 10 years younger than you.
              </p>
              <div className="det-rmd-ctrl" style={{ gap: 12 }}>
                <div>
                  <p style={{ margin: "0 0 5px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Marital Status</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Single", "Married"].map(opt => (
                      <button key={opt} onClick={() => setIsMarried(opt === "Married")}
                        style={{ flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600, border: "none",
                          borderRadius: 5, cursor: "pointer",
                          background: (isMarried ? "Married" : "Single") === opt ? C.gold : C.border,
                          color: (isMarried ? "Married" : "Single") === opt ? "#0d1117" : C.muted,
                          fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ opacity: isMarried ? 1 : 0.35, pointerEvents: isMarried ? "auto" : "none" }}>
                  <p style={{ margin: "0 0 5px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Spouse is sole 401k beneficiary?</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["No", "Yes"].map(opt => (
                      <button key={opt} onClick={() => setSpouseIsSoleBenef(opt === "Yes")}
                        style={{ flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600, border: "none",
                          borderRadius: 5, cursor: "pointer",
                          background: (spouseIsSoleBenef ? "Yes" : "No") === opt ? C.blue : C.border,
                          color: (spouseIsSoleBenef ? "Yes" : "No") === opt ? "#fff" : C.muted,
                          fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ opacity: isMarried && spouseIsSoleBenef ? 1 : 0.35, pointerEvents: isMarried && spouseIsSoleBenef ? "auto" : "none" }}>
                  <p style={{ margin: "0 0 5px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Spouse's current age</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="range" min={18} max={currentAge - 1} step={1} value={spouseCurrentAge}
                      onChange={e => setSpouseCurrentAge(Number(e.target.value))}
                      style={{ flex: 1, accentColor: C.blue }} />
                    <span style={{ fontSize: 13, color: C.blue, ...mono, minWidth: 24 }}>{spouseCurrentAge}</span>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: 9, color: currentAge - spouseCurrentAge > 10 ? C.green : C.orange }}>
                    {currentAge - spouseCurrentAge > 10
                      ? `${currentAge - spouseCurrentAge} yrs younger — qualifies for Table II`
                      : `${currentAge - spouseCurrentAge} yrs younger — Table II needs gap > 10 yrs`}
                  </p>
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Active table:</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: useTable2 ? C.blue : C.gold, ...mono }}>
                  {activeTableLabel}
                </span>
                <span style={{ fontSize: 10, color: C.muted }}>
                  {useTable2
                    ? "— divisors are larger, so your annual RMDs will be smaller"
                    : "— standard divisors apply"}
                </span>
              </div>
            </div>
            <div style={{ background: C.card, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.text, fontWeight: 600 }}>
                Additional pre-tax balance from outside accounts
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                Include old 401k, 403b, or IRA balances held at other custodians. The IRS requires RMDs on your
                <em> total</em> pre-tax balance across all accounts — not just the one tracked above.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.muted, minWidth: 24 }}>$</span>
                <input
                  type="number" min={0} step={1000}
                  value={addlPreTaxBal || ""}
                  placeholder="0"
                  onChange={e => setAddlPreTaxBal(Math.max(0, Number(e.target.value) || 0))}
                  style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.gold, fontSize: 13, padding: "3px 8px",
                    outline: "none", ...mono }}
                />
              </div>
              {addlPreTaxBal > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 9, color: C.orange, lineHeight: 1.5 }}>
                  +{fmt(addlPreTaxBal)} from outside accounts added to RMD basis — IRS calculates RMDs on the aggregate total.
                </p>
              )}
            </div>

            {safeRetAge >= RMD_START_AGE ? (
              <p style={{ margin: "0 0 16px", fontSize: 12, color: C.muted }}>
                Your retirement age ({safeRetAge}) is at or after 73 — RMDs begin as soon as you retire.
              </p>
            ) : (
              <div className="det-stat-3" style={{ gap: 10, marginBottom: 16 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>First RMD at 73</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.orange, ...mono }}>
                    {firstRMD ? fmt(firstRMD.rmd) : "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>mandatory withdrawal · taxed as income</p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Lifetime RMD Total</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.orange, ...mono }}>{fmt(totalRMDs)}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>forced out of 401k · age 73 → {safeLifeExp}</p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Est. Total Tax on RMDs</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.orange, ...mono }}>{fmt(rmdTaxBite)}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>at {(effectiveRMDTaxRate*100).toFixed(1)}% effective rate (bracket-accurate)</p>
                </div>
              </div>
            )}
            <p style={{ margin: "0 0 8px", fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              The table below shows your projected 401k balance each year, the RMD the IRS will require, and the estimated tax owed on it.
              <span style={{ color: C.text }}> Est. 401k Balance</span> is what remains after that year's RMD is taken.
              Use this to understand how quickly your 401k depletes and how much of it goes to taxes.
            </p>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, auto)", gap: "4px 20px",
                fontSize: 11, minWidth: 440 }}>
                {["Age", "IRS Divisor", "Est. 401k Balance", "RMD Amount", `Tax (~${(effectiveRMDTaxRate*100).toFixed(1)}% eff.)`].map(h => (
                  <span key={h} style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{h}</span>
                ))}
                {rmdDataWithTax.slice(0, 10).map(({ age, rmd, bal, divisor, tax }) => (
                  [
                    <span key={`a${age}`} style={{ color: C.gold, ...mono }}>{age}</span>,
                    <span key={`d${age}`} style={{ color: C.muted, ...mono }}>{divisor ?? "—"}</span>,
                    <span key={`b${age}`} style={{ color: C.text, ...mono }}>{fmt(bal)}</span>,
                    <span key={`r${age}`} style={{ color: C.orange, ...mono }}>{fmt(rmd)}</span>,
                    <span key={`t${age}`} style={{ color: C.muted, ...mono }}>{fmt(tax)}</span>,
                  ]
                ))}
              </div>
              {rmdData.length > 10 && (
                <p style={{ margin: "8px 0 0", fontSize: 10, color: C.muted }}>
                  Showing first 10 RMD years · {rmdData.length} total years projected
                </p>
              )}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
              Projected using your {returnRate}% return assumption. Actual RMDs depend on your final balance and IRS divisors in effect at that time.
              RMDs from inherited IRAs have different rules and are not modeled here.
            </p>
          </div>

          <div>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.07em", fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
              Roth Conversion Strategy
            </p>
            <div style={{ background: "#0a0e14", borderLeft: `3px solid ${C.blue}`, borderRadius: 6,
              padding: "10px 14px", marginBottom: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: C.text, fontWeight: 600 }}>What is a Roth Conversion Ladder?</p>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                A Roth conversion moves money from your pre-tax 401k into your Roth IRA.
                You pay ordinary income tax on the amount converted now, but it then grows tax-free and is never subject to RMDs.
              </p>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                The <span style={{ color: C.blue }}>conversion window</span> is the gap between retirement and age 73, when your income
                is typically lower — no W-2, no RMDs yet. Converting systematically across multiple years in this window
                to fill a lower bracket is called a <em>Roth conversion ladder</em>. The goal is to pre-pay tax at a lower rate now
                rather than be forced to withdraw at a higher rate from RMDs later.
              </p>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                <span style={{ color: C.orange }}>5-year rule:</span> Each year's conversion starts its own 5-year clock.
                If you retire at 59½ or later the early withdrawal penalty does not apply to conversions, but earnings in a Roth account
                still require the account to be at least 5 years old AND you to be 59½+ to be withdrawn tax-free.
              </p>
            </div>
            {conversionWindowYrs === 0 ? (
              <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                  No conversion window available — your retirement age ({safeRetAge}) is at or after 73.
                  RMDs begin immediately, leaving no low-income years for strategic conversions.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                  <p style={{ margin: "0 0 12px", fontSize: 11, color: C.text, fontWeight: 600 }}>
                    Conversion Strategy
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 400, marginLeft: 8 }}>
                      {conversionWindowYrs}-year window · age {resolvedStartAge} → {resolvedEndAge}
                    </span>
                  </p>
                  <div style={{ marginBottom: 14 }}>
                    <Slider label="Start converting at age" value={resolvedStartAge}
                      min={convWindowFloor} max={convWindowCeil} step={1}
                      format={v => `age ${v}`}
                      onChange={v => setConversionStartAge(Math.min(v, resolvedEndAge))}
                      valueColor={C.blue} />
                    <Slider label="Stop converting at age" value={resolvedEndAge}
                      min={convWindowFloor} max={convWindowCeil} step={1}
                      format={v => `age ${v}`}
                      onChange={v => setConversionEndAge(Math.max(v, resolvedStartAge))}
                      valueColor={C.blue} />
                    <p style={{ margin: "2px 0 0", fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                      The low-income “gap years” between retirement and age {RMD_START_AGE} (when RMDs begin)
                      are usually the best time to convert. Default fills the whole window.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                    {[["bracket", "Fill a bracket"], ["custom", "Custom amount"]].map(([id, label]) => (
                      <button key={id} onClick={() => setConversionMode(id)} style={{
                        padding: "6px 14px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 5,
                        cursor: "pointer",
                        background: conversionMode === id ? C.blue : C.border,
                        color:      conversionMode === id ? "#fff" : C.muted,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}>{label}</button>
                    ))}
                  </div>
                  {conversionMode === "bracket" && (
                    <div>
                      <p style={{ margin: "0 0 8px", fontSize: 11, color: C.muted }}>
                        Convert each year until income reaches the top of which bracket?
                      </p>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        {[12, 22, 24].map(pct => (
                          <button key={pct} onClick={() => setConversionBracketTarget(pct)} style={{
                            padding: "6px 16px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 5,
                            cursor: "pointer",
                            background: conversionBracketTarget === pct ? C.gold : C.border,
                            color:      conversionBracketTarget === pct ? "#0d1117" : C.muted,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}>{pct}%</button>
                        ))}
                      </div>
                      <p style={{ margin: 0, fontSize: 10, color: C.muted }}>
                        Suggested annual conversion: <span style={{ color: C.gold, ...mono }}>
                          {convTargetVaries ? `${fmt(convPeakTarget)} → ${fmt(convSteadyTarget)}` : fmt(bracketFillConversion)}
                        </span>
                        {convTargetVaries
                          ? <span style={{ color: C.muted }}> · larger in early years before SS/pension start, tapering once they begin</span>
                          : <span style={{ color: C.muted }}> · assumes SS ({fmt(householdSS)}/yr, 85% taxable){effectivePension > 0 ? ` + pension (${fmt(effectivePension)}/yr)` : ""} as other ordinary income</span>}
                      </p>
                    </div>
                  )}
                  {conversionMode === "custom" && (
                    <Slider label="Annual conversion amount" value={annualConversionAmt}
                      min={0} max={500_000} step={5_000}
                      format={v => fmtFull(v)}
                      onChange={setAnnualConversionAmt} valueColor={C.blue} />
                  )}
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", marginBottom: 14,
                  borderLeft: `3px solid ${C.purple}` }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: C.text, fontWeight: 600 }}>
                    Where does the conversion tax come from?
                  </p>
                  <p style={{ margin: "0 0 10px", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                    When you convert 401k → Roth, you owe tax on the amount converted. That tax payment can come
                    from the converted amount itself (reducing what lands in Roth) or from your taxable brokerage account
                    (preserving the full conversion in Roth). Paying from taxable is more efficient — you keep more in Roth.
                  </p>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {[["converted", "From converted amount"], ["taxable", "From taxable brokerage"]].map(([id, label]) => (
                      <button key={id} onClick={() => setConversionTaxSource(id)} style={{
                        padding: "6px 14px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 5,
                        cursor: "pointer",
                        background: conversionTaxSource === id ? C.purple : C.border,
                        color:      conversionTaxSource === id ? "#fff" : C.muted,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}>{label}</button>
                    ))}
                  </div>
                  {conversionSim.rothAdvantage > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                      <div style={{ background: C.surface, borderRadius: 6, padding: "8px 10px" }}>
                        <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>Roth (tax from converted)</p>
                        <p style={{ margin: 0, fontSize: 14, color: C.muted, ...mono }}>{fmt(conversionSim.rothBalEnd_conv)}</p>
                      </div>
                      <div style={{ background: C.surface, borderRadius: 6, padding: "8px 10px" }}>
                        <p style={{ margin: "0 0 2px", fontSize: 9, color: C.green }}>Roth (tax from taxable) ✓</p>
                        <p style={{ margin: 0, fontSize: 14, color: C.green, ...mono }}>{fmt(conversionSim.rothBalEnd_tax)}</p>
                      </div>
                      <div style={{ gridColumn: "1 / -1", background: `${C.green}12`, borderRadius: 6, padding: "6px 10px" }}>
                        <p style={{ margin: 0, fontSize: 10, color: C.green }}>
                          Paying from taxable puts <span style={{ fontWeight: 700, ...mono }}>{fmt(conversionSim.rothAdvantage)}</span> more into Roth
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="det-stat-4" style={{ gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Annual Conversion",
                      val: convTargetVaries ? `${fmt(convPeakTarget)} → ${fmt(convSteadyTarget)}` : fmt(annualConversion),
                      sub: convTargetVaries ? "tapers as SS/pension begin" : "per year during window",
                      color: C.blue   },
                    { label: "Conversion Tax Cost", val: fmt(retPhase.conversionCost),     sub: "paid now, pre-RMD",             color: C.orange },
                    { label: "RMD Tax Saved",       val: fmt(rmdTaxSaved),                 sub: "vs no conversions",             color: C.green  },
                    { label: netConversionBenefit >= 0 ? "Net Savings" : "Net Cost",
                      val: fmt(Math.abs(netConversionBenefit)),
                      sub: netConversionBenefit >= 0 ? "strategy pays off" : "conversions cost more than saved",
                      color: netConversionBenefit >= 0 ? C.green : C.orange },
                  ].map(({ label, val, sub, color }) => (
                    <div key={label} style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                      <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>{label}</p>
                      <p style={{ margin: "0 0 2px", fontSize: 18, color, ...mono }}>{val}</p>
                      <p style={{ margin: 0, fontSize: 9, color: C.muted }}>{sub}</p>
                    </div>
                  ))}
                </div>
                {/* Healthcare Cost Impact on Conversions */}
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: C.text, fontWeight: 600 }}>
                    Healthcare Cost Impact
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button onClick={() => setHasMarketplaceInsurance(v => !v)} style={{
                      padding: "5px 12px", fontSize: 10, fontWeight: 600, border: "none", borderRadius: 5,
                      cursor: "pointer",
                      background: hasMarketplaceInsurance ? C.blue : C.border,
                      color: hasMarketplaceInsurance ? "#fff" : C.muted,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>Marketplace Insurance</button>
                    <button onClick={() => setHasMedicare(v => !v)} style={{
                      padding: "5px 12px", fontSize: 10, fontWeight: 600, border: "none", borderRadius: 5,
                      cursor: "pointer",
                      background: hasMedicare ? C.purple : C.border,
                      color: hasMedicare ? "#fff" : C.muted,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>Medicare / IRMAA</button>
                  </div>
                  {hasMarketplaceInsurance && (
                    <div style={{ marginBottom: 10 }}>
                      <Slider label="Household size" value={householdSize} min={1} max={6} step={1}
                        format={v => `${v} person${v > 1 ? "s" : ""}`} onChange={setHouseholdSize} valueColor={C.blue} />
                      <div style={{ marginTop: 8 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Monthly marketplace premium (optional)
                        </p>
                        <DeferredInput
                          value={marketplaceMonthlyPremium ?? ""}
                          placeholder="e.g. 800"
                          onChange={v => setMarketplaceMonthlyPremium(v === "" ? null : Number(v))}
                          style={{ width: 120, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
                            color: C.text, fontSize: 12, padding: "4px 8px" }}
                        />
                      </div>
                      {acaCliffYears.length > 0 ? (
                        <div style={{ marginTop: 8, background: "#2a1a0a", border: `1px solid ${C.orange}`,
                          borderRadius: 6, padding: "8px 10px" }}>
                          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: C.orange }}>
                            ACA Cliff Warning — {acaCliffYears.length} year{acaCliffYears.length > 1 ? "s" : ""} exceed 400% FPL
                          </p>
                          <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                            At {householdSize}-person household, the subsidy cliff is{" "}
                            <span style={{ color: C.text, ...mono }}>{fmt(acaCliffThreshold(householdSize))}</span> MAGI.
                            Conversions push you over in ages:{" "}
                            <span style={{ color: C.orange, ...mono }}>{acaCliffYears.map(e => e.age).join(", ")}</span>.
                            {acaAnnualLoss > 0 && (
                              <> Estimated subsidy loss: <span style={{ color: C.orange, ...mono }}>{fmt(acaAnnualLoss)}</span> total.</>
                            )}
                          </p>
                        </div>
                      ) : hasMarketplaceInsurance && safeRetAge < MEDICARE_AGE ? (
                        <p style={{ margin: "8px 0 0", fontSize: 10, color: C.green }}>
                          No ACA cliff crossings — conversions stay under {fmt(acaCliffThreshold(householdSize))} each year.
                        </p>
                      ) : null}
                    </div>
                  )}
                  {hasMedicare && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        {[1, 2].map(n => (
                          <button key={n} onClick={() => setPersonOnMedicare(n)} style={{
                            padding: "4px 10px", fontSize: 10, fontWeight: 600, border: "none", borderRadius: 5,
                            cursor: "pointer",
                            background: personOnMedicare === n ? C.purple : C.border,
                            color: personOnMedicare === n ? "#fff" : C.muted,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}>{n === 1 ? "1 person" : "2 persons"}</button>
                        ))}
                      </div>
                      {totalIRMAACost > 0 ? (
                        <div style={{ background: "#1a0a2a", border: `1px solid ${C.purple}`,
                          borderRadius: 6, padding: "8px 10px" }}>
                          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: C.purple }}>
                            IRMAA Surcharge — {fmt(totalIRMAACost)} total ({personOnMedicare === 2 ? "2 persons" : "1 person"})
                          </p>
                          <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                            Conversion income at these ages triggers Medicare Part B+D surcharges (2-year lookback).
                            Per-year costs:{" "}
                            {healthcareExposure.filter(e => (e.irmaa?.surcharge ?? 0) > 0).map(e => (
                              <span key={e.age} style={{ color: C.purple, ...mono }}>
                                {e.age}: {fmt(e.irmaa.surcharge * personOnMedicare)}{" "}
                              </span>
                            ))}
                          </p>
                        </div>
                      ) : (
                        <p style={{ margin: "4px 0 0", fontSize: 10, color: C.green }}>
                          No IRMAA surcharges — conversions stay below Medicare thresholds.
                        </p>
                      )}
                    </div>
                  )}
                  {(hasMarketplaceInsurance || hasMedicare) && (totalIRMAACost > 0 || acaAnnualLoss > 0) && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ background: C.bg, borderRadius: 6, padding: "6px 10px", minWidth: 110 }}>
                          <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>Gross Conversion Benefit</p>
                          <p style={{ margin: 0, fontSize: 14, color: netConversionBenefit >= 0 ? C.green : C.orange, ...mono }}>
                            {fmt(Math.abs(netConversionBenefit))}
                          </p>
                        </div>
                        {totalIRMAACost > 0 && (
                          <div style={{ background: C.bg, borderRadius: 6, padding: "6px 10px", minWidth: 110 }}>
                            <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>IRMAA Cost</p>
                            <p style={{ margin: 0, fontSize: 14, color: C.purple, ...mono }}>−{fmt(totalIRMAACost)}</p>
                          </div>
                        )}
                        {acaAnnualLoss > 0 && (
                          <div style={{ background: C.bg, borderRadius: 6, padding: "6px 10px", minWidth: 110 }}>
                            <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>ACA Subsidy Loss</p>
                            <p style={{ margin: 0, fontSize: 14, color: C.orange, ...mono }}>−{fmt(acaAnnualLoss)}</p>
                          </div>
                        )}
                        <div style={{ background: C.bg, borderRadius: 6, padding: "6px 10px", minWidth: 110 }}>
                          <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>Adjusted Net Benefit</p>
                          <p style={{ margin: 0, fontSize: 14,
                            color: adjustedNetConversionBenefit >= 0 ? C.green : C.orange, ...mono }}>
                            {fmt(Math.abs(adjustedNetConversionBenefit))}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {optimizerResult && (hasMedicare || hasMarketplaceInsurance)
                    && (Math.abs(optimizerResult.optimalConversion - annualConversion) > 4_999
                      || optimizerResult.optimalStartAge !== resolvedStartAge) && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8,
                      background: "#0a1a0a", borderRadius: 6, padding: "8px 10px" }}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: C.green }}>
                        Optimizer Suggestion
                      </p>
                      <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                        Converting{" "}
                        <span style={{ color: C.green, fontWeight: 600, ...mono }}>{fmt(optimizerResult.optimalConversion)}/yr</span>
                        {" "}starting at age{" "}
                        <span style={{ color: C.green, fontWeight: 600, ...mono }}>{optimizerResult.optimalStartAge}</span>
                        {" "}maximizes net benefit after healthcare costs (IRMAA{hasMarketplaceInsurance ? " + ACA" : ""})
                        (estimated <span style={{ color: C.green, ...mono }}>{fmt(optimizerResult.optimalBenefit)}</span> net).
                        {" "}Your current setting is{" "}
                        <span style={{ color: C.blue, ...mono }}>{fmt(annualConversion)}/yr</span>
                        {" "}from age <span style={{ color: C.blue, ...mono }}>{resolvedStartAge}</span>.
                      </p>
                    </div>
                  )}
                  {!hasMarketplaceInsurance && !hasMedicare && (
                    <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                      Enable toggles above to model how Roth conversion income affects marketplace insurance
                      subsidies (ACA cliff) or Medicare premium surcharges (IRMAA).
                    </p>
                  )}
                </div>
                <div className="det-2col" style={{ gap: 16, marginBottom: 14 }}>
                  <div>
                    <p style={{ margin: "0 0 6px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Conversion window — year by year
                    </p>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 14px", minWidth: 280 }}>
                        {["Age", "Converted", "401k Left", "Tax Paid"].map(h => (
                          <span key={h} style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                            letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }}>{h}</span>
                        ))}
                        {conversionSim.years.slice(0, 12).map(({ age, conversion, tradBal, tax }) => [
                          <span key={`ca${age}`} style={{ fontSize: 11, color: C.gold, ...mono }}>{age}</span>,
                          <span key={`cc${age}`} style={{ fontSize: 11, color: C.blue, ...mono }}>{fmt(conversion)}</span>,
                          <span key={`ct${age}`} style={{ fontSize: 11, color: C.text, ...mono }}>{fmt(tradBal)}</span>,
                          <span key={`cx${age}`} style={{ fontSize: 11, color: C.muted, ...mono }}>{fmt(tax)}</span>,
                        ])}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p style={{ margin: "0 0 6px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      RMD impact — first 8 years at age 73+
                    </p>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "4px 14px", minWidth: 220 }}>
                        {["Age", "No Conversion", "W/ Conversions"].map(h => (
                          <span key={h} style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                            letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }}>{h}</span>
                        ))}
                        {retPhase.rmdScheduleNoConv.slice(0, 8).map((row) => {
                          const planRow = rmdData.find(d => d.age === row.age);
                          return [
                            <span key={`ra${row.age}`} style={{ fontSize: 11, color: C.gold, ...mono }}>{row.age}</span>,
                            <span key={`ro${row.age}`} style={{ fontSize: 11, color: C.orange, ...mono }}>{fmt(row.rmd)}</span>,
                            <span key={`rp${row.age}`} style={{ fontSize: 11, color: planRow && planRow.rmd < row.rmd ? C.green : C.text, ...mono }}>
                              {planRow ? fmt(planRow.rmd) : "—"}
                            </span>,
                          ];
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ background: "#0a0e14", borderLeft: `3px solid ${C.purple}`, borderRadius: 6,
              padding: "10px 14px", marginBottom: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: C.text, fontWeight: 600 }}>Mega Backdoor Roth</p>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                If your 401k plan allows it, you can make <span style={{ color: C.purple }}>after-tax contributions</span> beyond
                the normal elective deferral limit, then immediately convert them to Roth — either in-plan (in-service rollover) or
                rolled into a Roth IRA. This dramatically increases how much you can shelter from future taxes.
              </p>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                The 2026 IRS 415(c) combined limit is <span style={{ color: C.purple }}>{fmt(limit415c)}</span> (
                {currentAge >= CATCHUP_AGE ? "includes 50+ catch-up" : "under 50"}).
                Subtracting your employee contributions ({fmt(contrib401k)}) and employer match leaves the after-tax window.
                Not all plans allow this — check your Summary Plan Description (SPD). Unlike conversion ladder conversions,
                this has <span style={{ color: C.green }}>no RMD risk</span> since it goes directly into Roth.
              </p>
            </div>
            <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ margin: "0 0 12px", fontSize: 11, color: C.text, fontWeight: 600 }}>Mega Backdoor Capacity Calculator</p>
              <div style={{ marginBottom: 10 }}>
                <p style={{ margin: "0 0 6px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Employer Match Type
                </p>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[["flat", "Flat % of salary"], ["formula", "% of first N%"]].map(([id, label]) => (
                    <button key={id} onClick={() => setMatchMode(id)} style={{
                      padding: "5px 12px", fontSize: 10, fontWeight: 600, border: "none", borderRadius: 5,
                      cursor: "pointer",
                      background: matchMode === id ? C.purple : C.border,
                      color:      matchMode === id ? "#fff" : C.muted,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>{label}</button>
                  ))}
                </div>
                {matchMode === "flat" ? (
                  <Slider label="Employer match (% of salary)" value={employerMatchPct} min={0} max={10} step={0.5}
                    format={v => `${v}%`} onChange={setEmployerMatchPct} valueColor={C.purple} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Slider label="Match rate" value={matchFormulaRate} min={0} max={200} step={5}
                      format={v => `${v}%`} onChange={setMatchFormulaRate} valueColor={C.purple} />
                    <Slider label="Of the first N% of salary" value={matchFormulaCap} min={1} max={15} step={0.5}
                      format={v => `${v}%`} onChange={setMatchFormulaCap} valueColor={C.purple} />
                    <p style={{ margin: "-4px 0 0", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                      Your employer matches <span style={{ color: C.purple, fontWeight: 600 }}>{matchFormulaRate}%</span> of the
                      first <span style={{ color: C.purple, fontWeight: 600 }}>{matchFormulaCap}%</span> of your salary.
                      {contrib401k > 0 && (
                        <> You contribute {fmt(contrib401k)}, employer adds <span style={{ color: C.purple, ...mono }}>{fmt(employerMatchAmt)}</span>.</>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div className="det-stat-4" style={{ gap: 10, marginTop: 10 }}>
                <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>415(c) Limit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 16, color: C.purple, ...mono }}>{fmt(limit415c)}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>combined 2026 cap</p>
                </div>
                <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Employer Match</p>
                  <p style={{ margin: "0 0 2px", fontSize: 16, color: C.purple, ...mono }}>{fmt(employerMatchAmt)}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {matchMode === "formula"
                      ? `${matchFormulaRate}% of first ${matchFormulaCap}%`
                      : `${employerMatchPct}% of ${fmt(currentIncome)}`}
                  </p>
                </div>
                <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>After-Tax Space</p>
                  <p style={{ margin: "0 0 2px", fontSize: 16, color: C.purple, ...mono }}>{fmt(megaCapacity)}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>415(c) − employee − match</p>
                </div>
                <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted }}>If contributed for N years</p>
                  {megaGrowth.map(({ yrs, val }) => (
                    <p key={yrs} style={{ margin: 0, fontSize: 10, color: C.purple, ...mono }}>{yrs}yr: {fmt(val)}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <p style={{ margin: "0 0 14px", fontSize: 11, color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.07em", fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
              Tax-Efficient Withdrawal Strategy
            </p>
            <div className="det-2col" style={{ gap: 24 }}>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: C.text }}>
                  Annual need from portfolio: <span style={{ color: C.gold, ...mono }}>{fmt(netPortfolioNeed)}</span>
                  <span style={{ fontSize: 10, color: C.muted }}> (expenses{ssAtRet > 0 ? " − SS" : ""}{effectivePension > 0 ? " − pension" : ""})</span>
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { step: 1, label: "Taxable Brokerage", color: C.green,  detail: `LTCG rates · ${fmt(retTaxable)} available`,   tax: "0–20% on gains" },
                    { step: 2, label: "Traditional 401k",  color: C.gold,   detail: `Ordinary income · ${fmt(retTrad)} available`,  tax: `${(yr1TradRate*100).toFixed(1)}% marginal` },
                    { step: 3, label: "Roth IRA",          color: C.blue,   detail: `Tax-free · ${fmt(retRoth)} available`,         tax: "0%" },
                    { step: 4, label: "HSA",               color: C.purple, detail: "Qualified medical only · triple tax-free",     tax: "0% (medical)" },
                  ].map(({ step, label, color, detail, tax }) => (
                    <div key={step} style={{ display: "flex", alignItems: "center", gap: 10,
                      background: C.card, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "#0d1117", flexShrink: 0 }}>
                        {step}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 12, color, fontWeight: 600 }}>{label}</p>
                        <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{detail}</p>
                      </div>
                      <span style={{ fontSize: 11, color: C.muted, ...mono, flexShrink: 0 }}>{tax}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Year 1 Estimated Tax — Optimal Order
                  </p>
                  <p style={{ margin: "0 0 4px", fontSize: 22, color: C.green, ...mono }}>{fmt(yr1TaxOptimal)}</p>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7 }}>
                    {yr1FromTaxable > 0 && <p style={{ margin: 0 }}>Taxable: {fmt(yr1FromTaxable)} · LTCG rate</p>}
                    {yr1FromTrad    > 0 && <p style={{ margin: 0 }}>401k: {fmt(yr1FromTrad)} · {(yr1TradRate*100).toFixed(1)}% marginal (fed+state)</p>}
                    {yr1FromRoth    > 0 && <p style={{ margin: 0 }}>Roth: {fmt(yr1FromRoth)} · tax-free</p>}
                  </div>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Est. Annual Tax Savings vs Drawing 401k First
                  </p>
                  <p style={{ margin: 0, fontSize: 22, color: C.gold, ...mono }}>{fmt(yr1TaxSavings)}</p>
                </div>
                <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                  Note: RMDs from your 401k at age 73 are mandatory regardless of order.
                  Factor those into your bracket planning each year.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
      )}

      {activeTab === "flowdown" && (
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ ...panel, marginBottom: 0, borderBottom: "none",
            borderRadius: "10px 10px 0 0", padding: "20px 20px 16px" }}>
            <div className="fd-header-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                  letterSpacing: "0.12em", fontWeight: 700 }}>Your Financial Flow-Down</p>
                <p style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>
                  Age {currentAge} → {safeLifeExp}
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 400, marginLeft: 8 }}>{safeLifeExp - currentAge} years</span>
                </p>
              </div>
              {optimized.actionCount > 0 && (
                <div style={{ background: `${C.green}12`, borderRadius: 6, padding: "4px 10px", border: `1px solid ${C.green}25` }}>
                  <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>
                    {optimized.actionCount} optimization{optimized.actionCount !== 1 ? "s" : ""} available
                  </span>
                </div>
              )}
            </div>

            {optimized.hasImprovement ? (
              <div style={{ background: C.card, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                <div className="fd-compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 0,
                  borderBottom: `1px solid ${C.border}`, padding: "8px 14px" }}>
                  <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}></span>
                  <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, textAlign: "right" }}>Current</span>
                  <span style={{ fontSize: 9, color: C.green, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, textAlign: "right" }}>Optimized</span>
                </div>
                {[
                  {
                    label: "At Retirement",
                    current: fmt(totalAtRet),
                    opt: fmt(optimized.totalAtRet),
                    improved: optimized.totalAtRet > totalAtRet * 1.01,
                    sub: optimized.extraPortfolio > 0
                      ? `+${fmt(optimized.extraPortfolio)} from deploying ${savingsSurplusPct}% of surplus`
                      : null,
                  },
                  {
                    label: "Withdrawal Rate",
                    current: `${withdrawalRate.toFixed(1)}%`,
                    opt: `${optimized.withdrawalRate.toFixed(1)}%`,
                    improved: optimized.withdrawalRate < withdrawalRate - 0.2,
                    sub: optimized.withdrawalRate <= 4 && withdrawalRate > 4 ? "enters safe zone (≤ 4%)" : null,
                  },
                  {
                    label: "Portfolio Lasts To",
                    current: yearsSustained === Infinity ? "∞" : `Age ${Math.floor(safeRetAge + yearsSustained)}`,
                    opt: optimized.yearsSustained === Infinity ? "∞" : `Age ${Math.floor(safeRetAge + optimized.yearsSustained)}`,
                    improved: optimized.yearsSustained > yearsSustained * 1.03,
                    sub: (() => {
                      if (optimized.sustainable && !isSustainable) return "now fully sustained";
                      if (optimized.yearsSustained === Infinity && yearsSustained === Infinity) return null;
                      if (optimized.yearsSustained === Infinity) return "self-sustaining";
                      const gain = Math.floor(optimized.yearsSustained - yearsSustained);
                      return gain > 0 ? `+${gain} year${gain !== 1 ? "s" : ""} of coverage` : null;
                    })(),
                  },
                  ...(optimized.annualTaxSaving > 0 || optimized.lifetimeConvBenefit > 0 ? [{
                    label: "Tax Efficiency",
                    current: "—",
                    opt: fmt(optimized.annualTaxSaving + optimized.lifetimeConvBenefit),
                    improved: true,
                    sub: [
                      optimized.annualTaxSaving > 0 ? `${fmt(optimized.annualTaxSaving)}/yr withdrawal order` : null,
                      optimized.lifetimeConvBenefit > 0 ? `${fmt(optimized.lifetimeConvBenefit)} Roth conversion` : null,
                    ].filter(Boolean).join(" + "),
                  }] : []),
                ].map(({ label, current, opt, improved, sub }, i) => (
                  <div key={i} className="fd-compare-grid" style={{
                    display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 0,
                    padding: "8px 14px", borderBottom: `1px solid ${C.border}`,
                    background: improved ? `${C.green}04` : "transparent",
                  }}>
                    <div>
                      <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{label}</span>
                      {sub && <span style={{ display: "block", fontSize: 9, color: C.green, marginTop: 1 }}>{sub}</span>}
                    </div>
                    <span style={{ fontSize: 13, color: C.muted, ...mono, textAlign: "right", alignSelf: "center" }}>{current}</span>
                    <span style={{ fontSize: 13, color: improved ? C.green : C.text,
                      fontWeight: improved ? 700 : 500, ...mono, textAlign: "right", alignSelf: "center" }}>{opt}</span>
                  </div>
                ))}
                <div style={{ padding: "10px 14px", background: `${C.green}06`,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
                    {optimized.sustainable && !isSustainable
                      ? "Following these recommendations makes your plan fully sustainable."
                      : optimized.yearsSustained === Infinity && yearsSustained !== Infinity
                        ? "Optimizations push your portfolio into self-sustaining territory."
                        : `Deploying ${fmt(optimized.allocation.totalExtra)}/yr adds ~${fmt(optimized.extraPortfolio)} to retirement.`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="fd-header-stats" style={{ display: "flex", justifyContent: "center", gap: 24, padding: "8px 0" }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.muted }}>Starting</p>
                  <p style={{ margin: 0, fontSize: 16, color: C.text, ...mono }}>{fmt(flowData.startPortfolio)}</p>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.muted }}>At Retirement</p>
                  <p style={{ margin: 0, fontSize: 16, color: C.gold, ...mono }}>{fmt(totalAtRet)}</p>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.muted }}>Lasts To</p>
                  <p style={{ margin: 0, fontSize: 16, color: C.green, ...mono }}>
                    {yearsSustained === Infinity ? "∞" : `Age ${Math.floor(safeRetAge + yearsSustained)}`}
                  </p>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 10, color: C.muted }}>Ending</p>
                  <p style={{ margin: 0, fontSize: 16,
                    color: flowData.distEndVal > 0 ? C.green : C.orange, ...mono }}>
                    {flowData.distEndVal > 0 ? fmt(flowData.distEndVal) : "$0"}
                  </p>
                </div>
              </div>
            )}

            {optimized.hasImprovement && (
              <p style={{ margin: "10px 0 0", fontSize: 9, color: C.muted, textAlign: "center", fontStyle: "italic" }}>
                "Optimized" deploys {savingsSurplusPct}% of your savings surplus ({fmt(Math.round(availableSurplus * savingsSurplusPct / 100))}/yr) in IRS-priority order
                (match → HSA → Roth → 401k → taxable), delays SS to 70, and uses optimal withdrawal order.
                Adjust your budget and surplus slider in the Simple Planner to explore scenarios.
              </p>
            )}
          </div>

          {(() => {
            const { phase1Steps, phase2Steps, phase3Steps } = generatePhaseSteps(flowData, {
              returnRate, rReal, netPortfolioNeed, effectivePension,
              effectiveRMDTaxRate, safeRetAge, currentAge, safeLifeExp,
            });
            const { phase1Actions, phase2Actions, phase3Actions } = generatePhaseActions({
              totalAtRet, netPortfolioNeed, withdrawalRate, yearsSustained,
              isSustainable, safeRetAge, safeLifeExp, currentAge, effectivePension,
              availableSurplus, savingsSurplusPct, effectiveLiving,
              grossAfterTax, currentContribTotal, contrib401k, contribHSA,
              matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct,
              employerMatchAmt, currentIncome,
              rothPhaseoutWarning, rothFullyPhased, rothMAGI, filingStatus,
              megaCapacity,
              netConversionBenefit, conversionSim, annualConversion,
              convPeakTarget, convSteadyTarget, convTargetVaries,
              conversionWindowYrs, rmdTaxSaved,
              totalRMDs, rmdTaxBite, firstRMD, effectiveRMDTaxRate,
              includeSS, ssClaimingAge, effectiveSS, ss70Annual,
              ss70DrawReduction, ssDelayGainYrs, wr70,
              pensionMonthly,
              yr1TaxSavings,
              optimizedAllocation, optimized,
              depletionAge: flowData.depletionAge, hasConvWindow: flowData.hasConvWindow,
              retTaxable,
            });

            return (
              <>
                <PhaseCard num={1} title="Build Wealth" ageRange={`Age ${currentAge} → ${safeRetAge}`}
                  years={safeRetAge - currentAge} color={C.gold} steps={phase1Steps} note={null} actions={phase1Actions}
                  peakPortfolio={flowData.peakPortfolio} />
                <FlowConn value={flowData.totalAtRet} color={C.gold} label="at retirement" peakPortfolio={flowData.peakPortfolio} />
                {flowData.hasConvWindow ? (
                  <>
                    <PhaseCard num={2} title="Optimize & Convert" ageRange={`Age ${resolvedStartAge} → ${resolvedEndAge}`}
                      years={flowData.conversionWindowYrs} color={C.blue} steps={phase2Steps}
                      note={flowData.totalConverted > 0
                        ? `${fmt(flowData.totalConverted)} moved from 401k → Roth during this window. Every dollar converted escapes future RMDs and grows tax-free.`
                        : `You have a ${flowData.conversionWindowYrs}-year window before RMDs start. Consider converting 401k → Roth in the Detailed Planner to reduce lifetime taxes.`}
                      actions={phase2Actions} peakPortfolio={flowData.peakPortfolio} />
                    <FlowConn value={flowData.portPreRMD} color={C.blue} label="entering RMDs" peakPortfolio={flowData.peakPortfolio} />
                  </>
                ) : (
                  <div style={{ ...panel, marginBottom: 0, borderRadius: 0,
                    borderLeft: `4px solid ${C.blue}`, borderTop: `1px solid ${C.border}`,
                    textAlign: "center", padding: "14px 20px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
                      Retiring at {safeRetAge} (≥ 73) — no conversion window.
                      <span style={{ color: C.orange }}> RMDs begin immediately.</span>
                    </p>
                  </div>
                )}
                <PhaseCard num={3} title="Spend & Distribute"
                  ageRange={`Age ${flowData.distStartAge} → ${flowData.depletionAge ?? safeLifeExp}`}
                  years={flowData.depletionAge
                    ? flowData.depletionAge - flowData.distStartAge
                    : safeLifeExp - flowData.distStartAge}
                  color={isSustainable ? C.green : C.orange}
                  steps={phase3Steps} note={null} actions={phase3Actions}
                  peakPortfolio={flowData.peakPortfolio} />
                <FlowConn value={flowData.distEndVal} color={isSustainable ? C.green : C.orange}
                  label={flowData.distEndVal > 0 ? "remaining" : "depleted"} peakPortfolio={flowData.peakPortfolio} />
                <div style={{ ...panel, marginBottom: 20, borderRadius: "0 0 10px 10px",
                  borderTop: `1px solid ${C.border}`, textAlign: "center", padding: "20px",
                  background: isSustainable ? `${C.green}08` : `${C.orange}08` }}>
                  {isSustainable ? (
                    <>
                      <p style={{ margin: "0 0 4px", fontSize: 18, color: C.green, fontWeight: 700 }}>
                        Portfolio Sustains Through Age {safeLifeExp}
                      </p>
                      <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted }}>
                        At {withdrawalRate.toFixed(1)}% withdrawal rate, your portfolio
                        {yearsSustained === Infinity ? " is self-sustaining — growth exceeds spending." : ` lasts ~${Math.floor(yearsSustained)} years beyond retirement.`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 4px", fontSize: 18, color: C.orange, fontWeight: 700 }}>
                        Portfolio Depletes at Age {Math.floor(safeRetAge + yearsSustained)}
                      </p>
                      <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted }}>
                        At {withdrawalRate.toFixed(1)}% withdrawal rate, your portfolio lasts ~{Math.floor(yearsSustained)} years.
                        You need {safeLifeExp - safeRetAge} years of coverage.
                      </p>
                    </>
                  )}
                  <div className="fd-outcome-stats" style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
                    {householdSS > 0 && (
                      <div style={{ background: C.surface, borderRadius: 6, padding: "6px 12px" }}>
                        <p style={{ margin: 0, fontSize: 9, color: C.muted }}>Social Security</p>
                        <p style={{ margin: 0, fontSize: 13, color: C.green, ...mono }}>{fmt(householdSS)}/yr</p>
                      </div>
                    )}
                    {effectivePension > 0 && (
                      <div style={{ background: C.surface, borderRadius: 6, padding: "6px 12px" }}>
                        <p style={{ margin: 0, fontSize: 9, color: C.muted }}>Pension</p>
                        <p style={{ margin: 0, fontSize: 13, color: C.blue, ...mono }}>{fmt(effectivePension)}/yr</p>
                      </div>
                    )}
                    <div style={{ background: C.surface, borderRadius: 6, padding: "6px 12px" }}>
                      <p style={{ margin: 0, fontSize: 9, color: C.muted }}>From Portfolio</p>
                      <p style={{ margin: 0, fontSize: 13, color: C.gold, ...mono }}>{fmt(netPortfolioNeed)}/yr</p>
                    </div>
                    <div style={{ background: C.surface, borderRadius: 6, padding: "6px 12px" }}>
                      <p style={{ margin: 0, fontSize: 9, color: C.muted }}>Total Expenses</p>
                      <p style={{ margin: 0, fontSize: 13, color: C.text, ...mono }}>{fmt(effectiveExpenses)}/yr</p>
                    </div>
                  </div>
                </div>
                <div style={{ ...panel, marginBottom: 20 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                    Portfolio Lifecycle
                  </p>
                  <p style={{ margin: "0 0 12px", fontSize: 11, color: C.muted }}>
                    Combined gross portfolio — accumulation through drawdown
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={totalChartData} margin={{ top: 8, right: 12, left: 12, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="age" stroke={C.muted} tick={{ fontSize: 10, fill: C.muted }}
                        label={{ value: "Age", position: "insideBottom", offset: -1, fill: C.muted, fontSize: 10 }} />
                      <YAxis stroke={C.muted} tick={{ fontSize: 10, fill: C.muted }} tickFormatter={v => fmt(v)} width={72} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const val = payload[0]?.value;
                        const isDrawdown = label > safeRetAge;
                        return (
                          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px" }}>
                            <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Age {label}</p>
                            <p style={{ margin: 0, fontSize: 12, color: isDrawdown ? C.orange : C.gold, ...mono }}>{fmt(val ?? 0)}</p>
                          </div>
                        );
                      }} />
                      <ReferenceLine x={safeRetAge} stroke={C.green} strokeDasharray="5 4"
                        label={{ value: "Retire", position: "insideTopRight", fill: C.green, fontSize: 9 }} />
                      {safeRetAge < RMD_START_AGE && (
                        <ReferenceLine x={RMD_START_AGE} stroke={C.orange} strokeDasharray="3 3"
                          label={{ value: "RMDs", position: "insideTopRight", fill: C.orange, fontSize: 9 }} />
                      )}
                      <Line type="monotone" dataKey="total" stroke={C.gold} strokeWidth={2} dot={false} name="Total" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: 11, color: "#4d5561", textAlign: "center" }}>
        For illustrative purposes only. Not financial or tax advice. Consult a qualified advisor.

      </p>
      <Analytics />
    </div>
  );
}
