/**
 * RoleService 单元测试（Vitest，HLD T8）。
 *
 * 覆盖：角色 CRUD、权限点查询、角色-权限关联。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { RoleService } from './role.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

// ---------------------------------------------------------------------------
// 辅助：构建 PrismaService mock
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function mockPrismaService() {
  const tx = {
    role: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    workspaceMember: {
      count: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    rolePermission: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn: AnyFn) => fn(tx)),
  };

  return tx;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-1';

function roleFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'role-1',
    workspaceId: WORKSPACE_ID,
    code: 'custom-role',
    name: '自定义角色',
    description: '测试',
    isBuiltin: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function permissionFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'perm-1',
    code: 'app.create',
    name: '创建应用',
    description: null,
    category: 'app',
    isBuiltin: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('RoleService', () => {
  let service: RoleService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleService, { provide: PrismaService, useFactory: mockPrismaService }],
    }).compile();

    service = module.get(RoleService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = module.get(PrismaService) as unknown as Record<string, any>;

    vi.clearAllMocks();
  });

  // =====================================================================
  // 角色 CRUD
  // =====================================================================

  describe('listByWorkspace', () => {
    it('返回工作空间角色 + 内置角色', async () => {
      const roles = [
        roleFixture(),
        roleFixture({ id: 'role-2', code: 'admin', workspaceId: null, isBuiltin: true }),
      ];
      prisma.role.findMany.mockResolvedValue(roles);

      const result = await service.listByWorkspace(WORKSPACE_ID);
      expect(result).toHaveLength(2);
    });
  });

  describe('create', () => {
    it('创建成功', async () => {
      prisma.role.findFirst.mockResolvedValue(null); // 无冲突
      const created = roleFixture();
      prisma.role.create.mockResolvedValue(created);

      const result = await service.create(WORKSPACE_ID, {
        code: 'custom-role',
        name: '自定义角色',
      });
      expect(result.code).toBe('custom-role');
      expect(result.isBuiltin).toBe(false);
    });

    it('code 冲突时抛出 ConflictException', async () => {
      prisma.role.findFirst.mockResolvedValue(roleFixture());

      await expect(
        service.create(WORKSPACE_ID, { code: 'custom-role', name: 'dup' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('更新自定义角色成功', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.role.update.mockResolvedValue(roleFixture({ name: '新名称' }));

      const result = await service.update('role-1', { name: '新名称' });
      expect(result.name).toBe('新名称');
    });

    it('内置角色不可修改', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture({ workspaceId: null, isBuiltin: true }));

      await expect(service.update('role-1', { name: '新名称' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('删除无成员的自定义角色成功', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.workspaceMember.count.mockResolvedValue(0);
      prisma.role.delete.mockResolvedValue(roleFixture());

      await expect(service.delete('role-1')).resolves.toBeUndefined();
    });

    it('有成员时抛出 BadRequestException', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.workspaceMember.count.mockResolvedValue(3);

      await expect(service.delete('role-1')).rejects.toThrow(BadRequestException);
    });

    it('内置角色不可删除', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture({ workspaceId: null, isBuiltin: true }));

      await expect(service.delete('role-1')).rejects.toThrow(BadRequestException);
    });
  });

  // =====================================================================
  // 权限点
  // =====================================================================

  describe('listPermissions', () => {
    it('返回所有权限点', async () => {
      const perms = [
        permissionFixture(),
        permissionFixture({ id: 'perm-2', code: 'entity.create', category: 'entity' }),
      ];
      prisma.permission.findMany.mockResolvedValue(perms);

      const result = await service.listPermissions();
      expect(result).toHaveLength(2);
    });
  });

  describe('findPermissionsByCodes', () => {
    it('按 code 批量查找', async () => {
      const perms = [permissionFixture()];
      prisma.permission.findMany.mockResolvedValue(perms);

      const result = await service.findPermissionsByCodes(['app.create']);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('app.create');
    });

    it('code 不存在时返回空数组', async () => {
      prisma.permission.findMany.mockResolvedValue([]);

      const result = await service.findPermissionsByCodes(['nonexistent']);
      expect(result).toHaveLength(0);
    });
  });

  // =====================================================================
  // 角色-权限关联
  // =====================================================================

  describe('getRolePermissions', () => {
    it('返回角色绑定的权限点', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.permission.findMany.mockResolvedValue([permissionFixture()]);

      const result = await service.getRolePermissions('role-1');
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('app.create');
    });
  });

  describe('assignPermissions', () => {
    it('全量替换权限点成功', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.permission.findMany.mockResolvedValue([
        permissionFixture(),
        permissionFixture({ id: 'perm-2', code: 'entity.create' }),
      ]);

      prisma.$transaction.mockImplementation(async (fn: AnyFn) => {
        const txMock = {
          rolePermission: {
            deleteMany: vi.fn().mockResolvedValue(undefined),
            create: vi
              .fn()
              .mockResolvedValue({ id: 'rp-1', roleId: 'role-1', permissionId: 'perm-1' }),
          },
        };
        return fn(txMock);
      });

      const result = await service.assignPermissions('role-1', ['app.create', 'entity.create']);
      expect(result).toHaveLength(2);
    });

    it('权限点 code 不存在时抛出 BadRequestException', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.permission.findMany.mockResolvedValue([permissionFixture()]); // 只找到 1 个

      await expect(
        service.assignPermissions('role-1', ['app.create', 'nonexistent']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeAllPermissions', () => {
    it('移除角色所有权限点', async () => {
      prisma.role.findUnique.mockResolvedValue(roleFixture());
      prisma.rolePermission.deleteMany.mockResolvedValue(undefined);

      await expect(service.revokeAllPermissions('role-1')).resolves.toBeUndefined();
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
    });
  });

  // =====================================================================
  // 内置角色
  // =====================================================================

  describe('listBuiltin', () => {
    it('返回所有内置角色', async () => {
      const builtins = [
        roleFixture({ id: 'admin', code: 'admin', workspaceId: null, isBuiltin: true }),
        roleFixture({ id: 'viewer', code: 'viewer', workspaceId: null, isBuiltin: true }),
      ];
      prisma.role.findMany.mockResolvedValue(builtins);

      const result = await service.listBuiltin();
      expect(result).toHaveLength(2);
    });
  });
});
