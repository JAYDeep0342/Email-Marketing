-- The `roles` table's tenant_isolation policy is `tenant_id = app.tenant_id`,
-- which can never match a system role (tenant_id IS NULL) — NULL = anything
-- is NULL, never TRUE, in Postgres's three-valued logic. System roles were
-- completely invisible to app_user regardless of tenant context.
--
-- Split into two permissive policies (Postgres OR's multiple permissive
-- policies together per command):
--   - roles_select (SELECT only): own tenant's rows OR system rows (NULL).
--     Lets tenants read system roles, read-only.
--   - roles_modify (ALL): own tenant's rows only, both for USING (which
--     rows a write may touch) and WITH CHECK (what a write may leave
--     behind). System rows are excluded from both, so INSERT/UPDATE/DELETE
--     can never touch or create a tenant_id IS NULL row.

DROP POLICY IF EXISTS tenant_isolation ON roles;

CREATE POLICY roles_select ON roles FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR tenant_id IS NULL
  );

CREATE POLICY roles_modify ON roles FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
