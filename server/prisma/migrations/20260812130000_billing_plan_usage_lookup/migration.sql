-- ============================================================
--  PlansService.remove() needs to know, ACROSS ALL TENANTS, whether any
--  tenant or subscription still references a plan before allowing delete.
--  `subscriptions` is under FORCE ROW LEVEL SECURITY, so a plain
--  `_count: { subscriptions: true }` on a platform-level Plan.findUnique
--  fails the same way every other un-scoped read on that table does (empty
--  app.tenant_id -> uuid cast error). This is inherently a cross-tenant
--  admin check, so — same pattern as automation_due_runs() /
--  sending_orphaned_campaigns() / billing_expired_trials() — it goes
--  through a SECURITY DEFINER function instead.
-- ============================================================

CREATE OR REPLACE FUNCTION billing_plan_usage_counts(p_plan_id uuid)
  RETURNS TABLE (
    tenant_count bigint,
    subscription_count bigint
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM tenants WHERE plan_id = p_plan_id) AS tenant_count,
    (SELECT count(*) FROM subscriptions WHERE plan_id = p_plan_id) AS subscription_count
$$;

REVOKE ALL ON FUNCTION billing_plan_usage_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_plan_usage_counts(uuid) TO app_user;
