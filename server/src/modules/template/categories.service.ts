import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/templates.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    // RLS split policy returns own + gallery (tenantId NULL)
    return this.prisma.withCurrentTenant((tx) =>
      tx.templateCategory.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  create(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.templateCategory.create({ data: { tenantId, name: dto.name } }),
    );
  }

  async update(id: string, dto: UpdateCategoryDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const cat = await tx.templateCategory.findFirst({ where: { id } });
      if (!cat) throw new NotFoundException('Category not found');
      if (cat.tenantId === null)
        throw new ForbiddenException('Gallery categories cannot be modified');
      return tx.templateCategory.update({ where: { id }, data: { name: dto.name } });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const cat = await tx.templateCategory.findFirst({ where: { id } });
      if (!cat) throw new NotFoundException('Category not found');
      if (cat.tenantId === null)
        throw new ForbiddenException('Gallery categories cannot be deleted');
      await tx.templateCategory.delete({ where: { id } });
      return { message: 'Category deleted' };
    });
  }
}