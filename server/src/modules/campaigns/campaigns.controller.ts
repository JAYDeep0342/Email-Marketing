import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CheckQuota } from '../billing/decorators/plan-gating.decorators';
import { CampaignsService } from './campaigns.service';
import { CampaignRecipientsService } from './campaign-recipients.service';
import {
  CreateCampaignDto,
  ListCampaignsQueryDto,
  ListRecipientsQueryDto,
  ScheduleCampaignDto,
  UpdateCampaignDto,
} from './dto/campaigns.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly recipients: CampaignRecipientsService,
  ) {}

  // --- CRUD ---
  @CheckQuota('campaigns')
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(tenantId, dto);
  }

  @Get()
  list(@Query() q: ListCampaignsQueryDto) {
    return this.campaigns.list(q);
  }

  // NOTE: static sub-paths would be shadowed by ':id' if declared after it,
  // so keep any future literal routes (e.g. 'stats-summary') ABOVE this line.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }

  @Post(':id/duplicate')
  duplicate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.campaigns.duplicate(tenantId, id);
  }

  // --- Status actions (200, not 201 — they mutate an existing resource) ---
  // NOTE (Step 16A): this codebase has no separate "send now" endpoint —
  // `schedule` is the action that actually queues a campaign for sending
  // (CampaignDispatchService's poller picks up due 'scheduled' rows), so
  // that's where the emails_month gate belongs. unit=1 only checks "can this
  // tenant send AT ALL this month" — a full recipient-count-aware check is
  // deferred to 16B per INTEGRATION.md.
  @CheckQuota('emails_month')
  @Post(':id/schedule')
  @HttpCode(200)
  schedule(@Param('id') id: string, @Body() dto: ScheduleCampaignDto) {
    return this.campaigns.schedule(id, dto);
  }

  @Post(':id/unschedule')
  @HttpCode(200)
  unschedule(@Param('id') id: string) {
    return this.campaigns.unschedule(id);
  }

  @Post(':id/pause')
  @HttpCode(200)
  pause(@Param('id') id: string) {
    return this.campaigns.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  resume(@Param('id') id: string) {
    return this.campaigns.resume(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.campaigns.cancel(id);
  }

  // --- Recipients ---
  @Post(':id/resolve-recipients')
  @HttpCode(200)
  resolveRecipients(@Param('id') id: string) {
    return this.recipients.resolve(id);
  }

  @Get(':id/recipients')
  listRecipients(@Param('id') id: string, @Query() q: ListRecipientsQueryDto) {
    return this.recipients.list(id, q.page, q.limit);
  }

  @Delete(':id/recipients/:contactId')
  removeRecipient(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.recipients.remove(id, contactId);
  }

  // --- Read-only extras ---
  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.campaigns.stats(id);
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.campaigns.preview(id);
  }
}