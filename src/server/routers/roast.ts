import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Roast } from "@prisma/client";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { PROCESSES, ROAST_LEVELS } from "@/lib/roast/enums";
import { buildRoastWhere, roastQuerySchema } from "@/lib/roast/query";
import { sortRoasts } from "@/lib/roast/sort";
import { buildComparison, sharedDimensions } from "@/lib/roast/compare";
import { COMPARISON_PLAN_MESSAGE, roastCreateBlock } from "@/lib/billing/plans";
import { recordAuditEntry } from "@/lib/audit/log";
import { getPlanLimits, lockUserForWrite, planLimitError } from "@/server/billing";

const text = (max: number) => z.string().trim().max(max);

const roastInput = z.object({
  coffeeName: text(200).min(1),
  origin: text(200).optional(),
  variety: text(200).optional(),
  process: z.enum(PROCESSES).optional(),
  roastDate: z.coerce.date(),
  batchSizeG: z.number().int().positive().optional(),
  roastLevel: z.enum(ROAST_LEVELS).optional(),
  roastTimeS: z.number().int().positive().optional(),
  notes: text(5000).optional(),
});

/// On update an optional field may be null to clear it; coffeeName and
/// roastDate are required columns, so they can be changed but not cleared.
const roastUpdateInput = z.object({
  id: z.string().uuid(),
  coffeeName: roastInput.shape.coffeeName.optional(),
  roastDate: roastInput.shape.roastDate.optional(),
  origin: roastInput.shape.origin.nullable().optional(),
  variety: roastInput.shape.variety.nullable().optional(),
  process: roastInput.shape.process.nullable().optional(),
  batchSizeG: roastInput.shape.batchSizeG.nullable().optional(),
  roastLevel: roastInput.shape.roastLevel.nullable().optional(),
  roastTimeS: roastInput.shape.roastTimeS.nullable().optional(),
  notes: roastInput.shape.notes.nullable().optional(),
});

/// What the audit log keeps of a roast: its own columns, not its cuppings.
const auditSnapshot = (r: Roast) => ({
  coffeeName: r.coffeeName,
  origin: r.origin,
  variety: r.variety,
  process: r.process,
  roastDate: r.roastDate,
  batchSizeG: r.batchSizeG,
  roastLevel: r.roastLevel,
  roastTimeS: r.roastTimeS,
  notes: r.notes,
});

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Roast not found" });

export const roastRouter = router({
  /// Op_ApplyFilter + Op_ApplySort. Filtering happens in the database and is
  /// always scoped to the caller; sorting by score/activity needs the
  /// sessions, which are already loaded, so it runs on the result.
  list: protectedProcedure.input(roastQuerySchema.optional()).query(async ({ ctx, input }) => {
    const { sortKey, ...criteria } = roastQuerySchema.parse(input ?? {});
    const roasts = await ctx.prisma.roast.findMany({
      where: buildRoastWhere(ctx.userId, criteria),
      orderBy: { roastDate: "desc" },
      include: { cuppingSessions: { orderBy: { cuppedAt: "asc" }, include: { scores: true } } },
    });
    return sortRoasts(roasts, sortKey);
  }),

  /// Distinct origins the caller has used, for the origin filter's options.
  origins: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.roast.findMany({
      where: { userId: ctx.userId, origin: { not: null } },
      distinct: ["origin"],
      select: { origin: true },
      orderBy: { origin: "asc" },
    });
    return rows.map((r) => r.origin!);
  }),

  /// Op_ComputeRoastComparison: per-attribute latest scores for two of the
  /// caller's roasts that share an origin, process or roast level.
  compare: protectedProcedure
    .input(z.object({ roastIdA: z.string().uuid(), roastIdB: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Inv_ComparisonGatedByPlan
      if (!(await getPlanLimits(ctx.prisma, ctx.userId)).comparisonEnabled) {
        throw planLimitError(COMPARISON_PLAN_MESSAGE);
      }
      if (input.roastIdA === input.roastIdB) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick two different roasts to compare" });
      }
      const found = await ctx.prisma.roast.findMany({
        where: { id: { in: [input.roastIdA, input.roastIdB] }, userId: ctx.userId },
        include: { cuppingSessions: { include: { scores: true } } },
      });
      const roastA = found.find((r) => r.id === input.roastIdA);
      const roastB = found.find((r) => r.id === input.roastIdB);
      if (!roastA || !roastB) throw notFound();

      const shared = sharedDimensions(roastA, roastB);
      if (shared.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Roasts can only be compared if they share an origin, process, or roast level",
        });
      }
      return { roastA, roastB, shared, rows: buildComparison(roastA, roastB) };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const roast = await ctx.prisma.roast.findFirst({
        where: { id: input.id, userId: ctx.userId },
        include: { cuppingSessions: { orderBy: { cuppedAt: "asc" }, include: { scores: true } } },
      });
      if (!roast) throw notFound();
      return roast;
    }),

  /// Op_EnforcePlanLimitOnRoastCreate runs before the insert; the count, the
  /// insert and the audit entry share one transaction under a per-user lock.
  create: protectedProcedure.input(roastInput).mutation(({ ctx, input }) =>
    ctx.prisma.$transaction(async (tx) => {
      await lockUserForWrite(tx, ctx.userId);
      const blocked = roastCreateBlock(await getPlanLimits(tx, ctx.userId), await tx.roast.count({ where: { userId: ctx.userId } }));
      if (blocked) throw planLimitError(blocked);

      const roast = await tx.roast.create({ data: { ...input, userId: ctx.userId } });
      await recordAuditEntry(tx, {
        userId: ctx.userId,
        entityType: "Roast",
        entityId: roast.id,
        action: "Created",
        newValue: auditSnapshot(roast),
      });
      return roast;
    }),
  ),

  update: protectedProcedure.input(roastUpdateInput).mutation(({ ctx, input }) =>
    ctx.prisma.$transaction(async (tx) => {
      const { id, ...data } = input;
      // Scope to the owning user so one user can't edit another's roast.
      const before = await tx.roast.findFirst({ where: { id, userId: ctx.userId } });
      if (!before) throw notFound();
      const after = await tx.roast.update({ where: { id }, data });
      await recordAuditEntry(tx, {
        userId: ctx.userId,
        entityType: "Roast",
        entityId: id,
        action: "Updated",
        previousValue: auditSnapshot(before),
        newValue: auditSnapshot(after),
      });
      return after;
    }),
  ),

  /// Cascades to the roast's cupping sessions and scores (schema onDelete).
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction(async (tx) => {
        const before = await tx.roast.findFirst({ where: { id: input.id, userId: ctx.userId } });
        if (!before) throw notFound();
        await tx.roast.delete({ where: { id: input.id } });
        await recordAuditEntry(tx, {
          userId: ctx.userId,
          entityType: "Roast",
          entityId: input.id,
          action: "Deleted",
          previousValue: auditSnapshot(before),
        });
        return { id: input.id };
      }),
    ),
});
