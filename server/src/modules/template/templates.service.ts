import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  ListTemplatesQueryDto,
} from './dto/templates.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListTemplatesQueryDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const where: any = { deletedAt: null };
      if (q.categoryId) where.categoryId = q.categoryId;
      if (q.builderType) where.builderType = q.builderType;
      if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
      // gallery=true → only gallery rows (tenantId NULL). default → own + gallery (RLS handles).
      if (q.gallery === 'true') where.tenantId = null;

      const [data, total] = await Promise.all([
        tx.template.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        tx.template.count({ where }),
      ]);
      return paginated(data, total, q.page, q.limit);
    });
  }

  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const t = await tx.template.findFirst({ where: { id, deletedAt: null } });
      if (!t) throw new NotFoundException('Template not found');
      return t;
    });
  }

  async create(tenantId: string, dto: CreateTemplateDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const dup = await tx.template.findFirst({
        where: { tenantId, name: dto.name, deletedAt: null },
        select: { id: true },
      });
      if (dup) throw new ConflictException('Template with this name already exists');

      return tx.template.create({
        data: {
          tenantId,
          name: dto.name,
          builderType: dto.builderType ?? 'classic',
          categoryId: dto.categoryId,
          designJson: dto.designJson as any,
          renderedHtml: dto.renderedHtml,
          thumbnailUrl: dto.thumbnailUrl,
          isGallery: false,
        },
      });
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const t = await tx.template.findFirst({ where: { id, deletedAt: null } });
      if (!t) throw new NotFoundException('Template not found');
      if (t.tenantId === null)
        throw new ForbiddenException('Gallery templates cannot be modified');

      return tx.template.update({
        where: { id },
        data: {
          name: dto.name,
          builderType: dto.builderType,
          categoryId: dto.categoryId,
          designJson: dto.designJson as any,
          renderedHtml: dto.renderedHtml,
          thumbnailUrl: dto.thumbnailUrl,
        },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const t = await tx.template.findFirst({ where: { id, deletedAt: null } });
      if (!t) throw new NotFoundException('Template not found');
      if (t.tenantId === null)
        throw new ForbiddenException('Gallery templates cannot be deleted');
      await tx.template.update({ where: { id }, data: { deletedAt: new Date() } });
      return { message: 'Template deleted' };
    });
  }

  // POST /templates/:id/duplicate — clone (own or gallery) into tenant's own
  async duplicate(tenantId: string, id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const src = await tx.template.findFirst({ where: { id, deletedAt: null } });
      if (!src) throw new NotFoundException('Template not found');

      // Ensure unique name in tenant
      let name = `${src.name} (copy)`;
      let n = 1;
      while (
        await tx.template.findFirst({
          where: { tenantId, name, deletedAt: null },
          select: { id: true },
        })
      ) {
        n += 1;
        name = `${src.name} (copy ${n})`;
      }

      return tx.template.create({
        data: {
          tenantId,
          name,
          builderType: src.builderType,
          categoryId: src.categoryId,
          designJson: src.designJson as any,
          renderedHtml: src.renderedHtml,
          thumbnailUrl: src.thumbnailUrl,
          isGallery: false,
        },
      });
    });
  }
}