import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComparison, canCompare, sharedDimensions } from "../src/lib/roast/compare.ts";

const roast = (o: Partial<{ origin: string | null; process: string | null; roastLevel: string | null }>, sessions: { at: string; scores: Record<string, number> }[] = []) => ({
  origin: null, process: null, roastLevel: null, ...o,
  cuppingSessions: sessions.map((s, i) => ({
    id: `s${i}`, cuppedAt: new Date(s.at), scoringSchemaVersion: "cva-2024-v1",
    scores: Object.entries(s.scores).map(([attributeKey, value]) => ({ attributeKey, value })),
  })),
});

test("shared dimensions need equal, non-empty values", () => {
  assert.deepEqual(sharedDimensions(roast({ origin: "Kenya", process: "Washed" }), roast({ origin: "Kenya", process: "Natural" })), ["origin"]);
  assert.deepEqual(sharedDimensions(roast({}), roast({})), []);
  assert.equal(canCompare(roast({ roastLevel: "Light" }), roast({ origin: "Kenya", roastLevel: "Dark" })), false);
  assert.equal(canCompare(roast({ roastLevel: "Light" }), roast({ roastLevel: "Light" })), true);
});

test("comparison has one row per CVA attribute, using each roast's latest scores and b − a deltas", () => {
  const a = roast({ origin: "K" }, [
    { at: "2026-01-01", scores: { flavor: 5, overall_quality: 6 } },
    { at: "2026-01-09", scores: { flavor: 8, overall_quality: 7 } },
  ]);
  const b = roast({ origin: "K" }, [{ at: "2026-02-01", scores: { flavor: 9.5, acidity: 10 } }]);
  const rows = buildComparison(a, b);
  assert.equal(rows.length, 7);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual([byKey.flavor.a, byKey.flavor.b, byKey.flavor.delta], [8, 9.5, 1.5]);
  // present on one side only: no delta
  assert.deepEqual([byKey.acidity.a, byKey.acidity.b, byKey.acidity.delta], [null, 10, null]);
  assert.deepEqual([byKey.body.a, byKey.body.b, byKey.body.delta], [null, null, null]);
  assert.equal(byKey.overall_quality.a, 7);
});
