/**
 * FieldService 单元测试（Vitest，plan T10）。
 *
 * 覆盖：
 * - 字段 CRUD
 * - 字段名校验（PRD §7.2.1：字母/数字/下划线 ≤ 64；与系统列重名拒绝）
 * - 实体内字段名唯一性
 * - type 与 config 的一致性校验（ref/enum/number/subtable/formula）
 * - 批量创建的事务写入
 * - 系统字段仅可改 label/description
 * - 软删与恢复（deprecated = true/false）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FieldService } from './field.service';
import { EntityService } from './entity.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FieldType } from '@tiedaoyun/schema-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function mockPrismaService() {
  return {
    field: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function mockEntityService() {
  return {
    findByIdOrFail: vi.fn(),
  };
}

const ENTITY_ID = 'entity-1';

function fieldFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'field-1',
    entityId: ENTITY_ID,
    name: 'title',
    label: '标题',
    type: FieldType.String,
    config: {},
    required: false,
    unique: false,
    defaultValue: null,
    isSystem: false,
    deprecated: false,
    sortOrder: 0,
    description: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('FieldService', () => {
  let service: FieldService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entityService: Record<string, any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldService,
        { provide: PrismaService, useFactory: mockPrismaService },
        { provide: EntityService, useFactory: mockEntityService },
      ],
    }).compile();

    service = module.get(FieldService);
    prisma = module.get(PrismaService) as unknown as Record<string, any>;
    entityService = module.get(EntityService) as unknown as Record<string, any>;

    vi.clearAllMocks();
  });

  // =================================================================
  // listByEntity
  // =================================================================

  describe('listByEntity', () => {
    it('默认排除 deprecated = true 的字段', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findMany.mockResolvedValue([fieldFixture()]);

      await service.listByEntity(ENTITY_ID);

      expect(prisma.field.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deprecated: false }),
        }),
      );
    });

    it('includeDeprecated=true 时不过滤', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findMany.mockResolvedValue([fieldFixture()]);

      await service.listByEntity(ENTITY_ID, { includeDeprecated: true });

      expect(prisma.field.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityId: ENTITY_ID },
        }),
      );
    });

    it('实体不存在时抛 NotFoundException', async () => {
      entityService.findByIdOrFail.mockRejectedValue(new NotFoundException());

      await expect(service.listByEntity('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =================================================================
  // create
  // =================================================================

  describe('create', () => {
    it('成功创建 string 字段', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findUnique.mockResolvedValue(null);
      prisma.field.create.mockResolvedValue(fieldFixture());

      const result = await service.create(ENTITY_ID, {
        name: 'title',
        label: '标题',
        type: FieldType.String,
      });

      expect(result.name).toBe('title');
      expect(prisma.field.create).toHaveBeenCalled();
    });

    it('字段名与系统列重名时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'created_at',
          label: '创建时间',
          type: FieldType.DateTime,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('字段名以数字开头时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: '1title',
          label: '标题',
          type: FieldType.String,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('字段名超 64 字符时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      const longName = 'a'.repeat(65);

      await expect(
        service.create(ENTITY_ID, {
          name: longName,
          label: 'x',
          type: FieldType.String,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('实体内字段名重复时抛 ConflictException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findUnique.mockResolvedValue(fieldFixture());

      await expect(
        service.create(ENTITY_ID, {
          name: 'title',
          label: '标题',
          type: FieldType.String,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('ref 字段缺少 targetEntityId 时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'owner',
          label: '提交人',
          type: FieldType.Ref,
          config: { displayField: 'name' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ref 字段缺少 displayField 时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'owner',
          label: '提交人',
          type: FieldType.Ref,
          config: { targetEntityId: 'e1' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enum 字段缺少 options 时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'status',
          label: '状态',
          type: FieldType.Enum,
          config: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enum 字段 options 内 value 重复时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'status',
          label: '状态',
          type: FieldType.Enum,
          config: {
            options: [
              { value: 'open', label: '待审批' },
              { value: 'open', label: '草稿' },
            ],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('number 字段 precision > 4 时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'amount',
          label: '金额',
          type: FieldType.Number,
          config: { precision: 5 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('subtable 字段 maxRows > 50 时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'items',
          label: '明细',
          type: FieldType.SubTable,
          config: { targetEntityId: 'e1', maxRows: 100 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('formula 字段缺少 returnType 时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.create(ENTITY_ID, {
          name: 'total',
          label: '合计',
          type: FieldType.Formula,
          config: { expression: 'a + b' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validations 与 index 写入 config 段', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findUnique.mockResolvedValue(null);
      prisma.field.create.mockResolvedValue(fieldFixture());

      await service.create(ENTITY_ID, {
        name: 'email',
        label: '邮箱',
        type: FieldType.String,
        validations: [{ kind: 'regex', value: '^[^@]+@[^@]+$' }],
        index: { unique: true },
      });

      expect(prisma.field.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              validations: expect.any(Array),
              index: expect.objectContaining({ unique: true }),
            }),
          }),
        }),
      );
    });
  });

  // =================================================================
  // createBatch
  // =================================================================

  describe('createBatch', () => {
    it('批量创建成功', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findMany.mockResolvedValue([]); // 字段名查重：无冲突
      // Prisma 5：prisma.field.create({...}) 返回 PrismaPromise，既是 Promise 也是可调用函数。
      // $transaction 接受数组后会用事务客户端依次调用每个 op。
      // 这里让 prisma.field.create 返回一个函数对象（模拟 PrismaPromise），
      // 函数被事务调用时再读 args.data.name 生成 fixture。
      prisma.field.create.mockImplementation((args: { data: { name: string } }) => {
        const op = (() => fieldFixture({ name: args.data.name })) as unknown as AnyFn;
        return op;
      });
      prisma.$transaction.mockImplementation(async (ops: AnyFn[]) => ops.map((op) => op()));

      const result = await service.createBatch(ENTITY_ID, [
        { name: 'f1', label: 'F1', type: FieldType.String },
        { name: 'f2', label: 'F2', type: FieldType.Number },
      ]);

      expect(result).toHaveLength(2);
    });

    it('批量内字段名重复时抛 BadRequestException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });

      await expect(
        service.createBatch(ENTITY_ID, [
          { name: 'f1', label: 'F1', type: FieldType.String },
          { name: 'f1', label: 'F1', type: FieldType.Number },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('批量内部分字段名与已存在字段冲突时抛 ConflictException', async () => {
      entityService.findByIdOrFail.mockResolvedValue({ id: ENTITY_ID });
      prisma.field.findMany.mockResolvedValue([{ name: 'f1' }]);

      await expect(
        service.createBatch(ENTITY_ID, [
          { name: 'f1', label: 'F1', type: FieldType.String },
          { name: 'f2', label: 'F2', type: FieldType.Number },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('空数组直接返回空', async () => {
      const result = await service.createBatch(ENTITY_ID, []);
      expect(result).toEqual([]);
    });
  });

  // =================================================================
  // update
  // =================================================================

  describe('update', () => {
    it('业务字段可更新 label / required / unique', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture());
      prisma.field.update.mockResolvedValue(fieldFixture({ label: '新标题' }));

      const result = await service.update('field-1', { label: '新标题' });
      expect(result.label).toBe('新标题');
    });

    it('系统字段尝试改 config 时抛 BadRequestException', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ isSystem: true }));

      await expect(service.update('field-1', { config: { foo: 'bar' } })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('系统字段仅允许改 label / description', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ isSystem: true }));
      prisma.field.update.mockResolvedValue(fieldFixture({ isSystem: true, label: 'new' }));

      await expect(service.update('field-1', { label: 'new' })).resolves.toBeDefined();
    });

    it('字段不存在时抛 NotFoundException', async () => {
      prisma.field.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { label: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('更新 config 时按 type 校验新 config', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ type: FieldType.Ref, config: {} }));
      prisma.field.update.mockResolvedValue(fieldFixture({ type: FieldType.Ref }));

      await expect(
        service.update('field-1', { config: { targetEntityId: 'e1' } }), // 缺 displayField
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =================================================================
  // softDelete / restore
  // =================================================================

  describe('softDelete', () => {
    it('业务字段软删成功（deprecated = true）', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture());
      prisma.field.update.mockResolvedValue(fieldFixture({ deprecated: true }));

      await expect(service.softDelete('field-1')).resolves.toBeDefined();
      expect(prisma.field.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deprecated: true },
        }),
      );
    });

    it('已 deprecated 的字段再次软删为幂等', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ deprecated: true }));

      const result = await service.softDelete('field-1');
      expect(result.deprecated).toBe(true);
      expect(prisma.field.update).not.toHaveBeenCalled();
    });

    it('系统字段不可软删', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ isSystem: true }));

      await expect(service.softDelete('field-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('restore', () => {
    it('恢复已 deprecated 字段', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ deprecated: true }));
      prisma.field.update.mockResolvedValue(fieldFixture({ deprecated: false }));

      await expect(service.restore('field-1')).resolves.toBeDefined();
    });

    it('未 deprecated 的字段恢复为幂等', async () => {
      prisma.field.findUnique.mockResolvedValue(fieldFixture({ deprecated: false }));

      const result = await service.restore('field-1');
      expect(result.deprecated).toBe(false);
      expect(prisma.field.update).not.toHaveBeenCalled();
    });
  });
});
