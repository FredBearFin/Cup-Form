import type { PrismaClient } from "@prisma/client";

export class ExportNotFoundError extends Error {
  constructor() {
    super("One or more roasts were not found");
  }
}

/// Inv_ExportOwnership: loads the requested roasts only if *every* id is one
/// of the caller's. A foreign or nonexistent id fails the whole export with
/// the same error, so ids can't be probed and nothing partial is produced.
/// Roasts come back newest first, each with its sessions and scores.
export async function loadOwnedRoastsForExport(
  prisma: PrismaClient,
  userId: string,
  roastIds: string[],
) {
  const unique = [...new Set(roastIds)];
  const roasts = await prisma.roast.findMany({
    where: { id: { in: unique }, userId },
    orderBy: [{ roastDate: "desc" }, { createdAt: "desc" }],
    include: {
      cuppingSessions: { orderBy: { cuppedAt: "asc" }, include: { scores: true } },
    },
  });
  if (unique.length === 0 || roasts.length !== unique.length) throw new ExportNotFoundError();
  return roasts;
}
