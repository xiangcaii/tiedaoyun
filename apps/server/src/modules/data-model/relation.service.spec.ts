/**
 * RelationService 单元测试（Vitest，plan T10）。
 *
 * 覆盖：
 * - 关系 CRUD
 * - 源/目标实体外键校验（外键校验 acceptance：实体不存在 → 400）
 * - sourceFieldId 必须属于 sourceEntity
 * - 多对多自动生成 junctionTable（e_<a_slug>__<b_slug>__rel）
 * - onDelete 取值校验
 * - 同名关系查重
 * - update 升级到 many-to-many 时自动生成 junction
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RelationService } from './relation.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationType } from '@tiedaoyun/schema-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function mockPrismaService() {
  return {
    relation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    entity: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    field: {
      findUnique: vi.fn(),
    },
  };
}

const APP_ID = 'app-1';

function entityRef(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'entity-1',
    appId: APP_ID,
    slug: 'leave',
    ...overrides,
  };
}

function relationFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'rel-1',
    appId: APP_ID,
    name: 'submitter',
    type: RelationType.ManyToOne,
    sourceEntityId: 'entity-leave',
    sourceFieldId: null,
    targetEntityId: 'entity-employee',
    junctionTable: null,
    onDelete: 'restrict',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('RelationService', () => {
  let service: RelationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationService, { provide: PrismaService, useFactory: mockPrismaService }],
    }).compile();

    service = module.get(RelationService);
    prisma = module.get(PrismaService) as unknown as Record<string, any>;

    vi.clearAllMocks();
  });

  // =================================================================
  // listByApp / listByEntity
  // =================================================================

  describe('listByApp', () => {
    it('按应用 ID 过滤关系', async () => {
      prisma.relation.findMany.mockResolvedValue([relationFixture()]);

      const result = await service.listByApp(APP_ID);
      expect(result).toHaveLength(1);
      expect(prisma.relation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appId: APP_ID } }),
      );
    });
  });

  describe('listByEntity', () => {
    it('查询以某实体为源/目标的所有关系', async () => {
      prisma.relation.findMany.mockResolvedValue([relationFixture()]);

      await service.listByEntity('entity-1');

      expect(prisma.relation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ sourceEntityId: 'entity-1' }, { targetEntityId: 'entity-1' }],
          },
        }),
      );
    });
  });

  // =================================================================
  // create
  // =================================================================

  describe('create', () => {
    it('成功创建 many-to-one 关系', async () => {
      prisma.entity.findFirst
        .mockResolvedValueOnce(entityRef({ id: 'e1', slug: 'leave' }))
        .mockResolvedValueOnce(entityRef({ id: 'e2', slug: 'employee' }));
      prisma.relation.findFirst.mockResolvedValue(null);
      prisma.relation.create.mockResolvedValue(relationFixture());

      const result = await service.create(APP_ID, {
        name: 'submitter',
        type: RelationType.ManyToOne,
        sourceEntityId: 'e1',
        targetEntityId: 'e2',
      });

      expect(result.name).toBe('submitter');
      expect(result.junctionTable).toBeNull();
    });

    it('成功创建 many-to-many 关系并自动生成 junctionTable', async () => {
      prisma.entity.findFirst
        .mockResolvedValueOnce(entityRef({ id: 'e1', slug: 'student' }))
        .mockResolvedValueOnce(entityRef({ id: 'e2', slug: 'course' }));
      prisma.relation.findFirst.mockResolvedValue(null);
      prisma.relation.create.mockImplementation(({ data }: AnyFn) => ({
        ...relationFixture({ type: RelationType.ManyToMany, junctionTable: data.junctionTable }),
      }));

      const result = await service.create(APP_ID, {
        name: 'enrollments',
        type: RelationType.ManyToMany,
        sourceEntityId: 'e1',
        targetEntityId: 'e2',
      });

      // 字母序：course < student → e_course__student__rel
      expect(result.junctionTable).toBe('e_course__student__rel');
    });

    it('源实体不存在时抛 BadRequestException（外键校验）', async () => {
      prisma.entity.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(entityRef());

      await expect(
        service.create(APP_ID, {
          name: 'r',
          type: RelationType.ManyToOne,
          sourceEntityId: 'missing',
          targetEntityId: 'e2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('目标实体不存在时抛 BadRequestException（外键校验）', async () => {
      prisma.entity.findFirst.mockResolvedValueOnce(entityRef()).mockResolvedValueOnce(null);

      await expect(
        service.create(APP_ID, {
          name: 'r',
          type: RelationType.ManyToOne,
          sourceEntityId: 'e1',
          targetEntityId: 'missing',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('源/目标跨应用时抛 BadRequestException', async () => {
      prisma.entity.findFirst
        .mockResolvedValueOnce(entityRef({ appId: 'app-other' }))
        .mockResolvedValueOnce(entityRef());

      await expect(
        service.create(APP_ID, {
          name: 'r',
          type: RelationType.ManyToOne,
          sourceEntityId: 'e1',
          targetEntityId: 'e2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sourceFieldId 不属于 sourceEntity 时抛 BadRequestException', async () => {
      prisma.entity.findFirst.mockResolvedValueOnce(entityRef()).mockResolvedValueOnce(entityRef());
      prisma.field.findUnique.mockResolvedValue({ entityId: 'other-entity' });

      await expect(
        service.create(APP_ID, {
          name: 'r',
          type: RelationType.ManyToOne,
          sourceEntityId: 'e1',
          sourceFieldId: 'f1',
          targetEntityId: 'e2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('onDelete 非法值时抛 BadRequestException', async () => {
      prisma.entity.findFirst.mockResolvedValueOnce(entityRef()).mockResolvedValueOnce(entityRef());

      await expect(
        service.create(APP_ID, {
          name: 'r',
          type: RelationType.ManyToOne,
          sourceEntityId: 'e1',
          targetEntityId: 'e2',
          // @ts-expect-error 测试非法值
          onDelete: 'invalid',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('同名关系已存在时抛 ConflictException', async () => {
      prisma.entity.findFirst.mockResolvedValueOnce(entityRef()).mockResolvedValueOnce(entityRef());
      prisma.relation.findFirst.mockResolvedValue(relationFixture());

      await expect(
        service.create(APP_ID, {
          name: 'submitter',
          type: RelationType.ManyToOne,
          sourceEntityId: 'e1',
          targetEntityId: 'e2',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =================================================================
  // update
  // =================================================================

  describe('update', () => {
    it('更新 name 成功', async () => {
      prisma.relation.findUnique.mockResolvedValue(relationFixture());
      prisma.relation.update.mockResolvedValue(relationFixture({ name: '申请人' }));

      const result = await service.update('rel-1', { name: '申请人' });
      expect(result.name).toBe('申请人');
    });

    it('升级到 many-to-many 时自动生成 junction', async () => {
      prisma.relation.findUnique.mockResolvedValue(relationFixture({ junctionTable: null }));
      prisma.entity.findUnique
        .mockResolvedValueOnce({ slug: 'student' })
        .mockResolvedValueOnce({ slug: 'course' });
      prisma.relation.update.mockImplementation(({ data }: AnyFn) => ({
        ...relationFixture({ type: data.type, junctionTable: data.junctionTable }),
      }));

      const result = await service.update('rel-1', { type: RelationType.ManyToMany });
      expect(result.junctionTable).toBe('e_course__student__rel');
    });

    it('降级到非 many-to-many 时清空 junction', async () => {
      prisma.relation.findUnique.mockResolvedValue(
        relationFixture({ type: RelationType.ManyToMany, junctionTable: 'e_x__y__rel' }),
      );
      prisma.relation.update.mockResolvedValue(
        relationFixture({ type: RelationType.OneToMany, junctionTable: null }),
      );

      const result = await service.update('rel-1', { type: RelationType.OneToMany });
      expect(result.junctionTable).toBeNull();
    });

    it('升级到 many-to-many 但源/目标实体不存在时抛 NotFoundException', async () => {
      prisma.relation.findUnique.mockResolvedValue(relationFixture({ junctionTable: null }));
      prisma.entity.findUnique
        .mockResolvedValueOnce({ slug: 'student' })
        .mockResolvedValueOnce(null);

      await expect(service.update('rel-1', { type: RelationType.ManyToMany })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('关系不存在时抛 NotFoundException', async () => {
      prisma.relation.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // =================================================================
  // delete
  // =================================================================

  describe('delete', () => {
    it('删除成功', async () => {
      prisma.relation.findUnique.mockResolvedValue(relationFixture());
      prisma.relation.delete.mockResolvedValue(relationFixture());

      await expect(service.delete('rel-1')).resolves.toBeUndefined();
    });

    it('关系不存在时抛 NotFoundException', async () => {
      prisma.relation.findUnique.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =================================================================
  // findById / findByIdOrFail
  // =================================================================

  describe('findById / findByIdOrFail', () => {
    it('findById 存在则返回', async () => {
      prisma.relation.findUnique.mockResolvedValue(relationFixture());

      const result = await service.findById('rel-1');
      expect(result?.id).toBe('rel-1');
    });

    it('findByIdOrFail 缺失时抛 NotFoundException', async () => {
      prisma.relation.findUnique.mockResolvedValue(null);

      await expect(service.findByIdOrFail('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
