/**
 * PermissionGuard — 路由级功能权限拦截（plan T9）。
 *
 * 触发：路由或 Controller 上有 `@RequirePermission(...)` 元数据。
 * 行为：
 * 1. 从 request.user 解析 JWT 主体（sub / email）。
 * 2. 从 X-Workspace-Id header 解析 workspaceId（多工作空间隔离，HLD §6.1）。
 * 3. 委托 PermissionService.evaluate 判断。
 * 4. 拒绝时抛 ForbiddenException（statusCode 403 + code PERM_DENIED）。
 *
 * 注意事项：
 * - 仅做功能级检查；行级 / 字段级由 DataEngine 等业务模块自行调用
 *   PermissionService.filterRows / filterFields。
 * - superadmin 通过用户表的 is_superadmin 字段判定，绕过功能级。
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PermissionService } from './permission.service';
import {
  PERMISSION_METADATA_KEY,
  type RequirePermissionMetadata,
} from './require-permission.decorator';
import type { PermissionSubject, PermissionResource } from './permission.types';
import type { JwtPayload } from '../auth/auth.service';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  headers: Request['headers'] & {
    'x-workspace-id'?: string;
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<RequirePermissionMetadata>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // 没有声明则视为开放（仅 JWT 鉴权由 JwtAuthGuard 负责）
    if (!metadata) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user?.sub) {
      throw new UnauthorizedException('未登录');
    }

    const workspaceId = req.headers['x-workspace-id'] ?? metadata.resource.workspaceId ?? undefined;

    const isSuperadmin = await this.permissionService.isSuperadmin(user.sub);

    const subject: PermissionSubject = {
      id: user.sub,
      workspaceId: workspaceId || undefined,
      roleIds: [],
      roleCodes: [],
      isSuperadmin,
    };

    const resource: PermissionResource = {
      type: metadata.resource.type,
      id: metadata.resource.id,
      workspaceId: metadata.resource.workspaceId ?? workspaceId ?? undefined,
      entityId: metadata.resource.entityId,
    };

    // 平台超级管理员：功能级短路放行（行/字段级仍由 evaluate 内的 row/field 策略把关）
    if (isSuperadmin) {
      return true;
    }

    const result = await this.permissionService.evaluate(subject, resource, metadata.action);

    if (!result.allowed) {
      throw new ForbiddenException({
        code: 'PERM_DENIED',
        message: result.reason ?? `权限被拒绝: ${metadata.action}`,
      });
    }
    return true;
  }
}
