import {
  TRAD_401K_LIMIT_2026,
  CATCHUP_401K_2026,
  ROTH_IRA_LIMIT_2026,
  CATCHUP_ROTH_2026,
  HSA_LIMIT_2026,
  LIMIT_415C_2026,
  LIMIT_415C_CATCHUP_2026,
  CATCHUP_AGE,
  ROTH_PHASEOUT_2026,
  EARLY_WITHDRAWAL_AGE,
  EARLY_WITHDRAWAL_PENALTY,
} from "../config/irs-2026.js";
import { ltcgRate, stackedIncomeTax } from "./taxes.js";
import { applyConversionEvents } from "./conversion-events.js";
import { eventSimAdjustmentForYear, eventsIncomeAdjustment } from "./money-events.js";

// The NO-EVENT baseline salary in the year the person turns `age`
// (incomeGrowthEndAge plateau included). Used by the UI's "usual pay" seed
// (buildProjectedIncomeByAge) and eventIncomeImpact's usualPay side. The sim
// loop itself uses a pause-aware growth CLOCK (see runSimulation) that equals
// this closed form exactly when no income-replacing events exist — a
// sabbatical freezes the clock, so post-pause salaries resume where they left
// off instead of rejoining a clock that kept ticking (owner spec, PR #54).
export function projectedIncomeAtAge({ currentIncome, incomeGrowth, incomeGrowthEndAge = null, currentAge }, age) {
  const growthYears = incomeGrowthEndAge != null
    ? Math.min(age - currentAge - 1, incomeGrowthEndAge - currentAge)
    : age - currentAge - 1;
  // Clamped at 0: never discount income BACKWARD. Negative growthYears can
  // reach here via eventIncomeImpact when a committed event's age sits at or
  // below currentAge (the user raised their age after committing it), or via
  // an incomeGrowthEndAge in the past — in both cases "no growth yet" (the
  // current salary) is the honest projection, not a shrunken one. Inert for
  // the sim loop, which only asks about ages ≥ currentAge + 1. (Gemini PR #53.)
  return currentIncome * Math.pow(1 + incomeGrowth / 100, Math.max(0, growthYears));
}

// Projected salary by age over a range, 0 past retirementAge (no salary in
// retirement). Feeds a UI seed in a later slice — pure lookup, no side effects.
export function buildProjectedIncomeByAge({ currentIncome, incomeGrowth, incomeGrowthEndAge = null, currentAge, retirementAge, minAge, maxAge }) {
  const out = {};
  for (let age = minAge; age <= maxAge; age++) {
    // Rounded to whole dollars: this table seeds a UI input (the LifeEventSheet's
    // "usual pay") — an unrounded 121550.625 in a number field is display noise.
    out[age] = age > retirementAge ? 0 : Math.round(
      projectedIncomeAtAge({ currentIncome, incomeGrowth, incomeGrowthEndAge, currentAge }, age));
  }
  return out;
}

// Runs the accumulation simulation.
// Returns an array of yearly rows from year 1 through totalYears.
// Outputs tradGross (the pre-tax 401k balance) — displayed as-is now (BUG-35: the
// "Trad 401k" line shows the gross balance, no after-tax normalization).
// calcEmployerMatchFn: bound function (salary, employeeContrib) → match amount
export function runSimulation({
  totalYears,
  currentAge,
  currentIncome,
  incomeGrowth,
  incomeGrowthEndAge = null, // null = grows until retirement; age = plateau year
  filingStatus,
  spouseIncome,
  spouseIncomeGrowth,
  returnRate,
  bal401k, balRoth, balTaxable, balHSA,
  contrib401k, contribRoth, contribTaxable, contribHSA,
  contribEnd401k, contribEndRoth, contribEndTaxable, contribEndHSA,
  calcEmployerMatchFn,
  moneyEvents = [],   // one-time or duration events (see money-events.js) — applied to taxable account per active year
  conversionEvents = [], // { age, amount } — one-time 401k→Roth conversion in a working year
  stateRate = 0,      // working-year state income-tax rate, applied only to conversion-event tax
}) {
  let trad    = bal401k;
  let roth    = balRoth;
  let taxable = balTaxable;
  let hsa     = balHSA;

  const r = returnRate / 100;
  const g = incomeGrowth / 100;
  const arr = [];

  // Salary growth CLOCK (owner spec, PR #54 review): raises accrue in
  // proportion to income actually earned, so a full-pause sabbatical FREEZES
  // the clock — a $100k salary paused for 3 years resumes at the level it left
  // off and grows from there, it does not rejoin a clock that kept ticking
  // ("age 36 should be 103k, not ~120k"). The clock advances by incomeFrac
  // each year: 1 in normal years and for the seeded full-pay default
  // (behavior-preserving), 0 during a zero-income pause, fractional for
  // partial pay/partial-year events. With no income-replacing events the
  // clock equals y − 1, so this is byte-identical to the old closed form
  // (golden master safe) and to projectedIncomeAtAge (which stays the
  // NO-EVENT baseline used by the UI's "usual pay" seed and
  // eventIncomeImpact's usualPay side).
  let growthClock = 0;

  for (let y = 1; y <= totalYears; y++) {
    const age        = currentAge + y;
    // Unpaused, age-based clock — used by SPOUSE income only (income
    // replacement is primary-only, #30 scope) and kept for reference.
    const growthYears = incomeGrowthEndAge != null
      ? Math.min(y - 1, incomeGrowthEndAge - currentAge)
      : y - 1;

    // Income-replacement channel (owner decision: incomeAnnual on a duration
    // outflow event means "my TOTAL income during this period", not a bolt-on).
    const { workedFrac, eventIncome } = eventsIncomeAdjustment(moneyEvents, age);
    // Primary salary from the pause-aware clock (plateau stays an absolute
    // AGE cap — "income stops growing at this age" — applied on top).
    const clockYears = incomeGrowthEndAge != null
      ? Math.min(growthClock, incomeGrowthEndAge - currentAge)
      : growthClock;
    const growFactor = Math.pow(1 + g, Math.max(0, clockYears));
    const baseSalary = currentIncome * growFactor;
    const primaryIncomeYr = baseSalary * workedFrac + eventIncome;
    // Savings scale with INCOME, not worked months: incomeAnnual === salary ⇒
    // frac 1 ⇒ contributions/match continue (behavior-preserving default);
    // incomeAnnual === 0 ⇒ frac = workedFrac ⇒ payroll savings stop for paused
    // months. Capped at 1: income above salary raises MAGI but never conjures
    // extra savings capacity.
    const incomeFrac = baseSalary > 0 ? Math.min(1, primaryIncomeYr / baseSalary) : 1;
    // Advance the raise clock by the share of a normal year's income earned.
    growthClock += incomeFrac;

    const isEligibleForCatchup = age >= CATCHUP_AGE;
    const limit415cYr    = isEligibleForCatchup ? LIMIT_415C_CATCHUP_2026 : LIMIT_415C_2026;
    const electiveLimit  = isEligibleForCatchup
      ? TRAD_401K_LIMIT_2026 + CATCHUP_401K_2026
      : TRAD_401K_LIMIT_2026;

    const employeeDeferral = age <= contribEnd401k
      ? Math.min(contrib401k * growFactor * incomeFrac, electiveLimit)
      : 0;
    // Match income basis capped at baseSalary: the employer matches employer
    // COMPENSATION — event income (consulting during a leave) is not employer
    // pay and must never conjure extra flat-mode match dollars. The cap keeps
    // the behavior-preserving default (incomeAnnual === salary ⇒ full match)
    // while a suppressed year (income < salary) matches on the lower figure.
    // (Fable review, PR #53: uncapped, a $300k event income tripled a 4% flat
    // match in a year the user wasn't even working for that employer.)
    const matchAmt = age <= contribEnd401k
      ? calcEmployerMatchFn(Math.min(primaryIncomeYr, baseSalary), employeeDeferral)
      : 0;
    const c401k = Math.min(employeeDeferral + matchAmt, limit415cYr);
    const cHSA  = age <= contribEndHSA ? Math.min(contribHSA * incomeFrac, HSA_LIMIT_2026) : 0;

    const primaryMAGI = primaryIncomeYr;
    // Spouse income plateaus at incomeGrowthEndAge too (same growthYears cap as primary).
    // Income replacement is PRIMARY-ONLY (spouse modeling is premium feature #30) —
    // spouseGrown is untouched by workedFrac/incomeFrac.
    const spouseGrown = spouseIncome * Math.pow(1 + spouseIncomeGrowth / 100, growthYears);
    // MAGI ≈ AGI: net out this year's pre-tax deductions (401k deferral + HSA). Used for
    // BOTH the Roth phase-out and the LTCG bracket so the two can't diverge. MFJ adds spouse
    // gross (no spouse deductions tracked); non-MFJ is primary-only (BUG-12).
    const netOrdinaryIncome = (primaryMAGI - employeeDeferral - cHSA)
                            + (filingStatus === "mfj" ? spouseGrown : 0);

    const cRoth = (() => {
      if (age > contribEndRoth || contribRoth <= 0) return 0;
      const rothCap = isEligibleForCatchup
        ? ROTH_IRA_LIMIT_2026 + CATCHUP_ROTH_2026
        : ROTH_IRA_LIMIT_2026;
      const baseContrib = Math.min(contribRoth * incomeFrac, rothCap);
      // AGI-net MAGI (see netOrdinaryIncome): MFJ uses combined, every other status uses
      // primary-only (spouse income/contributions tracked separately). CLAUDE.md rules 3 & 9, BUG-12.
      const yearMAGI    = netOrdinaryIncome;
      const po = ROTH_PHASEOUT_2026[filingStatus] ?? ROTH_PHASEOUT_2026.single;
      if (yearMAGI >= po.end) return 0;
      if (yearMAGI <= po.start) return baseContrib;
      // Phase-out reduces the contribution LIMIT, then you contribute min(desired, reduced
      // limit) — NOT the desired amount scaled down. Scaling the desired amount wrongly
      // denied contributions to anyone in the band who wasn't already maxing out. (Review
      // fix. IRS also rounds the reduced limit up to the nearest $10 / $200 floor — omitted.)
      const phasePct   = (po.end - yearMAGI) / (po.end - po.start);
      const reducedCap = rothCap * phasePct;
      return Math.round(Math.min(contribRoth * incomeFrac, reducedCap));
    })();

    const cTaxable = age <= contribEndTaxable ? contribTaxable * growFactor * incomeFrac : 0;

    // Per-account growth = investment earnings this year = base × rate, where the
    // base is the prior balance PLUS this year's contribution (contributions are
    // added before growth compounds — see the contribution-before-growth tests).
    // Captured here so the Year-by-year table can show a real per-year growth figure
    // instead of a JSX residual (WI-2.5). All balances/growth are GROSS now (BUG-35):
    // the Trad 401k line and Year-by-year table display the pre-tax balance, and the
    // table reconciles prevPortfolio + contributions + growth = nextPortfolio on the
    // gross basis. `tradGrowth` is exposed separately as the 401k's share of growth.
    const tradBase = trad + c401k;
    const rothBase = roth + cRoth;
    const hsaBase  = hsa  + cHSA;
    const tradGrowth = tradBase * r;
    trad = tradBase * (1 + r);
    roth = rothBase * (1 + r);
    hsa  = hsaBase  * (1 + r);

    // Money events applied to the taxable account before growth compounds.
    // Outflows (purchases) reduce the base; inflows (windfalls) increase it.
    // Clamped at 0 so a large purchase can't produce a negative balance.
    // eventSimAdjustmentForYear is the sim-year portfolio line: the event's OWN
    // cash, excluding income for salary-REPLACING events (that income already
    // flowed through the salary channel above — money-events.js's NO-DOUBLE-
    // COUNT RULE) but still crediting a duration INFLOW's income, which has no
    // salary channel and would otherwise be dropped (Fable review, PR #53). It
    // also splits duration events — $X/mo for N months — across their active years.
    const eventAdj = moneyEvents.reduce((s, ev) => s + eventSimAdjustmentForYear(ev, age), 0);

    // ── BUG-74 fix: fund event outflows that exceed the taxable account ──────
    // The old `Math.max(0, taxable + cTaxable + eventAdj)` silently FORGAVE the
    // excess — a $540k trip against an $80k brokerage charged only $80k, so big
    // events barely dented the plan (user-reported). Now the shortfall cascades
    // the way a person actually funds one:
    //   taxable (exhausted above) → Roth (grossed up for the 10% early-
    //   withdrawal penalty under 59½ — owner spec; no ordinary tax on the Roth
    //   portion, basis untracked) → Traditional 401k, GROSSED UP so the net
    //   covers the need: the withdrawal is ordinary income stacked on this
    //   year's income (same stackedIncomeTax the conversion path uses) plus the
    //   10% penalty under 59½ (fixed-point solve, engine precedent). HSA is
    //   never touched (medical-restricted).
    // Anything still unfunded once every account is empty is reported as
    // eventShortfall on the row — the plan literally cannot pay for the event
    // that year, and the what-if verdict treats that as "unaffordable".
    // Inert when events never overdraw the taxable account (and at moneyEvents
    // = [] — golden master unaffected).
    let taxablePreGrowth = taxable + cTaxable + eventAdj;
    let eventDrawRoth = 0, eventDraw401k = 0, eventDrawTax = 0, eventShortfall = 0;
    if (taxablePreGrowth < 0) {
      let need = -taxablePreGrowth;
      taxablePreGrowth = 0;
      const pen = age < EARLY_WITHDRAWAL_AGE ? EARLY_WITHDRAWAL_PENALTY : 0;
      // Roth: charged the 10% early-withdrawal penalty under 59½ too (owner
      // spec, PR #54 review — "cannot take out anything without big penalty").
      // Grossed up so the NET covers the need; no ordinary income tax on the
      // Roth portion (conservative middle: real Roth contributions could come
      // out penalty-free, earnings would owe tax too — basis untracked).
      if (need > 0 && roth > 0) {
        const rothGross = Math.min(Math.max(0, roth), need / (1 - pen));
        const rothPenalty = rothGross * pen;
        eventDrawRoth = rothGross;
        eventDrawTax += rothPenalty;
        roth -= rothGross;
        need -= (rothGross - rothPenalty);
      }
      if (need > 0 && trad > 0) {
        // Gross-up: find gross g with g − tax(g) − pen·g = need (tax-on-tax).
        // The iteration converges from below (geometrically), so run it to
        // sub-dollar convergence — stopping early leaves a phantom shortfall.
        // Non-finite guard (Gemini PR #54): bail before propagating NaN.
        let g = need;
        for (let i = 0; i < 50; i++) {
          const next = need + stackedIncomeTax(g, netOrdinaryIncome, filingStatus, stateRate) + pen * g;
          if (!Number.isFinite(next)) break;
          if (Math.abs(next - g) < 0.5) { g = next; break; }
          g = next;
        }
        g = Math.min(g, trad);
        const tradTax = stackedIncomeTax(g, netOrdinaryIncome, filingStatus, stateRate) + pen * g;
        eventDrawTax += tradTax;
        eventDraw401k = g;
        trad -= g;
        need -= Math.max(0, g - tradTax);
      }
      eventShortfall = Math.max(0, need);
    }

    // Capped working-year conversion for THIS age (0 when none). Computed before the
    // LTCG-rate selection because the conversion is ordinary income that can push this
    // year's capital gains into a higher LTCG bracket. Inert when no events (conv = 0).
    // Capped at the POST-event-draw 401k balance, and its tax stacks on top of any
    // event-shortfall 401k draw (both are ordinary income in the same year).
    const requestedConv = conversionEvents.length
      ? applyConversionEvents(conversionEvents, age).convAmount : 0;
    const conv = Math.min(Math.max(0, requestedConv), Math.max(0, trad));

    // The event-shortfall 401k draw is ordinary income too — it joins the
    // conversion in the LTCG-bracket stack.
    const capGainsRate       = ltcgRate(netOrdinaryIncome + conv + eventDraw401k, filingStatus);
    const taxableBase        = taxablePreGrowth;
    const taxableRate        = r * (1 - capGainsRate);
    const taxableGrowth      = taxableBase * taxableRate;
    taxable = taxableBase * (1 + taxableRate);

    // Total gross growth across the four accounts (Taxable already net of LTCG drag).
    // Computed BEFORE any conversion event so growth = investment earnings only — a
    // conversion is a transfer, not earnings, and must not perturb the growth figure.
    const growth = tradGrowth + rothBase * r + hsaBase * r + taxableGrowth;

    // Working-year one-time Roth conversion(s) at this age (rule 2b: the principal
    // moves trad→Roth and is taxed ONCE as ordinary income stacked on this year's
    // wages — only the tax leaks). Tax is funded from the taxable brokerage so the
    // full principal lands in Roth; any shortfall comes out of the converted amount,
    // and that withheld portion is an early distribution hit with the 10% penalty
    // when under 59½ (retirement-phase conversions never see this — they're post-59½).
    let convEvent = 0, convEventTax = 0, convEventPenalty = 0;
    if (conv > 0) {
      // Stacks on top of any event-shortfall 401k draw — both are ordinary
      // income this year, so the conversion pays the higher-bracket dollars.
      const tax = stackedIncomeTax(conv, netOrdinaryIncome + eventDraw401k, filingStatus, stateRate);
      trad -= conv;
      roth += conv;                                  // principal moves in full
      const taxFromTaxable   = Math.min(tax, Math.max(0, taxable));
      const taxFromConverted = tax - taxFromTaxable; // shortfall when taxable can't cover
      taxable -= taxFromTaxable;
      roth    -= taxFromConverted;                   // leaks from the Roth deposit (no dollar conjured)
      const penalty = age < EARLY_WITHDRAWAL_AGE
        ? EARLY_WITHDRAWAL_PENALTY * taxFromConverted : 0;
      roth -= penalty;                               // penalty also leaks from the converted dollars
      convEvent        = conv;
      convEventTax     = tax + penalty;              // total bite (penalty folded in)
      convEventPenalty = penalty;
    }

    arr.push({
      age,
      "Roth IRA":  Math.round(roth),
      "Taxable":   Math.round(taxable),
      "HSA":       Math.round(hsa),
      tradGross:   Math.round(trad),
      c401k:    Math.round(c401k),
      cRoth:    Math.round(cRoth),
      cTaxable: Math.round(cTaxable),
      cHSA:     Math.round(cHSA),
      growth:     Math.round(growth),      // gross investment earnings this year
      tradGrowth: Math.round(tradGrowth),  // 401k's share of gross growth (per-account detail)
      convEvent:        Math.round(convEvent),        // pre-tax $ converted this working year (0 = none)
      convEventTax:     Math.round(convEventTax),     // ordinary tax + any early-withdrawal penalty
      convEventPenalty: Math.round(convEventPenalty), // 10% penalty component (under-59½ shortfall)
      salary:         Math.round(primaryIncomeYr), // income this year (pause-aware clock + event income)
      eventNet:       Math.round(eventAdj),        // signed event cash this year (0 = no events)
      eventDrawRoth:  Math.round(eventDrawRoth),   // BUG-74 cascade: gross Roth drawn to fund the event
      eventDraw401k:  Math.round(eventDraw401k),   // gross 401k drawn (incl. its own tax+penalty)
      eventDrawTax:   Math.round(eventDrawTax),    // tax + penalties leaked by the funding draws (Roth + 401k)
      eventShortfall: Math.round(eventShortfall),  // event $ NO account could fund (plan can't pay)
    });
  }

  return arr;
}
