import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { encryptSecret } from '../src/common/utils/crypto.util';

/**
 * Seeds ONE dev sending server using the 'log' provider, so the Sending Engine
 * has an active server to attach to email_jobs. 'log' means no real SMTP — the
 * MailerService logs instead of sending (set MAIL_TRANSPORT=smtp + real creds
 * to actually deliver). Run: npx tsx prisma/seed-sending.ts
 *
 * Uses DATABASE_URL (superuser) — sending_servers has no tenant_id / RLS.
 */
async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.sendingServer.findFirst({
    where: { name: 'Dev Log Server' },
  });
  if (existing) {
    console.log('Dev Log Server already exists — skipping.');
    await prisma.$disconnect();
    return;
  }

  const server = await prisma.sendingServer.create({
    data: {
      name: 'Dev Log Server',
      provider: 'log',
      encryptedCredentials: encryptSecret('{}'),
      isActive: true,
    },
  });
  console.log(`Seeded sending server: ${server.id} (provider=log)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});