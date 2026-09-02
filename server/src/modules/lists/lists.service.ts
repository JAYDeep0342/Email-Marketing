import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { CreateListDto, UpdateListDto } from './dto/lists.dto';
import {
  AUTOMATION_TRIGGER_EVENT,
  TRIGGER_CONTACT_ADDED_TO_LIST,
} from './lists.constants';

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.list.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { _count: { select: { listContacts: true } } },
        }),
        tx.list.count(),
      ]);
      const data = rows.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        contactCount: l._count.listContacts,
        createdAt: l.createdAt,
      }));
      return paginated(data, total, page, limit);
    });
  }

  // GET /lists/:id — needed by the list-detail screen to show the list's
  // own name/description above its contacts table.
  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const list = await tx.list.findFirst({
        where: { id },
        include: { _count: { select: { listContacts: true } } },
      });
      if (!list) throw new NotFoundException('List not found');
      return {
        id: list.id,
        name: list.name,
        description: list.description,
        contactCount: list._count.listContacts,
        createdAt: list.createdAt,
      };
    });
  }

  create(tenantId: string, dto: CreateListDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.list.create({ data: { tenantId, name: dto.name, description: dto.description } }),
    );
  }

  async update(id: string, dto: UpdateListDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const list = await tx.list.findFirst({ where: { id }, select: { id: true } });
      if (!list) throw new NotFoundException('List not found');
      return tx.list.update({ where: { id }, data: { name: dto.name, description: dto.description } });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const list = await tx.list.findFirst({ where: { id }, select: { id: true } });
      if (!list) throw new NotFoundException('List not found');
      await tx.list.delete({ where: { id } }); // ListContact cascades
      return { message: 'List deleted' };
    });
  }

  async addContacts(tenantId: string, listId: string, contactIds: string[]) {
    const result = await this.prisma.withCurrentTenant(async (tx) => {
      const list = await tx.list.findFirst({ where: { id: listId }, select: { id: true } });
      if (!list) throw new NotFoundException('List not found');

      // Only add contacts that actually belong to this tenant (RLS ensures scope)
      const valid = await tx.contact.findMany({
        where: { id: { in: contactIds }, deletedAt: null },
        select: { id: true },
      });
      const validIds = valid.map((c) => c.id);

      await tx.listContact.createMany({
        data: validIds.map((contactId) => ({ listId, contactId })),
        skipDuplicates: true,
      });
      return { added: validIds.length, skipped: contactIds.length - validIds.length, validIds };
    });

    // Fired outside the tx (non-blocking), one per contact so the listener's
    // per-contact enrollment check runs for each — same pattern as
    // forms-submissions.service.ts / contacts.service.ts. Deliberately
    // per-contact (unlike bulk import): adding to a specific list is exactly
    // the trigger-worthy action this event exists for.
    for (const contactId of result.validIds) {
      this.events.emit(AUTOMATION_TRIGGER_EVENT, {
        tenantId,
        triggerType: TRIGGER_CONTACT_ADDED_TO_LIST,
        contactId,
        context: { listId },
      });
    }

    return { added: result.added, skipped: result.skipped };
  }

  async removeContact(listId: string, contactId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await tx.listContact
        .delete({ where: { listId_contactId: { listId, contactId } } })
        .catch(() => {
          throw new NotFoundException('Contact not in this list');
        });
      return { message: 'Contact removed from list' };
    });
  }

  async listContacts(listId: string, page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const list = await tx.list.findFirst({ where: { id: listId }, select: { id: true } });
      if (!list) throw new NotFoundException('List not found');

      const [rows, total] = await Promise.all([
        tx.listContact.findMany({
          where: { listId },
          include: { contact: true },
          orderBy: { addedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.listContact.count({ where: { listId } }),
      ]);
      return paginated(rows.map((r) => r.contact), total, page, limit);
    });
  }
}