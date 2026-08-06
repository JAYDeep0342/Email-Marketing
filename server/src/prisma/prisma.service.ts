import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly cls: ClsService) {
    const adapter = new PrismaPg({
      connectionString: process.env.APP_DATABASE_URL as string,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `work` inside a transaction where RLS is scoped to `tenantId`.
   * SET LOCAL only lasts for this transaction, so tenant context can't
   * leak onto a pooled connection used by another request.
   */
  async withTenant<T>(
    tenantId: string,
    work: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // set_config(key, value, is_local=true) == SET LOCAL
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  /**
   * Same as withTenant, but reads the tenantId from CLS (set by the
   * TenantContextInterceptor). Use this in services so you never have to
   * thread tenantId manually.
   */
  async withCurrentTenant<T>(
    work: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new Error('No tenant in context (CLS tenantId is empty)');
    }
    return this.withTenant(tenantId, work);
  }
}
