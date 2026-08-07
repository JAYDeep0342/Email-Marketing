import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

class SegmentCondition {
  @IsString() @IsNotEmpty() field: string; // status | email | firstName | lastName | attributes.<key>
  @IsIn(['eq', 'neq', 'contains']) op: 'eq' | 'neq' | 'contains';
  @IsString() value: string;
}

class SegmentRules {
  @IsIn(['all', 'any']) match: 'all' | 'any';
  @IsArray() @ValidateNested({ each: true }) @Type(() => SegmentCondition)
  conditions: SegmentCondition[];
}

export class CreateSegmentDto {
  @IsString() @IsNotEmpty() name: string;
  @ValidateNested() @Type(() => SegmentRules) rules: SegmentRules;
}

export class UpdateSegmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @ValidateNested() @Type(() => SegmentRules) rules?: SegmentRules;
}

export class SegmentPreviewQuery extends PaginationDto {}