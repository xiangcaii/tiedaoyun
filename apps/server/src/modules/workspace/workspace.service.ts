/**
 * WorkspaceService — 工作空间管理（HLD §5.3 workspaces 表、§7.3 多工作空间隔离）。
 *
 * 职责：
 * - 工作空间 CRUD
 * - 成员管理：邀请、接受邀请、移除、角色绑定
 * - 工作空间校验（是否存在、用户是否为成员）
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Workspace, WorkspaceMember } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 工作空间 CRUD
  // =========================================================================

  /** 创建个人/团队工作空间（owner 自动成为管理员成员） */
  async create(
    data: { name: string; slug: string; logoUrl?: string },
    ownerId: string,
  ): Promise<Workspace> {
    // slug 唯一性校验
    const existing = await this.prisma.workspace.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(`slug "${data.slug}" 已被使用`);
    }

    // 事务：创建工作空间 + 创建 owner 成员
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          slug: data.slug,
          logoUrl: data.logoUrl,
          ownerId,
        },
      });

      // 查找内置 admin 角色
      const adminRole = await tx.role.findFirst({
        where: { code: 'admin', workspaceId: null, isBuiltin: true },
      });

      // 创建 owner 为管理员成员
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: ownerId,
          roleId: adminRole?.id ?? null,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      return workspace;
    });
  }

  /** 按 id 查询工作空间（未软删） */
  async findById(id: string): Promise<Workspace | null> {
    return this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /** 按 slug 查询工作空间 */
  async findBySlug(slug: string): Promise<Workspace | null> {
    return this.prisma.workspace.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  /** 按 id 查询工作空间（不存在则抛 NotFoundException） */
  async findByIdOrFail(id: string): Promise<Workspace> {
    const workspace = await this.findById(id);
    if (!workspace) throw new NotFoundException(`工作空间 ${id} 不存在`);
    return workspace;
  }

  /** 获取用户所属的所有工作空间 */
  async listByUser(userId: string): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
            status: { in: ['ACTIVE', 'INVITED'] },
          },
        },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 更新工作空间 */
  async update(
    id: string,
    data: { name?: string; logoUrl?: string; status?: string },
    operatorId: string,
  ): Promise<Workspace> {
    const workspace = await this.findByIdOrFail(id);

    // 仅 owner 可更新
    if (workspace.ownerId !== operatorId) {
      throw new ForbiddenException('仅工作空间拥有者可修改');
    }

    return this.prisma.workspace.update({ where: { id }, data });
  }

  /** 软删除工作空间（仅 owner 可操作） */
  async delete(id: string, operatorId: string): Promise<void> {
    const workspace = await this.findByIdOrFail(id);

    if (workspace.ownerId !== operatorId) {
      throw new ForbiddenException('仅工作空间拥有者可删除');
    }

    await this.prisma.workspace.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
  }

  // =========================================================================
  // 成员管理
  // =========================================================================

  /** 获取工作空间成员列表（含 user 和 role 信息） */
  async listMembers(workspaceId: string): Promise<
    (WorkspaceMember & {
      user: { id: string; email: string; name: string; avatarUrl: string | null };
      role: { id: string; code: string; name: string } | null;
    })[]
  > {
    await this.findByIdOrFail(workspaceId);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
        role: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /** 获取单个成员记录 */
  async findMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    return this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  /** 邀请用户加入工作空间 */
  async inviteMember(
    workspaceId: string,
    userId: string,
    roleId?: string,
    _operatorId?: string,
  ): Promise<WorkspaceMember> {
    await this.findByIdOrFail(workspaceId);

    // 检查是否已存在
    const existing = await this.findMember(workspaceId, userId);
    if (existing) {
      if (existing.status === 'REMOVED') {
        // 之前被移除，重新邀请
        return this.prisma.workspaceMember.update({
          where: { id: existing.id },
          data: { status: 'INVITED', roleId: roleId ?? existing.roleId },
        });
      }
      throw new ConflictException('该用户已是工作空间成员');
    }

    // 验证 role 存在（如果指定）
    if (roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: roleId } });
      if (!role) throw new BadRequestException(`角色 ${roleId} 不存在`);
    } else {
      // 默认分配 viewer 角色
      const viewerRole = await this.prisma.role.findFirst({
        where: { code: 'viewer', workspaceId: null, isBuiltin: true },
      });
      roleId = viewerRole?.id ?? undefined;
    }

    return this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        roleId,
        status: 'INVITED',
      },
    });
  }

  /** 批量邀请成员 */
  async batchInvite(
    workspaceId: string,
    userIds: string[],
    roleId?: string,
  ): Promise<WorkspaceMember[]> {
    const results: WorkspaceMember[] = [];
    for (const userId of userIds) {
      try {
        const member = await this.inviteMember(workspaceId, userId, roleId);
        results.push(member);
      } catch {
        // 跳过已存在的成员，不阻塞批量操作
      }
    }
    return results;
  }

  /** 接受邀请（将 INVITED → ACTIVE） */
  async acceptInvitation(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('未找到成员记录');
    if (member.status !== 'INVITED') {
      throw new BadRequestException('当前状态不允许此操作');
    }

    return this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: { status: 'ACTIVE', joinedAt: new Date() },
    });
  }

  /** 移除成员（软删除，状态 → REMOVED） */
  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.findByIdOrFail(workspaceId);

    // 不允许移除 owner
    if (workspace.ownerId === userId) {
      throw new BadRequestException('不可移除工作空间拥有者');
    }

    const member = await this.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('该用户不是工作空间成员');

    await this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: { status: 'REMOVED' },
    });
  }

  /** 更新成员角色 */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    roleId: string,
  ): Promise<WorkspaceMember> {
    const member = await this.findMember(workspaceId, userId);
    if (!member) throw new NotFoundException('该用户不是工作空间成员');
    if (member.status === 'REMOVED') {
      throw new BadRequestException('该成员已被移除');
    }

    // 验证角色存在
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException(`角色 ${roleId} 不存在`);

    return this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: { roleId },
    });
  }

  /** 检查用户是否为工作空间活跃成员 */
  async isActiveMember(workspaceId: string, userId: string): Promise<boolean> {
    const member = await this.findMember(workspaceId, userId);
    return member !== null && member.status === 'ACTIVE';
  }
}
