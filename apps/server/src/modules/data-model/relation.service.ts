/**
 * RelationService — 关系元数据 CRUD（plan T10 / HLD §5.3 relations 表）。
 *
 * 职责：
 * - 关系 CRUD
 * - 外键校验：sourceEntityId / targetEntityId 必须存在且属于同一应用
 * - sourceFieldId（可选）必须属于 sourceEntity
 * - 多对多中间表名自动生成（junctionTable）
 * - 关系类型合法性 + onDelete 取值校验
 *
 * 不变量：
 * - 同一 app 下 (sourceEntityId, targetEntityId, name) 不可重复
 *   （关系名语义层面唯一，但允许同名不同方向）。
 * - 多对多关系自动生成 junction_table = e_<a_slug>__<b_slug>__rel
 *   （HLD §5.1，按字母序避免重复）。
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { Relation } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationType, junctionTableName } from '@tiedaoyun/schema-types';

/** Prisma 生成的 RelationType enum（大写字面量），与 DB @map("one_to_one") 等。 */
type PrismaRelationType = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';

export interface CreateRelationInput {
  name: string;
  type: RelationType;
  sourceEntityId: string;
  sourceFieldId?: string;
  targetEntityId: string;
  onDelete?: 'restrict' | 'cascade' | 'set_null';
}

export interface UpdateRelationInput {
  name?: string;
  type?: RelationType;
  onDelete?: 'restrict' | 'cascade' | 'set_null';
}

const VALID_ON_DELETE = new Set(['restrict', 'cascade', 'set_null']);

/**
 * schema-types 的 RelationType 用小写（'one_to_one'），Prisma 生成的 enum
 * 用大写（'ONE_TO_ONE'）。运行时值不同，需要在写入 DB 前转换。
 */
function toPrismaRelationType(type: RelationType): PrismaRelationType {
  switch (type) {
    case RelationType.OneToOne:
      return 'ONE_TO_ONE';
    case RelationType.OneToMany:
      return 'ONE_TO_MANY';
    case RelationType.ManyToOne:
      return 'MANY_TO_ONE';
    case RelationType.ManyToMany:
      return 'MANY_TO_MANY';
  }
}

@Injectable()
export class RelationService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 列表 / 查询
  // =========================================================================

  /** 列出应用下所有关系（含两方向）。 */
  async listByApp(appId: string, options: { withEntities?: boolean } = {}): Promise<Relation[]> {
    return this.prisma.relation.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
      include: {
        sourceEntity: options.withEntities
          ? { select: { id: true, name: true, slug: true } }
          : false,
        targetEntity: options.withEntities
          ? { select: { id: true, name: true, slug: true } }
          : false,
        sourceField: options.withEntities
          ? { select: { id: true, name: true, label: true } }
          : false,
      },
    });
  }

  /** 列出以某实体为源/目标的关系。 */
  async listByEntity(entityId: string): Promise<Relation[]> {
    return this.prisma.relation.findMany({
      where: {
        OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 按 id 查询关系。 */
  async findById(id: string): Promise<Relation | null> {
    return this.prisma.relation.findUnique({ where: { id } });
  }

  /** 按 id 查询关系（不存在则抛 NotFoundException）。 */
  async findByIdOrFail(id: string): Promise<Relation> {
    const relation = await this.findById(id);
    if (!relation) throw new NotFoundException(`关系 ${id} 不存在`);
    return relation;
  }

  // =========================================================================
  // 创建
  // =========================================================================

  /**
   * 创建关系。
   *
   * 校验：
   * - 源/目标实体存在且未软删；
   * - 源/目标必须属于同一应用（防御性：跨应用关系不创建物理表时会有命名冲突）；
   * - sourceFieldId（若指定）必须属于 sourceEntity；
   * - 多对多关系自动生成 junction_table。
   */
  async create(appId: string, input: CreateRelationInput): Promise<Relation> {
    // 1. 源/目标实体存在
    const [source, target] = await Promise.all([
      this.prisma.entity.findFirst({
        where: { id: input.sourceEntityId, deletedAt: null },
        select: { id: true, appId: true, slug: true },
      }),
      this.prisma.entity.findFirst({
        where: { id: input.targetEntityId, deletedAt: null },
        select: { id: true, appId: true, slug: true },
      }),
    ]);
    if (!source) {
      throw new BadRequestException(`源实体 ${input.sourceEntityId} 不存在`);
    }
    if (!target) {
      throw new BadRequestException(`目标实体 ${input.targetEntityId} 不存在`);
    }

    // 2. 同应用校验
    if (source.appId !== appId || target.appId !== appId) {
      throw new BadRequestException('源/目标实体必须属于当前应用');
    }

    // 3. sourceField 校验
    if (input.sourceFieldId) {
      const field = await this.prisma.field.findUnique({
        where: { id: input.sourceFieldId },
        select: { entityId: true },
      });
      if (!field || field.entityId !== input.sourceEntityId) {
        throw new BadRequestException('sourceFieldId 必须属于源实体');
      }
    }

    // 4. onDelete 取值校验
    if (input.onDelete && !VALID_ON_DELETE.has(input.onDelete)) {
      throw new BadRequestException(
        `onDelete 必须是 ${Array.from(VALID_ON_DELETE).join(' / ')} 之一`,
      );
    }

    // 5. 同名关系查重
    const existing = await this.prisma.relation.findFirst({
      where: {
        appId,
        name: input.name,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
      },
    });
    if (existing) {
      throw new ConflictException(
        `关系 "${input.name}" 在 (${input.sourceEntityId} → ${input.targetEntityId}) 已存在`,
      );
    }

    // 6. 多对多：自动生成中间表
    const junctionTable =
      input.type === RelationType.ManyToMany ? junctionTableName(source.slug, target.slug) : null;

    return this.prisma.relation.create({
      data: {
        appId,
        name: input.name,
        type: toPrismaRelationType(input.type),
        sourceEntityId: input.sourceEntityId,
        sourceFieldId: input.sourceFieldId,
        targetEntityId: input.targetEntityId,
        junctionTable,
        onDelete: input.onDelete ?? 'restrict',
      },
    });
  }

  // =========================================================================
  // 更新
  // =========================================================================

  /**
   * 更新关系。
   * v0.1 限制：source / target 实体不可改（物理外键已建立，改动需要重建关系）。
   */
  async update(id: string, input: UpdateRelationInput): Promise<Relation> {
    const relation = await this.findByIdOrFail(id);

    if (input.onDelete !== undefined && !VALID_ON_DELETE.has(input.onDelete)) {
      throw new BadRequestException(
        `onDelete 必须是 ${Array.from(VALID_ON_DELETE).join(' / ')} 之一`,
      );
    }

    let junctionTable: string | null | undefined;
    if (input.type !== undefined) {
      const nextType = input.type;
      if (nextType === RelationType.ManyToMany) {
        if (!relation.junctionTable) {
          // 升级到多对多：查询源/目标 slug 生成 junction
          const [source, target] = await Promise.all([
            this.prisma.entity.findUnique({
              where: { id: relation.sourceEntityId },
              select: { slug: true },
            }),
            this.prisma.entity.findUnique({
              where: { id: relation.targetEntityId },
              select: { slug: true },
            }),
          ]);
          if (!source || !target) {
            throw new NotFoundException('源/目标实体不存在，无法生成中间表');
          }
          junctionTable = junctionTableName(source.slug, target.slug);
        }
      } else {
        // 降级：清空 junction
        junctionTable = null;
      }
    }

    return this.prisma.relation.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: toPrismaRelationType(input.type) } : {}),
        ...(junctionTable !== undefined ? { junctionTable } : {}),
        ...(input.onDelete !== undefined ? { onDelete: input.onDelete } : {}),
      },
    });
  }

  // =========================================================================
  // 删除
  // =========================================================================

  /** 硬删除关系（无软删字段）。 */
  async delete(id: string): Promise<void> {
    const relation = await this.findByIdOrFail(id);
    await this.prisma.relation.delete({ where: { id: relation.id } });
  }
}
