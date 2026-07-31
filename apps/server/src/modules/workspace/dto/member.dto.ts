import { IsString, IsOptional } from 'class-validator';

/**
 * 添加/邀请成员请求体。
 * roleId 可选，不传则默认为 viewer 内置角色。
 */
export class AddMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  roleId?: string;
}

/**
 * 更新成员角色请求体。
 */
export class UpdateMemberDto {
  @IsString()
  roleId!: string;
}

/**
 * 批量邀请成员请求体。
 */
export class BatchInviteDto {
  @IsString({ each: true })
  userIds!: string[];

  @IsOptional()
  @IsString()
  roleId?: string;
}
