/// Allowed values for the roast `process` and `roastLevel` columns. The
/// columns stay plain strings (no migration, tolerant of rows written before
/// these were enums); the API enforces the sets on write.

export const PROCESSES = ["Natural", "Washed", "Honey", "Experimental"] as const;
export type Process = (typeof PROCESSES)[number];

export const ROAST_LEVELS = ["Light", "Medium", "MediumDark", "Dark"] as const;
export type RoastLevel = (typeof ROAST_LEVELS)[number];

export const ROAST_LEVEL_LABELS: Record<RoastLevel, string> = {
  Light: "Light",
  Medium: "Medium",
  MediumDark: "Medium-dark",
  Dark: "Dark",
};

/// Display label for a stored value, falling back to the raw string for
/// legacy free-text rows.
export function roastLevelLabel(value: string): string {
  return ROAST_LEVEL_LABELS[value as RoastLevel] ?? value;
}
