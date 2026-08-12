import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

// Local â same convention as CAMPAIGN_STATUS, keeps DTOs enum-free.
export const BILLING_PERIODS = ['monthly', 'yearly'] as const;
export type BillingPeriodValue = (typeof BILLING_PERIODS)[number];

// ============================================================
//  Plans (admin CRUD)
// ============================================================

export class CreatePlanDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() code: string;

  @IsInt() @Min(0) priceCents: number;

  @IsOptional() @IsUUID() currencyId?: string;

  @IsOptional() @IsIn(BILLING_PERIODS) billingPeriod?: BillingPeriodValue;

  @IsOptional() @IsString() planType?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  // Optional PlanLimit fields â nested to keep the API single-call.
  @IsOptional() @IsInt() @Min(0) maxContacts?: number;
  @IsOptional() @IsInt() @Min(0) maxLists?: number;
  @IsOptional() @IsInt() @Min(0) maxEmailsMonth?: number;
  @IsOptional() @IsInt() @Min(0) maxEmailsDay?: number;
  @IsOptional() @IsInt() @Min(0) maxUsers?: number;
  @IsOptional() @IsInt() @Min(0) maxCampaigns?: number;
  @IsOptional() @IsInt() @Min(0) maxAutomations?: number;
  @IsOptional() @IsBoolean() dedicatedIp?: boolean;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsUUID() currencyId?: string;
  @IsOptional() @IsIn(BILLING_PERIODS) billingPeriod?: BillingPeriodValue;
  @IsOptional() @IsString() planType?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() @IsInt() @Min(0) maxContacts?: number;
  @IsOptional() @IsInt() @Min(0) maxLists?: number;
  @IsOptional() @IsInt() @Min(0) maxEmailsMonth?: number;
  @IsOptional() @IsInt() @Min(0) maxEmailsDay?: number;
  @IsOptional() @IsInt() @Min(0) maxUsers?: number;
  @IsOptional() @IsInt() @Min(0) maxCampaigns?: number;
  @IsOptional() @IsInt() @Min(0) maxAutomations?: number;
  @IsOptional() @IsBoolean() dedicatedIp?: boolean;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
}

// ============================================================
//  Subscription actions (tenant-scoped)
// ============================================================

export class ChangePlanDto {
  @IsUUID()
  planId: string;
}

// Body for `POST /billing/subscription/checkout` â returns a Razorpay-hosted
// checkout link the frontend redirects to.
export class CreateCheckoutDto {
  @IsUUID()
  planId: string;
}
