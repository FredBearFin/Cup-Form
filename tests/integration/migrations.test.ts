// Op_RunDatabaseMigration / NoDataLossOnMigration: builds a scratch Postgres
// schema at the first migration, fills it with data, applies every later
// migration with the real `prisma migrate deploy`, and checks every row
// survived byte-for-byte. Run with `npm run test:integration`.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const base = process.env.DATABASE_URL;
assert.ok(base, "DATABASE_URL is required for integration tests");
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname) || process.env.ALLOW_REMOTE_DB_TESTS === "1",
  "refusing to write test data to a non-local database; set ALLOW_REMOTE_DB_TESTS=1 to override",
);

const repo = path.join(import.meta.dirname, "..", "..");
const schemaName = `migtest_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const scratchUrl = (() => {
  const u = new URL(base);
  u.searchParams.set("schema", schemaName);
  return u.toString();
})();

const admin = new PrismaClient({ datasources: { db: { url: base } } });
const scratch = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
let workDir: string | undefined;

after(async () => {
  await scratch.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$disconnect();
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

const deploy = (dir: string) =>
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", path.join(dir, "schema.prisma")], {
    cwd: repo,
    env: { ...process.env, DATABASE_URL: scratchUrl },
    encoding: "utf8",
    stdio: "pipe",
  });

test("applying every later migration to a populated database loses nothing", async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "cupform-mig-"));
  const migrations = path.join(workDir, "migrations");
  await mkdir(migrations);
  await cp(path.join(repo, "prisma", "schema.prisma"), path.join(workDir, "schema.prisma"));
  await cp(path.join(repo, "prisma", "migrations", "migration_lock.toml"), path.join(migrations, "migration_lock.toml"));

  const all = (await readdir(path.join(repo, "prisma", "migrations"), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.ok(all.length >= 2, "need at least the baseline plus one migration to test");

  // Stage 1: only the baseline, then seed through raw SQL (the generated
  // client describes the *latest* schema, not this older one).
  await cp(path.join(repo, "prisma", "migrations", all[0]), path.join(migrations, all[0]), { recursive: true });
  deploy(workDir);

  const userId = randomUUID();
  const roastId = randomUUID();
  const sessionId = randomUUID();
  const scoreId = randomUUID();
  const subId = randomUUID();
  await scratch.$executeRawUnsafe(`INSERT INTO "users" (id, email) VALUES ('${userId}', 'mig@test.dev')`);
  await scratch.$executeRawUnsafe(
    `INSERT INTO "roasts" (id, user_id, coffee_name, origin, roast_date, notes, updated_at)
     VALUES ('${roastId}', '${userId}', 'Migrated Guji', 'Ethiopia', '2026-03-04', 'keep me', now())`,
  );
  await scratch.$executeRawUnsafe(
    `INSERT INTO "cupping_sessions" (id, roast_id, scoring_schema_version, overall_note, updated_at)
     VALUES ('${sessionId}', '${roastId}', 'cva-2024', 'lovely', now())`,
  );
  await scratch.$executeRawUnsafe(
    `INSERT INTO "cupping_scores" (id, session_id, attribute_key, value, descriptor)
     VALUES ('${scoreId}', '${sessionId}', 'flavor', 8.25, 'jasmine')`,
  );
  await scratch.$executeRawUnsafe(
    `INSERT INTO "subscriptions" (id, user_id, status, price_id, updated_at)
     VALUES ('${subId}', '${userId}', 'active', 'price_x', now())`,
  );

  const snapshot = async () => ({
    users: await scratch.$queryRawUnsafe(`SELECT * FROM "users" ORDER BY id`),
    roasts: await scratch.$queryRawUnsafe(`SELECT * FROM "roasts" ORDER BY id`),
    sessions: await scratch.$queryRawUnsafe(`SELECT * FROM "cupping_sessions" ORDER BY id`),
    scores: await scratch.$queryRawUnsafe(`SELECT * FROM "cupping_scores" ORDER BY id`),
    subscriptions: await scratch.$queryRawUnsafe(`SELECT * FROM "subscriptions" ORDER BY id`),
  });
  const before = await snapshot();
  assert.equal((before.roasts as unknown[]).length, 1);

  // Stage 2: everything else, in one deploy, like a real release.
  for (const name of all.slice(1)) {
    await cp(path.join(repo, "prisma", "migrations", name), path.join(migrations, name), { recursive: true });
  }
  deploy(workDir);

  assert.deepEqual(await snapshot(), before);
  const applied = await scratch.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(
    `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`,
  );
  assert.deepEqual(applied.map((m) => m.migration_name), all);
  assert.ok(applied.every((m) => m.finished_at !== null));
});
