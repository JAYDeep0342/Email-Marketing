import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const CONTACT_STATUS = [
  'subscribed',
  'unsubscribed',
  'bounced',
  'complained',
] as const;

export class CreateContactDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @IsOptional()
  @IsEnum(CONTACT_STATUS)
  status?: (typeof CONTACT_STATUS)[number];
}

export class UpdateContactDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @IsOptional()
  @IsEnum(CONTACT_STATUS)
  status?: (typeof CONTACT_STATUS)[number];
}

export class ListContactsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CONTACT_STATUS)
  status?: (typeof CONTACT_STATUS)[number];
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() listId?: string;
  @IsOptional() @IsUUID() tagId?: string;
}

class ImportContactItem {
  @IsString() @IsNotEmpty() email: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
}

export class ImportContactsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportContactItem)
  contacts: ImportContactItem[];

  @IsOptional() @IsUUID() listId?: string;
}

export class AddTagDto {
  @IsUUID() tagId: string;
}
