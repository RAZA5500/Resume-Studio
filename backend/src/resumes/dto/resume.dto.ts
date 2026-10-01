import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateResumeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateId?: string;

  /** Pre-filled content (e.g. from AI generation or an imported file). */
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  /** Start with realistic example content instead of an empty resume. */
  @IsOptional()
  @IsBoolean()
  useSample?: boolean;
}

export class UpdateResumeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateId?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  design?: Record<string, unknown>;
}
