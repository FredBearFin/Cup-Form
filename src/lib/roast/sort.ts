import { latestScoreOf, TREND_ATTRIBUTE_KEY } from "../scoring/derive";
import type { SortKey } from "./query";

type SortableRoast = {
  id: string;
  roastDate: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  cuppingSessions: {
    cuppedAt: Date | string;
    updatedAt: Date | string;
    scoringSchemaVersion: string;
    id: string;
    scores: { attributeKey: string; value: number }[];
  }[];
};

const time = (d: Date | string) => new Date(d).getTime();

/// Latest `overall_quality` across the roast's sessions, or null if unscored.
export function roastScore(roast: SortableRoast): number | null {
  return latestScoreOf(roast.cuppingSessions, TREND_ATTRIBUTE_KEY);
}

/// Most recent change to the roast or any of its cupping sessions.
export function lastActivity(roast: SortableRoast): number {
  return Math.max(time(roast.updatedAt), ...roast.cuppingSessions.map((s) => time(s.updatedAt)));
}

/// Op_ApplySort. Returns a new array. Roasts without a score sort last for
/// both score directions (they have nothing to rank by). Ties fall back to
/// newest-created then id, so order is deterministic across requests.
export function sortRoasts<T extends SortableRoast>(roasts: T[], key: SortKey): T[] {
  const tieBreak = (a: T, b: T) =>
    time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id);

  const byScore = (direction: 1 | -1) => (a: T, b: T) => {
    const sa = roastScore(a);
    const sb = roastScore(b);
    if (sa === null && sb === null) return tieBreak(a, b);
    if (sa === null) return 1;
    if (sb === null) return -1;
    return (sb - sa) * direction || tieBreak(a, b);
  };

  const compare: Record<SortKey, (a: T, b: T) => number> = {
    ByRoastDateDesc: (a, b) => time(b.roastDate) - time(a.roastDate) || tieBreak(a, b),
    ByRoastDateAsc: (a, b) => time(a.roastDate) - time(b.roastDate) || tieBreak(a, b),
    ByScoreDesc: byScore(1),
    ByScoreAsc: byScore(-1),
    ByRecentActivity: (a, b) => lastActivity(b) - lastActivity(a) || tieBreak(a, b),
  };
  return [...roasts].sort(compare[key]);
}
