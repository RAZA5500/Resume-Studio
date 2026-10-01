import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const IMPROVE_MODES = [
  'bullets',
  'summary',
  'grammar',
  'shorten',
  'expand',
  'professional',
  'quantify',
  'simplify',
  'custom',
] as const;

export class GenerateResumeDto {
  @IsString()
  @Length(10, 8000, { message: 'Tell us a little more about yourself (at least 10 characters).' })
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetRole?: string;

  @IsOptional()
  @IsIn(['student', 'entry', 'mid', 'senior', 'executive'])
  experienceLevel?: string;

  /** Fill an existing resume instead of creating a new one (does not use the daily allowance). */
  @IsOptional()
  @IsUUID()
  resumeId?: string;
}

/** Multipart fields sent with /ai/parse-resume. */
export class ParseResumeDto {
  @IsOptional()
  @IsUUID()
  resumeId?: string;
}

export class SummaryDto {
  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetRole?: string;

  @IsOptional()
  @IsIn(['professional', 'confident', 'friendly', 'formal', 'creative'])
  tone?: string;
}

export class ImproveTextDto {
  @IsString()
  @Length(1, 10000)
  text: string;

  @IsIn(IMPROVE_MODES)
  mode: (typeof IMPROVE_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  instruction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  context?: string;
}

export class BulletsDto {
  @IsString()
  @Length(2, 120)
  jobTitle: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  context?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  existing?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;
}

export class SkillsDto {
  @IsString()
  @Length(2, 120)
  jobTitle: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  existing?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(15000)
  jobDescription?: string;
}

export class TailorDto {
  @IsObject()
  content: Record<string, unknown>;

  @IsString()
  @Length(30, 15000, { message: 'Paste the full job description (at least 30 characters).' })
  jobDescription: string;
}

export class CoverLetterDto {
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  resumeId?: string;

  @IsString()
  @Length(20, 15000, { message: 'Paste the job description (at least 20 characters).' })
  jobDescription: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hiringManager?: string;

  @IsOptional()
  @IsIn(['professional', 'confident', 'friendly', 'formal', 'enthusiastic'])
  tone?: string;
}
