-- RenameIndex
ALTER INDEX "idx_events_tenant_campaign" RENAME TO "events_tenant_id_campaign_id_idx";

-- RenameIndex
ALTER INDEX "idx_events_type_time" RENAME TO "events_type_occurred_at_idx";
