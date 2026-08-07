import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { CreateListDto, UpdateListDto } from './dto/lists.dto';

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.withCurrentTenant(async (tx) => {
      const lists = await tx.list.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { listContacts: true } } },
      });
      return lists.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        contactCount: l._count.listContacts,
        createdAt: l.createdAt,
      }));
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

  async addContacts(listId: string, contactIds: string[]) {
    return this.prisma.withCurrentTenant(async (tx) => {
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
      return { added: validIds.length, skipped: contactIds.length - validIds.length };
    });
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