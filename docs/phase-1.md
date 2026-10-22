# Phase 1 — close the core user loop

Roast log (create / edit / delete) → cupping sessions (create / delete) →
trend chart, with ownership enforced on the server.

## Spec → implementation

| Spec | Where |
| --- | --- |
| `Op_CreateRoast` (auth, name ≤ 200, date required) | `roast.create` in `src/server/routers/roast.ts`; `RoastForm` |
| `CanEditRoast` | `roast.update` (optional fields clear with `null`); `/app/roasts/[id]/edit` |
| `Op_DeleteRoast` (cascades to sessions + scores) | `roast.delete` (schema `onDelete: Cascade`); Delete button on the roast page |
| `Op_CreateCuppingSession` | `cupping.create`; `CuppingForm` |
| `CanDeleteCuppingSession` | `cupping.delete`; Delete link per session on the roast page |
| `Inv_ScoreValidation` (known key, `min ≤ value ≤ max`) | `validateScores` in `src/lib/scoring/validate.ts`, called by `cupping.create`; also rejects duplicate keys and unknown schema versions |
| `ProcessEnum`, `RoastLevelEnum` | `src/lib/roast/enums.ts`, enforced by the API, `<select>` in the form |
| `Op_LoadRoastTrendChart` (≥ 2 sessions, `overall_quality`) | chart on the roast page and on History; shows a hint below 2 sessions |
| `Inv_OwnershipEnforcement` / `Inv_CuppingOwnership` | every query/mutation is scoped by `ctx.userId` (cupping via its roast); a foreign or missing id is `NOT_FOUND` |
| `Inv_AuthenticationState` | `protectedProcedure` (`UNAUTHORIZED`) + the proxy route guard |
| `PageState` Loading / Error / Success / Idle | loading text, `QueryError` (not-found vs. retryable), mutation error text |

## Decisions worth knowing

- `process` and `roast_level` stay `String` columns (no migration). The API
  enforces the enums on write; rows saved before this change with other
  free-text values still display, and show as "(legacy)" in the edit form.
- The History chart now plots `overall_quality`, as the spec defines, rather
  than the sum of all attributes (a sum mixes 0–15 scales with a 6–10 one).
- Ownership failures return `NOT_FOUND` for both "doesn't exist" and "isn't
  yours", so ids can't be probed.

## Verification

- `npm test` — unit tests (score validation, form mapping, env, route guard, webhook).
- `npm run test:integration` — the real routers against a real Postgres as two
  users: ownership on every procedure, validation, cascade deletes, trend data.
  Needs `DATABASE_URL` and a pushed schema; refuses non-local databases unless
  `ALLOW_REMOTE_DB_TESTS=1`. Runs in the CI `database` job.
