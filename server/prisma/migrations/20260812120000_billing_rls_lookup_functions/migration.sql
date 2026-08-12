-- ============================================================
--  Billing RLS-bypass lookups (fixes signup / webhook processing)
--
--  `subscriptions` and `payment_transactions` are under FORCE ROW LEVEL
--  SECURITY (tenant_id = app.tenant_id). Two call sites legitimately need
--  to find a row WITHOUT knowing the tenant up front, exactly like
--  auth_find_user_by_email / unsubscribe_lookup already do for their
--  own pre-tenant-context lookups:
--
--   1. Razorpay webhooks arrive keyed by Razorpay's own subscription id
--      (providerSubId) / payment id (providerTxnId) â we don't know which
--      tenant a given webhook belongs to until we've looked up the
--      subscription row itself.
--
--  These SECURITY DEFINER functions expose only what's needed to resolve
--  the tenant and proceed; every WRITE after that still happens inside
--  withTenant(tenantId, ...), same as everywhere else.
-- ============================================================

CREATE OR REPLACE FUNCTION billing_subscription_lookup_by_provider_id(p_provider_sub_id text)
  RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    plan_id uuid
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id, tenant_id, plan_id
  FROM subscriptions
  WHERE provider_sub_id = p_provider_sub_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION billing_payment_txn_exists(p_provider_txn_id text)
  RETURNS TABLE (
    id uuid
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id
  FROM payment_transactions
  WHERE provider_txn_id = p_provider_txn_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION billing_subscription_lookup_by_provider_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing_payment_txn_exists(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION billing_subscription_lookup_by_provider_id(text) TO app_user;
GRANT EXECUTE ON FUNCTION billing_payment_txn_exists(text) TO app_user;
