import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateListDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateListDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}

export class AddContactsDto {
  @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true })
  contactIds: string[];
}