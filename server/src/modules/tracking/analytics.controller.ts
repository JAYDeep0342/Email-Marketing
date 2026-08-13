import { Controller, Get, Param } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { AnalyticsService } from './analytics.service';

/**
 * Authenticated analytics reads (global JwtAuthGuard applies — no @Public()).
 * tenantId comes from the request context and is passed explicitly, because the
 * events-table reads underneath cannot rely on RLS.
 */
@Controller('campaigns')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(':id/analytics')
  campaign(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.analytics.campaign(tenantId, id);
  }

  @Get(':id/analytics/timeline')
  timeline(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.analytics.timeline(tenantId, id);
  }
}