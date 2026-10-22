// Plan tiers and the limits each one carries. Dependency-free so it runs in
// the server, in scripts and under `node --test`.

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "incomplete"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type PlanTier = "free" | "monthly" | "annual";

/// `null` is the spec's UNLIMITED, which survives JSON/superjson unlike Infinity.
export interface PlanLimits {
  tier: PlanTier;
  maxRoasts: number | null;
  maxCuppingSessionsPerRoast: number | null;
  exportEnabled: boolean;
  comparisonEnabled: boolean;
}

export const FREE_LIMITS: PlanLimits = {
  tier: "free",
  maxRoasts: 10,
  maxCuppingSessionsPerRoast: 3,
  exportEnabled: false,
  comparisonEnabled: false,
};

const paidLimits = (tier: "monthly" | "annual"): PlanLimits => ({
  tier,
  maxRoasts: null,
  maxCuppingSessionsPerRoast: null,
  exportEnabled: true,
  comparisonEnabled: true,
});

export interface PlanPrices {
  monthly?: string;
  annual?: string;
}

export interface SubscriptionSnapshot {
  status: string;
  priceId: string | null;
  trialEndsAt: Date | null;
}

/// map_stripe_status: Stripe has more states than the app models. `unpaid` is
/// a payment problem (past_due); `incomplete_expired` and `paused` mean the
/// customer has no running subscription (canceled). Unknown future states
/// fall back to `incomplete`, which grants nothing.
export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
      return status;
    case "unpaid":
      return "past_due";
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "incomplete";
  }
}

/// derive_plan_limits. Paid access = a running trial, `active`, or `past_due`
/// (Stripe retries a failed payment for days, so access continues while the
/// user is warned to fix billing). Everyone else - no subscription, canceled,
/// incomplete, or an app-level trial whose end date has passed - is Free.
export function derivePlanLimits(
  subscription: SubscriptionSnapshot | null,
  prices: PlanPrices = {},
  now: Date = new Date(),
): PlanLimits {
  if (!subscription) return FREE_LIMITS;
  const status = mapStripeStatus(subscription.status);

  if (status === "trialing") {
    if (!subscription.trialEndsAt || subscription.trialEndsAt <= now) return FREE_LIMITS;
  } else if (status !== "active" && status !== "past_due") {
    return FREE_LIMITS;
  }

  // A trial started without a price (the sign-in trial) gets full access.
  return paidLimits(subscription.priceId && subscription.priceId === prices.annual ? "annual" : "monthly");
}

export const ROAST_LIMIT_MESSAGE = "Plan limit reached: upgrade to add more roasts";
export const CUPPING_LIMIT_MESSAGE = "Plan limit reached: upgrade to add more cupping sessions to this roast";
export const EXPORT_PLAN_MESSAGE = "Export is available on paid plans: upgrade to export your data";
export const COMPARISON_PLAN_MESSAGE = "Comparison is available on paid plans: upgrade to compare roasts";

/// Op_EnforcePlanLimitOnRoastCreate's precondition; returns the error to show, or null.
export function roastCreateBlock(limits: PlanLimits, roastCount: number): string | null {
  return limits.maxRoasts !== null && roastCount >= limits.maxRoasts ? ROAST_LIMIT_MESSAGE : null;
}

export function cuppingCreateBlock(limits: PlanLimits, sessionCount: number): string | null {
  return limits.maxCuppingSessionsPerRoast !== null && sessionCount >= limits.maxCuppingSessionsPerRoast
    ? CUPPING_LIMIT_MESSAGE
    : null;
}
