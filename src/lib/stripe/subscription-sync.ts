import type Stripe from "stripe";
import { mapStripeStatus } from "@/lib/billing/plans";
import { recordAuditEntry, type AuditWriter } from "@/lib/audit/log";

interface ExistingSubscription {
  id: string;
  userId: string;
  status: string;
  priceId: string | null;
}

export interface SubscriptionUpdate {
  stripeSubscriptionId?: string;
  status: string;
  priceId?: string | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date;
}

/// The slice of Prisma (or an interactive-transaction client) this sync
/// needs, so it can be exercised with a fake.
export interface WebhookStore extends AuditWriter {
  webhookEvent: {
    createMany(args: {
      data: { id: string; type: string; payload: string; signature: string }[];
      skipDuplicates: true;
    }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: { processed: true; processedAt: Date } }): Promise<unknown>;
  };
  subscription: {
    findFirst(args: { where: { stripeCustomerId: string } }): Promise<ExistingSubscription | null>;
    update(args: { where: { id: string }; data: SubscriptionUpdate }): Promise<unknown>;
  };
}

export interface TransactionRunner {
  $transaction<T>(fn: (tx: WebhookStore) => Promise<T>): Promise<T>;
}

/// Spec event types -> the Stripe events that carry them.
export const HANDLED_EVENT_TYPES = [
  "customer.subscription.created", // SubscriptionCreated
  "customer.subscription.updated", // SubscriptionUpdated
  "customer.subscription.deleted", // SubscriptionDeleted
  "invoice.paid", // InvoicePaid
  "invoice.payment_failed", // InvoiceFailed
] as const;

export type WebhookOutcome =
  /// Event recorded and the subscription row changed.
  | "applied"
  /// Event recorded, but there was nothing to change (unknown customer, or already in that state).
  | "no-op"
  /// Event id was already processed; nothing was touched.
  | "duplicate"
  /// Event type this app does not handle; not recorded.
  | "ignored";

const idOf = (ref: string | { id: string } | null | undefined) =>
  typeof ref === "string" ? ref : (ref?.id ?? null);

/// Works out the update an event calls for, or null when it names no customer.
function planUpdate(event: Stripe.Event): { customerId: string; data: SubscriptionUpdate } | null {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = idOf(sub.customer);
      if (!customerId) return null;
      const item = sub.items.data[0];
      return {
        customerId,
        data: {
          stripeSubscriptionId: sub.id,
          status: mapStripeStatus(sub.status),
          priceId: item?.price.id,
          currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
          // Never clear an existing trial end: a trialing row must keep one.
          ...(sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}),
        },
      };
    }
    // Op_HandleBillingFailure
    case "invoice.payment_failed": {
      const customerId = idOf(event.data.object.customer);
      return customerId ? { customerId, data: { status: "past_due" } } : null;
    }
    case "invoice.paid": {
      const customerId = idOf(event.data.object.customer);
      // A paid invoice clears a payment problem, and only that: it must not
      // flip a trial or canceled subscription to active.
      return customerId ? { customerId, data: { status: "active" } } : null;
    }
    default:
      return null;
  }
}

/// Op_SyncSubscriptionFromWebhook + Op_HandleBillingFailure. The caller has
/// already verified the signature. Inside one transaction this claims the
/// event id (a redelivery loses the claim and is skipped, Inv_WebhookIdempotency),
/// updates the subscription, appends an audit entry and marks the event
/// processed. If anything throws, everything rolls back - including the
/// claim - so Stripe's retry processes the event cleanly.
export async function processStripeEvent(
  db: TransactionRunner,
  event: Stripe.Event,
  raw: { payload: string; signature: string },
): Promise<WebhookOutcome> {
  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) return "ignored";

  return db.$transaction(async (tx) => {
    const { count } = await tx.webhookEvent.createMany({
      data: [{ id: event.id, type: event.type, payload: raw.payload, signature: raw.signature }],
      skipDuplicates: true,
    });
    if (count === 0) return "duplicate";

    const plan = planUpdate(event);
    const existing = plan ? await tx.subscription.findFirst({ where: { stripeCustomerId: plan.customerId } }) : null;

    let outcome: WebhookOutcome = "no-op";
    if (plan && existing && shouldApply(event.type, existing.status)) {
      await tx.subscription.update({ where: { id: existing.id }, data: plan.data });
      await recordAuditEntry(tx, {
        userId: existing.userId,
        entityType: "Subscription",
        entityId: existing.id,
        action: "Updated",
        previousValue: { status: existing.status, priceId: existing.priceId },
        newValue: { status: plan.data.status, priceId: plan.data.priceId ?? existing.priceId, event: event.type },
      });
      outcome = "applied";
    }

    await tx.webhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } });
    return outcome;
  });
}

function shouldApply(type: string, currentStatus: string) {
  if (type !== "invoice.paid") return true;
  const status = mapStripeStatus(currentStatus);
  return status === "past_due" || status === "incomplete";
}
