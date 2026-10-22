// Lints committed migrations for backward compatibility: `npm run check:migrations`.
// Needs no database, so CI runs it on every pull request.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Report } from "./lib/report.ts";
import { MIGRATION_DIR, findUnsafeStatements } from "../src/lib/db/migration-safety.ts";

const root = path.join(import.meta.dirname, "..", "prisma", "migrations");
const report = new Report("Migration safety");

const dirs = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();

await report.run("migration_lock.toml pins the provider", async () => {
  const lock = await readFile(path.join(root, "migration_lock.toml"), "utf8");
  if (!/provider\s*=\s*"postgresql"/.test(lock)) throw new Error("expected provider = \"postgresql\"");
});

await report.run(`${dirs.length} migration(s) are named <timestamp>_<name>`, async () => {
  const bad = dirs.filter((d) => !MIGRATION_DIR.test(d));
  if (bad.length) throw new Error(`bad names: ${bad.join(", ")}`);
  if (dirs.length === 0) throw new Error("no migrations found; run `npx prisma migrate dev`");
});

for (const dir of dirs) {
  await report.run(`${dir} is backward compatible`, async () => {
    const sql = await readFile(path.join(root, dir, "migration.sql"), "utf8");
    const issues = findUnsafeStatements(sql);
    if (issues.length) {
      throw new Error(
        issues.map((i) => `line ${i.line}: ${i.rule} (${i.statement}) — split across two releases, or annotate with "-- migration-safety: allow <reason>"`).join("\n"),
      );
    }
  });
}

report.finish();
