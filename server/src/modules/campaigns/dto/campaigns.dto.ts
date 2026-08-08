import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Local const arrays instead of importing Prisma enums — same pattern as
// templates.dto.ts (BUILDER). Keeps DTOs independent of the generated client.
export const CAMPAIGN_STATUS = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'paused',
  'cancelled',
] as const;
export type CampaignStatusValue = (typeof CAMPAIGN_STATUS)[number];

// --- Campaigns ---
export class CreateCampaignDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() subject: string;

  @IsOptional() @IsString() preheader?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() fromEmail?: string;

  @IsOptional() @IsUUID() signatureId?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsUUID() listId?: string;
  @IsOptional() @IsUUID() segmentId?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() subject?: string;
  @IsOptional() @IsString() preheader?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() fromEmail?: string;

  @IsOptional() @IsUUID() signatureId?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsUUID() listId?: string;
  @IsOptional() @IsUUID() segmentId?: string;
}

export class ListCampaignsQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(CAMPAIGN_STATUS) status?: CampaignStatusValue;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() templateId?: string;
}

export class ScheduleCampaignDto {
  // ISO-8601 string, e.g. "2026-08-20T10:00:00.000Z"
  @IsDateString() scheduledAt: string;
}

export class ListRecipientsQueryDto extends PaginationDto {}