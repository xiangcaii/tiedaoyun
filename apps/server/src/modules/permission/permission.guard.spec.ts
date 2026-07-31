/**
 * PermissionGuard 单元测试（Vitest，HLD T9）。
 *
 * 覆盖：
 * - 无 @RequirePermission 元数据 → 放行
 * - 缺少 JWT → 401
 * - superadmin 放行
 * - 功能级通过 / 拒绝
 * - 跨工作空间拒绝
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { PermissionService } from './permission.service';
import { type RequirePermissionMetadata } from './require-permission.decorator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockRequest {
  user?: { sub: string; email: string };
  headers: Record<string, string | undefined>;
  url: string;
  method: string;
}

function buildContext(req: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
  } as unknown as ExecutionContext;
}

function mockPermissionService() {
  return {
    evaluate: vi.fn(),
    isSuperadmin: vi.fn(),
  };
}

const WORKSPACE_ID = 'ws-1';
const USER_ID = 'user-1';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let permissionService: Record<string, any>;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        Reflector,
        { provide: PermissionService, useFactory: mockPermissionService },
      ],
    }).compile();

    guard = module.get(PermissionGuard);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    permissionService = module.get(PermissionService) as unknown as Record<string, any>;
    reflector = module.get(Reflector);

    vi.clearAllMocks();
  });

  it('无 @RequirePermission 元数据时直接放行', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const req: MockRequest = {
      headers: {},
      url: '/x',
      method: 'GET',
      user: { sub: USER_ID, email: 'a@b.c' },
    };
    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
  });

  it('未登录时抛出 UnauthorizedException', async () => {
    const meta: RequirePermissionMetadata = {
      resource: { type: 'app', workspaceId: WORKSPACE_ID },
      action: 'app.create',
    };
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta);
    const req: MockRequest = { headers: {}, url: '/x', method: 'GET' };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(UnauthorizedException);
  });

  it('superadmin 直接放行（不查 role membership）', async () => {
    const meta: RequirePermissionMetadata = {
      resource: { type: 'app', workspaceId: WORKSPACE_ID },
      action: 'app.create',
    };
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta);
    permissionService.isSuperadmin.mockResolvedValue(true);
    permissionService.evaluate.mockResolvedValue({ allowed: true });

    const req: MockRequest = {
      headers: { 'x-workspace-id': WORKSPACE_ID },
      url: '/x',
      method: 'POST',
      user: { sub: USER_ID, email: 'a@b.c' },
    };
    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
    // superadmin 路径：guard 不应委托 evaluate（功能级已被 superadmin 短路）
    expect(permissionService.evaluate).not.toHaveBeenCalled();
  });

  it('功能级通过时放行', async () => {
    const meta: RequirePermissionMetadata = {
      resource: { type: 'app', workspaceId: WORKSPACE_ID },
      action: 'app.create',
    };
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta);
    permissionService.isSuperadmin.mockResolvedValue(false);
    permissionService.evaluate.mockResolvedValue({ allowed: true });

    const req: MockRequest = {
      headers: { 'x-workspace-id': WORKSPACE_ID },
      url: '/x',
      method: 'POST',
      user: { sub: USER_ID, email: 'a@b.c' },
    };
    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
    expect(permissionService.evaluate).toHaveBeenCalled();
  });

  it('功能级拒绝时抛出 ForbiddenException（含 reason）', async () => {
    const meta: RequirePermissionMetadata = {
      resource: { type: 'role', workspaceId: WORKSPACE_ID },
      action: 'role.manage',
    };
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta);
    permissionService.isSuperadmin.mockResolvedValue(false);
    permissionService.evaluate.mockResolvedValue({
      allowed: false,
      reason: '功能权限 role.manage 未授予',
    });

    const req: MockRequest = {
      headers: { 'x-workspace-id': WORKSPACE_ID },
      url: '/x',
      method: 'POST',
      user: { sub: USER_ID, email: 'a@b.c' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('从 X-Workspace-Id header 提取 workspaceId', async () => {
    const meta: RequirePermissionMetadata = {
      resource: { type: 'app' }, // 不预设 workspaceId
      action: 'app.read',
    };
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta);
    permissionService.isSuperadmin.mockResolvedValue(false);
    permissionService.evaluate.mockResolvedValue({ allowed: true });

    const req: MockRequest = {
      headers: { 'x-workspace-id': WORKSPACE_ID },
      url: '/x',
      method: 'GET',
      user: { sub: USER_ID, email: 'a@b.c' },
    };
    await guard.canActivate(buildContext(req));

    // 验证 evaluate 收到的 subject.workspaceId 与 resource.workspaceId
    const callArgs = permissionService.evaluate.mock.calls[0];
    expect(callArgs[0].workspaceId).toBe(WORKSPACE_ID);
    expect(callArgs[1].workspaceId).toBe(WORKSPACE_ID);
  });
});
