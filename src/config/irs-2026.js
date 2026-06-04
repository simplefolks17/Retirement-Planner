// ── 2026 IRS / SSA / statutory constants ─────────────────────────────────────
// ALL statutory values live here. Never hardcode limits, brackets, or thresholds
// in any other file. When IRS publishes new limits, update this file only.
// See docs/FINANCIAL-MODEL.md "IRS Annual Update Procedure" for the full checklist.

// ── Federal tax brackets + standard deductions by filing status ───────────────
export const TAX_DATA_2026 = {
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

// The valid federal bracket percentages — used by TaxPhaseCard bracket pickers
export const FED_BRACKETS_2026 = [10, 12, 22, 24, 32, 35, 37];

// ── Long-term capital gains brackets (2026 taxable income thresholds) ─────────
export const LTCG_BRACKETS_2026 = {
  single: [ { max: 47_025,  rate: 0.00 }, { max: 518_900, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
  mfj:    [ { max: 94_050,  rate: 0.00 }, { max: 583_750, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
  mfs:    [ { max: 47_025,  rate: 0.00 }, { max: 291_850, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
  hoh:    [ { max: 63_000,  rate: 0.00 }, { max: 551_350, rate: 0.15 }, { max: Infinity, rate: 0.20 } ],
};

// ── Roth IRA income phase-out thresholds (MAGI, 2026) ─────────────────────────
export const ROTH_PHASEOUT_2026 = {
  single: { start: 150_000, end: 165_000 },
  mfj:    { start: 230_000, end: 240_000 },
  mfs:    { start:       0, end:  10_000 },
  hoh:    { start: 150_000, end: 165_000 },
};

// ── 2026 Contribution limits ──────────────────────────────────────────────────
export const TRAD_401K_LIMIT_2026    = 24_500; // employee elective deferral, under 50
export const CATCHUP_401K_2026       =  7_500; // 401k catch-up addition, age 50+
export const ROTH_IRA_LIMIT_2026     =  7_500; // Roth IRA annual limit, under 50
export const CATCHUP_ROTH_2026       =  1_000; // Roth IRA catch-up addition, age 50+
export const HSA_LIMIT_2026          =  4_300; // HSA self-only annual limit
export const LIMIT_415C_2026         = 70_000; // 415(c) combined employer+employee, under 50
export const LIMIT_415C_CATCHUP_2026 = 77_500; // 415(c) combined, age 50+ (with super-catchup)
export const CATCHUP_AGE             =     50; // age at which catch-up contributions begin

// ── FICA ──────────────────────────────────────────────────────────────────────
export const FICA_RATE       = 0.0765;    // employee share: 6.2% SS + 1.45% Medicare
export const FICA_WAGE_BASE  = 168_600;   // 2026 Social Security wage base

// ── RMD ───────────────────────────────────────────────────────────────────────
export const RMD_START_AGE = 73; // SECURE 2.0: RMDs begin at 73

// ── Social Security ───────────────────────────────────────────────────────────
export const SS_FRA           = 67; // Full Retirement Age for born ≥ 1960
export const SS_MIN_CLAIM_AGE = 62; // earliest claiming age
export const SS_MAX_CLAIM_AGE = 70; // delayed credits stop accruing
export const SS_AIME_YEARS    = 35; // highest-earning years in AIME calculation

// Benefit adjustment factors relative to FRA (age 67)
export const SS_FACTORS = {
  62: 0.700, 63: 0.750, 64: 0.800, 65: 0.867, 66: 0.933,
  67: 1.000, 68: 1.080, 69: 1.160, 70: 1.240,
};

// PIA bend points (monthly AIME thresholds, 2026)
export const SS_BEND1 = 1_226;
export const SS_BEND2 = 7_391;

// ── RMD Tables ────────────────────────────────────────────────────────────────

// IRS Table III — Uniform Lifetime (Pub. 590-B, 2022+)
// Used when: unmarried; married but spouse is not sole beneficiary;
// or spouse is sole beneficiary but NOT more than 10 yrs younger.
export const RMD_TABLE3 = {
  73:26.5, 74:25.5, 75:24.6, 76:23.7, 77:22.9, 78:22.0, 79:21.1,
  80:20.2, 81:19.4, 82:18.5, 83:17.7, 84:16.8, 85:16.0,
  86:15.2, 87:14.4, 88:13.7, 89:12.9, 90:12.2, 91:11.5, 92:10.8,
  93:10.1, 94:9.5,  95:8.9,  96:8.4,  97:7.8,  98:7.3,  99:6.8,
};

// IRS Table II — Joint Life and Last Survivor (Pub. 590-B, 2022+)
// Used ONLY when: married + spouse is sole designated beneficiary
// + spouse is MORE than 10 years younger. Falls back to Table III otherwise.
// Indexed as RMD_TABLE2[ownerAge][spouseAge].
export const RMD_TABLE2 = {
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

// ── State income tax rates (working years, 2025/2026 approximate effective rates)
export const STATE_TAX = {
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

// ── Retirement-specific state tax rates on 401k/IRA withdrawals (2026) ─────────
// Rates reflect actual treatment of 401k/IRA distributions, NOT working-year rates.
// Many states exempt retirement income despite having a general income tax.
export const RETIREMENT_STATE_TAX = {
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

// ── ACA / Marketplace Insurance (2026 estimated FPL) ─────────────────────────
export const ACA_FPL_2026 = {
  1: 15_060, 2: 20_440, 3: 25_820, 4: 31_200,
  5: 36_580, 6: 41_960,
};
export const ACA_CLIFF_PCT  = 400; // subsidy disappears at 400% FPL

// ── Medicare IRMAA 2026 ───────────────────────────────────────────────────────
// 2-year lookback: IRMAA in 2026 is based on 2024 MAGI.
// Use these brackets to project future IRMAA from future conversion income.
// annualSurcharge = monthly surcharge × 12 (per person on Medicare).
export const IRMAA_BRACKETS_2026 = {
  single: [
    { magi:       0, annualSurcharge:     0 },
    { magi: 103_000, annualSurcharge: 1_044 },
    { magi: 129_000, annualSurcharge: 2_640 },
    { magi: 161_000, annualSurcharge: 4_224 },
    { magi: 193_000, annualSurcharge: 5_820 },
    { magi: 500_000, annualSurcharge: 6_708 },
  ],
  mfj: [
    { magi:       0, annualSurcharge:     0 },
    { magi: 206_000, annualSurcharge: 1_044 },
    { magi: 258_000, annualSurcharge: 2_640 },
    { magi: 322_000, annualSurcharge: 4_224 },
    { magi: 386_000, annualSurcharge: 5_820 },
    { magi: 750_000, annualSurcharge: 6_708 },
  ],
};
export const MEDICARE_AGE = 65;

// ── Model assumptions (heuristics, not IRS rules) ─────────────────────────────
// These are modeling choices documented in docs/FINANCIAL-MODEL.md.
// Separate from IRS statutory constants so they're easy to find and update.
export const ASSUMPTIONS = {
  // Taxable brokerage: annual LTCG drag applied as (1 - LTCG_DRAG_PROXY).
  // Code: taxable * (1 + r * (1 - ASSUMPTIONS.LTCG_DRAG_PROXY))
  // NOT: taxable * (1 + r * ASSUMPTIONS.LTCG_DRAG_PROXY) — that would collapse FV.
  LTCG_DRAG_PROXY:      0.15,

  // IRS: up to 85% of SS benefit is taxable as ordinary income
  SS_TAXABLE_PCT:       0.85,

  // Spousal SS benefit = 50% of primary's PIA (before any claiming-age adjustments)
  SPOUSAL_BENEFIT_PCT:  0.5,

  // PIA formula factors (AIME segments)
  PIA_FACTOR_1:         0.90, // first bend point segment
  PIA_FACTOR_2:         0.32, // middle segment
  PIA_FACTOR_3:         0.15, // above second bend point

  MONTHS_PER_YEAR:      12,
};
