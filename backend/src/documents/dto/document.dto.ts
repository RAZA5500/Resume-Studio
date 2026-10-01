import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @Length(1, 200)
  name: string;

  @IsIn(['rich', 'canvas'])
  kind: 'rich' | 'canvas';

  /** Initial HTML for rich documents. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000_000)
  html?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(5000)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(5000)
  height?: number;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsObject()
  editorState?: Record<string, unknown>;

  /** Small PNG/JPEG data URL used in the documents list. */
  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  thumbnail?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  pageCount?: number;
}

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
