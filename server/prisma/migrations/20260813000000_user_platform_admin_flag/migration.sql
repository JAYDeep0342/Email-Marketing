-- BUG #3: platform-operator flag on users, checked by PlatformAdminGuard on
-- /api/admin/plans/* only. Additive-only: NOT NULL + DEFAULT false backfills
-- every existing row safely, no RLS/tenancy change, no data loss risk.
ALTER TABLE "users" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
