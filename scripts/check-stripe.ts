import Stripe from "stripe";
import { requireValidEnv } from "./lib/require-env.ts";
import { Report } from "./lib/report.ts";

requireValidEnv();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const report = new Report("Stripe preflight");

for (const [label, id] of [
  ["Monthly", process.env.STRIPE_PRICE_ID_MONTHLY!],
  ["Annual", process.env.STRIPE_PRICE_ID_ANNUAL!],
] as const) {
  await report.run(`${label} price ID resolves to an active recurring price`, async () => {
    const price = await stripe.prices.retrieve(id);
    if (!price.active) throw new Error(`${id} is archived`);
    if (!price.recurring) throw new Error(`${id} is a one-time price, subscriptions need a recurring one`);
    return `${id} (${price.recurring.interval})`;
  });
}

await report.run("Webhook endpoint configured for /api/stripe/webhook", async () => {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const match = endpoints.data.find(
    (e) => e.status === "enabled" && (site ? e.url === `${site}/api/stripe/webhook` : e.url.endsWith("/api/stripe/webhook")),
  );
  if (!match) throw new Error("no enabled endpoint pointing at /api/stripe/webhook");
  const events = new Set(match.enabled_events);
  const needed = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
  const missing = events.has("*") ? [] : needed.filter((e) => !events.has(e));
  if (missing.length) throw new Error(`${match.url} is not subscribed to: ${missing.join(", ")}`);
  return match.url;
});

report.finish();
