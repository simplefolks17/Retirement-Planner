// Shared Horizon preset tables + seed helper.
//
// These were originally defined in `screens/IdeasScreen.jsx`. When the Ideas
// page was retired and its capabilities moved onto the Plan screen (Goals panel
// + the "Try a change" levers facet of the Explore tray), the preset tables
// moved here so they have a single home independent of any one screen.
//
// V11 / WI-0.2: both tables are value-locked in `__tests__/presets.test.js` —
// they drive real model runs (calcWhatIfScenario overrides via the levers) and
// real plan mutations (moneyEvents commits), so a silent edit would change what
// users simulate/commit without any test noticing. Update deliberately.

// Quick-jump chips for the "Try a change" retire-age lever — pure nudges of the
// slider offset, not committed state. Two kinds ("relative"/"absolute") resolve
// uniformly through the lever's clamp before converting to an offset.
export const RETIRE_JUMPS = [
  { k: "retire2Early", label: "Retire 2 yrs earlier", kind: "relative", retireAdj: -2 },
  { k: "retire60",     label: "Retire at 60",          kind: "absolute", targetAge: 60 },
];

// Life-event ("Goal") preset seeds for the LifeEventSheet. `l` is the label;
// `icon` is the arc badge. One-time events carry `amount`; duration events carry
// `monthlyAmount`/`durationMonths`/`incomeAnnual` (money-events.js). Every
// displayed verdict/delta comes from evaluateLifeEvent at open time, never from
// a number stored here.
export const LIFE_EVENTS = [
  { l: "Buy a home",      icon: "🏠", age: 40, amount: 60_000, isInflow: false },
  { l: "Kid's college",   icon: "🎓", age: 52, amount: 50_000, isInflow: false },
  { l: "Travel 6 months", icon: "✈️", age: 70, monthlyAmount: 6_000, durationMonths: 6,
    incomeAnnual: 0, isInflow: false },
  { l: "Downsize",        icon: "🏡", age: 72, amount: 80_000, isInflow: true  },
  { l: "Part-time at 60", icon: "💼", age: 60, monthlyAmount: 2_000, durationMonths: 12,
    incomeAnnual: 0, isInflow: true  },
  { l: "Big trip",        icon: "🧳", age: 70, amount: 40_000, isInflow: false },
];

// Convert a LIFE_EVENTS preset ({ l, ...rest }) into a LifeEventSheet seed
// ({ label, ...rest }). Never carries an `id` — a preset always seeds a NEW
// goal; the sheet mints the id on save.
export const presetSeed = ({ l, ...rest }) => ({ ...rest, label: l });
