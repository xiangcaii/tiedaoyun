/**
 * FieldService — 字段元数据 CRUD（plan T10 / HLD §5.3 fields 表）。
 *
 * 职责：
 * - 字段 CRUD（含软删：deprecated = true）
 * - 字段名校验（PRD §7.2.1：字母/数字/下划线，≤64 字符）+ 实体内唯一
 * - type 与 config 的一致性校验（如 enum 必填 options、ref 必填 targetEntityId）
 * - 系统字段（isSystem = true）禁止删改
 *
 * 不变量：
 * - 同一实体下字段名唯一。
 * - 业务字段（isSystem = false）可软删（deprecated = true），物理表保留。
 * - 修改 type 走"影响分析"流程（T12），v0.1 不允许直接改 type。
 */
import { Prisma } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FieldType, isValidFieldName } from '@tiedaoyun/schema-types';
import type { Field } from '@prisma/client';
import { EntityService } from './entity.service';

/** DTO 提交时使用的纯字段载荷（service 入参） */
export interface CreateFieldInput {
  name: string;
  label: string;
  type: FieldType;
  config?: Record<string, unknown>;
  required?: boolean;
  unique?: boolean;
  defaultValue?: string;
  sortOrder?: number;
  description?: string;
  validations?: Record<string, unknown>[];
  index?: Record<string, unknown>;
}

export interface UpdateFieldInput {
  label?: string;
  config?: Record<string, unknown>;
  required?: boolean;
  unique?: boolean;
  defaultValue?: string | null;
  sortOrder?: number;
  description?: string;
  validations?: Record<string, unknown>[];
  index?: Record<string, unknown>;
  deprecated?: boolean;
}

@Injectable()
export class FieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityService: EntityService,
  ) {}

  // =========================================================================
  // 列表 / 查询
  // =========================================================================

  /** 列出实体下所有字段（含系统字段）。 */
  async listByEntity(
    entityId: string,
    options: { includeDeprecated?: boolean } = {},
  ): Promise<Field[]> {
    // 间接校验实体存在（不存在会抛 NotFoundException）
    await this.entityService.findByIdOrFail(entityId);

    return this.prisma.field.findMany({
      where: {
        entityId,
        ...(options.includeDeprecated ? {} : { deprecated: false }),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 按 id 查询字段。 */
  async findById(id: string): Promise<Field | null> {
    return this.prisma.field.findUnique({ where: { id } });
  }

  /** 按 (entityId, name) 查询字段。 */
  async findByName(entityId: string, name: string): Promise<Field | null> {
    return this.prisma.field.findUnique({
      where: { entityId_name: { entityId, name } },
    });
  }

  /** 按 id 查询字段（不存在则抛 NotFoundException）。 */
  async findByIdOrFail(id: string): Promise<Field> {
    const field = await this.findById(id);
    if (!field) throw new NotFoundException(`字段 ${id} 不存在`);
    return field;
  }

  // =========================================================================
  // 创建
  // =========================================================================

  /** 创建单个字段。 */
  async create(entityId: string, input: CreateFieldInput): Promise<Field> {
    await this.entityService.findByIdOrFail(entityId);
    this.assertValidName(input.name);
    this.assertValidTypeConfig(input.type, input.config);

    // 实体内字段名唯一
    const existing = await this.findByName(entityId, input.name);
    if (existing) {
      throw new ConflictException(`字段名 "${input.name}" 在当前实体下已存在`);
    }

    return this.prisma.field.create({
      data: {
        entityId,
        name: input.name,
        label: input.label,
        type: input.type,
        config: this.composeConfig(input),
        required: input.required ?? false,
        unique: input.unique ?? false,
        defaultValue: input.defaultValue,
        sortOrder: input.sortOrder ?? 0,
        description: input.description,
        isSystem: false,
        deprecated: false,
      },
    });
  }

  /** 批量创建字段（同一实体下原子写入，事务）。 */
  async createBatch(entityId: string, inputs: CreateFieldInput[]): Promise<Field[]> {
    if (inputs.length === 0) return [];
    await this.entityService.findByIdOrFail(entityId);

    // 全部字段名校验 + 去重
    const seen = new Set<string>();
    for (const input of inputs) {
      this.assertValidName(input.name);
      this.assertValidTypeConfig(input.type, input.config);
      if (seen.has(input.name)) {
        throw new BadRequestException(`字段名 "${input.name}" 在批量内重复`);
      }
      seen.add(input.name);
    }

    // 一次性查询已存在字段
    const existing = await this.prisma.field.findMany({
      where: { entityId, name: { in: Array.from(seen) } },
      select: { name: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `以下字段名在当前实体下已存在: ${existing.map((e) => e.name).join(', ')}`,
      );
    }

    return this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.field.create({
          data: {
            entityId,
            name: input.name,
            label: input.label,
            type: input.type,
            config: this.composeConfig(input),
            required: input.required ?? false,
            unique: input.unique ?? false,
            defaultValue: input.defaultValue,
            sortOrder: input.sortOrder ?? 0,
            description: input.description,
            isSystem: false,
            deprecated: false,
          },
        }),
      ),
    );
  }

  // =========================================================================
  // 更新
  // =========================================================================

  /**
   * 更新字段。
   *
   * v0.1 限制：
   * - name / type 不可改（前者：列名语义；后者：类型兼容性走 T12）。
   * - 系统字段（isSystem）仅允许改 label / description。
   */
  async update(id: string, input: UpdateFieldInput): Promise<Field> {
    const field = await this.findByIdOrFail(id);

    if (field.isSystem) {
      const { label, description } = input;
      if (
        input.config !== undefined ||
        input.required !== undefined ||
        input.unique !== undefined ||
        input.defaultValue !== undefined ||
        input.sortOrder !== undefined ||
        input.deprecated !== undefined
      ) {
        throw new BadRequestException('系统字段不可修改配置/约束');
      }
      return this.prisma.field.update({
        where: { id },
        data: {
          ...(label !== undefined ? { label } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });
    }

    // 业务字段：合并 config
    if (input.config !== undefined) {
      this.assertValidTypeConfig(field.type as FieldType, input.config);
    }

    const mergedConfig =
      input.config !== undefined || input.validations !== undefined || input.index !== undefined
        ? this.mergeConfig((field.config as Record<string, unknown> | null) ?? {}, input)
        : undefined;

    return this.prisma.field.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(mergedConfig !== undefined ? { config: mergedConfig } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.unique !== undefined ? { unique: input.unique } : {}),
        ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.deprecated !== undefined ? { deprecated: input.deprecated } : {}),
      },
    });
  }

  // =========================================================================
  // 软删
  // =========================================================================

  /**
   * 软删除字段（deprecated = true）。
   * 物理表保留字段；T12 影响分析将引用此标记。
   * 系统字段不可软删。
   */
  async softDelete(id: string): Promise<Field> {
    const field = await this.findByIdOrFail(id);
    if (field.isSystem) {
      throw new BadRequestException('系统字段不可删除');
    }
    if (field.deprecated) {
      return field; // 幂等
    }
    return this.prisma.field.update({
      where: { id },
      data: { deprecated: true },
    });
  }

  /** 恢复已软删字段。 */
  async restore(id: string): Promise<Field> {
    const field = await this.findByIdOrFail(id);
    if (!field.deprecated) return field;
    return this.prisma.field.update({
      where: { id },
      data: { deprecated: false },
    });
  }

  // =========================================================================
  // 校验工具
  // =========================================================================

  /** 校验字段名：字母/数字/下划线，1–64 字符，字母或下划线开头。 */
  private assertValidName(name: string): void {
    if (!isValidFieldName(name)) {
      throw new BadRequestException(
        '字段名仅允许字母、数字、下划线，且以字母或下划线开头，长度 ≤ 64',
      );
    }
    // 禁止与系统审计列重名（HLD §5.1 BaseEntity mixin）
    const reserved = new Set([
      'id',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'deleted_at',
    ]);
    if (reserved.has(name.toLowerCase())) {
      throw new BadRequestException(`字段名 "${name}" 与系统保留列重名`);
    }
  }

  /**
   * 校验 type 与 config 的一致性。
   * 仅做结构性校验，业务规则校验（required + unique 冲突等）由调用方决定。
   */
  private assertValidTypeConfig(type: FieldType, config?: Record<string, unknown>): void {
    if (!config) return;
    if (typeof config !== 'object') {
      throw new BadRequestException('config 必须为对象');
    }

    // 1. ref 字段必填 targetEntityId + displayField
    if (type === FieldType.Ref) {
      const target = config['targetEntityId'];
      const display = config['displayField'];
      if (typeof target !== 'string' || target.length === 0) {
        throw new BadRequestException('ref 字段必须配置 targetEntityId');
      }
      if (typeof display !== 'string' || display.length === 0) {
        throw new BadRequestException('ref 字段必须配置 displayField');
      }
    }

    // 2. enum 必填 options
    if (type === FieldType.Enum) {
      const options = config['options'];
      if (!Array.isArray(options) || options.length === 0) {
        throw new BadRequestException('enum 字段必须配置 options 数组');
      }
      const seen = new Set<string>();
      for (const opt of options) {
        if (!opt || typeof opt !== 'object') {
          throw new BadRequestException('enum 选项必须为对象');
        }
        const value = (opt as Record<string, unknown>)['value'];
        const label = (opt as Record<string, unknown>)['label'];
        if (typeof value !== 'string' || value.length === 0) {
          throw new BadRequestException('enum 选项必须包含 value 字符串');
        }
        if (typeof label !== 'string' || label.length === 0) {
          throw new BadRequestException('enum 选项必须包含 label 字符串');
        }
        if (seen.has(value)) {
          throw new BadRequestException(`enum 选项 value "${value}" 重复`);
        }
        seen.add(value);
      }
    }

    // 3. number 字段精度 ≤ 4（PRD §7.2.1）
    if (type === FieldType.Number) {
      const precision = config['precision'];
      if (precision !== undefined) {
        if (typeof precision !== 'number' || precision < 0 || precision > 4) {
          throw new BadRequestException('number 字段 precision 必须在 0–4 之间');
        }
      }
    }

    // 4. subtable 必填 targetEntityId + maxRows ≤ 50
    if (type === FieldType.SubTable) {
      const target = config['targetEntityId'];
      const maxRows = config['maxRows'];
      if (typeof target !== 'string' || target.length === 0) {
        throw new BadRequestException('subtable 字段必须配置 targetEntityId');
      }
      if (maxRows !== undefined) {
        if (typeof maxRows !== 'number' || maxRows < 0 || maxRows > 50) {
          throw new BadRequestException('subtable 字段 maxRows 必须在 0–50 之间');
        }
      }
    }

    // 5. formula 必填 expression + returnType
    if (type === FieldType.Formula) {
      const expression = config['expression'];
      const returnType = config['returnType'];
      if (typeof expression !== 'string' || expression.trim().length === 0) {
        throw new BadRequestException('formula 字段必须配置 expression');
      }
      const allowedReturn = ['number', 'string', 'date'];
      if (typeof returnType !== 'string' || !allowedReturn.includes(returnType)) {
        throw new BadRequestException(
          `formula 字段 returnType 必须是 ${allowedReturn.join(' / ')} 之一`,
        );
      }
    }
  }

  /** 拼装最终存储的 config：合并 options 与 validations/index 段。 */
  private composeConfig(input: CreateFieldInput): Prisma.InputJsonValue {
    const base = (input.config ?? {}) as Prisma.InputJsonValue;
    const merged: Record<string, Prisma.InputJsonValue> = {
      ...(base as Record<string, Prisma.InputJsonValue>),
    };
    if (input.validations !== undefined)
      merged['validations'] = input.validations as Prisma.InputJsonValue;
    if (input.index !== undefined) merged['index'] = input.index as Prisma.InputJsonValue;
    return merged;
  }

  /** 合并 config + validations + index（深度合并 validations/index 段）。 */
  private mergeConfig(
    existing: Record<string, unknown>,
    input: UpdateFieldInput,
  ): Prisma.InputJsonValue {
    const next: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(existing)) {
      next[k] = v as Prisma.InputJsonValue;
    }
    if (input.config !== undefined) {
      // input.config 是新的整体替换（与 type 保持一致）
      for (const [k, v] of Object.entries(input.config)) {
        next[k] = v as Prisma.InputJsonValue;
      }
    }
    if (input.validations !== undefined)
      next['validations'] = input.validations as Prisma.InputJsonValue;
    if (input.index !== undefined) next['index'] = input.index as Prisma.InputJsonValue;
    return next;
  }
}
