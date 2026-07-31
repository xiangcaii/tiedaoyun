/**
 * RoleService — 角色与权限点管理（HLD §7.2 权限模型、§5.3 核心元数据表）。
 *
 * 职责：
 * - 工作空间内角色的 CRUD（code 在工作空间内唯一）
 * - 内置角色管理（workspace_id = null，isBuiltin = true）
 * - 权限点查询（列表 / 按 category）
 * - 角色-权限关联（批量分配 / 查询）
 *
 * 内置角色（HLD §7.3 静态预置）：
 * - admin：管理员（全权限）
 * - builder：搭建者（可创建/修改应用）
 * - viewer：查看者（只读）
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Role, Permission, RolePermission } from '@prisma/client';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 角色 CRUD（工作空间级）
  // =========================================================================

  /** 查询工作空间下所有角色（含内置角色 workspace_id = null） */
  async listByWorkspace(workspaceId: string): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: {
        OR: [{ workspaceId }, { workspaceId: null, isBuiltin: true }],
      },
      orderBy: [{ isBuiltin: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** 按 id 查询角色 */
  async findById(id: string): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { id } });
  }

  /** 按 id 查询角色（不存在则抛 NotFoundException） */
  async findByIdOrFail(id: string): Promise<Role> {
    const role = await this.findById(id);
    if (!role) throw new NotFoundException(`角色 ${id} 不存在`);
    return role;
  }

  /** 创建工作空间级角色 */
  async create(
    workspaceId: string,
    data: { code: string; name: string; description?: string },
  ): Promise<Role> {
    // 校验 code 在工作空间内唯一（含内置角色冲突检查）
    const existing = await this.prisma.role.findFirst({
      where: {
        code: data.code,
        OR: [{ workspaceId }, { workspaceId: null, isBuiltin: true }],
      },
    });
    if (existing) {
      throw new ConflictException(`角色 code "${data.code}" 已存在`);
    }

    return this.prisma.role.create({
      data: {
        workspaceId,
        code: data.code,
        name: data.name,
        description: data.description,
        isBuiltin: false,
      },
    });
  }

  /** 更新工作空间级角色（仅允许修改 name / description） */
  async update(id: string, data: { name?: string; description?: string }): Promise<Role> {
    const role = await this.findByIdOrFail(id);
    if (role.isBuiltin) {
      throw new BadRequestException('内置角色不可修改');
    }
    return this.prisma.role.update({ where: { id }, data });
  }

  /** 删除工作空间级角色（内置角色不可删、有成员的不可删） */
  async delete(id: string): Promise<void> {
    const role = await this.findByIdOrFail(id);
    if (role.isBuiltin) {
      throw new BadRequestException('内置角色不可删除');
    }

    // 检查是否有成员绑定此角色
    const memberCount = await this.prisma.workspaceMember.count({
      where: { roleId: id },
    });
    if (memberCount > 0) {
      throw new BadRequestException(
        `角色 "${role.name}" 仍有 ${memberCount} 名成员，请先迁移成员后再删除`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
  }

  // =========================================================================
  // 内置角色
  // =========================================================================

  /** 获取所有内置角色 */
  async listBuiltin(): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: { workspaceId: null, isBuiltin: true },
    });
  }

  /** 按 code 获取内置角色 */
  async findBuiltinByCode(code: string): Promise<Role | null> {
    return this.prisma.role.findFirst({
      where: { code, workspaceId: null, isBuiltin: true },
    });
  }

  // =========================================================================
  // 权限点
  // =========================================================================

  /** 获取所有权限点 */
  async listPermissions(): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  /** 按 category 分组获取权限点 */
  async listPermissionsByCategory(): Promise<Record<string, Permission[]>> {
    const permissions = await this.listPermissions();
    const grouped: Record<string, Permission[]> = {};
    for (const p of permissions) {
      (grouped[p.category] ??= []).push(p);
    }
    return grouped;
  }

  /** 按 code 批量查找权限点 */
  async findPermissionsByCodes(codes: string[]): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: { code: { in: codes } },
    });
  }

  // =========================================================================
  // 角色-权限关联
  // =========================================================================

  /** 获取角色绑定的权限点列表 */
  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const role = await this.findByIdOrFail(roleId);
    return this.prisma.permission.findMany({
      where: {
        rolePermissions: { some: { roleId: role.id } },
      },
    });
  }

  /** 为角色分配权限点（全量替换） */
  async assignPermissions(roleId: string, permissionCodes: string[]): Promise<RolePermission[]> {
    const role = await this.findByIdOrFail(roleId);

    // 查找权限点
    const permissions = await this.findPermissionsByCodes(permissionCodes);
    const foundCodes = new Set(permissions.map((p) => p.code));
    const missing = permissionCodes.filter((c) => !foundCodes.has(c));
    if (missing.length > 0) {
      throw new BadRequestException(`权限点不存在: ${missing.join(', ')}`);
    }

    // 事务：清除旧关联，写入新关联
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });

      const records = await Promise.all(
        permissions.map((p) =>
          tx.rolePermission.create({
            data: { roleId: role.id, permissionId: p.id },
          }),
        ),
      );

      return records;
    });
  }

  /** 移除角色的所有权限点 */
  async revokeAllPermissions(roleId: string): Promise<void> {
    await this.findByIdOrFail(roleId);
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
  }
}
