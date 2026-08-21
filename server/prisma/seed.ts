import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string, // superuser for seeding
});
const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  ['contact.read', 'View contacts'],
  ['contact.write', 'Create/edit contacts'],
  ['campaign.create', 'Create campaigns'],
  ['campaign.send', 'Send campaigns'],
  ['template.manage', 'Manage templates'],
  ['user.invite', 'Invite team members'],
  ['user.manage', 'Manage team members'],
  ['role.manage', 'Manage roles'],
  ['billing.manage', 'Manage billing'],
  ['settings.manage', 'Manage tenant settings'],
];

const SYSTEM_ROLES = [
  { name: 'Owner', description: 'Full access', perms: 'ALL' },
  {
    name: 'Admin',
    description: 'Manage most things',
    perms: [
      'contact.read', 'contact.write', 'campaign.create', 'campaign.send',
      'template.manage', 'user.invite', 'user.manage', 'settings.manage',
    ],
  },
  {
    name: 'Member',
    description: 'Basic access',
    perms: ['contact.read', 'contact.write', 'campaign.create'],
  },
];

/**
 * The app_user role is created (without a usable password) by migration
 * 20260805110000_app_user_role_and_grants — a migration file is committed to
 * git, so it can't safely hold the real password. This sets it from
 * APP_DATABASE_URL in .env instead, every time seed runs. Idempotent: ALTER
 * ROLE ... WITH PASSWORD is a plain overwrite, safe to re-run.
 */
async function syncAppUserPassword() {
  const appUrl = process.env.APP_DATABASE_URL;
  if (!appUrl) {
    throw new Error(
      'APP_DATABASE_URL is not set — cannot sync the app_user password.',
    );
  }
  const password = new URL(appUrl).password;
  if (!password) {
    throw new Error(
      'APP_DATABASE_URL has no password component — cannot sync app_user.',
    );
  }
  // ALTER ROLE is a utility statement, not DML — it doesn't accept bind
  // parameters, so the value is escaped the standard SQL way (doubled single
  // quotes) instead. Source is our own .env, not user input.
  const escaped = password.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`ALTER ROLE app_user WITH PASSWORD '${escaped}'`);
  console.log('Synced app_user password from APP_DATABASE_URL.');
}

async function main() {
  await syncAppUserPassword();

  console.log('Seeding permissions...');
  for (const [key, description] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  console.log('Seeding system roles...');
  const allPerms = await prisma.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  for (const role of SYSTEM_ROLES) {
    // System roles have tenantId = null. Find existing by name+null.
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM roles WHERE tenant_id IS NULL AND name = ${role.name} LIMIT 1`;

    let roleId: string;
    if (existing.length) {
      roleId = existing[0].id;
    } else {
      const created = await prisma.role.create({
        data: { name: role.name, description: role.description, isSystem: true },
      });
      roleId = created.id;
    }

    const keys =
      role.perms === 'ALL' ? allPerms.map((p) => p.key) : (role.perms as string[]);

    for (const key of keys) {
      const pid = permByKey.get(key);
      if (!pid) continue;
      // idempotent attach
      await prisma.$executeRaw`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${roleId}::uuid, ${pid}::uuid)
        ON CONFLICT DO NOTHING`;
    }
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());