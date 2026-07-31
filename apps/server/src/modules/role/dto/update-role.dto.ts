import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * 更新角色请求体。
 * code 不允许修改（修改 code 意味着改变语义），只允许改 name / description。
 */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
