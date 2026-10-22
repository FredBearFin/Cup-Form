-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_value" TEXT,
    "new_value" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_timestamp_idx" ON "audit_logs"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");


-- Inv_AuditLogAppendOnly: entries can be inserted but never changed or removed.
CREATE FUNCTION audit_logs_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_change();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_reject_change();
