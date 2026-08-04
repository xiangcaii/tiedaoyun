import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const WORKSPACE_STATUSES = ['active', 'archived'] as const;
const WORKSPACE_SORT_OPTIONS = ['createdAtDesc', 'createdAtAsc', 'nameAsc', 'nameDesc'] as const;

export class ListWorkspacesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(WORKSPACE_STATUSES)
  status?: (typeof WORKSPACE_STATUSES)[number];

  @IsOptional()
  @IsIn(WORKSPACE_SORT_OPTIONS)
  sort?: (typeof WORKSPACE_SORT_OPTIONS)[number];
}
