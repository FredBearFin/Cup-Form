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
