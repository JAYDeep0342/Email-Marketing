import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { paginated } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckQuota } from '../billing/decorators/plan-gating.decorators';
import { AutomationsService } from './automations.service';
import { EnrollmentService } from './enrollment.service';
import {
  CreateAutomationDto,
  EnrollDto,
  ListRunsQueryDto,
  SetStepsDto,
  UpdateAutomationDto,
} from './dto/automations.dto';

@Controller('automations')
export class AutomationsController {
  constructor(
    private readonly automations: AutomationsService,
    private readonly enrollment: EnrollmentService,
    private readonly prisma: PrismaService,
  ) {}

  // --- CRUD ---
  @CheckQuota('automations')
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateAutomationDto) {
    return this.automations.create(tenantId, dto);
  }

  @Get()
  list(@Query() q: ListRunsQueryDto) {
    return this.automations.list(q.page, q.limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.automations.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.automations.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.automations.remove(id);
  }

  // --- Steps (replace the whole ordered list) ---
  @Put(':id/steps')
  setSteps(@Param('id') id: string, @Body() dto: SetStepsDto) {
    return this.automations.setSteps(id, dto);
  }

  // --- Status ---
  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string) {
    return this.automations.activate(id);
  }

  @Post(':id/pause')
  @HttpCode(200)
  pause(@Param('id') id: string) {
    return this.automations.pause(id);
  }

  // --- Manual enroll ---
  @Post(':id/enroll')
  @HttpCode(200)
  async enroll(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: EnrollDto,
  ) {
    const run = await this.enrollment.enroll(tenantId, id, dto.contactId);
    return run
      ? { message: 'Enrolled', runId: run.id }
      : { message: 'Not enrolled (inactive, no steps, or already enrolled)' };
  }

  // --- Runs (read) ---
  @Get(':id/runs')
  runs(@Param('id') id: string, @Query() q: ListRunsQueryDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const where: any = { automationId: id };
      if (q.status) where.status = q.status;
      const [rows, total] = await Promise.all([
        tx.automationRun.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        tx.automationRun.count({ where }),
      ]);
      return paginated(rows, total, q.page, q.limit);
    });
  }
}