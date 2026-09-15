-- Add is_platform_admin to the pre-tenant-context login lookup so
-- AuthService.login() can return it on the user object. CREATE OR REPLACE
-- can't change a function's return column list, so drop and recreate
-- (same pattern as the 20260806152810 migration that added created_at).
-- auth_find_user_by_id is untouched — none of its callers (refresh,
-- verifyEmail, resetPassword) return a user object to the client, so there's
-- nothing there that needs this column.

DROP FUNCTION IF EXISTS auth_find_user_by_email(text);

CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  password_hash text,
  status text,
  created_at timestamptz,
  is_platform_admin boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id, email, password_hash, status, created_at, is_platform_admin
  FROM users
  WHERE email = p_email
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO app_user;
