-- ============================================================
--  Step 13 — Tracking & Analytics: SECURITY DEFINER helpers + partition tooling
--
--  NO table structure changes, NEVER re-defines `events` or its views (so it
--  cannot re-trigger the events drift). It only adds functions the tracking
--  pipeline needs to cross RLS from contexts that have no tenant set (public
--  webhooks), a cross-tenant orphan finder, and a helper to pre-create the next
--  monthly events partition so data stops piling into events_default.
--
--  Idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. email_job_lookup_by_id(uuid)
--    Webhooks/pixels/clicks arrive with NO tenant context but email_jobs is
--    RLS-forced. This narrow SECURITY DEFINER function resolves a job by id so
--    the app can then act inside withTenant(tenant_id). (Same pattern as the
--    Step 12 auth/unsubscribe lookups.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION email_job_lookup_by_id(p_id uuid)
  RETURNS TABLE (
    id uuid, tenant_id uuid, campaign_id uuid, contact_id uuid, status text
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, tenant_id, campaign_id, contact_id, status::text
  FROM email_jobs
  WHERE id = p_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION email_job_lookup_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_job_lookup_by_id(uuid) TO app_user;

-- ------------------------------------------------------------
-- 2. email_job_lookup_by_provider(text)
--    Same, but keyed by the ESP's message id (email_jobs.provider_message_id),
--    which is how SES/webhook events correlate back to a job.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION email_job_lookup_by_provider(p_msg text)
  RETURNS TABLE (
    id uuid, tenant_id uuid, campaign_id uuid, contact_id uuid, status text
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, tenant_id, campaign_id, contact_id, status::text
  FROM email_jobs
  WHERE provider_message_id = p_msg
  ORDER BY created_at DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION email_job_lookup_by_provider(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_job_lookup_by_provider(text) TO app_user;

-- ------------------------------------------------------------
-- 3. sending_orphaned_campaigns(int)
--    Cross-tenant finder for the reconciliation watchdog: campaigns stuck in
--    'sending' older than p_minutes with NO email_jobs still queued/sending.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sending_orphaned_campaigns(p_minutes int)
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.tenant_id
  FROM campaigns c
  WHERE c.status = 'sending'
    AND c.deleted_at IS NULL
    AND c.updated_at < now() - make_interval(mins => p_minutes)
    AND NOT EXISTS (
      SELECT 1 FROM email_jobs j
      WHERE j.campaign_id = c.id
        AND j.status IN ('queued','sending')
    )
$$;
REVOKE ALL ON FUNCTION sending_orphaned_campaigns(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sending_orphaned_campaigns(int) TO app_user;

-- ------------------------------------------------------------
-- 4. ensure_events_partition(date)
--    Creates the monthly events partition covering the given date if missing,
--    so events stop landing in events_default. Call it monthly (or on boot).
--    Owner = postgres; app_user may EXECUTE.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_events_partition(p_when date DEFAULT now()::date)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  start_date date := date_trunc('month', p_when)::date;
  end_date   date := (date_trunc('month', p_when) + interval '1 month')::date;
  part_name  text := format('events_%s', to_char(start_date, 'YYYY_MM'));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
      part_name, start_date, end_date
    );
  END IF;
END $$;
REVOKE ALL ON FUNCTION ensure_events_partition(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_events_partition(date) TO app_user;

-- Pre-create the next two months so nothing falls into events_default soon.
SELECT ensure_events_partition((now() + interval '1 month')::date);
SELECT ensure_events_partition((now() + interval '2 month')::date);