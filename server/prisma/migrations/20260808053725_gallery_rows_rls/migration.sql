-- ============================================================
--  Gallery/system row visibility
-- ============================================================

-- templates
DROP POLICY IF EXISTS tenant_isolation ON templates;
CREATE POLICY templates_select ON templates FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid OR tenant_id IS NULL);
CREATE POLICY templates_modify ON templates FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- template_categories
DROP POLICY IF EXISTS tenant_isolation ON template_categories;
CREATE POLICY template_categories_select ON template_categories FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid OR tenant_id IS NULL);
CREATE POLICY template_categories_modify ON template_categories FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- form_templates
DROP POLICY IF EXISTS tenant_isolation ON form_templates;
CREATE POLICY form_templates_select ON form_templates FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid OR tenant_id IS NULL);
CREATE POLICY form_templates_modify ON form_templates FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);