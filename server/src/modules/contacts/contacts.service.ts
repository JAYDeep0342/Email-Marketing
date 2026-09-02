import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { isValidEmail, normalizeEmail } from '../../common/utils/email.util';
import {
  CreateContactDto,
  UpdateContactDto,
  ListContactsQueryDto,
  ImportContactsDto,
} from './dto/contacts.dto';
import {
  AUTOMATION_TRIGGER_EVENT,
  TRIGGER_CONTACT_CREATED,
} from './contacts.constants';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger('ContactsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // POST /contacts
  async create(tenantId: string, dto: CreateContactDto) {
    const email = normalizeEmail(dto.email);
    const contact = await this.prisma.withCurrentTenant(async (tx) => {
      // Duplicate check (non-deleted)
      const existing = await tx.contact.findFirst({
        where: { email, deletedAt: null },
        select: { id: true },
      });
      if (existing)
        throw new ConflictException('Contact with this email already exists');

      // Suppression check — if suppressed, create but mark status accordingly
      const suppressed = await tx.suppression.findFirst({
        where: { email },
        select: { reason: true },
      });
      let status = dto.status ?? 'subscribed';
      if (suppressed) {
        status =
          suppressed.reason === 'complaint'
            ? 'complained'
            : suppressed.reason === 'hard_bounce'
              ? 'bounced'
              : 'unsubscribed';
      }

      return tx.contact.create({
        data: {
          tenantId,
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          attributes: (dto.attributes ?? {}) as any,
          status,
        },
      });
    });

    // Fired outside the tx (non-blocking) — same pattern as
    // forms-submissions.service.ts. AutomationTriggerListener already wraps
    // its handler in try/catch, so a bad listener can't fail this request.
    this.events.emit(AUTOMATION_TRIGGER_EVENT, {
      tenantId,
      triggerType: TRIGGER_CONTACT_CREATED,
      contactId: contact.id,
    });

    return contact;
  }

  // GET /contacts
  async list(q: ListContactsQueryDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const where: any = { deletedAt: null };
      if (q.status) where.status = q.status;
      if (q.search) {
        where.OR = [
          { email: { contains: q.search, mode: 'insensitive' } },
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
        ];
      }
      if (q.listId) {
        where.listContacts = { some: { listId: q.listId } };
      }
      if (q.tagId) {
        where.contactTags = { some: { tagId: q.tagId } };
      }

      const [rows, total] = await Promise.all([
        tx.contact.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: {
            contactTags: { select: { tag: { select: { id: true, name: true } } } },
          },
        }),
        tx.contact.count({ where }),
      ]);
      // Same tags-projection as findOne() — flatten contactTags -> tags so
      // the contacts table can render a Tags column without an extra
      // request per row.
      const data = rows.map(({ contactTags, ...rest }) => ({
        ...rest,
        tags: contactTags.map((ct) => ct.tag),
      }));
      return paginated(data, total, q.page, q.limit);
    });
  }

  // GET /contacts/:id
  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        include: {
          listContacts: {
            select: { list: { select: { id: true, name: true } } },
          },
          contactTags: {
            select: { tag: { select: { id: true, name: true } } },
          },
        },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      const { listContacts, contactTags, ...rest } = contact;
      return {
        ...rest,
        lists: listContacts.map((lc) => lc.list),
        tags: contactTags.map((ct) => ct.tag),
      };
    });
  }

  // PATCH /contacts/:id
  async update(id: string, dto: UpdateContactDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, attributes: true },
      });
      if (!contact) throw new NotFoundException('Contact not found');

      const mergedAttributes =
        dto.attributes !== undefined
          ? { ...(contact.attributes as object), ...dto.attributes }
          : undefined;

      return tx.contact.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          attributes: mergedAttributes as any,
          status: dto.status,
        },
      });
    });
  }

  // DELETE /contacts/:id (soft)
  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('Contact not found');
      await tx.contact.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return { message: 'Contact deleted' };
    });
  }

  // POST /contacts/import
  async import(tenantId: string, dto: ImportContactsDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      // Validate list if given
      if (dto.listId) {
        const list = await tx.list.findFirst({
          where: { id: dto.listId },
          select: { id: true },
        });
        if (!list) throw new BadRequestException('Target list not found');
      }

      // Load suppressions once
      const suppressions = await tx.suppression.findMany({
        select: { email: true, reason: true },
      });
      const suppMap = new Map(suppressions.map((s) => [s.email, s.reason]));

      // Existing (non-deleted) emails to skip duplicates
      const incomingEmails = dto.contacts.map((c) => normalizeEmail(c.email));
      const existing = await tx.contact.findMany({
        where: { email: { in: incomingEmails }, deletedAt: null },
        select: { email: true },
      });
      const existingSet = new Set(existing.map((e) => e.email));

      let imported = 0;
      let skipped = 0;
      const errors: Array<{ email: string; reason: string }> = [];
      const createdIds: string[] = [];
      const seenInBatch = new Set<string>();

      for (const item of dto.contacts) {
        const email = normalizeEmail(item.email);
        if (!isValidEmail(email)) {
          errors.push({ email: item.email, reason: 'invalid email' });
          continue;
        }
        if (existingSet.has(email) || seenInBatch.has(email)) {
          skipped++;
          continue;
        }
        seenInBatch.add(email);

        const supp = suppMap.get(email);
        const status = supp
          ? supp === 'complaint'
            ? 'complained'
            : supp === 'hard_bounce'
              ? 'bounced'
              : 'unsubscribed'
          : 'subscribed';

        const created = await tx.contact.create({
          data: {
            tenantId,
            email,
            firstName: item.firstName,
            lastName: item.lastName,
            attributes: (item.attributes ?? {}) as any,
            status,
          },
          select: { id: true },
        });
        createdIds.push(created.id);
        imported++;
      }

      // Add all newly created to the list (if given)
      if (dto.listId && createdIds.length) {
        await tx.listContact.createMany({
          data: createdIds.map((contactId) => ({
            listId: dto.listId!,
            contactId,
          })),
          skipDuplicates: true,
        });
      }

      return { imported, skipped, errors };
    });
  }

  // POST /contacts/:id/tags
  async addTag(contactId: string, tagId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const [contact, tag] = await Promise.all([
        tx.contact.findFirst({
          where: { id: contactId, deletedAt: null },
          select: { id: true },
        }),
        tx.tag.findFirst({ where: { id: tagId }, select: { id: true } }),
      ]);
      if (!contact) throw new NotFoundException('Contact not found');
      if (!tag) throw new NotFoundException('Tag not found');

      await tx.contactTag.upsert({
        where: { contactId_tagId: { contactId, tagId } },
        update: {},
        create: { contactId, tagId },
      });
      return { message: 'Tag added' };
    });
  }

  // DELETE /contacts/:id/tags/:tagId
  async removeTag(contactId: string, tagId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await tx.contactTag
        .delete({ where: { contactId_tagId: { contactId, tagId } } })
        .catch(() => {
          throw new NotFoundException('Tag not on this contact');
        });
      return { message: 'Tag removed' };
    });
  }
}
