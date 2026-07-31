import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

/**
 * 创建工作空间请求体（HLD §5.3 workspaces 表）。
 * slug 仅允许小写字母、数字、连字符，最长 64 字符。
 */
export class CreateWorkspaceDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug 仅允许小写字母、数字、连字符',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
