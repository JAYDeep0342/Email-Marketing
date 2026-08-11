-- ============================================================
--  Step 15 — Automations: scheduler function + re-enrollment guard
--
--  NO table structure changes to existing models; NEVER touches `events`.
--  Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. automation_due_runs(int)
--    The scheduler must see 'running' runs whose next_run_at has arrived ACROSS
--    ALL TENANTS, but app_user is RLS-forced on automation_runs. Narrow
--    SECURITY DEFINER read, same pattern as sending_due_campaigns(). Uses the
--    existing partial index idx_automation_runs_next (WHERE status='running').
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION automation_due_runs(p_limit int)
  RETURNS TABLE (run_id uuid, tenant_id uuid)
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, tenant_id
  FROM automation_runs
  WHERE status = 'running'
    AND next_run_at IS NOT NULL
    AND next_run_at <= now()
  ORDER BY next_run_at ASC
  LIMIT p_limit
$$;
REVOKE ALL ON FUNCTION automation_due_runs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION automation_due_runs(int) TO app_user;

-- ------------------------------------------------------------
-- 2. Re-enrollment guard: at most ONE active ('running') run per
--    (automation, contact). Enforced in the DB so even a race between the
--    trigger listener and a manual enroll cannot create duplicates.
--    Completed/failed/cancelled runs are not covered (re-enrollment, when
--    allowed, is permitted only after the active run ends).
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_active_run
  ON automation_runs (automation_id, contact_id)
  WHERE status = 'running';