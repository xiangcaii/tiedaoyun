/**
 * WorkspaceService 单元测试（Vitest，HLD T8）。
 *
 * 覆盖：创建/查询/更新/删除工作空间，成员邀请/接受/移除/角色绑定。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

// ---------------------------------------------------------------------------
// 辅助：构建 PrismaService mock
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function mockPrismaService() {
  const mock = {
    workspace: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    workspaceMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: AnyFn) => fn(mock)),
  };

  return mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const OWNER_ID = 'owner-1';

function workspaceFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'ws-1',
    name: '测试工作空间',
    slug: 'test-ws',
    logoUrl: null,
    ownerId: OWNER_ID,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function memberFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'm-1',
    workspaceId: 'ws-1',
    userId: USER_ID,
    roleId: 'role-1',
    status: 'ACTIVE',
    joinedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkspaceService, { provide: PrismaService, useFactory: mockPrismaService }],
    }).compile();

    service = module.get(WorkspaceService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = module.get(PrismaService) as unknown as Record<string, any>;

    vi.clearAllMocks();
  });

  // =====================================================================
  // 工作空间 CRUD
  // =====================================================================

  describe('create', () => {
    it('创建成功：返回工作空间 + owner 自动成为 admin 成员', async () => {
      const ws = workspaceFixture();
      prisma.workspace.findUnique.mockResolvedValue(null); // slug 无冲突
      prisma.role.findFirst.mockResolvedValue({ id: 'admin-role', code: 'admin', isBuiltin: true });
      prisma.$transaction.mockImplementation(async (fn: AnyFn) => {
        // 模拟事务：创建 workspace 和 member
        prisma.workspace.create = vi.fn().mockResolvedValue(ws);
        prisma.workspaceMember.create = vi
          .fn()
          .mockResolvedValue(memberFixture({ userId: OWNER_ID, roleId: 'admin-role' }));
        return fn({
          workspace: { create: prisma.workspace.create },
          workspaceMember: { create: prisma.workspaceMember.create },
          role: { findFirst: prisma.role.findFirst },
        });
      });

      const result = await service.create({ name: '测试工作空间', slug: 'test-ws' }, OWNER_ID);

      expect(result.id).toBe('ws-1');
      expect(result.name).toBe('测试工作空间');
      expect(result.slug).toBe('test-ws');
    });

    it('slug 重复时抛出 ConflictException', async () => {
      prisma.workspace.findUnique.mockResolvedValue(workspaceFixture());

      await expect(service.create({ name: 'dup', slug: 'test-ws' }, OWNER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findById', () => {
    it('找到未删除的工作空间', async () => {
      const ws = workspaceFixture();
      prisma.workspace.findFirst.mockResolvedValue(ws);

      const result = await service.findById('ws-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ws-1');
    });

    it('返回 null 当工作空间已软删除', async () => {
      prisma.workspace.findFirst.mockResolvedValue(null);

      const result = await service.findById('ws-deleted');
      expect(result).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('返回用户所属的活跃工作空间', async () => {
      const wsList = [workspaceFixture(), workspaceFixture({ id: 'ws-2', slug: 'ws-2' })];
      prisma.workspace.count.mockResolvedValue(2);
      prisma.workspace.findMany.mockResolvedValue(wsList);

      const result = await service.listByUser(USER_ID);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('ws-1');
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('按分页与搜索条件返回工作空间列表', async () => {
      const wsList = [workspaceFixture({ id: 'ws-2', name: 'HR Center', slug: 'hr-center' })];
      prisma.workspace.count.mockResolvedValue(21);
      prisma.workspace.findMany.mockResolvedValue(wsList);

      const result = await (
        service as unknown as {
          listByUser: (
            userId: string,
            query: {
              page: number;
              pageSize: number;
              keyword?: string;
              status?: 'active' | 'archived';
              sort?: 'createdAtDesc' | 'createdAtAsc' | 'nameAsc' | 'nameDesc';
            },
          ) => Promise<{
            items: ReturnType<typeof workspaceFixture>[];
            total: number;
            page: number;
            pageSize: number;
          }>;
        }
      ).listByUser(USER_ID, {
        page: 2,
        pageSize: 10,
        keyword: 'hr',
        status: 'active',
        sort: 'nameAsc',
      });

      expect(prisma.workspace.count).toHaveBeenCalledWith({
        where: {
          members: {
            some: {
              userId: USER_ID,
              status: { in: ['ACTIVE', 'INVITED'] },
            },
          },
          deletedAt: null,
          status: 'active',
          OR: [
            { name: { contains: 'hr', mode: 'insensitive' } },
            { slug: { contains: 'hr', mode: 'insensitive' } },
          ],
        },
      });
      expect(prisma.workspace.findMany).toHaveBeenCalledWith({
        where: {
          members: {
            some: {
              userId: USER_ID,
              status: { in: ['ACTIVE', 'INVITED'] },
            },
          },
          deletedAt: null,
          status: 'active',
          OR: [
            { name: { contains: 'hr', mode: 'insensitive' } },
            { slug: { contains: 'hr', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({
        items: wsList,
        total: 21,
        page: 2,
        pageSize: 10,
      });
    });
  });

  describe('update', () => {
    it('owner 可以更新工作空间', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspace.update.mockResolvedValue(workspaceFixture({ name: '新名称' }));

      const result = await service.update('ws-1', { name: '新名称' }, OWNER_ID);
      expect(result.name).toBe('新名称');
    });

    it('非 owner 更新时抛出 ForbiddenException', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());

      await expect(service.update('ws-1', { name: '新名称' }, 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('delete', () => {
    it('owner 可以软删除工作空间', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspace.update.mockResolvedValue(
        workspaceFixture({ deletedAt: new Date(), status: 'archived' }),
      );

      await expect(service.delete('ws-1', OWNER_ID)).resolves.toBeUndefined();
      expect(prisma.workspace.update).toHaveBeenCalled();
    });

    it('非 owner 删除时抛出 ForbiddenException', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());

      await expect(service.delete('ws-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // =====================================================================
  // 成员管理
  // =====================================================================

  describe('inviteMember', () => {
    it('成功邀请新成员', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspaceMember.findUnique.mockResolvedValue(null); // 不是现有成员
      prisma.role.findFirst.mockResolvedValue({
        id: 'viewer-role',
        code: 'viewer',
        isBuiltin: true,
      });
      prisma.workspaceMember.create.mockResolvedValue(
        memberFixture({ status: 'INVITED', roleId: 'viewer-role' }),
      );

      const result = await service.inviteMember('ws-1', USER_ID);
      expect(result.status).toBe('INVITED');
    });

    it('用户已存在时抛出 ConflictException', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture({ status: 'ACTIVE' }));

      await expect(service.inviteMember('ws-1', USER_ID)).rejects.toThrow(ConflictException);
    });

    it('之前被移除的用户重新邀请成功', async () => {
      const removedMember = memberFixture({ status: 'REMOVED' });
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspaceMember.findUnique.mockResolvedValue(removedMember);
      prisma.workspaceMember.update.mockResolvedValue({ ...removedMember, status: 'INVITED' });

      const result = await service.inviteMember('ws-1', USER_ID);
      expect(result.status).toBe('INVITED');
    });

    it('指定不存在的角色时抛出 BadRequestException', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspaceMember.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.inviteMember('ws-1', USER_ID, 'non-existent-role')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptInvitation', () => {
    it('INVITED 成员接受邀请后变为 ACTIVE', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture({ status: 'INVITED' }));
      prisma.workspaceMember.update.mockResolvedValue(
        memberFixture({ status: 'ACTIVE', joinedAt: new Date() }),
      );

      const result = await service.acceptInvitation('ws-1', USER_ID);
      expect(result.status).toBe('ACTIVE');
    });

    it('非 INVITED 状态时抛出 BadRequestException', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture({ status: 'ACTIVE' }));

      await expect(service.acceptInvitation('ws-1', USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('成员不存在时抛出 NotFoundException', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation('ws-1', 'unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeMember', () => {
    it('成功移除成员', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture());
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture());
      prisma.workspaceMember.update.mockResolvedValue(memberFixture({ status: 'REMOVED' }));

      await expect(service.removeMember('ws-1', USER_ID)).resolves.toBeUndefined();
      expect(prisma.workspaceMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REMOVED' }),
        }),
      );
    });

    it('不可移除 owner', async () => {
      prisma.workspace.findFirst.mockResolvedValue(workspaceFixture({ ownerId: USER_ID }));

      await expect(service.removeMember('ws-1', USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateMemberRole', () => {
    it('成功更新成员角色', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture());
      prisma.role.findUnique.mockResolvedValue({ id: 'role-2', code: 'builder', name: '搭建者' });
      prisma.workspaceMember.update.mockResolvedValue(memberFixture({ roleId: 'role-2' }));

      const result = await service.updateMemberRole('ws-1', USER_ID, 'role-2');
      expect(result.roleId).toBe('role-2');
    });

    it('角色不存在时抛出 BadRequestException', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture());
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.updateMemberRole('ws-1', USER_ID, 'non-existent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('成员已被移除时抛出 BadRequestException', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture({ status: 'REMOVED' }));

      await expect(service.updateMemberRole('ws-1', USER_ID, 'role-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('isActiveMember', () => {
    it('活跃成员返回 true', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture({ status: 'ACTIVE' }));

      const result = await service.isActiveMember('ws-1', USER_ID);
      expect(result).toBe(true);
    });

    it('非活跃成员返回 false', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(memberFixture({ status: 'REMOVED' }));

      const result = await service.isActiveMember('ws-1', USER_ID);
      expect(result).toBe(false);
    });

    it('非成员返回 false', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      const result = await service.isActiveMember('ws-1', USER_ID);
      expect(result).toBe(false);
    });
  });
});
