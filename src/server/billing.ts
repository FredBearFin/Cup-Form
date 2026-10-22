import { TRPCError } from "@trpc/server";
import { derivePlanLimits, type PlanLimits } from "@/lib/billing/plans";

interface SubscriptionReader {
  subscription: {
    findUnique(args: { where: { userId: string } }): Promise<{
      status: string;
      priceId: string | null;
      trialEndsAt: Date | null;
    } | null>;
  };
}

/// The caller's current limits, derived from their stored subscription row.
export async function getPlanLimits(db: SubscriptionReader, userId: string): Promise<PlanLimits> {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  return derivePlanLimits(subscription, {
    monthly: process.env.STRIPE_PRICE_ID_MONTHLY,
    annual: process.env.STRIPE_PRICE_ID_ANNUAL,
  });
}

/// Plan limits are a business rule, not a permissions failure: FORBIDDEN with
/// the user-facing message, which the client shows as-is.
export const planLimitError = (message: string) => new TRPCError({ code: "FORBIDDEN", message });

/// Serializes a user's limit-checked writes. Without it, two simultaneous
/// "create roast" requests at 9/10 would both pass the count check.
export async function lockUserForWrite(
  tx: { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number> },
  userId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}
