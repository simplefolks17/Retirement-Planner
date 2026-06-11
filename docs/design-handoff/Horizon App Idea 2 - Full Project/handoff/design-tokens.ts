// design-tokens.ts — Horizon App Idea 2
// Single source of truth for all UI colors.
// Extracted from wireframes/frames-pastel.jsx — PALS token system.
//
// USAGE:
//   const t = PALETTES[userPaletteKey][userTheme]; // 'light' | 'dark'
//   element.style.background = t.bg;
//
// TOKEN MEANINGS:
//   bg     — page / screen background
//   surf   — card / modal / panel surface
//   surf2  — secondary surface (nav bar, banner, input fill)
//   line   — primary border / divider
//   line2  — lighter secondary border
//   ink    — primary text (headings, key numbers)
//   mut    — muted text (labels, secondary copy)
//   faint  — very subtle text (hints, captions, axis ticks)
//   accent — palette signature color (CTA buttons, highlighted values, active pills)
//   warm   — golden amber — the "retirement payoff" color
//             used for: income-for-life numbers, retirement phase bars, the Someday screen
//   good   — green / teal — the "on-track / savings" color
//             used for: "On track" badge, accumulation phase bars, take-home stats
//
// NEVER invent a color. Every element must derive from one of the 11 tokens above.
// If a color doesn't exist in the token set, derive it via opacity:
//   e.g. `${t.accent}22` for a 13%-opacity accent tint background

export interface ThemeTokens {
  bg: string;
  surf: string;
  surf2: string;
  line: string;
  line2: string;
  ink: string;
  mut: string;
  faint: string;
  accent: string;
  warm: string;
  good: string;
}

export interface Palette {
  name: string;
  swatch: string; // the color used for the palette-picker swatch dot
  light: ThemeTokens;
  dark: ThemeTokens;
}

export type PaletteKey = 'apricot' | 'honey' | 'blush' | 'sage' | 'periwinkle' | 'slate';
export type ThemeMode = 'light' | 'dark';

export const PALETTES: Record<PaletteKey, Palette> = {
  apricot: {
    name: 'Apricot',
    swatch: '#cd6f4f',
    light: {
      bg:     '#f7efe6',
      surf:   '#fffbf5',
      surf2:  '#f7ede1',
      line:   '#efe3d4',
      line2:  '#e4d3be',
      ink:    '#3a3027',
      mut:    '#8c7d6c',
      faint:  '#b6a690',
      accent: '#cd6f4f',
      warm:   '#df9a52',
      good:   '#7a9b74',
    },
    dark: {
      bg:     '#231c18',
      surf:   '#2e2620',
      surf2:  '#372d26',
      line:   '#43382f',
      line2:  '#574a3f',
      ink:    '#f1e7dc',
      mut:    '#b4a698',
      faint:  '#83786b',
      accent: '#e8896b',
      warm:   '#ecab68',
      good:   '#93b58c',
    },
  },
  honey: {
    name: 'Honey',
    swatch: '#d9a32b',
    light: {
      bg:     '#f8f2df',
      surf:   '#fffdf4',
      surf2:  '#f7efd9',
      line:   '#efe6cb',
      line2:  '#e6d6ad',
      ink:    '#39331f',
      mut:    '#897f60',
      faint:  '#b8ac85',
      accent: '#cf9a22',
      warm:   '#e6b84e',
      good:   '#8aa15f',
    },
    dark: {
      bg:     '#211d10',
      surf:   '#2c2715',
      surf2:  '#34301b',
      line:   '#403a22',
      line2:  '#544c2e',
      ink:    '#f3ecd6',
      mut:    '#b6ab8a',
      faint:  '#857c5e',
      accent: '#e8be4e',
      warm:   '#ecc764',
      good:   '#a8bd72',
    },
  },
  blush: {
    name: 'Blush',
    swatch: '#cf6f88',
    light: {
      bg:     '#f9edee',
      surf:   '#fffaf9',
      surf2:  '#f8e6e8',
      line:   '#f0dadc',
      line2:  '#e7c4c9',
      ink:    '#3a2c2e',
      mut:    '#8c7479',
      faint:  '#bb9ea2',
      accent: '#cf6f88',
      warm:   '#e6a081',
      good:   '#6fae93',
    },
    dark: {
      bg:     '#241a1c',
      surf:   '#2f2326',
      surf2:  '#37292d',
      line:   '#433036',
      line2:  '#573e46',
      ink:    '#f3e3e6',
      mut:    '#b8a0a6',
      faint:  '#86727a',
      accent: '#e88aa0',
      warm:   '#e8a585',
      good:   '#73bb9d',
    },
  },
  sage: {
    name: 'Sage',
    swatch: '#5f8a64',
    light: {
      bg:     '#edf1ea',
      surf:   '#fafdf7',
      surf2:  '#eef3e9',
      line:   '#e2e8dd',
      line2:  '#cdd8c6',
      ink:    '#2d332b',
      mut:    '#7a856f',
      faint:  '#a8b29d',
      accent: '#5f8a64',
      warm:   '#e3a06a',
      good:   '#6f9b6a',
    },
    dark: {
      bg:     '#181e19',
      surf:   '#222a23',
      surf2:  '#2a332b',
      line:   '#354036',
      line2:  '#475448',
      ink:    '#e8efe5',
      mut:    '#a3b09d',
      faint:  '#74806f',
      accent: '#84ad7c',
      warm:   '#e3a672',
      good:   '#84ad7c',
    },
  },
  periwinkle: {
    name: 'Periwinkle',
    swatch: '#6f7bd6',
    light: {
      bg:     '#ecedf7',
      surf:   '#fafbff',
      surf2:  '#f0f1fb',
      line:   '#e0e2f1',
      line2:  '#ccd0e8',
      ink:    '#2f3142',
      mut:    '#7a7f96',
      faint:  '#a6abc2',
      accent: '#6f7bd6',
      warm:   '#e69bb0',
      good:   '#5fb89a',
    },
    dark: {
      bg:     '#1b1d2a',
      surf:   '#252839',
      surf2:  '#2e3145',
      line:   '#383c54',
      line2:  '#4a4f6d',
      ink:    '#e7e9f5',
      mut:    '#a6abc4',
      faint:  '#767b96',
      accent: '#8f9bee',
      warm:   '#e6a9c8',
      good:   '#6fc6a6',
    },
  },
  slate: {
    name: 'Slate',
    swatch: '#5a738f',
    light: {
      bg:     '#eef1f4',
      surf:   '#fbfcfe',
      surf2:  '#eef2f6',
      line:   '#e1e6ec',
      line2:  '#cdd5de',
      ink:    '#2b3138',
      mut:    '#76808b',
      faint:  '#a4adb8',
      accent: '#5a738f',
      warm:   '#d99a72',
      good:   '#6f9b8a',
    },
    dark: {
      bg:     '#161a1f',
      surf:   '#1f242b',
      surf2:  '#262d35',
      line:   '#323a44',
      line2:  '#445063',
      ink:    '#e6ebf1',
      mut:    '#a0abb8',
      faint:  '#737e8b',
      accent: '#7d97b6',
      warm:   '#e0a87e',
      good:   '#7fb0a4',
    },
  },
};

// ── Typography ──────────────────────────────────────────────────────────────
// Load all three families via Google Fonts (or equivalent self-hosted):
// DM Sans: weights 400, 500, 600, 700  (optical size 9..40)
// IBM Plex Mono: weights 400, 500, 600
// Newsreader: weights 400, 600, 700, italic  (optical size 6..72)
//   Newsreader is ONLY used on the Someday screen hero headline.

export const FONTS = {
  ui:       "'DM Sans', system-ui, sans-serif",
  mono:     "'IBM Plex Mono', ui-monospace, monospace",
  display:  "'Newsreader', Georgia, serif",  // Someday screen only
} as const;

// ── Type scale ──────────────────────────────────────────────────────────────
// All sizes in px. Minimum on-screen size is 12px. Never go smaller.
export const TYPE = {
  xs:   12,
  sm:   13,
  base: 14,
  md:   16,
  lg:   18,
  xl:   22,
  '2xl': 26,
  '3xl': 32,
  '4xl': 38,
  hero: 62,   // Someday display headline (Newsreader)
} as const;

// ── Spacing ─────────────────────────────────────────────────────────────────
export const SPACE = {
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32,
} as const;

// ── Border radius ───────────────────────────────────────────────────────────
export const RADIUS = {
  sm:   7,
  md:   10,
  lg:   13,
  xl:   16,
  pill: 999,
} as const;

// ── Arc graph coordinate system ─────────────────────────────────────────────
// The Arc SVG uses a fixed internal coordinate space that scales via
// preserveAspectRatio="none". All graph components share these constants.
export const ARC = {
  VW:     1200,   // internal SVG width
  AGE0:   30,     // start age
  AGE1:   90,     // end age
  RETIRE: 65,     // default retire age
  VMAX:   3.5e6,  // max balance on y-axis ($3.5M)
  PAD: { l: 62, r: 92, t: 38, b: 46 },
} as const;

// Derive x coordinate for a given age (use in SVG viewBox space):
// xOf(age) = PAD.l + (age - AGE0) / (AGE1 - AGE0) * (VW - PAD.l - PAD.r)

// ── Graph views ─────────────────────────────────────────────────────────────
export type GraphView = 'arc' | 'stacked' | 'columns' | 'band';

export const GRAPH_VIEWS: Record<GraphView, { name: string; blurb: string }> = {
  arc:     { name: 'Arc',       blurb: 'Full-life curve with milestone stops — the default view.' },
  stacked: { name: 'Sources',   blurb: 'What you put in vs what the market earned.' },
  columns: { name: 'Decades',   blurb: 'Five-year bars: green accumulation, amber retirement.' },
  band:    { name: 'Scenarios', blurb: 'Expected line inside a lean↔strong confidence cone.' },
};

// ── Default user profile (placeholder data for design) ──────────────────────
export const PLACEHOLDER = {
  age:          34,
  retireAge:    65,
  income:       100_000,
  savedSoFar:   165_000,
  monthlySpend: 6_000,
  nestEgg:      3_050_000,
  incomeForLife: 8_200,
  leftAt90:     1_400_000,
  taxSavedYear: 14_200,
  taxSavedLife: 310_000,
  progressPct:  78,
  activity:     'golf course',  // the "work optional, X mandatory" activity
} as const;
