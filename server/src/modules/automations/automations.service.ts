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
 * Activation rule: an automation can only go 'active' if it has ≥1 step. A
 * paused automation stops NEW enrollment but does not kill in-flight runs.
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
      const stepCount = await tx.automationStep.count({
        where: { automationId: id },
      });
      if (stepCount === 0) {
        throw new BadRequestException('Cannot activate an automation with no steps');
      }
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