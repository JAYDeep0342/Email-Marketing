import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withCurrentTenant((tx) =>
      tx.tag.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  async create(tenantId: string, name: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const existing = await tx.tag.findFirst({ where: { name }, select: { id: true } });
      if (existing) throw new ConflictException('Tag already exists');
      return tx.tag.create({ data: { tenantId, name } });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const tag = await tx.tag.findFirst({ where: { id }, select: { id: true } });
      if (!tag) throw new NotFoundException('Tag not found');
      await tx.tag.delete({ where: { id } });
      return { message: 'Tag deleted' };
    });
  }
}