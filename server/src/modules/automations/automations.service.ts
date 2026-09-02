import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import {
  CreateAutomationDto,
  SetStepsDto,
  UpdateAutomationDto,
} from './dto/automations.dto';
import { STEP_TYPES, TRIGGER_TYPES } from './automations.constants';

/**
 * CRUD for automations and their steps. All tenant-scoped via withCurrentTenant
 * (automations / automation_steps are RLS-forced).
 *
 * Activation rule: an automation can only go 'active' if it has ≥1 step, and
 * every send_email step must resolve to a real from-address (a signature that
 * actually exists, or an explicit fromEmail) — otherwise it fails loudly here
 * instead of silently sending blank-From mail once it's live. Drafts can still
 * be saved via setSteps() without this yet in place; only activation gates it.
 * A paused automation stops NEW enrollment but does not kill in-flight runs.
 */
@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateAutomationDto) {
    if (!TRIGGER_TYPES.includes(dto.triggerType as any)) {
      throw new BadRequestException('Invalid triggerType');
    }
    return this.prisma.withCurrentTenant(async (tx) => {
      const automation = await tx.automation.create({
        data: {
          tenantId,
          name: dto.name,
          triggerType: dto.triggerType,
          triggerConfig: (dto.triggerConfig ?? {}) as any,
          status: 'draft',
        },
      });
      if (dto.steps?.length) {
        this.assertStepsValid(dto.steps);
        await tx.automationStep.createMany({
          data: dto.steps.map((s) => ({
            tenantId,
            automationId: automation.id,
            stepOrder: s.stepOrder,
            stepType: s.stepType,
            config: (s.config ?? {}) as any,
          })),
        });
      }
      return this.loadFull(tx, automation.id);
    });
  }

  async list(page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.automation.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.automation.count(),
      ]);
      return paginated(rows, total, page, limit);
    });
  }

  async findOne(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);
      return this.loadFull(tx, id);
    });
  }

  async update(id: string, dto: UpdateAutomationDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);
      await tx.automation.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.triggerConfig !== undefined
            ? { triggerConfig: dto.triggerConfig as any }
            : {}),
        },
      });
      return this.loadFull(tx, id);
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);
      await tx.automation.delete({ where: { id } }); // steps/runs cascade
      return { message: 'Automation deleted' };
    });
  }

  async setSteps(id: string, dto: SetStepsDto) {
    this.assertStepsValid(dto.steps);
    return this.prisma.withCurrentTenant(async (tx) => {
      const a = await this.mustExist(tx, id);
      if (a.status === 'active') {
        throw new ConflictException(
          'Pause the automation before editing its steps',
        );
      }
      await tx.automationStep.deleteMany({ where: { automationId: id } });
      await tx.automationStep.createMany({
        data: dto.steps.map((s) => ({
          tenantId: a.tenantId,
          automationId: id,
          stepOrder: s.stepOrder,
          stepType: s.stepType,
          config: (s.config ?? {}) as any,
        })),
      });
      return this.loadFull(tx, id);
    });
  }

  async activate(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);
      const steps = await tx.automationStep.findMany({
        where: { automationId: id },
        select: { stepType: true, config: true },
      });
      if (steps.length === 0) {
        throw new BadRequestException('Cannot activate an automation with no steps');
      }
      await this.assertSendEmailFromAddress(tx, steps);
      await tx.automation.update({ where: { id }, data: { status: 'active' } });
      return this.loadFull(tx, id);
    });
  }

  async pause(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await this.mustExist(tx, id);
      await tx.automation.update({ where: { id }, data: { status: 'paused' } });
      return this.loadFull(tx, id);
    });
  }

  // ---- helpers ----

  private async mustExist(tx: any, id: string) {
    const a = await tx.automation.findFirst({ where: { id } });
    if (!a) throw new NotFoundException('Automation not found');
    return a;
  }

  private async loadFull(tx: any, id: string) {
    return tx.automation.findFirst({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  // A send_email step must resolve to a real from-address at send time
  // (EmailProcessor.loadAutomationSource(): signature?.fromEmail ?? cfg.fromEmail ?? '').
  // Checked here rather than there — activation is the setup-time gate; the
  // send pipeline itself is untouched. A signatureId that doesn't actually
  // exist would ALSO resolve to '' at send time, so this verifies the
  // signature is real, not just that the field is present.
  private async assertSendEmailFromAddress(
    tx: any,
    steps: { stepType: string; config: any }[],
  ) {
    for (const s of steps) {
      if (s.stepType !== 'send_email') continue;
      const cfg = s.config ?? {};
      if (cfg.fromEmail) continue;
      if (cfg.signatureId) {
        const sig = await tx.signature.findFirst({
          where: { id: cfg.signatureId },
          select: { fromEmail: true },
        });
        if (sig?.fromEmail) continue;
      }
      throw new BadRequestException(
        'A send_email step needs a from-address — set either a signatureId (pointing to an existing signature) or an explicit fromEmail in the step config.',
      );
    }
  }

  private assertStepsValid(steps: { stepOrder: number; stepType: string }[]) {
    if (!steps.length) return;
    const orders = new Set<number>();
    for (const s of steps) {
      if (!STEP_TYPES.includes(s.stepType as any)) {
        throw new BadRequestException(`Invalid stepType: ${s.stepType}`);
      }
      if (orders.has(s.stepOrder)) {
        throw new BadRequestException(`Duplicate stepOrder: ${s.stepOrder}`);
      }
      orders.add(s.stepOrder);
    }
  }
}