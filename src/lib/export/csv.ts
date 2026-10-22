import { allAttributes, SCORING_SCHEMAS } from "../scoring/schemas";

export type ExportableRoast = {
  id: string;
  coffeeName: string;
  origin: string | null;
  variety: string | null;
  process: string | null;
  roastDate: Date;
  batchSizeG: number | null;
  roastLevel: string | null;
  roastTimeS: number | null;
  notes: string | null;
  cuppingSessions: {
    id: string;
    cuppedAt: Date;
    scoringSchemaVersion: string;
    overallNote: string | null;
    scores: { attributeKey: string; value: number; descriptor: string | null }[];
  }[];
};

/// Spreadsheet apps execute cells starting with these as formulas; coffee
/// names and notes are user-controlled, so neutralise them.
const FORMULA_START = /^[=+\-@\t\r]/;

function textCell(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function escape(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/// Attribute columns: every key from the shipped scoring schemas, then any
/// other key found in the data (so nothing recorded is silently dropped).
function attributeColumns(roasts: ExportableRoast[]): string[] {
  const keys = new Set(Object.values(SCORING_SCHEMAS).flatMap((s) => allAttributes(s).map((a) => a.key)));
  const extra = new Set<string>();
  for (const r of roasts)
    for (const s of r.cuppingSessions)
      for (const sc of s.scores) if (!keys.has(sc.attributeKey)) extra.add(sc.attributeKey);
  return [...keys, ...[...extra].sort()];
}

const ROAST_COLUMNS = [
  "roast_id", "coffee_name", "origin", "variety", "process", "roast_date",
  "batch_size_g", "roast_level", "roast_time_s", "roast_notes",
];
const SESSION_COLUMNS = ["session_id", "cupped_at", "scoring_schema_version", "session_note"];

/// One row per cupping session (roast columns repeated); a roast with no
/// sessions gets a single row with the session columns blank.
export function roastsToCsv(roasts: ExportableRoast[]): string {
  const attrs = attributeColumns(roasts);
  const header = [...ROAST_COLUMNS, ...SESSION_COLUMNS, ...attrs];
  const lines = [header.map(escape).join(",")];

  for (const r of roasts) {
    const roastCells = [
      r.id,
      textCell(r.coffeeName),
      textCell(r.origin),
      textCell(r.variety),
      textCell(r.process),
      isoDay(r.roastDate),
      r.batchSizeG?.toString() ?? "",
      textCell(r.roastLevel),
      r.roastTimeS?.toString() ?? "",
      textCell(r.notes),
    ];
    const sessions = r.cuppingSessions.length > 0 ? r.cuppingSessions : [null];
    for (const s of sessions) {
      const sessionCells = s
        ? [s.id, s.cuppedAt.toISOString(), s.scoringSchemaVersion, textCell(s.overallNote)]
        : ["", "", "", ""];
      const scoreCells = attrs.map(
        (key) => s?.scores.find((sc) => sc.attributeKey === key)?.value.toString() ?? "",
      );
      lines.push([...roastCells, ...sessionCells, ...scoreCells].map(escape).join(","));
    }
  }
  // BOM so Excel reads the file as UTF-8; CRLF per RFC 4180.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
