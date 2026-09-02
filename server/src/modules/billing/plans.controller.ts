import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/billing.dto';
import { PlatformAdminGuard } from './guards/platform-admin.guard';

/**
 * Public plans (signup / pricing page). Admin plan management (below) is
 * restricted to platform admins via PlatformAdminGuard (BUG #3).
 */
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  // Public: pricing page. No auth needed â plans are marketing content.
  @Public()
  @Get()
  listPublic() {
    return this.plans.listPublic();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.findOne(id);
  }
}

/**
 * Admin plan management. Restricted to platform admins only (BUG #3) via
 * PlatformAdminGuard, checked fresh from the DB on every request.
 */
@Controller('admin/plans')
@UseGuards(PlatformAdminGuard)
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.listAdmin();
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.remove(id);
  }
}
