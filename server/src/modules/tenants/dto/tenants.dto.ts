import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsObject() whiteLabel?: Record<string, unknown>;
}