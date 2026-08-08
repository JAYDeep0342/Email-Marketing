import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFormTemplateDto, UpdateFormTemplateDto } from './dto/templates.dto';

@Injectable()
export class FormTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withCurrentTenant((tx) =>
      tx.formTemplate.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const f = await tx.formTemplate.findFirst({ where: { id } });
      if (!f) throw new NotFoundException('Form template not found');
      return f;
    });
  }

  create(tenantId: string, dto: CreateFormTemplateDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.formTemplate.create({
        data: {
          tenantId,
          name: dto.name,
          type: dto.type ?? 'embedded',
          fields: (dto.fields ?? {}) as any,
          designJson: dto.designJson as any,
          settings: (dto.settings ?? {}) as any,
          thumbnailUrl: dto.thumbnailUrl,
          isGallery: false,
        },
      }),
    );
  }

  async update(id: string, dto: UpdateFormTemplateDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const f = await tx.formTemplate.findFirst({ where: { id } });
      if (!f) throw new NotFoundException('Form template not found');
      if (f.tenantId === null)
        throw new ForbiddenException('Gallery form templates cannot be modified');
      return tx.formTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          fields: dto.fields as any,
          designJson: dto.designJson as any,
          settings: dto.settings as any,
          thumbnailUrl: dto.thumbnailUrl,
        },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const f = await tx.formTemplate.findFirst({ where: { id } });
      if (!f) throw new NotFoundException('Form template not found');
      if (f.tenantId === null)
        throw new ForbiddenException('Gallery form templates cannot be deleted');
      await tx.formTemplate.delete({ where: { id } });
      return { message: 'Form template deleted' };
    });
  }
}