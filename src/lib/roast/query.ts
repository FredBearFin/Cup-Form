import { z } from "zod";
import { PROCESSES, ROAST_LEVELS } from "./enums";

export const SORT_KEYS = [
  "ByRoastDateDesc",
  "ByRoastDateAsc",
  "ByScoreDesc",
  "ByScoreAsc",
  "ByRecentActivity",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/// Matches Op_ClearFilters: the sort a cleared list returns to.
export const DEFAULT_SORT_KEY: SortKey = "ByRoastDateDesc";

export const SORT_LABELS: Record<SortKey, string> = {
  ByRoastDateDesc: "Roast date (newest)",
  ByRoastDateAsc: "Roast date (oldest)",
  ByScoreDesc: "Score (highest)",
  ByScoreAsc: "Score (lowest)",
  ByRecentActivity: "Recent activity",
};

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Not a real date");

/// A blank string is the spec's EMPTY. (Not z.preprocess: that would widen
/// the client-side input type to `unknown`.)
const orEmpty = <T extends z.ZodType<string>>(schema: T) =>
  z
    .union([schema, z.literal("")])
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/// FilterCriteria plus the sort key, as accepted by `roast.list`.
export const roastQuerySchema = z.object({
  originFilter: orEmpty(z.string().trim().max(200)),
  processFilter: orEmpty(z.enum(PROCESSES)),
  roastLevelFilter: orEmpty(z.enum(ROAST_LEVELS)),
  searchText: orEmpty(z.string().trim().max(200)),
  dateFrom: orEmpty(calendarDate),
  dateTo: orEmpty(calendarDate),
  sortKey: z.enum(SORT_KEYS).default(DEFAULT_SORT_KEY),
});

export type RoastQuery = z.infer<typeof roastQuerySchema>;
export type RoastQueryInput = z.input<typeof roastQuerySchema>;

/// Prisma's `contains` becomes `ILIKE '%…%'` without escaping, so a user
/// typing "%" or "_" would get wildcard matches. Backslash is Postgres' default
/// LIKE escape character.
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

/// Prisma `where` for Op_ApplyFilter. Always scoped to `userId`
/// (Inv_FilterOwnership); the other criteria are ANDed, and an EMPTY one
/// imposes no constraint. Date bounds are inclusive (roast_date is a DATE).
export function buildRoastWhere(userId: string, q: Omit<RoastQuery, "sortKey">) {
  return {
    userId,
    ...(q.originFilter && { origin: q.originFilter }),
    ...(q.processFilter && { process: q.processFilter }),
    ...(q.roastLevelFilter && { roastLevel: q.roastLevelFilter }),
    ...(q.searchText && {
      coffeeName: { contains: escapeLike(q.searchText), mode: "insensitive" as const },
    }),
    ...((q.dateFrom || q.dateTo) && {
      roastDate: {
        ...(q.dateFrom && { gte: utcDay(q.dateFrom) }),
        ...(q.dateTo && { lte: utcDay(q.dateTo) }),
      },
    }),
  };
}

/// How many criteria are set (not counting sort); drives the filter badge.
export function activeFilterCount(
  q: Partial<Record<"originFilter" | "processFilter" | "roastLevelFilter" | "searchText" | "dateFrom" | "dateTo", string>>,
): number {
  return [
    q.originFilter,
    q.processFilter,
    q.roastLevelFilter,
    q.searchText,
    q.dateFrom,
    q.dateTo,
  ].filter(Boolean).length;
}
