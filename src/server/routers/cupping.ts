import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { DEFAULT_SCORING_SCHEMA_VERSION } from "@/lib/scoring/schemas";
import { validateScores } from "@/lib/scoring/validate";

const scoreEntry = z.object({
  attributeKey: z.string(),
  value: z.number(),
  descriptor: z.string().max(500).optional(),
});

export const cuppingRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        roastId: z.string().uuid(),
        scoringSchemaVersion: z.string().default(DEFAULT_SCORING_SCHEMA_VERSION),
        overallNote: z.string().trim().max(5000).optional(),
        scores: z.array(scoreEntry).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Confirm the roast belongs to this user before attaching a session to it.
      const roast = await ctx.prisma.roast.findFirst({
        where: { id: input.roastId, userId: ctx.userId },
        select: { id: true },
      });
      if (!roast) throw new TRPCError({ code: "NOT_FOUND", message: "Roast not found" });

      const problems = validateScores(input.scoringSchemaVersion, input.scores);
      if (problems.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: problems.join("; ") });
      }

      return ctx.prisma.cuppingSession.create({
        data: {
          roastId: input.roastId,
          scoringSchemaVersion: input.scoringSchemaVersion,
          overallNote: input.overallNote,
          scores: {
            create: input.scores,
          },
        },
        include: { scores: true },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Scope the delete through the owning roast so users can't delete each other's sessions.
      const session = await ctx.prisma.cuppingSession.findFirst({
        where: { id: input.id, roast: { userId: ctx.userId } },
        select: { id: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Cupping session not found" });
      return ctx.prisma.cuppingSession.delete({ where: { id: input.id } });
    }),
});
