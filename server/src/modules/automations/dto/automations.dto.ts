import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { STEP_TYPES, TRIGGER_TYPES } from '../automations.constants';

// ---- Steps ----
export class AutomationStepDto {
  @IsInt() @Min(0) stepOrder: number;

  @IsString() @IsIn(STEP_TYPES as unknown as string[]) stepType: string;

  // Shape depends on stepType — validated per-type in the executor. Examples:
  //  send_email : { templateId, subject, signatureId? | fromName?, fromEmail? }
  //  wait       : { minutes? , hours? , days? }
  //  add_tag / remove_tag : { tagId }
  //  add_to_list: { listId }
  //  condition  : { kind: 'has_tag', tagId, onFalse: 'exit' | 'continue' }
  //  exit       : {}
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

// ---- Automation CRUD ----
export class CreateAutomationDto {
  @IsString() @IsNotEmpty() name: string;

  @IsString() @IsIn(TRIGGER_TYPES as unknown as string[]) triggerType: string;

  // e.g. { listId } for contact_added_to_list; { allowReEnrollment?: boolean }
  @IsOptional() @IsObject() triggerConfig?: Record<string, unknown>;

  // Optional: define steps inline at create time.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationStepDto)
  steps?: AutomationStepDto[];
}

export class UpdateAutomationDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsObject() triggerConfig?: Record<string, unknown>;
}

// Replace the whole step list (simplest, avoids per-step ordering churn).
export class SetStepsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationStepDto)
  steps: AutomationStepDto[];
}

// ---- Manual enroll ----
export class EnrollDto {
  @IsUUID() contactId: string;
}

export class ListRunsQueryDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
}