import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, IsBooleanString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const BUILDER = ['classic', 'pro'] as const;

// --- Template Categories ---
export class CreateCategoryDto {
  @IsString() @IsNotEmpty() name: string;
}
export class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
}

// --- Templates ---
export class CreateTemplateDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsEnum(BUILDER) builderType?: (typeof BUILDER)[number];
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsObject() designJson?: Record<string, unknown>;
  @IsOptional() @IsString() renderedHtml?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
}
export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(BUILDER) builderType?: (typeof BUILDER)[number];
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsObject() designJson?: Record<string, unknown>;
  @IsOptional() @IsString() renderedHtml?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
}
export class ListTemplatesQueryDto extends PaginationDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(BUILDER) builderType?: (typeof BUILDER)[number];
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsBooleanString() gallery?: string; // "true"/"false"
}

// --- Signatures ---
export class CreateSignatureDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() fromName: string;
  @IsString() @IsNotEmpty() fromEmail: string;
  @IsOptional() @IsString() replyTo?: string;
}
export class UpdateSignatureDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() fromEmail?: string;
  @IsOptional() @IsString() replyTo?: string;
}

// --- Form Templates ---
const FORM_TYPE = ['embedded', 'popup', 'hosted'] as const;
export class CreateFormTemplateDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsEnum(FORM_TYPE) type?: (typeof FORM_TYPE)[number];
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  @IsOptional() @IsObject() designJson?: Record<string, unknown>;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
  @IsOptional() @IsString() thumbnailUrl?: string;
}
export class UpdateFormTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(FORM_TYPE) type?: (typeof FORM_TYPE)[number];
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  @IsOptional() @IsObject() designJson?: Record<string, unknown>;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
  @IsOptional() @IsString() thumbnailUrl?: string;
}