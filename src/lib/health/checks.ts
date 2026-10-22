import type { EnvStatus, HealthReport } from "@/lib/config/env";
import type { MonitoringLevel } from "@/lib/monitoring/alerts";

export interface LiveHealthReport extends HealthReport {
  migrationStatus: EnvStatus;
}

/// Each probe resolves to true when healthy. They are injected so the
/// aggregation below can be tested without a database, Supabase or Stripe.
export interface HealthProbes {
  db(): Promise<boolean>;
  auth(): Promise<boolean>;
  stripe(): Promise<boolean>;
  prismaClient(): Promise<boolean>;
  migrations(): Promise<boolean>;
}

const settle = (probe: () => Promise<boolean>): Promise<EnvStatus> =>
  probe().then(
    (ok) => (ok ? "OK" : "UNHEALTHY"),
    () => "UNHEALTHY",
  );

/// Op_RunHealthCheck. `base` holds the config-derived statuses; a probe only
/// runs when its configuration is present, since a live call with a missing
/// key would only repeat "not configured" as "unhealthy".
export async function runHealthCheck(
  base: HealthReport,
  probes: HealthProbes,
  raiseAlert: (level: MonitoringLevel, message: string, details?: Record<string, unknown>) => unknown,
): Promise<LiveHealthReport> {
  const live = async (current: EnvStatus, probe: () => Promise<boolean>) =>
    current === "OK" ? settle(probe) : current;

  const db = await live(base.db, probes.db);
  // Without a reachable database the Prisma and migration probes would only
  // repeat the same failure.
  const [supabaseAuth, stripe, prismaClient, migrationStatus] = await Promise.all([
    live(base.supabaseAuth, probes.auth),
    live(base.stripe, probes.stripe),
    db === "OK" ? live(base.prismaClient, probes.prismaClient) : base.prismaClient === "OK" ? "UNHEALTHY" : base.prismaClient,
    db === "OK" ? settle(probes.migrations) : "UNHEALTHY",
  ] as const);

  const report: LiveHealthReport = {
    db,
    supabaseAuth,
    stripe,
    prismaClient,
    migrationStatus,
    appBuild: base.appBuild,
  };

  const failing = Object.entries(report).filter(([, status]) => status !== "OK").map(([name]) => name);
  if (failing.length > 0) {
    await raiseAlert("Critical", "Health check failed", { failing });
  }
  return report;
}

/// Reads `prisma migrate`'s bookkeeping table. Healthy = no migration that
/// started but never finished, and (when the migration folder names are
/// known) the newest committed migration has been applied. `null` skips the
/// folder comparison, e.g. where the folder isn't deployed with the server.
export async function migrationsHealthy(
  rows: { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[],
  committedNames: string[] | null,
): Promise<boolean> {
  if (rows.some((r) => r.finished_at === null && r.rolled_back_at === null)) return false;
  if (!committedNames || committedNames.length === 0) return true;
  const applied = new Set(rows.filter((r) => r.finished_at !== null && r.rolled_back_at === null).map((r) => r.migration_name));
  return committedNames.every((name) => applied.has(name));
}

/// Memoizes a probe so a monitor polling /api/health every few seconds can't
/// turn into that many Stripe/Supabase API calls.
export function cachedProbe(probe: () => Promise<boolean>, ttlMs: number, now: () => number = Date.now) {
  let cached: { at: number; value: Promise<boolean> } | undefined;
  return () => {
    const t = now();
    if (!cached || t - cached.at >= ttlMs) cached = { at: t, value: probe() };
    return cached.value;
  };
}
