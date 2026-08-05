-- ============================================================
--  STEP 4C: RLS + events partitioning + partial unique indexes
-- ============================================================

-- ------------------------------------------------------------
-- PART 1: Partial UNIQUE indexes (Prisma couldn't express these)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX uq_contacts_tenant_email
  ON contacts (tenant_id, email) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_templates_tenant_name
  ON templates (tenant_id, name)
  WHERE deleted_at IS NULL AND tenant_id IS NOT NULL;

CREATE UNIQUE INDEX uq_blacklist_tenant_value
  ON blacklist (tenant_id, value) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_blacklist_global_value
  ON blacklist (value) WHERE tenant_id IS NULL;

CREATE INDEX idx_automation_runs_next
  ON automation_runs (next_run_at) WHERE status = 'running';

CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id) WHERE read_at IS NULL;

CREATE UNIQUE INDEX uq_currency_base    ON currencies (is_base)          WHERE is_base = true;
CREATE UNIQUE INDEX uq_language_default  ON languages  (is_default)       WHERE is_default = true;
CREATE UNIQUE INDEX uq_gateway_default   ON payment_gateways (is_default) WHERE is_default = true;

-- ------------------------------------------------------------
-- PART 2: events -> PARTITIONED table (empty now, safe to drop/recreate)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS events CASCADE;

CREATE TABLE events (
    id           UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    campaign_id  UUID,
    contact_id   UUID,
    email_job_id UUID,
    type         TEXT NOT NULL
                 CHECK (type IN ('sent','delivered','open','click','bounce','complaint','unsubscribe')),
    url          TEXT,
    user_agent   TEXT,
    ip_address   INET,
    meta         JSONB NOT NULL DEFAULT '{}',
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX idx_events_tenant_campaign ON events (tenant_id, campaign_id);
CREATE INDEX idx_events_type_time       ON events (type, occurred_at);

CREATE TABLE events_2026_08 PARTITION OF events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE events_2026_09 PARTITION OF events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE events_default PARTITION OF events DEFAULT;

CREATE VIEW delivery_log    AS SELECT * FROM events WHERE type = 'delivered';
CREATE VIEW open_log        AS SELECT * FROM events WHERE type = 'open';
CREATE VIEW click_log       AS SELECT * FROM events WHERE type = 'click';
CREATE VIEW bounce_log      AS SELECT * FROM events WHERE type = 'bounce';
CREATE VIEW feedback_log    AS SELECT * FROM events WHERE type = 'complaint';
CREATE VIEW unsubscribe_log AS SELECT * FROM events WHERE type = 'unsubscribe';

-- ------------------------------------------------------------
-- PART 3: Row-Level Security on every tenant-scoped table
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users','roles','api_keys',
    'subscriptions','invoices','payment_transactions','orders','coupon_redemptions',
    'usage_records','credit_wallets','credit_ledger',
    'contacts','lists','tags','segments','suppressions','blacklist',
    'template_categories','templates','form_templates','signatures',
    'campaigns','campaign_recipients',
    'forms','form_submissions',
    'automations','automation_steps','automation_runs',
    'sending_domains','email_jobs','unsubscribe_tokens',
    'verification_jobs','verification_results','campaign_stats',
    'ai_generations','ai_subject_suggestions','ai_conversations','ai_feedback',
    'integration_connections','notifications','webhooks','custom_pages',
    'audit_logs','rate_limits'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
    $f$, t);
  END LOOP;
END $$;