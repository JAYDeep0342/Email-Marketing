import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/billing.dto';

/**
 * Public plans (signup / pricing page).
 *
 * NOTE ON AUTH FOR ADMIN ROUTES BELOW: Platform Admin (Step 20) will add a
 * proper super-admin guard. For now these are auth'd via JwtAuthGuard only,
 * meaning any signed-in user could hit them. Before Step 20 ships, wrap the
 * admin controller with a role check or move it to /admin/*.
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
 * Admin plan management. See note above about auth â this is a temporary
 * home until Platform Admin (Step 20).
 */
@Controller('admin/plans')
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
