# Integrations & External Services

## Stack Decisions

| Need | Service | Free Tier | When to Add |
|---|---|---|---|
| Hosting | Vercel | 100GB bandwidth, unlimited deploys | During project scaffold |
| Auth | Clerk | 10,000 MAU | Before save/load feature |
| Database | Supabase | 500MB Postgres, 50K MAU | With save/load feature |
| Payments | Stripe (tentative) | No monthly fee, pay per transaction | When ready to charge |
| Analytics | Plausible or Fathom | None (~$9/mo) | After launch, once users exist |
| Error monitoring | Sentry | 5K errors/mo free | At launch |

## Build Order

1. Vercel deploy (automatic from GitHub — already planned)
2. Clerk auth (gate the "save plan" button)
3. Supabase DB (store/load user plans)
4. Stripe payments (convert free → paid)
5. Sentry error tracking
6. Analytics

Each step is independent — you can ship and validate between each one.

---

## Clerk (Authentication)

**What it does:** Handles sign-up, sign-in, session management, password reset, OAuth (Google/Apple), and multi-factor auth. You never store passwords.

**Why Clerk over Supabase Auth:** Clerk's React components are drop-in (`<SignIn />`, `<UserButton />`). Supabase Auth is more manual — you build the forms yourself. For a non-developer owner, Clerk's pre-built UI saves significant time.

### Integration Pattern

```
npm install @clerk/clerk-react
```

```jsx
// main.jsx — wrap your app
import { ClerkProvider } from '@clerk/clerk-react'

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_KEY}>
  <App />
</ClerkProvider>
```

```jsx
// Anywhere you need auth state
import { useUser, SignInButton, UserButton } from '@clerk/clerk-react'

const { isSignedIn, user } = useUser()

// Show sign-in button for anonymous users
{!isSignedIn && <SignInButton />}

// Show user avatar/menu for signed-in users
{isSignedIn && <UserButton />}
```

### Freemium Gate Logic

The core conversion trigger: calculations work for everyone, saving requires sign-in.

```jsx
const handleSave = () => {
  if (!isSignedIn) {
    // Show sign-in prompt: "Sign in to save your plan"
    return
  }
  // Save to Supabase using user.id as the owner
}
```

### Setup Steps
1. Create account at clerk.com
2. Create an application (choose sign-in methods: email + Google is a good default)
3. Copy the publishable key to `.env.local` as `VITE_CLERK_KEY`
4. Add `@clerk/clerk-react` to the project
5. Wrap `<App />` in `<ClerkProvider>`

---

## Supabase (Database)

**What it does:** Hosted Postgres database with a REST API, real-time subscriptions, and row-level security. Your plans are stored as rows in a table that only the owning user can read/write.

### Data Model

One primary table — a user plan is a JSON blob of all ~48 state variables:

```sql
create table plans (
  id          uuid default gen_random_uuid() primary key,
  user_id     text not null,              -- Clerk user ID
  name        text default 'My Plan',     -- user-facing label
  plan_data   jsonb not null,             -- all state variables
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Row-level security: users only see their own plans
alter table plans enable row level security;

create policy "Users read own plans"
  on plans for select using (user_id = current_setting('request.jwt.claims')::json->>'sub');

create policy "Users write own plans"
  on plans for insert with check (user_id = current_setting('request.jwt.claims')::json->>'sub');
```

### Why JSONB for plan_data

The ~48 state variables will change as features are added. A JSONB column means adding a new field (like a future `legacyTarget`) doesn't require a database migration — it's just a new key in the JSON. Old plans missing the key use the default value on load.

### Integration Pattern

```
npm install @supabase/supabase-js
```

```js
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

```js
// Save a plan
const savePlan = async (userId, planName, stateSnapshot) => {
  const { data, error } = await supabase
    .from('plans')
    .upsert({
      user_id: userId,
      name: planName,
      plan_data: stateSnapshot,
      updated_at: new Date().toISOString()
    })
  return { data, error }
}

// Load user's plans
const loadPlans = async (userId) => {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return { data, error }
}
```

### State Snapshot

To save: collect all useState values into one object.
To load: call each setter with the loaded values, falling back to defaults for missing keys.

This is why the Architecture doc recommends evolving toward a scenario object — it makes save/load a one-liner instead of 48 individual setState calls.

### Setup Steps
1. Create account at supabase.com
2. Create a new project (free tier, choose nearest region)
3. Run the SQL above in the SQL Editor
4. Copy URL and anon key to `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
5. Install `@supabase/supabase-js`

### Clerk + Supabase Connection

Clerk manages who the user is. Supabase needs to know the user ID for row-level security. The bridge:

```js
// When saving, pass Clerk's user.id as the user_id field
import { useUser } from '@clerk/clerk-react'

const { user } = useUser()
await savePlan(user.id, 'My Retirement Plan', stateSnapshot)
```

For row-level security to work with Clerk (not Supabase Auth), you'll set the Clerk JWT as a custom header on the Supabase client. Clerk's docs have a specific Supabase integration guide for this.

---

## Stripe (Payments — Future)

**What it does:** Handles recurring $45/year billing, failed payment retries, cancellations, receipts, and card management.

### Integration Pattern (when ready)

Two Stripe products handle almost everything:

1. **Stripe Checkout** — hosted payment page. You redirect users there, they pay, Stripe redirects back. You never touch card numbers.

2. **Stripe Customer Portal** — hosted page where users manage their subscription (cancel, update card, view invoices). You don't build any of this UI.

### Freemium → Paid Flow

```
User clicks "Save Plan"
  → Not signed in? → Clerk sign-in
  → Signed in but free tier? → Stripe Checkout ($45/year)
  → Stripe confirms payment → webhook updates user's plan tier in Supabase
  → Save plan proceeds
```

### Key Decisions (for later)
- **Pricing page** needs to exist on the website before Stripe integration
- **Trial period** — consider 14-day free trial of paid features vs hard gate
- **Grandfathering** — if you raise prices later, keep early users at original rate
- **Tax compliance** — Stripe Tax add-on ($0.50/transaction) or handle manually. Revisit Lemon Squeezy if tax becomes painful.

### Setup Steps (future)
1. Create Stripe account
2. Create a Product ($45/year, recurring)
3. Create a Checkout Session in a serverless function (Vercel API route)
4. Set up webhooks to update Supabase when payment succeeds/fails
5. Add Customer Portal link to user settings

---

## Hybrid Architecture (Client + Server Split)

### Decision
Basic financial calculations run client-side for instant responsiveness. Premium analytical features run server-side via Vercel API routes to protect competitive logic and align with the freemium gate.

### Development Phasing

**Phase 1 — Building (current):** Everything runs client-side. All model files imported directly in components. Fast iteration, simple debugging, instant feedback. Do NOT set up API routes yet.

**Phase 2 — Pre-launch:** Move [SERVER] files behind Vercel API routes. Pure functions don't change — just wrap in HTTP handlers and add fetch() calls on the client. Add loading states, caching, debounce. 1–2 session task.

**Phase 3 — Production:** Hybrid is live. Client bundle no longer includes server-protected code. API routes handle premium logic. Freemium tiers enforced.

### Client-Side (instant, code visible in browser)

These use public IRS/SSA rules — no competitive advantage in hiding them:

| Module | Why client-side |
|---|---|
| `taxes.js` | Public 2026 brackets, anyone can implement |
| `simulation.js` | Basic compound growth math |
| `social-security.js` | Public SSA formulas (AIME, PIA, bend points) |
| `drawdown.js` | Standard financial math (log formula for depletion) |
| `employer-match.js` | Simple percentage calculations |
| `rmd.js` | Public IRS life expectancy tables |
| All components | UI rendering, charts, sliders |

### Server-Side (protected, ~200ms latency)

These contain the product's differentiated logic:

| Module | Vercel API Route | What it returns |
|---|---|---|
| `optimization.js` | `/api/optimize` | Optimized scenario (what-if comparison data) |
| `budget.js` (allocation engine) | `/api/allocate` | IRS-priority allocation breakdown |
| Action card generation | `/api/actions` | Which action cards to show, with dollar amounts |
| `roth-conversion.js` (dual scenario) | `/api/conversion` | Both tax-source scenarios compared |

### How It Works

```
User moves a slider
  → Client recalculates instantly (taxes, simData, charts update)
  → Client sends state snapshot to /api/optimize
  → Server runs premium logic, returns results
  → Client displays optimization panel, action cards, comparison bar
```

### Vercel API Route Pattern

Serverless functions live in `api/` at the project root:

```
api/
  optimize.js      POST: receives state snapshot, returns optimized scenario
  allocate.js      POST: receives budget inputs, returns IRS-priority allocation
  actions.js       POST: receives all computed values, returns action card array
  conversion.js    POST: receives conversion inputs, returns dual-scenario results
```

Each route is a single function:

```js
// api/optimize.js
import { calcOptimizedScenario } from '../src/model/optimization.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const inputs = req.body
  const result = calcOptimizedScenario(inputs)
  res.status(200).json(result)
}
```

The model functions are pure — they work identically whether called from the browser or from a serverless function. During development, you can call them directly (client-side) for faster iteration, then move them behind API routes for production.

### UX Considerations

- **Loading states:** Show a subtle shimmer/skeleton on the optimization panel and action cards while the server responds. The waterfall bars and comparison grid should have placeholder states.
- **Caching:** Cache server responses for the same input state. If the user hasn't changed any inputs, don't re-fetch. A simple hash of the state snapshot as a cache key works.
- **Debounce:** Don't call the server on every slider tick. Wait 300ms after the user stops moving a slider before sending the request.
- **Fallback:** If the server call fails (network issue), show the panels with a "couldn't load analysis" message rather than breaking the whole page. Basic calculations still work.
- **Free tier:** Anonymous users see the basic calculations but the premium panels show a "Sign in for personalized recommendations" prompt instead of calling the server.

### Freemium Alignment

```
Anonymous user:
  ✓ All sliders, charts, tax breakdown, projections (client-side)
  ✗ Optimization panel → "Sign in to see recommendations"
  ✗ Action cards → "Sign in for personalized action plan"
  ✗ Save plan → "Sign in to save"

Free signed-in user:
  ✓ Everything above
  ✓ Optimization, action cards, comparison bar (server-side, free)
  ✗ Save plan → "Upgrade to save your plan" (Stripe)

Paid user ($45/yr):
  ✓ Everything above
  ✓ Save/load plans (Supabase)
  ✓ Multiple scenarios
  ✓ Future premium features
```

This three-tier model lets you validate demand before charging. If users sign up for free just to see the action cards, that's strong signal the premium logic has value.

---

## Performance & Bandwidth

### What's Already Efficient
- Basic financial calculations run client-side (instant, no server cost)
- Charts render client-side (recharts)
- Premium features are lightweight API calls (JSON in, JSON out)

### Optimizations Worth Adding

**Code splitting (lazy loading)**
```jsx
const FlowDown = React.lazy(() => import('./tabs/FlowDown'))
const DetailedPlanner = React.lazy(() => import('./tabs/DetailedPlanner'))

// Only loads when user clicks the tab
<Suspense fallback={<LoadingSpinner />}>
  {activeTab === 'flowdown' && <FlowDown />}
</Suspense>
```
Reduces initial page load — users who only use Simple Planner never download Flow-Down code.

**API call efficiency**
- Auto-save with debounce (save 2 seconds after the user stops editing, not on every slider move)
- Load plans once on sign-in, cache in React state
- Don't fetch plans for anonymous users (no API calls until auth)

**Vercel caching**
- Static assets (JS, CSS, fonts) cached automatically at the edge
- Configure `Cache-Control` headers for immutable assets
- Vercel's free tier includes CDN — your app loads fast globally without configuration

### What NOT to Worry About
- Server costs — you don't have a server (Vercel serverless + Supabase handle everything)
- Database size — a plan is ~2KB of JSON. 10,000 users = 20MB. Supabase free tier is 500MB.
- Bandwidth — a React app is ~200KB gzipped. Vercel's free tier is 100GB/month. You'd need ~500,000 page loads to hit that.

---

## Error Monitoring (Sentry)

**Setup:** Free tier, 5,000 errors/month. Drop-in React integration.

```
npm install @sentry/react
```

```jsx
// main.jsx
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
})
```

Catches JavaScript errors in production, shows you the stack trace, which browser/OS, and what the user was doing. Essential for a financial tool where silent calculation errors are worse than crashes.

---

## Analytics (Post-Launch)

**Plausible** ($9/mo) or **Fathom** ($14/mo) — privacy-friendly, no cookie banner needed.

Key metrics to track:
- Which tab do users spend the most time on?
- What % of users reach the Flow-Down tab?
- Where do free users drop off before signing up?
- What's the save-to-signup conversion rate?
- Do users who see the comparison bar convert at a higher rate?

Don't add analytics until you have users. Pre-launch analytics is vanity.

---

## Environment Variables

All API keys go in `.env.local` (never committed to Git):

```
VITE_CLERK_KEY=pk_live_...
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
VITE_STRIPE_KEY=pk_live_...  (future)
```

In Vercel, add these same values in Project Settings → Environment Variables. Vercel injects them at build time.

**Never commit `.env.local` to Git.** The `.gitignore` from the Node template already excludes it.
