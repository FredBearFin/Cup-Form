import { getScoringSchema } from "./schemas";

export type ScoredSession = {
  id: string;
  cuppedAt: Date | string;
  scoringSchemaVersion: string;
  scores: { attributeKey: string; value: number }[];
};

/// Sums the descriptive + affective attribute values for a session into a
/// single comparable number. This is a display convenience only — the raw
/// per-attribute values remain the source of truth, so a future schema
/// version with different weighting doesn't require re-deriving old data.
export function deriveTotalScore(session: ScoredSession): number {
  const schema = getScoringSchema(session.scoringSchemaVersion);
  const keys = new Set([...schema.descriptive, ...schema.affective].map((a) => a.key));
  return session.scores
    .filter((s) => keys.has(s.attributeKey))
    .reduce((sum, s) => sum + s.value, 0);
}

/// The attribute plotted on roast trend charts (the CVA affective score).
export const TREND_ATTRIBUTE_KEY = "overall_quality";

/// Value of one attribute for a session, or null if it wasn't recorded.
export function scoreOf(session: ScoredSession, attributeKey: string): number | null {
  return session.scores.find((s) => s.attributeKey === attributeKey)?.value ?? null;
}

type TimedScoredSession = ScoredSession & { cuppedAt: Date | string };

/// Value of an attribute from the most recent cupping that recorded it, or
/// null if no session did. "Latest" is by `cuppedAt`; this is the `score_of`
/// used for sorting and comparing roasts.
export function latestScoreOf(
  sessions: TimedScoredSession[],
  attributeKey: string,
): number | null {
  let best: { at: number; value: number } | null = null;
  for (const session of sessions) {
    const value = scoreOf(session, attributeKey);
    if (value === null) continue;
    const at = new Date(session.cuppedAt).getTime();
    if (!best || at >= best.at) best = { at, value };
  }
  return best?.value ?? null;
}
