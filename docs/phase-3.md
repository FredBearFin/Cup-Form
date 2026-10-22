# Phase 3 — data integrity, monetization, operational confidence

## Spec → implementation

| Spec | Where |
| --- | --- |
| `Op_RejectUnsignedWebhook` | `src/app/api/stripe/webhook/route.ts` — missing or invalid signature → `400 Invalid signature`, before anything is read or written |
| `Op_SyncSubscriptionFromWebhook`, `Inv_WebhookIdempotency` | `processStripeEvent` in `src/lib/stripe/subscription-sync.ts`; `webhook_events` table (PK = Stripe event id) |
| `Op_HandleBillingFailure` | same file, `invoice.payment_failed` → `past_due`; `BillingStatus` shows the warning toast + banner |
| `derive_plan_limits`, `map_stripe_status` | `src/lib/billing/plans.ts` |
| `Op_EnforcePlanLimitOnRoastCreate`, `Inv_PlanLimitEnforcement_*` | `roast.create` / `cupping.create`, via `getPlanLimits` + `lockUserForWrite` in `src/server/billing.ts` |
| `Inv_ExportGatedByPlan` / `Inv_ComparisonGatedByPlan` | `POST /api/export` → 403; `roast.compare` → `FORBIDDEN`; UI disables both with the reason |
| `Op_RecordAuditEntry`, `Inv_AuditLogAppendOnly` | `src/lib/audit/log.ts`; called inside the transaction of every roast/cupping mutation and webhook sync; `audit_logs` rejects UPDATE/DELETE/TRUNCATE with a trigger |
| `Op_RunDatabaseMigration` | `prisma/migrations/`, `npm run db:migrate`; `npm run check:migrations` (lint) + `tests/integration/migrations.test.ts` (no data loss) |
| `Op_RunHealthCheck` | `/api/health` → `runHealthCheck` in `src/lib/health/checks.ts` |
| `Op_RaiseMonitoringAlert` | `src/lib/monitoring/alerts.ts` |

## Plans

| | Free | Monthly / Annual / active trial |
| --- | --- | --- |
| Roasts | 10 | unlimited |
| Cupping sessions per roast | 3 | unlimited |
| Export, comparison | no | yes |

`Free` = no subscription row, `canceled`, `incomplete`, or a sign-in trial whose
`trialEndsAt` has passed. `past_due` **keeps paid access**: Stripe retries a
failed payment for days, so the user gets a warning instead of a lockout.
Tier (monthly vs annual) comes from the price id. Limit numbers live in
`FREE_LIMITS` — change them there.

Behavioural changes to be aware of:

- **The "trial ended" wall is gone.** `BillingGate` (hard block) became
  `BillingStatus` (banner). Ending a trial or canceling now means Free, not
  locked out; the server enforces the limits.
- **Limits apply to creation only.** A user who is over a limit (e.g. canceled
  with 40 roasts) keeps and can read, edit and delete everything; they just
  can't add more until they are under it or upgrade. Nothing is ever deleted
  on downgrade.
- Count-and-insert runs under a per-user Postgres advisory lock, so
  simultaneous requests can't overshoot a limit (tested with 15 parallel creates).

## Webhooks

1. Signature verified with `stripe.webhooks.constructEvent` on the raw body.
2. One transaction: claim the event id (`INSERT … ON CONFLICT DO NOTHING`) →
   update `subscriptions` → append an audit entry → mark the event `processed`.
3. A redelivery loses the claim and returns `outcome: "duplicate"`, touching nothing.
   If any step throws, the transaction (including the claim) rolls back, the route
   returns 500 and raises a Critical alert, and Stripe's retry processes it cleanly.

Handled: `customer.subscription.created|updated|deleted`, `invoice.paid`,
`invoice.payment_failed`. `invoice.paid` only recovers `past_due`/`incomplete`; it
never promotes a trial or canceled row. Other types are acknowledged and ignored.
Add the two `invoice.*` events to the Stripe endpoint (`npm run check:stripe` checks).

Known gap: events are applied in arrival order. Stripe doesn't guarantee order, so
a very late retry of an older `subscription.updated` could overwrite newer state
until the next event for that subscription arrives. Fixing it needs a stored
"last event time" column — deferred.

## Audit log

Roast and cupping-session create/update/delete, and every subscription sync, write
`{userId, entityType, entityId, action, timestamp, previousValue, newValue}`
(values are JSON). Entries are written in the same transaction as the change, so a
rolled-back change leaves no entry. `audit_logs` has no foreign key to `users`, so
entries survive account deletion.

## Migrations

`db push` is retired. History: `20260101000000_baseline` (the Phase 0–2 schema),
`20260201000000_phase3_audit_webhooks`.

- Local change: edit `schema.prisma`, run `npm run db:migrate:dev -- --name <snake_name>`.
- Deploy: run `npm run db:migrate` **before** starting the new release and stop the
  deploy if it fails — that is the "deploy only if the migration succeeded" gate.
- **Existing databases** created by `db push` already have the baseline tables:
  mark the baseline applied instead of re-running it:
  `npx prisma migrate resolve --applied 20260101000000_baseline`, then `npm run db:migrate`.
- `npm run check:migrations` (CI job `migrations`) rejects `DROP TABLE/COLUMN`,
  `TRUNCATE`, `DELETE FROM`, type changes, renames and `ADD COLUMN … NOT NULL`
  without a default. Destructive changes ship in two releases (stop using, then
  drop); the second migration carries `-- migration-safety: allow <reason>`.
- `tests/integration/migrations.test.ts` seeds a scratch schema at the baseline,
  applies every later migration with `prisma migrate deploy`, and asserts every
  row is unchanged.

## Health and monitoring

`/api/health` returns `{db, supabaseAuth, stripe, prismaClient, migrationStatus, appBuild}`
(`OK | MISSING | INVALID | UNHEALTHY`), 200 only if all are OK.

| Key | Check |
| --- | --- |
| `db` | `SELECT 1` |
| `prismaClient` | `user.count()` — generated client matches the tables |
| `migrationStatus` | `_prisma_migrations` has no unfinished row, and every committed migration is applied (the folder comparison is skipped if `prisma/migrations` isn't deployed with the server) |
| `supabaseAuth` | `GET <supabase>/auth/v1/health` |
| `stripe` | `balance.retrieve()` |

Auth and Stripe probes are cached 15 s and time out at 3 s, so a fast monitor can't
hammer them. A live probe is skipped when its config is missing/invalid (that status
is reported instead).

Any non-OK status raises a **Critical** `Health check failed` alert naming the
failing keys. Alerts are logged as one JSON line (`"type":"monitoring_alert"`) for
your log pipeline and, if `MONITORING_WEBHOOK_URL` is set, posted to that
Slack-compatible webhook. Identical alerts are suppressed for 5 minutes. The
webhook route also raises Critical alerts on processing failure or a missing
`STRIPE_WEBHOOK_SECRET`. Alerts are not stored in the database.

Point an uptime monitor at `/api/health`; the alert fires when it (or anything else)
calls it, so the monitor *is* the scheduled job.

## Tests

- Unit (`npm test`): `billing-plans`, `stripe-webhook` (idempotency, rollback, billing
  failure), `monitoring` (alerts, health aggregation, drift), `migration-safety`.
- Integration (`npm run test:integration`, needs Postgres): `phase3` (limits incl. the
  race, audit incl. trigger, webhook lifecycle) and `migrations`.
