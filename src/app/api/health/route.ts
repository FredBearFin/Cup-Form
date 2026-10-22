import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { stripe } from "@/lib/stripe/client";
import { validateEnvironment } from "@/lib/config/env";
import { cachedProbe, migrationsHealthy, runHealthCheck, type HealthProbes } from "@/lib/health/checks";
import { raiseMonitoringAlert } from "@/lib/monitoring/alerts";

export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 3000;
const EXTERNAL_TTL_MS = 15_000;

/// Migration folder names, when the folder is deployed alongside the server.
async function committedMigrations(): Promise<string[] | null> {
  try {
    const entries = await readdir(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return null;
  }
}

const probes: HealthProbes = {
  db: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
  // Verifies the generated client matches the tables, not just connectivity.
  prismaClient: async () => {
    await prisma.user.count();
    return true;
  },
  migrations: async () => {
    const rows = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
    return migrationsHealthy(rows, await committedMigrations());
  },
  auth: cachedProbe(async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok;
  }, EXTERNAL_TTL_MS),
  stripe: cachedProbe(async () => {
    await stripe.balance.retrieve({}, { timeout: PROBE_TIMEOUT_MS, maxNetworkRetries: 0 });
    return true;
  }, EXTERNAL_TTL_MS),
};

/// The single "healthy app" probe: config-derived statuses plus live checks of
/// the database, Supabase Auth, Stripe, the Prisma client and migration state.
/// Returns statuses only (no var names or values), 200 when everything is OK
/// and 503 otherwise, so it is safe to expose to uptime monitors and deploy
/// gates. Any failure also raises a Critical monitoring alert.
export async function GET() {
  const { health } = validateEnvironment(process.env);
  const report = await runHealthCheck(health, probes, raiseMonitoringAlert);
  const healthy = Object.values(report).every((s) => s === "OK");
  return NextResponse.json(report, { status: healthy ? 200 : 503 });
}
