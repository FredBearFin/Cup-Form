/// Versioned cupping scoring configs. A CuppingSession stores the version it
/// was scored against (scoringSchemaVersion) so a future CVA revision, or a
/// legacy SCAA-style form, can be added as a new entry here without
/// migrating existing CuppingScore rows.

export type ScoringAttribute = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /// Optional fixed-point descriptors shown at intervals along the scale,
  /// per the Likert-style finding that evenly distributed, labeled steps
  /// score more reliably than an unlabeled continuous slider.
  descriptors?: Record<number, string>;
};

export type ScoringSchema = {
  version: string;
  label: string;
  /// SCA-103-style: attribute intensities, not summed into a single number.
  descriptive: ScoringAttribute[];
  /// SCA-104-style: overall quality/preference rating.
  affective: ScoringAttribute[];
};

const intensityDescriptors = {
  0: "None",
  3: "Low",
  6: "Medium",
  9: "High",
  12: "Very high",
  15: "Extremely high",
};

export const cvaV1: ScoringSchema = {
  version: "cva-2024-v1",
  label: "CVA (Coffee Value Assessment)",
  descriptive: [
    { key: "fragrance_aroma", label: "Fragrance / Aroma", min: 0, max: 15, step: 0.5, descriptors: intensityDescriptors },
    { key: "flavor", label: "Flavor", min: 0, max: 15, step: 0.5, descriptors: intensityDescriptors },
    { key: "aftertaste", label: "Aftertaste", min: 0, max: 15, step: 0.5, descriptors: intensityDescriptors },
    { key: "acidity", label: "Acidity", min: 0, max: 15, step: 0.5, descriptors: intensityDescriptors },
    { key: "sweetness", label: "Sweetness", min: 0, max: 15, step: 0.5, descriptors: intensityDescriptors },
    { key: "body", label: "Body", min: 0, max: 15, step: 0.5, descriptors: intensityDescriptors },
  ],
  affective: [
    { key: "overall_quality", label: "Overall quality", min: 6, max: 10, step: 0.25 },
  ],
};

export const SCORING_SCHEMAS: Record<string, ScoringSchema> = {
  [cvaV1.version]: cvaV1,
};

export const DEFAULT_SCORING_SCHEMA_VERSION = cvaV1.version;

export function getScoringSchema(version: string): ScoringSchema {
  const schema = SCORING_SCHEMAS[version];
  if (!schema) throw new Error(`Unknown scoring schema version: ${version}`);
  return schema;
}

export function allAttributes(schema: ScoringSchema): ScoringAttribute[] {
  return [...schema.descriptive, ...schema.affective];
}
