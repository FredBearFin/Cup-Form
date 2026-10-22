import { allAttributes, SCORING_SCHEMAS } from "./schemas";

export type ScoreInput = { attributeKey: string; value: number };

/// Checks scores against a scoring schema version: known version, every key
/// belongs to the schema, no key repeated, each value within [min, max].
/// Returns human-readable problems; empty means valid. Pure so the same rules
/// can be unit-tested and reused by the router.
export function validateScores(version: string, scores: ScoreInput[]): string[] {
  const schema = SCORING_SCHEMAS[version];
  if (!schema) return [`Unknown scoring schema version: ${version}`];

  const attributes = new Map(allAttributes(schema).map((a) => [a.key, a]));
  const seen = new Set<string>();
  const problems: string[] = [];

  for (const { attributeKey, value } of scores) {
    const attribute = attributes.get(attributeKey);
    if (!attribute) {
      problems.push(`Unknown attribute for schema ${schema.version}: ${attributeKey}`);
      continue;
    }
    if (seen.has(attributeKey)) problems.push(`Duplicate attribute: ${attributeKey}`);
    seen.add(attributeKey);
    if (value < attribute.min || value > attribute.max) {
      problems.push(
        `${attribute.label} must be between ${attribute.min} and ${attribute.max} (got ${value})`,
      );
    }
  }
  return problems;
}
