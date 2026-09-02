/**
 * Seed script for Billing (Step 16A).
 *
 * Creates:
 *   - INR Currency (idempotent)
 *   - 3 placeholder plans (Starter / Pro / Business) â prices/limits chosen
 *     as sensible defaults; super admin will override via /admin/plans.
 *   - Razorpay PaymentGateway ROW with a stub encrypted-creds blob so the
 *     server boots. The stub creds will make Razorpay calls fail (503) â
 *     that's fine until real creds are entered via the super-admin API.
 *
 * Idempotent â safe to run multiple times. Uses `code` / `provider` as the
 * dedupe key.
 *
 * Run: npx tsx prisma/seed/billing.seed.ts
 */
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { encryptSecret } from '../../src/common/utils/crypto.util';

// Prisma 7 requires a driver adapter — same pattern as prisma/seed.ts.
// DATABASE_URL (not APP_DATABASE_URL) since seeding runs as the superuser,
// same convention as the other seed scripts.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // ---- Currency: INR ----
  const inr = await prisma.currency.upsert({
    where: { code: 'INR' },
    update: {},
    create: {
      code: 'INR',
      symbol: '₹',
      name: 'Indian Rupee',
      isBase: true,
      isActive: true,
    },
  });
  console.log('â Currency:', inr.code);

  // ---- Plans (placeholder â super admin can rename/reprice via API) ----
  const plans = [
    {
      code: 'starter',
      name: 'Starter',
      priceCents: 99900, // â¹999
      limits: {
        maxContacts: 5_000,
        maxLists: 10,
        maxEmailsMonth: 25_000,
        maxEmailsDay: 2_000,
        maxUsers: 2,
        maxCampaigns: 50,
        maxAutomations: 10,
        dedicatedIp: false,
        aiEnabled: false,
      },
    },
    {
      code: 'pro',
      name: 'Pro',
      priceCents: 299900, // â¹2,999
      limits: {
        maxContacts: 25_000,
        maxLists: 50,
        maxEmailsMonth: 100_000,
        maxEmailsDay: 10_000,
        maxUsers: 5,
        maxCampaigns: 200,
        maxAutomations: 50,
        dedicatedIp: false,
        aiEnabled: true,
      },
    },
    {
      code: 'business',
      name: 'Business',
      priceCents: 999900, // â¹9,999
      limits: {
        maxContacts: 100_000,
        maxLists: null, // unlimited
        maxEmailsMonth: 500_000,
        maxEmailsDay: 50_000,
        maxUsers: 20,
        maxCampaigns: null,
        maxAutomations: null,
        dedicatedIp: true,
        aiEnabled: true,
      },
    },
  ];

  for (const p of plans) {
    const existing = await prisma.plan.findUnique({ where: { code: p.code } });
    if (existing) {
      console.log(`â©ï¸  Plan already exists: ${p.code}`);
      continue;
    }
    const plan = await prisma.plan.create({
      data: {
        name: p.name,
        code: p.code,
        priceCents: p.priceCents,
        currencyId: inr.id,
        billingPeriod: 'monthly',
        planType: 'general',
        isActive: true,
      },
    });
    await prisma.planLimit.create({
      data: { planId: plan.id, ...p.limits },
    });
    console.log(`â Plan created: ${p.code} (â¹${p.priceCents / 100})`);
  }

  // ---- Razorpay PaymentGateway (stub) ----
  const existingGateway = await prisma.paymentGateway.findFirst({
    where: { provider: 'razorpay' },
  });
  if (!existingGateway) {
    // Stub creds â replace via `PATCH /admin/payment-gateways/:id` (Step 20)
    // or by manually updating the encrypted_credentials column.
    const stubCreds = JSON.stringify({
      keyId: 'rzp_test_REPLACE_ME',
      keySecret: 'REPLACE_ME',
      webhookSecret: 'REPLACE_ME',
    });
    await prisma.paymentGateway.create({
      data: {
        provider: 'razorpay',
        displayName: 'Razorpay',
        encryptedCredentials: encryptSecret(stubCreds),
        isActive: true,
        isDefault: true,
      },
    });
    console.log('â Razorpay gateway row created (STUB CREDS â replace before use)');
  } else {
    console.log('â©ï¸  Razorpay gateway already exists');
  }

  console.log('\nDone. Next steps:');
  console.log('  1. Replace Razorpay stub creds with real ones');
  console.log(
    '  2. Set platform_settings.key=razorpay.plan_map to {"<ourPlanId>":"<rzpPlanId>"}',
  );
  console.log('  3. Add webhook endpoint in Razorpay dashboard:');
  console.log('     https://<yourhost>/api/billing/webhooks/razorpay');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
