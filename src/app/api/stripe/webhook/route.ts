import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";

/// Keeps the local `subscriptions` row in sync with Stripe. Stripe is the
/// source of truth for billing state; this table is a read-optimized cache
/// of it for gating app access without calling Stripe on every request.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${err}` }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const existing = await prisma.subscription.findFirst({
        where: { stripeCustomerId: sub.customer as string },
      });
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            stripeSubscriptionId: sub.id,
            status: sub.status,
            priceId: sub.items.data[0]?.price.id,
            currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
          },
        });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
