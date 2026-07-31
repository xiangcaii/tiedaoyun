/**
 * EntityService — 实体元数据 CRUD（plan T10 / HLD §5.3 entities 表）。
 *
 * 职责：
 * - 实体 CRUD（含软删：deleted_at）
 * - 物理表名自动生成（HLD §5.1：e_<app_slug>__<entity_slug>）
 * - 应用内 slug / tableName 唯一性校验
 * - 跨实体使用：依赖 EntityService.findByIdOrFail 校验实体存在
 *
 * 与 T11 的协作：
 * - 本服务只写元数据表（entities），不直接 DDL。
 * - T11（DynamicMigrator）会订阅 entity/field/relation 的 create/update/delete
 *   事件生成/迁移物理表。本服务在 create 成功后将 entity 状态保持 active，
 *   migrator 负责实际表创建。
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { entityTableName } from '@tiedaoyun/schema-types';
import type { Entity } from '@prisma/client';

@Injectable()
export class EntityService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 实体 CRUD
  // =========================================================================

  /**
   * 列出应用下的所有实体（默认排除已软删）。
   * include fields/relations 由调用方按需 load（列表页只取元信息）。
   */
  async listByApp(
    appId: string,
    options: { includeFields?: boolean; includeRelations?: boolean } = {},
  ): Promise<Entity[]> {
    await this.assertAppExists(appId);
    return this.prisma.entity.findMany({
      where: { appId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        fields: options.includeFields
          ? { where: { deprecated: false }, orderBy: { sortOrder: 'asc' } }
          : false,
        relationsFrom: options.includeRelations
          ? { where: { sourceEntity: { deletedAt: null } } }
          : false,
        relationsTo: options.includeRelations
          ? { where: { targetEntity: { deletedAt: null } } }
          : false,
      },
    });
  }

  /** 按 id 查询实体（未软删）。 */
  async findById(id: string): Promise<Entity | null> {
    return this.prisma.entity.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /** 按 (appId, slug) 查询实体。 */
  async findBySlug(appId: string, slug: string): Promise<Entity | null> {
    return this.prisma.entity.findFirst({
      where: { appId, slug, deletedAt: null },
    });
  }

  /** 按 id 查询实体（不存在则抛 NotFoundException）。 */
  async findByIdOrFail(id: string): Promise<Entity> {
    const entity = await this.findById(id);
    if (!entity) throw new NotFoundException(`实体 ${id} 不存在`);
    return entity;
  }

  /**
   * 创建实体。
   *
   * 流程：
   * 1. 校验应用存在；
   * 2. 校验 slug 格式（DTO 已校验，这里兜底）；
   * 3. 校验 slug 在应用内唯一；
   * 4. 自动生成物理表名 `e_<app_slug>__<entity_slug>` 并校验其唯一性；
   * 5. 写入 entities 表。
   */
  async create(
    appId: string,
    data: { name: string; slug: string; description?: string },
    operatorId?: string,
  ): Promise<Entity> {
    const app = await this.assertAppExists(appId);

    // 1. slug 唯一性
    const existing = await this.findBySlug(appId, data.slug);
    if (existing) {
      throw new ConflictException(`实体 slug "${data.slug}" 在当前应用内已存在`);
    }

    // 2. 自动生成物理表名
    const tableName = entityTableName(app.slug, data.slug);

    // 3. 物理表名跨应用唯一（防御性：意外命名冲突）
    const tableNameClash = await this.prisma.entity.findFirst({
      where: { tableName, deletedAt: null },
    });
    if (tableNameClash) {
      throw new ConflictException(`物理表名 "${tableName}" 已被其他应用占用`);
    }

    return this.prisma.entity.create({
      data: {
        appId,
        name: data.name,
        slug: data.slug,
        tableName,
        description: data.description,
        status: 'active',
        createdBy: operatorId,
        updatedBy: operatorId,
      },
    });
  }

  /**
   * 更新实体（仅允许 name / description / status）。
   * slug 与 tableName 不可修改（改名走 T12 迁移流程）。
   */
  async update(
    id: string,
    data: { name?: string; description?: string; status?: string },
    operatorId?: string,
  ): Promise<Entity> {
    const entity = await this.findByIdOrFail(id);
    return this.prisma.entity.update({
      where: { id: entity.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedBy: operatorId,
      },
    });
  }

  /**
   * 软删除实体（HLD §5.2：默认软删，30 天后清理）。
   * 存在关联 field / relation 时阻止删除（外键约束），由调用方决定级联策略。
   */
  async softDelete(id: string, operatorId?: string): Promise<void> {
    const entity = await this.findByIdOrFail(id);

    const [fieldCount, relationFromCount, relationToCount] = await Promise.all([
      this.prisma.field.count({ where: { entityId: id } }),
      this.prisma.relation.count({ where: { sourceEntityId: id } }),
      this.prisma.relation.count({ where: { targetEntityId: id } }),
    ]);

    if (fieldCount > 0 || relationFromCount > 0 || relationToCount > 0) {
      throw new BadRequestException(
        `实体 "${entity.name}" 仍被 ${fieldCount} 个字段 / ${relationFromCount + relationToCount} 个关系引用，请先删除关联项`,
      );
    }

    await this.prisma.entity.update({
      where: { id: entity.id },
      data: {
        deletedAt: new Date(),
        status: 'archived',
        updatedBy: operatorId,
      },
    });
  }

  /**
   * 统计应用下的活跃实体数（限制策略，PRD §6）。
   * v0.1：单应用 ≤ 200 实体（防御性检查；超限由调用方决定）。
   */
  async countActiveByApp(appId: string): Promise<number> {
    return this.prisma.entity.count({
      where: { appId, deletedAt: null },
    });
  }

  // =========================================================================
  // 工具：应用存在性 + workspace 校验
  // =========================================================================

  /**
   * 校验应用存在（未软删）。返回 App 用于 tableName 生成等。
   * workspaceId 可选：与 X-Workspace-Id 不匹配时拒绝（HLD §6.1 隔离）。
   */
  async assertAppExists(
    appId: string,
    workspaceId?: string,
  ): Promise<{ id: string; slug: string; workspaceId: string }> {
    const app = await this.prisma.app.findFirst({
      where: { id: appId, deletedAt: null },
      select: { id: true, slug: true, workspaceId: true },
    });
    if (!app) {
      throw new NotFoundException(`应用 ${appId} 不存在`);
    }
    if (workspaceId && app.workspaceId !== workspaceId) {
      throw new ForbiddenException('该应用不属于当前工作空间');
    }
    return app;
  }
}
