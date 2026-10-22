import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { applySubscriptionEvent } from "@/lib/stripe/subscription-sync";

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

  await applySubscriptionEvent(prisma, event);

  return NextResponse.json({ received: true });
}
