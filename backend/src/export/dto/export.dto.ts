import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class HtmlExportDto {
  @IsString()
  @MaxLength(30_000_000)
  html: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fileName?: string;

  @IsOptional()
  @IsIn(['A4', 'Letter'])
  pageSize?: 'A4' | 'Letter';

  @IsOptional()
  @IsBoolean()
  landscape?: boolean;
}

export class ConvertDto {
  @IsIn(['pdf', 'docx', 'txt', 'html'])
  target: 'pdf' | 'docx' | 'txt' | 'html';
}
