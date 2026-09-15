import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { normalizeEmail } from '../../common/utils/email.util';
import { CampaignRecipientsService } from './campaign-recipients.service';
import {
  CreateCampaignDto,
  ListCampaignsQueryDto,
  ScheduleCampaignDto,
  UpdateCampaignDto,
} from './dto/campaigns.dto';

type Status =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'paused'
  | 'cancelled';

// Which statuses each action is legal from.
// NOTE: 'sending' and 'sent' are written ONLY by the Sending Engine (Step 12).
// This module can move a campaign into 'scheduled' and no further.
const ALLOWED_FROM: Record<string, Status[]> = {
  edit: ['draft', 'paused'],
  schedule: ['draft'],
  unschedule: ['scheduled'],
  pause: ['scheduled', 'sending'],
  resume: ['paused'],
  cancel: ['draft', 'scheduled', 'paused'],
  delete: ['draft', 'scheduled', 'paused', 'sent', 'cancelled'],
};

interface RefIds {
  templateId?: string | null;
  signatureId?: string | null;
  listId?: string | null;
  segmentId?: string | null;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: CampaignRecipientsService,
  ) {}

  // ============================================================
  //  1. CREATE
  // ============================================================
  async create(tenantId: string, dto: CreateCampaignDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      // Cross-tenant guard — see plan Finding #3. FKs do NOT help here:
      // Postgres FK checks bypass RLS, and list_id/segment_id have no FK at all.
      await this.assertRefsInTenant(tx, dto);

      return tx.campaign.create({
        data: {
          tenantId,
          name: dto.name,
          subject: dto.subject,
          preheader: dto.preheader,
          fromName: dto.fromName,
          fromEmail: dto.fromEmail ? normalizeEmail(dto.fromEmail) : undefined,
          signatureId: dto.signatureId,
          templateId: dto.templateId,
          listId: dto.listId,
          segmentId: dto.segmentId,
          status: 'draft',
        },
      });
    });
  }

  // ============================================================
  //  2. LIST
  //
  //  Enriched with per-campaign send/engagement stats and the target
  //  list/segment NAME (Acelle-style list row). No formal Prisma relation
  //  exists from Campaign -> CampaignStat, or from Campaign.listId/segmentId
  //  -> List/Segment (same "no relation declared" situation as
  //  findOne()'s own list/segment lookup below, and as CampaignStat
  //  elsewhere) — so this batches 3 extra lookups by id, each ONE query
  //  regardless of page size (not per-row): campaign_stats, lists, segments.
  //  All three are RLS-scoped tables, safe inside this withCurrentTenant tx.
  // ============================================================
  async list(q: ListCampaignsQueryDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const where: any = { deletedAt: null };
      if (q.status) where.status = q.status;
      if (q.templateId) where.templateId = q.templateId;
      if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

      const [rows, total] = await Promise.all([
        tx.campaign.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: {
            template: { select: { id: true, name: true, isGallery: true } },
            signature: { select: { id: true, name: true, fromEmail: true } },
            _count: { select: { recipients: true } },
          },
        }),
        tx.campaign.count({ where }),
      ]);

      const campaignIds = rows.map((c) => c.id);
      const listIds = [...new Set(rows.map((c) => c.listId).filter((v): v is string => !!v))];
      const segmentIds = [
        ...new Set(rows.map((c) => c.segmentId).filter((v): v is string => !!v)),
      ];

      // Prisma handles an empty `in: []` fine (just returns no rows), so no
      // need to special-case zero list/segment ids on this page.
      const [stats, lists, segments] = await Promise.all([
        tx.campaignStat.findMany({ where: { campaignId: { in: campaignIds } } }),
        tx.list.findMany({ where: { id: { in: listIds } }, select: { id: true, name: true } }),
        tx.segment.findMany({
          where: { id: { in: segmentIds } },
          select: { id: true, name: true },
        }),
      ]);
      const statsById = new Map(stats.map((s) => [s.campaignId, s]));
      const listNameById = new Map(lists.map((l) => [l.id, l.name]));
      const segmentNameById = new Map(segments.map((s) => [s.id, s.name]));

      // Same rate convention as AnalyticsService / dashboard endpoints:
      // open/click rate are of `delivered`, not `sent`.
      const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

      const data = rows.map((c: any) => {
        const s = statsById.get(c.id);
        const sentCount = s?.sentCount ?? 0;
        const delivered = s?.deliveredCount ?? 0;
        return {
          id: c.id,
          name: c.name,
          subject: c.subject,
          status: c.status,
          scheduledAt: c.scheduledAt,
          sentAt: c.sentAt,
          template: c.template,
          signature: c.signature,
          recipientCount: c._count.recipients,
          target: c.listId
            ? { type: 'list' as const, id: c.listId, name: listNameById.get(c.listId) ?? null }
            : c.segmentId
              ? {
                  type: 'segment' as const,
                  id: c.segmentId,
                  name: segmentNameById.get(c.segmentId) ?? null,
                }
              : null,
          sentCount,
          totalRecipients: s?.totalRecipients ?? c._count.recipients,
          openRate: rate(s?.uniqueOpenCount ?? 0, delivered),
          clickRate: rate(s?.clickCount ?? 0, delivered),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      });

      return paginated(data, total, q.page, q.limit);
    });
  }

  // ============================================================
  //  3. GET ONE
  // ============================================================
  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id, {
        template: { select: { id: true, name: true, isGallery: true } },
        signature: {
          select: {
            id: true,
            name: true,
            fromName: true,
            fromEmail: true,
            replyTo: true,
            isVerified: true,
          },
        },
        _count: { select: { recipients: true } },
      });

      // list / segment have no relation in schema.prisma — fetch manually,
      // still inside the tenant-scoped tx so RLS applies.
      const [list, segment] = await Promise.all([
        c.listId
          ? tx.list.findFirst({
              where: { id: c.listId },
              select: { id: true, name: true },
            })
          : null,
        c.segmentId
          ? tx.segment.findFirst({
              where: { id: c.segmentId },
              select: { id: true, name: true },
            })
          : null,
      ]);

      return {
        id: c.id,
        name: c.name,
        subject: c.subject,
        preheader: c.preheader,
        fromName: c.fromName,
        fromEmail: c.fromEmail,
        status: c.status,
        scheduledAt: c.scheduledAt,
        sentAt: c.sentAt,
        template: c.template,
        signature: c.signature,
        list,
        segment,
        recipientCount: c._count.recipients,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  // ============================================================
  //  4. UPDATE
  // ============================================================
  async update(id: string, dto: UpdateCampaignDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      this.assertTransition('edit', c.status, 'edit');
      await this.assertRefsInTenant(tx, dto);

      return tx.campaign.update({
        where: { id },
        data: {
          name: dto.name,
          subject: dto.subject,
          preheader: dto.preheader,
          fromName: dto.fromName,
          fromEmail: dto.fromEmail ? normalizeEmail(dto.fromEmail) : undefined,
          signatureId: dto.signatureId,
          templateId: dto.templateId,
          listId: dto.listId,
          segmentId: dto.segmentId,
        },
      });
    });
  }

  // ============================================================
  //  5. SOFT DELETE
  // ============================================================
  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      if (c.status === 'sending') {
        throw new ConflictException(
          'Cannot delete a campaign that is currently sending',
        );
      }
      await tx.campaign.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return { message: 'Campaign deleted' };
    });
  }

  // ============================================================
  //  6. DUPLICATE
  // ============================================================
  async duplicate(tenantId: string, id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const src: any = await this.load(tx, id);

      // Campaign names are NOT unique in the schema (no unique index on
      // tenant_id+name), so this loop is purely for nicer naming — it mirrors
      // the templates duplicate flow. Creating two identical names is legal.
      let name = `${src.name} (copy)`;
      let n = 1;
      while (
        await tx.campaign.findFirst({
          where: { tenantId, name, deletedAt: null },
          select: { id: true },
        })
      ) {
        n += 1;
        name = `${src.name} (copy ${n})`;
      }

      // Recipients are NOT copied: the snapshot belongs to the original send.
      // The copy re-resolves its own audience when scheduled.
      return tx.campaign.create({
        data: {
          tenantId,
          name,
          subject: src.subject,
          preheader: src.preheader,
          fromName: src.fromName,
          fromEmail: src.fromEmail,
          signatureId: src.signatureId,
          templateId: src.templateId,
          listId: src.listId,
          segmentId: src.segmentId,
          status: 'draft',
          scheduledAt: null,
          sentAt: null,
        },
      });
    });
  }

  // ============================================================
  //  7. STATUS ACTIONS
  // ============================================================

  async schedule(id: string, dto: ScheduleCampaignDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      this.assertTransition('schedule', c.status, 'schedule');

      const when = new Date(dto.scheduledAt);
      await this.assertSendable(tx, c, when);

      const summary = await this.recipients.resolveInTx(tx, c);
      if (summary.total === 0) {
        throw new BadRequestException('Campaign has no recipients');
      }

      const updated = await tx.campaign.update({
        where: { id },
        data: { status: 'scheduled', scheduledAt: when },
      });
      return { ...updated, recipients: summary };
    });
  }

  async unschedule(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      this.assertTransition('unschedule', c.status, 'unschedule');
      return tx.campaign.update({
        where: { id },
        data: { status: 'draft', scheduledAt: null },
      });
    });
  }

  async pause(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      this.assertTransition('pause', c.status, 'pause');
      return tx.campaign.update({ where: { id }, data: { status: 'paused' } });
    });
  }

  /**
   * paused -> scheduled. Re-validates AND re-resolves, because the audience
   * may have changed while paused (new contacts, new unsubscribes).
   */
  async resume(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      this.assertTransition('resume', c.status, 'resume');

      if (!c.scheduledAt) {
        throw new BadRequestException(
          'Campaign has no scheduledAt — schedule it instead of resuming',
        );
      }
      await this.assertSendable(tx, c, new Date(c.scheduledAt));

      const summary = await this.recipients.resolveInTx(tx, c);
      if (summary.total === 0) {
        throw new BadRequestException('Campaign has no recipients');
      }

      const updated = await tx.campaign.update({
        where: { id },
        data: { status: 'scheduled' },
      });
      return { ...updated, recipients: summary };
    });
  }

  async cancel(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      this.assertTransition('cancel', c.status, 'cancel');
      return tx.campaign.update({
        where: { id },
        data: { status: 'cancelled', scheduledAt: null },
      });
    });
  }

  // ============================================================
  //  8. STATS  (real numbers arrive with Tracking & Analytics)
  // ============================================================
  async stats(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id);
      const total = await tx.campaignRecipient.count({
        where: { campaignId: id },
      });

      // upsert-on-read so the frontend always gets a stable shape
      return tx.campaignStat.upsert({
        where: { campaignId: id },
        create: {
          campaignId: id,
          tenantId: c.tenantId,
          totalRecipients: total,
        },
        update: { totalRecipients: total },
      });
    });
  }

  // ============================================================
  //  9. PREVIEW
  // ============================================================
  async preview(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const c: any = await this.load(tx, id, {
        template: { select: { id: true, name: true, renderedHtml: true } },
        signature: {
          select: { fromName: true, fromEmail: true, replyTo: true },
        },
      });

      // DECISION: when a signature is linked, its values WIN over the
      // campaign's own fromName/fromEmail. The signature is the verified
      // sender identity; the campaign fields are only a fallback.
      const fromName = c.signature?.fromName ?? c.fromName ?? null;
      const fromEmail = c.signature?.fromEmail ?? c.fromEmail ?? null;
      const replyTo = c.signature?.replyTo ?? null;

      return {
        subject: c.subject,
        preheader: c.preheader,
        fromName,
        fromEmail,
        replyTo,
        template: c.template ? { id: c.template.id, name: c.template.name } : null,
        html: c.template?.renderedHtml ?? null,
      };
    });
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  private async load(tx: PrismaClient, id: string, include?: any) {
    const c = await tx.campaign.findFirst({
      where: { id, deletedAt: null },
      ...(include ? { include } : {}),
    });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  private assertTransition(action: string, current: string, verb: string) {
    const allowed = ALLOWED_FROM[action];
    if (!allowed.includes(current as Status)) {
      throw new ConflictException(
        `Cannot ${verb} a campaign with status '${current}'`,
      );
    }
  }

  /**
   * Cross-tenant reference guard.
   *
   * Every one of these four ids must resolve inside the current tenant's RLS
   * scope. Do NOT rely on the FKs: Postgres runs FK checks as an internal
   * system operation that BYPASSES RLS, and list_id/segment_id have no FK at
   * all. This method is the only thing preventing Tenant B from attaching
   * Tenant A's template, signature, list or segment to its campaign.
   */
  private async assertRefsInTenant(tx: PrismaClient, refs: RefIds) {
    if (refs.templateId) {
      // Gallery templates (tenant_id IS NULL) are intentionally ALLOWED here —
      // RLS *_select exposes them, usage is read-only, and forcing a duplicate
      // first would add nothing. Do not "fix" this into an own-only check.
      const t = await tx.template.findFirst({
        where: { id: refs.templateId, deletedAt: null },
        select: { id: true },
      });
      if (!t) throw new NotFoundException('Template not found');
    }
    if (refs.signatureId) {
      const s = await tx.signature.findFirst({
        where: { id: refs.signatureId },
        select: { id: true },
      });
      if (!s) throw new NotFoundException('Signature not found');
    }
    if (refs.listId) {
      const l = await tx.list.findFirst({
        where: { id: refs.listId },
        select: { id: true },
      });
      if (!l) throw new NotFoundException('List not found');
    }
    if (refs.segmentId) {
      const sg = await tx.segment.findFirst({
        where: { id: refs.segmentId },
        select: { id: true },
      });
      if (!sg) throw new NotFoundException('Segment not found');
    }
  }

  /**
   * Single source of truth for "is this campaign ready to send".
   * Used by BOTH schedule() and resume() so the rules can never drift.
   * Cheap checks run first; the expensive audience resolution happens after.
   */
  private async assertSendable(tx: PrismaClient, c: any, when: Date) {
    // 1. subject
    if (!c.subject || !c.subject.trim()) {
      throw new BadRequestException('Campaign subject is required');
    }

    // 2-4. template + content
    if (!c.templateId) {
      throw new BadRequestException('Campaign must have a template');
    }
    const template = await tx.template.findFirst({
      where: { id: c.templateId, deletedAt: null },
      select: { id: true, renderedHtml: true },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.renderedHtml || !template.renderedHtml.trim()) {
      throw new BadRequestException('Template has no rendered content');
    }

    // 5-6. sender identity
    const hasInlineSender = Boolean(c.fromName && c.fromEmail);
    if (!c.signatureId && !hasInlineSender) {
      throw new BadRequestException(
        'Campaign must have a signature or a from name and from email',
      );
    }
    if (c.signatureId) {
      const sig = await tx.signature.findFirst({
        where: { id: c.signatureId },
        select: { id: true, isVerified: true },
      });
      if (!sig) throw new NotFoundException('Signature not found');
      if (!sig.isVerified) {
        throw new BadRequestException('Signature is not verified');
      }
    }

    // 7-8. audience targets exist in this tenant
    if (!c.listId && !c.segmentId) {
      throw new BadRequestException(
        'Campaign must target a list or a segment',
      );
    }
    await this.assertRefsInTenant(tx, {
      listId: c.listId,
      segmentId: c.segmentId,
    });

    // 9. schedule time
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('scheduledAt is not a valid date');
    }
    if (when.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
  }
}