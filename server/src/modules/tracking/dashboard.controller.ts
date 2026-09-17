import { Controller, Get, Query } from '@nestjs/common';
import { DashboardAnalyticsService } from './dashboard.service';
import { DashboardRangeQueryDto, TopCampaignsQueryDto } from './dto/dashboard.dto';

/**
 * Tenant-wide dashboard aggregates (Dashboard Pass 2). Sibling to
 * AnalyticsController's per-campaign endpoints — same guard (global
 * JwtAuthGuard, no @Public()), same {success,data} envelope via the global
 * ResponseInterceptor, no explicit @Api* decorators (this codebase relies on
 * the @nestjs/swagger CLI plugin to infer everything from these DTOs).
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardAnalyticsService) {}

  @Get('overview')
  overview(@Query() q: DashboardRangeQueryDto) {
    return this.dashboard.overview(q.days ?? 7);
  }

  @Get('activity')
  activity(@Query() q: DashboardRangeQueryDto) {
    return this.dashboard.activity(q.days ?? 7);
  }

  @Get('top-campaigns')
  topCampaigns(@Query() q: TopCampaignsQueryDto) {
    return this.dashboard.topCampaigns(q.limit ?? 5);
  }
}
