import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';

@Injectable()
export class SuppressionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withCurrentTenant((tx) =>
      tx.suppression.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  async create(tenantId: string, email: string, reason: string) {
    const normalized = normalizeEmail(email);
    return this.prisma.withCurrentTenant(async (tx) => {
      const existing = await tx.suppression.findFirst({
        where: { email: normalized },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Email already suppressed');
      return tx.suppression.create({
        data: { tenantId, email: normalized, reason: reason as any },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const s = await tx.suppression.findFirst({ where: { id }, select: { id: true } });
      if (!s) throw new NotFoundException('Suppression not found');
      await tx.suppression.delete({ where: { id } });
      return { message: 'Suppression removed' };
    });
  }
}