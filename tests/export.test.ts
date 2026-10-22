import { test } from "node:test";
import assert from "node:assert/strict";
import { roastsToCsv, type ExportableRoast } from "../src/lib/export/csv.ts";
import { roastsToPdf, toLatin1 } from "../src/lib/export/pdf.ts";

const roast = (o: Partial<ExportableRoast> = {}): ExportableRoast => ({
  id: "r1", coffeeName: "Ethiopia Guji", origin: "Ethiopia", variety: null, process: "Washed",
  roastDate: new Date("2026-03-04T00:00:00Z"), batchSizeG: 250, roastLevel: "Medium", roastTimeS: null, notes: null,
  cuppingSessions: [], ...o,
});
const session = (id: string, scores: [string, number][], overallNote: string | null = null) => ({
  id, cuppedAt: new Date("2026-03-10T12:30:00Z"), scoringSchemaVersion: "cva-2024-v1", overallNote,
  scores: scores.map(([attributeKey, value]) => ({ attributeKey, value, descriptor: null })),
});
const rows = (csv: string) => csv.replace("﻿", "").trimEnd().split("\r\n");

test("CSV: header, one row per session with roast columns repeated, one per unscored roast", () => {
  const csv = roastsToCsv([
    roast({ cuppingSessions: [session("s1", [["flavor", 9], ["overall_quality", 8.25]]), session("s2", [["flavor", 7]])] }),
    roast({ id: "r2", coffeeName: "Uncupped" }),
  ]);
  const lines = rows(csv);
  assert.equal(lines.length, 4);
  const header = lines[0].split(",");
  assert.deepEqual(header.slice(0, 3), ["roast_id", "coffee_name", "origin"]);
  for (const key of ["fragrance_aroma", "flavor", "overall_quality"]) assert.ok(header.includes(key), key);
  const cell = (line: string, col: string) => line.split(",")[header.indexOf(col)];
  assert.equal(cell(lines[1], "flavor"), "9");
  assert.equal(cell(lines[1], "overall_quality"), "8.25");
  assert.equal(cell(lines[2], "overall_quality"), ""); // not recorded in s2
  assert.equal(cell(lines[2], "coffee_name"), "Ethiopia Guji");
  assert.equal(cell(lines[3], "session_id"), "");
  assert.equal(cell(lines[3], "coffee_name"), "Uncupped");
});

test("CSV: commas, quotes and newlines are quoted per RFC 4180", () => {
  const csv = roastsToCsv([roast({ coffeeName: 'Brazil, "Santos"', notes: "line1\nline2" })]);
  assert.match(csv, /"Brazil, ""Santos"""/);
  assert.match(csv, /"line1\nline2"/);
});

test("CSV: cells that would run as spreadsheet formulas are neutralised", () => {
  const csv = roastsToCsv([
    roast({ coffeeName: "=HYPERLINK(\"http://evil\")", notes: "@SUM(A1)", origin: "+1", variety: "-2" , cuppingSessions: [session("s", [["flavor", 3]], "\t=cmd")] }),
  ]);
  const body = csv.split("\r\n")[1];
  assert.ok(!/(^|,)"?[=+\-@]/.test(body.replace(/^r1,/, "")), body);
  assert.match(body, /'=HYPERLINK/);
  assert.match(body, /'@SUM/);
});

test("CSV: an unknown attribute key from the data still gets a column", () => {
  const csv = roastsToCsv([roast({ cuppingSessions: [session("s", [["crema", 4]])] })]);
  assert.ok(rows(csv)[0].split(",").includes("crema"));
});

test("PDF: produces a valid PDF, including empty, long and non-Latin-1 content", async () => {
  const long = "word ".repeat(2000);
  const pdf = await roastsToPdf([
    roast({ coffeeName: "Café Ñandú ☕ 日本", notes: long, cuppingSessions: [session("s", [["flavor", 9]], "ok 😀")] }),
    ...Array.from({ length: 40 }, (_, i) => roast({ id: `r${i}`, coffeeName: `Roast ${i}` })),
  ]);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  assert.ok(pdf.length > 1000);
});

test("toLatin1 keeps Latin-1 and replaces the rest", () => {
  assert.equal(toLatin1("Café Ñ"), "Café Ñ");
  assert.equal(toLatin1("a☕b"), "a?b");
  assert.equal(toLatin1("x\ny"), "x y");
});
