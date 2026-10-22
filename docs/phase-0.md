# Phase 0 — foundation baseline

Goal: the app can be bootstrapped, validated and shipped repeatably before
feature work expands. Fail fast on broken config; no silent startup failures.

## Config sources

| Variable | Where to get it | Validated shape |
| --- | --- | --- |
| `DATABASE_URL` | Supabase › Settings › Database › Connection string (Transaction pooler for serverless) | `postgres://` or `postgresql://` URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Settings › API | `https://` (or `http://` locally) URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase › Settings › API | JWT, or `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase › Settings › API (server only) | JWT, or `sb_secret_…` |
| `STRIPE_SECRET_KEY` | Stripe › Developers › API keys | `sk_/rk_` + `test_/live_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe › Developers › Webhooks › endpoint › Signing secret | `whsec_…` |
| `STRIPE_PRICE_ID_MONTHLY` / `_ANNUAL` | Stripe › Product catalog › recurring price | `price_…` |
| `NEXT_PUBLIC_SITE_URL` (optional) | The deployed origin, e.g. `https://app.example.com` | URL |

Local: copy `.env.example` to `.env` (or `.env.local`). Deployed: set them in
the host's environment settings. Values still looking like `.env.example`
placeholders (`your-…`, `sk_test_...`) are rejected as `INVALID`.
Validation logic lives in `src/lib/config/env.ts`.

## Fail-fast behaviour

- `src/instrumentation.ts` validates the environment when the server starts
  (`next dev` / `next start`) and exits non-zero listing every missing or
  malformed variable. `SKIP_ENV_VALIDATION=1` bypasses it (never in production).
- `next build` deliberately does **not** need secrets, so CI can build without them.
- `/api/health` returns `{ db, supabaseAuth, stripe, prismaClient, appBuild }`
  (each `OK | MISSING | INVALID | UNHEALTHY`), 200 when all are `OK`, else 503.
  It includes a live `SELECT 1`. Statuses only — no variable names or values.

## The "healthy app" checklist

Run top to bottom; every step is one command.

1. `npm install` (also runs `prisma generate`)
2. `npm run check:env` — all required config present and well-formed
3. `npm run db:migrate` (versioned migrations; see phase-3.md) then `npm run check:db` — DB reachable,
   Prisma client works, `users / roasts / cupping_sessions / cupping_scores /
   subscriptions` exist, and the DB has no drift from `prisma/schema.prisma`
4. `npm run check:auth` — Supabase reachable with the anon key, Email OTP enabled
5. `npm run check:stripe` — both prices are active and recurring, and an enabled
   webhook endpoint for `/api/stripe/webhook` listens for `customer.subscription.*`
6. `npm run ci` — lint, typecheck, unit tests, `prisma validate`, production build
7. Start the server, then `npm run check:smoke` — `/login` renders, `/app` and
   `/app/*` redirect to `/login`, the webhook rejects unsigned requests,
   protected tRPC returns 401, the PWA manifest loads
8. `curl <site>/api/health` returns 200

`npm run preflight` runs steps 2–5 in order and stops at the first failure.

## Manual steps the scripts cannot verify

Supabase does not expose its redirect allow-list to the anon key, so
`check:auth` prints the exact URL to confirm rather than asserting it:

- Supabase › Authentication › URL Configuration: add
  `<NEXT_PUBLIC_SITE_URL>/auth/callback` to **Redirect URLs** (and set **Site URL**).
- Stripe webhook: `npm run check:stripe` verifies the endpoint exists; to
  exercise delivery end to end use `stripe trigger customer.subscription.updated`
  against a local `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
  Event processing itself is covered by `tests/stripe-webhook.test.ts`.

## Access model (`src/lib/supabase/route-access.ts`)

- `/app` and `/app/**` — require a session, else redirect to `/login`
- `/login` — redirects signed-in users to `/app`
- everything else is public; `/api/stripe/webhook` (signature-verified) and
  `/api/health` are excluded from the auth proxy entirely, so they keep working
  when Supabase is unreachable. `/api/trpc` enforces auth per procedure.

## CI (`.github/workflows/ci.yml`)

Jobs: `lint`, `typecheck`, `unit-tests`, `prisma-generate` (validate + generate),
`database` (Postgres service: `db:migrate` + `check:db`), `build`, and `smoke`
(boots the production server and runs `check:smoke`). CI uses placeholder env
values of the correct shape; no secrets are required.

## Mapping to the Phase 0 spec

| Spec | Implementation |
| --- | --- |
| ValidateEnvironment | `validateEnvironment()` in `src/lib/config/env.ts`, `check:env`, startup gate |
| BootstrapDatabase | `check:db`, `prisma:generate`, `db:migrate`, CI `database` job |
| ConfigureAuth | `check:auth`, `route-access.ts`, `tests/route-access.test.ts`, `check:smoke` |
| ConfigureStripe | `check:stripe`, `tests/stripe-webhook.test.ts` |
| CreateCI | `.github/workflows/ci.yml` |
| Phase0Complete | the checklist above, ending in a 200 from `/api/health` |
