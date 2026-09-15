import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// Same local-const-array convention as CAMPAIGN_STATUS / BUILDER elsewhere —
// keeps DTOs enum-free and independent of the generated Prisma client.
export const DASHBOARD_RANGE_DAYS = [7, 30, 90] as const;
export type DashboardRangeDays = (typeof DASHBOARD_RANGE_DAYS)[number];

export class DashboardRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(DASHBOARD_RANGE_DAYS)
  days?: DashboardRangeDays = 7;
}

export class TopCampaignsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 5;
}
