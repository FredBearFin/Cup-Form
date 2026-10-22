export type AuditAction = "Created" | "Updated" | "Deleted";

export interface AuditEntryInput {
  userId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  previousValue?: unknown;
  newValue?: unknown;
}

/// The slice of a Prisma client (or interactive-transaction client) needed to
/// append an audit entry, so callers can write it in the same transaction as
/// the change it describes.
export interface AuditWriter {
  auditLog: {
    create(args: {
      data: {
        userId: string;
        entityType: string;
        entityId: string;
        action: AuditAction;
        previousValue: string | null;
        newValue: string | null;
      };
    }): Promise<unknown>;
  };
}

const serialize = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));

/// Op_RecordAuditEntry. Append-only: this module only ever inserts, and the
/// database rejects UPDATE/DELETE on audit_logs.
export async function recordAuditEntry(db: AuditWriter, entry: AuditEntryInput) {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      previousValue: serialize(entry.previousValue),
      newValue: serialize(entry.newValue),
    },
  });
}
