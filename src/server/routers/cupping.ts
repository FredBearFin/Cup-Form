import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { DEFAULT_SCORING_SCHEMA_VERSION } from "@/lib/scoring/schemas";
import { validateScores } from "@/lib/scoring/validate";
import { cuppingCreateBlock } from "@/lib/billing/plans";
import { recordAuditEntry } from "@/lib/audit/log";
import { getPlanLimits, lockUserForWrite, planLimitError } from "@/server/billing";

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
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        await lockUserForWrite(tx, ctx.userId);

        // Confirm the roast belongs to this user before attaching a session to it.
        const roast = await tx.roast.findFirst({
          where: { id: input.roastId, userId: ctx.userId },
          select: { id: true, _count: { select: { cuppingSessions: true } } },
        });
        if (!roast) throw new TRPCError({ code: "NOT_FOUND", message: "Roast not found" });

        const problems = validateScores(input.scoringSchemaVersion, input.scores);
        if (problems.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: problems.join("; ") });
        }

        const blocked = cuppingCreateBlock(await getPlanLimits(tx, ctx.userId), roast._count.cuppingSessions);
        if (blocked) throw planLimitError(blocked);

        const session = await tx.cuppingSession.create({
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
        await recordAuditEntry(tx, {
          userId: ctx.userId,
          entityType: "CuppingSession",
          entityId: session.id,
          action: "Created",
          newValue: {
            roastId: session.roastId,
            scoringSchemaVersion: session.scoringSchemaVersion,
            overallNote: session.overallNote,
            scores: session.scores.map((s) => ({ attributeKey: s.attributeKey, value: s.value, descriptor: s.descriptor })),
          },
        });
        return session;
      }),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        // Scope the delete through the owning roast so users can't delete each other's sessions.
        const session = await tx.cuppingSession.findFirst({
          where: { id: input.id, roast: { userId: ctx.userId } },
          include: { scores: true },
        });
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Cupping session not found" });
        const deleted = await tx.cuppingSession.delete({ where: { id: input.id } });
        await recordAuditEntry(tx, {
          userId: ctx.userId,
          entityType: "CuppingSession",
          entityId: input.id,
          action: "Deleted",
          previousValue: {
            roastId: session.roastId,
            scoringSchemaVersion: session.scoringSchemaVersion,
            overallNote: session.overallNote,
            scores: session.scores.map((s) => ({ attributeKey: s.attributeKey, value: s.value, descriptor: s.descriptor })),
          },
        });
        return deleted;
      }),
    ),
});
