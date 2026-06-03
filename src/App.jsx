import { useState, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { C, panel, sectionTitle, mono, selectStyle } from "./theme.js";
import { fmt, fmtPct } from "./formatters.js";
import { calcTax, marginalRate, ltcgRate } from "./model/taxes.js";
import { runSimulation } from "./model/simulation.js";
import { calcEmployerMatch } from "./model/employer-match.js";
import { calcGrossAfterTax, calcSavingsCapacity, calcOptimizedAllocation } from "./model/budget.js";
import { calcNetPortfolioNeed, calcWithdrawalRate, calcYearsSustained } from "./model/drawdown.js";
import { calcAIME, calcPIA, calcBenefit, calcSpousal } from "./model/social-security.js";
import { calcRMDProjection, calcRMDPostConversion } from "./model/rmd.js";
import { calcConversionSim } from "./model/roth-conversion.js";
import { calcOptimizedScenario } from "./model/optimization.js";
import { generatePhaseActions, generatePhaseSteps } from "./model/action-cards.js";
import {
  TAX_DATA_2026, ROTH_PHASEOUT_2026,
  TRAD_401K_LIMIT_2026, ROTH_IRA_LIMIT_2026, HSA_LIMIT_2026,
  LIMIT_415C_2026, LIMIT_415C_CATCHUP_2026, CATCHUP_AGE,
  FICA_RATE, FICA_WAGE_BASE,
  RMD_START_AGE,
  SS_FRA, SS_MIN_CLAIM_AGE, SS_MAX_CLAIM_AGE,
  SS_FACTORS,
  STATE_TAX, RETIREMENT_STATE_TAX,
  ASSUMPTIONS,
} from "./config/irs-2026.js";
import { Slider }        from "./components/Slider.jsx";
import { DeferredInput } from "./components/DeferredInput.jsx";
import { TaxTimeline }   from "./components/TaxTimeline.jsx";
import { TaxPhaseCard }  from "./components/TaxPhaseCard.jsx";
import { ChartTooltip }  from "./components/ChartTooltip.jsx";
import { FlowConn }      from "./components/FlowConn.jsx";
import { PhaseCard }     from "./components/PhaseCard.jsx";

export default function App() {

  const [currentAge,    setCurrentAge]    = useState(30);
  const [retirementAge, setRetirementAge] = useState(65);
  const [lifeExpect,    setLifeExpect]    = useState(90);
  const [returnRate,    setReturnRate]    = useState(5);
  const [inflationRate, setInflationRate] = useState(4);

  const [currentIncome, setCurrentIncome] = useState(100_000);
  const [incomeGrowth,  setIncomeGrowth]  = useState(3);
  const [selectedState, setSelectedState] = useState("TX");
  const [stateRateOverride, setStateRateOverride] = useState(null);
  const [filingStatus,  setFilingStatus]  = useState("single");
  const [otherPreTaxDeduc, setOtherPreTaxDeduc] = useState(0);

  const [rate1,       setRate1]       = useState(22);
  const [rate2,       setRate2]       = useState(24);
  const [rate3,       setRate3]       = useState(18);
  const [showPhase2,  setShowPhase2]  = useState(false);
  const [phase2Start, setPhase2Start] = useState(2);
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

  const [spouseSsEstimate, setSpouseSsEstimate] = useState(0);

  const [conversionMode,          setConversionMode]          = useState("bracket");
  const [conversionBracketTarget, setConversionBracketTarget] = useState(22);
  const [annualConversionAmt,     setAnnualConversionAmt]     = useState(20_000);
  const [conversionTaxSource,     setConversionTaxSource]     = useState("converted");
  const [employerMatchPct,        setEmployerMatchPct]        = useState(3);
  const [matchMode,               setMatchMode]               = useState("flat");
  const [matchFormulaRate,        setMatchFormulaRate]        = useState(50);
  const [matchFormulaCap,         setMatchFormulaCap]         = useState(6);

  const [addlPreTaxBal, setAddlPreTaxBal] = useState(0);

  const retStateRate  = RETIREMENT_STATE_TAX[retirementState]?.rate ?? 0;
  const rate3Combined = Math.min(0.95, rate3 / 100 + retStateRate);

  const safeRetAge  = showPhase2
    ? Math.max(retirementAge, currentAge + phase2Start + 1)
    : retirementAge;
  const phase2End   = safeRetAge - currentAge;
  const safeLifeExp = Math.max(lifeExpect, safeRetAge + 1);
  const totalYears  = safeLifeExp - currentAge;

  const employerMatch = (salary, employeeContrib) =>
    calcEmployerMatch(salary, employeeContrib, {
      matchMode, matchFormulaCap, matchFormulaRate, employerMatchPct,
    });

  const simData = useMemo(() => runSimulation({
    totalYears, currentAge, currentIncome, incomeGrowth, filingStatus,
    spouseIncome, spouseIncomeGrowth, returnRate,
    rate1, rate2, rate3, phase2Start, phase2End, showPhase2,
    bal401k, balRoth, balTaxable, balHSA,
    contrib401k, contribRoth, contribTaxable, contribHSA,
    contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
    calcEmployerMatchFn: employerMatch,
  }), [
    returnRate, totalYears, currentAge, currentIncome, incomeGrowth, filingStatus,
    spouseIncome, spouseIncomeGrowth,
    rate1, rate2, rate3, phase2Start, phase2End, showPhase2,
    bal401k, balRoth, balTaxable, balHSA,
    contrib401k, contribRoth, contribTaxable, contribHSA,
    contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
    employerMatchPct, matchMode, matchFormulaRate, matchFormulaCap,
  ]);

  // Year-0 fallback: when retirementAge === currentAge the user is already retired
  // and simData has no rows at or before safeRetAge. Use current input balances directly.
  const currentSnapshot = {
    age: currentAge,
    "Trad 401k": Math.round(bal401k * (1 - rate3 / 100)),
    tradGross: bal401k,
    "Roth IRA": balRoth,
    "Taxable": balTaxable,
    "HSA": balHSA,
  };
  const atRetirement = phase2End > 0
    ? (simData[phase2End - 1] ?? currentSnapshot)
    : currentSnapshot;

  const combinedIncome       = currentIncome + spouseIncome;

  // For MFJ filers, both incomes are reported on the same return.
  // Primary pre-tax deductions (401k, HSA) reduce primary income first;
  // spouse deductions aren't tracked (no sliders), so spouse income enters
  // as gross. For all other filing statuses, spouse income is separate.
  const totalPreTaxDeduc = contrib401k + contribHSA + otherPreTaxDeduc;
  const safeDeduc        = Math.min(totalPreTaxDeduc, currentIncome);
  const agi              = filingStatus === "mfj"
    ? currentIncome - safeDeduc + spouseIncome
    : currentIncome - safeDeduc;
  const { tax: fedTax, effectiveRate: fedEffRate } = calcTax(agi, filingStatus);
  const fedMarginal      = marginalRate(agi, filingStatus);
  const stateRateDefault = STATE_TAX[selectedState]?.rate ?? 0;
  const stateRate        = stateRateOverride !== null ? stateRateOverride : stateRateDefault;
  const stateTax         = agi * stateRate;
  const fica             = (Math.min(currentIncome, FICA_WAGE_BASE) + Math.min(spouseIncome, FICA_WAGE_BASE)) * FICA_RATE;
  // takeHome: household total when spouse income is present, primary-only otherwise.
  const householdIncome  = filingStatus === "mfj" ? combinedIncome : currentIncome;
  const takeHome         = householdIncome - fedTax - stateTax - fica - safeDeduc;
  const combinedEffRate  = (fedTax + stateTax + fica) / (householdIncome || 1);
  const noStateTax       = stateRate === 0;
  // Roth phase-out is tested against combined income only for MFJ filers; every
  // other status uses the primary earner's income alone (CLAUDE.md rules 3 & 9).
  const rothMAGI             = filingStatus === "mfj" ? combinedIncome : currentIncome;
  const rothPhaseout         = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
  const rothPhaseoutWarning  = rothMAGI >= rothPhaseout.start;
  const rothFullyPhased      = rothMAGI >= rothPhaseout.end;

  const grossAfterTax = calcGrossAfterTax(householdIncome, fedTax, stateTax, fica);
  const { currentContribTotal, effectiveLiving, savingsCapacity, availableSurplus } =
    calcSavingsCapacity({
      grossAfterTax, contrib401k, contribRoth, contribTaxable, contribHSA, livingExpenses,
    });

  const optimizedAllocation = calcOptimizedAllocation({
    availableSurplus, savingsSurplusPct,
    contrib401k, contribRoth, contribHSA, contribTaxable,
    rothFullyPhased, matchMode, matchFormulaCap, matchFormulaRate,
    employerMatchPct, currentIncome,
  });

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

  const retVals = Object.fromEntries(
    ACCOUNTS.map(a => [a.dataKey, atRetirement[a.dataKey] ?? 0])
  );
  const ranked = Object.entries(retVals).sort((a, b) => b[1] - a[1]);

  const totalAtRet        = Object.values(retVals).reduce((s, v) => s + v, 0);
  const effectiveExpenses = annualExpenses ?? Math.round(totalAtRet * 0.03);
  const rReal             = (1 + returnRate / 100) / (1 + inflationRate / 100) - 1;

  const ssWorkYears = Math.max(1, safeRetAge - currentAge);
  const ssAIME = calcAIME(currentIncome, incomeGrowth, ssWorkYears);
  const ssPIA  = calcPIA(ssAIME);
  const ssMonthlyBenefit = calcBenefit(ssPIA, ssClaimingAge);
  const ssAnnualBenefit  = ssMonthlyBenefit * ASSUMPTIONS.MONTHS_PER_YEAR;
  const ss67Monthly      = calcBenefit(ssPIA, SS_FRA);
  const effectiveSS = includeSS
    ? (ssOverride !== null ? ssOverride : ssAnnualBenefit)
    : 0;

  const spouseSsBenefit = calcSpousal(ssPIA, spouseSsEstimate);
  const householdSS = includeSS ? effectiveSS + spouseSsBenefit : 0;
  // SS only reduces the headline portfolio need if it's already active at retirement.
  // Mirrors effectivePension which uses the same gate (pensionStartAge <= safeRetAge).
  const ssAtRet = includeSS && ssClaimingAge <= safeRetAge ? householdSS : 0;

  const effectivePension = pensionStartAge <= safeRetAge && pensionMonthly > 0
    ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR
    : 0;
  const ssTaxableRet = householdSS * ASSUMPTIONS.SS_TAXABLE_PCT;

  const netPortfolioNeed = calcNetPortfolioNeed(effectiveExpenses, ssAtRet, effectivePension);
  const withdrawalRate   = calcWithdrawalRate(netPortfolioNeed, totalAtRet);
  const yearsSustained   = calcYearsSustained(netPortfolioNeed, totalAtRet, rReal);
  const isSustainable    = yearsSustained === Infinity || yearsSustained >= (safeLifeExp - safeRetAge);

  const milestones = useMemo(() => {
    const getTotal = row =>
      (row["Trad 401k"] ?? 0) + (row["Roth IRA"] ?? 0)
    + (row["Taxable"]   ?? 0) + (row["HSA"]       ?? 0);
    const ages = [];
    let a = Math.ceil((currentAge + 1) / 5) * 5;
    while (a <= safeRetAge) { ages.push(a); a += 5; }
    if (!ages.includes(safeRetAge)) ages.push(safeRetAge);
    ages.sort((x, y) => x - y);
    const cards = ages.map(age => {
      const row = simData.find(d => d.age === age);
      if (!row) return null;
      return { age, total: getTotal(row), isRetirement: age === safeRetAge };
    }).filter(Boolean);
    const crossIdx = cards.findIndex(c => c.total >= retirementTarget);
    if (crossIdx !== -1) return cards.slice(0, crossIdx + 1);
    const crossRow = simData.find(d => getTotal(d) >= retirementTarget);
    if (crossRow) {
      const extra = { age: crossRow.age, total: getTotal(crossRow), isRetirement: false };
      return [...cards, extra];
    }
    return cards;
  }, [simData, currentAge, safeRetAge, retirementTarget]);

  const totalChartData = useMemo(() => {
    const result = [];
    // Seed chart with current balances as the retirement starting point
    // when the user is already retired (safeRetAge === currentAge, no accumulation years).
    if (safeRetAge === currentAge) {
      result.push({ age: currentAge, total: bal401k + balRoth + balTaxable + balHSA });
    }
    for (const d of simData) {
      result.push({
        age: d.age,
        total: (d["Trad 401k"] ?? 0) + (d["Roth IRA"] ?? 0)
             + (d["Taxable"]   ?? 0) + (d["HSA"]       ?? 0),
      });
      if (d.age >= safeRetAge) break;
    }
    let bal = result[result.length - 1]?.total ?? 0;
    for (let age = safeRetAge + 1; age <= safeLifeExp; age++) {
      const yearSS      = includeSS && age >= ssClaimingAge ? householdSS : 0;
      const yearPension = pensionMonthly > 0 && age >= pensionStartAge
        ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0;
      const yearNeed    = calcNetPortfolioNeed(effectiveExpenses, yearSS, yearPension);
      bal = bal * (1 + rReal) - yearNeed;
      result.push({ age, total: Math.max(0, Math.round(bal)) });
      if (bal <= 0) break;
    }
    return result;
  }, [simData, safeRetAge, safeLifeExp, currentAge, returnRate, inflationRate, effectiveExpenses,
      includeSS, ssClaimingAge, householdSS, pensionMonthly, pensionStartAge,
      bal401k, balRoth, balTaxable, balHSA]);

  const ssBreakEven = ssClaimingAge === SS_FRA ? null : (() => {
    let cumClaim = 0, cum67 = 0;
    for (let m = 1; m <= 50 * 12; m++) {
      const ageNow = ssClaimingAge + m / 12;
      if (ageNow >= ssClaimingAge) cumClaim += ssMonthlyBenefit;
      if (ageNow >= SS_FRA)        cum67    += ss67Monthly;
      if (ssClaimingAge < SS_FRA && cum67 >= cumClaim && ageNow > SS_FRA)
        return Math.floor(ageNow);
      if (ssClaimingAge > SS_FRA && cumClaim >= cum67 && ageNow > ssClaimingAge)
        return Math.floor(ageNow);
    }
    return null;
  })();

  const useTable2 = isMarried && spouseIsSoleBenef && (currentAge - spouseCurrentAge > 10);
  const activeTableLabel = useTable2 ? "Table II (Joint Life)" : "Table III (Uniform Lifetime)";

  const rmdData = useMemo(() => {
    const retRow = simData.find(d => d.age === safeRetAge)
      ?? (safeRetAge === currentAge ? currentSnapshot : null);
    if (!retRow) return [];
    return calcRMDProjection({
      tradGrossAtRetirement: (retRow.tradGross ?? 0) + addlPreTaxBal,
      safeRetAge, safeLifeExp, returnRate, useTable2, spouseCurrentAge, currentAge,
    });
  }, [simData, safeRetAge, safeLifeExp, returnRate, useTable2, spouseCurrentAge, currentAge,
      currentSnapshot, addlPreTaxBal]);

  const firstRMD  = rmdData[0];
  const totalRMDs = rmdData.reduce((s, d) => s + d.rmd, 0);

  // Bracket-accurate RMD tax: stack each year's RMD on top of the SS+pension floor.
  // SS and pension are assumed active at RMD start (age 73) if claiming/start age ≤ 73.
  const rmdIncomeSS      = includeSS && ssClaimingAge <= RMD_START_AGE ? ssTaxableRet : 0;
  const rmdIncomePension = pensionMonthly > 0 && pensionStartAge <= RMD_START_AGE ? effectivePension : 0;
  const rmdIncomeFloor   = rmdIncomeSS + rmdIncomePension;
  const { tax: rmdBaseFedTax } = calcTax(rmdIncomeFloor, filingStatus);
  const rmdDataWithTax = rmdData.map(({ age, rmd, bal, divisor }) => ({
    age, rmd, bal, divisor,
    tax: Math.round(
      (calcTax(rmdIncomeFloor + rmd, filingStatus).tax - rmdBaseFedTax) + rmd * retStateRate
    ),
  }));
  const rmdTaxBite = rmdDataWithTax.reduce((s, d) => s + d.tax, 0);
  // Effective rate across all RMD years — used for display captions.
  const effectiveRMDTaxRate = totalRMDs > 0
    ? rmdTaxBite / totalRMDs
    : Math.min(0.95, rate3 / 100 + retStateRate);

  const conversionWindowYrs = Math.max(0, RMD_START_AGE - 1 - safeRetAge);

  const retTaxData = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  // Per-year income floors for the conversion window: SS and pension only count
  // in years when they've actually started (ssClaimingAge / pensionStartAge).
  const convFloors = Array.from({ length: conversionWindowYrs }, (_, i) => {
    const age         = safeRetAge + i;
    const yearSSTax   = includeSS && age >= ssClaimingAge ? ssTaxableRet : 0;
    const yearPension = pensionMonthly > 0 && age >= pensionStartAge
      ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0;
    return yearSSTax + yearPension;
  });
  // Steady-state floor (all sources active) — used for display and bracket fill.
  const retIncomeFloor   = ssTaxableRet + (pensionMonthly > 0 ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0);
  const bracketTops      = {
    12: retTaxData.brackets[1]?.max ?? 50_400,
    22: retTaxData.brackets[2]?.max ?? 105_700,
    24: retTaxData.brackets[3]?.max ?? 201_775,
  };
  const bracketTarget = bracketTops[conversionBracketTarget] ?? bracketTops[22];
  // Per-year bracket-fill targets: each year converts up to the bracket top, minus
  // THAT year's income floor (convFloors gates SS/pension on claiming/start age).
  // Early-retirement years before SS/pension start have a lower floor → more room.
  const bracketFillConversions = convFloors.map(floor =>
    Math.max(0, Math.round(bracketTarget + retTaxData.deduction - floor)));
  // Steady-state scalar (all sources active) — the lowest target, used as the
  // headline figure and as the fallback when there are no conversion-window years.
  const bracketFillConversion = Math.max(0, Math.round(
    bracketTarget + retTaxData.deduction - retIncomeFloor
  ));
  const annualConversion = conversionMode === "bracket" ? bracketFillConversion : annualConversionAmt;
  // Display range for bracket mode: peak (earliest, lowest-income year) → steady.
  const convPeakTarget  = bracketFillConversions.length ? Math.max(...bracketFillConversions) : bracketFillConversion;
  const convSteadyTarget = bracketFillConversions.length ? Math.min(...bracketFillConversions) : bracketFillConversion;
  const convTargetVaries = conversionMode === "bracket" && convPeakTarget !== convSteadyTarget;

  const conversionSim = useMemo(() => {
    const retRow = simData.find(d => d.age === safeRetAge)
      ?? (safeRetAge === currentAge ? currentSnapshot : null);
    const raw = calcConversionSim({
      conversionWindowYrs: retRow ? conversionWindowYrs : 0,
      annualConversion,
      annualConversions: conversionMode === "bracket" ? bracketFillConversions : null,
      returnRate, retIncomeFloor, retIncomeFloors: convFloors,
      filingStatus, conversionTaxSource,
      tradGrossAtRetirement: (retRow?.tradGross ?? 0) + addlPreTaxBal,
      rothBalAtRet: retVals["Roth IRA"] ?? 0,
      taxableBalAtRet: retVals["Taxable"] ?? 0,
    });
    // Model returns year ages as 1-indexed (yr+1); offset by safeRetAge for display.
    return { ...raw, years: raw.years.map(y => ({ ...y, age: y.age + safeRetAge })) };
  }, [simData, safeRetAge, currentAge, currentSnapshot, conversionWindowYrs, annualConversion, conversionMode, bracketFillConversions, retVals["Roth IRA"], retVals["Taxable"], returnRate, retIncomeFloor, convFloors, filingStatus, conversionTaxSource, addlPreTaxBal]);

  const rmdDataPostConversion = useMemo(() => calcRMDPostConversion({
    conversionWindowYrs, rmdData, tradBal73: conversionSim.tradBal73,
    safeLifeExp, returnRate, useTable2, spouseCurrentAge, currentAge,
  }), [conversionSim, safeLifeExp, returnRate, rmdData, conversionWindowYrs, useTable2, spouseCurrentAge, currentAge]);

  const rmdTaxBitePost = rmdDataPostConversion.reduce((sum, { rmd }) => {
    const { tax } = calcTax(rmdIncomeFloor + rmd, filingStatus);
    return sum + Math.round((tax - rmdBaseFedTax) + rmd * retStateRate);
  }, 0);
  const rmdTaxSaved          = Math.max(0, rmdTaxBite - rmdTaxBitePost);
  const netConversionBenefit = rmdTaxSaved - conversionSim.totalTax;

  const limit415c        = currentAge >= CATCHUP_AGE ? LIMIT_415C_CATCHUP_2026 : LIMIT_415C_2026;
  const employerMatchAmt = employerMatch(currentIncome, contrib401k);
  const megaCapacity     = Math.max(0, limit415c - contrib401k - employerMatchAmt);
  const megaGrowth       = [5, 10, 20].map(yrs => ({
    yrs,
    val: returnRate > 0
      ? Math.round(megaCapacity * ((Math.pow(1 + returnRate / 100, yrs) - 1) / (returnRate / 100)))
      : megaCapacity * yrs,
  }));

  const retTaxable = retVals["Taxable"]   ?? 0;
  const retTrad    = retVals["Trad 401k"] ?? 0;
  const retRoth    = retVals["Roth IRA"]  ?? 0;

  const yr1FromTaxable = Math.min(netPortfolioNeed, retTaxable);
  const yr1FromTrad    = Math.min(Math.max(0, netPortfolioNeed - yr1FromTaxable), retTrad);
  const yr1FromRoth    = Math.min(Math.max(0, netPortfolioNeed - yr1FromTaxable - yr1FromTrad), retRoth);
  // Marginal rate on trad withdrawals: stacked on top of SS+pension income floor.
  const yr1TradRate    = Math.min(0.95, marginalRate(rmdIncomeFloor + yr1FromTrad, filingStatus) + retStateRate);
  const yr1TaxOptimal  = Math.round(
    yr1FromTaxable * ltcgRate(0, filingStatus) +
    yr1FromTrad    * yr1TradRate              +
    yr1FromRoth    * 0
  );
  const yr1TaxWorstCase = Math.round(Math.min(netPortfolioNeed, retTrad) * yr1TradRate);
  const yr1TaxSavings   = Math.max(0, yr1TaxWorstCase - yr1TaxOptimal);

  const actualMarginalPct  = Math.round(fedMarginal * 100);
  const phase1RateMismatch = Math.abs(rate1 - actualMarginalPct) >= 1;

  const contrib401kRoom    = Math.max(0, TRAD_401K_LIMIT_2026 - contrib401k);
  const contrib401kTaxSave = Math.round(contrib401kRoom * fedMarginal);

  const avgAnnualRMD      = rmdData.length > 0 ? Math.round(totalRMDs / rmdData.length) : 0;
  const projRetIncome     = avgAnnualRMD + Math.round(householdSS * ASSUMPTIONS.SS_TAXABLE_PCT) + effectivePension;
  const retBrackets       = (TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single).brackets;
  const projRetBracket    = retBrackets.find(b => projRetIncome >= b.min && projRetIncome < b.max)
                         ?? retBrackets[retBrackets.length - 1];
  const projRetBracketPct = Math.round(projRetBracket.rate * 100);
  const projRate3Combined = Math.round((projRetBracket.rate + retStateRate) * 100);
  const rate3Mismatch     = Math.abs(Math.round(rate3Combined * 100) - projRate3Combined) >= 3;

  const ss70Annual       = Math.round(ssPIA * SS_FACTORS[SS_MAX_CLAIM_AGE]) * ASSUMPTIONS.MONTHS_PER_YEAR;
  const household70SS    = ss70Annual + spouseSsBenefit;
  const ss70DrawReduction = Math.max(0, household70SS - householdSS);
  const ysSS70 = (() => {
    if (!includeSS || ssClaimingAge >= SS_MAX_CLAIM_AGE) return null;
    const need70 = Math.max(0, effectiveExpenses - household70SS - effectivePension);
    if (need70 <= 0 || totalAtRet * rReal >= need70) return Infinity;
    if (rReal !== 0) {
      const arg = 1 - (totalAtRet * rReal) / need70;
      return arg > 0 ? Math.log(arg) / Math.log(1 / (1 + rReal)) : 0;
    }
    return totalAtRet / need70;
  })();
  const ssDelayGainYrs = (ysSS70 !== null && ysSS70 !== Infinity && yearsSustained !== Infinity)
    ? Math.max(0, Math.round(ysSS70 - yearsSustained))
    : null;
  const wr70 = totalAtRet > 0
    ? Math.max(0, effectiveExpenses - household70SS - effectivePension) / totalAtRet * 100
    : 0;

  const flowData = useMemo(() => {
    const startPortfolio = bal401k + balRoth + balTaxable + balHSA;
    const accumRows   = simData.filter(d => d.age <= safeRetAge);
    const totalContrib = accumRows.reduce((s, d) =>
      s + (d.c401k || 0) + (d.cRoth || 0) + (d.cTaxable || 0) + (d.cHSA || 0), 0);
    const totalGrowth  = Math.max(0, totalAtRet - startPortfolio - totalContrib);
    const hasConvWindow  = conversionWindowYrs > 0;
    // Use the chart value at age 72 (last year before RMDs), not 73 (which already includes
    // the first RMD draw). This gives the true "entering RMDs" portfolio value and makes
    // convWindowGrowth balance cleanly against the draws and taxes in the conversion window.
    const portPreRMD     = totalChartData.find(d => d.age === RMD_START_AGE - 1)?.total
                        ?? totalChartData.find(d => d.age === safeRetAge)?.total
                        ?? totalAtRet;
    // Per-year draws: start at safeRetAge+1 (no draw in the chart at the retirement year itself).
    // SS and pension only deducted in years they've started.
    let convWindowDraws = 0;
    for (let i = 0; i < conversionWindowYrs; i++) {
      const age         = safeRetAge + 1 + i;
      const yearSS      = includeSS && age >= ssClaimingAge ? householdSS : 0;
      const yearPension = pensionMonthly > 0 && age >= pensionStartAge
        ? pensionMonthly * ASSUMPTIONS.MONTHS_PER_YEAR : 0;
      convWindowDraws  += calcNetPortfolioNeed(effectiveExpenses, yearSS, yearPension);
    }
    const convWindowTax    = hasConvWindow ? conversionSim.totalTax : 0;
    const totalConverted   = hasConvWindow
      ? conversionSim.years.reduce((s, y) => s + y.conversion, 0)
      : 0;
    const convWindowGrowth = portPreRMD - totalAtRet + convWindowDraws + convWindowTax;
    const distStartAge = hasConvWindow ? RMD_START_AGE : safeRetAge;
    const distStartVal = hasConvWindow ? portPreRMD : totalAtRet;
    const lastChart    = totalChartData[totalChartData.length - 1];
    const distEndVal   = lastChart?.total ?? 0;
    const depletionAge = totalChartData.find(d => d.total <= 0)?.age ?? null;
    const distYears    = Math.max(0, (depletionAge ?? safeLifeExp) - distStartAge);
    const actualSustainedYrs = yearsSustained === Infinity
      ? distYears
      : Math.min(Math.floor(yearsSustained), distYears);
    const distDraws    = netPortfolioNeed * actualSustainedYrs;
    const distRMDTax   = rmdTaxBite;
    const distGrowth   = distEndVal - distStartVal + distDraws + distRMDTax;
    const peakPortfolio = Math.max(
      startPortfolio, totalAtRet,
      ...totalChartData.map(d => d.total)
    );
    return {
      startPortfolio, totalContrib, totalGrowth, totalAtRet,
      hasConvWindow, conversionWindowYrs, portPreRMD,
      convWindowDraws, convWindowTax, convWindowGrowth, totalConverted,
      distStartAge, distStartVal, distEndVal, distYears,
      distDraws, distRMDTax, distGrowth, depletionAge, actualSustainedYrs,
      peakPortfolio,
    };
  }, [
    bal401k, balRoth, balTaxable, balHSA, simData, safeRetAge, totalAtRet,
    conversionWindowYrs, conversionSim, totalChartData, safeLifeExp,
    netPortfolioNeed, rmdTaxBite, yearsSustained,
    includeSS, ssClaimingAge, householdSS, pensionMonthly, pensionStartAge, effectiveExpenses,
  ]);

  const optimized = useMemo(() => calcOptimizedScenario({
    totalAtRet, optimizedAllocation, returnRate, incomeGrowth, safeRetAge, currentAge,
    rate3, contrib401k, includeSS, ssClaimingAge, ss70Annual, spouseSsBenefit,
    householdSS, effectiveExpenses, effectivePension, rReal, safeLifeExp,
    yr1TaxSavings, netConversionBenefit, isSustainable, yearsSustained,
    conversionSim, retTaxable,
  }), [
    totalAtRet, optimizedAllocation, returnRate, incomeGrowth, safeRetAge, currentAge,
    rate3, contrib401k, includeSS, ssClaimingAge, ss70Annual, spouseSsBenefit,
    householdSS, effectiveExpenses, effectivePension, rReal, safeLifeExp,
    yr1TaxSavings, netConversionBenefit, isSustainable, yearsSustained,
    conversionSim, retTaxable,
  ]);


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
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 className="h1-title" style={{ margin: 0, fontWeight: 700, color: C.text }}>
            Retirement Account Modeler
          </h1>
          <span style={{ fontSize: 12, color: C.gold, ...mono, background: "#d4a84320", padding: "2px 8px", borderRadius: 4 }}>
            2026 Tax Year
          </span>
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
                  format={v => `$${v.toLocaleString()}`} onChange={setCurrentIncome} />
                <Slider label="Income Growth / yr" value={incomeGrowth} min={0} max={15} step={0.5}
                  format={v => `${v}%`} onChange={setIncomeGrowth} valueColor={C.purple} />
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
                    format={v => v === 0 ? "None" : `$${v.toLocaleString()}`}
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
                    format={v => v === 0 ? "None" : `$${v.toLocaleString()}`} onChange={setSpouseIncome} valueColor={C.purple} />
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
                            setStateRateOverride(Math.abs(v - stateRateDefault * 100) < 0.15 ? null : v / 100);
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
              { label: spouseIncome > 0 ? "Est. Household Take-Home" : "Est. Take-Home", val: fmt(takeHome), color: C.green },
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
          How much of your take-home do you actually need to live on? The gap between your living costs and your take-home
          is your savings capacity — money you can deploy into tax-advantaged accounts.
        </p>
        <div className="income-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Slider
              label="Annual Living Expenses"
              value={effectiveLiving}
              min={10_000} max={Math.max(grossAfterTax, 30_000)} step={1_000}
              format={v => `$${v.toLocaleString()}`}
              onChange={v => { setLivingExpenses(v); setPreApplySnapshot(null); }}
            />
            <p style={{ margin: "-8px 0 0", fontSize: 10, color: C.muted }}>
              Monthly: <span style={{ color: C.text, ...mono }}>${Math.round(effectiveLiving / 12).toLocaleString()}</span>
              {livingExpenses === null && (
                <span style={{ color: C.muted, fontStyle: "italic" }}> · auto-derived from take-home minus contributions</span>
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
                      onClick={() => {
                        setPreApplySnapshot({ c401k: contrib401k, cRoth: contribRoth, cTaxable: contribTaxable, cHSA: contribHSA });
                        setContrib401k(optimizedAllocation.opt401k);
                        setContribRoth(optimizedAllocation.optRoth);
                        setContribHSA(optimizedAllocation.optHSA);
                        setContribTaxable(optimizedAllocation.optTaxable);
                      }}
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
                        onClick={() => {
                          setContrib401k(preApplySnapshot.c401k);
                          setContribRoth(preApplySnapshot.cRoth);
                          setContribTaxable(preApplySnapshot.cTaxable);
                          setContribHSA(preApplySnapshot.cHSA);
                          setPreApplySnapshot(null);
                        }}
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
        <h3 style={{ ...sectionTitle, marginBottom: 16 }}>Tax Rate Phases</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <Slider label="Current Age" value={currentAge} min={18} max={80}
            onChange={v => {
              setCurrentAge(v);
              if (showPhase2 && retirementAge < v + 2) setRetirementAge(v + 2);
              else if (!showPhase2 && retirementAge < v) setRetirementAge(v);
              if (spouseCurrentAge >= v) setSpouseCurrentAge(Math.max(18, v - 1));
              if (contribEnd401k    <= v) setContribEnd401k(v + 1);
              if (contribEndRoth    <= v) setContribEndRoth(v + 1);
              if (contribEndTaxable <= v) setContribEndTaxable(v + 1);
              if (contribEndHSA     <= v) setContribEndHSA(v + 1);
            }} />
          <Slider label="Retirement Age" value={retirementAge} min={showPhase2 ? currentAge + 2 : currentAge} max={lifeExpect - 1}
            valueColor={C.green} onChange={v => {
              setRetirementAge(v);
              const newPhase2End = v - currentAge;
              if (phase2Start >= newPhase2End) setPhase2Start(Math.max(1, newPhase2End - 1));
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
                const newPhase2End = newRet - currentAge;
                if (phase2Start >= newPhase2End) setPhase2Start(Math.max(1, newPhase2End - 1));
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
          phase1End={phase2Start} phase2End={phase2End} totalYears={totalYears}
          rate1={rate1} rate2={rate2} rate3={rate3} showPhase2={showPhase2}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: C.muted }}>Year 1 (Age {currentAge})</span>
          {showPhase2 && (
            <span style={{ fontSize: 10, color: C.muted }}>
              Year {phase2Start} to {phase2End - 1} (Age {currentAge + phase2Start} to {safeRetAge - 1})
            </span>
          )}
          <span style={{ fontSize: 10, color: C.muted }}>Retirement Age {safeRetAge} to {safeLifeExp}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: showPhase2 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <TaxPhaseCard
            phaseNum="1" label="Current Federal Rate" color={C.gold}
            yearRange={showPhase2
              ? `Years 1 - ${phase2Start - 1} / Age ${currentAge} - ${currentAge + phase2Start - 1}`
              : `Years 1 - ${phase2End - 1} / Age ${currentAge} - ${safeRetAge - 1}`}
            rate={rate1} setRate={setRate1}
          >
            {phase1RateMismatch && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: C.muted }}>Actual marginal: {actualMarginalPct}%</span>
                <button onClick={() => setRate1(actualMarginalPct)} style={{
                  padding: "2px 7px", fontSize: 9, fontWeight: 600, border: `1px solid ${C.gold}60`,
                  borderRadius: 3, background: "transparent", color: C.gold, cursor: "pointer",
                  fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  ← sync
                </button>
              </div>
            )}
            <button
              onClick={() => {
                const enabling = !showPhase2;
                setShowPhase2(enabling);
                setPhase2Start(2);
                if (enabling && retirementAge < currentAge + 2) setRetirementAge(currentAge + 2);
              }}
              style={{
                marginTop: 8, width: "100%", padding: "3px 0", borderRadius: 5,
                border: `1px solid ${C.border}`, cursor: "pointer", transition: "all 0.15s",
                background: showPhase2 ? "#21262d" : "transparent",
                color: showPhase2 ? C.muted : "#3d444d",
                fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
                fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 600,
              }}
            >{showPhase2 ? "- mid-career phase" : "+ mid-career phase"}</button>
          </TaxPhaseCard>
          {showPhase2 && (
            <TaxPhaseCard
              phaseNum="2" label="Mid-Career Federal Rate" color={C.blue}
              yearRange={`Years ${phase2Start} - ${phase2End - 1} / Age ${currentAge + phase2Start} - ${safeRetAge - 1}`}
              rate={rate2} setRate={setRate2}
            >
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted }}>Starts at year</p>
                <DeferredInput
                  value={phase2Start} min={1} max={phase2End - 1}
                  onChange={setPhase2Start}
                  style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.blue, fontSize: 13, padding: "3px 8px",
                    outline: "none", ...mono }}
                />
              </div>
              <button
                onClick={() => { setShowPhase2(false); setPhase2Start(2); }}
                style={{
                  marginTop: 6, width: "100%", padding: "3px 0", borderRadius: 5,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.muted, fontSize: 10, cursor: "pointer",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >Remove</button>
            </TaxPhaseCard>
          )}
          <TaxPhaseCard
            phaseNum="3" label="Retirement Federal Rate" color={C.green}
            yearRange={`Year ${phase2End}+ / Age ${safeRetAge} - ${safeLifeExp}`}
            rate={rate3} setRate={setRate3}
            combinedRate={rate3Combined}
          >
            <p style={{ margin: "6px 0 0", fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
              Used in the accumulation model to estimate growth drag on pre-tax accounts.
              RMD and withdrawal taxes now use bracket-accurate math — this rate is compared
              against the projection below as a sanity check.
            </p>
            <div style={{ marginTop: 8 }}>
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
            {rate3Mismatch && rmdData.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <p style={{ margin: 0, fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                  Avg RMD + SS puts you in the{" "}
                  <span style={{ color: C.orange, fontWeight: 700 }}>{projRetBracketPct}% fed bracket</span>
                  {retStateRate > 0 && <span> (+{(retStateRate*100).toFixed(1)}% state = {projRate3Combined}% combined)</span>}
                </p>
                <button onClick={() => setRate3(projRetBracketPct)} style={{
                  marginTop: 3, padding: "2px 7px", fontSize: 9, fontWeight: 600,
                  border: `1px solid ${C.green}60`, borderRadius: 3, background: "transparent",
                  color: C.green, cursor: "pointer",
                  fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  ← sync fed to {projRetBracketPct}%
                </button>
              </div>
            )}
          </TaxPhaseCard>
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
            ★ = retirement age &nbsp;·&nbsp; Trad 401k shown after-tax &nbsp;·&nbsp; Taxable applies annual LTCG drag at income-based rate &nbsp;·&nbsp;
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
              {fmt(Object.values(retVals).reduce((s, v) => s + v, 0))}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: C.muted }}>total after-tax across all accounts</p>
          </div>
          <p style={{ margin: 0, fontSize: 10, color: C.muted }}>after-tax · age {safeRetAge}</p>
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
                      {acct?.contrib > 0 ? `$${acct.contrib.toLocaleString()}/yr` : "no contributions"}
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
          After-tax values at retirement age. Trad 401k taxed at retirement rate. Roth &amp; HSA tax-free. Taxable applies annual LTCG drag at your income-based rate (0%, 15%, or 20%).
        </p>
      </div>

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 16 }}>Retirement Drawdown</h3>
        <div className="det-2col" style={{ gap: 24 }}>
          <div>
            <Slider label="Estimated Annual Expenses in Retirement"
              value={effectiveExpenses} min={10_000} max={300_000} step={1_000}
              format={v => `$${v.toLocaleString()}`}
              onChange={v => setAnnualExpenses(v)} />
            <p style={{ margin: "4px 0 0", fontSize: 10, color: C.muted }}>
              Monthly: <span style={{ color: C.text, ...mono }}>${Math.round(effectiveExpenses / 12).toLocaleString()}</span>
              &nbsp;·&nbsp; default = 3% of projected portfolio
              {annualExpenses !== null && (
                <button onClick={() => setAnnualExpenses(null)} style={{
                  marginLeft: 8, fontSize: 9, color: C.blue, background: "transparent",
                  border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}>reset to 3%</button>
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
          Based on total after-tax portfolio at retirement ({fmt(totalAtRet)}) growing at {returnRate}% per year.
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

      <div style={{ ...panel, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Portfolio Growth Over Time</h3>
        <p style={{ margin: "0 0 16px", fontSize: 11, color: C.muted }}>
          After-tax values year by year. Trad 401k normalized to{" "}
          {showPhase2 ? `Phase 1 rate (${rate1}%) across all working years` : `Phase 1 rate (${rate1}%)`}{" "}
          for a smooth growth line — the retirement-rate after-tax value is in the snapshot cards below.
          Dashed line marks retirement age.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={simData.filter(d => d.age <= safeRetAge).map(d => ({
              ...d,
              "Trad 401k": Math.round((d.tradGross ?? 0) * (1 - rate1 / 100)),
            }))}
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
          Combined after-tax portfolio from today to life expectancy (age {safeLifeExp}).
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
                <Slider label="Claiming Age" value={ssClaimingAge} min={SS_MIN_CLAIM_AGE} max={SS_MAX_CLAIM_AGE}
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
                    ${ssOverride !== null ? Math.round(ssOverride / 12).toLocaleString() : ssMonthlyBenefit.toLocaleString()}
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

          {(isMarried || spouseSsEstimate > 0) && (
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
                    A spouse can receive up to <span style={{ color: C.green }}>50% of the higher earner's PIA at FRA</span>,
                    or their own earned benefit — whichever is larger. Enter your spouse's estimated annual benefit below.
                    If their own benefit is less than 50% of yours, the calculator will use the spousal benefit instead.
                    Survivor benefit (the higher of the two) is not yet modeled.
                  </p>
                </div>
                <Slider label="Spouse's Own SS Benefit (annual)" value={spouseSsEstimate}
                  min={0} max={60_000} step={500}
                  format={v => v === 0 ? "None" : `$${v.toLocaleString()}`}
                  onChange={setSpouseSsEstimate} valueColor={C.green} />
                <p style={{ margin: "-6px 0 0", fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Enter from spouse's my Social Security statement. Set to 0 if spouse has no work history.
                </p>
              </div>
              <div className="det-stat-3" style={{ gap: 10 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Spouse Benefit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>{fmt(spouseSsBenefit)}/yr</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {spouseSsEstimate > 0 && spouseSsBenefit > spouseSsEstimate
                      ? "using 50% spousal (higher)"
                      : spouseSsEstimate > 0 ? "using own benefit" : "no spouse SS"}
                  </p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Combined Household SS</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>{fmt(householdSS)}/yr</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>${Math.round(householdSS / 12).toLocaleString()}/mo</p>
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
                  format={v => v === 0 ? "None" : `$${v.toLocaleString()}/mo`}
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
                      {conversionWindowYrs}-year window · age {safeRetAge + 1} → 72
                    </span>
                  </p>
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
                      format={v => `$${v.toLocaleString()}`}
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
                    { label: "Conversion Tax Cost", val: fmt(conversionSim.totalTax),      sub: "paid now, pre-RMD",             color: C.orange },
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
                        {rmdData.slice(0, 8).map((row, i) => {
                          const postRow = rmdDataPostConversion[i];
                          return [
                            <span key={`ra${row.age}`} style={{ fontSize: 11, color: C.gold, ...mono }}>{row.age}</span>,
                            <span key={`ro${row.age}`} style={{ fontSize: 11, color: C.orange, ...mono }}>{fmt(row.rmd)}</span>,
                            <span key={`rp${row.age}`} style={{ fontSize: 11, color: postRow && postRow.rmd < row.rmd ? C.green : C.text, ...mono }}>
                              {postRow ? fmt(postRow.rmd) : "—"}
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
                    <PhaseCard num={2} title="Optimize & Convert" ageRange={`Age ${safeRetAge} → 72`}
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
                    Combined after-tax portfolio — accumulation through drawdown
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
    </div>
  );
}
