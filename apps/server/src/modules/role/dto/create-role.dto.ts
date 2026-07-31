import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

/**
 * 创建角色请求体（HLD §7.2 自定义角色）。
 * workspace_id 通过 X-Workspace-Id header 传入，不在 DTO 中。
 */
export class CreateRoleDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isBuiltin?: boolean;
}
