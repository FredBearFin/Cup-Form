import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";

const bodySchema = z.object({
  plan: z.enum(["monthly", "annual"]),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = bodySchema.parse(await request.json());
  const priceId =
    plan === "annual" ? process.env.STRIPE_PRICE_ID_ANNUAL! : process.env.STRIPE_PRICE_ID_MONTHLY!;

  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });

  let customerId = subscription?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, stripeCustomerId: customerId },
      update: { stripeCustomerId: customerId },
    });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // 14-day trial on top of Stripe's own subscription lifecycle, per the
    // pricing research (annual-first framing, 14-30 day trial window).
    subscription_data: { trial_period_days: 14 },
    success_url: `${siteUrl}/app?checkout=success`,
    cancel_url: `${siteUrl}/app?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
