/**
 * Permission 模块（HLD §4.1 modules/permission、§7.2 权限模型）。
 *
 * 导出：
 * - PermissionService：三级权限 evaluate
 * - PermissionGuard：路由级功能权限拦截
 * - @RequirePermission：路由装饰器
 * - 类型与内置策略（permission.types / builtin-policies）
 *
 * 模块为全局可见，便于各业务模块直接 import。DataEngine（T13）将
 * 显式依赖本模块以实现写操作的行/字段权限强制。
 */
import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionGuard } from './permission.guard';

@Global()
@Module({
  providers: [PermissionService, PermissionGuard],
  exports: [PermissionService, PermissionGuard],
})
export class PermissionModule {}
