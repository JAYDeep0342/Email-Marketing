-- Add created_at to the auth RLS-bypass lookup functions so callers can
-- ORDER BY created_at for a deterministic tiebreaker (defense-in-depth now
-- that users.email is globally unique; kept for historical/duplicate-safety).
-- CREATE OR REPLACE can't change a function's return column list, so we
-- drop and recreate.

DROP FUNCTION IF EXISTS auth_find_user_by_email(text);
DROP FUNCTION IF EXISTS auth_find_user_by_id(uuid);

CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  password_hash text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id, email, password_hash, status, created_at
  FROM users
  WHERE email = p_email
  LIMIT 1;
$$;

CREATE FUNCTION auth_find_user_by_id(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id, email, status, created_at
  FROM users
  WHERE id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_user_by_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO app_user;
GRANT EXECUTE ON FUNCTION auth_find_user_by_id(uuid) TO app_user;
