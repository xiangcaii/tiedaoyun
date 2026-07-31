/**
 * @RequirePermission — 路由级功能权限声明（HLD §7.2、plan T9）。
 *
 * 用法：
 * ```ts
 * @UseGuards(JwtAuthGuard, PermissionGuard)
 * @RequirePermission({ resource: { type: 'app' }, action: 'app.create' })
 * @Post('apps')
 * create() { ... }
 * ```
 *
 * 工作空间上下文：guard 同时从 JWT 中解析 user，再结合 `X-Workspace-Id` header
 * 注入到 subject。superadmin 自动放行。
 */
import { SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionResource } from './permission.types';

export const PERMISSION_METADATA_KEY = 'tdy:requirePermission';

export interface RequirePermissionMetadata {
  resource: PermissionResource;
  action: PermissionAction;
}

export const RequirePermission = (meta: RequirePermissionMetadata): MethodDecorator =>
  SetMetadata(PERMISSION_METADATA_KEY, meta);
