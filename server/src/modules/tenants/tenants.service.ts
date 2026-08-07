import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateTenantDto } from './dto/tenants.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(tenantId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          bounceRate: true,
          whiteLabel: true,
          createdAt: true,
          plan: {
            select: { id: true, name: true, code: true, priceCents: true },
          },
        },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return tenant;
    });
  }

  async updateCurrent(tenantId: string, dto: UpdateTenantDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: dto.name,
          whiteLabel: dto.whiteLabel as any,
        },
        select: { id: true, name: true, slug: true, whiteLabel: true },
      }),
    );
  }
}
