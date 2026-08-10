import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret } from '../../common/utils/crypto.util';
import { CreateSendingServerDto, SENDING_PROVIDER } from './dto/sending.dto';

/**
 * sending_servers has NO tenant_id — it is PLATFORM infrastructure, shared by
 * all tenants and managed by the SaaS operator. RLS does not apply. Real admin
 * management lands in the Platform Admin module; these endpoints exist so the
 * Sending Engine can be exercised end-to-end in dev.
 *
 * Because it is not tenant-scoped, these queries run on the raw client
 * (NOT withTenant) — there is no tenant context to set.
 */
@Injectable()
export class SendingServerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSendingServerDto) {
    if (!SENDING_PROVIDER.includes(dto.provider as any)) {
      throw new BadRequestException(
        `provider must be one of: ${SENDING_PROVIDER.join(', ')}`,
      );
    }
    // Always store an encrypted blob (never plaintext). 'log' / no creds => '{}'.
    const encrypted = encryptSecret(dto.credentials ?? '{}');

    const server = await this.prisma.sendingServer.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        encryptedCredentials: encrypted,
        hourlyQuota: dto.hourlyQuota,
        dailyQuota: dto.dailyQuota,
        isActive: dto.isActive ?? true,
      },
    });
    return this.strip(server);
  }

  async list() {
    const rows = await this.prisma.sendingServer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.strip(r));
  }

  async remove(id: string) {
    const found = await this.prisma.sendingServer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Sending server not found');
    await this.prisma.sendingServer.delete({ where: { id } });
    return { message: 'Sending server deleted' };
  }

  /**
   * Pick the sending server the engine should use right now.
   * Simplest viable policy: first active server. Returns null when none exist,
   * in which case the engine falls back to the env SMTP/log transport.
   */
  async pickActive() {
    return this.prisma.sendingServer.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Never leak encrypted credentials over the API. */
  private strip<T extends { encryptedCredentials?: string }>(row: T) {
    const { encryptedCredentials: _omit, ...rest } = row as any;
    return rest;
  }
}