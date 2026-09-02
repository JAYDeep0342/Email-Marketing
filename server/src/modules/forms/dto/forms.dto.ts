import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FORM_TYPES } from '../forms.constants';
import type { FormTypeValue } from '../forms.constants';

// ============================================================
//  Admin CRUD DTOs
// ============================================================

// `fields` needs an explicit nested type — without @ValidateNested +
// @Type, the global ValidationPipe's whitelist:true strips every property
// off each array element (they don't match any known DTO shape), so a
// posted [{name,label}] round-trips as [[]]. Same pattern as
// AutomationStepDto in automations.dto.ts.
export class FormFieldDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() label: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

export class CreateFormDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @IsOptional() @IsIn(FORM_TYPES)
  type?: FormTypeValue;

  // If set, submissions are auto-added to this list. Validated in service
  // against the caller's tenant (RLS + app-level check).
  @IsOptional() @IsUUID()
  listId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @IsOptional() @IsObject()
  settings?: Record<string, any>;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateFormDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @IsIn(FORM_TYPES)
  type?: FormTypeValue;

  // Explicit null clears the list link; undefined leaves it alone.
  @IsOptional() @IsUUID()
  listId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @IsOptional() @IsObject()
  settings?: Record<string, any>;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// ============================================================
//  Public submit DTO
//  Kept intentionally lax: `data` is whatever the form's fields captured.
//  We only require an email — everything else is optional and stored raw.
// ============================================================

export class SubmitFormDto {
  @IsEmail()
  email: string;

  @IsOptional() @IsString() @MaxLength(200)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(200)
  lastName?: string;

  // Arbitrary custom fields captured by the form. Stored in form_submissions.data
  // AND merged into contacts.attributes on upsert.
  @IsOptional() @IsObject()
  data?: Record<string, any>;
}