-- Creates the restricted `app_user` role the running app connects as
-- (APP_DATABASE_URL — see prisma.service.ts) and grants it everything it
-- needs: table CRUD, sequence usage, and default privileges so future
-- tables/sequences inherit the same grants automatically (no per-migration
-- re-granting needed). This collapses what used to be a manual, undocumented
-- setup step into `migrate deploy` itself.
--
-- MUST run before the first `GRANT EXECUTE ON FUNCTION ... TO app_user`
-- (in 20260806071600_auth_rls_bypass_functions) — that's why this migration
-- is timestamped to sort between 20260805102202 and 20260806071600 rather
-- than appended at the end. Verified empirically that Prisma applies an
-- out-of-order-timestamped migration correctly, both on a fresh database and
-- on one that already has later migrations applied.
--
-- Password is deliberately NOT set here. A migration file is committed to
-- git, so baking in a real secret (or a placeholder nobody remembers to
-- rotate) is unsafe — especially since APP_DATABASE_URL in .env already
-- carries the real one. `prisma/seed.ts` sets the password immediately after
-- this migration runs, read from .env, never hardcoded. Until seeding runs,
-- this role exists but has no usable password and cannot log in — fine,
-- since the app isn't started until seeding completes.
--
-- Idempotent: safe to apply against a database where app_user was already
-- created by hand (this project's existing local dev setup) — the role
-- creation is guarded, and re-granting an already-held privilege in Postgres
-- is a harmless no-op.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    -- NOBYPASSRLS is the default for a new role, but stated explicitly here
    -- since it's the single most security-critical property of this role —
    -- the entire multi-tenant RLS model depends on it never bypassing RLS.
    CREATE ROLE app_user LOGIN NOBYPASSRLS;
  END IF;

  -- Database name varies per environment, so GRANT CONNECT can't reference
  -- it as a literal — build it dynamically against whichever DB this
  -- migration is actually running against.
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Covers every table/sequence created by later migrations (all of which run
-- as the same superuser role as this one) without needing to re-grant here
-- each time a new migration adds a table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
