-- ============================================================
--  Auth pre-tenant-context lookups.
--
--  `users` has FORCE ROW LEVEL SECURITY (tenant_id = app.tenant_id).
--  Login/refresh/verify/reset flows must look a user up by email or id
--  BEFORE their tenant is known, so `app.tenant_id` is unset and any
--  direct SELECT against `users` as `app_user` returns zero rows.
--
--  These SECURITY DEFINER functions run as the function owner (the
--  migration role, a superuser locally), which bypasses RLS, and expose
--  only the columns auth actually needs. app_user may EXECUTE them but
--  cannot SELECT the table directly outside a tenant context.
-- ============================================================

CREATE OR REPLACE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  password_hash text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id, email, password_hash, status
  FROM users
  WHERE email = p_email
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_find_user_by_id(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id, email, status
  FROM users
  WHERE id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_user_by_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO app_user;
GRANT EXECUTE ON FUNCTION auth_find_user_by_id(uuid) TO app_user;
