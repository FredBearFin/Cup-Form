import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeLike, activeFilterCount, buildRoastWhere, roastQuerySchema } from "../src/lib/roast/query.ts";

const parse = (input: unknown) => roastQuerySchema.parse(input ?? {});

test("empty input is no filters with the default sort", () => {
  const q = parse({});
  assert.equal(q.sortKey, "ByRoastDateDesc");
  assert.deepEqual(buildRoastWhere("u1", q), { userId: "u1" });
});

test("blank strings are EMPTY, not constraints", () => {
  const q = parse({ originFilter: "  ", searchText: "", processFilter: "", dateFrom: "" });
  assert.deepEqual(buildRoastWhere("u1", q), { userId: "u1" });
  assert.equal(activeFilterCount(q), 0);
});

test("the where clause is always scoped to the user and ANDs every criterion", () => {
  const q = parse({
    originFilter: "Ethiopia",
    processFilter: "Washed",
    roastLevelFilter: "Medium",
    searchText: " guji ",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
  });
  assert.deepEqual(buildRoastWhere("u1", q), {
    userId: "u1",
    origin: "Ethiopia",
    process: "Washed",
    roastLevel: "Medium",
    coffeeName: { contains: "guji", mode: "insensitive" },
    roastDate: { gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-01-31T00:00:00.000Z") },
  });
  assert.equal(activeFilterCount(q), 6);
});

test("a one-sided date range only bounds that side", () => {
  const where = buildRoastWhere("u1", parse({ dateFrom: "2026-05-01" }));
  assert.deepEqual(where.roastDate, { gte: new Date("2026-05-01T00:00:00.000Z") });
});

test("invalid enums, impossible dates and unknown sort keys are rejected", () => {
  assert.throws(() => parse({ processFilter: "Anaerobic" }));
  assert.throws(() => parse({ roastLevelFilter: "City+" }));
  assert.throws(() => parse({ dateFrom: "2026-02-31" }));
  assert.throws(() => parse({ dateTo: "03/04/2026" }));
  assert.throws(() => parse({ sortKey: "ByName" }));
});

test("LIKE wildcards and the escape character in search text are escaped", () => {
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(escapeLike("plain"), "plain");
  assert.deepEqual(buildRoastWhere("u", parse({ searchText: "50%" })).coffeeName, {
    contains: "50\\%",
    mode: "insensitive",
  });
});
