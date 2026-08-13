import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

// Local const arrays instead of importing Prisma enums — same pattern as
// campaigns.dto.ts (CAMPAIGN_STATUS). Keeps DTOs independent of the client.
export const SENDING_PROVIDER = ['smtp', 'ses', 'sendgrid', 'log'] as const;
export type SendingProviderValue = (typeof SENDING_PROVIDER)[number];

// A permissive but sane domain matcher (labels + TLD, no scheme/path).
const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

// ============================================================
//  Sending Domains (tenant-scoped)
// ============================================================
export class CreateSendingDomainDto {
  @IsString()
  @IsNotEmpty()
  @Matches(DOMAIN_RE, { message: 'domain must be a bare hostname, e.g. mail.acme.com' })
  domain: string;
}

// ============================================================
//  Sending Servers (PLATFORM-level — no tenantId in schema)
//  Exposed here for dev/testing; real management belongs to Platform Admin.
// ============================================================
export class CreateSendingServerDto {
  @IsString() @IsNotEmpty() name: string;

  // one of SENDING_PROVIDER — validated in the service to keep DTO enum-free
  @IsString() @IsNotEmpty() provider: string;

  // Raw credentials JSON string (e.g. {"host","port","user","pass","secure"}).
  // Stored encrypted; never returned.
  @IsOptional() @IsString() credentials?: string;

  @IsOptional() @IsInt() @Min(1) hourlyQuota?: number;
  @IsOptional() @IsInt() @Min(1) dailyQuota?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}