import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryTemplatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  layout?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  font?: string;

  /** "true" to only return ATS-friendly templates. */
  @IsOptional()
  @IsIn(['true', 'false'])
  ats?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  photo?: string;

  @IsOptional()
  @IsIn(['1', '2'])
  columns?: string;

  @IsOptional()
  @IsIn(['popular', 'name', 'featured'])
  sort?: 'popular' | 'name' | 'featured';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;
}
