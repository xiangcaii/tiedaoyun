import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * 更新工作空间请求体。
 * slug 创建后不可修改（是唯一标识）。
 */
export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
