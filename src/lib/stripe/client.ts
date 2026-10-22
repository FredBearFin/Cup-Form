import Stripe from "stripe";

// Lazily constructed so a missing STRIPE_SECRET_KEY doesn't fail the build
// (Next.js evaluates route modules at build time) — only a real request to
// a Stripe route needs the key to actually be set.
let _stripe: Stripe | undefined;

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not set");
      }
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return Reflect.get(_stripe, prop, _stripe);
  },
});
