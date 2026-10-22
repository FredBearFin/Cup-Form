// Phase 2 server behaviour against a real Postgres: filter, sort, comparison
// and export, all as two different users to prove ownership scoping.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../src/server/routers/_app.ts";
import { ExportNotFoundError, loadOwnedRoastsForExport } from "../../src/server/export.ts";

const url = process.env.DATABASE_URL;
assert.ok(url, "DATABASE_URL is required for integration tests");
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname) || process.env.ALLOW_REMOTE_DB_TESTS === "1",
  "refusing to write test data to a non-local database; set ALLOW_REMOTE_DB_TESTS=1 to override",
);

const prisma = new PrismaClient();
const userIds: string[] = [];
async function freshUser() {
  const id = randomUUID();
  // Phase 2/1 behaviour is tested on a paid plan; plan-limits.test.ts covers Free.
  await prisma.user.create({
    data: { id, email: `${id}@integration.test`, subscription: { create: { status: "active", priceId: "price_test" } } },
  });
  userIds.push(id);
  return id;
}
after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const as = (userId: string) => appRouter.createCaller({ prisma, userId });
const code = (expected: string) => (e: unknown) => (e as { code?: string }).code === expected;
const names = (roasts: { coffeeName: string }[]) => roasts.map((r) => r.coffeeName);
const sorted = (xs: string[]) => [...xs].sort();

type RoastSeed = Partial<Parameters<ReturnType<typeof as>["roast"]["create"]>[0]> & { coffeeName: string };
const seed = (userId: string, r: RoastSeed) => as(userId).roast.create({ roastDate: new Date("2026-03-01"), ...r });
const cup = (userId: string, roastId: string, quality?: number) =>
  as(userId).cupping.create({
    roastId,
    scores: quality === undefined ? [{ attributeKey: "flavor", value: 9 }] : [{ attributeKey: "overall_quality", value: quality }],
  });

describe("Op_ApplyFilter", () => {
  test("each criterion filters, an empty criterion does not", async () => {
    const u = await freshUser();
    await seed(u, { coffeeName: "A", origin: "Ethiopia", process: "Washed", roastLevel: "Medium" });
    await seed(u, { coffeeName: "B", origin: "Ethiopia", process: "Natural", roastLevel: "Light" });
    await seed(u, { coffeeName: "C", origin: "Kenya", process: "Washed", roastLevel: "Medium" });
    const list = (f: object) => as(u).roast.list(f).then(names).then(sorted);

    assert.deepEqual(await list({}), ["A", "B", "C"]);
    assert.deepEqual(await list({ originFilter: "", searchText: "  " }), ["A", "B", "C"]);
    assert.deepEqual(await list({ originFilter: "Ethiopia" }), ["A", "B"]);
    assert.deepEqual(await list({ processFilter: "Washed" }), ["A", "C"]);
    assert.deepEqual(await list({ roastLevelFilter: "Light" }), ["B"]);
    // the scene: origin Ethiopia + level Medium
    assert.deepEqual(await list({ originFilter: "Ethiopia", roastLevelFilter: "Medium" }), ["A"]);
    assert.deepEqual(await list({ originFilter: "Brazil" }), []);
  });

  test("search is a case-insensitive 'contains' on coffee name, with wildcards taken literally", async () => {
    const u = await freshUser();
    await seed(u, { coffeeName: "Ethiopia Guji Natural" });
    await seed(u, { coffeeName: "Kenya AA" });
    await seed(u, { coffeeName: "100% Colombian" });
    await seed(u, { coffeeName: "Blend_2" });
    const list = (searchText: string) => as(u).roast.list({ searchText }).then(names);

    assert.deepEqual(await list("guji"), ["Ethiopia Guji Natural"]);
    assert.deepEqual(await list("  KENYA "), ["Kenya AA"]);
    assert.deepEqual(await list("a"), await as(u).roast.list({}).then((r) => names(r).filter((n) => /a/i.test(n))));
    assert.deepEqual(await list("%"), ["100% Colombian"]); // not "match everything"
    assert.deepEqual(await list("_"), ["Blend_2"]); // not "any single character"
    await seed(u, { coffeeName: "back\\slash" });
    assert.deepEqual(await list("\\"), ["back\\slash"]); // the escape character itself
  });

  test("date bounds are inclusive on both ends", async () => {
    const u = await freshUser();
    for (const [coffeeName, d] of [["Jan31", "2026-01-31"], ["Feb01", "2026-02-01"], ["Feb15", "2026-02-15"], ["Feb28", "2026-02-28"], ["Mar01", "2026-03-01"]]) {
      await seed(u, { coffeeName, roastDate: new Date(d) });
    }
    const list = (f: object) => as(u).roast.list(f).then(names).then(sorted);
    assert.deepEqual(await list({ dateFrom: "2026-02-01", dateTo: "2026-02-28" }), ["Feb01", "Feb15", "Feb28"]);
    assert.deepEqual(await list({ dateFrom: "2026-02-28" }), ["Feb28", "Mar01"]);
    assert.deepEqual(await list({ dateTo: "2026-02-01" }), ["Feb01", "Jan31"]);
    assert.deepEqual(await list({ dateFrom: "2026-03-01", dateTo: "2026-02-01" }), []); // inverted range
  });

  test("results are only ever the caller's, even when another user matches the same criteria", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    await seed(alice, { coffeeName: "Mine", origin: "Ethiopia", process: "Washed" });
    await seed(bob, { coffeeName: "Theirs", origin: "Ethiopia", process: "Washed" });
    const hits = await as(alice).roast.list({ originFilter: "Ethiopia", processFilter: "Washed", searchText: "ine" });
    assert.deepEqual(names(hits), ["Mine"]);
    assert.ok(hits.every((r) => r.userId === alice));
    assert.deepEqual(await as(alice).roast.origins(), ["Ethiopia"]);
  });

  test("origins lists the caller's distinct origins, alphabetically", async () => {
    const u = await freshUser();
    for (const origin of ["Kenya", "Ethiopia", "Kenya", undefined]) await seed(u, { coffeeName: "x", origin });
    assert.deepEqual(await as(u).roast.origins(), ["Ethiopia", "Kenya"]);
  });

  test("invalid criteria are rejected", async () => {
    const u = await freshUser();
    // @ts-expect-error not an enum member
    await assert.rejects(as(u).roast.list({ processFilter: "Anaerobic" }));
    await assert.rejects(as(u).roast.list({ dateFrom: "2026-13-45" }));
    // @ts-expect-error not a sort key
    await assert.rejects(as(u).roast.list({ sortKey: "ByName" }));
  });
});

describe("Op_ApplySort", () => {
  test("default is roast date newest first; ByRoastDateAsc reverses it", async () => {
    const u = await freshUser();
    await seed(u, { coffeeName: "mid", roastDate: new Date("2026-02-01") });
    await seed(u, { coffeeName: "new", roastDate: new Date("2026-03-01") });
    await seed(u, { coffeeName: "old", roastDate: new Date("2026-01-01") });
    assert.deepEqual(names(await as(u).roast.list()), ["new", "mid", "old"]);
    assert.deepEqual(names(await as(u).roast.list({ sortKey: "ByRoastDateAsc" })), ["old", "mid", "new"]);
  });

  test("score sorts use the latest overall_quality; unscored roasts are last either way", async () => {
    const u = await freshUser();
    const low = await seed(u, { coffeeName: "low" });
    const high = await seed(u, { coffeeName: "high" });
    const improved = await seed(u, { coffeeName: "improved" });
    await seed(u, { coffeeName: "uncupped" });
    const flavorOnly = await seed(u, { coffeeName: "flavor-only" });
    await cup(u, low.id, 6.5);
    await cup(u, high.id, 9);
    await cup(u, improved.id, 6);
    await cup(u, improved.id, 8); // latest, so it ranks at 8 (not its best/first)
    await cup(u, flavorOnly.id); // cupped but no overall_quality

    const order = async (sortKey: "ByScoreDesc" | "ByScoreAsc") => names(await as(u).roast.list({ sortKey })).slice(0, 3);
    assert.deepEqual(await order("ByScoreDesc"), ["high", "improved", "low"]);
    assert.deepEqual(await order("ByScoreAsc"), ["low", "improved", "high"]);
    for (const k of ["ByScoreDesc", "ByScoreAsc"] as const) {
      assert.deepEqual(sorted(names(await as(u).roast.list({ sortKey: k })).slice(3)), ["flavor-only", "uncupped"]);
    }
  });

  test("recent activity puts the roast edited or cupped most recently first", async () => {
    const u = await freshUser();
    const a = await seed(u, { coffeeName: "a" });
    const b = await seed(u, { coffeeName: "b" });
    const c = await seed(u, { coffeeName: "c" });
    const order = async () => names(await as(u).roast.list({ sortKey: "ByRecentActivity" }));
    assert.deepEqual(await order(), ["c", "b", "a"]);
    await cup(u, a.id, 8); // cupping an old roast bumps it
    assert.deepEqual(await order(), ["a", "c", "b"]);
    await as(u).roast.update({ id: b.id, notes: "touched" }); // editing a roast bumps it
    assert.deepEqual(await order(), ["b", "a", "c"]);
    void c;
  });

  test("sorting applies on top of filtering", async () => {
    const u = await freshUser();
    const e1 = await seed(u, { coffeeName: "e1", origin: "Ethiopia" });
    const e2 = await seed(u, { coffeeName: "e2", origin: "Ethiopia" });
    const k = await seed(u, { coffeeName: "k", origin: "Kenya" });
    await cup(u, e1.id, 7);
    await cup(u, e2.id, 9);
    await cup(u, k.id, 10);
    assert.deepEqual(names(await as(u).roast.list({ originFilter: "Ethiopia", sortKey: "ByScoreDesc" })), ["e2", "e1"]);
  });
});

describe("Op_ComputeRoastComparison", () => {
  test("compares two owned roasts that share a dimension, using latest scores", async () => {
    const u = await freshUser();
    const a = await seed(u, { coffeeName: "a", origin: "Kenya", process: "Washed" });
    const b = await seed(u, { coffeeName: "b", origin: "Kenya", process: "Natural" });
    await as(u).cupping.create({ roastId: a.id, scores: [{ attributeKey: "flavor", value: 6 }, { attributeKey: "overall_quality", value: 7 }] });
    await as(u).cupping.create({ roastId: a.id, scores: [{ attributeKey: "flavor", value: 8 }] });
    await as(u).cupping.create({ roastId: b.id, scores: [{ attributeKey: "flavor", value: 9.5 }, { attributeKey: "overall_quality", value: 9 }] });

    const result = await as(u).roast.compare({ roastIdA: a.id, roastIdB: b.id });
    assert.deepEqual(result.shared, ["origin"]);
    assert.equal(result.rows.length, 7);
    const row = (key: string) => result.rows.find((r) => r.key === key)!;
    assert.deepEqual([row("flavor").a, row("flavor").b, row("flavor").delta], [8, 9.5, 1.5]);
    assert.deepEqual([row("overall_quality").a, row("overall_quality").b, row("overall_quality").delta], [7, 9, 2]);
    assert.deepEqual([row("body").a, row("body").b, row("body").delta], [null, null, null]);
  });

  test("refuses roasts with nothing in common, the same roast twice, and missing values matching", async () => {
    const u = await freshUser();
    const a = await seed(u, { coffeeName: "a", origin: "Kenya", process: "Washed", roastLevel: "Light" });
    const b = await seed(u, { coffeeName: "b", origin: "Brazil", process: "Natural", roastLevel: "Dark" });
    await assert.rejects(as(u).roast.compare({ roastIdA: a.id, roastIdB: b.id }), code("BAD_REQUEST"));
    await assert.rejects(as(u).roast.compare({ roastIdA: a.id, roastIdB: a.id }), code("BAD_REQUEST"));
    const n1 = await seed(u, { coffeeName: "n1" });
    const n2 = await seed(u, { coffeeName: "n2" });
    await assert.rejects(as(u).roast.compare({ roastIdA: n1.id, roastIdB: n2.id }), code("BAD_REQUEST"));
  });

  test("cannot compare against someone else's roast, even one sharing an origin", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    const mine = await seed(alice, { coffeeName: "mine", origin: "Kenya" });
    const theirs = await seed(bob, { coffeeName: "theirs", origin: "Kenya" });
    await assert.rejects(as(alice).roast.compare({ roastIdA: mine.id, roastIdB: theirs.id }), code("NOT_FOUND"));
    await assert.rejects(as(alice).roast.compare({ roastIdA: theirs.id, roastIdB: mine.id }), code("NOT_FOUND"));
  });
});

describe("Op_ExportRoastData ownership (loadOwnedRoastsForExport)", () => {
  test("returns every requested roast with its sessions and scores, newest first", async () => {
    const u = await freshUser();
    const older = await seed(u, { coffeeName: "older", roastDate: new Date("2026-01-01") });
    const newer = await seed(u, { coffeeName: "newer", roastDate: new Date("2026-02-01") });
    await cup(u, newer.id, 8);
    await cup(u, newer.id, 9);
    const roasts = await loadOwnedRoastsForExport(prisma, u, [older.id, newer.id, newer.id]); // duplicate id is fine
    assert.deepEqual(roasts.map((r) => r.coffeeName), ["newer", "older"]);
    assert.equal(roasts[0].cuppingSessions.length, 2);
    assert.equal(roasts[0].cuppingSessions[0].scores[0].attributeKey, "overall_quality");
  });

  test("one foreign or nonexistent id fails the whole export and returns nothing", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    const mine = await seed(alice, { coffeeName: "mine" });
    const theirs = await seed(bob, { coffeeName: "theirs" });
    const isNotFound = (e: unknown) => e instanceof ExportNotFoundError;
    await assert.rejects(loadOwnedRoastsForExport(prisma, alice, [mine.id, theirs.id]), isNotFound);
    await assert.rejects(loadOwnedRoastsForExport(prisma, alice, [theirs.id]), isNotFound);
    await assert.rejects(loadOwnedRoastsForExport(prisma, alice, [mine.id, randomUUID()]), isNotFound);
    await assert.rejects(loadOwnedRoastsForExport(prisma, alice, []), isNotFound);
  });
});
