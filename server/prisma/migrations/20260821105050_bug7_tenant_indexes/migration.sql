-- BUG #7: tenantId-leading indexes on the 3 actively-used tenant-scoped
-- tables that lacked one — RLS filters every query on these by tenant_id,
-- forcing a full scan as they grow without an index to back it.

-- blacklist: campaign-recipients.service.ts reads this with NO app-level
-- WHERE at all (RLS-only), so tenant_id is the only filter Postgres has.
-- CreateIndex
CREATE INDEX "blacklist_tenant_id_idx" ON "blacklist"("tenant_id");

-- form_submissions: existing formId index doesn't cover the implicit
-- tenant_id predicate RLS adds to every query.
-- CreateIndex
CREATE INDEX "form_submissions_tenant_id_idx" ON "form_submissions"("tenant_id");

-- unsubscribe_tokens: composite, not plain tenant_id — unsubscribe.service.ts
-- ensureToken() runs on every single email send and filters on exactly
-- (contact_id, campaign_id) together; this covers that exact hot-path WHERE
-- clause plus RLS's implicit tenant_id predicate in one index.
-- CreateIndex
CREATE INDEX "unsubscribe_tokens_tenant_id_contact_id_campaign_id_idx" ON "unsubscribe_tokens"("tenant_id", "contact_id", "campaign_id");
