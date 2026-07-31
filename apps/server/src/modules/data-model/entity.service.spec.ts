/**
 * EntityService 单元测试（Vitest，plan T10）。
 *
 * 覆盖：
 * - 实体 CRUD
 * - 物理表名自动生成（e_<app_slug>__<entity_slug>）
 * - 应用内 slug 唯一性
 * - 跨应用 tableName 冲突检测
 * - 软删除时的关联引用检查
 * - 应用存在性 / workspace 隔离校验
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EntityService } from './entity.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function mockPrismaService() {
  const mock = {
    app: {
      findFirst: vi.fn(),
    },
    entity: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    field: {
      count: vi.fn(),
    },
    relation: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return mock;
}

const APP_ID = 'app-1';
const WORKSPACE_ID = 'ws-1';

function appFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: APP_ID,
    slug: 'hr',
    workspaceId: WORKSPACE_ID,
    ...overrides,
  };
}

function entityFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'entity-1',
    appId: APP_ID,
    name: '请假单',
    slug: 'leave',
    tableName: 'e_hr__leave',
    description: null,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

describe('EntityService', () => {
  let service: EntityService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EntityService, { provide: PrismaService, useFactory: mockPrismaService }],
    }).compile();

    service = module.get(EntityService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = module.get(PrismaService) as unknown as Record<string, any>;

    vi.clearAllMocks();
  });

  // =================================================================
  // assertAppExists / 隔离
  // =================================================================

  describe('assertAppExists', () => {
    it('应用存在时返回 { id, slug, workspaceId }', async () => {
      prisma.app.findFirst.mockResolvedValue(appFixture());

      const result = await service.assertAppExists(APP_ID);
      expect(result).toEqual({ id: APP_ID, slug: 'hr', workspaceId: WORKSPACE_ID });
    });

    it('应用不存在时抛 NotFoundException', async () => {
      prisma.app.findFirst.mockResolvedValue(null);

      await expect(service.assertAppExists('missing')).rejects.toThrow(NotFoundException);
    });

    it('workspaceId 不匹配时抛 ForbiddenException', async () => {
      prisma.app.findFirst.mockResolvedValue(appFixture({ workspaceId: 'ws-other' }));

      await expect(service.assertAppExists(APP_ID, WORKSPACE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =================================================================
  // listByApp
  // =================================================================

  describe('listByApp', () => {
    it('返回应用下未软删的实体，按 createdAt 升序', async () => {
      prisma.app.findFirst.mockResolvedValue(appFixture());
      prisma.entity.findMany.mockResolvedValue([entityFixture()]);

      const result = await service.listByApp(APP_ID);
      expect(result).toHaveLength(1);
      expect(prisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { appId: APP_ID, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  // =================================================================
  // findById / findBySlug
  // =================================================================

  describe('findById / findBySlug', () => {
    it('findById 排除已软删的实体', async () => {
      prisma.entity.findFirst.mockResolvedValue(entityFixture());

      const result = await service.findById('entity-1');
      expect(result?.id).toBe('entity-1');
      expect(prisma.entity.findFirst).toHaveBeenCalledWith({
        where: { id: 'entity-1', deletedAt: null },
      });
    });

    it('findBySlug 在应用内查找', async () => {
      prisma.entity.findFirst.mockResolvedValue(entityFixture());

      const result = await service.findBySlug(APP_ID, 'leave');
      expect(result?.slug).toBe('leave');
    });

    it('findByIdOrFail 找不到时抛 NotFoundException', async () => {
      prisma.entity.findFirst.mockResolvedValue(null);

      await expect(service.findByIdOrFail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =================================================================
  // create
  // =================================================================

  describe('create', () => {
    it('成功创建并自动生成物理表名 e_<app_slug>__<entity_slug>', async () => {
      prisma.app.findFirst.mockResolvedValue(appFixture({ slug: 'hr' }));
      prisma.entity.findFirst
        // 1) slug 唯一性
        .mockResolvedValueOnce(null)
        // 2) tableName 唯一性
        .mockResolvedValueOnce(null);
      const created = entityFixture();
      prisma.entity.create.mockResolvedValue(created);

      const result = await service.create(APP_ID, { name: '请假单', slug: 'leave' });

      expect(result.slug).toBe('leave');
      expect(result.tableName).toBe('e_hr__leave');
      expect(prisma.entity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            appId: APP_ID,
            slug: 'leave',
            tableName: 'e_hr__leave',
            status: 'active',
          }),
        }),
      );
    });

    it('应用内 slug 重复时抛 ConflictException', async () => {
      prisma.app.findFirst.mockResolvedValue(appFixture());
      prisma.entity.findFirst.mockResolvedValueOnce(entityFixture());

      await expect(service.create(APP_ID, { name: '请假单', slug: 'leave' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('跨应用 tableName 冲突时抛 ConflictException', async () => {
      prisma.app.findFirst.mockResolvedValue(appFixture({ slug: 'hr' }));
      prisma.entity.findFirst
        .mockResolvedValueOnce(null) // slug 唯一
        .mockResolvedValueOnce(entityFixture({ id: 'other', appId: 'app-2' })); // tableName 冲突

      await expect(service.create(APP_ID, { name: '请假单', slug: 'leave' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('应用不存在时抛 NotFoundException', async () => {
      prisma.app.findFirst.mockResolvedValue(null);

      await expect(service.create(APP_ID, { name: '请假单', slug: 'leave' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =================================================================
  // update
  // =================================================================

  describe('update', () => {
    it('成功更新 name / description / status', async () => {
      prisma.entity.findFirst.mockResolvedValue(entityFixture());
      prisma.entity.update.mockResolvedValue(entityFixture({ name: '请假申请单' }));

      const result = await service.update('entity-1', { name: '请假申请单' });
      expect(result.name).toBe('请假申请单');
      expect(prisma.entity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entity-1' },
          data: expect.objectContaining({ name: '请假申请单' }),
        }),
      );
    });

    it('实体不存在时抛 NotFoundException', async () => {
      prisma.entity.findFirst.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // =================================================================
  // softDelete
  // =================================================================

  describe('softDelete', () => {
    it('无关联项时软删成功', async () => {
      prisma.entity.findFirst.mockResolvedValue(entityFixture());
      prisma.field.count.mockResolvedValue(0);
      prisma.relation.count.mockResolvedValue(0);
      prisma.entity.update.mockResolvedValue(
        entityFixture({ deletedAt: new Date(), status: 'archived' }),
      );

      await expect(service.softDelete('entity-1')).resolves.toBeUndefined();
      expect(prisma.entity.update).toHaveBeenCalled();
    });

    it('存在字段引用时抛 BadRequestException', async () => {
      prisma.entity.findFirst.mockResolvedValue(entityFixture());
      prisma.field.count.mockResolvedValue(3);
      prisma.relation.count.mockResolvedValue(0);

      await expect(service.softDelete('entity-1')).rejects.toThrow(BadRequestException);
    });

    it('存在关系引用时抛 BadRequestException', async () => {
      prisma.entity.findFirst.mockResolvedValue(entityFixture());
      prisma.field.count.mockResolvedValue(0);
      prisma.relation.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(service.softDelete('entity-1')).rejects.toThrow(BadRequestException);
    });
  });

  // =================================================================
  // countActiveByApp
  // =================================================================

  describe('countActiveByApp', () => {
    it('返回应用下活跃实体数量', async () => {
      prisma.entity.count.mockResolvedValue(7);

      const result = await service.countActiveByApp(APP_ID);
      expect(result).toBe(7);
    });
  });
});
