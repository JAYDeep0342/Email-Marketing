-- ============================================================
--  Step 12 — Sending Engine: RLS fix + SECURITY DEFINER helpers
--
--  This migration touches NO tables' structure and NEVER references `events`
--  (so it cannot re-trigger the events drift). It only:
--    1. Replaces the blacklist policy with the split (global-visible) pattern.
--    2. Adds two narrow SECURITY DEFINER functions the engine needs to work
--       across RLS: due-campaign discovery and public unsubscribe lookup.
--
--  Idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. blacklist split policy (deferred from Step 11)
--
--    `blacklist` holds GLOBAL rows (tenant_id IS NULL) meant to be visible to
--    every tenant, plus per-tenant rows. A plain `tenant_id = current_setting`
--    policy hides the NULL rows from everyone. Same fix as roles/templates.
-- ------------------------------------------------------------
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist FORCE ROW LEVEL SECURITY;

-- Drop whatever policies currently exist on blacklist, by name, regardless of
-- what they were called (Step 11 noted a plain `tenant_isolation`).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'blacklist' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON blacklist', p.policyname);
  END LOOP;
END $$;

-- Read: own rows OR global (NULL) rows.
CREATE POLICY blacklist_select ON blacklist FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR tenant_id IS NULL
  );

-- Write: only own rows. Global (NULL-owner) rows are not writable by any tenant
-- (a tenant cannot forge tenant_id = NULL through WITH CHECK).
CREATE POLICY blacklist_modify ON blacklist FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ------------------------------------------------------------
-- 2. sending_due_campaigns()
--
--    The scheduler must see 'scheduled' campaigns ACROSS ALL TENANTS whose time
--    has come, but the app connects as app_user (NOBYPASSRLS) and, at poll time,
--    has NO app.tenant_id set — so a normal SELECT returns zero rows. This
--    narrow SECURITY DEFINER function (owner = postgres) bypasses RLS for
--    exactly this read. No dynamic SQL => zero injection surface. Mirrors the
--    auth_find_user_by_* pattern from 20260806071600.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sending_due_campaigns()
  RETURNS TABLE (campaign_id uuid, tenant_id uuid)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id, tenant_id
  FROM campaigns
  WHERE status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= now()
    AND deleted_at IS NULL
  ORDER BY scheduled_at ASC
$$;

REVOKE ALL ON FUNCTION sending_due_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sending_due_campaigns() TO app_user;

-- ------------------------------------------------------------
-- 3. unsubscribe_lookup(text)
--
--    The public unsubscribe endpoint has no auth and no tenant context, but
--    unsubscribe_tokens is tenant-scoped under forced RLS. This function looks a
--    token up by its stored SHA-256 hash and returns just enough to process the
--    unsubscribe; the app then does all WRITES inside withTenant(tenant_id).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION unsubscribe_lookup(p_token_hash text)
  RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    contact_id uuid,
    campaign_id uuid,
    used_at timestamptz
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id, tenant_id, contact_id, campaign_id, used_at
  FROM unsubscribe_tokens
  WHERE token = p_token_hash
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION unsubscribe_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unsubscribe_lookup(text) TO app_user;