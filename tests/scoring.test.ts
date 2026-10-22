import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScores } from "../src/lib/scoring/validate.ts";
import { scoreOf, TREND_ATTRIBUTE_KEY } from "../src/lib/scoring/derive.ts";

const V = "cva-2024-v1";

test("in-range scores, including both boundaries, are valid", () => {
  assert.deepEqual(
    validateScores(V, [
      { attributeKey: "flavor", value: 0 },
      { attributeKey: "acidity", value: 15 },
      { attributeKey: "overall_quality", value: 6 },
    ]),
    [],
  );
  assert.deepEqual(validateScores(V, [{ attributeKey: "overall_quality", value: 10 }]), []);
});

test("values outside the attribute's min/max are rejected", () => {
  assert.equal(validateScores(V, [{ attributeKey: "flavor", value: 15.5 }]).length, 1);
  assert.equal(validateScores(V, [{ attributeKey: "flavor", value: -1 }]).length, 1);
  // overall_quality has a floor of 6, not 0
  assert.equal(validateScores(V, [{ attributeKey: "overall_quality", value: 5.75 }]).length, 1);
  assert.equal(validateScores(V, [{ attributeKey: "overall_quality", value: 10.25 }]).length, 1);
});

test("unknown attributes, duplicates and unknown versions are rejected", () => {
  assert.match(validateScores(V, [{ attributeKey: "crema", value: 5 }])[0], /Unknown attribute/);
  assert.match(
    validateScores(V, [
      { attributeKey: "flavor", value: 5 },
      { attributeKey: "flavor", value: 6 },
    ])[0],
    /Duplicate/,
  );
  assert.match(validateScores("nope", [{ attributeKey: "flavor", value: 5 }])[0], /Unknown scoring schema/);
});

test("scoreOf returns the recorded value or null", () => {
  const session = {
    id: "s",
    cuppedAt: new Date(),
    scoringSchemaVersion: V,
    scores: [{ attributeKey: TREND_ATTRIBUTE_KEY, value: 8.25 }],
  };
  assert.equal(scoreOf(session, TREND_ATTRIBUTE_KEY), 8.25);
  assert.equal(scoreOf(session, "flavor"), null);
});
