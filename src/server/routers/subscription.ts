import { protectedProcedure, router } from "@/server/trpc/trpc";

export const subscriptionRouter = router({
  me: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.subscription.findUnique({ where: { userId: ctx.userId } }),
  ),
});
