import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/trpc";

const roastInput = z.object({
  coffeeName: z.string().min(1).max(200),
  origin: z.string().max(200).optional(),
  variety: z.string().max(200).optional(),
  process: z.string().max(200).optional(),
  roastDate: z.coerce.date(),
  batchSizeG: z.number().int().positive().optional(),
  roastLevel: z.string().max(100).optional(),
  roastTimeS: z.number().int().positive().optional(),
  notes: z.string().max(5000).optional(),
});

export const roastRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.roast.findMany({
      where: { userId: ctx.userId },
      orderBy: { roastDate: "desc" },
      include: { cuppingSessions: { include: { scores: true } } },
    }),
  ),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      ctx.prisma.roast.findFirstOrThrow({
        where: { id: input.id, userId: ctx.userId },
        include: { cuppingSessions: { include: { scores: true } } },
      }),
    ),

  create: protectedProcedure.input(roastInput).mutation(({ ctx, input }) =>
    ctx.prisma.roast.create({
      data: { ...input, userId: ctx.userId },
    }),
  ),

  update: protectedProcedure
    .input(roastInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      // Scope the update to the owning user so one user can't edit another's roast.
      const { count } = await ctx.prisma.roast.updateMany({
        where: { id, userId: ctx.userId },
        data,
      });
      if (count === 0) throw new Error("Roast not found");
      return ctx.prisma.roast.findUniqueOrThrow({ where: { id } });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.roast.deleteMany({
        where: { id: input.id, userId: ctx.userId },
      }),
    ),
});
