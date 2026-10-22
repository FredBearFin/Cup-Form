import { allAttributes, cvaV1 } from "../scoring/schemas";
import { latestScoreOf } from "../scoring/derive";

export type ComparableRoast = {
  origin: string | null;
  process: string | null;
  roastLevel: string | null;
  cuppingSessions: {
    id: string;
    cuppedAt: Date | string;
    scoringSchemaVersion: string;
    scores: { attributeKey: string; value: number }[];
  }[];
};

export const SHARED_DIMENSIONS = ["origin", "process", "roastLevel"] as const;
export type SharedDimension = (typeof SHARED_DIMENSIONS)[number];

/// Which of origin / process / roast level the two roasts have in common.
/// A missing value never matches (two unset origins are not "the same").
export function sharedDimensions(a: ComparableRoast, b: ComparableRoast): SharedDimension[] {
  return SHARED_DIMENSIONS.filter((d) => a[d] !== null && a[d] === b[d]);
}

/// Precondition of Op_ComputeRoastComparison.
export const canCompare = (a: ComparableRoast, b: ComparableRoast) =>
  sharedDimensions(a, b).length > 0;

export type ComparisonRow = {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  /// b − a, or null when either side has no score for the attribute.
  delta: number | null;
};

/// One row per CVA attribute with each roast's latest recorded score.
export function buildComparison(a: ComparableRoast, b: ComparableRoast): ComparisonRow[] {
  return allAttributes(cvaV1).map(({ key, label }) => {
    const sa = latestScoreOf(a.cuppingSessions, key);
    const sb = latestScoreOf(b.cuppingSessions, key);
    return { key, label, a: sa, b: sb, delta: sa === null || sb === null ? null : sb - sa };
  });
}
