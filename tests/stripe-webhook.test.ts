import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { applySubscriptionEvent, type SubscriptionStore } from "../src/lib/stripe/subscription-sync.ts";

const secret = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");

function subscriptionEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    object: "event",
    type,
    data: {
      object: {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        status: "active",
        items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1_800_000_000 }] },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

function fakeStore(existing: { id: string } | null) {
  const updates: unknown[] = [];
  const store: SubscriptionStore = {
    subscription: {
      findFirst: async () => existing,
      update: async (args) => void updates.push(args),
    },
  };
  return { store, updates };
}

test("signed payloads verify and tampered or wrongly signed ones are rejected", () => {
  const payload = JSON.stringify(subscriptionEvent("customer.subscription.created"));
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

  const event = stripe.webhooks.constructEvent(payload, header, secret);
  assert.equal(event.type, "customer.subscription.created");

  assert.throws(() => stripe.webhooks.constructEvent(payload + " ", header, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_other"));
});

test("subscription.updated syncs status, price and period end", async () => {
  const { store, updates } = fakeStore({ id: "row_1" });
  const handled = await applySubscriptionEvent(store, subscriptionEvent("customer.subscription.updated"));
  assert.equal(handled, true);
  assert.deepEqual(updates, [
    {
      where: { id: "row_1" },
      data: {
        stripeSubscriptionId: "sub_1",
        status: "active",
        priceId: "price_monthly",
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
      },
    },
  ]);
});

test("subscription.deleted records the canceled status", async () => {
  const { store, updates } = fakeStore({ id: "row_1" });
  await applySubscriptionEvent(store, subscriptionEvent("customer.subscription.deleted", { status: "canceled" }));
  assert.equal((updates[0] as { data: { status: string } }).data.status, "canceled");
});

test("events for unknown customers or unrelated types are ignored", async () => {
  const unknown = fakeStore(null);
  assert.equal(await applySubscriptionEvent(unknown.store, subscriptionEvent("customer.subscription.created")), false);
  assert.equal(unknown.updates.length, 0);

  const other = fakeStore({ id: "row_1" });
  assert.equal(await applySubscriptionEvent(other.store, subscriptionEvent("invoice.paid")), false);
  assert.equal(other.updates.length, 0);
});

test("a subscription with no items does not throw", async () => {
  const { store, updates } = fakeStore({ id: "row_1" });
  await applySubscriptionEvent(store, subscriptionEvent("customer.subscription.updated", { items: { data: [] } }));
  assert.equal((updates[0] as { data: { currentPeriodEnd: unknown } }).data.currentPeriodEnd, null);
});
