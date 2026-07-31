import { IsArray, IsString } from 'class-validator';

/**
 * 为角色分配权限点（HLD §7.3）。
 * permissionCodes 为 Permission.code 数组，全量替换当前角色的权限点列表。
 */
export class AssignPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}
