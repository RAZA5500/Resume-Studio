import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/** Multipart form fields sent alongside the uploaded resume file. */
export class AnalyzeFileDto {
  @IsOptional()
  @IsString()
  @MaxLength(15000)
  jobDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  useAi?: string;
}

export class AnalyzeResumeDto {
  @IsUUID()
  resumeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(15000)
  jobDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @IsOptional()
  @IsBoolean()
  useAi?: boolean;
}

export class AnalyzeTextDto {
  @IsString()
  @Length(50, 60000, { message: 'Paste your full resume text (at least 50 characters).' })
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(15000)
  jobDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @IsOptional()
  @IsBoolean()
  useAi?: boolean;
}
