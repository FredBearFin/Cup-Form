import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { processStripeEvent, type TransactionRunner } from "@/lib/stripe/subscription-sync";
import { raiseMonitoringAlert } from "@/lib/monitoring/alerts";

/// Keeps the local `subscriptions` row in sync with Stripe. Stripe is the
/// source of truth for billing state; this table is a read-optimized cache
/// of it for gating app access without calling Stripe on every request.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  // Op_RejectUnsignedWebhook: nothing below runs for an unverified request.
  if (!signature) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    await raiseMonitoringAlert("Critical", "STRIPE_WEBHOOK_SECRET is not set; webhooks cannot be verified");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await processStripeEvent(prisma as unknown as TransactionRunner, event, {
      payload: body,
      signature,
    });
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // 500 makes Stripe redeliver; the transaction rolled back, so the retry starts clean.
    await raiseMonitoringAlert("Critical", "Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      error: String(err),
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
