import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Gallery category (tenantId NULL)
  const existingCat = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM template_categories WHERE tenant_id IS NULL AND name = 'Newsletters' LIMIT 1`;
  let catId: string;
  if (existingCat.length) catId = existingCat[0].id;
  else {
    const cat = await prisma.templateCategory.create({ data: { name: 'Newsletters' } });
    catId = cat.id;
  }

  const galleryTemplates = [
    { name: 'Simple Welcome', html: '<h1>Welcome!</h1><p>Thanks for joining.</p>' },
    { name: 'Monthly Digest', html: '<h1>This Month</h1><p>Here are the highlights.</p>' },
  ];

  for (const t of galleryTemplates) {
    const exists = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM templates WHERE tenant_id IS NULL AND name = ${t.name} LIMIT 1`;
    if (exists.length) continue;
    await prisma.template.create({
      data: {
        name: t.name,
        builderType: 'classic',
        categoryId: catId,
        renderedHtml: t.html,
        designJson: { blocks: [] },
        isGallery: true,
      },
    });
  }

  console.log('✅ Gallery seed complete');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
