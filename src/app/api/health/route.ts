import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { validateEnvironment, type HealthReport } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/// The single "healthy app" probe: config-derived statuses plus a live
/// database round-trip. Returns statuses only (no var names or values), 200
/// when everything is OK and 503 otherwise, so it is safe to expose to
/// uptime monitors and deploy gates.
export async function GET() {
  const { health } = validateEnvironment(process.env);
  const report: HealthReport = { ...health };

  if (report.db === "OK") {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      report.db = "UNHEALTHY";
      report.prismaClient = "UNHEALTHY";
      report.appBuild = "UNHEALTHY";
    }
  }

  const healthy = Object.values(report).every((s) => s === "OK");
  return NextResponse.json(report, { status: healthy ? 200 : 503 });
}
