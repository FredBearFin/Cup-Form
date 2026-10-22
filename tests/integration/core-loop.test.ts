// Exercises the real tRPC routers against a real Postgres as two different
// users, to prove ownership and validation are enforced server-side.
// Run with `npm run test:integration` (needs DATABASE_URL and a pushed schema).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../src/server/routers/_app.ts";
import { scoreOf, TREND_ATTRIBUTE_KEY } from "../../src/lib/scoring/derive.ts";

const url = process.env.DATABASE_URL;
assert.ok(url, "DATABASE_URL is required for integration tests");
const host = new URL(url).hostname;
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(host) || process.env.ALLOW_REMOTE_DB_TESTS === "1",
  `refusing to write test data to ${host}; set ALLOW_REMOTE_DB_TESTS=1 to override`,
);

const prisma = new PrismaClient();
const userIds: string[] = [];

async function createUser() {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@integration.test` } });
  userIds.push(id);
  return id;
}

const as = (userId: string | null) => appRouter.createCaller({ prisma, userId });
const code = (expected: string) => (e: unknown) => (e as { code?: string }).code === expected;

const roastInput = { coffeeName: "Ethiopia Guji", roastDate: new Date("2026-03-04") };
const goodScores = [
  { attributeKey: "flavor", value: 9 },
  { attributeKey: "overall_quality", value: 8 },
];

let alice: string;
let bob: string;

before(async () => {
  alice = await createUser();
  bob = await createUser();
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // cascades to everything
  await prisma.$disconnect();
});

describe("authentication", () => {
  test("every procedure rejects an unauthenticated caller", async () => {
    const anon = as(null);
    await assert.rejects(anon.roast.list(), code("UNAUTHORIZED"));
    await assert.rejects(anon.roast.create(roastInput), code("UNAUTHORIZED"));
    await assert.rejects(anon.cupping.create({ roastId: randomUUID(), scores: goodScores }), code("UNAUTHORIZED"));
  });
});

describe("roasts", () => {
  test("create stores the roast under the caller, trimmed, with no cuppings", async () => {
    const roast = await as(alice).roast.create({ ...roastInput, coffeeName: "  Kenya AA  ", process: "Washed", roastLevel: "MediumDark" });
    assert.equal(roast.userId, alice);
    assert.equal(roast.coffeeName, "Kenya AA");
    const full = await as(alice).roast.byId({ id: roast.id });
    assert.deepEqual(full.cuppingSessions, []);
  });

  test("create rejects blank/oversized names and values outside the enums", async () => {
    const c = as(alice).roast;
    await assert.rejects(c.create({ ...roastInput, coffeeName: "   " }));
    await assert.rejects(c.create({ ...roastInput, coffeeName: "x".repeat(201) }));
    await assert.doesNotReject(c.create({ ...roastInput, coffeeName: "x".repeat(200) }));
    // @ts-expect-error deliberately not in the enum
    await assert.rejects(c.create({ ...roastInput, process: "Anaerobic" }));
    // @ts-expect-error deliberately not in the enum
    await assert.rejects(c.create({ ...roastInput, roastLevel: "City+" }));
  });

  test("list and byId only ever return the caller's own roasts", async () => {
    const mine = await as(alice).roast.create({ ...roastInput, coffeeName: "Alice only" });
    const theirs = await as(bob).roast.create({ ...roastInput, coffeeName: "Bob only" });

    const aliceList = await as(alice).roast.list();
    assert.ok(aliceList.every((r) => r.userId === alice));
    assert.ok(aliceList.some((r) => r.id === mine.id));
    assert.ok(!aliceList.some((r) => r.id === theirs.id));

    await assert.rejects(as(alice).roast.byId({ id: theirs.id }), code("NOT_FOUND"));
  });

  test("update edits own roast and can clear optional fields with null", async () => {
    const roast = await as(alice).roast.create({ ...roastInput, origin: "Guji", notes: "n", batchSizeG: 250, process: "Natural" });
    const updated = await as(alice).roast.update({
      id: roast.id,
      coffeeName: "Renamed",
      origin: null,
      notes: null,
      batchSizeG: null,
      process: "Honey",
    });
    assert.equal(updated.coffeeName, "Renamed");
    assert.equal(updated.origin, null);
    assert.equal(updated.notes, null);
    assert.equal(updated.batchSizeG, null);
    assert.equal(updated.process, "Honey");

    // fields not mentioned are left alone
    const untouched = await as(alice).roast.update({ id: roast.id, notes: "back" });
    assert.equal(untouched.coffeeName, "Renamed");
  });

  test("update cannot blank the required fields", async () => {
    const roast = await as(alice).roast.create(roastInput);
    await assert.rejects(as(alice).roast.update({ id: roast.id, coffeeName: " " }));
    // @ts-expect-error coffeeName is not nullable
    await assert.rejects(as(alice).roast.update({ id: roast.id, coffeeName: null }));
  });

  test("another user cannot update or delete a roast, and it is left untouched", async () => {
    const roast = await as(alice).roast.create({ ...roastInput, coffeeName: "Protected" });
    await assert.rejects(as(bob).roast.update({ id: roast.id, coffeeName: "Hijacked" }), code("NOT_FOUND"));
    await assert.rejects(as(bob).roast.delete({ id: roast.id }), code("NOT_FOUND"));
    const still = await prisma.roast.findUniqueOrThrow({ where: { id: roast.id } });
    assert.equal(still.coffeeName, "Protected");
  });

  test("deleting a roast removes its cupping sessions and scores", async () => {
    const roast = await as(alice).roast.create(roastInput);
    const session = await as(alice).cupping.create({ roastId: roast.id, scores: goodScores });
    const other = await as(alice).roast.create({ ...roastInput, coffeeName: "Bystander" });
    const otherSession = await as(alice).cupping.create({ roastId: other.id, scores: goodScores });

    await as(alice).roast.delete({ id: roast.id });

    assert.equal(await prisma.roast.count({ where: { id: roast.id } }), 0);
    assert.equal(await prisma.cuppingSession.count({ where: { id: session.id } }), 0);
    assert.equal(await prisma.cuppingScore.count({ where: { sessionId: session.id } }), 0);
    // unrelated data survives
    assert.equal(await prisma.cuppingSession.count({ where: { id: otherSession.id } }), 1);
    await assert.rejects(as(alice).roast.delete({ id: roast.id }), code("NOT_FOUND"));
  });
});

describe("cupping sessions", () => {
  test("create stores scores on an owned roast", async () => {
    const roast = await as(alice).roast.create(roastInput);
    const session = await as(alice).cupping.create({ roastId: roast.id, overallNote: " floral ", scores: goodScores });
    assert.equal(session.roastId, roast.id);
    assert.equal(session.overallNote, "floral");
    assert.equal(session.scores.length, 2);
  });

  test("cannot attach a session to someone else's roast", async () => {
    const roast = await as(bob).roast.create(roastInput);
    await assert.rejects(as(alice).cupping.create({ roastId: roast.id, scores: goodScores }), code("NOT_FOUND"));
    assert.equal(await prisma.cuppingSession.count({ where: { roastId: roast.id } }), 0);
  });

  test("rejects empty, out-of-range, unknown, duplicate scores and unknown schema versions", async () => {
    const roast = await as(alice).roast.create(roastInput);
    const create = (scores: { attributeKey: string; value: number }[], scoringSchemaVersion?: string) =>
      as(alice).cupping.create({ roastId: roast.id, scores, scoringSchemaVersion });

    await assert.rejects(create([]));
    await assert.rejects(create([{ attributeKey: "flavor", value: 15.5 }]), code("BAD_REQUEST"));
    await assert.rejects(create([{ attributeKey: "flavor", value: -0.5 }]), code("BAD_REQUEST"));
    await assert.rejects(create([{ attributeKey: "overall_quality", value: 5 }]), code("BAD_REQUEST"));
    await assert.rejects(create([{ attributeKey: "crema", value: 5 }]), code("BAD_REQUEST"));
    await assert.rejects(
      create([{ attributeKey: "flavor", value: 5 }, { attributeKey: "flavor", value: 6 }]),
      code("BAD_REQUEST"),
    );
    await assert.rejects(create(goodScores, "legacy-100"), code("BAD_REQUEST"));
    assert.equal(await prisma.cuppingSession.count({ where: { roastId: roast.id } }), 0);

    // exact boundaries are allowed
    await assert.doesNotReject(
      create([{ attributeKey: "flavor", value: 0 }, { attributeKey: "acidity", value: 15 }, { attributeKey: "overall_quality", value: 10 }]),
    );
  });

  test("delete removes only the targeted session; others cannot delete it", async () => {
    const roast = await as(alice).roast.create(roastInput);
    const keep = await as(alice).cupping.create({ roastId: roast.id, scores: goodScores });
    const drop = await as(alice).cupping.create({ roastId: roast.id, scores: goodScores });

    await assert.rejects(as(bob).cupping.delete({ id: drop.id }), code("NOT_FOUND"));
    assert.equal(await prisma.cuppingSession.count({ where: { id: drop.id } }), 1);

    await as(alice).cupping.delete({ id: drop.id });
    assert.equal(await prisma.cuppingSession.count({ where: { id: drop.id } }), 0);
    assert.equal(await prisma.cuppingScore.count({ where: { sessionId: drop.id } }), 0);
    assert.equal(await prisma.cuppingSession.count({ where: { id: keep.id } }), 1);
  });
});

describe("trend data", () => {
  test("a roast cupped twice returns both sessions oldest-first with overall_quality", async () => {
    const roast = await as(alice).roast.create(roastInput);
    const quality = [7.25, 8.5];
    for (const q of quality) {
      await as(alice).cupping.create({ roastId: roast.id, scores: [{ attributeKey: "overall_quality", value: q }] });
    }
    const { cuppingSessions } = await as(alice).roast.byId({ id: roast.id });
    assert.equal(cuppingSessions.length, 2);
    assert.deepEqual(
      cuppingSessions.map((s) => scoreOf(s, TREND_ATTRIBUTE_KEY)),
      quality,
    );
    const times = cuppingSessions.map((s) => s.cuppedAt.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });
});
