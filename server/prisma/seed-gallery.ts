import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import mjml2html from 'mjml';
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

  await seedStarterTemplates();

  console.log('✅ Gallery seed complete');
}

// ============================================================
//  Starter templates (Templates upgrade, Part 1)
//
//  Real MJML markup (not just a couple of paragraphs like the two rows
//  above) compiled at seed time via the Node `mjml` package into genuine
//  email-safe, table-based HTML for `renderedHtml`.
//
//  `designJson` for these rows is NOT GrapesJS's own ProjectData shape (that
//  only exists once something has actually been saved from the visual
//  builder). Instead it's `{ source: 'mjml', mjml: <source> }` — the MJML
//  source itself. grapesjs-mjml can decompose real MJML markup into
//  genuine, editable mj-section/mj-column/mj-text/etc. components via
//  `editor.setComponents(mjmlSource)` (this is exactly how the builder's own
//  blank-canvas starter already works today). That's different from a
//  'classic' hand-pasted HTML template, where the compiled HTML has to be
//  imported as a single inert mj-raw block because arbitrary table HTML
//  can't be reliably decomposed back into semantic components.
//
//  This is a deliberate seed-time design choice, flagged for review before
//  Part 3 wires it into the builder's load path (today the builder only
//  branches on `builderType === 'pro' && designJson`, so it doesn't act on
//  this shape yet).
// ============================================================

const STARTER_CATEGORIES = ['Base', 'Simple', 'Extended'] as const;
type StarterCategory = (typeof STARTER_CATEGORIES)[number];

interface StarterTemplate {
  name: string;
  category: StarterCategory;
  mjml: string;
}

// Self-contained placeholder "images" — an inline SVG data URI, not a
// fetch to a third-party host. https://placehold.co (the previous source)
// is an external service with no uptime guarantee; every tenant loading
// the Templates grid or a builder preview was firing several requests at
// it per starter, and it was timing out in practice (ERR_CONNECTION_TIMED_OUT
// in the browser console). A data URI has zero network dependency, so the
// card thumbnails and preview dialog always render instantly and reliably.
// Tradeoff worth knowing: some email clients (older Outlook builds) don't
// render data-URI images — acceptable here since these are starter/example
// blocks meant to be replaced with real product images before a template
// is actually sent, not a claim that this technique belongs in production
// email content generally.
function placeholderImage(width: number, height: number, bg: string, fg: string, text: string): string {
  const fontSize = Math.max(14, Math.round(height * 0.11));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" fill="${fg}">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const UNSUB_FOOTER = (context: string) => `
    <mj-section padding="24px 24px 40px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#9ca3af" line-height="18px">
          You're receiving this because you're subscribed to ${context}.
          <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>`;

const starterTemplates: StarterTemplate[] = [
  {
    name: 'Blank',
    category: 'Base',
    mjml: `<mjml>
  <mj-body background-color="#f4f4f7">
    <mj-section padding="40px 24px" background-color="#ffffff">
      <mj-column>
        <mj-text font-size="16px" color="#374151" align="center">
          Click into this text to start writing your email…
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
  {
    name: 'Plain Text',
    category: 'Base',
    mjml: `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Georgia, 'Times New Roman', serif" />
      <mj-text color="#111827" font-size="16px" line-height="26px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#ffffff" width="560px">
    <mj-section padding="40px 24px 16px">
      <mj-column>
        <mj-text>Hi {{firstName}},</mj-text>
        <mj-text>Just a quick note to say thanks for being part of our community. We're always working on something new, and we didn't want you to miss it.</mj-text>
        <mj-text>If you ever have questions or feedback, just reply to this email — a real person reads every message.</mj-text>
        <mj-text>Best,<br/>The Team</mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="16px 24px 32px">
      <mj-column>
        <mj-divider border-color="#e5e7eb" border-width="1px" />
        <mj-text align="center" font-size="12px" color="#9ca3af" line-height="18px">
          You're receiving this because you subscribed to our updates.
          <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  },
  {
    name: 'Welcome Email',
    category: 'Simple',
    mjml: `<mjml>
  <mj-head>
    <mj-preview>Welcome aboard — here's how to get started.</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section padding="32px 24px 0">
      <mj-column>
        <mj-text align="center" font-size="14px" font-weight="700" color="#4f46e5" letter-spacing="1px">YOUR BRAND</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="32px 32px">
      <mj-column>
        <mj-text align="center" font-size="26px" font-weight="700" color="#111827">Welcome, {{firstName}}!</mj-text>
        <mj-text align="center" color="#4b5563" font-size="15px" line-height="24px">We're excited to have you here. Your account is ready to go — here are a couple of things you can do to get the most out of it.</mj-text>
        <mj-button background-color="#4f46e5" color="#ffffff" font-size="15px" border-radius="6px" padding="24px 0 8px">Get Started</mj-button>
      </mj-column>
    </mj-section>${UNSUB_FOOTER('updates from us')}
  </mj-body>
</mjml>`,
  },
  {
    name: 'Announcement',
    category: 'Simple',
    mjml: `<mjml>
  <mj-head>
    <mj-preview>We've got news to share.</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section background-color="#0ea5e9" padding="28px 24px">
      <mj-column>
        <mj-text align="center" color="#ffffff" font-size="14px" font-weight="700" letter-spacing="1px">ANNOUNCEMENT</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="36px 32px 24px">
      <mj-column>
        <mj-text align="center" font-size="24px" font-weight="700" color="#111827">We've got some news, {{firstName}}</mj-text>
        <mj-text align="center" color="#4b5563" font-size="15px" line-height="24px">Something new just landed. Here's a quick summary of what's changed and why it matters for you.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="0 32px 8px">
      <mj-column>
        <mj-image src="${placeholderImage(536, 260, '#e0f2fe', '#0369a1', 'Announcement')}" alt="Announcement" border-radius="8px" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="24px 32px 36px">
      <mj-column>
        <mj-button background-color="#0ea5e9" color="#ffffff" font-size="15px" border-radius="6px">Learn More</mj-button>
      </mj-column>
    </mj-section>${UNSUB_FOOTER('our announcements')}
  </mj-body>
</mjml>`,
  },
  {
    name: 'Newsletter',
    category: 'Extended',
    mjml: `<mjml>
  <mj-head>
    <mj-preview>This month's highlights, hand-picked for you.</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section padding="28px 24px 8px">
      <mj-column>
        <mj-text align="center" font-size="14px" font-weight="700" color="#4f46e5" letter-spacing="1px">THE MONTHLY DIGEST</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="8px 32px 24px">
      <mj-column>
        <mj-text align="center" font-size="24px" font-weight="700" color="#111827">Hi {{firstName}}, here's what you missed</mj-text>
        <mj-text align="center" color="#4b5563" font-size="14px" line-height="22px">Three stories worth your time this month.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="0 24px 8px">
      <mj-column width="40%">
        <mj-image src="${placeholderImage(220, 160, '#eef2ff', '#4f46e5', 'Story 1')}" border-radius="6px" />
      </mj-column>
      <mj-column width="60%">
        <mj-text font-size="16px" font-weight="700" color="#111827" padding-bottom="4px">A big product update</mj-text>
        <mj-text font-size="13px" color="#6b7280" line-height="20px">A short summary of the update and why it's useful, in a sentence or two.</mj-text>
        <mj-text font-size="13px" color="#4f46e5" font-weight="700" padding-top="4px">Read more →</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="16px 24px 8px">
      <mj-column width="40%">
        <mj-image src="${placeholderImage(220, 160, '#eef2ff', '#4f46e5', 'Story 2')}" border-radius="6px" />
      </mj-column>
      <mj-column width="60%">
        <mj-text font-size="16px" font-weight="700" color="#111827" padding-bottom="4px">Tips from the community</mj-text>
        <mj-text font-size="13px" color="#6b7280" line-height="20px">A short summary of the update and why it's useful, in a sentence or two.</mj-text>
        <mj-text font-size="13px" color="#4f46e5" font-weight="700" padding-top="4px">Read more →</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="16px 24px 32px">
      <mj-column width="40%">
        <mj-image src="${placeholderImage(220, 160, '#eef2ff', '#4f46e5', 'Story 3')}" border-radius="6px" />
      </mj-column>
      <mj-column width="60%">
        <mj-text font-size="16px" font-weight="700" color="#111827" padding-bottom="4px">Upcoming events</mj-text>
        <mj-text font-size="13px" color="#6b7280" line-height="20px">A short summary of the update and why it's useful, in a sentence or two.</mj-text>
        <mj-text font-size="13px" color="#4f46e5" font-weight="700" padding-top="4px">Read more →</mj-text>
      </mj-column>
    </mj-section>${UNSUB_FOOTER('our updates')}
  </mj-body>
</mjml>`,
  },
  {
    name: 'Promotion / Sale',
    category: 'Extended',
    mjml: `<mjml>
  <mj-head>
    <mj-preview>Save big this week only.</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section background-color="#111827" padding="36px 24px">
      <mj-column>
        <mj-text align="center" color="#f87171" font-size="14px" font-weight="700" letter-spacing="2px">LIMITED TIME</mj-text>
        <mj-text align="center" color="#ffffff" font-size="32px" font-weight="800" padding-top="4px">25% OFF EVERYTHING</mj-text>
        <mj-text align="center" color="#d1d5db" font-size="14px" padding-top="4px">Use code at checkout — ends Sunday night.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="0">
      <mj-column>
        <mj-image src="${placeholderImage(600, 280, '#fee2e2', '#dc2626', 'Sale')}" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="32px 32px 8px">
      <mj-column>
        <mj-text align="center" font-size="20px" font-weight="700" color="#111827">Hi {{firstName}}, don't miss out</mj-text>
        <mj-text align="center" color="#4b5563" font-size="15px" line-height="24px">Your favorites are on sale for a limited time. Stock is moving fast — shop now before it's gone.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="8px 32px 12px">
      <mj-column>
        <mj-text align="center" font-size="13px" color="#6b7280" padding-bottom="8px">Your code</mj-text>
        <mj-text align="center" font-size="20px" font-weight="700" color="#dc2626">SAVE25</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="16px 32px 36px">
      <mj-column>
        <mj-button background-color="#dc2626" color="#ffffff" font-size="16px" border-radius="6px" padding="10px 25px">Shop Now</mj-button>
      </mj-column>
    </mj-section>${UNSUB_FOOTER('our promotions')}
  </mj-body>
</mjml>`,
  },
  {
    name: 'Product Feature',
    category: 'Extended',
    mjml: `<mjml>
  <mj-head>
    <mj-preview>Meet the newest addition to the product.</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section padding="28px 24px 0">
      <mj-column>
        <mj-text align="center" font-size="14px" font-weight="700" color="#059669" letter-spacing="1px">NEW FEATURE</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="16px 32px 8px">
      <mj-column>
        <mj-text align="center" font-size="26px" font-weight="700" color="#111827">Introducing Smart Reports</mj-text>
        <mj-text align="center" color="#4b5563" font-size="15px" line-height="24px">Hi {{firstName}}, we built something we think you'll love. Here's what's new.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="8px 32px 16px">
      <mj-column>
        <mj-image src="${placeholderImage(536, 280, '#d1fae5', '#059669', 'Product Preview')}" border-radius="8px" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="8px 32px">
      <mj-column width="10%" vertical-align="top">
        <mj-text font-size="18px">✅</mj-text>
      </mj-column>
      <mj-column width="90%" vertical-align="top">
        <mj-text font-size="14px" font-weight="700" color="#111827">Faster insights</mj-text>
        <mj-text font-size="13px" color="#6b7280" line-height="20px">See what matters without digging through menus.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="4px 32px">
      <mj-column width="10%" vertical-align="top">
        <mj-text font-size="18px">✅</mj-text>
      </mj-column>
      <mj-column width="90%" vertical-align="top">
        <mj-text font-size="14px" font-weight="700" color="#111827">Share with your team</mj-text>
        <mj-text font-size="13px" color="#6b7280" line-height="20px">One click to send a report to anyone.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="4px 32px 24px">
      <mj-column width="10%" vertical-align="top">
        <mj-text font-size="18px">✅</mj-text>
      </mj-column>
      <mj-column width="90%" vertical-align="top">
        <mj-text font-size="14px" font-weight="700" color="#111827">Works automatically</mj-text>
        <mj-text font-size="13px" color="#6b7280" line-height="20px">No setup required — it's already on for your account.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="0 32px 36px">
      <mj-column>
        <mj-button background-color="#059669" color="#ffffff" font-size="15px" border-radius="6px">Try It Now</mj-button>
      </mj-column>
    </mj-section>${UNSUB_FOOTER('product updates')}
  </mj-body>
</mjml>`,
  },
  {
    name: 'Event Invitation',
    category: 'Extended',
    mjml: `<mjml>
  <mj-head>
    <mj-preview>You're invited — save the date.</mj-preview>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section background-color="#ffffff" padding="0">
      <mj-column>
        <mj-image src="${placeholderImage(600, 260, '#ede9fe', '#7c3aed', "You're Invited")}" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="32px 32px 8px">
      <mj-column>
        <mj-text align="center" font-size="14px" font-weight="700" color="#7c3aed" letter-spacing="1px">YOU'RE INVITED</mj-text>
        <mj-text align="center" font-size="24px" font-weight="700" color="#111827" padding-top="4px">Join us live, {{firstName}}</mj-text>
        <mj-text align="center" color="#4b5563" font-size="15px" line-height="24px">We're hosting an event you won't want to miss — save your spot below.</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#f5f3ff" padding="20px 32px">
      <mj-column width="50%">
        <mj-text font-size="12px" font-weight="700" color="#7c3aed" letter-spacing="1px">DATE &amp; TIME</mj-text>
        <mj-text font-size="14px" color="#111827" padding-top="2px">Thursday, 7:00 PM</mj-text>
      </mj-column>
      <mj-column width="50%">
        <mj-text font-size="12px" font-weight="700" color="#7c3aed" letter-spacing="1px">LOCATION</mj-text>
        <mj-text font-size="14px" color="#111827" padding-top="2px">Online — link on RSVP</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="28px 32px 36px">
      <mj-column>
        <mj-button background-color="#7c3aed" color="#ffffff" font-size="15px" border-radius="6px">RSVP Now</mj-button>
      </mj-column>
    </mj-section>${UNSUB_FOOTER('our events')}
  </mj-body>
</mjml>`,
  },
];

async function seedCategory(name: StarterCategory): Promise<string> {
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM template_categories WHERE tenant_id IS NULL AND name = ${name} LIMIT 1`;
  if (existing.length) return existing[0].id;
  const cat = await prisma.templateCategory.create({ data: { name } });
  return cat.id;
}

// Upsert-by-name (not create-once): these are system/gallery rows, not user
// data, so re-running the seed after a content fix (copy tweak, image swap)
// should push the update rather than silently diverge from the source of
// truth forever. Safe because nothing here is tenant-owned or user-edited.
async function seedStarterTemplates() {
  const categoryIds = {} as Record<StarterCategory, string>;
  for (const name of STARTER_CATEGORIES) categoryIds[name] = await seedCategory(name);

  for (const t of starterTemplates) {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM templates WHERE tenant_id IS NULL AND name = ${t.name} LIMIT 1`;

    // mjml v5's mjml2html() is async (v4 was synchronous) — await it.
    const { html, errors } = await mjml2html(t.mjml, { validationLevel: 'soft' });
    if (errors?.length) {
      console.warn(`  ⚠ MJML warnings in "${t.name}":`, errors.map((e) => e.formattedMessage));
    }
    if (!html) {
      throw new Error(`Failed to compile starter template "${t.name}" — no HTML produced`);
    }

    const data = {
      builderType: 'classic' as const,
      categoryId: categoryIds[t.category],
      renderedHtml: html,
      designJson: { source: 'mjml', mjml: t.mjml },
      isGallery: true,
    };

    if (existing.length) {
      await prisma.template.update({ where: { id: existing[0].id }, data });
      console.log(`  ~ ${t.name} (${t.category}) — updated`);
    } else {
      await prisma.template.create({ data: { name: t.name, ...data } });
      console.log(`  + ${t.name} (${t.category}) — created`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
