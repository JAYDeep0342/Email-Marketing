# Step 16A â Billing module: integration notes

Unlike previous modules, Billing has **cross-module touch points**. Read all
of these before wiring â a missed step means a silent regression somewhere
else in the app.

## 1. Wire the module in `AppModule`

```ts
import { BillingModule } from './modules/billing/billing.module';

// ...in @Module({ imports: [...
BillingModule,
```

## 2. Raw body for Razorpay webhook (CRITICAL)

Razorpay signs the raw HTTP body. Nest's default JSON parser destroys the
raw bytes â signature verification will silently fail on every event.

Edit `src/main.ts`:

```ts
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // BEFORE app.useGlobalPipes / any other body-parsing middleware:
  app.use(
    '/api/billing/webhooks/razorpay',
    bodyParser.raw({ type: '*/*', limit: '1mb' }),
  );

  // ...rest of bootstrap
}
```

Path must exactly match what's mounted (`/api` prefix + `billing/webhooks/razorpay`).

## 3. Signup flow â start the trial

`AuthService.signup()` (or whatever creates the Tenant + first User) needs
to call `SubscriptionsService.startTrial(tenantId)` **AFTER** the tenant is
created and committed. Import the service in AuthModule via BillingModule's
export.

```ts
// AuthModule
imports: [BillingModule /* ... */]

// AuthService
constructor(
  private readonly subscriptions: SubscriptionsService,
  // ...
) {}

async signup(dto: SignupDto) {
  // ... create tenant, first user, etc.
  await this.subscriptions.startTrial(tenant.id);
  // continue
}
```

`startTrial` is idempotent (safe to call twice) and returns `null` gracefully
if no plans are seeded yet.

## 4. Email processor â record usage

Every successful send should increment `emails_day` + `emails_month`. In
`EmailProcessor.process()`, after the tx2 that marks the job `sent`, add:

```ts
// Inject BillingUsageService via BillingModule export
await this.billingUsage.recordEmailSent(tenantId);
```

Place it OUTSIDE the tx (a failed usage bump shouldn't roll back a
successful send).

`SendingModule` will need to import `BillingModule` for this. No circular
dep â Billing doesn't depend on Sending.

## 5. Guard registration is AUTOMATIC

`BillingModule` registers `PlanGatingGuard` via `APP_GUARD`. It runs on
EVERY route globally, but no-ops on routes without `@CheckQuota` /
`@RequiresFeature`. No opt-in needed at the controller level.

Placement in the guard chain: it runs AFTER JwtAuthGuard (guards execute
in registration order). Verify by hitting a `@CheckQuota` route without
a JWT â you should still get 401, not the billing 403.

## 6. Where to add gating decorators (Phase 16A wiring â DO THIS)

Add the following in each module. These are the release-blocking gates:

**`contacts.controller.ts`** â creating a contact:
```ts
@CheckQuota('contacts')
@Post()
create(...) { ... }
```

**`contacts.service.ts` â `import()` method:**
The bulk import doesn't go through the controller-level guard for each
row. Add a manual check at the top of `import()`:
```ts
// Rough check â refuses the whole batch if it would blow the cap
```
For 16A, skip this â the controller-level guard on `POST /contacts` covers
the interactive case, and bulk import can wait for 16B.

**`campaigns.controller.ts`** â sending a campaign:
```ts
@CheckQuota('emails_month')  // NOTE: unit=1 here checks "can we send at all
                             // this month", not the exact recipient count.
                             // Full recipient-count check comes in 16B via
                             // a dynamic unit resolver.
@Post(':id/send')
send(...) { ... }
```

Also add `@CheckQuota('campaigns')` on `POST /campaigns` (create).

**`lists.controller.ts`, `automations.controller.ts`** â same pattern on
their `POST` routes.

**AI Suite (Step 18, later):**
```ts
@RequiresFeature('aiEnabled')
```

## 7. Seed the placeholder data

```bash
npx tsx prisma/seed/billing.seed.ts
```

Creates INR currency, 3 placeholder plans (Starter/Pro/Business â see file
for values), and a Razorpay `payment_gateways` row with STUB creds. Replace
the creds before any real webhook activity.

## 8. Razorpay dashboard setup (manual, one-time)

Do these in Razorpay's dashboard, then paste the values into your DB:

1. **Create Plans**: Dashboard â Subscriptions â Plans â Create Plan. Match
   your local plan's `priceCents` / `billingPeriod`. Copy the Razorpay
   Plan ID (`plan_XXXX`).
2. **Set `razorpay.plan_map`**:
   ```sql
   INSERT INTO platform_settings (id, key, value, updated_at)
   VALUES (
     gen_random_uuid(),
     'razorpay.plan_map',
     '{"<yourPlanUuid>": "plan_XXXX"}'::jsonb,
     NOW()
   )
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   ```
3. **Webhook**: Dashboard â Settings â Webhooks â Add. URL:
   `https://<yourhost>/api/billing/webhooks/razorpay`. Events to subscribe:
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.pending`
   - `subscription.halted`
   - `subscription.cancelled`
   - `subscription.completed`
   - `payment.failed`

   Copy the webhook secret into `payment_gateways.encrypted_credentials`
   under `webhookSecret`.

## 9. Endpoints added

```
Public (no auth):
  GET  /api/plans                            list active plans
  GET  /api/plans/:id                        plan details
  POST /api/billing/webhooks/razorpay        Razorpay webhook

Tenant (JWT):
  GET  /api/billing/subscription             current subscription
  POST /api/billing/subscription/checkout    -> Razorpay checkout URL
  POST /api/billing/subscription/cancel      cancel current

Admin (JWT â temporary; move to super-admin in Step 20):
  GET    /api/admin/plans
  POST   /api/admin/plans
  PATCH  /api/admin/plans/:id
  DELETE /api/admin/plans/:id
```

## 10. What's intentionally NOT in Phase 16A (deferred to 16B)

- Coupons + redemption at checkout
- Prorated upgrades / downgrades mid-period
- Invoice PDF rendering from InvoiceTemplate
- Tax calculation via TaxSetting (Razorpay handles GST for now)
- CreditWallet + CreditLedger (pay-as-you-go top-ups)
- Recipient-count-aware quota check on campaign send
- Grace-period soft warnings at 80% usage

Ship 16A, verify, then decide which of these move to 16B based on real
usage patterns.

## 11. Gotchas that will bite in verification

1. **`Tenant.planId` and `Subscription.planId` drift** â only ever change
   both through `applyEffectivePlan()`. If a QA report shows a tenant with
   an active subscription but a null `tenant.planId`, that's a bug in
   whatever code path skipped the helper.
2. **Guard vs. no-auth routes** â the guard reads `request.tenantId`. On
   a `@Public()` route (e.g. signup) that field is absent, so the guard
   passes. Do NOT add `@CheckQuota` to a public route â it would silently
   no-op.
3. **Webhook signature verification depends on `main.ts`** â if the raw
   body middleware isn't attached, every event is dropped with a WARN.
   Verify by hitting the endpoint with a known-bad signature and looking
   for the exact log line.
4. **Trial watchdog runs hourly** â for verification, either wait, or
   temporarily set `intervalMs` shorter, or call `.tick()` directly from
   a debug endpoint.
