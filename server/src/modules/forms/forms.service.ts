import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { CreateFormDto, UpdateFormDto } from './dto/forms.dto';

/**
 * Admin CRUD for forms. All tenant-scoped via withCurrentTenant (forms /
 * form_submissions are RLS-forced). The public submit path lives in
 * FormsSubmissionsService — this class deliberately doesn't touch it.
 *
 * Convention mirrors AutomationsService: mustExist() before every write,
 * findOne() also gates on mustExist so cross-tenant reads return 404 instead
 * of null.
 */
@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateFormDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      // If listId is provided, confirm it belongs to this tenant. RLS already
      // scopes the read, so a missing row here means either "doesn't exist" or
      // "belongs to another tenant" — both are 400 from the caller's POV.
      if (dto.listId) {
        const list = await tx.list.findFirst({
          where: { id: dto.listId },
          select: { id: true },
        });
        if (!list) throw new BadRequestException('Target list not found');
      }
      return tx.form.create({
        data: {
          tenantId,
          name: dto.name,
          type: dto.type ?? 'embedded',
          listId: dto.listId ?? null,
          fields: (dto.fields ?? []) as any,
          settings: (dto.settings ?? {}) as any,
          isActive: dto.isActive ?? true,
        },
      });
    });
  }

  async list(page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.form.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { _count: { select: { submissions: true } } },
        }),
        tx.form.count(),
      ]);
      const shaped = rows.map((r) => {
        const { _count, ...rest } = r as any;
        return { ...rest, submissionCount: _count.submissions };
      });
      return paginated(shaped, total, page, limit);
    });
  }

  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const form = await tx.form.findFirst({
        where: { id },
        include: { _count: { select: { submissions: true } } },
      });
      if (!form) throw new NotFoundException('Form not found');
      const { _count, ...rest } = form as any;
      return { ...rest, submissionCount: _count.submissions };
    });
  }

  async update(id: string, dto: UpdateFormDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);

      // Validate listId ownership when provided. Explicit null clears it.
      if (dto.listId !== undefined && dto.listId !== null) {
        const list = await tx.list.findFirst({
          where: { id: dto.listId },
          select: { id: true },
        });
        if (!list) throw new BadRequestException('Target list not found');
      }

      await tx.form.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.listId !== undefined ? { listId: dto.listId } : {}),
          ...(dto.fields !== undefined ? { fields: dto.fields as any } : {}),
          ...(dto.settings !== undefined
            ? { settings: dto.settings as any }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return this.findOneInternal(tx, id);
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);
      // form_submissions cascades via schema (onDelete: Cascade on Form).
      await tx.form.delete({ where: { id } });
      return { message: 'Form deleted' };
    });
  }

  async listSubmissions(formId: string, page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, formId);
      const [rows, total] = await Promise.all([
        tx.formSubmission.findMany({
          where: { formId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.formSubmission.count({ where: { formId } }),
      ]);
      // FormSubmission has a plain contactId column, not a Prisma relation
      // (schema.prisma never declares `contact Contact @relation(...)` on the
      // model, and there's no FK on form_submissions.contact_id in the DB) —
      // so a nested `include: { contact }` doesn't exist to ask Prisma for.
      // Batch-fetch instead of N+1'ing a lookup per row.
      const contactIds = [...new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id))];
      const contacts = contactIds.length
        ? await tx.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, email: true, firstName: true, lastName: true, status: true },
          })
        : [];
      const byId = new Map(contacts.map((c) => [c.id, c]));
      const shaped = rows.map((r) => ({ ...r, contact: r.contactId ? (byId.get(r.contactId) ?? null) : null }));
      return paginated(shaped, total, page, limit);
    });
  }

  // ---- helpers ----

  private async mustExist(tx: any, id: string) {
    const f = await tx.form.findFirst({ where: { id } });
    if (!f) throw new NotFoundException('Form not found');
    return f;
  }

  private async findOneInternal(tx: any, id: string) {
    const form = await tx.form.findFirst({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });
    if (!form) return null;
    const { _count, ...rest } = form;
    return { ...rest, submissionCount: _count.submissions };
  }
}