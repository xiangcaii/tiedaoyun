/**
 * WorkspaceController — 工作空间与成员管理端点（HLD §6.3）。
 *
 * 路由前缀：/api/v1（main.ts 全局设置）。
 * - GET    workspaces                    — 当前用户的工作空间列表
 * - POST   workspaces                    — 创建工作空间
 * - GET    workspaces/:id                — 工作空间详情
 * - PATCH  workspaces/:id                — 更新工作空间
 * - DELETE workspaces/:id                — 删除工作空间
 * - GET    workspaces/:id/members        — 成员列表
 * - POST   workspaces/:id/members        — 邀请成员
 * - POST   workspaces/:id/members/batch  — 批量邀请
 * - POST   workspaces/:id/members/accept — 接受邀请
 * - DELETE workspaces/:id/members/:userId — 移除成员
 * - PATCH  workspaces/:id/members/:userId — 更新成员角色
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { AddMemberDto, UpdateMemberDto, BatchInviteDto } from './dto/member.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/auth.service';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /** 获取当前用户的工作空间列表 */
  @Get('workspaces')
  async listWorkspaces(@Req() req: AuthenticatedRequest) {
    const workspaces = await this.workspaceService.listByUser(req.user.sub);
    return workspaces;
  }

  /** 创建工作空间（当前用户自动成为 owner + admin） */
  @Post('workspaces')
  async createWorkspace(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkspaceDto) {
    const workspace = await this.workspaceService.create(dto, req.user.sub);
    return workspace;
  }

  /** 获取工作空间详情 */
  @Get('workspaces/:id')
  async getWorkspace(@Param('id') id: string) {
    const workspace = await this.workspaceService.findByIdOrFail(id);
    return workspace;
  }

  /** 更新工作空间 */
  @Patch('workspaces/:id')
  async updateWorkspace(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    const workspace = await this.workspaceService.update(id, dto, req.user.sub);
    return workspace;
  }

  /** 删除工作空间 */
  @Delete('workspaces/:id')
  async deleteWorkspace(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.workspaceService.delete(id, req.user.sub);
    return { message: '工作空间已删除' };
  }

  // ---- 成员管理 ----

  /** 获取工作空间成员列表 */
  @Get('workspaces/:id/members')
  async listMembers(@Param('id') id: string) {
    const members = await this.workspaceService.listMembers(id);
    return members;
  }

  /** 邀请成员 */
  @Post('workspaces/:id/members')
  async inviteMember(@Param('id') id: string, @Body() dto: AddMemberDto) {
    const member = await this.workspaceService.inviteMember(id, dto.userId, dto.roleId);
    return member;
  }

  /** 批量邀请成员 */
  @Post('workspaces/:id/members/batch')
  async batchInvite(@Param('id') id: string, @Body() dto: BatchInviteDto) {
    const members = await this.workspaceService.batchInvite(id, dto.userIds, dto.roleId);
    return members;
  }

  /** 接受邀请 */
  @Post('workspaces/:id/members/accept')
  async acceptInvitation(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const member = await this.workspaceService.acceptInvitation(id, req.user.sub);
    return member;
  }

  /** 移除成员 */
  @Delete('workspaces/:id/members/:userId')
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    await this.workspaceService.removeMember(id, userId);
    return { message: '成员已移除' };
  }

  /** 更新成员角色 */
  @Patch('workspaces/:id/members/:userId')
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    const member = await this.workspaceService.updateMemberRole(id, userId, dto.roleId);
    return member;
  }
}
