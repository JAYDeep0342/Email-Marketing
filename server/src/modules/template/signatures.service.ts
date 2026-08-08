import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSignatureDto, UpdateSignatureDto } from './dto/templates.dto';
import { normalizeEmail } from '../../common/utils/email.util';

@Injectable()
export class SignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withCurrentTenant((tx) =>
      tx.signature.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  create(tenantId: string, dto: CreateSignatureDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.signature.create({
        data: {
          tenantId,
          name: dto.name,
          fromName: dto.fromName,
          fromEmail: normalizeEmail(dto.fromEmail),
          replyTo: dto.replyTo ? normalizeEmail(dto.replyTo) : undefined,
          isVerified: false,
        },
      }),
    );
  }

  async update(id: string, dto: UpdateSignatureDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const s = await tx.signature.findFirst({ where: { id }, select: { id: true } });
      if (!s) throw new NotFoundException('Signature not found');
      return tx.signature.update({
        where: { id },
        data: {
          name: dto.name,
          fromName: dto.fromName,
          fromEmail: dto.fromEmail ? normalizeEmail(dto.fromEmail) : undefined,
          replyTo: dto.replyTo ? normalizeEmail(dto.replyTo) : undefined,
        },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const s = await tx.signature.findFirst({ where: { id }, select: { id: true } });
      if (!s) throw new NotFoundException('Signature not found');
      await tx.signature.delete({ where: { id } });
      return { message: 'Signature deleted' };
    });
  }

  // STUB: real domain/sender verification later (SPF/DKIM). For now just flip the flag.
  async verify(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const s = await tx.signature.findFirst({ where: { id }, select: { id: true } });
      if (!s) throw new NotFoundException('Signature not found');
      return tx.signature.update({ where: { id }, data: { isVerified: true } });
    });
  }

  // POST /signatures/:id/default — only one default per tenant
  async setDefault(tenantId: string, id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const s = await tx.signature.findFirst({ where: { id }, select: { id: true } });
      if (!s) throw new NotFoundException('Signature not found');

      await tx.signature.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.signature.update({ where: { id }, data: { isDefault: true } });
    });
  }
}