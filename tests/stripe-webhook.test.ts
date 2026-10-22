import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import {
  processStripeEvent,
  type SubscriptionUpdate,
  type TransactionRunner,
  type WebhookStore,
} from "../src/lib/stripe/subscription-sync.ts";

const secret = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");
const raw = { payload: "{}", signature: "t=1,v1=abc" };

let eventSeq = 0;
function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_${++eventSeq}`) {
  return { id, object: "event", type, data: { object } } as unknown as Stripe.Event;
}

const subscriptionEvent = (type: string, overrides: Record<string, unknown> = {}, id?: string) =>
  stripeEvent(
    type,
    {
      id: "sub_1",
      object: "subscription",
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1_800_000_000 }] },
      ...overrides,
    },
    id,
  );

const invoiceEvent = (type: string, overrides: Record<string, unknown> = {}) =>
  stripeEvent(type, { id: "in_1", object: "invoice", customer: "cus_1", ...overrides });

/// In-memory stand-in for the database with real rollback semantics: a
/// transaction works on a copy that is only committed if the callback resolves.
function fakeDb(row: { id: string; userId: string; status: string; priceId: string | null } | null) {
  const state = {
    row,
    events: new Map<string, { processed: boolean }>(),
    updates: [] as SubscriptionUpdate[],
    audit: [] as { userId: string; entityType: string; entityId: string; action: string; previousValue: string | null; newValue: string | null }[],
  };
  const db: TransactionRunner = {
    async $transaction(fn) {
      const draft = {
        row: state.row && { ...state.row },
        events: new Map([...state.events].map(([k, v]) => [k, { ...v }])),
        updates: [...state.updates],
        audit: [...state.audit],
      };
      const tx: WebhookStore = {
        webhookEvent: {
          createMany: async ({ data }) => {
            let count = 0;
            for (const e of data) {
              if (!draft.events.has(e.id)) {
                draft.events.set(e.id, { processed: false });
                count++;
              }
            }
            return { count };
          },
          update: async ({ where }) => void (draft.events.get(where.id)!.processed = true),
        },
        subscription: {
          findFirst: async () => (draft.row ? { ...draft.row } : null),
          update: async ({ data }) => {
            draft.updates.push(data);
            Object.assign(draft.row!, { status: data.status, priceId: data.priceId ?? draft.row!.priceId });
          },
        },
        auditLog: { create: async ({ data }) => void draft.audit.push(data) },
      };
      const result = await fn(tx);
      Object.assign(state, draft);
      return result;
    },
  };
  return { db, state };
}

const trialing = { id: "row_1", userId: "user_1", status: "trialing", priceId: null };

test("signed payloads verify and tampered or wrongly signed ones are rejected", () => {
  const payload = JSON.stringify(subscriptionEvent("customer.subscription.created"));
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

  const event = stripe.webhooks.constructEvent(payload, header, secret);
  assert.equal(event.type, "customer.subscription.created");

  assert.throws(() => stripe.webhooks.constructEvent(payload + " ", header, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_other"));
});

test("subscription.updated syncs status, price and period end, and audits it", async () => {
  const { db, state } = fakeDb({ ...trialing });
  const outcome = await processStripeEvent(db, subscriptionEvent("customer.subscription.updated"), raw);
  assert.equal(outcome, "applied");
  assert.deepEqual(state.updates, [
    {
      stripeSubscriptionId: "sub_1",
      status: "active",
      priceId: "price_monthly",
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    },
  ]);
  assert.equal(state.audit.length, 1);
  assert.deepEqual(
    { ...state.audit[0], newValue: JSON.parse(state.audit[0].newValue!), previousValue: JSON.parse(state.audit[0].previousValue!) },
    {
      userId: "user_1",
      entityType: "Subscription",
      entityId: "row_1",
      action: "Updated",
      previousValue: { status: "trialing", priceId: null },
      newValue: { status: "active", priceId: "price_monthly", event: "customer.subscription.updated" },
    },
  );
});

test("a Stripe trial end date is kept; an absent one never clears an existing one", async () => {
  const { db, state } = fakeDb({ ...trialing });
  await processStripeEvent(db, subscriptionEvent("customer.subscription.created", { status: "trialing", trial_end: 1_800_000_000 }), raw);
  await processStripeEvent(db, subscriptionEvent("customer.subscription.updated", { status: "trialing", trial_end: null }), raw);
  assert.deepEqual(state.updates[0].trialEndsAt, new Date(1_800_000_000 * 1000));
  assert.equal("trialEndsAt" in state.updates[1], false);
});

test("subscription.deleted records the canceled status; unpaid maps to past_due", async () => {
  const { db, state } = fakeDb({ ...trialing });
  await processStripeEvent(db, subscriptionEvent("customer.subscription.deleted", { status: "canceled" }), raw);
  await processStripeEvent(db, subscriptionEvent("customer.subscription.updated", { status: "unpaid" }), raw);
  assert.deepEqual(state.updates.map((u) => u.status), ["canceled", "past_due"]);
});

test("a redelivered event is applied once", async () => {
  const { db, state } = fakeDb({ ...trialing });
  const event = subscriptionEvent("customer.subscription.updated", {}, "evt_dup");
  assert.equal(await processStripeEvent(db, event, raw), "applied");
  assert.equal(await processStripeEvent(db, event, raw), "duplicate");
  assert.equal(state.updates.length, 1);
  assert.equal(state.audit.length, 1);
  assert.equal(state.events.get("evt_dup")?.processed, true);
});

test("a failure rolls back the claim so the retry processes the event", async () => {
  const { db, state } = fakeDb({ ...trialing });
  const event = subscriptionEvent("customer.subscription.updated", {}, "evt_retry");
  const failing: TransactionRunner = {
    $transaction: (fn) =>
      db.$transaction((tx) =>
        fn({ ...tx, auditLog: { create: async () => Promise.reject(new Error("db down")) } }),
      ),
  };
  await assert.rejects(processStripeEvent(failing, event, raw), /db down/);
  assert.equal(state.events.has("evt_retry"), false);
  assert.equal(await processStripeEvent(db, event, raw), "applied");
});

test("invoice.payment_failed marks the subscription past_due", async () => {
  const { db, state } = fakeDb({ ...trialing, status: "active", priceId: "price_monthly" });
  assert.equal(await processStripeEvent(db, invoiceEvent("invoice.payment_failed"), raw), "applied");
  assert.deepEqual(state.updates, [{ status: "past_due" }]);
  assert.equal(state.audit.length, 1);
});

test("invoice.paid recovers past_due, but never promotes a trial or canceled row", async () => {
  const recovering = fakeDb({ ...trialing, status: "past_due" });
  assert.equal(await processStripeEvent(recovering.db, invoiceEvent("invoice.paid"), raw), "applied");
  assert.deepEqual(recovering.state.updates, [{ status: "active" }]);

  for (const status of ["trialing", "canceled", "active"]) {
    const other = fakeDb({ ...trialing, status });
    assert.equal(await processStripeEvent(other.db, invoiceEvent("invoice.paid"), raw), "no-op");
    assert.equal(other.state.updates.length, 0);
  }
});

test("events for unknown customers are recorded but change nothing; unrelated types are ignored", async () => {
  const unknown = fakeDb(null);
  assert.equal(await processStripeEvent(unknown.db, subscriptionEvent("customer.subscription.created", {}, "evt_u"), raw), "no-op");
  assert.equal(unknown.state.updates.length, 0);
  assert.equal(unknown.state.events.get("evt_u")?.processed, true);

  const other = fakeDb({ ...trialing });
  assert.equal(await processStripeEvent(other.db, stripeEvent("customer.created", {}, "evt_o"), raw), "ignored");
  assert.equal(other.state.events.size, 0);
});

test("a subscription with no items does not throw", async () => {
  const { db, state } = fakeDb({ ...trialing });
  await processStripeEvent(db, subscriptionEvent("customer.subscription.updated", { items: { data: [] } }), raw);
  assert.equal(state.updates[0].currentPeriodEnd, null);
});
