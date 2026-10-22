// Phase 3 against a real Postgres: plan limits, the audit log, webhook
// idempotency and billing failure. Run with `npm run test:integration`.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { appRouter } from "../../src/server/routers/_app.ts";
import { FREE_LIMITS, ROAST_LIMIT_MESSAGE } from "../../src/lib/billing/plans.ts";
import { getPlanLimits } from "../../src/server/billing.ts";
import { processStripeEvent, type TransactionRunner } from "../../src/lib/stripe/subscription-sync.ts";

const url = process.env.DATABASE_URL;
assert.ok(url, "DATABASE_URL is required for integration tests");
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname) || process.env.ALLOW_REMOTE_DB_TESTS === "1",
  "refusing to write test data to a non-local database; set ALLOW_REMOTE_DB_TESTS=1 to override",
);

const prisma = new PrismaClient();
const userIds: string[] = [];

type Plan = "free" | "paid";
async function freshUser(plan: Plan, extra: { stripeCustomerId?: string } = {}) {
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email: `${id}@integration.test`,
      subscription: { create: { status: plan === "paid" ? "active" : "canceled", priceId: "price_test", ...extra } },
    },
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
const roastInput = (coffeeName: string) => ({ coffeeName, roastDate: new Date("2026-03-04") });
const score = [{ attributeKey: "overall_quality", value: 8 }];
const auditFor = (entityId: string) => prisma.auditLog.findMany({ where: { entityId }, orderBy: { timestamp: "asc" } });

describe("plan limits (Free tier)", () => {
  test("the roast after the limit is refused with the upgrade message; existing roasts are untouched", async () => {
    const user = await freshUser("free");
    for (let i = 0; i < FREE_LIMITS.maxRoasts!; i++) await as(user).roast.create(roastInput(`r${i}`));
    await assert.rejects(as(user).roast.create(roastInput("one too many")), (e: unknown) => {
      assert.ok(code("FORBIDDEN")(e));
      assert.equal((e as Error).message, ROAST_LIMIT_MESSAGE);
      return true;
    });
    assert.equal(await prisma.roast.count({ where: { userId: user } }), FREE_LIMITS.maxRoasts);
  });

  test("simultaneous creates cannot overshoot the limit", async () => {
    const user = await freshUser("free");
    const results = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => as(user).roast.create(roastInput(`race${i}`))));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, FREE_LIMITS.maxRoasts);
    assert.equal(await prisma.roast.count({ where: { userId: user } }), FREE_LIMITS.maxRoasts);
  });

  test("deleting a roast frees a slot", async () => {
    const user = await freshUser("free");
    const made = [];
    for (let i = 0; i < FREE_LIMITS.maxRoasts!; i++) made.push(await as(user).roast.create(roastInput(`r${i}`)));
    await as(user).roast.delete({ id: made[0].id });
    await assert.doesNotReject(as(user).roast.create(roastInput("replacement")));
  });

  test("cupping sessions are capped per roast, not per account", async () => {
    const user = await freshUser("free");
    const a = await as(user).roast.create(roastInput("a"));
    const b = await as(user).roast.create(roastInput("b"));
    for (let i = 0; i < FREE_LIMITS.maxCuppingSessionsPerRoast!; i++) await as(user).cupping.create({ roastId: a.id, scores: score });
    await assert.rejects(as(user).cupping.create({ roastId: a.id, scores: score }), code("FORBIDDEN"));
    await assert.doesNotReject(as(user).cupping.create({ roastId: b.id, scores: score }));
  });

  test("comparison is refused on Free, and works once the plan is upgraded", async () => {
    const user = await freshUser("free");
    const a = await as(user).roast.create({ ...roastInput("a"), origin: "Kenya" });
    const b = await as(user).roast.create({ ...roastInput("b"), origin: "Kenya" });
    await assert.rejects(as(user).roast.compare({ roastIdA: a.id, roastIdB: b.id }), code("FORBIDDEN"));
    assert.equal((await getPlanLimits(prisma, user)).exportEnabled, false);

    await prisma.subscription.update({ where: { userId: user }, data: { status: "active" } });
    await assert.doesNotReject(as(user).roast.compare({ roastIdA: a.id, roastIdB: b.id }));
    assert.equal((await getPlanLimits(prisma, user)).exportEnabled, true);
  });

  test("a user with no subscription row at all is Free, not blocked", async () => {
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@integration.test` } });
    userIds.push(id);
    assert.deepEqual(await getPlanLimits(prisma, id), FREE_LIMITS);
    await assert.doesNotReject(as(id).roast.create(roastInput("first")));
  });

  test("subscription.plan reports limits and usage", async () => {
    const user = await freshUser("free");
    await as(user).roast.create(roastInput("a"));
    const plan = await as(user).subscription.plan();
    assert.equal(plan.limits.tier, "free");
    assert.equal(plan.usage.roasts, 1);
  });
});

describe("audit log", () => {
  test("roast create, update and delete each append an entry with before/after values", async () => {
    const user = await freshUser("paid");
    const roast = await as(user).roast.create({ ...roastInput("Original"), origin: "Peru" });
    await as(user).roast.update({ id: roast.id, coffeeName: "Renamed", origin: null });
    await as(user).roast.delete({ id: roast.id });

    const entries = await auditFor(roast.id);
    assert.deepEqual(entries.map((e) => [e.action, e.entityType, e.userId]), [
      ["Created", "Roast", user],
      ["Updated", "Roast", user],
      ["Deleted", "Roast", user],
    ]);
    assert.equal(entries[0].previousValue, null);
    assert.equal(JSON.parse(entries[0].newValue!).coffeeName, "Original");
    assert.equal(JSON.parse(entries[1].previousValue!).coffeeName, "Original");
    assert.equal(JSON.parse(entries[1].newValue!).coffeeName, "Renamed");
    assert.equal(JSON.parse(entries[1].newValue!).origin, null);
    assert.equal(JSON.parse(entries[2].previousValue!).coffeeName, "Renamed");
    assert.equal(entries[2].newValue, null);
  });

  test("cupping create and delete are audited with their scores", async () => {
    const user = await freshUser("paid");
    const roast = await as(user).roast.create(roastInput("c"));
    const session = await as(user).cupping.create({ roastId: roast.id, scores: score });
    await as(user).cupping.delete({ id: session.id });
    const entries = await auditFor(session.id);
    assert.deepEqual(entries.map((e) => e.action), ["Created", "Deleted"]);
    assert.deepEqual(JSON.parse(entries[0].newValue!).scores, [{ attributeKey: "overall_quality", value: 8, descriptor: null }]);
    assert.equal(JSON.parse(entries[1].previousValue!).roastId, roast.id);
  });

  test("refused or failed mutations leave no audit entry", async () => {
    const user = await freshUser("free");
    const stranger = await freshUser("paid");
    const theirs = await as(stranger).roast.create(roastInput("theirs"));
    await assert.rejects(as(user).roast.update({ id: theirs.id, coffeeName: "hijack" }), code("NOT_FOUND"));
    await assert.rejects(as(user).roast.delete({ id: theirs.id }), code("NOT_FOUND"));
    assert.equal((await auditFor(theirs.id)).length, 1); // only the owner's create

    for (let i = 0; i < FREE_LIMITS.maxRoasts!; i++) await as(user).roast.create(roastInput(`r${i}`));
    const before = await prisma.auditLog.count({ where: { userId: user } });
    await assert.rejects(as(user).roast.create(roastInput("over")));
    assert.equal(await prisma.auditLog.count({ where: { userId: user } }), before);
  });

  test("the database refuses to update, delete or truncate audit entries", async () => {
    const user = await freshUser("paid");
    const roast = await as(user).roast.create(roastInput("x"));
    const [entry] = await auditFor(roast.id);
    await assert.rejects(prisma.auditLog.update({ where: { id: entry.id }, data: { action: "Deleted" } }), /append-only/);
    await assert.rejects(prisma.auditLog.delete({ where: { id: entry.id } }), /append-only/);
    await assert.rejects(prisma.$executeRaw`TRUNCATE "audit_logs"`, /append-only/);
    assert.equal((await auditFor(roast.id)).length, 1);
  });

  test("entries outlive the user and their data", async () => {
    const user = await freshUser("paid");
    const roast = await as(user).roast.create(roastInput("gone"));
    await prisma.user.delete({ where: { id: user } }); // cascades roasts, not the log
    assert.equal((await auditFor(roast.id)).length, 1);
  });
});

describe("stripe webhook processing against the database", () => {
  const event = (id: string, type: string, object: Record<string, unknown>) =>
    ({ id, object: "event", type, data: { object } }) as unknown as Stripe.Event;
  const raw = { payload: "{}", signature: "t=1,v1=x" };
  const db = prisma as unknown as TransactionRunner;

  test("an upgrade syncs the row, lifts the limits, and a redelivery changes nothing", async () => {
    const customer = `cus_${randomUUID()}`;
    const user = await freshUser("free", { stripeCustomerId: customer });
    assert.equal((await getPlanLimits(prisma, user)).tier, "free");

    const evt = event(`evt_${randomUUID()}`, "customer.subscription.updated", {
      id: `sub_${randomUUID()}`,
      customer,
      status: "active",
      items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_900_000_000 }] },
    });
    assert.equal(await processStripeEvent(db, evt, raw), "applied");
    assert.equal((await getPlanLimits(prisma, user)).maxRoasts, null);
    assert.equal(await processStripeEvent(db, evt, raw), "duplicate");

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: user } });
    assert.deepEqual([sub.status, sub.priceId, sub.currentPeriodEnd], ["active", "price_pro", new Date(1_900_000_000 * 1000)]);
    const ledger = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: evt.id } });
    assert.equal(ledger.processed, true);
    const audits = await prisma.auditLog.findMany({ where: { userId: user, entityType: "Subscription" } });
    assert.equal(audits.length, 1);
  });

  test("concurrent deliveries of the same event apply it exactly once", async () => {
    const customer = `cus_${randomUUID()}`;
    const user = await freshUser("paid", { stripeCustomerId: customer });
    const evt = event(`evt_${randomUUID()}`, "invoice.payment_failed", { id: "in_1", customer });
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => processStripeEvent(db, evt, raw)));
    assert.deepEqual(outcomes.slice().sort(), ["applied", "duplicate", "duplicate", "duplicate", "duplicate"]);
    assert.equal(await prisma.auditLog.count({ where: { userId: user, entityType: "Subscription" } }), 1);
  });

  test("a failed payment makes the row past_due, keeps access, and a paid invoice recovers it", async () => {
    const customer = `cus_${randomUUID()}`;
    const user = await freshUser("paid", { stripeCustomerId: customer });
    await processStripeEvent(db, event(`evt_${randomUUID()}`, "invoice.payment_failed", { id: "in_1", customer }), raw);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { userId: user } })).status, "past_due");
    assert.equal((await getPlanLimits(prisma, user)).maxRoasts, null);
    assert.equal((await as(user).subscription.me())?.status, "past_due");

    await processStripeEvent(db, event(`evt_${randomUUID()}`, "invoice.paid", { id: "in_2", customer }), raw);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { userId: user } })).status, "active");
  });

  test("cancellation returns the user to Free without deleting their data", async () => {
    const customer = `cus_${randomUUID()}`;
    const user = await freshUser("paid", { stripeCustomerId: customer });
    for (let i = 0; i < FREE_LIMITS.maxRoasts! + 2; i++) await as(user).roast.create(roastInput(`r${i}`));
    await processStripeEvent(
      db,
      event(`evt_${randomUUID()}`, "customer.subscription.deleted", { id: "sub_x", customer, status: "canceled", items: { data: [] } }),
      raw,
    );
    assert.equal((await getPlanLimits(prisma, user)).tier, "free");
    assert.equal(await prisma.roast.count({ where: { userId: user } }), FREE_LIMITS.maxRoasts! + 2); // over-limit data is kept
    assert.equal((await as(user).roast.list()).length, FREE_LIMITS.maxRoasts! + 2);
    await assert.rejects(as(user).roast.create(roastInput("blocked")), code("FORBIDDEN"));
  });
});
