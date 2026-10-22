import { protectedProcedure, router } from "@/server/trpc/trpc";
import { getPlanLimits } from "@/server/billing";

export const subscriptionRouter = router({
  me: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.subscription.findUnique({ where: { userId: ctx.userId } }),
  ),

  /// What the caller's plan allows and how much of it they have used, so the
  /// UI can disable gated actions and explain why before the server refuses.
  plan: protectedProcedure.query(async ({ ctx }) => {
    const [limits, roasts] = await Promise.all([
      getPlanLimits(ctx.prisma, ctx.userId),
      ctx.prisma.roast.count({ where: { userId: ctx.userId } }),
    ]);
    return { limits, usage: { roasts } };
  }),
});
