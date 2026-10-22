# Cup-Form

A mobile-first PWA that pairs a home roast log with a cupping score,
scored against the SCA's Coffee Value Assessment (CVA) standard.

See `AGENTS.md` for repository conventions.

## Stack

- Next.js (App Router) + TypeScript, deployed as an installable PWA
- tRPC + TanStack Query for type-safe client/server calls
- Prisma + Supabase Postgres
- Supabase Auth (magic link)
- Stripe for subscriptions (14-day trial, monthly/annual)

## Phase 1 scope

- Roast log (CRUD)
- CVA cupping score form (descriptive + affective assessment), versioned
  scoring schema in `src/lib/scoring/schemas.ts`
- History list + score-over-time trend chart
- Stripe-gated subscription

Deferred to Phase 2 (see `.claude/plans` history / project notes): the
social/leaderboard layer and a reworked commitment-device/accountability
feature.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - A Supabase project's `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Stripe `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a price ID for
     each of `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_ANNUAL`.
2. Push the schema to your Supabase database:
   ```bash
   npx prisma db push
   ```
3. Validate the setup: `npm run check:env && npm run check:db`.
4. In the Supabase dashboard, enable email OTP (magic link) sign-in and set
   the redirect URL to `<site>/auth/callback`.
5. In the Stripe dashboard, point a webhook at `<site>/api/stripe/webhook`
   listening for `customer.subscription.*` events.
6. Run the dev server (it refuses to start if the environment is invalid):
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build (also type-checks)
- `npm run lint` — ESLint
- `npm run typecheck` / `npm test` / `npm run ci` — type check, unit tests, full local gate
- `npm run preflight` — env, database, auth and Stripe readiness checks
- `npm run check:smoke` — route/guard smoke test against a running server
- `npx prisma studio` — inspect the database

See `docs/phase-0.md` for the full "healthy app" checklist.
