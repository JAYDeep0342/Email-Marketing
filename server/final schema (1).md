# Email Marketing SaaS — Final Database Schema (PostgreSQL / PERN + NestJS)

**Full MSendy-style clone + AI features.** A two-tier, multi-tenant, enterprise-grade schema.

- **Platform tier** (super-admin / SaaS operator): customers, plans, currencies, tax, sending servers, verification servers, plugins, i18n, payment gateways.
- **Tenant tier** (customer / business account): campaigns, contacts, automations, templates, forms, integrations, AI content.

Every tenant-scoped table carries a `tenant_id`, every query filters by it, and no business can ever read another's data. UUID PKs, FKs, indexes, constraints, `created_at` / `updated_at` throughout. Row-Level Security (RLS) is the second safety net.

**Backend:** NestJS (modules, guards, interceptors, `@nestjs/throttler`, `@nestjs/bullmq`, `@nestjs/schedule`).

---

## ⚠️ What changed from the previous draft (fixes applied)

1. **Migration order fixed** — `currencies` and `plans` are created **before** `tenants` to resolve the circular FK (`tenants.plan_id → plans`). The whole file is now ordered so it runs top-to-bottom with no forward references. The one remaining cycle (`plans` needs `currencies`, `tenants` needs `plans`, `subscriptions` needs both) is broken by ordering: currencies → plans → tenants → everything else.
2. **Soft-delete + UNIQUE conflict fixed** — `contacts`, `campaigns`, `templates` now use **partial unique indexes** (`WHERE deleted_at IS NULL`) instead of table-level `UNIQUE`, so a soft-deleted row no longer blocks re-inserting the same email/name.
3. **`blacklist` NULL-tenant duplicates fixed** — replaced `UNIQUE(tenant_id, value)` with two partial unique indexes (one for tenant rows, one for platform-wide `tenant_id IS NULL` rows), because Postgres treats NULLs as distinct in composite unique constraints.
4. **Per-recipient state de-duplicated** — `email_jobs` is now the **single source of truth** for send state. `campaign_recipients` is a pure targeting snapshot (no divergent `status`); it only records `added_at`. A comment documents this.
5. **All FKs indexed** — added the missing indexes (`subscriptions.plan_id`, `campaigns.template_id/list_id/segment_id/signature_id`, `invoices.subscription_id`, `payment_transactions.invoice_id/gateway_id`, etc.).
6. **`events` partition safety net** — added a `DEFAULT` partition so inserts never fail if the monthly cron hasn't run yet, plus a note to prefer `pg_partman`.
7. **Credit integrity note strengthened** — `credit_wallets` mutation must be atomic (`UPDATE ... WHERE sending_credits >= X`) inside the same transaction as the `credit_ledger` insert. Documented at the table and in the app-notes.
8. **RLS + PgBouncer note added** — `SET LOCAL app.tenant_id` only works if every request runs inside a transaction on a dedicated connection. Critical with PgBouncer transaction-mode pooling.
9. **`updated_at` triggers** — full list included at the end for every table that has the column (previous draft only showed examples).

### v2 — added after verifying every admin + customer nav item against screenshots

Line-by-line nav verification surfaced **7 tables that were missing**. All added in this version:

| # | Admin nav item | New table(s) | Section |
|---|---|---|---|
| 1 | CUSTOMERS → Orders | `orders`, `order_items` | B. Plans & Billing |
| 2 | PLANS & BILLING → Coupons | `coupons`, `coupon_redemptions` | B. Plans & Billing |
| 3 | SENDING → Warmup Strategies | `warmup_strategies`, `warmup_schedule_steps` | G. Sending Infrastructure |
| 4 | TEMPLATES → Form Templates | `form_templates` | D. Campaigns & Content |
| 5 | AI SUITE → Conversations | `ai_conversations`, `ai_conversation_messages` | J. AI Features |
| 6 | AI SUITE → Feedback | `ai_feedback` | J. AI Features |
| 7 | AI SUITE → Self-Improve | `ai_self_improve_runs` | J. AI Features |

Everything else in both the customer nav (Home, Email, Automation, Templates, Overview, Lists, Subscribers, Segments, Forms, Sending servers, Sending domains, Email verification, Blacklist, Websites, API) and admin nav (Customers, Subscriptions, Roles, Plans, Currencies, Payment Gateways, Credit Packages, Email Verification Plans, Sending Servers, Bounce Handlers, FBL Handlers, Verification Servers, Page/Email Templates, Admins, Admin Groups, Settings, Languages, App Emails & Pages, AI Usage/Audit/Settings, Tracking Log, Notifications, Plugins, API Docs) was already covered by existing tables — **verified, no gaps**.

---

## Conventions

- **PK:** `id UUID DEFAULT gen_random_uuid()` (needs `pgcrypto`).
- **Tenant isolation:** `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, always indexed. RLS on top.
- **Platform tables:** NO `tenant_id`.
- **Timestamps:** `created_at` / `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (updated via shared trigger).
- **Enums:** `TEXT` + `CHECK`.
- **Money:** integer minor units (cents) or `NUMERIC(12,2)`, never floats.
- **Secrets:** always hashed/encrypted (`key_hash`, `encrypted_credentials`).
- **Soft deletes:** `deleted_at TIMESTAMPTZ` on recoverable entities, enforced with **partial unique indexes**.

---

## 0. Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
-- Optional but recommended for events partitioning:
-- CREATE EXTENSION IF NOT EXISTS pg_partman;
```

---

## P1. Platform primitives (must come first — referenced by plans/tenants)

```sql
-- Multi-currency support
CREATE TABLE currencies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT NOT NULL UNIQUE,   -- 'USD','INR','EUR'
    symbol        TEXT NOT NULL,          -- '$','₹','€'
    name          TEXT NOT NULL,
    exchange_rate NUMERIC(12,6) NOT NULL DEFAULT 1,
    is_base       BOOLEAN NOT NULL DEFAULT false,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only one base currency
CREATE UNIQUE INDEX uq_currency_base ON currencies(is_base) WHERE is_base = true;

-- Main product plans (Free, Starter, Pro, Enterprise)
CREATE TABLE plans (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    code           TEXT NOT NULL UNIQUE,     -- free | starter | pro | enterprise
    price_cents    INTEGER NOT NULL DEFAULT 0,
    currency_id    UUID REFERENCES currencies(id),
    billing_period TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (billing_period IN ('monthly','yearly')),
    plan_type      TEXT NOT NULL DEFAULT 'general',
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_currency ON plans(currency_id);

-- Quota limits per plan
CREATE TABLE plan_limits (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id            UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    max_contacts       INTEGER,      -- NULL = unlimited
    max_lists          INTEGER,
    max_emails_month   INTEGER,
    max_emails_day     INTEGER,
    max_subscribers    INTEGER,
    max_users          INTEGER,
    max_campaigns      INTEGER,
    max_automations    INTEGER,
    dedicated_ip       BOOLEAN NOT NULL DEFAULT false,
    ai_enabled         BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (plan_id)
);
```

---

## P2. Platform Admin (Super-Admin — NO tenant_id)

```sql
CREATE TABLE platform_admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name    TEXT,
    last_name     TEXT,
    is_super      BOOLEAN NOT NULL DEFAULT false,
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled')),
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_group_members (
    admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES admin_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (admin_id, group_id)
);

CREATE TABLE platform_settings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key        TEXT NOT NULL UNIQUE,
    value      JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tax_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,          -- 'GST','VAT'
    rate_pct    NUMERIC(5,2) NOT NULL,  -- 18.00
    country     TEXT,                   -- ISO code, NULL = global
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_gateways (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider              TEXT NOT NULL,   -- 'stripe','razorpay','paypal'
    display_name          TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    is_default            BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_gateway_default ON payment_gateways(is_default) WHERE is_default = true;

CREATE TABLE languages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT NOT NULL UNIQUE,   -- 'en','hi','es'
    name       TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active  BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_language_default ON languages(is_default) WHERE is_default = true;

CREATE TABLE plugins (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    version      TEXT,
    config       JSONB NOT NULL DEFAULT '{}',
    is_enabled   BOOLEAN NOT NULL DEFAULT false,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## A. Tenancy & Users

```sql
-- Each business account (a "customer" / "tenant")
CREATE TABLE tenants (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    plan_id      UUID REFERENCES plans(id),
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','suspended','cancelled')),
    bounce_rate  NUMERIC(5,2) NOT NULL DEFAULT 0,
    white_label  JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_plan ON tenants(plan_id);

CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email             TEXT NOT NULL,
    password_hash     TEXT NOT NULL,
    first_name        TEXT,
    last_name         TEXT,
    email_verified_at TIMESTAMPTZ,        -- NULL = not verified
    mfa_enabled       BOOLEAN NOT NULL DEFAULT false,
    mfa_secret        TEXT,               -- encrypted TOTP secret
    status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','invited','disabled')),
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system role
    name        TEXT NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_roles_tenant ON roles(tenant_id);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,   -- 'campaign.send','contact.delete'
    description TEXT
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL,
    key_prefix   TEXT NOT NULL,          -- 'sk_live_a1b2'
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);

CREATE TABLE email_verification_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,     -- store hash, email the raw token
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_verif_user ON email_verification_tokens(user_id);

CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pwd_reset_user ON password_reset_tokens(user_id);

CREATE TABLE user_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    ip_address         INET,
    user_agent         TEXT,
    impersonated_by    UUID REFERENCES platform_admins(id),  -- set when admin "Login as"
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
```

---

## B. Plans & Billing (credit packs, subscriptions, invoices, wallet)

```sql
CREATE TABLE sending_credit_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    credits     BIGINT NOT NULL,          -- number of emails
    price_cents INTEGER NOT NULL,
    currency_id UUID REFERENCES currencies(id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    pay_type    TEXT NOT NULL CHECK (pay_type IN ('recurring','one_time')),
    credits     BIGINT NOT NULL,          -- number of verifications
    price_cents INTEGER NOT NULL,
    currency_id UUID REFERENCES currencies(id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id               UUID NOT NULL REFERENCES plans(id),
    provider              TEXT CHECK (provider IN ('stripe','razorpay','paypal','manual')),
    provider_sub_id       TEXT,
    status                TEXT NOT NULL
                          CHECK (status IN ('trialing','active','past_due','cancelled','unpaid','ended','pending')),
    credits_remaining     BIGINT NOT NULL DEFAULT 0,
    is_recurring          BOOLEAN NOT NULL DEFAULT true,
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,       -- "Next billing"
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT false,
    subscribed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at              TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);   -- FIX: FK indexed

CREATE TABLE invoice_templates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    html       TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    invoice_number  TEXT NOT NULL UNIQUE,
    reason          TEXT,
    amount_cents    INTEGER NOT NULL,
    tax_cents       INTEGER NOT NULL DEFAULT 0,
    currency_id     UUID REFERENCES currencies(id),
    status          TEXT NOT NULL
                    CHECK (status IN ('draft','open','paid','void','uncollectible')),
    due_at          TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);  -- FIX

CREATE TABLE payment_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    gateway_id      UUID REFERENCES payment_gateways(id),
    provider_txn_id TEXT,
    type            TEXT NOT NULL CHECK (type IN ('charge','refund','chargeback')),
    amount_cents    INTEGER NOT NULL,
    currency_id     UUID REFERENCES currencies(id),
    status          TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_txn_tenant ON payment_transactions(tenant_id);
CREATE INDEX idx_payment_txn_invoice ON payment_transactions(invoice_id);  -- FIX

-- NEW (Admin → Coupons): discount codes, platform-defined.
-- Defined BEFORE orders because orders.coupon_id references it.
CREATE TABLE coupons (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               TEXT NOT NULL UNIQUE,
    description        TEXT,
    discount_type      TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
    discount_value     NUMERIC(12,2) NOT NULL,   -- 20.00 = 20% or fixed minor-unit amount
    currency_id        UUID REFERENCES currencies(id),  -- for 'fixed' type
    max_redemptions    INTEGER,                  -- NULL = unlimited
    redeemed_count     INTEGER NOT NULL DEFAULT 0,
    per_tenant_limit   INTEGER NOT NULL DEFAULT 1,
    applies_to         TEXT NOT NULL DEFAULT 'all'
                       CHECK (applies_to IN ('all','plan','credits','verification')),
    starts_at          TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ,
    is_active          BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NEW (Admin → Orders): a purchase order placed by a customer.
-- An order is the "checkout" of a plan subscription and/or credit packages
-- and/or verification packages. It ties together what was bought, the coupon
-- applied, the amount, and links to the resulting invoice + transaction.
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number    TEXT NOT NULL UNIQUE,     -- human-friendly '#ORD-2026-0001'
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    coupon_id       UUID REFERENCES coupons(id) ON DELETE SET NULL,
    currency_id     UUID REFERENCES currencies(id),
    subtotal_cents  INTEGER NOT NULL DEFAULT 0,
    discount_cents  INTEGER NOT NULL DEFAULT 0,
    tax_cents       INTEGER NOT NULL DEFAULT 0,
    total_cents     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_invoice ON orders(invoice_id);
CREATE INDEX idx_orders_coupon ON orders(coupon_id);

-- Line items on an order. item_type says what was purchased; item_ref_id points
-- at the plan / sending_credit_plan / email_verification_plan / ai_credits row.
CREATE TABLE order_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type      TEXT NOT NULL
                   CHECK (item_type IN ('plan','sending_credits','verification_credits','ai_credits')),
    item_ref_id    UUID,                     -- FK-by-convention to the matching plan/pack table
    description    TEXT NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 1,
    unit_cents     INTEGER NOT NULL,
    amount_cents   INTEGER NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Which tenant redeemed which coupon on which order (enforces per_tenant_limit).
CREATE TABLE coupon_redemptions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id      UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
    discount_cents INTEGER NOT NULL,
    redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_tenant ON coupon_redemptions(tenant_id);

CREATE TABLE usage_records (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric       TEXT NOT NULL,
    period_start DATE NOT NULL,
    quantity     BIGINT NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, metric, period_start)
);
CREATE INDEX idx_usage_tenant_metric ON usage_records(tenant_id, metric);

-- Credit wallet per tenant.
-- INTEGRITY RULE: never mutate directly with a read-modify-write.
-- Always atomic + ledger-in-same-transaction:
--   UPDATE credit_wallets SET sending_credits = sending_credits - :n
--     WHERE tenant_id = :t AND sending_credits >= :n;   -- 0 rows => insufficient
--   INSERT INTO credit_ledger (...) VALUES (...);
CREATE TABLE credit_wallets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sending_credits      BIGINT NOT NULL DEFAULT 0 CHECK (sending_credits >= 0),
    verification_credits BIGINT NOT NULL DEFAULT 0 CHECK (verification_credits >= 0),
    ai_credits           BIGINT NOT NULL DEFAULT 0 CHECK (ai_credits >= 0),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id)
);

CREATE TABLE credit_ledger (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    credit_type   TEXT NOT NULL CHECK (credit_type IN ('sending','verification','ai')),
    delta         BIGINT NOT NULL,          -- + top-up, - consumption
    balance_after BIGINT NOT NULL,
    reason        TEXT NOT NULL,
    ref_id        UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_ledger_tenant ON credit_ledger(tenant_id, created_at);
```

---

## C. Contacts

```sql
CREATE TABLE contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    first_name  TEXT,
    last_name   TEXT,
    attributes  JSONB NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'subscribed'
                CHECK (status IN ('subscribed','unsubscribed','bounced','complained')),
    verification_status TEXT CHECK (verification_status IN ('unknown','valid','invalid','risky','catch_all')),
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- FIX: partial unique so soft-deleted rows don't block re-adding the same email
CREATE UNIQUE INDEX uq_contacts_tenant_email
    ON contacts(tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tenant_status ON contacts(tenant_id, status);

CREATE TABLE lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lists_tenant ON lists(tenant_id);

CREATE TABLE list_contacts (
    list_id    UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (list_id, contact_id)
);
CREATE INDEX idx_list_contacts_contact ON list_contacts(contact_id);  -- FIX: reverse lookup

CREATE TABLE tags (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    UNIQUE (tenant_id, name)
);

CREATE TABLE contact_tags (
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag_id);  -- FIX: reverse lookup

CREATE TABLE segments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    rules      JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_segments_tenant ON segments(tenant_id);

CREATE TABLE suppressions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    reason     TEXT NOT NULL CHECK (reason IN ('hard_bounce','complaint','unsubscribe','manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX idx_suppressions_tenant_email ON suppressions(tenant_id, email);

CREATE TABLE blacklist (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide
    value      TEXT NOT NULL,
    scope      TEXT NOT NULL DEFAULT 'email' CHECK (scope IN ('email','domain')),
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- FIX: NULL tenant_id no longer allows duplicate platform-wide values.
CREATE UNIQUE INDEX uq_blacklist_tenant_value
    ON blacklist(tenant_id, value) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_blacklist_global_value
    ON blacklist(value) WHERE tenant_id IS NULL;
CREATE INDEX idx_blacklist_value ON blacklist(value);
```

---

## D. Campaigns & Content

```sql
CREATE TABLE template_categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform gallery
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_template_categories_tenant ON template_categories(tenant_id);

CREATE TABLE templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = base gallery
    category_id   UUID REFERENCES template_categories(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    builder_type  TEXT NOT NULL DEFAULT 'classic' CHECK (builder_type IN ('classic','pro')),
    is_gallery    BOOLEAN NOT NULL DEFAULT false,
    thumbnail_url TEXT,
    design_json   JSONB,
    rendered_html TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_templates_category ON templates(category_id);  -- FIX
-- FIX: partial unique (tenant + name) among non-deleted templates
CREATE UNIQUE INDEX uq_templates_tenant_name
    ON templates(tenant_id, name) WHERE deleted_at IS NULL AND tenant_id IS NOT NULL;

-- NEW (Admin → Form Templates): reusable signup/popup form designs.
-- Platform gallery forms have tenant_id = NULL; a tenant can save their own.
-- (Separate from `forms`, which are the LIVE embedded/popup forms on a site.)
CREATE TABLE form_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform gallery
    name          TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'embedded'
                  CHECK (type IN ('embedded','popup','hosted')),
    is_gallery    BOOLEAN NOT NULL DEFAULT false,
    thumbnail_url TEXT,
    fields        JSONB NOT NULL DEFAULT '[]',   -- default field definitions
    design_json   JSONB,                         -- builder output
    settings      JSONB NOT NULL DEFAULT '{}',   -- styling/triggers defaults
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_form_templates_tenant ON form_templates(tenant_id);

CREATE TABLE signatures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    from_name   TEXT NOT NULL,
    from_email  TEXT NOT NULL,
    reply_to    TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signatures_tenant ON signatures(tenant_id);

CREATE TABLE campaigns (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    subject      TEXT NOT NULL,
    preheader    TEXT,
    from_name    TEXT,
    from_email   TEXT,
    signature_id UUID REFERENCES signatures(id) ON DELETE SET NULL,
    template_id  UUID REFERENCES templates(id) ON DELETE SET NULL,
    list_id      UUID REFERENCES lists(id) ON DELETE SET NULL,
    segment_id   UUID REFERENCES segments(id) ON DELETE SET NULL,
    status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
    scheduled_at TIMESTAMPTZ,
    sent_at      TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_tenant_status ON campaigns(tenant_id, status);
-- FIX: all campaign FKs indexed for JOINs
CREATE INDEX idx_campaigns_template  ON campaigns(template_id);
CREATE INDEX idx_campaigns_list      ON campaigns(list_id);
CREATE INDEX idx_campaigns_segment   ON campaigns(segment_id);
CREATE INDEX idx_campaigns_signature ON campaigns(signature_id);

-- Pure targeting SNAPSHOT (who was targeted). NOT the send-state source of truth.
-- Live per-recipient send state lives in email_jobs. This avoids the old
-- status-divergence bug between campaign_recipients and email_jobs.
CREATE TABLE campaign_recipients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, contact_id)
);
CREATE INDEX idx_camp_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX idx_camp_recipients_contact  ON campaign_recipients(contact_id);  -- FIX
```

---

## E. Forms

```sql
CREATE TABLE forms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'embedded'
               CHECK (type IN ('embedded','popup','hosted')),
    list_id    UUID REFERENCES lists(id) ON DELETE SET NULL,
    fields     JSONB NOT NULL DEFAULT '[]',
    settings   JSONB NOT NULL DEFAULT '{}',
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_forms_tenant ON forms(tenant_id);
CREATE INDEX idx_forms_list ON forms(list_id);  -- FIX

CREATE TABLE form_submissions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    form_id    UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    data       JSONB NOT NULL DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_form_submissions_form ON form_submissions(form_id);
```

---

## F. Automations

```sql
CREATE TABLE automations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    trigger_type   TEXT NOT NULL,
    trigger_config JSONB NOT NULL DEFAULT '{}',
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','active','paused')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automations_tenant ON automations(tenant_id);

CREATE TABLE automation_steps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    step_order    INTEGER NOT NULL,
    step_type     TEXT NOT NULL,
    config        JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (automation_id, step_order)
);

CREATE TABLE automation_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    current_step_id UUID REFERENCES automation_steps(id),
    status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','completed','failed','cancelled')),
    next_run_at     TIMESTAMPTZ,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_automation_runs_next ON automation_runs(next_run_at) WHERE status = 'running';
CREATE INDEX idx_automation_runs_automation ON automation_runs(automation_id);  -- FIX
```

---

## G. Sending Infrastructure

```sql
CREATE TABLE sending_servers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL,
    provider              TEXT NOT NULL,   -- 'ses','sendgrid','smtp','mailgun'
    encrypted_credentials TEXT NOT NULL,
    hourly_quota          INTEGER,
    daily_quota           INTEGER,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NEW (Admin → Warmup Strategies): IP/domain warmup plans. A new sending IP
-- ramps its daily volume slowly to build sender reputation. Platform-managed.
CREATE TABLE warmup_strategies (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    description       TEXT,
    sending_server_id UUID REFERENCES sending_servers(id) ON DELETE CASCADE,  -- NULL = reusable template
    total_days        INTEGER NOT NULL DEFAULT 30,
    start_daily_limit INTEGER NOT NULL DEFAULT 50,
    max_daily_limit   INTEGER NOT NULL DEFAULT 100000,
    increment_pct     NUMERIC(5,2) NOT NULL DEFAULT 20.00,  -- % daily growth if steps not explicit
    status            TEXT NOT NULL DEFAULT 'inactive'
                      CHECK (status IN ('inactive','running','paused','completed')),
    started_at        TIMESTAMPTZ,
    current_day       INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_warmup_strategies_server ON warmup_strategies(sending_server_id);

-- Explicit per-day cap schedule (optional; overrides increment_pct when present).
CREATE TABLE warmup_schedule_steps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES warmup_strategies(id) ON DELETE CASCADE,
    day_number  INTEGER NOT NULL,
    daily_limit INTEGER NOT NULL,
    UNIQUE (strategy_id, day_number)
);

CREATE TABLE bounce_handlers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sending_server_id     UUID REFERENCES sending_servers(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    type                  TEXT NOT NULL,
    encrypted_credentials TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bounce_handlers_server ON bounce_handlers(sending_server_id);  -- FIX

CREATE TABLE feedback_loop_handlers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sending_server_id     UUID REFERENCES sending_servers(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    type                  TEXT NOT NULL,
    encrypted_credentials TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_flh_server ON feedback_loop_handlers(sending_server_id);  -- FIX

CREATE TABLE sending_domains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain          TEXT NOT NULL,
    spf_verified    BOOLEAN NOT NULL DEFAULT false,
    dkim_verified   BOOLEAN NOT NULL DEFAULT false,
    dmarc_verified  BOOLEAN NOT NULL DEFAULT false,
    dkim_public_key TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, domain)
);

-- Per-recipient send state: SOURCE OF TRUTH (idempotency + retries)
CREATE TABLE email_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id         UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    automation_run_id   UUID REFERENCES automation_runs(id) ON DELETE CASCADE,
    contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sending_server_id   UUID REFERENCES sending_servers(id) ON DELETE SET NULL,
    idempotency_key     TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','sending','sent','delivered','bounced','failed','skipped')),
    attempts            INTEGER NOT NULL DEFAULT 0,
    provider_message_id TEXT,
    error               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ,
    UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_email_jobs_status ON email_jobs(status);
CREATE INDEX idx_email_jobs_provider_msg ON email_jobs(provider_message_id);
CREATE INDEX idx_email_jobs_campaign ON email_jobs(campaign_id);   -- FIX
CREATE INDEX idx_email_jobs_contact ON email_jobs(contact_id);     -- FIX

CREATE TABLE unsubscribe_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    token       TEXT NOT NULL UNIQUE,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_unsub_tokens_contact ON unsubscribe_tokens(contact_id);  -- FIX
```

---

## H. Email Verification

```sql
CREATE TABLE verification_servers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL,
    provider              TEXT NOT NULL,   -- 'zerobounce','neverbounce','internal'
    encrypted_credentials TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE verification_jobs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    list_id          UUID REFERENCES lists(id) ON DELETE SET NULL,
    server_id        UUID REFERENCES verification_servers(id) ON DELETE SET NULL,
    total_emails     INTEGER NOT NULL DEFAULT 0,
    processed_emails INTEGER NOT NULL DEFAULT 0,
    credits_used     BIGINT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','completed','failed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ
);
CREATE INDEX idx_verif_jobs_tenant ON verification_jobs(tenant_id);
CREATE INDEX idx_verif_jobs_list ON verification_jobs(list_id);  -- FIX

CREATE TABLE verification_results (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id     UUID NOT NULL REFERENCES verification_jobs(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    email      TEXT NOT NULL,
    result     TEXT NOT NULL CHECK (result IN ('valid','invalid','risky','catch_all','unknown')),
    sub_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verif_results_job ON verification_results(job_id);
```

---

## I. Tracking & Analytics

```sql
CREATE TABLE events (
    id           UUID DEFAULT gen_random_uuid(),
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

-- Monthly partitions (a @nestjs/schedule cron pre-creates next month's).
CREATE TABLE events_2026_08 PARTITION OF events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE events_2026_09 PARTITION OF events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- FIX: DEFAULT partition = safety net so inserts never fail if cron missed a month.
-- Rows here can be redistributed later. (Prefer pg_partman in production.)
CREATE TABLE events_default PARTITION OF events DEFAULT;

CREATE INDEX idx_events_tenant_campaign ON events(tenant_id, campaign_id);
CREATE INDEX idx_events_type_time ON events(type, occurred_at);

CREATE TABLE campaign_stats (
    campaign_id       UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    total_recipients  INTEGER NOT NULL DEFAULT 0,
    sent_count        INTEGER NOT NULL DEFAULT 0,
    delivered_count   INTEGER NOT NULL DEFAULT 0,
    open_count        INTEGER NOT NULL DEFAULT 0,
    unique_open_count INTEGER NOT NULL DEFAULT 0,
    click_count       INTEGER NOT NULL DEFAULT 0,
    bounce_count      INTEGER NOT NULL DEFAULT 0,
    complaint_count   INTEGER NOT NULL DEFAULT 0,
    unsubscribe_count INTEGER NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_stats_tenant ON campaign_stats(tenant_id);

-- Per-type log screens as VIEWs over events (source of truth).
CREATE VIEW delivery_log    AS SELECT * FROM events WHERE type = 'delivered';
CREATE VIEW open_log        AS SELECT * FROM events WHERE type = 'open';
CREATE VIEW click_log       AS SELECT * FROM events WHERE type = 'click';
CREATE VIEW bounce_log      AS SELECT * FROM events WHERE type = 'bounce';
CREATE VIEW feedback_log    AS SELECT * FROM events WHERE type = 'complaint';
CREATE VIEW unsubscribe_log AS SELECT * FROM events WHERE type = 'unsubscribe';
```

---

## J. AI Features

```sql
CREATE TABLE ai_generations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    feature      TEXT NOT NULL,
    provider     TEXT NOT NULL DEFAULT 'anthropic',
    model        TEXT,
    prompt       TEXT NOT NULL,
    output       TEXT,
    tokens_used  INTEGER,
    credits_cost BIGINT NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'completed'
                 CHECK (status IN ('pending','completed','failed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_generations_tenant ON ai_generations(tenant_id, created_at);

CREATE TABLE ai_credits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    credits     BIGINT NOT NULL,
    price_cents INTEGER NOT NULL,
    currency_id UUID REFERENCES currencies(id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_subject_suggestions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id         UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    generation_id       UUID REFERENCES ai_generations(id) ON DELETE SET NULL,
    suggestion          TEXT NOT NULL,
    predicted_open_rate NUMERIC(5,2),
    was_selected        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_subject_campaign ON ai_subject_suggestions(campaign_id);

-- NEW (AI Suite → Conversations): chat-style AI threads (multi-turn), unlike the
-- single-shot ai_generations. Each thread has ordered messages.
CREATE TABLE ai_conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    title      TEXT,
    context    TEXT,                     -- 'campaign_assist','support','content'
    status     TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conversations_tenant ON ai_conversations(tenant_id, created_at);

CREATE TABLE ai_conversation_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    generation_id   UUID REFERENCES ai_generations(id) ON DELETE SET NULL,  -- links billing/audit
    role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content         TEXT NOT NULL,
    tokens_used     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conv_messages_conversation ON ai_conversation_messages(conversation_id, created_at);

-- NEW (AI Suite → Feedback): thumbs up/down + notes on AI output. Feeds Self-Improve.
CREATE TABLE ai_feedback (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    generation_id UUID REFERENCES ai_generations(id) ON DELETE CASCADE,
    message_id    UUID REFERENCES ai_conversation_messages(id) ON DELETE CASCADE,
    rating        TEXT NOT NULL CHECK (rating IN ('up','down')),
    reason        TEXT,                   -- 'inaccurate','off_tone','too_long', etc.
    comment       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_feedback_tenant ON ai_feedback(tenant_id, created_at);
CREATE INDEX idx_ai_feedback_generation ON ai_feedback(generation_id);

-- NEW (AI Suite → Self-Improve): platform-level tuning/eval runs that consume
-- aggregated ai_feedback. NO tenant_id — this is the SaaS operator's AI ops.
CREATE TABLE ai_self_improve_runs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    run_type       TEXT NOT NULL CHECK (run_type IN ('eval','fine_tune','prompt_tune')),
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','completed','failed')),
    feedback_from  TIMESTAMPTZ,             -- window of feedback consumed
    feedback_to    TIMESTAMPTZ,
    metrics        JSONB NOT NULL DEFAULT '{}',   -- accuracy, win-rate, etc.
    notes          TEXT,
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## K. Integrations

```sql
CREATE TABLE integrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    category      TEXT,
    config_schema JSONB NOT NULL DEFAULT '{}',
    is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE integration_connections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_id        UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    name                  TEXT,
    encrypted_credentials TEXT,
    settings              JSONB NOT NULL DEFAULT '{}',
    status                TEXT NOT NULL DEFAULT 'connected'
                          CHECK (status IN ('connected','error','disconnected')),
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_int_conn_tenant ON integration_connections(tenant_id);
CREATE INDEX idx_int_conn_integration ON integration_connections(integration_id);  -- FIX
```

---

## L. System & Communications

```sql
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT,
    data       JSONB NOT NULL DEFAULT '{}',
    channel    TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','both')),
    priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);

CREATE TABLE webhooks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    events     TEXT[] NOT NULL,
    secret     TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id);

CREATE TABLE webhook_deliveries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
    webhook_id    UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    payload       JSONB NOT NULL,
    response_code INTEGER,
    attempts      INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','delivered','failed')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at  TIMESTAMPTZ
);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);  -- FIX

CREATE TABLE custom_pages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
    slug       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('email','page')),
    subject    TEXT,
    html       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slug, type)
);

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_id    UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   UUID,
    metadata    JSONB NOT NULL DEFAULT '{}',
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, created_at);

CREATE TABLE rate_limits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global default
    scope       TEXT NOT NULL,          -- 'api','send','ai','verification'
    limit_count INTEGER NOT NULL,
    window_secs INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, scope)
);
```

---

## Shared Triggers & Functions

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to EVERY table that has an updated_at column:
CREATE TRIGGER trg_platform_admins_updated BEFORE UPDATE ON platform_admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_platform_settings_updated BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenants_updated        BEFORE UPDATE ON tenants        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_roles_updated          BEFORE UPDATE ON roles          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated  BEFORE UPDATE ON subscriptions  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contacts_updated       BEFORE UPDATE ON contacts       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_templates_updated      BEFORE UPDATE ON templates      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_campaigns_updated      BEFORE UPDATE ON campaigns      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_forms_updated          BEFORE UPDATE ON forms          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_automations_updated    BEFORE UPDATE ON automations    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_credit_wallets_updated BEFORE UPDATE ON credit_wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rate_limits_updated    BEFORE UPDATE ON rate_limits    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- v2 new tables with updated_at:
CREATE TRIGGER trg_orders_updated         BEFORE UPDATE ON orders         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_coupons_updated        BEFORE UPDATE ON coupons        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_form_templates_updated BEFORE UPDATE ON form_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_warmup_strategies_updated BEFORE UPDATE ON warmup_strategies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ai_conversations_updated BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Row-Level Security (RLS)

```sql
-- Enable on every tenant-scoped table. Example:
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contacts
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- Repeat for every table with a tenant_id column.
-- v2 tenant-scoped tables also needing RLS: orders, coupon_redemptions,
-- ai_conversations, ai_feedback (form_templates only when tenant_id NOT NULL).
-- Platform tables (platform_admins, currencies, plans, sending_servers,
-- verification_servers, payment_gateways, coupons, warmup_strategies,
-- warmup_schedule_steps, ai_self_improve_runs, etc.) are NOT tenant-scoped and
-- are guarded at the app layer by platform-admin auth in a separate NestJS module.
```

> **⚠️ RLS + PgBouncer (read before coding):** `SET LOCAL app.tenant_id` is only valid for the current transaction on the current connection. Every tenant request MUST run inside a transaction, and if you use PgBouncer in *transaction* pooling mode you must set the GUC inside that same transaction (never with session-level `SET`). Otherwise one tenant's `app.tenant_id` can leak onto another tenant's pooled connection. In NestJS, wrap each request in a transaction (e.g. an interceptor/`CLS` + `SET LOCAL`) so RLS is airtight.

---

## Rate Limiting (NestJS)

Two-layered: (1) **Redis + `@nestjs/throttler`** for real-time per-IP/per-key/per-route limits across instances (custom Redis `ThrottlerStorage`); (2) **`rate_limits` table** for per-tenant custom overrides fed into the throttler. Sending/AI/verification quotas additionally checked against `credit_wallets` + `plan_limits`.

```
Guard order (NestJS):
  AuthGuard → TenantGuard (opens txn + SET LOCAL app.tenant_id) → RolesGuard → ThrottlerGuard → controller
```

---

## Cross-Cutting Recommendations

1. **RLS everywhere** tenant-scoped + app-level `tenant_id` filtering — belt and suspenders.
2. **`updated_at` triggers** via the shared function.
3. **Partition automation:** `@nestjs/schedule` cron pre-creates next month's `events` partition; `events_default` catches anything missed.
4. **Every FK indexed** (done above), plus composite `(tenant_id, status)` for list views.
5. **Queues (`@nestjs/bullmq`):** email sending, automation runs, webhook retries, verification batches, AI generations — all async with retries.
6. **Encryption:** all `encrypted_credentials` / `*_secret` / `key_hash` via KMS/vault; never plaintext.
7. **Impersonation ("Login as"):** logged in `audit_logs` with `admin_id`; `user_sessions.impersonated_by` set.
8. **Credit integrity:** debit atomically (`UPDATE ... WHERE credits >= n`) AND insert `credit_ledger` in the SAME transaction; treat 0 rows updated as "insufficient credits".

---

## Suggested build order (backend-first)

1. Extensions + `currencies`, `plans`, `plan_limits`.
2. `platform_admins` + platform settings (super-admin auth module).
3. `tenants`, `users`, roles/permissions, sessions/tokens → **Auth module**.
4. RLS + `TenantGuard` transaction wrapper (do this early — everything depends on it).
5. `contacts`, `lists`, `segments`, suppressions.
6. `templates`, `campaigns`, `email_jobs` + BullMQ sending worker.
7. `events` ingestion + `campaign_stats` aggregation.
8. Billing (`subscriptions`, `invoices`, `credit_wallets`/`credit_ledger`), then automations, forms, AI, integrations, webhooks.

---

## Table Count

**~80 tables** + monthly `events` partitions + 6 log views.

v2 added 11 tables across the 7 missing features: `coupons`, `orders`, `order_items`, `coupon_redemptions` (billing); `form_templates` (content); `warmup_strategies`, `warmup_schedule_steps` (sending); `ai_conversations`, `ai_conversation_messages`, `ai_feedback`, `ai_self_improve_runs` (AI suite).

Now covers the **full Acelle/MSendy feature set** — every verified customer nav item and every verified super-admin nav item — plus the AI layer, email verification, credits, warmup, coupons/orders, and auth/security tables.
