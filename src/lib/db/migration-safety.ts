// Backward-compatibility lint for Prisma migration SQL
// (migration_is_backward_compatible). Dependency-free so it runs under
// `node scripts/*.ts` and `node --test`.
//
// "Backward compatible" here means the previous app release keeps working and
// no existing row is lost while a deploy is half-rolled-out: additive changes
// only. A destructive change is done in two releases (stop using it, then drop
// it), and the second migration says so with an `allow` annotation:
//
//   -- migration-safety: allow drop column legacy_x (unused since 20260301 release)

export interface MigrationIssue {
  line: number;
  rule: string;
  statement: string;
}

const RULES: { rule: string; pattern: RegExp }[] = [
  { rule: "DROP TABLE", pattern: /^\s*drop\s+table\b/i },
  { rule: "DROP COLUMN", pattern: /\bdrop\s+column\b/i },
  { rule: "DROP SCHEMA", pattern: /^\s*drop\s+schema\b/i },
  { rule: "TRUNCATE", pattern: /^\s*truncate\b/i },
  { rule: "DELETE FROM", pattern: /^\s*delete\s+from\b/i },
  { rule: "ALTER COLUMN TYPE", pattern: /\balter\s+column\b[^;]*\b(set\s+data\s+)?type\b/i },
  { rule: "RENAME", pattern: /\brename\s+(to|column|constraint)\b/i },
  // An existing row has no value for a new NOT NULL column without a default.
  { rule: "ADD COLUMN NOT NULL without DEFAULT", pattern: /\badd\s+column\b(?![^;]*\bdefault\b)[^;]*\bnot\s+null\b/i },
];

const ALLOW = /--\s*migration-safety:\s*allow\s+(.+)/i;

/// Splits SQL into statements with the line each starts on. Good enough for
/// Prisma-generated SQL and hand-written DDL; `$$` function bodies are kept
/// whole so their inner semicolons don't split them.
function statements(sql: string): { text: string; line: number; allowed: string | null }[] {
  const out: { text: string; line: number; allowed: string | null }[] = [];
  let buf = "";
  let start = 0;
  let allowed: string | null = null;
  let inDollar = false;
  sql.split("\n").forEach((raw, i) => {
    const comment = ALLOW.exec(raw);
    if (comment) allowed = comment[1].trim();
    const line = raw.replace(/--.*$/, "");
    if (line.trim() === "" && buf === "") return;
    if (buf === "") start = i + 1;
    buf += line + "\n";
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && line.trimEnd().endsWith(";")) {
      out.push({ text: buf, line: start, allowed });
      buf = "";
      allowed = null;
    }
  });
  if (buf.trim()) out.push({ text: buf, line: start, allowed });
  return out;
}

export function findUnsafeStatements(sql: string): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  for (const { text, line, allowed } of statements(sql)) {
    if (allowed) continue;
    for (const { rule, pattern } of RULES) {
      if (pattern.test(text)) {
        issues.push({ line, rule, statement: text.trim().split("\n")[0].slice(0, 120) });
        break;
      }
    }
  }
  return issues;
}

/// Prisma applies migrations in directory-name order; names must be
/// `<14-digit timestamp>_<snake_name>` so that order is chronological.
export const MIGRATION_DIR = /^\d{14}_[a-z0-9_]+$/;
