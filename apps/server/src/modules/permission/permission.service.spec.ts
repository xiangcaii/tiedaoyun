/**
 * PermissionService 单元测试（Vitest，HLD T9）。
 *
 * 覆盖：
 * - 功能级：admin 通配 / builder / viewer / 自定义权限点 / 默认拒绝
 * - 行级：owner / department / 未配置放行 / superadmin 跳过
 * - 字段级：visible / read / admin_only / hidden / 合并策略
 * - 边界：跨工作空间拒绝、空记录列表、字段缺失
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { PermissionService } from './permission.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BUILTIN_ROLE_PERMISSIONS, WILDCARD_ALL } from './builtin-policies';
import type { PermissionSubject } from './permission.types';

// ---------------------------------------------------------------------------
// 辅助：PrismaService mock
// ---------------------------------------------------------------------------

interface MembershipRow {
  roleId: string | null;
  role: {
    id: string;
    code: string;
    workspaceId: string | null;
    isBuiltin: boolean;
    config: unknown;
    rolePermissions: Array<{ permission: { code: string } }>;
  } | null;
}

function mockPrismaService() {
  return {
    user: { findUnique: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-1';
const USER_ID = 'user-1';
const ENTITY_ID = 'leave';

function buildSubject(overrides?: Partial<PermissionSubject>): PermissionSubject {
  return {
    id: USER_ID,
    workspaceId: WORKSPACE_ID,
    roleIds: [],
    roleCodes: [],
    isSuperadmin: false,
    ...overrides,
  };
}

function builtinMemberships(
  codes: Array<'admin' | 'builder' | 'viewer'>,
  workspaceId = WORKSPACE_ID,
): MembershipRow[] {
  return codes.map((code) => ({
    roleId: `role-${code}`,
    role: {
      id: `role-${code}`,
      code,
      workspaceId,
      isBuiltin: true,
      config: {},
      rolePermissions: [],
    },
  }));
}

function customMembership(
  roleId: string,
  code: string,
  config: unknown,
  permissionCodes: string[] = [],
  workspaceId: string | null = WORKSPACE_ID,
): MembershipRow {
  // 默认授予 data.read / data.create / data.update / data.delete，使行/字段策略测试
  // 专注于"策略本身"而不必为每个用例补全功能级权限。调用方可显式传空数组覆盖。
  const merged =
    permissionCodes.length > 0
      ? Array.from(
          new Set([...permissionCodes, 'data.read', 'data.create', 'data.update', 'data.delete']),
        )
      : ['data.read', 'data.create', 'data.update', 'data.delete'];
  return {
    roleId,
    role: {
      id: roleId,
      code,
      workspaceId,
      isBuiltin: false,
      config,
      rolePermissions: merged.map((p) => ({ permission: { code: p } })),
    },
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('PermissionService', () => {
  let service: PermissionService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionService, { provide: PrismaService, useFactory: mockPrismaService }],
    }).compile();

    service = module.get(PermissionService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = module.get(PrismaService) as unknown as Record<string, any>;

    vi.clearAllMocks();
    service.invalidateCache();
  });

  // =====================================================================
  // 功能级
  // =====================================================================

  describe('功能级权限', () => {
    it('admin 通配放行任何 action', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['admin']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.delete',
      );
      expect(result.allowed).toBe(true);
    });

    it('builder 允许 app.create', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create',
      );
      expect(result.allowed).toBe(true);
    });

    it('builder 不允许 role.manage', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'role', workspaceId: WORKSPACE_ID },
        'role.manage',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('role.manage');
    });

    it('viewer 只允许 data.read', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['viewer']));

      const r1 = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
      );
      expect(r1.allowed).toBe(true);

      const r2 = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.create',
      );
      expect(r2.allowed).toBe(false);
    });

    it('未授予 action 时默认拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([]); // 没有任何角色

      const result = await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('app.create');
    });

    it('superadmin 跳过功能级校验', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([]); // 无角色

      const result = await service.evaluate(
        buildSubject({ isSuperadmin: true }),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create',
      );
      // superadmin 在功能级被通配放行（行/字段级仍生效）
      expect(result.allowed).toBe(true);
    });

    it('跨工作空间访问被拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['admin']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: 'ws-other' },
        'app.read',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('跨工作空间');
    });

    it('多角色取并集（admin + viewer 都满足的 action 通过）', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['viewer', 'builder']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create', // builder 有
      );
      expect(result.allowed).toBe(true);
    });

    it('自定义角色通过 role_permissions 获得权限点', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('custom-1', 'special', {}, ['entity.delete']),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'entity', workspaceId: WORKSPACE_ID },
        'entity.delete',
      );
      expect(result.allowed).toBe(true);
    });
  });

  // =====================================================================
  // 行级
  // =====================================================================

  describe('行级权限', () => {
    it('内置 builder 未配置 row policy 时放行', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', owner_id: 'someone-else' } },
      );
      expect(result.allowed).toBe(true);
    });

    it('owner 策略：当前用户是记录 owner 时通过', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'dept-lead', {
          rowPolicies: { [ENTITY_ID]: { type: 'owner', field: 'owner_id' } },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', owner_id: USER_ID } },
      );
      expect(result.allowed).toBe(true);
    });

    it('owner 策略：当前用户不是 owner 时拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'dept-lead', {
          rowPolicies: { [ENTITY_ID]: { type: 'owner', field: 'owner_id' } },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', owner_id: 'someone-else' } },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('行级');
    });

    it('department 策略："我看本部门"生效', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'dept-viewer', {
          rowPolicies: {
            [ENTITY_ID]: { type: 'department', field: 'department_id' },
          },
        }),
      ]);

      // subject.attributes.departments = ['dept-1']，记录 department_id='dept-1' → 通过
      const ok = await service.evaluate(
        buildSubject({ attributes: { departments: ['dept-1'] } }),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', department_id: 'dept-1' } },
      );
      expect(ok.allowed).toBe(true);

      // 部门不匹配 → 拒绝
      const denied = await service.evaluate(
        buildSubject({ attributes: { departments: ['dept-1'] } }),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-2', department_id: 'dept-2' } },
      );
      expect(denied.allowed).toBe(false);
    });

    it('department 策略：用户无部门时拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'dept-viewer', {
          rowPolicies: {
            [ENTITY_ID]: { type: 'department', field: 'department_id' },
          },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', department_id: 'dept-1' } },
      );
      expect(result.allowed).toBe(false);
    });

    it('superadmin 跳过行级限制', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'strict', {
          rowPolicies: { [ENTITY_ID]: { type: 'owner', field: 'owner_id' } },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject({ isSuperadmin: true }),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', owner_id: 'someone-else' } },
      );
      expect(result.allowed).toBe(true);
    });

    it('owner 字段为数组时，subject.id 包含即通过', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'shared', {
          rowPolicies: { [ENTITY_ID]: { type: 'owner', field: 'owner_ids' } },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1', owner_ids: ['someone-else', USER_ID] } },
      );
      expect(result.allowed).toBe(true);
    });

    it('批量行级过滤：仅返回可见记录', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'owner-only', {
          rowPolicies: { [ENTITY_ID]: { type: 'owner', field: 'owner_id' } },
        }),
      ]);

      const filtered = await service.filterRows(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        [
          { id: 'r-1', owner_id: USER_ID },
          { id: 'r-2', owner_id: 'someone-else' },
          { id: 'r-3', owner_id: USER_ID },
        ],
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map((r) => r['id'])).toEqual(['r-1', 'r-3']);
    });

    it('记录缺少策略字段时拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'strict', {
          rowPolicies: { [ENTITY_ID]: { type: 'owner', field: 'owner_id' } },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { record: { id: 'r-1' } }, // 没有 owner_id
      );
      expect(result.allowed).toBe(false);
    });
  });

  // =====================================================================
  // 字段级
  // =====================================================================

  describe('字段级权限', () => {
    it('未声明 requestedFields 时不进行字段过滤', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
      );
      expect(result.allowed).toBe(true);
      expect(result.allowedFields).toBeUndefined();
    });

    it('字段策略 visible：所有请求字段通过', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { salary: 'visible', name: 'visible' },
          },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { requestedFields: ['salary', 'name'] },
      );
      expect(result.allowed).toBe(true);
      expect(result.allowedFields).toEqual(['salary', 'name']);
      expect(result.hiddenFields).toEqual([]);
    });

    it('字段策略 hidden：字段被隐藏', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { id_card: 'hidden', name: 'visible' },
          },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { requestedFields: ['id_card', 'name'] },
      );
      expect(result.allowed).toBe(true);
      expect(result.allowedFields).toEqual(['name']);
      expect(result.hiddenFields).toEqual(['id_card']);
    });

    it('字段策略 admin_only：仅 admin 可见', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { secret: 'admin_only', name: 'visible' },
          },
        }),
      ]);

      // 普通 builder：secret 被隐藏
      const builderResult = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { requestedFields: ['secret', 'name'] },
      );
      expect(builderResult.allowed).toBe(true);
      expect(builderResult.allowedFields).toEqual(['name']);
      expect(builderResult.hiddenFields).toEqual(['secret']);
    });

    it('字段策略 admin_only：admin 可见', async () => {
      // admin 内置 + 自定义 admin_only 策略
      prisma.workspaceMember.findMany.mockResolvedValue([
        ...builtinMemberships(['admin']),
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { secret: 'admin_only' },
          },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { requestedFields: ['secret'] },
      );
      expect(result.allowed).toBe(true);
      expect(result.allowedFields).toEqual(['secret']);
    });

    it('字段策略 read：写场景下拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { salary: 'read' },
          },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.update',
        { requestedFields: ['salary'], fieldAction: 'write' },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('仅可读');
    });

    it('字段策略合并：hidden 优先于 visible', async () => {
      // 角色 a 允许 x，角色 b 隐藏 x → 合并后 x 应被隐藏
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'a', {
          fieldPolicies: { [ENTITY_ID]: { x: 'visible', y: 'visible' } },
        }),
        customMembership('r-2', 'b', {
          fieldPolicies: { [ENTITY_ID]: { x: 'hidden' } },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { requestedFields: ['x', 'y'] },
      );
      expect(result.allowed).toBe(true);
      expect(result.allowedFields).toEqual(['y']);
      expect(result.hiddenFields).toEqual(['x']);
    });

    it('所有字段都被 hidden 时视为拒绝', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { a: 'hidden', b: 'hidden' },
          },
        }),
      ]);

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { requestedFields: ['a', 'b'] },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('全部被拒绝');
    });

    it('filterFields：返回 allowedFields/hiddenFields 拆分', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        customMembership('r-1', 'editor', {
          fieldPolicies: {
            [ENTITY_ID]: { salary: 'hidden', note: 'visible' },
          },
        }),
      ]);

      const result = await service.filterFields(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        ['salary', 'note', 'id'],
      );
      expect(result.allowedFields).toEqual(['note', 'id']);
      expect(result.hiddenFields).toEqual(['salary']);
    });

    it('字段级不影响功能级不通过的场景（先做功能级）', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['viewer']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.delete', // viewer 无此权限
        { requestedFields: ['x'] },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('data.delete');
    });
  });

  // =====================================================================
  // 边界
  // =====================================================================

  describe('边界场景', () => {
    it('空 records 列表返回空', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      const result = await service.evaluate(
        buildSubject(),
        { type: 'record', workspaceId: WORKSPACE_ID, entityId: ENTITY_ID },
        'data.read',
        { records: [] },
      );
      expect(result.allowed).toBe(true);
      expect(result.filteredRecords).toEqual([]);
    });

    it('subject 与 resource 都有 workspaceId 且一致时正常', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['admin']));

      const result = await service.evaluate(
        buildSubject({ workspaceId: WORKSPACE_ID }),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.read',
      );
      expect(result.allowed).toBe(true);
    });

    it('subject.workspaceId 缺失但 resource.workspaceId 给定时正常', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['admin']));

      const result = await service.evaluate(
        buildSubject({ workspaceId: undefined }),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.read',
      );
      expect(result.allowed).toBe(true);
    });

    it('缓存命中：第二次调用不查 DB', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create',
      );
      await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.read',
      );

      expect(prisma.workspaceMember.findMany).toHaveBeenCalledTimes(1);
    });

    it('invalidateCache 后重新查 DB', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue(builtinMemberships(['builder']));

      await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create',
      );
      service.invalidateCache(WORKSPACE_ID, USER_ID);
      await service.evaluate(
        buildSubject(),
        { type: 'app', workspaceId: WORKSPACE_ID },
        'app.create',
      );

      expect(prisma.workspaceMember.findMany).toHaveBeenCalledTimes(2);
    });

    it('内置 admin 通配标识正确', () => {
      expect(WILDCARD_ALL).toBe('__admin');
      expect(BUILTIN_ROLE_PERMISSIONS['admin']).toContain(WILDCARD_ALL);
    });
  });
});
