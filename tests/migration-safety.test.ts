import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { MIGRATION_DIR, findUnsafeStatements } from "../src/lib/db/migration-safety.ts";

const rules = (sql: string) => findUnsafeStatements(sql).map((i) => i.rule);

test("additive changes are safe", () => {
  assert.deepEqual(rules('CREATE TABLE "t" ("id" UUID NOT NULL);\nCREATE INDEX "i" ON "t"("id");'), []);
  assert.deepEqual(rules('ALTER TABLE "t" ADD COLUMN "x" TEXT;'), []);
  assert.deepEqual(rules('ALTER TABLE "t" ADD COLUMN "x" INTEGER NOT NULL DEFAULT 0;'), []);
});

test("destructive or row-breaking changes are flagged with their line", () => {
  assert.deepEqual(rules('DROP TABLE "roasts";'), ["DROP TABLE"]);
  assert.deepEqual(rules('ALTER TABLE "roasts" DROP COLUMN "notes";'), ["DROP COLUMN"]);
  assert.deepEqual(rules('ALTER TABLE "roasts" ALTER COLUMN "notes" SET DATA TYPE INTEGER;'), ["ALTER COLUMN TYPE"]);
  assert.deepEqual(rules('ALTER TABLE "roasts" RENAME COLUMN "notes" TO "memo";'), ["RENAME"]);
  assert.deepEqual(rules('ALTER TABLE "roasts" ADD COLUMN "x" TEXT NOT NULL;'), ["ADD COLUMN NOT NULL without DEFAULT"]);
  assert.deepEqual(rules('DELETE FROM "roasts";'), ["DELETE FROM"]);
  assert.deepEqual(rules('TRUNCATE "roasts";'), ["TRUNCATE"]);
  assert.equal(findUnsafeStatements('CREATE TABLE "a" ("id" INT);\n\nDROP TABLE "b";')[0].line, 3);
});

test("a destructive statement is allowed only with an explicit annotation", () => {
  assert.deepEqual(rules('-- migration-safety: allow drop column unused since v12\nALTER TABLE "t" DROP COLUMN "x";'), []);
  // The annotation covers one statement, not the rest of the file.
  assert.deepEqual(rules('-- migration-safety: allow drop x\nALTER TABLE "t" DROP COLUMN "x";\nALTER TABLE "t" DROP COLUMN "y";'), ["DROP COLUMN"]);
});

test("keywords inside comments and $$ function bodies are not statements", () => {
  assert.deepEqual(rules('-- never DROP TABLE here\nCREATE TABLE "t" ("id" INT);'), []);
  assert.deepEqual(
    rules("CREATE FUNCTION f() RETURNS trigger AS $$\nBEGIN\n  DELETE FROM x;\n  RETURN NULL;\nEND;\n$$ LANGUAGE plpgsql;"),
    [],
  );
});

test("every committed migration is well named and passes the lint", () => {
  const root = path.join(import.meta.dirname, "..", "prisma", "migrations");
  const dirs = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(dirs.length >= 2);
  for (const dir of dirs) {
    assert.match(dir, MIGRATION_DIR);
    assert.deepEqual(findUnsafeStatements(readFileSync(path.join(root, dir, "migration.sql"), "utf8")), [], dir);
  }
});
