import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { requireValidEnv } from "./lib/require-env.ts";
import { Report } from "./lib/report.ts";

const REQUIRED_TABLES = ["users", "roasts", "cupping_sessions", "cupping_scores", "subscriptions"];

requireValidEnv();
const report = new Report("Database bootstrap");
const prisma = new PrismaClient();

await report.run("DATABASE_URL is reachable", async () => {
  await prisma.$queryRaw`SELECT 1`;
});

// Every later check needs a connection; don't bury the root cause in repeats.
if (!report.checks[0].ok) {
  await prisma.$disconnect();
  report.finish();
}

await report.run("Prisma client works against the schema", async () => {
  // Fails if the generated client is stale relative to the database.
  await prisma.user.count();
});

await report.run(`App tables present (${REQUIRED_TABLES.join(", ")})`, async () => {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  const present = new Set(rows.map((r) => r.table_name));
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
  if (missing.length) throw new Error(`missing: ${missing.join(", ")} (run \`npx prisma db push\`)`);
});

await prisma.$disconnect();

await report.run("Database schema matches prisma/schema.prisma", async () => {
  try {
    execFileSync(
      "npx",
      [
        "prisma", "migrate", "diff",
        "--from-url", process.env.DATABASE_URL!,
        "--to-schema-datamodel", "prisma/schema.prisma",
        "--exit-code",
      ],
      { encoding: "utf8", stdio: "pipe" },
    );
  } catch (err) {
    const out = (err as { stdout?: string }).stdout ?? "";
    throw new Error(`drift detected (run \`npx prisma db push\`):\n${out.trim()}`);
  }
});

report.finish();
