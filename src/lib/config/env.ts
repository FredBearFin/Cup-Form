// Environment validation for the Phase 0 baseline. Kept dependency-free and
// free of `@/` imports so the same module runs in the Next.js server
// (instrumentation), in `node scripts/*.ts`, and in `node --test`.

export type EnvStatus = "OK" | "MISSING" | "INVALID" | "UNHEALTHY";

export interface HealthReport {
  db: EnvStatus;
  supabaseAuth: EnvStatus;
  stripe: EnvStatus;
  prismaClient: EnvStatus;
  appBuild: EnvStatus;
}

type Env = Record<string, string | undefined>;

/// Returns an error message when `value` is malformed, otherwise null.
type Validator = (value: string) => string | null;

const PLACEHOLDER = /\.\.\.$|your-|^changeme$|<.+>/i;

function url(protocols: string[]): Validator {
  return (value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return "is not a valid URL";
    }
    return protocols.includes(parsed.protocol)
      ? null
      : `must use one of ${protocols.join(", ")}`;
  };
}

function prefixed(...prefixes: string[]): Validator {
  return (value) =>
    prefixes.some((p) => value.startsWith(p)) ? null : `must start with ${prefixes.join(" or ")}`;
}

/// Supabase keys are either legacy JWTs (three dot-separated segments) or the
/// newer `sb_publishable_` / `sb_secret_` format.
const supabaseKey = (newPrefix: string): Validator => (value) =>
  value.startsWith(newPrefix) || value.split(".").length === 3
    ? null
    : `must be a Supabase JWT or start with ${newPrefix}`;

export const REQUIRED_VARS = {
  databaseUrl: { name: "DATABASE_URL", validate: url(["postgres:", "postgresql:"]) },
  supabaseUrl: { name: "NEXT_PUBLIC_SUPABASE_URL", validate: url(["https:", "http:"]) },
  supabaseAnonKey: { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", validate: supabaseKey("sb_publishable_") },
  supabaseServiceRoleKey: { name: "SUPABASE_SERVICE_ROLE_KEY", validate: supabaseKey("sb_secret_") },
  stripeSecretKey: { name: "STRIPE_SECRET_KEY", validate: prefixed("sk_test_", "sk_live_", "rk_test_", "rk_live_") },
  stripeWebhookSecret: { name: "STRIPE_WEBHOOK_SECRET", validate: prefixed("whsec_") },
  stripePriceMonthly: { name: "STRIPE_PRICE_ID_MONTHLY", validate: prefixed("price_") },
  stripePriceAnnual: { name: "STRIPE_PRICE_ID_ANNUAL", validate: prefixed("price_") },
} as const satisfies Record<string, { name: string; validate: Validator }>;

/// Not required (callers fall back to the request origin) but malformed
/// values would silently break Stripe redirects, so they are checked if set.
export const OPTIONAL_VARS = {
  siteUrl: { name: "NEXT_PUBLIC_SITE_URL", validate: url(["https:", "http:"]) },
} as const satisfies Record<string, { name: string; validate: Validator }>;

export type ConfigKey = keyof typeof REQUIRED_VARS;

export interface EnvIssue {
  name: string;
  problem: string;
}

export interface EnvValidation {
  missingVars: string[];
  invalidVars: EnvIssue[];
  /// Per-key status for every required var.
  status: Record<ConfigKey, EnvStatus>;
  health: HealthReport;
}

function check(
  value: string | undefined,
  validate: Validator,
): { status: EnvStatus; problem?: string } {
  if (value === undefined || value.trim() === "") return { status: "MISSING" };
  if (PLACEHOLDER.test(value.trim())) return { status: "INVALID", problem: "is still a placeholder" };
  const problem = validate(value.trim());
  return problem ? { status: "INVALID", problem } : { status: "OK" };
}

/// Combines per-var statuses: MISSING dominates INVALID dominates OK.
function worst(...statuses: EnvStatus[]): EnvStatus {
  for (const s of ["MISSING", "INVALID", "UNHEALTHY"] as const) {
    if (statuses.includes(s)) return s;
  }
  return "OK";
}

export function validateEnvironment(env: Env): EnvValidation {
  const missingVars: string[] = [];
  const invalidVars: EnvIssue[] = [];
  const status = {} as Record<ConfigKey, EnvStatus>;

  for (const key of Object.keys(REQUIRED_VARS) as ConfigKey[]) {
    const { name, validate } = REQUIRED_VARS[key];
    const result = check(env[name], validate);
    status[key] = result.status;
    if (result.status === "MISSING") missingVars.push(name);
    if (result.status === "INVALID") invalidVars.push({ name, problem: result.problem! });
  }

  for (const { name, validate } of Object.values(OPTIONAL_VARS)) {
    const result = check(env[name], validate);
    if (result.status === "INVALID") invalidVars.push({ name, problem: result.problem! });
  }

  const hasIssues = missingVars.length > 0 || invalidVars.length > 0;
  const health: HealthReport = {
    db: status.databaseUrl,
    supabaseAuth: worst(status.supabaseUrl, status.supabaseAnonKey),
    stripe: worst(
      status.stripeSecretKey,
      status.stripeWebhookSecret,
      status.stripePriceMonthly,
      status.stripePriceAnnual,
    ),
    prismaClient: status.databaseUrl,
    appBuild: hasIssues ? "UNHEALTHY" : "OK",
  };

  return { missingVars, invalidVars, status, health };
}

export function formatEnvIssues(result: EnvValidation): string {
  const lines = [
    ...result.missingVars.map((name) => `  - ${name}: missing`),
    ...result.invalidVars.map(({ name, problem }) => `  - ${name}: ${problem}`),
  ];
  return lines.join("\n");
}

/// Throws with a readable list of every problem; the fail-fast gate used at
/// server startup and by `npm run check:env`.
export function assertValidEnvironment(env: Env): EnvValidation {
  const result = validateEnvironment(env);
  if (result.health.appBuild !== "OK") {
    throw new Error(
      `Environment validation failed:\n${formatEnvIssues(result)}\n` +
        "See .env.example and docs/phase-0.md for the expected configuration.",
    );
  }
  return result;
}
