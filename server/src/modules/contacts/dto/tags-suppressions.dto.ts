import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateTagDto {
  @IsString() @IsNotEmpty() name: string;
}

export class CreateSuppressionDto {
  @IsEmail() email: string;
  @IsEnum(['hard_bounce', 'complaint', 'unsubscribe', 'manual'])
  reason: 'hard_bounce' | 'complaint' | 'unsubscribe' | 'manual';
}