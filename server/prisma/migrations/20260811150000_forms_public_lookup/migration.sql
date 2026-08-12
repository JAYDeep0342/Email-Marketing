-- ============================================================
-- Step 14 — Forms public submission support
--
-- Public form submit (POST /api/public/forms/:formId/submissions) has no auth
-- and no tenant context. To find the form across RLS we use the same pattern
-- as unsubscribe_lookup: a SECURITY DEFINER function, owned by a role that
-- bypasses RLS, granted EXECUTE only to app_user.
--
-- The function returns only what the submission path needs. It intentionally
-- does NOT expose the form's raw config beyond fields/settings — enough to
-- validate the incoming payload, but no more.
-- ============================================================

CREATE OR REPLACE FUNCTION form_public_lookup(p_form_id uuid)
RETURNS TABLE (
  id         uuid,
  tenant_id  uuid,
  list_id    uuid,
  is_active  boolean,
  fields     jsonb,
  settings   jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, list_id, is_active, fields, settings
  FROM forms
  WHERE id = p_form_id
$$;

-- Lock it down: only app_user may execute; revoke the default PUBLIC grant.
REVOKE ALL ON FUNCTION form_public_lookup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION form_public_lookup(uuid) TO app_user;