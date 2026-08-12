-- ============================================================
--  Trial-expiry watchdog needs to scan ACROSS all tenants for due trials —
--  same shape as automation_due_runs() / sending_orphaned_campaigns() for
--  the automation poller and reconciliation watchdog. Without this,
--  TrialWatchdogService.tick()'s bare `subscription.findMany()` runs under
--  FORCE ROW LEVEL SECURITY with no app.tenant_id set, so it silently
--  matches nothing on every tick — trials would never actually expire.
-- ============================================================

CREATE OR REPLACE FUNCTION billing_expired_trials()
  RETURNS TABLE (
    id uuid,
    tenant_id uuid
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id, tenant_id
  FROM subscriptions
  WHERE status = 'trialing'
    AND current_period_end < now()
$$;

REVOKE ALL ON FUNCTION billing_expired_trials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_expired_trials() TO app_user;
