import { useState, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${Math.round(n)}`;
const fmtPct = (n) => `${n.toFixed(1)}%`;

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:     "#0d1117",
  surface:"#161b22",
  border: "#21262d",
  gold:   "#d4a843",
  blue:   "#58a6ff",
  green:  "#3fb950",
  purple: "#bc8cff",
  orange: "#f78166",
  text:   "#e6edf3",
  muted:  "#8b949e",
  card:   "#0d1117",  // stat card background — darker than surface for depth
};

// Shared reusable style objects — apply with spread: { ...panel }
const panel = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "18px 20px",
};
const sectionTitle = {
  margin: "0 0 16px",
  fontSize: 13,
  fontWeight: 700,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const mono = { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 };

// ── 2026 Federal tax brackets + standard deductions by filing status ──────────
const TAX_DATA_2026 = {
  single: {
    label: "Single", deduction: 16_100,
    brackets: [
      { min: 0,       max: 12_400,   rate: 0.10 },
      { min: 12_400,  max: 50_400,   rate: 0.12 },
      { min: 50_400,  max: 105_700,  rate: 0.22 },
      { min: 105_700, max: 201_775,  rate: 0.24 },
      { min: 201_775, max: 256_225,  rate: 0.32 },
      { min: 256_225, max: 640_600,  rate: 0.35 },
      { min: 640_600, max: Infinity, rate: 0.37 },
    ],
  },
  mfj: {
    label: "Married Filing Jointly", deduction: 32_200,
    brackets: [
      { min: 0,       max: 24_800,   rate: 0.10 },
      { min: 24_800,  max: 100_800,  rate: 0.12 },
      { min: 100_800, max: 211_400,  rate: 0.22 },
      { min: 211_400, max: 403_550,  rate: 0.24 },
      { min: 403_550, max: 512_450,  rate: 0.32 },
      { min: 512_450, max: 768_700,  rate: 0.35 },
      { min: 768_700, max: Infinity, rate: 0.37 },
    ],
  },
  mfs: {
    label: "Married Filing Separately", deduction: 16_100,
    brackets: [
      { min: 0,       max: 12_400,   rate: 0.10 },
      { min: 12_400,  max: 50_400,   rate: 0.12 },
      { min: 50_400,  max: 105_700,  rate: 0.22 },
      { min: 105_700, max: 201_775,  rate: 0.24 },
      { min: 201_775, max: 256_225,  rate: 0.32 },
      { min: 256_225, max: 384_350,  rate: 0.35 },
      { min: 384_350, max: Infinity, rate: 0.37 },
    ],
  },
  hoh: {
    label: "Head of Household", deduction: 23_350,
    brackets: [
      { min: 0,       max: 18_650,   rate: 0.10 },
      { min: 18_650,  max: 64_100,   rate: 0.12 },
      { min: 64_100,  max: 105_700,  rate: 0.22 },
      { min: 105_700, max: 201_775,  rate: 0.24 },
      { min: 201_775, max: 256_225,  rate: 0.32 },
      { min: 256_225, max: 640_600,  rate: 0.35 },
      { min: 640_600, max: Infinity, rate: 0.37 },
    ],
  },
};

// Returns { tax, effectiveRate } where effectiveRate = tax / agi
function calcTax(agi, filingStatus = "single") {
  const { deduction, brackets } = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  const taxable = Math.max(0, agi - deduction);
  let tax = 0;
  for (const { min, max, rate } of brackets) {
    if (taxable <= min) break;
    tax += (Math.min(taxable, max) - min) * rate;
  }
  return { tax, effectiveRate: agi > 0 ? tax / agi : 0 };
}

// Returns the marginal rate on the next dollar of income
function marginalRate(agi, filingStatus = "single") {
  const { deduction, brackets } = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  const taxable = Math.max(0, agi - deduction);
  for (const { min, max, rate } of brackets) {
    if (taxable <= max) return rate;
  }
  return 0.37;
}

// ── State income tax rates (2025/2026 approximate effective rates) ────────────
const STATE_TAX = {
  AL: { name: "Alabama",           rate: 0.050 }, AK: { name: "Alaska",            rate: 0.000 },
  AZ: { name: "Arizona",           rate: 0.025 }, AR: { name: "Arkansas",          rate: 0.044 },
  CA: { name: "California",        rate: 0.093 }, CO: { name: "Colorado",          rate: 0.044 },
  CT: { name: "Connecticut",       rate: 0.065 }, DE: { name: "Delaware",          rate: 0.066 },
  FL: { name: "Florida",           rate: 0.000 }, GA: { name: "Georgia",           rate: 0.055 },
  HI: { name: "Hawaii",            rate: 0.090 }, ID: { name: "Idaho",             rate: 0.058 },
  IL: { name: "Illinois",          rate: 0.049 }, IN: { name: "Indiana",           rate: 0.030 },
  IA: { name: "Iowa",              rate: 0.057 }, KS: { name: "Kansas",            rate: 0.057 },
  KY: { name: "Kentucky",          rate: 0.045 }, LA: { name: "Louisiana",         rate: 0.030 },
  ME: { name: "Maine",             rate: 0.075 }, MD: { name: "Maryland",          rate: 0.055 },
  MA: { name: "Massachusetts",     rate: 0.050 }, MI: { name: "Michigan",          rate: 0.042 },
  MN: { name: "Minnesota",         rate: 0.098 }, MS: { name: "Mississippi",       rate: 0.047 },
  MO: { name: "Missouri",          rate: 0.048 }, MT: { name: "Montana",           rate: 0.059 },
  NE: { name: "Nebraska",          rate: 0.052 }, NV: { name: "Nevada",            rate: 0.000 },
  NH: { name: "New Hampshire",     rate: 0.000 }, NJ: { name: "New Jersey",        rate: 0.075 },
  NM: { name: "New Mexico",        rate: 0.059 }, NY: { name: "New York",          rate: 0.085 },
  NC: { name: "North Carolina",    rate: 0.045 }, ND: { name: "North Dakota",      rate: 0.025 },
  OH: { name: "Ohio",              rate: 0.040 }, OK: { name: "Oklahoma",          rate: 0.045 },
  OR: { name: "Oregon",            rate: 0.099 }, PA: { name: "Pennsylvania",      rate: 0.031 },
  RI: { name: "Rhode Island",      rate: 0.060 }, SC: { name: "South Carolina",    rate: 0.065 },
  SD: { name: "South Dakota",      rate: 0.000 }, TN: { name: "Tennessee",         rate: 0.000 },
  TX: { name: "Texas",             rate: 0.000 }, UT: { name: "Utah",              rate: 0.046 },
  VT: { name: "Vermont",           rate: 0.066 }, VA: { name: "Virginia",          rate: 0.058 },
  WA: { name: "Washington",        rate: 0.000 }, WV: { name: "West Virginia",     rate: 0.065 },
  WI: { name: "Wisconsin",         rate: 0.075 }, WY: { name: "Wyoming",           rate: 0.000 },
  DC: { name: "Washington D.C.",   rate: 0.085 },
};

// ── Retirement-specific state tax rates on 401k/IRA withdrawals (2026) ───────
// Rates reflect actual treatment of 401k/IRA distributions, NOT working-year rates.
// Many states exempt retirement income despite having a general income tax.
// Sources: Tax Foundation, Kiplinger, CNBC, 401k Specialist (2025-2026).
// Note: rates shown are representative effective rates at typical retirement income
// (~$50-80k), since several states use graduated structures even for retirees.
const RETIREMENT_STATE_TAX = {
  AL: { name: "Alabama",           rate: 0.050, note: "Taxes 401k/IRA; top rate 5%; $6k exemption age 65+" },
  AK: { name: "Alaska",            rate: 0.000, note: "No state income tax" },
  AZ: { name: "Arizona",           rate: 0.025, note: "Flat 2.5% on all income incl. 401k/IRA" },
  AR: { name: "Arkansas",          rate: 0.039, note: "Taxes 401k/IRA; top rate 3.9%" },
  CA: { name: "California",        rate: 0.093, note: "Taxes 401k/IRA; ~9.3% at typical retirement income" },
  CO: { name: "Colorado",          rate: 0.044, note: "Flat 4.4%; $24k pension/retirement exemption age 65+" },
  CT: { name: "Connecticut",       rate: 0.065, note: "Taxes 401k/IRA; ~6.5%; 50–75% of SS exempt" },
  DE: { name: "Delaware",          rate: 0.066, note: "Taxes 401k/IRA; top 6.6%; $12.5k exclusion age 60+" },
  FL: { name: "Florida",           rate: 0.000, note: "No state income tax" },
  GA: { name: "Georgia",           rate: 0.054, note: "Flat 5.39% 2026; retirement exclusion up to $65k age 65+" },
  HI: { name: "Hawaii",            rate: 0.000, note: "Fully exempts 401k/IRA/pension distributions" },
  ID: { name: "Idaho",             rate: 0.053, note: "Flat 5.3% on all income incl. 401k/IRA" },
  IL: { name: "Illinois",          rate: 0.000, note: "4.95% income tax but fully exempts 401k/IRA/pension/SS" },
  IN: { name: "Indiana",           rate: 0.030, note: "Flat 2.95% 2026; taxes 401k/IRA; $1k exemption age 65+" },
  IA: { name: "Iowa",              rate: 0.000, note: "Flat 3.9% but fully exempts retirement income age 55+" },
  KS: { name: "Kansas",            rate: 0.057, note: "Taxes 401k/IRA; top rate 5.7%; SS exempt" },
  KY: { name: "Kentucky",          rate: 0.040, note: "Flat 4.0% 2026; taxes 401k/IRA; $31k pension exclusion" },
  LA: { name: "Louisiana",         rate: 0.030, note: "Flat 3% 2026; taxes 401k/IRA" },
  ME: { name: "Maine",             rate: 0.075, note: "Taxes 401k/IRA; ~7.5% at typical retirement income" },
  MD: { name: "Maryland",          rate: 0.048, note: "Taxes 401k/IRA; ~4.8%; $36.2k exclusion age 65+" },
  MA: { name: "Massachusetts",     rate: 0.050, note: "Flat 5%; taxes most retirement income" },
  MI: { name: "Michigan",          rate: 0.000, note: "401k/IRA/pension fully exempt by 2026 (PA 4 of 2023)" },
  MN: { name: "Minnesota",         rate: 0.068, note: "Taxes 401k/IRA; ~6.8% at typical retirement income" },
  MS: { name: "Mississippi",       rate: 0.000, note: "4% income tax but fully exempts 401k/IRA/pension" },
  MO: { name: "Missouri",          rate: 0.048, note: "Taxes 401k/IRA; top 4.8%; SS fully exempt" },
  MT: { name: "Montana",           rate: 0.057, note: "Taxes 401k/IRA; top 5.65% 2026; $5,500 retirement deduction" },
  NE: { name: "Nebraska",          rate: 0.046, note: "Flat 4.55% 2026; taxes 401k/IRA; SS exempt" },
  NV: { name: "Nevada",            rate: 0.000, note: "No state income tax" },
  NH: { name: "New Hampshire",     rate: 0.000, note: "No state income tax (I&D tax repealed 2025)" },
  NJ: { name: "New Jersey",        rate: 0.063, note: "Taxes 401k/IRA; ~6.3%; pension exclusion up to $100k" },
  NM: { name: "New Mexico",        rate: 0.059, note: "Taxes 401k/IRA; top 5.9%; limited SS exemption" },
  NY: { name: "New York",          rate: 0.065, note: "Taxes 401k/IRA; ~6.5%; $20k pension exclusion" },
  NC: { name: "North Carolina",    rate: 0.040, note: "Flat 3.99% 2026; taxes 401k/IRA" },
  ND: { name: "North Dakota",      rate: 0.025, note: "Top rate 2.5%; taxes 401k/IRA; very low burden" },
  OH: { name: "Ohio",              rate: 0.028, note: "Flat 2.75% 2026; taxes 401k/IRA" },
  OK: { name: "Oklahoma",          rate: 0.048, note: "Top rate 4.75% 2026; taxes 401k/IRA" },
  OR: { name: "Oregon",            rate: 0.099, note: "Taxes 401k/IRA; ~9.9%; up to $7,500 credit available" },
  PA: { name: "Pennsylvania",      rate: 0.000, note: "3.07% income tax but fully exempts 401k/IRA/pension age 60+" },
  RI: { name: "Rhode Island",      rate: 0.048, note: "Taxes 401k/IRA; top rate 4.75%; SS partially taxed" },
  SC: { name: "South Carolina",    rate: 0.062, note: "Taxes 401k/IRA; top 6.2%; $10k retirement deduction age 65+" },
  SD: { name: "South Dakota",      rate: 0.000, note: "No state income tax" },
  TN: { name: "Tennessee",         rate: 0.000, note: "No state income tax" },
  TX: { name: "Texas",             rate: 0.000, note: "No state income tax" },
  UT: { name: "Utah",              rate: 0.046, note: "Flat 4.55%; taxes 401k/IRA; retirement tax credit available" },
  VT: { name: "Vermont",           rate: 0.066, note: "Taxes 401k/IRA; ~6.6% at typical retirement income" },
  VA: { name: "Virginia",          rate: 0.058, note: "Taxes 401k/IRA; top 5.75%; $12k age deduction age 65+" },
  WA: { name: "Washington",        rate: 0.000, note: "No state income tax (cap gains tax N/A to retirement accts)" },
  WV: { name: "West Virginia",     rate: 0.048, note: "Taxes 401k/IRA; top 4.82%; SS fully exempt 2026" },
  WI: { name: "Wisconsin",         rate: 0.053, note: "Taxes 401k/IRA; ~5.3% at retirement income; SS exempt" },
  WY: { name: "Wyoming",           rate: 0.000, note: "No state income tax" },
  DC: { name: "Dist. of Columbia", rate: 0.085, note: "Taxes 401k/IRA; ~8.5% at typical retirement income" },
};

// 2026 federal tax brackets — the only valid options for phase rate pickers
const FED_BRACKETS_2026 = [10, 12, 22, 24, 32, 35, 37];

const FICA_RATE        = 0.0765;
const RMD_START_AGE    = 73;  // IRS SECURE 2.0: RMDs begin at 73
const SS_MAX_CLAIM_AGE = 70;  // SSA: delayed credits stop accruing at 70
const SS_MIN_CLAIM_AGE = 62;  // SSA: earliest claiming age
const SS_FRA           = 67;  // SSA: Full Retirement Age for born ≥ 1960
const SS_AIME_YEARS    = 35;  // SSA: highest-earning years used in AIME calculation
const CATCHUP_AGE      = 50;  // IRS: age at which catchup contributions become available

// ── 2026 IRS contribution limits ──────────────────────────────────────────────
const TRAD_401K_LIMIT_2026      = 24_500; // employee elective deferral limit (under 50)
const ROTH_IRA_LIMIT_2026       =  7_500; // Roth IRA annual contribution limit
const HSA_LIMIT_2026            =  4_300; // HSA individual (self-only) limit
const LIMIT_415C_2026           = 70_000; // 415(c) combined limit, under 50
const LIMIT_415C_CATCHUP_2026   = 77_500; // 415(c) combined limit, 50+ (with super-catchup)
const FICA_WAGE_BASE = 168_600; // 2026 Social Security wage base
// INFLATION is now a user-controlled state variable (inflationRate) — see App() state block

// 2026 long-term capital gains brackets (taxable income thresholds)
const LTCG_BRACKETS_2026 = {
  single: [ { max: 47_025,  rate: 0.00 }, { max: 518_900, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
  mfj:    [ { max: 94_050,  rate: 0.00 }, { max: 583_750, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
  mfs:    [ { max: 47_025,  rate: 0.00 }, { max: 291_850, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
  hoh:    [ { max: 63_000,  rate: 0.00 }, { max: 551_350, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
};

// 2026 Roth IRA income phase-out thresholds (MAGI)
const ROTH_PHASEOUT_2026 = {
  single: { start: 150_000, end: 165_000 },
  mfj:    { start: 230_000, end: 240_000 },
  mfs:    { start:       0, end:  10_000 },
  hoh:    { start: 150_000, end: 165_000 },
};

// Returns the LTCG rate given ordinary taxable income and filing status
function ltcgRate(ordinaryIncome, filingStatus = "single") {
  const brackets = LTCG_BRACKETS_2026[filingStatus] ?? LTCG_BRACKETS_2026.single;
  for (const { max, rate } of brackets) {
    if (ordinaryIncome <= max) return rate;
  }
  return 0.20;
}

// IRS Uniform Lifetime Table (SECURE 2.0) — divisors for RMD calculations
// IRS Table III — Uniform Lifetime (Pub. 590-B, 2022+)
// Used by: unmarried owners; married owners whose spouse is NOT sole beneficiary;
// married owners whose spouse is sole beneficiary but NOT more than 10 yrs younger.
const RMD_TABLE3 = {
  73:26.5, 74:25.5, 75:24.6, 76:23.7, 77:22.9, 78:22.0, 79:21.1,
  80:20.2, 81:19.4, 82:18.5, 83:17.7, 84:16.8, 85:16.0,
  86:15.2, 87:14.4, 88:13.7, 89:12.9, 90:12.2, 91:11.5, 92:10.8,
  93:10.1, 94:9.5,  95:8.9,  96:8.4,  97:7.8,  98:7.3,  99:6.8,
};

// IRS Table II — Joint Life and Last Survivor (Pub. 590-B, 2022+)
// Used ONLY when: married owner + spouse is sole designated beneficiary
// + spouse is MORE than 10 years younger than owner.
// Indexed as RMD_TABLE2[ownerAge][spouseAge].
// Source: IRS Pub. 590-B Appendix B, verified against Capital Group and Fidelity tables.
// Falls back to RMD_TABLE3 for age combinations not present here.
const RMD_TABLE2 = {
  73:{49:37.7,50:36.8,51:36.0,52:35.1,53:34.2,54:33.4,55:32.6,56:31.7,57:30.9,58:30.1,59:29.4,60:28.6,61:27.9,62:27.2,63:26.5,64:25.8,65:25.1,66:24.5,67:23.9,68:23.3,69:22.7,70:22.2},
  74:{49:37.7,50:36.8,51:35.9,52:35.0,53:34.1,54:33.3,55:32.4,56:31.6,57:30.8,58:30.0,59:29.2,60:28.4,61:27.7,62:27.0,63:26.2,64:25.5,65:24.9,66:24.2,67:23.6,68:23.0,69:22.4,70:21.8},
  75:{49:37.6,50:36.7,51:35.8,52:34.9,53:34.1,54:33.2,55:32.4,56:31.5,57:30.7,58:29.9,59:29.1,60:28.3,61:27.5,62:26.8,63:26.1,64:25.3,65:24.6,66:24.0,67:23.3,68:22.7,69:22.1,70:21.5},
  76:{49:37.5,50:36.6,51:35.7,52:34.9,53:34.0,54:33.1,55:32.3,56:31.4,57:30.6,58:29.8,59:29.0,60:28.2,61:27.4,62:26.6,63:25.9,64:25.2,65:24.4,66:23.7,67:23.1,68:22.4,69:21.8,70:21.2},
  77:{49:37.5,50:36.6,51:35.7,52:34.8,53:33.9,54:33.0,55:32.2,56:31.3,57:30.5,58:29.7,59:28.8,60:28.0,61:27.3,62:26.5,63:25.7,64:25.0,65:24.3,66:23.5,67:22.9,68:22.2,69:21.5,70:20.9},
  78:{49:37.5,50:36.5,51:35.6,52:34.7,53:33.9,54:33.0,55:32.1,56:31.2,57:30.4,58:29.6,59:28.7,60:27.9,61:27.1,62:26.4,63:25.6,64:24.8,65:24.1,66:23.4,67:22.7,68:22.0,69:21.3,70:20.6},
  79:{49:37.4,50:36.5,51:35.6,52:34.7,53:33.8,54:32.9,55:32.0,56:31.2,57:30.3,58:29.5,59:28.7,60:27.8,61:27.0,62:26.2,63:25.5,64:24.7,65:23.9,66:23.2,67:22.5,68:21.8,69:21.1,70:20.4},
  80:{49:37.4,50:36.5,51:35.5,52:34.6,53:33.7,54:32.9,55:32.0,56:31.1,57:30.3,58:29.4,59:28.6,60:27.8,61:26.9,62:26.1,63:25.3,64:24.6,65:23.8,66:23.1,67:22.3,68:21.6,69:20.9,70:20.2},
  81:{49:37.3,50:36.4,51:35.5,52:34.6,53:33.7,54:32.8,55:31.9,56:31.1,57:30.2,58:29.3,59:28.5,60:27.7,61:26.9,62:26.0,63:25.2,64:24.5,65:23.7,66:22.9,67:22.2,68:21.5,69:20.7,70:20.0},
  82:{49:37.3,50:36.4,51:35.5,52:34.6,53:33.7,54:32.8,55:31.9,56:31.0,57:30.1,58:29.3,59:28.4,60:27.6,61:26.8,62:26.0,63:25.2,64:24.4,65:23.6,66:22.8,67:22.1,68:21.3,69:20.6,70:19.9,71:19.2,72:18.5,73:17.9,74:17.2,75:16.6,76:16.0,77:15.5,78:15.0,79:14.5,80:14.0},
  83:{50:36.4,51:35.4,52:34.5,53:33.6,54:32.7,55:31.8,56:31.0,57:30.1,58:29.2,59:28.4,60:27.5,61:26.7,62:25.9,63:25.1,64:24.3,65:23.5,66:22.7,67:22.0,68:21.2,69:20.5,70:19.7,71:19.0,72:18.3,73:17.7,74:17.0,75:16.4,76:15.8,77:15.2,78:14.7,79:14.2,80:13.7},
  84:{50:36.3,51:35.4,52:34.5,53:33.6,54:32.7,55:31.8,56:30.9,57:30.0,58:29.2,59:28.3,60:27.5,61:26.7,62:25.8,63:25.0,64:24.2,65:23.4,66:22.6,67:21.9,68:21.1,69:20.4,70:19.6,71:18.9,72:18.2,73:17.5,74:16.8,75:16.2,76:15.6,77:15.0,78:14.4,79:13.9,80:13.4},
  85:{50:36.3,51:35.4,52:34.5,53:33.6,54:32.7,55:31.8,56:30.9,57:30.0,58:29.1,59:28.3,60:27.4,61:26.6,62:25.8,63:25.0,64:24.1,65:23.3,66:22.6,67:21.8,68:21.0,69:20.3,70:19.5,71:18.8,72:18.1,73:17.4,74:16.7,75:16.0,76:15.4,77:14.8,78:14.2,79:13.6,80:13.1},
  86:{50:36.3,51:35.4,52:34.5,53:33.5,54:32.6,55:31.7,56:30.9,57:30.0,58:29.1,59:28.2,60:27.4,61:26.6,62:25.7,63:24.9,64:24.1,65:23.3,66:22.5,67:21.7,68:20.9,69:20.2,70:19.4,71:18.7,72:17.9,73:17.2,74:16.5,75:15.9,76:15.2,77:14.6,78:14.0,79:13.4,80:12.9},
  87:{50:36.3,51:35.4,52:34.4,53:33.5,54:32.6,55:31.7,56:30.8,57:29.9,58:29.1,59:28.2,60:27.4,61:26.5,62:25.7,63:24.9,64:24.0,65:23.2,66:22.4,67:21.6,68:20.9,69:20.1,70:19.3,71:18.6,72:17.8,73:17.1,74:16.4,75:15.7,76:15.1,77:14.4,78:13.8,79:13.2,80:12.7},
  88:{50:36.3,51:35.3,52:34.4,53:33.5,54:32.6,55:31.7,56:30.8,57:29.9,58:29.0,59:28.2,60:27.3,61:26.5,62:25.6,63:24.8,64:24.0,65:23.2,66:22.4,67:21.6,68:20.8,69:20.0,70:19.2,71:18.5,72:17.7,73:17.0,74:16.3,75:15.6,76:14.9,77:14.3,78:13.7,79:13.1,80:12.5},
  89:{50:36.3,51:35.3,52:34.4,53:33.5,54:32.6,55:31.7,56:30.8,57:29.9,58:29.0,59:28.2,60:27.3,61:26.4,62:25.6,63:24.8,64:24.0,65:23.1,66:22.3,67:21.5,68:20.7,69:20.0,70:19.2,71:18.4,72:17.7,73:16.9,74:16.2,75:15.5,76:14.8,77:14.2,78:13.5,79:12.9,80:12.3},
  90:{50:36.3,51:35.3,52:34.4,53:33.5,54:32.6,55:31.7,56:30.8,57:29.9,58:29.0,59:28.1,60:27.3,61:26.4,62:25.6,63:24.7,64:23.9,65:23.1,66:22.3,67:21.5,68:20.7,69:19.9,70:19.1,71:18.4,72:17.6,73:16.9,74:16.1,75:15.4,76:14.8,77:14.1,78:13.4,79:12.8,80:12.2},
  91:{50:36.2,51:35.3,52:34.4,53:33.5,54:32.5,55:31.6,56:30.7,57:29.9,58:29.0,59:28.1,60:27.3,61:26.4,62:25.6,63:24.7,64:23.9,65:23.1,66:22.3,67:21.5,68:20.7,69:19.9,70:19.1,71:18.3,72:17.5,73:16.8,74:16.1,75:15.3,76:14.6,77:14.0,78:13.3,79:12.7,80:12.1},
  92:{50:36.2,51:35.3,52:34.4,53:33.5,54:32.5,55:31.6,56:30.7,57:29.8,58:29.0,59:28.1,60:27.2,61:26.4,62:25.5,63:24.7,64:23.9,65:23.0,66:22.2,67:21.4,68:20.6,69:19.8,70:19.0,71:18.3,72:17.5,73:16.7,74:16.0,75:15.3,76:14.6,77:13.9,78:13.2,79:12.6,80:11.9},
};

// SS benefit adjustment factors relative to FRA (age 67 for born ≥ 1960)
const SS_FACTORS = {
  62:0.700, 63:0.750, 64:0.800, 65:0.867, 66:0.933,
  67:1.000, 68:1.080, 69:1.160, 70:1.240,
};

// 2026 PIA bend points (monthly AIME thresholds)
const SS_BEND1 = 1_226;
const SS_BEND2 = 7_391;


// ══════════════════════════════════════════════════════════════════════════════

// Labeled range slider with live value display
function Slider({ label, value, min, max, step = 1, format, onChange, valueColor }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.muted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontSize: 13, color: valueColor ?? C.gold, ...mono }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: valueColor ?? C.gold, cursor: "pointer" }}
      />
    </div>
  );
}

// Number input that only commits on blur or Enter, preventing mid-type clamping
// Displays with commas when idle; strips them while editing
function DeferredInput({ value, min, max, onChange, style }) {
  const [local,   setLocal]   = useState(String(value));
  const [focused, setFocused] = useState(false);
  const prev = useRef(value);

  if (prev.current !== value) {
    prev.current = value;
    const parsed = parseInt(local.replace(/,/g, ""), 10);
    if (isNaN(parsed) || parsed !== value) setLocal(String(value));
  }

  const commit = () => {
    const n = parseInt(local.replace(/,/g, ""), 10);
    if (!isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      setLocal(String(clamped));
    } else {
      setLocal(String(value));
    }
    setFocused(false);
  };

  const display = focused ? local : Number(local.replace(/,/g, "") || value).toLocaleString();

  return (
    <input
      type="text" inputMode="numeric" value={display}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { setFocused(true); setLocal(local.replace(/,/g, "")); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={style}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAX PHASE COMPONENTS  (used only by the main App)
// ══════════════════════════════════════════════════════════════════════════════

// Proportional colored bar visualising 2–3 tax phases across the timeline
function TaxTimeline({ phase1End, phase2End, totalYears, rate1, rate2, rate3, showPhase2 }) {
  const p1pct = showPhase2 ? (phase1End / totalYears) * 100 : (phase2End / totalYears) * 100;
  const p2pct = showPhase2 ? ((phase2End - phase1End) / totalYears) * 100 : 0;
  const p3pct = ((totalYears - phase2End) / totalYears) * 100;

  // Single coloured segment; renders null when width is zero
  const Seg = ({ pct, color, label, rate }) => {
    if (pct <= 0) return null;
    return (
      <div style={{
        width: `${pct}%`, minWidth: 30,
        background: color, opacity: 0.85,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transition: "width 0.3s",
      }}>
      {pct > 8 && (
        <span style={{ fontSize: 10, color: "#0d1117", fontWeight: 700, whiteSpace: "nowrap" }}>
          {label}: {rate}%
        </span>
      )}
      </div>
    );
  };

  return (
    <div style={{ borderRadius: 6, overflow: "hidden", height: 26, display: "flex", marginBottom: 4 }}>
      <Seg pct={p1pct} color={C.gold}  label={showPhase2 ? "Now" : "Working"} rate={rate1} />
      {showPhase2 && <Seg pct={p2pct} color={C.blue}  label="Mid"  rate={rate2} />}
      <Seg pct={p3pct} color={C.green} label="Ret."   rate={rate3} />
    </div>
  );
}

// Card for a single tax phase: coloured border, bracket picker or free input, optional children
function TaxPhaseCard({ phaseNum, label, color, yearRange, rate, setRate, combinedRate, children }) {
  return (
    <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${color}` }}>
      <p style={{ margin: "0 0 2px", fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {phaseNum} {label}
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 10, color: C.muted }}>{yearRange}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {FED_BRACKETS_2026.map(pct => (
          <button key={pct} onClick={() => setRate(pct)} style={{
            padding: "4px 8px", fontSize: 11, fontWeight: 700, border: "none",
            borderRadius: 4, cursor: "pointer",
            background: rate === pct ? color : C.border,
            color:      rate === pct ? "#0d1117" : C.muted,
            fontFamily: "'IBM Plex Mono', monospace",
          }}>{pct}%</button>
        ))}
      </div>
      {combinedRate !== undefined && combinedRate !== rate && (
        <p style={{ margin: "0 0 4px", fontSize: 9, color: C.muted }}>
          Combined (fed+state): <span style={{ color, fontWeight: 700 }}>{(combinedRate * 100).toFixed(1)}%</span>
        </p>
      )}
      {children}
    </div>
  );
}

// Dark-themed tooltip for all recharts charts
function ChartTooltip({ active, payload, label, valueFormatter = fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ margin: "0 0 6px", color: C.muted, fontSize: 12 }}>Age {label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "2px 0", fontSize: 13, ...mono }}>
          <span style={{ color: C.text }}>{p.name}: </span>
          <span style={{ color: p.color }}>{valueFormatter(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// Pure tax-phase rate function — no React state dependency, safe to extract to utils
// year: simulation year (1-indexed from currentAge); opts: the six phase-related state values
function getTaxRate(year, { rate1, rate2, rate3, phase2Start, phase2End, showPhase2 }) {
  if (!showPhase2) return year < phase2End ? rate1 / 100 : rate3 / 100;
  if (year < phase2Start) return rate1 / 100;
  if (year < phase2End)   return rate2 / 100;
  return rate3 / 100;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP — Retirement Account Modeler
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {

  // ── Timeline state ────────────────────────────────────────────────────────
  const [currentAge,    setCurrentAge]    = useState(30);
  const [retirementAge, setRetirementAge] = useState(65);
  const [lifeExpect,    setLifeExpect]    = useState(90);
  const [returnRate,    setReturnRate]    = useState(5);
  const [inflationRate, setInflationRate] = useState(4);    // % — default 4%, adjustable

  // ── Income / tax state ────────────────────────────────────────────────────
  const [currentIncome, setCurrentIncome] = useState(100_000);
  const [incomeGrowth,  setIncomeGrowth]  = useState(3);
  const [selectedState, setSelectedState] = useState("TX");
  const [stateRateOverride, setStateRateOverride] = useState(null); // null = use table default; number = user override
  const [filingStatus,  setFilingStatus]  = useState("single");
  const [otherPreTaxDeduc, setOtherPreTaxDeduc] = useState(0);  // non-retirement pre-tax: FSA, dependent care, transit, etc.

  // ── Tax phase state ───────────────────────────────────────────────────────
  const [rate1,       setRate1]       = useState(22);  // Phase 1 — current/working
  const [rate2,       setRate2]       = useState(24);  // Phase 2 — mid-career (optional)
  const [rate3,       setRate3]       = useState(18);  // Phase 3 — retirement
  const [showPhase2,  setShowPhase2]  = useState(false);
  const [phase2Start, setPhase2Start] = useState(2);   // simulation year phase 2 begins
  const [retirementState, setRetirementState] = useState(selectedState); // defaults to working state; user can change

  // ── Account balance state ─────────────────────────────────────────────────
  const [bal401k,    setBal401k]    = useState(50_000);
  const [balRoth,    setBalRoth]    = useState(25_000);
  const [balTaxable, setBalTaxable] = useState(80_000);
  const [balHSA,     setBalHSA]     = useState(10_000);

  // ── Contribution state (annual amount + age to stop contributing) ─────────
  const [contrib401k,    setContrib401k]    = useState(10_000);
  const [contribRoth,    setContribRoth]    = useState(7_000);
  const [contribTaxable, setContribTaxable] = useState(4_000);
  const [contribHSA,     setContribHSA]     = useState(3_850);

  const [contribEnd401k,    setContribEnd401k]    = useState(65);
  const [contribEndRoth,    setContribEndRoth]    = useState(65);
  const [contribEndTaxable, setContribEndTaxable] = useState(65);
  const [contribEndHSA,     setContribEndHSA]     = useState(65);

  // ── Retirement goal state ─────────────────────────────────────────────────
  const [retirementTarget, setRetirementTarget] = useState(3_000_000);
  const [annualExpenses,   setAnnualExpenses]   = useState(null); // null = auto 3% of portfolio

  // ── Budget & optimization state ───────────────────────────────────────────
  const [livingExpenses,       setLivingExpenses]       = useState(null); // null = auto-derive from take-home minus contributions
  const [livingExpenseGrowth,  setLivingExpenseGrowth]  = useState(3);    // % annual growth (default: ~inflation)
  const [savingsSurplusPct,    setSavingsSurplusPct]    = useState(50);   // % of surplus to allocate to optimized savings
  const [preApplySnapshot,     setPreApplySnapshot]     = useState(null); // stores contribution values before "Apply" for revert

  // ── Navigation state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("planner");

  // ── Detailed Planner state ────────────────────────────────────────────────
  const [ssClaimingAge,     setSsClaimingAge]     = useState(SS_FRA);
  const [isMarried,         setIsMarried]         = useState(false);
  const [spouseIsSoleBenef, setSpouseIsSoleBenef] = useState(false);
  const [spouseCurrentAge,  setSpouseCurrentAge]  = useState(18); // must be < currentAge; min 18
  const [ssOverride,        setSsOverride]        = useState(null); // null = use calculated estimate
  const [includeSS,         setIncludeSS]         = useState(true); // toggle SS out of retirement calcs

  // ── Pension state ────────────────────────────────────────────────────────
  const [pensionMonthly,   setPensionMonthly]   = useState(0);      // monthly pension benefit ($)
  const [pensionStartAge,  setPensionStartAge]  = useState(65);     // age pension payments begin

  // ── Spouse / partner income state ──────────────────────────────────────
  const [spouseIncome,       setSpouseIncome]       = useState(0);       // spouse gross annual income
  const [spouseIncomeGrowth, setSpouseIncomeGrowth] = useState(3);       // % annual growth

  // ── Spouse Social Security state ───────────────────────────────────────
  const [spouseSsEstimate, setSpouseSsEstimate] = useState(0);  // spouse's own SS annual benefit (0 = not applicable)

  // ── Roth conversion state ─────────────────────────────────────────────────
  const [conversionMode,          setConversionMode]          = useState("bracket");
  const [conversionBracketTarget, setConversionBracketTarget] = useState(22);
  const [annualConversionAmt,     setAnnualConversionAmt]     = useState(20_000);
  const [conversionTaxSource,     setConversionTaxSource]     = useState("converted"); // "converted" or "taxable"
  const [employerMatchPct,        setEmployerMatchPct]        = useState(3);
  const [matchMode,               setMatchMode]               = useState("flat"); // "flat" = pct of salary; "formula" = rate% of first cap% of salary
  const [matchFormulaRate,        setMatchFormulaRate]        = useState(50);     // e.g. 50 = employer matches 50 cents per dollar
  const [matchFormulaCap,         setMatchFormulaCap]         = useState(6);      // e.g. 6 = "of the first 6% of salary"

  // ── Retirement state tax (derived from state — used in all downstream calcs) ─
  const retStateRate  = RETIREMENT_STATE_TAX[retirementState]?.rate ?? 0;
  const rate3Combined = Math.min(0.95, rate3 / 100 + retStateRate);

  // ── Derived timeline values ───────────────────────────────────────────────
  const safeRetAge  = Math.max(retirementAge, currentAge + phase2Start + 1);
  const phase2End   = safeRetAge - currentAge; // sim year retirement starts (1-indexed)
  const safeLifeExp = Math.max(lifeExpect, safeRetAge + 1);
  const totalYears  = safeLifeExp - currentAge;

  // ── Employer match helper ────────────────────────────────────────────────
  // Flat mode: match = salary × employerMatchPct%
  // Formula mode: match = min(employeeContrib, salary × matchFormulaCap%) × matchFormulaRate%
  // e.g. "50% of the first 6% of salary" = min($10K contrib, $100K × 6%) × 50% = $3K
  const calcEmployerMatch = (salary, employeeContrib) => {
    if (matchMode === "formula") {
      const matchableContrib = Math.min(employeeContrib, salary * matchFormulaCap / 100);
      return Math.round(matchableContrib * matchFormulaRate / 100);
    }
    // flat: employer matches a flat % of salary regardless of employee contribution level
    return Math.round(salary * employerMatchPct / 100);
  };

  // ── Portfolio simulation (accumulation only — no withdrawals yet) ─────────
  // Contributions scale with income growth each year while the account is funded.
  // Trad 401k shown after-tax using the phase tax rate for that year.
  // Taxable brokerage: annual cap-gains drag (assumes active trading / regular
  //   realization), but rate is determined from that year's income using 2026
  //   LTCG brackets rather than a flat 15%.
  const simData = useMemo(() => {
    let trad = bal401k, roth = balRoth, taxable = balTaxable, hsa = balHSA;
    const r = returnRate / 100;
    const g = incomeGrowth / 100;
    const arr = [];

    for (let y = 1; y <= totalYears; y++) {
      const age        = currentAge + y;
      const taxRate    = getTaxRate(y, { rate1, rate2, rate3, phase2Start, phase2End, showPhase2 });
      const growFactor = Math.pow(1 + g, y - 1);

      // Employer match scales with income growth; employee deferral capped at elective limit
      const limit415cYr    = currentAge + (y - 1) >= CATCHUP_AGE ? LIMIT_415C_CATCHUP_2026 : LIMIT_415C_2026;
      const electiveLimit  = currentAge + (y - 1) >= CATCHUP_AGE
        ? TRAD_401K_LIMIT_2026 + 7_500  // 2026: $24,500 + $7,500 catch-up
        : TRAD_401K_LIMIT_2026;
      // Employee deferral: grows with income but capped at the IRS elective limit
      const employeeDeferral = age <= contribEnd401k
        ? Math.min(contrib401k * growFactor, electiveLimit)
        : 0;
      const matchAmt     = age <= contribEnd401k ? calcEmployerMatch(currentIncome * growFactor, employeeDeferral) : 0;
      // Combined employee + match, capped at 415(c) limit
      const c401k        = Math.min(employeeDeferral + matchAmt, limit415cYr);
      const cRoth    = (() => {
        if (age > contribEndRoth || contribRoth <= 0) return 0;
        // IRS annual limit (sim-level guard — matches ROTH_IRA_LIMIT_2026)
        const rothCap = currentAge + (y - 1) >= CATCHUP_AGE
          ? ROTH_IRA_LIMIT_2026 + 1_000  // 50+ catch-up
          : ROTH_IRA_LIMIT_2026;
        const baseContrib = Math.min(contribRoth, rothCap);
        // Roth MAGI = combined household income for that year (primary + spouse, both growing)
        const primaryMAGI = currentIncome * growFactor;
        const spouseMAGI  = spouseIncome * Math.pow(1 + spouseIncomeGrowth / 100, y - 1);
        const yearMAGI    = primaryMAGI + spouseMAGI;
        const po = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
        if (yearMAGI >= po.end) return 0; // fully phased out
        if (yearMAGI <= po.start) return baseContrib; // full contribution
        // Linear phase-out: reduce proportionally
        const phasePct = (po.end - yearMAGI) / (po.end - po.start);
        return Math.round(baseContrib * phasePct);
      })();
      const cTaxable = age <= contribEndTaxable ? contribTaxable * growFactor : 0;
      // HSA capped at IRS annual limit (sim-level guard — matches HSA_LIMIT_2026)
      const cHSA     = age <= contribEndHSA     ? Math.min(contribHSA, HSA_LIMIT_2026) : 0;

      trad = (trad + c401k) * (1 + r);
      roth = (roth + cRoth) * (1 + r);
      hsa  = (hsa  + cHSA)  * (1 + r);

      // LTCG rate from this year's AGI (income minus pre-tax deductions)
      const ordinaryIncome = currentIncome * growFactor - employeeDeferral - cHSA;
      const capGainsRate   = ltcgRate(ordinaryIncome, filingStatus);
      taxable = (taxable + cTaxable) * (1 + r * (1 - capGainsRate));

      arr.push({
        age,
        "Trad 401k": Math.round(trad * (1 - taxRate)),
        "Roth IRA":  Math.round(roth),
        "Taxable":   Math.round(taxable),
        "HSA":       Math.round(hsa),
        tradGross:   Math.round(trad), // pre-tax gross 401k balance — used for RMD calc
        c401k: Math.round(c401k), cRoth: Math.round(cRoth),
        cTaxable: Math.round(cTaxable), cHSA: Math.round(cHSA),
      });
    }
    return arr;
  }, [
    returnRate, totalYears, currentAge, currentIncome, incomeGrowth, filingStatus,
    spouseIncome, spouseIncomeGrowth,
    rate1, rate2, rate3, phase2Start, phase2End, showPhase2,
    bal401k, balRoth, balTaxable, balHSA,
    contrib401k, contribRoth, contribTaxable, contribHSA,
    contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
    employerMatchPct, matchMode, matchFormulaRate, matchFormulaCap,
  ]);

  // Snapshot values at the retirement year (array is 0-indexed, sim is 1-indexed)
  const atRetirement = simData[phase2End - 1] ?? {};

  // ── Current-year income / tax calculations ────────────────────────────────
  // totalPreTaxDeduc is auto-derived: 401k + HSA contributions (which are pre-tax)
  // plus any other pre-tax benefits (FSA, dependent care, transit).
  // This eliminates the old disconnect where preTaxDeduc was a separate manual input
  // that could diverge from actual contribution amounts.
  const totalPreTaxDeduc = contrib401k + contribHSA + otherPreTaxDeduc;
  const safeDeduc       = Math.min(totalPreTaxDeduc, currentIncome);
  const agi             = currentIncome - safeDeduc;
  const { tax: fedTax, effectiveRate: fedEffRate } = calcTax(agi, filingStatus);
  const fedMarginal     = marginalRate(agi, filingStatus);
  const stateRateDefault = STATE_TAX[selectedState]?.rate ?? 0;
  const stateRate       = stateRateOverride !== null ? stateRateOverride : stateRateDefault;
  const stateTax        = agi * stateRate;
  const fica            = Math.min(currentIncome, FICA_WAGE_BASE) * FICA_RATE;
  const takeHome        = currentIncome - fedTax - stateTax - fica - safeDeduc;
  const combinedEffRate = (fedTax + stateTax + fica) / currentIncome;
  const noStateTax      = stateRate === 0;

  // ── Combined household income (Feature 5: spouse/partner) ──────────────
  const combinedIncome = currentIncome + spouseIncome;
  const rothPhaseout = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
  const rothPhaseoutWarning = combinedIncome >= rothPhaseout.start;
  const rothFullyPhased     = combinedIncome >= rothPhaseout.end;

  // ── Budget & savings capacity ──────────────────────────────────────────
  // grossAfterTax = income after taxes but BEFORE pre-tax deductions are removed.
  // Since totalPreTaxDeduc is now auto-derived from contrib401k + contribHSA + other,
  // and those same contributions appear in currentContribTotal, we must start from
  // grossAfterTax to avoid counting them twice. The tax benefit of pre-tax contributions
  // is already captured in lower fedTax (since AGI = income - totalPreTaxDeduc).
  const grossAfterTax       = currentIncome - fedTax - stateTax - fica;
  const currentContribTotal = contrib401k + contribRoth + contribTaxable + contribHSA;
  const effectiveLiving     = livingExpenses ?? Math.max(0, grossAfterTax - currentContribTotal);
  const savingsCapacity     = Math.max(0, grossAfterTax - effectiveLiving);
  const availableSurplus    = Math.max(0, savingsCapacity - currentContribTotal);

  // Deploy surplus in IRS-optimal priority order:
  // 1. Capture full employer match  2. Max HSA  3. Max Roth IRA  4. Max 401k  5. Taxable overflow
  const optimizedAllocation = (() => {
    let remaining = Math.round(availableSurplus * savingsSurplusPct / 100);
    const alloc = { extra401k: 0, extraRoth: 0, extraHSA: 0, extraTaxable: 0, extraMatch: 0 };

    // 1. Employer match: make sure 401k contribution captures full match
    // Formula mode: employee must contribute at least salary × matchFormulaCap% to max out
    // Flat mode: match is salary-based, but ensure employee contributes enough to trigger it
    const matchContribNeeded = matchMode === "formula"
      ? Math.round(currentIncome * matchFormulaCap / 100)
      : Math.round(currentIncome * employerMatchPct / 100);
    if ((employerMatchPct > 0 || matchMode === "formula") && contrib401k < matchContribNeeded) {
      const matchGap = Math.min(remaining, matchContribNeeded - contrib401k);
      alloc.extraMatch = matchGap;
      alloc.extra401k += matchGap;
      remaining -= matchGap;
    }

    // 2. HSA (highest tax advantage — triple tax-free)
    const hsaRoom = Math.max(0, HSA_LIMIT_2026 - contribHSA);
    if (remaining > 0 && hsaRoom > 0) {
      const hsaAdd = Math.min(remaining, hsaRoom);
      alloc.extraHSA = hsaAdd;
      remaining -= hsaAdd;
    }

    // 3. Roth IRA (tax-free growth, no RMDs — unless phased out)
    if (remaining > 0 && !rothFullyPhased) {
      const rothRoom = Math.max(0, ROTH_IRA_LIMIT_2026 - contribRoth);
      const rothAdd = Math.min(remaining, rothRoom);
      alloc.extraRoth = rothAdd;
      remaining -= rothAdd;
    }

    // 4. 401k to max (pre-tax deduction at marginal rate)
    const room401k = Math.max(0, TRAD_401K_LIMIT_2026 - contrib401k - alloc.extra401k);
    if (remaining > 0 && room401k > 0) {
      const add401k = Math.min(remaining, room401k);
      alloc.extra401k += add401k;
      remaining -= add401k;
    }

    // 5. Taxable brokerage (anything left)
    if (remaining > 0) {
      alloc.extraTaxable = remaining;
      remaining = 0;
    }

    alloc.totalExtra = alloc.extra401k + alloc.extraRoth + alloc.extraHSA + alloc.extraTaxable;
    alloc.opt401k    = contrib401k + alloc.extra401k;
    alloc.optRoth    = contribRoth + alloc.extraRoth;
    alloc.optHSA     = contribHSA + alloc.extraHSA;
    alloc.optTaxable = contribTaxable + alloc.extraTaxable;
    return alloc;
  })();

  // ── Account config ────────────────────────────────────────────────────────
  // Single source of truth for all four accounts.
  // To add a new account type: add one entry here — all loops pick it up.
  const ACCOUNTS = [
    {
      key: "Traditional 401k", dataKey: "Trad 401k", color: C.gold,   note: "Pre-tax",
      growsWithIncome: true,
      val: bal401k,    setVal: setBal401k,    contribMax: TRAD_401K_LIMIT_2026,
      contrib: contrib401k,    setContrib: setContrib401k,
      endAge: contribEnd401k,  setEndAge: setContribEnd401k,
    },
    {
      key: "Roth IRA",         dataKey: "Roth IRA",  color: C.blue,   note: "After-tax",
      growsWithIncome: false,
      val: balRoth,    setVal: setBalRoth,    contribMax: ROTH_IRA_LIMIT_2026,
      contrib: contribRoth,    setContrib: setContribRoth,
      endAge: contribEndRoth,  setEndAge: setContribEndRoth,
    },
    {
      key: "Taxable Brokerage",dataKey: "Taxable",   color: C.green,  note: "After-tax",
      growsWithIncome: true,
      val: balTaxable, setVal: setBalTaxable, contribMax: 100_000,
      contrib: contribTaxable, setContrib: setContribTaxable,
      endAge: contribEndTaxable, setEndAge: setContribEndTaxable,
    },
    {
      key: "HSA",              dataKey: "HSA",       color: C.purple, note: "Triple tax-free",
      growsWithIncome: false,
      val: balHSA,     setVal: setBalHSA,     contribMax: HSA_LIMIT_2026,
      contrib: contribHSA,     setContrib: setContribHSA,
      endAge: contribEndHSA,   setEndAge: setContribEndHSA,
    },
  ];

  // Retirement values and ranking (best → worst)
  const retVals = Object.fromEntries(
    ACCOUNTS.map(a => [a.dataKey, atRetirement[a.dataKey] ?? 0])
  );
  const ranked = Object.entries(retVals).sort((a, b) => b[1] - a[1]);

  // Drawdown calculations using total after-tax portfolio at retirement
  const totalAtRet       = Object.values(retVals).reduce((s, v) => s + v, 0);
  const effectiveExpenses = annualExpenses ?? Math.round(totalAtRet * 0.03);
  // Inflation-adjusted real return: (1+r)/(1+inflation) - 1
  const rReal            = (1 + returnRate / 100) / (1 + inflationRate / 100) - 1;

  // ── Social Security estimation ────────────────────────────────────────────
  // MUST be computed before drawdown metrics, since netPortfolioNeed depends on SS + pension.
  // AIME = average of 35 highest earning years' monthly wages (income-adjusted)
  const ssWorkYears = Math.max(1, safeRetAge - currentAge);
  const ssTotalEarnings = (() => {
    let total = 0;
    for (let y = 0; y < ssWorkYears; y++) {
      // SSA only counts earnings up to the wage base each year
      const yearEarnings = currentIncome * Math.pow(1 + incomeGrowth / 100, y);
      total += Math.min(yearEarnings, FICA_WAGE_BASE);
    }
    return total;
  })();
  const ssAIME = (ssTotalEarnings / Math.max(ssWorkYears, SS_AIME_YEARS)) / 12;
  const ssPIA  = ssAIME <= SS_BEND1
    ? ssAIME * 0.90
    : ssAIME <= SS_BEND2
      ? SS_BEND1 * 0.90 + (ssAIME - SS_BEND1) * 0.32
      : SS_BEND1 * 0.90 + (SS_BEND2 - SS_BEND1) * 0.32 + (ssAIME - SS_BEND2) * 0.15;
  const ssMonthlyBenefit = Math.round(ssPIA * (SS_FACTORS[ssClaimingAge] ?? 1.0));
  const ssAnnualBenefit  = ssMonthlyBenefit * 12;
  const ss67Monthly      = Math.round(ssPIA * (SS_FACTORS[SS_FRA] ?? 1.0));
  // effectiveSS: what actually flows into all retirement calculations
  // — zero if user opts out, override value if manually set, else the calculated estimate
  const effectiveSS = includeSS
    ? (ssOverride !== null ? ssOverride : ssAnnualBenefit)
    : 0;

  // ── Spousal SS benefit ──────────────────────────────────────────────────
  const spousalBenefitAnnual = Math.round(ssPIA * 12 * 0.5);
  const spouseSsBenefit = spouseSsEstimate > 0
    ? Math.max(spouseSsEstimate, spousalBenefitAnnual)
    : 0;
  // Combined household SS used in drawdown
  const householdSS = includeSS ? effectiveSS + spouseSsBenefit : 0;

  // ── Pension income ──────────────────────────────────────────────────────
  const effectivePension = pensionStartAge <= safeRetAge && pensionMonthly > 0
    ? pensionMonthly * 12
    : 0;

  // ── Portfolio need and drawdown metrics ────────────────────────────────
  // netPortfolioNeed = what the portfolio actually needs to fund each year
  // (total expenses minus external income: SS + pension)
  const netPortfolioNeed = Math.max(0, effectiveExpenses - householdSS - effectivePension);
  const withdrawalRate   = totalAtRet > 0 ? (netPortfolioNeed / totalAtRet) * 100 : 0;
  const yearsSustained   = netPortfolioNeed <= 0 || totalAtRet * rReal >= netPortfolioNeed
    ? Infinity
    : rReal !== 0
      ? Math.log(1 - (totalAtRet * rReal) / netPortfolioNeed) / Math.log(1 / (1 + rReal))
      : totalAtRet / netPortfolioNeed;
  const isSustainable    = yearsSustained === Infinity || yearsSustained >= (safeLifeExp - safeRetAge);

  const milestones = useMemo(() => {
    const getTotal = row =>
      (row["Trad 401k"] ?? 0) + (row["Roth IRA"] ?? 0)
    + (row["Taxable"]   ?? 0) + (row["HSA"]       ?? 0);

    // 5-year marks up to retirement age only, always include retirement age
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

    // If target hit at or before retirement, trim to first crossing card
    const crossIdx = cards.findIndex(c => c.total >= retirementTarget);
    if (crossIdx !== -1) return cards.slice(0, crossIdx + 1);

    // Target not hit by retirement — find first year in simData that crosses it
    const crossRow = simData.find(d => getTotal(d) >= retirementTarget);
    if (crossRow) {
      const extra = { age: crossRow.age, total: getTotal(crossRow), isRetirement: false };
      return [...cards, extra];
    }

    return cards;
  }, [simData, currentAge, safeRetAge, retirementTarget]);

  // Total portfolio lifecycle — single continuous line, accumulation then drawdown
  const totalChartData = useMemo(() => {
    const result = [];

    // Accumulation phase: sum all 4 accounts from simData up to and including retirement age
    for (const d of simData) {
      result.push({
        age: d.age,
        total: (d["Trad 401k"] ?? 0) + (d["Roth IRA"] ?? 0)
             + (d["Taxable"]   ?? 0) + (d["HSA"]       ?? 0),
      });
      if (d.age >= safeRetAge) break;
    }

    // Drawdown phase: use real (inflation-adjusted) return
    // Only netPortfolioNeed comes from the portfolio — SS and pension are external income
    let bal = result[result.length - 1]?.total ?? 0;
    for (let age = safeRetAge + 1; age <= safeLifeExp; age++) {
      bal = bal * (1 + rReal) - netPortfolioNeed;
      result.push({ age, total: Math.max(0, Math.round(bal)) });
      if (bal <= 0) break;
    }

    return result;
  }, [simData, safeRetAge, safeLifeExp, returnRate, inflationRate, netPortfolioNeed]);


  // Break-even age vs always-claiming-at-67 baseline
  const ssBreakEven = ssClaimingAge === SS_FRA ? null : (() => {
    let cumClaim = 0, cum67 = 0;
    for (let m = 1; m <= 50 * 12; m++) {
      const ageNow = ssClaimingAge + m / 12;
      if (ageNow >= ssClaimingAge) cumClaim += ssMonthlyBenefit;
      if (ageNow >= SS_FRA)            cum67    += ss67Monthly;
      if (ssClaimingAge < SS_FRA && cum67 >= cumClaim && ageNow > SS_FRA)
        return Math.floor(ageNow);
      if (ssClaimingAge > SS_FRA && cumClaim >= cum67 && ageNow > ssClaimingAge)
        return Math.floor(ageNow);
    }
    return null;
  })();

  // ── RMD projections ────────────────────────────────────────────────────────
  // Determine which IRS table applies based on marital/beneficiary status
  const useTable2 = isMarried && spouseIsSoleBenef && (currentAge - spouseCurrentAge > 10);
  const activeTableLabel = useTable2
    ? "Table II (Joint Life)"
    : "Table III (Uniform Lifetime)";

  const rmdData = useMemo(() => {
    const retRow = simData.find(d => d.age === safeRetAge);
    if (!retRow) return [];
    const r = returnRate / 100;
    const result = [];
    let bal = retRow.tradGross ?? 0;
    // If retiring at or after 73, the retirement year itself requires an RMD
    // (taken from end-of-year retirement balance before any further growth)
    if (safeRetAge >= RMD_START_AGE) {
      const sAge0 = useTable2 ? Math.round(spouseCurrentAge + (safeRetAge - currentAge)) : null;
      let d0 = useTable2 ? (RMD_TABLE2[safeRetAge]?.[sAge0] ?? null) : null;
      if (d0 === null) d0 = RMD_TABLE3[safeRetAge] ?? null;
      const rmd0 = d0 ? Math.round(bal / d0) : 0;
      if (d0) bal -= rmd0;
      result.push({ age: safeRetAge, rmd: rmd0, bal: Math.round(bal), required: !!d0, divisor: d0 });
    }
    for (let age = safeRetAge + 1; age <= safeLifeExp; age++) {
      bal = bal * (1 + r);
      let divisor = null;
      if (useTable2) {
        const sAge = Math.round(spouseCurrentAge + (age - currentAge));
        divisor = RMD_TABLE2[age]?.[sAge] ?? null;
      }
      if (divisor === null) divisor = RMD_TABLE3[age] ?? null;
      const rmd = divisor ? Math.round(bal / divisor) : 0;
      if (divisor) bal -= rmd;
      result.push({ age, rmd, bal: Math.round(bal), required: !!divisor, divisor });
    }
    return result.filter(d => d.age >= RMD_START_AGE);
  }, [simData, safeRetAge, safeLifeExp, returnRate, useTable2, spouseCurrentAge, currentAge]);

  const firstRMD    = rmdData[0];
  const totalRMDs   = rmdData.reduce((s, d) => s + d.rmd, 0);
  const rmdTaxBite  = Math.round(totalRMDs * rate3Combined);

  // ── Roth conversion ladder calculations ──────────────────────────────────
  // Window: years from retirement to 73 (before mandatory RMDs kick in)
  const conversionWindowYrs = Math.max(0, RMD_START_AGE - 1 - safeRetAge); // ages safeRetAge+1 through 72 (before age-73 RMDs)

  // Bracket fill helper — how much to convert to fill up to target bracket top
  // At retirement, ordinary income = Roth conversion + up to 85% of SS benefit + pension
  const retTaxData   = TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single;
  const ssTaxableRet = householdSS * 0.85; // IRS: up to 85% of SS benefit is taxable
  const retIncomeFloor = ssTaxableRet + effectivePension; // all ordinary income before conversions
  const bracketTops  = {
    12: retTaxData.brackets[1]?.max ?? 50_400,
    22: retTaxData.brackets[2]?.max ?? 105_700,
    24: retTaxData.brackets[3]?.max ?? 201_775,
  };
  // Convert taxable income ceiling to gross income ceiling, then subtract SS and pension
  const bracketFillConversion = Math.max(0, Math.round(
    (bracketTops[conversionBracketTarget] ?? bracketTops[22]) + retTaxData.deduction - ssTaxableRet - effectivePension
  ));
  const annualConversion = conversionMode === "bracket" ? bracketFillConversion : annualConversionAmt;

  // Year-by-year simulation through the conversion window
  // Computes BOTH scenarios: tax paid from converted amount vs from taxable brokerage
  const conversionSim = useMemo(() => {
    const retRow = simData.find(d => d.age === safeRetAge);
    if (!retRow || conversionWindowYrs === 0)
      return {
        years: [], tradBal73: retRow?.tradGross ?? 0,
        // "converted" scenario (tax from converted amount)
        rothBalEnd_conv: retVals["Roth IRA"] ?? 0, totalTax_conv: 0, taxableBalEnd_conv: retVals["Taxable"] ?? 0,
        // "taxable" scenario (tax from taxable brokerage)
        rothBalEnd_tax: retVals["Roth IRA"] ?? 0, totalTax_tax: 0, taxableBalEnd_tax: retVals["Taxable"] ?? 0,
        // legacy fields — point to whichever source is selected
        rothBalEnd: retVals["Roth IRA"] ?? 0, totalTax: 0,
      };
    const r = returnRate / 100;
    // Scenario A: tax paid from CONVERTED amount (less efficient — Roth receives less)
    let tradA = retRow.tradGross ?? 0, rothA = retVals["Roth IRA"] ?? 0, taxableA = retVals["Taxable"] ?? 0, totalTaxA = 0;
    // Scenario B: tax paid from TAXABLE brokerage (more efficient — full conversion into Roth)
    let tradB = retRow.tradGross ?? 0, rothB = retVals["Roth IRA"] ?? 0, taxableB = retVals["Taxable"] ?? 0, totalTaxB = 0;
    const years = [];
    for (let yr = 0; yr < conversionWindowYrs; yr++) {
      tradA *= (1 + r); rothA *= (1 + r); taxableA *= (1 + r);
      tradB *= (1 + r); rothB *= (1 + r); taxableB *= (1 + r);
      const conversion = Math.min(annualConversion, Math.min(tradA, tradB));
      const taxOnConversion = Math.round(conversion * marginalRate(retIncomeFloor + conversion, filingStatus));
      // Scenario A: tax from converted
      tradA -= conversion;
      rothA += (conversion - taxOnConversion);
      totalTaxA += taxOnConversion;
      // Scenario B: tax from taxable brokerage
      tradB -= conversion;
      rothB += conversion;
      taxableB -= taxOnConversion;
      totalTaxB += taxOnConversion;
      years.push({
        age: safeRetAge + yr + 1, conversion: Math.round(conversion),
        tradBal: Math.round(conversionTaxSource === "taxable" ? tradB : tradA),
        rothBal: Math.round(conversionTaxSource === "taxable" ? rothB : rothA),
        tax: Math.round(taxOnConversion),
      });
    }
    tradA *= (1 + r); tradB *= (1 + r);
    const primaryRoth     = conversionTaxSource === "taxable" ? Math.round(rothB) : Math.round(rothA);
    const primaryTax      = conversionTaxSource === "taxable" ? Math.round(totalTaxB) : Math.round(totalTaxA);
    const primaryTradBal  = conversionTaxSource === "taxable" ? Math.round(tradB) : Math.round(tradA);
    return {
      years,
      tradBal73: primaryTradBal,
      rothBalEnd: primaryRoth,
      totalTax: primaryTax,
      // Both scenarios for comparison display
      rothBalEnd_conv: Math.round(rothA), totalTax_conv: Math.round(totalTaxA), taxableBalEnd_conv: Math.round(taxableA),
      rothBalEnd_tax:  Math.round(rothB), totalTax_tax:  Math.round(totalTaxB), taxableBalEnd_tax:  Math.round(taxableB),
      rothAdvantage: Math.round(rothB - rothA), // how much more Roth you get by paying from taxable
    };
  }, [simData, safeRetAge, conversionWindowYrs, annualConversion, retVals["Roth IRA"], retVals["Taxable"], returnRate, retIncomeFloor, filingStatus, conversionTaxSource]);

  // RMDs after conversions — same divisor logic, reduced starting balance
  const rmdDataPostConversion = useMemo(() => {
    if (conversionWindowYrs === 0) return rmdData;
    const r = returnRate / 100;
    const result = [];
    let bal = conversionSim.tradBal73;
    for (let age = RMD_START_AGE; age <= safeLifeExp; age++) {
      bal = bal * (1 + r);
      let divisor = null;
      if (useTable2) {
        const sAge = Math.round(spouseCurrentAge + (age - currentAge));
        divisor = RMD_TABLE2[age]?.[sAge] ?? null;
      }
      if (divisor === null) divisor = RMD_TABLE3[age] ?? null;
      const rmd = divisor ? Math.round(bal / divisor) : 0;
      if (divisor) bal -= rmd;
      result.push({ age, rmd, bal: Math.round(bal), required: !!divisor, divisor });
    }
    return result.filter(d => d.age >= RMD_START_AGE);
  }, [conversionSim, safeLifeExp, returnRate, rmdData, conversionWindowYrs, useTable2, spouseCurrentAge, currentAge]);

  const totalRMDsPost        = rmdDataPostConversion.reduce((s, d) => s + d.rmd, 0);
  const rmdTaxSaved          = Math.max(0, rmdTaxBite - Math.round(totalRMDsPost * rate3Combined));
  const netConversionBenefit = rmdTaxSaved - conversionSim.totalTax;

  // ── Mega Backdoor Roth calculations ───────────────────────────────────────
  // 2026 IRS 415(c) combined contribution limit
  const limit415c         = currentAge >= CATCHUP_AGE ? LIMIT_415C_CATCHUP_2026 : LIMIT_415C_2026;
  const employerMatchAmt  = calcEmployerMatch(currentIncome, contrib401k);
  const megaCapacity      = Math.max(0, limit415c - contrib401k - employerMatchAmt);
  // Projected growth of annual mega backdoor contributions at returnRate
  const megaGrowth        = [5, 10, 20].map(yrs => ({
    yrs,
    val: returnRate > 0
      ? Math.round(megaCapacity * ((Math.pow(1 + returnRate / 100, yrs) - 1) / (returnRate / 100)))
      : megaCapacity * yrs,
  }));

  // ── Withdrawal strategy ───────────────────────────────────────────────────
  // netPortfolioNeed is now computed above alongside drawdown metrics
  // Estimated Year-1 tax: draw net need in optimal order (taxable → trad → Roth)
  const retTaxable = retVals["Taxable"]   ?? 0;
  const retTrad    = retVals["Trad 401k"] ?? 0;
  const retRoth    = retVals["Roth IRA"]  ?? 0;

  const yr1FromTaxable = Math.min(netPortfolioNeed, retTaxable);
  const yr1FromTrad    = Math.min(Math.max(0, netPortfolioNeed - yr1FromTaxable), retTrad);
  const yr1FromRoth    = Math.min(Math.max(0, netPortfolioNeed - yr1FromTaxable - yr1FromTrad), retRoth);
  const yr1TaxOptimal  = Math.round(
    yr1FromTaxable * ltcgRate(0, filingStatus) + // taxable: LTCG on gains (conservative: 0 ordinary income)
    yr1FromTrad    * rate3Combined              + // trad: ordinary income at retirement rate (fed+state)
    yr1FromRoth    * 0                            // roth: tax-free
  );
  // Worst-case: draw entirely from traditional first
  const yr1TaxWorstCase = Math.round(Math.min(netPortfolioNeed, retTrad) * rate3Combined);
  const yr1TaxSavings   = Math.max(0, yr1TaxWorstCase - yr1TaxOptimal);

  // ── Rec 1: Phase 1 rate mismatch ─────────────────────────────────────────
  const actualMarginalPct  = Math.round(fedMarginal * 100);
  const phase1RateMismatch = Math.abs(rate1 - actualMarginalPct) >= 1; // flag if off by ≥ 1pp

  // ── Rec 2: 401k contribution room ────────────────────────────────────────
  const contrib401kRoom    = Math.max(0, TRAD_401K_LIMIT_2026 - contrib401k); // room to annual elective limit
  const contrib401kTaxSave = Math.round(contrib401kRoom * fedMarginal); // fed tax saved by filling it

  // ── Rec 3: RMD bracket sanity check ──────────────────────────────────────
  // Estimate average annual ordinary income in retirement: RMDs + 85% of SS
  const avgAnnualRMD       = rmdData.length > 0 ? Math.round(totalRMDs / rmdData.length) : 0;
  const projRetIncome      = avgAnnualRMD + Math.round(householdSS * 0.85) + effectivePension;
  // Find which 2026 federal bracket that projected income falls in
  const retBrackets        = (TAX_DATA_2026[filingStatus] ?? TAX_DATA_2026.single).brackets;
  const projRetBracket     = retBrackets.find(b => projRetIncome >= b.min && projRetIncome < b.max)
                          ?? retBrackets[retBrackets.length - 1];
  const projRetBracketPct  = Math.round(projRetBracket.rate * 100);
  // Combined projected effective rate including retirement state
  const projRate3Combined  = Math.round((projRetBracket.rate + retStateRate) * 100);
  const rate3Mismatch      = Math.abs(Math.round(rate3Combined * 100) - projRate3Combined) >= 3;

  // ── Rec 4: SS delay → portfolio longevity ────────────────────────────────
  // Compare yearsSustained at current claiming age vs claiming at 70
  const ss70Annual      = Math.round(ssPIA * (SS_FACTORS[SS_MAX_CLAIM_AGE] ?? 1.24)) * 12;
  const household70SS   = ss70Annual + spouseSsBenefit; // spouse SS unchanged by delay
  const ss70DrawReduction = Math.max(0, household70SS - householdSS); // extra SS income at 70
  const ysSS70          = (() => {
    if (!includeSS || ssClaimingAge >= SS_MAX_CLAIM_AGE) return null; // already at max or SS excluded
    const need70 = Math.max(0, effectiveExpenses - household70SS - effectivePension);
    if (need70 <= 0 || totalAtRet * rReal >= need70) return Infinity;
    if (rReal !== 0) {
      const arg = 1 - (totalAtRet * rReal) / need70;
      return arg > 0 ? Math.log(arg) / Math.log(1 / (1 + rReal)) : 0;
    }
    return totalAtRet / need70;
  })();
  const ssDelayGainYrs  = (ysSS70 !== null && ysSS70 !== Infinity && yearsSustained !== Infinity)
    ? Math.max(0, Math.round(ysSS70 - yearsSustained))
    : null;
  // withdrawal rate at 70 vs current — always accurate regardless of gap assumptions
  const wr70 = totalAtRet > 0
    ? Math.max(0, effectiveExpenses - household70SS - effectivePension) / totalAtRet * 100
    : 0;

  const selectStyle = {
    width: "100%", background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.text, fontSize: 13, padding: "7px 10px",
    outline: "none", cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238b949e'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "calc(100% - 10px) center",
  };

  // ── Flow-Down waterfall data ───────────────────────────────────────────
  const flowData = useMemo(() => {
    const startPortfolio = bal401k + balRoth + balTaxable + balHSA;

    // ── Phase 1: Accumulation ──────────────────────────────────────────
    const accumRows   = simData.filter(d => d.age <= safeRetAge);
    const totalContrib = accumRows.reduce((s, d) =>
      s + (d.c401k || 0) + (d.cRoth || 0) + (d.cTaxable || 0) + (d.cHSA || 0), 0);
    const totalGrowth  = Math.max(0, totalAtRet - startPortfolio - totalContrib);

    // ── Phase 2: Conversion Window (retirement → 72) ───────────────────
    const hasConvWindow  = conversionWindowYrs > 0;
    const portAt73       = totalChartData.find(d => d.age === RMD_START_AGE)?.total
                        ?? totalChartData.find(d => d.age === safeRetAge)?.total
                        ?? totalAtRet;
    const convWindowDraws  = netPortfolioNeed * conversionWindowYrs;
    const convWindowTax    = hasConvWindow ? conversionSim.totalTax : 0;
    const totalConverted   = hasConvWindow
      ? conversionSim.years.reduce((s, y) => s + y.conversion, 0)
      : 0;
    const convWindowGrowth = portAt73 - totalAtRet + convWindowDraws + convWindowTax;

    // ── Phase 3: Distribution (73+ or retirement+ if no window) ────────
    const distStartAge = hasConvWindow ? RMD_START_AGE : safeRetAge;
    const distStartVal = hasConvWindow ? portAt73 : totalAtRet;
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

    // peak portfolio for scaling bars
    const peakPortfolio = Math.max(
      startPortfolio, totalAtRet,
      hasConvWindow ? portAt73 : 0,
      ...totalChartData.map(d => d.total)
    );

    return {
      startPortfolio, totalContrib, totalGrowth, totalAtRet,
      hasConvWindow, conversionWindowYrs, portAt73,
      convWindowDraws, convWindowTax, convWindowGrowth, totalConverted,
      distStartAge, distStartVal, distEndVal, distYears,
      distDraws, distRMDTax, distGrowth, depletionAge, actualSustainedYrs,
      peakPortfolio,
    };
  }, [
    bal401k, balRoth, balTaxable, balHSA, simData, safeRetAge, totalAtRet,
    conversionWindowYrs, conversionSim, totalChartData, safeLifeExp,
    netPortfolioNeed, rmdTaxBite, yearsSustained,
  ]);

  // ── Optimized "what-if" scenario ─────────────────────────────────────
  // Budget-constrained: deploys only the surplus the user can afford (based on
  // living expenses and the savingsSurplusPct slider), allocated in IRS-optimal
  // priority order via optimizedAllocation. NOT a max-everything fantasy.
  const optimized = useMemo(() => {
    const r = returnRate / 100;
    const g = incomeGrowth / 100;
    const yearsToRet = Math.max(1, safeRetAge - currentAge);
    const oa = optimizedAllocation;

    const fvAnnuity = (annual, rate, years) => {
      if (annual <= 0 || years <= 0) return 0;
      return rate > 0 ? annual * ((Math.pow(1 + rate, years) - 1) / rate) : annual * years;
    };

    // Extra 401k: year-by-year (room shrinks as income-scaled contributions grow)
    let extra401kFV = 0;
    if (oa.extra401k > 0) {
      for (let y = 1; y <= yearsToRet; y++) {
        const growFactor  = Math.pow(1 + g, y - 1);
        const currentC    = contrib401k * growFactor;
        const roomThisYr  = Math.max(0, TRAD_401K_LIMIT_2026 - currentC);
        const extraThisYr = Math.min(oa.extra401k, roomThisYr);
        extra401kFV += extraThisYr * Math.pow(1 + r, yearsToRet - y);
      }
      extra401kFV *= (1 - rate3 / 100);
    }

    // Extra HSA, Roth: flat contributions, full growth
    const extraHSAFV     = fvAnnuity(oa.extraHSA, r, yearsToRet);
    const extraRothFV    = fvAnnuity(oa.extraRoth, r, yearsToRet);
    // Extra taxable: growth net of LTCG drag (~15% of return)
    const extraTaxableFV = fvAnnuity(oa.extraTaxable, r * 0.85, yearsToRet);

    const extraPortfolio = Math.round(extra401kFV) + Math.round(extraHSAFV)
                         + Math.round(extraRothFV) + Math.round(extraTaxableFV);
    const optTotalAtRet  = totalAtRet + extraPortfolio;

    // SS at 70 vs current claiming age
    const optSS = includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE
      ? ss70Annual + spouseSsBenefit : householdSS;
    const optNetNeed = Math.max(0, effectiveExpenses - optSS - effectivePension);
    const optWR = optTotalAtRet > 0 ? (optNetNeed / optTotalAtRet) * 100 : 0;

    const optYS = optNetNeed <= 0 || optTotalAtRet * rReal >= optNetNeed
      ? Infinity
      : rReal !== 0
        ? Math.log(1 - (optTotalAtRet * rReal) / optNetNeed) / Math.log(1 / (1 + rReal))
        : optTotalAtRet / optNetNeed;

    const optSustainable  = optYS === Infinity || optYS >= (safeLifeExp - safeRetAge);
    const optDepletionAge = optYS === Infinity ? null : Math.floor(safeRetAge + optYS);
    const annualTaxSaving     = yr1TaxSavings;
    const lifetimeConvBenefit = Math.max(0, netConversionBenefit);

    const actionCount = [
      oa.extra401k > 0, oa.extraHSA > 0, oa.extraRoth > 0,
      includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE,
      netConversionBenefit > 0, yr1TaxSavings > 0,
      conversionSim.rothAdvantage > 0 && retTaxable > 0,
    ].filter(Boolean).length;

    const hasImprovement = extraPortfolio > totalAtRet * 0.005
      || optYS > yearsSustained * 1.05
      || (optSustainable && !isSustainable);

    return {
      totalAtRet: optTotalAtRet, extraPortfolio,
      extra401kFV: Math.round(extra401kFV), extraHSAFV: Math.round(extraHSAFV),
      extraRothFV: Math.round(extraRothFV), extraTaxableFV: Math.round(extraTaxableFV),
      ss: optSS, netNeed: optNetNeed, withdrawalRate: optWR,
      yearsSustained: optYS, sustainable: optSustainable, depletionAge: optDepletionAge,
      annualTaxSaving, lifetimeConvBenefit, actionCount, hasImprovement,
      allocation: oa,
    };
  }, [
    totalAtRet, optimizedAllocation, returnRate, incomeGrowth, safeRetAge, currentAge,
    rate3, contrib401k, includeSS, ssClaimingAge, ss70Annual, spouseSsBenefit,
    householdSS, effectiveExpenses, effectivePension, rReal, safeLifeExp,
    yr1TaxSavings, netConversionBenefit, isSustainable, yearsSustained,
    conversionSim, retTaxable,
  ]);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
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
        /* Detailed planner responsive grids */
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
          /* Flow-Down responsive */
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
                      <span style={{ color: C.muted }}>HSA contribution</span>
                      <span style={{ color: C.purple, ...mono }}>{fmt(contribHSA)}</span>
                    </div>
                    {otherPreTaxDeduc > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                        <span style={{ color: C.muted }}>Other pre-tax</span>
                        <span style={{ color: C.blue, ...mono }}>{fmt(otherPreTaxDeduc)}</span>
                      </div>
                    )}
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
              { label: "Gross Income",             val: fmt(currentIncome),                            color: C.text    },
              { label: "Pre-Tax Deductions",        val: safeDeduc > 0 ? `- ${fmt(safeDeduc)}` : "-",  color: safeDeduc > 0 ? C.blue : C.muted },
              { label: "AGI",                       val: fmt(agi),                                      color: C.gold    },
              { label: "Federal Tax",               val: fmt(fedTax),                                   color: C.orange  },
              { label: `State Tax (${selectedState})`, val: noStateTax ? "-" : fmt(stateTax),           color: noStateTax ? C.muted : C.purple },
              { label: "FICA (7.65%)",              val: fmt(fica),                                     color: "#6e7681" },
              { label: "Est. Take-Home",            val: fmt(takeHome),                                 color: C.green   },
            ].map(({ label, val, color }) => (
              <div key={label} className="breakdown-row">
                <span style={{ color: C.muted }}>{label}</span>
                <span style={{ color, ...mono }}>{val}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8,
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Fed Effective", val: fmtPct(fedEffRate * 100),             color: C.orange, sub: "fed / AGI"       },
                { label: "Marginal",      val: `${(fedMarginal * 100).toFixed(0)}%`, color: C.gold,   sub: "next $1"         },
                { label: "Combined",      val: fmtPct(combinedEffRate * 100),        color: C.blue,   sub: "all / gross"     },
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
                <span style={{ color: C.blue }}>Combined</span> uses gross — FICA is assessed on gross wages.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Budget & Savings Capacity ──────────────────────────────────────── */}
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

            <Slider
              label="Living Expense Growth / yr"
              value={livingExpenseGrowth} min={0} max={10} step={0.5}
              format={v => `${v}%`}
              onChange={setLivingExpenseGrowth} valueColor={C.orange}
            />

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <Slider
                label="Deploy This % of Surplus"
                value={savingsSurplusPct} min={0} max={100} step={5}
                format={v => `${v}%`}
                onChange={v => { setSavingsSurplusPct(v); setPreApplySnapshot(null); }} valueColor={C.green}
              />
              <p style={{ margin: "-8px 0 0", fontSize: 10, color: C.muted }}>
                Controls the "Optimized" scenario in the Flow-Down tab.
                <span style={{ color: C.green }}> {savingsSurplusPct}%</span> of your
                <span style={{ color: C.gold }}> {fmt(availableSurplus)}</span> surplus =
                <span style={{ color: C.green, ...mono }}> {fmt(Math.round(availableSurplus * savingsSurplusPct / 100))}/yr</span> extra savings
              </p>
            </div>
          </div>

          <div>
            {/* Waterfall breakdown */}
            <div style={{ background: C.card, borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.06em", fontWeight: 700 }}>Savings Waterfall</p>
              {[
                { label: "Income After Taxes",         val: grossAfterTax,                      color: C.text },
                { label: "Living Expenses",           val: -effectiveLiving,                  color: C.orange },
                { label: "= Savings Capacity",        val: savingsCapacity,                   color: C.gold,  bold: true },
                { label: "Current Contributions",     val: -currentContribTotal,              color: C.blue },
                { label: "= Available Surplus",        val: availableSurplus,                  color: C.green, bold: true },
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

            {/* Optimized allocation preview */}
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
                  optimizedAllocation.extraTaxable > 0 && { label: "⑤ Taxable",       val: optimizedAllocation.extraTaxable, color: C.green, sub: "overflow" },
                ].filter(Boolean).map(({ label, val, color, sub }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0" }}>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      {label} <span style={{ fontSize: 8, color: `${color}80` }}>{sub}</span>
                    </span>
                    <span style={{ fontSize: 11, color, ...mono }}>+{fmt(val)}/yr</span>
                  </div>
                ))}

                {/* New contributions after applying */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
                  <p style={{ margin: "0 0 4px", fontSize: 9, color: C.muted }}>
                    New annual contributions if applied:
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { label: "401k", val: optimizedAllocation.opt401k, color: C.gold },
                      { label: "Roth", val: optimizedAllocation.optRoth, color: C.blue },
                      { label: "HSA",  val: optimizedAllocation.optHSA,  color: C.purple },
                      { label: "Taxable", val: optimizedAllocation.optTaxable, color: C.green },
                    ].map(({ label, val, color }) => (
                      <span key={label} style={{ fontSize: 10, color, ...mono }}>
                        {label}: {fmt(val)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Apply / Revert buttons */}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  {preApplySnapshot === null ? (
                    <button
                      onClick={() => {
                        // Save current values for revert
                        setPreApplySnapshot({
                          c401k: contrib401k, cRoth: contribRoth,
                          cTaxable: contribTaxable, cHSA: contribHSA,
                        });
                        // Apply optimized allocation to contribution sliders
                        setContrib401k(optimizedAllocation.opt401k);
                        setContribRoth(optimizedAllocation.optRoth);
                        setContribHSA(optimizedAllocation.optHSA);
                        setContribTaxable(optimizedAllocation.optTaxable);
                      }}
                      style={{
                        flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 700,
                        border: "none", borderRadius: 6, cursor: "pointer",
                        background: C.green, color: "#0d1117",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      Apply to Projections →
                    </button>
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
                          // Revert to saved values
                          setContrib401k(preApplySnapshot.c401k);
                          setContribRoth(preApplySnapshot.cRoth);
                          setContribTaxable(preApplySnapshot.cTaxable);
                          setContribHSA(preApplySnapshot.cHSA);
                          setPreApplySnapshot(null);
                        }}
                        style={{
                          padding: "7px 14px", fontSize: 10, fontWeight: 600,
                          border: `1px solid ${C.orange}60`, borderRadius: 6,
                          background: "transparent", color: C.orange, cursor: "pointer",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                        }}
                      >
                        ↺ Revert
                      </button>
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
              if (retirementAge <= v + 2) setRetirementAge(v + 2);
              // clamp spouse age: must stay below owner age
              if (spouseCurrentAge >= v) setSpouseCurrentAge(Math.max(18, v - 1));
              // clamp contribution stop ages: must be at least currentAge + 1
              if (contribEnd401k    <= v) setContribEnd401k(v + 1);
              if (contribEndRoth    <= v) setContribEndRoth(v + 1);
              if (contribEndTaxable <= v) setContribEndTaxable(v + 1);
              if (contribEndHSA     <= v) setContribEndHSA(v + 1);
            }} />
          <Slider label="Retirement Age" value={retirementAge} min={currentAge + 2} max={lifeExpect - 1}
            valueColor={C.green} onChange={v => {
              setRetirementAge(v);
              // phase2End = v - currentAge; phase2Start must stay < phase2End
              const newPhase2End = v - currentAge;
              if (phase2Start >= newPhase2End) setPhase2Start(Math.max(1, newPhase2End - 1));
              // sync contribEnd values that haven't been manually diverged from retirement age
              if (contribEnd401k    === retirementAge) setContribEnd401k(v);
              if (contribEndRoth    === retirementAge) setContribEndRoth(v);
              if (contribEndTaxable === retirementAge) setContribEndTaxable(v);
              if (contribEndHSA     === retirementAge) setContribEndHSA(v);
            }} />
          <Slider label="Life Expectancy" value={lifeExpect} min={retirementAge + 1} max={115}
            onChange={v => {
              setLifeExpect(v);
              // retirementAge max = lifeExpect - 1
              if (retirementAge >= v) {
                const newRet = v - 1;
                setRetirementAge(newRet);
                const newPhase2End = newRet - currentAge;
                if (phase2Start >= newPhase2End) setPhase2Start(Math.max(1, newPhase2End - 1));
              }
              // contribEnd* max = safeLifeExp = Math.max(v, safeRetAge+1)
              // safeRetAge >= currentAge+phase2Start+1, so safeLifeExp >= that+1
              // clamp contribEnds to v (the new lifeExpect) to be safe
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
              onClick={() => { setShowPhase2(v => !v); setPhase2Start(2); }}
              style={{
                marginTop: 8, width: "100%", padding: "3px 0", borderRadius: 5,
                border: `1px solid ${C.border}`, cursor: "pointer", transition: "all 0.15s",
                background: showPhase2 ? "#21262d" : "transparent",
                color: showPhase2 ? C.muted : "#3d444d",
                fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
                fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 600,
              }}
            >
              {showPhase2 ? "- mid-career phase" : "+ mid-career phase"}
            </button>
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
              >
                Remove
              </button>
            </TaxPhaseCard>
          )}
          <TaxPhaseCard
            phaseNum="3" label="Retirement Federal Rate" color={C.green}
            yearRange={`Year ${phase2End}+ / Age ${safeRetAge} - ${safeLifeExp}`}
            rate={rate3} setRate={setRate3}
            combinedRate={rate3Combined}
          >
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
              const step         = contribMax <= 10_000 ? 100 : contribMax <= 30_000 ? 500 : 1_000;
              const warnEndAge   = endAge > safeRetAge;
              const projContrib  = growsWithIncome && contrib > 0
                ? fmt(contrib * Math.pow(1 + incomeGrowth / 100, phase2End - 1))
                : null;
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
                      <DeferredInput
                        value={val} min={0} max={5_000_000} onChange={setVal}
                        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 4, color, fontSize: 13, padding: "3px 6px",
                          outline: "none", ...mono }}
                      />
                    </div>
                    <input
                      type="range" min={0} max={1_000_000} step={10_000} value={Math.min(val, 1_000_000)}
                      onChange={e => setVal(Number(e.target.value))}
                      style={{ width: "100%", accentColor: color, marginTop: 4 }}
                    />
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ color: C.muted, fontSize: 11 }}>$</span>
                      <DeferredInput
                        value={contrib} min={0} max={contribMax} onChange={setContrib}
                        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 4, color, fontSize: 13, padding: "3px 6px",
                          outline: "none", ...mono }}
                      />
                    </div>
                    <input
                      type="range" min={0} max={contribMax} step={step} value={contrib}
                      onChange={e => setContrib(Number(e.target.value))}
                      style={{ width: "100%", accentColor: color, marginTop: 4 }}
                    />
                    <span style={{ fontSize: 9, color: C.muted }}>
                      max ${contribMax.toLocaleString()}/yr
                      {projContrib && incomeGrowth > 0
                        ? <span style={{ color }}> · → {projContrib} at ret.</span>
                        : !growsWithIncome ? <span> · fed. cap</span> : null}
                    </span>
                    {key === "Traditional 401k" && contrib401kRoom > 0 && fedMarginal > 0 && (
                      <p style={{ margin: "3px 0 0", fontSize: 9, color: C.gold, lineHeight: 1.4 }}>
                        Max saves <span style={{ fontWeight: 700 }}>{fmt(contrib401kTaxSave)}</span> more in fed tax this yr
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <DeferredInput
                      value={endAge} min={currentAge + 1} max={safeLifeExp} onChange={setEndAge}
                      style={{ width: 44, background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 4, color: C.blue, fontSize: 13, padding: "3px 4px",
                        outline: "none", textAlign: "center", ...mono }}
                    />
                    {warnEndAge && (
                      <p style={{ margin: "3px 0 0", fontSize: 9, color: C.orange, whiteSpace: "nowrap" }}>past ret.</p>
                    )}
                    {endAge !== safeRetAge && (
                      <button
                        onClick={() => setEndAge(safeRetAge)}
                        style={{ marginTop: 4, padding: "2px 5px", fontSize: 8, fontWeight: 600,
                          border: `1px solid ${C.border}`, borderRadius: 3, background: "transparent",
                          color: C.muted, cursor: "pointer", whiteSpace: "nowrap",
                          fontFamily: "'DM Sans', system-ui, sans-serif", lineHeight: 1.4,
                          display: "block", width: "100%" }}
                      >
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
              <DeferredInput
                value={retirementTarget} min={100_000} max={20_000_000}
                onChange={setRetirementTarget}
                style={{ width: 110, background: C.surface, border: `1px solid ${C.gold}60`,
                  borderRadius: 5, color: C.gold, fontSize: 14, padding: "3px 8px",
                  outline: "none", textAlign: "right", ...mono }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(() => {
              const firstCrossIdx = milestones.findIndex(m => m.total >= retirementTarget);
              const PCT_COLORS = {
                c1: "#f85149", c2: "#58a6ff", c3: "#d4a843",
                c4: "#f78166", c5: "#3fb950", c6: "#bc8cff",
              };
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
                    borderRadius: 8, padding: "10px 10px 8px",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", bottom: 0, left: 0,
                      width: `${barPct}%`, height: 3,
                      background: color, borderRadius: "0 2px 0 0",
                    }} />
                    <p style={{ margin: "0 0 2px", fontSize: 10, color: isFirstHit ? C.green : isRetirement ? C.gold : C.muted }}>
                      {isRetirement ? `Age ${age} ★` : `Age ${age}`}
                    </p>
                    <p style={{ margin: "0 0 3px", fontSize: 13, color: isFirstHit ? C.green : C.text, ...mono }}>
                      {fmt(total)}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color, ...mono }}>
                      {rawPct}% of goal
                    </p>
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
                  <div style={{
                    height: "100%", width: `${pctTotal}%`, background: color,
                    opacity: 0.75, borderRadius: 3, transition: "width 0.4s",
                  }} />
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
            <Slider
              label="Estimated Annual Expenses in Retirement"
              value={effectiveExpenses} min={10_000} max={300_000} step={1_000}
              format={v => `$${v.toLocaleString()}`}
              onChange={v => setAnnualExpenses(v)}
            />
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
                {effectiveSS > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.green }}>− Your Social Security</span>
                    <span style={{ fontSize: 11, color: C.green, ...mono }}>− {fmt(effectiveSS)}</span>
                  </div>
                )}
                {spouseSsBenefit > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: C.green }}>− Spouse Social Security</span>
                    <span style={{ fontSize: 11, color: C.green, ...mono }}>− {fmt(spouseSsBenefit)}</span>
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
              <p style={{ margin: "0 0 2px", fontSize: 20, ...mono,
                color: isSustainable ? C.green : C.orange }}>
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
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 400, marginLeft: 8 }}>
                vs claiming at {ssClaimingAge}
              </span>
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
                  <span style={{ color: C.green, ...mono }}>
                    ~{ssDelayGainYrs} yr{ssDelayGainYrs !== 1 ? "s" : ""} longer
                  </span>
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
          After-tax values year by year. Trad 401k shown using the retirement-phase tax rate after age {safeRetAge}.
          Dashed line marks retirement age.
        </p>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={simData.filter(d => d.age <= safeRetAge)} margin={{ top: 10, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis
              dataKey="age"
              stroke={C.muted}
              tick={{ fontSize: 11, fill: C.muted }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }}
            />
            <YAxis
              stroke={C.muted}
              tick={{ fontSize: 11, fill: C.muted }}
              tickFormatter={v => fmt(v)}
              width={82}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: C.muted, paddingTop: 8 }}
            />
            <ReferenceLine
              x={safeRetAge}
              stroke={C.green}
              strokeDasharray="5 4"
              label={{ value: "Retire", position: "insideTopRight", fill: C.green, fontSize: 10 }}
            />
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
            <XAxis
              dataKey="age"
              stroke={C.muted}
              tick={{ fontSize: 11, fill: C.muted }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }}
            />
            <YAxis
              stroke={C.muted}
              tick={{ fontSize: 11, fill: C.muted }}
              tickFormatter={v => fmt(v)}
              width={82}
            />
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
            <ReferenceLine
              x={safeRetAge}
              stroke={C.green}
              strokeDasharray="5 4"
              label={{ value: "Retire", position: "insideTopRight", fill: C.green, fontSize: 10 }}
            />
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
                letterSpacing: "0.07em", fontWeight: 700 }}>
                Social Security Estimate
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                {["Include", "Exclude"].map(opt => (
                  <button key={opt}
                    onClick={() => setIncludeSS(opt === "Include")}
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
                    <span style={{ marginLeft: 6, color: C.muted, fontStyle: "italic" }}>
                      — enter your own SS.gov estimate
                    </span>
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
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px",
                  opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Monthly Benefit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>
                    ${ssOverride !== null ? Math.round(ssOverride / 12).toLocaleString() : ssMonthlyBenefit.toLocaleString()}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>at age {ssClaimingAge}</p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px",
                  opacity: includeSS ? 1 : 0.4 }}>
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

          {/* ── Spouse Social Security (Feature 4) ─────────────────────────────── */}
          {(isMarried || spouseSsEstimate > 0) && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700 }}>
                Spouse Social Security
              </p>
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
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px",
                  opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Spouse Benefit</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>
                    {fmt(spouseSsBenefit)}/yr
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    {spouseSsEstimate > 0 && spouseSsBenefit > spouseSsEstimate
                      ? "using 50% spousal (higher)"
                      : spouseSsEstimate > 0 ? "using own benefit" : "no spouse SS"}
                  </p>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px",
                  opacity: includeSS ? 1 : 0.4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Combined Household SS</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.green, ...mono }}>
                    {fmt(householdSS)}/yr
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>
                    ${Math.round(householdSS / 12).toLocaleString()}/mo
                  </p>
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

          {/* ── Pension Income (Feature 3) ─────────────────────────────────────── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 700 }}>
                Pension Income
              </p>
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
                  <Slider label="Pension Start Age" value={pensionStartAge}
                    min={50} max={75}
                    format={v => v <= safeRetAge ? `${v} (at/before retirement)` : `${v} (after retirement)`}
                    onChange={setPensionStartAge} valueColor={C.blue} />
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Annual Pension</p>
                  <p style={{ margin: "0 0 2px", fontSize: 18, color: C.blue, ...mono }}>
                    {pensionMonthly > 0 ? fmt(pensionMonthly * 12) : "—"}
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
                  <p style={{ margin: 0, fontSize: 9, color: C.muted }}>at {(rate3Combined*100).toFixed(1)}% combined rate</p>
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
                {["Age", "IRS Divisor", "Est. 401k Balance", "RMD Amount", `Tax (${(rate3Combined*100).toFixed(1)}%)`].map(h => (
                  <span key={h} style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{h}</span>
                ))}
                {rmdData.slice(0, 10).map(({ age, rmd, bal, divisor }) => (
                  [
                    <span key={`a${age}`} style={{ color: C.gold, ...mono }}>{age}</span>,
                    <span key={`d${age}`} style={{ color: C.muted, ...mono }}>{divisor ?? "—"}</span>,
                    <span key={`b${age}`} style={{ color: C.text, ...mono }}>{fmt(bal)}</span>,
                    <span key={`r${age}`} style={{ color: C.orange, ...mono }}>{fmt(rmd)}</span>,
                    <span key={`t${age}`} style={{ color: C.muted, ...mono }}>{fmt(Math.round(rmd * rate3Combined))}</span>,
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
                        Suggested annual conversion: <span style={{ color: C.gold, ...mono }}>{fmt(bracketFillConversion)}</span>
                        <span style={{ color: C.muted }}> · assumes SS ({fmt(householdSS)}/yr, 85% taxable){effectivePension > 0 ? ` + pension (${fmt(effectivePension)}/yr)` : ""} as other ordinary income</span>
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

                {/* Feature 6: Conversion Tax Source Toggle */}
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
                    { label: "Annual Conversion",  val: fmt(annualConversion),            sub: "per year during window",        color: C.blue   },
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

              {/* Match mode toggle */}
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
                    <p key={yrs} style={{ margin: 0, fontSize: 10, color: C.purple, ...mono }}>
                      {yrs}yr: {fmt(val)}
                    </p>
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
                  <span style={{ fontSize: 10, color: C.muted }}> (expenses{householdSS > 0 ? " − SS" : ""}{effectivePension > 0 ? " − pension" : ""})</span>
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { step: 1, label: "Taxable Brokerage", color: C.green,  detail: `LTCG rates · ${fmt(retTaxable)} available`,   tax: "0–20% on gains" },
                    { step: 2, label: "Traditional 401k",  color: C.gold,   detail: `Ordinary income · ${fmt(retTrad)} available`,  tax: `${(rate3Combined*100).toFixed(1)}% est.` },
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
                    {yr1FromTrad    > 0 && <p style={{ margin: 0 }}>401k: {fmt(yr1FromTrad)} · {(rate3Combined*100).toFixed(1)}% (fed+state)</p>}
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

      {/* ═══════════════════════════════════════════════════════════════════════
           FLOW-DOWN TAB — Vertical waterfall through life phases
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "flowdown" && (
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* ── What-If Comparison Bar ──────────────────────────────────── */}
          <div style={{ ...panel, marginBottom: 0, borderBottom: "none",
            borderRadius: "10px 10px 0 0", padding: "20px 20px 16px" }}>
            <div className="fd-header-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                  letterSpacing: "0.12em", fontWeight: 700 }}>
                  Your Financial Flow-Down
                </p>
                <p style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 700 }}>
                  Age {currentAge} → {safeLifeExp}
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 400, marginLeft: 8 }}>
                    {safeLifeExp - currentAge} years
                  </span>
                </p>
              </div>
              {optimized.actionCount > 0 && (
                <div style={{ background: `${C.green}12`, borderRadius: 6, padding: "4px 10px",
                  border: `1px solid ${C.green}25` }}>
                  <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>
                    {optimized.actionCount} optimization{optimized.actionCount !== 1 ? "s" : ""} available
                  </span>
                </div>
              )}
            </div>

            {/* ── Current vs Optimized comparison ───────────────────────── */}
            {optimized.hasImprovement ? (
              <div style={{ background: C.card, borderRadius: 10, overflow: "hidden",
                border: `1px solid ${C.border}` }}>
                {/* Column headers */}
                <div className="fd-compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 0,
                  borderBottom: `1px solid ${C.border}`, padding: "8px 14px" }}>
                  <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.08em", fontWeight: 700 }}></span>
                  <span style={{ fontSize: 9, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.08em", fontWeight: 700, textAlign: "right" }}>Current</span>
                  <span style={{ fontSize: 9, color: C.green, textTransform: "uppercase",
                    letterSpacing: "0.08em", fontWeight: 700, textAlign: "right" }}>Optimized</span>
                </div>

                {/* Metric rows */}
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
                    sub: optimized.withdrawalRate <= 4 && withdrawalRate > 4
                      ? "enters safe zone (≤ 4%)"
                      : null,
                  },
                  {
                    label: "Portfolio Lasts To",
                    current: yearsSustained === Infinity
                      ? "∞"
                      : `Age ${Math.floor(safeRetAge + yearsSustained)}`,
                    opt: optimized.yearsSustained === Infinity
                      ? "∞"
                      : `Age ${Math.floor(safeRetAge + optimized.yearsSustained)}`,
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
                    padding: "8px 14px",
                    borderBottom: `1px solid ${C.border}`,
                    background: improved ? `${C.green}04` : "transparent",
                  }}>
                    <div>
                      <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{label}</span>
                      {sub && <span style={{ display: "block", fontSize: 9, color: C.green, marginTop: 1 }}>{sub}</span>}
                    </div>
                    <span style={{ fontSize: 13, color: C.muted, ...mono, textAlign: "right",
                      alignSelf: "center" }}>{current}</span>
                    <span style={{ fontSize: 13, color: improved ? C.green : C.text,
                      fontWeight: improved ? 700 : 500, ...mono, textAlign: "right",
                      alignSelf: "center" }}>{opt}</span>
                  </div>
                ))}

                {/* Bottom summary */}
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
              /* No meaningful improvement — show clean status */
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

          {/* ── Connector: start → Phase 1 ──────────────────────────────────── */}
          {(() => {
            const FlowConn = ({ value, color = C.gold, label }) => {
              const pct = flowData.peakPortfolio > 0
                ? Math.max(12, (value / flowData.peakPortfolio) * 65)
                : 12;
              return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 2, height: 10, background: `${color}35` }} />
                  <div style={{
                    width: `${pct}%`, minWidth: 90,
                    padding: "5px 14px",
                    background: `${color}10`,
                    border: `1px solid ${color}25`,
                    borderRadius: 5,
                    textAlign: "center",
                    position: "relative",
                  }}>
                    <span style={{ fontSize: 13, color, fontWeight: 700, ...mono }}>{fmt(value)}</span>
                    {label && <span style={{ fontSize: 9, color: C.muted, marginLeft: 6 }}>{label}</span>}
                  </div>
                  <div style={{ width: 2, height: 10, background: `${color}35` }} />
                </div>
              );
            };

            const WaterfallStep = ({ label, amount, type, sub, maxVal }) => {
              const isAdd   = type === "add";
              const isSub   = type === "subtract";
              const isLoss  = type === "loss";
              const isTotal = type === "total";
              const color   = isAdd ? C.green : (isSub || isLoss) ? C.orange : isTotal ? C.gold : C.muted;
              const prefix  = isAdd ? "+" : (isSub || isLoss) ? "−" : "";
              const barPct  = maxVal > 0 ? Math.max(5, (Math.abs(amount) / maxVal) * 100) : 5;

              return (
                <div className="fd-wf-step" style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                  <div style={{ width: 130, textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: isTotal ? C.text : C.muted, fontWeight: isTotal ? 600 : 400 }}>
                      {label}
                    </span>
                    {sub && <span style={{ display: "block", fontSize: 9, color: C.muted }}>{sub}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      height: isTotal ? 30 : 24,
                      width: `${barPct}%`, minWidth: 60,
                      background: isTotal
                        ? `linear-gradient(90deg, ${color}45, ${color}20)`
                        : `${color}20`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: "0 5px 5px 0",
                      display: "flex", alignItems: "center", paddingLeft: 8,
                      transition: "width 0.4s ease",
                    }}>
                      <span style={{
                        fontSize: isTotal ? 14 : 12,
                        color, fontWeight: isTotal ? 700 : 500,
                        ...mono, whiteSpace: "nowrap",
                      }}>
                        {prefix}{fmt(Math.abs(amount))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            };

            // ── Action Card component ──────────────────────────────────────
            // mode: "prescriptive" (do this), "comparative" (if X vs Y), "educational" (why this matters)
            const ActionCard = ({ mode, title, body, impact, impactColor, impactLabel, vsA, vsB }) => {
              const modeConfig = {
                prescriptive: { icon: "→", accent: C.green, label: "ACTION" },
                comparative:  { icon: "⇄", accent: C.blue,  label: "COMPARE" },
                educational:  { icon: "i",  accent: C.purple, label: "INSIGHT" },
              };
              const { icon, accent, label: modeLabel } = modeConfig[mode] ?? modeConfig.educational;

              return (
                <div style={{
                  background: `${accent}06`, border: `1px solid ${accent}20`,
                  borderRadius: 8, padding: "10px 12px", marginBottom: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", background: `${accent}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: accent, flexShrink: 0, marginTop: 1,
                    }}>{icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: accent,
                          textTransform: "uppercase", letterSpacing: "0.1em" }}>{modeLabel}</span>
                        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{title}</span>
                      </div>
                      <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>{body}</p>

                      {/* Prescriptive: single impact stat */}
                      {mode === "prescriptive" && impact !== undefined && (
                        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4,
                          background: `${impactColor ?? accent}15`, borderRadius: 4, padding: "2px 8px" }}>
                          <span style={{ fontSize: 12, color: impactColor ?? accent, fontWeight: 700, ...mono }}>
                            {typeof impact === "string" ? impact : fmt(impact)}
                          </span>
                          {impactLabel && (
                            <span style={{ fontSize: 9, color: C.muted }}>{impactLabel}</span>
                          )}
                        </div>
                      )}

                      {/* Comparative: side-by-side */}
                      {mode === "comparative" && vsA && vsB && (
                        <div className="fd-action-vs" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6,
                          alignItems: "center", marginTop: 4 }}>
                          <div style={{ background: C.surface, borderRadius: 5, padding: "4px 8px", textAlign: "center" }}>
                            <p style={{ margin: 0, fontSize: 9, color: C.muted }}>{vsA.label}</p>
                            <p style={{ margin: 0, fontSize: 13, color: vsA.color ?? C.muted, fontWeight: 600, ...mono }}>
                              {typeof vsA.value === "string" ? vsA.value : fmt(vsA.value)}
                            </p>
                            {vsA.sub && <p style={{ margin: 0, fontSize: 8, color: C.muted }}>{vsA.sub}</p>}
                          </div>
                          <span style={{ fontSize: 10, color: C.muted }}>vs</span>
                          <div style={{ background: `${C.green}10`, borderRadius: 5, padding: "4px 8px",
                            textAlign: "center", border: `1px solid ${C.green}20` }}>
                            <p style={{ margin: 0, fontSize: 9, color: C.green }}>{vsB.label}</p>
                            <p style={{ margin: 0, fontSize: 13, color: vsB.color ?? C.green, fontWeight: 600, ...mono }}>
                              {typeof vsB.value === "string" ? vsB.value : fmt(vsB.value)}
                            </p>
                            {vsB.sub && <p style={{ margin: 0, fontSize: 8, color: C.muted }}>{vsB.sub}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            };

            const PhaseCard = ({ num, title, ageRange, years, color, steps, note, actions }) => (
              <div style={{
                ...panel, marginBottom: 0, borderRadius: 0,
                borderLeft: `4px solid ${color}`,
                borderTop: `1px solid ${C.border}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: "50%", background: color,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#0d1117", flexShrink: 0,
                    }}>{num}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, color: C.text, fontWeight: 700 }}>{title}</p>
                      <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{ageRange}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, ...mono }}>{years} yr{years !== 1 ? "s" : ""}</span>
                </div>

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  {steps.map((s, i) => {
                    // insert a thin divider before "total" rows
                    const divider = s.type === "total" ? (
                      <div key={`div-${i}`} style={{ borderTop: `1px dashed ${C.border}`, margin: "6px 0 4px" }} />
                    ) : null;
                    return (
                      <div key={i}>
                        {divider}
                        <WaterfallStep {...s} maxVal={flowData.peakPortfolio} />
                      </div>
                    );
                  })}
                </div>

                {note && (
                  <div style={{ marginTop: 10, padding: "6px 10px",
                    background: `${color}08`, borderRadius: 5, borderLeft: `2px solid ${color}30` }}>
                    <p style={{ margin: 0, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{note}</p>
                  </div>
                )}

                {/* ── Action Cards ──────────────────────────────────────── */}
                {actions && actions.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                    <p style={{ margin: "0 0 8px", fontSize: 9, color: C.muted, textTransform: "uppercase",
                      letterSpacing: "0.1em", fontWeight: 700 }}>
                      Recommended Actions
                    </p>
                    {actions.map((a, i) => <ActionCard key={i} {...a} />)}
                  </div>
                )}
              </div>
            );

            // ── Build phase data arrays ───────────────────────────────────
            const phase1Steps = [
              { label: "Starting Portfolio", amount: flowData.startPortfolio, type: "start" },
              { label: "Contributions", amount: flowData.totalContrib, type: "add",
                sub: `${safeRetAge - currentAge} yrs · all accounts` },
              { label: "Investment Growth", amount: flowData.totalGrowth, type: "add",
                sub: `${returnRate}% return net of tax drag` },
              { label: "At Retirement", amount: flowData.totalAtRet, type: "total" },
            ];

            const phase2Steps = flowData.hasConvWindow ? [
              { label: "Portfolio In", amount: flowData.totalAtRet, type: "start" },
              { label: flowData.convWindowGrowth >= 0 ? "Portfolio Growth" : "Net Investment Loss",
                amount: Math.abs(flowData.convWindowGrowth),
                type: flowData.convWindowGrowth >= 0 ? "add" : "loss",
                sub: `${flowData.conversionWindowYrs} yrs at ${returnRate}% (real)` },
              { label: "Living Expenses", amount: flowData.convWindowDraws, type: "subtract",
                sub: `${fmt(netPortfolioNeed)}/yr net of SS${effectivePension > 0 ? " + pension" : ""}` },
              ...(flowData.convWindowTax > 0
                ? [{ label: "Roth Conversion Tax", amount: flowData.convWindowTax, type: "subtract",
                     sub: `on ${fmt(flowData.totalConverted)} converted` }]
                : []),
              { label: "Portfolio at 73", amount: flowData.portAt73, type: "total" },
            ] : [];

            const phase3Steps = [
              { label: "Portfolio In", amount: flowData.distStartVal, type: "start" },
              { label: flowData.distGrowth >= 0 ? "Portfolio Growth" : "Net Investment Loss",
                amount: Math.abs(flowData.distGrowth),
                type: flowData.distGrowth >= 0 ? "add" : "loss",
                sub: `${returnRate}% return (real ${((rReal)*100).toFixed(1)}%)` },
              { label: "Living Expenses", amount: flowData.distDraws, type: "subtract",
                sub: `${fmt(netPortfolioNeed)}/yr × ${flowData.actualSustainedYrs} yrs` },
              ...(flowData.distRMDTax > 0
                ? [{ label: "RMD Tax Bite", amount: flowData.distRMDTax, type: "subtract",
                     sub: `at ${(rate3Combined*100).toFixed(1)}% combined` }]
                : []),
              { label: `Remaining at ${flowData.depletionAge ?? safeLifeExp}`, amount: flowData.distEndVal, type: "total" },
            ];

            // ── Phase 1 Actions ─────────────────────────────────────────
            const phase1Actions = [];

            // Prescriptive: deploy surplus (budget-aware)
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

            // Prescriptive: capture employer match (if not already in surplus allocation)
            const fullMatchContrib = matchMode === "formula"
              ? Math.round(currentIncome * matchFormulaCap / 100)
              : Math.round(currentIncome * employerMatchPct / 100);
            const hasMatch = matchMode === "formula" ? matchFormulaRate > 0 : employerMatchPct > 0;
            if (hasMatch && contrib401k < fullMatchContrib && optimizedAllocation.extraMatch === 0) {
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

            // Educational: no surplus available
            if (availableSurplus <= 0) {
              phase1Actions.push({
                mode: "educational",
                title: "Your Budget Has No Surplus",
                body: `Your living expenses (${fmt(effectiveLiving)}) and current contributions (${fmt(currentContribTotal)}) consume your entire after-tax income (${fmt(grossAfterTax)}). To create room for optimized savings, consider reducing living expenses, increasing income, or reviewing whether current contribution levels are sustainable. Even a small surplus of $200–500/mo, allocated correctly, compounds significantly over ${safeRetAge - currentAge} years.`,
              });
            }

            // Comparative: Roth phase-out
            if (rothPhaseoutWarning) {
              phase1Actions.push({
                mode: "comparative",
                title: rothFullyPhased ? "Roth IRA: Over the Limit" : "Roth IRA: Phase-Out Zone",
                body: rothFullyPhased
                  ? `Your combined household MAGI ($${combinedIncome.toLocaleString()}) exceeds the ${TAX_DATA_2026[filingStatus].label} Roth IRA contribution limit. Direct contributions aren't allowed, but a Backdoor Roth IRA conversion is still available — contribute to a Traditional IRA, then immediately convert to Roth.`
                  : `Your combined MAGI ($${combinedIncome.toLocaleString()}) is in the Roth phase-out zone. Your maximum Roth contribution is reduced. Consider a Backdoor Roth to get the full amount in.`,
                vsA: { label: "Direct Roth", value: rothFullyPhased ? "$0" : "Reduced", color: C.orange },
                vsB: { label: "Backdoor Roth", value: fmt(ROTH_IRA_LIMIT_2026), color: C.green, sub: "full amount" },
              });
            }

            // Educational: HSA as retirement tool
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

            // Educational: Mega Backdoor
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

            // ── Phase 2 Actions ─────────────────────────────────────────
            const phase2Actions = [];

            if (flowData.hasConvWindow) {
              // Educational + prescriptive: Roth conversion ladder
              if (netConversionBenefit > 0) {
                phase2Actions.push({
                  mode: "prescriptive",
                  title: "Execute the Roth Conversion Ladder",
                  body: `Convert ${fmt(annualConversion)}/yr during your ${conversionWindowYrs}-year low-income window (ages ${safeRetAge + 1}–72). You'll pay ${fmt(conversionSim.totalTax)} in conversion tax now, but save ${fmt(rmdTaxSaved)} in RMD taxes later. Every dollar converted escapes future mandatory withdrawals and grows tax-free forever.`,
                  impact: netConversionBenefit,
                  impactColor: C.green,
                  impactLabel: "net lifetime savings",
                });
              } else if (conversionWindowYrs > 0) {
                phase2Actions.push({
                  mode: "educational",
                  title: "The Roth Conversion Window",
                  body: `Between retirement and age 73, your income drops (no W-2, no RMDs yet). This is the optimal window to move money from your 401k to Roth — paying tax at a lower rate now to avoid forced withdrawals at a higher rate later. Use the Detailed Planner to set your conversion strategy.`,
                });
              }

              // Comparative: conversion tax source
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

              // Comparative: SS claiming strategy
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

              // Prescriptive: pension reminder
              if (pensionMonthly === 0) {
                phase2Actions.push({
                  mode: "educational",
                  title: "Do You Have a Pension?",
                  body: "Government, education, military, and union workers often have defined-benefit pensions. If you do, add it in the Detailed Planner — even a small pension significantly reduces how much your portfolio needs to cover, improving sustainability.",
                });
              }
            }

            // ── Phase 3 Actions ─────────────────────────────────────────
            const phase3Actions = [];

            // Prescriptive: withdrawal order
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

            // Comparative/warning: withdrawal rate
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
                body: `At ${withdrawalRate.toFixed(1)}%, you're drawing aggressively. Your portfolio depletes at age ${flowData.depletionAge ?? "?"}. The most impactful levers: reduce annual expenses, delay retirement to grow the portfolio, or increase contributions now. Even small changes compound over ${safeRetAge - currentAge} years.`,
                impact: `${withdrawalRate.toFixed(1)}%`,
                impactColor: C.orange,
                impactLabel: "needs to be ≤ 4% for safety",
              });
            }

            // Educational: RMD awareness
            if (totalRMDs > 0 && rmdTaxBite > 50_000) {
              phase3Actions.push({
                mode: "educational",
                title: "RMDs Will Be a Major Tax Event",
                body: `Starting at 73, the IRS forces ${fmt(firstRMD?.rmd ?? 0)}/yr out of your 401k (growing each year). Over your lifetime, you'll pay an estimated ${fmt(rmdTaxBite)} in tax on these mandatory withdrawals at your ${(rate3Combined*100).toFixed(1)}% combined rate. This is exactly why Roth conversions before age 73 are so valuable — every dollar converted is one fewer dollar the IRS can force out.`,
                impact: rmdTaxBite,
                impactColor: C.orange,
                impactLabel: "lifetime RMD tax",
              });
            }

            // Comparative: SS delay (if not shown in Phase 2 because no conversion window)
            if (!flowData.hasConvWindow && includeSS && ssClaimingAge < SS_MAX_CLAIM_AGE && ss70DrawReduction > 0) {
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

            // Prescriptive: not sustainable
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

            return (
              <>
                {/* ── Phase 1: Accumulation ──────────────────────────────── */}
                <PhaseCard
                  num={1}
                  title="Build Wealth"
                  ageRange={`Age ${currentAge} → ${safeRetAge}`}
                  years={safeRetAge - currentAge}
                  color={C.gold}
                  steps={phase1Steps}
                  note={null}
                  actions={phase1Actions}
                />

                {/* ── Connector: Phase 1 → 2 ─────────────────────────────── */}
                <FlowConn value={flowData.totalAtRet} color={C.gold} label="at retirement" />

                {/* ── Phase 2: Conversion Window (conditional) ────────────── */}
                {flowData.hasConvWindow ? (
                  <>
                    <PhaseCard
                      num={2}
                      title="Optimize & Convert"
                      ageRange={`Age ${safeRetAge} → 72`}
                      years={flowData.conversionWindowYrs}
                      color={C.blue}
                      steps={phase2Steps}
                      note={flowData.totalConverted > 0
                        ? `${fmt(flowData.totalConverted)} moved from 401k → Roth during this window. Every dollar converted escapes future RMDs and grows tax-free.`
                        : `You have a ${flowData.conversionWindowYrs}-year window before RMDs start. Consider converting 401k → Roth in the Detailed Planner to reduce lifetime taxes.`}
                      actions={phase2Actions}
                    />
                    <FlowConn value={flowData.portAt73} color={C.blue} label="entering RMDs" />
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

                {/* ── Phase 3: Distribution ───────────────────────────────── */}
                <PhaseCard
                  num={3}
                  title="Spend & Distribute"
                  ageRange={`Age ${flowData.distStartAge} → ${flowData.depletionAge ?? safeLifeExp}`}
                  years={flowData.depletionAge
                    ? flowData.depletionAge - flowData.distStartAge
                    : safeLifeExp - flowData.distStartAge}
                  color={isSustainable ? C.green : C.orange}
                  steps={phase3Steps}
                  note={null}
                  actions={phase3Actions}
                />

                {/* ── Connector: final ────────────────────────────────────── */}
                <FlowConn
                  value={flowData.distEndVal}
                  color={isSustainable ? C.green : C.orange}
                  label={flowData.distEndVal > 0 ? "remaining" : "depleted"}
                />

                {/* ── Outcome Card ────────────────────────────────────────── */}
                <div style={{
                  ...panel, marginBottom: 20,
                  borderRadius: "0 0 10px 10px",
                  borderTop: `1px solid ${C.border}`,
                  textAlign: "center", padding: "20px",
                  background: isSustainable ? `${C.green}08` : `${C.orange}08`,
                }}>
                  {isSustainable ? (
                    <>
                      <p style={{ margin: "0 0 4px", fontSize: 18, color: C.green, fontWeight: 700 }}>
                        Portfolio Sustains Through Age {safeLifeExp}
                      </p>
                      <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted }}>
                        At {withdrawalRate.toFixed(1)}% withdrawal rate, your portfolio
                        {yearsSustained === Infinity
                          ? " is self-sustaining — growth exceeds spending."
                          : ` lasts ~${Math.floor(yearsSustained)} years beyond retirement.`}
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

                  {/* Income sources summary */}
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

                {/* lifecycle chart reuse — small version */}
                <div style={{ ...panel, marginBottom: 20 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 10, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.08em", fontWeight: 700 }}>
                    Portfolio Lifecycle
                  </p>
                  <p style={{ margin: "0 0 12px", fontSize: 11, color: C.muted }}>
                    Combined after-tax portfolio — accumulation through drawdown
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={totalChartData} margin={{ top: 8, right: 12, left: 12, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="age" stroke={C.muted}
                        tick={{ fontSize: 10, fill: C.muted }}
                        label={{ value: "Age", position: "insideBottom", offset: -1, fill: C.muted, fontSize: 10 }} />
                      <YAxis stroke={C.muted}
                        tick={{ fontSize: 10, fill: C.muted }}
                        tickFormatter={v => fmt(v)} width={72} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const val = payload[0]?.value;
                        const isDrawdown = label > safeRetAge;
                        return (
                          <div style={{ background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: "6px 10px" }}>
                            <p style={{ margin: "0 0 2px", fontSize: 10, color: C.muted }}>Age {label}</p>
                            <p style={{ margin: 0, fontSize: 12,
                              color: isDrawdown ? C.orange : C.gold, ...mono }}>{fmt(val ?? 0)}</p>
                          </div>
                        );
                      }} />
                      <ReferenceLine x={safeRetAge} stroke={C.green} strokeDasharray="5 4"
                        label={{ value: "Retire", position: "insideTopRight", fill: C.green, fontSize: 9 }} />
                      {flowData.hasConvWindow && (
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
