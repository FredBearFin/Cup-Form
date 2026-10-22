import type Stripe from "stripe";

/// The slice of Prisma this sync needs, so it can be exercised with a fake.
export interface SubscriptionStore {
  subscription: {
    findFirst(args: { where: { stripeCustomerId: string } }): Promise<{ id: string } | null>;
    update(args: {
      where: { id: string };
      data: {
        stripeSubscriptionId: string;
        status: string;
        priceId: string | undefined;
        currentPeriodEnd: Date | null;
      };
    }): Promise<unknown>;
  };
}

export const HANDLED_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

/// Applies a Stripe subscription event to the local `subscriptions` row.
/// Returns whether a row was updated; events for unknown customers and
/// unrelated event types are accepted but ignored.
export async function applySubscriptionEvent(
  db: SubscriptionStore,
  event: Stripe.Event,
): Promise<boolean> {
  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) return false;

  const sub = event.data.object as Stripe.Subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const existing = await db.subscription.findFirst({ where: { stripeCustomerId: customerId } });
  if (!existing) return false;

  const item = sub.items.data[0];
  await db.subscription.update({
    where: { id: existing.id },
    data: {
      stripeSubscriptionId: sub.id,
      status: sub.status,
      priceId: item?.price.id,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    },
  });
  return true;
}
