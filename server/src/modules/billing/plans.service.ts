import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/billing.dto';

/**
 * Plans are PLATFORM-level (no tenantId column, not RLS-scoped) â same status
 * as SendingServer / PaymentGateway. Tenants read them but only platform admin
 * mutates them.
 *
 * PlanLimit is 1:1 with Plan (unique(planId)). We upsert it in the same
 * transaction so a plan always has consistent limits â a partial write here
 * would silently uncap gated features.
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  // Public: only active plans, PlanLimit always included so pricing pages
  // can render feature comparisons in one call.
  async listPublic() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
      include: { planLimit: true, currency: true },
    });
  }

  // Admin: everything, active or not, ordered for consistent super-admin UI.
  async listAdmin() {
    return this.prisma.plan.findMany({
      orderBy: [{ isActive: 'desc' }, { priceCents: 'asc' }],
      include: { planLimit: true, currency: true },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { planLimit: true, currency: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    // Plan.code is @unique â pre-check for a nicer error than the P2002 leak.
    const existing = await this.prisma.plan.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Plan code '${dto.code}' already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          name: dto.name,
          code: dto.code,
          priceCents: dto.priceCents,
          currencyId: dto.currencyId,
          billingPeriod: dto.billingPeriod ?? 'monthly',
          planType: dto.planType ?? 'general',
          isActive: dto.isActive ?? true,
        },
      });

      await tx.planLimit.create({
        data: {
          planId: plan.id,
          maxContacts: dto.maxContacts,
          maxLists: dto.maxLists,
          maxEmailsMonth: dto.maxEmailsMonth,
          maxEmailsDay: dto.maxEmailsDay,
          maxUsers: dto.maxUsers,
          maxCampaigns: dto.maxCampaigns,
          maxAutomations: dto.maxAutomations,
          dedicatedIp: dto.dedicatedIp ?? false,
          aiEnabled: dto.aiEnabled ?? false,
        },
      });

      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { planLimit: true, currency: true },
      });
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plan not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
          ...(dto.currencyId !== undefined ? { currencyId: dto.currencyId } : {}),
          ...(dto.billingPeriod !== undefined
            ? { billingPeriod: dto.billingPeriod }
            : {}),
          ...(dto.planType !== undefined ? { planType: dto.planType } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      // Upsert PlanLimit only if any limit field is in the payload â otherwise
      // partial updates to Plan don't accidentally reset unrelated limits.
      const limitFields = [
        'maxContacts',
        'maxLists',
        'maxEmailsMonth',
        'maxEmailsDay',
        'maxUsers',
        'maxCampaigns',
        'maxAutomations',
        'dedicatedIp',
        'aiEnabled',
      ] as const;
      const anyLimit = limitFields.some((k) => (dto as any)[k] !== undefined);

      if (anyLimit) {
        await tx.planLimit.upsert({
          where: { planId: id },
          update: Object.fromEntries(
            limitFields
              .filter((k) => (dto as any)[k] !== undefined)
              .map((k) => [k, (dto as any)[k]]),
          ),
          create: {
            planId: id,
            maxContacts: dto.maxContacts,
            maxLists: dto.maxLists,
            maxEmailsMonth: dto.maxEmailsMonth,
            maxEmailsDay: dto.maxEmailsDay,
            maxUsers: dto.maxUsers,
            maxCampaigns: dto.maxCampaigns,
            maxAutomations: dto.maxAutomations,
            dedicatedIp: dto.dedicatedIp ?? false,
            aiEnabled: dto.aiEnabled ?? false,
          },
        });
      }

      return tx.plan.findUnique({
        where: { id },
        include: { planLimit: true, currency: true },
      });
    });
  }

  async remove(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, select: { id: true } });
    if (!plan) throw new NotFoundException('Plan not found');

    // Refuse to delete a plan that's in use â the FK on Tenant.planId is
    // nullable and Subscription.planId is NOT, so a delete could orphan
    // real customers. Safer to prompt the admin to deactivate + migrate.
    //
    // This is a cross-tenant usage check (any tenant/subscription anywhere),
    // and `subscriptions` is under FORCE ROW LEVEL SECURITY — a plain
    // `_count` include has no tenant context to satisfy that policy, so it
    // goes through a SECURITY DEFINER function instead (same pattern as
    // billing_expired_trials / billing_subscription_lookup_by_provider_id).
    const usage = await this.prisma.$queryRaw<
      Array<{ tenant_count: bigint; subscription_count: bigint }>
    >`SELECT tenant_count, subscription_count FROM billing_plan_usage_counts(${id}::uuid)`;
    const { tenant_count, subscription_count } = usage[0];
    if (Number(tenant_count) > 0 || Number(subscription_count) > 0) {
      throw new BadRequestException(
        'Plan is in use by tenants or subscriptions; deactivate it instead',
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    return { message: 'Plan deleted' };
  }
}
