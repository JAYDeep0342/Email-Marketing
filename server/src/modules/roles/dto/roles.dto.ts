import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

export class CreateRoleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true })
  permissions?: string[]; // permission keys
}

export class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true })
  permissions?: string[];
}