# Phase 2 — search, filter, export, compare, UX polish

## Spec → implementation

| Spec | Where |
| --- | --- |
| `Op_ApplyFilter`, `Inv_FilterOwnership/Consistency` | `roast.list` input; `buildRoastWhere` in `src/lib/roast/query.ts` (always `userId`-scoped, filtering in the DB); `FilterPanel`, search box on `/app` |
| `Op_ApplySort`, `Inv_SortStability` | `sortRoasts` in `src/lib/roast/sort.ts`, applied by `roast.list`; `SortDropdown` |
| `Op_ClearFilters` | "Clear filters" on `/app` — empties criteria, resets sort to `ByRoastDateDesc`, clears the selection |
| `Op_ExportRoastData`, `Inv_ExportOwnership` | `POST /api/export` → `loadOwnedRoastsForExport` (`src/server/export.ts`); `csv.ts` / `pdf.ts` in `src/lib/export`; `ExportButton` |
| `Inv_ExportGate` | Export is disabled while nothing is selected or an export is running |
| `Op_ComputeRoastComparison` | `roast.compare`; `src/lib/roast/compare.ts`; `CompareView` at `/app/compare?a=…&b=…` |
| `Op_ShowToast` / `Op_DismissToast` | `ToastProvider` + `useToast()`; state helpers in `src/lib/toast/state.ts` |
| `Op_ToggleNav`, `NavItem` | `AppNav` (Dashboard / History / Settings / Sign out; collapses behind a Menu button below `md`); `/app/settings` |
| `ToastsConsistentAcrossAllMutations` | success toasts at each mutation site; **every** mutation failure is toasted centrally by the query client's `MutationCache` |

## Decisions worth knowing

- **Search** is a case-insensitive "contains" on the coffee name. `%`, `_` and `\`
  are escaped — Prisma's `contains` otherwise treats them as wildcards, so
  searching `%` would have matched every roast.
- **Origin filter** is an exact match (as the spec's `=`), chosen from a dropdown of
  the caller's own distinct origins (`roast.origins`). Date bounds are inclusive.
- **Score** for sorting and comparing is the *latest* cupping that recorded the
  attribute (`overall_quality` for sorting). Roasts with no score sort last in both
  score directions. **Recent activity** is the newest `updatedAt` of the roast or
  any of its sessions.
- **Compare** requires two different, owned roasts sharing at least one of origin,
  process or roast level. A missing value never counts as shared. It follows the
  operation's precondition (any shared dimension), which is looser than the
  acceptance line "same origin".
- **Export returns the file directly, not a signed URL.** The spec's mapping table
  suggests a signed URL, but nothing here has file storage, so a URL would only
  point at a file that was generated and thrown away. `POST /api/export` streams
  the download instead, so there is nothing to leak or expire. All-or-nothing: if
  any id isn't the caller's, the whole export is a 404 and no file is produced.
- **CSV**: one row per cupping session (roast columns repeated), one row for an
  uncupped roast, one column per scoring attribute. Cells starting with `= + - @`
  are prefixed with `'` so user-entered names/notes can't run as spreadsheet
  formulas. UTF-8 with BOM so Excel reads accents correctly.
- **PDF** (`pdf-lib`, built-in Helvetica): characters outside Latin-1 (emoji, CJK)
  are replaced with `?` rather than failing the export.
- **Toast** follows the formal spec: showing a toast *replaces* the active one (the
  mapping table's word "queue" isn't modelled). A stale auto-dismiss timer can't
  close a newer toast.
- **Settings** has no spec beyond the nav item, so it is deliberately small: account
  email, plan/trial status, and "Manage billing" when a Stripe customer exists.

## Verification

- `npm test` — unit tests: sort, filter query building, compare, CSV/PDF, toast, errors.
- `npm run test:integration` — real routers on Postgres as two users: every filter
  criterion, sort key, ownership of filter/origins/compare/export.
